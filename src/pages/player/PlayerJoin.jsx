import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { getFunctions } from 'firebase/functions';
import app from '../../firebase/config';

const functions = getFunctions(app);

export default function PlayerJoin() {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [nameVisible, setNameVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  function onCodeChange(e) {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    setCode(val);
    setNameVisible(val.length >= 7);
    setError('');
  }

  function onNameChange(e) {
    setName(e.target.value);
    setError('');
  }

  async function handleJoin(e) {
    e.preventDefault();
    if (!code || !name.trim()) return;
    setLoading(true);
    setError('');

    try {
      const joinRoom = httpsCallable(functions, 'joinRoom');
      const result = await joinRoom({ roomCode: code, displayName: name.trim() });
      const { sessionUid, assignedName, roomCode } = result.data;

      // Store session identity in sessionStorage (cleared on tab close)
      sessionStorage.setItem('bp_uid', sessionUid);
      sessionStorage.setItem('bp_name', assignedName);
      sessionStorage.setItem('bp_room', roomCode);

      navigate(`/lobby/${roomCode}`);
    } catch (err) {
      if (err.code === 'functions/not-found') {
        setError('Room not found. Check your code and try again.');
      } else if (err.code === 'functions/failed-precondition') {
        setError('This session has already started.');
      } else if (err.code === 'functions/resource-exhausted') {
        setError('This team is full. Ask your teacher to increase the limit.');
      } else {
        setError('Something went wrong. Try again.');
      }
    }
    setLoading(false);
  }

  const canSubmit = code.length >= 7 && name.trim().length >= 2 && !loading;

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.logoMark}>
          <svg width="24" height="24" viewBox="0 0 18 18" fill="none">
            <path d="M9 2L15 5.5V12.5L9 16L3 12.5V5.5L9 2Z" fill="white" fillOpacity="0.9"/>
            <circle cx="9" cy="9" r="2.5" fill="#1D9E75"/>
          </svg>
        </div>

        <h1 style={styles.title}>Bayan Play</h1>
        <p style={styles.sub}>Enter your room code to join</p>

        <form onSubmit={handleJoin} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Room code</label>
            <input
              style={styles.codeInput}
              type="text"
              value={code}
              onChange={onCodeChange}
              placeholder="BYN-0000"
              maxLength={8}
              autoComplete="off"
              autoCapitalize="characters"
            />
          </div>

          {nameVisible && (
            <div style={styles.field}>
              <label style={styles.label}>Your name</label>
              <input
                style={styles.nameInput}
                type="text"
                value={name}
                onChange={onNameChange}
                placeholder="Enter your name..."
                maxLength={24}
                autoComplete="off"
                autoFocus
              />
              {/* No duplicate error shown — server silently appends number */}
            </div>
          )}

          {error && <div style={styles.error}>{error}</div>}

          <button
            type="submit"
            style={{ ...styles.joinBtn, opacity: canSubmit ? 1 : 0.5 }}
            disabled={!canSubmit}
          >
            {loading ? 'Joining...' : 'Join session'}
          </button>
        </form>

        <p style={styles.privacy}>
          Your results are only visible to your teacher.<br/>
          Your name is only used for this session.
        </p>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f8f6',
    padding: '20px',
  },
  card: {
    width: '100%',
    maxWidth: '360px',
    backgroundColor: 'white',
    borderRadius: '16px',
    border: '0.5px solid #e0e0e0',
    padding: '32px 28px',
    textAlign: 'center',
  },
  logoMark: {
    width: '52px',
    height: '52px',
    borderRadius: '14px',
    backgroundColor: '#1D9E75',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  },
  title: {
    fontFamily: 'system-ui, sans-serif',
    fontSize: '24px',
    fontWeight: '800',
    color: '#1a1a1a',
    margin: '0 0 4px',
  },
  sub: {
    fontSize: '14px',
    color: '#666',
    margin: '0 0 24px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  field: {
    textAlign: 'left',
  },
  label: {
    display: 'block',
    fontSize: '11px',
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: '6px',
  },
  codeInput: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '8px',
    border: '0.5px solid #ccc',
    backgroundColor: '#f5f5f5',
    fontSize: '16px',
    fontWeight: '600',
    letterSpacing: '0.1em',
    textAlign: 'center',
    outline: 'none',
    boxSizing: 'border-box',
  },
  nameInput: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '8px',
    border: '0.5px solid #ccc',
    backgroundColor: '#f5f5f5',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  error: {
    fontSize: '13px',
    color: '#A32D2D',
    backgroundColor: '#FCEBEB',
    border: '0.5px solid #F7C1C1',
    borderRadius: '8px',
    padding: '8px 12px',
    textAlign: 'center',
  },
  joinBtn: {
    width: '100%',
    padding: '13px',
    borderRadius: '8px',
    backgroundColor: '#1D9E75',
    color: 'white',
    border: 'none',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '4px',
    transition: 'background 0.15s',
  },
  privacy: {
    fontSize: '12px',
    color: '#aaa',
    lineHeight: '1.6',
    marginTop: '16px',
    marginBottom: '0',
  },
};
