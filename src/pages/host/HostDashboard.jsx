import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, query, where, orderBy, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../../firebase/config';
import { useAdminAuth } from '../../hooks/useAdminAuth';

const NAV = [
  { label: 'Sessions', icon: '▶', path: '/host' },
  { label: 'New game', icon: '+', path: '/host/upload' },
  { label: 'History', icon: '◷', path: '/host/history' },
];

const MODE_LABELS = { assess: 'Assessment', kahoot: 'Kahoot', jeopardy: 'Jeopardy', flash: 'Flashcard' };
const MODE_PILLS  = { assess: 'bp-pill-assess', kahoot: 'bp-pill-kahoot', jeopardy: 'bp-pill-jeop', flash: 'bp-pill-flash' };

export default function HostDashboard() {
  const { user, userData } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('drafts');

  useEffect(() => { if (user) loadSessions(); }, [user]);

  async function loadSessions() {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'play_sessions'),
        where('host_uid', '==', user.uid),
        orderBy('created_at', 'desc')
      );
      const snap = await getDocs(q);
      setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  async function handleSignOut() {
    await signOut(auth);
    navigate('/host/login');
  }

  async function deleteDraft(e, id) {
    e.stopPropagation();
    if (!confirm('Delete this draft?')) return;
    await deleteDoc(doc(db, 'play_sessions', id));
    setSessions(prev => prev.filter(s => s.id !== id));
  }

  const displayName = userData?.firstName || userData?.name?.split(' ')[0] || user?.email;
  const initials = (userData?.name || user?.email || 'A').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

  const drafts    = sessions.filter(s => s.status === 'draft');
  const completed = sessions.filter(s => s.status !== 'draft');

  const stats = {
    drafts: drafts.length,
    completed: completed.length,
    students: completed.reduce((a, s) => a + (s.student_count || 0), 0),
    avgScore: completed.length ? Math.round(completed.reduce((a, s) => a + (s.avg_score || 0), 0) / completed.length) : 0,
  };

  const displayed = activeTab === 'drafts' ? drafts : completed;

  function continueDraft(s) {
    // Resume at the furthest step completed
    if (!s.questions?.length) navigate(`/host/upload`);
    else navigate(`/host/editor/${s.id}`);
  }

  return (
    <div className="bp-layout">
      <aside className="bp-sidebar">
        <div className="bp-sidebar-logo">
          <div className="bp-logo-icon"><img src="/icon-192.png" alt="Bayan" /></div>
          <div><div className="bp-logo-name">BAYAN PLAY</div><div className="bp-logo-sub">HOST PORTAL</div></div>
        </div>

        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{initials}</div>
          <div>
            <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{displayName}</div>
            <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 1 }}>{userData?.role}</div>
          </div>
        </div>

        <nav className="bp-nav">
          <div className="bp-nav-section">Game</div>
          {NAV.map(n => (
            <div key={n.path} className={`bp-nav-item${location.pathname === n.path ? ' active' : ''}`} onClick={() => navigate(n.path)}>
              <span className="bp-nav-icon">{n.icon}</span>{n.label}
            </div>
          ))}
        </nav>

        <div className="bp-sidebar-footer">
          <button className="bp-logout-btn" onClick={handleSignOut}>Sign out</button>
        </div>
      </aside>

      <div className="bp-main">
        <div className="bp-topbar">
          <div className="bp-topbar-title">Sessions</div>
          <div className="bp-topbar-right">
            <button className="bp-btn bp-btn-outline bp-btn-sm" onClick={loadSessions}>Refresh</button>
            <button className="bp-btn bp-btn-gold bp-btn-sm" onClick={() => navigate('/host/upload')}>+ New game</button>
          </div>
        </div>

        <div className="bp-page">

          {/* Stats */}
          <div className="bp-grid-stats bp-mb-24">
            <div className="bp-stat">
              <div className="bp-stat-n" style={{ color: 'var(--gold)' }}>{stats.drafts}</div>
              <div className="bp-stat-l">Drafts in progress</div>
            </div>
            <div className="bp-stat">
              <div className="bp-stat-n navy">{stats.completed}</div>
              <div className="bp-stat-l">Completed sessions</div>
            </div>
            <div className="bp-stat">
              <div className="bp-stat-n navy">{stats.students}</div>
              <div className="bp-stat-l">Students served</div>
            </div>
            <div className="bp-stat">
              <div className={`bp-stat-n ${stats.avgScore >= 70 ? 'green' : stats.avgScore >= 50 ? 'gold' : 'red'}`}>{stats.avgScore}%</div>
              <div className="bp-stat-l">Avg score</div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
            {[
              { key: 'drafts', label: `Drafts (${stats.drafts})` },
              { key: 'completed', label: `Completed (${stats.completed})` },
            ].map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                style={{ padding: '9px 16px', fontSize: 13, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontWeight: activeTab === t.key ? 700 : 400, color: activeTab === t.key ? 'var(--navy)' : 'var(--muted)', borderBottom: `2px solid ${activeTab === t.key ? 'var(--gold)' : 'transparent'}`, marginBottom: -1 }}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="bp-card">
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
                <span className="bp-spinner" style={{ marginRight: 8 }} />Loading...
              </div>
            ) : displayed.length === 0 ? (
              <div style={{ padding: '60px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>
                  {activeTab === 'drafts' ? 'No drafts yet' : 'No completed sessions yet'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>
                  {activeTab === 'drafts' ? 'Start a new game to create your first draft' : 'Complete a game session to see it here'}
                </div>
                {activeTab === 'drafts' && <button className="bp-btn bp-btn-gold" onClick={() => navigate('/host/upload')}>Create first game</button>}
              </div>
            ) : (
              <table className="bp-table">
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>Mode</th>
                    <th>Date</th>
                    <th>Questions</th>
                    {activeTab === 'completed' && <><th>Students</th><th>Avg score</th></>}
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(s => {
                    const pct = s.avg_score || 0;
                    const isDraft = s.status === 'draft';
                    const step = !s.questions?.length ? 'Add sources' : s.status === 'draft' ? 'Edit questions' : null;
                    return (
                      <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => isDraft ? continueDraft(s) : navigate(`/host/history/${s.id}`)}>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--navy)' }}>{s.name || 'Untitled session'}</div>
                          {isDraft && step && <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 2 }}>Continue: {step}</div>}
                        </td>
                        <td><span className={`bp-pill ${MODE_PILLS[s.mode] || 'bp-pill-gray'}`}>{MODE_LABELS[s.mode] || 'Not set'}</span></td>
                        <td style={{ color: 'var(--muted)' }}>{s.created_at?.toDate?.()?.toLocaleDateString?.() || '—'}</td>
                        <td>{s.question_count || 0}</td>
                        {activeTab === 'completed' && (
                          <>
                            <td>{s.student_count || 0}</td>
                            <td style={{ minWidth: 120 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div className="bp-prog-track" style={{ flex: 1 }}>
                                  <div className={`bp-prog-fill ${pct >= 75 ? 'green' : pct >= 55 ? 'gold' : 'red'}`} style={{ width: `${pct}%` }} />
                                </div>
                                <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 32 }}>{pct}%</span>
                              </div>
                            </td>
                          </>
                        )}
                        <td>
                          <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, backgroundColor: isDraft ? 'var(--gold-light)' : 'var(--success-bg)', color: isDraft ? 'var(--gold)' : 'var(--success)' }}>
                            {isDraft ? 'Draft' : 'Complete'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 5 }}>
                            {isDraft ? (
                              <>
                                <button className="bp-btn bp-btn-gold bp-btn-xs" onClick={e => { e.stopPropagation(); continueDraft(s); }}>Continue →</button>
                                <button className="bp-btn bp-btn-xs" style={{ color: 'var(--danger)', borderColor: 'var(--danger-bg)', backgroundColor: 'var(--danger-bg)' }} onClick={e => deleteDraft(e, s.id)}>Delete</button>
                              </>
                            ) : (
                              <button className="bp-btn bp-btn-outline bp-btn-xs" onClick={e => { e.stopPropagation(); navigate(`/host/history/${s.id}`); }}>View →</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
