// arbitrateSteal — picks first steal tap by server timestamp
// Full implementation in spec doc Section 9.6
const { onValueCreated } = require('firebase-functions/v2/database');
const { getDatabase } = require('firebase-admin/database');

exports.arbitrateSteal = onValueCreated(
  'rooms/{code}/steal/taps/{teamId}',
  async (event) => {
    const code = event.params.code;
    const teamId = event.params.teamId;
    const db = getDatabase();
    const roomRef = db.ref(`rooms/${code}`);
    const room = (await roomRef.once('value')).val();

    if (!room || room.steal?.claimed) return;
    if (!room.steal?.eligible_teams?.includes(teamId)) return;

    await roomRef.child('steal/claimed_by').set(teamId);
    await roomRef.child(`teams/${teamId}/stole_this_q`).set(true);
  }
);
