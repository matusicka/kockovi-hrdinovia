// Kockoví hrdinovia – herný server (bez závislostí, stačí Node.js)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const KH = require('./public/sim.js');

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUB = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.json': 'application/json; charset=utf-8',
};

// ---------- HTTP (posiela súbory hry) ----------
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.normalize(path.join(PUB, p));
  if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Nenájdené'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------- Minimálny WebSocket ----------
class Conn {
  constructor(sock) {
    this.sock = sock; this.buf = Buffer.alloc(0); this.open = true;
    this.onmessage = null; this.onclose = null; this.player = null;
    sock.setNoDelay(true);
    sock.on('data', d => { this.buf = Buffer.concat([this.buf, d]); this.parse(); });
    sock.on('close', () => this._closed());
    sock.on('error', () => this._closed());
  }
  _closed() { if (!this.open) return; this.open = false; try { this.sock.destroy(); } catch (e) {} if (this.onclose) this.onclose(); }
  parse() {
    while (this.open && this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1];
      const op = b0 & 15, masked = b1 & 128;
      let len = b1 & 127, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (len > 65536) { this.close(); return; }
      const need = off + (masked ? 4 : 0) + len;
      if (this.buf.length < need) return;
      let payload = Buffer.from(this.buf.subarray(off + (masked ? 4 : 0), need));
      if (masked) { const m = this.buf.subarray(off, off + 4); for (let i = 0; i < payload.length; i++) payload[i] ^= m[i & 3]; }
      this.buf = this.buf.subarray(need);
      if (op === 1) { if (this.onmessage) this.onmessage(payload.toString('utf8')); }
      else if (op === 8) { this.close(); return; }
      else if (op === 9) this.frame(10, payload);
    }
  }
  frame(op, data) {
    if (!this.open) return;
    const len = data.length; let h;
    if (len < 126) h = Buffer.from([128 | op, len]);
    else if (len < 65536) { h = Buffer.alloc(4); h[0] = 128 | op; h[1] = 126; h.writeUInt16BE(len, 2); }
    else { h = Buffer.alloc(10); h[0] = 128 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); }
    try { this.sock.write(Buffer.concat([h, data])); } catch (e) {}
  }
  send(obj) { this.frame(1, Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj), 'utf8')); }
  close() { if (this.open) { try { this.frame(8, Buffer.alloc(0)); this.sock.end(); } catch (e) {} } this._closed(); }
}

server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { sock.destroy(); return; }
  const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  onConnection(new Conn(sock));
});

// ---------- Hra ----------
const game = new KH.Game({ lobby: true });   // čakáreň: hru spustí ten, kto prišiel prvý; bez robotov
const conns = new Set();
let bot = null;

function humans() { return [...game.players.values()].filter(p => !p.bot).length; }

function manageBot() {}   // online hra je len pre ľudí – žiadni roboti

function onConnection(c) {
  if (conns.size >= 16) { c.send({ t: 'err', msg: 'Server je preplnený.' }); c.close(); return; }
  conns.add(c);
  c.send({ t: 'hello', max: KH.MAX_PLAYERS });
  c.onmessage = (txt) => {
    let m; try { m = JSON.parse(txt); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'join') {
      if (c.player) return;
      const hero = m.hero | 0;
      if (hero < 0 || hero > 3) return;
      if (humans() >= KH.MAX_PLAYERS) { c.send({ t: 'err', msg: 'Hra je plná – môžu hrať maximálne 4 hráči.' }); return; }
      if (bot && humans() >= 1) { game.removePlayer(bot.id); bot = null; }
      if (bot && bot.hero === hero) { game.removePlayer(bot.id); bot = null; }
      if ([...game.players.values()].some(p => p.hero === hero)) { c.send({ t: 'err', msg: 'Túto postavu už má iný hráč. Vyber si inú.' }); return; }
      const name = String(m.name || '').replace(/[<>&"]/g, '').trim().slice(0, 16) || 'Hráč';
      c.player = game.addPlayer(name, hero, false);
      c.send({ t: 'welcome', id: c.player.id });
      manageBot();
      console.log('  + ' + name + ' sa pripojil (' + humans() + '/4)');
    } else if (c.player) {
      if (m.t === 'in') game.input(c.player.id, m.k | 0);
      else if (m.t === 'start') game.startGame(c.player.id);
      else if (m.t === 'act' && typeof m.a === 'string') game.action(c.player.id, m.a);
      else if (m.t === 'pause') {
        const now = Date.now();
        if (now - (c.lastPause || 0) > 400) { c.lastPause = now; game.togglePause(c.player.id); }
      }
    }
  };
  c.onclose = () => {
    conns.delete(c);
    if (c.player) {
      console.log('  - ' + c.player.name + ' odišiel');
      game.removePlayer(c.player.id); c.player = null; manageBot();
    }
  };
}

let last = process.hrtime.bigint(), tick = 0;
setInterval(() => {
  const now = process.hrtime.bigint();
  const dt = Math.min(0.05, Number(now - last) / 1e9);
  last = now;
  game.step(dt);
  if (++tick % 2 === 0) {
    const snap = game.snapshot();
    snap.w = [...conns].filter(c => !c.player).length;   // koľko ľudí má hru otvorenú, ale ešte si vyberá postavu
    const msg = JSON.stringify(snap);
    for (const c of conns) c.send(msg);
  }
}, 1000 / 60);

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.log('\n  Port ' + PORT + ' je už obsadený. Hra už asi beží, alebo zavri iný program na tomto porte.\n');
  else console.log(e);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  ==============================================');
  console.log('   KOCKOVÍ HRDINOVIA – server beží!');
  console.log('  ==============================================');
  console.log('   Na tomto počítači otvor:  http://localhost:' + PORT);
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) {
    if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
  }
  if (ips.length) {
    console.log('   Kamaráti na rovnakej Wi-Fi/sieti otvoria:');
    for (const ip of ips) console.log('      http://' + ip + ':' + PORT);
  }
  console.log('   Hru vypneš zatvorením tohto okna (alebo Ctrl+C).');
  console.log('  ==============================================\n');
});
