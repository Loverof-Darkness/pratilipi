# प्रतिलिपि · Pratilipi

**Copy · Store · Share**

Pratilipi is a lightweight web-based sharing drop for text, images, songs, videos, documents and other files. Create an unlisted upload session, choose how long it should live, share its QR/link with another device, upload or paste content, and get direct download links.

## Product goals

- **One place for anything** — images, audio, video, PDFs, archives and arbitrary files.
- **Fast input** — drag & drop, file picker, clipboard file/image paste and a dedicated text-paste section.
- **Phone handoff** — scan one QR code to open the same upload session on a mobile device.
- **Direct downloads** — `/d/<token>` redirects to the actual Cloudinary asset; the recipient does not land on a Pratilipi dashboard.
- **Selectable retention** — 1 hour, 12 hours, 1 day (default), 1 week or 1 month.
- **Active Uploads** — the current browser keeps a local list of active Drops and re-checks them against the backend.
- **Cloudinary storage** — browser uploads go directly to Cloudinary through an unsigned upload preset.
- **Cloudflare backend** — Pages Functions handle sessions, D1 metadata, download redirects and authenticated deletion; a scheduled Worker removes expired Cloudinary assets.

## Architecture

```text
Browser / Mobile
      │
      ├── Files / images / audio / video / raw files
      │       └── direct unsigned upload → Cloudinary
      │
      └── Text + session metadata
              └── Cloudflare Pages Functions → D1

Direct download
      Browser → /d/<token> → Pages Function → Cloudinary secure URL

Expiry cleanup
      Cloudflare Cron Worker → D1 expired Drops → Cloudinary destroy API
```

Cloudinary documents unsigned presets for direct browser uploads, its `auto` upload resource type for detecting image/video/raw asset types, and signed server-side destruction for deleting assets. urlhttps://cloudinary.com/documentation/client_side_uploading urlhttps://cloudinary.com/documentation/upload_parameters urlhttps://cloudinary.com/documentation/delete_assets

## Cloudinary configuration used by this project

```text
Cloud name: s7aopw6x
Upload preset: pratilipi
Signing mode: Unsigned
```

The unsigned preset is intended for browser uploads. The API secret is never embedded in frontend code. Cloudinary distinguishes unsigned client uploads from signed server-side operations. urlhttps://cloudinary.com/documentation/client_side_uploading

## Required Cloudflare resources

Create:

1. **Cloudflare Pages project:** `pratilipi`
2. **Cloudflare D1 database:** `pratilipi`
3. **Cloudflare Worker:** `pratilipi-cleanup` using `wrangler.cleanup.toml` with an hourly Cron trigger.

No Cloudflare R2 bucket is required by the current architecture.

### Pages binding and variables

D1 binding:

```text
DB → pratilipi
```

Variables:

```text
CLOUDINARY_CLOUD_NAME = s7aopw6x
CLOUDINARY_UPLOAD_PRESET = pratilipi
APP_ORIGIN = https://pratilipi.pages.dev
```

Secrets:

```text
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

The API key/secret are needed only for authenticated Cloudinary deletion. Cloudinary states that the Destroy API requires server-side authentication/signing and that API credentials should not be exposed in client-side code. urlhttps://cloudinary.com/documentation/delete_assets

Configure the same two secrets on the cleanup Worker.

## D1 schema

Apply `schema.sql` to the D1 database before first use:

```bash
npx wrangler login
npx wrangler d1 create pratilipi
npx wrangler d1 execute pratilipi --remote --file=./schema.sql
```

Put the returned database ID into `wrangler.toml` and `wrangler.cleanup.toml`.

## Cloudflare Pages deployment

Connect `Loverof-Darkness/pratilipi` to Cloudflare Pages:

- Production branch: `main`
- Build command: `npm install && npm run build`
- Build output directory: `dist`
- Root directory: `/`

Then add the D1 binding and the variables/secrets listed above.

## Cleanup Worker deployment

```bash
npx wrangler deploy --config wrangler.cleanup.toml
```

The Worker runs hourly. For each expired Drop it deletes every recorded Cloudinary asset and removes the D1 Drop only after all asset deletions succeed. Cloudinary supports destroying individual assets by public ID and resource type. urlhttps://cloudinary.com/documentation/delete_assets

## GitHub Pages preview

GitHub Pages is configured as a static preview. Its Actions workflow builds the same frontend but points API calls at:

```text
https://pratilipi.pages.dev
```

GitHub Pages itself does not execute the `functions/` backend; Cloudflare Pages is the full application deployment.

## Core routes

```text
/                         Home / new upload
/u/<drop-token>            Upload session for QR/mobile handoff
/d/<file-token>            Direct file download redirect
/d/text/<text-token>       Direct text download
/api/drop                  Create Drop
/api/drop/<id>             Read Drop contents
/api/drop/<id>/complete    Record Cloudinary upload metadata
/api/drop/<id>/text        Save text
/api/drop/<id>/file/<id>   Delete a file
```

## Upload flow

1. Create a Drop and choose its retention.
2. Pratilipi stores the Drop and expiry in D1.
3. Browser uploads each file directly to Cloudinary using the unsigned `pratilipi` preset.
4. The Cloudinary response is sent to the Pages Function.
5. D1 stores the file metadata and Cloudinary URL/public ID.
6. Pratilipi generates a stable `/d/<token>` link and QR code.

Cloudinary's upload response includes a URL and public ID for the uploaded asset. urlhttps://cloudinary.com/documentation/upload_images

## Retention

```text
1h  = 1 Hour
12h = 12 Hours
1d  = 1 Day (default)
1w  = 1 Week
1m  = 1 Month (30 days)
```

Expiry is fixed when a Drop is created. Existing Drops are not silently changed by the selector.

The backend rejects access after expiry even if the scheduled cleanup has not run yet. The hourly cleanup Worker then permanently removes the Cloudinary assets and D1 metadata.

## Active Uploads

There is no account/login system in the MVP. Active Uploads is therefore a same-browser/device local history backed by server validation. Expired or unavailable Drops disappear from that list.

## Security notes

- The Cloudinary upload preset is intentionally unsigned because direct browser uploads need no API secret. Cloudinary notes that unsigned preset names are public, so the preset should be limited to the options required for this app and can be rotated/disabled if abused. urlhttps://cloudinary.com/documentation/client_side_uploading
- Cloudinary API credentials are backend-only secrets.
- Drop tokens are long random values.
- Download routes verify Drop expiry before redirecting.
- Download responses use `no-store` and `no-referrer` headers.

## Local development

```bash
npm install
npm run dev
```

For Pages-style local development with bindings:

```bash
npm run build
npx wrangler pages dev dist
```

## Explicit non-goals for this MVP

- User accounts / permanent libraries
- Server-side ZIP packaging
- Client-side end-to-end encryption
- Virus scanning/content moderation

