#!/usr/bin/env node
/* soundLAB Helix Stadium bridge — the Stadium's editor protocol, opened to the
 * browser.
 *
 * A Helix Stadium / Stadium XL talks to its editor over the network (not over
 * USB): three ZeroMQ sockets carrying OSC messages whose blobs are msgpack
 * (see docs/HELIX-STADIUM.md). A web page cannot open raw TCP, so this little
 * Node script (no dependencies) sits in between:
 *
 *   browser  <-- WebSocket (JSON) on 127.0.0.1:4575 -->  this bridge
 *   bridge   <-- ZMTP 3 / OSC / msgpack over TCP   -->  Helix Stadium
 *                 :2002 DEALER  commands + /status replies
 *                 :2001 SUB     change stream (edit buffer, properties, heartbeat)
 *                 :2003 SUB     DSP telemetry (tuner pitch, meters)
 *
 * Run:  node tools/helix-bridge.js                 (finds p35x1.local / mDNS)
 *       node tools/helix-bridge.js 192.168.1.23    (a known address)
 *       node tools/helix-bridge.js --port 4575 --defs tools/helix-defs.json -v
 *
 * Wire JSON (browser -> bridge):
 *   {op:'rpc', addr:'/ProductInfoGet', args:[['i', 7]]}      send on :2002
 *       arg = [tag, value]; tags i f h s b; a blob value is {b64} or {msgpack: obj}
 *   {op:'telemetry', level:'off'|'tuner'|'all'}              what of :2003 to relay
 *   {op:'lookup', models:[758, 310]}                          model/param names
 *   {op:'host', host:'192.168.1.23'}                          reconnect elsewhere
 *   {op:'status'}
 * (bridge -> browser):
 *   {op:'msg', port, addr, tags, args}   every frame; blob args are {b64, dec}
 *                                        (dec = decoded msgpack, 4CC keys as text)
 *   {op:'status', host, ip, ports:{2001,2002,2003}, defs, version}
 *   {op:'defs', models:{id:{name, category, params}}}
 *   {op:'error', text}
 *
 * SAFETY: the device has no authentication; this bridge listens on the loopback
 * address only, so only pages on this computer can reach it. Everything the
 * page sends goes to the device as-is.
 */
'use strict';

var net = require('net');
var http = require('http');
var crypto = require('crypto');
var dns = require('dns');
var dgram = require('dgram');
var fs = require('fs');
var path = require('path');
var EventEmitter = require('events');

var VERSION = '0.1.0';
var DEFAULT_HOST = 'p35x1.local';
var MDNS_SERVICE = '_stadiumserver._tcp.local';

// ---- command line ---------------------------------------------------------
var argv = process.argv.slice(2);
var opt = { host: null, port: 4575, defs: path.join(__dirname, 'helix-defs.json'), verbose: false };
for (var ai = 0; ai < argv.length; ai++) {
  var a = argv[ai];
  if (a === '--port' || a === '-p') opt.port = parseInt(argv[++ai], 10) || 4575;
  else if (a === '--defs') opt.defs = argv[++ai];
  else if (a === '-v' || a === '--verbose') opt.verbose = true;
  else if (a === '-h' || a === '--help') {
    console.log('usage: node tools/helix-bridge.js [device-host-or-ip] [--port 4575] [--defs tools/helix-defs.json] [-v]');
    process.exit(0);
  } else opt.host = a;
}
function log() { console.log.apply(console, [new Date().toISOString().slice(11, 19)].concat([].slice.call(arguments))); }
function dbg() { if (opt.verbose) log.apply(null, arguments); }

