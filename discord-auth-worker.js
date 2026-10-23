/* ============================================================
   Dualmines – Discord login + online players service (Cloudflare Worker)

   What it does:
   1. /login     sends the player to Discord to log in
   2. /callback  Discord sends them back here; we check who they are with
                 Discord, then give the website a Firebase login token that
                 proves their Discord account. Nobody can fake it.
   3. /players   the DualminesStatus plugin on the Minecraft server sends the
                 online player list here; we save it to Firebase for the website.
   4. /appeal/*  punishment appeals: saves appeals and their files, posts new
                 appeals in your Discord channel, and DMs players the verdict.

   Settings (Cloudflare → your Worker → Settings → Variables and Secrets):
     DISCORD_CLIENT_ID          Text    from the Discord Developer Portal
     DISCORD_CLIENT_SECRET      Secret  from the Discord Developer Portal
     FIREBASE_SERVICE_ACCOUNT   Secret  the whole JSON file from Firebase → Service accounts
     ALLOWED_RETURN             Text    https://www.dualmines.net,https://dualmines.net
     STATUS_SECRET              Secret  a long random password, the same as "secret" in the plugin's config.yml
     DISCORD_BOT_TOKEN          Secret  Discord Developer Portal → your app → Bot → Reset Token
     APPEALS_CHANNEL_ID         Text    1563251322072072394
     STAFF_ROLE_ID              Text    (optional) role to ping for new appeals
     OWNER_EMAILS               Text    zxppez@dualmines.net   (same owners as firestore.rules)
     SITE_URL                   Text    https://www.dualmines.net

   Binding (Settings → Bindings → Add → KV namespace):
     APPEAL_FILES               the KV namespace that stores appeal uploads
   ============================================================ */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowed = (env.ALLOWED_RETURN || "https://www.dualmines.net,https://dualmines.net")
      .split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);

    if (url.pathname.startsWith("/appeal")) return appealRouter(request, url, env, allowed);

    try {
      if (url.pathname === "/login") return login(url, env, allowed);
      if (url.pathname === "/callback") return await callback(url, env, allowed);
      if (url.pathname === "/players" && request.method === "POST") return await savePlayers(request, env);
      return text("Dualmines Discord login service is running.");
    } catch (err) {
      return text("Login failed: " + (err && err.message ? err.message : err), 500);
    }
  },
};

function login(url, env, allowed) {
  const ret = url.searchParams.get("return") || "";
  const state = url.searchParams.get("state") || "";
  if (!okReturn(ret, allowed)) return text("This website isn't allowed to use Discord login. Add it to ALLOWED_RETURN.", 400);
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(state)) return text("Invalid login request.", 400);
  if (!env.DISCORD_CLIENT_ID) return text("DISCORD_CLIENT_ID isn't set on the Worker.", 500);

  const d = new URL("https://discord.com/oauth2/authorize");
  d.searchParams.set("client_id", env.DISCORD_CLIENT_ID);
  d.searchParams.set("response_type", "code");
  d.searchParams.set("redirect_uri", url.origin + "/callback");
  d.searchParams.set("scope", "identify");
  d.searchParams.set("prompt", "none");
  d.searchParams.set("state", b64url(new TextEncoder().encode(JSON.stringify({ r: ret, s: state }))));
  return Response.redirect(d.toString(), 302);
}

async function callback(url, env, allowed) {
  let packed;
  try {
    packed = JSON.parse(new TextDecoder().decode(unb64url(url.searchParams.get("state") || "")));
  } catch (e) {
    return text("Invalid login request.", 400);
  }
  const ret = packed && packed.r;
  if (!okReturn(ret, allowed)) return text("Invalid return address.", 400);
  const back = (hash) => Response.redirect(ret + "#" + hash, 302);

  if (url.searchParams.get("error")) return back("discord_error=cancelled");
  const code = url.searchParams.get("code");
  if (!code) return back("discord_error=no_code");

  // Swap the code for a Discord access token
  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: url.origin + "/callback",
    }),
  });
  if (!tokenRes.ok) return back("discord_error=token");
  const { access_token } = await tokenRes.json();

  // Ask Discord who this is
  const meRes = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: "Bearer " + access_token } });
  if (!meRes.ok) return back("discord_error=profile");
  const me = await meRes.json();

  const token = await firebaseCustomToken(env, "discord:" + me.id, {
    discord_id: String(me.id),
    discord_name: String(me.username || ""),
    discord_display: String(me.global_name || me.username || ""),
    discord_avatar: String(me.avatar || ""),
  });
  return back("discord_token=" + encodeURIComponent(token) + "&state=" + encodeURIComponent(packed.s));
}

