/**
 * Copy this file to firebase-config.js (same folder) and replace the placeholder
 * object with your Firebase project's web app config (Console → Project settings → Your apps).
 *
 * firebase-config.js is gitignored so keys stay local.
 *
 * Firebase is a platform: Firestore stores and syncs documents (queue + match metadata here).
 * You can add Auth, Cloud Functions, etc. later — not limited to "just storage."
 */
(function () {
  "use strict";
  if (typeof firebase === "undefined") return;

  firebase.initializeApp({
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:xxxxxxxx",
  });
})();
