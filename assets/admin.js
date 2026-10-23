import api, { QUESTION_TYPES, HAS_OPTIONS, USERNAME_RULE, FORMATS, friendlyError, normalizeForm, avatarUrl } from "./backend.js";

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
  roleFilter: "all",
  form: null,
  draft: null,
  dirty: false,
  msg: "",
  admins: [],
  adminsLoaded: false,
  confirmRemove: null,
  note: "",
  bans: [],
  banFor: null,
  confirmUnban: null,
  kind: "apply",
  applyForm: null,
  appealForm: null,
  appeals: [],
  appealFilter: "pending",
  appealType: "all",
  viewId: null,
  confirmClearAppeals: false,
  confirmDelete: false,
  fileUrls: {},
  logs: [],
  logsLoaded: false,
  logActor: "all",
  logType: "all",
  logSearch: "",
  confirmClearLogs: false,
  justLoggedIn: false,
};
/* Record an admin action for the owner's log. Never blocks the action itself. */
function logAction(action, summary, details) {
  try { api.log(action, summary, details).catch(() => {}); } catch (e) {}
}
const isBanned = (discordId) => !!discordId && S.bans.some((b) => String(b.discordId || b.id) === String(discordId));

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
      S.justLoggedIn = true;
      await api.login(f.u.value, f.p.value);
    } catch (err) {
      S.justLoggedIn = false;
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
    const [apps, bans, appeals] = await Promise.all([api.list(), api.listBans().catch(() => S.bans), api.listAppeals().catch(() => S.appeals)]);
    S.appeals = appeals.filter((a) => a.submitted !== false || Date.now() - a.createdAt > 3600e3).sort((a, b) => b.createdAt - a.createdAt);
    S.apps = apps.sort((a, b) => b.createdAt - a.createdAt);
    S.bans = bans.sort((a, b) => b.createdAt - a.createdAt);
    S.msg = "";
  } catch (e) {
    S.msg = "Couldn't load applications. " + friendlyError(e);
  }
  S.loadingApps = false;
  render();
}
async function loadForm() {
  try {
    S.applyForm = normalizeForm(await api.getForm(), "apply");
  } catch (e) {
    S.msg = "Couldn't load the questions. " + friendlyError(e);
    S.applyForm = normalizeForm(null, "apply");
  }
  try {
    S.appealForm = normalizeForm(await api.getAppealForm(), "appeal");
  } catch (e) {
    S.appealForm = normalizeForm(null, "appeal");
  }
  useKind(S.kind);
}
function useKind(kind) {
  S.kind = kind;
  S.form = kind === "appeal" ? S.appealForm : S.applyForm;
  S.draft = clone(S.form);
  S.dirty = false;
}

/* ------------------------- shell ------------------------- */
function render() {
  if (!S.user) return;
  const counts = { pending: 0, accepted: 0, rejected: 0 };
  S.apps.filter(roleMatch).forEach((a) => (counts[a.status] = (counts[a.status] || 0) + 1));
  const allPending = S.apps.filter((a) => a.status === "pending").length;
  const appealsPending = S.appeals.filter((a) => a.status === "pending").length;
  root.innerHTML = `
  <div class="admin-bar">
    <div class="tabs" role="tablist">
      <button role="tab" class="tab-btn" aria-selected="${S.tab === "apps"}" data-tab="apps">Applications${allPending ? `<span class="badge">${allPending}</span>` : ""}</button>
      <button role="tab" class="tab-btn" aria-selected="${S.tab === "appeals"}" data-tab="appeals">Appeals${appealsPending ? `<span class="badge">${appealsPending}</span>` : ""}</button>
      <button role="tab" class="tab-btn" aria-selected="${S.tab === "questions"}" data-tab="questions">Questions${S.dirty ? '<span class="badge warn">unsaved</span>' : ""}</button>
      <button role="tab" class="tab-btn" aria-selected="${S.tab === "bans"}" data-tab="bans">Bans${S.bans.length ? `<span class="badge red">${S.bans.length}</span>` : ""}</button>
      <button role="tab" class="tab-btn" aria-selected="${S.tab === "admins"}" data-tab="admins">Admins</button>
      ${S.user.owner ? `<button role="tab" class="tab-btn" aria-selected="${S.tab === "logs"}" data-tab="logs">Logs</button>` : ""}
    </div>
    <div class="who">${api.demo ? '<span class="chip" style="--c:var(--gold)">Demo</span>' : ""}Signed in as <b>${esc(S.user.name)}</b><button class="pxbtn" id="logout" type="button">Log out</button></div>
  </div>
  ${S.msg ? `<p class="form-err" role="alert">${esc(S.msg)}</p>` : ""}
  <div id="view">${S.tab === "apps" ? appsView(counts) : S.tab === "questions" ? questionsView() : S.tab === "bans" ? bansView() : S.tab === "appeals" ? appealsView() : S.tab === "logs" ? logsView() : adminsView()}</div>
  ${S.viewId ? viewerHTML() : ""}`;

  root.querySelectorAll("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      S.tab = b.dataset.tab; S.msg = ""; S.note = ""; S.confirmRemove = null;
      render();
      if (S.tab === "admins" && !S.adminsLoaded) loadAdmins();
      if (S.tab === "logs" && !S.logsLoaded) loadLogs();
    })
  );
  document.getElementById("logout").addEventListener("click", () => api.logout());
  if (S.tab === "apps") bindApps();
  else if (S.tab === "questions") bindQuestions();
  else if (S.tab === "bans") bindBans();
  else if (S.tab === "appeals") bindAppeals();
  else if (S.tab === "logs") bindLogs();
  else bindAdmins();
  if (S.viewId) bindViewer();
}

/* ------------------------- applications ------------------------- */
const STATUS_LABEL = { pending: "Pending", accepted: "Accepted", rejected: "Rejected" };
const STATUS_COL = { pending: "var(--ice)", accepted: "#5ee38a", rejected: "#ff6b6b" };

function roleOf(a) {
  const r = (a.answers || []).find((x) => x.type === "role");
  return r ? r.value : "";
}
function roleMatch(a) {
  if (S.roleFilter === "all") return true;
  const role = S.applyForm && S.applyForm.roles.find((r) => r.id === S.roleFilter);
  return !!role && roleOf(a).toLowerCase() === role.name.toLowerCase();
}
function titleFor(a) {
  const first = (a.answers || []).find((x) => x.value && x.type !== "role");
  return first ? first.value : "Untitled application";
}
function subtitleFor(a) {
  const ans = a.answers || [];
  const role = ans.find((x) => x.type === "role" && x.value) || ans.find((x) => /role|position|applying/i.test(x.q) && x.value);
  const disc = a.discordName ? "@" + a.discordName : (ans.find((x) => /discord/i.test(x.q) && x.value) || {}).value;
  return [role && role.value, disc].filter(Boolean).join(" • ");
}

