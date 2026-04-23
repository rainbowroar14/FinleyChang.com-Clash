/**
 * Night Arena — CR-style hits, troop aggro, bridge-only river pathing, crowns, king ends the match.
 */
(function () {
  "use strict";

  const W = 800;
  const H = 560;

  const RIVER_TOP = 228;
  const RIVER_BOT = 312;
  /** Half-width of walkable bridge deck (must match drawBridge deckW ~ 46). */
  const BRIDGE_HALF_W = 23;

  const BRIDGES = [
    { x: 220, y: (RIVER_TOP + RIVER_BOT) / 2 },
    { x: 580, y: (RIVER_TOP + RIVER_BOT) / 2 },
  ];

  const MINI_PEKKA_COST = 4;
  const KNIGHT_COST = 3;
  const SKELETON_COST = 2;
  const ARCHERS_COST = 2;
  const SKARMY_COST = 4;
  const ARROWS_COST = 3;
  const ARROWS_SPELL_DMG = 150;
  const ARROWS_SPELL_RADIUS = 92;

  /** 8-card rotation: first 4 in hand, next 4 in queue (shown “Next”). */
  const DEFAULT_DECK_BASE = [
    "mini_pekka",
    "knight",
    "arrows",
    "archers",
    "skeleton",
    "skarmy",
    "knight",
    "arrows",
  ];

  const MINI_HP = 400;
  const MINI_DMG = 300;
  const SPEED_MINI_PEKKA = 25;

  const KNIGHT_HP = 700;
  const KNIGHT_DMG = 65;
  const SPEED_KNIGHT = 17;

  const SKELETON_HP = 1;
  const SKELETON_DMG = 35;
  const SPEED_SKELETON = 25;

  const ARCHER_HP = 50;
  const ARCHER_SHOT_DMG = 40;
  const ARCHER_RANGE = 85;
  const SPEED_ARCHER = 30;

  /** Delay before first melee (Mini / Knight only). */
  const MELEE_FIRST_HIT_DELAY = 0.5;
  /** Seconds between attacks (melee repeat, or archer arrow cadence). */
  const ATTACK_INTERVAL_MINI_PEKKA = 1.6;
  const ATTACK_INTERVAL_KNIGHT = 1.2;
  const ATTACK_INTERVAL_SKELETON = 0.4;
  /** Skarmy skeletons swing faster than lone skeletons. */
  const ATTACK_INTERVAL_SKARMY = 0.28;
  const ATTACK_INTERVAL_ARCHER = 1.1;
  /** Two-frame walk cycle (wiki-style march timing, readable in pixels). */
  const WALK_CYCLE_SEC = 0.5;
  /** Native art size: 16×16 units, 8×8 skeletons; scaled up when drawn. */
  const DRAW_PX_UNIT = 32;
  const DRAW_PX_SKEL = 16;
  const MAX_ELIXIR = 10;
  const ELIXIR_PER_SEC = 1 / 2.75;

  const PROJ_SPEED = 300;
  const PROJ_RADIUS = 5;
  const PRINCESS_DMG = 12;
  const KING_DMG = 24;
  const PRINCESS_TOWER_HP = 2000;
  const KING_TOWER_HP = 4000;
  const PRINCESS_RANGE = 170;
  const KING_RANGE = 255;
  const PRINCESS_FIRE = 1.12;
  const KING_FIRE = 0.72;

  const SPRITES = {
    miniWalk: /** @type {HTMLImageElement[]} */ ([]),
    knightWalk: /** @type {HTMLImageElement[]} */ ([]),
    skelWalk: /** @type {HTMLImageElement[]} */ ([]),
    archerWalk: /** @type {HTMLImageElement[]} */ ([]),
    towerPrincess: new Image(),
    towerKing: new Image(),
    bridge: new Image(),
  };

  function loadWalkPair(folder, base, targetArr) {
    for (let i = 0; i < 2; i++) {
      const im = new Image();
      im.src = `${folder}/${base}-w${i}.svg`;
      targetArr.push(im);
    }
  }
  loadWalkPair("assets", "mini-pekka", SPRITES.miniWalk);
  loadWalkPair("assets", "knight", SPRITES.knightWalk);
  loadWalkPair("assets", "skeleton", SPRITES.skelWalk);
  loadWalkPair("assets", "archer", SPRITES.archerWalk);
  SPRITES.towerPrincess.src = "assets/tower-princess.svg";
  SPRITES.towerKing.src = "assets/tower-king.svg";
  SPRITES.bridge.src = "assets/bridge.svg";

  const stateRef = { current: /** @type {null | object} */ (null) };

  function walkFrameIndex(state) {
    return Math.floor(state.time / WALK_CYCLE_SEC) % 2;
  }

  function dist(ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    return Math.hypot(dx, dy);
  }

  function norm(dx, dy) {
    const m = Math.hypot(dx, dy);
    if (m < 1e-6) return { x: 0, y: 0 };
    return { x: dx / m, y: dy / m };
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function isInRiverWater(x, y) {
    if (y < RIVER_TOP || y > RIVER_BOT) return false;
    for (let i = 0; i < BRIDGES.length; i++) {
      if (Math.abs(x - BRIDGES[i].x) <= BRIDGE_HALF_W) return false;
    }
    return true;
  }

  function aliveTowers(towers) {
    return towers.filter((t) => t.hp > 0);
  }

  function kingAwakeForSide(towers, side) {
    return towers.some(
      (t) => t.side === side && t.kind === "princess" && t.hp <= 0,
    );
  }

  function foeTowers(troop, towers) {
    return aliveTowers(towers).filter((t) => t.side !== troop.side);
  }

  /** Princess + king (only when awake); dormant king cannot be targeted. */
  function targetableFoeTowers(troop, towers) {
    return foeTowers(troop, towers).filter((t) => {
      if (t.kind === "king" && !kingAwakeForSide(towers, t.side)) return false;
      return true;
    });
  }

  function pickBridgeIx(x, y) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < BRIDGES.length; i++) {
      const b = BRIDGES[i];
      const d = dist(x, y, b.x, b.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /**
   * Nearest enemy by straight-line distance — troop or targetable tower (CR-style),
   * not "troops always win over buildings."
   */
  function pickCombatTarget(troop, state) {
    let bestD = Infinity;
    /** @type {{ kind: "troop"; troop: typeof state.troops[0] } | { kind: "tower"; tower: (typeof state.towers)[0] } | null} */
    let pick = null;

    for (const u of state.troops) {
      if (u === troop || u.hp <= 0 || u.side === troop.side) continue;
      const d = dist(troop.x, troop.y, u.x, u.y);
      if (d < bestD) {
        bestD = d;
        pick = { kind: "troop", troop: u };
      }
    }

    for (const tw of targetableFoeTowers(troop, state.towers)) {
      const d = dist(troop.x, troop.y, tw.x, tw.y);
      if (d < bestD) {
        bestD = d;
        pick = { kind: "tower", tower: tw };
      }
    }

    return pick;
  }

  function segmentCrossesWater(x0, y0, x1, y1) {
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (isInRiverWater(x, y)) return true;
    }
    return false;
  }

  function bestBridgeFor(troop, gx, gy) {
    let bestIx = 0;
    let bestCost = Infinity;
    for (let i = 0; i < BRIDGES.length; i++) {
      const b = BRIDGES[i];
      const mouthMy =
        troop.side === "player"
          ? { x: b.x, y: RIVER_BOT + 28 }
          : { x: b.x, y: RIVER_TOP - 28 };
      const mouthFar =
        troop.side === "player"
          ? { x: b.x, y: RIVER_TOP - 26 }
          : { x: b.x, y: RIVER_BOT + 26 };
      const cost =
        dist(troop.x, troop.y, mouthMy.x, mouthMy.y) +
        dist(mouthFar.x, mouthFar.y, gx, gy);
      if (cost < bestCost) {
        bestCost = cost;
        bestIx = i;
      }
    }
    return bestIx;
  }

  function refreshRiverPath(troop, gx, gy) {
    if (troop.path === "ford") {
      return;
    }
    if (!segmentCrossesWater(troop.x, troop.y, gx, gy)) {
      troop.path = "fight";
      return;
    }
    troop.bridgeIx = bestBridgeFor(troop, gx, gy);
    const b = BRIDGES[troop.bridgeIx];
    if (troop.side === "player") {
      const mouth = { x: b.x, y: RIVER_BOT + 28 };
      if (troop.y < RIVER_TOP - 6) {
        troop.path = "fight";
      } else if (troop.y > RIVER_BOT + 10) {
        troop.path = dist(troop.x, troop.y, mouth.x, mouth.y) < 22 ? "ford" : "deploy";
      } else {
        troop.path = "ford";
      }
    } else {
      const mouth = { x: b.x, y: RIVER_TOP - 28 };
      if (troop.y > RIVER_BOT + 6) {
        troop.path = "fight";
      } else if (troop.y < RIVER_TOP - 10) {
        troop.path = dist(troop.x, troop.y, mouth.x, mouth.y) < 22 ? "ford" : "deploy";
      } else {
        troop.path = "ford";
      }
    }
  }

  function moveWithWater(troop, dx, dy) {
    const splits = 5;
    const sdx = dx / splits;
    const sdy = dy / splits;

    for (let i = 0; i < splits; i++) {
      const nx = troop.x + sdx;
      const ny = troop.y + sdy;

      if (!isInRiverWater(nx, ny)) {
        troop.x = nx;
        troop.y = ny;
        continue;
      }

      if (!isInRiverWater(nx, troop.y)) {
        troop.x = nx;
        continue;
      }
      if (!isInRiverWater(troop.x, ny)) {
        troop.y = ny;
        continue;
      }

      const b = BRIDGES[pickBridgeIx(troop.x, troop.y)];
      const step = Math.sign(b.x - troop.x) * Math.min(Math.abs(b.x - troop.x), 4.5);
      const sx = troop.x + step;
      if (!isInRiverWater(sx, troop.y)) troop.x = sx;
    }
  }

  function updateFacingTowardTarget(troop, state, dt) {
    if (troop.hp <= 0 || troop.attackT > 0) return;
    const ct = pickCombatTarget(troop, state);
    if (!ct) return;
    let tx;
    let ty;
    if (ct.kind === "troop" && ct.troop.hp > 0) {
      tx = ct.troop.x;
      ty = ct.troop.y;
    } else if (ct.kind === "tower" && ct.tower.hp > 0) {
      tx = ct.tower.x;
      ty = ct.tower.y;
    } else return;
    const d = dist(troop.x, troop.y, tx, ty);
    if (d < 1e-3) return;
    const fx = (tx - troop.x) / d;
    const fy = (ty - troop.y) / d;
    const k = clamp(8 * dt, 0, 1);
    troop.faceX += (fx - troop.faceX) * k;
    troop.faceY += (fy - troop.faceY) * k;
    const m = Math.hypot(troop.faceX, troop.faceY);
    if (m > 1e-3) {
      troop.faceX /= m;
      troop.faceY /= m;
    }
  }

  function slideNudge(troop, dx, dy) {
    if (!isInRiverWater(troop.x + dx, troop.y + dy)) {
      troop.x += dx;
      troop.y += dy;
    } else if (!isInRiverWater(troop.x + dx, troop.y)) {
      troop.x += dx;
    } else if (!isInRiverWater(troop.x, troop.y + dy)) {
      troop.y += dy;
    }
  }

  function resolveTroopCollisions(troops) {
    const padding = 4;
    const iters = 5;
    for (let k = 0; k < iters; k++) {
      for (let i = 0; i < troops.length; i++) {
        const a = troops[i];
        if (a.hp <= 0) continue;
        for (let j = i + 1; j < troops.length; j++) {
          const b = troops[j];
          if (b.hp <= 0) continue;
          const minD = a.radius + b.radius + padding;
          const d = dist(a.x, a.y, b.x, b.y);
          if (d >= minD || d < 1e-4) continue;
          const nx = (b.x - a.x) / d;
          const ny = (b.y - a.y) / d;
          const pen = (minD - d) * 0.55;
          slideNudge(a, -nx * pen, -ny * pen);
          slideNudge(b, nx * pen, ny * pen);
        }
      }
    }
  }

  function registerTowerFall(state, tower) {
    if (tower.fallen) return;
    tower.fallen = true;

    if (tower.kind === "king") {
      for (const t of state.towers) {
        if (t.side === tower.side) {
          t.hp = 0;
          t.fallen = true;
        }
      }
      if (tower.side === "enemy") {
        state.crownsPlayer = 3;
        state.over = true;
        state.winner = "player";
      } else {
        state.crownsEnemy = 3;
        state.over = true;
        state.winner = "enemy";
      }
      state.localEmote = null;
      state.remoteEmote = null;
      pushMatchEndIfBattle(state);
      return;
    }

    if (tower.side === "enemy") {
      state.crownsPlayer = Math.min(2, state.crownsPlayer + 1);
    } else {
      state.crownsEnemy = Math.min(2, state.crownsEnemy + 1);
    }
  }

  function applyTowerDamage(state, tower, amount) {
    if (tower.hp <= 0 || amount <= 0) return;
    tower.hp -= amount;
    if (tower.hp < 0) tower.hp = 0;
    if (tower.hp <= 0) registerTowerFall(state, tower);
  }

  function shuffleDeckCopy() {
    const d = DEFAULT_DECK_BASE.slice();
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = d[i];
      d[i] = d[j];
      d[j] = t;
    }
    return d;
  }

  function meleeCooldownReady(troop, now) {
    if (troop.type === "skeleton") {
      return now - troop.lastMeleeAt >= troop.hitInterval;
    }
    if (!troop.hasHitOnce) {
      return now - troop.spawnTime >= (troop.firstHitDelay ?? MELEE_FIRST_HIT_DELAY);
    }
    return now - troop.lastMeleeAt >= troop.hitInterval;
  }

  function createTroop(side, type, x, y, state) {
    const start = state.troops.length;
    const faceY = side === "player" ? -1 : 1;
    if (type === "mini_pekka") {
      state.troops.push({
        id: `u${++state.uid}`,
        side,
        type: "mini_pekka",
        x,
        y,
        hp: MINI_HP,
        maxHp: MINI_HP,
        speed: SPEED_MINI_PEKKA,
        radius: 9,
        path: "deploy",
        bridgeIx: pickBridgeIx(x, y),
        spawnTime: state.time,
        hasHitOnce: false,
        firstHitDelay: MELEE_FIRST_HIT_DELAY,
        lastMeleeAt: -999,
        hitInterval: ATTACK_INTERVAL_MINI_PEKKA,
        hitDamage: MINI_DMG,
        meleeRange: 18,
        attackT: 0,
        faceX: 0,
        faceY,
      });
    } else if (type === "knight") {
      state.troops.push({
        id: `u${++state.uid}`,
        side,
        type: "knight",
        x,
        y,
        hp: KNIGHT_HP,
        maxHp: KNIGHT_HP,
        speed: SPEED_KNIGHT,
        radius: 9,
        path: "deploy",
        bridgeIx: pickBridgeIx(x, y),
        spawnTime: state.time,
        hasHitOnce: false,
        firstHitDelay: MELEE_FIRST_HIT_DELAY,
        lastMeleeAt: -999,
        hitInterval: ATTACK_INTERVAL_KNIGHT,
        hitDamage: KNIGHT_DMG,
        meleeRange: 26,
        attackT: 0,
        faceX: 0,
        faceY,
      });
    } else if (type === "archers") {
      const pair = [
        [-14, -4],
        [14, 4],
      ];
      for (const [ox, oy] of pair) {
        state.troops.push({
          id: `u${++state.uid}`,
          side,
          type: "archer",
          x: x + ox,
          y: y + oy,
          hp: ARCHER_HP,
          maxHp: ARCHER_HP,
          speed: SPEED_ARCHER,
          radius: 3.5,
          path: "deploy",
          bridgeIx: pickBridgeIx(x + ox, y + oy),
          spawnTime: state.time,
          faceX: 0,
          faceY,
          fireAt: 0,
          rangedDmg: ARCHER_SHOT_DMG,
          rangedRange: ARCHER_RANGE,
          rangedInterval: ATTACK_INTERVAL_ARCHER,
          attackT: 0,
        });
      }
    } else if (type === "skarmy") {
      for (let i = 0; i < 15; i++) {
        const a = i * 1.37;
        const r = 2.5 + i * 1.15;
        const ox = Math.cos(a) * r * 0.85;
        const oy = Math.sin(a) * r * 0.65;
        state.troops.push({
          id: `u${++state.uid}`,
          side,
          type: "skeleton",
          x: x + ox,
          y: y + oy,
          hp: SKELETON_HP,
          maxHp: SKELETON_HP,
          speed: SPEED_SKELETON,
          radius: 4,
          path: "deploy",
          bridgeIx: pickBridgeIx(x + ox, y + oy),
          lastMeleeAt: -999,
          hitInterval: ATTACK_INTERVAL_SKARMY,
          hitDamage: SKELETON_DMG,
          meleeRange: 15,
          attackT: 0,
          faceX: 0,
          faceY,
        });
      }
    } else {
      const offs = [
        [0, 0],
        [-8, 6],
        [8, 6],
      ];
      for (const [ox, oy] of offs) {
        state.troops.push({
          id: `u${++state.uid}`,
          side,
          type: "skeleton",
          x: x + ox,
          y: y + oy,
          hp: SKELETON_HP,
          maxHp: SKELETON_HP,
          speed: SPEED_SKELETON,
          radius: 4,
          path: "deploy",
          bridgeIx: pickBridgeIx(x + ox, y + oy),
          lastMeleeAt: -999,
          hitInterval: ATTACK_INTERVAL_SKELETON,
          hitDamage: SKELETON_DMG,
          meleeRange: 15,
          attackT: 0,
          faceX: 0,
          faceY,
        });
      }
    }
    for (let i = start; i < state.troops.length; i++) {
      const t = state.troops[i];
      t.bridgeIx = pickBridgeIx(t.x, t.y);
    }
  }

  function deployAnchor(troop) {
    const b = BRIDGES[troop.bridgeIx ?? 0];
    if (troop.side === "player") {
      return { x: b.x, y: RIVER_BOT + 28 };
    }
    return { x: b.x, y: RIVER_TOP - 28 };
  }

  function updateTroopNavAndMove(dt, troop, state) {
    if (troop.hp <= 0) return;
    const step = troop.speed * dt;
    const ct = pickCombatTarget(troop, state);
    let tx = null;
    let ty = null;
    if (ct) {
      if (ct.kind === "troop" && ct.troop.hp > 0) {
        tx = ct.troop.x;
        ty = ct.troop.y;
      } else if (ct.kind === "tower" && ct.tower.hp > 0) {
        tx = ct.tower.x;
        ty = ct.tower.y;
      }
    }
    /** Ranged: hold at max range when target is in shooting band (Clash-style walk + shoot). */
    if (troop.type === "archer" && tx != null && ty != null) {
      const dHold = dist(troop.x, troop.y, tx, ty);
      if (dHold <= troop.rangedRange * 0.88) {
        tx = null;
        ty = null;
      }
    }
    if (tx != null) {
      refreshRiverPath(troop, tx, ty);
    }

    const b = BRIDGES[troop.bridgeIx ?? 0];
    const anch = deployAnchor(troop);

    if (troop.path === "deploy") {
      const n = norm(anch.x - troop.x, anch.y - troop.y);
      moveWithWater(troop, n.x * step, n.y * step);
      if (dist(troop.x, troop.y, anch.x, anch.y) < 12) {
        troop.x = anch.x;
        troop.y = anch.y;
        troop.path = "ford";
      }
      return;
    }

    if (troop.path === "ford") {
      let aimX = b.x;
      if (tx != null) {
        aimX = clamp(tx, b.x - BRIDGE_HALF_W + 3, b.x + BRIDGE_HALF_W - 3);
      }
      troop.x = clamp(
        troop.x +
          Math.sign(aimX - troop.x) * Math.min(Math.abs(aimX - troop.x), step * 1.65),
        b.x - BRIDGE_HALF_W + 2,
        b.x + BRIDGE_HALF_W - 2,
      );
      const dirY = troop.side === "player" ? -1 : 1;
      const ny = troop.y + dirY * step;
      const nx = troop.x;
      if (!isInRiverWater(nx, ny)) {
        troop.y = ny;
      }
      const done =
        troop.side === "player" ? troop.y <= RIVER_TOP - 5 : troop.y >= RIVER_BOT + 5;
      if (done) {
        troop.path = "fight";
      }
      return;
    }

    if (tx == null) return;

    const n = norm(tx - troop.x, ty - troop.y);
    moveWithWater(troop, n.x * step, n.y * step);
  }

  function triggerAttackAnim(troop, tx, ty) {
    const d = dist(troop.x, troop.y, tx, ty);
    if (d < 1e-3) return;
    troop.faceX = (tx - troop.x) / d;
    troop.faceY = (ty - troop.y) / d;
    if (troop.type === "mini_pekka") troop.attackT = 0.32;
    else if (troop.type === "knight") troop.attackT = 0.26;
    else if (troop.type === "archer") troop.attackT = 0.22;
    else troop.attackT = 0.18;
  }

  function tryMelee(troop, state, now) {
    if (troop.hp <= 0) return;
    if (troop.type === "archer") return;
    if (!meleeCooldownReady(troop, now)) return;

    const ct = pickCombatTarget(troop, state);
    if (!ct) return;

    if (ct.kind === "troop") {
      const o = ct.troop;
      if (o.hp <= 0) return;
      if (dist(troop.x, troop.y, o.x, o.y) > troop.meleeRange + o.radius * 0.45) return;
      o.hp -= troop.hitDamage;
      if (o.hp < 0) o.hp = 0;
      troop.lastMeleeAt = now;
      if (troop.type !== "skeleton") troop.hasHitOnce = true;
      triggerAttackAnim(troop, o.x, o.y);
      return;
    }

    const tw = ct.tower;
    if (tw.hp <= 0) return;
    const reach = troop.meleeRange + (tw.kind === "king" ? 26 : 22);
    if (dist(troop.x, troop.y, tw.x, tw.y) > reach) return;
    applyTowerDamage(state, tw, troop.hitDamage);
    troop.lastMeleeAt = now;
    if (troop.type !== "skeleton") troop.hasHitOnce = true;
    triggerAttackAnim(troop, tw.x, tw.y);
  }

  function createInitialState() {
    const mkTower = (base) => ({
      ...base,
      fireAt: 0,
      fallen: false,
    });

    const towers = [
      mkTower({
        id: "eL",
        side: "enemy",
        x: 268,
        y: 112,
        hp: PRINCESS_TOWER_HP,
        maxHp: PRINCESS_TOWER_HP,
        kind: "princess",
      }),
      mkTower({
        id: "eR",
        side: "enemy",
        x: 532,
        y: 112,
        hp: PRINCESS_TOWER_HP,
        maxHp: PRINCESS_TOWER_HP,
        kind: "princess",
      }),
      mkTower({
        id: "eK",
        side: "enemy",
        x: 400,
        y: 70,
        hp: KING_TOWER_HP,
        maxHp: KING_TOWER_HP,
        kind: "king",
      }),
      mkTower({
        id: "pL",
        side: "player",
        x: 268,
        y: H - 112,
        hp: PRINCESS_TOWER_HP,
        maxHp: PRINCESS_TOWER_HP,
        kind: "princess",
      }),
      mkTower({
        id: "pR",
        side: "player",
        x: 532,
        y: H - 112,
        hp: PRINCESS_TOWER_HP,
        maxHp: PRINCESS_TOWER_HP,
        kind: "princess",
      }),
      mkTower({
        id: "pK",
        side: "player",
        x: 400,
        y: H - 70,
        hp: KING_TOWER_HP,
        maxHp: KING_TOWER_HP,
        kind: "king",
      }),
    ];

    const pDeck = shuffleDeckCopy();
    const eDeck = shuffleDeckCopy();
    return {
      towers,
      troops: [],
      projectiles: [],
      uid: 0,
      playerElixir: 4,
      enemyElixir: 4,
      /** @type {string[]} */
      hand: pDeck.slice(0, 4),
      /** @type {string[]} */
      waiting: pDeck.slice(4, 8),
      /** @type {string[]} */
      enemyHand: eDeck.slice(0, 4),
      /** @type {string[]} */
      enemyWaiting: eDeck.slice(4, 8),
      /** @type {0 | 1 | 2 | 3 | null} */
      selectedSlot: null,
      /** @type {{ cx: number; cy: number; until: number } | null} */
      arrowFx: null,
      enemyBrainAcc: 0,
      over: false,
      winner: null,
      time: 0,
      crownsPlayer: 0,
      crownsEnemy: 0,
      /** @type {{ text: string; until: number; side: string } | null} */
      localEmote: null,
      /** @type {{ text: string; until: number; side: string } | null} */
      remoteEmote: null,
    };
  }

  function nearestFoeTroopInRange(tower, troops) {
    const range = tower.kind === "king" ? KING_RANGE : PRINCESS_RANGE;
    let best = null;
    let bestD = Infinity;
    for (const u of troops) {
      if (u.hp <= 0 || u.side === tower.side) continue;
      const d = dist(tower.x, tower.y, u.x, u.y);
      if (d <= range && d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  function towerShoot(state, tower, now) {
    if (tower.hp <= 0 || state.over) return;
    const cd = tower.kind === "king" ? KING_FIRE : PRINCESS_FIRE;
    if (now < tower.fireAt) return;
    if (tower.kind === "king" && !kingAwakeForSide(state.towers, tower.side)) return;

    const target = nearestFoeTroopInRange(tower, state.troops);
    if (!target) return;

    tower.fireAt = now + cd;
    const n = norm(target.x - tower.x, target.y - tower.y);
    const dmg = tower.kind === "king" ? KING_DMG : PRINCESS_DMG;
    const yOff = tower.side === "enemy" ? 24 : -24;
    const projKind = tower.kind === "king" ? "king" : "princess";
    const projRadius = tower.kind === "king" ? 7 : 5;
    state.projectiles.push({
      x: tower.x,
      y: tower.y + yOff,
      vx: n.x * PROJ_SPEED,
      vy: n.y * PROJ_SPEED,
      dmg,
      fromSide: tower.side,
      hitsTowers: false,
      projKind,
      projRadius,
    });
  }

  /** Nearest foe troop or targetable tower within archer shot range. */
  function pickArcherShotTarget(archer, state) {
    let bestD = Infinity;
    /** @type {{ kind: "troop"; troop: (typeof state.troops)[0] } | { kind: "tower"; tower: (typeof state.towers)[0] } | null} */
    let best = null;
    for (const u of state.troops) {
      if (u.hp <= 0 || u.side === archer.side) continue;
      const d = dist(archer.x, archer.y, u.x, u.y);
      if (d <= archer.rangedRange && d < bestD) {
        bestD = d;
        best = { kind: "troop", troop: u };
      }
    }
    for (const tw of targetableFoeTowers(archer, state.towers)) {
      const d = dist(archer.x, archer.y, tw.x, tw.y);
      if (d <= archer.rangedRange && d < bestD) {
        bestD = d;
        best = { kind: "tower", tower: tw };
      }
    }
    return best;
  }

  function archerShoot(state, archer, now) {
    if (archer.hp <= 0 || state.over || archer.type !== "archer") return;
    if (now < archer.fireAt) return;
    const target = pickArcherShotTarget(archer, state);
    if (!target) return;
    archer.fireAt = now + archer.rangedInterval;
    let tx;
    let ty;
    if (target.kind === "troop") {
      tx = target.troop.x;
      ty = target.troop.y;
    } else {
      tx = target.tower.x;
      ty = target.tower.y;
    }
    triggerAttackAnim(archer, tx, ty);
    const n = norm(tx - archer.x, ty - archer.y);
    const yOff = archer.side === "enemy" ? 8 : -8;
    state.projectiles.push({
      x: archer.x,
      y: archer.y + yOff,
      vx: n.x * PROJ_SPEED,
      vy: n.y * PROJ_SPEED,
      dmg: archer.rangedDmg,
      fromSide: archer.side,
      hitsTowers: true,
      projKind: "archer",
      projRadius: 4,
    });
  }

  function updateProjectiles(dt, state) {
    const { projectiles, troops } = state;
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const pr = p.projRadius ?? PROJ_RADIUS;
      if (p.x < -20 - pr || p.x > W + 20 + pr || p.y < -20 - pr || p.y > H + 20 + pr) {
        projectiles.splice(i, 1);
        continue;
      }
      let hit = false;
      for (const u of troops) {
        if (u.hp <= 0 || u.side === p.fromSide) continue;
        if (dist(p.x, p.y, u.x, u.y) < u.radius + pr) {
          u.hp -= p.dmg;
          if (u.hp < 0) u.hp = 0;
          hit = true;
          break;
        }
      }
      if (!hit && p.hitsTowers) {
        for (const tw of state.towers) {
          if (tw.hp <= 0 || tw.side === p.fromSide) continue;
          if (tw.kind === "king" && !kingAwakeForSide(state.towers, tw.side)) continue;
          const hitR = tw.kind === "king" ? 30 : 22;
          if (dist(p.x, p.y, tw.x, tw.y) < hitR + pr) {
            applyTowerDamage(state, tw, p.dmg);
            hit = true;
            break;
          }
        }
      }
      if (hit) projectiles.splice(i, 1);
    }
  }

  function enemyBrain(dt, state) {
    if (state.over) return;
    state.enemyBrainAcc += dt;
    if (state.enemyBrainAcc < 5.5) return;
    state.enemyBrainAcc = 0;
    const slots = [];
    for (let s = 0; s < 4; s++) {
      const c = state.enemyHand[s];
      if (c && state.enemyElixir >= cardCost(c)) slots.push(s);
    }
    if (!slots.length) return;
    const slot = slots[Math.floor(Math.random() * slots.length)];
    const card = state.enemyHand[slot];
    const cost = cardCost(card);

    if (card === "arrows") {
      const px = clamp(120 + Math.random() * 560, 24, W - 24);
      const py = clamp(RIVER_BOT + 40 + Math.random() * (H - RIVER_BOT - 80), 24, H - 24);
      state.enemyElixir -= cost;
      applyArrowsStrike(px, py, "enemy", state);
      cycleEnemyHand(state, slot);
      return;
    }

    const x = 260 + Math.random() * 280;
    const y = 52 + Math.random() * 70;
    if (!canDeploy("enemy", x, y)) return;
    state.enemyElixir -= cost;
    if (card === "mini_pekka" || card === "knight") {
      createTroop("enemy", card, x, y, state);
    } else if (card === "archers") {
      createTroop("enemy", "archers", x, y, state);
    } else if (card === "skarmy") {
      createTroop("enemy", "skarmy", x, y, state);
    } else {
      createTroop("enemy", "skeleton", x, y, state);
    }
    cycleEnemyHand(state, slot);
  }

  function canDeploy(side, x, y) {
    if (x < 48 || x > W - 48) return false;
    if (isInRiverWater(x, y)) return false;
    if (side === "player") {
      return y > RIVER_BOT + 32 && y < H - 36;
    }
    return y < RIVER_TOP - 32 && y > 36;
  }

  /** Nudge (x,y) until canDeploy — fixes rare PvP mirror misses from float / tap drift. */
  function snapToDeployable(side, x, y) {
    if (canDeploy(side, x, y)) return { x, y };
    for (let d = 0; d <= 36; d += 3) {
      for (const sx of [-1, 0, 1]) {
        for (const sy of [-1, 0, 1]) {
          if (sx === 0 && sy === 0 && d === 0) continue;
          const xx = x + sx * d;
          const yy = y + sy * d;
          if (canDeploy(side, xx, yy)) return { x: xx, y: yy };
        }
      }
    }
    return null;
  }

  function cardCost(card) {
    if (card === "mini_pekka") return MINI_PEKKA_COST;
    if (card === "knight") return KNIGHT_COST;
    if (card === "archers") return ARCHERS_COST;
    if (card === "skarmy") return SKARMY_COST;
    if (card === "arrows") return ARROWS_COST;
    return SKELETON_COST;
  }

  function cardUiInfo(cardId) {
    const cost = cardCost(cardId);
    if (cardId === "mini_pekka") {
      return { name: "Mini P.E.K.K.A", img: "assets/mini-pekka-w0.svg", cost };
    }
    if (cardId === "knight") return { name: "Knight", img: "assets/knight-w0.svg", cost };
    if (cardId === "skeleton") return { name: "Skeletons", img: "assets/skeleton-w0.svg", cost };
    if (cardId === "archers") return { name: "Archers", img: "assets/archer-w0.svg", cost };
    if (cardId === "skarmy") return { name: "Skarmy", img: "assets/skeleton-w1.svg", cost };
    if (cardId === "arrows") return { name: "Arrows", img: "assets/arrows-card.svg", cost };
    return { name: String(cardId), img: "assets/skeleton-w0.svg", cost };
  }

  function cyclePlayerHand(state, slot) {
    const next = state.waiting.shift();
    state.waiting.push(state.hand[slot]);
    state.hand[slot] = next;
  }

  function cycleEnemyHand(state, slot) {
    const next = state.enemyWaiting.shift();
    state.enemyWaiting.push(state.enemyHand[slot]);
    state.enemyHand[slot] = next;
  }

  function spellInArena(x, y) {
    return x >= 12 && x <= W - 12 && y >= 12 && y <= H - 12;
  }

  function applyArrowsStrike(cx, cy, attackerSide, state) {
    const R = ARROWS_SPELL_RADIUS;
    for (const u of state.troops) {
      if (u.hp <= 0 || u.side === attackerSide) continue;
      if (dist(u.x, u.y, cx, cy) <= R) {
        u.hp -= ARROWS_SPELL_DMG;
        if (u.hp < 0) u.hp = 0;
      }
    }
    for (const tw of state.towers) {
      if (tw.hp <= 0 || tw.side === attackerSide) continue;
      if (tw.kind === "king" && !kingAwakeForSide(state.towers, tw.side)) continue;
      const ext = tw.kind === "king" ? 34 : 26;
      if (dist(tw.x, tw.y, cx, cy) <= R + ext) {
        applyTowerDamage(state, tw, ARROWS_SPELL_DMG);
      }
    }
    state.arrowFx = { cx, cy, until: state.time + 0.48 };
  }

  const battleNet = {
    matchId: "",
    guestId: "",
    opponentGuestId: /** @type {string | null} */ (null),
    unsub: /** @type {null | (() => void)} */ (null),
    unsubMatch: /** @type {null | (() => void)} */ (null),
    unsubEmotes: /** @type {null | (() => void)} */ (null),
    seenMoveIds: /** @type {Set<string>} */ (new Set()),
    seenEmoteIds: /** @type {Set<string>} */ (new Set()),
    endWritten: false,
  };

  function tearDownBattleNet() {
    if (battleNet.unsub) {
      battleNet.unsub();
      battleNet.unsub = null;
    }
    if (battleNet.unsubMatch) {
      battleNet.unsubMatch();
      battleNet.unsubMatch = null;
    }
    if (battleNet.unsubEmotes) {
      battleNet.unsubEmotes();
      battleNet.unsubEmotes = null;
    }
    battleNet.matchId = "";
    battleNet.guestId = "";
    battleNet.opponentGuestId = null;
    battleNet.seenMoveIds = new Set();
    battleNet.seenEmoteIds = new Set();
    battleNet.endWritten = false;
    battleNet._endRetries = 0;
  }

  function applyAuthoritativeResult(wonByGuest) {
    const state = stateRef.current;
    if (!state || !battleNet.guestId) return;
    if (wonByGuest === battleNet.guestId) {
      state.crownsPlayer = 3;
      state.crownsEnemy = Math.min(state.crownsEnemy, 2);
      state.over = true;
      state.winner = "player";
      battleNet.endWritten = true;
      state.localEmote = null;
      state.remoteEmote = null;
    } else if (wonByGuest && battleNet.opponentGuestId && wonByGuest === battleNet.opponentGuestId) {
      state.crownsEnemy = 3;
      state.crownsPlayer = Math.min(state.crownsPlayer, 2);
      state.over = true;
      state.winner = "enemy";
      battleNet.endWritten = true;
      state.localEmote = null;
      state.remoteEmote = null;
    }
  }

  function pushMatchEndIfBattle(state) {
    if (!battleNet.matchId || !battleNet.guestId || battleNet.endWritten) return;
    if (!state.over || !state.winner) return;
    if (!battleNet.opponentGuestId) {
      battleNet._endRetries = (battleNet._endRetries || 0) + 1;
      if (battleNet._endRetries < 25) {
        setTimeout(() => pushMatchEndIfBattle(state), 200);
      }
      return;
    }
    battleNet._endRetries = 0;
    battleNet.endWritten = true;
    const wonBy = state.winner === "player" ? battleNet.guestId : battleNet.opponentGuestId;
    firebase
      .firestore()
      .collection("battle_matches")
      .doc(battleNet.matchId)
      .set(
        {
          result: {
            wonBy,
            at: firebase.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      )
      .catch(() => {});
  }

  function applyRemoteBattleDeploy(x, y, card) {
    const state = stateRef.current;
    if (!state || state.over) return;
    const yMir = H - y;
    if (
      card !== "mini_pekka" &&
      card !== "knight" &&
      card !== "skeleton" &&
      card !== "archers" &&
      card !== "skarmy" &&
      card !== "arrows"
    )
      return;
    const cost = cardCost(card);
    if (state.enemyElixir < cost) return;
    if (card === "arrows") {
      const cx = clamp(x, 16, W - 16);
      const cy = clamp(yMir, 16, H - 16);
      state.enemyElixir = Math.max(0, state.enemyElixir - cost);
      applyArrowsStrike(cx, cy, "enemy", state);
      return;
    }
    const snapped = snapToDeployable("enemy", x, yMir);
    if (!snapped) return;
    state.enemyElixir = Math.max(0, state.enemyElixir - cost);
    if (card === "mini_pekka" || card === "knight") {
      createTroop("enemy", card, snapped.x, snapped.y, state);
    } else if (card === "archers") {
      createTroop("enemy", "archers", snapped.x, snapped.y, state);
    } else if (card === "skarmy") {
      createTroop("enemy", "skarmy", snapped.x, snapped.y, state);
    } else {
      createTroop("enemy", "skeleton", snapped.x, snapped.y, state);
    }
  }

  function setupBattleNet(matchId, guestId) {
    tearDownBattleNet();
    if (!matchId || !guestId) return;
    if (typeof firebase === "undefined" || !firebase.apps.length) return;
    battleNet.matchId = matchId;
    battleNet.guestId = guestId;
    battleNet.seenMoveIds = new Set();
    const db = firebase.firestore();
    const mref = db.collection("battle_matches").doc(matchId);
    mref
      .get()
      .then((snap) => {
        const p = snap.data()?.players;
        if (Array.isArray(p) && p.length >= 2) {
          battleNet.opponentGuestId = p.find((g) => g !== guestId) || null;
        }
      })
      .catch(() => {});

    battleNet.unsubMatch = mref.onSnapshot((snap) => {
      const r = snap.data()?.result?.wonBy;
      if (!r || typeof r !== "string") return;
      applyAuthoritativeResult(r);
    });

    const cref = mref.collection("moves");
    battleNet.unsub = cref.onSnapshot((snap) => {
      snap.docChanges().forEach((ch) => {
        if (ch.type !== "added") return;
        const id = ch.doc.id;
        const d = ch.doc.data();
        if (!d || d.by === battleNet.guestId) return;
        if (battleNet.seenMoveIds.has(id)) return;
        battleNet.seenMoveIds.add(id);
        applyRemoteBattleDeploy(Number(d.x), Number(d.y), String(d.card));
      });
    });

    const eref = mref.collection("emotes");
    battleNet.unsubEmotes = eref.onSnapshot((snap) => {
      snap.docChanges().forEach((ch) => {
        if (ch.type !== "added") return;
        const id = ch.doc.id;
        const d = ch.doc.data();
        if (!d || d.by === battleNet.guestId) return;
        if (battleNet.seenEmoteIds.has(id)) return;
        battleNet.seenEmoteIds.add(id);
        const em = String(d.emoji || "👋");
        const st = stateRef.current;
        if (st) {
          st.remoteEmote = { text: em, until: st.time + 2.8, side: "enemy" };
        }
      });
    });
  }

  function pushBattleDeploy(card, x, y) {
    if (!battleNet.matchId || !battleNet.guestId) return;
    if (typeof firebase === "undefined" || !firebase.apps.length) return;
    const payload = {
      by: battleNet.guestId,
      card,
      x,
      y,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    const col = firebase.firestore().collection("battle_matches").doc(battleNet.matchId).collection("moves");
    const tryAdd = (attempt) => {
      col
        .add(payload)
        .catch(() => {
          if (attempt < 3) {
            setTimeout(() => tryAdd(attempt + 1), 180 + attempt * 120);
          }
        });
    };
    tryAdd(0);
  }

  function pushEmote(emoji) {
    const st = stateRef.current;
    if (st) st.localEmote = { text: emoji, until: st.time + 2.2, side: "player" };
    if (!battleNet.matchId || !battleNet.guestId) return;
    if (typeof firebase === "undefined" || !firebase.apps.length) return;
    firebase
      .firestore()
      .collection("battle_matches")
      .doc(battleNet.matchId)
      .collection("emotes")
      .add({
        by: battleNet.guestId,
        emoji,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
      .catch(() => {});
  }

  function trySpawnPlayer(state, x, y) {
    if (state.selectedSlot === null || state.selectedSlot === undefined || state.over) return false;
    const slot = state.selectedSlot;
    const card = state.hand[slot];
    if (!card) return false;
    const cost = cardCost(card);
    if (state.playerElixir < cost) return false;

    let px = x;
    let py = y;

    if (card === "arrows") {
      if (!spellInArena(px, py)) {
        px = clamp(x, 16, W - 16);
        py = clamp(y, 16, H - 16);
      }
      state.playerElixir -= cost;
      applyArrowsStrike(px, py, "player", state);
      cyclePlayerHand(state, slot);
      state.selectedSlot = null;
      pushBattleDeploy(card, px, py);
      return true;
    }

    if (!canDeploy("player", px, py)) {
      const sn = snapToDeployable("player", px, py);
      if (!sn) return false;
      px = sn.x;
      py = sn.y;
    }
    state.playerElixir -= cost;
    if (card === "mini_pekka" || card === "knight") {
      createTroop("player", card, px, py, state);
    } else if (card === "archers") {
      createTroop("player", "archers", px, py, state);
    } else if (card === "skarmy") {
      createTroop("player", "skarmy", px, py, state);
    } else {
      createTroop("player", "skeleton", px, py, state);
    }
    cyclePlayerHand(state, slot);
    state.selectedSlot = null;
    pushBattleDeploy(card, px, py);
    return true;
  }

  function stepSimulation(dt, state) {
    if (state.localEmote && state.time >= state.localEmote.until) state.localEmote = null;
    if (state.remoteEmote && state.time >= state.remoteEmote.until) state.remoteEmote = null;
    if (state.arrowFx && state.time >= state.arrowFx.until) state.arrowFx = null;
    if (state.over) return;
    state.time += dt;
    const now = state.time;

    state.playerElixir = Math.min(MAX_ELIXIR, state.playerElixir + ELIXIR_PER_SEC * dt);
    state.enemyElixir = Math.min(MAX_ELIXIR, state.enemyElixir + ELIXIR_PER_SEC * dt);

    if (!battleNet.matchId) {
      enemyBrain(dt, state);
    }

    for (const u of state.troops) {
      updateTroopNavAndMove(dt, u, state);
    }
    resolveTroopCollisions(state.troops);
    for (const u of state.troops) {
      if (u.hp > 0 && u.attackT > 0) {
        u.attackT -= dt;
        if (u.attackT < 0) u.attackT = 0;
      }
    }
    for (const u of state.troops) {
      updateFacingTowardTarget(u, state, dt);
    }
    for (const u of state.troops) {
      tryMelee(u, state, now);
    }
    for (const u of state.troops) {
      archerShoot(state, u, now);
    }

    updateProjectiles(dt, state);

    for (const tower of state.towers) {
      towerShoot(state, tower, now);
    }
  }

  function drawCrowns(ctx, state) {
    const drawSet = (startX, filled, dir) => {
      for (let i = 0; i < 3; i++) {
        const x = startX + i * dir * 22;
        const active = i < filled;
        ctx.save();
        ctx.translate(x, 20);
        ctx.fillStyle = active ? "#fde047" : "rgba(30,41,59,0.85)";
        ctx.strokeStyle = active ? "#ca8a04" : "rgba(100,116,139,0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, 6);
        ctx.lineTo(-7, -2);
        ctx.lineTo(-3, -6);
        ctx.lineTo(0, -3);
        ctx.lineTo(3, -6);
        ctx.lineTo(7, -2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    };

    ctx.save();
    drawSet(52, state.crownsEnemy, 1);
    drawSet(W - 52 - 44, state.crownsPlayer, -1);
    ctx.restore();
  }

  function drawStars(ctx) {
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    const pts = [
      [80, 38],
      [140, 22],
      [620, 48],
      [720, 28],
      [520, 18],
      [360, 52],
      [240, 26],
    ];
    for (const [sx, sy] of pts) {
      ctx.beginPath();
      ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMoon(ctx) {
    const mx = W - 72;
    const my = 48;
    const g = ctx.createRadialGradient(mx, my, 4, mx, my, 38);
    g.addColorStop(0, "rgba(255,248,220,0.95)");
    g.addColorStop(0.45, "rgba(200,210,240,0.25)");
    g.addColorStop(1, "rgba(200,210,240,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(mx, my, 38, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawNightArena(ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, RIVER_TOP);
    sky.addColorStop(0, "#0d1528");
    sky.addColorStop(1, "#152238");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, RIVER_TOP);

    drawMoon(ctx);
    drawStars(ctx);

    const grassN = ctx.createLinearGradient(0, 0, 0, RIVER_TOP);
    grassN.addColorStop(0, "rgba(45,72,52,0.35)");
    grassN.addColorStop(1, "rgba(30,52,40,0.85)");
    ctx.fillStyle = grassN;
    ctx.fillRect(0, 40, W, RIVER_TOP - 40);

    const riverGrad = ctx.createLinearGradient(0, RIVER_TOP, 0, RIVER_BOT);
    riverGrad.addColorStop(0, "#1a3a5c");
    riverGrad.addColorStop(0.5, "#0f2844");
    riverGrad.addColorStop(1, "#152d48");
    ctx.fillStyle = riverGrad;
    ctx.fillRect(0, RIVER_TOP, W, RIVER_BOT - RIVER_TOP);

    ctx.strokeStyle = "rgba(120,180,255,0.06)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const wy = RIVER_TOP + 12 + i * 16;
      ctx.beginPath();
      ctx.moveTo(0, wy);
      for (let x = 0; x <= W; x += 24) {
        ctx.lineTo(x, wy + Math.sin((x + i * 40) * 0.04) * 2);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    for (let x = 0; x < W; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, RIVER_TOP);
      ctx.lineTo(x, RIVER_BOT);
      ctx.stroke();
    }

    const grassS = ctx.createLinearGradient(0, RIVER_BOT, 0, H);
    grassS.addColorStop(0, "rgba(28,48,36,0.9)");
    grassS.addColorStop(1, "#1a3024");
    ctx.fillStyle = grassS;
    ctx.fillRect(0, RIVER_BOT, W, H - RIVER_BOT);

    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fillRect(0, 0, W, H);

    const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.85);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
  }

  function drawBridge(ctx, cx, cy) {
    const img = SPRITES.bridge;
    const deckW = 46;
    const deckH = RIVER_BOT - RIVER_TOP + 16;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, cx - deckW / 2, cy - deckH / 2, deckW, deckH);
    } else {
      ctx.fillStyle = "#4a5568";
      ctx.fillRect(cx - deckW / 2, cy - deckH / 2, deckW, deckH);
    }
    ctx.restore();
  }

  function drawTower(ctx, tower) {
    const img =
      tower.kind === "king" ? SPRITES.towerKing : SPRITES.towerPrincess;
    const tw = tower.kind === "king" ? 44 : 40;
    const th = tower.kind === "king" ? 52 : 48;
    const px = tower.x - tw / 2;
    const py = tower.y - th / 2;
    if (tower.hp <= 0) {
      ctx.globalAlpha = 0.28;
    }
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = tower.kind === "king" ? 14 : 8;
    ctx.shadowOffsetY = 4;
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, px, py, tw, th);
    } else {
      ctx.fillStyle = tower.kind === "king" ? "#8b7355" : "#7a8aa3";
      ctx.fillRect(px, py, tw, th);
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    const pct = Math.max(0, tower.hp / tower.maxHp);
    const barY = tower.side === "enemy" ? py + th + 5 : py - 12;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(px, barY, tw, 6);
    ctx.fillStyle = pct > 0.35 ? "#4ade80" : "#f87171";
    ctx.fillRect(px, barY, tw * pct, 6);
  }

  function pickWalkImage(frames, wf) {
    let im = frames[wf];
    if (im && im.complete && im.naturalWidth > 0) return im;
    im = frames[1 - wf];
    if (im && im.complete && im.naturalWidth > 0) return im;
    return frames[wf];
  }

  function troopVisual(u, state) {
    const wf = walkFrameIndex(state);
    if (u.type === "mini_pekka") {
      return {
        img: pickWalkImage(SPRITES.miniWalk, wf),
        s: DRAW_PX_UNIT,
        atkMax: 0.32,
        lunge: 8,
        tilt: 0.32,
        slashW: 2.6,
        arcR: 18,
        fallback: "#3b82f6",
      };
    }
    if (u.type === "knight") {
      return {
        img: pickWalkImage(SPRITES.knightWalk, wf),
        s: DRAW_PX_UNIT,
        atkMax: 0.26,
        lunge: 7,
        tilt: 0.38,
        slashW: 2.2,
        arcR: 16,
        fallback: "#94a3b8",
      };
    }
    if (u.type === "archer") {
      return {
        img: pickWalkImage(SPRITES.archerWalk, wf),
        s: 12,
        atkMax: 0.22,
        lunge: 3,
        tilt: 0.2,
        slashW: 1.2,
        arcR: 10,
        fallback: "#db2777",
      };
    }
    return {
      img: pickWalkImage(SPRITES.skelWalk, wf),
      s: DRAW_PX_SKEL,
      atkMax: 0.18,
      lunge: 5,
      tilt: 0.48,
      slashW: 1.5,
      arcR: 12,
      fallback: "#e2e8f0",
    };
  }

  function drawUnit(ctx, u, state) {
    const vis = troopVisual(u, state);
    if (u.hp <= 0) {
      ctx.globalAlpha = 0.25;
    }

    const atkK = vis.atkMax > 0 ? clamp(u.attackT / vis.atkMax, 0, 1) : 0;
    const swing = atkK > 0 ? Math.sin((1 - atkK) * Math.PI) : 0;
    const lunge = swing * vis.lunge;
    const ang = Math.atan2(u.faceY, u.faceX);
    const lx = u.faceX * lunge;
    const ly = u.faceY * lunge;
    const tilt = swing * (u.side === "player" ? -1 : 1) * vis.tilt;

    ctx.save();
    ctx.translate(u.x + lx, u.y + ly);
    ctx.rotate(tilt);
    ctx.scale(1 + swing * 0.12, 1 + swing * 0.08);
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    if (vis.img && vis.img.complete && vis.img.naturalWidth > 0) {
      ctx.drawImage(vis.img, -vis.s / 2, -vis.s / 2, vis.s, vis.s);
    } else {
      ctx.fillStyle = vis.fallback;
      ctx.beginPath();
      ctx.arc(0, 0, u.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.imageSmoothingEnabled = smooth;
    ctx.restore();

    if (u.hp > 0 && atkK > 0) {
      ctx.save();
      ctx.translate(u.x, u.y);
      ctx.rotate(ang);
      ctx.strokeStyle =
        u.type === "mini_pekka"
          ? "rgba(147,197,253,0.95)"
          : "rgba(255,255,255,0.9)";
      ctx.lineWidth = vis.slashW;
      ctx.lineCap = "round";
      const sweep = (1 - atkK) * 1.1;
      ctx.beginPath();
      ctx.arc(0, 0, vis.arcR, -0.35, -0.35 + sweep);
      ctx.stroke();
      ctx.strokeStyle = "rgba(251,191,36,0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, vis.arcR + 3, -0.45, -0.45 + sweep * 0.9);
      ctx.stroke();
      ctx.restore();
    }

    ctx.globalAlpha = 1;

    if (u.hp > 0 && u.maxHp > 1) {
      const pct = u.hp / u.maxHp;
      const bw =
        u.type === "mini_pekka" ? 34 : u.type === "knight" ? 30 : u.type === "archer" ? 16 : 18;
      const by = u.y + u.radius + 7;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(u.x - bw / 2, by, bw, 4);
      ctx.fillStyle = u.side === "player" ? "#7dd3fc" : "#fca5a5";
      ctx.fillRect(u.x - bw / 2, by, bw * pct, 4);
    }
  }

  function drawProjectiles(ctx, projectiles) {
    for (const p of projectiles) {
      const r = p.projRadius ?? PROJ_RADIUS;
      const kind = p.projKind ?? "princess";
      ctx.save();
      ctx.translate(p.x, p.y);
      const ang = Math.atan2(p.vy, p.vx);
      ctx.rotate(ang);
      if (kind === "king") {
        ctx.shadowColor = "rgba(124,58,237,0.9)";
        ctx.shadowBlur = 12;
        ctx.fillStyle = "#f59e0b";
        ctx.fillRect(-r * 2, -r * 0.6, r * 4, r * 1.2);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#fef9c3";
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === "princess") {
        ctx.fillStyle = "#38bdf8";
        ctx.strokeStyle = "#0c4a6e";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(r * 1.1, 0);
        ctx.lineTo(0, r * 1.1);
        ctx.lineTo(-r * 1.1, 0);
        ctx.lineTo(0, -r * 1.1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = "#fbcfe8";
        ctx.strokeStyle = "#9d174d";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(r * 2.2, 0);
        ctx.lineTo(-r * 0.6, r * 0.75);
        ctx.lineTo(-r * 0.15, 0);
        ctx.lineTo(-r * 0.6, -r * 0.75);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawArrowSpellFx(ctx, state) {
    const f = state.arrowFx;
    if (!f || state.time > f.until) return;
    const cx = f.cx;
    const cy = f.cy;
    const t = clamp((f.until - state.time) / 0.48, 0, 1);
    const pulse = ARROWS_SPELL_RADIUS * (0.55 + 0.45 * (1 - t));
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.45 * t;
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(251,191,36,0.85)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + state.time * 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (pulse * 0.15), cy + Math.sin(a) * (pulse * 0.15));
      ctx.lineTo(cx + Math.cos(a) * pulse, cy + Math.sin(a) * pulse);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(254,243,199,0.25)";
    ctx.beginPath();
    ctx.arc(cx, cy, pulse * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEmoteBubbles(ctx, state) {
    function one(b, y, align) {
      if (!b || state.time > b.until) return;
      const t = b.text;
      ctx.font = "28px system-ui,Segoe UI Emoji,sans-serif";
      const w = Math.min(220, ctx.measureText(t).width + 28);
      const x = align === "left" ? 18 : W - 18 - w;
      ctx.fillStyle = "rgba(15,23,42,0.88)";
      ctx.strokeStyle = "rgba(148,163,184,0.5)";
      ctx.lineWidth = 1.5;
      const bx = x;
      const by = y - 36;
      ctx.fillRect(bx, by, w, 40);
      ctx.strokeRect(bx, by, w, 40);
      ctx.fillStyle = "#f8fafc";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(t, bx + w / 2, by + 20);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
    if (state.remoteEmote) one(state.remoteEmote, 88, "right");
    if (state.localEmote) one(state.localEmote, H - 52, "left");
  }

  function render(ctx, state) {
    drawNightArena(ctx);
    drawCrowns(ctx, state);
    for (const b of BRIDGES) {
      drawBridge(ctx, b.x, b.y);
    }
    for (const t of state.towers) {
      drawTower(ctx, t);
    }
    drawArrowSpellFx(ctx, state);
    const drawTroops = state.troops.filter((u) => u.hp > 0).sort((a, b) => a.y - b.y);
    for (const u of drawTroops) {
      drawUnit(ctx, u, state);
    }
    drawProjectiles(ctx, state.projectiles);

    drawEmoteBubbles(ctx, state);

    ctx.fillStyle = "rgba(226,232,240,0.5)";
    ctx.font = "600 11px system-ui";
    ctx.fillText("Enemy", 14, 42);
    ctx.fillText("You", 14, H - 14);
  }

  /** @type {string} */
  let hudModeLine = "";

  function hudHtml(state) {
    const ek = kingAwakeForSide(state.towers, "enemy");
    const pk = kingAwakeForSide(state.towers, "player");
    const modeLine = hudModeLine ? `${hudModeLine}<br/>` : "";
    if (state.over) {
      const msg =
        state.winner === "player"
          ? "<strong>Enemy king down — 3 crowns.</strong>"
          : "<strong>Your king fell — they take 3 crowns.</strong>";
      return `${modeLine}${msg}<br/>Reset to play again.`;
    }
    const aps = (sec) => (1 / sec).toFixed(2);
    const deckLine =
      `<strong>Deck</strong>: 4 cards in hand, 4 in queue — play a card and it goes to the back of the queue. ` +
      `<strong>Arrows</strong> (${ARROWS_COST} elixir): ${ARROWS_SPELL_DMG} damage in a circle, cast <strong>anywhere</strong>.<br/>`;
    const atkLine =
      `<strong>Attack speed</strong> (time between hits · hits/sec): ` +
      `Mini <strong>${ATTACK_INTERVAL_MINI_PEKKA}s</strong> (${aps(ATTACK_INTERVAL_MINI_PEKKA)}/s) · ` +
      `Knight <strong>${ATTACK_INTERVAL_KNIGHT}s</strong> (${aps(ATTACK_INTERVAL_KNIGHT)}/s) · ` +
      `Skeletons <strong>${ATTACK_INTERVAL_SKELETON}s</strong> (${aps(ATTACK_INTERVAL_SKELETON)}/s) · ` +
      `Skarmy <strong>${ATTACK_INTERVAL_SKARMY}s</strong> (${aps(ATTACK_INTERVAL_SKARMY)}/s) · ` +
      `Archers <strong>${ATTACK_INTERVAL_ARCHER}s</strong> (${aps(ATTACK_INTERVAL_ARCHER)}/s).`;
    return (
      `${modeLine}` +
      `Crowns: you <strong>${state.crownsPlayer}</strong> / 3 · enemy <strong>${state.crownsEnemy}</strong> / 3<br/>` +
      `King towers: yours <strong>${pk ? "awake" : "dormant"}</strong>, enemy ` +
      `<strong>${ek ? "awake" : "dormant"}</strong>. Troops target the <strong>nearest enemy</strong> (troop or tower); ` +
      `only <strong>bridges</strong> cross the river. Hits are <strong>burst</strong> (not constant melt).<br/>` +
      `${deckLine}` +
      `${atkLine}`
    );
  }

  function syncHandDom(state, els) {
    const pct = (state.playerElixir / MAX_ELIXIR) * 100;
    els.fill.style.width = `${pct}%`;
    els.num.textContent = state.playerElixir.toFixed(1);
    els.fill.parentElement?.setAttribute(
      "aria-valuenow",
      String(Math.round(state.playerElixir * 10) / 10),
    );

    for (let s = 0; s < 4; s++) {
      const btn = els.cardSlots[s];
      if (!btn) continue;
      const cardId = state.hand[s];
      const ui = cardUiInfo(cardId);
      const can = state.playerElixir >= ui.cost && !state.over;
      if (!can && state.selectedSlot === s) state.selectedSlot = null;
      btn.disabled = !can;
      btn.dataset.card = cardId;
      const img = btn.querySelector("img");
      const nameEl = btn.querySelector(".card-name");
      const costEl = btn.querySelector(".card-cost");
      if (img) {
        img.src = ui.img;
        img.alt = ui.name;
      }
      if (nameEl) nameEl.textContent = ui.name;
      if (costEl) costEl.textContent = String(ui.cost);
      btn.classList.toggle("is-selected", state.selectedSlot === s);
    }

    const nextId = state.waiting[0];
    if (nextId && els.deckNextImg && els.deckNextName && els.deckNextCost) {
      const nu = cardUiInfo(nextId);
      els.deckNextImg.src = nu.img;
      els.deckNextImg.alt = nu.name;
      els.deckNextName.textContent = nu.name;
      els.deckNextCost.textContent = String(nu.cost);
    }

    const sel = state.selectedSlot;
    const selCard = sel != null ? state.hand[sel] : null;
    if (selCard === "arrows") {
      els.hint.textContent = "Tap anywhere on the arena to drop Arrows (150 area damage).";
    } else if (selCard) {
      els.hint.textContent = "Tap your side of the grass to deploy.";
    } else {
      els.hint.textContent = "Pick one of your 4 cards — next in line is shown under “Next”.";
    }
  }

  function canvasPoint(canvas, evt) {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / r.width;
    const sy = canvas.height / r.height;
    return {
      x: (evt.clientX - r.left) * sx,
      y: (evt.clientY - r.top) * sy,
    };
  }

  let gameRunning = false;
  let rafId = 0;
  let lastFrameT = 0;
  /** @type {CanvasRenderingContext2D | null} */
  let gameCtx = null;
  /** @type {HTMLElement | null} */
  let gameHud = null;
  const gameEls = {
    fill: /** @type {HTMLElement | null} */ (null),
    num: /** @type {HTMLElement | null} */ (null),
    hint: /** @type {HTMLElement | null} */ (null),
    /** @type {HTMLButtonElement[]} */
    cardSlots: [],
    deckNextImg: /** @type {HTMLImageElement | null} */ (null),
    deckNextName: /** @type {HTMLElement | null} */ (null),
    deckNextCost: /** @type {HTMLElement | null} */ (null),
  };
  /** @type {HTMLCanvasElement | null} */
  let gameCanvas = null;
  let domMounted = false;

  function mountGameDom() {
    if (domMounted) return true;
    const canvas = document.getElementById("arena");
    const hud = document.getElementById("hud");
    const btn = document.getElementById("btn-reset");
    const hint = document.getElementById("deploy-hint");
    const fill = document.getElementById("elixir-fill");
    const num = document.getElementById("elixir-num");
    const deckNextImg = document.getElementById("deck-next-img");
    const deckNextName = document.getElementById("deck-next-name");
    const deckNextCost = document.getElementById("deck-next-cost");
    const slots = [0, 1, 2, 3].map((i) => document.getElementById(`card-slot-${i}`));

    if (
      !canvas ||
      !(canvas instanceof HTMLCanvasElement) ||
      !hud ||
      !btn ||
      !hint ||
      !fill ||
      !num ||
      slots.some((el) => !el) ||
      !deckNextImg ||
      !deckNextName ||
      !deckNextCost
    ) {
      return false;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return false;

    gameCtx = ctx;
    gameHud = hud;
    gameCanvas = canvas;
    gameEls.fill = fill;
    gameEls.num = num;
    gameEls.hint = hint;
    gameEls.cardSlots = /** @type {HTMLButtonElement[]} */ (slots);
    gameEls.deckNextImg = deckNextImg;
    gameEls.deckNextName = deckNextName;
    gameEls.deckNextCost = deckNextCost;

    function selectSlot(slot) {
      const state = stateRef.current;
      if (!state || state.over) return;
      const cardId = state.hand[slot];
      if (state.playerElixir < cardCost(cardId)) return;
      state.selectedSlot = state.selectedSlot === slot ? null : slot;
    }

    for (let s = 0; s < 4; s++) {
      slots[s].addEventListener("click", () => selectSlot(s));
    }

    canvas.addEventListener("click", (e) => {
      const state = stateRef.current;
      if (!state) return;
      const { x, y } = canvasPoint(canvas, e);
      trySpawnPlayer(state, x, y);
    });

    btn.addEventListener("click", () => {
      if (stateRef.current) {
        stateRef.current = createInitialState();
      }
    });

    const emoteBar = document.getElementById("emote-bar");
    if (emoteBar) {
      emoteBar.querySelectorAll(".btn-emote").forEach((node) => {
        node.addEventListener("click", () => {
          const emoji = node.getAttribute("data-emoji");
          if (emoji) pushEmote(emoji);
        });
      });
    }

    domMounted = true;
    return true;
  }

  function frame(now) {
    if (!gameRunning || !gameCtx || !gameHud || !stateRef.current) return;
    const dt = Math.min(0.05, (now - lastFrameT) / 1000);
    lastFrameT = now;
    const state = stateRef.current;
    stepSimulation(dt, state);
    render(gameCtx, state);
    gameHud.innerHTML = hudHtml(state);
    syncHandDom(state, gameEls);
    rafId = requestAnimationFrame(frame);
  }

  /**
   * @param {{ mode?: "training" | "battle"; matchId?: string; guestId?: string }} [opts]
   */
  function start(opts) {
    if (!mountGameDom() || !gameCtx || !gameHud) return;
    stop();
    const mode = opts && opts.mode === "battle" ? "battle" : "training";
    const mid = opts && opts.matchId ? String(opts.matchId) : "";
    const gid =
      (opts && opts.guestId && String(opts.guestId)) ||
      sessionStorage.getItem("na_guest") ||
      "";
    if (mode === "battle" && mid && gid) {
      setupBattleNet(mid, gid);
      hudModeLine = `<strong>Battle (PvP)</strong> · match <strong>${mid.slice(0, 8)}…</strong> — your deployments sync; towers &amp; elixir are still local until we sync those too.`;
    } else if (mode === "battle" && mid) {
      hudModeLine = `<strong>Battle</strong> · match <strong>${mid.slice(0, 8)}…</strong> — refresh and re-queue if troops don’t sync (missing guest id).`;
    } else if (mode === "battle") {
      hudModeLine = "<strong>Battle</strong> — online queue (configure Firebase to match with others).";
    } else {
      hudModeLine = "<strong>Training</strong> — practice vs AI.";
    }
    stateRef.current = createInitialState();
    gameRunning = true;
    lastFrameT = performance.now();
    const emoteBar = document.getElementById("emote-bar");
    if (emoteBar) {
      emoteBar.style.display = "flex";
    }
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    gameRunning = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    stateRef.current = null;
    hudModeLine = "";
    tearDownBattleNet();
    const emoteBar = document.getElementById("emote-bar");
    if (emoteBar) emoteBar.style.display = "none";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountGameDom);
  } else {
    mountGameDom();
  }

  window.NightArena = { start, stop, mount: mountGameDom };
})();
