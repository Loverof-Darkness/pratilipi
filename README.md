# प्रतिलिपि · Pratilipi

**Copy · Store · Share**

Pratilipi is a lightweight temporary sharing service for text, images, audio, video, documents and other files. Create a Drop, choose its lifetime, upload from desktop/mobile, share one clean URL or QR code, and download the original file directly.

## Production architecture

```text
Browser
  │
  ├── startup login ─────────────→ /api/auth/*
  │
  ├── upload files ──────────────→ Cloudinary
  │
  ├── /api/* ───────────────────→ Cloudflare Pages Functions
  │                                  │
  │                                  └── D1 metadata
  │
  └── /d/<file-token> ───────────→ Pages Function → Cloudinary

Expiry cleanup
  Cloudflare Cron Worker → expired D1 Drops → Cloudinary destroy API
```

The production application is **Cloudflare Pages only**. GitHub Pages is not used because it cannot execute the `functions/` backend. Cloudflare Pages supports a root `functions/` directory for Pages Functions. urlhttps://developers.cloudflare.com/pages/functions/get-started/

## Private dashboard authentication

Pratilipi keeps the public landing experience visible, but creation and management actions are protected. The **Access Dashboard** control opens the private login dialog. Shared `/u/<drop-token>` links remain public.

Set these **Cloudflare Pages environment secrets**:

```text
PRATILIPI_LOGIN_ID
PRATILIPI_PASSKEY
```

Use **Production** scope for the deployed site. Keep both values server-side; they are never embedded into the frontend build.

Authentication uses a signed, HTTP-only, `Secure`, `SameSite=Strict` session cookie with a 7-day lifetime. The session protects the dashboard's upload and mutation APIs. Public Drop links and direct file/text downloads do not require the dashboard session, so anyone who has a shared link can view and download that Drop while expiry rules are still enforced. Logging out clears the session cookie. Changing the passkey invalidates previously issued sessions because the session signature key is derived from the configured credentials.

Auth routes:

```text
/api/auth/login
/api/auth/me
/api/auth/logout
```

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
PRATILIPI_LOGIN_ID
PRATILIPI_PASSKEY
```

The Cloudinary API credentials and Pratilipi access credentials are server-side only and are not embedded in the frontend.

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
3. Fetches the stored Cloudinary asset through Pratilipi.
4. Returns it with `Content-Disposition: attachment` so direct links download the original file instead of becoming a dashboard redirect.

Cloudinary documents `fl_attachment` as the delivery flag for attachment downloads. urlhttps://cloudinary.com/documentation/transformation_reference

Text downloads use a normal `Content-Disposition: attachment` response and also require authentication.

## Core routes

```text
/                         Home / new Drop
/u/<drop-token>            Public shared Drop page
/d/<file-token>            Public direct file download
/d/text/<text-token>       Public direct text download
/api/auth/login            Startup login
/api/auth/me               Session status
/api/auth/logout           Logout
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

There is one private Pratilipi access account configured through Cloudflare secrets. Active Uploads is still stored in the current browser and revalidated against the server when the list is opened. Expired or deleted Drops disappear from the local history.

## UI / interaction flow

The current UI follows the supplied Pratilipi reference dashboard: a dark cosmic canvas, purple/blue file sharing card, orange/red text card, centered OR separator, animated transfer panel, success/share action bar, and compact navigation. The implementation is real HTML/CSS/SVG rather than a screenshot image.

The UI includes:

- private startup login screen
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

Set `PRATILIPI_LOGIN_ID` and `PRATILIPI_PASSKEY` in your local Wrangler environment before using the app locally.

## Important limitation

Cloudinary plan limits still apply to asset types, maximum file sizes and delivery behavior. The UI accepts arbitrary browser files, but the actual storage/delivery limits are determined by the Cloudinary account and its current configuration.

<!-- cloudflare-auto-deploy-smoke-test -->