function appsView(counts) {
  const list = S.apps.filter((a) => a.status === S.filter && roleMatch(a));
  const roleSel = `<select class="inp role-filter" id="roleFilter" aria-label="Filter by role">
      <option value="all">All roles</option>
      ${S.applyForm.roles.map((r) => `<option value="${esc(r.id)}"${S.roleFilter === r.id ? " selected" : ""}>${esc(r.name)}</option>`).join("")}
    </select>`;
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
    <div class="subtabs">${filters}${roleSel}</div>
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
  const banned = isBanned(a.discordId);
  const discord = a.discordId
    ? `<div class="dc-card">
        <img src="${esc(avatarUrl(a.discordId, a.discordAvatar, 64))}" alt="" width="44" height="44">
        <div class="dc-id"><b>${esc(a.discordDisplay || a.discordName)}</b><span>@${esc(a.discordName)} · ID <code>${esc(a.discordId)}</code>
          <button class="linkbtn" type="button" data-copy="${esc(a.discordId)}">Copy ID</button></span></div>
        ${banned
          ? `<span class="chip" style="--c:#ff6b6b">Banned</span><button class="pxbtn" type="button" data-unban="${esc(a.discordId)}">Unban</button>`
          : `<button class="btn-danger ghost" type="button" data-banopen="${a.id}">Ban from applying</button>`}
      </div>
      ${S.banFor === a.id && !banned ? `<form class="ban-form" data-banform="${a.id}">
          <label class="q-label" for="br_${a.id}">Reason <span class="opt">(the applicant will see this)</span></label>
          <input class="inp" id="br_${a.id}" name="reason" maxlength="200" placeholder="e.g. Spam applications">
          <label class="pill-check"><input type="checkbox" name="reject" checked><span>Also reject their pending applications</span></label>
          <div class="app-actions"><button class="btn-danger" type="submit">Ban ${esc(a.discordName)}</button><button class="pxbtn" type="button" data-bancancel>Cancel</button></div>
        </form>` : ""}`
    : '<p class="help">Sent before Discord login was required, so there\'s no Discord account linked.</p>';
  return `<article class="app panel${open ? " open" : ""}" style="--c:${STATUS_COL[a.status] || "var(--ice)"}">
    <button class="app-head" type="button" data-open="${a.id}" aria-expanded="${open}">
      ${a.discordId ? `<img class="app-av" src="${esc(avatarUrl(a.discordId, a.discordAvatar, 64))}" alt="" width="36" height="36">` : '<span class="app-av"></span>'}
      <span class="app-title"><b>${esc(titleFor(a))}${banned ? ' <span class="chip" style="--c:#ff6b6b">Banned</span>' : ""}</b><small>${esc(subtitleFor(a))}</small></span>
      <span class="app-date">${fmt(a.createdAt)}</span>
      <span class="chev" aria-hidden="true">▸</span>
    </button>
    ${open ? `<div class="app-body">${discord}<dl>${answers}</dl><div class="app-actions">${actions}</div></div>` : ""}
  </article>`;
}

function bindBanButtons() {
  root.querySelectorAll("[data-copy]").forEach((b) =>
    b.addEventListener("click", () => {
      const done = () => { b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy ID"), 1500); };
      try { navigator.clipboard.writeText(b.dataset.copy).then(done, () => {}); } catch (e) {}
    })
  );
  root.querySelectorAll("[data-banopen]").forEach((b) => b.addEventListener("click", () => {
    S.banFor = b.dataset.banopen;
    render();
    const inp = root.querySelector(`[data-banform="${S.banFor}"] input[name=reason]`);
    if (inp) inp.focus();
  }));
  root.querySelectorAll("[data-bancancel]").forEach((b) => b.addEventListener("click", () => { S.banFor = null; render(); }));
  root.querySelectorAll("[data-banform]").forEach((f) =>
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const a = S.apps.find((x) => x.id === f.dataset.banform);
      if (!a) return;
      const btn = f.querySelector("button[type=submit]");
      btn.disabled = true;
      btn.textContent = "Banning…";
      try {
        await api.ban(a.discordId, { discordName: a.discordName, reason: f.reason.value.trim() });
        let rejected = 0;
        if (f.reject.checked) {
          const mine = S.apps.filter((x) => x.discordId === a.discordId && x.status === "pending");
          for (const x of mine) { await api.setStatus(x.id, "rejected"); x.status = "rejected"; rejected++; }
        }
        logAction("ban", `Banned @${a.discordName} from applying${f.reason.value.trim() ? ` (reason: ${f.reason.value.trim()})` : ""}${rejected ? `, and rejected ${rejected} pending application${rejected === 1 ? "" : "s"}` : ""}`, { discordId: a.discordId });
        S.bans = await api.listBans();
        S.msg = "";
      } catch (err) {
        S.msg = "Couldn't ban that user. " + friendlyError(err);
      }
      S.banFor = null;
      render();
    })
  );
  root.querySelectorAll("[data-unban]").forEach((b) =>
    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        await api.unban(b.dataset.unban);
        const was = S.bans.find((x) => String(x.discordId || x.id) === b.dataset.unban);
        logAction("unban", `Unbanned ${was && was.discordName ? "@" + was.discordName : "Discord ID " + b.dataset.unban}`, { discordId: b.dataset.unban });
        S.bans = S.bans.filter((x) => String(x.discordId || x.id) !== b.dataset.unban);
        S.msg = "";
      } catch (err) {
        S.msg = "Couldn't unban that user. " + friendlyError(err);
      }
      S.confirmUnban = null;
      render();
    })
  );
}

