(async (G) => {
  const _ = (G.Biogenesis = {});

  //#region 1: DOMBootstrap
  ((Namespace) => {
    const d = G.document;
    d.documentElement.className = 'h-full bg-neutral-950 text-neutral-200';
    d.head.innerHTML = `
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
      <title>BiogenesisJS</title>
      <style>
        * { -webkit-tap-highlight-color: transparent; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .pixelated-canvas { image-rendering: -moz-crisp-edges; image-rendering: crisp-edges; image-rendering: pixelated; }
      </style>
    `;
    const tw = d.createElement('script');
    tw.src = 'https://unpkg.com/@tailwindcss/browser@4';
    d.head.appendChild(tw);
    d.body.className = 'm-0 h-full w-full font-mono text-xs bg-neutral-950 text-neutral-200 select-none overflow-hidden touch-none';
    d.body.innerHTML = '<div id="root" class="flex flex-col h-full w-full overflow-hidden"></div>';
    Object.assign(Namespace, { rootEl: d.getElementById('root') });
  })(_);
  //#endregion

  //#region 2: DependencyLoader
  await (async (Namespace) => {
    const [preactMod, hooksMod, htmMod, pixiMod] = await Promise.all([
      import('https://esm.sh/preact@11'),
      import('https://esm.sh/preact@11/hooks'),
      import('https://esm.sh/htm@3'),
      import('https://cdn.jsdelivr.net/npm/pixi.js@8.22/dist/pixi.mjs'),
    ]);
    const { h, render } = preactMod;
    const { useState, useEffect, useRef } = hooksMod;
    const html = htmMod.default.bind(h);
    const { Application, Graphics, Container, Mesh, Geometry, Shader, Buffer } = pixiMod;
    Object.assign(Namespace, {
      h, render, useState, useEffect, useRef, html,
      Application, Graphics, Container, Mesh, Geometry, Shader, Buffer,
    });
  })(_);
  //#endregion

  //#region 3: ReactiveSignals
  ((Namespace, { useState, useEffect }) => {
    const createSignal = (val) => {
      const subs = new Set();
      return {
        get value() { return val; },
        set value(next) {
          if (!Object.is(val, next)) {
            val = next;
            for (const fn of subs) fn(val);
          }
        },
        peek: () => val,
        subscribe: (fn) => (subs.add(fn), () => subs.delete(fn)),
      };
    };
    const useSignalValue = (sig) => {
      const [val, setVal] = useState(sig.peek);
      useEffect(() => (setVal(sig.peek()), sig.subscribe(setVal)), [sig]);
      return val;
    };
    Object.assign(Namespace, { createSignal, useSignalValue });
  })(_, _);
  //#endregion

  //#region 4: DeterministicPRNG
  ((Namespace) => {
    let _rngState = 1337;
    const setSeed = (seed) => { _rngState = ((Number(seed) | 0) ^ 0x9e3779b9) | 1; };
    const fastRand = () => {
      _rngState ^= _rngState << 13;
      _rngState ^= _rngState >>> 17;
      _rngState ^= _rngState << 5;
      return (_rngState >>> 0) * 2.3283064365386963e-10;
    };

    const hashU32 = (seed, a, b, c) => {
      let h = (seed + Math.imul(a | 0, 0x9e3779b1) + Math.imul(b | 0, 0x85ebca77) + Math.imul(c | 0, 0xc2b2ae3d)) | 0;
      h ^= h >>> 16;
      h = Math.imul(h, 0x7feb352d);
      h ^= h >>> 15;
      h = Math.imul(h, 0x846ca68b);
      h ^= h >>> 16;
      return h >>> 0;
    };

    const hashRand = (seed, a, b, c) => hashU32(seed, a, b, c) * 2.3283064365386963e-10;

    const createBuffer = (byteLength, useShared = true) => {
      if (useShared && typeof SharedArrayBuffer !== 'undefined') {
        try { return new SharedArrayBuffer(byteLength); } catch (_) {}
      }
      return new ArrayBuffer(byteLength);
    };

    Object.assign(Namespace, { setSeed, fastRand, hashU32, hashRand, createBuffer });
  })(_);
  //#endregion

  //#region 5: SimulationConfig
  ((Namespace, { setSeed }) => {
    const DEFAULT_GENES = [
      { name: 'red', hex: '#ff0000', cIdx: 0, prob: 10, cost: 0.0 },
      { name: 'green', hex: '#00ff00', cIdx: 1, prob: 30, cost: 0.0 },
      { name: 'blue', hex: '#0044ff', cIdx: 2, prob: 10, cost: 0.0 },
      { name: 'cyan', hex: '#00ffff', cIdx: 3, prob: 20, cost: 0.0 },
      { name: 'white', hex: '#ffffff', cIdx: 4, prob: 10, cost: 1.0 },
      { name: 'gray', hex: '#808080', cIdx: 5, prob: 10, cost: 1.0 },
      { name: 'yellow', hex: '#ffff00', cIdx: 6, prob: 10, cost: 0.0 },
    ];
    const DEFAULT_CONFIG = Object.freeze({
      SEED: 1337,
      WORLD_W: 2000,
      WORLD_H: 2000,
      RUB: 0.985,
      ELASTICITY: 0.75,
      INIT_O2: 0,
      INIT_CO2: 0,
      INIT_ORG_COUNT: 1000,
      INIT_ORG_ENERGY: 1000,
      MAX_AGE: 35,
      MUT: 0.05,
      SEGMENT_UPKEEP_DIVISOR: 5200,
      SUBSTANCES_DRAINAGE_DIVISOR: 1000,
      DEAD_ENERGY_LOSS: 0.08,
      PHOTO_ENERGY_DIVISOR: 400,
      CHEMO_OBTAINED_ENERGY: 0.6,
      CHEMO_RELEASED_PROP: 0.1,
      MAX_VEL: 4.5,
      MAX_ROT: Math.PI / 18,
      AUTO_GENESIS: true,
    });
    const Config = {
      ...DEFAULT_CONFIG,
      GENES: DEFAULT_GENES.map((g) => ({ ...g })),
      clamp: (v, min, max) => (v < min ? min : v > max ? max : v),
      resetToDefaults() {
        Object.assign(this, DEFAULT_CONFIG);
        this.GENES = DEFAULT_GENES.map((g) => ({ ...g }));
      },
      side: [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]],
      scales: [1, 1.12, 1.25, 1.4, 1.57, 1.76, 1.97, 2.21, 2.47, 2.77, 3.11, 3.48, 3.9, 4.36, 4.89, 5.47],
      PALETTE: { R: '#ff0000', G: '#00ff00', B: '#0044ff', C: '#00ffff', W: '#ffffff', GR: '#808080', Y: '#ffff00', BR: '#8c5228' },
      PALETTE_HEX: [0xff0000, 0x00ff00, 0x0044ff, 0x00ffff, 0xffffff, 0x808080, 0xffff00, 0x8c5228],
      PALETTE_INDICES: { '#ff0000': 0, '#00ff00': 1, '#0044ff': 2, '#00ffff': 3, '#ffffff': 4, '#808080': 5, '#ffff00': 6, '#8c5228': 7 },
      SEGMENT_UPKEEP: [1.8, 0.6, 2.2, 1.0, 2.0, 2.4, 1.3, 0.0],
    };
    setSeed(Config.SEED);
    Object.assign(Namespace, { DEFAULT_GENES, DEFAULT_CONFIG, Config });
  })(_, _);
  //#endregion

  //#region 6: GeneticCodeModel
  ((Namespace, { Config, fastRand }) => {
    class GeneticCode {
      static _dnaPool = [];
      static _genePool = [];
      static MAX_SCRATCH = 512;
      static scratchX1 = new Float32Array(512);
      static scratchY1 = new Float32Array(512);
      static scratchX2 = new Float32Array(512);
      static scratchY2 = new Float32Array(512);
      static scratchCIdx = new Uint8Array(512);

      static _allocGene(l, th, c, cIdx) {
        const g = GeneticCode._genePool.pop();
        if (g) { g.l = l; g.th = th; g.c = c; g.cIdx = cIdx; return g; }
        return { l, th, c, cIdx };
      }

      static _freeGenes(genes) {
        const pool = GeneticCode._genePool;
        for (let i = 0; i < genes.length; i++) if (pool.length < 16384) pool.push(genes[i]);
        genes.length = 0;
      }

      static acquire(parent = null) {
        const dna = GeneticCode._dnaPool.pop();
        if (dna) { dna._refs = 1; dna.init(parent); return dna; }
        return new GeneticCode(parent);
      }

      constructor(parent = null) {
        this.mirror = 0; this.sym = 2; this.disp = false;
        this.genes = []; this.repEnergy = 32; this._refs = 1;
        this.init(parent);
      }

      retain() { this._refs++; return this; }

      release() {
        if (--this._refs <= 0) {
          this._refs = 0;
          if (GeneticCode._dnaPool.length < 4096) GeneticCode._dnaPool.push(this);
          else GeneticCode._freeGenes(this.genes);
        }
      }

      static _rndColorObj() {
        const genes = Config.GENES;
        let total = 0;
        for (let i = 0; i < genes.length; i++) total += Math.max(0, Number(genes[i].prob) || 0);
        if (total <= 0) return genes[1];
        let r = fastRand() * total;
        for (let i = 0; i < genes.length; i++) {
          if ((r -= Math.max(0, Number(genes[i].prob) || 0)) <= 0) return genes[i];
        }
        return genes[1];
      }

      static _rndGene() {
        const cg = GeneticCode._rndColorObj();
        return GeneticCode._allocGene(6 + fastRand() * 14, fastRand() * Math.PI * 2, cg.hex, cg.cIdx ?? Config.PALETTE_INDICES[cg.hex] ?? 1);
      }

      init(parent = null) {
        if (this.genes.length > 0) GeneticCode._freeGenes(this.genes);
        const mut = () => fastRand() < Config.MUT;
        if (parent) {
          this.mirror = mut() ? (fastRand() < 0.5 ? 1 : 0) : parent.mirror;
          this.sym = mut() ? ((fastRand() * 8) | 0) + 1 : parent.sym;
          this.disp = mut() ? fastRand() < 0.5 : parent.disp;
          for (let i = 0; i < parent.genes.length; i++) {
            const g = parent.genes[i];
            const l = mut() ? Config.clamp(g.l + (fastRand() * 6 - 3), 4, 24) : g.l;
            const th = mut() ? (g.th + (fastRand() * 0.8 - 0.4) + Math.PI * 2) % (Math.PI * 2) : g.th;
            let c = g.c, cIdx = g.cIdx ?? Config.PALETTE_INDICES[c] ?? 1;
            if (mut()) {
              const cg = GeneticCode._rndColorObj();
              c = cg.hex; cIdx = cg.cIdx ?? Config.PALETTE_INDICES[c] ?? 1;
            }
            this.genes.push(GeneticCode._allocGene(l, th, c, cIdx));
          }
          if (mut()) {
            if (fastRand() < 0.55 && this.genes.length < 24) {
              this.genes.splice((fastRand() * this.genes.length) | 0, 0, GeneticCode._rndGene());
            } else if (this.genes.length > 2) {
              GeneticCode._freeGenes(this.genes.splice((fastRand() * this.genes.length) | 0, 1));
            }
          }
        } else {
          this.mirror = fastRand() < 0.55 ? 1 : 0;
          this.sym = ((fastRand() * 6) | 0) + 2;
          this.disp = fastRand() < 0.5;
          const len = ((fastRand() * 5) | 0) + 3;
          for (let i = 0; i < len; i++) this.genes.push(GeneticCode._rndGene());
        }
        this.repEnergy = 32 + 2.2 * this.genes.length * this.sym;
      }

      clone() {
        const c = GeneticCode.acquire(null);
        GeneticCode._freeGenes(c.genes);
        c.mirror = this.mirror; c.sym = this.sym; c.disp = this.disp;
        for (let i = 0; i < this.genes.length; i++) {
          const g = this.genes[i];
          c.genes.push(GeneticCode._allocGene(g.l, g.th, g.c, g.cIdx ?? Config.PALETTE_INDICES[g.c] ?? 1));
        }
        c.repEnergy = this.repEnergy;
        return c;
      }

      toShareCode() {
        return 'BIO1:' + btoa(JSON.stringify({
          s: this.sym, m: this.mirror ? 1 : 0, d: this.disp ? 1 : 0,
          g: this.genes.map((g) => [Number(g.l.toFixed(2)), Number(g.th.toFixed(3)), g.cIdx ?? Config.PALETTE_INDICES[g.c] ?? 1]),
        }));
      }

      static fromShareCode(code) {
        try {
          const raw = code.trim();
          const data = JSON.parse(raw.startsWith('BIO1:') ? atob(raw.slice(5)) : raw.startsWith('{') ? raw : atob(raw));
          const dna = GeneticCode.acquire(null);
          GeneticCode._freeGenes(dna.genes);
          dna.sym = Config.clamp(Number(data.s ?? data.sym) || 2, 1, 8);
          dna.mirror = (data.m ?? data.mirror) ? 1 : 0;
          dna.disp = Boolean(data.d ?? data.disp);
          const rg = Array.isArray(data.g) ? data.g : Array.isArray(data.genes) ? data.genes : [];
          for (let i = 0; i < rg.length && i < 32; i++) {
            const it = rg[i];
            const l = Config.clamp(Number(Array.isArray(it) ? it[0] : it.l) || 10, 4, 24);
            const th = Number(Array.isArray(it) ? it[1] : it.th) || 0;
            const cIdx = Config.clamp(Number(Array.isArray(it) ? it[2] : (it.cIdx ?? Config.PALETTE_INDICES[it.c] ?? 1)) | 0, 0, 6);
            dna.genes.push(GeneticCode._allocGene(l, th, Config.GENES[cIdx]?.hex || '#00ff00', cIdx));
          }
          if (!dna.genes.length) dna.genes.push(GeneticCode._rndGene());
          dna.repEnergy = 32 + 2.2 * dna.genes.length * dna.sym;
          return dna;
        } catch (_) { return null; }
      }

      buildIntoScratch(scale = 1) {
        const sx1 = GeneticCode.scratchX1, sy1 = GeneticCode.scratchY1;
        const sx2 = GeneticCode.scratchX2, sy2 = GeneticCode.scratchY2, scIdx = GeneticCode.scratchCIdx;
        const invScale = 1 / scale, sym = this.sym, genes = this.genes, gLen = genes.length, symStep = (2 * Math.PI) / sym;
        let count = 0;
        for (let i = 0; i < sym; i++) {
          let cx = 0, cy = 0, curTh = 0;
          const inv = this.mirror && (i & 1) !== 0;
          for (let j = 0; j < gLen; j++) {
            if (count >= GeneticCode.MAX_SCRATCH) return count;
            const g = genes[j], m = g.l * invScale;
            let vx, vy;
            if (j === 0) {
              const th = g.th + (i - (inv ? 1 : 0)) * symStep;
              vx = m * Math.cos(th) * (inv ? -1 : 1);
              vy = m * Math.sin(th);
              curTh = inv ? Math.PI - th : th;
            } else {
              curTh += inv ? -g.th : g.th;
              vx = m * Math.cos(curTh);
              vy = m * Math.sin(curTh);
            }
            sx1[count] = cx; sy1[count] = cy;
            cx += vx; cy += vy;
            sx2[count] = cx; sy2[count] = cy;
            scIdx[count] = g.cIdx ?? Config.PALETTE_INDICES[g.c] ?? 1;
            count++;
          }
        }
        return count;
      }

      buildSegments(scale = 1) {
        const count = this.buildIntoScratch(scale), lines = [];
        const sx1 = GeneticCode.scratchX1, sy1 = GeneticCode.scratchY1, sx2 = GeneticCode.scratchX2, sy2 = GeneticCode.scratchY2, sc = GeneticCode.scratchCIdx;
        for (let i = 0; i < count; i++) {
          lines.push({ x1: sx1[i], y1: sy1[i], x2: sx2[i], y2: sy2[i], c: Config.GENES[sc[i]]?.hex || '#00ff00' });
        }
        return lines;
      }
    }

    Object.assign(Namespace, { GeneticCode });
  })(_, _);
  //#endregion

  //#region 7: DnaPresets
  ((Namespace, { Config, GeneticCode }) => {
    const createPresetDna = (sym, mirror, disp, repEnergy, specs) => {
      const dna = GeneticCode.acquire(null);
      GeneticCode._freeGenes(dna.genes);
      dna.sym = sym; dna.mirror = mirror; dna.disp = disp; dna.repEnergy = repEnergy;
      for (const [l, th, c] of specs) dna.genes.push(GeneticCode._allocGene(l, th, c, Config.PALETTE_INDICES[c] ?? 1));
      return dna;
    };

    const Presets = {
      Plant: () => createPresetDna(6, 1, false, 45, [[12, 0.2, Config.PALETTE.G], [14, 0.8, Config.PALETTE.G], [10, 1.2, Config.PALETTE.G]]),
      Hunter: () => createPresetDna(3, 1, true, 55, [[15, 0.1, Config.PALETTE.R], [12, 1.5, Config.PALETTE.C], [8, 2.2, Config.PALETTE.R]]),
      ArmoredGrazer: () => createPresetDna(4, 1, false, 60, [[10, 0.4, Config.PALETTE.B], [16, 1.2, Config.PALETTE.B], [12, 2.4, Config.PALETTE.G]]),
      VirusVector: () => createPresetDna(2, 0, true, 40, [[16, 0.2, Config.PALETTE.W], [12, 1.6, Config.PALETTE.C], [10, 2.8, Config.PALETTE.Y]]),
    };

    Object.assign(Namespace, { createPresetDna, Presets });
  })(_, _);
  //#endregion

  //#region 8: SegmentArena
  ((Namespace, { createBuffer }) => {
    class SegmentArena {
      static MAX_CAPACITY = 262144;

      static calcByteLength(cap = SegmentArena.MAX_CAPACITY) {
        return cap * 24;
      }

      constructor(cap = SegmentArena.MAX_CAPACITY, existingBuffer = null, useShared = false) {
        this.capacity = cap;
        this.cursor = 0;
        this.reclaimable = 0;
        this.isShared = Boolean(existingBuffer || useShared);
        this._allocateBuffers(cap, existingBuffer, useShared);
      }

      _allocateBuffers(cap, existingBuffer = null, useShared = false) {
        const buf = existingBuffer || createBuffer(SegmentArena.calcByteLength(cap), useShared);
        this.buffer = buf;
        let off = 0;
        this.bsx = new Float32Array(buf, off, cap); off += cap * 4;
        this.bsy = new Float32Array(buf, off, cap); off += cap * 4;
        this.bex = new Float32Array(buf, off, cap); off += cap * 4;
        this.bey = new Float32Array(buf, off, cap); off += cap * 4;
        this.bm = new Float32Array(buf, off, cap); off += cap * 4;
        this.cIdx = new Uint8Array(buf, off, cap);
      }

      clear() { this.cursor = 0; this.reclaimable = 0; }

      alloc(count) {
        if (this.cursor + count > this.capacity) {
          if (this.isShared) {
            return Math.max(0, this.capacity - count);
          }
          this._grow(Math.max(this.capacity * 2, this.cursor + count + 4096));
        }
        const start = this.cursor;
        this.cursor += count;
        return start;
      }

      free(start, count) {
        if (count <= 0) return;
        if (start + count === this.cursor) this.cursor = start;
        else this.reclaimable += count;
      }

      shouldCompact() {
        return (this.reclaimable > 4096 && this.reclaimable > this.cursor >> 1) ||
          (this.isShared && this.cursor + 4096 > this.capacity && this.reclaimable > 0);
      }

      compact(orgs) {
        let write = 0;
        for (let i = 0; i < orgs.length; i++) {
          const o = orgs[i], count = o.segCount;
          if (!count) continue;
          const read = o.segStart;
          if (read !== write) {
            const end = read + count;
            this.bsx.copyWithin(write, read, end); this.bsy.copyWithin(write, read, end);
            this.bex.copyWithin(write, read, end); this.bey.copyWithin(write, read, end);
            this.bm.copyWithin(write, read, end); this.cIdx.copyWithin(write, read, end);
            o.segStart = write;
          }
          write += count;
        }
        this.cursor = write; this.reclaimable = 0;
      }

      _grow(newCap) {
        const { bsx, bsy, bex, bey, bm, cIdx } = this;
        this.capacity = newCap;
        this._allocateBuffers(newCap, null, false);
        this.bsx.set(bsx); this.bsy.set(bsy); this.bex.set(bex); this.bey.set(bey); this.bm.set(bm); this.cIdx.set(cIdx);
      }
    }

    Object.assign(Namespace, { SegmentArena });
  })(_, _);
  //#endregion

  //#region 9: SpatialGrid
  ((Namespace, { createBuffer }) => {
    class SpatialGrid {
      static MAX_CELLS = 65536;
      static MAX_NODES = 65536;
      static MAX_ORGS = 16384;

      static META = Object.freeze({
        COLS: 0,
        ROWS: 1,
        ACTIVE_CELL_COUNT: 2,
        NODE_COUNT: 3,
        ORG_COUNT: 4,
      });

      static calcByteLength() {
        const M = 8 * 4;
        const C = SpatialGrid.MAX_CELLS * 4 * 2;
        const N = SpatialGrid.MAX_NODES * 4 * 2;
        const O = SpatialGrid.MAX_ORGS * (4 * 6 + 2 * 2 + 4);
        return M + C + N + O + 64;
      }

      constructor(cellSize = 90, existingBuffer = null, useShared = false) {
        this.cellSize = cellSize;
        this.invCellSize = 1 / cellSize;
        this.maxCells = SpatialGrid.MAX_CELLS;
        this.nodeCap = SpatialGrid.MAX_NODES;
        this.orgCap = SpatialGrid.MAX_ORGS;
        this._visitStamp = 1;
        this.orgsRef = [];
        this._attachBuffer(existingBuffer || createBuffer(SpatialGrid.calcByteLength(), useShared));
      }

      _attachBuffer(buf) {
        this.buffer = buf;
        let off = 0;
        this.metaI32 = new Int32Array(buf, off, 8); off += 32;
        this.cellHeads = new Int32Array(buf, off, this.maxCells); off += this.maxCells * 4;
        this.activeCells = new Int32Array(buf, off, this.maxCells); off += this.maxCells * 4;
        this.nodeOrgIdx = new Int32Array(buf, off, this.nodeCap); off += this.nodeCap * 4;
        this.nodeNext = new Int32Array(buf, off, this.nodeCap); off += this.nodeCap * 4;
        this.orgCx = new Float32Array(buf, off, this.orgCap); off += this.orgCap * 4;
        this.orgCy = new Float32Array(buf, off, this.orgCap); off += this.orgCap * 4;
        this.orgR = new Float32Array(buf, off, this.orgCap); off += this.orgCap * 4;
        this.orgSlot = new Int32Array(buf, off, this.orgCap); off += this.orgCap * 4;
        this.orgId = new Int32Array(buf, off, this.orgCap); off += this.orgCap * 4;
        this.orgVisit = new Uint32Array(buf, off, this.orgCap); off += this.orgCap * 4;
        this.orgGx1 = new Int16Array(buf, off, this.orgCap); off += this.orgCap * 2;
        this.orgGy1 = new Int16Array(buf, off, this.orgCap); off += this.orgCap * 2;
        this.orgMulti = new Uint8Array(buf, off, this.orgCap);
      }

      get cols() { return this.metaI32[0]; }
      set cols(v) { this.metaI32[0] = v; }
      get rows() { return this.metaI32[1]; }
      set rows(v) { this.metaI32[1] = v; }
      get activeCellCount() { return this.metaI32[2]; }
      set activeCellCount(v) { this.metaI32[2] = v; }
      get nodeCount() { return this.metaI32[3]; }
      set nodeCount(v) { this.metaI32[3] = v; }
      get orgCount() { return this.metaI32[4]; }
      set orgCount(v) { this.metaI32[4] = v; }

      init(width, height) {
        const cols = Math.min(250, Math.ceil(width * this.invCellSize) + 2);
        const rows = Math.min(250, Math.ceil(height * this.invCellSize) + 2);
        if (cols !== this.cols || rows !== this.rows) {
          this.cols = cols;
          this.rows = rows;
          this.cellHeads.fill(-1, 0, cols * rows);
          this.activeCellCount = 0;
        }
      }

      clear() {
        const activeCount = this.activeCellCount;
        const total = this.cols * this.rows;
        if (activeCount < total >> 2) {
          for (let i = 0; i < activeCount; i++) this.cellHeads[this.activeCells[i]] = -1;
        } else {
          this.cellHeads.fill(-1, 0, total);
        }
        this.activeCellCount = 0;
        this.nodeCount = 0;
        this.orgCount = 0;
        this.orgsRef.length = 0;
      }

      insert(o) {
        const cols = this.cols, rows = this.rows, inv = this.invCellSize;
        if (!cols || !rows) return;
        const orgIdx = this.orgsRef.length;
        if (orgIdx >= this.orgCap) return;
        this.orgsRef.push(o);
        this.orgCount = orgIdx + 1;

        let x1 = (o.x * inv) | 0, y1 = (o.y * inv) | 0, x2 = ((o.x + o.w) * inv) | 0, y2 = ((o.y + o.h) * inv) | 0;
        x1 = x1 < 0 ? 0 : x1 >= cols ? cols - 1 : x1;
        y1 = y1 < 0 ? 0 : y1 >= rows ? rows - 1 : y1;
        x2 = x2 < 0 ? 0 : x2 >= cols ? cols - 1 : x2;
        y2 = y2 < 0 ? 0 : y2 >= rows ? rows - 1 : y2;

        const multi = x1 !== x2 || y1 !== y2 ? 1 : 0;
        o.gx1 = x1; o.gy1 = y1; o.gx2 = x2; o.gy2 = y2; o.multiCell = multi === 1;
        this.orgCx[orgIdx] = o.cx;
        this.orgCy[orgIdx] = o.cy;
        this.orgR[orgIdx] = o.energy > 0.01 ? o.r : -9999;
        this.orgSlot[orgIdx] = o.slot;
        this.orgId[orgIdx] = o.id;
        this.orgGx1[orgIdx] = x1;
        this.orgGy1[orgIdx] = y1;
        this.orgMulti[orgIdx] = multi;

        const heads = this.cellHeads, active = this.activeCells;
        let aCount = this.activeCellCount, nCount = this.nodeCount;

        if (!multi) {
          if (nCount >= this.nodeCap) return;
          const cellIdx = y1 * cols + x1, head = heads[cellIdx];
          if (head === -1) active[aCount++] = cellIdx;
          const node = nCount++;
          this.nodeOrgIdx[node] = orgIdx;
          this.nodeNext[node] = head;
          heads[cellIdx] = node;
          this.activeCellCount = aCount;
          this.nodeCount = nCount;
          return;
        }

        for (let y = y1; y <= y2; y++) {
          const rowOff = y * cols;
          for (let x = x1; x <= x2; x++) {
            if (nCount >= this.nodeCap) break;
            const cellIdx = rowOff + x, head = heads[cellIdx];
            if (head === -1) active[aCount++] = cellIdx;
            const node = nCount++;
            this.nodeOrgIdx[node] = orgIdx;
            this.nodeNext[node] = head;
            heads[cellIdx] = node;
          }
        }
        this.activeCellCount = aCount;
        this.nodeCount = nCount;
      }

      hasBoxOverlap(ox, oy, ow, oh, ignore1 = null, ignore2 = null) {
        const cols = this.cols, rows = this.rows, inv = this.invCellSize;
        if (!cols || !rows) return false;
        const ox2 = ox + ow, oy2 = oy + oh;
        const x1 = Math.max(0, (ox * inv) | 0), y1 = Math.max(0, (oy * inv) | 0);
        const x2 = Math.min(cols - 1, (ox2 * inv) | 0), y2 = Math.min(rows - 1, (oy2 * inv) | 0);
        const { cellHeads: heads, nodeNext: nexts, nodeOrgIdx: orgIdxs, orgR, orgsRef } = this;

        for (let y = y1; y <= y2; y++) {
          const rowOff = y * cols;
          for (let x = x1; x <= x2; x++) {
            for (let node = heads[rowOff + x]; node !== -1; node = nexts[node]) {
              const idx = orgIdxs[node];
              if (orgR[idx] < 0) continue;
              const b = orgsRef[idx];
              if (b !== ignore1 && b !== ignore2 && b.energy > 0.01 && !(ox2 < b.x || ox > b.x + b.w || oy2 < b.y || oy > b.y + b.h)) {
                return true;
              }
            }
          }
        }
        return false;
      }

      hasAABBOverlap(o, ignore = null) { return this.hasBoxOverlap(o.x, o.y, o.w, o.h, o, ignore); }

      forEachInBox(minX, minY, maxX, maxY, cb) {
        const cols = this.cols, rows = this.rows, inv = this.invCellSize;
        if (!cols || !rows) return;
        const x1 = Math.max(0, (minX * inv) | 0), y1 = Math.max(0, (minY * inv) | 0);
        const x2 = Math.min(cols - 1, (maxX * inv) | 0), y2 = Math.min(rows - 1, (maxY * inv) | 0);
        const stamp = (this._visitStamp = (this._visitStamp + 1) >>> 0 || 1);
        const { orgVisit: visit, cellHeads: heads, nodeNext: nexts, nodeOrgIdx: orgIdxs, orgsRef } = this;

        for (let y = y1; y <= y2; y++) {
          const rowOff = y * cols;
          for (let x = x1; x <= x2; x++) {
            for (let node = heads[rowOff + x]; node !== -1; node = nexts[node]) {
              const idx = orgIdxs[node];
              if (visit[idx] !== stamp) { visit[idx] = stamp; cb(orgsRef[idx]); }
            }
          }
        }
      }

      hitTestWorld(wx, wy, orgArena) {
        const cols = Atomics.load(this.metaI32, 0), rows = Atomics.load(this.metaI32, 1);
        if (!cols || !rows) return null;
        const gx = (wx * this.invCellSize) | 0, gy = (wy * this.invCellSize) | 0;
        const x1 = Math.max(0, gx - 1), x2 = Math.min(cols - 1, gx + 1);
        const y1 = Math.max(0, gy - 1), y2 = Math.min(rows - 1, gy + 1);
        const { cellHeads: heads, nodeNext: nexts, nodeOrgIdx: orgIdxs, orgCx, orgCy, orgR, orgSlot, orgId } = this;
        let best = null;

        for (let y = y1; y <= y2; y++) {
          const rowOff = y * cols;
          for (let x = x1; x <= x2; x++) {
            let guard = 0;
            for (let node = heads[rowOff + x]; node !== -1 && guard < 2048; node = nexts[node], guard++) {
              const idx = orgIdxs[node];
              if (idx < 0 || idx >= this.orgCap) break;
              const r = orgR[idx];
              if (r < 0) continue;
              const cx = orgCx[idx], cy = orgCy[idx];
              if ((wx - cx) ** 2 + (wy - cy) ** 2 <= (r + 5) ** 2) {
                const id = orgId[idx], slot = orgSlot[idx];
                if (!best || id > best.id) {
                  best = {
                    id,
                    cx,
                    cy,
                    r,
                    w: orgArena ? orgArena.w[slot] : r * 2,
                    h: orgArena ? orgArena.h[slot] : r * 2,
                  };
                }
              }
            }
          }
        }
        return best;
      }
    }

    Object.assign(Namespace, { SpatialGrid });
  })(_, _);
  //#endregion

  //#region 10: OrganismEntity
  ((Namespace, { Config, fastRand, hashRand, createBuffer, GeneticCode }) => {
    class OrganismArena {
      static MAX_ORGS = 16384;

      static calcByteLength(cap = OrganismArena.MAX_ORGS) {
        return cap * 192;
      }

      constructor(cap = OrganismArena.MAX_ORGS, existingBuffer = null, useShared = false) {
        this.capacity = cap;
        this.freeList = [];
        this.cursor = 0;
        this._attachBuffer(existingBuffer || createBuffer(OrganismArena.calcByteLength(cap), useShared));
      }

      _attachBuffer(buf) {
        this.buffer = buf;
        const cap = this.capacity;
        let off = 0;
        const f32 = () => { const a = new Float32Array(buf, off, cap); off += cap * 4; return a; };
        const i32 = () => { const a = new Int32Array(buf, off, cap); off += cap * 4; return a; };
        const u16 = () => { const a = new Uint16Array(buf, off, cap); off += cap * 2; return a; };
        const u8 = () => { const a = new Uint8Array(buf, off, cap); off += cap; return a; };
        const i8 = () => { const a = new Int8Array(buf, off, cap); off += cap; return a; };

        this.cx = f32(); this.cy = f32();
        this.dx = f32(); this.dy = f32();
        this.th = f32(); this.dth = f32();
        this.cosTh = f32(); this.sinTh = f32(); this.segTh = f32();
        this.r = f32(); this.w = f32(); this.h = f32();
        this.x = f32(); this.y = f32();
        this.invScale = f32();
        this.energy = f32();
        this.mass = f32(); this.I = f32();
        this.upkeepMass = f32(); this.upkeepPower = f32(); this.photoMass = f32();
        this.baseMass = f32(); this.baseUpkeepMass = f32(); this.basePhotoMass = f32();
        this.baseI = f32(); this.baseR = f32();
        this.baseMinX = f32(); this.baseMaxX = f32(); this.baseMinY = f32(); this.baseMaxY = f32();
        this.relMinX = f32(); this.relMaxX = f32(); this.relMinY = f32(); this.relMaxY = f32();

        this.id = i32(); this.pId = i32();
        this.age = i32(); this.gen = i32(); this.infGen = i32();
        this.segStart = i32(); this.segCount = i32();

        this.ciliaCount = u16(); this.kids = u16(); this.kills = u16(); this.infected = u16();
        this.growth = u8(); this.repTime = u8(); this.nKids = u8(); this.alive = u8();
        this.domColorIdx = u8(); this.flashIdx = i8(); this.flashFrames = u8(); this.hasGrown = i8();
      }

      clear() {
        this.cursor = 0;
        this.freeList.length = 0;
      }

      allocSlot() {
        if (this.freeList.length > 0) return this.freeList.pop();
        if (this.cursor < this.capacity) return this.cursor++;
        return this.capacity - 1;
      }

      freeSlot(slot) {
        this.energy[slot] = 0;
        this.alive[slot] = 0;
        this.freeList.push(slot);
      }
    }

    class ContactBuffer {
      static MAX_CONTACTS = 16384;

      static calcByteLength(cap = ContactBuffer.MAX_CONTACTS) {
        return cap * 56;
      }

      constructor(cap = ContactBuffer.MAX_CONTACTS, existingBuffer = null, useShared = false) {
        this.capacity = cap;
        const buf = existingBuffer || createBuffer(ContactBuffer.calcByteLength(cap), useShared);
        this.buffer = buf;
        let off = 0;
        const i32 = () => { const a = new Int32Array(buf, off, cap); off += cap * 4; return a; };
        const f32 = () => { const a = new Float32Array(buf, off, cap); off += cap * 4; return a; };

        this.idA = i32(); this.idB = i32();
        this.slotA = i32(); this.slotB = i32();
        this.segA = i32(); this.segB = i32();
        this.order = i32(); this.thisOrg = i32();
        this.px = f32(); this.py = f32();
        this.lx1 = f32(); this.ly1 = f32();
        this.lx2 = f32(); this.ly2 = f32();
      }
    }

    function detectCellContactsSoA(
      cellSlotStart, cellSlotEnd, grid, orgArena, segArena, contactBuf, syncI32, countIdx, scratch
    ) {
      const cols = grid.metaI32[0];
      const {
        cellHeads: heads, activeCells: active, nodeNext: nexts, nodeOrgIdx: orgIdxs,
        orgCx, orgCy, orgR, orgSlot, orgId, orgGx1, orgGy1, orgMulti,
      } = grid;
      const {
        invScale: oInv, cosTh: oCos, sinTh: oSin,
        baseMinX: oMinX, baseMaxX: oMaxX, baseMinY: oMinY, baseMaxY: oMaxY,
        segStart: oSegStart, segCount: oSegCount,
      } = orgArena;
      const { bsx, bsy, bex, bey, bm } = segArena;
      const { candIdx, candMinX, candMaxX, candMinY, candMaxY, candBx1, candBy1, candDx2, candDy2 } = scratch;
      const maxContacts = contactBuf.capacity;

      for (let a = cellSlotStart; a < cellSlotEnd; a++) {
        const cellIdx = active[a];
        let n1 = heads[cellIdx];
        if (n1 === -1 || nexts[n1] === -1) continue;
        const cy = (cellIdx / cols) | 0, cx = cellIdx - cy * cols;

        for (; n1 !== -1; n1 = nexts[n1]) {
          const i1 = orgIdxs[n1], r1 = orgR[i1];
          if (r1 < 0) continue;
          const cx1 = orgCx[i1], cy1 = orgCy[i1], m1 = orgMulti[i1], gx1 = orgGx1[i1], gy1 = orgGy1[i1];

          for (let n2 = nexts[n1]; n2 !== -1; n2 = nexts[n2]) {
            const i2 = orgIdxs[n2], r2 = orgR[i2];
            if (r2 < 0) continue;
            if (m1 && orgMulti[i2]) {
              if (cx !== (gx1 > orgGx1[i2] ? gx1 : orgGx1[i2]) || cy !== (gy1 > orgGy1[i2] ? gy1 : orgGy1[i2])) continue;
            }
            const dx = cx1 - orgCx[i2], dy = cy1 - orgCy[i2], rSum = r1 + r2;
            if (dx * dx + dy * dy > rSum * rSum) continue;

            const id1 = orgId[i1], id2 = orgId[i2];
            const firstIs1 = id1 < id2;
            const sA = firstIs1 ? orgSlot[i1] : orgSlot[i2];
            const sB = firstIs1 ? orgSlot[i2] : orgSlot[i1];
            const idA = firstIs1 ? id1 : id2;
            const idB = firstIs1 ? id2 : id1;
            const cxA = firstIs1 ? cx1 : orgCx[i2], cyA = firstIs1 ? cy1 : orgCy[i2];
            const cxB = firstIs1 ? orgCx[i2] : cx1, cyB = firstIs1 ? orgCy[i2] : cy1;
            const rB = firstIs1 ? r2 : r1;

            const dcx = cxB - cxA, dcy = cyB - cyA;
            const inv1 = oInv[sA], inv2 = oInv[sB], cos1 = oCos[sA], sin1 = oSin[sA];
            const rcx = dcx * cos1 + dcy * sin1, rcy = -dcx * sin1 + dcy * cos1;

            const overMinX = Math.max(oMinX[sA] * inv1, rcx - rB), overMaxX = Math.min(oMaxX[sA] * inv1, rcx + rB);
            if (overMaxX < overMinX) continue;
            const overMinY = Math.max(oMinY[sA] * inv1, rcy - rB), overMaxY = Math.min(oMaxY[sA] * inv1, rcy + rB);
            if (overMaxY < overMinY) continue;

            const cos2 = oCos[sB], sin2 = oSin[sB];
            const c21 = (cos2 * cos1 + sin2 * sin1) * inv2, s21 = (sin2 * cos1 - cos2 * sin1) * inv2;
            const minBm2 = 0.5 / inv2, start2 = oSegStart[sB], end2 = start2 + oSegCount[sB];
            let candCount = 0;

            for (let j = end2 - 1; j >= start2; j--) {
              if (bm[j] < minBm2) continue;
              const sx2 = bsx[j], sy2 = bsy[j], ex2 = bex[j], ey2 = bey[j];
              const bx1 = rcx + sx2 * c21 - sy2 * s21, by1 = rcy + sx2 * s21 + sy2 * c21;
              const bx2 = rcx + ex2 * c21 - ey2 * s21, by2 = rcy + ex2 * s21 + ey2 * c21;
              const s2MinX = bx1 < bx2 ? bx1 : bx2, s2MaxX = bx1 > bx2 ? bx1 : bx2;
              if (s2MinX > overMaxX || s2MaxX < overMinX) continue;
              const s2MinY = by1 < by2 ? by1 : by2, s2MaxY = by1 > by2 ? by1 : by2;
              if (s2MinY > overMaxY || s2MaxY < overMinY) continue;

              candIdx[candCount] = j; candMinX[candCount] = s2MinX; candMaxX[candCount] = s2MaxX;
              candMinY[candCount] = s2MinY; candMaxY[candCount] = s2MaxY; candBx1[candCount] = bx1;
              candBy1[candCount] = by1; candDx2[candCount] = bx2 - bx1; candDy2[candCount] = by2 - by1;
              if (++candCount >= 512) break;
            }
            if (!candCount) continue;

            const minBm1 = 0.5 / inv1, start1 = oSegStart[sA], end1 = start1 + oSegCount[sA];
            let contactEffects = 0;

            for (let i = end1 - 1; i >= start1; i--) {
              if (bm[i] < minBm1) continue;
              const ax1 = bsx[i] * inv1, ay1 = bsy[i] * inv1, ax2 = bex[i] * inv1, ay2 = bey[i] * inv1;
              const s1MinX = ax1 < ax2 ? ax1 : ax2, s1MaxX = ax1 > ax2 ? ax1 : ax2;
              if (s1MinX > overMaxX || s1MaxX < overMinX) continue;
              const s1MinY = ay1 < ay2 ? ay1 : ay2, s1MaxY = ay1 > ay2 ? ay1 : ay2;
              if (s1MinY > overMaxY || s1MaxY < overMinY) continue;

              const dx1 = ax2 - ax1, dy1 = ay2 - ay1;
              for (let k = 0; k < candCount; k++) {
                if (s1MaxX < candMinX[k] || s1MinX > candMaxX[k] || s1MaxY < candMinY[k] || s1MinY > candMaxY[k]) continue;
                const dx2 = candDx2[k], dy2 = candDy2[k], d = dy2 * dx1 - dx2 * dy1;
                if (d > -1e-9 && d < 1e-9) continue;

                const bx1 = candBx1[k], by1 = candBy1[k], qx = ax1 - bx1, qy = ay1 - by1;
                const ua = (dx2 * qy - dy2 * qx) / d;
                if (ua < 0 || ua > 1) continue;
                const ub = (dx1 * qy - dy1 * qx) / d;
                if (ub < 0 || ub > 1) continue;

                const cSlot = Atomics.add(syncI32, countIdx, 1);
                if (cSlot < maxContacts) {
                  contactBuf.idA[cSlot] = idA;
                  contactBuf.idB[cSlot] = idB;
                  contactBuf.slotA[cSlot] = sA;
                  contactBuf.slotB[cSlot] = sB;
                  contactBuf.segA[cSlot] = i;
                  contactBuf.segB[cSlot] = candIdx[k];
                  contactBuf.order[cSlot] = contactEffects;

                  if (contactEffects === 0) {
                    const interLx = ax1 + ua * dx1, interLy = ay1 + ua * dy1;
                    const bx2 = bx1 + dx2, by2 = by1 + dy2;
                    const minA = Math.min((interLx - ax1) ** 2 + (interLy - ay1) ** 2, (interLx - ax2) ** 2 + (interLy - ay2) ** 2);
                    const minB = Math.min((interLx - bx1) ** 2 + (interLy - by1) ** 2, (interLx - bx2) ** 2 + (interLy - by2) ** 2);
                    contactBuf.px[cSlot] = cxA + interLx * cos1 - interLy * sin1;
                    contactBuf.py[cSlot] = cyA + interLx * sin1 + interLy * cos1;
                    if (minA < minB) {
                      contactBuf.thisOrg[cSlot] = 0;
                      contactBuf.lx1[cSlot] = cxA + bx1 * cos1 - by1 * sin1;
                      contactBuf.ly1[cSlot] = cyA + bx1 * sin1 + by1 * cos1;
                      contactBuf.lx2[cSlot] = cxA + bx2 * cos1 - by2 * sin1;
                      contactBuf.ly2[cSlot] = cyA + bx2 * sin1 + by2 * cos1;
                    } else {
                      contactBuf.thisOrg[cSlot] = 1;
                      contactBuf.lx1[cSlot] = cxA + ax1 * cos1 - ay1 * sin1;
                      contactBuf.ly1[cSlot] = cyA + ax1 * sin1 + ay1 * cos1;
                      contactBuf.lx2[cSlot] = cxA + ax2 * cos1 - ay2 * sin1;
                      contactBuf.ly2[cSlot] = cyA + ax2 * sin1 + ay2 * cos1;
                    }
                  }
                }

                if (++contactEffects >= 4) break;
              }
              if (contactEffects >= 4) break;
            }
          }
        }
      }
    }

    class Organism {
      static MAX_CAND = 512;
      static MAX_CONTACT_EFFECTS = 4;
      static _colorMassScratch = new Float32Array(8);

      constructor(world, dna = null) {
        this.world = world;
        this.oa = world.orgArena;
        this.slot = this.oa.allocSlot();
        this.dna = null;
        this.infDna = null;
        this._builtDna = null;
        this.gx1 = 0; this.gy1 = 0; this.gx2 = 0; this.gy2 = 0;
        this.multiCell = false;
        this.flashColor = null;
        this.reset(dna);
      }

      get cx() { return this.oa.cx[this.slot]; }
      set cx(v) { this.oa.cx[this.slot] = v; }
      get cy() { return this.oa.cy[this.slot]; }
      set cy(v) { this.oa.cy[this.slot] = v; }
      get dx() { return this.oa.dx[this.slot]; }
      set dx(v) { this.oa.dx[this.slot] = v; }
      get dy() { return this.oa.dy[this.slot]; }
      set dy(v) { this.oa.dy[this.slot] = v; }
      get th() { return this.oa.th[this.slot]; }
      set th(v) { this.oa.th[this.slot] = v; }
      get dth() { return this.oa.dth[this.slot]; }
      set dth(v) { this.oa.dth[this.slot] = v; }
      get cosTh() { return this.oa.cosTh[this.slot]; }
      set cosTh(v) { this.oa.cosTh[this.slot] = v; }
      get sinTh() { return this.oa.sinTh[this.slot]; }
      set sinTh(v) { this.oa.sinTh[this.slot] = v; }
      get segTh() { return this.oa.segTh[this.slot]; }
      set segTh(v) { this.oa.segTh[this.slot] = v; }
      get r() { return this.oa.r[this.slot]; }
      set r(v) { this.oa.r[this.slot] = v; }
      get w() { return this.oa.w[this.slot]; }
      set w(v) { this.oa.w[this.slot] = v; }
      get h() { return this.oa.h[this.slot]; }
      set h(v) { this.oa.h[this.slot] = v; }
      get x() { return this.oa.x[this.slot]; }
      set x(v) { this.oa.x[this.slot] = v; }
      get y() { return this.oa.y[this.slot]; }
      set y(v) { this.oa.y[this.slot] = v; }
      get invScale() { return this.oa.invScale[this.slot]; }
      set invScale(v) { this.oa.invScale[this.slot] = v; }
      get energy() { return this.oa.energy[this.slot]; }
      set energy(v) { this.oa.energy[this.slot] = v; }
      get mass() { return this.oa.mass[this.slot]; }
      set mass(v) { this.oa.mass[this.slot] = v; }
      get I() { return this.oa.I[this.slot]; }
      set I(v) { this.oa.I[this.slot] = v; }
      get upkeepMass() { return this.oa.upkeepMass[this.slot]; }
      set upkeepMass(v) { this.oa.upkeepMass[this.slot] = v; }
      get upkeepPower() { return this.oa.upkeepPower[this.slot]; }
      set upkeepPower(v) { this.oa.upkeepPower[this.slot] = v; }
      get photoMass() { return this.oa.photoMass[this.slot]; }
      set photoMass(v) { this.oa.photoMass[this.slot] = v; }
      get id() { return this.oa.id[this.slot]; }
      set id(v) { this.oa.id[this.slot] = v; }
      get pId() { return this.oa.pId[this.slot]; }
      set pId(v) { this.oa.pId[this.slot] = v; }
      get age() { return this.oa.age[this.slot]; }
      set age(v) { this.oa.age[this.slot] = v; }
      get gen() { return this.oa.gen[this.slot]; }
      set gen(v) { this.oa.gen[this.slot] = v; }
      get infGen() { return this.oa.infGen[this.slot]; }
      set infGen(v) { this.oa.infGen[this.slot] = v; }
      get segStart() { return this.oa.segStart[this.slot]; }
      set segStart(v) { this.oa.segStart[this.slot] = v; }
      get segCount() { return this.oa.segCount[this.slot]; }
      set segCount(v) { this.oa.segCount[this.slot] = v; }
      get ciliaCount() { return this.oa.ciliaCount[this.slot]; }
      set ciliaCount(v) { this.oa.ciliaCount[this.slot] = v; }
      get kids() { return this.oa.kids[this.slot]; }
      set kids(v) { this.oa.kids[this.slot] = v; }
      get kills() { return this.oa.kills[this.slot]; }
      set kills(v) { this.oa.kills[this.slot] = v; }
      get infected() { return this.oa.infected[this.slot]; }
      set infected(v) { this.oa.infected[this.slot] = v; }
      get growth() { return this.oa.growth[this.slot]; }
      set growth(v) { this.oa.growth[this.slot] = v; }
      get repTime() { return this.oa.repTime[this.slot]; }
      set repTime(v) { this.oa.repTime[this.slot] = v; }
      get nKids() { return this.oa.nKids[this.slot]; }
      set nKids(v) { this.oa.nKids[this.slot] = v; }
      get alive() { return this.oa.alive[this.slot] === 1; }
      set alive(v) { this.oa.alive[this.slot] = v ? 1 : 0; }
      get domColorIdx() { return this.oa.domColorIdx[this.slot]; }
      set domColorIdx(v) { this.oa.domColorIdx[this.slot] = v; }
      get flashIdx() { return this.oa.flashIdx[this.slot]; }
      set flashIdx(v) { this.oa.flashIdx[this.slot] = v; }
      get flashFrames() { return this.oa.flashFrames[this.slot]; }
      set flashFrames(v) { this.oa.flashFrames[this.slot] = v; }

      reset(dna = null) {
        if (this.dna && this.dna !== dna) this.dna.release();
        if (this.infDna) { this.infDna.release(); this.infDna = null; }
        this.dna = dna; this._builtDna = null;
        const s = this.slot, oa = this.oa;
        oa.alive[s] = 1;
        oa.age[s] = 0; oa.gen[s] = 1; oa.infGen[s] = 0; oa.pId[s] = -1;
        oa.id[s] = this.world.nextID++;
        oa.kids[s] = 0; oa.kills[s] = 0; oa.infected[s] = 0;
        oa.energy[s] = Config.INIT_ORG_ENERGY;
        const th = fastRand() * Math.PI * 2;
        oa.th[s] = th; oa.cosTh[s] = Math.cos(th); oa.sinTh[s] = Math.sin(th); oa.segTh[s] = -999;
        oa.dx[s] = (fastRand() - 0.5) * 0.8; oa.dy[s] = (fastRand() - 0.5) * 0.8; oa.dth[s] = (fastRand() - 0.5) * 0.02;
        oa.growth[s] = 16; oa.invScale[s] = 1 / Config.scales[15]; oa.hasGrown[s] = 0; oa.repTime[s] = 25;
        oa.cx[s] = 0; oa.cy[s] = 0; oa.w[s] = 0; oa.h[s] = 0; oa.x[s] = 0; oa.y[s] = 0; oa.r[s] = 4;
        oa.baseMinX[s] = -4; oa.baseMaxX[s] = 4; oa.baseMinY[s] = -4; oa.baseMaxY[s] = 4;
        oa.relMinX[s] = -4; oa.relMaxX[s] = 4; oa.relMinY[s] = -4; oa.relMaxY[s] = 4;
        this.flashColor = null; oa.flashIdx[s] = -1; oa.flashFrames[s] = 0;
        oa.baseMass[s] = 1; oa.baseUpkeepMass[s] = 1; oa.basePhotoMass[s] = 0; oa.baseI[s] = 1; oa.baseR[s] = 3;
        oa.nKids[s] = 1; oa.ciliaCount[s] = 0; oa.domColorIdx[s] = 1;
        oa.mass[s] = 1; oa.upkeepMass[s] = 1; oa.upkeepPower[s] = 1; oa.photoMass[s] = 0; oa.I[s] = 1;
        if (this.dna) { this.symmetric(true); this.calcBounds(true); }
        return this;
      }

      symmetric(forceRebuild = false) {
        const activeDna = this.infDna || this.dna;
        if (!activeDna) return;
        if (forceRebuild || this._builtDna !== activeDna || this.oa.segCount[this.slot] === 0) {
          this._buildBasePhenotype(activeDna);
        }
        this._applyGrowthScale();
      }

      _buildBasePhenotype(activeDna) {
        const count = activeDna.buildIntoScratch(1), arena = this.world.arena, s = this.slot, oa = this.oa;
        const curCount = oa.segCount[s];
        if (curCount !== count) {
          if (curCount > 0) arena.free(oa.segStart[s], curCount);
          oa.segStart[s] = arena.alloc(count);
          oa.segCount[s] = count;
        }
        const rawX1 = GeneticCode.scratchX1, rawY1 = GeneticCode.scratchY1, rawX2 = GeneticCode.scratchX2, rawY2 = GeneticCode.scratchY2, rawC = GeneticCode.scratchCIdx;
        let minX = 0, maxX = 0, minY = 0, maxY = 0, totalCilia = 0;
        const isAlive = oa.alive[s] === 1;

        for (let i = 0; i < count; i++) {
          const x1 = rawX1[i], y1 = rawY1[i], x2 = rawX2[i], y2 = rawY2[i];
          if (x1 < minX) minX = x1; if (x2 < minX) minX = x2;
          if (x1 > maxX) maxX = x1; if (x2 > maxX) maxX = x2;
          if (y1 < minY) minY = y1; if (y2 < minY) minY = y2;
          if (y1 > maxY) maxY = y1; if (y2 > maxY) maxY = y2;
          if (isAlive && rawC[i] === 3) totalCilia++;
        }

        const cx = (minX + maxX) * 0.5, cy = (minY + maxY) * 0.5;
        oa.baseMinX[s] = minX - cx; oa.baseMaxX[s] = maxX - cx;
        oa.baseMinY[s] = minY - cy; oa.baseMaxY[s] = maxY - cy;

        let baseMass = 0, baseUpkeepMass = 0, basePhotoMass = 0, baseI = 0, maxRSq = 0, nKids = 1;
        const colorMass = Organism._colorMassScratch;
        colorMass.fill(0);

        const { bsx, bsy, bex, bey, bm, cIdx: segCIdx } = arena;
        let ciliaCursor = oa.segStart[s], otherCursor = ciliaCursor + totalCilia;

        for (let i = 0; i < count; i++) {
          const sx = rawX1[i] - cx, sy = rawY1[i] - cy, ex = rawX2[i] - cx, ey = rawY2[i] - cy;
          const d1Sq = sx * sx + sy * sy, d2Sq = ex * ex + ey * ey;
          if (d1Sq > maxRSq) maxRSq = d1Sq;
          if (d2Sq > maxRSq) maxRSq = d2Sq;

          const m = Math.max(0.1, Math.hypot(ex - sx, ey - sy));
          const mx = (sx + ex) * 0.5, my = (sy + ey) * 0.5;
          const c = isAlive ? rawC[i] : 7;
          const upkeepMult = (Config.SEGMENT_UPKEEP[c] ?? 1.0) + (Config.GENES[c]?.cost ?? 0) * 0.5;

          const idx = c === 3 ? ciliaCursor++ : otherCursor++;
          bsx[idx] = sx; bsy[idx] = sy; bex[idx] = ex; bey[idx] = ey; bm[idx] = m; segCIdx[idx] = c;

          colorMass[c] += m; baseMass += m; baseUpkeepMass += m * upkeepMult;
          baseI += (m * m * m) / 12 + m * (mx * mx + my * my);
          if (c === 1) basePhotoMass += m;
          else if (c === 6) nKids++;
        }

        let domColor = 1, maxCM = -1;
        for (let c = 0; c < 7; c++) if (colorMass[c] > maxCM) { maxCM = colorMass[c]; domColor = c; }

        oa.domColorIdx[s] = domColor; oa.baseMass[s] = baseMass; oa.baseUpkeepMass[s] = baseUpkeepMass;
        oa.basePhotoMass[s] = basePhotoMass; oa.baseI[s] = baseI; oa.baseR[s] = Math.sqrt(maxRSq);
        oa.nKids[s] = nKids; oa.ciliaCount[s] = totalCilia; this._builtDna = activeDna;
      }

      _applyGrowthScale() {
        const s = this.slot, oa = this.oa;
        const invScale = 1 / Config.scales[oa.growth[s] - 1];
        oa.invScale[s] = invScale;
        const mass = Math.max(0.5, oa.baseMass[s] * invScale);
        const upkeepMass = Math.max(0.3, oa.baseUpkeepMass[s] * invScale);
        oa.mass[s] = mass;
        oa.upkeepMass[s] = upkeepMass;
        oa.upkeepPower[s] = upkeepMass * Math.pow(mass, 0.15);
        oa.photoMass[s] = oa.alive[s] ? oa.basePhotoMass[s] * invScale : 0;
        oa.I[s] = Math.max(0.5, oa.baseI[s] * invScale * invScale * invScale);
        oa.r[s] = oa.baseR[s] * invScale + 1;
        oa.segTh[s] = -999;
      }

      refreshUpkeepCost() {
        const s = this.slot, oa = this.oa;
        const { bm, cIdx } = this.world.arena, start = oa.segStart[s], end = start + oa.segCount[s];
        let baseUpkeepMass = 0;
        for (let idx = start; idx < end; idx++) {
          const c = cIdx[idx];
          baseUpkeepMass += bm[idx] * ((Config.SEGMENT_UPKEEP[c] ?? 1.0) + (Config.GENES[c]?.cost ?? 0) * 0.5);
        }
        oa.baseUpkeepMass[s] = baseUpkeepMass;
        const upkeepMass = Math.max(0.3, baseUpkeepMass * oa.invScale[s]);
        oa.upkeepMass[s] = upkeepMass;
        oa.upkeepPower[s] = upkeepMass * Math.pow(oa.mass[s], 0.15);
      }

      getMetabolicUpkeep() { return this.oa.upkeepPower[this.slot] / Math.max(1, Config.SEGMENT_UPKEEP_DIVISOR); }

      syncSegments() {
        const s = this.slot, oa = this.oa;
        if (oa.segTh[s] === oa.th[s]) return;
        const inv = oa.invScale[s], cosS = oa.cosTh[s] * inv, sinS = oa.sinTh[s] * inv;
        let relMinX = Infinity, relMaxX = -Infinity, relMinY = Infinity, relMaxY = -Infinity;
        const { bsx, bsy, bex, bey } = this.world.arena, start = oa.segStart[s], end = start + oa.segCount[s];

        for (let idx = start; idx < end; idx++) {
          const rx1 = bsx[idx] * cosS - bsy[idx] * sinS, ry1 = bsx[idx] * sinS + bsy[idx] * cosS;
          const rx2 = bex[idx] * cosS - bey[idx] * sinS, ry2 = bex[idx] * sinS + bey[idx] * cosS;
          const minX = rx1 < rx2 ? rx1 : rx2, maxX = rx1 > rx2 ? rx1 : rx2;
          const minY = ry1 < ry2 ? ry1 : ry2, maxY = ry1 > ry2 ? ry1 : ry2;
          if (minX < relMinX) relMinX = minX; if (maxX > relMaxX) relMaxX = maxX;
          if (minY < relMinY) relMinY = minY; if (maxY > relMaxY) relMaxY = maxY;
        }
        if (start === end) { relMinX = -2; relMaxX = 2; relMinY = -2; relMaxY = 2; }
        oa.relMinX[s] = relMinX; oa.relMaxX[s] = relMaxX; oa.relMinY[s] = relMinY; oa.relMaxY[s] = relMaxY;
        oa.w[s] = Math.max(3, relMaxX - relMinX); oa.h[s] = Math.max(3, relMaxY - relMinY);
        oa.x[s] = oa.cx[s] + relMinX; oa.y[s] = oa.cy[s] + relMinY; oa.segTh[s] = oa.th[s];
      }

      calcBounds(force = false) {
        const s = this.slot, oa = this.oa;
        if (force) { oa.segTh[s] = -999; this.syncSegments(); return; }
        if (oa.segTh[s] === oa.th[s]) {
          oa.x[s] = oa.cx[s] + oa.relMinX[s]; oa.y[s] = oa.cy[s] + oa.relMinY[s];
        } else {
          const rad = oa.r[s], cx = oa.cx[s], cy = oa.cy[s];
          oa.x[s] = cx - rad; oa.y[s] = cy - rad; oa.w[s] = rad * 2; oa.h[s] = rad * 2;
        }
      }

      isInsideWorld() {
        const s = this.slot, oa = this.oa;
        const pad = 2, maxW = this.world.w - pad, maxH = this.world.h - pad;
        if (oa.segTh[s] !== oa.th[s]) {
          const rad = oa.r[s], cx = oa.cx[s], cy = oa.cy[s];
          if (cx - rad < pad || cx + rad >= maxW || cy - rad < pad || cy + rad >= maxH) this.syncSegments();
          else return true;
        }
        let inside = true;
        const x = oa.x[s], y = oa.y[s], w = oa.w[s], h = oa.h[s];
        if (x < pad) { oa.cx[s] += pad - x; oa.dx[s] = Math.abs(oa.dx[s]) * 0.7; inside = false; }
        else if (x + w >= maxW) { oa.cx[s] -= x + w - maxW; oa.dx[s] = -Math.abs(oa.dx[s]) * 0.7; inside = false; }
        if (y < pad) { oa.cy[s] += pad - y; oa.dy[s] = Math.abs(oa.dy[s]) * 0.7; inside = false; }
        else if (y + h >= maxH) { oa.cy[s] -= y + h - maxH; oa.dy[s] = -Math.abs(oa.dy[s]) * 0.7; inside = false; }
        if (!inside) { oa.dth[s] *= 0.5; oa.x[s] = oa.cx[s] + oa.relMinX[s]; oa.y[s] = oa.cy[s] + oa.relMinY[s]; }
        return inside;
      }

      grow() {
        const s = this.slot, oa = this.oa, gr = oa.growth[s];
        if (gr > 1 && (oa.age[s] & 7) === 7 && oa.alive[s] && oa.energy[s] >= oa.mass[s] * 0.125) {
          oa.growth[s] = gr - 1;
          const oldM = oa.mass[s], oldI = oa.I[s];
          this.symmetric(); this.calcBounds(false);
          const mRatio = Math.sqrt(oldM / oa.mass[s]);
          oa.dx[s] *= mRatio; oa.dy[s] *= mRatio; oa.dth[s] *= Math.sqrt(oldI / oa.I[s]);
          oa.hasGrown[s] = 1;
        } else if (gr < 16 && oa.energy[s] < oa.mass[s] / 14) {
          oa.growth[s] = gr + 1;
          const oldM = oa.mass[s], oldI = oa.I[s];
          this.symmetric(); this.calcBounds(false);
          const mRatio = Math.sqrt(oldM / oa.mass[s]);
          oa.dx[s] *= mRatio; oa.dy[s] *= mRatio; oa.dth[s] *= Math.sqrt(oldI / oa.I[s]);
          oa.hasGrown[s] = -1;
        } else {
          oa.hasGrown[s] = 0;
        }
      }

      useEnergy(q) {
        const s = this.slot, oa = this.oa;
        if (oa.energy[s] < q) return false;
        const r = this.world.respiration(q);
        oa.energy[s] -= r;
        return r >= q * 0.9;
      }

      flash(c) {
        const s = this.slot;
        this.flashColor = c;
        this.oa.flashIdx[s] = Config.PALETTE_INDICES[c] ?? 6;
        this.oa.flashFrames[s] = 5;
      }

      die(killer = null) {
        const s = this.slot, oa = this.oa;
        if (!oa.alive[s]) return;
        oa.alive[s] = 0; oa.photoMass[s] = 0; oa.ciliaCount[s] = 0; oa.domColorIdx[s] = 7;
        this.world.arena.cIdx.fill(7, oa.segStart[s], oa.segStart[s] + oa.segCount[s]);
        this.world.pop = Math.max(0, this.world.pop - 1);
        if (killer && killer !== this) killer.kills++;
      }

      inherit(parent, isFirst, childEnergy) {
        const pDna = parent.infDna || parent.dna;
        this.dna = GeneticCode.acquire(pDna);
        const s = this.slot, oa = this.oa, ps = parent.slot;
        oa.gen[s] = (parent.infDna ? oa.infGen[ps] : oa.gen[ps]) + 1;
        oa.pId[s] = oa.id[ps];
        this.symmetric(true); this.calcBounds(true);
        oa.energy[s] = childEnergy;

        const rPos = (fastRand() * 8) | 0;
        const dist = Math.max(oa.w[ps], oa.h[ps]) * 0.5 + Math.max(oa.w[s], oa.h[s]) * 0.5 + 6;
        for (let sideIdx = 0; sideIdx < 8; sideIdx++) {
          const [sx, sy] = Config.side[(rPos + sideIdx) & 7];
          oa.cx[s] = oa.cx[ps] + dist * sx; oa.cy[s] = oa.cy[ps] + dist * sy;
          this.calcBounds(false);
          if (this.isInsideWorld() && !this.world.fastCollide(this, parent)) {
            oa.dx[s] = parent.dna.disp ? sx * 1.8 : oa.dx[ps] * 0.6 + sx * 0.4;
            oa.dy[s] = parent.dna.disp ? sy * 1.8 : oa.dy[ps] * 0.6 + sy * 0.4;
            oa.energy[ps] -= childEnergy;
            return true;
          }
        }
        this.world.arena.free(oa.segStart[s], oa.segCount[s]);
        oa.segCount[s] = 0;
        return false;
      }

      move() {
        const s = this.slot, oa = this.oa;
        if (Math.abs(oa.dx[s]) < 1e-5) oa.dx[s] = 0;
        if (Math.abs(oa.dy[s]) < 1e-5) oa.dy[s] = 0;
        if (Math.abs(oa.dth[s]) < 1e-5) oa.dth[s] = 0;

        if (oa.alive[s]) {
          const cCount = oa.ciliaCount[s];
          if (cCount > 0) {
            const ciliaCost = Config.GENES[3]?.cost > 0 ? Config.GENES[3].cost : 0.015;
            const start = oa.segStart[s], end = start + cCount;
            const { bsx, bsy, bex, bey, bm } = this.world.arena;
            const invScale = oa.invScale[s], pushScale = (14 * invScale) / oa.mass[s];
            const cos = oa.cosTh[s], sin = oa.sinTh[s], orgId = oa.id[s], frame = this.world.frames, seed = Config.SEED;

            for (let idx = start; idx < end; idx++) {
              if (hashRand(seed, frame, orgId, idx) < 0.12 && this.useEnergy(ciliaCost)) {
                const dlx = bex[idx] - bsx[idx], dly = bey[idx] - bsy[idx];
                const wx = dlx * cos - dly * sin, wy = dlx * sin + dly * cos;
                const sm = Math.max(0.1, bm[idx] * invScale);
                oa.dx[s] = Config.clamp(oa.dx[s] + wx * pushScale, -Config.MAX_VEL, Config.MAX_VEL);
                oa.dy[s] = Config.clamp(oa.dy[s] + wy * pushScale, -Config.MAX_VEL, Config.MAX_VEL);
                const sign = hashRand(seed, frame, orgId, idx + 65536) < 0.5 ? -1 : 1;
                oa.dth[s] = Config.clamp(oa.dth[s] + (sign * sm * Math.PI) / oa.I[s], -Config.MAX_ROT, Config.MAX_ROT);
              }
            }
          }
          if (oa.photoMass[s] > 0) oa.energy[s] += this.world.photosynthesis(oa.photoMass[s]);
        }

        oa.dx[s] *= Config.RUB; oa.dy[s] *= Config.RUB; oa.dth[s] *= Config.RUB;
        this.grow();
        oa.cx[s] += oa.dx[s]; oa.cy[s] += oa.dy[s];
        if (oa.dth[s] !== 0) {
          const nextTh = oa.th[s] + oa.dth[s];
          oa.th[s] = nextTh;
          oa.cosTh[s] = Math.cos(nextTh);
          oa.sinTh[s] = Math.sin(nextTh);
        }
        this.calcBounds(false);
        this.isInsideWorld();

        if (oa.repTime[s] > 0) oa.repTime[s]--;
        if (oa.alive[s] && oa.growth[s] === 1 && oa.repTime[s] === 0 && oa.energy[s] > this.dna.repEnergy) {
          const kMax = Config.clamp(oa.nKids[s], 1, 6), pDna = this.infDna || this.dna;
          const maxKidEnergy = pDna.repEnergy / (Math.max(1, oa.nKids[s] || 1) + 1);
          const probeDist = Math.max(oa.w[s], oa.h[s]) * 0.5 + 9;
          let spawnedAny = false, anySlotOpen = false;

          for (let sideIdx = 0; sideIdx < 8; sideIdx++) {
            const [sx, sy] = Config.side[sideIdx];
            const px = oa.cx[s] + probeDist * sx - 3, py = oa.cy[s] + probeDist * sy - 3;
            if (px >= 2 && px + 6 < this.world.w - 2 && py >= 2 && py + 6 < this.world.h - 2 && !this.world.grid.hasBoxOverlap(px, py, 6, 6, this)) {
              anySlotOpen = true; break;
            }
          }
          if (anySlotOpen) {
            for (let i = 0; i < kMax; i++) {
              const childEnergy = Math.min(maxKidEnergy, oa.energy[s] * 0.45);
              if (childEnergy <= 0.05 || (i > 0 && oa.energy[s] < childEnergy)) break;
              const child = this.world.acquireOrganism();
              if (child.inherit(this, i === 0, childEnergy)) {
                oa.kids[s]++; this.world.add(child, true); spawnedAny = true;
              } else {
                this.world.releaseOrganism(child);
              }
            }
          }
          if (spawnedAny && this.infDna) { this.infDna.release(); this.infDna = null; }
          oa.repTime[s] = 25;
        }

        const maxEnergy = 2.5 * this.dna.repEnergy;
        if (oa.energy[s] > maxEnergy) {
          this.world.co2 += oa.energy[s] - maxEnergy;
          oa.energy[s] = maxEnergy;
        }

        if (oa.alive[s]) {
          oa.age[s]++;
          const upkeep = this.getMetabolicUpkeep();
          if (oa.age[s] >> 8 > Config.MAX_AGE || !this.useEnergy(Math.min(upkeep, oa.energy[s])) || oa.energy[s] <= 0.05) this.die();
        } else {
          const decay = Math.min(oa.energy[s], Math.max(0.001, Config.DEAD_ENERGY_LOSS));
          oa.energy[s] -= decay; this.world.co2 += decay;
        }

        if (oa.flashFrames[s] > 0) oa.flashFrames[s]--;
        return oa.energy[s] > 0.01;
      }

      touchEffects(o, s1Idx, s2Idx, firstCall = true) {
        const s = this.slot, os = o.slot, oa = this.oa;
        if ((oa.pId[s] === oa.id[os] || oa.id[s] === oa.pId[os]) && oa.alive[os] && oa.alive[s]) return;
        const arena = this.world.arena, c1 = arena.cIdx[s1Idx], c2 = arena.cIdx[s2Idx];
        const shieldCost = Config.GENES[2]?.cost > 0 ? Config.GENES[2].cost : 0.08;

        if (oa.alive[s] && c1 === 0) {
          let taken = 0;
          const chemoMult = Math.max(0, Config.CHEMO_OBTAINED_ENERGY), redCost = Config.GENES[0]?.cost ?? 0;
          if (redCost > 0 && !this.useEnergy(redCost)) return;
          const s1m = Math.max(0.1, arena.bm[s1Idx] * oa.invScale[s]);
          if (c2 === 2 && o.useEnergy(shieldCost)) {
            o.flash(Config.PALETTE.B);
          } else {
            taken = Config.clamp(s1m * chemoMult, 0, oa.energy[os]);
            o.flash(c2 === 0 ? Config.PALETTE.R : Config.PALETTE.Y);
          }
          if (taken > 0) {
            const relProp = Config.clamp(Config.CHEMO_RELEASED_PROP, 0, 1);
            oa.energy[os] -= taken;
            oa.energy[s] += taken * (1 - relProp);
            this.world.co2 += taken * relProp;
            this.flash(Config.PALETTE.R);
          }
        } else if (oa.alive[s] && c1 === 4) {
          const virusCost = Config.GENES[4]?.cost ?? 1.0;
          if (c2 === 2 && o.useEnergy(shieldCost)) {
            this.flash(Config.PALETTE.W); o.flash(Config.PALETTE.B);
          } else if (oa.alive[os] && o.infDna !== this.dna && this.useEnergy(virusCost)) {
            if (o.infDna) o.infDna.release();
            o.infDna = this.dna.retain(); oa.infGen[os] = oa.gen[s]; oa.infected[s]++;
            o.flash(Config.PALETTE.Y); this.flash(Config.PALETTE.W);
          }
        } else if (oa.alive[s] && c1 === 5) {
          const toxinCost = Config.GENES[5]?.cost ?? 1.0;
          if (c2 === 2 && o.useEnergy(shieldCost)) {
            o.flash(Config.PALETTE.B); this.flash(Config.PALETTE.GR);
          } else if (oa.alive[os] && this.useEnergy(toxinCost)) {
            o.die(this); this.flash(Config.PALETTE.GR);
          }
        }

        if (oa.alive[os] && oa.energy[os] < 0.05) o.die(this);
        if (firstCall && oa.alive[os]) o.touchEffects(this, s2Idx, s1Idx, false);
      }

      touchMove(o, px, py, lx1, ly1, lx2, ly2, thisOrganism) {
        const s = this.slot, os = o.slot, oa = this.oa;
        const cx1 = oa.cx[s], cy1 = oa.cy[s], cx2 = oa.cx[os], cy2 = oa.cy[os];
        const rapx = px - cx1, rapy = py - cy1, rbpx = px - cx2, rbpy = py - cy2;
        const vab1x = (oa.dx[s] - oa.dth[s] * rapy) - (oa.dx[os] - oa.dth[os] * rbpy);
        const vab1y = (oa.dy[s] + oa.dth[s] * rapx) - (oa.dy[os] + oa.dth[os] * rbpx);

        let nx = ly1 - ly2, ny = lx2 - lx1;
        const modn = Math.hypot(nx, ny) || 1e-9;
        nx /= modn; ny /= modn;

        const pnx = px + nx, pny = py + ny, mnpx = px - nx, mnpy = py - ny;
        if (thisOrganism) {
          if ((pnx - cx2) ** 2 + (pny - cy2) ** 2 < (mnpx - cx2) ** 2 + (mnpy - cy2) ** 2) { nx = -nx; ny = -ny; }
        } else {
          if ((pnx - cx1) ** 2 + (pny - cy1) ** 2 > (mnpx - cx1) ** 2 + (mnpy - cy1) ** 2) { nx = -nx; ny = -ny; }
        }

        const relVel = vab1x * nx + vab1y * ny;
        if (relVel >= 0) return;

        const raCrossN = rapx * ny - rapy * nx, rbCrossN = rbpx * ny - rbpy * nx;
        const m1 = oa.mass[s], m2 = oa.mass[os], I1 = oa.I[s], I2 = oa.I[os];
        const denom = 1 / m1 + 1 / m2 + (raCrossN * raCrossN) / I1 + (rbCrossN * rbCrossN) / I2;
        const j = (-(1 + Config.ELASTICITY) * relVel) / Math.max(1e-6, denom);
        const jnx = j * nx, jny = j * ny;

        oa.dx[s] = Config.clamp(oa.dx[s] + jnx / m1, -Config.MAX_VEL, Config.MAX_VEL);
        oa.dy[s] = Config.clamp(oa.dy[s] + jny / m1, -Config.MAX_VEL, Config.MAX_VEL);
        oa.dx[os] = Config.clamp(oa.dx[os] - jnx / m2, -Config.MAX_VEL, Config.MAX_VEL);
        oa.dy[os] = Config.clamp(oa.dy[os] - jny / m2, -Config.MAX_VEL, Config.MAX_VEL);
        oa.dth[s] = Config.clamp(oa.dth[s] + (j * raCrossN) / I1, -Config.MAX_ROT, Config.MAX_ROT);
        oa.dth[os] = Config.clamp(oa.dth[os] - (j * rbCrossN) / I2, -Config.MAX_ROT, Config.MAX_ROT);

        oa.cx[s] = cx1 + nx * 0.4; oa.cy[s] = cy1 + ny * 0.4;
        oa.cx[os] = cx2 - nx * 0.4; oa.cy[os] = cy2 - ny * 0.4;
      }
    }

    Object.assign(Namespace, { OrganismArena, ContactBuffer, detectCellContactsSoA, Organism });
  })(_, _);
  //#endregion

  //#region 11: WorldSimulation
  ((Namespace, { Config, fastRand, GeneticCode, SegmentArena, SpatialGrid, OrganismArena, ContactBuffer, detectCellContactsSoA, Organism }) => {
    class World {
      constructor(w = Config.WORLD_W, h = Config.WORLD_H, sharedBuffers = null) {
        this.w = w; this.h = h;
        this.orgs = [];
        this.orgPool = [];
        this.slotToOrg = new Array(OrganismArena.MAX_ORGS).fill(null);
        this._mruOrg1 = null; this._mruOrg2 = null;

        this.orgArena = new OrganismArena(OrganismArena.MAX_ORGS, sharedBuffers?.orgArenaSab || null, false);
        this.arena = new SegmentArena(SegmentArena.MAX_CAPACITY, sharedBuffers?.segArenaSab || null, false);
        this.grid = new SpatialGrid(90, sharedBuffers?.gridSab || null, false);
        this.grid.init(this.w, this.h);
        this.contactBuf = new ContactBuffer(ContactBuffer.MAX_CONTACTS, sharedBuffers?.contactSab || null, false);
        this.syncI32 = sharedBuffers?.syncSab ? new Int32Array(sharedBuffers.syncSab) : new Int32Array(16);
        this._contactOrderIdx = new Int32Array(ContactBuffer.MAX_CONTACTS);
        this._localScratch = {
          candIdx: new Int32Array(512),
          candMinX: new Float32Array(512), candMaxX: new Float32Array(512),
          candMinY: new Float32Array(512), candMaxY: new Float32Array(512),
          candBx1: new Float32Array(512), candBy1: new Float32Array(512),
          candDx2: new Float32Array(512), candDy2: new Float32Array(512),
        };

        this.pop = 0; this.nextID = 1; this.time = 0; this.frames = 0;
        this.o2 = Config.INIT_O2; this.co2 = Config.INIT_CO2;
        this.history = []; this.historyVersion = 0;
      }

      acquireOrganism(dna = null) {
        const o = this.orgPool.pop();
        if (o) {
          o.slot = this.orgArena.allocSlot();
          this.slotToOrg[o.slot] = o;
          return o.reset(dna);
        }
        const created = new Organism(this, dna);
        this.slotToOrg[created.slot] = created;
        return created;
      }

      releaseOrganism(o) {
        if (this._mruOrg1 === o) this._mruOrg1 = null;
        if (this._mruOrg2 === o) this._mruOrg2 = null;
        if (o.segCount > 0) { this.arena.free(o.segStart, o.segCount); o.segCount = 0; }
        if (o.dna) { o.dna.release(); o.dna = null; }
        if (o.infDna) { o.infDna.release(); o.infDna = null; }
        o._builtDna = null;
        if (o.slot >= 0) {
          this.slotToOrg[o.slot] = null;
          this.orgArena.freeSlot(o.slot);
          o.slot = -1;
        }
        if (this.orgPool.length < 4096) this.orgPool.push(o);
      }

      getOrganismById(id) {
        if (id == null || id < 0) return null;
        if (this._mruOrg1?.slot >= 0 && this._mruOrg1.id === id && this._mruOrg1.energy > 0.01) return this._mruOrg1;
        if (this._mruOrg2?.slot >= 0 && this._mruOrg2.id === id && this._mruOrg2.energy > 0.01) return this._mruOrg2;
        for (let i = 0; i < this.orgs.length; i++) {
          const o = this.orgs[i];
          if (o.id === id && o.energy > 0.01) {
            this._mruOrg2 = this._mruOrg1; this._mruOrg1 = o;
            return o;
          }
        }
        return null;
      }

      refreshPhenotypes() { for (let i = 0; i < this.orgs.length; i++) this.orgs[i].refreshUpkeepCost(); }

      respiration(q) { const d = Math.min(q, this.o2); this.o2 -= d; this.co2 += d; return d; }

      photosynthesis(q) {
        const rate = (q / Math.max(1, Config.PHOTO_ENERGY_DIVISOR)) * (this.co2 / (this.co2 + Math.max(1, Config.SUBSTANCES_DRAINAGE_DIVISOR)));
        const g = Math.min(rate, this.co2);
        this.co2 -= g; this.o2 += g;
        return g;
      }

      add(o, insertToGrid = true) {
        this.orgs.push(o);
        if (o.alive) this.pop++;
        if (insertToGrid) this.grid.insert(o);
      }

      syncGrid() {
        this.grid.init(this.w, this.h); this.grid.clear();
        for (let i = 0; i < this.orgs.length; i++) this.grid.insert(this.orgs[i]);
      }

      fastCollide(o, ignore = null) { return this.grid.hasAABBOverlap(o, ignore); }

      genesis(count = Config.INIT_ORG_COUNT) {
        this.w = Config.WORLD_W; this.h = Config.WORLD_H;
        for (let i = 0; i < this.orgs.length; i++) this.releaseOrganism(this.orgs[i]);
        this.orgs.length = 0; this._mruOrg1 = null; this._mruOrg2 = null;
        this.orgArena.clear();
        this.arena.clear(); this.pop = 0; this.time = 0; this.frames = 0;
        this.o2 = Config.INIT_O2; this.co2 = Config.INIT_CO2;
        this.grid.init(this.w, this.h); this.grid.clear();
        for (let i = 0; i < count; i++) this.spawnRandom();
        const snap = { pop: this.pop, o2: Math.round(this.o2), co2: Math.round(this.co2) };
        this.history = [snap, { ...snap }]; this.historyVersion++;
      }

      spawnRandom(dnaPreset = null, posX = null, posY = null) {
        const dna = dnaPreset || GeneticCode.acquire(null), o = this.acquireOrganism(dna);
        o.energy = Math.min(Config.INIT_ORG_ENERGY, Math.max(10, this.co2 * 0.1));
        this.co2 = Math.max(0, this.co2 - o.energy); this.o2 += o.energy;

        if (posX != null && posY != null) {
          o.cx = posX; o.cy = posY; o.calcBounds(true); o.isInsideWorld(); this.add(o, true);
          return o;
        }
        for (let tr = 0; tr < 30; tr++) {
          o.cx = fastRand() * Math.max(20, this.w - 80) + 40;
          o.cy = fastRand() * Math.max(20, this.h - 80) + 40;
          o.calcBounds(true);
          if (o.isInsideWorld() && !this.fastCollide(o)) { this.add(o, true); return o; }
        }
        this.co2 += o.energy; this.o2 = Math.max(0, this.o2 - o.energy);
        this.releaseOrganism(o);
        return null;
      }

      resolveContactsDeterministically(rawCount) {
        const count = Math.min(rawCount, this.contactBuf.capacity);
        if (count <= 0) return;

        const cb = this.contactBuf, idxs = this._contactOrderIdx;
        for (let i = 0; i < count; i++) idxs[i] = i;

        if (count > 1) {
          const { idA, idB, order } = cb;
          idxs.subarray(0, count).sort((a, b) => (idA[a] - idA[b]) || (idB[a] - idB[b]) || (order[a] - order[b]));
        }

        const oa = this.orgArena, slotToOrg = this.slotToOrg;
        for (let k = 0; k < count; k++) {
          const c = idxs[k];
          const sA = cb.slotA[c], sB = cb.slotB[c];
          if (oa.energy[sA] <= 0.01 || oa.energy[sB] <= 0.01) continue;
          const oA = slotToOrg[sA], oB = slotToOrg[sB];
          if (!oA || !oB) continue;

          oA.touchEffects(oB, cb.segA[c], cb.segB[c], true);
          if (cb.order[c] === 0) {
            oA.touchMove(oB, cb.px[c], cb.py[c], cb.lx1[c], cb.ly1[c], cb.lx2[c], cb.ly2[c], cb.thisOrg[c] === 1);
          }
        }
      }

      runCollisions(parallelDispatchFn = null) {
        const activeCount = this.grid.activeCellCount;
        if (activeCount <= 0) return;
        Atomics.store(this.syncI32, 2, 0);

        if (parallelDispatchFn && activeCount >= 24) {
          parallelDispatchFn(activeCount);
        } else {
          detectCellContactsSoA(0, activeCount, this.grid, this.orgArena, this.arena, this.contactBuf, this.syncI32, 2, this._localScratch);
        }

        const totalContacts = Atomics.load(this.syncI32, 2);
        if (totalContacts > 0) this.resolveContactsDeterministically(totalContacts);
      }

      update(parallelDispatchFn = null) {
        this.grid.init(this.w, this.h);
        this.runCollisions(parallelDispatchFn);

        const orgs = this.orgs;
        let writeIdx = 0;
        for (let i = 0; i < orgs.length; i++) {
          const o = orgs[i];
          if (o.move()) orgs[writeIdx++] = o;
          else {
            if (o.alive) this.pop = Math.max(0, this.pop - 1);
            this.releaseOrganism(o);
          }
        }
        orgs.length = writeIdx;
        if (this.arena.shouldCompact()) this.arena.compact(orgs);
        this.syncGrid();

        this.frames++;
        if ((this.frames & 31) === 0) {
          this.history.push({ pop: this.pop, o2: Math.round(this.o2), co2: Math.round(this.co2) });
          if (this.history.length > 60) this.history.shift();
          this.historyVersion++;
        }
        if ((this.frames & 127) === 0) {
          this.time++;
          if (Config.AUTO_GENESIS && this.pop <= 1 && this.co2 >= 150) this.spawnRandom();
        }
      }
    }

    Object.assign(Namespace, { World });
  })(_, _);
  //#endregion

  //#region 12: ViewportCamera
  ((Namespace, { Config }) => {
    class Camera {
      constructor() { this.x = 0; this.y = 0; this.zoom = 1; }
      screenToWorld(sx, sy) { return { x: (sx - this.x) / this.zoom, y: (sy - this.y) / this.zoom }; }
      clampToBounds(worldW, worldH, viewW, viewH) {
        if (!worldW || !worldH || !viewW || !viewH) return;
        const minZoom = Math.min(viewW / worldW, viewH / worldH) * 0.95;
        if (this.zoom < minZoom) this.zoom = minZoom;
        this.x = worldW * this.zoom >= viewW ? Config.clamp(this.x, viewW - worldW * this.zoom, 0) : (viewW - worldW * this.zoom) * 0.5;
        this.y = worldH * this.zoom >= viewH ? Config.clamp(this.y, viewH - worldH * this.zoom, 0) : (viewH - worldH * this.zoom) * 0.5;
      }
      zoomAt(sx, sy, factor, worldW, worldH, viewW, viewH, min = 0.1, max = 5.0) {
        const minZoom = worldW && viewW ? Math.min(viewW / worldW, viewH / worldH) * 0.9 : min;
        const next = Config.clamp(this.zoom * factor, minZoom, max);
        this.x = sx - (sx - this.x) * (next / this.zoom);
        this.y = sy - (sy - this.y) * (next / this.zoom);
        this.zoom = next;
        if (worldW && viewW) this.clampToBounds(worldW, worldH, viewW, viewH);
        return this.zoom;
      }
      centerOn(wx, wy, viewW, viewH, worldW, worldH) {
        this.x = viewW * 0.5 - wx * this.zoom;
        this.y = viewH * 0.5 - wy * this.zoom;
        if (worldW && viewW) this.clampToBounds(worldW, worldH, viewW, viewH);
      }
      fitWorld(worldW, worldH, viewW, viewH) {
        this.zoom = Math.max(0.05, Math.min(viewW / worldW, viewH / worldH));
        this.x = (viewW - worldW * this.zoom) * 0.5;
        this.y = (viewH - worldH * this.zoom) * 0.5;
        return this.zoom;
      }
    }
    Object.assign(Namespace, { Camera });
  })(_, _);
  //#endregion

  //#region 13: WebGLWorldRenderer
  ((Namespace, { Application, Graphics, Container, Mesh, Geometry, Shader, Buffer }) => {
    class WorldRenderer {
      constructor() {
        this.app = null; this.lineMesh = null; this.geometry = null; this.shader = null;
        this.sharedBuffer = null; this.vertexData = null;
        this.maxVerts = 65536; this.prevVertCount = 0; this.lastUploadedFrameId = -1;
        this.overlayContainer = null; this.overlayGraphics = null;
        this.width = 800; this.height = 600;
      }
      async init(canvas) {
        const parent = canvas.parentElement;
        this.width = parent ? parent.clientWidth : 800;
        this.height = parent ? parent.clientHeight : 600;
        this.app = new Application();
        await this.app.init({
          canvas, width: Math.max(10, this.width), height: Math.max(10, this.height),
          backgroundColor: 0x000000, antialias: false, roundPixels: true,
          autoDensity: true, resolution: 1, preference: 'webgl', autoStart: false,
        });
        this.shader = Shader.from({
          gl: {
            vertex: `#version 300 es
              precision highp float;
              in vec3 aWorldColor;
              uniform vec4 uTransform;
              out vec3 vColor;
              const vec3 PALETTE[9] = vec3[9](
                vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), vec3(0.0, 0.2666667, 1.0),
                vec3(0.0, 1.0, 1.0), vec3(1.0, 1.0, 1.0), vec3(0.5019608, 0.5019608, 0.5019608),
                vec3(1.0, 1.0, 0.0), vec3(0.5490196, 0.3215686, 0.1568627), vec3(0.1215686, 0.1215686, 0.1215686)
              );
              void main() {
                gl_Position = vec4(aWorldColor.xy * uTransform.xy + uTransform.zw, 0.0, 1.0);
                vColor = PALETTE[clamp(int(aWorldColor.z + 0.5), 0, 8)];
              }
            `,
            fragment: `#version 300 es
              precision mediump float;
              in vec3 vColor;
              out vec4 finalColor;
              void main() { finalColor = vec4(vColor, 1.0); }
            `,
          },
          resources: {
            uTransformUniforms: { uTransform: { value: new Float32Array([1, 1, 0, 0]), type: 'vec4<f32>' } },
          },
        });
        this._buildLineMesh(this.maxVerts);
        this.overlayContainer = new Container();
        this.overlayGraphics = new Graphics();
        this.overlayContainer.addChild(this.overlayGraphics);
        this.app.stage.addChild(this.overlayContainer);
      }
      _buildLineMesh(vertCap) {
        if (this.lineMesh) {
          this.app.stage.removeChild(this.lineMesh);
          this.lineMesh.destroy({ children: true });
        }
        this.maxVerts = vertCap;
        this.vertexData = new Float32Array(vertCap * 3);
        this.sharedBuffer = new Buffer({ data: this.vertexData, usage: 40 });
        this.geometry = new Geometry({
          topology: 'line-list',
          attributes: { aWorldColor: { buffer: this.sharedBuffer, format: 'float32x3', stride: 12, offset: 0 } },
        });
        this.lineMesh = new Mesh({ geometry: this.geometry, shader: this.shader });
        this.app.stage.addChildAt(this.lineMesh, 0);
        this.prevVertCount = 0; this.lastUploadedFrameId = -1;
      }
      resize(w, h) {
        this.width = Math.max(10, w); this.height = Math.max(10, h);
        this.app?.renderer?.resize(this.width, this.height);
      }
      renderFromWorkerSnapshot(snapVerts, vertCount, frameId, camera, selectedBounds = null, placementPreview = null) {
        if (!this.app || !this.lineMesh) return;
        if (snapVerts && frameId !== this.lastUploadedFrameId) {
          if (vertCount > this.maxVerts) this._buildLineMesh(Math.max(this.maxVerts * 2, vertCount + 16384));
          const v = this.vertexData;
          v.set(snapVerts.subarray(0, vertCount * 3));
          const uploadVerts = Math.max(vertCount, this.prevVertCount);
          if (vertCount < this.prevVertCount) v.fill(0, vertCount * 3, this.prevVertCount * 3);
          this.prevVertCount = vertCount;
          this.lastUploadedFrameId = frameId;
          this.sharedBuffer._updateSize = uploadVerts * 12;
          this.sharedBuffer.update(uploadVerts * 12);
        }
        const camX = Math.round(camera.x), camY = Math.round(camera.y), zoom = camera.zoom;
        const u = this.shader.resources.uTransformUniforms.uniforms.uTransform;
        u[0] = (2 * zoom) / this.width; u[1] = (-2 * zoom) / this.height;
        u[2] = (2 * camX) / this.width - 1; u[3] = 1 - (2 * camY) / this.height;
        const og = this.overlayGraphics;
        og.clear();
        if (selectedBounds != null || placementPreview?.wx != null) {
          this.overlayContainer.position.set(camX, camY);
          this.overlayContainer.scale.set(zoom, zoom);
          if (selectedBounds != null) {
            og.circle(selectedBounds.cx, selectedBounds.cy, Math.max(selectedBounds.w, selectedBounds.h) * 0.5 + 5).stroke({ color: 0x00ffff, pixelLine: true });
          }
          if (placementPreview?.wx != null && placementPreview?.wy != null) {
            const { wx, wy, lines, radius } = placementPreview;
            for (let i = 0; i < lines.length; i++) {
              og.moveTo(wx + lines[i].x1, wy + lines[i].y1);
              og.lineTo(wx + lines[i].x2, wy + lines[i].y2);
            }
            og.stroke({ color: 0x00ffff, alpha: 0.85, pixelLine: true });
            og.circle(wx, wy, (radius || 18) + 4).stroke({ color: 0x00ffff, alpha: 0.5, pixelLine: true });
          }
        }
        this.app.render();
      }
      destroy() {
        if (this.app) {
          this.app.destroy(false, { children: true });
          this.app = this.lineMesh = this.geometry = this.shader = this.sharedBuffer = this.vertexData = this.overlayGraphics = this.overlayContainer = null;
        }
      }
    }
    Object.assign(Namespace, { WorldRenderer });
  })(_, _);
  //#endregion

  //#region 14: CanvasGeneRenderer
  ((Namespace) => {
    class GeneRenderer {
      static renderPreview(canvas, dna) {
        if (!canvas || !dna) return;
        const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h), data = imgData.data, lines = dna.buildSegments(1);
        let minX = 0, maxX = 0, minY = 0, maxY = 0;
        for (const l of lines) {
          minX = Math.min(minX, l.x1, l.x2); maxX = Math.max(maxX, l.x1, l.x2);
          minY = Math.min(minY, l.y1, l.y2); maxY = Math.max(maxY, l.y1, l.y2);
        }
        const s = Math.min((w - 14) / Math.max(12, maxX - minX), (h - 14) / Math.max(12, maxY - minY));
        const midX = (minX + maxX) * 0.5, midY = (minY + maxY) * 0.5, halfW = w * 0.5, halfH = h * 0.5;
        for (const l of lines) {
          const num = parseInt(l.c.replace('#', ''), 16);
          const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
          let x0 = Math.round((l.x1 - midX) * s + halfW), y0 = Math.round((l.y1 - midY) * s + halfH);
          const x1 = Math.round((l.x2 - midX) * s + halfW), y1 = Math.round((l.y2 - midY) * s + halfH);
          const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
          let err = dx + dy;
          while (true) {
            if (x0 >= 0 && x0 < w && y0 >= 0 && y0 < h) {
              const idx = (y0 * w + x0) * 4;
              data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255;
            }
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
          }
        }
        ctx.putImageData(imgData, 0, 0);
      }
    }
    Object.assign(Namespace, { GeneRenderer });
  })(_);
  //#endregion

  //#region 15: SimulationWorkerFactory
  ((Namespace, {
    DEFAULT_GENES, DEFAULT_CONFIG, Config, setSeed, fastRand, hashU32, hashRand, createBuffer,
    GeneticCode, SegmentArena, SpatialGrid, OrganismArena, ContactBuffer, detectCellContactsSoA, Organism, World,
  }) => {
    const CTRL = Object.freeze({
      IS_RUNNING: 0,
      SPEED_MULT: 1,
      CAM_DIRTY: 2,
      SELECTED_ID: 3,
      TRACKED_ID: 4,
      DRAG_ID: 5,
      DRAG_SEQ: 6,
      READY_BUF: 7,
      NEW_FRAME_READY: 8,
      BUF0_VERT_COUNT: 9,
      BUF1_VERT_COUNT: 10,
      BUF2_VERT_COUNT: 11,
      BUF0_FRAME_ID: 12,
      BUF1_FRAME_ID: 13,
      BUF2_FRAME_ID: 14,
      HISTORY_VERSION: 15,
      WORKER_COUNT: 16,
    });

    const STAT = Object.freeze({
      CAM_X: 0,
      CAM_Y: 1,
      CAM_ZOOM: 2,
      CAM_VIEW_W: 3,
      CAM_VIEW_H: 4,
      DRAG_CX: 5,
      DRAG_CY: 6,
      DRAG_VX: 7,
      DRAG_VY: 8,
      WORLD_W: 9,
      WORLD_H: 10,
      TIME: 11,
      FRAMES: 12,
      POP: 13,
      TOTAL_ORGS: 14,
      O2: 15,
      CO2: 16,
      TRACKED_CX: 17,
      TRACKED_CY: 18,
      TRACKED_ALIVE: 19,
      SEL_CX: 20,
      SEL_CY: 21,
      SEL_W: 22,
      SEL_H: 23,
      SEL_ALIVE: 24,
    });

    const SYNC = Object.freeze({
      GENERATION: 0,
      WORK_CURSOR: 1,
      CONTACT_COUNT: 2,
      ACTIVE_CELLS: 3,
      DONE_COUNT: 4,
    });

    const TRIPLE_VERT_CAP = 131072;

    function createSharedMemoryBundle() {
      const hasSab = typeof SharedArrayBuffer !== 'undefined';
      if (!hasSab) return null;
      try {
        const ctrlSab = new SharedArrayBuffer(512);
        const syncSab = new SharedArrayBuffer(64);
        const orgArenaSab = new SharedArrayBuffer(OrganismArena.calcByteLength());
        const segArenaSab = new SharedArrayBuffer(SegmentArena.calcByteLength());
        const gridSab = new SharedArrayBuffer(SpatialGrid.calcByteLength());
        const contactSab = new SharedArrayBuffer(ContactBuffer.calcByteLength());
        const vertSabs = [
          new SharedArrayBuffer(TRIPLE_VERT_CAP * 3 * 4),
          new SharedArrayBuffer(TRIPLE_VERT_CAP * 3 * 4),
          new SharedArrayBuffer(TRIPLE_VERT_CAP * 3 * 4),
        ];
        return { ctrlSab, syncSab, orgArenaSab, segArenaSab, gridSab, contactSab, vertSabs };
      } catch (_) {
        return null;
      }
    }

    function createCollisionSubWorker(sharedBuffers) {
      const src = `
        const createBuffer = ${createBuffer.toString()};
        ${SegmentArena.toString()}
        ${SpatialGrid.toString()}
        ${OrganismArena.toString()}
        ${ContactBuffer.toString()}
        ${detectCellContactsSoA.toString()}

        let grid = null, orgArena = null, segArena = null, contactBuf = null, syncI32 = null;
        const scratch = {
          candIdx: new Int32Array(512),
          candMinX: new Float32Array(512), candMaxX: new Float32Array(512),
          candMinY: new Float32Array(512), candMaxY: new Float32Array(512),
          candBx1: new Float32Array(512), candBy1: new Float32Array(512),
          candDx2: new Float32Array(512), candDy2: new Float32Array(512),
        };

        self.onmessage = (e) => {
          const msg = e.data;
          if (msg.type === 'init') {
            grid = new SpatialGrid(90, msg.gridSab, false);
            orgArena = new OrganismArena(OrganismArena.MAX_ORGS, msg.orgArenaSab, false);
            segArena = new SegmentArena(SegmentArena.MAX_CAPACITY, msg.segArenaSab, false);
            contactBuf = new ContactBuffer(ContactBuffer.MAX_CONTACTS, msg.contactSab, false);
            syncI32 = new Int32Array(msg.syncSab);
            let lastGen = 0;
            while (true) {
              Atomics.wait(syncI32, 0, lastGen);
              const gen = Atomics.load(syncI32, 0);
              if (gen < 0) break;
              lastGen = gen;
              const activeCount = Atomics.load(syncI32, 3);
              while (true) {
                const start = Atomics.add(syncI32, 1, 8);
                if (start >= activeCount) break;
                const end = start + 8 < activeCount ? start + 8 : activeCount;
                detectCellContactsSoA(start, end, grid, orgArena, segArena, contactBuf, syncI32, 2, scratch);
              }
              Atomics.add(syncI32, 4, 1);
              Atomics.notify(syncI32, 4, 1);
            }
          }
        };
      `;
      const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
      const worker = new Worker(url);
      URL.revokeObjectURL(url);
      worker.postMessage({
        type: 'init',
        gridSab: sharedBuffers.gridSab,
        orgArenaSab: sharedBuffers.orgArenaSab,
        segArenaSab: sharedBuffers.segArenaSab,
        contactSab: sharedBuffers.contactSab,
        syncSab: sharedBuffers.syncSab,
      });
      return worker;
    }

    function createSimulationWorker(sharedBuffers = null, subWorkerCount = 0) {
      const src = `
        const CTRL = ${JSON.stringify(CTRL)};
        const STAT = ${JSON.stringify(STAT)};
        const SYNC = ${JSON.stringify(SYNC)};
        const TRIPLE_VERT_CAP = ${TRIPLE_VERT_CAP};
        const DEFAULT_GENES = ${JSON.stringify(DEFAULT_GENES)};
        const DEFAULT_CONFIG = ${JSON.stringify(DEFAULT_CONFIG)};
        const Config = {
          ...DEFAULT_CONFIG,
          GENES: DEFAULT_GENES.map((g) => ({ ...g })),
          clamp: (v, min, max) => (v < min ? min : v > max ? max : v),
          side: ${JSON.stringify(Config.side)},
          scales: ${JSON.stringify(Config.scales)},
          PALETTE: ${JSON.stringify(Config.PALETTE)},
          PALETTE_HEX: ${JSON.stringify(Config.PALETTE_HEX)},
          PALETTE_INDICES: ${JSON.stringify(Config.PALETTE_INDICES)},
          SEGMENT_UPKEEP: ${JSON.stringify(Config.SEGMENT_UPKEEP)},
        };

        let _rngState = ((Config.SEED | 0) ^ 0x9e3779b9) | 1;
        const setSeed = ${setSeed.toString()};
        const fastRand = ${fastRand.toString()};
        const hashU32 = ${hashU32.toString()};
        const hashRand = ${hashRand.toString()};
        const createBuffer = ${createBuffer.toString()};
        ${GeneticCode.toString()}
        ${SegmentArena.toString()}
        ${SpatialGrid.toString()}
        ${OrganismArena.toString()}
        ${ContactBuffer.toString()}
        ${detectCellContactsSoA.toString()}
        ${Organism.toString()}
        ${World.toString()}

        let world = null;
        let hasSab = false;
        let ctrlI32 = null, statF64 = null, syncI32 = null;
        let tripleVerts = null;
        let writeBufIdx = 0;
        let numSubWorkers = 0;
        let workGen = 0;
        let lastDragSeq = 0;
        let lastSentHistoryVer = -1;
        let lastDtoSendTick = 0;
        let frameCounter = 1;

        let vertPool = [new Float32Array(65536 * 3), new Float32Array(65536 * 3)];
        let selectedId = null, trackedId = null;

        const serializeDna = (dna) => dna && ({
          sym: dna.sym, mirror: dna.mirror, disp: dna.disp, repEnergy: dna.repEnergy,
          shareCode: dna.toShareCode(),
          genes: dna.genes.map((g) => ({ l: g.l, th: g.th, c: g.c, cIdx: g.cIdx })),
        });

        const hydrateDna = (raw) => {
          const dna = GeneticCode.acquire(null);
          GeneticCode._freeGenes(dna.genes);
          dna.sym = raw.sym; dna.mirror = raw.mirror; dna.disp = Boolean(raw.disp); dna.repEnergy = raw.repEnergy || 45;
          for (const g of raw.genes) dna.genes.push(GeneticCode._allocGene(g.l, g.th, g.c, g.cIdx ?? Config.PALETTE_INDICES[g.c] ?? 1));
          return dna;
        };

        function buildSelectedDto(sel) {
          if (!sel) return null;
          const dna = sel.infDna || sel.dna;
          return {
            id: sel.id, alive: sel.alive, gen: sel.gen, energy: sel.energy, mass: sel.mass,
            upkeepPer100: (sel.getMetabolicUpkeep() * 100).toFixed(2), age: sel.age,
            kids: sel.kids, kills: sel.kills, infected: sel.infected, sym: dna.sym, mirror: dna.mirror,
            cx: sel.cx, cy: sel.cy, w: sel.w, h: sel.h, shareCode: dna.toShareCode(), dna: serializeDna(dna),
          };
        }

        function parallelDispatch(activeCellCount) {
          if (!hasSab || numSubWorkers <= 0) {
            detectCellContactsSoA(0, activeCellCount, world.grid, world.orgArena, world.arena, world.contactBuf, world.syncI32, 2, world._localScratch);
            return;
          }
          Atomics.store(syncI32, SYNC.WORK_CURSOR, 0);
          Atomics.store(syncI32, SYNC.ACTIVE_CELLS, activeCellCount);
          Atomics.store(syncI32, SYNC.DONE_COUNT, 0);
          workGen = (workGen + 1) | 0 || 1;
          Atomics.store(syncI32, SYNC.GENERATION, workGen);
          Atomics.notify(syncI32, SYNC.GENERATION, numSubWorkers);

          while (true) {
            const start = Atomics.add(syncI32, SYNC.WORK_CURSOR, 8);
            if (start >= activeCellCount) break;
            const end = start + 8 < activeCellCount ? start + 8 : activeCellCount;
            detectCellContactsSoA(start, end, world.grid, world.orgArena, world.arena, world.contactBuf, syncI32, SYNC.CONTACT_COUNT, world._localScratch);
          }

          while (true) {
            const done = Atomics.load(syncI32, SYNC.DONE_COUNT);
            if (done >= numSubWorkers) break;
            Atomics.wait(syncI32, SYNC.DONE_COUNT, done, 5);
          }
        }

        function fillVertexBuffer(v, camX, camY, zoom, viewW, viewH) {
          const ww = world.w, wh = world.h;
          v.set([0,0,8, ww,0,8, ww,0,8, ww,wh,8, ww,wh,8, 0,wh,8, 0,wh,8, 0,0,8]);
          let vertCount = 8;
          const maxVerts = (v.length / 3) | 0;

          const invZoom = 1 / (zoom || 1);
          const minCamX = -camX * invZoom, minCamY = -camY * invZoom;
          const maxCamX = minCamX + viewW * invZoom, maxCamY = minCamY + viewH * invZoom;
          const lodThresh = 2.2 * invZoom, lodHalf = Math.max(0.9 * invZoom, 1.0);
          const { bsx, bsy, bex, bey, cIdx: segCIdx } = world.arena;
          const oa = world.orgArena;

          const appendVisibleOrg = (o) => {
            const s = o.slot;
            const cx = oa.cx[s], cy = oa.cy[s], rad = oa.r[s];
            if (cx + rad < minCamX || cx - rad > maxCamX || cy + rad < minCamY || cy - rad > maxCamY) return;

            const flashIdx = oa.flashFrames[s] > 0 ? oa.flashIdx[s] : -1;
            const isAlive = oa.alive[s] === 1;
            if (rad < lodThresh) {
              if (vertCount + 2 > maxVerts) return;
              const c = flashIdx >= 0 ? flashIdx : isAlive ? oa.domColorIdx[s] : 7, vOff = vertCount * 3;
              v[vOff] = cx - lodHalf; v[vOff + 1] = cy; v[vOff + 2] = c;
              v[vOff + 3] = cx + lodHalf; v[vOff + 4] = cy; v[vOff + 5] = c;
              vertCount += 2;
              return;
            }

            const sCount = oa.segCount[s];
            if (vertCount + (sCount << 1) > maxVerts) return;
            const inv = oa.invScale[s], cosS = oa.cosTh[s] * inv, sinS = oa.sinTh[s] * inv;
            for (let seg = oa.segStart[s], sEnd = seg + sCount; seg < sEnd; seg++) {
              const c = flashIdx >= 0 ? flashIdx : !isAlive ? 7 : segCIdx[seg], vOff = vertCount * 3;
              const sx = bsx[seg], sy = bsy[seg], ex = bex[seg], ey = bey[seg];
              v[vOff] = cx + sx * cosS - sy * sinS; v[vOff + 1] = cy + sx * sinS + sy * cosS; v[vOff + 2] = c;
              v[vOff + 3] = cx + ex * cosS - ey * sinS; v[vOff + 4] = cy + ex * sinS + ey * cosS; v[vOff + 5] = c;
              vertCount += 2;
            }
          };

          const grid = world.grid, orgs = world.orgs, oLen = orgs.length;
          const viewCells = Math.ceil((maxCamX - minCamX) * grid.invCellSize) * Math.ceil((maxCamY - minCamY) * grid.invCellSize);
          if (grid.cols > 0 && viewCells > 0 && viewCells < grid.cols * grid.rows * 0.35 && viewCells < oLen * 2) {
            grid.forEachInBox(minCamX, minCamY, maxCamX, maxCamY, appendVisibleOrg);
          } else {
            for (let i = 0; i < oLen; i++) appendVisibleOrg(orgs[i]);
          }
          return vertCount;
        }

        function publishSharedSnapshot() {
          const camX = statF64[STAT.CAM_X], camY = statF64[STAT.CAM_Y];
          const zoom = statF64[STAT.CAM_ZOOM] || 1;
          const viewW = statF64[STAT.CAM_VIEW_W] || 800, viewH = statF64[STAT.CAM_VIEW_H] || 600;

          const v = tripleVerts[writeBufIdx];
          const vertCount = fillVertexBuffer(v, camX, camY, zoom, viewW, viewH);
          const fId = frameCounter++;

          Atomics.store(ctrlI32, CTRL.BUF0_VERT_COUNT + writeBufIdx, vertCount);
          Atomics.store(ctrlI32, CTRL.BUF0_FRAME_ID + writeBufIdx, fId);
          writeBufIdx = Atomics.exchange(ctrlI32, CTRL.READY_BUF, writeBufIdx);
          Atomics.store(ctrlI32, CTRL.NEW_FRAME_READY, 1);

          statF64[STAT.WORLD_W] = world.w;
          statF64[STAT.WORLD_H] = world.h;
          statF64[STAT.TIME] = world.time;
          statF64[STAT.FRAMES] = world.frames;
          statF64[STAT.POP] = world.pop;
          statF64[STAT.TOTAL_ORGS] = world.orgs.length;
          statF64[STAT.O2] = world.o2;
          statF64[STAT.CO2] = world.co2;

          const curSelId = Atomics.load(ctrlI32, CTRL.SELECTED_ID);
          let selectedDto = null;
          if (curSelId >= 0) {
            const sel = world.getOrganismById(curSelId);
            if (sel) {
              statF64[STAT.SEL_CX] = sel.cx;
              statF64[STAT.SEL_CY] = sel.cy;
              statF64[STAT.SEL_W] = sel.w;
              statF64[STAT.SEL_H] = sel.h;
              statF64[STAT.SEL_ALIVE] = 1;
              if (((fId - lastDtoSendTick) & 7) === 0) {
                lastDtoSendTick = fId;
                selectedDto = buildSelectedDto(sel);
              }
            } else {
              statF64[STAT.SEL_ALIVE] = 0;
              Atomics.compareExchange(ctrlI32, CTRL.SELECTED_ID, curSelId, -1);
            }
          } else {
            statF64[STAT.SEL_ALIVE] = 0;
          }

          const curTrkId = Atomics.load(ctrlI32, CTRL.TRACKED_ID);
          if (curTrkId >= 0) {
            const tr = world.getOrganismById(curTrkId);
            if (tr && tr.energy > 0.05) {
              statF64[STAT.TRACKED_CX] = tr.cx;
              statF64[STAT.TRACKED_CY] = tr.cy;
              statF64[STAT.TRACKED_ALIVE] = 1;
            } else {
              statF64[STAT.TRACKED_ALIVE] = 0;
              Atomics.compareExchange(ctrlI32, CTRL.TRACKED_ID, curTrkId, -1);
            }
          } else {
            statF64[STAT.TRACKED_ALIVE] = 0;
          }

          const histChanged = world.historyVersion !== lastSentHistoryVer;
          if (histChanged || selectedDto) {
            lastSentHistoryVer = world.historyVersion;
            self.postMessage({
              type: 'auxSync',
              history: histChanged ? world.history : null,
              historyVersion: world.historyVersion,
              selectedDto,
            });
          }
        }

        function packFallbackSnapshot(cam) {
          let v = vertPool.pop() || new Float32Array(TRIPLE_VERT_CAP * 3);
          const vertCount = fillVertexBuffer(v, cam.x, cam.y, cam.zoom, cam.viewW, cam.viewH);

          let selectedDto = null;
          if (selectedId != null) {
            const sel = world.getOrganismById(selectedId);
            if (sel) selectedDto = buildSelectedDto(sel);
            else selectedId = null;
          }

          let trackedPos = null;
          if (trackedId != null) {
            const tr = world.getOrganismById(trackedId);
            if (tr && tr.energy > 0.05) trackedPos = { id: tr.id, cx: tr.cx, cy: tr.cy };
            else trackedId = null;
          }

          self.postMessage({
            type: 'frame', frameId: frameCounter++, verts: v, vertCount,
            meta: {
              w: world.w, h: world.h, time: world.time, frames: world.frames, pop: world.pop,
              totalOrgs: world.orgs.length, o2: world.o2, co2: world.co2, historyVersion: world.historyVersion,
              history: world.history, selectedId, selectedDto, trackedId, trackedPos,
            },
          }, [v.buffer]);
        }

        function startSharedAutonomousLoop() {
          const tick = () => {
            const dragSeq = Atomics.load(ctrlI32, CTRL.DRAG_SEQ);
            if (dragSeq !== lastDragSeq) {
              lastDragSeq = dragSeq;
              const dragId = Atomics.load(ctrlI32, CTRL.DRAG_ID);
              const org = dragId >= 0 ? world.getOrganismById(dragId) : null;
              if (org) {
                org.cx = statF64[STAT.DRAG_CX];
                org.cy = statF64[STAT.DRAG_CY];
                org.dx = Config.clamp(statF64[STAT.DRAG_VX], -Config.MAX_VEL, Config.MAX_VEL);
                org.dy = Config.clamp(statF64[STAT.DRAG_VY], -Config.MAX_VEL, Config.MAX_VEL);
                org.dth = 0; org.calcBounds(false); org.isInsideWorld(); world.syncGrid();
                Atomics.store(ctrlI32, CTRL.CAM_DIRTY, 1);
              }
            }

            const running = Atomics.load(ctrlI32, CTRL.IS_RUNNING) === 1;
            const dirty = Atomics.compareExchange(ctrlI32, CTRL.CAM_DIRTY, 1, 0) === 1;

            if (running) {
              const iters = Math.max(1, Atomics.load(ctrlI32, CTRL.SPEED_MULT) || 1);
              const t0 = performance.now();
              for (let s = 0; s < iters; s++) {
                world.update(parallelDispatch);
                if (s > 0 && performance.now() - t0 >= 14.0) break;
              }
              publishSharedSnapshot();
            } else if (dirty) {
              publishSharedSnapshot();
            }

            setTimeout(tick, running ? 8 : 16);
          };
          setTimeout(tick, 4);
        }

        self.onmessage = (e) => {
          const msg = e.data;
          switch (msg.type) {
            case 'init': {
              setSeed(Config.SEED);
              if (msg.sharedBuffers) {
                hasSab = true;
                numSubWorkers = msg.subWorkerCount || 0;
                ctrlI32 = new Int32Array(msg.sharedBuffers.ctrlSab, 0, 64);
                statF64 = new Float64Array(msg.sharedBuffers.ctrlSab, 256, 32);
                syncI32 = new Int32Array(msg.sharedBuffers.syncSab);
                tripleVerts = msg.sharedBuffers.vertSabs.map((b) => new Float32Array(b));
                world = new World(Config.WORLD_W, Config.WORLD_H, msg.sharedBuffers);
                world.genesis(Config.INIT_ORG_COUNT);
                publishSharedSnapshot();
                startSharedAutonomousLoop();
              } else {
                world = new World(Config.WORLD_W, Config.WORLD_H, null);
                world.genesis(Config.INIT_ORG_COUNT);
              }
              break;
            }
            case 'step': {
              if (hasSab) break;
              const iters = msg.iters || 1, budget = msg.budget || 14, t0 = performance.now();
              for (let s = 0; s < iters; s++) {
                world.update(null);
                if (s > 0 && performance.now() - t0 >= budget) break;
              }
              packFallbackSnapshot(msg.cam);
              break;
            }
            case 'renderOnly':
              if (!hasSab) packFallbackSnapshot(msg.cam);
              break;
            case 'recycle':
              if (msg.verts) vertPool.push(msg.verts);
              break;
            case 'hitTestFallback': {
              const hit = world.grid.hitTestWorld(msg.wx, msg.wy, world.orgArena);
              selectedId = hit ? hit.id : null;
              packFallbackSnapshot(msg.cam);
              break;
            }
            case 'setSelection':
              selectedId = msg.selectedId; trackedId = msg.trackedId;
              if (hasSab) {
                Atomics.store(ctrlI32, CTRL.SELECTED_ID, selectedId ?? -1);
                Atomics.store(ctrlI32, CTRL.TRACKED_ID, trackedId ?? -1);
                lastDtoSendTick = 0;
                Atomics.store(ctrlI32, CTRL.CAM_DIRTY, 1);
              }
              break;
            case 'setConfig':
              Object.assign(Config, msg.patch);
              if (msg.genes) Config.GENES = msg.genes.map((g) => ({ ...g }));
              if (msg.refreshPhenotypes) world.refreshPhenotypes();
              if (hasSab) Atomics.store(ctrlI32, CTRL.CAM_DIRTY, 1);
              break;
            case 'setDimensions':
              world.w = Config.WORLD_W = msg.w; world.h = Config.WORLD_H = msg.h;
              for (let i = 0; i < world.orgs.length; i++) world.orgs[i].isInsideWorld();
              world.syncGrid();
              if (hasSab) Atomics.store(ctrlI32, CTRL.CAM_DIRTY, 1);
              break;
            case 'genesis':
              if (msg.seed != null) Config.SEED = msg.seed;
              setSeed(Config.SEED);
              if (msg.w) world.w = Config.WORLD_W = msg.w;
              if (msg.h) world.h = Config.WORLD_H = msg.h;
              world.genesis(Config.INIT_ORG_COUNT);
              selectedId = trackedId = null;
              if (hasSab) {
                Atomics.store(ctrlI32, CTRL.SELECTED_ID, -1);
                Atomics.store(ctrlI32, CTRL.TRACKED_ID, -1);
                publishSharedSnapshot();
              }
              break;
            case 'addGas':
              if (msg.co2) world.co2 = Math.max(0, world.co2 + msg.co2);
              if (msg.o2) world.o2 = Math.max(0, world.o2 + msg.o2);
              world.history.push({ pop: world.pop, o2: Math.round(world.o2), co2: Math.round(world.co2) });
              if (world.history.length > 60) world.history.shift();
              world.historyVersion++;
              if (hasSab) publishSharedSnapshot();
              break;
            case 'spawnDna': {
              const o = world.spawnRandom(hydrateDna(msg.dna), msg.wx, msg.wy);
              if (o) {
                o.growth = 1; o.symmetric(); o.calcBounds(true); o.isInsideWorld(); world.syncGrid();
                selectedId = o.id;
                if (hasSab) {
                  Atomics.store(ctrlI32, CTRL.SELECTED_ID, o.id);
                  lastDtoSendTick = 0;
                  publishSharedSnapshot();
                }
              }
              break;
            }
            case 'dragOrg': {
              const org = world.getOrganismById(msg.id);
              if (org) {
                org.cx = msg.cx; org.cy = msg.cy;
                org.dx = Config.clamp(msg.vx, -Config.MAX_VEL, Config.MAX_VEL);
                org.dy = Config.clamp(msg.vy, -Config.MAX_VEL, Config.MAX_VEL);
                org.dth = 0; org.calcBounds(false); org.isInsideWorld(); world.syncGrid();
              }
              break;
            }
            case 'mutateSelected': {
              const curId = hasSab ? Atomics.load(ctrlI32, CTRL.SELECTED_ID) : selectedId;
              const parent = curId != null && curId >= 0 ? world.getOrganismById(curId) : null;
              if (parent) {
                const oldDna = parent.dna, nextDna = GeneticCode.acquire(parent.infDna || parent.dna);
                if (parent.infDna) { parent.infDna.release(); parent.infDna = null; }
                parent.dna = nextDna;
                if (oldDna) oldDna.release();
                parent.symmetric(true); parent.calcBounds(true); parent.flash(Config.PALETTE.Y); world.syncGrid();
                if (hasSab) { lastDtoSendTick = 0; publishSharedSnapshot(); }
              }
              break;
            }
            case 'killSelected': {
              const curId = hasSab ? Atomics.load(ctrlI32, CTRL.SELECTED_ID) : selectedId;
              if (curId != null && curId >= 0) {
                world.getOrganismById(curId)?.die();
                if (hasSab) { lastDtoSendTick = 0; publishSharedSnapshot(); }
              }
              break;
            }
          }
        };
      `;
      const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
      const worker = new Worker(url);
      URL.revokeObjectURL(url);
      worker.postMessage({ type: 'init', sharedBuffers, subWorkerCount });
      return worker;
    }

    Object.assign(Namespace, {
      CTRL, STAT, SYNC, TRIPLE_VERT_CAP,
      createSharedMemoryBundle, createCollisionSubWorker, createSimulationWorker,
    });
  })(_, _);
  //#endregion

  //#region 16: SimulationEngine
  ((Namespace, {
    Config, setSeed, fastRand, GeneticCode, SpatialGrid, OrganismArena, Presets,
    Camera, WorldRenderer, createSignal, CTRL, STAT,
    createSharedMemoryBundle, createCollisionSubWorker, createSimulationWorker,
  }) => {
    class SimulationEngine {
      constructor() {
        this.world = {
          w: Config.WORLD_W, h: Config.WORLD_H, pop: 0, time: 0, frames: 0,
          o2: Config.INIT_O2, co2: Config.INIT_CO2, history: [], historyVersion: 0,
          refreshPhenotypes: () => this.syncConfig(true),
        };
        this.camera = new Camera();
        this.renderer = null; this.canvas = null;
        this.isRunning = true; this.speedMultiplier = 1;
        this.selectedId = null; this.trackedId = null;
        this.isFitLocked = false; this.isAspectFill = true; this.pendingSpawn = null;

        this.fps = 60; this._frames = 0; this._uiFrame = 0;
        this._lastFpsTime = performance.now(); this._animReq = null; this._camDirty = true;
        this._lastHistoryVersion = -1; this._cachedHistory = [];

        this.sharedBuffers = createSharedMemoryBundle();
        this.hasSab = Boolean(this.sharedBuffers);
        this.subWorkers = [];

        if (this.hasSab) {
          const hw = Math.min(8, Math.max(2, (G.navigator?.hardwareConcurrency || 4) - 1));
          for (let i = 0; i < hw; i++) this.subWorkers.push(createCollisionSubWorker(this.sharedBuffers));
          this.ctrlI32 = new Int32Array(this.sharedBuffers.ctrlSab, 0, 64);
          this.statF64 = new Float64Array(this.sharedBuffers.ctrlSab, 256, 32);
          this.sharedVertViews = this.sharedBuffers.vertSabs.map((b) => new Float32Array(b));
          this.sharedGrid = new SpatialGrid(90, this.sharedBuffers.gridSab, false);
          this.sharedOrgArena = new OrganismArena(OrganismArena.MAX_ORGS, this.sharedBuffers.orgArenaSab, false);
          this._readBufIdx = 2;

          Atomics.store(this.ctrlI32, CTRL.IS_RUNNING, 1);
          Atomics.store(this.ctrlI32, CTRL.SPEED_MULT, 1);
          Atomics.store(this.ctrlI32, CTRL.SELECTED_ID, -1);
          Atomics.store(this.ctrlI32, CTRL.TRACKED_ID, -1);
          Atomics.store(this.ctrlI32, CTRL.DRAG_ID, -1);
          Atomics.store(this.ctrlI32, CTRL.READY_BUF, 1);
          Atomics.store(this.ctrlI32, CTRL.WORKER_COUNT, this.subWorkers.length + 1);
          this.statF64[STAT.CAM_ZOOM] = 1;
          this.statF64[STAT.CAM_VIEW_W] = 800;
          this.statF64[STAT.CAM_VIEW_H] = 600;
        }

        this.threadCount = this.hasSab ? this.subWorkers.length + 1 : 1;

        this.statsSignal = createSignal({
          time: 0, pop: 0, dead: 0, o2: Config.INIT_O2, co2: Config.INIT_CO2,
          fps: 60, zoom: 100, threads: this.threadCount, sab: this.hasSab,
          history: [], historyVersion: 0,
        });
        this.selectedOrgSignal = createSignal(null);
        this.controlsSignal = createSignal({
          isRunning: true, speed: 1, isTracked: false, isFitLocked: false, isAspectFill: true, pendingSpawn: null,
        });

        this.worker = createSimulationWorker(this.sharedBuffers, this.subWorkers.length);
        this.worker.onmessage = (e) => this._onWorkerMessage(e.data);
        this._workerBusy = false; this._latestFrameId = 0;
        this._latestVerts = null; this._latestVertCount = 0;
        this._latestSelectedDto = null; this._totalOrgsCount = Config.INIT_ORG_COUNT;
      }

      _syncCameraToSharedBlock() {
        if (!this.hasSab) return;
        this.statF64[STAT.CAM_X] = this.camera.x;
        this.statF64[STAT.CAM_Y] = this.camera.y;
        this.statF64[STAT.CAM_ZOOM] = this.camera.zoom;
        if (this.renderer) {
          this.statF64[STAT.CAM_VIEW_W] = this.renderer.width;
          this.statF64[STAT.CAM_VIEW_H] = this.renderer.height;
        }
        Atomics.store(this.ctrlI32, CTRL.CAM_DIRTY, 1);
      }

      syncConfig(refreshPhenotypes = false) {
        const { SEED, WORLD_W, WORLD_H, RUB, ELASTICITY, INIT_O2, INIT_CO2, INIT_ORG_COUNT, INIT_ORG_ENERGY, MAX_AGE, MUT, SEGMENT_UPKEEP_DIVISOR, SUBSTANCES_DRAINAGE_DIVISOR, DEAD_ENERGY_LOSS, PHOTO_ENERGY_DIVISOR, CHEMO_OBTAINED_ENERGY, CHEMO_RELEASED_PROP, AUTO_GENESIS, GENES } = Config;
        this.worker.postMessage({
          type: 'setConfig',
          patch: { SEED, WORLD_W, WORLD_H, RUB, ELASTICITY, INIT_O2, INIT_CO2, INIT_ORG_COUNT, INIT_ORG_ENERGY, MAX_AGE, MUT, SEGMENT_UPKEEP_DIVISOR, SUBSTANCES_DRAINAGE_DIVISOR, DEAD_ENERGY_LOSS, PHOTO_ENERGY_DIVISOR, CHEMO_OBTAINED_ENERGY, CHEMO_RELEASED_PROP, AUTO_GENESIS },
          genes: GENES, refreshPhenotypes,
        });
        this._camDirty = true;
        this._syncCameraToSharedBlock();
      }

      _hydrateDnaObject(rawDna) {
        if (!rawDna || typeof rawDna.buildSegments === 'function') return rawDna;
        const dna = GeneticCode.acquire(null);
        GeneticCode._freeGenes(dna.genes);
        dna.sym = rawDna.sym; dna.mirror = rawDna.mirror; dna.disp = Boolean(rawDna.disp); dna.repEnergy = rawDna.repEnergy;
        for (const g of rawDna.genes) dna.genes.push(GeneticCode._allocGene(g.l, g.th, g.c, g.cIdx ?? Config.PALETTE_INDICES[g.c] ?? 1));
        return dna;
      }

      _onWorkerMessage(msg) {
        if (msg.type === 'auxSync') {
          if (msg.history) {
            this.world.history = msg.history;
            this.world.historyVersion = msg.historyVersion;
          }
          if (msg.selectedDto) {
            if (msg.selectedDto.dna) {
              const hydrated = this._hydrateDnaObject(msg.selectedDto.dna);
              this._latestSelectedDto?.dna?.release?.();
              msg.selectedDto.dna = hydrated;
            }
            this._latestSelectedDto = msg.selectedDto;
          }
          return;
        }

        if (msg.type !== 'frame') return;
        this._workerBusy = false;
        if (this._latestVerts) {
          this.worker.postMessage({ type: 'recycle', verts: this._latestVerts }, [this._latestVerts.buffer]);
        }

        this._latestFrameId = msg.frameId;
        this._latestVerts = msg.verts;
        this._latestVertCount = msg.vertCount;

        const m = msg.meta;
        this.world.time = m.time; this.world.frames = m.frames; this.world.pop = m.pop;
        this.world.o2 = m.o2; this.world.co2 = m.co2; this._totalOrgsCount = m.totalOrgs;
        if (m.historyVersion !== this.world.historyVersion) {
          this.world.history = m.history; this.world.historyVersion = m.historyVersion;
        }
        if (m.selectedDto?.dna) {
          const hydrated = this._hydrateDnaObject(m.selectedDto.dna);
          this._latestSelectedDto?.dna?.release?.();
          m.selectedDto.dna = hydrated;
        }
        this._latestSelectedDto = m.selectedDto;
        this.selectedId = m.selectedId;

        if (this.trackedId != null) {
          if (!m.trackedPos) { this.trackedId = null; this.notifyControls(); }
          else if (!this.isFitLocked && this.canvas?.parentElement) {
            const p = this.canvas.parentElement;
            this.camera.centerOn(m.trackedPos.cx, m.trackedPos.cy, p.clientWidth, p.clientHeight, this.world.w, this.world.h);
          }
        }
      }

      notifyControls() {
        this.controlsSignal.value = {
          isRunning: this.isRunning, speed: this.speedMultiplier, isTracked: this.trackedId != null,
          isFitLocked: this.isFitLocked, isAspectFill: this.isAspectFill,
          pendingSpawn: this.pendingSpawn ? { key: this.pendingSpawn.key, label: this.pendingSpawn.label } : null,
        };
      }

      notifyStats() {
        if (this.hasSab) {
          this.world.time = this.statF64[STAT.TIME] | 0;
          this.world.frames = this.statF64[STAT.FRAMES] | 0;
          this.world.pop = this.statF64[STAT.POP] | 0;
          this._totalOrgsCount = this.statF64[STAT.TOTAL_ORGS] | 0;
          this.world.o2 = this.statF64[STAT.O2];
          this.world.co2 = this.statF64[STAT.CO2];
          const sabSelId = Atomics.load(this.ctrlI32, CTRL.SELECTED_ID);
          if (sabSelId < 0) {
            this.selectedId = null;
            this._latestSelectedDto = null;
          }
        }
        if (this.world.historyVersion !== this._lastHistoryVersion) {
          this._cachedHistory = this.world.history.slice();
          this._lastHistoryVersion = this.world.historyVersion;
        }
        this.statsSignal.value = {
          time: this.world.time, pop: this.world.pop, dead: Math.max(0, this._totalOrgsCount - this.world.pop),
          o2: Math.round(this.world.o2), co2: Math.round(this.world.co2),
          fps: this.fps, zoom: Math.round(this.camera.zoom * 100),
          threads: this.threadCount, sab: this.hasSab,
          history: this._cachedHistory, historyVersion: this.world.historyVersion,
        };
        this.selectedOrgSignal.value = this.selectedId != null ? this._latestSelectedDto : null;
      }

      async attachCanvas(canvas) {
        if (this.renderer) this.detachCanvas();
        this.canvas = canvas;
        const renderer = new WorldRenderer();
        await renderer.init(canvas);
        if (this.canvas !== canvas) return renderer.destroy();
        this.renderer = renderer;
        this.resize(); this.fitToAvailableSpace(); this.notifyStats(); this.startLoop();
      }

      detachCanvas() {
        if (this._animReq) { cancelAnimationFrame(this._animReq); this._animReq = null; }
        this.renderer?.destroy(); this.renderer = this.canvas = null;
      }

      fitToAvailableSpace() {
        const p = this.canvas?.parentElement;
        if (p) {
          this.camera.fitWorld(this.world.w, this.world.h, p.clientWidth, p.clientHeight);
          this._camDirty = true;
          this._syncCameraToSharedBlock();
        }
      }

      toggleFitLock() {
        this.isFitLocked = !this.isFitLocked;
        if (this.isFitLocked) {
          this.trackedId = null;
          this.worker.postMessage({ type: 'setSelection', selectedId: this.selectedId, trackedId: null });
          this.fitToAvailableSpace();
        }
        this.notifyControls();
      }

      toggleAspectFill() { this.isAspectFill = !this.isAspectFill; this.updateWorldAspect(); this.notifyControls(); }

      setWorldDimensions(w, h) {
        this.isAspectFill = false;
        this.world.w = Math.max(200, Math.round(w)); this.world.h = Math.max(200, Math.round(h));
        this.worker.postMessage({ type: 'setDimensions', w: this.world.w, h: this.world.h });
        const p = this.canvas?.parentElement;
        if (p) {
          if (this.isFitLocked) this.fitToAvailableSpace();
          else this.camera.clampToBounds(this.world.w, this.world.h, p.clientWidth, p.clientHeight);
        }
        this._camDirty = true;
        this._syncCameraToSharedBlock();
        this.notifyControls();
      }

      updateWorldAspect() {
        const p = this.canvas?.parentElement;
        if (!p || !p.clientWidth || !p.clientHeight) return;
        const viewW = p.clientWidth, viewH = p.clientHeight;
        if (this.isAspectFill) {
          const baseArea = Config.WORLD_W * Config.WORLD_H, aspect = viewW / viewH;
          this.world.w = Math.max(400, Math.round(Math.sqrt(baseArea * aspect)));
          this.world.h = Math.max(400, Math.round(Math.sqrt(baseArea / aspect)));
        } else {
          this.world.w = Config.WORLD_W; this.world.h = Config.WORLD_H;
        }
        this.worker.postMessage({ type: 'setDimensions', w: this.world.w, h: this.world.h });
        if (this.isFitLocked) this.fitToAvailableSpace();
        else this.camera.clampToBounds(this.world.w, this.world.h, viewW, viewH);
        this._camDirty = true;
        this._syncCameraToSharedBlock();
      }

      resize() {
        const p = this.canvas?.parentElement;
        if (!p || !this.renderer) return;
        this.renderer.resize(p.clientWidth, p.clientHeight);
        if (this.isAspectFill) this.updateWorldAspect();
        else if (this.isFitLocked) this.fitToAvailableSpace();
        else this.camera.clampToBounds(this.world.w, this.world.h, p.clientWidth, p.clientHeight);
        this._camDirty = true;
        this._syncCameraToSharedBlock();
      }

      startLoop() {
        const loop = (t) => {
          this._frames++; this._uiFrame++;
          if (t - this._lastFpsTime >= 1000) { this.fps = this._frames; this._frames = 0; this._lastFpsTime = t; }

          if (this.hasSab && this.renderer) {
            if (Atomics.compareExchange(this.ctrlI32, CTRL.NEW_FRAME_READY, 1, 0) === 1) {
              this._readBufIdx = Atomics.exchange(this.ctrlI32, CTRL.READY_BUF, this._readBufIdx);
            }
            const vertCount = Atomics.load(this.ctrlI32, CTRL.BUF0_VERT_COUNT + this._readBufIdx);
            const frameId = Atomics.load(this.ctrlI32, CTRL.BUF0_FRAME_ID + this._readBufIdx);
            const verts = this.sharedVertViews[this._readBufIdx];

            if (this.trackedId != null) {
              if (this.statF64[STAT.TRACKED_ALIVE] === 0) {
                this.trackedId = null;
                this.notifyControls();
              } else if (!this.isFitLocked && this.canvas?.parentElement) {
                const p = this.canvas.parentElement;
                this.camera.centerOn(this.statF64[STAT.TRACKED_CX], this.statF64[STAT.TRACKED_CY], p.clientWidth, p.clientHeight, this.world.w, this.world.h);
                this._syncCameraToSharedBlock();
              }
            }

            if (this.isFitLocked && this.canvas?.parentElement) {
              const p = this.canvas.parentElement;
              this.camera.fitWorld(this.world.w, this.world.h, p.clientWidth, p.clientHeight);
            }

            let selBounds = null;
            if (this.selectedId != null && this.statF64[STAT.SEL_ALIVE] === 1) {
              selBounds = {
                cx: this.statF64[STAT.SEL_CX],
                cy: this.statF64[STAT.SEL_CY],
                w: this.statF64[STAT.SEL_W],
                h: this.statF64[STAT.SEL_H],
              };
            }

            if (vertCount > 0) {
              this.renderer.renderFromWorkerSnapshot(verts, vertCount, frameId, this.camera, selBounds, this.pendingSpawn);
            }
          } else {
            if (!this._workerBusy && this.renderer && (this.isRunning || this._camDirty)) {
              this._workerBusy = true; this._camDirty = false;
              this.worker.postMessage({
                type: this.isRunning ? 'step' : 'renderOnly',
                iters: this.speedMultiplier, budget: 14.0,
                cam: { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom, viewW: this.renderer.width, viewH: this.renderer.height },
              });
            }

            if (this.isFitLocked && this.canvas?.parentElement) {
              const p = this.canvas.parentElement;
              this.camera.fitWorld(this.world.w, this.world.h, p.clientWidth, p.clientHeight);
            }

            if (this.renderer && this._latestVerts) {
              this.renderer.renderFromWorkerSnapshot(
                this._latestVerts, this._latestVertCount, this._latestFrameId,
                this.camera, this.selectedId != null ? this._latestSelectedDto : null, this.pendingSpawn,
              );
            }
          }

          if ((this._uiFrame & 7) === 0) this.notifyStats();
          this._animReq = requestAnimationFrame(loop);
        };
        this._animReq = requestAnimationFrame(loop);
      }

      toggleRun() {
        this.isRunning = !this.isRunning;
        if (this.hasSab) Atomics.store(this.ctrlI32, CTRL.IS_RUNNING, this.isRunning ? 1 : 0);
        this._camDirty = true;
        this._syncCameraToSharedBlock();
        this.notifyControls();
      }

      cycleSpeed() {
        const speeds = [1, 2, 4, 8, 16, 32];
        this.speedMultiplier = speeds[(speeds.indexOf(this.speedMultiplier) + 1) % speeds.length];
        if (this.hasSab) Atomics.store(this.ctrlI32, CTRL.SPEED_MULT, this.speedMultiplier);
        this.notifyControls();
      }

      setSpeed(mult) {
        if ([1, 2, 4, 8, 16, 32].includes(mult)) {
          this.speedMultiplier = mult;
          if (this.hasSab) Atomics.store(this.ctrlI32, CTRL.SPEED_MULT, mult);
          this.notifyControls();
        }
      }

      resetWorld() {
        this.selectedId = this.trackedId = this.pendingSpawn = this._latestSelectedDto = null;
        if (this.isAspectFill) this.updateWorldAspect();
        else if (this.isFitLocked) this.fitToAvailableSpace();
        else if (this.canvas?.parentElement) {
          const p = this.canvas.parentElement;
          this.camera.clampToBounds(this.world.w, this.world.h, p.clientWidth, p.clientHeight);
        }
        setSeed(Config.SEED);
        this.syncConfig(false);
        this.worker.postMessage({ type: 'genesis', seed: Config.SEED, w: this.world.w, h: this.world.h });
        this._camDirty = true; this.notifyControls(); this.notifyStats();
      }

      addCo2(co2) { this.worker.postMessage({ type: 'addGas', co2 }); this._camDirty = true; }
      addO2(o2) { this.worker.postMessage({ type: 'addGas', o2 }); this._camDirty = true; }

      _buildPreviewGeometry(dna) {
        const raw = dna.buildSegments(1);
        let minX = 0, maxX = 0, minY = 0, maxY = 0;
        for (const l of raw) {
          minX = Math.min(minX, l.x1, l.x2); maxX = Math.max(maxX, l.x1, l.x2);
          minY = Math.min(minY, l.y1, l.y2); maxY = Math.max(maxY, l.y1, l.y2);
        }
        const cx = (minX + maxX) * 0.5, cy = (minY + maxY) * 0.5;
        let maxR = 8;
        const lines = raw.map((l) => {
          const x1 = l.x1 - cx, y1 = l.y1 - cy, x2 = l.x2 - cx, y2 = l.y2 - cy;
          maxR = Math.max(maxR, Math.hypot(x1, y1), Math.hypot(x2, y2));
          return { x1, y1, x2, y2 };
        });
        return { lines, radius: maxR };
      }

      armPlacement(key, label, dnaFactory) {
        if (this.pendingSpawn?.key === key) return this.spawnPendingAtCenter();
        const sampleDna = dnaFactory(), { lines, radius } = this._buildPreviewGeometry(sampleDna);
        sampleDna.release();
        this.pendingSpawn = { key, label, dnaFactory, lines, radius, wx: null, wy: null };
        this.notifyControls();
      }

      spawnPreset(name) { if (Presets[name]) this.armPlacement(name, name, () => Presets[name]()); }

      importDnaCode(codeStr) {
        const templateDna = codeStr && GeneticCode.fromShareCode(codeStr);
        if (!templateDna) return false;
        this.armPlacement('imported_dna', 'Imported DNA', () => templateDna.clone());
        return true;
      }

      cloneSelected() {
        if (this.selectedId != null && this._latestSelectedDto?.dna) {
          const templateDna = this._hydrateDnaObject(this._latestSelectedDto.dna), id = this._latestSelectedDto.id;
          this.armPlacement(`clone_${id}`, `Clone #${id}`, () => templateDna.clone());
        }
      }

      updatePlacementCursor(screenX, screenY) {
        if (!this.pendingSpawn) return;
        const { x, y } = this.camera.screenToWorld(screenX, screenY);
        this.pendingSpawn.wx = Config.clamp(x, 10, this.world.w - 10);
        this.pendingSpawn.wy = Config.clamp(y, 10, this.world.h - 10);
      }

      placePendingAt(screenX, screenY, keepArmed = false) {
        if (!this.pendingSpawn) return null;
        const { x, y } = this.camera.screenToWorld(screenX, screenY);
        const wx = Config.clamp(x, 12, this.world.w - 12), wy = Config.clamp(y, 12, this.world.h - 12);
        const dna = this.pendingSpawn.dnaFactory();
        this.worker.postMessage({
          type: 'spawnDna', wx, wy,
          dna: { sym: dna.sym, mirror: dna.mirror, disp: dna.disp, repEnergy: dna.repEnergy, genes: dna.genes },
        });
        dna.release();
        if (!keepArmed) { this.pendingSpawn = null; this.notifyControls(); }
        this._camDirty = true; this.notifyStats();
        return true;
      }

      spawnPendingAtCenter() {
        if (!this.pendingSpawn) return;
        const p = this.canvas?.parentElement;
        const center = p ? this.camera.screenToWorld(p.clientWidth * 0.5, p.clientHeight * 0.5) : { x: this.world.w * 0.5, y: this.world.h * 0.5 };
        const wx = Config.clamp(center.x + (fastRand() - 0.5) * 40, 20, this.world.w - 20);
        const wy = Config.clamp(center.y + (fastRand() - 0.5) * 40, 20, this.world.h - 20);
        const dna = this.pendingSpawn.dnaFactory();
        this.worker.postMessage({
          type: 'spawnDna', wx, wy,
          dna: { sym: dna.sym, mirror: dna.mirror, disp: dna.disp, repEnergy: dna.repEnergy, genes: dna.genes },
        });
        dna.release();
        this.pendingSpawn = null; this._camDirty = true;
        this.notifyControls(); this.notifyStats();
      }

      cancelPlacement() {
        if (!this.pendingSpawn) return false;
        this.pendingSpawn = null; this.notifyControls();
        return true;
      }

      mutateSelected() { if (this.selectedId != null) { this.worker.postMessage({ type: 'mutateSelected' }); this._camDirty = true; } }

      getOrganismAtScreen(screenX, screenY) {
        const { x: wx, y: wy } = this.camera.screenToWorld(screenX, screenY);
        if (this.hasSab) {
          return this.sharedGrid.hitTestWorld(wx, wy, this.sharedOrgArena);
        }
        return null;
      }

      selectOrganismAt(screenX, screenY) {
        if (this.hasSab) {
          const hit = this.getOrganismAtScreen(screenX, screenY);
          this.selectedId = hit ? hit.id : null;
          if (!hit) this._latestSelectedDto = null;
          this.worker.postMessage({ type: 'setSelection', selectedId: this.selectedId, trackedId: this.trackedId });
          this._camDirty = true; this.notifyStats();
          return hit;
        }
        const { x: wx, y: wy } = this.camera.screenToWorld(screenX, screenY);
        this.worker.postMessage({
          type: 'hitTestFallback', wx, wy,
          cam: { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom, viewW: this.renderer?.width || 800, viewH: this.renderer?.height || 600 },
        });
        return null;
      }

      moveOrganismToScreen(orgId, screenX, screenY, offsetX = 0, offsetY = 0, vxWorld = 0, vyWorld = 0) {
        const { x: wx, y: wy } = this.camera.screenToWorld(screenX, screenY);
        const cx = Config.clamp(wx - offsetX, 4, this.world.w - 4), cy = Config.clamp(wy - offsetY, 4, this.world.h - 4);
        if (this._latestSelectedDto?.id === orgId) { this._latestSelectedDto.cx = cx; this._latestSelectedDto.cy = cy; }

        if (this.hasSab) {
          this.statF64[STAT.DRAG_CX] = cx;
          this.statF64[STAT.DRAG_CY] = cy;
          this.statF64[STAT.DRAG_VX] = vxWorld;
          this.statF64[STAT.DRAG_VY] = vyWorld;
          Atomics.store(this.ctrlI32, CTRL.DRAG_ID, orgId);
          Atomics.add(this.ctrlI32, CTRL.DRAG_SEQ, 1);
        } else {
          this.worker.postMessage({ type: 'dragOrg', id: orgId, cx, cy, vx: vxWorld, vy: vyWorld });
        }
        this._camDirty = true;
      }

      clearSelection() {
        this.selectedId = this.trackedId = this._latestSelectedDto = null;
        this.worker.postMessage({ type: 'setSelection', selectedId: null, trackedId: null });
        this._camDirty = true; this.notifyControls(); this.notifyStats();
      }

      toggleTracking() {
        if (this.trackedId != null) this.trackedId = null;
        else if (this.selectedId != null) { this.trackedId = this.selectedId; this.isFitLocked = false; }
        this.worker.postMessage({ type: 'setSelection', selectedId: this.selectedId, trackedId: this.trackedId });
        this._camDirty = true; this.notifyControls();
      }

      killSelected() { if (this.selectedId != null) { this.worker.postMessage({ type: 'killSelected' }); this._camDirty = true; } }

      pan(dx, dy) {
        if (this.isFitLocked) return;
        this.camera.x += dx; this.camera.y += dy;
        if (this.trackedId != null) {
          this.trackedId = null;
          this.worker.postMessage({ type: 'setSelection', selectedId: this.selectedId, trackedId: null });
          this.notifyControls();
        }
        const p = this.canvas?.parentElement;
        if (p) this.camera.clampToBounds(this.world.w, this.world.h, p.clientWidth, p.clientHeight);
        this._camDirty = true;
        this._syncCameraToSharedBlock();
      }

      zoomAt(screenX, screenY, factor) {
        if (this.isFitLocked) return;
        const p = this.canvas?.parentElement;
        if (p) this.camera.zoomAt(screenX, screenY, factor, this.world.w, this.world.h, p.clientWidth, p.clientHeight);
        this._camDirty = true;
        this._syncCameraToSharedBlock();
      }
    }

    Object.assign(Namespace, { SimulationEngine });
  })(_, _);
  //#endregion

  //#region 17: DnaDraftUtilities
  ((Namespace, { Config, GeneticCode, Presets }) => {
    const dnaToDraft = (dna) => ({
      sym: Config.clamp(Number(dna?.sym) || 2, 1, 8),
      mirror: Boolean(dna?.mirror),
      disp: Boolean(dna?.disp),
      genes: (dna?.genes?.length ? dna.genes : [{ l: 12, th: 0.4, cIdx: 1 }]).map((g) => ({
        l: Number(Number(g.l ?? 10).toFixed(2)),
        th: Number(Number(g.th ?? 0).toFixed(3)),
        cIdx: Config.clamp(Number(g.cIdx ?? Config.PALETTE_INDICES[g.c] ?? 1) | 0, 0, Config.GENES.length - 1),
      })),
    });

    const draftToDna = (draft) => {
      const dna = GeneticCode.acquire(null);
      GeneticCode._freeGenes(dna.genes);
      dna.sym = Config.clamp(Number(draft.sym) || 2, 1, 8);
      dna.mirror = draft.mirror ? 1 : 0;
      dna.disp = Boolean(draft.disp);
      const list = draft.genes?.length ? draft.genes : [{ l: 12, th: 0.4, cIdx: 1 }];
      for (let i = 0; i < list.length && i < 24; i++) {
        const g = list[i];
        const cIdx = Config.clamp(Number(g.cIdx) | 0, 0, Config.GENES.length - 1);
        const hex = Config.GENES[cIdx]?.hex || '#00ff00';
        dna.genes.push(GeneticCode._allocGene(Config.clamp(Number(g.l) || 10, 4, 24), Number(g.th) || 0, hex, cIdx));
      }
      dna.repEnergy = 32 + 2.2 * dna.genes.length * dna.sym;
      return dna;
    };

    const computeDraftStats = (dna) => {
      const count = dna.buildIntoScratch(1);
      const sx1 = GeneticCode.scratchX1, sy1 = GeneticCode.scratchY1;
      const sx2 = GeneticCode.scratchX2, sy2 = GeneticCode.scratchY2, sc = GeneticCode.scratchCIdx;
      let baseMass = 0, baseUpkeepMass = 0, photoMass = 0, ciliaCount = 0, nKids = 1;
      for (let i = 0; i < count; i++) {
        const m = Math.max(0.1, Math.hypot(sx2[i] - sx1[i], sy2[i] - sy1[i]));
        const c = sc[i];
        const upkeepMult = (Config.SEGMENT_UPKEEP[c] ?? 1.0) + (Config.GENES[c]?.cost ?? 0) * 0.5;
        baseMass += m;
        baseUpkeepMass += m * upkeepMult;
        if (c === 1) photoMass += m;
        else if (c === 3) ciliaCount++;
        else if (c === 6) nKids++;
      }
      const mass = Math.max(0.5, baseMass);
      const upkeepMass = Math.max(0.3, baseUpkeepMass);
      const upkeepPower = upkeepMass * Math.pow(mass, 0.15);
      const upkeepPer100 = ((upkeepPower / Math.max(1, Config.SEGMENT_UPKEEP_DIVISOR)) * 100).toFixed(2);
      return {
        segCount: count,
        repEnergy: dna.repEnergy.toFixed(1),
        mass: mass.toFixed(1),
        upkeepPer100,
        photoMass: photoMass.toFixed(1),
        ciliaCount,
        nKids: Config.clamp(nKids, 1, 6),
        shareCode: dna.toShareCode(),
      };
    };

    const getInitialParamsState = () => ({
      SEED: Config.SEED, WORLD_W: Config.WORLD_W, WORLD_H: Config.WORLD_H, RUB: Config.RUB, ELASTICITY: Config.ELASTICITY,
      INIT_O2: Config.INIT_O2, INIT_CO2: Config.INIT_CO2, INIT_ORG_COUNT: Config.INIT_ORG_COUNT, INIT_ORG_ENERGY: Config.INIT_ORG_ENERGY,
      MAX_AGE: Config.MAX_AGE, MUT: Config.MUT, SEGMENT_UPKEEP_DIVISOR: Config.SEGMENT_UPKEEP_DIVISOR,
      SUBSTANCES_DRAINAGE_DIVISOR: Config.SUBSTANCES_DRAINAGE_DIVISOR, DEAD_ENERGY_LOSS: Config.DEAD_ENERGY_LOSS,
      PHOTO_ENERGY_DIVISOR: Config.PHOTO_ENERGY_DIVISOR, CHEMO_OBTAINED_ENERGY: Config.CHEMO_OBTAINED_ENERGY,
      CHEMO_RELEASED_PROP: Config.CHEMO_RELEASED_PROP, AUTO_GENESIS: Config.AUTO_GENESIS,
      GENES: Config.GENES.map((g) => ({ ...g })),
    });

    const getInitialGeneDraft = () => {
      const sample = Presets.Hunter();
      const draft = dnaToDraft(sample);
      sample.release();
      return draft;
    };

    Object.assign(Namespace, {
      dnaToDraft, draftToDna, computeDraftStats, getInitialParamsState, getInitialGeneDraft,
    });
  })(_, _);
  //#endregion

  //#region 18: SharedUIPrimitives
  ((Namespace, { html, useEffect, useRef, Config, GeneRenderer }) => {
    const Btn = ({ children, onClick, disabled, cls = '', variant = '', title = '' }) => {
      const styles = {
        suc: 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border-emerald-700/80 font-bold',
        wrn: 'bg-amber-950/80 hover:bg-amber-900 text-amber-300 border-amber-700/80 font-bold',
        dan: 'bg-rose-950/80 hover:bg-rose-900 text-rose-300 border-rose-700/80',
        act: 'bg-sky-950 hover:bg-sky-900 text-sky-200 border-sky-500 font-bold ring-1 ring-sky-500/50',
        activeFit: 'bg-indigo-950 hover:bg-indigo-900 text-indigo-200 border-indigo-400 font-bold ring-1 ring-indigo-400/50',
      }[variant] || 'bg-neutral-800/80 hover:bg-neutral-700 text-neutral-200 border-neutral-700';

      return html`
        <button onClick=${onClick} disabled=${disabled} title=${title}
          class="font-mono text-[11px] px-2 py-1 rounded border select-none cursor-pointer active:translate-y-px disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0 ${styles} ${cls}">
          ${children}
        </button>
      `;
    };

    const EcoSparkline = ({ history, historyVersion }) => {
      const canvasRef = useRef(null), lastVer = useRef(-1);
      useEffect(() => {
        const cv = canvasRef.current;
        if (!cv || !history?.length || (historyVersion != null && lastVer.current === historyVersion)) return;
        lastVer.current = historyVersion ?? -1;
        const ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = '#262626'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, Math.round(h * 0.5)); ctx.lineTo(w, Math.round(h * 0.5)); ctx.stroke();

        const pts = history.length === 1 ? [history[0], history[0]] : history;
        let maxPop = 10, maxAtm = 500;
        for (const it of pts) { maxPop = Math.max(maxPop, it.pop); maxAtm = Math.max(maxAtm, it.o2, it.co2); }

        const draw = (prop, color, maxVal) => {
          ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.beginPath();
          const invLen = 1 / Math.max(1, pts.length - 1), invMax = 1 / Math.max(1, maxVal), hScale = h - 4;
          for (let i = 0; i < pts.length; i++) {
            const x = i * invLen * w, y = h - Config.clamp(pts[i][prop] * invMax, 0, 1) * hScale - 2;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.stroke();
        };
        draw('co2', '#f43f5e', maxAtm); draw('o2', '#38bdf8', maxAtm); draw('pop', '#4ade80', maxPop);
      }, [history, historyVersion]);

      return html`<canvas ref=${canvasRef} width="120" height="22" title="Green: Pop | Blue: O2 | Red: CO2" class="bg-neutral-900 rounded border border-neutral-800 shrink-0 pixelated-canvas"></canvas>`;
    };

    const GenePreview = ({ dna, width = 110, height = 55, cls = 'h-[90px]' }) => {
      const ref = useRef(null);
      useEffect(() => { if (ref.current && dna) GeneRenderer.renderPreview(ref.current, dna); }, [dna]);
      return html`<canvas ref=${ref} class="bg-neutral-950 border border-neutral-800 rounded block w-full ${cls} pixelated-canvas" width=${width} height=${height}></canvas>`;
    };

    Object.assign(Namespace, { Btn, EcoSparkline, GenePreview });
  })(_, _);
  //#endregion

  //#region 19: ToolbarAndStatusComponents
  ((Namespace, { html, useSignalValue, Config, Btn, EcoSparkline }) => {
    const TopBar = ({ isRunning, speed, isFitLocked, isAspectFill, isFullscreen, onToggleRun, onCycleSpeed, onNewWorld, onOpenParams, onOpenGeneLab, onToggleFitLock, onToggleAspectFill, onToggleFullscreen }) => html`
      <header class="px-2.5 py-1.5 border-b border-neutral-800 flex items-center gap-1.5 bg-neutral-900 z-10 shrink-0 overflow-x-auto no-scrollbar">
        <span class="font-bold mr-1 text-[13px] tracking-wide text-neutral-100 flex items-center gap-1 shrink-0">
          <span class="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse"></span>BiogenesisJS
        </span>
        <${Btn} onClick=${onToggleRun} variant=${isRunning ? 'wrn' : 'suc'} title="Pause / Resume (Space)">${isRunning ? 'Pause' : 'Resume'}<//>
        <${Btn} onClick=${onCycleSpeed} variant="act" title="Simulation Speed (Keys 1-6)">${speed}x Speed<//>
        <${Btn} onClick=${onNewWorld} title="Generate New World">New World<//>
        <${Btn} onClick=${onOpenParams} title="Configure World & Metabolic Parameters (P)">⚙ Parameters<//>
        <${Btn} onClick=${onOpenGeneLab} title="Open Interactive WYSIWYG DNA Designer (G)">🧬 Gene Lab<//>
        <div class="h-4 w-px bg-neutral-800 mx-0.5 shrink-0"></div>
        <${Btn} onClick=${onToggleFitLock} variant=${isFitLocked ? 'activeFit' : ''} title="Locks zoom and pan to fit viewport (F)">${isFitLocked ? '🔒 Fit: ON' : '🔓 Fit: OFF'}<//>
        <${Btn} onClick=${onToggleAspectFill} variant=${isAspectFill ? 'act' : ''} title="Match world size to canvas aspect ratio">${isAspectFill ? '⬛ Fill: ON' : '⬚ Fill: OFF'}<//>
        <${Btn} onClick=${onToggleFullscreen} variant=${isFullscreen ? 'act' : ''} title="Toggle Fullscreen">${isFullscreen ? '⛶ Exit' : '⛶ Fullscreen'}<//>
      </header>
    `;

    const ActionsBar = ({ pendingSpawn, onAddCo2, onAddO2, onSpawnPreset, onOpenGeneLab, onImportDna }) => {
      const cls = (key, hc) => pendingSpawn?.key === key
        ? 'text-sky-200 px-2 py-0.5 rounded bg-sky-950 border border-sky-400 font-bold ring-1 ring-sky-400/50 cursor-pointer shrink-0'
        : `${hc} px-2 py-0.5 rounded bg-neutral-800/80 border border-neutral-700 cursor-pointer shrink-0`;

      return html`
        <div class="px-2.5 py-1 border-b border-neutral-800 bg-neutral-900/95 flex items-center gap-2 text-[11px] select-none shrink-0 font-mono overflow-x-auto no-scrollbar text-neutral-300">
          <${Btn} onClick=${() => onAddCo2(1000)} title="Add 1000 CO2">+CO2<//>
          <${Btn} onClick=${() => onAddCo2(-1000)} title="Remove 1000 CO2">-CO2<//>
          <${Btn} onClick=${() => onAddO2(300)} title="Add 300 O2">+O2<//>
          <${Btn} onClick=${() => onAddO2(-300)} title="Remove 300 O2">-O2<//>
          <div class="h-3.5 w-px bg-neutral-800 mx-1 shrink-0"></div>
          <button onClick=${() => onSpawnPreset('Plant')} class=${cls('Plant', 'hover:text-emerald-300')}>+Plant</button>
          <button onClick=${() => onSpawnPreset('Hunter')} class=${cls('Hunter', 'hover:text-rose-300')}>+Hunter</button>
          <button onClick=${() => onSpawnPreset('ArmoredGrazer')} class=${cls('ArmoredGrazer', 'hover:text-sky-300')}>+Grazer</button>
          <button onClick=${() => onSpawnPreset('VirusVector')} class=${cls('VirusVector', 'hover:text-white')}>+Virus</button>
          <div class="h-3.5 w-px bg-neutral-800 mx-1 shrink-0"></div>
          <button onClick=${onOpenGeneLab} title="Design custom organism DNA (Key: G)" class=${cls('custom_dna', 'hover:text-emerald-300')}>🔬 Design DNA</button>
          <button onClick=${onImportDna} title="Paste a BIO1:... DNA share code" class=${cls('imported_dna', 'hover:text-amber-300')}>🧬 Import DNA</button>
        </div>
      `;
    };

    const LegendBar = () => html`
      <div class="px-2.5 py-1 border-t border-neutral-800 bg-neutral-900/90 flex gap-3 items-center text-[11px] select-none shrink-0 font-mono overflow-x-auto no-scrollbar text-neutral-400">
        ${[
          ['Plant', Config.PALETTE.G], ['Predator', Config.PALETTE.R], ['Shield', Config.PALETTE.B], ['Cilia', Config.PALETTE.C],
          ['Fertility', Config.PALETTE.Y], ['Virus', Config.PALETTE.W, true], ['Toxin', Config.PALETTE.GR], ['Corpse', Config.PALETTE.BR],
        ].map(([lbl, c, b]) => html`
          <div class="flex items-center gap-1 shrink-0" style="color: ${c}">
            <span class="w-2.5 h-2.5 inline-block shrink-0 rounded-[2px] ${b ? 'border border-neutral-400' : ''}" style="background-color: ${c}"></span>
            <span>${lbl}</span>
          </div>
        `)}
      </div>
    `;

    const StatusBar = ({ engine }) => {
      const stats = useSignalValue(engine.statsSignal);
      return html`
        <div class="px-2.5 py-1 border-t border-neutral-800 bg-neutral-900/90 flex gap-3.5 items-center text-[11px] select-none shrink-0 font-mono overflow-x-auto no-scrollbar text-neutral-400">
          <div class="shrink-0">Time: <b class="text-neutral-200">${stats.time}</b></div>
          <div class="shrink-0">Pop: <b class="text-emerald-400">${stats.pop}</b></div>
          <div class="shrink-0">Remains of beings: <b class="text-amber-500">${stats.dead}</b></div>
          <div class="shrink-0">O2: <b class="text-sky-400">${stats.o2}</b></div>
          <div class="shrink-0">CO2: <b class="text-rose-400">${stats.co2}</b></div>
          <div class="shrink-0">FPS: <b class="text-neutral-200">${stats.fps}</b></div>
          <div class="shrink-0">Zoom: <b class="text-neutral-200">${stats.zoom}%</b></div>
          <div class="shrink-0" title=${stats.sab ? 'Multi-Worker SharedArrayBuffer + Atomics Active' : 'Single-Worker Fallback (Enable COOP/COEP headers for SAB)'}>
            Engine: <b class=${stats.sab ? 'text-cyan-400' : 'text-neutral-300'}>${stats.threads}W ${stats.sab ? 'SAB' : 'SoA'}</b>
          </div>
          <div class="ml-auto flex items-center gap-2 shrink-0">
            <span class="text-[10px] text-neutral-400">Ecology (Pop/O2/CO2):</span>
            <${EcoSparkline} history=${stats.history} historyVersion=${stats.historyVersion} />
          </div>
        </div>
      `;
    };

    Object.assign(Namespace, { TopBar, ActionsBar, LegendBar, StatusBar });
  })(_, _);
  //#endregion

  //#region 20: ParametersModal
  ((Namespace, { html, Btn }) => {
    const ParametersBar = ({ isOpen, params, onParamChange, onGeneChange, onResetDefaults, onApplyNewWorld, onClose }) => {
      if (!isOpen) return null;
      const fields = [
        ['Deterministic Seed:', 'SEED', 1, 1, 2147483647],
        ['Width:', 'WORLD_W', 100, 200, 25000], ['Height:', 'WORLD_H', 100, 200, 25000],
        ['Friction:', 'RUB', 0.005, 0.5, 1.0], ['Elasticity:', 'ELASTICITY', 0.05, 0.0, 1.0],
        ['Initial O2:', 'INIT_O2', 50, 0, 500000], ['Initial CO2:', 'INIT_CO2', 1000, 0, 500000],
        ['Initial organism count:', 'INIT_ORG_COUNT', 1, 0, 2000], ['Initial organism energy:', 'INIT_ORG_ENERGY', 5, 1, 1000],
        ['Max Age:', 'MAX_AGE', 1, 1, 500], ['Mutation:', 'MUT', 0.01, 0, 1],
        ['Segment upkeep cost divisor:', 'SEGMENT_UPKEEP_DIVISOR', 100, 100, 100000],
        ['Substances drainage divisor:', 'SUBSTANCES_DRAINAGE_DIVISOR', 50, 10, 100000],
        ['Energy lost by dead organisms:', 'DEAD_ENERGY_LOSS', 0.01, 0.001, 10],
        ['Obtained energy divisor (photosynthetic):', 'PHOTO_ENERGY_DIVISOR', 10, 10, 10000],
        ['Obtained energy (chemoorganotrophic):', 'CHEMO_OBTAINED_ENERGY', 0.05, 0, 10],
        ['Released energy proportion (chemoorganotrophic):', 'CHEMO_RELEASED_PROP', 0.05, 0, 1],
      ];

      return html`
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 select-none font-mono"
          onClick=${(e) => e.target === e.currentTarget && onClose()}>
          <div class="bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-neutral-200">
            <div class="px-4 py-2.5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950">
              <span class="font-bold text-sm text-neutral-100">Parameters</span>
              <button onClick=${onClose} class="text-neutral-400 hover:text-neutral-100 px-2 py-0.5 rounded border border-neutral-800 hover:border-neutral-600 cursor-pointer">✕</button>
            </div>
            <div class="p-4 overflow-y-auto flex flex-col gap-4 text-[11px]">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                ${fields.map(([label, key, step, min, max]) => html`
                  <label class="flex items-center justify-between gap-2 text-neutral-300">
                    <span>${label}</span>
                    <input type="number" step=${step} min=${min} max=${max} value=${params[key]}
                      onInput=${(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onParamChange(key, v); }}
                      class="w-24 font-mono text-[11px] px-1.5 py-0.5 rounded border border-neutral-700 bg-neutral-950 text-neutral-100 text-right focus:border-sky-500 focus:outline-none shrink-0" />
                  </label>
                `)}
              </div>
              <div class="flex items-center justify-between pt-2 border-t border-neutral-800">
                <label class="flex items-center gap-2 text-neutral-300 cursor-pointer">
                  <input type="checkbox" checked=${Boolean(params.AUTO_GENESIS)} onChange=${(e) => onParamChange('AUTO_GENESIS', e.target.checked)} class="rounded accent-emerald-500" />
                  <span>Auto-Genesis (respawn when population drops to 1)</span>
                </label>
              </div>
              <div class="pt-2 border-t border-neutral-800 flex flex-col gap-2">
                <div class="font-bold text-xs text-neutral-200">Genes</div>
                <div class="overflow-x-auto border border-neutral-800 rounded">
                  <table class="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr class="bg-neutral-950 border-b border-neutral-800 text-neutral-400">
                        <th class="py-1.5 px-3 font-semibold">Color:</th>
                        <th class="py-1.5 px-3 font-semibold">Probability:</th>
                        <th class="py-1.5 px-3 font-semibold">Cost:</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-neutral-800/70">
                      ${params.GENES.map((g, idx) => html`
                        <tr key=${g.name} class="hover:bg-neutral-800/40">
                          <td class="py-1.5 px-3 flex items-center gap-2 font-medium" style="color: ${g.hex}">
                            <span class="w-3 h-3 rounded-[2px] inline-block shrink-0 border border-neutral-700" style="background-color: ${g.hex}"></span>
                            <span>${g.name}</span>
                          </td>
                          <td class="py-1.5 px-3">
                            <input type="number" step="1" min="0" max="100" value=${g.prob}
                              onInput=${(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onGeneChange(idx, 'prob', v); }}
                              class="w-20 font-mono text-[11px] px-1.5 py-0.5 rounded border border-neutral-700 bg-neutral-950 text-neutral-100 text-right focus:border-sky-500 focus:outline-none" />
                          </td>
                          <td class="py-1.5 px-3">
                            <input type="number" step="0.1" min="0" max="50" value=${Number(g.cost).toFixed(1)}
                              onInput=${(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onGeneChange(idx, 'cost', v); }}
                              class="w-20 font-mono text-[11px] px-1.5 py-0.5 rounded border border-neutral-700 bg-neutral-950 text-neutral-100 text-right focus:border-sky-500 focus:outline-none" />
                          </td>
                        </tr>
                      `)}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div class="px-4 py-2.5 border-t border-neutral-800 bg-neutral-950 flex items-center justify-between gap-2">
              <${Btn} onClick=${onResetDefaults} title="Restore default parameters">Reset Defaults<//>
              <div class="flex items-center gap-2">
                <${Btn} onClick=${onApplyNewWorld} variant="suc">Apply & New World<//>
                <${Btn} onClick=${onClose} variant="act">Close<//>
              </div>
            </div>
          </div>
        </div>
      `;
    };

    Object.assign(Namespace, { ParametersBar });
  })(_, _);
  //#endregion

  //#region 21: GeneLabModal
  ((Namespace, { html, useState, useEffect, Config, GeneticCode, Presets, Btn, GenePreview, dnaToDraft, draftToDna, computeDraftStats }) => {
    const GeneLabModal = ({ isOpen, draft, selectedOrg, onChangeDraft, onPlaceInTank, onDropCenter, onClose }) => {
      const [copied, setCopied] = useState(false);
      const [codeInput, setCodeInput] = useState('');
      const [codeError, setCodeError] = useState(false);

      if (!isOpen) return null;

      const previewDna = draftToDna(draft);
      const stats = computeDraftStats(previewDna);

      useEffect(() => {
        setCodeInput(stats.shareCode);
        setCodeError(false);
        return () => previewDna.release();
      }, [draft]);

      const updateField = (key, val) => onChangeDraft({ ...draft, [key]: val });

      const updateGene = (idx, patch) => {
        const nextGenes = draft.genes.map((g, i) => (i === idx ? { ...g, ...patch } : g));
        onChangeDraft({ ...draft, genes: nextGenes });
      };

      const addGene = () => {
        if (draft.genes.length >= 24) return;
        const last = draft.genes[draft.genes.length - 1] || { l: 12, th: 0.5, cIdx: 1 };
        onChangeDraft({
          ...draft,
          genes: [...draft.genes, { l: last.l, th: Number(((last.th + 0.6) % (Math.PI * 2)).toFixed(3)), cIdx: last.cIdx }],
        });
      };

      const removeGene = (idx) => {
        if (draft.genes.length <= 1) return;
        onChangeDraft({ ...draft, genes: draft.genes.filter((_, i) => i !== idx) });
      };

      const duplicateGene = (idx) => {
        if (draft.genes.length >= 24) return;
        const copy = { ...draft.genes[idx] };
        const next = draft.genes.slice();
        next.splice(idx + 1, 0, copy);
        onChangeDraft({ ...draft, genes: next });
      };

      const moveGene = (idx, dir) => {
        const target = idx + dir;
        if (target < 0 || target >= draft.genes.length) return;
        const next = draft.genes.slice();
        const tmp = next[idx];
        next[idx] = next[target];
        next[target] = tmp;
        onChangeDraft({ ...draft, genes: next });
      };

      const loadPreset = (name) => {
        if (!Presets[name]) return;
        const dna = Presets[name]();
        onChangeDraft(dnaToDraft(dna));
        dna.release();
      };

      const randomizeDraft = () => {
        const dna = GeneticCode.acquire(null);
        onChangeDraft(dnaToDraft(dna));
        dna.release();
      };

      const handleCodeApply = (raw) => {
        setCodeInput(raw);
        const parsed = GeneticCode.fromShareCode(raw);
        if (parsed) {
          setCodeError(false);
          onChangeDraft(dnaToDraft(parsed));
          parsed.release();
        } else {
          setCodeError(true);
        }
      };

      const handleCopyCode = () => {
        if (G.navigator.clipboard?.writeText) {
          G.navigator.clipboard.writeText(stats.shareCode).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        } else {
          G.prompt('Copy DNA Share Code:', stats.shareCode);
        }
      };

      return html`
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 select-none font-mono"
          onClick=${(e) => e.target === e.currentTarget && onClose()}>
          <div class="bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden text-neutral-200">
            <div class="px-4 py-2.5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950">
              <div class="flex items-center gap-2">
                <span class="font-bold text-sm text-neutral-100">🧬 Gene Lab — WYSIWYG DNA Designer</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">${stats.segCount} segs</span>
              </div>
              <button onClick=${onClose} class="text-neutral-400 hover:text-neutral-100 px-2 py-0.5 rounded border border-neutral-800 hover:border-neutral-600 cursor-pointer">✕</button>
            </div>

            <div class="p-4 overflow-y-auto flex flex-col gap-4 text-[11px]">
              <div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
                <div class="md:col-span-5 flex flex-col gap-2">
                  <${GenePreview} dna=${previewDna} width=${180} height=${120} cls="h-[150px]" />
                  <div class="flex flex-wrap gap-1">
                    <${Btn} onClick=${() => loadPreset('Plant')} cls="flex-1">Plant<//>
                    <${Btn} onClick=${() => loadPreset('Hunter')} cls="flex-1">Hunter<//>
                    <${Btn} onClick=${() => loadPreset('ArmoredGrazer')} cls="flex-1">Grazer<//>
                    <${Btn} onClick=${() => loadPreset('VirusVector')} cls="flex-1">Virus<//>
                    <${Btn} onClick=${randomizeDraft} variant="wrn" title="Generate random genome">🎲 Rand<//>
                    ${selectedOrg?.dna && html`
                      <${Btn} onClick=${() => onChangeDraft(dnaToDraft(selectedOrg.dna))} variant="act" title="Load DNA from currently selected organism">
                        Load #${selectedOrg.id}
                      <//>
                    `}
                  </div>
                </div>

                <div class="md:col-span-7 flex flex-col justify-between gap-3 bg-neutral-950/70 border border-neutral-800 rounded p-3">
                  <div class="flex flex-col gap-2">
                    <div class="font-bold text-xs text-neutral-300 border-b border-neutral-800 pb-1">Morphology & Symmetry</div>
                    <label class="flex items-center justify-between gap-3">
                      <span class="text-neutral-400">Radial Symmetry: <b class="text-sky-300">${draft.sym}x</b></span>
                      <input type="range" min="1" max="8" step="1" value=${draft.sym}
                        onInput=${(e) => updateField('sym', parseInt(e.target.value, 10) || 1)}
                        class="w-40 accent-sky-500 cursor-pointer" />
                    </label>
                    <div class="flex items-center gap-6 pt-0.5">
                      <label class="flex items-center gap-2 text-neutral-300 cursor-pointer">
                        <input type="checkbox" checked=${draft.mirror} onChange=${(e) => updateField('mirror', e.target.checked)} class="rounded accent-sky-500" />
                        <span>Mirror Alternating Arms</span>
                      </label>
                      <label class="flex items-center gap-2 text-neutral-300 cursor-pointer">
                        <input type="checkbox" checked=${draft.disp} onChange=${(e) => updateField('disp', e.target.checked)} class="rounded accent-sky-500" />
                        <span>Disperse Offspring</span>
                      </label>
                    </div>
                  </div>

                  <div class="grid grid-cols-3 gap-2 pt-2 border-t border-neutral-800 text-[11px]">
                    <div class="bg-neutral-900 px-2 py-1 rounded border border-neutral-800/80 flex justify-between">
                      <span class="text-neutral-400">Mass:</span><b class="text-neutral-100">${stats.mass}</b>
                    </div>
                    <div class="bg-neutral-900 px-2 py-1 rounded border border-neutral-800/80 flex justify-between">
                      <span class="text-neutral-400">Rep E:</span><b class="text-emerald-400">${stats.repEnergy}</b>
                    </div>
                    <div class="bg-neutral-900 px-2 py-1 rounded border border-neutral-800/80 flex justify-between">
                      <span class="text-neutral-400">Upkeep:</span><b class="text-amber-300">${stats.upkeepPer100}</b>
                    </div>
                    <div class="bg-neutral-900 px-2 py-1 rounded border border-neutral-800/80 flex justify-between">
                      <span class="text-neutral-400">Photo:</span><b class="text-emerald-300">${stats.photoMass}</b>
                    </div>
                    <div class="bg-neutral-900 px-2 py-1 rounded border border-neutral-800/80 flex justify-between">
                      <span class="text-neutral-400">Cilia:</span><b class="text-cyan-300">${stats.ciliaCount}</b>
                    </div>
                    <div class="bg-neutral-900 px-2 py-1 rounded border border-neutral-800/80 flex justify-between">
                      <span class="text-neutral-400">Brood:</span><b class="text-yellow-300">${stats.nKids}</b>
                    </div>
                  </div>

                  <div class="flex items-center gap-1.5 pt-1">
                    <input type="text" value=${codeInput}
                      onInput=${(e) => handleCodeApply(e.target.value)}
                      placeholder="Paste BIO1:... share code"
                      class="flex-1 font-mono text-[10px] px-2 py-1 rounded border ${codeError ? 'border-rose-500 bg-rose-950/30' : 'border-neutral-700 bg-neutral-900'} text-neutral-200 focus:border-sky-500 focus:outline-none" />
                    <${Btn} onClick=${handleCopyCode} variant=${copied ? 'suc' : ''} title="Copy BIO1 Share Code">
                      ${copied ? '✓ Copied' : '📋 Copy'}
                    <//>
                  </div>
                </div>
              </div>

              <div class="flex flex-col gap-2 pt-1 border-t border-neutral-800">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-xs text-neutral-200">Gene Sequence (${draft.genes.length} / 24 segments per arm)</span>
                  <${Btn} onClick=${addGene} disabled=${draft.genes.length >= 24} variant="suc">+ Add Segment<//>
                </div>

                <div class="overflow-x-auto border border-neutral-800 rounded max-h-[260px] overflow-y-auto">
                  <table class="w-full text-left border-collapse text-[11px]">
                    <thead class="sticky top-0 bg-neutral-950 border-b border-neutral-800 text-neutral-400 z-10">
                      <tr>
                        <th class="py-1.5 px-2.5 w-8">#</th>
                        <th class="py-1.5 px-2.5">Color / Function</th>
                        <th class="py-1.5 px-2.5">Length (4–24)</th>
                        <th class="py-1.5 px-2.5">Angle (rad / deg)</th>
                        <th class="py-1.5 px-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-neutral-800/70">
                      ${draft.genes.map((g, idx) => {
                        const geneMeta = Config.GENES[g.cIdx] || Config.GENES[1];
                        const deg = Math.round((g.th * 180) / Math.PI);
                        return html`
                          <tr key=${idx} class="hover:bg-neutral-800/40">
                            <td class="py-1.5 px-2.5 text-neutral-500 font-bold">${idx + 1}</td>
                            <td class="py-1.5 px-2.5">
                              <div class="flex items-center gap-1.5">
                                <div class="flex items-center gap-1">
                                  ${Config.GENES.map((cg, cIdx) => html`
                                    <button key=${cg.name} type="button" title=${cg.name}
                                      onClick=${() => updateGene(idx, { cIdx })}
                                      class="w-3.5 h-3.5 rounded-[2px] cursor-pointer transition-transform ${g.cIdx === cIdx ? 'ring-2 ring-sky-400 scale-110' : 'opacity-60 hover:opacity-100 border border-neutral-700'}"
                                      style="background-color: ${cg.hex}"></button>
                                  `)}
                                </div>
                                <span class="text-[10px] font-semibold capitalize ml-1" style="color: ${geneMeta.hex}">${geneMeta.name}</span>
                              </div>
                            </td>
                            <td class="py-1.5 px-2.5">
                              <div class="flex items-center gap-2">
                                <input type="range" min="4" max="24" step="0.5" value=${g.l}
                                  onInput=${(e) => updateGene(idx, { l: parseFloat(e.target.value) || 10 })}
                                  class="w-24 accent-emerald-500 cursor-pointer" />
                                <input type="number" min="4" max="24" step="0.5" value=${g.l}
                                  onInput=${(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) updateGene(idx, { l: Config.clamp(v, 4, 24) }); }}
                                  class="w-14 font-mono text-[11px] px-1 py-0.5 rounded border border-neutral-700 bg-neutral-950 text-neutral-100 text-right" />
                              </div>
                            </td>
                            <td class="py-1.5 px-2.5">
                              <div class="flex items-center gap-2">
                                <input type="range" min="0" max="6.283" step="0.05" value=${g.th}
                                  onInput=${(e) => updateGene(idx, { th: Number(parseFloat(e.target.value).toFixed(3)) || 0 })}
                                  class="w-24 accent-sky-500 cursor-pointer" />
                                <input type="number" min="0" max="6.283" step="0.05" value=${g.th}
                                  onInput=${(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) updateGene(idx, { th: Number((((v % 6.283185) + 6.283185) % 6.283185).toFixed(3)) }); }}
                                  class="w-16 font-mono text-[11px] px-1 py-0.5 rounded border border-neutral-700 bg-neutral-950 text-neutral-100 text-right" />
                                <span class="text-[10px] text-neutral-400 w-9 text-right">${deg}°</span>
                              </div>
                            </td>
                            <td class="py-1.5 px-2.5 text-right">
                              <div class="inline-flex items-center gap-1">
                                <button onClick=${() => moveGene(idx, -1)} disabled=${idx === 0} title="Move Up"
                                  class="px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 cursor-pointer">↑</button>
                                <button onClick=${() => moveGene(idx, 1)} disabled=${idx === draft.genes.length - 1} title="Move Down"
                                  class="px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 cursor-pointer">↓</button>
                                <button onClick=${() => duplicateGene(idx)} disabled=${draft.genes.length >= 24} title="Duplicate Segment"
                                  class="px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 cursor-pointer">⧉</button>
                                <button onClick=${() => removeGene(idx)} disabled=${draft.genes.length <= 1} title="Remove Segment"
                                  class="px-1.5 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 text-rose-300 disabled:opacity-30 cursor-pointer">✕</button>
                              </div>
                            </td>
                          </tr>
                        `;
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div class="px-4 py-2.5 border-t border-neutral-800 bg-neutral-950 flex items-center justify-between gap-2">
              <span class="text-[10px] text-neutral-400">Tip: Shift+Click in the tank to place multiple copies of your custom organism.</span>
              <div class="flex items-center gap-2">
                <${Btn} onClick=${onDropCenter} variant="act" title="Spawn immediately in the center of the viewport">Drop Center<//>
                <${Btn} onClick=${onPlaceInTank} variant="suc" title="Arm cursor to place custom organism in tank">Place in Tank<//>
                <${Btn} onClick=${onClose}>Close<//>
              </div>
            </div>
          </div>
        </div>
      `;
    };

    Object.assign(Namespace, { GeneLabModal });
  })(_, _);
  //#endregion

  //#region 22: OrganismInspectorSidebar
  ((Namespace, { html, useState, useSignalValue, Config, Btn, GenePreview }) => {
    const InspectorPanel = ({ selectedOrg, isTracked, pendingSpawn, onToggleTrack, onKill, onClone, onMutate, onEditInLab, onClose }) => {
      const [copied, setCopied] = useState(false);
      if (!selectedOrg) return null;
      const isCloning = pendingSpawn?.key === `clone_${selectedOrg.id}`;

      const handleCopy = () => {
        const code = selectedOrg.shareCode || selectedOrg.dna?.toShareCode?.() || '';
        if (!code) return;
        if (G.navigator.clipboard?.writeText) {
          G.navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
        } else G.prompt('Copy DNA Share Code:', code);
      };

      return html`
        <fieldset class="m-0 p-2.5 border border-neutral-800 bg-neutral-950/95 rounded text-xs flex flex-col gap-2.5 shadow-2xl">
          <legend class="font-bold px-1.5 text-neutral-200 flex items-center gap-1.5">
            <span>Organism #${selectedOrg.id}</span>
            <span class="text-[10px] font-normal px-1 py-0.2 rounded ${selectedOrg.alive ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-neutral-800 text-neutral-400'}">
              ${selectedOrg.alive ? 'Alive' : 'Dead'}
            </span>
          </legend>
          <div class="flex flex-row md:flex-col gap-2.5 items-center md:items-stretch">
            <div class="w-[140px] md:w-full shrink-0"><${GenePreview} dna=${selectedOrg.dna} /></div>
            <div class="flex-1 grid grid-cols-2 md:grid-cols-1 gap-x-3 gap-y-1 text-[11px] w-full">
              <div class="flex justify-between text-neutral-400"><span>Gen:</span><span class="text-neutral-200">${selectedOrg.gen}</span></div>
              <div class="flex justify-between text-neutral-400"><span>Energy:</span><span class="text-emerald-400 font-bold">${selectedOrg.energy.toFixed(1)}</span></div>
              <div class="flex justify-between text-neutral-400"><span>Mass:</span><span class="text-neutral-200">${selectedOrg.mass.toFixed(1)}</span></div>
              <div class="flex justify-between text-neutral-400"><span>Upkeep/100t:</span><span class="text-amber-300">${selectedOrg.upkeepPer100}</span></div>
              <div class="flex justify-between text-neutral-400"><span>Age:</span><span class="text-neutral-200">${selectedOrg.age >> 8} / ${Config.MAX_AGE}</span></div>
              <div class="flex justify-between text-neutral-400"><span>Kids:</span><span class="text-neutral-200">${selectedOrg.kids}</span></div>
              <div class="flex justify-between text-neutral-400"><span>Kills:</span><span class="text-neutral-200">${selectedOrg.kills}</span></div>
              <div class="flex justify-between text-neutral-400"><span>Infected:</span><span class="text-neutral-200">${selectedOrg.infected}</span></div>
              <div class="flex justify-between text-neutral-400"><span>Symm:</span><span class="text-neutral-200">${selectedOrg.sym}${selectedOrg.mirror ? ' (Mirror)' : ''}</span></div>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-1.5 pt-1 border-t border-neutral-800">
            <${Btn} onClick=${onClone} variant=${isCloning ? 'act' : ''} title="Click to place clone in tank (Key: C)">${isCloning ? 'Placing...' : 'Clone DNA'}<//>
            <${Btn} onClick=${onEditInLab} variant="suc" title="Edit this organism's genome in the Gene Lab (Key: G)">🧬 Edit Lab<//>
            <${Btn} onClick=${onMutate} title="Mutate organism (Key: M)">Mutate<//>
            <${Btn} onClick=${onToggleTrack} variant=${isTracked ? 'act' : ''} title="Track camera (Key: T)">${isTracked ? 'Untrack' : 'Track Cam'}<//>
          </div>
          <div class="grid grid-cols-3 gap-1.5">
            <${Btn} onClick=${handleCopy} variant=${copied ? 'suc' : ''} title="Copy Base64 DNA Share Code">${copied ? '✓ Copied' : '📋 Copy'}<//>
            <${Btn} onClick=${onKill} disabled=${!selectedOrg.alive} variant="dan" title="Kill organism (Key: Del)">Kill<//>
            <${Btn} onClick=${onClose} title="Close Inspector (Key: Esc)">Close<//>
          </div>
        </fieldset>
      `;
    };

    const Sidebar = ({ engine, onEditInLab }) => {
      const selectedOrg = useSignalValue(engine.selectedOrgSignal);
      const ctrl = useSignalValue(engine.controlsSignal);
      if (!selectedOrg) return null;
      return html`
        <aside class="w-full md:w-[270px] max-h-[45vh] md:max-h-none border-t md:border-t-0 md:border-l border-neutral-800 p-2 overflow-y-auto bg-neutral-900/95 flex flex-col gap-2 shrink-0 z-20 shadow-xl md:shadow-none">
          <${InspectorPanel} selectedOrg=${selectedOrg} isTracked=${ctrl.isTracked} pendingSpawn=${ctrl.pendingSpawn}
            onToggleTrack=${() => engine.toggleTracking()} onKill=${() => engine.killSelected()}
            onClone=${() => engine.cloneSelected()} onMutate=${() => engine.mutateSelected()}
            onEditInLab=${() => onEditInLab(selectedOrg)} onClose=${() => engine.clearSelection()} />
        </aside>
      `;
    };

    Object.assign(Namespace, { InspectorPanel, Sidebar });
  })(_, _);
  //#endregion

  //#region 23: SimulationViewport
  ((Namespace, { html, useEffect, useRef }) => {
    const SimulationViewport = ({ engine, pendingSpawn }) => {
      const canvasRef = useRef(null), pointersRef = useRef(new Map()), pinchDistRef = useRef(0), dragOrgRef = useRef(null);

      useEffect(() => {
        const cv = canvasRef.current;
        if (!cv) return;
        engine.attachCanvas(cv);
        const ro = new ResizeObserver(() => engine.resize());
        if (cv.parentElement) ro.observe(cv.parentElement);
        return () => { ro.disconnect(); engine.detachCanvas(); };
      }, [engine]);

      const onPointerDown = (e) => {
        const target = e.currentTarget, rect = target.getBoundingClientRect();
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
        try { target.setPointerCapture?.(e.pointerId); } catch (_) {}

        if (engine.pendingSpawn && pointersRef.current.size === 0 && e.button !== 2) {
          engine.placePendingAt(sx, sy, e.shiftKey);
          return;
        }
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, time: performance.now() });

        if (pointersRef.current.size === 1) {
          const hit = engine.getOrganismAtScreen(sx, sy);
          if (hit) {
            engine.selectOrganismAt(sx, sy);
            const { x: wx, y: wy } = engine.camera.screenToWorld(sx, sy);
            dragOrgRef.current = { id: hit.id, offsetX: wx - hit.cx, offsetY: wy - hit.cy, vx: 0, vy: 0 };
          } else dragOrgRef.current = null;
        } else if (pointersRef.current.size === 2) {
          dragOrgRef.current = null;
          const [p1, p2] = Array.from(pointersRef.current.values());
          pinchDistRef.current = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        }
      };

      const onPointerMove = (e) => {
        const rect = e.currentTarget.getBoundingClientRect(), sx = e.clientX - rect.left, sy = e.clientY - rect.top;
        if (engine.pendingSpawn) engine.updatePlacementCursor(sx, sy);
        if (!pointersRef.current.has(e.pointerId)) return;

        if (pointersRef.current.size === 1) {
          const p = pointersRef.current.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y;
          p.x = e.clientX; p.y = e.clientY;
          if (dragOrgRef.current) {
            const drag = dragOrgRef.current, invZoom = 1 / engine.camera.zoom;
            drag.vx = dx * invZoom * 0.45; drag.vy = dy * invZoom * 0.45;
            engine.moveOrganismToScreen(drag.id, sx, sy, drag.offsetX, drag.offsetY, drag.vx, drag.vy);
          } else engine.pan(dx, dy);
        } else if (pointersRef.current.size === 2) {
          const p = pointersRef.current.get(e.pointerId);
          p.x = e.clientX; p.y = e.clientY;
          const [p1, p2] = Array.from(pointersRef.current.values()), curDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          if (pinchDistRef.current > 0 && curDist > 0) {
            engine.zoomAt((p1.x + p2.x) * 0.5 - rect.left, (p1.y + p2.y) * 0.5 - rect.top, curDist / pinchDistRef.current);
            pinchDistRef.current = curDist;
          }
        }
      };

      const onPointerUp = (e) => {
        const p = pointersRef.current.get(e.pointerId), rect = e.currentTarget.getBoundingClientRect();
        if (p && pointersRef.current.size === 1 && !dragOrgRef.current && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < 8 && performance.now() - p.time < 400) {
          engine.selectOrganismAt(e.clientX - rect.left, e.clientY - rect.top);
        }
        dragOrgRef.current = null;
        try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch (_) {}
        pointersRef.current.delete(e.pointerId);
        if (pointersRef.current.size < 2) pinchDistRef.current = 0;
      };

      const onWheel = (e) => {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        engine.zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.15 : 0.87);
      };

      return html`
        <div class="flex-1 bg-neutral-950 ${pendingSpawn ? 'cursor-cell' : 'cursor-crosshair'} overflow-hidden select-none touch-none relative"
          onPointerDown=${onPointerDown} onPointerMove=${onPointerMove} onPointerUp=${onPointerUp} onPointerCancel=${onPointerUp} onWheel=${onWheel}>
          ${pendingSpawn && html`
            <div class="absolute top-2.5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1 rounded-full bg-sky-950/90 border border-sky-500/80 text-sky-200 text-[11px] shadow-lg backdrop-blur-sm pointer-events-auto">
              <span>Placing <b>${pendingSpawn.label}</b> — Click tank to spawn (Shift+Click for multiple)</span>
              <button onClick=${(ev) => { ev.stopPropagation(); engine.spawnPendingAtCenter(); }} class="px-1.5 py-0.5 rounded bg-sky-900 hover:bg-sky-800 border border-sky-600 text-[10px] cursor-pointer">Drop Center</button>
              <button onClick=${(ev) => { ev.stopPropagation(); engine.cancelPlacement(); }} class="px-1.5 py-0.5 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 text-[10px] cursor-pointer">Cancel (Esc)</button>
            </div>
          `}
          <canvas ref=${canvasRef} class="block w-full h-full pixelated-canvas"></canvas>
        </div>
      `;
    };

    Object.assign(Namespace, { SimulationViewport });
  })(_, _);
  //#endregion

  //#region 24: ApplicationControllerAndMount
  ((Namespace, {
    html, render, useState, useEffect, useRef, useSignalValue, Config, SimulationEngine,
    TopBar, ActionsBar, LegendBar, StatusBar, ParametersBar, GeneLabModal, Sidebar, SimulationViewport,
    dnaToDraft, draftToDna, getInitialParamsState, getInitialGeneDraft, rootEl,
  }) => {
    function App() {
      const engineRef = useRef(null);
      if (!engineRef.current) engineRef.current = new SimulationEngine();
      const engine = engineRef.current;

      const controls = useSignalValue(engine.controlsSignal);
      const selectedOrg = useSignalValue(engine.selectedOrgSignal);
      const [isFullscreen, setIsFullscreen] = useState(false);
      const [isParamsOpen, setIsParamsOpen] = useState(false);
      const [isGeneLabOpen, setIsGeneLabOpen] = useState(false);
      const [params, setParams] = useState(getInitialParamsState);
      const [geneDraft, setGeneDraft] = useState(getInitialGeneDraft);

      useEffect(() => {
        const onFsChange = () => setIsFullscreen(Boolean(G.document.fullscreenElement || G.document.webkitFullscreenElement));
        const onKeyDown = (e) => {
          const tag = e.target?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
          switch (e.code) {
            case 'Space': e.preventDefault(); engine.toggleRun(); break;
            case 'KeyP': setIsParamsOpen((v) => !v); break;
            case 'KeyG':
              setIsGeneLabOpen((open) => {
                if (!open && engine.selectedOrgSignal.peek()?.dna) {
                  setGeneDraft(dnaToDraft(engine.selectedOrgSignal.peek().dna));
                }
                return !open;
              });
              break;
            case 'Digit1': engine.setSpeed(1); break;
            case 'Digit2': engine.setSpeed(2); break;
            case 'Digit3': engine.setSpeed(4); break;
            case 'Digit4': engine.setSpeed(8); break;
            case 'Digit5': engine.setSpeed(16); break;
            case 'Digit6': engine.setSpeed(32); break;
            case 'KeyF': engine.toggleFitLock(); break;
            case 'KeyT': engine.toggleTracking(); break;
            case 'KeyC': engine.cloneSelected(); break;
            case 'KeyM': engine.mutateSelected(); break;
            case 'Delete': case 'Backspace': engine.killSelected(); break;
            case 'Escape':
              setIsGeneLabOpen((labOpen) => {
                if (labOpen) return false;
                setIsParamsOpen((paramsOpen) => {
                  if (paramsOpen) return false;
                  if (!engine.cancelPlacement()) engine.clearSelection();
                  return false;
                });
                return false;
              });
              break;
          }
        };
        G.document.addEventListener('fullscreenchange', onFsChange);
        G.document.addEventListener('webkitfullscreenchange', onFsChange);
        G.addEventListener('keydown', onKeyDown);
        return () => {
          G.document.removeEventListener('fullscreenchange', onFsChange);
          G.document.removeEventListener('webkitfullscreenchange', onFsChange);
          G.removeEventListener('keydown', onKeyDown);
        };
      }, [engine]);

      const handleToggleFullscreen = () => {
        const doc = G.document, el = doc.documentElement;
        if (!doc.fullscreenElement && !doc.webkitFullscreenElement) (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)?.catch?.(() => {});
        else (doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc)?.catch?.(() => {});
      };

      const handleParamChange = (k, v) => {
        Config[k] = v;
        setParams((p) => ({ ...p, [k]: v }));
        if (k === 'WORLD_W' || k === 'WORLD_H') engine.setWorldDimensions(Config.WORLD_W, Config.WORLD_H);
        else engine.syncConfig(false);
      };

      const handleGeneChange = (idx, field, val) => {
        Config.GENES[idx][field] = val;
        engine.syncConfig(field === 'cost');
        setParams((p) => ({ ...p, GENES: p.GENES.map((g, i) => (i === idx ? { ...g, [field]: val } : g)) }));
      };

      const handleResetDefaults = () => {
        Config.resetToDefaults();
        setParams(getInitialParamsState());
        engine.syncConfig(true);
        engine.setWorldDimensions(Config.WORLD_W, Config.WORLD_H);
      };

      const handleImportDna = () => {
        const code = G.prompt('Paste Organism DNA Share Code (starts with BIO1:...):');
        if (code && !engine.importDnaCode(code)) G.alert('Invalid DNA Share Code.');
      };

      const handleOpenGeneLabFromOrg = (org) => {
        if (org?.dna) setGeneDraft(dnaToDraft(org.dna));
        setIsGeneLabOpen(true);
      };

      const handlePlaceCustomDna = () => {
        const snap = { ...geneDraft, genes: geneDraft.genes.map((g) => ({ ...g })) };
        engine.armPlacement('custom_dna', 'Custom DNA', () => draftToDna(snap));
        setIsGeneLabOpen(false);
      };

      const handleDropCustomCenter = () => {
        const snap = { ...geneDraft, genes: geneDraft.genes.map((g) => ({ ...g })) };
        engine.armPlacement('custom_dna', 'Custom DNA', () => draftToDna(snap));
        engine.spawnPendingAtCenter();
        setIsGeneLabOpen(false);
      };

      return html`
        <div class="flex flex-col h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-200">
          <${TopBar} isRunning=${controls.isRunning} speed=${controls.speed} isFitLocked=${controls.isFitLocked}
            isAspectFill=${controls.isAspectFill} isFullscreen=${isFullscreen}
            onToggleRun=${() => engine.toggleRun()} onCycleSpeed=${() => engine.cycleSpeed()}
            onNewWorld=${() => engine.resetWorld()} onOpenParams=${() => setIsParamsOpen(true)}
            onOpenGeneLab=${() => setIsGeneLabOpen(true)}
            onToggleFitLock=${() => engine.toggleFitLock()} onToggleAspectFill=${() => engine.toggleAspectFill()}
            onToggleFullscreen=${handleToggleFullscreen} />
          <${ActionsBar} pendingSpawn=${controls.pendingSpawn} onAddCo2=${(a) => engine.addCo2(a)}
            onAddO2=${(a) => engine.addO2(a)} onSpawnPreset=${(n) => engine.spawnPreset(n)}
            onOpenGeneLab=${() => setIsGeneLabOpen(true)} onImportDna=${handleImportDna} />
          <div class="flex flex-col md:flex-row flex-1 overflow-hidden relative">
            <${SimulationViewport} engine=${engine} pendingSpawn=${controls.pendingSpawn} />
            <${Sidebar} engine=${engine} onEditInLab=${handleOpenGeneLabFromOrg} />
          </div>
          <${LegendBar} />
          <${StatusBar} engine=${engine} />
          <${ParametersBar} isOpen=${isParamsOpen} params=${params} onParamChange=${handleParamChange}
            onGeneChange=${handleGeneChange} onResetDefaults=${handleResetDefaults}
            onApplyNewWorld=${() => { engine.resetWorld(); setIsParamsOpen(false); }} onClose=${() => setIsParamsOpen(false)} />
          <${GeneLabModal} isOpen=${isGeneLabOpen} draft=${geneDraft} selectedOrg=${selectedOrg}
            onChangeDraft=${setGeneDraft} onPlaceInTank=${handlePlaceCustomDna}
            onDropCenter=${handleDropCustomCenter} onClose=${() => setIsGeneLabOpen(false)} />
        </div>
      `;
    }

    render(html`<${App} />`, rootEl);
    Object.assign(Namespace, { App });
  })(_, _);
  //#endregion
})(globalThis);