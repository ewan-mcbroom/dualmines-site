/* ============================================================
   FIREBASE SETTINGS
   Paste the config from your Firebase project here (see SETUP-APPLICATIONS.md).
   While this is left as null, the Apply page and admin panel run in DEMO MODE:
   everything works, but it's only saved in your own browser.
   ============================================================ */

export const firebaseConfig = {
  apiKey: "AIzaSyC8frjWJKyOXSAVT0gGo2m-AkZTYKfW79w",
  authDomain: "dualmines-3d1fb.firebaseapp.com",
  projectId: "dualmines-3d1fb",
  storageBucket: "dualmines-3d1fb.firebasestorage.app",
  messagingSenderId: "957942462979",
  appId: "1:957942462979:web:e9fa89538af7a90d74ac36",
  measurementId: "G-SKVDCPT38N"
};

/* Example of what it looks like once filled in:
export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "dualmines-xxxx.firebaseapp.com",
  projectId: "dualmines-xxxx",
  storageBucket: "dualmines-xxxx.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};
*/

/* Admin usernames are turned into emails ending in this domain.
   e.g. username "ewan" logs in as ewan@dualmines.net in Firebase. */
export const ADMIN_EMAIL_DOMAIN = "dualmines.net";
export const OWNER_USERNAMES = ["zxppez"];
export const DISCORD_AUTH_URL = "https://dualmines-auth.ewanmcbroom3.workers.dev";