function bindApps() {
  bindBanButtons();
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
        if (a) {
          const verb = { accepted: "Accepted", rejected: "Rejected", pending: "Moved back to pending" }[status];
          logAction("application." + status, `${verb} the ${roleOf(a) || "staff"} application from ${titleFor(a)}${a.discordName ? " (@" + a.discordName + ")" : ""}${a.status !== "pending" && status !== "pending" ? ` (was ${a.status})` : ""}`, { applicationId: id, discordId: a.discordId || "" });
        }
        if (a) a.status = status;
        S.openId = null;
        S.msg = "";
      } catch (e) {
        S.msg = "Couldn't update that application. " + friendlyError(e);
      }
      render();
    })
  );
  const rf = document.getElementById("roleFilter");
  if (rf) rf.addEventListener("change", () => { S.roleFilter = rf.value; S.openId = null; S.confirmClear = false; render(); });
  const r = document.getElementById("refresh");
  if (r) r.addEventListener("click", loadApps);
  const c = document.getElementById("clearList");
  if (c) c.addEventListener("click", () => { S.confirmClear = true; render(); });
  const n = document.getElementById("clearNo");
  if (n) n.addEventListener("click", () => { S.confirmClear = false; render(); });
  const y = document.getElementById("clearYes");
  if (y)
    y.addEventListener("click", async () => {
      const ids = S.apps.filter((a) => a.status === S.filter && roleMatch(a)).map((a) => a.id);
      y.disabled = true;
      y.textContent = "Clearing…";
      try {
        await api.remove(ids);
        logAction("application.clear", `Cleared the ${S.filter} applications list (${ids.length} deleted)`, { count: ids.length });
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
function validationEditor(q, i) {
  const v = q.v || {};
  const n = (k, label, ph) => `<label class="vbox"><span>${label}</span><input class="inp" type="number" data-v="${k}" value="${esc(v[k] ?? "")}" placeholder="${ph}" min="0"></label>`;
  let inner = "";
  if (q.type === "short") {
    inner = `<label class="vbox wide"><span>Answer must be</span><select class="inp" data-v="format">${Object.entries(FORMATS)
      .map(([k, f]) => `<option value="${k}"${(v.format || "") === k ? " selected" : ""}>${esc(f.label)}</option>`).join("")}</select></label>
      ${n("min", "Min characters", "none")}${n("max", "Max characters", "200")}`;
  } else if (q.type === "paragraph") {
    inner = `${n("min", "Min characters", "none")}${n("max", "Max characters", "3000")}`;
  } else if (q.type === "number") {
    inner = `${n("min", "Lowest allowed", "none")}${n("max", "Highest allowed", "none")}
      <label class="switch"><input type="checkbox" data-v="whole"${v.whole ? " checked" : ""}><span class="sw"></span>Whole numbers only</label>`;
  } else if (q.type === "checkboxes") {
    inner = `${n("min", "Pick at least", "none")}${n("max", "Pick at most", "none")}`;
  } else {
    return "";
  }
  return `<p class="q-label">Answer rules</p><div class="vrow">${inner}</div>`;
}

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
        ${validationEditor(q, i)}
        <p class="q-label">Ask this for</p>
        <div class="askfor">
          <label class="pill-check"><input type="checkbox" data-askall${!q.roles || !q.roles.length ? " checked" : ""}><span>All roles</span></label>
          ${d.roles.map((r) => `<label class="pill-check"><input type="checkbox" data-askrole="${esc(r.id)}"${q.roles && q.roles.includes(r.id) ? " checked" : ""}><span>${esc(r.name)}${r.open ? "" : " (closed)"}</span></label>`).join("")}
        </div>
      </div>`;
    })
    .join("");

  const ap = S.kind === "appeal";
  const word = ap ? "Appeals" : "Applications";
  return `
  <div class="kind-switch" role="tablist" aria-label="Which form">
    <button class="sub-btn" type="button" data-kind="apply" aria-pressed="${!ap}" style="--c:var(--ice)">Staff application form</button>
    <button class="sub-btn" type="button" data-kind="appeal" aria-pressed="${ap}" style="--c:var(--gold)">Appeal form</button>
  </div>
  <div class="panel settings">
    <h3>${ap ? "Appeal form settings" : "Application form settings"}</h3>
    <label class="switch big"><input type="checkbox" id="openToggle"${d.open ? " checked" : ""}><span class="sw"></span>${word} are <b>${d.open ? "open" : "closed"}</b></label>
    <label class="q-label" for="intro">Intro text <span class="opt">(shown at the top of the form)</span></label>
    <textarea class="inp" id="intro" rows="3">${esc(d.intro || "")}</textarea>
    <p class="q-label">${ap ? "Punishments people can appeal" : "Roles open for applications"}</p>
    <div class="role-toggles">
      ${d.roles.map((r) => `<label class="switch role-toggle"><input type="checkbox" data-roleopen="${esc(r.id)}"${r.open ? " checked" : ""}><span class="sw"></span><span><b>${esc(r.name)}</b> <small>${r.open ? "Open" : "Closed"}</small></span></label>`).join("")}
    </div>
    ${d.open && !d.roles.some((r) => r.open) ? `<p class="help" style="color:var(--gold)">Everything above is switched off, so the ${ap ? "Appeal" : "Apply"} page will show as closed.</p>` : ""}
    ${ap ? `<p class="q-label">Evidence uploads</p>
    <div class="role-toggles">
      <label class="switch role-toggle"><input type="checkbox" id="filesOn"${d.files.enabled !== false ? " checked" : ""}><span class="sw"></span><span><b>Allow file uploads</b> <small>up to 5 images or videos, 25 MB each</small></span></label>
      <label class="switch role-toggle"><input type="checkbox" id="filesReq"${d.files.required ? " checked" : ""}${d.files.enabled === false ? " disabled" : ""}><span class="sw"></span><span><b>Require at least one file</b></span></label>
    </div>` : ""}
  </div>
  <div class="qlist">${qs || '<p class="empty panel">No questions yet. Add your first one below.</p>'}</div>
  <button class="pxbtn add-q" id="addQ" type="button">+ Add question</button>
  <div class="savebar${S.dirty ? " dirty" : ""}">
    <span>${S.dirty ? "You have unsaved changes." : "All changes saved."}</span>
    <a class="pxbtn" href="${S.kind === "appeal" ? "appeal.html" : "apply.html"}" target="_blank" rel="noopener">View form</a>
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
  view.querySelectorAll("[data-kind]").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.kind === S.kind) return;
      if (S.dirty) { S.msg = "Save or discard your changes to this form first."; return render(); }
      S.msg = "";
      useKind(b.dataset.kind);
      render();
    })
  );
  const fOn = document.getElementById("filesOn");
  if (fOn) fOn.addEventListener("change", () => { d.files = { ...d.files, enabled: fOn.checked, required: fOn.checked && d.files.required }; S.dirty = true; render(); });
  const fReq = document.getElementById("filesReq");
  if (fReq) fReq.addEventListener("change", () => { d.files = { ...d.files, required: fReq.checked }; S.dirty = true; render(); });
  view.querySelectorAll("[data-roleopen]").forEach((el) =>
    el.addEventListener("change", () => {
      const r = d.roles.find((x) => x.id === el.dataset.roleopen);
      r.open = el.checked;
      S.dirty = true;
      render();
    })
  );
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
    card.querySelectorAll("[data-v]").forEach((el) => {
      el.addEventListener(el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input", () => {
        q.v = { ...(q.v || {}) };
        const k = el.dataset.v;
        if (el.type === "checkbox") q.v[k] = el.checked;
        else q.v[k] = el.value === "" ? "" : el.tagName === "SELECT" ? el.value : Number(el.value);
        markDirty();
      });
    });
    card.querySelector("[data-askall]").addEventListener("change", (e) => {
      if (e.target.checked) q.roles = [];
      else q.roles = d.roles.map((r) => r.id);
      S.dirty = true;
      render();
    });
    card.querySelectorAll("[data-askrole]").forEach((el) =>
      el.addEventListener("change", () => {
        const set = new Set(q.roles || []);
        if (el.checked) set.add(el.dataset.askrole); else set.delete(el.dataset.askrole);
        q.roles = d.roles.map((r) => r.id).filter((id) => set.has(id));
        if (q.roles.length === d.roles.length) q.roles = [];
        S.dirty = true;
        render();
      })
    );
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
    const badRange = d.questions.findIndex((q) => q.v && q.v.min !== "" && q.v.max !== "" && q.v.min != null && q.v.max != null && Number(q.v.min) > Number(q.v.max));
    if (badRange !== -1) {
      S.msg = `Question ${badRange + 1}: the minimum is bigger than the maximum.`;
      render();
      return;
    }
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
      roles: d.roles.map((r) => ({ id: r.id, name: r.name, open: !!r.open, blurb: r.blurb || "" })),
      ...(S.kind === "appeal" ? { files: { enabled: d.files.enabled !== false, required: !!d.files.required } } : {}),
      questions: d.questions.map((q) => {
        const o = { id: q.id || newId(), label: q.label.trim(), type: q.type, required: !!q.required, help: (q.help || "").trim() };
        if (HAS_OPTIONS.includes(q.type)) o.options = q.options;
        if (q.roles && q.roles.length) o.roles = q.roles;
        const v = {};
        Object.entries(q.v || {}).forEach(([k, val]) => { if (val !== "" && val !== false && val !== null && val !== undefined) v[k] = val; });
        if (Object.keys(v).length) o.v = v;
        return o;
      }),
    };
    try {
      if (S.kind === "appeal") {
        await api.saveAppealForm(clean);
        logAction("questions.appeal", `Saved the appeal form (${clean.questions.length} questions, appeals ${clean.open ? "open" : "closed"})`, {});
        S.appealForm = normalizeForm(clean, "appeal");
      } else {
        await api.saveForm(clean);
        logAction("questions.apply", `Saved the staff application form (${clean.questions.length} questions, applications ${clean.open ? "open" : "closed"})`, {});
        S.applyForm = normalizeForm(clean, "apply");
      }
      S.form = S.kind === "appeal" ? S.appealForm : S.applyForm;
      S.draft = clone(S.form);
      S.dirty = false;
      S.msg = "";
    } catch (err) {
      S.msg = "Couldn't save the questions. " + friendlyError(err);
    }
    render();
  });
}

