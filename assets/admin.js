import api, { QUESTION_TYPES, HAS_OPTIONS, friendlyError } from "./backend.js";

const root = document.getElementById("admin");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const newId = () => "q" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmt = (ms) => new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const S = {
  user: null,
  tab: "apps",
  filter: "pending",
  apps: [],
  loadingApps: false,
  openId: null,
  confirmClear: false,
  form: null,
  draft: null,
  dirty: false,
  msg: "",
};

/* ------------------------- login ------------------------- */
function renderLogin(error = "") {
  root.innerHTML = `
  <div class="login panel">
    <img src="assets/logo.webp" alt="" width="72" height="72">
    <h2>Admin login</h2>
    ${api.demo ? '<p class="demo-note">Demo mode. Log in with username <b>admin</b> and password <b>admin</b>.</p>' : ""}
    <form id="loginForm">
      <label class="q-label" for="lu">Username</label>
      <input class="inp" id="lu" name="u" autocomplete="username" required>
      <label class="q-label" for="lp">Password</label>
      <input class="inp" id="lp" name="p" type="password" autocomplete="current-password" required>
      <p class="form-err" role="alert"${error ? "" : " hidden"}>${esc(error)}</p>
      <button class="btn-main" type="submit">Log in</button>
    </form>
  </div>`;
  const f = document.getElementById("loginForm");
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = f.querySelector("button");
    btn.disabled = true;
    btn.textContent = "Logging in…";
    try {
      await api.login(f.u.value, f.p.value);
    } catch (err) {
      renderLogin(friendlyError(err));
      const u = document.getElementById("lu");
      u.value = f.u.value;
      document.getElementById("lp").focus();
    }
  });
  document.getElementById("lu").focus();
}

/* ------------------------- data ------------------------- */
async function loadApps() {
  S.loadingApps = true;
  render();
  try {
    S.apps = (await api.list()).sort((a, b) => b.createdAt - a.createdAt);
    S.msg = "";
  } catch (e) {
    S.msg = "Couldn't load applications. " + friendlyError(e);
  }
  S.loadingApps = false;
  render();
}
async function loadForm() {
  try {
    S.form = await api.getForm();
  } catch (e) {
    S.msg = "Couldn't load the questions. " + friendlyError(e);
    S.form = { open: true, intro: "", questions: [] };
  }
  S.draft = clone(S.form);
  S.dirty = false;
}

/* ------------------------- shell ------------------------- */
function render() {
  if (!S.user) return;
  const counts = { pending: 0, accepted: 0, rejected: 0 };
  S.apps.forEach((a) => (counts[a.status] = (counts[a.status] || 0) + 1));
  root.innerHTML = `
  <div class="admin-bar">
    <div class="tabs" role="tablist">
      <button role="tab" class="tab-btn" aria-selected="${S.tab === "apps"}" data-tab="apps">Applications${counts.pending ? `<span class="badge">${counts.pending}</span>` : ""}</button>
      <button role="tab" class="tab-btn" aria-selected="${S.tab === "questions"}" data-tab="questions">Questions${S.dirty ? '<span class="badge warn">unsaved</span>' : ""}</button>
    </div>
    <div class="who">${api.demo ? '<span class="chip" style="--c:var(--gold)">Demo</span>' : ""}Signed in as <b>${esc(S.user.name)}</b><button class="pxbtn" id="logout" type="button">Log out</button></div>
  </div>
  ${S.msg ? `<p class="form-err" role="alert">${esc(S.msg)}</p>` : ""}
  <div id="view">${S.tab === "apps" ? appsView(counts) : questionsView()}</div>`;

  root.querySelectorAll("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => { S.tab = b.dataset.tab; S.msg = ""; render(); })
  );
  document.getElementById("logout").addEventListener("click", () => api.logout());
  if (S.tab === "apps") bindApps();
  else bindQuestions();
}

/* ------------------------- applications ------------------------- */
const STATUS_LABEL = { pending: "Pending", accepted: "Accepted", rejected: "Rejected" };
const STATUS_COL = { pending: "var(--ice)", accepted: "#5ee38a", rejected: "#ff6b6b" };

