/* ============================================================
   Dualmines site settings — change these if anything moves
   ============================================================ */
const SITE = {
  ip: "play.dualmines.net",
  discordInvite: "uB8V8hsAcp",
};

/* Colours for staff roles and news tags (lowercase names) */
const COLOURS = {
  owner: "#ffcf4a",
  "co-owner": "#ffcf4a",
  manager: "#ff8a5c",
  admin: "#ff6b6b",
  developer: "#7c8cff",
  "lead developer": "#7c8cff",
  "senior mod": "#3ec8f2",
  moderator: "#5ee38a",
  helper: "#c9a7ff",
  builder: "#ffa257",
  // news tags
  announcement: "#3ec8f2",
  update: "#5ee38a",
  event: "#ffcf4a",
  maintenance: "#ff6b6b",
  giveaway: "#c9a7ff",
};
const colourFor = (name) => COLOURS[String(name || "").toLowerCase()] || "#3ec8f2";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const linkify = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
  .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
const fmtDate = (d) => {
  const dt = new Date(d + "T12:00:00");
  return isNaN(dt) ? esc(d) : dt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ---------- toast + copy IP ---------- */
const toast = $("#toast");
let toastTimer;
function showToast(msg) {
  if (!toast) return;
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 2000);
}
$$(".js-copy").forEach((btn) =>
  btn.addEventListener("click", () => {
    try {
      navigator.clipboard.writeText(SITE.ip).then(
        () => showToast("IP copied! See you in the box."),
        () => showToast("Copy this IP: " + SITE.ip)
      );
    } catch (e) {
      showToast("Copy this IP: " + SITE.ip);
    }
  })
);

/* ---------- mobile menu ---------- */
const menuBtn = $(".menu-btn");
if (menuBtn) {
  menuBtn.addEventListener("click", () => {
    const nav = $(".nav");
    const open = nav.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", open);
  });
}

/* ---------- live counts ---------- */
const nf = (n) => Number(n).toLocaleString("en-GB");
if ($("[data-players]")) {
  fetch("https://api.mcsrvstat.us/3/" + SITE.ip)
    .then((r) => r.json())
    .then((d) => {
      if (d && d.online && d.players) {
        $$("[data-players]").forEach((el) => (el.textContent = nf(d.players.online)));
        $$("[data-players-wrap]").forEach((el) => (el.hidden = false));
      }
    })
    .catch(() => {});
}
if ($("[data-discord]")) {
  fetch("https://discord.com/api/v10/invites/" + SITE.discordInvite + "?with_counts=true")
    .then((r) => r.json())
    .then((d) => {
      if (d && d.approximate_presence_count) {
        $$("[data-discord]").forEach((el) => {
          el.textContent = nf(d.approximate_presence_count) + " online";
          el.hidden = false;
        });
      }
    })
    .catch(() => {});
}

/* ---------- news ---------- */
function loadJSON(path) {
  return fetch(path, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  });
}

$$("[data-news]").forEach((box) => {
  const mode = box.dataset.news; // "cards" or "full"
  const limit = Number(box.dataset.limit) || Infinity;
  loadJSON("data/news.json")
    .then((posts) => {
      posts = posts
        .filter((p) => p && p.title)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, limit);
      if (!posts.length) {
        box.innerHTML = '<p class="empty panel">No news yet. Check back soon!</p>';
        return;
      }
      box.innerHTML = posts.map((p) => (mode === "full" ? fullPost(p) : card(p))).join("");
      if (mode === "full" && location.hash) {
        const target = document.getElementById(location.hash.slice(1));
        if (target) target.scrollIntoView();
      }
    })
    .catch(() => {
      box.innerHTML = '<p class="empty panel">News couldn\'t load. If you just edited <b>data/news.json</b>, check it for a missing comma or quote mark.</p>';
    });
});

