import { useState } from 'react';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../../firebase/config';
import { useNavigate } from 'react-router-dom';

// ─── LOGO & THEME CONFIG ─────────────────────────────────────────────────────
// Edit this object to change branding without touching the UI code
const BRAND = {
  logoType: 'text',        // 'text' or 'image'
  logoText: 'ب',           // Arabic/Latin text shown in logo square (if logoType='text')
  logoImageUrl: '',        // Path to image e.g. '/logo.png' (if logoType='image')
  appName: 'BAYAN PLAY',
  appSubtitle: 'Host portal',
  navy: '#1a2b5e',
  navyDark: '#0f1c3f',
  gold: '#c8860a',
};
// ─────────────────────────────────────────────────────────────────────────────

export default function HostLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const navigate = useNavigate();

  function validate() {
    const e = {};
    if (!email.trim()) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Enter a valid email address';
    if (!password) e.password = 'Password is required';
    else if (password.length < 6) e.password = 'Password must be at least 6 characters';
    return e;
  }

  async function handleSubmit(evt) {
    evt.preventDefault();
    setServerError('');
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      navigate('/host');
    } catch (err) {
      const code = err.code;
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setServerError('Incorrect email or password. Please try again.');
      } else if (code === 'auth/too-many-requests') {
        setServerError('Too many failed attempts. Please wait a few minutes.');
      } else if (code === 'auth/user-disabled') {
        setServerError('This account has been disabled. Contact your administrator.');
      } else {
        setServerError('Sign in failed. Check your connection and try again.');
      }
    }
    setLoading(false);
  }

  async function handleGoogle() {
    setServerError(''); setErrors({});
    setLoading(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      navigate('/host');
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setServerError('Google sign-in failed. Make sure popups are allowed.');
      }
    }
    setLoading(false);
  }

  return (
    <div style={s.page}>
      <div style={s.bgGlow} />

      <div style={s.card}>

        {/* Logo */}
        <div style={s.logoWrap}>
          <div style={{ ...s.logoIcon, backgroundColor: BRAND.gold }}>
            {BRAND.logoType === 'image' && BRAND.logoImageUrl
              ? <img src={BRAND.logoImageUrl} alt="logo" style={{ width: 42, height: 42, objectFit: 'contain' }} />
              : <span style={s.logoLetter}>{BRAND.logoText}</span>
            }
          </div>
          <h1 style={s.appName}>{BRAND.appName}</h1>
          <p style={s.appSub}>{BRAND.appSubtitle}</p>
        </div>

        {/* Server error */}
        {serverError && (
          <div style={s.errBanner}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ flexShrink: 0 }}>
              <circle cx="8" cy="8" r="6.5"/><path d="M8 5v3M8 10.5h.01" strokeLinecap="round"/>
            </svg>
            {serverError}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>

          <div style={s.fieldGroup}>
            <label style={s.label}>Email address</label>
            <input
              type="email" value={email} autoComplete="email" autoFocus
              onChange={e => { setEmail(e.target.value); setErrors(p => ({...p,email:''})); setServerError(''); }}
              placeholder="your@email.com"
              style={{ ...s.input, ...(errors.email ? s.inputErr : {}) }}
            />
            {errors.email && <div style={s.fieldErr}>{errors.email}</div>}
          </div>

          <div style={{ ...s.fieldGroup, marginBottom: '20px' }}>
            <label style={s.label}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'} value={password} autoComplete="current-password"
                onChange={e => { setPassword(e.target.value); setErrors(p => ({...p,password:''})); setServerError(''); }}
                placeholder="••••••••"
                style={{ ...s.input, paddingRight: '42px', ...(errors.password ? s.inputErr : {}) }}
              />
              <button type="button" onClick={() => setShowPw(v => !v)} style={s.eyeBtn} tabIndex={-1}>
                {showPw
                  ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#6b7a8d" strokeWidth="1.5"><path d="M2 2l12 12M6.5 6.6A2 2 0 008 12a2 2 0 001.4-3.4" strokeLinecap="round"/><path d="M4.2 4.3C2.8 5.2 1.5 6.5 1 8c1 3 3.8 5 7 5 1.4 0 2.7-.4 3.8-1.1" strokeLinecap="round"/><path d="M12.5 10.5C13.5 9.6 14.5 8.8 15 8c-1-3-3.8-5-7-5-.8 0-1.6.1-2.3.4" strokeLinecap="round"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#6b7a8d" strokeWidth="1.5"><path d="M1 8c1-3 3.8-5 7-5s6 2 7 5c-1 3-3.8 5-7 5s-6-2-7-5z" strokeLinecap="round"/><circle cx="8" cy="8" r="2"/></svg>
                }
              </button>
            </div>
            {errors.password && <div style={s.fieldErr}>{errors.password}</div>}
          </div>

          <button type="submit" disabled={loading} style={{ ...s.btnPrimary, opacity: loading ? 0.72 : 1 }}>
            {loading
              ? <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  <span style={s.spinner} />Signing in...
                </span>
              : 'Sign in'
            }
          </button>
        </form>

        {/* Divider */}
        <div style={s.divRow}>
          <div style={s.divLine}/><span style={s.divText}>or continue with</span><div style={s.divLine}/>
        </div>

        {/* Google */}
        <button onClick={handleGoogle} disabled={loading} style={{ ...s.btnGoogle, opacity: loading ? 0.72 : 1 }}>
          <svg width="17" height="17" viewBox="0 0 18 18" fill="none" style={{ flexShrink:0 }}>
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Google
        </button>

        <p style={s.footer}>Bayan Institute · Host access only</p>
      </div>

      <style>{`
        @keyframes bp-spin { to { transform: rotate(360deg); } }
        input:-webkit-autofill { -webkit-box-shadow: 0 0 0 30px white inset !important; -webkit-text-fill-color: #1a2332 !important; }
        button:not(:disabled):hover { filter: brightness(0.94); }
      `}</style>
    </div>
  );
}

