// shared test settings: SL_URL (served app = soundLAB, index.html), SL_GEAR_URL
// (soundLAB Gear, gear.html; by default the page next to SL_URL's index.html),
// CHROMIUM (browser binary), AAPT (build-tools aapt, optional — enables the APK
// checks in update.test.js)
const path = require('path'), fs = require('fs');
const ch = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const url = process.env.SL_URL || 'http://127.0.0.1:4573/index.html';
// gear.html sits beside index.html on the same server. Plain string work on
// purpose: three suites shadow the global URL class (const URL = env.URL), so
// nothing here or in a suite should lean on new URL()
const INDEX = /index\.html(?=$|[?#])/;
const gear = process.env.SL_GEAR_URL || (INDEX.test(url) ? url.replace(INDEX, 'gear.html') : url.replace(/[?#].*$/, '').replace(/[^/]*$/, '') + 'gear.html');
module.exports = {
  ROOT: path.resolve(__dirname, '..'),
  URL: url,
  GEAR_URL: gear,
  CHROMIUM: fs.existsSync(ch) ? ch : undefined,
  AAPT: process.env.AAPT || ''
};
