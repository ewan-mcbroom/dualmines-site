import api, { friendlyError, normalizeForm, checkAnswer, TEXT_LIMITS, UPLOAD } from "./backend.js";
import { esc, DISCORD_SVG, fmtDate, field, readRaw, whoBar, bindLogout, showErr, wireLiveChecks } from "./form-ui.js";

const root = document.getElementById("appeal");
const VERDICT = { pending: ["Waiting for review", "var(--ice)"], accepted: ["Accepted", "#5ee38a"], denied: ["Denied", "#ff6b6b"] };
const mb = (b) => (b / 1e6 < 0.1 ? "<0.1" : (b / 1e6).toFixed(1)) + " MB";

function demoBanner() {
  return api.demo ? '<p class="demo-note">Demo mode: Discord login is simulated, no Discord messages are sent, and appeals are only saved in this browser.</p>' : "";
}

function myAppealsList(list) {
  if (!list.length) return "";
  return `<div class="panel my-apps">
    <h3>Your appeals</h3>
    <ul class="my-appeals">${list
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((a) => {
        const [label, col] = VERDICT[a.status] || VERDICT.pending;
        return `<li>
          <div class="ma-row"><span><b>${esc(a.type || "Appeal")}</b> <small>${fmtDate(a.createdAt)}</small></span><span class="chip" style="--c:${col}">${label}</span></div>
          ${a.status !== "pending" && a.verdictNote ? `<p class="ma-note"><b>Message from staff:</b> ${esc(a.verdictNote)}</p>` : ""}
        </li>`;
      })
      .join("")}</ul>
  </div>`;
}

