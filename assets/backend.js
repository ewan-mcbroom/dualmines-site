/* Storage + login for staff applications.
   Uses Firebase when firebase-config.js is filled in, otherwise a demo that saves in this browser. */
import * as CFG from "./firebase-config.js";

const firebaseConfig = CFG.firebaseConfig;
const ADMIN_EMAIL_DOMAIN = CFG.ADMIN_EMAIL_DOMAIN || "dualmines.net";
const OWNERS = (CFG.OWNER_USERNAMES || []).map((u) => u.toLowerCase());
export const DISCORD_AUTH_URL = String(CFG.DISCORD_AUTH_URL || "").replace(/\/$/, "");
export const USERNAME_RULE = /^[a-z0-9_.-]{3,20}$/;

export const QUESTION_TYPES = {
  short: "Short answer",
  paragraph: "Paragraph",
  number: "Number",
  dropdown: "Dropdown",
  choice: "Multiple choice (pick one)",
  checkboxes: "Checkboxes (pick any)",
  yesno: "Yes / No",
};
export const HAS_OPTIONS = ["dropdown", "choice", "checkboxes"];

export const DEFAULT_ROLES = [
  { id: "staff", name: "Staff", open: true, blurb: "Help players, moderate chat and keep the box fair." },
  { id: "builder", name: "Builder", open: true, blurb: "Design and build arenas, spawns and maps." },
  { id: "developer", name: "Developer", open: true, blurb: "Write plugins and help run the server's tech." },
];

export const DEFAULT_FORM = {
  open: true,
  roles: DEFAULT_ROLES,
  intro: "Want to help run Dualmines? Fill in the form below. We read every application and will get back to you on Discord.",
  questions: [
    { id: "mc", label: "Minecraft username", type: "short", required: true, help: "", v: { format: "minecraft" } },
    { id: "age", label: "How old are you?", type: "number", required: true, help: "", v: { min: 10, max: 99, whole: true } },
    { id: "tz", label: "What is your timezone?", type: "dropdown", required: true, help: "", options: ["UK (GMT/BST)", "Europe (CET)", "North America East", "North America West", "Asia / Oceania", "Other"] },
    { id: "hours", label: "How many hours a week can you be active?", type: "number", required: true, help: "", v: { min: 1, max: 168, whole: true } },
    { id: "why", label: "Why do you want to join the Dualmines staff team?", type: "paragraph", required: true, help: "Tell us about yourself. The more detail the better.", v: { min: 50 } },
    { id: "exp", label: "Do you have any previous staff experience?", type: "paragraph", required: false, help: "Other servers, Discord communities, etc." },
    { id: "portfolio", label: "Link to your builds or portfolio", type: "short", required: true, help: "Imgur album, Planet Minecraft, YouTube, etc.", roles: ["builder"], v: { format: "url" } },
    { id: "code", label: "What languages and tools have you used? Link any projects (e.g. GitHub).", type: "paragraph", required: true, help: "", roles: ["developer"], v: { min: 30 } },
    { id: "rules", label: "Have you read and agree to follow the server rules?", type: "yesno", required: true, help: "" },
  ],
};

