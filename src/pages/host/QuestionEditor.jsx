import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAdminAuth } from '../../hooks/useAdminAuth';

const LETTERS = ['A','B','C','D'];
const TIER_LABELS = { priority: '★ Priority', manual: '✎ Manual', ai: '⚡ AI' };
const TIER_COLORS = { priority: 'var(--gold)', manual: 'var(--navy)', ai: 'var(--success)' };
const TIER_BG    = { priority: 'var(--gold-light)', manual: 'var(--navy-light)', ai: 'var(--success-bg)' };

export default function QuestionEditor() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAdminAuth();

  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [openIdx, setOpenIdx] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editedCount, setEditedCount] = useState(0);
  const [toast, setToast] = useState('');

  useEffect(() => { loadSession(); }, [sessionId]);

  async function loadSession() {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'play_sessions', sessionId));
      if (!snap.exists()) { navigate('/host'); return; }
      const data = snap.data();
      setSession(data);
      setQuestions((data.questions || []).map((q, i) => ({ ...q, _id: q._id || `q_${i}_${Date.now()}`, _edited: false })));
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  function updateQuestion(idx, updates) {
    setQuestions(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...updates, _edited: true };
      return next;
    });
    setEditedCount(c => c + 1);
    setSaved(false);
  }

  function setCorrect(idx, optIdx) {
    updateQuestion(idx, { correct_index: optIdx });
  }

  function updateOption(idx, optIdx, val) {
    setQuestions(prev => {
      const next = [...prev];
      const opts = [...(next[idx].options || [])];
      opts[optIdx] = val;
      next[idx] = { ...next[idx], options: opts, _edited: true };
      return next;
    });
    setSaved(false);
  }

  function moveUp(idx) {
    if (idx === 0) return;
    setQuestions(prev => { const n = [...prev]; [n[idx-1], n[idx]] = [n[idx], n[idx-1]]; return n; });
    setOpenIdx(idx - 1);
  }

  function moveDown(idx) {
    setQuestions(prev => {
      if (idx >= prev.length - 1) return prev;
      const n = [...prev]; [n[idx+1], n[idx]] = [n[idx], n[idx+1]]; return n;
    });
    setOpenIdx(idx + 1);
  }

  function deleteQuestion(idx) {
    setQuestions(prev => prev.filter((_, i) => i !== idx));
    if (openIdx === idx) setOpenIdx(null);
    setSaved(false);
    showToast('Question deleted');
  }

  function addQuestion() {
    const newQ = {
      _id: `q_manual_${Date.now()}`,
      text: 'New question — click to edit',
      type: 'mc',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correct_index: 0,
      difficulty: 'medium',
      tier: 'manual',
      excerpt: '',
      _edited: true,
    };
    setQuestions(prev => [...prev, newQ]);
    setOpenIdx(questions.length);
    setSaved(false);
    showToast('New question added');
  }

  async function saveAll() {
    setSaving(true);
    try {
      const cleanQs = questions.map(({ _id, _edited, ...q }) => q);
      await updateDoc(doc(db, 'play_sessions', sessionId), {
        questions: cleanQs,
        question_count: cleanQs.length,
        updated_at: serverTimestamp(),
      });
      setQuestions(prev => prev.map(q => ({ ...q, _edited: false })));
      setEditedCount(0);
      setSaved(true);
      showToast('All questions saved');
    } catch (err) {
      console.error(err);
      showToast('Save failed — try again');
    }
    setSaving(false);
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  const filtered = questions.filter((q, i) => {
    const matchFilter = filter === 'all' || q.type === filter || q.difficulty === filter || q.tier === filter;
    const matchSearch = !search || q.text.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const estMins = Math.max(1, Math.round(questions.reduce((a, q) => a + (q.timer || 20), 0) / 60));

  if (loading) return <div className="bp-loading">Loading questions...</div>;

  return (
    <div className="bp-layout">
      {toast && <div className="bp-toast" style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 999 }}>{toast}</div>}

      <aside className="bp-sidebar">
        <div className="bp-sidebar-logo">
          <div className="bp-logo-icon"><img src="/icon-192.png" alt="Bayan" /></div>
          <div><div className="bp-logo-name">BAYAN PLAY</div><div className="bp-logo-sub">QUESTION EDITOR</div></div>
        </div>
        <nav className="bp-nav">
          <div className="bp-nav-section">Session</div>
          <div className="bp-nav-item" onClick={() => navigate('/host/upload')}><span className="bp-nav-icon">←</span> Back to sources</div>
          <div className="bp-nav-item active"><span className="bp-nav-icon">✎</span> Edit questions</div>
          <div className="bp-nav-item" onClick={() => navigate(`/host/settings/${sessionId}`)}><span className="bp-nav-icon">⚙</span> Game settings</div>
        </nav>
        <div className="bp-sidebar-footer" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="bp-btn bp-btn-gold bp-btn-full" onClick={() => navigate(`/host/settings/${sessionId}`)}>
            Next: Settings →
          </button>
          <button className="bp-logout-btn" onClick={() => navigate('/host')}>← Sessions</button>
        </div>
      </aside>

      <div className="bp-main">
        <div className="bp-topbar">
          <div className="bp-topbar-title">{session?.name || 'Question editor'}</div>
          <div className="bp-topbar-right">
            {editedCount > 0 && !saved && (
              <span style={{ fontSize: 12, color: 'var(--warn)' }}>{editedCount} unsaved change{editedCount !== 1 ? 's' : ''}</span>
            )}
            {saved && <span style={{ fontSize: 12, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--success)', display: 'inline-block' }} />Saved</span>}
            <button className="bp-btn bp-btn-outline bp-btn-sm" onClick={addQuestion}>+ Add question</button>
            <button className="bp-btn bp-btn-primary bp-btn-sm" onClick={saveAll} disabled={saving}>
              {saving ? 'Saving...' : 'Save all'}
            </button>
            <button className="bp-btn bp-btn-gold bp-btn-sm" onClick={() => navigate(`/host/settings/${sessionId}`)}>
              Settings →
            </button>
          </div>
        </div>

        <div className="bp-page">

          {/* Stats */}
          <div className="bp-grid-stats bp-mb-24" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
            <div className="bp-stat"><div className="bp-stat-n navy">{questions.length}</div><div className="bp-stat-l">Questions</div></div>
            <div className="bp-stat"><div className="bp-stat-n gold">{estMins}</div><div className="bp-stat-l">Est. minutes</div></div>
            <div className="bp-stat"><div className="bp-stat-n" style={{ color: TIER_COLORS.priority }}>{questions.filter(q => q.tier === 'priority').length}</div><div className="bp-stat-l">Priority</div></div>
            <div className="bp-stat"><div className="bp-stat-n" style={{ color: TIER_COLORS.ai }}>{questions.filter(q => q.tier === 'ai').length}</div><div className="bp-stat-l">AI generated</div></div>
            <div className="bp-stat"><div className="bp-stat-n navy">{editedCount}</div><div className="bp-stat-l">Edited</div></div>
          </div>

          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            {['all','mc','tf','easy','medium','hard','priority','ai','manual'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
                  backgroundColor: filter === f ? 'var(--navy)' : 'transparent',
                  color: filter === f ? 'white' : 'var(--muted)',
                  borderColor: filter === f ? 'var(--navy)' : 'var(--border)',
                }}>
                {f === 'all' ? `All (${questions.length})` : f}
              </button>
            ))}
            <div style={{ flex: 1, minWidth: 160, maxWidth: 260, position: 'relative', marginLeft: 'auto' }}>
              <input
                style={{ width: '100%', padding: '5px 10px 5px 28px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'var(--gray-light)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
                placeholder="Search questions..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <svg style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="5.5" cy="5.5" r="4"/><path d="M9 9l3.5 3.5" strokeLinecap="round"/></svg>
            </div>
          </div>

          {/* Question list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((q, visIdx) => {
              const realIdx = questions.findIndex(rq => rq._id === q._id);
              const isOpen = openIdx === realIdx;
              return (
                <div key={q._id} style={{ border: `1px solid ${isOpen ? 'var(--gold-border)' : 'var(--border)'}`, borderRadius: 10, backgroundColor: 'white', overflow: 'hidden', transition: 'border-color .15s' }}>

                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }} onClick={() => setOpenIdx(isOpen ? null : realIdx)}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', backgroundColor: isOpen ? 'var(--navy)' : 'var(--navy-light)', color: isOpen ? 'white' : 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {realIdx + 1}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--navy)', flex: 1, fontWeight: q._edited ? 600 : 400, lineHeight: 1.4 }}>{q.text}</div>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
                      {q.tier && <span style={{ padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700, backgroundColor: TIER_BG[q.tier] || 'var(--gray-light)', color: TIER_COLORS[q.tier] || 'var(--muted)' }}>{TIER_LABELS[q.tier] || q.tier}</span>}
                      <span style={{ padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700, backgroundColor: q.type === 'mc' ? 'var(--navy-light)' : 'var(--gold-light)', color: q.type === 'mc' ? 'var(--navy)' : 'var(--gold)' }}>{q.type === 'mc' ? 'Multiple choice' : 'True / False'}</span>
                      <span style={{ padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700, backgroundColor: 'var(--gray-light)', color: 'var(--muted)' }}>{q.difficulty || 'medium'}</span>
                      {q._edited && <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--gold)', display: 'inline-block' }} />}
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: 11, transition: 'transform .2s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>▼</div>
                  </div>

                  {/* Body */}
                  {isOpen && (
                    <div style={{ borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>

                      {/* Left — question + options */}
                      <div style={{ padding: 16, borderRight: '1px solid var(--border)' }}>
                        <div style={{ marginBottom: 12 }}>
                          <label className="bp-label">Question text</label>
                          <textarea
                            className="bp-input"
                            rows={2}
                            value={q.text}
                            onChange={e => updateQuestion(realIdx, { text: e.target.value })}
                            style={{ resize: 'vertical' }}
                          />
                        </div>

                        <label className="bp-label" style={{ marginBottom: 8 }}>Answer options — click letter to mark correct</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 12 }}>
                          {(q.options || []).map((opt, oi) => (
                            <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, border: `1px solid ${oi === q.correct_index ? 'var(--gold-border)' : 'var(--border)'}`, backgroundColor: oi === q.correct_index ? 'var(--gold-light)' : 'white' }}>
                              <div
                                onClick={() => setCorrect(realIdx, oi)}
                                style={{ width: 22, height: 22, borderRadius: '50%', border: `1px solid ${oi === q.correct_index ? 'var(--gold)' : 'var(--border)'}`, backgroundColor: oi === q.correct_index ? 'var(--gold)' : 'var(--gray-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: oi === q.correct_index ? 'white' : 'var(--muted)', cursor: 'pointer', flexShrink: 0 }}>
                                {LETTERS[oi]}
                              </div>
                              <input
                                style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 13, color: 'var(--navy)', outline: 'none', fontFamily: 'inherit' }}
                                value={opt}
                                onChange={e => updateOption(realIdx, oi, e.target.value)}
                              />
                              {oi === q.correct_index && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', flexShrink: 0 }}>✓ correct</span>}
                            </div>
                          ))}
                        </div>

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <div>
                            <label className="bp-label" style={{ marginBottom: 4 }}>Timer</label>
                            <select className="bp-select" style={{ width: 120 }} value={q.timer || 20} onChange={e => updateQuestion(realIdx, { timer: Number(e.target.value) })}>
                              {[10,20,30,60].map(t => <option key={t} value={t}>{t}s</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="bp-label" style={{ marginBottom: 4 }}>Difficulty</label>
                            <select className="bp-select" style={{ width: 120 }} value={q.difficulty || 'medium'} onChange={e => updateQuestion(realIdx, { difficulty: e.target.value })}>
                              {['easy','medium','hard'].map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                          </div>
                          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                            <button className="bp-btn bp-btn-outline bp-btn-xs" onClick={() => moveUp(realIdx)}>↑</button>
                            <button className="bp-btn bp-btn-outline bp-btn-xs" onClick={() => moveDown(realIdx)}>↓</button>
                            <button className="bp-btn bp-btn-xs" style={{ color: 'var(--danger)', borderColor: 'var(--danger-bg)', backgroundColor: 'var(--danger-bg)' }} onClick={() => deleteQuestion(realIdx)}>Delete</button>
                          </div>
                        </div>
                      </div>

                      {/* Right — source excerpt + visibility */}
                      <div style={{ padding: 16 }}>
                        <div style={{ marginBottom: 14 }}>
                          <label className="bp-label">Source excerpt</label>
                          <textarea
                            className="bp-input"
                            rows={3}
                            placeholder="The source text this question was based on..."
                            value={q.excerpt || ''}
                            onChange={e => updateQuestion(realIdx, { excerpt: e.target.value })}
                            style={{ resize: 'vertical', fontSize: 12, fontStyle: q.excerpt ? 'italic' : 'normal' }}
                          />
                        </div>

                        <label className="bp-label">Player visibility</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {[
                            { key: 'showExcerpt', label: 'Show excerpt as hint', desc: 'Players see the source text above the question' },
                            { key: 'showSource', label: 'Show source name', desc: 'Players see the file/URL name' },
                          ].map(toggle => (
                            <div key={toggle.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)' }}>{toggle.label}</div>
                                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{toggle.desc}</div>
                              </div>
                              <div
                                onClick={() => updateQuestion(realIdx, { [toggle.key]: !q[toggle.key] })}
                                style={{ width: 32, height: 18, borderRadius: 9, backgroundColor: q[toggle.key] ? 'var(--navy)' : 'var(--border)', cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0 }}
                              >
                                <div style={{ width: 13, height: 13, borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: 2, left: q[toggle.key] ? 16 : 2, transition: 'left .2s' }} />
                              </div>
                            </div>
                          ))}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)' }}>Show correct answer</div>
                              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>Always hidden — locked</div>
                            </div>
                            <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, backgroundColor: 'var(--danger-bg)', color: 'var(--danger)' }}>Locked off</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add question row */}
          <div
            onClick={addQuestion}
            style={{ border: '2px dashed var(--border)', borderRadius: 10, padding: 14, textAlign: 'center', cursor: 'pointer', marginTop: 8, transition: 'all .15s', color: 'var(--muted)', fontSize: 13 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold-border)'; e.currentTarget.style.backgroundColor = 'var(--gold-light)'; e.currentTarget.style.color = 'var(--gold)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--muted)'; }}
          >
            + Add a question manually
          </div>

          {/* Bottom save bar */}
          <div style={{ position: 'sticky', bottom: 0, backgroundColor: 'white', borderTop: '1px solid var(--border)', padding: '12px 0', marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              {questions.length} questions · ~{estMins} min · {editedCount > 0 ? `${editedCount} unsaved` : 'all saved'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="bp-btn bp-btn-outline bp-btn-sm" onClick={() => navigate(`/host/upload`)}>← Back to sources</button>
              <button className="bp-btn bp-btn-primary bp-btn-sm" onClick={saveAll} disabled={saving || editedCount === 0}>
                {saving ? 'Saving...' : `Save ${editedCount > 0 ? `(${editedCount})` : 'all'}`}
              </button>
              <button className="bp-btn bp-btn-gold bp-btn-sm" onClick={async () => { await saveAll(); navigate(`/host/settings/${sessionId}`); }}>
                Save & continue →
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