async function start() {
  const loginError = await api.finishDiscordLogin();

  let data;
  try {
    data = normalizeForm(await api.getAppealForm(), "appeal");
  } catch (e) {
    root.innerHTML = `<p class="empty panel">The appeal form couldn't load. ${esc(friendlyError(e))}</p>`;
    return;
  }
  const questions = (data.questions || []).filter((q) => q && q.label);
  const types = data.roles.filter((r) => r.open);
  const filesOn = data.files.enabled !== false;

  if (!api.discordReady) {
    root.innerHTML = `<div class="panel closed"><h2>Appeals open soon</h2><p>Discord login for appeals is still being set up. Check back shortly!</p></div>`;
    return;
  }

  /* ---- must be logged in with Discord ---- */
  const me = await api.getApplicant();
  if (!me) {
    root.innerHTML = `${demoBanner()}
      ${data.intro ? `<p class="lead">${esc(data.intro)}</p>` : ""}
      <div class="panel dc-login">
        <h2>Log in with Discord to appeal</h2>
        <p>We use your Discord account to know who sent the appeal and to message you the result. We only see your username and profile picture.</p>
        ${loginError ? `<p class="form-err" role="alert">${esc(loginError)}</p>` : ""}
        <button class="discord-btn" type="button" id="dcLogin">${DISCORD_SVG}Log in with Discord</button>
      </div>`;
    document.getElementById("dcLogin").addEventListener("click", (e) => {
      e.currentTarget.disabled = true;
      e.currentTarget.lastChild.textContent = "Opening Discord…";
      api.startDiscordLogin();
    });
    return;
  }

  let mine = [];
  try {
    mine = (await api.myAppeals()).filter((a) => a.submitted !== false);
  } catch (e) {
    root.innerHTML = `${whoBar(me, "Logged in as")}<p class="empty panel">Couldn't check your appeals. ${esc(friendlyError(e))}</p>`;
    bindLogout();
    return;
  }

  const pending = mine.find((a) => a.status === "pending");
  if (pending) {
    root.innerHTML = `${demoBanner()}${whoBar(me, "Logged in as")}
      <div class="panel done"><h2>Appeal received</h2>
        <p>Your <b>${esc(pending.type)}</b> appeal from ${fmtDate(pending.createdAt)} is waiting for staff to review it. You can't send another one until it's been decided. We'll send you the result in your Discord DMs, and it will also show here.</p></div>
      ${myAppealsList(mine)}`;
    bindLogout();
    return;
  }
  if (!data.open || !types.length || !questions.length) {
    root.innerHTML = `${demoBanner()}${whoBar(me, "Logged in as")}<div class="panel closed"><h2>Appeals are closed</h2><p>We're not taking appeals right now. Please check back later.</p></div>${myAppealsList(mine)}`;
    bindLogout();
    return;
  }

  /* ---- the form ---- */
  root.innerHTML = `${demoBanner()}${whoBar(me, "Logged in as")}
    ${data.intro ? `<p class="lead">${esc(data.intro)}</p>` : ""}
    <form id="appealForm" novalidate>
      <div class="field panel role-field" data-role-pick>
        <p class="q-label" id="type_l">What are you appealing? <span class="req" title="Required">*</span></p>
        <div class="role-cards" role="radiogroup" aria-labelledby="type_l">
          ${types.map((t) => `<label class="role-card"><input type="radio" name="atype" value="${esc(t.id)}"${types.length === 1 ? " checked" : ""}><b>${esc(t.name)}</b>${t.blurb ? `<span>${esc(t.blurb)}</span>` : ""}</label>`).join("")}
        </div>
        <p class="err" hidden></p>
      </div>
      <div id="qs"${types.length === 1 ? "" : " hidden"}>
        ${questions.map(field).join("")}
        ${filesOn ? `<div class="field panel" id="filesField">
          <p class="q-label">Evidence ${data.files.required ? '<span class="req" title="Required">*</span>' : '<span class="opt">(optional)</span>'}</p>
          <p class="help">Screenshots or short clips that support your appeal. Up to ${UPLOAD.max} files, ${UPLOAD.maxBytes / 1e6} MB each (PNG, JPG, GIF, WebP, MP4, WebM, MOV).</p>
          <label class="drop" id="drop">
            <input type="file" id="fileInput" multiple accept="${UPLOAD.accept}">
            <span><b>Choose files</b> or drag them here</span>
          </label>
          <ul class="file-list" id="fileList"></ul>
          <p class="err" hidden></p>
        </div>` : ""}
      </div>
      <div class="hp" aria-hidden="true"><label>Leave this empty <input name="website" tabindex="-1" autocomplete="off"></label></div>
      <div class="submit-row">
        <button class="btn-main" type="submit" id="submitBtn">Submit appeal</button>
        <p class="form-err" role="alert" hidden></p>
      </div>
    </form>
    ${myAppealsList(mine)}`;
  bindLogout();

  const form = document.getElementById("appealForm");
  const chosen = () => { const c = form.querySelector('[name="atype"]:checked'); return c ? c.value : ""; };
  const applies = (q, t) => !q.roles || !q.roles.length || q.roles.includes(t);
  const boxOf = (i) => form.querySelector(`.field[data-i="${i}"]`);

  function showForType() {
    const t = chosen();
    document.getElementById("qs").hidden = !t;
    questions.forEach((q, i) => (boxOf(i).hidden = !applies(q, t)));
    showErr(form.querySelector("[data-role-pick]"), "");
  }
  form.querySelectorAll('[name="atype"]').forEach((r) => r.addEventListener("change", showForType));
  showForType();
  wireLiveChecks(form, questions, boxOf, "submitBtn");

  /* ---- files ---- */
  let files = [];
  const fileField = document.getElementById("filesField");
  function drawFiles() {
    if (!fileField) return;
    const ul = document.getElementById("fileList");
    ul.innerHTML = files
      .map((f, i) => `<li data-f="${i}">
        <span class="ficon">${f.type.startsWith("video/") ? "▶" : "▣"}</span>
        <span class="fname">${esc(f.name)}</span><small>${mb(f.size)}</small>
        <span class="fbar" hidden><i></i></span>
        <button class="pop-x" type="button" data-rmf="${i}" aria-label="Remove ${esc(f.name)}">✕</button>
      </li>`)
      .join("");
    ul.querySelectorAll("[data-rmf]").forEach((b) => b.addEventListener("click", () => { files.splice(Number(b.dataset.rmf), 1); drawFiles(); }));
    document.getElementById("drop").hidden = files.length >= UPLOAD.max;
  }
  function addFiles(list) {
    const problems = [];
    for (const f of list) {
      if (files.length >= UPLOAD.max) { problems.push(`You can attach up to ${UPLOAD.max} files.`); break; }
      if (!UPLOAD.accept.split(",").includes(f.type)) { problems.push(`${f.name} isn't an image or video we accept.`); continue; }
      if (f.size > UPLOAD.maxBytes) { problems.push(`${f.name} is ${mb(f.size)}. The limit is ${UPLOAD.maxBytes / 1e6} MB.`); continue; }
      if (!f.size) { problems.push(`${f.name} is empty.`); continue; }
      files.push(f);
    }
    showErr(fileField, problems.join(" "));
    drawFiles();
  }
  if (fileField) {
    const input = document.getElementById("fileInput");
    input.addEventListener("change", () => { addFiles([...input.files]); input.value = ""; });
    const drop = document.getElementById("drop");
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
    drop.addEventListener("drop", (e) => { e.preventDefault(); addFiles([...e.dataTransfer.files]); });
  }

  /* ---- submit ---- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("submitBtn");
    const formErr = form.querySelector(".form-err");
    formErr.hidden = true;
    let firstBad = null;

    const t = chosen();
    const tp = form.querySelector("[data-role-pick]");
    showErr(tp, t ? "" : "Choose what you're appealing.");
    if (!t) firstBad = tp;

    const asked = questions.map((q, i) => [q, i]).filter(([q]) => t && applies(q, t));
    const answers = asked.map(([q, i]) => {
      const raw = readRaw(form, q, i);
      const msg = checkAnswer(q, raw);
      showErr(boxOf(i), msg);
      if (msg && !firstBad) firstBad = boxOf(i);
      return { q: q.label, type: q.type, value: Array.isArray(raw) ? raw.join(", ") : String(raw).trim().slice(0, TEXT_LIMITS.paragraph) };
    });
    if (fileField && t) {
      const need = data.files.required && !files.length;
      if (need) { showErr(fileField, "Please attach at least one file."); if (!firstBad) firstBad = fileField; }
    }

    if (firstBad) {
      const n = form.querySelectorAll(".field.bad").length;
      formErr.textContent = n > 1 ? `${n} answers need fixing. They're highlighted above.` : "One answer needs fixing. It's highlighted above.";
      formErr.hidden = false;
      firstBad.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (form.elements.website.value) return;

    btn.disabled = true;
    btn.textContent = files.length ? "Uploading…" : "Sending…";
    form.querySelectorAll("[data-rmf], #fileInput").forEach((el) => (el.disabled = true));
    const typeName = (types.find((x) => x.id === t) || {}).name || t;
    try {
      await api.submitAppeal(t, answers, files, (i, frac) => {
        const li = form.querySelector(`[data-f="${i}"]`);
        if (!li) return;
        const bar = li.querySelector(".fbar");
        bar.hidden = false;
        bar.firstElementChild.style.width = Math.round(frac * 100) + "%";
        if (frac >= 1) li.classList.add("up-done");
      });
      root.innerHTML = `${whoBar(me, "Logged in as")}<div class="panel done">
        <h2>Appeal sent!</h2>
        <p>Your <b>${esc(typeName)}</b> appeal has been sent to the Dualmines staff team. We'll send the result to your Discord DMs at <b>@${esc(me.name)}</b>, and you can always check it on this page.</p>
        <a class="btn-main" href="./">Back to home</a>
      </div>`;
      bindLogout();
      root.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Submit appeal";
      form.querySelectorAll("[data-rmf], #fileInput").forEach((el) => (el.disabled = false));
      formErr.textContent = "Your appeal couldn't be sent. " + (err.message || friendlyError(err));
      formErr.hidden = false;
    }
  });
}

start();
