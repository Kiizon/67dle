import { test, expect } from '../fixtures.js';
import { API_URL, guess, openGame, row, rowStates, rowText, score, solution, wrongWords } from '../helpers.js';

test('renders an empty 7x6 board and the on-screen keyboard', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('.grid-container .row')).toHaveCount(7);
  await expect(page.locator('.grid-container .tile')).toHaveCount(42);
  await expect(page.locator('.key-button')).toHaveCount(28);
});

test('typing fills the current row, caps at 6 letters, and backspace deletes', async ({ page }) => {
  await openGame(page);
  await page.keyboard.type('abcdefgh');
  expect(await rowText(page, 0)).toBe('ABCDEF');
  await page.keyboard.press('Backspace');
  expect(await rowText(page, 0)).toBe('ABCDE');
});

test('modifier shortcuts (Ctrl/Cmd + key) do not type letters', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Meta+c');
  expect(await rowText(page, 0)).toBe('');
});

test('submitting a short guess shows "Not enough letters"', async ({ page }) => {
  await openGame(page);
  await page.keyboard.type('abc');
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast-message')).toHaveText('Not enough letters');
});

test('a word not in the list is rejected without using up a row', async ({ page }) => {
  await openGame(page);
  await page.keyboard.type('zzzzzz');
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast-message')).toHaveText('Not in word list');
  expect(await rowStates(page, 0)).toEqual(Array(6).fill('active'));
});

test('a valid guess is scored and the keyboard is coloured', async ({ page }) => {
  await openGame(page);
  const [word] = wrongWords(1);
  await guess(page, word, 0);
  expect(await rowStates(page, 0)).toEqual(score(word, solution()));

  const expected = score(word, solution());
  for (let i = 0; i < word.length; i++) {
    const best = word.split('').some((l, j) => l === word[i] && expected[j] === 'correct') ? 'correct'
      : word.split('').some((l, j) => l === word[i] && expected[j] === 'present') ? 'present' : 'absent';
    await expect(page.locator('.key-button', { hasText: new RegExp(`^${word[i]}$`) }))
      .toHaveAttribute('data-state', best);
  }
});

test('the on-screen keyboard can play a full guess', async ({ page }) => {
  await openGame(page);
  const [word] = wrongWords(1);
  for (const letter of word) {
    await page.locator('.key-button', { hasText: new RegExp(`^${letter}$`) }).click();
  }
  await page.locator('.key-button', { hasText: 'ENTER' }).click();
  await expect(row(page, 0).locator('.tile').first()).toHaveAttribute('data-state', /correct|present|absent/);
  expect(await rowText(page, 0)).toBe(word);
});

test('pressing Enter twice quickly only submits the guess once', async ({ page }) => {
  await openGame(page);
  const [word] = wrongWords(1);
  await page.keyboard.type(word);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(row(page, 0).locator('.tile').first()).toHaveAttribute('data-state', /correct|present|absent/);
  await page.waitForTimeout(500);
  expect(await rowText(page, 1)).toBe('');
});

test('physical Enter after clicking on-screen ENTER does not double-submit', async ({ page }) => {
  await openGame(page);
  const [first, second] = wrongWords(2);
  await page.keyboard.type(first);
  await page.locator('.key-button', { hasText: 'ENTER' }).click(); // focus now sits on the ENTER key
  await expect(row(page, 0).locator('.tile').first()).toHaveAttribute('data-state', /correct|present|absent/);

  await guess(page, second, 1);
  await page.waitForTimeout(500);
  expect(await rowText(page, 1)).toBe(second);
  expect(await rowText(page, 2)).toBe('');
});

