import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect } from './fixtures.js';

const BACKEND_DIR = path.join(import.meta.dirname, '..', 'backend');

export const API_URL = `http://127.0.0.1:${process.env.E2E_API_PORT ?? 8100}`;

export const WORDS = JSON.parse(readFileSync(path.join(BACKEND_DIR, 'words.json'), 'utf8'))
  .map(w => w.toUpperCase());

let cachedSolution;

// Ask the backend code itself for today's word, so tests can play to a win.
export function solution() {
  cachedSolution ??= execFileSync(
    path.join(BACKEND_DIR, '.venv', 'bin', 'python'),
    ['-c', 'import main; print(main.get_daily_word())'],
    { cwd: BACKEND_DIR, env: { ...process.env, PYTHONPATH: path.join(import.meta.dirname, 'stubs') } },
  ).toString().trim();
  return cachedSolution;
}

// Valid words that are not today's answer.
export function wrongWords(n) {
  return WORDS.filter(w => w !== solution()).slice(0, n);
}

// Reference Wordle scoring, independent of the backend implementation.
export function score(guess, target) {
  const result = Array(guess.length).fill('absent');
  const remaining = {};
  for (let i = 0; i < target.length; i++) {
    if (guess[i] === target[i]) result[i] = 'correct';
    else remaining[target[i]] = (remaining[target[i]] ?? 0) + 1;
  }
  for (let i = 0; i < guess.length; i++) {
    if (result[i] !== 'correct' && remaining[guess[i]] > 0) {
      result[i] = 'present';
      remaining[guess[i]]--;
    }
  }
  return result;
}

export function row(page, i) {
  return page.locator('.grid-container .row').nth(i);
}

export async function rowStates(page, i) {
  return row(page, i).locator('.tile').evaluateAll(tiles => tiles.map(t => t.dataset.state));
}

export async function rowText(page, i) {
  return (await row(page, i).locator('.tile').allTextContents()).join('');
}

export async function openGame(page) {
  await page.goto('/');
  await expect(page.locator('.keyboard-container')).toBeVisible();
}

// Type a word on the physical keyboard, submit it, and wait for it to be scored.
export async function guess(page, word, rowIndex) {
  await page.keyboard.type(word);
  await page.keyboard.press('Enter');
  await expect(row(page, rowIndex).locator('.tile').first())
    .toHaveAttribute('data-state', /correct|present|absent/);
}