// ---- msgpack ----------------------------------------------------------------
// Line 6 packs 4-character tags as uint32 map keys ("cg__", "sfg_", ...); any
// integer key whose four big-endian bytes are printable ASCII is shown as text.
function fourcc(n) {
  if (n < 0x20202020 || n > 0x7e7e7e7e) return null;
  var s = '';
  for (var i = 3; i >= 0; i--) { var c = (n >>> (i * 8)) & 0xff; if (c < 0x20 || c > 0x7e) return null; s += String.fromCharCode(c); }
  return s;
}
function mpDecode(buf, pos) {
  var b = buf[pos], v, n, i, out;
  if (b <= 0x7f) return [b, pos + 1];
  if (b >= 0xe0) return [b - 256, pos + 1];
  if (b >= 0xa0 && b <= 0xbf) { n = b & 0x1f; return [buf.toString('utf8', pos + 1, pos + 1 + n), pos + 1 + n]; }
  if (b >= 0x90 && b <= 0x9f) return mpArray(buf, pos + 1, b & 0x0f);
  if (b >= 0x80 && b <= 0x8f) return mpMap(buf, pos + 1, b & 0x0f);
  switch (b) {
    case 0xc0: return [null, pos + 1];
    case 0xc2: return [false, pos + 1];
    case 0xc3: return [true, pos + 1];
    case 0xc4: n = buf[pos + 1]; return [{ b64: buf.toString('base64', pos + 2, pos + 2 + n) }, pos + 2 + n];
    case 0xc5: n = buf.readUInt16BE(pos + 1); return [{ b64: buf.toString('base64', pos + 3, pos + 3 + n) }, pos + 3 + n];
    case 0xc6: n = buf.readUInt32BE(pos + 1); return [{ b64: buf.toString('base64', pos + 5, pos + 5 + n) }, pos + 5 + n];
    case 0xc7: n = buf[pos + 1]; return [{ ext: buf.readInt8(pos + 2), b64: buf.toString('base64', pos + 3, pos + 3 + n) }, pos + 3 + n];
    case 0xc8: n = buf.readUInt16BE(pos + 1); return [{ ext: buf.readInt8(pos + 3), b64: buf.toString('base64', pos + 4, pos + 4 + n) }, pos + 4 + n];
    case 0xc9: n = buf.readUInt32BE(pos + 1); return [{ ext: buf.readInt8(pos + 5), b64: buf.toString('base64', pos + 6, pos + 6 + n) }, pos + 6 + n];
    case 0xca: return [buf.readFloatBE(pos + 1), pos + 5];
    case 0xcb: return [buf.readDoubleBE(pos + 1), pos + 9];
    case 0xcc: return [buf[pos + 1], pos + 2];
    case 0xcd: return [buf.readUInt16BE(pos + 1), pos + 3];
    case 0xce: return [buf.readUInt32BE(pos + 1), pos + 5];
    case 0xcf: return [Number(buf.readBigUInt64BE(pos + 1)), pos + 9];
    case 0xd0: return [buf.readInt8(pos + 1), pos + 2];
    case 0xd1: return [buf.readInt16BE(pos + 1), pos + 3];
    case 0xd2: return [buf.readInt32BE(pos + 1), pos + 5];
    case 0xd3: return [Number(buf.readBigInt64BE(pos + 1)), pos + 9];
    case 0xd4: case 0xd5: case 0xd6: case 0xd7: case 0xd8:
      n = [1, 2, 4, 8, 16][b - 0xd4]; return [{ ext: buf.readInt8(pos + 1), b64: buf.toString('base64', pos + 2, pos + 2 + n) }, pos + 2 + n];
    case 0xd9: n = buf[pos + 1]; return [buf.toString('utf8', pos + 2, pos + 2 + n), pos + 2 + n];
    case 0xda: n = buf.readUInt16BE(pos + 1); return [buf.toString('utf8', pos + 3, pos + 3 + n), pos + 3 + n];
    case 0xdb: n = buf.readUInt32BE(pos + 1); return [buf.toString('utf8', pos + 5, pos + 5 + n), pos + 5 + n];
    case 0xdc: return mpArray(buf, pos + 3, buf.readUInt16BE(pos + 1));
    case 0xdd: return mpArray(buf, pos + 5, buf.readUInt32BE(pos + 1));
    case 0xde: return mpMap(buf, pos + 3, buf.readUInt16BE(pos + 1));
    case 0xdf: return mpMap(buf, pos + 5, buf.readUInt32BE(pos + 1));
  }
  throw new Error('msgpack: bad byte 0x' + b.toString(16) + ' at ' + pos);
}
function mpArray(buf, pos, n) { var out = [], r; for (var i = 0; i < n; i++) { r = mpDecode(buf, pos); out.push(r[0]); pos = r[1]; } return [out, pos]; }
function mpMap(buf, pos, n) {
  var out = {}, k, r;
  for (var i = 0; i < n; i++) {
    r = mpDecode(buf, pos); k = r[0]; pos = r[1];
    if (typeof k === 'number' && Number.isInteger(k)) { var t = fourcc(k); k = t !== null ? t : String(k); } else if (typeof k !== 'string') k = JSON.stringify(k);
    r = mpDecode(buf, pos); out[k] = r[0]; pos = r[1];
  }
  return [out, pos];
}
function mpEncode(v, parts) {
  var b;
  if (v === null || v === undefined) parts.push(Buffer.from([0xc0]));
  else if (v === true) parts.push(Buffer.from([0xc3]));
  else if (v === false) parts.push(Buffer.from([0xc2]));
  else if (typeof v === 'number') {
    if (Number.isInteger(v) && v >= -2147483648 && v <= 4294967295) {
      if (v >= 0 && v <= 127) parts.push(Buffer.from([v]));
      else if (v < 0 && v >= -32) parts.push(Buffer.from([v & 0xff]));
      else if (v >= 0 && v <= 0xff) parts.push(Buffer.from([0xcc, v]));
      else if (v >= 0 && v <= 0xffff) { b = Buffer.alloc(3); b[0] = 0xcd; b.writeUInt16BE(v, 1); parts.push(b); }
      else if (v >= 0) { b = Buffer.alloc(5); b[0] = 0xce; b.writeUInt32BE(v, 1); parts.push(b); }
      else if (v >= -128) { b = Buffer.alloc(2); b[0] = 0xd0; b.writeInt8(v, 1); parts.push(b); }
      else if (v >= -32768) { b = Buffer.alloc(3); b[0] = 0xd1; b.writeInt16BE(v, 1); parts.push(b); }
      else { b = Buffer.alloc(5); b[0] = 0xd2; b.writeInt32BE(v, 1); parts.push(b); }
    } else { b = Buffer.alloc(9); b[0] = 0xcb; b.writeDoubleBE(v, 1); parts.push(b); }
  } else if (typeof v === 'string') {
    var s = Buffer.from(v, 'utf8');
    if (s.length < 32) parts.push(Buffer.from([0xa0 | s.length]));
    else if (s.length < 256) parts.push(Buffer.from([0xd9, s.length]));
    else { b = Buffer.alloc(3); b[0] = 0xda; b.writeUInt16BE(s.length, 1); parts.push(b); }
    parts.push(s);
  } else if (Buffer.isBuffer(v)) {
    if (v.length < 256) parts.push(Buffer.from([0xc4, v.length]));
    else if (v.length < 65536) { b = Buffer.alloc(3); b[0] = 0xc5; b.writeUInt16BE(v.length, 1); parts.push(b); }
    else { b = Buffer.alloc(5); b[0] = 0xc6; b.writeUInt32BE(v.length, 1); parts.push(b); }
    parts.push(v);
  } else if (Array.isArray(v)) {
    if (v.length < 16) parts.push(Buffer.from([0x90 | v.length]));
    else { b = Buffer.alloc(3); b[0] = 0xdc; b.writeUInt16BE(v.length, 1); parts.push(b); }
    v.forEach(function (x) { mpEncode(x, parts); });
  } else if (typeof v === 'object') {
    if (typeof v.b64 === 'string' && Object.keys(v).length === 1) return mpEncode(Buffer.from(v.b64, 'base64'), parts);
    var keys = Object.keys(v);
    if (keys.length < 16) parts.push(Buffer.from([0x80 | keys.length]));
    else { b = Buffer.alloc(3); b[0] = 0xde; b.writeUInt16BE(keys.length, 1); parts.push(b); }
    keys.forEach(function (k) { mpEncode(k, parts); mpEncode(v[k], parts); });
  } else throw new Error('msgpack: cannot encode ' + typeof v);
  return parts;
}
function msgpack(v) { return Buffer.concat(mpEncode(v, [])); }

