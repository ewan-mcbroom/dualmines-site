DUALMINES UPDATE: appeals + admin logs
======================================

website/   Copy everything inside this folder into your dualmines-site folder
           (the one with CNAME in it), replacing the old files. Then commit and push.

           firebase-config.js is NOT included on purpose. Keep your own copy.

           data/news.json and data/staff.json are only examples. If you've
           already written your own news or staff, don't copy these two.

setup/     Don't put these on GitHub. They're for you:
           UPDATE-CHECKLIST.md     start here, every step in order
           discord-auth-worker.js  paste into your Cloudflare Worker
           firestore.rules         paste into Firebase > Firestore > Rules
           SETUP-*.md              detailed guides for each feature

How to copy safely on Windows:
 1. Right-click the zip, choose "Extract All...", and extract into a NEW empty folder.
 2. Open the extracted "website" folder, press Ctrl+A, then Ctrl+C.
 3. Open your dualmines-site folder, press Ctrl+V, and choose "Replace the files in the destination".
 4. In VS Code, check a couple of files: news.html should start with <!doctype html>,
    and assets/admin.js should start with "import api".
