import api, { friendlyError, normalizeForm, checkAnswer, TEXT_LIMITS } from "./backend.js";
import { esc, DISCORD_SVG, fmtDate, field, readRaw, whoBar, bindLogout, showErr, wireLiveChecks } from "./form-ui.js";

const root = document.getElementById("apply");
const STATUS = { pending: ["Pending", "var(--ice)"], accepted: ["Accepted", "#5ee38a"], rejected: ["Not successful", "#ff6b6b"] };

function demoBanner() {
  return api.demo ? '<p class="demo-note">Demo mode: Discord login is simulated and applications are only saved in this browser until Firebase is connected.</p>' : "";
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

  function showForRole() {
    const role = chosenRole();
    document.getElementById("qs").hidden = !role;
    questions.forEach((q, i) => (boxOf(i).hidden = !applies(q, role)));
    showErr(form.querySelector("[data-role-pick]"), "");
  }
  form.querySelectorAll('[name="role"]').forEach((r) => r.addEventListener("change", showForRole));
  showForRole();

  wireLiveChecks(form, questions, boxOf, "submitBtn");

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