/* ---------------- answer validation ---------------- */
export const TEXT_LIMITS = { short: 200, paragraph: 3000 };
export const FORMATS = {
  "": { label: "Anything" },
  minecraft: { label: "Minecraft username", test: (v) => /^[A-Za-z0-9_]{3,16}$/.test(v), msg: "That isn't a valid Minecraft username (3–16 letters, numbers or underscores)." },
  url: { label: "Link (https://…)", test: (v) => /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]{2,}$/i.test(v), msg: "Enter a full link starting with https://" },
  email: { label: "Email address", test: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), msg: "Enter a valid email address." },
  letters: { label: "Letters and spaces only", test: (v) => /^[\p{L} '-]+$/u.test(v), msg: "Use letters and spaces only." },
};
const num = (x) => (x === "" || x === null || x === undefined || isNaN(Number(x)) ? null : Number(x));

/* Returns an error message, or "" if the answer is fine. value is a string (or an array for checkboxes). */
export function checkAnswer(q, value) {
  const v = q.v || {};
  const min = num(v.min), max = num(v.max);
  const empty = Array.isArray(value) ? !value.length : !String(value || "").trim();
  if (empty) return q.required ? (q.type === "checkboxes" ? "Pick at least one option." : "This question is required.") : "";

  if (q.type === "checkboxes") {
    if (min !== null && value.length < min) return `Pick at least ${min} option${min === 1 ? "" : "s"}.`;
    if (max !== null && value.length > max) return `Pick no more than ${max} option${max === 1 ? "" : "s"}.`;
    return "";
  }
  if (q.type === "number") {
    const n = Number(String(value).trim());
    if (!isFinite(n)) return "Please enter a number.";
    if (v.whole && !Number.isInteger(n)) return "Please enter a whole number.";
    if (min !== null && n < min) return `The number must be ${min} or more.`;
    if (max !== null && n > max) return `The number must be ${max} or less.`;
    return "";
  }
  if (q.type === "short" || q.type === "paragraph") {
    const t = String(value).trim();
    const hard = TEXT_LIMITS[q.type];
    if (t.length > hard) return `Keep it under ${hard} characters.`;
    if (min !== null && t.length < min) return `Please write at least ${min} characters (you've written ${t.length}).`;
    if (max !== null && t.length > max) return `Keep it under ${max} characters (you've written ${t.length}).`;
    if (q.type === "paragraph" && min !== null && min >= 20) {
      const words = t.split(/\s+/).filter((w) => w.length > 1);
      if (words.length < 4 || new Set(t.toLowerCase().replace(/\s/g, "")).size < 6) return "Please write a proper answer in full sentences.";
    }
    const f = FORMATS[v.format || ""];
    if (f && f.test && !f.test(t)) return f.msg;
  }
  return "";
}

/* Fills in anything missing from older saved forms. */
/* ---------------- appeals ---------------- */
export const DEFAULT_APPEAL_TYPES = [
  { id: "mcban", name: "Minecraft ban", open: true, blurb: "You're banned from play.dualmines.net." },
  { id: "mcmute", name: "Minecraft mute", open: true, blurb: "You're muted in the server chat." },
  { id: "dcban", name: "Discord ban", open: true, blurb: "You're banned from the Dualmines Discord." },
];
export const DEFAULT_APPEAL_FORM = {
  open: true,
  roles: DEFAULT_APPEAL_TYPES,
  files: { enabled: true, required: false },
  intro: "Think your punishment was a mistake, or ready for a second chance? Tell us what happened. Be honest: appeals with false information are denied.",
  questions: [
    { id: "mc", label: "Minecraft username", type: "short", required: true, help: "", v: { format: "minecraft" } },
    { id: "when", label: "When were you punished?", type: "short", required: false, help: "A rough date is fine.", v: { max: 100 } },
    { id: "reason", label: "What reason were you given for your punishment?", type: "short", required: true, help: "", v: { max: 200 } },
    { id: "why", label: "Why should your punishment be removed?", type: "paragraph", required: true, help: "Explain what happened and what you'd do differently.", v: { min: 50 } },
    { id: "extra", label: "Is there anything else we should know?", type: "paragraph", required: false, help: "" },
    { id: "honest", label: "Do you understand that lying in your appeal will get it denied?", type: "yesno", required: true, help: "" },
  ],
};
export const UPLOAD = { max: 5, maxBytes: 25 * 1000 * 1000, accept: "image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/quicktime" };

/* Fills in anything missing from older saved forms. kind is "apply" or "appeal". */
export function normalizeForm(f, kind = "apply") {
  const defaults = kind === "appeal" ? DEFAULT_APPEAL_FORM : DEFAULT_FORM;
  const types = kind === "appeal" ? DEFAULT_APPEAL_TYPES : DEFAULT_ROLES;
  const form = { ...JSON.parse(JSON.stringify(defaults)), ...(f || {}) };
  const saved = Array.isArray(form.roles) ? form.roles : [];
  form.roles = types.map((d) => ({ ...d, ...(saved.find((r) => r.id === d.id) || {}) }));
  form.questions = (form.questions || []).map((q) => ({ ...q, roles: Array.isArray(q.roles) ? q.roles : [] }));
  if (kind === "appeal") form.files = { enabled: true, required: false, ...(form.files || {}) };
  return form;
}

/* Upload with progress (fetch can't report upload progress). */
function xhrUpload(url, token, file, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", url);
    x.setRequestHeader("Authorization", "Bearer " + token);
    x.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    x.setRequestHeader("X-File-Name", encodeURIComponent(file.name || "file"));
    x.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
    x.onload = () => {
      let body = {};
      try { body = JSON.parse(x.responseText); } catch (e) {}
      if (x.status >= 200 && x.status < 300) resolve(body);
      else reject(Object.assign(new Error(body.error || "Upload failed (" + x.status + ")"), { status: x.status }));
    };
    x.onerror = () => reject(new Error("Upload failed. Check your internet connection."));
    x.send(file);
  });
}
async function workerCall(path, token, body) {
  if (!DISCORD_AUTH_URL) throw new Error("The appeals service isn't set up yet.");
  const res = await fetch(DISCORD_AUTH_URL + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Request failed (" + res.status + ")"), { status: res.status });
  return data;
}

const clone = (o) => JSON.parse(JSON.stringify(o));
const toEmail = (u) => (u.includes("@") ? u.trim() : `${u.trim().toLowerCase()}@${ADMIN_EMAIL_DOMAIN}`);

export function friendlyError(e) {
  const code = (e && e.code) || "";
  if (/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login/.test(code)) return "Wrong username or password.";
  if (/too-many-requests/.test(code)) return "Too many attempts. Wait a few minutes and try again.";
  if (/email-already-in-use/.test(code)) return "That username already has an account. Pick a different one, or delete the old account in Firebase → Authentication → Users first.";
  if (/weak-password/.test(code)) return "That password is too weak. Use at least 8 characters.";
  if (/requires-recent-login/.test(code)) return "For security, log out and back in, then try again.";
  if (/permission-denied/.test(code)) return "You don't have permission to do that.";
  if (/network|unavailable/.test(code)) return "Couldn't reach the server. Check your internet connection.";
  return (e && e.message) || "Something went wrong. Please try again.";
}

const ms = (t) => (t && t.toMillis ? t.toMillis() : typeof t === "number" ? t : Date.now());
const roleValue = (a) => { const r = (a.answers || []).find((x) => x.type === "role"); return r ? r.value : ""; };
function randomState() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
export function avatarUrl(id, avatar, size = 64) {
  if (id && avatar) return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${avatar.startsWith("a_") ? "gif" : "png"}?size=${size}`;
  let n = 0;
  try { n = Number((BigInt(id || 0) >> 22n) % 6n); } catch (e) {}
  return `https://cdn.discordapp.com/embed/avatars/${n}.png`;
}

/* ---------------- Firebase ---------------- */
async function firebaseApi() {
  const base = "https://www.gstatic.com/firebasejs/10.12.2/";
  const [appMod, fs, au] = await Promise.all([
    import(base + "firebase-app.js"),
    import(base + "firebase-firestore.js"),
    import(base + "firebase-auth.js"),
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  const db = fs.getFirestore(app);
  const auth = au.getAuth(app);
  const formRef = fs.doc(db, "settings", "applicationForm");
  const apps = fs.collection(db, "applications");

  // Applicants log in with Discord on a separate Firebase app, so it never mixes with an admin login.
  const aApp = appMod.initializeApp(firebaseConfig, "applicant");
  const aAuth = au.getAuth(aApp);
  const aDb = fs.getFirestore(aApp);
  let applicant = null;
  const applicantReady = new Promise((resolve) => {
    au.onAuthStateChanged(aAuth, async (u) => {
      applicant = null;
      if (u) {
        try {
          const c = (await u.getIdTokenResult()).claims;
          if (c.discord_id) applicant = { uid: u.uid, id: c.discord_id, name: c.discord_name, display: c.discord_display || c.discord_name, avatar: c.discord_avatar || "" };
        } catch (e) {}
      }
      resolve();
    });
  });

  return {
    demo: false,
    discordReady: !!DISCORD_AUTH_URL,
    startDiscordLogin() {
      const state = randomState();
      try { sessionStorage.setItem("dm_discord_state", state); } catch (e) {}
      const ret = location.origin + location.pathname;
      location.href = `${DISCORD_AUTH_URL}/login?state=${encodeURIComponent(state)}&return=${encodeURIComponent(ret)}`;
    },
    async finishDiscordLogin() {
      const h = new URLSearchParams(location.hash.slice(1));
      if (!h.has("discord_token") && !h.has("discord_error")) return null;
      history.replaceState(null, "", location.pathname + location.search);
      if (h.get("discord_error")) return h.get("discord_error") === "cancelled" ? "You cancelled the Discord login." : "Discord login failed. Please try again.";
      let expected = null;
      try { expected = sessionStorage.getItem("dm_discord_state"); sessionStorage.removeItem("dm_discord_state"); } catch (e) {}
      if (!expected || expected !== h.get("state")) return "That login link has expired. Please log in again.";
      try {
        await au.signInWithCustomToken(aAuth, h.get("discord_token"));
        const u = aAuth.currentUser;
        const c = (await u.getIdTokenResult(true)).claims;
        applicant = { uid: u.uid, id: c.discord_id, name: c.discord_name, display: c.discord_display || c.discord_name, avatar: c.discord_avatar || "" };
      } catch (e) {
        return "Discord login failed: " + friendlyError(e);
      }
      return null;
    },
    async getApplicant() { await applicantReady; return applicant; },
    async applicantLogout() { await au.signOut(aAuth); applicant = null; },
    async myStatus() {
      if (!applicant) return { ban: null, apps: [] };
      const ban = await fs.getDoc(fs.doc(aDb, "bans", applicant.id));
      const mine = await fs.getDocs(fs.query(fs.collection(aDb, "applications"), fs.where("discordId", "==", applicant.id)));
      return {
        ban: ban.exists() ? ban.data() : null,
        apps: mine.docs.map((d) => { const x = d.data(); return { id: d.id, status: x.status, role: roleValue(x), createdAt: ms(x.createdAt) }; }),
      };
    },
    async listBans() {
      const s = await fs.getDocs(fs.collection(db, "bans"));
      return s.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: ms(d.data().createdAt) }));
    },
    ban: (id, info) => fs.setDoc(fs.doc(db, "bans", String(id)), {
      discordId: String(id),
      discordName: info.discordName || "",
      reason: info.reason || "",
      bannedBy: (auth.currentUser.email || "").split("@")[0],
      createdAt: fs.serverTimestamp(),
    }),
    unban: (id) => fs.deleteDoc(fs.doc(db, "bans", String(id))),
    async getForm() {
      const s = await fs.getDoc(formRef);
      return s.exists() ? s.data() : clone(DEFAULT_FORM);
    },
    saveForm: (form) => fs.setDoc(formRef, form),
    async getAppealForm() {
      const s = await fs.getDoc(fs.doc(db, "settings", "appealForm"));
      return s.exists() ? s.data() : clone(DEFAULT_APPEAL_FORM);
    },
    saveAppealForm: (form) => fs.setDoc(fs.doc(db, "settings", "appealForm"), form),

    /* appeals: player side */
    async myAppeals() {
      if (!applicant) return [];
      const s = await fs.getDocs(fs.query(fs.collection(aDb, "appeals"), fs.where("discordId", "==", applicant.id)));
      return s.docs.map((d) => { const x = d.data(); return { id: d.id, ...x, createdAt: ms(x.createdAt), decidedAt: x.decidedAt ? ms(x.decidedAt) : 0 }; });
    },
    async submitAppeal(typeId, answers, files, onProgress) {
      if (!applicant) { const e = new Error("Please log in with Discord first."); e.code = "unauthenticated"; throw e; }
      const token = await aAuth.currentUser.getIdToken();
      const { id } = await workerCall("/appeal/start", token, { type: typeId, answers, fileCount: files.length });
      for (let i = 0; i < files.length; i++) {
        await xhrUpload(`${DISCORD_AUTH_URL}/appeal/file?id=${encodeURIComponent(id)}&n=${i}`, token, files[i], (f) => onProgress && onProgress(i, f));
        onProgress && onProgress(i, 1);
      }
      await workerCall(`/appeal/finish?id=${encodeURIComponent(id)}`, token);
      return id;
    },

    /* appeals: admin side */
    async listAppeals() {
      const s = await fs.getDocs(fs.collection(db, "appeals"));
      return s.docs.map((d) => { const x = d.data(); return { id: d.id, ...x, createdAt: ms(x.createdAt), decidedAt: x.decidedAt ? ms(x.decidedAt) : 0 }; });
    },
    async appealVerdict(id, verdict, note) {
      return workerCall("/appeal/verdict", await auth.currentUser.getIdToken(), { id, verdict, note });
    },
    async deleteAppeals(ids) {
      return workerCall("/appeal/delete", await auth.currentUser.getIdToken(), { ids });
    },
    async appealFileUrl(id, n) {
      const res = await fetch(`${DISCORD_AUTH_URL}/appeal/file?id=${encodeURIComponent(id)}&n=${n}`, {
        headers: { Authorization: "Bearer " + (await auth.currentUser.getIdToken()) },
      });
      if (!res.ok) throw new Error("Couldn't load this file.");
      return URL.createObjectURL(await res.blob());
    },
    async submit(answers) {
      if (!applicant) { const e = new Error("Please log in with Discord first."); e.code = "unauthenticated"; throw e; }
      return fs.addDoc(fs.collection(aDb, "applications"), {
        answers,
        status: "pending",
        createdAt: fs.serverTimestamp(),
        uid: applicant.uid,
        discordId: applicant.id,
        discordName: applicant.name,
        discordDisplay: applicant.display,
        discordAvatar: applicant.avatar,
      });
    },
    async list() {
      const s = await fs.getDocs(apps);
      return s.docs.map((d) => {
        const x = d.data();
        return { id: d.id, ...x, createdAt: ms(x.createdAt) };
      });
    },
    setStatus: (id, status) => fs.updateDoc(fs.doc(db, "applications", id), { status }),
    async remove(ids) {
      for (let i = 0; i < ids.length; i += 400) {
        const batch = fs.writeBatch(db);
        ids.slice(i, i + 400).forEach((id) => batch.delete(fs.doc(db, "applications", id)));
        await batch.commit();
      }
    },
    login: (user, pass) => au.signInWithEmailAndPassword(auth, toEmail(user), pass),
    logout: () => au.signOut(auth),
    onAuth(cb) {
      au.onAuthStateChanged(auth, async (u) => {
        if (!u) return cb(null);
        const name = (u.email || "").split("@")[0].toLowerCase();
        const owner = OWNERS.includes(name);
        let admin = owner;
        if (!admin) {
          try { admin = (await fs.getDoc(fs.doc(db, "admins", u.uid))).exists(); } catch (e) { admin = false; }
        }
        cb({ name, uid: u.uid, owner, admin });
      });
    },
    async listAdmins() {
      const s = await fs.getDocs(fs.collection(db, "admins"));
      const list = s.docs.map((d) => ({ uid: d.id, ...d.data(), owner: false }));
      OWNERS.forEach((o) => { if (!list.some((a) => a.username === o)) list.unshift({ uid: "owner-" + o, username: o, owner: true }); });
      list.forEach((a) => (a.owner = OWNERS.includes(a.username)));
      return list;
    },
    async addAdmin(username, password) {
      // A second Firebase app creates the account, so you stay logged in as yourself.
      const second = appMod.initializeApp(firebaseConfig, "register-" + Date.now());
      const sAuth = au.getAuth(second);
      try {
        const cred = await au.createUserWithEmailAndPassword(sAuth, toEmail(username), password);
        await fs.setDoc(fs.doc(db, "admins", cred.user.uid), {
          username: username.toLowerCase(),
          addedBy: (auth.currentUser.email || "").split("@")[0],
          createdAt: fs.serverTimestamp(),
        });
        await au.signOut(sAuth);
      } finally {
        await appMod.deleteApp(second);
      }
    },
    removeAdmin: (uid) => fs.deleteDoc(fs.doc(db, "admins", uid)),

    /* admin activity log (only owners can read it) */
    log(action, summary, details = {}) {
      const u = auth.currentUser;
      if (!u) return Promise.resolve();
      return fs.addDoc(fs.collection(db, "logs"), {
        action: String(action).slice(0, 40),
        summary: String(summary).slice(0, 480),
        details: JSON.parse(JSON.stringify(details || {})),
        actor: (u.email || "").split("@")[0],
        actorUid: u.uid,
        at: fs.serverTimestamp(),
      });
    },
    async listLogs(max = 500) {
      const s = await fs.getDocs(fs.query(fs.collection(db, "logs"), fs.orderBy("at", "desc"), fs.limit(max)));
      return s.docs.map((d) => ({ id: d.id, ...d.data(), at: ms(d.data().at) }));
    },
    async clearLogs(ids) {
      for (let i = 0; i < ids.length; i += 400) {
        const batch = fs.writeBatch(db);
        ids.slice(i, i + 400).forEach((id) => batch.delete(fs.doc(db, "logs", id)));
        await batch.commit();
      }
    },
    async changePassword(current, next) {
      const u = auth.currentUser;
      await au.reauthenticateWithCredential(u, au.EmailAuthProvider.credential(u.email, current));
      await au.updatePassword(u, next);
    },
  };
}