function paragraphs(p) {
  const body = Array.isArray(p.body) ? p.body : [p.body || ""];
  return body.filter(Boolean);
}
function card(p) {
  const c = colourFor(p.tag);
  const first = paragraphs(p)[0] || "";
  const ex = first.length > 150 ? first.slice(0, 147).trim() + "…" : first;
  return `<a class="news-card panel" style="--c:${c}" href="news.html#${slug(p.title)}">
    ${p.tag ? `<span class="chip" style="--c:${c};justify-self:start">${esc(p.tag)}</span>` : ""}
    <h3>${esc(p.title)}</h3>
    <span class="meta">${fmtDate(p.date)}${p.author ? " • " + esc(p.author) : ""}</span>
    <p class="ex">${esc(ex)}</p>
    <span class="more">Read more →</span>
  </a>`;
}
function fullPost(p) {
  const c = colourFor(p.tag);
  return `<article class="post panel" id="${slug(p.title)}" style="--c:${c}">
    ${p.tag ? `<span class="chip" style="--c:${c};justify-self:start">${esc(p.tag)}</span>` : ""}
    <h2>${esc(p.title)}</h2>
    <span class="meta">${fmtDate(p.date)}${p.author ? " • Posted by " + esc(p.author) : ""}</span>
    ${p.image ? `<img class="cover" src="${esc(p.image)}" alt="">` : ""}
    <div class="body">${paragraphs(p).map((t) => `<p>${linkify(t)}</p>`).join("")}</div>
  </article>`;
}

/* ---------- staff ---------- */
const DISCORD_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.6 5.3A16.6 16.6 0 0 0 15.5 4l-.5 1a15.3 15.3 0 0 0-6 0l-.5-1a16.6 16.6 0 0 0-4.1 1.3C1.8 9.2 1.1 13 1.4 16.7A16.7 16.7 0 0 0 6.5 19.3l1.1-1.7a10.7 10.7 0 0 1-1.7-.8l.4-.3a11.9 11.9 0 0 0 11.4 0l.4.3c-.5.3-1.1.6-1.7.8l1.1 1.7a16.6 16.6 0 0 0 5.1-2.6c.4-4.3-.7-8-3-11.4ZM8.7 14.5c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z"/></svg>';

$$("[data-staff]").forEach((box) => {
  loadJSON("data/staff.json")
    .then((staff) => {
      staff = staff.filter((s) => s && s.name);
      if (!staff.length) {
        box.innerHTML = '<p class="empty panel">Staff list coming soon.</p>';
        return;
      }
      box.innerHTML = `<div class="slider">
        <button class="slide-arrow prev" type="button" aria-label="Previous staff">${ARROW}</button>
        <div class="staff-track" tabindex="0" aria-label="Staff members">${staff.map(staffCard).join("")}</div>
        <button class="slide-arrow next" type="button" aria-label="Next staff">${ARROW}</button>
      </div>
      <div class="slide-dots" aria-hidden="true"></div>
      <div class="slide-count" aria-live="polite"></div>`;
      setupSlider(box);
      $$("img[data-skin]", box).forEach((img) =>
        img.addEventListener("error", () => {
          const ph = document.createElement("div");
          ph.className = "ph";
          img.replaceWith(ph);
        })
      );
    })
    .catch(() => {
      box.innerHTML = '<p class="empty panel">The staff list couldn\'t load. If you just edited <b>data/staff.json</b>, check it for a missing comma or quote mark.</p>';
    });
});

const ARROW = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 4h3v3h3v3h3v4h-3v3h-3v3H8v-3h3v-3h3v-4h-3V7H8z"/></svg>';

function setupSlider(box) {
  const track = $(".staff-track", box);
  const prev = $(".prev", box);
  const next = $(".next", box);
  const dotsBox = $(".slide-dots", box);
  const cards = $$(".staff", track);

  // how far one arrow click moves: one card plus the gap
  const step = () => {
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    return cards[0].getBoundingClientRect().width + gap;
  };
  const perView = () => Math.max(1, Math.round(track.clientWidth / step()));
  const pages = () => Math.max(1, cards.length - perView() + 1);
  const index = () => Math.round(track.scrollLeft / step());

  function drawDots() {
    const n = pages();
    dotsBox.innerHTML = n > 1 ? Array.from({ length: n }, () => "<i></i>").join("") : "";
    update();
  }
  function update() {
    const i = index();
    const max = track.scrollWidth - track.clientWidth - 2;
    prev.disabled = track.scrollLeft <= 2;
    next.disabled = track.scrollLeft >= max;
    box.classList.toggle("no-slide", max <= 0);
    $$("i", dotsBox).forEach((d, k) => d.classList.toggle("on", k === i));
    const count = $(".slide-count", box);
    if (count) count.textContent = cards.length > 1 ? `${i + 1} / ${cards.length}` : "";
  }

  prev.addEventListener("click", () => track.scrollBy({ left: -step(), behavior: "smooth" }));
  next.addEventListener("click", () => track.scrollBy({ left: step(), behavior: "smooth" }));
  track.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); prev.click(); }
    if (e.key === "ArrowRight") { e.preventDefault(); next.click(); }
  });
  let t;
  track.addEventListener("scroll", () => { clearTimeout(t); t = setTimeout(update, 60); }, { passive: true });
  addEventListener("resize", drawDots);
  drawDots();
}