const s = {
  page: { minHeight:'100vh', backgroundColor:'#0f1c3f', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', position:'relative', overflow:'hidden', fontFamily:"'Segoe UI', system-ui, sans-serif" },
  bgGlow: { position:'absolute', inset:0, background:'radial-gradient(ellipse at 30% 50%, rgba(200,134,10,0.12) 0%, transparent 60%), radial-gradient(ellipse at 70% 20%, rgba(26,43,94,0.4) 0%, transparent 50%)', pointerEvents:'none' },
  card: { backgroundColor:'#fff', borderRadius:'16px', padding:'38px', width:'100%', maxWidth:'400px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', position:'relative', zIndex:1 },
  logoWrap: { textAlign:'center', marginBottom:'28px' },
  logoIcon: { width:68, height:68, borderRadius:16, margin:'0 auto 10px', display:'flex', alignItems:'center', justifyContent:'center' },
  logoLetter: { fontFamily:"'Amiri', Georgia, serif", color:'#fff', fontSize:30, fontWeight:700, lineHeight:1 },
  appName: { fontSize:22, fontWeight:800, color:'#1a2b5e', letterSpacing:'2px', margin:'0 0 3px' },
  appSub: { color:'#6b7a8d', fontSize:12, margin:0 },
  errBanner: { display:'flex', alignItems:'center', gap:8, backgroundColor:'#fde8e8', border:'1px solid #f5c6c6', borderRadius:8, padding:'10px 13px', fontSize:13, color:'#c0392b', marginBottom:18, lineHeight:1.4 },
  fieldGroup: { marginBottom:15 },
  label: { display:'block', fontSize:'11.5px', fontWeight:700, color:'#1a2b5e', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.4px' },
  input: { width:'100%', padding:'10px 13px', border:'1px solid #dde3ea', borderRadius:8, fontSize:14, color:'#1a2332', outline:'none', fontFamily:'inherit', backgroundColor:'#fff', transition:'border-color .15s', boxSizing:'border-box' },
  inputErr: { borderColor:'#c0392b', backgroundColor:'#fde8e8' },
  fieldErr: { fontSize:12, color:'#c0392b', fontWeight:500, marginTop:3 },
  eyeBtn: { position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', padding:2, display:'flex', alignItems:'center' },
  btnPrimary: { width:'100%', padding:11, borderRadius:8, backgroundColor:'#1a2b5e', color:'#fff', border:'none', fontSize:14, fontWeight:700, cursor:'pointer', transition:'background .15s', letterSpacing:'0.3px' },
  spinner: { width:14, height:14, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', display:'inline-block', animation:'bp-spin 0.7s linear infinite' },
  divRow: { display:'flex', alignItems:'center', gap:10, margin:'20px 0' },
  divLine: { flex:1, height:1, backgroundColor:'#dde3ea' },
  divText: { fontSize:12, color:'#6b7a8d', whiteSpace:'nowrap' },
  btnGoogle: { width:'100%', padding:10, borderRadius:8, backgroundColor:'#fff', border:'1px solid #dde3ea', fontSize:14, fontWeight:600, color:'#1a2332', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 },
  footer: { textAlign:'center', fontSize:11, color:'#aab4c0', marginTop:20, marginBottom:0 },
};
