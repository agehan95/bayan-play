# Bayan Play — Quick Reference
Last updated: April 13, 2026

---

## LINKS

| What | URL |
|---|---|
| Live app (players join here) | https://bayan-play.web.app |
| Host login | https://bayan-play.web.app/host/login |
| Local dev | http://localhost:5173 |
| Firebase Console | https://console.firebase.google.com/project/bayan-portal-bb50e |
| GitHub repo | https://github.com/agehan95/bayan-play |
| Anthropic API | https://console.anthropic.com |

---

## LOCAL DEVELOPMENT

Use PowerShell or Command Prompt — both work.

```
cd C:\Users\PC\Documents\Bayan\play
npm run dev
```

App runs at http://localhost:5173
Stop with Ctrl+C

---

## DEPLOY

### Frontend only (most common)
```
npm run deploy
```
This runs: build → deploy hosting
Takes about 60 seconds

### Functions only (when you edit Cloud Functions)
```
firebase deploy --only functions
```
Takes 2-5 minutes

### Functions — single function (faster)
```
firebase deploy --only functions:generateQuestions
firebase deploy --only functions:joinRoom
```

### Everything at once
```
npm run deploy:all
```
This runs: build → deploy hosting + functions

---

## GIT

### Save your work
```
git add .
git commit -m "describe what you changed"
git push
```

### Check what changed
```
git status
git diff
```

---

## FILE LOCATIONS

```
C:\Users\PC\Documents\Bayan\play\
  src\
    App.jsx                        — routing
    index.css                      — global styles (navy + gold theme)
    firebase\config.js             — Firebase init
    hooks\
      useAdminAuth.js              — checks users collection for host access
      useAuthState.js              — basic auth state
    pages\
      host\
        HostLogin.jsx              — login screen
        HostDashboard.jsx          — sessions overview, live rooms
        UploadSources.jsx          — step 1: add sources, generate questions
        QuestionEditor.jsx         — step 2: review/edit questions
        GameSettings.jsx           — step 3: pick mode, configure, launch
        LiveHost.jsx               — live session control panel
        SessionHistory.jsx         — all sessions list
        SessionDetail.jsx          — per-session results
      player\
        PlayerJoin.jsx             — join screen (room code or active sessions)
        PlayerLobby.jsx            — waiting room
        PlayerGame.jsx             — assessment / game screen
        PlayerDone.jsx             — submitted / session ended screen
  functions\
    index.js                       — exports all Cloud Functions
    joinRoom.js                    — player joins a room
    generateQuestions.js           — calls Claude API
    scrapeUrl.js                   — fetches URL content server-side
    arbitrateSteal.js              — Jeopardy steal logic
    archiveSession.js              — saves results, wipes RTDB on end
  .env.local                       — Firebase config keys (never commit)
  firebase.json                    — hosting + functions config
  .firebaserc                      — project ID
```

---

## FIREBASE PROJECT

Project ID: `bayan-portal-bb50e`
Hosting site: `bayan-play`
RTDB URL: `https://bayan-portal-bb50e-default-rtdb.firebaseio.com`

### Collections in Firestore
- `users` — portal users (shared with portal)
- `play_sessions` — all sessions (draft + complete)
- `play_results/{sessionId}/players` — per-student results
- `play_activity_log` — generation audit trail
- `play_access_requests` — host access requests

### RTDB structure
- `rooms/{roomCode}` — live session state (wiped after session ends)

---

## HOST ACCESS

Only users with `role: superadmin` OR `role: admin` + `permissions.play_host: true`
in the `users` Firestore collection can access host features.

To grant access: Firestore → users → find user → set `permissions.play_host: true`

---

## SESSION FLOW (HOST)

```
1. /host/upload/{id}     — name session, add sources, generate questions
2. /host/editor/{id}     — review/edit questions, export to CSV/pipe
3. /host/settings/{id}   — pick mode, configure timer/settings, launch
4. /host/live/{roomCode} — lobby → warmup (optional) → assessment → end
5. /host/history/{id}    — view results, export CSV
```

## PLAYER FLOW

```
1. https://bayan-play.web.app  — enter room code (BYN-XXXX) or tap active session
2. /lobby/{roomCode}           — waiting room
3. /game/{roomCode}            — assessment (one at a time or form mode)
4. /done/{roomCode}            — submitted, waiting for host to end
```

---

## QUESTION FILE FORMATS (for priority upload)

**Pipe format (.txt)**
```
Question text | Correct answer | Option B | Option C | Option D
Is the sky blue? | True | False
```

**Labeled blocks (.txt)**
```
Q: What is the first pillar of Islam?
A: Shahada
B: Salah
C: Zakat
CORRECT: A
```

**CSV (.csv) — opens in Excel**
```
question,correct,optB,optC,optD
What is Tajweed?,Rules of Quran recitation,Arabic grammar,Islamic history,Fiqh
```

Export from question editor: ↓ Export → CSV or pipe .txt

---

## RTDB RULES — EXPIRY

Current test rules expire: **May 12, 2026**
Before that date, set proper rules in Firebase Console → Realtime Database → Rules

---

## ANTHROPIC API

Used for: question generation only
Model: `claude-sonnet-4-6`
Key stored in: Google Cloud Secret Manager (project bayan-portal-bb50e)
Cost: ~$0.01–0.03 per 20-question generation
File-only mode: zero cost, uses uploaded question files instead

---

## TROUBLESHOOTING

**Drafts not showing in dashboard**
→ Check browser console for Firebase index error, click the URL to create index

**Functions deploy fails with IAM error**
→ Run the 3 gcloud commands (see previous setup notes)

**generateQuestions returns "internal" error**
→ Run: firebase functions:log --only generateQuestions
→ Check for "Failed to parse" — increase max_tokens or shorten excerpts

**Player stuck on "Loading session..."**
→ Check browser console for errors
→ Verify RTDB room has session_id field

**Build fails**
→ Check for missing closing braces } in JSX
→ Run: npm run dev first to see exact error

---

## GAME MODES STATUS

| Mode | Host | Player | Notes |
|---|---|---|---|
| Assessment | ✅ | ✅ | Fully working |
| Kahoot | ⏳ | ⏳ | Host/player screens pending |
| Jeopardy | ⏳ | ⏳ | Board UI pending |
| Flashcard | ⏳ | ⏳ | Warm-up placeholder only |