/* ------------------------- appeals ------------------------- */
const APPEAL_LABEL = { pending: "Pending", accepted: "Accepted", denied: "Denied" };
const APPEAL_COL = { pending: "var(--ice)", accepted: "#5ee38a", denied: "#ff6b6b" };
const appealTypeMatch = (a) => S.appealType === "all" || a.typeId === S.appealType;
const appealTitle = (a) => ((a.answers || []).find((x) => x.value) || {}).value || a.discordDisplay || "Appeal";
const sizeText = (b) => (b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB");

function appealsView() {
  const counts = { pending: 0, accepted: 0, denied: 0 };
  S.appeals.filter(appealTypeMatch).forEach((a) => (counts[a.status] = (counts[a.status] || 0) + 1));
  const list = S.appeals.filter((a) => a.status === S.appealFilter && appealTypeMatch(a));
  const filters = ["pending", "accepted", "denied"]
    .map((f) => `<button class="sub-btn" aria-pressed="${S.appealFilter === f}" data-afilter="${f}" style="--c:${APPEAL_COL[f]}">${APPEAL_LABEL[f]} <span>${counts[f] || 0}</span></button>`)
    .join("");
  const typeSel = `<select class="inp role-filter" id="appealType" aria-label="Filter by punishment">
      <option value="all">All punishments</option>
      ${S.appealForm.roles.map((r) => `<option value="${esc(r.id)}"${S.appealType === r.id ? " selected" : ""}>${esc(r.name)}</option>`).join("")}
    </select>`;
  const canClear = S.appealFilter !== "pending" && list.length > 0;
  const clear = !canClear ? "" : S.confirmClearAppeals
    ? `<span class="confirm">Delete all ${list.length} ${S.appealFilter} appeals and their files? This can't be undone.
         <button class="btn-danger" id="clearAppealsYes" type="button">Yes, clear list</button>
         <button class="pxbtn" id="clearAppealsNo" type="button">Cancel</button></span>`
    : `<button class="btn-danger ghost" id="clearAppeals" type="button">Clear ${S.appealFilter} list</button>`;
  const items = list.length
    ? list.map((a) => `<article class="app panel" style="--c:${APPEAL_COL[a.status]}">
        <button class="app-head" type="button" data-view="${esc(a.id)}">
          <img class="app-av" src="${esc(avatarUrl(a.discordId, a.discordAvatar, 64))}" alt="" width="36" height="36">
          <span class="app-title"><b>${esc(appealTitle(a))}</b><small>${esc(a.type)} • @${esc(a.discordName)}${(a.files || []).length ? ` • ${a.files.length} file${a.files.length === 1 ? "" : "s"}` : ""}</small></span>
          <span class="app-date">${fmt(a.createdAt)}</span>
          <span class="chev" aria-hidden="true">▸</span>
        </button>
      </article>`).join("")
    : `<p class="empty panel">No ${S.appealFilter} appeals.</p>`;
  return `
  <div class="toolbar">
    <div class="subtabs">${filters}${typeSel}</div>
    <div class="toolbar-right">${clear}<button class="pxbtn" id="refreshAppeals" type="button">Refresh</button></div>
  </div>
  <div class="app-list">${items}</div>`;
}

function bindAppeals() {
  root.querySelectorAll("[data-afilter]").forEach((b) => b.addEventListener("click", () => { S.appealFilter = b.dataset.afilter; S.confirmClearAppeals = false; render(); }));
  const t = document.getElementById("appealType");
  t.addEventListener("change", () => { S.appealType = t.value; S.confirmClearAppeals = false; render(); });
  root.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => openViewer(b.dataset.view)));
  document.getElementById("refreshAppeals").addEventListener("click", loadApps);
  const c = document.getElementById("clearAppeals");
  if (c) c.addEventListener("click", () => { S.confirmClearAppeals = true; render(); });
  const n = document.getElementById("clearAppealsNo");
  if (n) n.addEventListener("click", () => { S.confirmClearAppeals = false; render(); });
  const y = document.getElementById("clearAppealsYes");
  if (y) y.addEventListener("click", async () => {
    const ids = S.appeals.filter((a) => a.status === S.appealFilter && appealTypeMatch(a)).map((a) => a.id);
    y.disabled = true;
    y.textContent = "Clearing…";
    try {
      await api.deleteAppeals(ids);
      S.appeals = S.appeals.filter((a) => !ids.includes(a.id));
      S.msg = "";
    } catch (e) {
      S.msg = "Couldn't clear the list. " + friendlyError(e);
    }
    S.confirmClearAppeals = false;
    render();
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && S.viewId && !e.defaultPrevented) closeViewer();
});