function titleFor(a) {
  const first = (a.answers || []).find((x) => x.value);
  return first ? first.value : "Untitled application";
}
function subtitleFor(a) {
  const ans = a.answers || [];
  const role = ans.find((x) => /role|position|applying/i.test(x.q) && x.value);
  const disc = ans.find((x) => /discord/i.test(x.q) && x.value);
  return [role && role.value, disc && "Discord: " + disc.value].filter(Boolean).join(" • ");
}

function appsView(counts) {
  const list = S.apps.filter((a) => a.status === S.filter);
  const filters = ["pending", "accepted", "rejected"]
    .map((f) => `<button class="sub-btn" aria-pressed="${S.filter === f}" data-filter="${f}" style="--c:${STATUS_COL[f]}">${STATUS_LABEL[f]} <span>${counts[f] || 0}</span></button>`)
    .join("");
  const canClear = S.filter !== "pending" && list.length > 0;
  const clear = !canClear
    ? ""
    : S.confirmClear
    ? `<span class="confirm">Delete all ${list.length} ${S.filter} applications? This can't be undone.
         <button class="btn-danger" id="clearYes" type="button">Yes, clear list</button>
         <button class="pxbtn" id="clearNo" type="button">Cancel</button></span>`
    : `<button class="btn-danger ghost" id="clearList" type="button">Clear ${S.filter} list</button>`;

  const items = S.loadingApps && !S.apps.length
    ? '<p class="empty panel">Loading applications…</p>'
    : list.length
    ? list.map(appItem).join("")
    : `<p class="empty panel">No ${S.filter} applications.</p>`;

  return `
  <div class="toolbar">
    <div class="subtabs">${filters}</div>
    <div class="toolbar-right">${clear}<button class="pxbtn" id="refresh" type="button">${S.loadingApps ? "Refreshing…" : "Refresh"}</button></div>
  </div>
  <div class="app-list">${items}</div>`;
}

function appItem(a) {
  const open = S.openId === a.id;
  const answers = (a.answers || [])
    .map((x) => `<div class="ans"><dt>${esc(x.q)}</dt><dd>${x.value ? esc(x.value) : '<span class="none">No answer</span>'}</dd></div>`)
    .join("");
  const actions =
    a.status === "pending"
      ? `<button class="btn-ok" data-act="accepted" data-id="${a.id}" type="button">Accept</button>
         <button class="btn-danger" data-act="rejected" data-id="${a.id}" type="button">Reject</button>`
      : `<button class="pxbtn" data-act="pending" data-id="${a.id}" type="button">Move back to pending</button>
         ${a.status === "accepted"
           ? `<button class="btn-danger ghost" data-act="rejected" data-id="${a.id}" type="button">Reject instead</button>`
           : `<button class="btn-ok ghost" data-act="accepted" data-id="${a.id}" type="button">Accept instead</button>`}`;
  return `<article class="app panel${open ? " open" : ""}" style="--c:${STATUS_COL[a.status] || "var(--ice)"}">
    <button class="app-head" type="button" data-open="${a.id}" aria-expanded="${open}">
      <span class="app-title"><b>${esc(titleFor(a))}</b><small>${esc(subtitleFor(a))}</small></span>
      <span class="app-date">${fmt(a.createdAt)}</span>
      <span class="chev" aria-hidden="true">▸</span>
    </button>
    ${open ? `<div class="app-body"><dl>${answers}</dl><div class="app-actions">${actions}</div></div>` : ""}
  </article>`;
}

