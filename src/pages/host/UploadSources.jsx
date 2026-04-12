import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import { db } from '../../firebase/config';
import app from '../../firebase/config';
import { useAdminAuth } from '../../hooks/useAdminAuth';

const functions = getFunctions(app);
const storage = getStorage(app);
const SOURCE_ACCEPTED = '.pdf,.doc,.docx,.txt,.md,.html,.pptx';
const PRIORITY_ACCEPTED = '.txt,.csv,.xlsx,.xls';
const MAX_FILE_MB = 20;

function parsePriority(text, filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const questions = [];

  if (lines.some(l => l.includes(' | '))) {
    lines.forEach(line => {
      const parts = line.split(' | ').map(p => p.trim());
      if (parts.length < 2) return;
      const [txt, correct, ...rest] = parts;
      if (rest.length >= 1) {
        questions.push({ text: txt, type: 'mc', options: [correct, ...rest], correct_index: 0, difficulty: 'medium', tier: 'priority', excerpt: '' });
      } else {
        const isTF = ['true','false','yes','no'].includes(correct.toLowerCase());
        if (isTF) {
          questions.push({ text: txt, type: 'tf', options: ['True','False'], correct_index: correct.toLowerCase() === 'true' ? 0 : 1, difficulty: 'medium', tier: 'priority', excerpt: '' });
        } else {
          questions.push({ text: txt, type: 'mc', options: [correct, '—', '—', '—'], correct_index: 0, difficulty: 'medium', tier: 'priority', excerpt: '' });
        }
      }
    });
    return questions;
  }

  if (lines.some(l => l.match(/^Q:/i))) {
    let current = null;
    lines.forEach(line => {
      if (line.match(/^Q:/i)) {
        if (current) questions.push(current);
        current = { text: line.replace(/^Q:/i,'').trim(), type: 'mc', options: [], correct_index: 0, difficulty: 'medium', tier: 'priority', excerpt: '' };
      } else if (current && line.match(/^A:/i)) { current.options[0] = line.replace(/^A:/i,'').trim(); }
      else if (current && line.match(/^B:/i)) { current.options[1] = line.replace(/^B:/i,'').trim(); }
      else if (current && line.match(/^C:/i)) { current.options[2] = line.replace(/^C:/i,'').trim(); }
      else if (current && line.match(/^D:/i)) { current.options[3] = line.replace(/^D:/i,'').trim(); }
      else if (current && line.match(/^CORRECT:/i)) {
        const val = line.replace(/^CORRECT:/i,'').trim().toUpperCase();
        current.correct_index = Math.max(0, ['A','B','C','D'].indexOf(val));
      } else if (current && line.match(/^ANSWER:/i)) {
        const ans = line.replace(/^ANSWER:/i,'').trim();
        const isTF = ['true','false'].includes(ans.toLowerCase());
        if (isTF) { current.type = 'tf'; current.options = ['True','False']; current.correct_index = ans.toLowerCase() === 'true' ? 0 : 1; }
        else if (!current.options[0]) current.options[0] = ans;
      }
    });
    if (current) questions.push(current);
    return questions.map(q => ({ ...q, options: q.options.filter(Boolean).length >= 2 ? q.options.filter(Boolean) : ['True','False'], type: q.options.filter(Boolean).length >= 3 ? 'mc' : 'tf' }));
  }

  if (ext === 'csv' || lines[0]?.toLowerCase().includes('question')) {
    const dataLines = lines[0]?.toLowerCase().includes('question') ? lines.slice(1) : lines;
    dataLines.forEach(line => {
      const parts = line.split(',').map(p => p.replace(/^"|"$/g,'').trim());
      if (parts.length < 2) return;
      const [txt, correct, ...rest] = parts;
      if (!txt) return;
      if (rest.length >= 1) {
        questions.push({ text: txt, type: 'mc', options: [correct, ...rest].filter(Boolean), correct_index: 0, difficulty: 'medium', tier: 'priority', excerpt: '' });
      } else {
        const isTF = ['true','false'].includes(correct.toLowerCase());
        questions.push({ text: txt, type: isTF ? 'tf' : 'mc', options: isTF ? ['True','False'] : [correct,'—','—','—'], correct_index: isTF && correct.toLowerCase() === 'false' ? 1 : 0, difficulty: 'medium', tier: 'priority', excerpt: '' });
      }
    });
    return questions;
  }

  return questions;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatTime(secs) {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}m ${s}s`;
}

export default function UploadSources() {
  const navigate = useNavigate();
  const { user } = useAdminAuth();
  const fileInputRef = useRef();
  const priorityInputRef = useRef();
  const timerRef = useRef(null);

  const [sessionId, setSessionId] = useState(null);
  const [sessionName, setSessionName] = useState('');
  const [sources, setSources] = useState([]);
  const [priorityQuestions, setPriorityQuestions] = useState([]);
  const [urlInput, setUrlInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteVisible, setPasteVisible] = useState(false);
  const [config, setConfig] = useState({ count: 10, type: 'mixed', difficulty: 'medium', timer: 20 });
  const [generating, setGenerating] = useState(false);
  const [genElapsed, setGenElapsed] = useState(0);
  const [genDuration, setGenDuration] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploadProgress, setUploadProgress] = useState({});

  // Auto-save session name
  useEffect(() => {
    if (!sessionId || !sessionName.trim()) return;
    const t = setTimeout(() => updateDoc(doc(db, 'play_sessions', sessionId), { name: sessionName.trim() }), 1000);
    return () => clearTimeout(t);
  }, [sessionName, sessionId]);

  // Generation timer
  useEffect(() => {
    if (generating) {
      setGenElapsed(0);
      setGenDuration(null);
      timerRef.current = setInterval(() => setGenElapsed(s => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [generating]);

  async function ensureSession() {
    if (sessionId) return sessionId;
    const docRef = await addDoc(collection(db, 'play_sessions'), {
      name: sessionName.trim() || 'Untitled session',
      host_uid: user.uid,
      status: 'draft',
      mode: 'assess',
      questions: [],
      sources: [],
      settings: { timer: config.timer, type: config.type, difficulty: config.difficulty },
      question_count: 0,
      created_at: serverTimestamp(),
    });
    setSessionId(docRef.id);
    return docRef.id;
  }

  async function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    for (const file of files) {
      if (file.size > MAX_FILE_MB * 1024 * 1024) { setError(`${file.name} exceeds ${MAX_FILE_MB}MB.`); continue; }
      await uploadFile(file);
    }
    e.target.value = '';
  }

  async function uploadFile(file) {
    const id = `file_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const ext = file.name.split('.').pop().toLowerCase();
    const sid = await ensureSession();
    const storageRef = ref(storage, `play/sources/${user.uid}/${id}.${ext}`);
    setSources(prev => [...prev, { id, type: 'file', name: file.name, ext, status: 'uploading', text: '', downloadUrl: '', statusText: 'Uploading...' }]);
    const task = uploadBytesResumable(storageRef, file);
    task.on('state_changed',
      snap => setUploadProgress(prev => ({ ...prev, [id]: Math.round((snap.bytesTransferred / snap.totalBytes) * 100) })),
      err => { console.error(err); updateSource(id, { status: 'error', statusText: 'Upload failed' }); },
      async () => {
        const downloadUrl = await getDownloadURL(task.snapshot.ref);
        let text = '';
        if (['txt','md','html'].includes(ext)) text = await file.text();
        updateSource(id, { status: 'ready', downloadUrl, text, statusText: `${formatSize(file.size)} · uploaded` });
        setUploadProgress(prev => { const p = {...prev}; delete p[id]; return p; });
        await updateDoc(doc(db, 'play_sessions', sid), { sources: arrayUnion({ id, type: 'file', name: file.name, url: downloadUrl }) });
      }
    );
  }

  async function handlePriorityFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const text = await file.text();
    const parsed = parsePriority(text, file.name);
    if (!parsed.length) { setError(`Could not parse questions from ${file.name}. Check the format.`); return; }
    setPriorityQuestions(prev => [...prev, ...parsed]);
    setSuccess(`${parsed.length} priority questions loaded from ${file.name}`);
    setTimeout(() => setSuccess(''), 3000);
  }

  async function handleAddUrl() {
    const url = urlInput.trim();
    if (!url) return;
    let validated;
    try { validated = new URL(url.startsWith('http') ? url : 'https://' + url); }
    catch { setError('Invalid URL'); return; }
    setUrlLoading(true); setError('');
    const id = `url_${Date.now()}`;
    const sid = await ensureSession();
    setSources(prev => [...prev, { id, type: 'url', name: validated.hostname, status: 'fetching', text: '', statusText: 'Fetching...' }]);
    setUrlInput('');
    try {
      const result = await httpsCallable(functions, 'scrapeUrl')({ url: validated.href });
      const { text, wordCount, title } = result.data;
      updateSource(id, { status: 'ready', text, name: title || validated.hostname, statusText: `~${wordCount} words extracted` });
      await updateDoc(doc(db, 'play_sessions', sid), { sources: arrayUnion({ id, type: 'url', name: title || validated.hostname, url: validated.href }) });
    } catch {
      updateSource(id, { status: 'error', statusText: 'Could not fetch — site may block scraping' });
    }
    setUrlLoading(false);
  }

  async function handleAddPaste() {
    if (!pasteText.trim()) return;
    const id = `paste_${Date.now()}`;
    const wordCount = pasteText.trim().split(/\s+/).length;
    const sid = await ensureSession();
    setSources(prev => [...prev, { id, type: 'paste', name: 'Pasted text', status: 'ready', text: pasteText.trim(), statusText: `~${wordCount} words` }]);
    setPasteText(''); setPasteVisible(false);
    await updateDoc(doc(db, 'play_sessions', sid), { sources: arrayUnion({ id, type: 'paste', name: 'Pasted text', url: '' }) });
  }

  function updateSource(id, updates) { setSources(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s)); }
  function removeSource(id) { setSources(prev => prev.filter(s => s.id !== id)); }
  function removePriority(idx) { setPriorityQuestions(prev => prev.filter((_,i) => i !== idx)); }

  async function handleGenerate(replaceAI = false) {
    setError('');
    const ready = sources.filter(s => s.status === 'ready');
    if (!ready.length && !priorityQuestions.length) { setError('Add at least one source or priority questions first'); return; }
    if (!sessionName.trim()) { setError('Give your session a name first'); return; }
    setGenerating(true);
    const genStart = Date.now();
    try {
      const sid = await ensureSession();
      const existing = await getDoc(doc(db, 'play_sessions', sid));
      const existingQs = existing.data()?.questions || [];
      const keepQs = replaceAI ? existingQs.filter(q => q.tier === 'priority' || q.tier === 'manual') : existingQs;
      const existingTexts = new Set(keepQs.map(q => q.text));
      const newPriority = priorityQuestions.filter(q => !existingTexts.has(q.text));
      let newAIQuestions = [];
      const combinedText = ready.map(s => s.text).filter(Boolean).join('\n\n---\n\n');
      if (combinedText.trim()) {
        const aiCount = Math.max(1, config.count - newPriority.length - keepQs.filter(q => q.tier !== 'ai').length);
        const result = await httpsCallable(functions, 'generateQuestions')({
          sourceText: combinedText,
          config: { count: aiCount, type: config.type, difficulty: config.difficulty },
        });
        newAIQuestions = (result.data.questions || []).map(q => ({ ...q, tier: 'ai' }));
      }
      const finalQuestions = [...keepQs.filter(q => q.tier !== 'ai' || !replaceAI), ...newPriority, ...newAIQuestions];
      const duration = Math.round((Date.now() - genStart) / 1000);
      setGenDuration(duration);
      await updateDoc(doc(db, 'play_sessions', sid), {
        name: sessionName.trim(),
        questions: finalQuestions,
        question_count: finalQuestions.length,
        settings: { timer: config.timer, type: config.type, difficulty: config.difficulty },
        status: 'draft',
      });
      setSuccess(`${newAIQuestions.length} AI + ${newPriority.length} priority = ${finalQuestions.length} questions · generated in ${formatTime(duration)}`);
      setTimeout(() => navigate(`/host/editor/${sid}`), 1500);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to generate questions. Try again.');
    }
    setGenerating(false);
  }

  const readyCount = sources.filter(s => s.status === 'ready').length;
  const canGenerate = (readyCount > 0 || priorityQuestions.length > 0) && sessionName.trim() && !generating;

  return (
    <div className="bp-layout">
      <aside className="bp-sidebar">
        <div className="bp-sidebar-logo">
          <div className="bp-logo-icon"><img src="/icon-192.png" alt="Bayan" /></div>
          <div><div className="bp-logo-name">BAYAN PLAY</div><div className="bp-logo-sub">HOST PORTAL</div></div>
        </div>
        <nav className="bp-nav">
          <div className="bp-nav-section">Game</div>
          <div className="bp-nav-item" onClick={() => navigate('/host')}><span className="bp-nav-icon">▶</span> Sessions</div>
          <div className="bp-nav-item active"><span className="bp-nav-icon">+</span> New game</div>
          <div className="bp-nav-item" onClick={() => navigate('/host/history')}><span className="bp-nav-icon">◷</span> History</div>
        </nav>
        <div className="bp-sidebar-footer">
          <button className="bp-logout-btn" onClick={() => navigate('/host')}>← Back to sessions</button>
        </div>
      </aside>

      <div className="bp-main">
        <div className="bp-topbar">
          <div className="bp-topbar-title">New game — upload sources</div>
          <div className="bp-topbar-right">
            {sessionId && <span style={{ fontSize: 11, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--success)', display: 'inline-block' }} />Auto-saved</span>}
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{readyCount} source{readyCount !== 1 ? 's' : ''} ready</span>
          </div>
        </div>

        <div className="bp-page" style={{ maxWidth: 820 }}>

          <div className="bp-card bp-mb-24">
            <div className="bp-card-header"><h3>Session name</h3></div>
            <div className="bp-card-body">
              <input className="bp-input" placeholder="e.g. Tajweed Basics — Week 3" value={sessionName} onChange={e => setSessionName(e.target.value)} maxLength={80} />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>Auto-saved as you type once a session is created</div>
            </div>
          </div>

          <div className="bp-card bp-mb-16">
            <div className="bp-card-header"><h3>Source materials</h3><span style={{ fontSize: 12, color: 'var(--muted)' }}>AI generates questions from these</span></div>
            <div className="bp-card-body">
              <div onClick={() => fileInputRef.current.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); Array.from(e.dataTransfer.files).forEach(uploadFile); }}
                style={{ border: '2px dashed var(--gold-border)', borderRadius: 10, padding: '24px 20px', textAlign: 'center', backgroundColor: 'var(--gold-light)', cursor: 'pointer', marginBottom: 14 }}>
                <div style={{ fontSize: 26, marginBottom: 6 }}>📄</div>
                <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: 3 }}>Drop files or click to upload</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>PDF, Word, HTML, Markdown, plain text — max 20MB</div>
                <input ref={fileInputRef} type="file" multiple accept={SOURCE_ACCEPTED} onChange={handleFileSelect} style={{ display: 'none' }} />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label className="bp-label">Add a link</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="bp-input" type="url" placeholder="https://en.wikipedia.org/wiki/Tajweed" value={urlInput} onChange={e => setUrlInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddUrl()} disabled={urlLoading} />
                  <button className="bp-btn bp-btn-outline" onClick={handleAddUrl} disabled={urlLoading || !urlInput.trim()} style={{ flexShrink: 0 }}>{urlLoading ? 'Fetching...' : 'Add link'}</button>
                </div>
              </div>

              <div>
                <button className="bp-btn bp-btn-outline bp-btn-sm" onClick={() => setPasteVisible(v => !v)}>{pasteVisible ? '− Hide' : '+ Paste text'}</button>
                {pasteVisible && (
                  <div style={{ marginTop: 10 }}>
                    <textarea className="bp-input" rows={4} placeholder="Paste notes, lesson content, or any text..." value={pasteText} onChange={e => setPasteText(e.target.value)} style={{ resize: 'vertical' }} />
                    <button className="bp-btn bp-btn-gold bp-btn-sm" style={{ marginTop: 8 }} onClick={handleAddPaste} disabled={!pasteText.trim()}>Add text</button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {sources.length > 0 && (
            <div className="bp-card bp-mb-24">
              <div className="bp-card-header">
                <h3>Sources ({sources.length})</h3>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{readyCount} ready</span>
              </div>
              {sources.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, backgroundColor: s.type === 'url' ? 'var(--navy-light)' : s.type === 'paste' ? 'var(--gold-light)' : 'var(--gray-light)', color: s.type === 'url' ? 'var(--navy)' : s.type === 'paste' ? 'var(--gold)' : 'var(--muted)' }}>
                    {s.type === 'url' ? 'URL' : s.type === 'paste' ? 'TXT' : (s.ext || 'FILE').toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{s.statusText || s.status}</div>
                    {uploadProgress[s.id] !== undefined && <div className="bp-prog-track" style={{ marginTop: 4 }}><div className="bp-prog-fill navy" style={{ width: `${uploadProgress[s.id]}%` }} /></div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {s.status === 'ready' && <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: 'var(--success)', display: 'inline-block' }} />}
                    {s.status === 'error' && <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: 'var(--danger)', display: 'inline-block' }} />}
                    {(s.status === 'uploading' || s.status === 'fetching') && <span className="bp-spinner" />}
                    <button onClick={() => removeSource(s.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 18, cursor: 'pointer' }}>×</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="bp-card bp-mb-24">
            <div className="bp-card-header">
              <div>
                <h3>Priority questions <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)' }}>optional</span></h3>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Always kept — never overwritten by AI generation</div>
              </div>
              <button className="bp-btn bp-btn-outline bp-btn-sm" onClick={() => priorityInputRef.current.click()}>Upload questions file</button>
              <input ref={priorityInputRef} type="file" accept={PRIORITY_ACCEPTED} onChange={handlePriorityFile} style={{ display: 'none' }} />
            </div>
            <div className="bp-card-body">
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--navy)' }}>Supported formats — auto-detected:</strong><br/>
                <code style={{ fontSize: 11, backgroundColor: 'var(--gray-light)', padding: '1px 5px', borderRadius: 4 }}>Pipe</code>&nbsp; Question | Correct | OptionB | OptionC | OptionD<br/>
                <code style={{ fontSize: 11, backgroundColor: 'var(--gray-light)', padding: '1px 5px', borderRadius: 4 }}>Labeled</code>&nbsp; Q: ... then A: ... B: ... CORRECT: A<br/>
                <code style={{ fontSize: 11, backgroundColor: 'var(--gray-light)', padding: '1px 5px', borderRadius: 4 }}>CSV</code>&nbsp; question,correct,optB,optC,optD (header row required)
              </div>
              {priorityQuestions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '14px 0', color: 'var(--muted)', fontSize: 13 }}>No priority questions loaded</div>
              ) : (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>{priorityQuestions.length} priority questions loaded</div>
                  {priorityQuestions.slice(0, 5).map((q, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ width: 20, height: 20, borderRadius: '50%', backgroundColor: 'var(--gold-light)', color: 'var(--gold)', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i+1}</span>
                      <span style={{ fontSize: 12, color: 'var(--navy)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.text}</span>
                      <span className="bp-pill bp-pill-gold" style={{ fontSize: 10 }}>{q.type === 'tf' ? 'T/F' : 'MC'}</span>
                      <button onClick={() => removePriority(i)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 16, cursor: 'pointer' }}>×</button>
                    </div>
                  ))}
                  {priorityQuestions.length > 5 && <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>...and {priorityQuestions.length - 5} more</div>}
                </div>
              )}
            </div>
          </div>

          <div className="bp-card bp-mb-24">
            <div className="bp-card-header"><h3>Question settings</h3></div>
            <div className="bp-card-body">
              <div className="bp-grid-2" style={{ gap: 14 }}>
                <div>
                  <label className="bp-label">Total questions to generate</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="number" className="bp-input" min={1} max={100} value={config.count}
                      onChange={e => setConfig(p => ({ ...p, count: Math.min(100, Math.max(1, Number(e.target.value))) }))}
                      style={{ width: 80 }} />
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>max 100 · priority counts toward total</span>
                  </div>
                </div>
                <div><label className="bp-label">Question type</label>
                  <select className="bp-select" value={config.type} onChange={e => setConfig(p => ({ ...p, type: e.target.value }))}>
                    <option value="mixed">Mixed</option><option value="mc">Multiple choice only</option><option value="tf">True / False only</option>
                  </select></div>
                <div><label className="bp-label">Difficulty</label>
                  <select className="bp-select" value={config.difficulty} onChange={e => setConfig(p => ({ ...p, difficulty: e.target.value }))}>
                    <option value="mixed">Mixed</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                  </select></div>
                <div><label className="bp-label">Default time per question</label>
                  <select className="bp-select" value={config.timer} onChange={e => setConfig(p => ({ ...p, timer: Number(e.target.value) }))}>
                    <option value={10}>10 seconds</option><option value={20}>20 seconds</option><option value={30}>30 seconds</option><option value={60}>60 seconds</option>
                  </select></div>
              </div>
            </div>
          </div>

          {error && <div style={{ padding: '11px 14px', backgroundColor: 'var(--danger-bg)', border: '1px solid #f5c6c6', borderRadius: 8, fontSize: 13, color: 'var(--danger)', marginBottom: 16 }}>{error}</div>}
          {success && <div style={{ padding: '11px 14px', backgroundColor: 'var(--success-bg)', border: '1px solid #a8d5b5', borderRadius: 8, fontSize: 13, color: 'var(--success)', marginBottom: 16 }}>{success}</div>}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button className="bp-btn bp-btn-gold" style={{ padding: '11px 24px', fontSize: 14, minWidth: 230, opacity: canGenerate ? 1 : 0.5 }} onClick={() => handleGenerate(false)} disabled={!canGenerate}>
              {generating
                ? <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="bp-spinner white" />Generating... {formatTime(genElapsed)}</span>
                : '+ Generate & add questions →'}
            </button>
            {sessionId && (
              <button className="bp-btn bp-btn-outline" style={{ opacity: canGenerate ? 1 : 0.5 }} onClick={() => handleGenerate(true)} disabled={!canGenerate}>
                {generating ? `↺ Regenerating... ${formatTime(genElapsed)}` : '↺ Regenerate AI questions'}
              </button>
            )}
            {genDuration && !generating && (
              <span style={{ fontSize: 12, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--success)', display: 'inline-block' }} />
                Last generation: {formatTime(genDuration)}
              </span>
            )}
            {!generating && <span style={{ fontSize: 12, color: 'var(--muted)' }}>You'll review all questions before launching</span>}
          </div>

        </div>
      </div>
    </div>
  );
}
