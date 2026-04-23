/**
 * Optional: copy to firebase-config.js for local dev. Production (GitHub Pages) also inlines
 * the same config in index.html so Battle works with a single deployed file.
 *
 * Firebase Console → Project settings → Your apps → Web app config.
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
