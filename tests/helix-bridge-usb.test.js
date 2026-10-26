// tools/helix-bridge.js TRANSPORT DISCOVERY (the Helix Stadium's firmware-1.4 USB
// network link): pure Node, no browser - `node tests/helix-bridge-usb.test.js`.
// The bridge required as a module must open nothing; usbCandidates() reads an
// os.networkInterfaces()-shaped table (ULA <prefix>::1 first, fe80::1%zone after,
// ::1-of-the-prefix / non-ULA / internal / IPv4 skipped); probeTcp() against a
// local server and a closed port; discoverUsb() with injected candidates +
// adapters against a local server; the 5 s scan cache; statusJSON()'s transport
// fields; and one LIVE bridge (spawned on a free port with a manual host, prefer
// net) answering HTTP status + the {op:'transport'} / {op:'status'} ops over a
// hand-rolled WebSocket client.
'use strict';
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const { spawn } = require('child_process');

let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
function eq(a, b, msg) { const j = JSON.stringify; ok(j(a) === j(b), msg + (j(a) === j(b) ? '' : ' - got ' + j(a) + ', want ' + j(b))); }
const BRIDGE = path.join(__dirname, '..', 'tools', 'helix-bridge.js');

function refused(port, host) { // true when nothing listens there
  return new Promise(res => {
    const s = net.connect({ host: host || '127.0.0.1', port });
    s.once('connect', () => { s.destroy(); res(false); });
    s.once('error', () => res(true));
    s.setTimeout(1500, () => { s.destroy(); res(true); });
  });
}
function listen(host) { // a throwaway TCP server -> {server, port, host}
  return new Promise((res, rej) => {
    const srv = net.createServer(s => s.end());
    srv.once('error', rej);
    srv.listen(0, host, () => res({ server: srv, port: srv.address().port, host }));
  });
}
function freePort() { return listen('127.0.0.1').then(l => new Promise(res => l.server.close(() => res(l.port)))); }
function wait(ms) { return new Promise(res => setTimeout(res, ms)); }

// minimal RFC 6455 client (text frames only; server frames come unmasked)
function wsConnect(port) {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const s = net.connect(port, '127.0.0.1');
    let buf = Buffer.alloc(0), up = false;
    const msgs = [], waiters = [];
    const push = m => { if (waiters.length) waiters.shift()(m); else msgs.push(m); };
    const api = {
      send(o) {
        const p = Buffer.from(JSON.stringify(o)), mask = crypto.randomBytes(4), m = Buffer.from(p);
        for (let i = 0; i < m.length; i++) m[i] ^= mask[i & 3];
        let h;
        if (p.length < 126) h = Buffer.from([0x81, 0x80 | p.length]);
        else { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 0x80 | 126; h.writeUInt16BE(p.length, 2); }
        s.write(Buffer.concat([h, mask, m]));
      },
      next(ms) { return new Promise((res, rej) => { if (msgs.length) return res(msgs.shift()); const t = setTimeout(() => rej(new Error('ws timeout')), ms); waiters.push(m => { clearTimeout(t); res(m); }); }); },
      close() { s.destroy(); }
    };
    s.once('error', reject);
    s.on('connect', () => { s.write('GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\nOrigin: http://127.0.0.1\r\n\r\n'); });
    s.on('data', d => {
      buf = Buffer.concat([buf, d]);
      if (!up) { const i = buf.indexOf('\r\n\r\n'); if (i < 0) return; up = /101/.test(buf.slice(0, i).toString()); if (!up) return reject(new Error('no upgrade')); buf = buf.slice(i + 4); resolve(api); }
      for (;;) {
        if (buf.length < 2) return;
        const opc = buf[0] & 0x0f; let len = buf[1] & 0x7f, p = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); p = 4; } else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); p = 10; }
        if (buf.length < p + len) return;
        const body = buf.slice(p, p + len); buf = buf.slice(p + len);
        if (opc === 0x1) { try { push(JSON.parse(body.toString('utf8'))); } catch (e) { /* not JSON */ } }
      }
    });
  });
}
function httpJSON(port) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port, path: '/' }, r => { let t = ''; r.on('data', d => { t += d; }); r.on('end', () => { try { res(JSON.parse(t)); } catch (e) { rej(e); } }); }).on('error', rej);
  });
}

