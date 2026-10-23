# Setting up appeals

Players log in with Discord at **www.dualmines.net/appeal.html**, choose what they're appealing, answer your questions and attach up to 5 images or videos. Your Cloudflare Worker saves the appeal, stores the files, and posts it in your appeals channel with an **Open appeal** button. When an admin accepts or denies it, the bot DMs the player the verdict.

You need about 15 minutes. Do the steps in order.

---

## 1. Create the bot (same Discord app as the login)
1. Go to **discord.com/developers/applications** and open your **Dualmines** app.
2. Click **Bot** in the left menu, then **Reset Token**, and copy the token. Keep it secret: anyone with it can control the bot.
3. On the same page, you can switch **Public Bot** off so only you can add it to servers. You don't need any of the "Privileged Gateway Intents".
4. Invite the bot to your Discord server by opening this link while logged in to Discord:
   `https://discord.com/oauth2/authorize?client_id=1561830057889103884&scope=bot&permissions=19456`
   Choose the Dualmines server and click **Authorize**. This gives it View Channel, Send Messages and Embed Links.
5. Make sure the bot can see and post in the appeals channel (`1563251322072072394`). If the channel is private, add the bot (or its role) to the channel's permissions.

**About DMs:** Discord only lets a bot DM someone who shares a server with it and hasn't turned off DMs from server members. **People banned from your Discord can't be DMed**, so they'll see the verdict on the Appeal page instead, and the admin panel tells you the DM didn't go through.

## 2. Create file storage (free, no card needed)
1. In Cloudflare, go to **Storage & Databases → KV**, then **Create** a namespace called `dualmines-appeal-files`.
2. Open your Worker, then **Settings → Bindings → Add → KV namespace**:
   - Variable name: `APPEAL_FILES`
   - KV namespace: `dualmines-appeal-files`

The free plan has 1 GB of file space. Deleting or clearing old appeals in the admin panel frees it up again.

## 3. Update the Worker
1. Open your Worker, click **Edit code**, replace everything with the new `discord-auth-worker.js`, and click **Deploy**.
2. Go to **Settings → Variables and Secrets** and add:

| Type | Name | Value |
|---|---|---|
| Secret | `DISCORD_BOT_TOKEN` | the bot token from step 1 |
| Text | `APPEALS_CHANNEL_ID` | `1563251322072072394` |
| Text | `STAFF_ROLE_ID` | the ID of the role to ping (see below) |
| Text | `OWNER_EMAILS` | `zxppez@dualmines.net` |
| Text | `SITE_URL` | `https://www.dualmines.net` |

   **Role ID:** in Discord, turn on Developer Mode (User Settings → Advanced), then go to Server Settings → Roles, right-click the role and choose **Copy Role ID**. If you leave `STAFF_ROLE_ID` out, the message is posted without a ping. Make sure the role allows being mentioned, or that the bot has the **Mention @everyone, @here and All Roles** permission.

3. Open **Deployments** and make sure the **newest** version is active (⋯ → Deploy version if not).

## 4. Update the website
Copy in the new and changed files (see the list below), then commit and push. Leave **your own** `assets/firebase-config.js` alone. It doesn't need any changes.

## 5. Publish the new Firestore rules
In Firebase, go to **Firestore Database → Rules**, paste in the new `firestore.rules`, and click **Publish**.

## 6. Set up the appeal form
1. Open the admin panel, then **Questions**, then **Appeal form** at the top.
2. Check the questions, choose which punishments can be appealed (Minecraft ban, Minecraft mute, Discord ban), and choose whether files are allowed or required.
3. Click **Save changes**. **You must save once**, because appeals stay closed until the appeal form has been saved.

---

## Using it
- **Appeals tab:** Pending, Accepted and Denied lists, with a filter by punishment. Click an appeal to open the viewer: Discord account, answers, and the attached images and videos (with Download links).
- **Accept / Deny:** optionally type a message for the player first. It's included in their DM. The viewer then shows whether the DM was delivered.
- **Accepting an appeal doesn't remove the punishment by itself.** Remember to unban or unmute them in-game or on Discord.
- **Change the verdict:** use "Accept instead" or "Deny instead" (the player gets a new DM).
- **Delete appeal** removes it and its files. **Clear list** does this for every accepted or denied appeal shown.
- The **Open appeal** button in Discord takes you straight to that appeal in the admin panel. Log in first if asked.
- Players can see all their appeals and verdicts on the Appeal page, and can't send another while one is pending.

## Admin logs (owners only)
The **Logs** tab is only visible to owners. It records every action admins take in the panel: logins, accepting or rejecting applications, appeal verdicts, bans and unbans, question changes, adding or removing admins, and password changes. You can filter by admin or action type, search, and clear the log.

- Admins can't read, edit or delete log entries, or write entries in someone else's name. The Firestore rules block it.
- Appeal verdicts and deletions are logged by the Worker itself, so they can't be skipped.
- Other actions are logged by the admin panel as they happen. Someone with real technical know-how could change data by going around the panel, so only give admin access to people you trust.

## Troubleshooting
- **"Appeals open soon":** `DISCORD_AUTH_URL` isn't set in `firebase-config.js`.
- **"Appeals are closed right now":** the appeal form hasn't been saved yet (step 6), or it's switched off.
- **"File uploads aren't set up yet (APPEAL_FILES)":** the KV binding in step 2 is missing, or the Worker wasn't redeployed.
- **No message in the channel:** check `DISCORD_BOT_TOKEN`, that the bot is in the server, and that it can post in that channel.
- **"Only admins can do that" when accepting or denying:** check `OWNER_EMAILS` in the Worker matches the owner in your Firestore rules. Other admins must be registered in the Admins tab.
