/* Shared pitch identity, quantized to the archived LUMI default-program
 * colourLookup[128]. Provenance: benob/LUMI-lights @
 * ffb63fa3557153e07bc1e0a6b1742a2616d2a8ba, littlefoot default program.
 * This is a documented program profile, not a guarantee about every firmware
 * or physical RGB calibration. No device writes occur in this utility.
 */
(function () {
  'use strict';
  var packed = '000000ff506fff546cff5869ff5c66ff6063ff6460ff695cff6d59ff7156ff7553ff7950ff7d4dff814aff8547ff8944ff8d41ff923dff963aff9a37ff9e34ffa231ffa62effaa2effae2dffb12dffb52cffb92cffbd2bffc12bffc42bffc82affcc2affd029ffd429ffd828ffdb28ffdf28ffe327ffe727ffeb26ffee26fff225fff625f7f62af0f72ee8f733e1f837d9f83cd1f841caf945c2f94abaf94fb3fa53abfa58a4fb5c9cfb6194fb668dfc6a85fc6f7dfc7476fd786efd7d67fe815ffe865cfc8b59fa8f56f89453f69850f49d4df2a24af0a647eeab44ecb041eab43ee9b93be7bd38e5c235e3c732e1cb2fdfd02cddd529dbd926d9de23d7e220d5e723d0e826cbe929c6ea2cc1ec2fbced32b7ee35b2ef38adf03ba8f13ea3f2409ff4439af54695f64990f74c8bf84f86f95281fa557cfc5877fd5b72fe5e6dff616bfe6469fd6767fc6b64fb6e62fa7160f9745ef8775cf77a5af67e58f58155f38453f28751f18a4ff08d4def904bee9448ed9746ec9a44eb9d42eaffffff';
  var table = [], cache = Object.create(null), intervalCache = Object.create(null);
  for (var i = 0; i < 128; i++) table.push(parseInt(packed.substr(i * 6, 6), 16));
  var naturals = [0, 2, 4, 5, 7, 9, 11];
  var labels = ['R', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'];
  function mod(n) { return ((n % 12) + 12) % 12; }
  function pc(value) {
    if (typeof value === 'number' && isFinite(value)) return mod(Math.round(value));
    if (typeof value === 'string' && value.trim() !== '' && isFinite(Number(value))) return mod(Math.round(Number(value)));
    var m = /^([A-Ga-g])([#b♯♭]{0,2})(?:-?\d+)?$/.exec(String(value || '').trim());
    if (!m) return null;
    var n = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()];
    for (var i = 0; i < m[2].length; i++) n += m[2][i] === '#' || m[2][i] === '♯' ? 1 : -1;
    return mod(n);
  }
  function rgb(velocity) {
    return Number.isInteger(velocity) && velocity >= 0 && velocity < 128 ? '#' + ('000000' + table[velocity].toString(16)).slice(-6) : null;
  }
  function nearest(hex) {
    if (!/^#[0-9a-f]{6}$/i.test(String(hex || ''))) return null;
    hex = hex.toLowerCase();
    if (cache[hex]) return cache[hex];
    var color = parseInt(hex.slice(1), 16), r = color >> 16, g = (color >> 8) & 255, b = color & 255, best = 1, distance = Infinity;
    // Velocity 0 is off; 1..127 are valid colors (127 is white).
    for (var i = 1; i < 128; i++) {
      var t = table[i], r2 = t >> 16, g2 = (t >> 8) & 255, b2 = t & 255, mean = (r + r2) / 2;
      var d = (2 + mean / 256) * (r-r2) * (r-r2) + 4 * (g-g2) * (g-g2) + (2 + (255-mean) / 256) * (b-b2) * (b-b2);
      if (d < distance) { distance = d; best = i; }
    }
    cache[hex] = best;
    return best;
  }
  function quantize(hex) { var v = nearest(hex); return v == null ? null : rgb(v); }
  function mapped(colors) { return colors.map(quantize); }
  function midpoint(a, b) {
    var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16), n = 0;
    for (var shift = 0; shift <= 16; shift += 8) n |= Math.round((((x >> shift) & 255) + ((y >> shift) & 255)) / 2) << shift;
    return '#' + ('000000' + n.toString(16)).slice(-6);
  }
  function intervals(degrees) {
    var key = degrees.join('|');
    if (!intervalCache[key]) {
      var colors = mapped(degrees), out = [];
      naturals.forEach(function (semi, i) { out[semi] = colors[i]; });
      [1,3,6,8,10].forEach(function (semi) { out[semi] = quantize(midpoint(out[semi-1], out[semi+1])); });
      intervalCache[key] = Object.freeze(out);
    }
    return intervalCache[key].slice();
  }
  function noteColors(colors) { return intervals(naturals.map(function (semi) { return colors[semi]; })); }
  function sample(note, root, mode, degrees, notes) {
    var pitch = pc(note), tonic = pc(root);
    if (pitch == null || tonic == null) return null;
    var relative = mod(pitch - tonic), color = mode === 'note' ? noteColors(notes)[pitch] : intervals(degrees)[relative];
    return { pc: pitch, interval: relative, color: color, velocity: nearest(color), label: labels[relative] };
  }
  var api = Object.freeze({ table: Object.freeze(table), pc: pc, rgb: rgb, nearest: nearest,
    quantize: quantize, mapped: mapped, notes: noteColors, midpoint: midpoint, intervals: intervals, sample: sample,
    naturals: Object.freeze(naturals), labels: Object.freeze(labels) });
  if (typeof window !== 'undefined') window.SLNotePalette = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