function staffCard(s) {
  const roles = Array.isArray(s.roles) ? s.roles : [s.role || s.roles || "Staff"];
  const c = colourFor(roles[0]);
  const mc = s.skin || s.name;
  return `<div class="staff panel" style="--c:${c}">
    <div class="skin"><img data-skin src="https://mc-heads.net/body/${encodeURIComponent(mc)}/180" alt="${esc(s.name)}'s Minecraft skin" loading="lazy"></div>
    <div class="info">
      <div class="roles">${roles.map((r) => `<span class="chip" style="--c:${colourFor(r)}">${esc(r)}</span>`).join("")}</div>
      <h3>${esc(s.name)}</h3>
      ${s.discord ? `<span class="handle">${DISCORD_SVG}${esc(s.discord)}</span>` : ""}
      ${s.bio ? `<p class="bio">${esc(s.bio)}</p>` : ""}
      <a class="nm" href="https://namemc.com/profile/${encodeURIComponent(mc)}" target="_blank" rel="noopener">View profile →</a>
    </div>
  </div>`;
}

/* ---------- hero scene (shows if no hero.jpg is uploaded) ---------- */
(function () {
  const c = $("canvas.hero-bg");
  if (!c) return;
  const ctx = c.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let w, h, flakes = [], layers = [];
  function rnd(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }
  function build() {
    const d = devicePixelRatio || 1;
    w = c.clientWidth; h = c.clientHeight;
    c.width = w * d; c.height = h * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const r = rnd(11);
    const defs = [
      { base: 0.5, amp: 0.3, step: 32, col: "#1a4560", snow: true },
      { base: 0.66, amp: 0.22, step: 24, col: "#123247" },
      { base: 0.82, amp: 0.14, step: 16, col: "#0d2333" },
    ];
    layers = defs.map((L) => {
      const pts = [];
      let y = h * L.base;
      for (let x = 0; x <= w + L.step; x += L.step) {
        y += (r() - 0.5) * h * L.amp * 0.35;
        y = Math.max(h * (L.base - L.amp), Math.min(h * L.base + 20, y));
        pts.push([x, Math.round(y / 8) * 8]);
      }
      return { ...L, pts };
    });
    flakes = Array.from({ length: Math.round(w / 14) }, () => ({ x: Math.random() * w, y: Math.random() * h, s: 2 + Math.floor(Math.random() * 3), v: 0.2 + Math.random() * 0.5 }));
  }
  function draw() {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0e2a3e"); g.addColorStop(0.5, "#1c5f80"); g.addColorStop(1, "#0b1219");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (const L of layers) {
      for (let i = 0; i < L.pts.length - 1; i++) {
        const [x, y] = L.pts[i], nx = L.pts[i + 1][0];
        ctx.fillStyle = L.col; ctx.fillRect(x, y, nx - x + 1, h - y);
        if (L.snow) { ctx.fillStyle = "rgba(190,235,250,.5)"; ctx.fillRect(x, y, nx - x + 1, 8); }
      }
    }
    ctx.fillStyle = "rgba(220,245,255,.7)";
    for (const f of flakes) {
      ctx.fillRect(Math.round(f.x), Math.round(f.y), f.s, f.s);
      if (!reduce) { f.y += f.v; f.x += Math.sin(f.y / 40) * 0.2; if (f.y > h) { f.y = -4; f.x = Math.random() * w; } }
    }
    if (!reduce) requestAnimationFrame(draw);
  }
  build(); draw();
  addEventListener("resize", () => { build(); if (reduce) draw(); });
})();