var MAGIC_EB = Buffer.from('_sbepgsm');            // edit-buffer content
var MAGIC_STORED = Buffer.from('ffffffff70677370', 'hex'); // "\xff\xff\xff\xffpgsm" stored preset
function decodeBlob(buf) {
  if (!buf.length) return null;
  var head8 = buf.slice(0, 8);
  try {
    if (head8.equals(MAGIC_EB) || head8.equals(MAGIC_STORED)) return { magic: head8.equals(MAGIC_EB) ? 'editbuffer' : 'stored', body: mpDecode(buf, 8)[0] };
    if (buf.length >= 4 && buf.readUInt32BE(0) === buf.length - 4) return mpDecode(buf, 4)[0];
    var r = mpDecode(buf, 0);
    return r[1] === buf.length ? r[0] : r[0];
  } catch (e) {
    // some blobs carry a text magic of their own (e.g. "lavppgsm" + msgpack)
    try { if (/^[a-z_]{8}$/.test(head8.toString('latin1'))) return { magic: head8.toString('latin1'), body: mpDecode(buf, 8)[0] }; } catch (e2) { /* fall through */ }
    return null;
  }
}

// ---- OSC ----------------------------------------------------------------------
function pad4(n) { return (n + 3) & ~3; }
function oscStr(s) { var b = Buffer.from(String(s), 'utf8'); var o = Buffer.alloc(pad4(b.length + 1)); b.copy(o); return o; }
function oscEncode(addr, args) {
  var tags = ',', body = [];
  args.forEach(function (a) {
    var t = a[0], v = a[1], b;
    tags += t;
    if (t === 'i') { b = Buffer.alloc(4); b.writeInt32BE(v | 0); body.push(b); }
    else if (t === 'f') { b = Buffer.alloc(4); b.writeFloatBE(+v); body.push(b); }
    else if (t === 'h') { b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(Math.trunc(v))); body.push(b); }
    else if (t === 'd') { b = Buffer.alloc(8); b.writeDoubleBE(+v); body.push(b); }
    else if (t === 's') body.push(oscStr(v));
    else if (t === 'b') {
      var raw = Buffer.isBuffer(v) ? v : (v && typeof v.b64 === 'string') ? Buffer.from(v.b64, 'base64') : (v && v.msgpack !== undefined) ? msgpack(v.msgpack) : Buffer.alloc(0);
      b = Buffer.alloc(4 + pad4(raw.length)); b.writeInt32BE(raw.length); raw.copy(b, 4); body.push(b);
    } else if (t === 'T' || t === 'F' || t === 'N') { /* no payload */ }
    else throw new Error('osc: unknown tag ' + t);
  });
  return Buffer.concat([oscStr(addr), oscStr(tags)].concat(body));
}
function oscDecode(buf, off) {
  var p = off, e = buf.indexOf(0, p); if (e < 0) throw new Error('osc: no address');
  var addr = buf.toString('utf8', p, e); p = off + pad4(addr.length + 1);
  if (addr[0] !== '/') throw new Error('osc: bad address');
  var args = [], tags = '';
  if (p < buf.length && buf[p] === 0x2c) {
    e = buf.indexOf(0, p); tags = buf.toString('utf8', p + 1, e); p += pad4(tags.length + 2);
    for (var i = 0; i < tags.length; i++) {
      var t = tags[i], n;
      if (t === 'i') { args.push(buf.readInt32BE(p)); p += 4; }
      else if (t === 'f') { args.push(buf.readFloatBE(p)); p += 4; }
      else if (t === 'h') { args.push(Number(buf.readBigInt64BE(p))); p += 8; }
      else if (t === 'd') { args.push(buf.readDoubleBE(p)); p += 8; }
      else if (t === 's' || t === 'S') { e = buf.indexOf(0, p); var s = buf.toString('utf8', p, e); args.push(s); p += pad4(s.length + 1); }
      else if (t === 'b') { n = buf.readInt32BE(p); p += 4; var raw = buf.slice(p, p + n); p += pad4(n); args.push({ b64: raw.toString('base64'), dec: decodeBlob(raw), size: n }); }
      else if (t === 'T') args.push(true); else if (t === 'F') args.push(false); else if (t === 'N') args.push(null);
      else { args.push(null); }
    }
  }
  return { addr: addr, tags: tags, args: args, end: p };
}

