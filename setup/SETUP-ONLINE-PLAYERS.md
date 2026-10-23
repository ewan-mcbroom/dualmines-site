# Showing who's online on the website

Minehut's proxy hides player names from the public server ping, so the **DualminesStatus** plugin sends the list itself:

**Minecraft server (plugin)** → **Cloudflare Worker** → **Firebase** → **website**

The plugin sends the list when someone joins or leaves, and checks in every 2 minutes. If the server goes offline or the plugin stops checking in, the website goes back to showing just the player count.

## 1. Update the Cloudflare Worker
1. In Cloudflare, open your Worker (`dualmines-auth`) and click **Edit code**.
2. Replace everything with the new `discord-auth-worker.js`, then click **Deploy**. Discord login keeps working, because this version only adds the player list part.
3. Go to **Settings → Variables and Secrets → Add**:
   - Type: **Secret**
   - Name: `STATUS_SECRET`
   - Value: `Zf7DjwcIiDSHbEk67WoK6rYCN9IQs2BrGNiYrAoMk-w`
4. Open **Deployments** and make sure the **newest** version is the active one (⋯ → Deploy version if not).

## 2. Install the plugin on Minehut
1. In the Minehut dashboard, open your server's **File Manager** and go into the `plugins` folder.
2. Upload `DualminesStatus.jar`.
3. **Restart** the server. The plugin creates `plugins/DualminesStatus/config.yml`.
4. Open that `config.yml` and change the `endpoint` line to your Worker address (no slash on the end):
   ```yaml
   endpoint: "https://dualmines-auth.yourname.workers.dev"
   ```
   The `secret` line is already filled in and matches step 1.3. Leave it as it is.
5. Save, then **restart** the server again.

In the server console you should see:
`[DualminesStatus] Sending online players to https://dualmines-auth...`

## 3. Update the website and Firebase
1. Push the new `assets/site.js` to GitHub.
2. In Firebase, go to **Firestore Database → Rules**, paste in the new `firestore.rules` (it adds a small `status` section), and click **Publish**.

## Check it
Join the server, open www.dualmines.net, press **Ctrl+F5**, and click the **playing right now** badge. Your name and head should be there.

## Notes
- Players hidden by vanish plugins (SuperVanish / PremiumVanish) are left out. To show them, set `hide-vanished-players: false` in the plugin's config.
- **"Wrong secret" / HTTP 401 in the console:** `secret` in the plugin's config.yml doesn't exactly match `STATUS_SECRET` in Cloudflare.
- **"Firebase error" in the console:** the Worker's `FIREBASE_SERVICE_ACCOUNT` setting is missing or wrong.
- **Names still not showing:** check the Worker version with `STATUS_SECRET` is the active deployment, and that the new Firestore rules are published.
- Keep the secret private. Anyone who has it could send a fake player list to the website, but nothing else.
