import api, { friendlyError, normalizeForm, checkAnswer, avatarUrl, TEXT_LIMITS } from "./backend.js";

const root = document.getElementById("apply");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DISCORD_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.6 5.3A16.6 16.6 0 0 0 15.5 4l-.5 1a15.3 15.3 0 0 0-6 0l-.5-1a16.6 16.6 0 0 0-4.1 1.3C1.8 9.2 1.1 13 1.4 16.7A16.7 16.7 0 0 0 6.5 19.3l1.1-1.7a10.7 10.7 0 0 1-1.7-.8l.4-.3a11.9 11.9 0 0 0 11.4 0l.4.3c-.5.3-1.1.6-1.7.8l1.1 1.7a16.6 16.6 0 0 0 5.1-2.6c.4-4.3-.7-8-3-11.4ZM8.7 14.5c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z"/></svg>';
const STATUS = { pending: ["Pending", "var(--ice)"], accepted: ["Accepted", "#5ee38a"], rejected: ["Not successful", "#ff6b6b"] };
const fmtDate = (ms) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function demoBanner() {
  return api.demo ? '<p class="demo-note">Demo mode: Discord login is simulated and applications are only saved in this browser until Firebase is connected.</p>' : "";
}

function limitHint(q) {
  const v = q.v || {};
  const bits = [];
  if (q.type === "short" || q.type === "paragraph") {
    if (v.min && v.max) bits.push(`${v.min}–${v.max} characters`);
    else if (v.min) bits.push(`At least ${v.min} characters`);
    else if (v.max) bits.push(`Up to ${v.max} characters`);
  }
  if (q.type === "number") {
    if (v.min !== undefined && v.min !== "" && v.max !== undefined && v.max !== "") bits.push(`Between ${v.min} and ${v.max}`);
    else if (v.min !== undefined && v.min !== "") bits.push(`${v.min} or more`);
    else if (v.max !== undefined && v.max !== "") bits.push(`${v.max} or less`);
  }
  if (q.type === "checkboxes") {
    if (v.min) bits.push(`Pick at least ${v.min}`);
    if (v.max) bits.push(`Pick up to ${v.max}`);
  }
  return bits.join(" · ");
}

function field(q, i) {
  const id = "q_" + i;
  const v = q.v || {};
  const req = q.required ? ' <span class="req" title="Required">*</span>' : ' <span class="opt">(optional)</span>';
  const hint = limitHint(q);
  const help = q.help || hint ? `<p class="help" id="${id}_help">${esc(q.help)}${q.help && hint ? " · " : ""}${hint ? `<span class="limit">${esc(hint)}</span>` : ""}</p>` : "";
  const desc = q.help || hint ? ` aria-describedby="${id}_help"` : "";
  const opts = Array.isArray(q.options) ? q.options.filter(Boolean) : [];
  const maxLen = Math.min(Number(v.max) || TEXT_LIMITS[q.type] || 200, TEXT_LIMITS[q.type] || 200);
  let input = "";
  switch (q.type) {
    case "paragraph":
      input = `<textarea class="inp" id="${id}" name="${id}" rows="5" maxlength="${maxLen}"${desc}></textarea>
        <p class="counter" data-for="${id}">0 / ${maxLen}</p>`;
      break;
    case "number":
      input = `<input class="inp inp-num" id="${id}" name="${id}" type="number" inputmode="${v.whole ? "numeric" : "decimal"}"${v.min !== undefined && v.min !== "" ? ` min="${esc(v.min)}"` : ""}${v.max !== undefined && v.max !== "" ? ` max="${esc(v.max)}"` : ""}${v.whole ? ' step="1"' : ' step="any"'}${desc}>`;
      break;
    case "dropdown":
      input = `<select class="inp" id="${id}" name="${id}"${desc}><option value="">Choose one…</option>${opts.map((o) => `<option>${esc(o)}</option>`).join("")}</select>`;
      break;
    case "choice":
    case "yesno":
    case "checkboxes": {
      const list = q.type === "yesno" ? ["Yes", "No"] : opts;
      const t = q.type === "checkboxes" ? "checkbox" : "radio";
      input = `<div class="opts" role="${t === "radio" ? "radiogroup" : "group"}" aria-labelledby="${id}_l"${desc}>${list
        .map((o, k) => `<label class="opt-row"><input type="${t}" name="${id}" id="${id}_${k}" value="${esc(o)}"><span>${esc(o)}</span></label>`)
        .join("")}</div>`;
      break;
    }
    default: {
      const ph = v.format === "minecraft" ? "e.g. Steve" : v.format === "url" ? "https://" : v.format === "email" ? "you@example.com" : "";
      input = `<input class="inp" id="${id}" name="${id}" type="${v.format === "email" ? "email" : v.format === "url" ? "url" : "text"}" maxlength="${maxLen}"${ph ? ` placeholder="${ph}"` : ""} autocomplete="off"${desc}>`;
    }
  }
  const isGroup = ["choice", "yesno", "checkboxes"].includes(q.type);
  return `<div class="field panel" data-i="${i}">
    ${isGroup ? `<p class="q-label" id="${id}_l">${esc(q.label)}${req}</p>` : `<label class="q-label" id="${id}_l" for="${id}">${esc(q.label)}${req}</label>`}
    ${help}
    ${input}
    <p class="err" hidden></p>
  </div>`;
}