// ---- ZMTP 3 client (NULL mechanism) ---------------------------------------
function Zmtp(host, port, type) {
  EventEmitter.call(this);
  this.host = host; this.port = port; this.type = type;
  this.sock = null; this.buf = Buffer.alloc(0); this.stage = 0; this.parts = []; this.ready = false;
}
Zmtp.prototype = Object.create(EventEmitter.prototype);
Zmtp.prototype.connect = function () {
  var self = this;
  self.close();
  self.buf = Buffer.alloc(0); self.stage = 0; self.parts = []; self.ready = false;
  var s = self.sock = net.connect({ host: self.host, port: self.port });
  s.setNoDelay(true);
  s.setTimeout(20000);
  s.on('connect', function () {
    var g = Buffer.alloc(64); g[0] = 0xff; g[9] = 0x7f; g[10] = 3; g[11] = 1; g.write('NULL', 12, 'ascii');
    s.write(g);
  });
  s.on('data', function (d) { self.buf = Buffer.concat([self.buf, d]); try { self.parse(); } catch (e) { self.emit('error', e); s.destroy(); } });
  s.on('timeout', function () { if (self.type === 'DEALER' && self.ready) { /* idle is fine on the RPC socket */ s.setTimeout(20000); } });
  s.on('error', function (e) { self.emit('error', e); });
  s.on('close', function () { var was = self.ready; self.ready = false; self.sock = null; self.emit('close', was); });
};
Zmtp.prototype.close = function () { if (this.sock) { try { this.sock.destroy(); } catch (e) { /* ok */ } this.sock = null; } this.ready = false; };
Zmtp.prototype.command = function (name, body) {
  var nb = Buffer.from(name, 'ascii');
  var payload = Buffer.concat([Buffer.from([nb.length]), nb, body || Buffer.alloc(0)]);
  this.rawFrame(0x04, payload);
};
Zmtp.prototype.rawFrame = function (flags, payload) {
  if (!this.sock) return false;
  var h;
  if (payload.length < 256) h = Buffer.from([flags, payload.length]);
  else { h = Buffer.alloc(9); h[0] = flags | 0x02; h.writeBigUInt64BE(BigInt(payload.length), 1); }
  this.sock.write(Buffer.concat([h, payload]));
  return true;
};
Zmtp.prototype.send = function (payload) { return this.ready && this.rawFrame(0x00, payload); };
Zmtp.prototype.parse = function () {
  for (;;) {
    if (this.stage === 0) {
      if (this.buf.length < 64) return;
      if (this.buf[0] !== 0xff || this.buf[9] !== 0x7f) throw new Error('not a ZMTP peer');
      this.buf = this.buf.slice(64); this.stage = 1;
      var name = Buffer.from('Socket-Type'), val = Buffer.from(this.type);
      this.command('READY', Buffer.concat([Buffer.from([name.length]), name, Buffer.from([0, 0, 0, val.length]), val]));
      continue;
    }
    if (this.buf.length < 2) return;
    var flags = this.buf[0], size, hl;
    if (flags & 0x02) { if (this.buf.length < 9) return; size = Number(this.buf.readBigUInt64BE(1)); hl = 9; } else { size = this.buf[1]; hl = 2; }
    if (this.buf.length < hl + size) return;
    var body = this.buf.slice(hl, hl + size);
    this.buf = this.buf.slice(hl + size);
    if (flags & 0x04) { // command
      var cname = body.toString('ascii', 1, 1 + body[0]);
      if (cname === 'READY' && this.stage === 1) {
        this.stage = 2; this.ready = true;
        if (this.type === 'SUB') this.rawFrame(0x00, Buffer.from([0x01])); // subscribe to everything (ZMTP 3.0 style)
        this.emit('ready');
      } else if (cname === 'PING') { // ZMTP 3.1 heartbeat: echo the context back as PONG
        this.command('PONG', body.slice(1 + body[0] + 2));
      } else if (cname === 'ERROR') {
        this.emit('error', new Error('peer error: ' + body.toString('utf8', 1 + body[0] + 1)));
      }
      continue;
    }
    this.parts.push(body);
    if (!(flags & 0x01)) { var m = this.parts; this.parts = []; this.emit('message', m); }
  }
};