addEventListener("hashchange", () => {
  const m = /^#appeal-([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (m && S.user && S.user.admin && S.viewId !== m[1]) {
    S.tab = "appeals";
    const a = S.appeals.find((x) => x.id === m[1]);
    if (a) S.appealFilter = a.status;
    openViewer(m[1]);
  }
});

function openViewer(id) {
  S.viewId = id;
  S.confirmDelete = false;
  S.viewNote = "";
  try { history.replaceState(null, "", "#appeal-" + id); } catch (e) {}
  render();
  const dlg = document.querySelector(".viewer");
  if (dlg) dlg.focus();
}
function closeViewer() {
  S.viewId = null;
  try { history.replaceState(null, "", location.pathname); } catch (e) {}
  render();
}

function viewerHTML() {
  const a = S.appeals.find((x) => x.id === S.viewId);
  if (!a) {
    return `<div class="viewer-back"><div class="viewer panel" role="dialog" aria-modal="true" tabindex="-1">
      <div class="viewer-head"><h2>Appeal not found</h2><button class="pop-x" type="button" data-close aria-label="Close">✕</button></div>
      <p class="help">It may have been deleted, or the list needs refreshing.</p></div></div>`;
  }
  const answers = (a.answers || []).map((x) => `<div class="ans"><dt>${esc(x.q)}</dt><dd>${x.value ? esc(x.value) : '<span class="none">No answer</span>'}</dd></div>`).join("");
  const files = (a.files || []).map((f) => {
    const key = a.id + "/" + f.n;
    const url = S.fileUrls[key];
    const isVid = (f.type || "").startsWith("video/");
    const media = !url
      ? `<div class="media-ph" data-load="${esc(key)}">${url === null ? "Couldn't load" : "Loading…"}</div>`
      : isVid
      ? `<video src="${esc(url)}" controls preload="metadata"></video>`
      : `<a href="${esc(url)}" target="_blank" rel="noopener" title="Open full size"><img src="${esc(url)}" alt="${esc(f.name)}"></a>`;
    return `<figure class="media">${media}<figcaption>${esc(f.name)} · ${sizeText(f.size || 0)}${url ? ` · <a href="${esc(url)}" download="${esc(f.name)}">Download</a>` : ""}</figcaption></figure>`;
  }).join("");
  const decided = a.status !== "pending";
  const verdictBox = decided
    ? `<div class="verdict-box" style="--c:${APPEAL_COL[a.status]}">
        <p><span class="chip" style="--c:${APPEAL_COL[a.status]}">${APPEAL_LABEL[a.status]}</span> by <b>${esc(a.decidedBy || "staff")}</b>${a.decidedAt ? " · " + fmt(a.decidedAt) : ""}</p>
        ${a.verdictNote ? `<p class="ma-note"><b>Message sent:</b> ${esc(a.verdictNote)}</p>` : ""}
        <p class="help">${a.dmSent ? "✓ The player was sent the verdict in their Discord DMs." : `✕ Couldn't DM the player${a.dmError ? ` (${esc(a.dmError)})` : ""}. They can still see the verdict on the Appeal page.`}</p>
      </div>`
    : "";
  return `<div class="viewer-back" data-close-back>
    <div class="viewer panel" role="dialog" aria-modal="true" aria-labelledby="vTitle" tabindex="-1" style="--c:${APPEAL_COL[a.status]}">
      <div class="viewer-head">
        <div><p class="eyebrow-s">${esc(a.type)} appeal · ${fmt(a.createdAt)}</p><h2 id="vTitle">${esc(appealTitle(a))}</h2></div>
        <button class="pop-x" type="button" data-close aria-label="Close">✕</button>
      </div>
      <div class="dc-card">
        <img src="${esc(avatarUrl(a.discordId, a.discordAvatar, 64))}" alt="" width="44" height="44">
        <div class="dc-id"><b>${esc(a.discordDisplay || a.discordName)}</b><span>@${esc(a.discordName)} · ID <code>${esc(a.discordId)}</code>
          <button class="linkbtn" type="button" data-copy="${esc(a.discordId)}">Copy ID</button></span></div>
      </div>
      <dl>${answers}</dl>
      ${files ? `<h3 class="v-sub">Evidence</h3><div class="media-grid">${files}</div>` : '<p class="help">No files were attached.</p>'}
      ${verdictBox}
      <div class="verdict-form">
        <label class="q-label" for="vNote">${decided ? "Change the verdict" : "Verdict"} <span class="opt">(optional message, sent to the player)</span></label>
        <textarea class="inp" id="vNote" rows="3" maxlength="1000" placeholder="e.g. Your ban has been removed. Please follow the rules from now on.">${esc(S.viewNote || "")}</textarea>
        <div class="app-actions">
          <button class="btn-ok" type="button" data-verdict="accepted"${a.status === "accepted" ? " disabled" : ""}>${decided ? "Accept instead" : "Accept appeal"}</button>
          <button class="btn-danger" type="button" data-verdict="denied"${a.status === "denied" ? " disabled" : ""}>${decided ? "Deny instead" : "Deny appeal"}</button>
          <span class="grow"></span>
          ${S.confirmDelete
            ? `<span class="confirm">Delete this appeal and its files? <button class="btn-danger" type="button" id="delYes">Yes, delete</button><button class="pxbtn" type="button" id="delNo">Cancel</button></span>`
            : `<button class="btn-danger ghost" type="button" id="delAppeal">Delete appeal</button>`}
        </div>
        <p class="help">Remember to actually remove the punishment in-game or on Discord when you accept an appeal.</p>
      </div>
    </div>
  </div>`;
}

function bindViewer() {
  const back = document.querySelector(".viewer-back");
  if (!back) return;
  back.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeViewer));
  back.addEventListener("click", (e) => { if (e.target === back) closeViewer(); });
  bindBanButtons();
  const note = document.getElementById("vNote");
  if (note) note.addEventListener("input", () => (S.viewNote = note.value));

  // load files (admins only, through the Worker)
  back.querySelectorAll("[data-load]").forEach(async (ph) => {
    const key = ph.dataset.load;
    if (key in S.fileUrls) return;
    S.fileUrls[key] = undefined;
    const [id, n] = [key.slice(0, key.lastIndexOf("/")), Number(key.slice(key.lastIndexOf("/") + 1))];
    try {
      S.fileUrls[key] = await api.appealFileUrl(id, n);
    } catch (e) {
      S.fileUrls[key] = null;
    }
    if (S.viewId === id) { const keepNote = S.viewNote; render(); S.viewNote = keepNote; }
  });

  back.querySelectorAll("[data-verdict]").forEach((b) =>
    b.addEventListener("click", async () => {
      const a = S.appeals.find((x) => x.id === S.viewId);
      const verdict = b.dataset.verdict;
      back.querySelectorAll("[data-verdict]").forEach((x) => (x.disabled = true));
      b.textContent = verdict === "accepted" ? "Accepting…" : "Denying…";
      try {
        const res = await api.appealVerdict(a.id, verdict, (S.viewNote || "").trim());
        Object.assign(a, { status: verdict, verdictNote: (S.viewNote || "").trim(), decidedBy: S.user.name, decidedAt: Date.now(), dmSent: !!res.dmSent, dmError: res.dmError || "" });
        S.viewNote = "";
        S.msg = "";
      } catch (e) {
        S.msg = "Couldn't save the verdict. " + (e.message || friendlyError(e));
      }
      render();
    })
  );
  const del = document.getElementById("delAppeal");
  if (del) del.addEventListener("click", () => { S.confirmDelete = true; render(); });
  const no = document.getElementById("delNo");
  if (no) no.addEventListener("click", () => { S.confirmDelete = false; render(); });
  const yes = document.getElementById("delYes");
  if (yes) yes.addEventListener("click", async () => {
    yes.disabled = true;
    try {
      await api.deleteAppeals([S.viewId]);
      S.appeals = S.appeals.filter((x) => x.id !== S.viewId);
      S.msg = "";
      closeViewer();
      return;
    } catch (e) {
      S.msg = "Couldn't delete the appeal. " + friendlyError(e);
    }
    render();
  });
}

/* ------------------------- logs (owners only) ------------------------- */
const LOG_TYPES = {
  application: ["Applications", "var(--ice)"],
  appeal: ["Appeals", "var(--gold)"],
  ban: ["Bans", "#ff6b6b"],
  unban: ["Bans", "#ff6b6b"],
  questions: ["Questions", "#c9a7ff"],
  admin: ["Admins", "#7c8cff"],
  password: ["Admins", "#7c8cff"],
  login: ["Logins", "var(--muted)"],
  logs: ["Logins", "var(--muted)"],
};
const logGroup = (action) => {
  const k = String(action || "").split(".")[0];
  return { key: (LOG_TYPES[k] || ["Other"])[0], col: (LOG_TYPES[k] || [0, "var(--muted)"])[1] };
};
const dayLabel = (ms) => {
  const d = new Date(ms), t = new Date();
  const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};

async function loadLogs() {
  try {
    S.logs = (await api.listLogs(500)).sort((a, b) => b.at - a.at);
    S.logsLoaded = true;
    S.msg = "";
  } catch (e) {
    S.msg = "Couldn't load the logs. " + friendlyError(e);
  }
  if (S.tab === "logs") render();
}

function filteredLogs() {
  const q = S.logSearch.trim().toLowerCase();
  return S.logs.filter((l) =>
    (S.logActor === "all" || l.actor === S.logActor) &&
    (S.logType === "all" || logGroup(l.action).key === S.logType) &&
    (!q || (l.summary || "").toLowerCase().includes(q) || (l.actor || "").toLowerCase().includes(q))
  );
}

function logsView() {
  if (!S.user.owner) return '<p class="empty panel">Only the owner can see the logs.</p>';
  if (!S.logsLoaded) return '<p class="empty panel">Loading logs…</p>';
  const actors = [...new Set(S.logs.map((l) => l.actor).filter(Boolean))].sort();
  const types = [...new Set(Object.values(LOG_TYPES).map((t) => t[0]))];
  const list = filteredLogs();
  let lastDay = "";
  const rows = list.map((l) => {
    const g = logGroup(l.action);
    const day = dayLabel(l.at);
    const head = day !== lastDay ? `<li class="log-day">${esc(day)}</li>` : "";
    lastDay = day;
    return `${head}<li class="log-row" style="--c:${g.col}">
      <span class="log-time">${new Date(l.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
      <span class="log-who">${esc(l.actor || "?")}</span>
      <span class="log-what">${esc(l.summary)}</span>
      <span class="chip" style="--c:${g.col}">${esc(g.key)}</span>
    </li>`;
  }).join("");
  const clear = !S.logs.length ? "" : S.confirmClearLogs
    ? `<span class="confirm">Delete all ${S.logs.length} log entries? This can't be undone. <button class="btn-danger" id="clearLogsYes" type="button">Yes, clear logs</button><button class="pxbtn" id="clearLogsNo" type="button">Cancel</button></span>`
    : `<button class="btn-danger ghost" id="clearLogs" type="button">Clear logs</button>`;
  return `
  <p class="help" style="margin-bottom:14px">Everything admins do in the panel is recorded here. Only owners can see this tab, and admins can't edit or delete entries.</p>
  <div class="toolbar">
    <div class="subtabs">
      <select class="inp role-filter" id="logActor" aria-label="Filter by admin"><option value="all">All admins</option>${actors.map((a) => `<option${S.logActor === a ? " selected" : ""}>${esc(a)}</option>`).join("")}</select>
      <select class="inp role-filter" id="logType" aria-label="Filter by action"><option value="all">All actions</option>${types.map((t) => `<option${S.logType === t ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>
      <input class="inp log-search" id="logSearch" type="search" placeholder="Search…" value="${esc(S.logSearch)}" aria-label="Search logs">
    </div>
    <div class="toolbar-right">${clear}<button class="pxbtn" id="refreshLogs" type="button">Refresh</button></div>
  </div>
  <div class="panel log-panel">
    ${list.length ? `<ul class="log-list">${rows}</ul>` : `<p class="empty">${S.logs.length ? "No entries match those filters." : "Nothing has been logged yet."}</p>`}
  </div>
  ${S.logs.length >= 500 ? '<p class="help" style="margin-top:10px">Showing the latest 500 entries.</p>' : ""}`;
}

function bindLogs() {
  if (!S.user.owner) return;
  const a = document.getElementById("logActor");
  if (!a) return;
  a.addEventListener("change", () => { S.logActor = a.value; render(); });
  const t = document.getElementById("logType");
  t.addEventListener("change", () => { S.logType = t.value; render(); });
  const q = document.getElementById("logSearch");
  q.addEventListener("input", () => {
    S.logSearch = q.value;
    const pos = q.selectionStart;
    render();
    const n = document.getElementById("logSearch");
    n.focus();
    n.setSelectionRange(pos, pos);
  });
  document.getElementById("refreshLogs").addEventListener("click", () => { S.logsLoaded = false; render(); loadLogs(); });
  const c = document.getElementById("clearLogs");
  if (c) c.addEventListener("click", () => { S.confirmClearLogs = true; render(); });
  const n = document.getElementById("clearLogsNo");
  if (n) n.addEventListener("click", () => { S.confirmClearLogs = false; render(); });
  const y = document.getElementById("clearLogsYes");
  if (y) y.addEventListener("click", async () => {
    y.disabled = true;
    y.textContent = "Clearing…";
    try {
      const count = S.logs.length;
      await api.clearLogs(S.logs.map((l) => l.id));
      S.logs = [];
      logAction("logs.clear", `Cleared the log (${count} entries)`, { count });
      await loadLogs();
    } catch (e) {
      S.msg = "Couldn't clear the logs. " + friendlyError(e);
    }
    S.confirmClearLogs = false;
    render();
  });
}

/* ------------------------- bans ------------------------- */
function bansView() {
  const rows = S.bans.length
    ? S.bans.map((b) => {
        const id = String(b.discordId || b.id);
        return `<li class="admin-row">
          <span class="admin-name"><img class="app-av" src="${esc(avatarUrl(id, "", 64))}" alt="" width="32" height="32"><b>${esc(b.discordName || "Unknown user")}</b><code>${esc(id)}</code></span>
          <span class="admin-meta">${b.reason ? "Reason: " + esc(b.reason) + " · " : ""}${b.bannedBy ? "Banned by " + esc(b.bannedBy) + " · " : ""}${fmt(b.createdAt)}</span>
          <span class="admin-act">${S.confirmUnban === id
            ? `<span class="confirm">Unban? <button class="btn-ok" type="button" data-unban="${esc(id)}">Yes, unban</button><button class="pxbtn" type="button" data-unban-no>Cancel</button></span>`
            : `<button class="pxbtn" type="button" data-unban-ask="${esc(id)}">Unban</button>`}</span>
        </li>`;
      }).join("")
    : '<li class="empty">Nobody is banned.</li>';
  return `
  <div class="admins-grid">
    <div class="panel admin-list" style="border-top-color:#ff6b6b">
      <h3>Banned from applying</h3>
      <p class="help">Banned Discord accounts can't send applications. The block is enforced by the database, so it can't be got around.</p>
      <ul>${rows}</ul>
    </div>
    <form class="panel admin-form" id="banForm" autocomplete="off">
      <h3>Ban a Discord account</h3>
      <p class="help">You can also ban someone straight from their application. To find a Discord ID, turn on Developer Mode in Discord (Settings → Advanced), then right-click the user and choose <b>Copy User ID</b>.</p>
      <label class="q-label" for="bid">Discord user ID</label>
      <input class="inp" id="bid" name="did" inputmode="numeric" required placeholder="e.g. 123456789012345678">
      <label class="q-label" for="bname">Name <span class="opt">(optional, just for your list)</span></label>
      <input class="inp" id="bname" name="dname" maxlength="40">
      <label class="q-label" for="breason">Reason <span class="opt">(the applicant will see this)</span></label>
      <input class="inp" id="breason" name="breason" maxlength="200">
      <button class="btn-danger" type="submit">Ban account</button>
    </form>
  </div>`;
}

function bindBans() {
  bindBanButtons();
  root.querySelectorAll("[data-unban-ask]").forEach((b) => b.addEventListener("click", () => { S.confirmUnban = b.dataset.unbanAsk; render(); }));
  root.querySelectorAll("[data-unban-no]").forEach((b) => b.addEventListener("click", () => { S.confirmUnban = null; render(); }));
  const f = document.getElementById("banForm");
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = f.elements.did.value.trim();
    if (!/^\d{17,20}$/.test(id)) { S.msg = "A Discord user ID is a long number, 17 to 20 digits."; return render(); }
    if (isBanned(id)) { S.msg = "That account is already banned."; return render(); }
    const btn = f.querySelector("button");
    btn.disabled = true;
    btn.textContent = "Banning…";
    try {
      const known = S.apps.find((a) => a.discordId === id);
      const bname = f.elements.dname.value.trim() || (known && known.discordName) || "";
      await api.ban(id, { discordName: bname, reason: f.elements.breason.value.trim() });
      logAction("ban", `Banned ${bname ? "@" + bname : "Discord ID " + id} from applying${f.elements.breason.value.trim() ? ` (reason: ${f.elements.breason.value.trim()})` : ""}`, { discordId: id });
      S.bans = (await api.listBans()).sort((a, b) => b.createdAt - a.createdAt);
      S.msg = "";
    } catch (err) {
      S.msg = "Couldn't ban that account. " + friendlyError(err);
    }
    render();
  });
}

/* ------------------------- admins ------------------------- */
async function loadAdmins() {
  let err = "";
  try {
    S.admins = (await api.listAdmins()).sort((a, b) => (b.owner - a.owner) || a.username.localeCompare(b.username));
    S.adminsLoaded = true;
  } catch (e) {
    err = "Couldn't load the admin list. " + friendlyError(e);
  }
  if (S.tab !== "admins") return;
  const ul = document.getElementById("adminRows");
  if (!ul) return render();
  ul.innerHTML = adminRows();
  bindRows();
  if (err) showNote(err, true);
}

function adminRows() {
  const owner = S.user.owner;
  if (!S.adminsLoaded) return '<li class="empty">Loading admins…</li>';
  return S.admins
    .map((a) => {
      const you = a.username === S.user.name;
      let act = "";
      if (owner && !a.owner && !you) {
        act = S.confirmRemove === a.uid
          ? `<span class="confirm">Remove ${esc(a.username)}?
               <button class="btn-danger" type="button" data-rm-yes="${esc(a.uid)}">Yes, remove</button>
               <button class="pxbtn" type="button" data-rm-no>Cancel</button></span>`
          : `<button class="btn-danger ghost" type="button" data-rm="${esc(a.uid)}">Remove</button>`;
      }
      return `<li class="admin-row">
        <span class="admin-name"><b>${esc(a.username)}</b>${a.owner ? '<span class="chip" style="--c:var(--gold)">Owner</span>' : '<span class="chip">Admin</span>'}${you ? '<span class="you">(you)</span>' : ""}</span>
        <span class="admin-meta">${a.addedBy ? "Added by " + esc(a.addedBy) : ""}</span>
        <span class="admin-act">${act}</span>
      </li>`;
    })
    .join("");
}

function refreshRows() {
  const ul = document.getElementById("adminRows");
  if (ul) { ul.innerHTML = adminRows(); bindRows(); }
}

function showNote(text, isError) {
  S.msg = isError ? text : "";
  S.note = isError ? "" : text;
  let box = document.getElementById("adminNote");
  if (!box) return;
  box.className = isError ? "form-err" : "ok-note";
  box.textContent = text;
  box.hidden = !text;
  if (text) box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function adminsView() {
  const owner = S.user.owner;
  const addForm = owner
    ? `<form class="panel admin-form" id="addAdmin" autocomplete="off">
        <h3>Register a new admin</h3>
        <p class="help">They'll log in at this page with the username and password you set here. They can change the password later.</p>
        <label class="q-label" for="nu">Username</label>
        <input class="inp" id="nu" name="u" autocomplete="off" required maxlength="20" placeholder="e.g. josh">
        <p class="help">3–20 characters: lowercase letters, numbers, dots, dashes or underscores.</p>
        <label class="q-label" for="np">Password</label>
        <input class="inp" id="np" name="p" type="password" autocomplete="new-password" required minlength="8">
        <label class="q-label" for="np2">Confirm password</label>
        <input class="inp" id="np2" name="p2" type="password" autocomplete="new-password" required minlength="8">
        <button class="btn-main" type="submit">Register admin</button>
      </form>`
    : `<div class="panel admin-form"><h3>Register a new admin</h3><p class="help">Only the server owner can add or remove admins.</p></div>`;

  return `
  <p id="adminNote" class="${S.note ? "ok-note" : "form-err"}" role="status"${S.note ? "" : " hidden"}>${esc(S.note)}</p>
  <div class="admins-grid">
    <div class="panel admin-list">
      <h3>People with access</h3>
      <ul id="adminRows">${adminRows()}</ul>
    </div>
    <div class="admin-side">
      ${addForm}
      <form class="panel admin-form" id="changePw">
        <h3>Change my password</h3>
        <label class="q-label" for="cp0">Current password</label>
        <input class="inp" id="cp0" name="c" type="password" autocomplete="current-password" required>
        <label class="q-label" for="cp1">New password</label>
        <input class="inp" id="cp1" name="n" type="password" autocomplete="new-password" required minlength="8">
        <label class="q-label" for="cp2">Confirm new password</label>
        <input class="inp" id="cp2" name="n2" type="password" autocomplete="new-password" required minlength="8">
        <button class="pxbtn" type="submit">Change password</button>
      </form>
    </div>
  </div>`;
}

function bindRows() {
  root.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => { S.confirmRemove = b.dataset.rm; refreshRows(); }));
  root.querySelectorAll("[data-rm-no]").forEach((b) => b.addEventListener("click", () => { S.confirmRemove = null; refreshRows(); }));
  root.querySelectorAll("[data-rm-yes]").forEach((b) =>
    b.addEventListener("click", async () => {
      const uid = b.dataset.rmYes;
      const who = (S.admins.find((a) => a.uid === uid) || {}).username;
      b.disabled = true;
      try {
        await api.removeAdmin(uid);
        logAction("admin.remove", `Removed ${who} as an admin`, { uid });
        S.admins = S.admins.filter((a) => a.uid !== uid);
        showNote(`${who} has been removed and can no longer use the admin panel.`);
      } catch (e) {
        showNote("Couldn't remove that admin. " + friendlyError(e), true);
      }
      S.confirmRemove = null;
      refreshRows();
    })
  );
}

function bindAdmins() {
  bindRows();

  const add = document.getElementById("addAdmin");
  if (add)
    add.addEventListener("submit", async (e) => {
      e.preventDefault();
      const u = add.u.value.trim().toLowerCase();
      let err = "";
      if (!USERNAME_RULE.test(u)) err = "Usernames must be 3–20 characters: lowercase letters, numbers, dots, dashes or underscores.";
      else if (add.p.value.length < 8) err = "Passwords need at least 8 characters.";
      else if (add.p.value !== add.p2.value) err = "The two passwords don't match.";
      else if (S.admins.some((a) => a.username === u)) err = `${u} is already an admin.`;
      if (err) return showNote(err, true);
      const btn = add.querySelector("button");
      btn.disabled = true;
      btn.textContent = "Registering…";
      try {
        await api.addAdmin(u, add.p.value);
        logAction("admin.add", `Registered ${u} as an admin`, {});
        add.reset();
        await loadAdmins();
        showNote(`${u} is now an admin. They can log in with the username "${u}" and the password you set.`);
      } catch (er) {
        showNote("Couldn't register that admin. " + friendlyError(er), true);
      }
      btn.disabled = false;
      btn.textContent = "Register admin";
    });

  const pw = document.getElementById("changePw");
  pw.addEventListener("submit", async (e) => {
    e.preventDefault();
    let err = "";
    if (pw.n.value.length < 8) err = "Your new password needs at least 8 characters.";
    else if (pw.n.value !== pw.n2.value) err = "The two new passwords don't match.";
    if (err) return showNote(err, true);
    const btn = pw.querySelector("button");
    btn.disabled = true;
    btn.textContent = "Changing…";
    try {
      await api.changePassword(pw.c.value, pw.n.value);
      logAction("password", "Changed their own password", {});
      pw.reset();
      showNote("Your password has been changed.");
    } catch (er) {
      showNote(/invalid-credential|wrong-password/.test(er.code || "") ? "Your current password is wrong." : "Couldn't change your password. " + friendlyError(er), true);
    }
    btn.disabled = false;
    btn.textContent = "Change password";
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
  if (!user.admin) {
    root.innerHTML = `<div class="login panel">
      <h2>No access</h2>
      <p style="color:var(--muted)">The account <b>${esc(user.name)}</b> isn't on the admin list. Ask the server owner to add you.</p>
      <button class="btn-main" id="logout" type="button">Log out</button>
    </div>`;
    document.getElementById("logout").addEventListener("click", () => api.logout());
    return;
  }
  if (S.justLoggedIn) {
    S.justLoggedIn = false;
    logAction("login", "Logged in to the admin panel");
  }
  S.adminsLoaded = false;
  S.logsLoaded = false;
  S.tab = "apps";
  root.innerHTML = '<p class="empty panel">Loading…</p>';
  await loadForm();
  const m = /^#appeal-([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (m) { S.tab = "appeals"; S.viewId = m[1]; }
  render();
  await loadApps();
  if (m) {
    const a = S.appeals.find((x) => x.id === m[1]);
    if (a) { S.appealFilter = a.status; S.appealType = "all"; }
    render();
  }
});
