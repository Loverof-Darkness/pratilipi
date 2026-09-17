# प्रतिलिपि · Pratilipi

**Copy · Store · Share**

Pratilipi is a lightweight temporary sharing service for text, images, audio, video, documents and other files. Create a Drop, choose its lifetime, upload from desktop/mobile, share one clean URL or QR code, and download the original file directly.

## Production architecture

```text
Browser
  │
  ├── upload files ───────────────→ Cloudinary
  │                                 │
  ├── /api/* ─────────────────────→ Cloudflare Pages Functions
  │                                 │
  └── /d/<file-token> ────────────→ Pages Function → Cloudinary
                                    │
                                    └── D1 metadata

Expiry cleanup
  Cloudflare Cron Worker → expired D1 Drops → Cloudinary destroy API
```

The production application is **Cloudflare Pages only**. The repository no longer deploys the application to GitHub Pages, because GitHub Pages cannot execute the `functions/` backend. Cloudflare Pages supports a root `functions/` directory and deploys those Functions with the Pages application. urlhttps://developers.cloudflare.com/pages/functions/get-started/

## Cloudflare Pages

Project name:

```text
pratilipi
```

Production branch:

```text
main
```

Build command:

```text
npm install && npm run build
```

Build output:

```text
dist
```

The repository includes `wrangler.toml` with the Pages build output directory and D1 binding. Cloudflare documents that Pages projects can be deployed through Git integration or Wrangler, and that a root `functions/` directory is used for Pages Functions. urlhttps://developers.cloudflare.com/pages/configuration/git-integration/ urlhttps://developers.cloudflare.com/pages/functions/wrangler-configuration/

## GitHub Actions deployment

`.github/workflows/cloudflare-pages.yml` now builds and deploys the **Pages project and its Functions** with Wrangler on every push to `main`.

Add these repository Actions secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

The Cloudflare API token needs permission to deploy the Pages project. If the Pages project is already connected through Cloudflare Git integration, do not run two independent production deployment systems at the same time; use either the Cloudflare Git integration or this Wrangler workflow. Cloudflare documents the Git integration and its automatic deployment behavior. urlhttps://developers.cloudflare.com/pages/configuration/git-integration/

## Pages runtime bindings and secrets

D1 binding:

```text
DB → pratilipi
```

Variables:

```text
CLOUDINARY_CLOUD_NAME = s7aopw6x
CLOUDINARY_UPLOAD_PRESET = pratilipi
```

Runtime secrets:

```text
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

The Cloudinary API secret is never included in browser code. It is used only by server-side deletion/cleanup operations.

## Cloudinary configuration

```text
Cloud name: s7aopw6x
Upload preset: pratilipi
Signing mode: Unsigned
Delivery type: Upload
Access: Public
```

Browser uploads use the unsigned preset. Cloudinary documents direct client-side uploads with unsigned presets and the separate server-side asset deletion API. urlhttps://cloudinary.com/documentation/client_side_uploading urlhttps://cloudinary.com/documentation/delete_assets

## D1

Apply `schema.sql` to the existing `pratilipi` D1 database:

```bash
npx wrangler d1 execute pratilipi --remote --file=./schema.sql
```

The current database ID is recorded in `wrangler.toml` and `wrangler.cleanup.toml`.

## Cleanup Worker

Deploy the expiry cleanup Worker with:

```bash
npx wrangler deploy --config wrangler.cleanup.toml
```

Configure these Worker secrets:

```text
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

The Worker runs hourly and removes expired Cloudinary assets before deleting the associated D1 Drop metadata.

## Direct downloads

```text
/d/<file-token>
```

The download Function first verifies that the Drop exists and has not expired. It then redirects to a Cloudinary delivery URL using Cloudinary's `fl_attachment` flag so images/videos are downloaded instead of displayed inline. Cloudinary documents `fl_attachment` as the delivery flag for attachment downloads. urlhttps://cloudinary.com/documentation/transformation_reference

## Core routes

```text
/                         Home / new Drop
/u/<drop-token>            Upload/share session
/d/<file-token>            Direct file download
/d/text/<text-token>       Direct text download
/api/drop                  Create Drop
/api/drop/<id>             Read Drop
/api/drop/<id>/complete    Register Cloudinary upload
/api/drop/<id>/text        Save text
/api/drop/<id>/file/<id>   Delete a file
/api/drop/<id>/text/<id>   Delete saved text
```

## Retention

```text
1h  = 1 Hour
12h = 12 Hours
1d  = 1 Day (default)
1w  = 1 Week
1m  = 1 Month (30 days)
```

The expiry is fixed when a Drop is created. Backend access checks enforce expiry immediately; the hourly cleanup Worker performs physical Cloudinary deletion afterward.

## Active Uploads

There are no user accounts in the MVP. Active Uploads is stored in the current browser and revalidated against the server when opened. Expired or deleted Drops are removed from the local list.

## UI / interaction flow

The current UI is a Wormhole-inspired Pratilipi experience with animated warp/nebula background, drag/drop states, per-file upload progress, post-upload ready animation, QR sharing, previewable uploaded items, direct links, and delete controls.

## Local development

```bash
npm install
npm run dev
```

For Pages Functions locally with bindings:

```bash
npm run build
npx wrangler pages dev dist
```

## Important limitation

Cloudinary plan limits still apply to the file types, sizes, and delivery behavior allowed by the account. The application accepts arbitrary browser files at the UI layer, but storage/delivery ultimately depends on Cloudinary's current account limits and configuration.
