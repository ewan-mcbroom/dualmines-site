/* Storage + login for staff applications.
   Uses Firebase when firebase-config.js is filled in, otherwise a demo that saves in this browser. */
import { firebaseConfig, ADMIN_EMAIL_DOMAIN } from "./firebase-config.js";

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

export const DEFAULT_FORM = {
  open: true,
  intro: "Want to help run Dualmines? Fill in the form below. We read every application and will get back to you on Discord.",
  questions: [
    { id: "mc", label: "Minecraft username", type: "short", required: true, help: "" },
    { id: "discord", label: "Discord username", type: "short", required: true, help: "So we can contact you." },
    { id: "age", label: "How old are you?", type: "number", required: true, help: "" },
    { id: "role", label: "Which role are you applying for?", type: "choice", required: true, help: "", options: ["Helper", "Moderator", "Builder", "Developer"] },
    { id: "tz", label: "What is your timezone?", type: "dropdown", required: true, help: "", options: ["UK (GMT/BST)", "Europe (CET)", "North America East", "North America West", "Asia / Oceania", "Other"] },
    { id: "hours", label: "How many hours a week can you be active?", type: "number", required: true, help: "" },
    { id: "why", label: "Why do you want to join the Dualmines staff team?", type: "paragraph", required: true, help: "Tell us about yourself. The more detail the better." },
    { id: "exp", label: "Do you have any previous staff experience?", type: "paragraph", required: false, help: "Other servers, Discord communities, etc." },
    { id: "rules", label: "Have you read and agree to follow the server rules?", type: "yesno", required: true, help: "" },
  ],
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const toEmail = (u) => (u.includes("@") ? u.trim() : `${u.trim().toLowerCase()}@${ADMIN_EMAIL_DOMAIN}`);

export function friendlyError(e) {
  const code = (e && e.code) || "";
  if (/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login/.test(code)) return "Wrong username or password.";
  if (/too-many-requests/.test(code)) return "Too many attempts. Wait a few minutes and try again.";
  if (/permission-denied/.test(code)) return "You don't have permission to do that. Check your username is listed in the Firestore rules.";
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
      au.onAuthStateChanged(auth, (u) => cb(u ? { name: (u.email || "admin").split("@")[0] } : null));
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
  const emit = () => listeners.forEach((cb) => cb(user ? { name: user } : null));
  const wait = () => new Promise((r) => setTimeout(r, 150));

  if (!get("dm_demo_seeded", false)) {
    const now = Date.now();
    const sample = (name, discord, role, why, status, daysAgo) => ({
      id: "demo" + Math.random().toString(36).slice(2, 9),
      status,
      createdAt: now - daysAgo * 86400000,
      answers: [
        { q: "Minecraft username", type: "short", value: name },
        { q: "Discord username", type: "short", value: discord },
        { q: "How old are you?", type: "number", value: "16" },
        { q: "Which role are you applying for?", type: "choice", value: role },
        { q: "What is your timezone?", type: "dropdown", value: "UK (GMT/BST)" },
        { q: "How many hours a week can you be active?", type: "number", value: "12" },
        { q: "Why do you want to join the Dualmines staff team?", type: "paragraph", value: why },
        { q: "Do you have any previous staff experience?", type: "paragraph", value: "" },
        { q: "Have you read and agree to follow the server rules?", type: "yesno", value: "Yes" },
      ],
    });
    set("dm_demo_apps", [
      sample("ExamplePlayer1", "example_one", "Moderator", "Example application. I play every day and want to help keep chat friendly.", "pending", 0),
      sample("ExamplePlayer2", "example_two", "Builder", "Example application. I'd love to help build new arenas for the box.", "pending", 1),
      sample("ExamplePlayer3", "example_three", "Helper", "Example application. I already help new players learn how Box PvP works.", "accepted", 3),
    ]);
    set("dm_demo_seeded", true);
  }

  return {
    demo: true,
    async getForm() { await wait(); return get("dm_demo_form", clone(DEFAULT_FORM)); },
    async saveForm(form) { await wait(); set("dm_demo_form", form); },
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
      if (u.trim().toLowerCase() !== "admin" || p !== "admin") {
        const e = new Error("Wrong username or password."); e.code = "invalid-credential"; throw e;
      }
      user = "admin";
      try { sessionStorage.setItem("dm_demo_user", user); } catch (e) {}
      emit();
    },
    async logout() {
      user = null;
      try { sessionStorage.removeItem("dm_demo_user"); } catch (e) {}
      emit();
    },
    onAuth(cb) { listeners.push(cb); cb(user ? { name: user } : null); },
  };
}

const api = firebaseConfig && firebaseConfig.apiKey ? await firebaseApi() : demoApi();
export default api;