/* ---------- online players (from the DualminesStatus plugin) ---------- */
async function savePlayers(request, env) {
  if (!env.STATUS_SECRET) return text("STATUS_SECRET isn't set on the Worker.", 500);
  const auth = request.headers.get("Authorization") || "";
  if (!safeEqual(auth, "Bearer " + env.STATUS_SECRET)) return text("Wrong secret.", 401);

  let body;
  try { body = await request.json(); } catch (e) { return text("Bad JSON.", 400); }
  const list = Array.isArray(body.players) ? body.players.slice(0, 500) : [];
  const players = list
    .filter((p) => p && typeof p.name === "string" && /^[A-Za-z0-9_.*-]{1,32}$/.test(p.name))
    .map((p) => ({ name: p.name, uuid: typeof p.uuid === "string" && /^[0-9a-fA-F-]{32,36}$/.test(p.uuid) ? p.uuid : "" }));
  const online = Math.max(0, Math.min(100000, parseInt(body.online, 10) || players.length));
  const max = Math.max(0, Math.min(100000, parseInt(body.max, 10) || 0));

  const sa = serviceAccount(env);
  const token = await googleAccessToken(sa);
  const doc = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/status/players`;
  const res = await fetch(doc, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        online: { integerValue: String(online) },
        max: { integerValue: String(max) },
        updatedAt: { timestampValue: new Date().toISOString() },
        players: { arrayValue: players.length ? { values: players.map((p) => ({ mapValue: { fields: { name: { stringValue: p.name }, uuid: { stringValue: p.uuid } } } })) } : {} },
      },
    }),
  });
  if (!res.ok) return text("Firebase error: " + (await res.text()).slice(0, 300), 502);
  return text("ok");
}

let cachedToken = null;
async function googleAccessToken(sa) {
  if (cachedToken && Date.now() < cachedToken.exp - 60000) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJwt(sa, {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error("Couldn't log in to Firebase with the service account: " + (await res.text()).slice(0, 200));
  const j = await res.json();
  cachedToken = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/* ---------- signing ---------- */
function serviceAccount(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) throw new Error("FIREBASE_SERVICE_ACCOUNT isn't set on the Worker.");
  return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
}

/* Firebase custom token, signed with the service account key (RS256) */
async function firebaseCustomToken(env, uid, claims) {
  const sa = serviceAccount(env);
  const now = Math.floor(Date.now() / 1000);
  return signJwt(sa, {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now,
    exp: now + 3600,
    uid,
    claims,
  });
}

async function signJwt(sa, payload) {
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const data = enc({ alg: "RS256", typ: "JWT" }) + "." + enc(payload);
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data));
  return data + "." + b64url(new Uint8Array(sig));
}

function okReturn(ret, allowed) {
  try {
    const u = new URL(ret);
    const origin = u.origin;
    const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    return allowed.includes(origin) || local;
  } catch (e) {
    return false;
  }
}
function b64url(bytes) {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
}
function text(msg, status = 200) {
  return new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}


/* ============================================================
   APPEALS
   ============================================================ */
const FILE_LIMIT = 25 * 1000 * 1000; // 25 MB per file
const MAX_FILES = 5;
const FILE_TYPES = /^(image\/(png|jpe?g|gif|webp)|video\/(mp4|webm|quicktime))$/;

async function appealRouter(request, url, env, allowed) {
  const origin = request.headers.get("Origin") || "";
  const okOrigin = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const cors = {
    "Access-Control-Allow-Origin": okOrigin ? origin : allowed[0] || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-File-Name",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const reply = (body, status = 200, extra = {}) =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json", ...extra },
    });

  try {
    const sa = serviceAccount(env);
    const user = await verifyIdToken((request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""), sa.project_id);
    if (!user) return reply({ error: "Please log in again." }, 401);
    const p = url.pathname;

    /* ---------- player side ---------- */
    if (p === "/appeal/start" && request.method === "POST") {
      const me = applicantOf(user);
      if (!me) return reply({ error: "Please log in with Discord." }, 401);
      const body = await request.json().catch(() => null);
      if (!body) return reply({ error: "Bad request." }, 400);

      const form = await fsGet(env, "settings/appealForm");
      if (!form || !form.open) return reply({ error: "Appeals are closed right now." }, 403);
      const type = (form.roles || []).find((t) => t.id === body.type && t.open);
      if (!type) return reply({ error: "You can't appeal that type of punishment right now." }, 400);

      const answers = Array.isArray(body.answers) ? body.answers.slice(0, 60) : [];
      for (const a of answers) {
        if (!a || typeof a.q !== "string" || typeof a.value !== "string" || a.q.length > 300 || a.value.length > 3000) {
          return reply({ error: "One of your answers is too long." }, 400);
        }
      }
      const files = form.files || {};
      const fileCount = files.enabled === false ? 0 : Math.max(0, Math.min(MAX_FILES, parseInt(body.fileCount, 10) || 0));
      if (files.enabled !== false && files.required && fileCount < 1) return reply({ error: "Please attach at least one file." }, 400);

      const mine = await fsQuery(env, "appeals", "discordId", me.id);
      if (mine.some((a) => a.status === "pending" && a.submitted !== false)) return reply({ error: "You already have an appeal waiting to be reviewed." }, 409);
      // Clear out any earlier attempt that never finished uploading.
      for (const old of mine.filter((a) => a.submitted === false)) await deleteAppeal(env, old._id);

      const id = await fsCreate(env, "appeals", {
        answers: answers.map((a) => ({ q: a.q, type: String(a.type || "").slice(0, 20), value: a.value })),
        type: type.name,
        typeId: type.id,
        status: "pending",
        createdAt: new Date(),
        uid: user.uid,
        discordId: me.id,
        discordName: me.name,
        discordDisplay: me.display,
        discordAvatar: me.avatar,
        fileCount,
        files: [],
        submitted: false,
      });
      return reply({ id });
    }

    if (p === "/appeal/file" && request.method === "POST") {
      const me = applicantOf(user);
      if (!me) return reply({ error: "Please log in with Discord." }, 401);
      if (!env.APPEAL_FILES) return reply({ error: "File uploads aren't set up yet (APPEAL_FILES)." }, 500);
      const id = url.searchParams.get("id") || "";
      const n = parseInt(url.searchParams.get("n"), 10);
      const appeal = await fsGet(env, "appeals/" + safeId(id));
      if (!appeal || appeal.discordId !== me.id || appeal.submitted) return reply({ error: "Appeal not found." }, 404);
      if (!(n >= 0 && n < appeal.fileCount)) return reply({ error: "Too many files." }, 400);
      const type = (request.headers.get("Content-Type") || "").toLowerCase().split(";")[0];
      if (!FILE_TYPES.test(type)) return reply({ error: "Only images (PNG, JPG, GIF, WebP) and videos (MP4, WebM, MOV) can be uploaded." }, 415);
      if (Number(request.headers.get("Content-Length") || 0) > FILE_LIMIT) return reply({ error: "Each file must be 25 MB or smaller." }, 413);
      const data = await request.arrayBuffer();
      if (data.byteLength > FILE_LIMIT) return reply({ error: "Each file must be 25 MB or smaller." }, 413);
      if (!data.byteLength) return reply({ error: "That file is empty." }, 400);
      let name = "file";
      try { name = decodeURIComponent(request.headers.get("X-File-Name") || "file"); } catch (e) {}
      name = name.replace(/[^\w.\- ()]/g, "_").slice(0, 80) || "file";
      await env.APPEAL_FILES.put(`${safeId(id)}/${n}`, data, { metadata: { name, type, size: data.byteLength } });
      return reply({ ok: true });
    }

    if (p === "/appeal/finish" && request.method === "POST") {
      const me = applicantOf(user);
      if (!me) return reply({ error: "Please log in with Discord." }, 401);
      const id = safeId(url.searchParams.get("id") || "");
      const appeal = await fsGet(env, "appeals/" + id);
      if (!appeal || appeal.discordId !== me.id) return reply({ error: "Appeal not found." }, 404);
      if (appeal.submitted) return reply({ ok: true });
      const files = [];
      if (env.APPEAL_FILES && appeal.fileCount) {
        const list = await env.APPEAL_FILES.list({ prefix: id + "/" });
        for (const k of list.keys) {
          const m = k.metadata || {};
          files.push({ n: parseInt(k.name.split("/")[1], 10), name: m.name || "file", type: m.type || "", size: m.size || 0 });
        }
        files.sort((a, b) => a.n - b.n);
      }
      await fsUpdate(env, "appeals/" + id, { files, submitted: true });
      const posted = await postNewAppeal(env, id, { ...appeal, files });
      await fsUpdate(env, "appeals/" + id, { announced: posted });
      return reply({ ok: true });
    }

    /* ---------- admin side ---------- */
    const admin = await adminOf(env, user);
    if (!admin) return reply({ error: "Only admins can do that." }, 403);

    if (p === "/appeal/file" && request.method === "GET") {
      const id = safeId(url.searchParams.get("id") || "");
      const n = parseInt(url.searchParams.get("n"), 10);
      if (!env.APPEAL_FILES) return reply({ error: "File storage isn't set up (APPEAL_FILES)." }, 500);
      const obj = await env.APPEAL_FILES.getWithMetadata(`${id}/${n}`, { type: "arrayBuffer" });
      if (!obj || !obj.value) return reply({ error: "File not found." }, 404);
      const m = obj.metadata || {};
      return new Response(obj.value, {
        headers: { ...cors, "Content-Type": m.type || "application/octet-stream", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
      });
    }

    if (p === "/appeal/verdict" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const id = safeId(body.id || "");
      const verdict = body.verdict === "accepted" ? "accepted" : body.verdict === "denied" ? "denied" : "";
      if (!verdict) return reply({ error: "Choose accept or deny." }, 400);
      const note = String(body.note || "").slice(0, 1000);
      const appeal = await fsGet(env, "appeals/" + id);
      if (!appeal) return reply({ error: "Appeal not found." }, 404);
      await fsUpdate(env, "appeals/" + id, { status: verdict, verdictNote: note, decidedBy: admin, decidedAt: new Date() });
      const dm = await dmVerdict(env, appeal, verdict, note);
      await fsUpdate(env, "appeals/" + id, { dmSent: dm.ok, dmError: dm.ok ? "" : dm.error });
      await writeLog(env, admin, user.uid, "appeal." + verdict,
        `${verdict === "accepted" ? "Accepted" : "Denied"} the ${appeal.type} appeal from @${appeal.discordName}${appeal.status !== "pending" ? ` (was ${appeal.status})` : ""}`,
        { appealId: id, discordId: appeal.discordId, note, dmSent: dm.ok });
      return reply({ ok: true, dmSent: dm.ok, dmError: dm.error || "" });
    }

    if (p === "/appeal/delete" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const ids = (Array.isArray(body.ids) ? body.ids : []).slice(0, 100).map(safeId).filter(Boolean);
      const names = [];
      for (const id of ids) {
        const a = await fsGet(env, "appeals/" + id);
        if (a) names.push("@" + a.discordName + " (" + a.status + ")");
        await deleteAppeal(env, id);
      }
      await writeLog(env, admin, user.uid, "appeal.delete",
        `Deleted ${ids.length} appeal${ids.length === 1 ? "" : "s"}${names.length && names.length <= 5 ? ": " + names.join(", ") : ""}`, { count: ids.length });
      return reply({ ok: true, deleted: ids.length });
    }

    return reply({ error: "Not found." }, 404);
  } catch (err) {
    return reply({ error: "Something went wrong: " + (err && err.message ? err.message : err) }, 500);
  }
}

async function writeLog(env, actor, actorUid, action, summary, details) {
  try {
    await fsCreate(env, "logs", { action, summary: summary.slice(0, 480), details, actor, actorUid, at: new Date(), via: "worker" });
  } catch (e) {
    // never block the action itself because logging failed
  }
}

async function deleteAppeal(env, id) {
  if (env.APPEAL_FILES) {
    const list = await env.APPEAL_FILES.list({ prefix: id + "/" });
    await Promise.all(list.keys.map((k) => env.APPEAL_FILES.delete(k.name)));
  }
  await fsDelete(env, "appeals/" + id);
}

const safeId = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);

function applicantOf(user) {
  const c = user.claims;
  if (!c.discord_id || user.uid !== "discord:" + c.discord_id) return null;
  return { id: String(c.discord_id), name: c.discord_name || "", display: c.discord_display || c.discord_name || "", avatar: c.discord_avatar || "" };
}

/* Returns the admin's username, or null. */
async function adminOf(env, user) {
  const email = (user.claims.email || "").toLowerCase();
  if (!email) return null;
  const owners = (env.OWNER_EMAILS || "zxppez@dualmines.net").toLowerCase().split(",").map((s) => s.trim());
  if (owners.includes(email)) return email.split("@")[0];
  const doc = await fsGet(env, "admins/" + safeId(user.uid));
  return doc ? email.split("@")[0] : null;
}

/* ---------- Discord bot ---------- */
async function discordApi(env, path, body) {
  if (!env.DISCORD_BOT_TOKEN) return { ok: false, error: "DISCORD_BOT_TOKEN isn't set on the Worker." };
  const res = await fetch("https://discord.com/api/v10" + path, {
    method: "POST",
    headers: { Authorization: "Bot " + env.DISCORD_BOT_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.message || "Discord error " + res.status, code: data.code };
  return { ok: true, data };
}

function siteUrl(env) {
  return (env.SITE_URL || "https://www.dualmines.net").replace(/\/$/, "");
}

async function postNewAppeal(env, id, appeal) {
  const channel = env.APPEALS_CHANNEL_ID || "1563251322072072394";
  const role = (env.STAFF_ROLE_ID || "").trim();
  const link = `${siteUrl(env)}/admin.html#appeal-${id}`;
  const first = (appeal.answers || []).find((a) => a.value) || {};
  const res = await discordApi(env, `/channels/${channel}/messages`, {
    content: role ? `<@&${role}> New appeal submitted` : "New appeal submitted",
    allowed_mentions: role ? { roles: [role] } : { parse: [] },
    embeds: [{
      title: `Appeal: ${appeal.type}`,
      url: link,
      color: 0x3ec8f2,
      description: `**${appeal.discordDisplay || appeal.discordName}** (<@${appeal.discordId}>) has submitted an appeal.`,
      fields: [
        ...(first.q ? [{ name: first.q.slice(0, 250), value: first.value.slice(0, 1000), inline: true }] : []),
        { name: "Files", value: String((appeal.files || []).length), inline: true },
      ],
      footer: { text: "Dualmines appeals" },
      timestamp: new Date().toISOString(),
    }],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: "Open appeal", url: link }] }],
  });
  return res.ok;
}

