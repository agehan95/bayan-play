// archiveSession — triggered when room status changes to 'ended'
// Reads RTDB room → writes to Firestore → wipes RTDB room
const { onValueUpdated } = require('firebase-functions/v2/database');
const { getDatabase } = require('firebase-admin/database');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

exports.archiveSession = onValueUpdated(
  'rooms/{code}/status',
  async (event) => {
    const after = event.data.after.val();
    if (after !== 'ended') return;

    const code = event.params.code;
    const db = getDatabase();
    const firestore = getFirestore();

    const roomSnap = await db.ref(`rooms/${code}`).once('value');
    const room = roomSnap.val();
    if (!room) return;

    // Write results to Firestore
    const players = room.players || {};
    const answers = room.answers || {};
    const batch = firestore.batch();

    Object.entries(players).forEach(([uid, player]) => {
      const playerAnswers = {};
      Object.entries(answers).forEach(([qId, qAnswers]) => {
        if (qAnswers[uid] !== undefined) playerAnswers[qId] = qAnswers[uid];
      });

      const resultRef = firestore
        .collection('play_results')
        .doc(room.session_id)
        .collection('players')
        .doc(uid);

      batch.set(resultRef, {
        display_name: player.display_name,
        session_uid: uid,
        answers: playerAnswers,
        score: player.score || 0,
        completed: player.completed || false,
        joined_at: player.joined_at,
      });
    });

    // Update session status in Firestore
    const sessionRef = firestore.collection('play_sessions').doc(room.session_id);
    batch.update(sessionRef, {
      status: 'complete',
      completed_at: FieldValue.serverTimestamp(),
      student_count: Object.keys(players).length,
    });

    await batch.commit();

    // Wipe RTDB room
    await db.ref(`rooms/${code}`).remove();
  }
);
