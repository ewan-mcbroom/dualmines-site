# Setting up "Log in with Discord" for applications

Applicants must log in with Discord before they can apply. That links every application to a real Discord account, and it's what makes bans work.

Firebase can't talk to Discord by itself, so a tiny free **Cloudflare Worker** sits in the middle. It checks who the person is with Discord, then gives the website a login that Firebase trusts. Your dualmines.net DNS is already on Cloudflare, so you already have an account.

It takes about 15 minutes. Do the steps **in this order**.

---

## 1. Create the Cloudflare Worker
1. Go to **dash.cloudflare.com**, then **Workers & Pages** in the left menu, then **Create** and **Create Worker** (or "Start with Hello World!").
2. Name it `dualmines-auth`, then click **Deploy**.
3. Click **Edit code**. Delete everything in the editor, paste in the whole of `discord-auth-worker.js`, and click **Deploy**.
4. Note your Worker's address at the top, e.g. `https://dualmines-auth.yourname.workers.dev`. You need it in the next steps.

## 2. Create the Discord application
1. Go to **discord.com/developers/applications**, then **New Application**. Name it `Dualmines`, accept and create.
2. (Optional) Upload your logo under **General Information**. Players see it when they log in.
3. Open **OAuth2** in the left menu.
   - Copy the **Client ID**.
   - Click **Reset Secret** and copy the **Client Secret**. Keep this private.
   - Under **Redirects**, click **Add Redirect** and enter your Worker address followed by `/callback`, e.g.
     `https://dualmines-auth.yourname.workers.dev/callback`
     Then click **Save Changes**.

## 3. Get the Firebase service account key
1. In Firebase, click the **cog**, then **Project settings**, then the **Service accounts** tab.
2. Click **Generate new private key**, then **Generate key**. A `.json` file downloads.
3. **Keep this file private.** Never put it on GitHub. It only goes into Cloudflare in the next step.

## 4. Add the settings to the Worker
In Cloudflare, open your Worker, then **Settings**, then **Variables and Secrets**, then **Add**. Add these four:

| Type | Name | Value |
|---|---|---|
| Text | `DISCORD_CLIENT_ID` | the Client ID from step 2 |
| Secret | `DISCORD_CLIENT_SECRET` | the Client Secret from step 2 |
| Secret | `FIREBASE_SERVICE_ACCOUNT` | open the .json file from step 3 in Notepad, copy **everything**, paste it in |
| Text | `ALLOWED_RETURN` | `https://www.dualmines.net,https://dualmines.net` |

Click **Deploy** (or Save) after adding them.

**Check:** open your Worker address in a browser. It should say *"Dualmines Discord login service is running."*

## 5. Connect the website
In VS Code, open `assets/firebase-config.js` and set your Worker address on the last line:
```js
export const DISCORD_AUTH_URL = "https://dualmines-auth.yourname.workers.dev";
```
Then commit and push the new site files (see below).

## 6. Publish the new Firestore rules
In Firebase, go to **Firestore Database**, then **Rules**. Replace everything with the new `firestore.rules`, then **Publish**.

From now on, only people logged in with Discord can send applications, and banned accounts are blocked by Firebase itself.

## 7. Tidy up your questions
Open the admin panel, then **Questions**:
- Delete the old **"Discord username"** question. It isn't needed any more because Discord login provides it.
- Set **Answer rules** on your questions (see below), then **Save changes**.

---

## What's new in the admin panel

**Applications.** Each application shows the applicant's Discord profile picture, name, @username and user ID (with a Copy ID button).

**Banning:**
- From an application, click **Ban from applying**, give a reason (the applicant sees it), and choose whether to reject their pending applications too.
- The **Bans** tab lists everyone who's banned, with an **Unban** button. You can also ban a Discord ID directly. To get someone's ID, turn on Developer Mode in Discord (Settings → Advanced), right-click them and choose **Copy User ID**.

**Answer rules (validation).** Under each question, in the Questions tab:
- **Short answer:** must be Anything / Minecraft username / Link / Email / Letters only, plus min and max characters.
- **Paragraph:** min and max characters. A minimum of 20 or more also blocks junk like "aaaaaaa" or one-word answers.
- **Number:** lowest and highest allowed, and whole numbers only.
- **Checkboxes:** pick at least / at most.

Applicants see the limits under each question, a live character counter on paragraphs, and a clear message on any answer that needs fixing.

**For applicants:**
- They see who they're logged in as, and a list of their past applications with the result.
- They can't send a new application while one is still pending.
- Banned users see that they can't apply, with the reason.

## Troubleshooting
- **"Applications open soon"** on the Apply page: `DISCORD_AUTH_URL` is still empty in `firebase-config.js`.
- **Discord says "Invalid OAuth2 redirect_uri":** the redirect in step 2 must exactly match your Worker address plus `/callback`.
- **"This website isn't allowed to use Discord login":** check `ALLOWED_RETURN` in the Worker settings.
- **"Login failed: …" page from the Worker:** a Worker setting is missing or wrong. The message says which one.
- **Application won't send ("your account can't apply"):** publish the new Firestore rules from step 6.
