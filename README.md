# 67DLE

A ruthlessly simple 6-letter Wordle clone.
- **6 Letters**
- **7 Guesses**
- **1 Daily Puzzle**

## Stack
- **Frontend**: React + Vite (Vanilla CSS)
- **Backend**: FastAPI (Python)

## Setup

1. **Backend Setup**
   ```bash
   python3 -m venv backend/.venv
   backend/.venv/bin/pip install -r backend/requirements.txt
   ```

2. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

## Running

Run the convenience script:
```bash
chmod +x start.sh
./start.sh
```

Or run manually:
- Backend: `backend/.venv/bin/uvicorn backend.main:app --reload --port 8000`
- Frontend: `npm run dev` (inside `frontend/`)
