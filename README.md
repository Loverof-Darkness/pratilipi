# प्रतिलिपि · Pratilipi

**Copy · Store · Share**

Pratilipi is a lightweight temporary sharing service for text, images, audio, video, documents and other files. Create a Drop, choose its lifetime, upload from desktop/mobile, share one clean URL or QR code, and download the original file directly.

## Production architecture

```text
Browser
  │
  ├── upload files ───────────────→ Cloudinary
  │
  ├── /api/* ─────────────────────→ Cloudflare Pages Functions
  │                                  │
  │                                  └── D1 metadata
  │
  └── /d/<file-token> ────────────→ Pages Function → Cloudinary

Expiry cleanup
  Cloudflare Cron Worker → expired D1 Drops → Cloudinary destroy API
```

The production application is **Cloudflare Pages only**. GitHub Pages is not used because it cannot execute the `functions/` backend. Cloudflare Pages supports a root `functions/` directory for Pages Functions. urlhttps://developers.cloudflare.com/pages/functions/get-started/

## Cloudflare Pages setup

Project:

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

Build output directory:

```text
dist
```

The intended deployment method is **Cloudflare Pages Git integration** connected to `Loverof-Darkness/pratilipi`, with `main` as the production branch. Cloudflare automatically builds and deploys connected repositories when changes are pushed. urlhttps://developers.cloudflare.com/pages/configuration/git-integration/

The repository also contains `wrangler.toml` with `pages_build_output_dir = "dist"` and the D1 binding so the Pages Functions configuration is explicit and reproducible. urlhttps://developers.cloudflare.com/pages/functions/wrangler-configuration/

## Pages runtime bindings

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

The Cloudinary API credentials are server-side only and are not embedded in the frontend.

## Cloudinary configuration

```text
Cloud name: s7aopw6x
Upload preset: pratilipi
Signing mode: Unsigned
Delivery type: Upload
Access: Public
```

Browser uploads use the unsigned `pratilipi` preset. Cloudinary documents unsigned client-side uploads separately from authenticated server-side asset deletion. urlhttps://cloudinary.com/documentation/client_side_uploading urlhttps://cloudinary.com/documentation/delete_assets

## D1

The schema is stored in `schema.sql`.

```bash
npx wrangler d1 execute pratilipi --remote --file=./schema.sql
```

The configured database ID is stored in `wrangler.toml` and `wrangler.cleanup.toml`.

## Cleanup Worker

The expiry cleanup Worker uses `wrangler.cleanup.toml` and an hourly cron.

```bash
npx wrangler deploy --config wrangler.cleanup.toml
```

Configure these Worker secrets too:

```text
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

The Worker deletes recorded Cloudinary assets first and removes the corresponding D1 Drop afterward.

## Direct download behavior

```text
/d/<file-token>
```

The download Function:

1. Looks up the file in D1.
2. Verifies the Drop still exists and has not expired.
3. Redirects to the matching Cloudinary delivery URL.
4. Adds Cloudinary's `fl_attachment` delivery flag so images and videos download instead of being embedded inline.

Cloudinary documents `fl_attachment` as the delivery flag for attachment downloads. urlhttps://cloudinary.com/documentation/transformation_reference

Text downloads use a normal `Content-Disposition: attachment` response.

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
/api/drop/<id>             Delete the entire Drop
```

## Retention

```text
1h  = 1 Hour
12h = 12 Hours
1d  = 1 Day (default)
1w  = 1 Week
1m  = 1 Month (30 days)
```

Expiry is fixed when the Drop is created. The backend rejects expired Drops immediately, even before the scheduled cleanup runs.

## Active Uploads

There are no accounts in the MVP. Active Uploads is stored in the current browser and revalidated against the server when the list is opened. Expired or deleted Drops disappear from the local history.

## UI / interaction flow

The current UI is a Wormhole-inspired Pratilipi experience with:

- animated cosmic/warp background
- drag/drop and clipboard input
- animated upload orbit
- per-file upload progress
- upload completion transition into a dedicated ready/share state
- copy/share/QR actions
- file preview cards
- direct download links
- expiry status and countdown
- active upload history
- individual file/text deletion
- whole Drop deletion

## Same-origin design

Production frontend and backend are intentionally same-origin on `pratilipi.pages.dev`.

The frontend calls `/api/*` and `/d/*` using `location.origin`, and server-generated upload/download URLs use the request origin. This prevents a GitHub Pages hostname or another environment from being accidentally embedded in production links.

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

Cloudinary plan limits still apply to asset types, maximum file sizes and delivery behavior. The UI accepts arbitrary browser files, but the actual storage/delivery limits are determined by the Cloudinary account and its current configuration.