test('winning shows the modal, today\'s leaderboard, and a shareable grid', async ({ page, context, request }) => {
  const seeded = `seed-${Date.now()}`;
  await request.post(`${API_URL}/leaderboard`, { data: { name: seeded, tries: 3, won: true } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await openGame(page);
  const [miss] = wrongWords(1);
  await guess(page, miss, 0);
  await guess(page, solution(), 1);

  const modal = page.locator('.game-over-modal');
  await expect(modal.getByRole('heading', { name: 'You Won!' })).toBeVisible();
  await expect(modal.locator('.leaderboard-entry', { hasText: seeded })).toBeVisible();

  await modal.getByRole('button', { name: /share results/i }).click();
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  expect(shared).toMatch(/^67DLE 2\/7\n\n/);
  expect(shared.split('\n').slice(2)).toEqual([
    score(miss, solution()).map(r => (r === 'correct' ? '🟩' : r === 'present' ? '🟨' : '⬛')).join(''),
    '🟩'.repeat(6),
  ]);
});

test('losing after 7 guesses reveals the word', async ({ page }) => {
  await openGame(page);
  const words = wrongWords(7);
  for (let i = 0; i < words.length; i++) await guess(page, words[i], i);

  const modal = page.locator('.game-over-modal');
  await expect(modal.getByRole('heading', { name: 'womp womp' })).toBeVisible();
  await expect(modal).toContainText(solution());
});

test('progress survives a reload and play can continue', async ({ page }) => {
  await openGame(page);
  const [a, b, c] = wrongWords(3);
  await guess(page, a, 0);
  await guess(page, b, 1);
  await openGame(page);
  expect(await rowText(page, 0)).toBe(a);
  expect(await rowText(page, 1)).toBe(b);
  await guess(page, c, 2);
});

test('a finished game reloads to "See results" without re-opening the modal', async ({ page }) => {
  await openGame(page);
  await guess(page, solution(), 0);
  await expect(page.locator('.game-over-modal')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'SEE RESULTS' })).toBeVisible();
  await expect(page.locator('.game-over-modal')).toHaveCount(0);
  await page.getByRole('button', { name: 'SEE RESULTS' }).click();
  await expect(page.locator('.game-over-modal')).toBeVisible();
});

test('submitting to the leaderboard highlights you and hides the form after reload', async ({ page }) => {
  const name = `player-${Date.now()}`;
  await openGame(page);
  await guess(page, solution(), 0);

  const modal = page.locator('.game-over-modal');
  await modal.getByPlaceholder('Your name').fill(name);
  await modal.getByRole('button', { name: /add to leaderboard/i }).click();
  await expect(modal.locator('.leaderboard-entry.highlight', { hasText: name })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'SEE RESULTS' }).click();
  await expect(modal.locator('.leaderboard-entry', { hasText: name })).toBeVisible();
  await expect(modal.getByPlaceholder('Your name')).toHaveCount(0);
});

test('while the API is unreachable the player sees an error, not a dead "See results" button', async ({ page }) => {
  await page.route(`${API_URL}/**`, route => route.abort());
  await page.goto('/');
  await expect(page.locator('.toast-message')).toHaveText(/error connecting/i);
  await expect(page.getByRole('button', { name: 'SEE RESULTS' })).toHaveCount(0);
});

test('a failed guess request shows an error and the guess can be retried', async ({ page }) => {
  await openGame(page);
  const [word] = wrongWords(1);
  await page.route(`${API_URL}/guess`, route => route.abort(), { times: 1 });
  await page.keyboard.type(word);
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast-message')).toHaveText('Network Error');
  expect(await rowStates(page, 0)).toEqual(Array(6).fill('active'));

  await page.keyboard.press('Enter');
  await expect(row(page, 0).locator('.tile').first()).toHaveAttribute('data-state', /correct|present|absent/);
});

test('a failed leaderboard submit keeps the form so the player can retry', async ({ page }) => {
  await openGame(page);
  await guess(page, solution(), 0);
  const modal = page.locator('.game-over-modal');

  await page.route(`${API_URL}/leaderboard`, route =>
    route.request().method() === 'POST' ? route.fulfill({ status: 500, body: '{}' }) : route.continue());
  await modal.getByPlaceholder('Your name').fill('retry-me');
  await modal.getByRole('button', { name: /add to leaderboard/i }).click();
  await expect(page.locator('.toast-message')).toHaveText('Failed to submit');
  await expect(modal.getByPlaceholder('Your name')).toBeVisible();
});