// ---- the device ---------------------------------------------------------------
var device = {
  host: opt.host || DEFAULT_HOST, ip: null, socks: {}, timer: null, stopped: false,
  ports: { 2002: 'DEALER', 2001: 'SUB', 2003: 'SUB' }
};
function portState() { var o = {}; Object.keys(device.ports).forEach(function (p) { o[p] = !!(device.socks[p] && device.socks[p].ready); }); return o; }

function resolveHost(host, cb) {
  if (net.isIP(host)) return cb(null, host);
  dns.lookup(host, { family: 4 }, function (err, addr) {
    if (!err && addr) return cb(null, addr);
    if (host !== DEFAULT_HOST) return cb(err || new Error('unresolved'));
    mdnsFind(2500, function (ip) { cb(ip ? null : new Error('no Stadium found by mDNS (' + MDNS_SERVICE + ')'), ip); });
  });
}
// one-shot mDNS PTR query for the Stadium's service; the device answers with
// PTR + SRV + A in one datagram (port 2001 in the SRV is the change stream).
function mdnsFind(ms, cb) {
  var done = false, sock;
  try { sock = dgram.createSocket({ type: 'udp4', reuseAddr: true }); } catch (e) { return cb(null); }
  function finish(ip) { if (done) return; done = true; try { sock.close(); } catch (e) { /* ok */ } cb(ip); }
  var labels = MDNS_SERVICE.split('.').map(function (l) { return Buffer.concat([Buffer.from([l.length]), Buffer.from(l)]); });
  var q = Buffer.concat([Buffer.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0])].concat(labels, [Buffer.from([0, 0, 12, 0, 1])]));
  sock.on('message', function (msg) {
    try {
      var ips = parseMdnsA(msg);
      if (ips.length) finish(ips[0]);
    } catch (e) { /* ignore a malformed answer */ }
  });
  sock.on('error', function () { finish(null); });
  sock.bind(0, function () {
    try { sock.setMulticastTTL(255); } catch (e) { /* ok */ }
    sock.send(q, 0, q.length, 5353, '224.0.0.251', function (err) { if (err) finish(null); });
    setTimeout(function () { finish(null); }, ms);
  });
}
function parseMdnsA(msg) {
  var qd = msg.readUInt16BE(4), an = msg.readUInt16BE(6), ns = msg.readUInt16BE(8), ar = msg.readUInt16BE(10), p = 12, ips = [];
  function name(pos) { // returns [text, next]
    var out = [], jumped = false, next = pos, guard = 0;
    for (;;) {
      var l = msg[pos];
      if (l === 0) { if (!jumped) next = pos + 1; break; }
      if ((l & 0xc0) === 0xc0) { if (!jumped) next = pos + 2; pos = ((l & 0x3f) << 8) | msg[pos + 1]; jumped = true; if (++guard > 20) break; continue; }
      out.push(msg.toString('utf8', pos + 1, pos + 1 + l)); pos += 1 + l;
    }
    return [out.join('.'), next];
  }
  for (var i = 0; i < qd; i++) { p = name(p)[1] + 4; }
  var total = an + ns + ar;
  for (var r = 0; r < total && p < msg.length; r++) {
    var nm = name(p); p = nm[1];
    var type = msg.readUInt16BE(p), rdlen = msg.readUInt16BE(p + 8); p += 10;
    if (type === 1 && rdlen === 4) ips.push(msg[p] + '.' + msg[p + 1] + '.' + msg[p + 2] + '.' + msg[p + 3]);
    p += rdlen;
  }
  return ips;
}

