/* soundLAB OMR: compressed MusicXML (.mxl) for the SheetLab exports (homr, github.com/liebharc/homr,
   AGPL-3.0, writes the MusicXML; this packs it). The zip has the layout music21's
   musicxml/archiveTools.compressXML writes for the engine's score.write('mxl'): the score first,
   then META-INF/container.xml naming it (same text, byte for byte). Entries are deflated with
   CompressionStream('deflate-raw') where the platform has it (browsers, workers, Node >= 18), else
   stored; CRC-32 and sizes per the zip spec. No "mimetype" entry: music21 writes none either.

   OMR.mxl = {
     write(xml, innerName = 'score.musicxml', opts) -> Promise<Uint8Array>   deflate when available
     writeStored(xml, innerName, opts)               -> Uint8Array            no compression (sync)
     read(bytes)                                     -> Promise<{files: {name: Uint8Array},
                                                         rootfile, xml}>      stored + deflate entries
     crc32(bytes) -> uint32
   }
   opts.date (a Date) fixes the entries' time stamp (default: now) for reproducible files. */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};

  // music21's container.xml (archiveTools.compressXML), including its trailing indentation
  function containerXml(name) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n<container>\n  <rootfiles>\n    <rootfile full-path="' +
      name.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '"/>\n  </rootfiles>\n</container>\n    ';
  }

  let CRC_TABLE = null;
  function crc32(bytes) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        CRC_TABLE[n] = c >>> 0;
      }
    }
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  const enc = (s) => new TextEncoder().encode(s);
  function dosTime(d) {
    const y = Math.max(1980, d.getFullYear());
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2)),
      date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
  }
  async function deflateRaw(bytes) {
    if (typeof G.CompressionStream !== 'function') return null;
    try {
      const cs = new G.CompressionStream('deflate-raw');
      const out = new G.Response(new G.Blob([bytes]).stream().pipeThrough(cs));
      return new Uint8Array(await out.arrayBuffer());
    } catch (e) { return null; } // e.g. a platform without 'deflate-raw'
  }
  async function inflateRaw(bytes) {
    if (typeof G.DecompressionStream !== 'function') throw new Error('OMR.mxl.read: no DecompressionStream for a deflated entry');
    const ds = new G.DecompressionStream('deflate-raw');
    const out = new G.Response(new G.Blob([bytes]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  }

  // entries: [{name, data (Uint8Array), comp (Uint8Array|null = stored)}]
  function zip(entries, date) {
    const t = dosTime(date || new Date());
    const parts = [], central = [];
    let off = 0;
    for (const e of entries) {
      const name = enc(e.name);
      const utf8 = /[^\x20-\x7e]/.test(e.name) ? 0x0800 : 0; // general purpose bit 11: UTF-8 name
      const method = e.comp ? 8 : 0;
      const body = e.comp || e.data;
      const crc = crc32(e.data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, utf8, true); lh.setUint16(8, method, true);
      lh.setUint16(10, t.time, true); lh.setUint16(12, t.date, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, body.length, true); lh.setUint32(22, e.data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, body);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, (3 << 8) | 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, utf8, true);
      ch.setUint16(10, method, true); ch.setUint16(12, t.time, true); ch.setUint16(14, t.date, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, body.length, true); ch.setUint32(24, e.data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
      ch.setUint32(38, (0o100644 << 16) >>> 0, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + body.length;
    }
    const cdSize = central.reduce((s, b) => s + b.length, 0);
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(8, entries.length, true); eocd.setUint16(10, entries.length, true);
    eocd.setUint32(12, cdSize, true); eocd.setUint32(16, off, true); eocd.setUint16(20, 0, true);
    const all = parts.concat(central, [new Uint8Array(eocd.buffer)]);
    const out = new Uint8Array(all.reduce((s, b) => s + b.length, 0));
    let p = 0;
    for (const b of all) { out.set(b, p); p += b.length; }
    return out;
  }
  function entriesFor(xml, innerName) {
    innerName = innerName || 'score.musicxml';
    return [
      { name: innerName, data: typeof xml === 'string' ? enc(xml) : xml, comp: null },
      { name: 'META-INF/container.xml', data: enc(containerXml(innerName)), comp: null }
    ];
  }
  function writeStored(xml, innerName, opts) {
    return zip(entriesFor(xml, innerName), opts && opts.date);
  }
  async function write(xml, innerName, opts) {
    const entries = entriesFor(xml, innerName);
    for (const e of entries) e.comp = await deflateRaw(e.data);
    return zip(entries, opts && opts.date);
  }

  const XML_ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
  function unescapeXml(s) {
    return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z]+);/g, (m, e) => {
      if (e[0] === '#') {
        const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
      }
      return Object.prototype.hasOwnProperty.call(XML_ENT, e) ? XML_ENT[e] : m;
    });
  }
  async function read(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let e = b.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('OMR.mxl.read: not a zip file');
    const n = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    const files = {};
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('OMR.mxl.read: bad central directory');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true), crc = dv.getUint32(p + 16, true);
      const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nlen));
      const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      const raw = b.subarray(start, start + csize);
      let data;
      if (method === 0) data = raw.slice();
      else if (method === 8) data = await inflateRaw(raw);
      else throw new Error('OMR.mxl.read: compression method ' + method + ' not supported');
      if (data.length !== usize || crc32(data) !== crc) throw new Error('OMR.mxl.read: ' + name + ' failed its CRC/size check');
      if (!name.endsWith('/')) files[name] = data;
      p += 46 + nlen + xlen + clen;
    }
    let rootfile = null;
    const cont = files['META-INF/container.xml'];
    if (cont) { // the attribute value is XML-escaped (containerXml escapes & " <)
      const m = /full-path\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(new TextDecoder().decode(cont));
      if (m) rootfile = unescapeXml(m[1] != null ? m[1] : m[2]);
    }
    if (!rootfile) rootfile = Object.keys(files).find((k) => !k.startsWith('META-INF/') && /\.(musicxml|xml)$/i.test(k)) || null;
    return { files: files, rootfile: rootfile, xml: rootfile && files[rootfile] ? new TextDecoder().decode(files[rootfile]) : null };
  }

  OMR.mxl = { write: write, writeStored: writeStored, read: read, crc32: crc32, containerXml: containerXml };
})(typeof self !== 'undefined' ? self : globalThis);
