# Google Sheets — orders setup

Orders are saved in the database first, then written to your Google Sheet within seconds (and retried
automatically by the cron if Google is slow). Your call-center team works directly in the sheet: the
**Statut** column has a dropdown (Nouvelle, Confirmée, Injoignable, Reportée, Expédiée, Livrée, Retournée,
Annulée, Fausse commande) and statuses are synced back to the admin dashboard.

There are two parts: a **one-time developer setup** (5 minutes, free) and the **admin step** (paste a link).

---

## Part A — one-time: create the service account (free)
Use a personal Google account (Gmail). No billing is required.

1. Open <https://console.cloud.google.com/> → project picker → **New project** (e.g. `cod-studio`).
2. **APIs & Services → Library** → search **Google Sheets API** → **Enable**.
3. **IAM & Admin → Service Accounts → Create service account** → name `orders-writer` → **Create and continue**
   → skip roles → **Done**.
4. Open the service account → **Keys → Add key → Create new key → JSON** → a `.json` file downloads.
   Keep it private (Google auto-disables keys that leak publicly).
5. Convert it to one line of base64:
   - Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\key.json"))`
   - macOS/Linux: `base64 -w0 key.json`
6. In Hostinger (Node.js app → Environment variables) set `GOOGLE_SA_JSON_B64` to that value.

> If Google says *"Service account key creation is disabled"*, your project belongs to an organization with a
> security policy. Create the project from a personal Gmail account ("No organization") instead.

## Part B — in the admin (30 seconds)
*Settings → Google Sheets*
1. Create an empty Google Sheet in your Drive.
2. Click **Share** → add the service-account email shown in the admin (`orders-writer@…iam.gserviceaccount.com`)
   as **Editor**, untick *Notify people*.
3. Paste the sheet link → **Connect**.

The app creates a formatted **Commandes** tab (frozen header, column widths, date & price formats, status
dropdown with colors). New orders appear as rows:

`N° commande · Date · Statut · Client · Téléphone · Ville · Adresse · Produit · Variante · Qté · Total · Note · Source`

Phone numbers keep their leading zero, and customer text is sanitized so it can never become a formula.

## Part C — optional: a key for PHP exports
A **PHP export** can carry a Google key in `cod-private/config.php`, so its `order.php` writes to the store's
sheet without the platform. That key can read and change **every row** of the sheet. The platform never puts its
own key (`GOOGLE_SA_JSON_B64`) in a ZIP, because a leaked copy could then only be stopped by deleting the key every
store's sync uses. Each store brings a key of its own instead:

1. Repeat Part A steps 3–5 with a new service account, e.g. `php-exports`, in the store owner's Google Cloud project.
2. In the store's dashboard, open **Connect → Google Sheets → Key for PHP exports** and paste the JSON key. It is
   encrypted for this store and write-only: the page only shows which key is set, never the key.
3. Share the sheet with that account's email as **Editor** too.

The export dialog then offers *Include the Google key in config.php* to members who may manage integrations, and
each export's audit entry records which key went out. If a ZIP or a hosting account leaks: Google Cloud →
**IAM & Admin → Service accounts** → `php-exports` → **Keys** → delete the key. The store's sync keeps working;
paste a new key in the same place and re-export the PHP pages you keep. The platform's own key is refused there
(same account, private key or key id as `GOOGLE_SA_JSON_B64`).