async function dmVerdict(env, appeal, verdict, note) {
  const ch = await discordApi(env, "/users/@me/channels", { recipient_id: appeal.discordId });
  const closed = "Their DMs are closed, or they don't share a server with the bot.";
  if (!ch.ok) return { ok: false, error: ch.code === 50007 ? closed : ch.error };
  const accepted = verdict === "accepted";
  const msg = await discordApi(env, `/channels/${ch.data.id}/messages`, {
    embeds: [{
      title: accepted ? "Your Dualmines appeal was accepted" : "Your Dualmines appeal was denied",
      color: accepted ? 0x5ee38a : 0xff6b6b,
      description: accepted
        ? `Good news! Your **${appeal.type}** appeal has been accepted.`
        : `Your **${appeal.type}** appeal has been reviewed and denied.`,
      fields: note ? [{ name: "Message from staff", value: note.slice(0, 1000) }] : [],
      footer: { text: "Dualmines" },
      timestamp: new Date().toISOString(),
    }],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: "View on the website", url: `${siteUrl(env)}/appeal.html` }] }],
  });
  if (!msg.ok) {
    return { ok: false, error: msg.code === 50007 ? closed : msg.error };
  }
  return { ok: true };
}

/* ---------- Firebase ID token check ---------- */
let jwksCache = null;
async function verifyIdToken(token, projectId) {
  const parts = (token || "").split(".");
  if (parts.length !== 3) return null;
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(unb64url(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(unb64url(parts[1])));
  } catch (e) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== "RS256" || payload.aud !== projectId || payload.iss !== "https://securetoken.google.com/" + projectId) return null;
  if (!(payload.exp > now) || !(payload.iat <= now + 300) || !payload.sub) return null;

  if (!jwksCache || Date.now() > jwksCache.exp) {
    const res = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
    const j = await res.json();
    jwksCache = { keys: j.keys || [], exp: Date.now() + 3600 * 1000 };
  }
  const jwk = jwksCache.keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, unb64url(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
  return ok ? { uid: payload.sub, claims: payload } : null;
}