function connectDevice() {
  if (device.stopped) return;
  resolveHost(device.host, function (err, ip) {
    if (err || !ip) { log('device: cannot resolve', device.host, '-', err && err.message, '(retrying)'); broadcastStatus(); return scheduleReconnect(); }
    if (ip !== device.ip) log('device:', device.host, '->', ip);
    device.ip = ip;
    Object.keys(device.ports).forEach(function (p) {
      if (device.socks[p] && (device.socks[p].ready || device.socks[p].sock)) return;
      var z = device.socks[p] = new Zmtp(ip, +p, device.ports[p]);
      z.on('ready', function () { log('device: port', p, device.ports[p], 'ready'); broadcastStatus(); });
      z.on('message', function (frames) { onDeviceMessage(+p, frames); });
      z.on('error', function (e) { dbg('device: port', p, 'error', e.message); });
      z.on('close', function (was) { if (was) log('device: port', p, 'closed'); broadcastStatus(); scheduleReconnect(); });
      z.connect();
    });
  });
}
function scheduleReconnect() { if (device.timer || device.stopped) return; device.timer = setTimeout(function () { device.timer = null; connectDevice(); }, 4000); }
function setHost(h) {
  device.host = h || DEFAULT_HOST; device.ip = null;
  Object.keys(device.socks).forEach(function (p) { device.socks[p].close(); });
  device.socks = {};
  connectDevice();
}

