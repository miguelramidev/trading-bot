importScripts("https://www.gstatic.com/firebasejs/10.13.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.1/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "AIzaSyCDVZ01U0pvxoYGNUwdwY_18uG7RY8UokU",
  authDomain: "macroquant-4f43d.firebaseapp.com",
  projectId: "macroquant-4f43d",
  storageBucket: "macroquant-4f43d.firebasestorage.app",
  messagingSenderId: "552492159103",
  appId: "1:552492159103:web:fcf216a75f28321c75af4a"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Manejo en background para Service Worker
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title || "MacroQuant Alerta";
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icons/Icon-192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
