# ST Admin (Shani Traders master control)

Separate GitHub repository so it installs as its own app next to the customer app.
Open: https://<your-github-name>.github.io/st-admin/

Files (main folder): index.html · admin.js · admin.css · app.css · config.js · i18n.js · sw.js · manifest.webmanifest ·
starter-items.json · version.json · README.md. Folder `images`: admin icons.

- `config.js` must have the same `apiUrl` as the customer app.
- If the red box "Google Apps Script still has an old Code.gs" appears, follow its steps.
- Tabs: Orders · Items · Categories · Customers · Offers · Gifts · Settings.
- New orders: checked every 30 seconds while ST Admin is open (every minute in the background). A new order rings,
  vibrates and shows a phone notification (Settings › Turn on notifications). Counter mode keeps the screen on.
- Offers: banners on the customer home page with start and end dates; tapping can open a category or an item.
- Backup: every night at about 2 am an Excel copy of the sheet is saved in Drive › "Shani Traders backups"
  (newest 30 kept). Settings › Backup now makes one at once. To restore: open the file in Drive › Save as Google Sheets.
- Photo names for "Upload many photos": item-code.jpg, item-code--3.jpg (option 3), cat-category-code.jpg.
  Press "Update catalogue" before uploading option photos.
- New version: upload the changed files, raise `version.json`, then Settings › Update to latest version.
