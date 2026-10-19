/* ============================================================
   Dualmines – Discord login service (Cloudflare Worker)

   What it does:
   1. /login     sends the player to Discord to log in
   2. /callback  Discord sends them back here; we check who they are with
                 Discord, then give the website a Firebase login token that
                 proves their Discord account. Nobody can fake it.

   Settings (Cloudflare → your Worker → Settings → Variables and Secrets):
     DISCORD_CLIENT_ID          Text    from the Discord Developer Portal
     DISCORD_CLIENT_SECRET      Secret  from the Discord Developer Portal
     FIREBASE_SERVICE_ACCOUNT   Secret  the whole JSON file from Firebase → Service accounts
     ALLOWED_RETURN             Text    https://www.dualmines.net,https://dualmines.net
   ============================================================ */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowed = (env.ALLOWED_RETURN || "https://www.dualmines.net,https://dualmines.net")
      .split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);

    try {
      if (url.pathname === "/login") return login(url, env, allowed);
      if (url.pathname === "/callback") return await callback(url, env, allowed);
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

/* Firebase custom token, signed with the service account key (RS256) */
async function firebaseCustomToken(env, uid, claims) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) throw new Error("FIREBASE_SERVICE_ACCOUNT isn't set on the Worker.");
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now,
    exp: now + 3600,
    uid,
    claims,
  };
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const data = enc(header) + "." + enc(payload);
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
