const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getDatabase, ServerValue } = require('firebase-admin/database');


/**
 * joinRoom — called by players when joining a session
 *
 * Input:  { roomCode: string, displayName: string }
 * Output: { sessionUid: string, assignedName: string, roomCode: string, mode: string }
 *
 * Logic:
 *  1. Validate room exists and is in 'lobby' state
 *  2. Deduplicate display name (append number if taken)
 *  3. Assign a sequential session-scoped UID
 *  4. Write player to RTDB room
 */
exports.joinRoom = onCall(async (request) => {
  const { roomCode, displayName } = request.data;

  if (!roomCode || !displayName) {
    throw new HttpsError('invalid-argument', 'roomCode and displayName are required');
  }

  const db = getDatabase();
  const roomRef = db.ref(`rooms/${roomCode}`);
  const roomSnap = await roomRef.once('value');

  if (!roomSnap.exists()) {
    throw new HttpsError('not-found', 'Room not found');
  }

  const room = roomSnap.val();

  if (room.status !== 'lobby') {
    throw new HttpsError('failed-precondition', 'Session has already started');
  }

  // Get existing players to check name and UID count
  const playersSnap = await roomRef.child('players').once('value');
  const players = playersSnap.val() || {};
  const existingNames = Object.values(players).map(p => p.display_name.toLowerCase());
  const playerCount = Object.keys(players).length;

  // Check team cap if Jeopardy mode
  if (room.mode === 'jeopardy' && request.data.teamId) {
    const teamId = request.data.teamId;
    const teamMembers = Object.values(players).filter(p => p.team_id === teamId);
    if (room.settings?.max_per_team && teamMembers.length >= room.settings.max_per_team) {
      throw new HttpsError('resource-exhausted', 'Team is full');
    }
  }

  // Deduplicate name — silently append number if taken
  let assignedName = displayName.trim();
  let suffix = 2;
  while (existingNames.includes(assignedName.toLowerCase())) {
    assignedName = `${displayName.trim()} ${suffix}`;
    suffix++;
  }

  // Assign sequential session UID
  const sessionUid = `uid_${String(playerCount + 1).padStart(3, '0')}`;

  // Write player to RTDB
  await roomRef.child(`players/${sessionUid}`).set({
    display_name: assignedName,
    team_id: request.data.teamId || null,
    connected: true,
    answered_current: false,
    joined_at: ServerValue.TIMESTAMP,
  });

  return {
    sessionUid,
    assignedName,
    roomCode,
    mode: room.mode,
    sessionId: room.session_id,
  };
});