function bindApps() {
  root.querySelectorAll("[data-filter]").forEach((b) =>
    b.addEventListener("click", () => { S.filter = b.dataset.filter; S.openId = null; S.confirmClear = false; render(); })
  );
  root.querySelectorAll("[data-open]").forEach((b) =>
    b.addEventListener("click", () => { S.openId = S.openId === b.dataset.open ? null : b.dataset.open; render(); })
  );
  root.querySelectorAll("[data-act]").forEach((b) =>
    b.addEventListener("click", async () => {
      const id = b.dataset.id, status = b.dataset.act;
      b.disabled = true;
      try {
        await api.setStatus(id, status);
        const a = S.apps.find((x) => x.id === id);
        if (a) a.status = status;
        S.openId = null;
        S.msg = "";
      } catch (e) {
        S.msg = "Couldn't update that application. " + friendlyError(e);
      }
      render();
    })
  );
  const r = document.getElementById("refresh");
  if (r) r.addEventListener("click", loadApps);
  const c = document.getElementById("clearList");
  if (c) c.addEventListener("click", () => { S.confirmClear = true; render(); });
  const n = document.getElementById("clearNo");
  if (n) n.addEventListener("click", () => { S.confirmClear = false; render(); });
  const y = document.getElementById("clearYes");
  if (y)
    y.addEventListener("click", async () => {
      const ids = S.apps.filter((a) => a.status === S.filter).map((a) => a.id);
      y.disabled = true;
      y.textContent = "Clearing…";
      try {
        await api.remove(ids);
        S.apps = S.apps.filter((a) => !ids.includes(a.id));
        S.msg = "";
      } catch (e) {
        S.msg = "Couldn't clear the list. " + friendlyError(e);
      }
      S.confirmClear = false;
      render();
    });
}

/* ------------------------- questions ------------------------- */
function questionsView() {
  const d = S.draft;
  const qs = d.questions
    .map((q, i) => {
      const hasOpts = HAS_OPTIONS.includes(q.type);
      const types = Object.entries(QUESTION_TYPES).map(([k, v]) => `<option value="${k}"${q.type === k ? " selected" : ""}>${v}</option>`).join("");
      return `<div class="qcard panel" data-i="${i}">
        <div class="qcard-top">
          <span class="qnum">${i + 1}</span>
          <div class="qmove">
            <button class="pxbtn icon" type="button" data-move="-1" aria-label="Move up"${i === 0 ? " disabled" : ""}>▲</button>
            <button class="pxbtn icon" type="button" data-move="1" aria-label="Move down"${i === d.questions.length - 1 ? " disabled" : ""}>▼</button>
            <button class="pxbtn icon danger" type="button" data-del aria-label="Delete question">✕</button>
          </div>
        </div>
        <label class="q-label" for="ql_${i}">Question</label>
        <input class="inp" id="ql_${i}" data-k="label" value="${esc(q.label)}" placeholder="e.g. What is your Minecraft username?">
        <div class="qrow">
          <div>
            <label class="q-label" for="qt_${i}">Answer type</label>
            <select class="inp" id="qt_${i}" data-k="type">${types}</select>
          </div>
          <label class="switch"><input type="checkbox" data-k="required"${q.required ? " checked" : ""}><span class="sw"></span>Required</label>
        </div>
        <div${hasOpts ? "" : " hidden"}>
          <label class="q-label" for="qo_${i}">Options <span class="opt">(one per line)</span></label>
          <textarea class="inp" id="qo_${i}" rows="4" data-k="options">${esc((q.options || []).join("\n"))}</textarea>
        </div>
        <label class="q-label" for="qh_${i}">Help text <span class="opt">(optional, shown under the question)</span></label>
        <input class="inp" id="qh_${i}" data-k="help" value="${esc(q.help || "")}">
      </div>`;
    })
    .join("");

  return `
  <div class="panel settings">
    <h3>Form settings</h3>
    <label class="switch big"><input type="checkbox" id="openToggle"${d.open ? " checked" : ""}><span class="sw"></span>Applications are <b>${d.open ? "open" : "closed"}</b></label>
    <label class="q-label" for="intro">Intro text <span class="opt">(shown at the top of the form)</span></label>
    <textarea class="inp" id="intro" rows="3">${esc(d.intro || "")}</textarea>
  </div>
  <div class="qlist">${qs || '<p class="empty panel">No questions yet. Add your first one below.</p>'}</div>
  <button class="pxbtn add-q" id="addQ" type="button">+ Add question</button>
  <div class="savebar${S.dirty ? " dirty" : ""}">
    <span>${S.dirty ? "You have unsaved changes." : "All changes saved."}</span>
    <a class="pxbtn" href="apply.html" target="_blank" rel="noopener">View form</a>
    <button class="pxbtn" id="discard" type="button"${S.dirty ? "" : " disabled"}>Discard</button>
    <button class="btn-main" id="saveQ" type="button"${S.dirty ? "" : " disabled"}>Save changes</button>
  </div>`;
}

