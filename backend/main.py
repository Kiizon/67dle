from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, StringConstraints
from typing import Annotated
from functools import lru_cache
import json
import logging
import random
from datetime import date, datetime
from zoneinfo import ZoneInfo
import os
from supabase import create_client, Client

logger = logging.getLogger("67dle")

app = FastAPI()

# Supabase setup
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

@lru_cache(maxsize=1)
def get_supabase() -> Client | None:
    """Get a shared Supabase client (created once per process)"""
    if SUPABASE_URL and SUPABASE_KEY:
        return create_client(SUPABASE_URL, SUPABASE_KEY)
    return None

def get_today() -> date:
    """Today's date in EST, which is when the daily word rolls over"""
    return datetime.now(ZoneInfo("America/New_York")).date()

def get_today_key():
    """Get today's date key in EST timezone"""
    return get_today().isoformat()

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # no cookies are used; credentials + "*" is unsafe
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
WORD_LENGTH = 6
MAX_GUESSES = 7

class GuessRequest(BaseModel):
    guess: str = Field(max_length=32)
    # Which attempt this is (1-based). The answer is only revealed on the last one.
    attempt: int | None = Field(default=None, ge=1, le=MAX_GUESSES)

class GuessResponse(BaseModel):
    result: list[str] # ["correct", "present", "absent"]
    is_valid_word: bool

class LeaderboardEntry(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]
    tries: int = Field(ge=1, le=MAX_GUESSES)
    won: bool

def get_daily_word() -> str:
    # Use current date in EST as seed to pick a random consistent word
    # Create a seeded random instance so it doesn't affect global random state
    rng = random.Random(get_today().toordinal())
    
    if not WORDS_LIST:
        return "NOWORD"
    return rng.choice(WORDS_LIST)

@app.get("/")
def read_root():
    return {"message": "67dle API is running"}

@app.get("/daily-word-check")
def check_daily_word():
    days_diff = (get_today() - START_DATE).days
    return {"day_index": days_diff}

@app.post("/validate")
def validate_word(request: GuessRequest):
    guess = request.guess.upper()
    return {"is_valid": guess in WORDS_SET}

def score_guess(guess: str, target: str) -> list[str]:
    """Green/Yellow/Gray scoring that handles repeated letters like Wordle"""
    result = ["absent"] * WORD_LENGTH
    target_letters_count = {}
    
    # Count frequency of letters in target
    for char in target:
        target_letters_count[char] = target_letters_count.get(char, 0) + 1
    
    # First pass: Find Greens (correct position)
    for i in range(WORD_LENGTH):
        if guess[i] == target[i]:
            result[i] = "correct"
            target_letters_count[guess[i]] -= 1
            
    # Second pass: Find Yellows (present but wrong position)
    for i in range(WORD_LENGTH):
        if result[i] == "correct":
            continue
            
        letter = guess[i]
        if target_letters_count.get(letter, 0) > 0:
            result[i] = "present"
            target_letters_count[letter] -= 1

    return result

@app.post("/guess")
def check_guess(request: GuessRequest):
    guess = request.guess.upper()
    
    # 1. Validation
    if len(guess) != WORD_LENGTH:
        raise HTTPException(status_code=400, detail="Word must be 6 letters")
    
    # Check if real word
    if guess not in WORDS_SET:
         return {"result": [], "is_valid_word": False}

    target = get_daily_word()
    response = {"result": score_guess(guess, target), "is_valid_word": True}

    # Only reveal the answer once the player is out of guesses
    if request.attempt == MAX_GUESSES:
        response["solution"] = target
    return response

def fetch_leaderboard(supabase: Client, today_key: str) -> list[dict]:
    response = supabase.table("leaderboard").select("*").eq("date_key", today_key).execute()
    entries = response.data or []
    # Sort by: won first (True before False), then by tries (ascending)
    return sorted(entries, key=lambda x: (not x["won"], x["tries"]))

@app.get("/leaderboard")
def get_leaderboard():
    """Get today's leaderboard"""
    today_key = get_today_key()
    supabase = get_supabase()
    
    if not supabase:
        return {"entries": [], "date": today_key, "error": "Database not configured"}
    
    try:
        return {"entries": fetch_leaderboard(supabase, today_key), "date": today_key}
    except Exception:
        logger.exception("Failed to read leaderboard")
        return {"entries": [], "date": today_key, "error": "Leaderboard unavailable"}

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
            "name": entry.name,
            "tries": entry.tries,
            "won": entry.won,
            "date_key": today_key
        }).execute()
        
        return {"entries": fetch_leaderboard(supabase, today_key), "date": today_key}
    except Exception:
        logger.exception("Failed to write leaderboard")
        raise HTTPException(status_code=500, detail="Leaderboard unavailable")
