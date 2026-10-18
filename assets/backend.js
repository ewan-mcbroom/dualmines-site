/* Storage + login for staff applications.
   Uses Firebase when firebase-config.js is filled in, otherwise a demo that saves in this browser. */
import { firebaseConfig, ADMIN_EMAIL_DOMAIN, OWNER_USERNAMES } from "./firebase-config.js";

const OWNERS = (OWNER_USERNAMES || []).map((u) => u.toLowerCase());
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
    { id: "mc", label: "Minecraft username", type: "short", required: true, help: "" },
    { id: "discord", label: "Discord username", type: "short", required: true, help: "So we can contact you." },
    { id: "age", label: "How old are you?", type: "number", required: true, help: "" },
    { id: "tz", label: "What is your timezone?", type: "dropdown", required: true, help: "", options: ["UK (GMT/BST)", "Europe (CET)", "North America East", "North America West", "Asia / Oceania", "Other"] },
    { id: "hours", label: "How many hours a week can you be active?", type: "number", required: true, help: "" },
    { id: "why", label: "Why do you want to join the Dualmines staff team?", type: "paragraph", required: true, help: "Tell us about yourself. The more detail the better." },
    { id: "exp", label: "Do you have any previous staff experience?", type: "paragraph", required: false, help: "Other servers, Discord communities, etc." },
    { id: "portfolio", label: "Link to your builds or portfolio", type: "short", required: true, help: "Imgur album, Planet Minecraft, YouTube, etc.", roles: ["builder"] },
    { id: "code", label: "What languages and tools have you used? Link any projects (e.g. GitHub).", type: "paragraph", required: true, help: "", roles: ["developer"] },
    { id: "rules", label: "Have you read and agree to follow the server rules?", type: "yesno", required: true, help: "" },
  ],
};

/* Fills in anything missing from older saved forms. */
export function normalizeForm(f) {
  const form = { ...JSON.parse(JSON.stringify(DEFAULT_FORM)), ...(f || {}) };
  const saved = Array.isArray(form.roles) ? form.roles : [];
  form.roles = DEFAULT_ROLES.map((d) => ({ ...d, ...(saved.find((r) => r.id === d.id) || {}) }));
  form.questions = (form.questions || []).map((q) => ({ ...q, roles: Array.isArray(q.roles) ? q.roles : [] }));
  return form;
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

  return {
    demo: false,
    async getForm() {
      const s = await fs.getDoc(formRef);
      return s.exists() ? s.data() : clone(DEFAULT_FORM);
    },
    saveForm: (form) => fs.setDoc(formRef, form),
    submit: (answers) => fs.addDoc(apps, { answers, status: "pending", createdAt: fs.serverTimestamp() }),
    async list() {
      const s = await fs.getDocs(apps);
      return s.docs.map((d) => {
        const x = d.data();
        return { id: d.id, ...x, createdAt: x.createdAt && x.createdAt.toMillis ? x.createdAt.toMillis() : Date.now() };
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

  if (!get("dm_demo_seeded_v2", false)) {
    const now = Date.now();
    const sample = (name, discord, role, why, status, daysAgo) => ({
      id: "demo" + Math.random().toString(36).slice(2, 9),
      status,
      createdAt: now - daysAgo * 86400000,
      answers: [
        { q: "Role", type: "role", value: role },
        { q: "Minecraft username", type: "short", value: name },
        { q: "Discord username", type: "short", value: discord },
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
    set("dm_demo_seeded_v2", true);
  }

  return {
    demo: true,
    async getForm() { await wait(); return get("dm_demo_form_v2", clone(DEFAULT_FORM)); },
    async saveForm(form) { await wait(); set("dm_demo_form_v2", form); },
    async submit(answers) {
      await wait();
      const list = get("dm_demo_apps", []);
      list.push({ id: "demo" + Date.now().toString(36), answers, status: "pending", createdAt: Date.now() });
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

const api = firebaseConfig && firebaseConfig.apiKey ? await firebaseApi() : demoApi();
export default api;