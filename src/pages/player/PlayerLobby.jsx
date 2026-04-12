import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ref, onValue, off } from 'firebase/database';
import { rtdb } from '../../firebase/config';

export default function PlayerLobby() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [roomStatus, setRoomStatus] = useState('lobby');
  const [sessionName, setSessionName] = useState('');
  const [mode, setMode] = useState('');

  const myUid = sessionStorage.getItem('bp_uid');
  const myName = sessionStorage.getItem('bp_name');

  // Redirect if no session identity
  useEffect(() => {
    if (!myUid || !myName) navigate('/');
  }, [myUid, myName]);

  // Listen to room in RTDB
  useEffect(() => {
    const roomRef = ref(rtdb, `rooms/${roomCode}`);

    const unsubscribe = onValue(roomRef, (snap) => {
      if (!snap.exists()) { navigate('/'); return; }
      const room = snap.val();

      setRoomStatus(room.status);
      setSessionName(room.session_name || 'Bayan Play');
      setMode(room.mode || '');

      // Build player list
      const playerList = room.players
        ? Object.entries(room.players).map(([uid, data]) => ({
            uid,
            name: data.display_name,
            isMe: uid === myUid,
          }))
        : [];
      setPlayers(playerList);

      // Host started the session — navigate to game
      if (room.status === 'live') {
        navigate(`/game/${roomCode}`);
      }
    });

    return () => off(roomRef);
  }, [roomCode]);

  const modeLabel = {
    assess: 'Quick assessment',
    kahoot: 'Kahoot',
    jeopardy: 'Jeopardy',
    flash: 'Flashcard drill',
  }[mode] || '';

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>

        {/* Header */}
        <div style={styles.header}>
          <div style={styles.sessionName}>{sessionName}</div>
          {modeLabel && <div style={styles.modeBadge}>{modeLabel}</div>}
        </div>

        {/* My name */}
        <div style={styles.myName}>
          You joined as <strong>{myName}</strong>
        </div>

        {/* Player list */}
        <div style={styles.playersSection}>
          <div style={styles.playersLabel}>
            In the room — {players.length} {players.length === 1 ? 'player' : 'players'}
          </div>
          <div style={styles.playerGrid}>
            {players.map(p => (
              <div key={p.uid} style={{ ...styles.playerChip, ...(p.isMe ? styles.playerChipMe : {}) }}>
                {p.isMe && <div style={styles.dot} />}
                {p.name}{p.isMe ? ' (you)' : ''}
              </div>
            ))}
          </div>
        </div>

        {/* Waiting animation */}
        <div style={styles.waitingRow}>
          <WaitDots />
          <span style={styles.waitingText}>Waiting for your teacher to start...</span>
        </div>

        <p style={styles.privacyNote}>
          Results are only visible to your teacher.
        </p>
      </div>
    </div>
  );
}

function WaitDots() {
  return (
    <div style={{ display: 'flex', gap: '5px' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: '7px', height: '7px', borderRadius: '50%',
          backgroundColor: '#1D9E75',
          animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: '100vh',
    backgroundColor: '#085041',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  card: {
    width: '100%',
    maxWidth: '400px',
    backgroundColor: 'white',
    borderRadius: '16px',
    overflow: 'hidden',
  },
  header: {
    backgroundColor: '#0F6E56',
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sessionName: {
    fontWeight: '700',
    fontSize: '15px',
    color: 'white',
  },
  modeBadge: {
    fontSize: '11px',
    fontWeight: '500',
    padding: '3px 9px',
    borderRadius: '20px',
    backgroundColor: 'rgba(255,255,255,0.15)',
    color: '#9FE1CB',
  },
  myName: {
    padding: '14px 20px',
    fontSize: '13px',
    color: '#444',
    borderBottom: '0.5px solid #eee',
  },
  playersSection: {
    padding: '16px 20px',
  },
  playersLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: '10px',
  },
  playerGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  playerChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '5px 10px',
    borderRadius: '20px',
    border: '0.5px solid #e0e0e0',
    backgroundColor: '#f5f5f5',
    fontSize: '12px',
    color: '#444',
  },
  playerChipMe: {
    borderColor: '#9FE1CB',
    backgroundColor: '#E1F5EE',
    color: '#085041',
    fontWeight: '500',
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#1D9E75',
    flexShrink: 0,
  },
  waitingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '16px 20px',
    borderTop: '0.5px solid #eee',
  },
  waitingText: {
    fontSize: '13px',
    color: '#666',
  },
  privacyNote: {
    fontSize: '12px',
    color: '#aaa',
    textAlign: 'center',
    padding: '0 20px 16px',
    margin: 0,
  },
};
