/**
 * Main menu: Training vs Battle (Firestore queue).
 */
(function () {
  "use strict";

  function safeStopArena() {
    if (window.NightArena && typeof window.NightArena.stop === "function") {
      window.NightArena.stop();
    }
  }

  function safeStartArena(opts) {
    if (!window.NightArena || typeof window.NightArena.start !== "function") {
      window.alert(
        "The game script didn’t load. Open DevTools (F12) → Console / Network, look for js/game.js (red = 404 or blocked). Then hard-refresh (Ctrl+Shift+R).",
      );
      return false;
    }
    window.NightArena.start(opts);
    return true;
  }

  /** Same object as index.html / js/firebase-config.js — duplicated so Battle works if those didn’t run (e.g. old deploy, 404). */
  const FIREBASE_WEB_CONFIG = {
    apiKey: "AIzaSyCzaBxqEjoyGJshtCV_ZwiAwFHF4BgFzik",
    authDomain: "clash-b15e4.firebaseapp.com",
    projectId: "clash-b15e4",
    storageBucket: "clash-b15e4.firebasestorage.app",
    messagingSenderId: "717206514659",
    appId: "1:717206514659:web:a4e8b42cc046597c434ed6",
    measurementId: "G-T4MQ0P1Q0J",
  };

  function tryInitializeFirebase() {
    if (typeof firebase === "undefined") return false;
    if (firebase.apps.length > 0) return true;
    try {
      firebase.initializeApp(FIREBASE_WEB_CONFIG);
      return true;
    } catch {
      return false;
    }
  }

  /** @param {string} src */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve(undefined);
      s.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(s);
    });
  }

  async function ensureFirebaseReady() {
    if (tryInitializeFirebase()) return true;
    try {
      await loadScript("js/firebase-config.js");
    } catch {
      /* optional file */
    }
    if (tryInitializeFirebase()) return true;
    return false;
  }

  function $(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error("Missing #" + id);
    return el;
  }

  /** @type {(() => Promise<void>) | null} */
  let cancelQueue = null;

  const DECK_STORAGE_KEY = "na_deck_v1";

  /** @param {typeof window.NightArena} na */
  function loadSavedDeck(na) {
    if (!na || typeof na.getDefaultDeck !== "function") return null;
    try {
      const raw = localStorage.getItem(DECK_STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (na.validateDeck(d)) return /** @type {string[]} */ (d.slice());
      }
    } catch {
      /* ignore */
    }
    return na.getDefaultDeck();
  }

  function initDeckBuilder() {
    const na = window.NightArena;
    if (!na || typeof na.getCardPreview !== "function") return;

    const row = document.getElementById("deck-slots-row");
    const pool = document.getElementById("deck-pool-grid");
    const btnDef = document.getElementById("btn-deck-default");
    if (!row || !pool || !btnDef) return;

    /** @type {(string | null)[]} */
    let deckSlots = loadSavedDeck(na).slice();
    while (deckSlots.length < 8) deckSlots.push(null);
    if (deckSlots.length > 8) deckSlots = deckSlots.slice(0, 8);

    function saveIfComplete() {
      if (deckSlots.every(Boolean) && na.validateDeck(/** @type {string[]} */ (deckSlots))) {
        localStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(deckSlots));
      }
    }

    function renderDeckUi() {
      row.innerHTML = "";
      for (let i = 0; i < 8; i++) {
        const id = deckSlots[i];
        const b = document.createElement("button");
        b.type = "button";
        b.className = "deck-slot-btn" + (id ? " is-filled" : "");
        if (id) {
          const ui = na.getCardPreview(id);
          b.innerHTML = `<img src="${ui.img}" alt="" width="40" height="40" /><span class="deck-slot-cost">${ui.cost}</span>`;
          b.title = `${ui.name} — remove`;
          b.addEventListener("click", () => {
            deckSlots[i] = null;
            renderDeckUi();
            saveIfComplete();
          });
        } else {
          b.innerHTML = "<span>—</span>";
          b.title = "Empty slot";
          b.disabled = true;
        }
        row.appendChild(b);
      }

      pool.innerHTML = "";
      const allFull = deckSlots.every((x) => x);
      for (const id of na.CARD_POOL) {
        const used = deckSlots.includes(id);
        const ui = na.getCardPreview(id);
        const b = document.createElement("button");
        b.type = "button";
        b.className = "deck-pool-card";
        b.innerHTML = `<img src="${ui.img}" alt="" width="36" height="36" /><span>${ui.name}</span><span class="cost">${ui.cost}</span>`;
        b.disabled = used || allFull;
        b.addEventListener("click", () => {
          const empty = deckSlots.indexOf(null);
          if (empty === -1) return;
          deckSlots[empty] = id;
          renderDeckUi();
          saveIfComplete();
        });
        pool.appendChild(b);
      }
    }

    btnDef.addEventListener("click", () => {
      deckSlots = na.getDefaultDeck().slice();
      renderDeckUi();
      saveIfComplete();
    });

    renderDeckUi();
  }

  function wireMenu() {
    const screenMenu = $("screen-menu");
    const screenQueue = $("screen-queue");
    const screenGame = $("screen-game");
    const queueStatus = $("queue-status");
    const btnTraining = $("btn-training");
    const btnBattle = $("btn-battle");
    const btnQueueCancel = $("btn-queue-cancel");
    const btnBackMenu = $("btn-back-menu");

    function showScreenInner(which) {
      screenMenu.classList.toggle("is-hidden", which !== "menu");
      screenQueue.classList.toggle("is-hidden", which !== "queue");
      screenGame.classList.toggle("is-hidden", which !== "game");
    }

    function goMenuInner() {
      safeStopArena();
      if (cancelQueue) {
        cancelQueue();
        cancelQueue = null;
      }
      showScreenInner("menu");
    }

    btnTraining.addEventListener("click", () => {
      if (cancelQueue) {
        cancelQueue();
        cancelQueue = null;
      }
      showScreenInner("game");
      const na = window.NightArena;
      const deck = na && loadSavedDeck(na);
      safeStartArena({ mode: "training", deck: deck || undefined });
    });

    btnBattle.addEventListener("click", async () => {
      const ok = await ensureFirebaseReady();
      if (!ok) {
        queueStatus.textContent =
          typeof firebase === "undefined"
            ? "Firebase scripts blocked or failed to load. Turn off strict ad/shield blocking for this site, check network, then refresh."
            : "Firebase didn’t start. Push the latest js/menu.js + index.html from the project, hard-refresh. (Not a Firestore rules issue — rules only affect data after connect.)";
        showScreenInner("queue");
        return;
      }
      showScreenInner("queue");
      queueStatus.textContent = "Joining queue…";
      try {
        cancelQueue = await window.NightArenaMatchmaking.joinBattleQueue(
          (info) => {
            showScreenInner("game");
            const na = window.NightArena;
            const deck = na && loadSavedDeck(na);
            safeStartArena({
              mode: "battle",
              matchId: info.matchId,
              guestId: info.guestId,
              deck: deck || undefined,
            });
            if (cancelQueue) {
              void cancelQueue();
              cancelQueue = null;
            }
          },
          (status) => {
            queueStatus.textContent = status;
          },
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        queueStatus.textContent = msg;
      }
    });

    btnQueueCancel.addEventListener("click", () => {
      goMenuInner();
    });

    btnBackMenu.addEventListener("click", () => {
      goMenuInner();
    });

    tryInitializeFirebase();
    initDeckBuilder();
    showScreenInner("menu");
  }

  function boot() {
    try {
      wireMenu();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.alert(
        "Menu failed to start: " + msg + "\n\nIf it says Missing #…, your index.html is incomplete. Compare to the repo.",
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
