// shared test settings: SL_URL (served app), CHROMIUM (browser binary), AAPT
// (build-tools aapt, optional — enables the APK checks in update.test.js)
const path = require('path'), fs = require('fs');
const ch = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
module.exports = {
  ROOT: path.resolve(__dirname, '..'),
  URL: process.env.SL_URL || 'http://127.0.0.1:4573/index.html',
  CHROMIUM: fs.existsSync(ch) ? ch : undefined,
  AAPT: process.env.AAPT || ''
};
