# Updating the Dualmines website

Everything is edited on GitHub in your browser. Open the file, click the pencil icon (Edit), make your change, then click **Commit changes**. The site updates within a minute or two.

## Posting news

Open `data/news.json` and add a new post at the **top**, just after the opening `[`:

```json
[
  {
    "title": "Halloween event this weekend!",
    "date": "2026-10-31",
    "tag": "Event",
    "author": "Ewan",
    "body": [
      "First paragraph goes here.",
      "Second paragraph goes here. Links like https://dualmines.tebex.store become clickable, and **two stars** make text bold."
    ]
  },
  {
    "title": "Welcome to the new Dualmines website",
    ...
```

Rules that stop it breaking:
- Every post is wrapped in `{ }`, and there is a **comma** between posts (after the `}`), but **no comma after the last one**.
- All text goes inside "double quotes". If you need a quote mark inside text, write `\"`.
- The date is written `YYYY-MM-DD`. Newest posts show first automatically.
- `tag` is optional. Tags with built-in colours: Announcement, Update, Event, Maintenance, Giveaway.
- Optional picture: add `"image": "assets/your-picture.png",` and upload the picture into the `assets` folder.

If the News page says "News couldn't load", there's a typo in the file, usually a missing comma or quote. You can paste the file into https://jsonlint.com to find it.

## Editing staff

Open `data/staff.json`. Each person looks like this:

```json
{
  "name": "Ewan",
  "skin": "their_minecraft_username",
  "roles": ["Owner", "Lead Developer"],
  "discord": "their_discord_name",
  "bio": "A short line about them."
}
```

- `skin` is their Minecraft username. Their skin picture loads automatically.
- Roles with built-in colours: Owner, Co-Owner, Manager, Admin, Developer, Lead Developer, Senior Mod, Moderator, Helper, Builder.
- Staff appear in the order they are listed.

## Hero background picture (optional)

Take a nice screenshot of your spawn, name it `hero.jpg`, and upload it into the `assets` folder. It replaces the snowy mountain background on the home page automatically.

## Other settings

The server IP and Discord invite are at the top of `assets/site.js`.
