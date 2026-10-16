// Kockoví hrdinovia – herná logika (spoločná pre server aj offline režim v prehliadači)
(function (root) {
  'use strict';

  const GRAV = 28;
  const JUMP = 10.5;
  const SPEED = 7;
  const R = 0.55;           // polomer postavičky
  const ROUNDS = 3;         // počet kôl v jednej hre
  const ROUND_TIME = 30;    // dĺžka kola v sekundách
  const INTRO_TIME = 3.5;   // odpočet pred kolom
  const BREAK_TIME = 4;     // prestávka medzi kolami
  const END_TIME = 10;      // výsledková tabuľa na konci hry
  const MAX_PLAYERS = 4;

  // MAPY – každé kolo sa hrá na inej mape.
  // floor = obdĺžniky podlahy (x, z = stred; w, d = rozmery), obst = prekážky z kociek (h = výška, 1 kocka = 1.2)
  // slip = šmykľavosť (1 = normálne, menej = kĺže sa), spawns = štartové miesta pre hrdinov 0-3
  const MAPS = [
    {
      name: 'Kocková aréna', slip: 1,
      floor: [{ x: 0, z: 0, w: 24, d: 24 }],
      obst: [
        { x: -9.5, z: -9.5, w: 2, d: 2, h: 3.6 }, { x: 9.5, z: -9.5, w: 2, d: 2, h: 3.6 },
        { x: -9.5, z: 9.5, w: 2, d: 2, h: 3.6 }, { x: 9.5, z: 9.5, w: 2, d: 2, h: 3.6 },
        { x: 0, z: -7, w: 4, d: 2, h: 1.2 }, { x: 0, z: 7, w: 4, d: 2, h: 1.2 },
        { x: -7, z: 0, w: 2, d: 4, h: 1.2 }, { x: 7, z: 0, w: 2, d: 4, h: 1.2 },
      ],
      spawns: [[-4.5, -4], [4.5, -4], [-4.5, 4], [4.5, 4]],
    },
    {
      name: 'Ľadový ostrov', slip: 0.3,
      floor: [{ x: 0, z: 0, w: 24, d: 14 }, { x: 0, z: 0, w: 14, d: 24 }],
      obst: [
        { x: -4, z: -4, w: 2, d: 2, h: 1.2 }, { x: 4, z: 4, w: 2, d: 2, h: 1.2 },
        { x: 4, z: -4, w: 2, d: 2, h: 2.4 }, { x: -4, z: 4, w: 2, d: 2, h: 2.4 },
        { x: 0, z: 0, w: 2, d: 2, h: 1.2 },
        { x: -10, z: 0, w: 1, d: 4, h: 1.2 }, { x: 10, z: 0, w: 1, d: 4, h: 1.2 },
      ],
      spawns: [[-6.5, 0], [6.5, 0], [0, -6.5], [0, 6.5]],
    },
    {
      name: 'Lávový hrad', slip: 1,
      floor: [
        { x: 0, z: -7.5, w: 24, d: 9 }, { x: 0, z: 7.5, w: 24, d: 9 },
        { x: -7.5, z: 0, w: 9, d: 6 }, { x: 7.5, z: 0, w: 9, d: 6 },
      ],
      obst: [
        { x: -10.5, z: -10.5, w: 3, d: 3, h: 3.6 }, { x: 10.5, z: -10.5, w: 3, d: 3, h: 3.6 },
        { x: -10.5, z: 10.5, w: 3, d: 3, h: 3.6 }, { x: 10.5, z: 10.5, w: 3, d: 3, h: 3.6 },
        { x: 0, z: -9.5, w: 6, d: 1, h: 1.2 }, { x: 0, z: 9.5, w: 6, d: 1, h: 1.2 },
        { x: -4, z: -7, w: 2, d: 2, h: 2.4 }, { x: 4, z: 7, w: 2, d: 2, h: 2.4 },
      ],
      spawns: [[-7, -6.5], [7, -6.5], [-7, 6.5], [7, 6.5]],
    },
  ];

  // Útoky: dur = trvanie, hit = kedy zasiahne, hitEnd = koniec okna zásahu, arc = uhol zásahu
  const ATK = {
    punch1:    { dur: 0.28, hit: 0.09, dmg: 6,  range: 1.7, arc: 100, kb: 3,  up: 0,  stun: 0.28 },
    punch2:    { dur: 0.28, hit: 0.09, dmg: 7,  range: 1.7, arc: 100, kb: 3.5, up: 0, stun: 0.3 },
    punch3:    { dur: 0.45, hit: 0.17, dmg: 12, range: 1.9, arc: 110, kb: 9,  up: 3,  stun: 0.5 },
    kick:      { dur: 0.42, hit: 0.17, dmg: 10, range: 2.0, arc: 100, kb: 7,  up: 1,  stun: 0.4 },
    combokick: { dur: 0.5,  hit: 0.2,  dmg: 13, range: 2.1, arc: 120, kb: 11, up: 4,  stun: 0.55 },
    spin:      { dur: 0.55, hit: 0.2, hitEnd: 0.42, dmg: 12, range: 2.1, arc: 360, kb: 8, up: 2, stun: 0.5 },
    airkick:   { dur: 0.6,  hit: 0.06, hitEnd: 0.6, dmg: 11, range: 1.6, arc: 140, kb: 9, up: 2, stun: 0.45 },
    super:     { dur: 0.7,  hit: 0.28, dmg: 18, range: 1.9, arc: 120, kb: 6,  up: 14, stun: 0.8 },
  };
  const SUPER_CD = 4;

  function onFloor(map, x, z) {
    for (const f of map.floor) if (Math.abs(x - f.x) <= f.w / 2 && Math.abs(z - f.z) <= f.d / 2) return true;
    return false;
  }
  function groundAt(map, x, z, y) {
    let g = onFloor(map, x, z) ? 0 : -1e9;
    for (const o of map.obst) {
      if (Math.abs(x - o.x) <= o.w / 2 && Math.abs(z - o.z) <= o.d / 2 && y >= o.h - 0.3) g = Math.max(g, o.h);
    }
    return g;
  }
  function approach(v, t, a) { return v < t ? Math.min(t, v + a) : Math.max(t, v - a); }
  function r2(v) { return Math.round(v * 100) / 100; }

  function Game(opts) {
    this.lobbyMode = !!(opts && opts.lobby);   // online hra: čakáreň, žiadni roboti, spúšťa zakladateľ
    this.ownerId = 0;
    this.players = new Map();
    this.time = 0;
    this.events = [];
    this.nextId = 1;
    this.mapIdx = 0; this.map = MAPS[0];
    this.phase = 'idle';    // idle | lobby | intro | fight | break | end
    this.phaseT = 0; this.round = 0; this.results = null;
    this.pause = null;      // { by, name, c } – c = odpočet do pokračovania (0 = stojí)
  }
  const G = Game.prototype;

  G.ev = function (e) { this.events.push(e); };

  G.freeHeroes = function () {
    const used = new Set([...this.players.values()].map(p => p.hero));
    return [0, 1, 2, 3].filter(h => !used.has(h));
  };

  G.addPlayer = function (name, hero, bot) {
    const p = {
      id: this.nextId++, name: name, hero: hero, bot: !!bot, kos: 0, deaths: 0,
      keys: 0, jumpReq: 0, seq: 0, superCd: 0, lastAtk: null, lastAtkEnd: -9, buffer: null,
      lastHit: 0, lastHitT: -99, ai: { t: 0, blockT: 0, strafe: 0 },
    };
    this.respawn(p);
    this.players.set(p.id, p);
    this.ev({ e: 'join', id: p.id, name: p.name });
    if (!bot && this.lobbyMode && !this.players.has(this.ownerId)) this.ownerId = p.id;
    if (this.phase === 'idle') { if (this.lobbyMode) this.toLobby(); else this.startMatch(); }
    return p;
  };

  // Pauza: ktokoľvek ju zapne, ktokoľvek ju vypne (hra pokračuje po odpočte 3-2-1)
  G.togglePause = function (id) {
    const p = this.players.get(id);
    if (!p) return;
    if (!this.pause) {
      this.pause = { by: id, name: p.name, c: 0 };
      for (const q of this.players.values()) if (!q.bot) q.keys = 0;
      this.ev({ e: 'pause', id: id, name: p.name });
    } else if (this.pause.c === 0) {
      this.pause.c = 3;
      this.ev({ e: 'resume', id: id, name: p.name });
    } else {
      this.pause.c = 0;   // opätovné stlačenie počas odpočtu = zostaň v pauze
      this.pause.by = id; this.pause.name = p.name;
      this.ev({ e: 'pause', id: id, name: p.name });
    }
  };

  G.removePlayer = function (id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this.ev({ e: 'leave', id: id, name: p.name });
    const left = [...this.players.values()].filter(q => !q.bot);
    if (!left.length) { this.phase = 'idle'; this.pause = null; this.mapIdx = 0; this.map = MAPS[0]; this.ownerId = 0; return; }
    if (this.lobbyMode) {
      if (id === this.ownerId) { this.ownerId = left.reduce((m, q) => Math.min(m, q.id), Infinity); this.ev({ e: 'owner', id: this.ownerId }); }
      if (left.length < 2 && this.phase !== 'lobby' && this.phase !== 'end') { this.toLobby(); this.ev({ e: 'aborted' }); }
    }
  };

  // ---- Čakáreň (len online hra) ----
  G.toLobby = function () {
    this.phase = 'lobby'; this.phaseT = 0; this.round = 0; this.pause = null;
    this.mapIdx = 0; this.map = MAPS[0];
    for (const p of this.players.values()) this.respawn(p);
    this.ev({ e: 'lobby' });
  };
  G.startGame = function (id) {
    if (!this.lobbyMode || this.phase !== 'lobby' || id !== this.ownerId) return;
    if ([...this.players.values()].filter(q => !q.bot).length < 2) return;
    this.startMatch();
  };

  G.respawn = function (p) {
    const s = this.map.spawns[p.hero] || this.map.spawns[0];
    p.x = s[0]; p.z = s[1]; p.y = 0.01; p.vx = p.vy = p.vz = 0;
    p.hp = 100; p.dead = false; p.action = null; p.actionT = 0; p.stun = 0; p.inv = 1.5;
    p.onGround = true; p.blocking = false; p.buffer = null;
    p.facing = Math.atan2(-p.x, -p.z);
  };

  // ---- Kolá a mapy ----
  G.startMatch = function () {
    for (const p of this.players.values()) { p.kos = 0; p.deaths = 0; }
    this.round = 1; this.results = null;
    this.startRound();
  };
  G.startRound = function () {
    this.mapIdx = (this.round - 1) % MAPS.length; this.map = MAPS[this.mapIdx];
    for (const p of this.players.values()) { this.respawn(p); p.keys = p.bot ? 0 : p.keys; p.superCd = 0; }
    this.phase = 'intro'; this.phaseT = INTRO_TIME;
    this.ev({ e: 'round', r: this.round, map: this.mapIdx });
  };
  G.standings = function () {
    return [...this.players.values()]
      .map(p => ({ id: p.id, name: p.name, hero: p.hero, kos: p.kos, deaths: p.deaths, bot: p.bot ? 1 : 0 }))
      .sort((a, b) => b.kos - a.kos || a.deaths - b.deaths);
  };
  G.updatePhase = function (dt) {
    if (this.phase === 'idle' || this.phase === 'lobby') return;
    this.phaseT -= dt;
    if (this.phaseT > 0) return;
    if (this.phase === 'intro') {
      this.phase = 'fight'; this.phaseT = ROUND_TIME;
      for (const p of this.players.values()) p.inv = 0.5;
      this.ev({ e: 'fight', r: this.round });
    } else if (this.phase === 'fight') {
      if (this.round < ROUNDS) {
        this.phase = 'break'; this.phaseT = BREAK_TIME;
        this.ev({ e: 'roundEnd', r: this.round, st: this.standings() });
      } else {
        this.phase = 'end'; this.phaseT = END_TIME;
        const st = this.standings();
        const best = st.length ? st[0] : null;
        const winners = best ? st.filter(q => q.kos === best.kos && q.deaths === best.deaths) : [];
        this.results = { st: st, w: winners.map(q => q.id) };
        this.ev({ e: 'matchEnd', st: st, w: this.results.w });
      }
    } else if (this.phase === 'break') {
      this.round++; this.startRound();
    } else if (this.phase === 'end') {
      if (this.lobbyMode) this.toLobby(); else this.startMatch();
    }
  };

  G.input = function (id, keys) { const p = this.players.get(id); if (p) p.keys = keys & 31; };

  G.action = function (id, a) {
    const p = this.players.get(id);
    if (!p || p.dead || this.pause || (this.phase !== 'fight' && this.phase !== 'lobby')) return;
    if (a === 'jump') { p.jumpReq = 0.15; return; }
    if (a === 'punch' || a === 'kick' || a === 'super') this.startAttack(p, a);
  };

  G.startAttack = function (p, kind) {
    if (p.dead || p.stun > 0) return;
    if (p.action) {
      if (p.actionT > ATK[p.action].dur * 0.35) p.buffer = kind;
      return;
    }
    const combo = this.time - p.lastAtkEnd < 0.4;
    let a = null;
    if (kind === 'super') {
      if (p.superCd > 0) kind = 'punch'; else { a = 'super'; p.superCd = SUPER_CD; }
    }
    if (!a && kind === 'punch') {
      if (combo && p.lastAtk === 'punch1') a = 'punch2';
      else if (combo && p.lastAtk === 'punch2') a = 'punch3';
      else a = 'punch1';
    }
    if (!a && kind === 'kick') {
      if (!p.onGround) a = 'airkick';
      else if (combo && /^punch/.test(p.lastAtk || '')) a = 'combokick';
      else if (combo && p.lastAtk === 'kick') a = 'spin';
      else a = 'kick';
    }
    p.action = a; p.actionT = 0; p.seq++; p.hitSet = new Set(); p.hitDone = false; p.hopped = false;
    p.blocking = false;
    const fx = Math.sin(p.facing), fz = Math.cos(p.facing);
    if (a === 'airkick') { p.vx = fx * 9; p.vz = fz * 9; p.vy = Math.max(p.vy, 2); }
    if (a === 'combokick') { p.vx = fx * 4; p.vz = fz * 4; }
    this.ev({ e: 'sw', id: p.id, a: a });
  };

  G.endAction = function (p) {
    p.lastAtk = p.action; p.lastAtkEnd = this.time; p.action = null;
    if (p.buffer) { const b = p.buffer; p.buffer = null; this.startAttack(p, b); }
  };

  G.hits = function (p, d) {
    const fx = Math.sin(p.facing), fz = Math.cos(p.facing);
    const cosA = Math.cos(d.arc * Math.PI / 360);
    for (const q of this.players.values()) {
      if (q === p || q.dead || q.inv > 0 || p.hitSet.has(q.id)) continue;
      const dx = q.x - p.x, dz = q.z - p.z, dist = Math.hypot(dx, dz);
      if (dist > d.range + R * 0.6 || Math.abs(q.y - p.y) > 1.6) continue;
      if (d.arc < 360 && dist > 0.3 && (dx * fx + dz * fz) / dist < cosA) continue;
      p.hitSet.add(q.id);
      const nx = dist > 0.01 ? dx / dist : fx, nz = dist > 0.01 ? dz / dist : fz;
      let dmg = d.dmg, kb = d.kb, up = d.up;
      const qfx = Math.sin(q.facing), qfz = Math.cos(q.facing);
      const blocked = q.blocking && -(nx * qfx + nz * qfz) > 0.1;
      if (blocked) { dmg = Math.max(1, Math.round(dmg * 0.2)); kb *= 0.35; up = 0; }
      else { q.stun = d.stun; q.action = null; q.buffer = null; q.blocking = false; }
      q.hp = Math.max(0, q.hp - dmg);
      const mul = blocked ? 1 : 1 + (100 - q.hp) / 90;   // menej životov = ďalej letíš
      q.vx = nx * kb * mul; q.vz = nz * kb * mul;
      if (up) { q.vy = up * (0.8 + 0.2 * mul); q.onGround = false; }
      q.lastHit = p.id; q.lastHitT = this.time;
      this.ev({ e: 'hit', a: p.id, t: q.id, x: r2(q.x), y: r2(q.y + 1.4), z: r2(q.z), dmg: dmg, b: blocked ? 1 : 0, k: p.action });
      if (q.hp <= 0) this.ko(q, p, false);
    }
  };

  G.ko = function (q, killer, ring) {
    q.dead = true; q.respawnT = 2; q.deaths++; q.action = null; q.keys = q.bot ? 0 : q.keys;
    const k = killer && killer !== q && this.players.has(killer.id) ? killer : null;
    if (k && this.phase === 'fight') k.kos++;
    this.ev({ e: 'ko', id: q.id, by: k ? k.id : 0, x: r2(q.x), y: r2(Math.max(q.y, -3)), z: r2(q.z), ring: ring ? 1 : 0 });
  };

  // Jednoduchá umelá inteligencia pre robotov
  G.botThink = function (p, dt) {
    const ai = p.ai;
    ai.t -= dt; ai.blockT -= dt;
    if (p.dead) { p.keys = 0; return; }
    if (ai.t > 0) { if (ai.blockT <= 0) p.keys &= ~16; return; }
    ai.t = 0.18 + Math.random() * 0.25;
    let best = null, bd = 1e9;
    for (const q of this.players.values()) {
      if (q === p || q.dead) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bd) { bd = d; best = q; }
    }
    if (!best) { p.keys = 0; return; }
    let dx = best.x - p.x, dz = best.z - p.z;
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    if (Math.random() < 0.08) ai.strafe = (Math.random() - 0.5) * 1.6;
    { const ox = dx; dx += -dz * ai.strafe * 0.4; dz += ox * ai.strafe * 0.4; }
    // vyhni sa okraju a dieram – skús smer k cieľu, potom postupne pootočené smery
    {
      const ok = (ax, az) => onFloor(this.map, p.x + ax * 1.0, p.z + az * 1.0) && onFloor(this.map, p.x + ax * 1.9, p.z + az * 1.9);
      const side = (p.id % 2) ? 1 : -1;
      for (const ang of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.6, -2.6, Math.PI]) {
        const a = ang * side, c = Math.cos(a), sn = Math.sin(a);
        const ax = dx * c - dz * sn, az = dx * sn + dz * c;
        if (ok(ax, az)) { dx = ax; dz = az; break; }
      }
    }
    let k = 0;
    if (bd > 1.5) {
      if (dx > 0.3) k |= 8; if (dx < -0.3) k |= 4;
      if (dz > 0.3) k |= 2; if (dz < -0.3) k |= 1;
    } else if (!p.action && p.stun <= 0) {
      p.facing = Math.atan2(best.x - p.x, best.z - p.z);
    }
    // blokovanie
    if (best.action && bd < 2.4 && Math.random() < 0.3) { ai.blockT = 0.5; }
    if (ai.blockT > 0) k |= 16;
    p.keys = k;
    if (bd < 2.1 && ai.blockT <= 0) {
      const r = Math.random();
      if (r < 0.1 && p.superCd <= 0) this.startAttack(p, 'super');
      else if (r < 0.55) this.startAttack(p, 'punch');
      else if (r < 0.85) this.startAttack(p, 'kick');
    } else if (bd < 5 && Math.random() < 0.05) {
      p.jumpReq = 0.15;
    }
    // zaseknutý pri prekážke – skoč
    if (bd > 3 && Math.hypot(p.vx, p.vz) < 0.5 && Math.random() < 0.3) p.jumpReq = 0.15;
  };

  G.updatePlayer = function (p, dt) {
    if (p.dead) {
      p.respawnT -= dt;
      if (p.respawnT <= 0) this.respawn(p);
      return;
    }
    p.inv = Math.max(0, p.inv - dt);
    p.stun = Math.max(0, p.stun - dt);
    p.superCd = Math.max(0, p.superCd - dt);
    const k = p.keys;
    let mx = ((k & 8) ? 1 : 0) - ((k & 4) ? 1 : 0), mz = ((k & 2) ? 1 : 0) - ((k & 1) ? 1 : 0);
    const ml = Math.hypot(mx, mz);
    if (ml) { mx /= ml; mz /= ml; }
    const free = !p.action && p.stun <= 0;
    p.blocking = !!(k & 16) && free && p.onGround;

    if (p.jumpReq > 0) {
      p.jumpReq -= dt;
      if (free && p.onGround && !p.blocking) {
        p.vy = JUMP; p.onGround = false; p.jumpReq = 0;
        this.ev({ e: 'jump', id: p.id });
      }
    }
    if (ml && free) p.facing = Math.atan2(mx, mz);

    if (p.stun > 0 || p.action === 'airkick') {
      const fr = Math.exp(-dt * (p.onGround ? 5 * this.map.slip : 0.8));
      p.vx *= fr; p.vz *= fr;
    } else {
      let sp = SPEED;
      if (p.blocking) sp = 2.2;
      if (p.action) sp *= 0.25;
      const acc = (p.onGround ? 55 * this.map.slip : 22) * dt;
      p.vx = approach(p.vx, mx * sp, acc);
      p.vz = approach(p.vz, mz * sp, acc);
    }

    p.vy -= GRAV * dt;
    p.y += p.vy * dt;
    p.x += p.vx * dt;
    p.z += p.vz * dt;

    // náraz do prekážok
    for (const o of this.map.obst) {
      if (p.y >= o.h - 0.05) continue;
      const cx = Math.max(o.x - o.w / 2, Math.min(p.x, o.x + o.w / 2));
      const cz = Math.max(o.z - o.d / 2, Math.min(p.z, o.z + o.d / 2));
      let dx = p.x - cx, dz = p.z - cz;
      const d = Math.hypot(dx, dz);
      if (d >= R) continue;
      if (d > 1e-4) { p.x = cx + dx / d * R; p.z = cz + dz / d * R; }
      else {
        const px = o.w / 2 - Math.abs(p.x - o.x), pz = o.d / 2 - Math.abs(p.z - o.z);
        if (px < pz) p.x = o.x + Math.sign(p.x - o.x || 1) * (o.w / 2 + R);
        else p.z = o.z + Math.sign(p.z - o.z || 1) * (o.d / 2 + R);
      }
    }

    const g = groundAt(this.map, p.x, p.z, p.y + 0.01);
    if (p.y <= g && p.vy <= 0) {
      if (!p.onGround && p.vy < -6) this.ev({ e: 'land', id: p.id });
      p.y = g; p.vy = 0; p.onGround = true;
    } else if (p.y > g + 0.02) {
      p.onGround = false;
    }

    if (p.y < -9) {
      const killer = (this.time - p.lastHitT < 6) ? this.players.get(p.lastHit) : null;
      this.ko(p, killer, true);
      return;
    }

    if (p.action) {
      p.actionT += dt;
      const d = ATK[p.action];
      if (p.actionT >= d.hit && (d.hitEnd ? p.actionT <= d.hitEnd : !p.hitDone)) {
        this.hits(p, d);
        if (!d.hitEnd) p.hitDone = true;
        if (p.action === 'super' && !p.hopped) { p.vy = 7; p.onGround = false; p.hopped = true; }
      }
      if (p.action && (p.actionT >= d.dur || (p.action === 'airkick' && p.onGround && p.actionT > 0.1))) this.endAction(p);
    }
  };

  G.step = function (dt) {
    if (this.pause) {
      const humans = [...this.players.values()].filter(q => !q.bot).length;
      if (!humans) { this.pause = null; }
      else if (this.pause.c > 0) {
        this.pause.c -= dt;
        if (this.pause.c <= 0) { this.pause = null; this.ev({ e: 'go' }); }
        return;
      } else {
        if (!this.players.has(this.pause.by)) { this.pause.c = 3; this.ev({ e: 'resume', id: 0, name: '' }); }
        return;
      }
    }
    this.time += dt;
    this.updatePhase(dt);
    if (this.phase !== 'fight' && this.phase !== 'lobby') return;   // v čakárni sa dá rozcvičiť; počas odpočtu, prestávky a výsledkov všetci stoja
    for (const p of this.players.values()) if (p.bot) this.botThink(p, dt);
    for (const p of this.players.values()) this.updatePlayer(p, dt);
    // postavičky sa navzájom odtláčajú
    const arr = [...this.players.values()].filter(p => !p.dead);
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j];
      if (Math.abs(a.y - b.y) > 1.6) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d < R * 2 && d > 1e-4) {
        const push = (R * 2 - d) / 2;
        a.x -= dx / d * push; a.z -= dz / d * push;
        b.x += dx / d * push; b.z += dz / d * push;
      }
    }
  };

  G.snapshot = function () {
    const p = [], r = [];
    for (const q of this.players.values()) {
      p.push([q.id, r2(q.x), r2(q.y), r2(q.z), r2(q.facing), q.hp, q.action || '', q.seq,
        q.stun > 0 ? 1 : 0, q.blocking ? 1 : 0, q.dead ? 1 : 0, q.inv > 0 ? 1 : 0, q.superCd <= 0 ? 1 : 0]);
      r.push({ id: q.id, name: q.name, hero: q.hero, kos: q.kos, deaths: q.deaths, bot: q.bot ? 1 : 0 });
    }
    const out = { t: 's', p: p, r: r, ev: this.events, g: { ph: this.phase, own: this.ownerId, lb: this.lobbyMode ? 1 : 0, t: r2(Math.max(0, this.phaseT)), r: this.round, n: ROUNDS, map: this.mapIdx, res: this.phase === 'end' ? this.results : null },
      pz: this.pause ? { n: this.pause.name, c: r2(Math.max(0, this.pause.c)) } : null };
    this.events = [];
    return out;
  };

  const API = { Game, MAPS, ATK, ROUNDS, ROUND_TIME, MAX_PLAYERS, groundAt, onFloor };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.KH = API;
})(typeof window !== 'undefined' ? window : this);