function readRaw(form, q, i) {
  const name = "q_" + i;
  if (q.type === "checkboxes") return [...form.querySelectorAll(`[name="${name}"]:checked`)].map((x) => x.value);
  if (q.type === "choice" || q.type === "yesno") {
    const c = form.querySelector(`[name="${name}"]:checked`);
    return c ? c.value : "";
  }
  return ((form.elements[name] && form.elements[name].value) || "").trim();
}

function whoBar(me) {
  return `<div class="who-bar panel">
    <img src="${esc(avatarUrl(me.id, me.avatar, 64))}" alt="" width="40" height="40">
    <span class="who-text">Applying as <b>${esc(me.display || me.name)}</b> <small>@${esc(me.name)}</small></span>
    <button class="pxbtn" type="button" id="dcLogout">Not you? Log out</button>
  </div>`;
}

function historyList(apps) {
  if (!apps.length) return "";
  return `<div class="panel my-apps">
    <h3>Your applications</h3>
    <ul>${apps
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((a) => {
        const [label, col] = STATUS[a.status] || STATUS.pending;
        return `<li><span><b>${esc(a.role || "Application")}</b> <small>${fmtDate(a.createdAt)}</small></span><span class="chip" style="--c:${col}">${label}</span></li>`;
      })
      .join("")}</ul>
  </div>`;
}

function bindLogout() {
  const b = document.getElementById("dcLogout");
  if (b) b.addEventListener("click", async () => { await api.applicantLogout(); location.reload(); });
}

