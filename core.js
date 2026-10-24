// SEED game core: level generation, simulation and seed encoding.
// Shared by the browser (window.SeedCore) and Node (module.exports) for balancing.
(function (root) {
  'use strict';

  const W = 40, H = 40;
  const STARS = 10;
  const NEAR_STARS = 3;
  const REACH = 2;      // a star lights when a live cell is within this Chebyshev distance
  const MAX_GEN = 200;
  const EPOCH = Date.UTC(2026, 9, 24); // puzzle #1
  const ENDLESS_BASE = 100000;         // ids >= this are endless-mode levels

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function dailyNumber(date = new Date()) {
    const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.floor((day - EPOCH) / 864e5) + 1;
  }

  function makeLevel(id) {
    const rnd = mulberry32(Math.imul(id, 2654435761) ^ 0x5eed);
    const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

    const size = ri(6, 8);
    const budget = ri(7, 12);
    const zx = ri(2, W - size - 2), zy = ri(2, H - size - 2);
    const nearZone = (x, y, m) => x >= zx - m && x < zx + size + m && y >= zy - m && y < zy + size + m;

    const wall = new Uint8Array(W * H);
    const nWalls = ri(3, 7);
    for (let i = 0; i < nWalls; i++) {
      const len = ri(3, 10), horiz = rnd() < 0.5;
      const x0 = ri(0, W - 1), y0 = ri(0, H - 1);
      for (let k = 0; k < len; k++) {
        const x = horiz ? x0 + k : x0, y = horiz ? y0 : y0 + k;
        if (x >= W || y >= H || nearZone(x, y, 3)) continue;
        wall[y * W + x] = 1;
      }
    }

    const stars = [];
    for (let tries = 0; stars.length < STARS && tries < 10000; tries++) {
      const x = ri(REACH, W - 1 - REACH), y = ri(REACH, H - 1 - REACH);
      if (nearZone(x, y, 5)) continue;
      // The first few stars sit close to the zone so every player can light something.
      if (stars.length < NEAR_STARS && nearZone(x, y, 11) === false) continue;
      if (stars.some(s => Math.max(Math.abs(s.x - x), Math.abs(s.y - y)) < 5)) continue;
      let blocked = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (wall[(y + dy) * W + x + dx]) blocked = true;
      if (!blocked) stars.push({ x, y });
    }

    return { id, w: W, h: H, zone: { x: zx, y: zy, size }, budget, wall, stars, maxGen: MAX_GEN };
  }

  function inZone(level, x, y) {
    const z = level.zone;
    return x >= z.x && y >= z.y && x < z.x + z.size && y < z.y + z.size;
  }

  class Sim {
    constructor(level, cells) {
      this.level = level;
      const n = W * H;
      this.grid = new Uint8Array(n);
      this.next = new Uint8Array(n);
      for (const i of cells) if (!level.wall[i]) this.grid[i] = 1;
      this.gen = 0;
      this.pop = 0;
      for (let i = 0; i < n; i++) this.pop += this.grid[i];
      this.lit = new Array(level.stars.length).fill(-1);
      this.litCount = 0;
      this.lastLitGen = 0;
      this.seen = new Set([this.key()]);
      this.done = false;
      this.reason = '';
    }

    key() {
      let h1 = 2166136261, h2 = 5381;
      for (let i = 0; i < this.grid.length; i++) {
        if (this.grid[i]) {
          h1 = Math.imul(h1 ^ i, 16777619);
          h2 = Math.imul(h2, 33) ^ i;
        }
      }
      return `${h1 >>> 0}.${h2 >>> 0}.${this.pop}`;
    }

    // Advances one generation; returns indices of stars lit this generation.
    step() {
      if (this.done) return [];
      const { grid, next } = this, wall = this.level.wall;
      let pop = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (wall[i]) { next[i] = 0; continue; }
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= H) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx;
              if ((dx || dy) && xx >= 0 && xx < W) n += grid[yy * W + xx];
            }
          }
          const v = (n === 3 || (n === 2 && grid[i])) ? 1 : 0;
          next[i] = v;
          pop += v;
        }
      }
      this.grid = next; this.next = grid;
      this.pop = pop;
      this.gen++;

      const events = [];
      this.level.stars.forEach((s, k) => {
        if (this.lit[k] >= 0) return;
        for (let dy = -REACH; dy <= REACH; dy++)
          for (let dx = -REACH; dx <= REACH; dx++)
            if (this.grid[(s.y + dy) * W + s.x + dx]) {
              if (this.lit[k] < 0) { this.lit[k] = this.gen; this.litCount++; events.push(k); }
            }
      });
      if (events.length) this.lastLitGen = this.gen;

      const key = this.key();
      if (this.litCount === this.level.stars.length) this.finish('win');
      else if (pop === 0) this.finish('dead');
      else if (this.seen.has(key)) this.finish('stable');
      else if (this.gen >= this.level.maxGen) this.finish('time');
      else this.seen.add(key);
      return events;
    }

    finish(reason) { this.done = true; this.reason = reason; this.seen = null; }

    result() {
      return { lit: this.litCount, total: this.level.stars.length, gen: this.lastLitGen, endGen: this.gen, reason: this.reason };
    }
  }

  function run(level, cells) {
    const sim = new Sim(level, cells);
    while (!sim.done) sim.step();
    return sim.result();
  }

  // More stars wins; with equal stars, the one that got there in fewer generations.
  function better(a, b) {
    if (!b) return true;
    if (a.lit !== b.lit) return a.lit > b.lit;
    return a.lit > 0 && a.gen < b.gen;
  }

  // Seed cells are stored as a bitmask over the zone, written in base 36.
  function encodeSeed(level, cells) {
    const z = level.zone;
    let v = 0n;
    for (const i of cells) {
      const x = i % W - z.x, y = Math.floor(i / W) - z.y;
      v |= 1n << BigInt(y * z.size + x);
    }
    return v.toString(36);
  }

  function decodeSeed(level, str) {
    if (!/^[0-9a-z]{1,20}$/.test(str || '')) return null;
    let v = 0n;
    for (const ch of str) v = v * 36n + BigInt(parseInt(ch, 36));
    const z = level.zone, cells = [];
    for (let b = 0; b < z.size * z.size; b++) {
      if ((v >> BigInt(b)) & 1n) cells.push((z.y + Math.floor(b / z.size)) * W + z.x + b % z.size);
    }
    if (v >> BigInt(z.size * z.size)) return null;
    return cells.length <= level.budget ? cells : null;
  }

  const api = { W, H, MAX_GEN, REACH, ENDLESS_BASE, mulberry32, dailyNumber, makeLevel, inZone, Sim, run, better, encodeSeed, decodeSeed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SeedCore = api;
})(this);