async function main() {
  // ---- 1. require() opens nothing -------------------------------------------------
  console.log('require as a module');
  const wasFree = await refused(4575);
  if (!wasFree) console.log('  SKIP 4575 is already in use on this machine (a bridge running?) - the no-listen check cannot tell');
  const b = require(BRIDGE);
  await wait(50);
  if (wasFree) ok(await refused(4575), 'nothing listens on 127.0.0.1:4575 after require()');
  ok(b.device.socks && Object.keys(b.device.socks).length === 0 && b.device.gen === 0, 'no device connection attempted');
  ok(b.opt.host === null && b.opt.prefer === 'auto', 'command line not parsed (the test file is not taken as a host)');
  ['usbCandidates', 'probeTcp', 'discoverUsb', 'usbScan', 'parseAdapters', 'matchAdapter', 'ip6Groups', 'ip6Prefix64', 'pickAddress', 'resolveHost', 'statusJSON', 'msgpack', 'mpDecode', 'oscEncode', 'oscDecode'].forEach(k => ok(typeof b[k] === 'function', 'exports ' + k));
  ok(b.VERSION === '0.2.0', 'bridge VERSION 0.2.0');

  // ---- 2. IPv6 helpers ----------------------------------------------------------------
  console.log('IPv6 helpers');
  eq(b.ip6Groups('fd12:3456:789a:1::2'), [0xfd12, 0x3456, 0x789a, 1, 0, 0, 0, 2], 'ip6Groups expands ::');
  eq(b.ip6Groups('fe80::1%13'), [0xfe80, 0, 0, 0, 0, 0, 0, 1], 'ip6Groups drops the zone');
  eq(b.ip6Groups('192.168.1.1'), null, 'ip6Groups rejects IPv4');
  eq(b.ip6Groups('::ffff:1.2.3.4'), null, 'ip6Groups rejects IPv4-mapped');
  eq(b.ip6Groups('fd12:::1'), null, 'ip6Groups rejects a bad text');
  eq(b.ip6Prefix64('fd00:0:0:1::2'), 'fd00:0:0:1', 'ip6Prefix64 keeps zero groups');
  eq(b.ip6Prefix64('fd25:bc54:210:b720:c0bb:66ff:ade6:8d77'), 'fd25:bc54:210:b720', 'ip6Prefix64 of a full address');
  eq(b.pickAddress([{ address: '::1', family: 6 }, { address: '127.0.0.1', family: 4 }]), '127.0.0.1', 'pickAddress prefers IPv4');
  eq(b.pickAddress([{ address: 'fe80::1', family: 6 }, { address: 'fd12::5', family: 6 }]), 'fd12::5', 'pickAddress takes a routable IPv6, never a bare link-local');
  eq(b.pickAddress([]), null, 'pickAddress of nothing is null');
  await new Promise(res => b.resolveHost('fd12:3456:789a:1::1', (err, ip) => { ok(!err && ip === 'fd12:3456:789a:1::1', 'resolveHost passes an IPv6 literal through'); res(); }));
  await new Promise(res => b.resolveHost('fe80::1%13', (err, ip) => { ok(!err && ip === 'fe80::1%13', 'resolveHost passes a zoned link-local literal through'); res(); }));

  // ---- 3. usbCandidates ------------------------------------------------------------------
  console.log('usbCandidates');
  const table = {
    'Ethernet 3': [
      { address: 'fd12:3456:789a:1::2', netmask: 'ffff:ffff:ffff:ffff::', family: 'IPv6', internal: false, scopeid: 0 },
      { address: 'fe80::aaaa:bbbb:cccc:dddd', family: 'IPv6', internal: false, scopeid: 7 },
      { address: '169.254.1.2', family: 'IPv4', internal: false }
    ],
    'Wi-Fi': [
      { address: '2001:db8:1:2::5', family: 'IPv6', internal: false, scopeid: 0 },
      { address: 'fe80::1111:2222:3333:4444', family: 'IPv6', internal: false, scopeid: 13 },
      { address: '192.168.86.35', family: 'IPv4', internal: false }
    ],
    'Loopback Pseudo-Interface 1': [
      { address: '::1', family: 'IPv6', internal: true, scopeid: 0 },
      { address: 'fd00:dead:beef:1::9', family: 'IPv6', internal: true, scopeid: 0 },
      { address: '127.0.0.1', family: 'IPv4', internal: true }
    ]
  };
  const c = b.usbCandidates(table, 'win32');
  eq(c.length, 3, 'one ULA + two link-local candidates from the table');
  eq(c[0], { iface: 'Ethernet 3', local: 'fd12:3456:789a:1::2', candidate: 'fd12:3456:789a:1::1' }, 'ULA fd12:3456:789a:1::2 -> candidate fd12:3456:789a:1::1');
  eq(c[1], { iface: 'Ethernet 3', local: 'fe80::aaaa:bbbb:cccc:dddd', candidate: 'fe80::1%7', linkLocal: true }, 'fe80 comes after the ULA, with the numeric zone id');
  eq(c[2].candidate, 'fe80::1%13', 'the second link-local carries its own zone');
  ok(!c.some(x => /2001:db8/.test(x.candidate) || /2001:db8/.test(x.local)), 'non-ULA global addresses ignored');
  ok(!c.some(x => /dead:beef/.test(x.candidate) || x.local === '::1'), 'internal / loopback ignored');
  ok(!c.some(x => /\d+\.\d+\.\d+\.\d+/.test(x.candidate)), 'IPv4 ignored');
  eq(b.usbCandidates({ X: [{ address: 'fd12:3456:789a:1::1', family: 'IPv6', internal: false, scopeid: 0 }] }), [], 'a host that IS ::1 of the prefix is skipped');
  eq(b.usbCandidates({ Y: [{ address: 'fe80::1', family: 'IPv6', internal: false, scopeid: 3 }] }, 'win32'), [], 'a host that IS fe80::1 is skipped');
  eq(b.usbCandidates({ Z: [{ address: 'fe80::5', family: 'IPv6', internal: false, scopeid: 0 }] }, 'win32'), [], 'a link-local without a zone id is useless on Windows');
  eq(b.usbCandidates({ eth0: [{ address: 'fe80::5', family: 'IPv6', internal: false, scopeid: 2 }] }, 'linux'), [{ iface: 'eth0', local: 'fe80::5', candidate: 'fe80::1%eth0', linkLocal: true }], 'elsewhere the zone is the interface name');
  eq(b.usbCandidates({ W: [{ address: 'fd00:0:0:1::2', family: 'IPv6', internal: false, scopeid: 0 }, { address: 'fd00:0:0:1:abcd::7', family: 'IPv6', internal: false, scopeid: 0 }] }), [{ iface: 'W', local: 'fd00:0:0:1::2', candidate: 'fd00:0:0:1::1' }], 'two addresses of one /64 -> one candidate; zero groups kept');
  eq(b.usbCandidates({ V: [{ address: 'fc00:1:2:3::4', family: 6, internal: false, scopeid: 0 }] }), [{ iface: 'V', local: 'fc00:1:2:3::4', candidate: 'fc00:1:2:3::1' }], 'fc00::/7 covers fc.. too; numeric family 6 accepted');
  eq(b.usbCandidates({ U: [{ address: 'fe00:1:2:3::4', family: 'IPv6', internal: false, scopeid: 0 }] }), [], 'fe00:: is not a ULA');
  eq(b.usbCandidates(null), [], 'no table -> no candidates');

  // ---- 4. probeTcp -----------------------------------------------------------------------
  console.log('probeTcp');
  const l4 = await listen('127.0.0.1');
  let t = Date.now();
  ok(await b.probeTcp('127.0.0.1', l4.port, 800) === true, 'probeTcp -> true against a listening local port (' + (Date.now() - t) + ' ms)');
  await new Promise(res => l4.server.close(res));
  t = Date.now();
  const closed = await b.probeTcp('127.0.0.1', l4.port, 800);
  ok(closed === false && Date.now() - t < 1500, 'probeTcp -> false against the now closed port within the timeout (' + (Date.now() - t) + ' ms)');
  ok(await b.probeTcp('not an address', 1, 300) === false, 'probeTcp -> false on an unresolvable host');

  // ---- 5. adapters -----------------------------------------------------------------------
  console.log('adapters');
  const adJSON = '[{"Name":"Wi-Fi","InterfaceDescription":"Intel(R) Wi-Fi 6 AX201 160MHz","Status":"Up"},{"Name":"Ethernet 3","InterfaceDescription":"UsbNcm Host Device","Status":"Up"}]';
  const ads = b.parseAdapters(adJSON);
  eq(ads.length, 2, 'parseAdapters reads the Get-NetAdapter array');
  eq(ads[1], { name: 'Ethernet 3', description: 'UsbNcm Host Device', status: 'Up' }, 'parseAdapters maps Name / InterfaceDescription / Status');
  eq(b.parseAdapters('{"Name":"Ethernet 3","InterfaceDescription":"Line 6 Helix Stadium","Status":2}'), [{ name: 'Ethernet 3', description: 'Line 6 Helix Stadium', status: '2' }], 'a single adapter comes as a bare object');
  eq(b.parseAdapters('garbage'), [], 'bad JSON -> []');
  eq(b.parseAdapters(''), [], 'empty -> []');
  eq(b.matchAdapter(ads) && b.matchAdapter(ads).name, 'Ethernet 3', 'matchAdapter finds the NCM adapter by description');
  eq(b.matchAdapter([ads[0]]), null, 'a Wi-Fi adapter does not match');
  ['Line6 USB Ethernet', 'Helix Stadium XL', 'LINE 6 NCM'].forEach(d => ok(!!b.matchAdapter([{ name: 'x', description: d, status: '' }]), 'matches "' + d + '"'));
  ok(!!b.matchAdapter([{ name: 'Helix', description: 'Realtek USB GbE', status: '' }]), 'a renamed adapter matches by name as a fallback');

  // ---- 6. discoverUsb with injected candidates ------------------------------------------
  console.log('discoverUsb');
  let l6; try { l6 = await listen('::1'); } catch (e) { l6 = await listen('127.0.0.1'); console.log('  (no IPv6 loopback here - using 127.0.0.1 as the fake pedal)'); }
  const live = { iface: 'Ethernet 3', local: l6.host, candidate: l6.host };
  const dead = await freePort();
  t = Date.now();
  let r = await b.discoverUsb(800, { candidates: [live], adapters: ads, port: l6.port });
  ok(r && r.reachable === true && r.candidate === l6.host, 'a fake pedal answering on the candidate -> reachable true, its candidate (' + (Date.now() - t) + ' ms)');
  ok(r.present === true && r.adapter && r.adapter.name === 'Ethernet 3' && r.iface === 'Ethernet 3' && r.local === l6.host, 'present, adapter attached, iface + local carried');
  ok(typeof r.at === 'string' && r.candidates === 1 && r.linkLocal === false, 'at / candidates / linkLocal fields');
  r = await b.discoverUsb(800, { candidates: [{ iface: 'E', local: 'x', candidate: '127.0.0.1' }], adapters: [ads[0]], port: dead });
  ok(r.reachable === false && r.candidate === '127.0.0.1' && r.present === false, 'a closed candidate -> reachable false; with an adapter table (Wi-Fi only) a bare ULA is not present');
  r = await b.discoverUsb(800, { candidates: [{ iface: 'E', local: 'x', candidate: '127.0.0.1' }], adapters: [ads[1]], port: dead });
  ok(r.reachable === false && r.present === true && r.adapter.description === 'UsbNcm Host Device', 'the NCM adapter alone makes the link present (not reachable)');
  r = await b.discoverUsb(800, { candidates: [], adapters: [ads[1]], port: dead });
  ok(r.present === true && r.reachable === false && r.candidate === null && r.candidates === 0, 'no candidates but a matching adapter -> present');
  r = await b.discoverUsb(800, { candidates: [{ iface: 'E', local: 'x', candidate: '127.0.0.1' }], adapters: '', port: dead });
  ok(r.present === true, 'without an adapter table (bad / no PowerShell) a bare ULA counts as present');
  r = await b.discoverUsb(800, { candidates: [], adapters: [], port: dead });
  ok(r && r.present === false && r.reachable === false, 'nothing at all -> {present false, reachable false}');
  // priority: a link-local answer is taken only once every ULA probe failed; a ULA answer wins outright
  // (the dead ULA candidate = the OTHER loopback on the fake pedal's port, when that is free; else an unresolvable name)
  const other = l6.host === '::1' ? '127.0.0.1' : null;
  const deadUla = other && await refused(l6.port, other) ? other : 'nowhere.invalid';
  const ll = { iface: 'Ethernet 3', local: l6.host, candidate: l6.host, linkLocal: true };
  r = await b.discoverUsb(800, { candidates: [{ iface: 'E', local: 'x', candidate: deadUla }, ll], adapters: [], port: l6.port });
  ok(r.reachable === true && r.linkLocal === true && r.candidate === l6.host && r.iface === 'Ethernet 3', 'a dead ULA + a live link-local -> the link-local hit, linkLocal true');
  let dual = null; try { dual = await listen('::'); } catch (e) { /* no IPv6 */ }
  if (dual) {
    r = await b.discoverUsb(800, { candidates: [{ iface: 'E', local: 'x', candidate: '::1', linkLocal: true }, { iface: 'F', local: 'y', candidate: '127.0.0.1' }], adapters: [], port: dual.port });
    ok(r.reachable === true && r.linkLocal === false && r.candidate === '127.0.0.1' && r.iface === 'F', 'both answering (dual-stack fake) -> the ULA candidate wins over the link-local one');
    await new Promise(res => dual.server.close(res));
  } else console.log('  SKIP dual-stack priority check (no IPv6 here)');
  // the interfaces source can be injected too
  r = await b.discoverUsb(300, { ifaces: () => ({ T: [{ address: 'fd12:3456:789a:1::2', family: 'IPv6', internal: false, scopeid: 0 }] }), adapters: [], port: dead, platform: 'win32' });
  ok(r.candidates === 1 && r.candidate === 'fd12:3456:789a:1::1' && r.reachable === false, 'an injected interface table runs through usbCandidates (probe of a ULA nobody owns times out, ' + 'reachable false)');

  // ---- 7. usbScan cache + statusJSON ---------------------------------------------------
  console.log('usbScan / statusJSON');
  const src = { candidates: [live], adapters: ads, port: l6.port };
  const s1 = await b.usbScan(true, src), s2 = await b.usbScan(false, src);
  ok(s1 === s2 && s1.reachable === true, 'a second scan within 5 s returns the cached result');
  const s3 = await b.usbScan(true, src);
  ok(s3 !== s1 && s3.reachable === true, 'a forced scan runs again');
  const st = b.statusJSON();
  ok(st.op === 'status' && st.transport === null && st.prefer === 'auto', 'statusJSON: transport null while no port is up, prefer auto');
  ok(st.transports && st.transports.usb === s3 && st.transports.net && st.transports.net.host === 'p35x1.local' && st.transports.net.ip === null, 'statusJSON.transports {usb: last scan, net: {host, ip}}');
  ok(st.ports && st.ports['2002'] === false && st.host === 'p35x1.local' && st.ip === null, 'statusJSON keeps host / ip / ports');
  await new Promise(res => l6.server.close(res));

  // ---- 8. a live bridge: manual host, prefer net ----------------------------------------
  console.log('live bridge');
  const port = await freePort();
  const child = spawn(process.execPath, [BRIDGE, '127.0.0.1', '--port', String(port), '--prefer', 'net', '--defs', path.join(__dirname, 'no-such-defs.json')], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  const listening = await new Promise(res => { const t0 = Date.now(); (function poll() { if (/listening on ws:/.test(out)) return res(true); if (Date.now() - t0 > 6000 || child.exitCode !== null) return res(false); setTimeout(poll, 50); })(); });
  ok(listening, 'bridge starts and listens on ws://127.0.0.1:' + port);
  try {
    const sj = await httpJSON(port);
    ok(sj.op === 'status' && sj.version === '0.2.0' && sj.prefer === 'net' && sj.transport === null, 'HTTP status: version, prefer net, transport null (127.0.0.1 has no pedal)');
    ok(sj.transports && sj.transports.usb === null && sj.transports.net.host === '127.0.0.1', 'prefer net + manual host: USB never scanned (transports.usb null), net.host = the command-line host');
    ok(/device: 127\.0\.0\.1 \(manual\)/.test(out), 'log names the manual host');
    const ws = await wsConnect(port);
    const first = await ws.next(2000);
    ok(first.op === 'status' && first.prefer === 'net', 'WebSocket: a status greets the page');
    ws.send({ op: 'transport', want: 'usb' });
    let seen = null;
    for (let i = 0; i < 4 && !seen; i++) { const m = await ws.next(3000).catch(() => null); if (!m) break; if (m.op === 'status' && m.prefer === 'usb') seen = m; }
    ok(!!seen, '{op:transport, want:usb} -> a status with prefer usb');
    ok(/transport: prefer usb/.test(out), 'log: transport: prefer usb');
    ws.send({ op: 'transport', want: 'usb' });
    seen = null;
    for (let i = 0; i < 4 && !seen; i++) { const m = await ws.next(3000).catch(() => null); if (!m) break; if (m.op === 'status' && m.prefer === 'usb') seen = m; }
    ok(!!seen && (out.match(/transport: prefer usb/g) || []).length === 1, 'the same want again answers a status without a second transport change (the page re-sends it on every connect)');
    ws.send({ op: 'transport', want: 'bogus' });
    seen = null;
    for (let i = 0; i < 4 && !seen; i++) { const m = await ws.next(3000).catch(() => null); if (!m) break; if (m.op === 'status' && m.prefer === 'auto') seen = m; }
    ok(!!seen, 'an unknown want falls back to auto');
    ws.send({ op: 'status' });
    const sm = await ws.next(2000);
    ok(sm.op === 'status' && sm.host === '127.0.0.1' && 'transports' in sm, '{op:status} answers at once with the transport fields');
    ws.send({ op: 'telemetry', level: 'tuner' });
    let tel = null;
    for (let i = 0; i < 4 && !tel; i++) { const m = await ws.next(3000).catch(() => null); if (!m) break; if (m.op === 'telemetry') tel = m; }
    ok(tel && tel.level === 'tuner', 'the existing ops still answer (telemetry)');
    ws.close();
  } catch (e) { ok(false, 'live bridge: ' + e.message); }
  child.kill();
  await new Promise(res => { child.once('exit', res); setTimeout(res, 2000); });
  if (process.env.SL_VERBOSE) console.log(out);

  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.log('  FAIL (exception)', e && e.stack || e); process.exit(1); });
