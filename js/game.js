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
  const SPEAR_GOBLINS_COST = 2;
  const SKARMY_COST = 4;
  const ARROWS_COST = 3;
  const ARROWS_SPELL_DMG = 150;
  const ARROWS_SPELL_RADIUS = 92;
  const FIREBALL_COST = 4;
  const FIREBALL_SPELL_DMG = ARROWS_SPELL_DMG * 2.5;
  const FIREBALL_TOWER_DMG = FIREBALL_SPELL_DMG * 0.5;
  const FIREBALL_SPELL_RADIUS = ARROWS_SPELL_RADIUS * (2 / 3);

  const GOBLIN_HUT_COST = 5;
  const GOBLIN_HUT_HP = 680;
  /** Building “timer”: HP ticks down at this rate until the hut collapses (CR-style lifetime). */
  const GOBLIN_HUT_LIFETIME_SEC = 30;
  const GOBLIN_HUT_DECAY_PER_SEC = GOBLIN_HUT_HP / GOBLIN_HUT_LIFETIME_SEC;
  /** Seconds between spawns while a foe is inside the hut’s trigger ring. */
  const HUT_SPAWN_INTERVAL = 2;
  /** Radius from hut center: enemies inside enable spawning; ring is drawn in-game. */
  const HUT_TRIGGER_RADIUS = 138;
  const MAX_SPEAR_PER_HUT = 5;
  const SPEAR_GOBLIN_HP = 25;
  const SPEAR_GOBLIN_DMG = 26;
  const SPEAR_GOBLIN_RANGE = 118;
  const SPEAR_GOBLIN_SPEED = 27;
  const SPEAR_GOBLIN_INTERVAL = 1.05;
  const ZAP_COST = 2;
  const ZAP_SPELL_DMG = 72;
  const ZAP_SPELL_RADIUS = 46;
  /** Zap briefly stuns troops/towers and breaks their attack lock. */
  const ZAP_STUN_DURATION = 1.85;
  /** Beyond melee “reach”, hard lock breaks (target kited away). */
  const LOCK_LEASH_EXTRA = 12;

  /** All implemented card ids (deck builder + validation). */
  const ALL_CARD_IDS = [
    "mini_pekka",
    "knight",
    "skeleton",
    "archers",
    "spear_goblins",
    "skarmy",
    "arrows",
    "fireball",
    "goblin_hut",
    "zap",
    "wizard",
    "mega_knight",
  ];

  /**
   * Default 8-card rotation when no saved deck — pick any 8 unique from ALL_CARD_IDS in the menu to customize.
   */
  const DEFAULT_DECK_EIGHT = [
    "mini_pekka",
    "knight",
    "wizard",
    "archers",
    "spear_goblins",
    "mega_knight",
    "arrows",
    "goblin_hut",
  ];

  const MINI_HP = 400;
  const MINI_DMG = 300;
  const SPEED_MINI_PEKKA = 25;

  const WIZARD_COST = 5;
  const WIZARD_HP = Math.round((MINI_HP * 2) / 3 / 2);
  const WIZARD_DMG = MINI_DMG / 2;
  const WIZARD_RANGE = 92;
  const SPEED_WIZARD = 26;
  const ATTACK_INTERVAL_WIZARD = 1.45;
  const WIZARD_SPLASH_RADIUS = 27;
  /** Splash: fraction of bolt damage to other enemies in the blast (primary takes full bolt once). */
  const WIZARD_SPLASH_FRACTION = 0.58;

  const KNIGHT_HP = 700;
  const KNIGHT_DMG = 65;
  const SPEED_KNIGHT = 17;

  const MEGA_KNIGHT_COST = 8;
  const MEGA_KNIGHT_HP = 2000;
  const SPEED_MEGA_KNIGHT = 12;
  const ATTACK_INTERVAL_MEGA_KNIGHT = 1.42;
  /** Ground slam splash: ⅔ of wizard bolt splash radius. */
  const MEGA_KNIGHT_GROUND_SPLASH_R = (WIZARD_SPLASH_RADIUS * 2) / 3;
  const MEGA_KNIGHT_JUMP_RANGE = 96;
  const MEGA_KNIGHT_WINDUP = 2.0;
  const MEGA_KNIGHT_JUMP_DURATION = 0.38;
  const MEGA_KNIGHT_JUMP_DMG = 200;
  /** Landing AoE: outer ring 2× knight dmg, inner 3×. */
  const MEGA_KNIGHT_JUMP_SLAM_OUTER = 72;

  const SKELETON_HP = 1;
  const SKELETON_DMG = 35;
  const SPEED_SKELETON = 25;

  const ARCHER_HP = 35;
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
  const DEPLOY_DELAY_SEC = 0.4;

  const PROJ_SPEED = 300;
  const FIREBALL_PROJ_SPEED = 265;
  const PROJ_RADIUS = 5;
  /** Extra reach so melee connects reliably once you’re on a target. */
  const MELEE_REACH_BONUS = 6;
  /** Homing shots connect when this close to the locked target’s hit circle. */
  const PROJECTILE_HIT_FUDGE = 4;
  /**
   * Ranged units stop moving at rangedRange + this slack; shot picking must use the same band or they
   * stand still just outside strict rangedRange and never fire (especially vs towers).
   */
  const RANGED_STANDOFF_SLACK = 4;
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
    spearGoblinWalk: /** @type {HTMLImageElement[]} */ ([]),
    wizardWalk: /** @type {HTMLImageElement[]} */ ([]),
    megaKnightWalk: /** @type {HTMLImageElement[]} */ ([]),
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
  loadWalkPair("assets", "spear-goblin", SPRITES.spearGoblinWalk);
  loadWalkPair("assets", "wizard", SPRITES.wizardWalk);
  loadWalkPair("assets", "mega-knight", SPRITES.megaKnightWalk);
  SPRITES.towerPrincess.src = "assets/tower-princess.svg";
  SPRITES.towerKing.src = "assets/tower-king.svg";
  SPRITES.bridge.src = "assets/bridge.svg";

  const stateRef = { current: /** @type {null | object} */ (null) };
  const testingPanelSync = { fn: /** @type {null | (() => void)} */ (null) };

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
    /** @type {{ kind: "troop"; troop: typeof state.troops[0] } | { kind: "tower"; tower: (typeof state.towers)[0] } | { kind: "building"; building: (typeof state.buildings)[0] } | null} */
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

    const buildings = state.buildings || [];
    for (const bd of buildings) {
      if (bd.hp <= 0 || bd.side === troop.side) continue;
      const d = dist(troop.x, troop.y, bd.x, bd.y);
      if (d < bestD) {
        bestD = d;
        pick = { kind: "building", building: bd };
      }
    }

    return pick;
  }

  function clearTroopAggro(troop) {
    troop.aggroKind = null;
    troop.aggroId = null;
    troop.combatLocked = false;
  }

  function troopStunned(troop, now) {
    return troop.stunUntil != null && now < troop.stunUntil;
  }

  function aggroTargetInMeleeEngageRange(troop, ct) {
    if (ct.kind === "troop") {
      const o = ct.troop;
      return (
        dist(troop.x, troop.y, o.x, o.y) <=
        troop.meleeRange + o.radius * 0.5 + MELEE_REACH_BONUS + LOCK_LEASH_EXTRA
      );
    }
    if (ct.kind === "building") {
      const bd = ct.building;
      return (
        dist(troop.x, troop.y, bd.x, bd.y) <=
        troop.meleeRange + bd.radius * 0.5 + MELEE_REACH_BONUS + LOCK_LEASH_EXTRA
      );
    }
    const tw = ct.tower;
    const pad = tw.kind === "king" ? 26 : 22;
    return dist(troop.x, troop.y, tw.x, tw.y) <= troop.meleeRange + pad + MELEE_REACH_BONUS + LOCK_LEASH_EXTRA;
  }

  function rangedEngagementInRange(unit, ct) {
    const R = unit.rangedRange * 1.08;
    if (ct.kind === "troop") return dist(unit.x, unit.y, ct.troop.x, ct.troop.y) <= R;
    if (ct.kind === "tower") return dist(unit.x, unit.y, ct.tower.x, ct.tower.y) <= R;
    return dist(unit.x, unit.y, ct.building.x, ct.building.y) <= R;
  }

  function isRangedTroopType(troop) {
    const t = troop.type;
    return t === "archer" || t === "spear_goblin" || t === "wizard";
  }

  function playerInfiniteElixir(state) {
    return state.matchMode === "training" && !!state.testing && state.testing.infiniteElixir === true;
  }

  /** Training AI card drops + enemy hut spears respect “enemy spawns” off. */
  function trainingEnemyAiEnabled(state) {
    return state.matchMode !== "training" || !state.testing || state.testing.enemySpawns !== false;
  }

  function setTroopAggroFromPick(troop, pick) {
    if (!pick) {
      clearTroopAggro(troop);
      return;
    }
    if (pick.kind === "troop") {
      troop.aggroKind = "troop";
      troop.aggroId = pick.troop.id;
    } else if (pick.kind === "tower") {
      troop.aggroKind = "tower";
      troop.aggroId = pick.tower.id;
    } else {
      troop.aggroKind = "building";
      troop.aggroId = pick.building.id;
    }
  }

  function tryResolveTroopAggro(troop, state) {
    if (!troop.aggroKind || !troop.aggroId) return null;
    if (troop.aggroKind === "troop") {
      const u = state.troops.find((x) => x.id === troop.aggroId);
      if (!u || u.hp <= 0 || u.side === troop.side) {
        clearTroopAggro(troop);
        return null;
      }
      return { kind: "troop", troop: u };
    }
    if (troop.aggroKind === "tower") {
      const tw = state.towers.find((x) => x.id === troop.aggroId);
      if (!tw || tw.hp <= 0 || tw.side === troop.side) {
        clearTroopAggro(troop);
        return null;
      }
      if (tw.kind === "king" && !kingAwakeForSide(state.towers, tw.side)) {
        clearTroopAggro(troop);
        return null;
      }
      return { kind: "tower", tower: tw };
    }
    if (troop.aggroKind === "building") {
      const bd = (state.buildings || []).find((x) => x.id === troop.aggroId);
      if (!bd || bd.hp <= 0 || bd.side === troop.side) {
        clearTroopAggro(troop);
        return null;
      }
      return { kind: "building", building: bd };
    }
    clearTroopAggro(troop);
    return null;
  }

  /**
   * Chase nearest foe until first hit; then stay on that target unless it leaves melee engage range,
   * dies, or Zap stun clears the lock.
   */
  function resolveCombatPick(troop, state) {
    const now = state.time;
    if (troopStunned(troop, now)) return null;

    if (troop.combatLocked) {
      const locked = tryResolveTroopAggro(troop, state);
      if (locked) {
        const still = isRangedTroopType(troop)
          ? rangedEngagementInRange(troop, locked)
          : aggroTargetInMeleeEngageRange(troop, locked);
        if (still) return locked;
      }
      clearTroopAggro(troop);
    }

    const pick = pickCombatTarget(troop, state);
    setTroopAggroFromPick(troop, pick);
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
    if (troop.hp <= 0) return;
    if (troopStunned(troop, state.time)) return;
    if (troop.type === "mega_knight" && troop.mkJumpPhase) {
      const tx = troop.mkJumpTX;
      const ty = troop.mkJumpTY;
      const d = dist(troop.x, troop.y, tx, ty);
      if (d < 1e-3) return;
      const fx = (tx - troop.x) / d;
      const fy = (ty - troop.y) / d;
      const k = clamp(10 * dt, 0, 1);
      troop.faceX += (fx - troop.faceX) * k;
      troop.faceY += (fy - troop.faceY) * k;
      const m = Math.hypot(troop.faceX, troop.faceY);
      if (m > 1e-3) {
        troop.faceX /= m;
        troop.faceY /= m;
      }
      return;
    }
    if (troop.attackT > 0) return;
    const ct = resolveCombatPick(troop, state);
    if (!ct) return;
    let tx;
    let ty;
    if (ct.kind === "troop" && ct.troop.hp > 0) {
      tx = ct.troop.x;
      ty = ct.troop.y;
    } else if (ct.kind === "tower" && ct.tower.hp > 0) {
      tx = ct.tower.x;
      ty = ct.tower.y;
    } else if (ct.kind === "building" && ct.building.hp > 0) {
      tx = ct.building.x;
      ty = ct.building.y;
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

  function applyBuildingDamage(state, b, amount) {
    if (b.hp <= 0 || amount <= 0) return;
    b.hp -= amount;
    if (b.hp < 0) b.hp = 0;
  }

  function countSpearFromHut(state, hutId) {
    let n = 0;
    for (const u of state.troops) {
      if (u.hp > 0 && u.type === "spear_goblin" && u.spawnedByHutId === hutId) n++;
    }
    return n;
  }

  function createSpearGoblinFromHut(state, hut) {
    const dir = hut.side === "player" ? -1 : 1;
    const jitter = (Math.random() - 0.5) * 16;
    const faceY = hut.side === "player" ? -1 : 1;
    state.troops.push({
      id: `u${++state.uid}`,
      side: hut.side,
      type: "spear_goblin",
      x: hut.x + jitter,
      y: hut.y + dir * 24,
      hp: SPEAR_GOBLIN_HP,
      maxHp: SPEAR_GOBLIN_HP,
      speed: SPEAR_GOBLIN_SPEED,
      radius: 3.5,
      path: "deploy",
      bridgeIx: pickBridgeIx(hut.x + jitter, hut.y + dir * 24),
      spawnTime: state.time,
      faceX: 0,
      faceY,
      fireAt: 0,
      rangedDmg: SPEAR_GOBLIN_DMG,
      rangedRange: SPEAR_GOBLIN_RANGE,
      rangedInterval: SPEAR_GOBLIN_INTERVAL,
      attackT: 0,
      spawnedByHutId: hut.id,
      stunUntil: 0,
      combatLocked: false,
    });
    const u = state.troops[state.troops.length - 1];
    u.bridgeIx = pickBridgeIx(u.x, u.y);
  }

  function createGoblinHutBuilding(side, x, y, state) {
    state.buildings.push({
      id: `b${++state.uid}`,
      kind: "goblin_hut",
      side,
      x,
      y,
      hp: GOBLIN_HUT_HP,
      maxHp: GOBLIN_HUT_HP,
      radius: 22,
      spawnAcc: 0,
    });
  }

  /** True if any enemy troop, building, or targetable tower intersects the hut’s trigger disk. */
  function foeInGoblinHutRange(hut, state) {
    const R = HUT_TRIGGER_RADIUS;
    for (const u of state.troops) {
      if (u.hp <= 0 || u.side === hut.side) continue;
      if (dist(hut.x, hut.y, u.x, u.y) <= R) return true;
    }
    for (const o of state.buildings || []) {
      if (o === hut || o.hp <= 0 || o.side === hut.side) continue;
      if (dist(hut.x, hut.y, o.x, o.y) <= R + o.radius * 0.35) return true;
    }
    for (const tw of state.towers) {
      if (tw.hp <= 0 || tw.side === hut.side) continue;
      if (tw.kind === "king" && !kingAwakeForSide(state.towers, tw.side)) continue;
      const ext = tw.kind === "king" ? 36 : 30;
      if (dist(hut.x, hut.y, tw.x, tw.y) <= R + ext) return true;
    }
    return false;
  }

  function updateGoblinHutDecay(dt, state) {
    const buildings = state.buildings;
    if (!buildings || !buildings.length) return;
    const amt = GOBLIN_HUT_DECAY_PER_SEC * dt;
    for (const b of buildings) {
      if (b.hp <= 0 || b.kind !== "goblin_hut") continue;
      applyBuildingDamage(state, b, amt);
    }
  }

  function updateHutSpawns(dt, state) {
    const buildings = state.buildings;
    if (!buildings || !buildings.length) return;
    for (const b of buildings) {
      if (b.hp <= 0 || b.kind !== "goblin_hut") continue;
      if (!trainingEnemyAiEnabled(state) && b.side === "enemy") {
        b.spawnAcc = 0;
        continue;
      }
      if (!foeInGoblinHutRange(b, state)) {
        b.spawnAcc = 0;
        continue;
      }
      b.spawnAcc += dt;
      while (b.spawnAcc >= HUT_SPAWN_INTERVAL && countSpearFromHut(state, b.id) < MAX_SPEAR_PER_HUT) {
        b.spawnAcc -= HUT_SPAWN_INTERVAL;
        createSpearGoblinFromHut(state, b);
      }
    }
  }

  /** @type {string[] | null} */
  let runtimePlayerDeck = null;

  function validateDeckForGame(deck) {
    if (!deck || !Array.isArray(deck) || deck.length !== 8) return false;
    const allowed = new Set(ALL_CARD_IDS);
    const seen = new Set();
    for (const c of deck) {
      if (typeof c !== "string" || !allowed.has(c) || seen.has(c)) return false;
      seen.add(c);
    }
    return true;
  }

  function shuffleDeckFrom(sourceIds) {
    const d = sourceIds.slice();
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
        stunUntil: 0,
        combatLocked: false,
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
        stunUntil: 0,
        combatLocked: false,
      });
    } else if (type === "mega_knight") {
      state.troops.push({
        id: `u${++state.uid}`,
        side,
        type: "mega_knight",
        x,
        y,
        hp: MEGA_KNIGHT_HP,
        maxHp: MEGA_KNIGHT_HP,
        speed: SPEED_MEGA_KNIGHT,
        radius: 11,
        path: "deploy",
        bridgeIx: pickBridgeIx(x, y),
        spawnTime: state.time,
        hasHitOnce: false,
        firstHitDelay: MELEE_FIRST_HIT_DELAY,
        lastMeleeAt: -999,
        hitInterval: ATTACK_INTERVAL_MEGA_KNIGHT,
        hitDamage: KNIGHT_DMG,
        meleeRange: 30,
        attackT: 0,
        faceX: 0,
        faceY,
        stunUntil: 0,
        combatLocked: false,
        mkJumpPhase: 0,
        mkWindupT: 0,
        mkJumpT: 0,
        mkJumpSX: 0,
        mkJumpSY: 0,
        mkJumpTX: 0,
        mkJumpTY: 0,
      });
    } else if (type === "wizard") {
      state.troops.push({
        id: `u${++state.uid}`,
        side,
        type: "wizard",
        x,
        y,
        hp: WIZARD_HP,
        maxHp: WIZARD_HP,
        speed: SPEED_WIZARD,
        radius: 7,
        path: "deploy",
        bridgeIx: pickBridgeIx(x, y),
        spawnTime: state.time,
        faceX: 0,
        faceY,
        fireAt: 0,
        rangedDmg: WIZARD_DMG,
        rangedRange: WIZARD_RANGE,
        rangedInterval: ATTACK_INTERVAL_WIZARD,
        attackT: 0,
        stunUntil: 0,
        combatLocked: false,
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
          stunUntil: 0,
          combatLocked: false,
        });
      }
    } else if (type === "spear_goblins") {
      const trio = [
        [-12, -2],
        [0, 6],
        [12, -2],
      ];
      for (const [ox, oy] of trio) {
        state.troops.push({
          id: `u${++state.uid}`,
          side,
          type: "spear_goblin",
          x: x + ox,
          y: y + oy,
          hp: SPEAR_GOBLIN_HP,
          maxHp: SPEAR_GOBLIN_HP,
          speed: SPEAR_GOBLIN_SPEED,
          radius: 3.5,
          path: "deploy",
          bridgeIx: pickBridgeIx(x + ox, y + oy),
          spawnTime: state.time,
          faceX: 0,
          faceY,
          fireAt: 0,
          rangedDmg: SPEAR_GOBLIN_DMG,
          rangedRange: SPEAR_GOBLIN_RANGE,
          rangedInterval: SPEAR_GOBLIN_INTERVAL,
          attackT: 0,
          stunUntil: 0,
          combatLocked: false,
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
          stunUntil: 0,
          combatLocked: false,
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
          stunUntil: 0,
          combatLocked: false,
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
    if (troopStunned(troop, state.time)) return;
    if (troop.type === "mega_knight" && troop.mkJumpPhase) return;
    const step = troop.speed * dt;
    const ct = resolveCombatPick(troop, state);
    let tx = null;
    let ty = null;
    if (ct) {
      if (ct.kind === "troop" && ct.troop.hp > 0) {
        tx = ct.troop.x;
        ty = ct.troop.y;
      } else if (ct.kind === "tower" && ct.tower.hp > 0) {
        tx = ct.tower.x;
        ty = ct.tower.y;
      } else if (ct.kind === "building" && ct.building.hp > 0) {
        tx = ct.building.x;
        ty = ct.building.y;
      }
    }
    /** Ranged: stop walking once in shot range or while firing — don’t march into the tower. */
    if (isRangedTroopType(troop)) {
      if (troop.attackT > 0) {
        tx = null;
        ty = null;
      } else if (tx != null && ty != null) {
        const dHold = dist(troop.x, troop.y, tx, ty);
        if (dHold <= troop.rangedRange + RANGED_STANDOFF_SLACK) {
          tx = null;
          ty = null;
        }
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
    else if (troop.type === "mega_knight") troop.attackT = 0.34;
    else if (isRangedTroopType(troop)) troop.attackT = 0.22;
    else troop.attackT = 0.18;
  }

  function tryMelee(troop, state, now) {
    if (troop.hp <= 0) return;
    if (troopStunned(troop, now)) return;
    if (troop.type === "mega_knight") return;
    if (isRangedTroopType(troop)) return;
    if (!meleeCooldownReady(troop, now)) return;

    const ct = resolveCombatPick(troop, state);
    if (!ct) return;

    if (ct.kind === "troop") {
      const o = ct.troop;
      if (o.hp <= 0) return;
      if (dist(troop.x, troop.y, o.x, o.y) > troop.meleeRange + o.radius * 0.5 + MELEE_REACH_BONUS) return;
      o.hp -= troop.hitDamage;
      if (o.hp < 0) o.hp = 0;
      troop.lastMeleeAt = now;
      troop.combatLocked = true;
      if (troop.type !== "skeleton") troop.hasHitOnce = true;
      triggerAttackAnim(troop, o.x, o.y);
      return;
    }

    if (ct.kind === "building") {
      const bd = ct.building;
      if (bd.hp <= 0) return;
      if (dist(troop.x, troop.y, bd.x, bd.y) > troop.meleeRange + bd.radius * 0.5 + MELEE_REACH_BONUS) return;
      applyBuildingDamage(state, bd, troop.hitDamage);
      troop.lastMeleeAt = now;
      troop.combatLocked = true;
      if (troop.type !== "skeleton") troop.hasHitOnce = true;
      triggerAttackAnim(troop, bd.x, bd.y);
      return;
    }

    const tw = ct.tower;
    if (tw.hp <= 0) return;
    const reach = troop.meleeRange + (tw.kind === "king" ? 26 : 22) + MELEE_REACH_BONUS;
    if (dist(troop.x, troop.y, tw.x, tw.y) > reach) return;
    applyTowerDamage(state, tw, troop.hitDamage);
    troop.lastMeleeAt = now;
    troop.combatLocked = true;
    if (troop.type !== "skeleton") troop.hasHitOnce = true;
    triggerAttackAnim(troop, tw.x, tw.y);
  }

  function createInitialState() {
    const mkTower = (base) => ({
      ...base,
      fireAt: 0,
      fallen: false,
      stunUntil: 0,
      aggroKind: /** @type {null | "troop" | "building"} */ (null),
      aggroId: /** @type {null | string} */ (null),
      combatLocked: false,
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

    const pSrc =
      runtimePlayerDeck && validateDeckForGame(runtimePlayerDeck) ? runtimePlayerDeck : DEFAULT_DECK_EIGHT;
    const pDeck = shuffleDeckFrom(pSrc);
    const eDeck = shuffleDeckFrom(DEFAULT_DECK_EIGHT);
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
      /** @type {{ cx: number; cy: number; until: number } | null} */
      fireballFx: null,
      /** @type {{ cx: number; cy: number; until: number } | null} */
      zapFx: null,
      /** @type {{ cx: number; cy: number; until: number; radius: number; kind: "wizard" | "mega_jump" | "mega_ground" }[]} */
      wizardSplashFx: [],
      /** @type {object[]} */
      buildings: [],
      /** @type {{ at: number; side: "player" | "enemy"; card: string; x: number; y: number }[]} */
      pendingDeploys: [],
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
      /** @type {"training" | "battle"} */
      matchMode: "training",
      /** Training-only sandbox toggles (see #testing-panel). */
      testing: {
        enemySpawns: true,
        infiniteElixir: false,
      },
    };
  }

  function resolveTroopBuildingCollisions(troops, buildings) {
    if (!buildings || !buildings.length) return;
    const padding = 2;
    for (const b of buildings) {
      if (b.hp <= 0) continue;
      for (const u of troops) {
        if (u.hp <= 0) continue;
        const minD = u.radius + b.radius + padding;
        const d = dist(u.x, u.y, b.x, b.y);
        if (d >= minD || d < 1e-4) continue;
        const nx = (u.x - b.x) / d;
        const ny = (u.y - b.y) / d;
        const pen = (minD - d) * 0.55;
        slideNudge(u, nx * pen, ny * pen);
      }
    }
  }

  /** Nearest foe troop or building in tower range (CR-style). */
  function nearestFoeForTowerAttack(tower, state) {
    const range = tower.kind === "king" ? KING_RANGE : PRINCESS_RANGE;
    let best = /** @type {{ kind: "troop"; troop: (typeof state.troops)[0] } | { kind: "building"; building: (typeof state.buildings)[0] } | null} */ (
      null
    );
    let bestD = Infinity;
    for (const u of state.troops) {
      if (u.hp <= 0 || u.side === tower.side) continue;
      const d = dist(tower.x, tower.y, u.x, u.y);
      if (d <= range && d < bestD) {
        bestD = d;
        best = { kind: "troop", troop: u };
      }
    }
    const buildings = state.buildings || [];
    for (const b of buildings) {
      if (b.hp <= 0 || b.side === tower.side) continue;
      const d = dist(tower.x, tower.y, b.x, b.y);
      if (d <= range && d < bestD) {
        bestD = d;
        best = { kind: "building", building: b };
      }
    }
    return best;
  }

  function clearTowerAggro(tower) {
    tower.aggroKind = null;
    tower.aggroId = null;
    tower.combatLocked = false;
  }

  function towerStunned(tower, now) {
    return tower.stunUntil != null && now < tower.stunUntil;
  }

  function towerTargetInEngageRange(tower, ct) {
    const range = tower.kind === "king" ? KING_RANGE : PRINCESS_RANGE;
    if (ct.kind === "troop") return dist(tower.x, tower.y, ct.troop.x, ct.troop.y) <= range;
    return dist(tower.x, tower.y, ct.building.x, ct.building.y) <= range;
  }

  function setTowerAggroFromPick(tower, pick) {
    if (!pick) {
      clearTowerAggro(tower);
      return;
    }
    if (pick.kind === "troop") {
      tower.aggroKind = "troop";
      tower.aggroId = pick.troop.id;
    } else {
      tower.aggroKind = "building";
      tower.aggroId = pick.building.id;
    }
  }

  function tryResolveTowerAggro(tower, state) {
    if (!tower.aggroKind || !tower.aggroId) return null;
    if (tower.aggroKind === "troop") {
      const u = state.troops.find((x) => x.id === tower.aggroId);
      if (!u || u.hp <= 0 || u.side === tower.side) {
        clearTowerAggro(tower);
        return null;
      }
      return { kind: "troop", troop: u };
    }
    if (tower.aggroKind === "building") {
      const bd = (state.buildings || []).find((x) => x.id === tower.aggroId);
      if (!bd || bd.hp <= 0 || bd.side === tower.side) {
        clearTowerAggro(tower);
        return null;
      }
      return { kind: "building", building: bd };
    }
    clearTowerAggro(tower);
    return null;
  }

  function towerShoot(state, tower, now) {
    if (tower.hp <= 0 || state.over) return;
    if (towerStunned(tower, now)) return;
    const cd = tower.kind === "king" ? KING_FIRE : PRINCESS_FIRE;
    if (now < tower.fireAt) return;
    if (tower.kind === "king" && !kingAwakeForSide(state.towers, tower.side)) return;

    let ct = null;
    if (tower.combatLocked) {
      const locked = tryResolveTowerAggro(tower, state);
      if (locked && towerTargetInEngageRange(tower, locked)) {
        ct = locked;
      } else {
        clearTowerAggro(tower);
      }
    }
    if (!ct) ct = nearestFoeForTowerAttack(tower, state);
    if (!ct) {
      clearTowerAggro(tower);
      return;
    }
    setTowerAggroFromPick(tower, ct);
    tower.combatLocked = true;

    let tx;
    let ty;
    let targetKind;
    let targetId;
    if (ct.kind === "troop") {
      tx = ct.troop.x;
      ty = ct.troop.y;
      targetKind = "troop";
      targetId = ct.troop.id;
    } else {
      tx = ct.building.x;
      ty = ct.building.y;
      targetKind = "building";
      targetId = ct.building.id;
    }

    tower.fireAt = now + cd;
    const n = norm(tx - tower.x, ty - tower.y);
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
      homing: true,
      targetKind,
      targetId,
    });
  }

  /** Nearest foe troop, building, or targetable tower within ranged shot range (CR-style). */
  function pickRangedShotTarget(unit, state) {
    if (troopStunned(unit, state.time)) return null;
    const shotR = unit.rangedRange + RANGED_STANDOFF_SLACK;

    if (unit.combatLocked) {
      const locked = tryResolveTroopAggro(unit, state);
      if (locked && rangedEngagementInRange(unit, locked)) {
        return locked;
      }
      clearTroopAggro(unit);
    }

    let bestD = Infinity;
    /** @type {{ kind: "troop"; troop: (typeof state.troops)[0] } | { kind: "tower"; tower: (typeof state.towers)[0] } | { kind: "building"; building: (typeof state.buildings)[0] } | null} */
    let best = null;
    for (const u of state.troops) {
      if (u.hp <= 0 || u.side === unit.side) continue;
      const d = dist(unit.x, unit.y, u.x, u.y);
      if (d <= shotR && d < bestD) {
        bestD = d;
        best = { kind: "troop", troop: u };
      }
    }
    for (const tw of targetableFoeTowers(unit, state.towers)) {
      const d = dist(unit.x, unit.y, tw.x, tw.y);
      if (d <= shotR && d < bestD) {
        bestD = d;
        best = { kind: "tower", tower: tw };
      }
    }
    const buildings = state.buildings || [];
    for (const bd of buildings) {
      if (bd.hp <= 0 || bd.side === unit.side) continue;
      const d = dist(unit.x, unit.y, bd.x, bd.y);
      if (d <= shotR && d < bestD) {
        bestD = d;
        best = { kind: "building", building: bd };
      }
    }
    if (best) setTroopAggroFromPick(unit, best);
    return best;
  }

  function rangedTroopShoot(state, unit, now) {
    if (unit.hp <= 0 || state.over) return;
    if (troopStunned(unit, now)) return;
    if (!isRangedTroopType(unit)) return;
    if (now < unit.fireAt) return;
    const target = pickRangedShotTarget(unit, state);
    if (!target) return;
    unit.fireAt = now + unit.rangedInterval;
    unit.combatLocked = true;
    let tx;
    let ty;
    if (target.kind === "troop") {
      tx = target.troop.x;
      ty = target.troop.y;
    } else if (target.kind === "tower") {
      tx = target.tower.x;
      ty = target.tower.y;
    } else {
      tx = target.building.x;
      ty = target.building.y;
    }
    triggerAttackAnim(unit, tx, ty);
    const n = norm(tx - unit.x, ty - unit.y);
    const yOff = unit.side === "enemy" ? 8 : -8;
    const projKind =
      unit.type === "spear_goblin" ? "spear" : unit.type === "wizard" ? "wizard" : "archer";
    /** @type {"troop" | "tower" | "building"} */
    let targetKind;
    let targetId;
    if (target.kind === "troop") {
      targetKind = "troop";
      targetId = target.troop.id;
    } else if (target.kind === "tower") {
      targetKind = "tower";
      targetId = target.tower.id;
    } else {
      targetKind = "building";
      targetId = target.building.id;
    }
    state.projectiles.push({
      x: unit.x,
      y: unit.y + yOff,
      vx: n.x * PROJ_SPEED,
      vy: n.y * PROJ_SPEED,
      dmg: unit.rangedDmg,
      fromSide: unit.side,
      hitsTowers: true,
      projKind,
      projRadius: unit.type === "wizard" ? 6 : 4,
      homing: true,
      targetKind,
      targetId,
    });
  }

  function resolveHomingProjectileTarget(p, state) {
    if (!p.homing || !p.targetKind || !p.targetId) return null;
    if (p.targetKind === "troop") {
      const u = state.troops.find((t) => t.id === p.targetId);
      if (!u || u.hp <= 0 || u.side === p.fromSide) return null;
      return { kind: "troop", troop: u, x: u.x, y: u.y, hitR: u.radius };
    }
    if (p.targetKind === "tower") {
      const tw = state.towers.find((t) => t.id === p.targetId);
      if (!tw || tw.hp <= 0 || tw.side === p.fromSide) return null;
      if (tw.kind === "king" && !kingAwakeForSide(state.towers, tw.side)) return null;
      const hitR = tw.kind === "king" ? 30 : 22;
      return { kind: "tower", tower: tw, x: tw.x, y: tw.y, hitR };
    }
    if (p.targetKind === "building") {
      const bd = (state.buildings || []).find((b) => b.id === p.targetId);
      if (!bd || bd.hp <= 0 || bd.side === p.fromSide) return null;
      return { kind: "building", building: bd, x: bd.x, y: bd.y, hitR: bd.radius };
    }
    return null;
  }

  function applyProjectileDamageResolved(state, p, resolved) {
    if (resolved.kind === "troop") {
      const u = resolved.troop;
      u.hp -= p.dmg;
      if (u.hp < 0) u.hp = 0;
    } else if (resolved.kind === "tower") {
      applyTowerDamage(state, resolved.tower, p.dmg);
    } else {
      applyBuildingDamage(state, resolved.building, p.dmg);
    }
  }

  /** Wizard bolt: primary took full bolt damage; splash hits others in radius for a fraction. */
  function applyWizardSplashAround(state, cx, cy, fromSide, radius, splashDmg, primaryResolved) {
    if (!primaryResolved || splashDmg <= 0) return;
    let skipTroopId = null;
    let skipTowerId = null;
    let skipBuildingId = null;
    if (primaryResolved.kind === "troop") skipTroopId = primaryResolved.troop.id;
    else if (primaryResolved.kind === "tower") skipTowerId = primaryResolved.tower.id;
    else skipBuildingId = primaryResolved.building.id;

    for (const u of state.troops) {
      if (u.hp <= 0 || u.side === fromSide) continue;
      if (skipTroopId && u.id === skipTroopId) continue;
      if (dist(u.x, u.y, cx, cy) <= radius + u.radius * 0.35) {
        u.hp -= splashDmg;
        if (u.hp < 0) u.hp = 0;
      }
    }
    for (const bd of state.buildings || []) {
      if (bd.hp <= 0 || bd.side === fromSide) continue;
      if (skipBuildingId && bd.id === skipBuildingId) continue;
      if (dist(bd.x, bd.y, cx, cy) <= radius + bd.radius * 0.4) {
        applyBuildingDamage(state, bd, splashDmg);
      }
    }
    for (const tw of state.towers) {
      if (tw.hp <= 0 || tw.side === fromSide) continue;
      if (tw.kind === "king" && !kingAwakeForSide(state.towers, tw.side)) continue;
      if (skipTowerId && tw.id === skipTowerId) continue;
      const ext = tw.kind === "king" ? 32 : 24;
      if (dist(tw.x, tw.y, cx, cy) <= radius + ext) {
        applyTowerDamage(state, tw, splashDmg);
      }
    }
  }

  /** Full damage to every foe troop/building/tower in radius (no primary skip). */
  function applyFullAoEToFoes(state, cx, cy, fromSide, radius, dmg) {
    if (dmg <= 0) return;
    for (const u of state.troops) {
      if (u.hp <= 0 || u.side === fromSide) continue;
      if (dist(u.x, u.y, cx, cy) <= radius + u.radius * 0.35) {
        u.hp -= dmg;
        if (u.hp < 0) u.hp = 0;
      }
    }
    for (const bd of state.buildings || []) {
      if (bd.hp <= 0 || bd.side === fromSide) continue;
      if (dist(bd.x, bd.y, cx, cy) <= radius + bd.radius * 0.4) {
        applyBuildingDamage(state, bd, dmg);
      }
    }
    for (const tw of state.towers) {
      if (tw.hp <= 0 || tw.side === fromSide) continue;
      if (tw.kind === "king" && !kingAwakeForSide(state.towers, tw.side)) continue;
      const ext = tw.kind === "king" ? 32 : 24;
      if (dist(tw.x, tw.y, cx, cy) <= radius + ext) {
        applyTowerDamage(state, tw, dmg);
      }
    }
  }

  function resetMegaKnightJump(troop) {
    troop.mkJumpPhase = 0;
    troop.mkWindupT = 0;
    troop.mkJumpT = 0;
  }

  /** Jump landing: flat 200 damage in the jump splash (Clash-style request). */
  function applyMegaKnightJumpSlam(state, cx, cy, fromSide) {
    const rOut = MEGA_KNIGHT_JUMP_SLAM_OUTER;
    const dJump = MEGA_KNIGHT_JUMP_DMG;
    for (const u of state.troops) {
      if (u.hp <= 0 || u.side === fromSide) continue;
      const d = dist(u.x, u.y, cx, cy);
      if (d <= rOut + u.radius * 0.35) {
        u.hp -= dJump;
        if (u.hp < 0) u.hp = 0;
      }
    }
    for (const bd of state.buildings || []) {
      if (bd.hp <= 0 || bd.side === fromSide) continue;
      const d = dist(bd.x, bd.y, cx, cy);
      if (d <= rOut + bd.radius * 0.35) {
        applyBuildingDamage(state, bd, dJump);
      }
    }
    for (const tw of state.towers) {
      if (tw.hp <= 0 || tw.side === fromSide) continue;
      if (tw.kind === "king" && !kingAwakeForSide(state.towers, tw.side)) continue;
      const extK = tw.kind === "king" ? 32 : 24;
      const d = dist(tw.x, tw.y, cx, cy);
      if (d <= rOut + extK) {
        applyTowerDamage(state, tw, dJump);
      }
    }
  }

  function megaKnightGroundReach(troop, ct) {
    if (ct.kind === "troop") {
      const o = ct.troop;
      return troop.meleeRange + o.radius * 0.5 + MELEE_REACH_BONUS + 2;
    }
    if (ct.kind === "building") {
      const bd = ct.building;
      return troop.meleeRange + bd.radius * 0.5 + MELEE_REACH_BONUS;
    }
    const tw = ct.tower;
    const pad = tw.kind === "king" ? 26 : 22;
    return troop.meleeRange + pad + MELEE_REACH_BONUS;
  }

  function combatTargetCenter(ct) {
    if (ct.kind === "troop") return { x: ct.troop.x, y: ct.troop.y };
    if (ct.kind === "building") return { x: ct.building.x, y: ct.building.y };
    return { x: ct.tower.x, y: ct.tower.y };
  }

  function updateMegaKnight(troop, dt, state, now) {
    if (troop.type !== "mega_knight" || troop.hp <= 0) return;
    if (troopStunned(troop, now)) {
      resetMegaKnightJump(troop);
      return;
    }

    if (troop.mkJumpPhase === 1 && troop.mkWindupT > 0) {
      troop.mkWindupT -= dt;
      if (troop.mkWindupT <= 0) {
        troop.mkWindupT = 0;
        troop.mkJumpPhase = 2;
        troop.mkJumpT = MEGA_KNIGHT_JUMP_DURATION;
      }
      return;
    }

    if (troop.mkJumpPhase === 2 && troop.mkJumpT > 0) {
      const dur = MEGA_KNIGHT_JUMP_DURATION;
      troop.mkJumpT -= dt;
      const t = clamp(1 - troop.mkJumpT / dur, 0, 1);
      const e = t * t * (3 - 2 * t);
      troop.x = troop.mkJumpSX + (troop.mkJumpTX - troop.mkJumpSX) * e;
      troop.y = troop.mkJumpSY + (troop.mkJumpTY - troop.mkJumpSY) * e;
      if (troop.mkJumpT <= 0) {
        const lx = troop.mkJumpTX;
        const ly = troop.mkJumpTY;
        const ax = lx + (lx - troop.mkJumpSX);
        const ay = ly + (ly - troop.mkJumpSY);
        troop.x = lx;
        troop.y = ly;
        applyMegaKnightJumpSlam(state, lx, ly, troop.side);
        state.wizardSplashFx.push({
          cx: lx,
          cy: ly,
          until: state.time + 0.48,
          radius: MEGA_KNIGHT_JUMP_SLAM_OUTER,
          kind: "mega_jump",
        });
        resetMegaKnightJump(troop);
        troop.lastMeleeAt = now;
        troop.combatLocked = true;
        troop.hasHitOnce = true;
        triggerAttackAnim(troop, ax, ay);
      }
      return;
    }

    if (!meleeCooldownReady(troop, now)) return;

    const ct = resolveCombatPick(troop, state);
    if (!ct) return;
    const { x: tx, y: ty } = combatTargetCenter(ct);
    const d = dist(troop.x, troop.y, tx, ty);
    const reach = megaKnightGroundReach(troop, ct);

    if (d <= reach) {
      applyFullAoEToFoes(state, troop.x, troop.y, troop.side, MEGA_KNIGHT_GROUND_SPLASH_R, KNIGHT_DMG);
      state.wizardSplashFx.push({
        cx: troop.x,
        cy: troop.y,
        until: state.time + 0.34,
        radius: MEGA_KNIGHT_GROUND_SPLASH_R,
        kind: "mega_ground",
      });
      troop.lastMeleeAt = now;
      troop.combatLocked = true;
      troop.hasHitOnce = true;
      triggerAttackAnim(troop, tx, ty);
      return;
    }

    if (d <= MEGA_KNIGHT_JUMP_RANGE) {
      const maxL = MEGA_KNIGHT_JUMP_RANGE;
      const landT = Math.min(1, maxL / Math.max(d, 1e-3));
      const ltx = troop.x + (tx - troop.x) * landT;
      const lty = troop.y + (ty - troop.y) * landT;
      troop.mkJumpPhase = 1;
      troop.mkWindupT = MEGA_KNIGHT_WINDUP;
      troop.mkJumpT = 0;
      troop.mkJumpSX = troop.x;
      troop.mkJumpSY = troop.y;
      troop.mkJumpTX = ltx;
      troop.mkJumpTY = lty;
      troop.combatLocked = true;
      triggerAttackAnim(troop, ltx, lty);
    }
  }

  function updateProjectiles(dt, state) {
    const { projectiles, troops } = state;
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      const pr = p.projRadius ?? PROJ_RADIUS;

      let homingResolved = null;
      if (p.homing) {
        homingResolved = resolveHomingProjectileTarget(p, state);
        if (!homingResolved) {
          projectiles.splice(i, 1);
          continue;
        }
        const steer = norm(homingResolved.x - p.x, homingResolved.y - p.y);
        p.vx = steer.x * PROJ_SPEED;
        p.vy = steer.y * PROJ_SPEED;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.fireballSpell) {
        const tx = p.targetX ?? p.x;
        const ty = p.targetY ?? p.y;
        if (p.x < -20 - pr || p.x > W + 20 + pr || p.y < -20 - pr || p.y > H + 20 + pr) {
          projectiles.splice(i, 1);
          continue;
        }
        const reached = dist(p.x, p.y, tx, ty) <= pr + 5 || p.vx * (tx - p.x) + p.vy * (ty - p.y) <= 0;
        if (reached) {
          const R = FIREBALL_SPELL_RADIUS;
          for (const u of state.troops) {
            if (u.hp <= 0 || u.side === p.fromSide) continue;
            if (dist(u.x, u.y, tx, ty) <= R) {
              u.hp -= FIREBALL_SPELL_DMG;
              if (u.hp < 0) u.hp = 0;
            }
          }
          for (const tw of state.towers) {
            if (tw.hp <= 0 || tw.side === p.fromSide) continue;
            if (tw.kind === "king" && !kingAwakeForSide(state.towers, tw.side)) continue;
            const ext = tw.kind === "king" ? 34 : 26;
            if (dist(tw.x, tw.y, tx, ty) <= R + ext) {
              applyTowerDamage(state, tw, FIREBALL_TOWER_DMG);
            }
          }
          for (const bd of state.buildings || []) {
            if (bd.hp <= 0 || bd.side === p.fromSide) continue;
            if (dist(bd.x, bd.y, tx, ty) <= R + bd.radius) {
              applyBuildingDamage(state, bd, FIREBALL_SPELL_DMG);
            }
          }
          state.fireballFx = { cx: tx, cy: ty, until: state.time + 0.52 };
          projectiles.splice(i, 1);
          continue;
        }
        continue;
      }

      if (p.x < -20 - pr || p.x > W + 20 + pr || p.y < -20 - pr || p.y > H + 20 + pr) {
        projectiles.splice(i, 1);
        continue;
      }

      if (p.homing) {
        homingResolved = resolveHomingProjectileTarget(p, state);
        if (!homingResolved) {
          projectiles.splice(i, 1);
          continue;
        }
        if (dist(p.x, p.y, homingResolved.x, homingResolved.y) < homingResolved.hitR + pr + PROJECTILE_HIT_FUDGE) {
          applyProjectileDamageResolved(state, p, homingResolved);
          if (p.projKind === "wizard") {
            const splash = Math.max(1, Math.floor(p.dmg * WIZARD_SPLASH_FRACTION));
            applyWizardSplashAround(
              state,
              homingResolved.x,
              homingResolved.y,
              p.fromSide,
              WIZARD_SPLASH_RADIUS,
              splash,
              homingResolved,
            );
            state.wizardSplashFx.push({
              cx: homingResolved.x,
              cy: homingResolved.y,
              until: state.time + 0.42,
              radius: WIZARD_SPLASH_RADIUS,
              kind: "wizard",
            });
          }
          projectiles.splice(i, 1);
          continue;
        }
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
      if (!hit) {
        for (const bd of state.buildings || []) {
          if (bd.hp <= 0 || bd.side === p.fromSide) continue;
          if (dist(p.x, p.y, bd.x, bd.y) < bd.radius + pr) {
            applyBuildingDamage(state, bd, p.dmg);
            hit = true;
            break;
          }
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
    if (!trainingEnemyAiEnabled(state)) return;
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
    if (card === "fireball") {
      const px = clamp(120 + Math.random() * 560, 24, W - 24);
      const py = clamp(RIVER_BOT + 40 + Math.random() * (H - RIVER_BOT - 80), 24, H - 24);
      state.enemyElixir -= cost;
      applyFireballStrike(px, py, "enemy", state);
      cycleEnemyHand(state, slot);
      return;
    }
    if (card === "zap") {
      const px = clamp(120 + Math.random() * 560, 24, W - 24);
      const py = clamp(RIVER_BOT + 40 + Math.random() * (H - RIVER_BOT - 80), 24, H - 24);
      state.enemyElixir -= cost;
      applyZapStrike(px, py, "enemy", state);
      cycleEnemyHand(state, slot);
      return;
    }

    const x = 260 + Math.random() * 280;
    const y = 52 + Math.random() * 70;
    if (!canDeploy("enemy", x, y)) return;
    state.enemyElixir -= cost;
    queueDeploySpawn(state, "enemy", card, x, y);
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
    if (card === "wizard") return WIZARD_COST;
    if (card === "mega_knight") return MEGA_KNIGHT_COST;
    if (card === "archers") return ARCHERS_COST;
    if (card === "spear_goblins") return SPEAR_GOBLINS_COST;
    if (card === "skarmy") return SKARMY_COST;
    if (card === "arrows") return ARROWS_COST;
    if (card === "fireball") return FIREBALL_COST;
    if (card === "goblin_hut") return GOBLIN_HUT_COST;
    if (card === "zap") return ZAP_COST;
    return SKELETON_COST;
  }

  function cardUiInfo(cardId) {
    const cost = cardCost(cardId);
    if (cardId === "mini_pekka") {
      return { name: "Mini P.E.K.K.A", img: "assets/mini-pekka-w0.svg", cost };
    }
    if (cardId === "knight") return { name: "Knight", img: "assets/knight-w0.svg", cost };
    if (cardId === "wizard")
      return { name: "Wizard", img: "assets/wizard-card.svg", cost };
    if (cardId === "mega_knight")
      return { name: "Mega Knight", img: "assets/mega-knight-card.svg", cost };
    if (cardId === "skeleton") return { name: "Skeletons", img: "assets/skeleton-w0.svg", cost };
    if (cardId === "archers") return { name: "Archers", img: "assets/archer-w0.svg", cost };
    if (cardId === "spear_goblins")
      return { name: "Spear Goblins", img: "assets/spear-goblins-card.svg", cost };
    if (cardId === "skarmy") return { name: "Skarmy", img: "assets/skeleton-w1.svg", cost };
    if (cardId === "arrows") return { name: "Arrows", img: "assets/arrows-card.svg", cost };
    if (cardId === "fireball") return { name: "Fireball", img: "assets/fireball-card.svg", cost };
    if (cardId === "goblin_hut") return { name: "Goblin Hut", img: "assets/goblin-hut-card.svg", cost };
    if (cardId === "zap") return { name: "Zap", img: "assets/zap-card.svg", cost };
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

  function spawnUnitOrBuildingNow(state, side, card, x, y) {
    if (card === "goblin_hut") {
      createGoblinHutBuilding(side, x, y, state);
    } else if (card === "mini_pekka" || card === "knight" || card === "wizard" || card === "mega_knight") {
      createTroop(side, card, x, y, state);
    } else if (card === "archers") {
      createTroop(side, "archers", x, y, state);
    } else if (card === "spear_goblins") {
      createTroop(side, "spear_goblins", x, y, state);
    } else if (card === "skarmy") {
      createTroop(side, "skarmy", x, y, state);
    } else {
      createTroop(side, "skeleton", x, y, state);
    }
  }

  function queueDeploySpawn(state, side, card, x, y) {
    state.pendingDeploys.push({
      at: state.time + DEPLOY_DELAY_SEC,
      side,
      card,
      x,
      y,
    });
  }

  function processPendingDeploys(state) {
    const q = state.pendingDeploys;
    if (!q || !q.length) return;
    for (let i = q.length - 1; i >= 0; i--) {
      const d = q[i];
      if (state.time < d.at) continue;
      spawnUnitOrBuildingNow(state, d.side, d.card, d.x, d.y);
      q.splice(i, 1);
    }
  }

  function spellInArena(x, y) {
    return x >= 12 && x <= W - 12 && y >= 12 && y <= H - 12;
  }

  function kingTowerForSide(state, side) {
    return state.towers.find((t) => t.side === side && t.kind === "king" && t.hp > 0) || null;
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
    for (const bd of state.buildings || []) {
      if (bd.hp <= 0 || bd.side === attackerSide) continue;
      if (dist(bd.x, bd.y, cx, cy) <= R + bd.radius) {
        applyBuildingDamage(state, bd, ARROWS_SPELL_DMG);
      }
    }
    state.arrowFx = { cx, cy, until: state.time + 0.48 };
  }

  function applyFireballStrike(cx, cy, attackerSide, state) {
    const src = kingTowerForSide(state, attackerSide);
    const sx = src ? src.x : cx;
    const sy = src ? src.y + (attackerSide === "enemy" ? 20 : -20) : (attackerSide === "enemy" ? 70 : H - 70);
    const n = norm(cx - sx, cy - sy);
    state.projectiles.push({
      x: sx,
      y: sy,
      vx: n.x * FIREBALL_PROJ_SPEED,
      vy: n.y * FIREBALL_PROJ_SPEED,
      dmg: FIREBALL_SPELL_DMG,
      fromSide: attackerSide,
      hitsTowers: true,
      projKind: "fireball_spell",
      projRadius: 7,
      fireballSpell: true,
      targetX: cx,
      targetY: cy,
    });
  }

  function applyZapStrike(cx, cy, attackerSide, state) {
    const R = ZAP_SPELL_RADIUS;
    const stunT = state.time + ZAP_STUN_DURATION;
    for (const u of state.troops) {
      if (u.hp <= 0 || u.side === attackerSide) continue;
      if (dist(u.x, u.y, cx, cy) <= R) {
        u.hp -= ZAP_SPELL_DMG;
        if (u.hp < 0) u.hp = 0;
        u.stunUntil = Math.max(u.stunUntil || 0, stunT);
        clearTroopAggro(u);
        if (u.type === "mega_knight") resetMegaKnightJump(u);
      }
    }
    for (const tw of state.towers) {
      if (tw.hp <= 0 || tw.side === attackerSide) continue;
      if (tw.kind === "king" && !kingAwakeForSide(state.towers, tw.side)) continue;
      const ext = tw.kind === "king" ? 34 : 26;
      if (dist(tw.x, tw.y, cx, cy) <= R + ext) {
        applyTowerDamage(state, tw, ZAP_SPELL_DMG);
        tw.stunUntil = Math.max(tw.stunUntil || 0, stunT);
        clearTowerAggro(tw);
      }
    }
    for (const bd of state.buildings || []) {
      if (bd.hp <= 0 || bd.side === attackerSide) continue;
      if (dist(bd.x, bd.y, cx, cy) <= R + bd.radius) {
        applyBuildingDamage(state, bd, ZAP_SPELL_DMG);
      }
    }
    state.zapFx = { cx, cy, until: state.time + 0.38 };
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
      card !== "arrows" &&
      card !== "fireball" &&
      card !== "goblin_hut" &&
      card !== "zap" &&
      card !== "spear_goblins" &&
      card !== "wizard" &&
      card !== "mega_knight"
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
    if (card === "fireball") {
      const cx = clamp(x, 16, W - 16);
      const cy = clamp(yMir, 16, H - 16);
      state.enemyElixir = Math.max(0, state.enemyElixir - cost);
      applyFireballStrike(cx, cy, "enemy", state);
      return;
    }
    if (card === "zap") {
      const cx = clamp(x, 16, W - 16);
      const cy = clamp(yMir, 16, H - 16);
      state.enemyElixir = Math.max(0, state.enemyElixir - cost);
      applyZapStrike(cx, cy, "enemy", state);
      return;
    }
    const snapped = snapToDeployable("enemy", x, yMir);
    if (!snapped) return;
    state.enemyElixir = Math.max(0, state.enemyElixir - cost);
    queueDeploySpawn(state, "enemy", card, snapped.x, snapped.y);
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
    const inf = playerInfiniteElixir(state);
    if (!inf && state.playerElixir < cost) return false;

    let px = x;
    let py = y;

    if (card === "arrows") {
      if (!spellInArena(px, py)) {
        px = clamp(x, 16, W - 16);
        py = clamp(y, 16, H - 16);
      }
      if (!inf) state.playerElixir -= cost;
      applyArrowsStrike(px, py, "player", state);
      cyclePlayerHand(state, slot);
      state.selectedSlot = null;
      pushBattleDeploy(card, px, py);
      return true;
    }

    if (card === "fireball") {
      if (!spellInArena(px, py)) {
        px = clamp(x, 16, W - 16);
        py = clamp(y, 16, H - 16);
      }
      if (!inf) state.playerElixir -= cost;
      applyFireballStrike(px, py, "player", state);
      cyclePlayerHand(state, slot);
      state.selectedSlot = null;
      pushBattleDeploy(card, px, py);
      return true;
    }

    if (card === "zap") {
      if (!spellInArena(px, py)) {
        px = clamp(x, 16, W - 16);
        py = clamp(y, 16, H - 16);
      }
      if (!inf) state.playerElixir -= cost;
      applyZapStrike(px, py, "player", state);
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
    if (!inf) state.playerElixir -= cost;
    queueDeploySpawn(state, "player", card, px, py);
    cyclePlayerHand(state, slot);
    state.selectedSlot = null;
    pushBattleDeploy(card, px, py);
    return true;
  }

  function stepSimulation(dt, state) {
    if (state.localEmote && state.time >= state.localEmote.until) state.localEmote = null;
    if (state.remoteEmote && state.time >= state.remoteEmote.until) state.remoteEmote = null;
    if (state.arrowFx && state.time >= state.arrowFx.until) state.arrowFx = null;
    if (state.fireballFx && state.time >= state.fireballFx.until) state.fireballFx = null;
    if (state.zapFx && state.time >= state.zapFx.until) state.zapFx = null;
    if (state.wizardSplashFx && state.wizardSplashFx.length) {
      state.wizardSplashFx = state.wizardSplashFx.filter((w) => state.time < w.until);
    }
    if (state.over) return;
    state.time += dt;
    const now = state.time;

    state.playerElixir = Math.min(MAX_ELIXIR, state.playerElixir + ELIXIR_PER_SEC * dt);
    if (playerInfiniteElixir(state)) state.playerElixir = MAX_ELIXIR;
    state.enemyElixir = Math.min(MAX_ELIXIR, state.enemyElixir + ELIXIR_PER_SEC * dt);
    processPendingDeploys(state);

    if (!battleNet.matchId) {
      enemyBrain(dt, state);
    }

    updateGoblinHutDecay(dt, state);
    updateHutSpawns(dt, state);

    for (const u of state.troops) {
      updateMegaKnight(u, dt, state, now);
    }
    for (const u of state.troops) {
      updateTroopNavAndMove(dt, u, state);
    }
    resolveTroopCollisions(state.troops);
    resolveTroopBuildingCollisions(state.troops, state.buildings);
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
      rangedTroopShoot(state, u, now);
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
    if (u.type === "mega_knight") {
      return {
        img: pickWalkImage(SPRITES.megaKnightWalk, wf),
        s: 40,
        atkMax: 0.34,
        lunge: 9,
        tilt: 0.42,
        slashW: 2.8,
        arcR: 20,
        fallback: "#ca8a04",
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
    if (u.type === "spear_goblin") {
      return {
        img: pickWalkImage(SPRITES.spearGoblinWalk, wf),
        s: 12,
        atkMax: 0.22,
        lunge: 3,
        tilt: 0.2,
        slashW: 1.2,
        arcR: 10,
        fallback: "#16a34a",
      };
    }
    if (u.type === "wizard") {
      return {
        img: pickWalkImage(SPRITES.wizardWalk, wf),
        s: 22,
        atkMax: 0.22,
        lunge: 3,
        tilt: 0.2,
        slashW: 1.2,
        arcR: 10,
        fallback: "#a855f7",
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
    let lx = u.faceX * lunge;
    let ly = u.faceY * lunge;
    const tilt = swing * (u.side === "player" ? -1 : 1) * vis.tilt;
    let drawY = u.y;
    if (u.type === "mega_knight" && u.mkJumpPhase === 1 && u.mkWindupT > 0) {
      const w = clamp(1 - u.mkWindupT / MEGA_KNIGHT_WINDUP, 0, 1);
      // Wind-up: stand still and compress slightly before launch.
      drawY = u.y + 2.5 * w;
    } else if (u.type === "mega_knight" && u.mkJumpPhase === 2 && u.mkJumpT > 0) {
      const jt = clamp(1 - u.mkJumpT / MEGA_KNIGHT_JUMP_DURATION, 0, 1);
      const h = (1 - jt) * (1 - jt) * 128;
      drawY = u.y - h;
      const sh = 1 - (h / 90) * 0.65;
      ctx.save();
      ctx.globalAlpha = 0.32 * sh;
      ctx.fillStyle = "rgba(15,23,42,0.75)";
      ctx.beginPath();
      ctx.ellipse(u.x, u.y + u.radius * 0.65, 16 + 12 * sh, 6 + 2 * sh, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // Fast-fall streaks.
      ctx.save();
      ctx.globalAlpha = 0.22 + (1 - jt) * 0.28;
      ctx.strokeStyle = "rgba(226,232,240,0.45)";
      ctx.lineWidth = 1.2;
      for (let i = -1; i <= 1; i++) {
        const ox = i * 4.5;
        ctx.beginPath();
        ctx.moveTo(u.x + ox, drawY - 18);
        ctx.lineTo(u.x + ox, drawY + 8);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.translate(u.x + lx, drawY + ly);
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
          : u.type === "mega_knight"
            ? "rgba(251,191,36,0.95)"
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
        u.type === "mini_pekka"
          ? 34
          : u.type === "knight"
            ? 30
            : u.type === "mega_knight"
              ? 38
            : u.type === "archer" || u.type === "spear_goblin"
              ? 16
              : u.type === "wizard"
                ? 28
                : 18;
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
      } else if (kind === "spear") {
        ctx.fillStyle = "#86efac";
        ctx.strokeStyle = "#14532d";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(r * 2.2, 0);
        ctx.lineTo(-r * 0.6, r * 0.75);
        ctx.lineTo(-r * 0.15, 0);
        ctx.lineTo(-r * 0.6, -r * 0.75);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (kind === "wizard") {
        ctx.shadowColor = "rgba(168,85,247,0.95)";
        ctx.shadowBlur = 10;
        ctx.fillStyle = "#c084fc";
        ctx.strokeStyle = "#581c87";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#fae8ff";
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === "fireball_spell") {
        ctx.shadowColor = "rgba(251,146,60,0.95)";
        ctx.shadowBlur = 14;
        ctx.fillStyle = "#fb923c";
        ctx.strokeStyle = "#7c2d12";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#fde68a";
        ctx.beginPath();
        ctx.arc(r * 0.25, -r * 0.1, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(254,215,170,0.7)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-r * 1.9, 0);
        ctx.lineTo(-r * 3.2, 0);
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

  function drawFireballSpellFx(ctx, state) {
    const f = state.fireballFx;
    if (!f || state.time > f.until) return;
    const cx = f.cx;
    const cy = f.cy;
    const t = clamp((f.until - state.time) / 0.52, 0, 1);
    const pulse = FIREBALL_SPELL_RADIUS * (0.52 + 0.48 * (1 - t));
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.45 * t;
    ctx.strokeStyle = "#fb923c";
    ctx.lineWidth = 3;
    ctx.setLineDash([9, 6]);
    ctx.beginPath();
    ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(254,215,170,0.9)";
    ctx.lineWidth = 1.8;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + state.time * 4.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (pulse * 0.2), cy + Math.sin(a) * (pulse * 0.2));
      ctx.lineTo(cx + Math.cos(a) * pulse, cy + Math.sin(a) * pulse);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(251,146,60,0.25)";
    ctx.beginPath();
    ctx.arc(cx, cy, pulse * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawWizardSplashFx(ctx, state) {
    const list = state.wizardSplashFx;
    if (!list || !list.length) return;
    const dur = 0.42;
    for (const f of list) {
      if (state.time > f.until) continue;
      const cx = f.cx;
      const cy = f.cy;
      const rad = f.radius;
      const t = clamp((f.until - state.time) / dur, 0, 1);
      const pulse = rad * (0.62 + 0.38 * (1 - t));
      const kind = f.kind || "wizard";
      const baseStroke =
        kind === "mega_jump" ? "#f59e0b" : kind === "mega_ground" ? "#eab308" : "#9333ea";
      const spokesStroke =
        kind === "mega_jump"
          ? "rgba(253,224,71,0.94)"
          : kind === "mega_ground"
            ? "rgba(254,240,138,0.9)"
            : "rgba(216,180,254,0.92)";
      const fillCol =
        kind === "mega_jump"
          ? "rgba(245,158,11,0.22)"
          : kind === "mega_ground"
            ? "rgba(234,179,8,0.2)"
            : "rgba(168,85,247,0.2)";
      ctx.save();
      ctx.globalAlpha = 0.3 + 0.4 * t;
      ctx.strokeStyle = baseStroke;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = spokesStroke;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + state.time * 5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (pulse * 0.18), cy + Math.sin(a) * (pulse * 0.18));
        ctx.lineTo(cx + Math.cos(a) * pulse, cy + Math.sin(a) * pulse);
        ctx.stroke();
      }
      ctx.fillStyle = fillCol;
      ctx.beginPath();
      ctx.arc(cx, cy, pulse * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawZapSpellFx(ctx, state) {
    const f = state.zapFx;
    if (!f || state.time > f.until) return;
    const cx = f.cx;
    const cy = f.cy;
    const t = clamp((f.until - state.time) / 0.38, 0, 1);
    const pulse = ZAP_SPELL_RADIUS * (0.5 + 0.5 * (1 - t));
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.45 * t;
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(224,242,254,0.9)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + state.time * 6;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (pulse * 0.2), cy + Math.sin(a) * (pulse * 0.2));
      ctx.lineTo(cx + Math.cos(a) * pulse, cy + Math.sin(a) * pulse);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(186,230,253,0.35)";
    ctx.beginPath();
    ctx.arc(cx, cy, pulse * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBuilding(ctx, b, state) {
    if (b.kind !== "goblin_hut") return;
    const w = 36;
    const h = 30;
    const px = b.x - w / 2;
    const py = b.y - h / 2;
    ctx.save();
    if (b.hp > 0 && state) {
      ctx.save();
      const active = foeInGoblinHutRange(b, state);
      const pulse = 0.55 + 0.08 * Math.sin((state.time || 0) * (active ? 5 : 2.2));
      ctx.globalAlpha = active ? 0.22 * pulse : 0.12 * pulse;
      ctx.fillStyle = active ? "rgba(250,204,21,0.35)" : "rgba(148,163,184,0.25)";
      ctx.beginPath();
      ctx.arc(b.x, b.y, HUT_TRIGGER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = active ? 0.55 + 0.15 * pulse : 0.32;
      ctx.strokeStyle = active ? "rgba(250,204,21,0.85)" : "rgba(148,163,184,0.65)";
      ctx.lineWidth = active ? 2.2 : 1.5;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.arc(b.x, b.y, HUT_TRIGGER_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    if (b.hp <= 0) ctx.globalAlpha = 0.28;
    ctx.fillStyle = "#78350f";
    ctx.strokeStyle = "#451a03";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(b.x, py - 10);
    ctx.lineTo(px + w + 2, py + 2);
    ctx.lineTo(px - 2, py + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#92400e";
    ctx.fillRect(px, py, w, h);
    ctx.strokeRect(px, py, w, h);
    ctx.fillStyle = "#1c1917";
    ctx.fillRect(b.x - 6, py + h - 14, 12, 14);
    ctx.fillStyle = "rgba(254,243,199,0.35)";
    ctx.fillRect(px + 6, py + 6, 8, 6);
    ctx.restore();
    ctx.globalAlpha = 1;
    const pct = Math.max(0, b.hp / b.maxHp);
    const barY = b.side === "enemy" ? py + h + 6 : py - 12;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(px, barY, w, 5);
    ctx.fillStyle = pct > 0.35 ? "#4ade80" : "#f87171";
    ctx.fillRect(px, barY, w * pct, 5);
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
    /** @type {{ k: string; y: number; b?: object; u?: object }[]} */
    const layers = [];
    for (const b of state.buildings || []) {
      if (b.hp > 0) layers.push({ k: "b", y: b.y, b });
    }
    const drawTroops = state.troops.filter((u) => u.hp > 0);
    for (const u of drawTroops) {
      layers.push({ k: "u", y: u.y, u });
    }
    layers.sort((a, c) => a.y - c.y);
    for (const L of layers) {
      if (L.k === "b" && L.b) drawBuilding(ctx, L.b, state);
      else if (L.k === "u" && L.u) drawUnit(ctx, L.u, state);
    }
    drawArrowSpellFx(ctx, state);
    drawFireballSpellFx(ctx, state);
    drawZapSpellFx(ctx, state);
    drawProjectiles(ctx, state.projectiles);
    drawWizardSplashFx(ctx, state);

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
      `<strong>Deck</strong>: 8 <strong>unique</strong> cards — 4 in hand, 4 in queue (no duplicates in the rotation). ` +
      `<strong>Goblin Hut</strong> (${GOBLIN_HUT_COST}): HP decays over <strong>~${GOBLIN_HUT_LIFETIME_SEC}s</strong> like a timed building; dashed <strong>${HUT_TRIGGER_RADIUS}px</strong> ring; with a foe inside, one Spear Goblin every <strong>${HUT_SPAWN_INTERVAL}s</strong> (cap ${MAX_SPEAR_PER_HUT}). ` +
      `<strong>Spear Goblins</strong> (${SPEAR_GOBLINS_COST}): spawns <strong>3</strong> ranged spear goblins. ` +
      `<strong>Arrows</strong> (${ARROWS_COST}) / <strong>Fireball</strong> (${FIREBALL_COST}) / <strong>Zap</strong> (${ZAP_COST}): area damage, cast <strong>anywhere</strong>.<br/>`;
    const atkLine =
      `<strong>Attack speed</strong> (time between hits · hits/sec): ` +
      `Mini <strong>${ATTACK_INTERVAL_MINI_PEKKA}s</strong> (${aps(ATTACK_INTERVAL_MINI_PEKKA)}/s) · ` +
      `Knight <strong>${ATTACK_INTERVAL_KNIGHT}s</strong> (${aps(ATTACK_INTERVAL_KNIGHT)}/s) · ` +
      `Skeletons <strong>${ATTACK_INTERVAL_SKELETON}s</strong> (${aps(ATTACK_INTERVAL_SKELETON)}/s) · ` +
      `Skarmy <strong>${ATTACK_INTERVAL_SKARMY}s</strong> (${aps(ATTACK_INTERVAL_SKARMY)}/s) · ` +
      `Archers <strong>${ATTACK_INTERVAL_ARCHER}s</strong> (${aps(ATTACK_INTERVAL_ARCHER)}/s) · ` +
      `Spear Goblin <strong>${SPEAR_GOBLIN_INTERVAL}s</strong> (${aps(SPEAR_GOBLIN_INTERVAL)}/s) · ` +
      `Wizard <strong>${ATTACK_INTERVAL_WIZARD}s</strong> (${aps(ATTACK_INTERVAL_WIZARD)}/s, splash) · ` +
      `Mega Knight <strong>${ATTACK_INTERVAL_MEGA_KNIGHT}s</strong> (${aps(ATTACK_INTERVAL_MEGA_KNIGHT)}/s, jump slam).`;
    return (
      `${modeLine}` +
      `Crowns: you <strong>${state.crownsPlayer}</strong> / 3 · enemy <strong>${state.crownsEnemy}</strong> / 3<br/>` +
      `King towers: yours <strong>${pk ? "awake" : "dormant"}</strong>, enemy ` +
      `<strong>${ek ? "awake" : "dormant"}</strong>. After the first hit, troops/towers <strong>stay on that target</strong> until it dies, <strong>leaves range</strong>, or <strong>Zap</strong> stuns (shots still home). Build your 8 in the main menu. ` +
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
      const inf = playerInfiniteElixir(state);
      const can = (inf || state.playerElixir >= ui.cost) && !state.over;
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
    } else if (selCard === "fireball") {
      els.hint.textContent = "Tap anywhere on the arena to cast Fireball (small radius, heavy damage).";
    } else if (selCard === "zap") {
      els.hint.textContent = "Tap anywhere on the arena to cast Zap (small area damage).";
    } else if (selCard === "goblin_hut") {
      els.hint.textContent =
        `Place on your grass. HP slowly drains (~${GOBLIN_HUT_LIFETIME_SEC}s lifetime). Ring = spawn range: one Spear Goblin / 2s while an enemy is inside.`;
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
      if (!playerInfiniteElixir(state) && state.playerElixir < cardCost(cardId)) return;
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

    const testingPanel = document.getElementById("testing-panel");
    const testingEnemySpawns = document.getElementById("testing-enemy-spawns");
    const testingInfiniteElixir = document.getElementById("testing-infinite-elixir");
    const testingKillAll = document.getElementById("testing-kill-all");

    function syncTestingUi() {
      const st = stateRef.current;
      if (!testingPanel || !testingEnemySpawns || !testingInfiniteElixir) return;
      if (!st || st.matchMode !== "training") {
        testingPanel.hidden = true;
        return;
      }
      testingPanel.hidden = false;
      testingEnemySpawns.checked = st.testing.enemySpawns !== false;
      testingInfiniteElixir.checked = !!st.testing.infiniteElixir;
    }

    if (testingPanel && testingEnemySpawns && testingInfiniteElixir && testingKillAll) {
      testingEnemySpawns.addEventListener("change", () => {
        const st = stateRef.current;
        if (st && st.testing) st.testing.enemySpawns = testingEnemySpawns.checked;
      });
      testingInfiniteElixir.addEventListener("change", () => {
        const st = stateRef.current;
        if (st && st.testing) st.testing.infiniteElixir = testingInfiniteElixir.checked;
      });
      testingKillAll.addEventListener("click", () => {
        const st = stateRef.current;
        if (!st || st.matchMode !== "training" || st.over) return;
        for (const u of st.troops) u.hp = 0;
        st.projectiles.length = 0;
        st.pendingDeploys.length = 0;
        st.fireballFx = null;
        st.wizardSplashFx.length = 0;
      });
    }

    btn.addEventListener("click", () => {
      if (stateRef.current) {
        const prevMode = stateRef.current.matchMode;
        stateRef.current = createInitialState();
        stateRef.current.matchMode = prevMode;
        syncTestingUi();
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

    testingPanelSync.fn = syncTestingUi;
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
    runtimePlayerDeck =
      opts && opts.deck && validateDeckForGame(opts.deck) ? opts.deck.slice() : null;
    const st = createInitialState();
    st.matchMode = mode;
    st.testing.enemySpawns = true;
    st.testing.infiniteElixir = false;
    stateRef.current = st;
    gameRunning = true;
    lastFrameT = performance.now();
    const emoteBar = document.getElementById("emote-bar");
    if (emoteBar) {
      emoteBar.style.display = "flex";
    }
    testingPanelSync.fn?.();
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    gameRunning = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    stateRef.current = null;
    hudModeLine = "";
    tearDownBattleNet();
    testingPanelSync.fn?.();
    const emoteBar = document.getElementById("emote-bar");
    if (emoteBar) emoteBar.style.display = "none";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountGameDom);
  } else {
    mountGameDom();
  }

  window.NightArena = {
    start,
    stop,
    mount: mountGameDom,
    CARD_POOL: ALL_CARD_IDS.slice(),
    validateDeck: validateDeckForGame,
    getDefaultDeck: () => DEFAULT_DECK_EIGHT.slice(),
    getCardPreview: (cardId) => cardUiInfo(String(cardId)),
  };
})();
