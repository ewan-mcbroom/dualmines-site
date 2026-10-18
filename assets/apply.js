import api, { friendlyError } from "./backend.js";

const root = document.getElementById("apply");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LIMITS = { short: 200, paragraph: 3000 };

function demoBanner() {
  return api.demo
    ? '<p class="demo-note">Demo mode: applications are only saved in this browser until Firebase is connected.</p>'
    : "";
}

function field(q, i) {
  const id = "q_" + i;
  const req = q.required ? ' <span class="req" title="Required">*</span>' : ' <span class="opt">(optional)</span>';
  const help = q.help ? `<p class="help" id="${id}_help">${esc(q.help)}</p>` : "";
  const desc = q.help ? ` aria-describedby="${id}_help"` : "";
  const r = q.required ? " required" : "";
  const opts = Array.isArray(q.options) ? q.options.filter(Boolean) : [];
  let input = "";
  switch (q.type) {
    case "paragraph":
      input = `<textarea class="inp" id="${id}" name="${id}" rows="5" maxlength="${LIMITS.paragraph}"${r}${desc}></textarea>`;
      break;
    case "number":
      input = `<input class="inp inp-num" id="${id}" name="${id}" type="number" inputmode="numeric"${r}${desc}>`;
      break;
    case "dropdown":
      input = `<select class="inp" id="${id}" name="${id}"${r}${desc}><option value="">Choose one…</option>${opts.map((o) => `<option>${esc(o)}</option>`).join("")}</select>`;
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
    default:
      input = `<input class="inp" id="${id}" name="${id}" type="text" maxlength="${LIMITS.short}"${r}${desc}>`;
  }
  const isGroup = ["choice", "yesno", "checkboxes"].includes(q.type);
  return `<div class="field panel" data-i="${i}">
    ${isGroup ? `<p class="q-label" id="${id}_l">${esc(q.label)}${req}</p>` : `<label class="q-label" id="${id}_l" for="${id}">${esc(q.label)}${req}</label>`}
    ${help}
    ${input}
    <p class="err" hidden></p>
  </div>`;
}

function readValue(form, q, i) {
  const name = "q_" + i;
  if (q.type === "checkboxes") return [...form.querySelectorAll(`[name="${name}"]:checked`)].map((x) => x.value).join(", ");
  if (q.type === "choice" || q.type === "yesno") {
    const c = form.querySelector(`[name="${name}"]:checked`);
    return c ? c.value : "";
  }
  return (form.elements[name] && form.elements[name].value || "").trim();
}

async function start() {
  let data;
  try {
    data = await api.getForm();
  } catch (e) {
    root.innerHTML = `<p class="empty panel">The application form couldn't load. ${esc(friendlyError(e))}</p>`;
    return;
  }
  const questions = (data.questions || []).filter((q) => q && q.label);

  if (!data.open) {
    root.innerHTML = `${demoBanner()}<div class="panel closed"><h2>Applications are closed</h2><p>We're not taking staff applications right now. Keep an eye on the News page and our Discord for when they open again.</p></div>`;
    return;
  }
  if (!questions.length) {
    root.innerHTML = `<p class="empty panel">The application form hasn't been set up yet. Check back soon!</p>`;
    return;
  }

  root.innerHTML = `${demoBanner()}
    ${data.intro ? `<p class="lead">${esc(data.intro)}</p>` : ""}
    <form id="appForm" novalidate>
      ${questions.map(field).join("")}
      <div class="hp" aria-hidden="true"><label>Leave this empty <input name="website" tabindex="-1" autocomplete="off"></label></div>
      <div class="submit-row">
        <button class="btn-main" type="submit" id="submitBtn">Submit application</button>
        <p class="form-err" role="alert" hidden></p>
      </div>
    </form>`;

  const form = document.getElementById("appForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("submitBtn");
    const formErr = form.querySelector(".form-err");
    formErr.hidden = true;
    let firstBad = null;
    const answers = questions.map((q, i) => {
      const value = readValue(form, q, i);
      const box = form.querySelector(`.field[data-i="${i}"]`);
      const err = box.querySelector(".err");
      let msg = "";
      if (q.required && !value) msg = q.type === "checkboxes" ? "Pick at least one option." : "This question is required.";
      else if (q.type === "number" && value && isNaN(Number(value))) msg = "Please enter a number.";
      err.textContent = msg;
      err.hidden = !msg;
      box.classList.toggle("bad", !!msg);
      if (msg && !firstBad) firstBad = box;
      return { q: q.label, type: q.type, value };
    });
    if (firstBad) {
      formErr.textContent = "Some questions need an answer. They're highlighted above.";
      formErr.hidden = false;
      firstBad.scrollIntoView({ behavior: "smooth", block: "center" });
      const inp = firstBad.querySelector("input,textarea,select");
      if (inp) inp.focus({ preventScroll: true });
      return;
    }
    if (form.elements.website.value) return; // bot filled the hidden field

    btn.disabled = true;
    btn.textContent = "Sending…";
    try {
      await api.submit(answers);
      root.innerHTML = `<div class="panel done">
        <h2>Application sent!</h2>
        <p>Thanks for applying to the Dualmines staff team. We read every application and will contact you on Discord if you're successful.</p>
        <a class="btn-main" href="./">Back to home</a>
      </div>`;
      root.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Submit application";
      formErr.textContent = /permission/.test(err.code || "")
        ? "Applications may have just closed, so your application wasn't sent."
        : "Your application couldn't be sent. " + friendlyError(err);
      formErr.hidden = false;
    }
  });
}

start();
