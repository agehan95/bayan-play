// Bayan Play — Cloud Functions index
// Each function is in its own file for clarity

const { initializeApp } = require('firebase-admin/app');
initializeApp();

const { joinRoom } = require('./joinRoom');
const { arbitrateSteal } = require('./arbitrateSteal');
const { archiveSession } = require('./archiveSession');
const { generateQuestions } = require('./generateQuestions');
const { scrapeUrl } = require('./scrapeUrl');

module.exports = {
  joinRoom,
  arbitrateSteal,
  archiveSession,
  generateQuestions,
  scrapeUrl,
};
