# ST Admin (Shani Traders master control)

Separate GitHub repository so it installs as its own app next to the customer app.
Open: https://<your-github-name>.github.io/st-admin/

Files (main folder): index.html · admin.js · admin.css · app.css · config.js · i18n.js · sw.js · manifest.webmanifest ·
starter-items.json · version.json · README.md. Folder `images`: admin icons.

- `config.js` must have the same `apiUrl` as the customer app.
- If the red box "Google Apps Script still has an old Code.gs" appears, follow its 4 steps.
- Photo names for "Upload many photos": item-code.jpg, item-code--3.jpg (option 3), cat-category-code.jpg.
  Press "Update catalogue" before uploading option photos.
- New version: upload the changed files, raise `version.json`, then Settings › Update to latest version.