// A ZMQ message is one or more frames. :2001 prefixes a small sequence frame
// (no "/") before the OSC frame; a long OSC packet may also be split across
// frames of one message — so drop any leading non-OSC frames and join the rest.
function onDeviceMessage(port, frames) {
  var i = 0;
  while (i < frames.length && frames[i][0] !== 0x2f) i++;
  if (i >= frames.length) return;
  var buf = frames.length - i === 1 ? frames[i] : Buffer.concat(frames.slice(i));
  var m;
  try { m = oscDecode(buf, 0); } catch (e) { dbg('port', port, 'undecodable frame', e.message); return; }
  var msg = { op: 'msg', port: port, addr: m.addr, tags: m.tags, args: m.args };
  if (port === 2003) {
    var kind = m.addr === '/dspEvent' ? dspKind(m.args) : 'all';
    msg.kind = kind;
    clients.forEach(function (c) { if (c.telemetry === 'all' || (c.telemetry === 'tuner' && kind === 'tuner')) c.sendJSON(msg); });
    return;
  }
  if (opt.verbose && m.addr !== '/heartbeat') dbg('<-', port, m.addr, m.tags, JSON.stringify(m.args.map(function (a) { return a && a.b64 !== undefined ? '[blob ' + a.size + ']' : a; })));
  broadcast(msg);
}
function dspKind(args) { // tuner = {id__:{eid_:10}} single float; meters = eid 1 arrays
  var b = args[1] && args[1].dec !== undefined ? args[1].dec : (args[0] && args[0].dec);
  var id = b && b.id__;
  if (id && id.eid_ === 10) return 'tuner';
  if (id && id.eid_ === 1) return 'meter';
  return 'event';
}

// ---- model / param names (tools/helix-defs.json) ---------------------------------
var defs = null;
try {
  defs = JSON.parse(fs.readFileSync(opt.defs, 'utf8'));
  log('defs:', Object.keys(defs.model_names || {}).length, 'models from', path.relative(process.cwd(), opt.defs) || opt.defs);
} catch (e) { log('defs: none (' + e.message + ') - blocks will show numeric ids'); }
function lookupModels(ids) {
  var out = {};
  (ids || []).forEach(function (id) {
    var key = String(id), name = defs && defs.model_names && defs.model_names[key];
    if (!name) { out[key] = null; return; }
    var cat = defs.catalog && defs.catalog[name];
    out[key] = { name: name, category: cat ? cat.category_name : null, params: (defs.model_params && defs.model_params[key]) || {} };
  });
  return out;
}

// ---- WebSocket server (RFC 6455, text frames) ------------------------------------
var clients = [];
var WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
function statusJSON() { return { op: 'status', version: VERSION, host: device.host, ip: device.ip, ports: portState(), defs: !!defs, clients: clients.length }; }
function broadcast(o) { var s = JSON.stringify(o); clients.forEach(function (c) { c.sendText(s); }); }
function broadcastStatus() { broadcast(statusJSON()); }

