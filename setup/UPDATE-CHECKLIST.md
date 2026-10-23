# Update checklist: appeals + admin logs

Do these in order. The full details for steps 1–3 are in `SETUP-APPEALS.md`.

## Discord (Developer Portal → your Dualmines app)
- [ ] **Bot → Reset Token** and copy the token
- [ ] Invite the bot: `https://discord.com/oauth2/authorize?client_id=1561830057889103884&scope=bot&permissions=19456`
- [ ] Check the bot can see and post in the appeals channel

## Cloudflare
- [ ] **Storage & Databases → KV → Create** a namespace called `dualmines-appeal-files`
- [ ] Worker → **Settings → Bindings → Add → KV namespace**: name `APPEAL_FILES`
- [ ] Worker → **Edit code**: paste the new `discord-auth-worker.js`, then click **Deploy**
- [ ] Worker → **Variables and Secrets**, add:
  - [ ] Secret `DISCORD_BOT_TOKEN`
  - [ ] Text `APPEALS_CHANNEL_ID` = `1563251322072072394`
  - [ ] Text `STAFF_ROLE_ID` = your staff role's ID (optional)
  - [ ] Text `OWNER_EMAILS` = `zxppez@dualmines.net`
  - [ ] Text `SITE_URL` = `https://www.dualmines.net`
- [ ] **Deployments**: make sure the newest version is active

## Website (VS Code)
Copy in every file from the zip **except `assets/firebase-config.js`** (keep yours). Then commit and push.

Changed: all `.html` pages, `assets/style.css`, `assets/backend.js`, `assets/apply.js`, `assets/admin.js`
New: `appeal.html`, `assets/appeal.js`, `assets/form-ui.js`

## Firebase
- [ ] **Firestore Database → Rules**: paste the new `firestore.rules`, then click **Publish** (this adds appeals and logs)

## Admin panel
- [ ] **Questions → Appeal form** → check it over, then click **Save changes** (appeals stay closed until you do)
- [ ] Test: send an appeal from the Appeal page, check the message in Discord, then accept it and check the DM
- [ ] Open the **Logs** tab (owner only) and check your actions appear