/* ---------- Firestore (REST, as the service account) ---------- */
function fsBase(env) {
  return `https://firestore.googleapis.com/v1/projects/${serviceAccount(env).project_id}/databases/(default)/documents`;
}
async function fsFetch(env, url, opts = {}) {
  const token = await googleAccessToken(serviceAccount(env));
  return fetch(url, { ...opts, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(opts.headers || {}) } });
}
async function fsGet(env, path) {
  const res = await fsFetch(env, `${fsBase(env)}/${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Firebase read failed (" + res.status + ")");
  const doc = await res.json();
  return fromFields(doc.fields || {});
}
async function fsCreate(env, collection, data) {
  const res = await fsFetch(env, `${fsBase(env)}/${collection}`, { method: "POST", body: JSON.stringify({ fields: toFields(data) }) });
  if (!res.ok) throw new Error("Firebase write failed (" + res.status + ")");
  const doc = await res.json();
  return doc.name.split("/").pop();
}
async function fsUpdate(env, path, data) {
  const mask = Object.keys(data).map((k) => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
  const res = await fsFetch(env, `${fsBase(env)}/${path}?${mask}`, { method: "PATCH", body: JSON.stringify({ fields: toFields(data) }) });
  if (!res.ok) throw new Error("Firebase update failed (" + res.status + ")");
}
async function fsDelete(env, path) {
  const res = await fsFetch(env, `${fsBase(env)}/${path}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error("Firebase delete failed (" + res.status + ")");
}
async function fsQuery(env, collection, field, value) {
  const res = await fsFetch(env, `${fsBase(env)}:runQuery`, {
    method: "POST",
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: toValue(value) } }, limit: 50 } }),
  });
  if (!res.ok) throw new Error("Firebase query failed (" + res.status + ")");
  const rows = await res.json();
  return rows.filter((r) => r.document).map((r) => ({ ...fromFields(r.document.fields || {}), _id: r.document.name.split("/").pop() }));
}
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(toValue) } : {} };
  return { mapValue: { fields: toFields(v) } };
}
function toFields(o) {
  const f = {};
  for (const [k, v] of Object.entries(o)) f[k] = toValue(v);
  return f;
}
function fromValue(v) {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
  if ("mapValue" in v) return fromFields(v.mapValue.fields || {});
  return null;
}
function fromFields(f) {
  const o = {};
  for (const [k, v] of Object.entries(f)) o[k] = fromValue(v);
  return o;
}
