#!/bin/bash

# Start Backend
echo "Starting Backend..."
cd backend
.venv/bin/uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

# Start Frontend
echo "Starting Frontend..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo "67DLE is running!"
echo "Backend: http://localhost:8000"
echo "Frontend: http://localhost:5173"

# Trap Ctrl+C to kill both
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT

wait
