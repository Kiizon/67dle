import { test, expect } from '../fixtures.js';
import { API_URL, solution, wrongWords } from '../helpers.js';

test('GET /daily-word-check returns a day index', async ({ request }) => {
  const res = await request.get(`${API_URL}/daily-word-check`);
  expect(res.ok()).toBeTruthy();
  expect(Number.isInteger((await res.json()).day_index)).toBe(true);
});

test('POST /guess accepts lowercase and rejects wrong lengths', async ({ request }) => {
  const ok = await request.post(`${API_URL}/guess`, { data: { guess: wrongWords(1)[0].toLowerCase() } });
  expect((await ok.json()).is_valid_word).toBe(true);

  const short = await request.post(`${API_URL}/guess`, { data: { guess: 'abc' } });
  expect(short.status()).toBe(400);
});

test('POST /guess does not leak the answer on a non-final guess', async ({ request }) => {
  const res = await request.post(`${API_URL}/guess`, { data: { guess: wrongWords(1)[0] } });
  const body = await res.json();
  expect(JSON.stringify(body)).not.toContain(solution());
});

test('POST /guess reveals the answer once the last attempt is used', async ({ request }) => {
  const res = await request.post(`${API_URL}/guess`, { data: { guess: wrongWords(1)[0], attempt: 7 } });
  expect((await res.json()).solution).toBe(solution());
});

for (const [label, data] of [
  ['blank name', { name: '   ', tries: 3, won: true }],
  ['overlong name', { name: 'x'.repeat(200), tries: 3, won: true }],
  ['zero tries', { name: 'cheater', tries: 0, won: true }],
  ['too many tries', { name: 'cheater', tries: 99, won: false }],
]) {
  test(`POST /leaderboard rejects ${label}`, async ({ request }) => {
    const res = await request.post(`${API_URL}/leaderboard`, { data });
    expect(res.status()).toBe(422);
  });
}
