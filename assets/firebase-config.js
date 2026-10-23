/* ============================================================
   FIREBASE SETTINGS for www.dualmines.net
   Fill in the two lines marked  <-- FILL IN  and save.
   ============================================================ */

export const firebaseConfig = {
  apiKey: "AIzaSyC8frjWJKyOXSAVT0gGo2m-AkZTYKfW79w", // <-- FILL IN: Firebase → cog → Project settings → General → Your apps → apiKey
  authDomain: "dualmines-3d1fb.firebaseapp.com",
  projectId: "dualmines-3d1fb",
  storageBucket: "dualmines-3d1fb.firebasestorage.app",
  messagingSenderId: "957942462979",
  appId: "1:957942462979:web:e9fa89538af7a90d74ac36",
  measurementId: "G-SKVDCPT38N"
};

/* Admin usernames are turned into emails ending in this domain.
   e.g. username "zxppez" logs in as zxppez@dualmines.net in Firebase. */
export const ADMIN_EMAIL_DOMAIN = "dualmines.net";

/* Owner usernames. Owners can add and remove other admins, and see the Logs tab.
   Keep this matching the owner list at the top of firestore.rules. */
export const OWNER_USERNAMES = ["zxppez"];

/* Your Cloudflare Worker address (Discord login, online players, appeals).
   No slash on the end, and no /callback. */
export const DISCORD_AUTH_URL = "https://dualmines-auth.ewanmcbroom3.workers.dev"; // <-- FILL IN