async function start() {
  const loginError = await api.finishDiscordLogin();

  let data;
  try {
    data = normalizeForm(await api.getForm());
  } catch (e) {
    root.innerHTML = `<p class="empty panel">The application form couldn't load. ${esc(friendlyError(e))}</p>`;
    return;
  }
  const questions = (data.questions || []).filter((q) => q && q.label);
  const openRoles = data.roles.filter((r) => r.open);

  if (!data.open || !openRoles.length) {
    root.innerHTML = `${demoBanner()}<div class="panel closed"><h2>Applications are closed</h2><p>We're not taking staff applications right now. Keep an eye on the News page and our Discord for when they open again.</p></div>`;
    return;
  }
  if (!questions.length) {
    root.innerHTML = `<p class="empty panel">The application form hasn't been set up yet. Check back soon!</p>`;
    return;
  }
  if (!api.discordReady) {
    root.innerHTML = `<div class="panel closed"><h2>Applications open soon</h2><p>Discord login for applications is still being set up. Check back shortly!</p></div>`;
    return;
  }

  /* ---- must be logged in with Discord ---- */
  const me = await api.getApplicant();
  if (!me) {
    root.innerHTML = `${demoBanner()}
      ${data.intro ? `<p class="lead">${esc(data.intro)}</p>` : ""}
      <div class="panel dc-login">
        <h2>Log in with Discord to apply</h2>
        <p>We use your Discord account to know who sent each application and to contact you about it. We only see your username and profile picture.</p>
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

  /* ---- banned / already pending ---- */
  let status = { ban: null, apps: [] };
  try {
    status = await api.myStatus();
  } catch (e) {
    root.innerHTML = `${whoBar(me)}<p class="empty panel">Couldn't check your application status. ${esc(friendlyError(e))}</p>`;
    bindLogout();
    return;
  }
  if (status.ban) {
    root.innerHTML = `${demoBanner()}${whoBar(me)}
      <div class="panel closed"><h2>You can't apply</h2>
        <p>Your Discord account has been blocked from sending staff applications.${status.ban.reason ? ` Reason: <b>${esc(status.ban.reason)}</b>` : ""}</p>
        <p>If you think this is a mistake, contact a staff member on our Discord.</p></div>`;
    bindLogout();
    return;
  }
  const pending = status.apps.find((a) => a.status === "pending");
  if (pending) {
    root.innerHTML = `${demoBanner()}${whoBar(me)}
      <div class="panel done"><h2>Application received</h2>
        <p>Your <b>${esc(pending.role || "staff")}</b> application from ${fmtDate(pending.createdAt)} is waiting to be reviewed. You can't send another one until it's been looked at. We'll contact you on Discord.</p></div>
      ${historyList(status.apps)}`;
    bindLogout();
    return;
  }

  /* ---- the form ---- */
  root.innerHTML = `${demoBanner()}${whoBar(me)}
    ${data.intro ? `<p class="lead">${esc(data.intro)}</p>` : ""}
    <form id="appForm" novalidate>
      <div class="field panel role-field" data-role-pick>
        <p class="q-label" id="role_l">What are you applying for? <span class="req" title="Required">*</span></p>
        <div class="role-cards" role="radiogroup" aria-labelledby="role_l">
          ${openRoles.map((r) => `<label class="role-card"><input type="radio" name="role" value="${esc(r.id)}"${openRoles.length === 1 ? " checked" : ""}><b>${esc(r.name)}</b>${r.blurb ? `<span>${esc(r.blurb)}</span>` : ""}</label>`).join("")}
        </div>
        <p class="err" hidden></p>
      </div>
      <div id="qs"${openRoles.length === 1 ? "" : " hidden"}>${questions.map(field).join("")}</div>
      <div class="hp" aria-hidden="true"><label>Leave this empty <input name="website" tabindex="-1" autocomplete="off"></label></div>
      <div class="submit-row">
        <button class="btn-main" type="submit" id="submitBtn">Submit application</button>
        <p class="form-err" role="alert" hidden></p>
      </div>
    </form>
    ${historyList(status.apps)}`;
  bindLogout();

  const form = document.getElementById("appForm");
  const chosenRole = () => { const c = form.querySelector('[name="role"]:checked'); return c ? c.value : ""; };
  const applies = (q, role) => !q.roles || !q.roles.length || q.roles.includes(role);
  const boxOf = (i) => form.querySelector(`.field[data-i="${i}"]`);

  function showErr(box, msg) {
    const err = box.querySelector(".err");
    err.textContent = msg;
    err.hidden = !msg;
    box.classList.toggle("bad", !!msg);
  }
  function showForRole() {
    const role = chosenRole();
    document.getElementById("qs").hidden = !role;
    questions.forEach((q, i) => (boxOf(i).hidden = !applies(q, role)));
    showErr(form.querySelector("[data-role-pick]"), "");
  }
  form.querySelectorAll('[name="role"]').forEach((r) => r.addEventListener("change", showForRole));
  showForRole();

  // live checks: character counters, and re-check a field once it has shown an error
  questions.forEach((q, i) => {
    const box = boxOf(i);
    const counter = box.querySelector(".counter");
    const inp = box.querySelector("textarea, input:not([type=radio]):not([type=checkbox]), select");
    const recheck = () => { if (box.classList.contains("bad")) showErr(box, checkAnswer(q, readRaw(form, q, i))); };
    if (inp) {
      inp.addEventListener("input", () => {
        if (counter) counter.textContent = `${inp.value.length} / ${inp.maxLength}`;
        recheck();
      });
      inp.addEventListener("blur", (e) => {
        // Don't check while the click is going to the Submit button (the error would move the button mid-click).
        if (e.relatedTarget && e.relatedTarget.id === "submitBtn") return;
        setTimeout(() => {
          if (document.activeElement && document.activeElement.id === "submitBtn") return;
          if (readRaw(form, q, i) !== "") showErr(box, checkAnswer(q, readRaw(form, q, i)));
        }, 250);
      });
    }
    box.querySelectorAll("input[type=radio], input[type=checkbox]").forEach((el) => el.addEventListener("change", recheck));
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("submitBtn");
    const formErr = form.querySelector(".form-err");
    formErr.hidden = true;
    let firstBad = null;

    const role = chosenRole();
    const rp = form.querySelector("[data-role-pick]");
    showErr(rp, role ? "" : "Choose which role you're applying for.");
    if (!role) firstBad = rp;

    const asked = questions.map((q, i) => [q, i]).filter(([q]) => role && applies(q, role));
    const answers = asked.map(([q, i]) => {
      const raw = readRaw(form, q, i);
      const msg = checkAnswer(q, raw);
      const box = boxOf(i);
      showErr(box, msg);
      if (msg && !firstBad) firstBad = box;
      return { q: q.label, type: q.type, value: Array.isArray(raw) ? raw.join(", ") : String(raw).trim().slice(0, TEXT_LIMITS.paragraph) };
    });

    if (firstBad) {
      const n = form.querySelectorAll(".field.bad").length;
      formErr.textContent = n > 1 ? `${n} answers need fixing. They're highlighted above.` : "One answer needs fixing. It's highlighted above.";
      formErr.hidden = false;
      firstBad.scrollIntoView({ behavior: "smooth", block: "center" });
      const inp = firstBad.querySelector("input,textarea,select");
      if (inp) inp.focus({ preventScroll: true });
      return;
    }
    if (form.elements.website.value) return; // bot filled the hidden field

    const roleName = (openRoles.find((r) => r.id === role) || {}).name || role;
    answers.unshift({ q: "Role", type: "role", value: roleName });

    btn.disabled = true;
    btn.textContent = "Sending…";
    try {
      await api.submit(answers);
      root.innerHTML = `${whoBar(me)}<div class="panel done">
        <h2>Application sent!</h2>
        <p>Thanks for applying to be a Dualmines <b>${esc(roleName)}</b>. We read every application and will contact you on Discord at <b>@${esc(me.name)}</b>.</p>
        <a class="btn-main" href="./">Back to home</a>
      </div>`;
      bindLogout();
      root.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Submit application";
      formErr.textContent = /permission/.test(err.code || "")
        ? "Your application wasn't sent. Applications may have just closed, or your account can't apply. Refresh the page to check."
        : "Your application couldn't be sent. " + friendlyError(err);
      formErr.hidden = false;
    }
  });
}

start();
