# 67DLE

A simple 6-letter Wordle clone.

## Tests

Backend unit tests (scoring and daily word):

```sh
cd backend && .venv/bin/python -m unittest -v
```

End-to-end tests (Playwright). They start the API on :8100 with an in-memory
fake of Supabase (`e2e/stubs/`) and a production build of the frontend on :5180,
so they never touch the real leaderboard:

```sh
cd e2e
npm install
npx playwright install chromium
npm test
```
