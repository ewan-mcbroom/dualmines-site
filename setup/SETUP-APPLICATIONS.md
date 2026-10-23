# Setting up staff applications

GitHub Pages can only host files, so applications are stored in **Firebase** (free, from Google). Firebase also handles the admin login securely. Until you do this setup, the Apply page and admin panel run in **demo mode**, which only saves in your own browser (demo login: `admin` / `admin`).

The admin panel is at **www.dualmines.net/admin.html**. It isn't in the main menu, but there's a small "Staff login" link in the footer.

## 1. Create the Firebase project
1. Go to https://console.firebase.google.com and sign in with a Google account.
2. Click **Create a project**, name it `dualmines`, and finish the steps (you can turn Google Analytics off).

## 2. Turn on login
1. In the left menu: **Build → Authentication → Get started**.
2. Under **Sign-in method**, choose **Email/Password**, switch it on, and save.
3. Go to the **Users** tab → **Add user**.
   - Email: your username followed by `@dualmines.net`, for example `zxppez@dualmines.net`
   - Password: a strong password
   This is your admin login. On the admin page you just type `zxppez` and the password.
4. Under **Settings → Authorized domains**, click **Add domain** and add `www.dualmines.net` (and `dualmines.net`).

## 3. Create the database
1. In the left menu: **Build → Firestore Database → Create database**.
2. Pick a location close to you (e.g. `europe-west2` London) and start in **production mode**.
3. Open the **Rules** tab, delete what's there, paste in everything from `firestore.rules`, and click **Publish**.
   - This makes `zxppez` the **owner**. If your username isn't `zxppez`, change `zxppez@dualmines.net` in the rules, and `OWNER_USERNAMES` in `assets/firebase-config.js`, to match.
   - You don't add other admins here. You register them in the admin panel (see below).

## 4. Connect the website
1. Click the cog icon next to **Project Overview → Project settings**.
2. Under **Your apps**, click the **</>** (web) icon, give it a nickname, and click **Register app**. You don't need Firebase Hosting.
3. Firebase shows a `firebaseConfig = { ... }` block. Copy just the `{ ... }` part.
4. In GitHub, open `assets/firebase-config.js`, click edit, and replace `null` so it looks like:
   ```js
   export const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "dualmines-xxxx.firebaseapp.com",
     projectId: "dualmines-xxxx",
     storageBucket: "dualmines-xxxx.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef"
   };
   ```
   Commit the change. These values are safe to be public. The security comes from the rules and your password.

## 5. Finish
1. Go to www.dualmines.net/admin.html and log in.
2. Open the **Questions** tab, edit the questions if you want, and click **Save changes**. **You must save once**, because applications stay closed until the form has been saved.
3. Test it by sending an application from the Apply page.

## Adding more admins
Log in as the owner, open the **Admins** tab, and fill in **Register a new admin** with a username and password. Give them those details, and they can log in straight away at /admin.html. They can change their password in the same tab.

- Only owners can add or remove admins. Every admin can review applications and edit questions.
- **Remove** takes away their access immediately. To free up the username for reuse, also delete them in Firebase → Authentication → Users.
- To make someone else an owner too, add them to both owner lists: `firestore.rules` (then Publish) and `OWNER_USERNAMES` in `assets/firebase-config.js`.

## Using the admin panel
- **Applications tab:** click an application to read it, then **Accept** or **Reject**. It moves into the Accepted or Rejected list. You can move it back to pending if you change your mind. Each of those lists has a **Clear list** button (it asks you to confirm first).
- **Roles:** in the Questions tab under Form settings, switch Staff, Builder and Developer on or off. Applicants only see the open roles and pick one before answering. Under each question, **Ask this for** chooses whether it shows for all roles or just some (e.g. a portfolio question only for Builders). In the Applications tab you can filter by role.
- **Questions tab:** add, edit, reorder or delete questions, pick the answer type, and mark questions as required. You can also open or close applications and change the intro text. Click **Save changes** when you're done.
- Old applications keep the questions they were answered with, so editing questions later doesn't mess them up.

Answer types: Short answer, Paragraph, Number, Dropdown, Multiple choice (pick one), Checkboxes (pick any), Yes / No.
