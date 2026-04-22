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
  const btnTraining =