/* ---------------- Demo (this browser only) ---------------- */
function demoApi() {
  const mem = {};
  const get = (k, d) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return k in mem ? mem[k] : d; }
  };
  const set = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { mem[k] = v; }
  };
  let listeners = [];
  let user = (() => { try { return sessionStorage.getItem("dm_demo_user"); } catch (e) { return null; } })();
  const emit = () => listeners.forEach((cb) => cb(me()));
  const wait = () => new Promise((r) => setTimeout(r, 150));

  if (!get("dm_demo_seeded_v3", false)) {
    const now = Date.now();
    const sample = (name, discord, role, why, status, daysAgo) => ({
      id: "demo" + Math.random().toString(36).slice(2, 9),
      status,
      createdAt: now - daysAgo * 86400000,
      discordId: String(900000000000000000 + daysAgo * 1234567),
      discordName: discord,
      discordDisplay: name,
      discordAvatar: "",
      answers: [
        { q: "Role", type: "role", value: role },
        { q: "Minecraft username", type: "short", value: name },
        { q: "How old are you?", type: "number", value: "16" },
        { q: "What is your timezone?", type: "dropdown", value: "UK (GMT/BST)" },
        { q: "How many hours a week can you be active?", type: "number", value: "12" },
        { q: "Why do you want to join the Dualmines staff team?", type: "paragraph", value: why },
        { q: "Do you have any previous staff experience?", type: "paragraph", value: "" },
        { q: "Have you read and agree to follow the server rules?", type: "yesno", value: "Yes" },
      ],
    });
    set("dm_demo_apps", [
      sample("ExamplePlayer1", "example_one", "Staff", "Example application. I play every day and want to help keep chat friendly.", "pending", 0),
      sample("ExamplePlayer2", "example_two", "Builder", "Example application. I'd love to help build new arenas for the box.", "pending", 1),
      sample("ExamplePlayer3", "example_three", "Developer", "Example application. I already help new players learn how Box PvP works.", "accepted", 3),
    ]);
    set("dm_demo_seeded_v3", true);
  }

  const demoApplicant = () => { try { return JSON.parse(sessionStorage.getItem("dm_demo_applicant") || "null"); } catch (e) { return null; } };
  return {
    demo: true,
    discordReady: true,
    startDiscordLogin() {
      const a = { uid: "discord:111122223333444455", id: "111122223333444455", name: "demo_player", display: "Demo Player", avatar: "" };
      try { sessionStorage.setItem("dm_demo_applicant", JSON.stringify(a)); } catch (e) {}
      location.reload();
    },
    async finishDiscordLogin() { return null; },
    async getApplicant() { return demoApplicant(); },
    async applicantLogout() { try { sessionStorage.removeItem("dm_demo_applicant"); } catch (e) {} },
    async myStatus() {
      await wait();
      const a = demoApplicant();
      if (!a) return { ban: null, apps: [] };
      return {
        ban: get("dm_demo_bans", []).find((b) => b.id === a.id) || null,
        apps: get("dm_demo_apps", []).filter((x) => x.discordId === a.id).map((x) => ({ id: x.id, status: x.status, role: roleValue(x), createdAt: x.createdAt })),
      };
    },
    async listBans() { await wait(); return get("dm_demo_bans", []); },
    async ban(id, info) {
      await wait();
      const list = get("dm_demo_bans", []).filter((b) => b.id !== String(id));
      list.push({ id: String(id), discordId: String(id), discordName: info.discordName || "", reason: info.reason || "", bannedBy: user, createdAt: Date.now() });
      set("dm_demo_bans", list);
    },
    async unban(id) { await wait(); set("dm_demo_bans", get("dm_demo_bans", []).filter((b) => b.id !== String(id))); },
    async getForm() { await wait(); return get("dm_demo_form_v2", clone(DEFAULT_FORM)); },
    async getAppealForm() { await wait(); return get("dm_demo_appeal_form", clone(DEFAULT_APPEAL_FORM)); },
    async saveAppealForm(form) { await wait(); set("dm_demo_appeal_form", form); },
    async myAppeals() {
      await wait();
      const a = demoApplicant();
      return a ? get("dm_demo_appeals", []).filter((x) => x.discordId === a.id) : [];
    },
    async submitAppeal(typeId, answers, files, onProgress) {
      const a = demoApplicant();
      if (!a) { const e = new Error("Please log in with Discord first."); e.code = "unauthenticated"; throw e; }
      const list = get("dm_demo_appeals", []);
      if (list.some((x) => x.discordId === a.id && x.status === "pending")) throw new Error("You already have an appeal waiting to be reviewed.");
      const form = get("dm_demo_appeal_form", clone(DEFAULT_APPEAL_FORM));
      const type = (normalizeForm(form, "appeal").roles.find((t) => t.id === typeId) || {}).name || typeId;
      const stored = [];
      for (let i = 0; i < files.length; i++) {
        for (let p = 0.25; p <= 1; p += 0.25) { await new Promise((r) => setTimeout(r, 60)); onProgress && onProgress(i, p); }
        let url = "";
        if (files[i].size < 400000) url = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(""); fr.readAsDataURL(files[i]); });
        stored.push({ n: i, name: files[i].name, type: files[i].type, size: files[i].size, demoUrl: url });
      }
      const id = "ap" + Date.now().toString(36);
      list.push({ id, answers, type, typeId, status: "pending", createdAt: Date.now(), uid: a.uid, discordId: a.id, discordName: a.name, discordDisplay: a.display, discordAvatar: a.avatar, fileCount: files.length, files: stored, submitted: true });
      try { set("dm_demo_appeals", list); } catch (e) {}
      return id;
    },
    async listAppeals() {
      await wait();
      if (!get("dm_demo_appeals_seeded", false)) {
        set("dm_demo_appeals", [...get("dm_demo_appeals", []), {
          id: "apdemo1", type: "Minecraft ban", typeId: "mcban", status: "pending", createdAt: Date.now() - 3600e3, submitted: true,
          discordId: "900000000000000123", discordName: "example_appealer", discordDisplay: "Example Appealer", discordAvatar: "", fileCount: 0, files: [],
          answers: [
            { q: "Minecraft username", type: "short", value: "ExampleAppealer" },
            { q: "What reason were you given for your punishment?", type: "short", value: "Using an auto-clicker" },
            { q: "Why should your punishment be removed?", type: "paragraph", value: "Example appeal. My mouse was double clicking by itself; I've replaced it since and won't use any macros." },
          ],
        }]);
        set("dm_demo_appeals_seeded", true);
      }
      return get("dm_demo_appeals", []);
    },
    async appealVerdict(id, verdict, note) {
      await wait();
      const ap = get("dm_demo_appeals", []).find((x) => x.id === id) || {};
      set("dm_demo_appeals", get("dm_demo_appeals", []).map((x) => (x.id === id ? { ...x, status: verdict, verdictNote: note, decidedBy: user, decidedAt: Date.now(), dmSent: false, dmError: "Demo mode: no Discord message was sent." } : x)));
      await this.log("appeal." + verdict, `${verdict === "accepted" ? "Accepted" : "Denied"} the ${ap.type || ""} appeal from @${ap.discordName || "?"}`, { appealId: id, discordId: ap.discordId, note });
      return { ok: true, dmSent: false, dmError: "Demo mode: no Discord message was sent." };
    },
    async deleteAppeals(ids) {
      await wait();
      set("dm_demo_appeals", get("dm_demo_appeals", []).filter((x) => !ids.includes(x.id)));
      await this.log("appeal.delete", `Deleted ${ids.length} appeal${ids.length === 1 ? "" : "s"}`, { count: ids.length });
    },
    async appealFileUrl(id, n) {
      const a = get("dm_demo_appeals", []).find((x) => x.id === id);
      const f = a && (a.files || []).find((x) => x.n === n);
      if (!f || !f.demoUrl) throw new Error("Demo mode only keeps small files.");
      return f.demoUrl;
    },
    async saveForm(form) { await wait(); set("dm_demo_form_v2", form); },
    async submit(answers) {
      await wait();
      const a = demoApplicant();
      if (!a) { const e = new Error("Please log in with Discord first."); e.code = "unauthenticated"; throw e; }
      if (get("dm_demo_bans", []).some((b) => b.id === a.id)) { const e = new Error(""); e.code = "permission-denied"; throw e; }
      const list = get("dm_demo_apps", []);
      list.push({ id: "demo" + Date.now().toString(36), answers, status: "pending", createdAt: Date.now(), uid: a.uid, discordId: a.id, discordName: a.name, discordDisplay: a.display, discordAvatar: a.avatar });
      set("dm_demo_apps", list);
    },
    async list() { await wait(); return get("dm_demo_apps", []); },
    async setStatus(id, status) {
      await wait();
      set("dm_demo_apps", get("dm_demo_apps", []).map((a) => (a.id === id ? { ...a, status } : a)));
    },
    async remove(ids) {
      await wait();
      set("dm_demo_apps", get("dm_demo_apps", []).filter((a) => !ids.includes(a.id)));
    },
    async login(u, p) {
      await wait();
      const name = u.trim().toLowerCase();
      const acct = users().find((a) => a.username === name);
      if (!acct || acct.password !== p) {
        const e = new Error("Wrong username or password."); e.code = "invalid-credential"; throw e;
      }
      user = name;
      try { sessionStorage.setItem("dm_demo_user", user); } catch (e) {}
      emit();
    },
    async logout() {
      user = null;
      try { sessionStorage.removeItem("dm_demo_user"); } catch (e) {}
      emit();
    },
    onAuth(cb) { listeners.push(cb); cb(me()); },
    async listAdmins() {
      await wait();
      return users().filter((a) => a.active !== false).map((a) => ({ uid: a.uid, username: a.username, addedBy: a.addedBy, owner: a.username === "admin" }));
    },
    async addAdmin(username, password) {
      await wait();
      const list = users();
      if (list.some((a) => a.username === username)) { const e = new Error(""); e.code = "email-already-in-use"; throw e; }
      list.push({ uid: "u" + Date.now().toString(36), username, password, addedBy: user });
      set("dm_demo_users", list);
    },
    async log(action, summary, details = {}) {
      if (!user) return;
      const list = get("dm_demo_logs", []);
      list.unshift({ id: "lg" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), action, summary, details, actor: user, actorUid: (me() || {}).uid, at: Date.now() });
      set("dm_demo_logs", list.slice(0, 500));
    },
    async listLogs() { await wait(); return get("dm_demo_logs", []); },
    async clearLogs(ids) { await wait(); set("dm_demo_logs", get("dm_demo_logs", []).filter((l) => !ids.includes(l.id))); },
    async removeAdmin(uid) {
      await wait();
      set("dm_demo_users", users().filter((a) => a.uid !== uid || a.username === "admin"));
    },
    async changePassword(current, next) {
      await wait();
      const list = users();
      const acct = list.find((a) => a.username === user);
      if (!acct || acct.password !== current) { const e = new Error(""); e.code = "invalid-credential"; throw e; }
      acct.password = next;
      set("dm_demo_users", list);
    },
  };

  function users() {
    return get("dm_demo_users", [{ uid: "owner", username: "admin", password: "admin", addedBy: "" }]);
  }
  function me() {
    if (!user) return null;
    const acct = users().find((a) => a.username === user);
    if (!acct) return null;
    return { name: user, uid: acct.uid, owner: user === "admin", admin: true };
  }
}

function withTimeout(promise, ms, msg) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, rej) => { t = setTimeout(() => { const e = new Error(msg); e.code = "timeout"; rej(e); }, ms); }),
  ]).finally(() => clearTimeout(t));
}

let api;
try {
  api = firebaseConfig && firebaseConfig.apiKey
    ? await withTimeout(firebaseApi(), 20000, "Firebase took too long to load. Check your internet connection, or turn off any ad blocker for this site.")
    : demoApi();
} catch (e) {
  const msg = "Couldn't connect to Firebase: " + (e && e.message ? e.message : e);
  window.__dmError && window.__dmError(msg);
  throw e;
}
const DB_MSG = "Couldn't reach the database. In Firebase, check that Firestore Database has been created and the rules have been published.";
const rawGetForm = api.getForm;
api.getForm = () => withTimeout(rawGetForm(), 15000, DB_MSG);
const rawGetAppealForm = api.getAppealForm;
api.getAppealForm = () => withTimeout(rawGetAppealForm(), 15000, DB_MSG);
export default api;
