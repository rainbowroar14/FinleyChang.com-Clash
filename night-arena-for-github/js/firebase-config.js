/**
 * Firebase Web config for this project.
 * Committed so GitHub Pages can load it. Web API keys are public; lock down data with Firestore rules.
 */
(function () {
  "use strict";
  if (typeof firebase === "undefined") return;

  firebase.initializeApp({
    apiKey: "AIzaSyCzaBxqEjoyGJshtCV_ZwiAwFHF4BgFzik",
    authDomain: "clash-b15e4.firebaseapp.com",
    projectId: "clash-b15e4",
    storageBucket: "clash-b15e4.firebasestorage.app",
    messagingSenderId: "717206514659",
    appId: "1:717206514659:web:a4e8b42cc046597c434ed6",
    measurementId: "G-T4MQ0P1Q0J",
  });
})();