var server = http.createServer(function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(statusJSON()));
});
server.on('upgrade', function (req, socket) {
  var key = req.headers['sec-websocket-key'];
  if (!key || !/websocket/i.test(req.headers.upgrade || '')) { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
  var accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  var c = { socket: socket, buf: Buffer.alloc(0), frag: [], fragOp: 0, telemetry: 'off', origin: req.headers.origin || '' };
  c.sendText = function (s) {
    if (socket.destroyed) return;
    var p = Buffer.from(s, 'utf8'), h;
    if (p.length < 126) h = Buffer.from([0x81, p.length]);
    else if (p.length < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(p.length, 2); }
    else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(p.length), 2); }
    socket.write(Buffer.concat([h, p]));
  };
  c.sendJSON = function (o) { c.sendText(JSON.stringify(o)); };
  clients.push(c);
  log('page connected', c.origin, '(' + clients.length + ' client' + (clients.length === 1 ? '' : 's') + ')');
  c.sendJSON(statusJSON());
  socket.setNoDelay(true);
  socket.on('data', function (d) { c.buf = Buffer.concat([c.buf, d]); try { wsParse(c); } catch (e) { log('ws parse error', e.message); socket.destroy(); } });
  socket.on('close', function () { clients = clients.filter(function (x) { return x !== c; }); log('page disconnected (' + clients.length + ' left)'); });
  socket.on('error', function () { /* close follows */ });
});
function wsParse(c) {
  for (;;) {
    var b = c.buf; if (b.length < 2) return;
    var fin = b[0] & 0x80, opc = b[0] & 0x0f, masked = b[1] & 0x80, len = b[1] & 0x7f, p = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); p = 4; }
    else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); p = 10; }
    var mask = null; if (masked) { if (b.length < p + 4) return; mask = b.slice(p, p + 4); p += 4; }
    if (b.length < p + len) return;
    var payload = Buffer.from(b.slice(p, p + len));
    c.buf = b.slice(p + len);
    if (mask) for (var i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    if (opc === 0x8) { try { c.socket.end(Buffer.from([0x88, 0])); } catch (e) { /* ok */ } return; }
    if (opc === 0x9) { c.socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); continue; }
    if (opc === 0xa) continue;
    if (opc === 0x1 || opc === 0x2) { c.fragOp = opc; c.frag = [payload]; } else if (opc === 0x0) c.frag.push(payload); else continue;
    if (!fin) continue;
    var text = Buffer.concat(c.frag).toString('utf8'); c.frag = [];
    if (c.fragOp === 0x1) onClient(c, text);
  }
}
function onClient(c, text) {
  var m;
  try { m = JSON.parse(text); } catch (e) { return c.sendJSON({ op: 'error', text: 'bad JSON' }); }
  switch (m.op) {
    case 'rpc': {
      var z = device.socks[2002];
      if (!z || !z.ready) return c.sendJSON({ op: 'error', text: 'device not connected', addr: m.addr });
      if (typeof m.addr !== 'string' || m.addr[0] !== '/') return c.sendJSON({ op: 'error', text: 'rpc needs an address' });
      var args = Array.isArray(m.args) ? m.args : [];
      try {
        var pkt = oscEncode(m.addr, args);
        z.send(pkt);
        if (opt.verbose) dbg('->', 2002, m.addr, JSON.stringify(args));
      } catch (e) { c.sendJSON({ op: 'error', text: 'encode: ' + e.message, addr: m.addr }); }
      break;
    }
    case 'telemetry':
      c.telemetry = m.level === 'all' ? 'all' : m.level === 'tuner' ? 'tuner' : 'off';
      c.sendJSON({ op: 'telemetry', level: c.telemetry });
      break;
    case 'lookup':
      c.sendJSON({ op: 'defs', models: lookupModels(m.models) });
      break;
    case 'host':
      log('page asks for host', m.host);
      setHost(String(m.host || '').trim());
      break;
    case 'status':
      c.sendJSON(statusJSON());
      break;
    default:
      c.sendJSON({ op: 'error', text: 'unknown op ' + m.op });
  }
}

server.listen(opt.port, '127.0.0.1', function () {
  log('soundLAB Helix bridge v' + VERSION + ' listening on ws://127.0.0.1:' + opt.port + '  (Ctrl+C to stop)');
  connectDevice();
});
server.on('error', function (e) { log('cannot listen on 127.0.0.1:' + opt.port + ' - ' + e.message); process.exit(1); });
process.on('SIGINT', function () { device.stopped = true; Object.keys(device.socks).forEach(function (p) { device.socks[p].close(); }); server.close(); process.exit(0); });
