/* Shared bits for the Apply and Appeal forms */
import api, { avatarUrl, TEXT_LIMITS, checkAnswer } from "./backend.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const DISCORD_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.6 5.3A16.6 16.6 0 0 0 15.5 4l-.5 1a15.3 15.3 0 0 0-6 0l-.5-1a16.6 16.6 0 0 0-4.1 1.3C1.8 9.2 1.1 13 1.4 16.7A16.7 16.7 0 0 0 6.5 19.3l1.1-1.7a10.7 10.7 0 0 1-1.7-.8l.4-.3a11.9 11.9 0 0 0 11.4 0l.4.3c-.5.3-1.1.6-1.7.8l1.1 1.7a16.6 16.6 0 0 0 5.1-2.6c.4-4.3-.7-8-3-11.4ZM8.7 14.5c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z"/></svg>';
export const fmtDate = (ms) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function limitHint(q) {
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


export function field(q, i) {
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


export function readRaw(form, q, i) {
  const name = "q_" + i;
  if (q.type === "checkboxes") return [...form.querySelectorAll(`[name="${name}"]:checked`)].map((x) => x.value);
  if (q.type === "choice" || q.type === "yesno") {
    const c = form.querySelector(`[name="${name}"]:checked`);
    return c ? c.value : "";
  }
  return ((form.elements[name] && form.elements[name].value) || "").trim();
}


export function whoBar(me, label = "Applying as") {
  return `<div class="who-bar panel">
    <img src="${esc(avatarUrl(me.id, me.avatar, 64))}" alt="" width="40" height="40">
    <span class="who-text">${label} <b>${esc(me.display || me.name)}</b> <small>@${esc(me.name)}</small></span>
    <button class="pxbtn" type="button" id="dcLogout">Not you? Log out</button>
  </div>`;
}


export function bindLogout() {
  const b = document.getElementById("dcLogout");
  if (b) b.addEventListener("click", async () => { await api.applicantLogout(); location.reload(); });
}


export function showErr(box, msg) {
  const err = box.querySelector(".err");
  err.textContent = msg;
  err.hidden = !msg;
  box.classList.toggle("bad", !!msg);
}

/* Character counters, and re-checking an answer once it has shown an error. */
export function wireLiveChecks(form, questions, boxOf, submitId) {
  questions.forEach((q, i) => {
    const box = boxOf(i);
    if (!box) return;
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
        if (e.relatedTarget && e.relatedTarget.id === submitId) return;
        setTimeout(() => {
          if (document.activeElement && document.activeElement.id === submitId) return;
          if (readRaw(form, q, i) !== "") showErr(box, checkAnswer(q, readRaw(form, q, i)));
        }, 250);
      });
    }
    box.querySelectorAll("input[type=radio], input[type=checkbox]").forEach((el) => el.addEventListener("change", recheck));
  });
}
