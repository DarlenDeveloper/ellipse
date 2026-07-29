/* global firebase */
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCByAfWi5cNlmBiuBNBZa-lNBW0zSpV2rg",
  authDomain: "ellipse-desk.firebaseapp.com",
  projectId: "ellipse-desk",
  storageBucket: "ellipse-desk.firebasestorage.app",
  messagingSenderId: "344223107303",
  appId: "1:344223107303:web:fdf5203112592c83b43a42",
});

// Notification payloads are displayed by Firebase Messaging itself. The
// backend supplies fcmOptions.link so clicking an alert opens the right page.
firebase.messaging();
