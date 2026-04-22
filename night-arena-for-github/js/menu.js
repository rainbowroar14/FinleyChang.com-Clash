/**
 * Main menu: Training vs Battle (Firestore queue).
 */
(function () {
  "use strict";

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
    if (typeof firebase !== "undefined" && firebase.apps.length) return true;
    try {
      await loadScript("js/firebase-config.js");
    } catch {
      return false;
    }
    return typeof firebase !== "undefined" && firebase.apps.length > 0;
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
        "Add Firebase: copy js/firebase-config.example.js to js/firebase-config.js and paste your web app keys.";
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

  showScreen("menu");
})();
