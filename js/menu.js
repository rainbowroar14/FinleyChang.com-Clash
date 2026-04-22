/**
 * Main menu: Training vs Battle (Firestore queue).
 */
(function () {
  "use strict";

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

  const screenMenu = $("screen-menu");
  const screenQueue = $("screen-queue");
  const screenGame = $("screen-game");
  const queueStatus = $("queue-status");
  const btnTraining = $("btn-training");
  const btnBattle = $("btn-battle");
  const btnQueueCancel = $("btn-queue-cancel");
  const btnBackMenu = $("btn-back-menu");

  /** @type {(() => Promise<void>) | null} */
  let cancelQueue = null;

  function showScreen(which) {
    screenMenu.classList.toggle("is-hidden", which !== "menu");
    screenQueue.classList.toggle("is-hidden", which !== "queue");
    screenGame.classList.toggle("is-hidden", which !== "game");
  }

  function goMenu() {
    window.NightArena.stop();
    if (cancelQueue) {
      cancelQueue();
      cancelQueue = null;
    }
    showScreen("menu");
  }

  btnTraining.addEventListener("click", () => {
    if (cancelQueue) {
      cancelQueue();
      cancelQueue = null;
    }
    showScreen("game");
    window.NightArena.start({ mode: "training" });
  });

  btnBattle.addEventListener("click", async () => {
    const ok = await ensureFirebaseReady();
    if (!ok) {
      queueStatus.textContent =
        typeof firebase === "undefined"
          ? "Firebase scripts blocked or failed to load. Turn off strict ad/shield blocking for this site, check network, then refresh."
          : "Firebase didn’t start. Push the latest js/menu.js + index.html from the project, hard-refresh. (Not a Firestore rules issue — rules only affect data after connect.)";
      showScreen("queue");
      return;
    }
    showScreen("queue");
    queueStatus.textContent = "Joining queue…";
    try {
      cancelQueue = await window.NightArenaMatchmaking.joinBattleQueue(
        (info) => {
          showScreen("game");
          window.NightArena.start({
            mode: "battle",
            matchId: info.matchId,
            guestId: info.guestId,
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
    goMenu();
  });

  btnBackMenu.addEventListener("click", () => {
    goMenu();
  });

  // Init as soon as this script runs (after Firebase SDK in <head>) so Battle never depends on an old cached click path.
  tryInitializeFirebase();

  showScreen("menu");
})();
