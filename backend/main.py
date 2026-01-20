from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import random
from datetime import date, datetime
from zoneinfo import ZoneInfo
import os
from supabase import create_client, Client

app = FastAPI()

# Supabase setup
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

def get_supabase() -> Client | None:
    """Get Supabase client"""
    if SUPABASE_URL and SUPABASE_KEY:
        return create_client(SUPABASE_URL, SUPABASE_KEY)
    return None

def get_today_key():
    """Get today's date key in EST timezone"""
    today = datetime.now(ZoneInfo("America/New_York")).date()
    return today.isoformat()

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load words
WORDS_FILE = os.path.join(os.path.dirname(__file__), "words.json")
try:
    with open(WORDS_FILE, "r") as f:
        WORDS_LIST = [w.upper() for w in json.load(f)]
except FileNotFoundError:
    WORDS_LIST = ["SAMPLE", "SIMPLE", "SERVER", "BUTTER", "BETTER"] # Fallback

WORDS_SET = set(WORDS_LIST)

# Game settings
START_DATE = date(2024, 1, 1)

class GuessRequest(BaseModel):
    guess: str

class GuessResponse(BaseModel):
    result: list[str] # ["correct", "present", "absent"]
    is_valid_word: bool

class LeaderboardEntry(BaseModel):
    name: str
    tries: int
    won: bool

def get_daily_word() -> str:
    # Use current date in EST as seed to pick a random consistent word
    today = datetime.now(ZoneInfo("America/New_York")).date()
    # Create a seeded random instance so it doesn't affect global random state
    rng = random.Random(today.toordinal())
    
    if not WORDS_LIST:
        return "NOWORD"
    return rng.choice(WORDS_LIST)

@app.get("/")
def read_root():
    return {"message": "67dle API is running"}

@app.get("/debug-env")
def debug_env():
    """Debug endpoint to check if env vars are set (not exposing values)"""
    return {
        "SUPABASE_URL_set": bool(os.environ.get("SUPABASE_URL")),
        "SUPABASE_KEY_set": bool(os.environ.get("SUPABASE_KEY")),
        "SUPABASE_URL_length": len(os.environ.get("SUPABASE_URL", "")),
        "SUPABASE_KEY_length": len(os.environ.get("SUPABASE_KEY", "")),
    }

@app.get("/daily-word-check")
def check_daily_word():
    # Use current date in EST as seed
    today = datetime.now(ZoneInfo("America/New_York")).date()
    days_diff = (today - START_DATE).days
    return {"day_index": days_diff}

@app.post("/validate")
def validate_word(request: GuessRequest):
    guess = request.guess.upper()
    return {"is_valid": guess in WORDS_SET}

@app.post("/guess")
def check_guess(request: GuessRequest):
    guess = request.guess.upper()
    
    # 1. Validation
    if len(guess) != 6:
        raise HTTPException(status_code=400, detail="Word must be 6 letters")
    
    # Check if real word
    if guess not in WORDS_SET:
         return {"result": [], "is_valid_word": False}

    target = get_daily_word()
    
    # 2. Logic for Green/Yellow/Gray
    # Initialize result array
    result = ["absent"] * 6
    target_letters_count = {}
    
    # Count frequency of letters in target
    for char in target:
        target_letters_count[char] = target_letters_count.get(char, 0) + 1
    
    # First pass: Find Greens (correct position)
    for i in range(6):
        if guess[i] == target[i]:
            result[i] = "correct"
            target_letters_count[guess[i]] -= 1
            
    # Second pass: Find Yellows (present but wrong position)
    for i in range(6):
        if result[i] == "correct":
            continue
            
        letter = guess[i]
        if target_letters_count.get(letter, 0) > 0:
            result[i] = "present"
            target_letters_count[letter] -= 1
            
    return {"result": result, "is_valid_word": True, "solution": target}

@app.get("/leaderboard")
def get_leaderboard():
    """Get today's leaderboard"""
    today_key = get_today_key()
    supabase = get_supabase()
    
    if not supabase:
        return {"entries": [], "date": today_key, "error": "Database not configured"}
    
    try:
        response = supabase.table("leaderboard").select("*").eq("date_key", today_key).execute()
        entries = response.data or []
        # Sort by: won first (True before False), then by tries (ascending)
        sorted_entries = sorted(entries, key=lambda x: (not x["won"], x["tries"]))
        return {"entries": sorted_entries, "date": today_key}
    except Exception as e:
        return {"entries": [], "date": today_key, "error": str(e)}

@app.post("/leaderboard")
def add_to_leaderboard(entry: LeaderboardEntry):
    """Add a player to today's leaderboard"""
    today_key = get_today_key()
    supabase = get_supabase()
    
    if not supabase:
        return {"entries": [], "date": today_key, "error": "Database not configured"}
    
    try:
        # Add the new entry
        supabase.table("leaderboard").insert({
            "name": entry.name.strip(),
            "tries": entry.tries,
            "won": entry.won,
            "date_key": today_key
        }).execute()
        
        # Fetch updated leaderboard
        response = supabase.table("leaderboard").select("*").eq("date_key", today_key).execute()
        entries = response.data or []
        sorted_entries = sorted(entries, key=lambda x: (not x["won"], x["tries"]))
        return {"entries": sorted_entries, "date": today_key}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
