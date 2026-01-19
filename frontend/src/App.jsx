import { useState, useEffect } from 'react'
import { Share2 } from 'lucide-react'
import './App.css'

const API_URL = import.meta.env.PROD ? '' : 'http://127.0.0.1:8000';
const WORD_LENGTH = 6;
const MAX_GUESSES = 7;

function App() {
  const [dayIndex, setDayIndex] = useState(null);
  const [guesses, setGuesses] = useState([]); // Array of { word: string, result: string[] }
  const [currentGuess, setCurrentGuess] = useState('');
  const [gameState, setGameState] = useState('loading'); // loading, playing, won, lost
  const [message, setMessage] = useState('');
  const [solution, setSolution] = useState('');
  const [shaking, setShaking] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [hasSubmittedName, setHasSubmittedName] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize Game
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch(`${API_URL}/daily-word-check`);
        const data = await res.json();
        const serverDay = data.day_index;
        setDayIndex(serverDay);

        // Load State
        const savedState = localStorage.getItem(`67dle_state_${serverDay}`);
        if (savedState) {
          const parsed = JSON.parse(savedState);
          setGuesses(parsed.guesses);
          setGameState(parsed.gameState);
          setSolution(parsed.solution || '');
          // Don't show modal on subsequent visits - it was already shown
          setShowShareModal(false);
          
          // Check if user already submitted to leaderboard today
          const submittedName = localStorage.getItem(`67dle_submitted_${serverDay}`);
          if (submittedName) {
            setHasSubmittedName(true);
            setPlayerName(submittedName);
            // Fetch current leaderboard
            fetchLeaderboard();
          }
        } else {
          setGameState('playing');
        }
      } catch (e) {
        setMessage("Error connecting to server");
      }
    }
    init();
  }, []);

  // Persist State
  useEffect(() => {
    if (dayIndex !== null && gameState !== 'loading') {
      localStorage.setItem(`67dle_state_${dayIndex}`, JSON.stringify({
        guesses,
        gameState,
        solution
      }));
    }
  }, [guesses, gameState, dayIndex, solution]);

  // Handle Input
  useEffect(() => {
    if (gameState !== 'playing') return;

    const handleKey = (e) => {
      if (e.key === 'Enter') submitGuess();
      else if (e.key === 'Backspace') setCurrentGuess(prev => prev.slice(0, -1));
      else if (/^[a-zA-Z]$/.test(e.key)) {
        if (currentGuess.length < WORD_LENGTH) {
          setCurrentGuess(prev => prev + e.key.toUpperCase());
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentGuess, gameState]);

  const submitGuess = async () => {
    if (currentGuess.length !== WORD_LENGTH) {
      triggerShake("Not enough letters");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/guess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guess: currentGuess })
      });
      const data = await res.json();

      if (!data.is_valid_word) {
        triggerShake("Not in word list");
        return;
      }

      const newGuessObj = { word: currentGuess, result: data.result };
      const newGuesses = [...guesses, newGuessObj];
      setGuesses(newGuesses);
      setCurrentGuess('');

      // Check Win/Loss
      const isWin = data.result.every(r => r === 'correct');
      if (isWin) {
        setGameState('won');
        setMessage("u r so skibidi!");
        setShowShareModal(true); // Show modal on first win
      } else if (newGuesses.length >= MAX_GUESSES) {
        setGameState('lost');
        const sol = data.solution || "Game Over";
        setSolution(sol);
        setShowShareModal(true); // Show modal on first loss
      }

    } catch (e) {
      setMessage("Network Error");
    }
  };

  const triggerShake = (msg) => {
    setMessage(msg);
    setShaking(true);
    setTimeout(() => {
      setShaking(false);
      setMessage('');
    }, 1000);
  };

  const handleVirtualKey = (key) => {
    if (gameState !== 'playing') return;
    if (key === 'ENTER') submitGuess();
    else if (key === 'DEL') setCurrentGuess(prev => prev.slice(0, -1));
    else if (currentGuess.length < WORD_LENGTH) setCurrentGuess(prev => prev + key);
  }

  // Calculate Keyboard Colors
  const getKeyClass = (key) => {
    let status = 'default';
    for (let g of guesses) {
      for (let i = 0; i < WORD_LENGTH; i++) {
        if (g.word[i] === key) {
          if (g.result[i] === 'correct') return 'correct';
          if (g.result[i] === 'present' && status !== 'correct') status = 'present';
          if (g.result[i] === 'absent' && status === 'default') status = 'absent';
        }
      }
    }
    return status;
  };

  const generateShareGraph = () => {
    const title = `67DLE ${gameState === 'won' ? guesses.length : 'X'}/${MAX_GUESSES}`;
    const grid = guesses.map(g => {
      return g.result.map(r => {
        if (r === 'correct') return '🟩';
        if (r === 'present') return '🟨';
        return '⬛';
      }).join('')
    }).join('\n');
    return `${title}\n\n${grid}`;
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generateShareGraph());
    setMessage("Copied to clipboard!");
    setTimeout(() => setMessage(''), 2000);
  }

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch(`${API_URL}/leaderboard`);
      const data = await res.json();
      setLeaderboard(data.entries || []);
    } catch (e) {
      console.error("Failed to fetch leaderboard", e);
    }
  }

  const submitToLeaderboard = async () => {
    if (!playerName.trim()) {
      setMessage("Please enter your name");
      setTimeout(() => setMessage(''), 2000);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/leaderboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: playerName.trim(),
          tries: guesses.length,
          won: gameState === 'won'
        })
      });
      const data = await res.json();
      setLeaderboard(data.entries || []);
      setHasSubmittedName(true);
      
      // Save to localStorage so we know they submitted today
      localStorage.setItem(`67dle_submitted_${dayIndex}`, playerName.trim());
    } catch (e) {
      setMessage("Failed to submit");
      setTimeout(() => setMessage(''), 2000);
    }
    setIsSubmitting(false);
  }

  return (
    <div className="app-container">
      <header>
        <h1>67DLE</h1>
      </header>

      {message && <div className="toast-message">{message}</div>}

      <div className="game-board-container">
        <div className="grid-container">
          {guesses.map((g, i) => (
            <Row key={i} word={g.word} result={g.result} />
          ))}
          {gameState === 'playing' && guesses.length < MAX_GUESSES && (
            <Row word={currentGuess} current={true} shaking={shaking} />
          )}
          {Array.from({ length: MAX_GUESSES - 1 - guesses.length - (gameState === 'playing' ? 0 : -1) }).map((_, i) => (
            <Row key={`empty-${i}`} />
          ))}
        </div>
      </div>

      {/* Modal overlay - only shown on first finish or when share button clicked */}
      {showShareModal && (gameState === 'won' || gameState === 'lost') && (
        <div className="modal-overlay" onClick={() => setShowShareModal(false)}>
          <div className="game-over-modal" onClick={(e) => e.stopPropagation()}>
            <button 
              className="modal-close-btn"
              onClick={() => setShowShareModal(false)}
            >
              ✕
            </button>
            <h2 style={{ margin: '0 0 10px 0' }}>{gameState === 'won' ? 'You Won!' : 'womp womp'}</h2>

            {gameState === 'lost' && solution && (
              <div style={{
                marginBottom: '20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: '0.9rem', color: '#b6b6b6', marginBottom: '5px' }}>The word was</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white', letterSpacing: '0.05em' }}>{solution}</span>
              </div>
            )}

            {/* Name input form - show if not submitted yet */}
            {!hasSubmittedName ? (
              <div className="name-form">
                <p style={{ margin: '0 0 10px 0', color: '#b6b6b6', fontSize: '0.9rem' }}>
                  Enter your name for the leaderboard
                </p>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Your name"
                  className="name-input"
                  maxLength={20}
                  onKeyDown={(e) => e.key === 'Enter' && submitToLeaderboard()}
                />
                <button
                  onClick={submitToLeaderboard}
                  className="submit-name-button"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'SUBMITTING...' : 'SUBMIT'}
                </button>
              </div>
            ) : (
              <>
                {/* Leaderboard */}
                <div className="leaderboard">
                  <h3 style={{ margin: '0 0 10px 0', fontSize: '1rem' }}>Today's Leaderboard</h3>
                  <div className="leaderboard-list">
                    {leaderboard.length === 0 ? (
                      <p style={{ color: '#b6b6b6', fontSize: '0.9rem' }}>No entries yet</p>
                    ) : (
                      leaderboard.map((entry, i) => (
                        <div key={i} className={`leaderboard-entry ${entry.name === playerName ? 'highlight' : ''}`}>
                          <span className="leaderboard-rank">{i + 1}</span>
                          <span className="leaderboard-name">{entry.name}</span>
                          <span className="leaderboard-tries">
                            {entry.won ? `${entry.tries}/7` : 'X/7'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <button
                  onClick={copyToClipboard}
                  className="modal-share-button"
                >
                  SHARE RESULTS <Share2 size={18} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="bottom-section">
        {gameState === 'playing' ? (
          <Keyboard onKey={handleVirtualKey} getKeyClass={getKeyClass} />
        ) : (
          <div className="share-section">
            <button
              onClick={() => setShowShareModal(true)}
              className="results-button"
            >
              SEE RESULTS
            </button>
          </div>
        )}
        <div className="credits">
          made with <span style={{ color: '#ff2c2c' }}>♡</span> by kish for sammich
        </div>
      </div>
    </div>
  )
}

function Row({ word = '', result = [], current = false, shaking = false }) {
  const letters = word.padEnd(WORD_LENGTH, ' ').split('');
  return (
    <div className={`row ${shaking ? 'shake' : ''}`}>
      {letters.map((l, i) => {
        const status = result[i] || (l !== ' ' && current ? 'active' : 'empty');
        let bgColor = 'transparent';
        let borderColor = 'var(--color-tile-border)';

        if (status === 'correct') { bgColor = 'var(--color-correct)'; borderColor = bgColor; }
        else if (status === 'present') { bgColor = 'var(--color-present)'; borderColor = bgColor; }
        else if (status === 'absent') { bgColor = 'var(--color-absent)'; borderColor = bgColor; }
        else if (status === 'active') { borderColor = 'var(--color-tile-active)'; }

        const animClass = !current && result.length > 0 ? 'tile-flip' : (current && l !== ' ' ? 'tile-pop' : '');
        const animDelay = !current && result.length > 0 ? `${i * 0.1}s` : '0s';

        return (
          <div key={i} className={`tile ${animClass}`} style={{
            backgroundColor: bgColor,
            borderColor: borderColor,
            animationDelay: animDelay
          }}>
            {l !== ' ' ? l : ''}
          </div>
        );
      })}
    </div>
  )
}

function Keyboard({ onKey, getKeyClass }) {
  const rows = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'DEL']
  ];

  return (
    <div className="keyboard-container">
      {rows.map((row, i) => (
        <div key={i} className="keyboard-row">
          {row.map(key => {
            const status = getKeyClass(key);
            let bg = 'var(--color-key-bg)';
            if (status === 'correct') bg = 'var(--color-correct)';
            if (status === 'present') bg = 'var(--color-present)';
            if (status === 'absent') bg = 'var(--color-absent)';

            return (
              <button
                key={key}
                onClick={() => onKey(key)}
                className={`key-button ${key.length > 1 ? 'large' : ''}`}
                style={{ backgroundColor: bg }}
              >
                {key === 'DEL' ? '⌫' : key}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export default App