function markDirty() {
  if (!S.dirty) {
    S.dirty = true;
    const bar = root.querySelector(".savebar");
    bar.classList.add("dirty");
    bar.querySelector("span").textContent = "You have unsaved changes.";
    document.getElementById("saveQ").disabled = false;
    document.getElementById("discard").disabled = false;
    const tab = root.querySelector('[data-tab="questions"]');
    if (tab && !tab.querySelector(".badge")) tab.insertAdjacentHTML("beforeend", '<span class="badge warn">unsaved</span>');
  }
}

function bindQuestions() {
  const d = S.draft;
  const view = document.getElementById("view");

  document.getElementById("openToggle").addEventListener("change", (e) => { d.open = e.target.checked; S.dirty = true; render(); });
  document.getElementById("intro").addEventListener("input", (e) => { d.intro = e.target.value; markDirty(); });

  view.querySelectorAll(".qcard").forEach((card) => {
    const i = Number(card.dataset.i);
    const q = d.questions[i];
    card.querySelectorAll("[data-k]").forEach((el) => {
      const k = el.dataset.k;
      el.addEventListener(el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input", () => {
        if (k === "required") q.required = el.checked;
        else if (k === "options") q.options = el.value.split("\n").map((s) => s.trim()).filter(Boolean);
        else q[k] = el.value;
        if (k === "type") {
          if (HAS_OPTIONS.includes(q.type) && !(q.options && q.options.length)) q.options = ["Option 1", "Option 2"];
          S.dirty = true;
          render();
          return;
        }
        markDirty();
      });
    });
    card.querySelectorAll("[data-move]").forEach((b) =>
      b.addEventListener("click", () => {
        const j = i + Number(b.dataset.move);
        [d.questions[i], d.questions[j]] = [d.questions[j], d.questions[i]];
        S.dirty = true;
        render();
      })
    );
    card.querySelector("[data-del]").addEventListener("click", () => {
      d.questions.splice(i, 1);
      S.dirty = true;
      render();
    });
  });

  document.getElementById("addQ").addEventListener("click", () => {
    d.questions.push({ id: newId(), label: "", type: "short", required: false, help: "" });
    S.dirty = true;
    render();
    const inputs = root.querySelectorAll('[data-k="label"]');
    const last = inputs[inputs.length - 1];
    if (last) { last.scrollIntoView({ behavior: "smooth", block: "center" }); last.focus({ preventScroll: true }); }
  });

  document.getElementById("discard").addEventListener("click", () => {
    S.draft = clone(S.form);
    S.dirty = false;
    S.msg = "";
    render();
  });

  document.getElementById("saveQ").addEventListener("click", async (e) => {
    const bad = d.questions.findIndex((q) => !q.label.trim() || (HAS_OPTIONS.includes(q.type) && !(q.options || []).length));
    if (bad !== -1) {
      const q = d.questions[bad];
      S.msg = `Question ${bad + 1} needs ${!q.label.trim() ? "some question text" : "at least one option"} before you can save.`;
      render();
      return;
    }
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = "Saving…";
    const clean = {
      open: !!d.open,
      intro: d.intro || "",
      questions: d.questions.map((q) => {
        const o = { id: q.id || newId(), label: q.label.trim(), type: q.type, required: !!q.required, help: (q.help || "").trim() };
        if (HAS_OPTIONS.includes(q.type)) o.options = q.options;
        return o;
      }),
    };
    try {
      await api.saveForm(clean);
      S.form = clean;
      S.draft = clone(clean);
      S.dirty = false;
      S.msg = "";
    } catch (err) {
      S.msg = "Couldn't save the questions. " + friendlyError(err);
    }
    render();
  });
}

addEventListener("beforeunload", (e) => {
  if (S.dirty) { e.preventDefault(); e.returnValue = ""; }
});

/* ------------------------- start ------------------------- */
api.onAuth(async (user) => {
  S.user = user;
  if (!user) {
    S.apps = [];
    S.form = S.draft = null;
    renderLogin();
    return;
  }
  root.innerHTML = '<p class="empty panel">Loading…</p>';
  await loadForm();
  render();
  loadApps();
});
