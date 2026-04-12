import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase/config';
import { useAdminAuth } from './hooks/useAdminAuth';

// Host pages
import HostLogin from './pages/host/HostLogin';
import HostDashboard from './pages/host/HostDashboard';
import UploadSources from './pages/host/UploadSources';
import QuestionEditor from './pages/host/QuestionEditor';
import GameSettings from './pages/host/GameSettings';
import SessionHistory from './pages/host/SessionHistory';
import SessionDetail from './pages/host/SessionDetail';
import LiveHost from './pages/host/LiveHost';

// Player pages
import PlayerJoin from './pages/player/PlayerJoin';
import PlayerLobby from './pages/player/PlayerLobby';
import PlayerGame from './pages/player/PlayerGame';
import PlayerDone from './pages/player/PlayerDone';

function AccessDenied({ user, userData }) {
  const [requested, setRequested] = useState(false);
  const [loading, setLoading] = useState(false);

  async function requestAccess() {
    setLoading(true);
    try {
      await addDoc(collection(db, 'play_access_requests'), {
        uid: user.uid,
        email: user.email,
        name: userData?.name || user.email,
        role: userData?.role || 'unknown',
        status: 'pending',
        requested_at: serverTimestamp(),
      });
      setRequested(true);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', backgroundColor: '#0f1c3f', padding: '20px',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: '16px',
        padding: '38px 32px', textAlign: 'center',
        maxWidth: '400px', width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          backgroundColor: '#fde8e8',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#c0392b" strokeWidth="1.8">
            <circle cx="11" cy="11" r="9"/>
            <path d="M11 7v4M11 14.5h.01" strokeLinecap="round"/>
          </svg>
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#1a2b5e', marginBottom: 8 }}>
          Host access required
        </div>
        <div style={{ fontSize: 13, color: '#6b7a8d', lineHeight: 1.6, marginBottom: 22 }}>
          <strong>{user.email}</strong> does not have Bayan Play host access.
        </div>
        {requested ? (
          <div style={{
            padding: '11px 14px', backgroundColor: '#e8f5ee',
            border: '1px solid #a8d5b5', borderRadius: 8,
            fontSize: 13, color: '#1a6b3c', lineHeight: 1.5,
          }}>
            Request sent — Ahmed will review and approve your access.
          </div>
        ) : (
          <button
            onClick={requestAccess}
            disabled={loading}
            style={{
              width: '100%', padding: 12, borderRadius: 8,
              backgroundColor: '#1a2b5e', color: 'white',
              border: 'none', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Sending...' : 'Request host access'}
          </button>
        )}
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, isAdmin, userData, loading } = useAdminAuth();

  if (loading) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', fontSize: 14, color: '#6b7a8d',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
      Loading...
    </div>
  );

  if (!user) return <Navigate to="/host/login" replace />;
  if (!isAdmin) return <AccessDenied user={user} userData={userData} />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Host routes — require admin auth */}
        <Route path="/host/login" element={<HostLogin />} />
        <Route path="/host" element={
          <ProtectedRoute><HostDashboard /></ProtectedRoute>
        } />
        <Route path="/host/upload" element={
          <ProtectedRoute><UploadSources /></ProtectedRoute>
        } />
        <Route path="/host/editor/:sessionId" element={
          <ProtectedRoute><QuestionEditor /></ProtectedRoute>
        } />
        <Route path="/host/settings/:sessionId" element={
          <ProtectedRoute><GameSettings /></ProtectedRoute>
        } />
        <Route path="/host/live/:roomCode" element={
          <ProtectedRoute><LiveHost /></ProtectedRoute>
        } />
        <Route path="/host/history" element={
          <ProtectedRoute><SessionHistory /></ProtectedRoute>
        } />
        <Route path="/host/history/:sessionId" element={
          <ProtectedRoute><SessionDetail /></ProtectedRoute>
        } />

        {/* Player routes — no auth required */}
        <Route path="/" element={<PlayerJoin />} />
        <Route path="/lobby/:roomCode" element={<PlayerLobby />} />
        <Route path="/game/:roomCode" element={<PlayerGame />} />
        <Route path="/done/:roomCode" element={<PlayerDone />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}