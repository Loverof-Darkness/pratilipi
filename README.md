# प्रतिलिपि · Pratilipi

**Copy · Store · Share**

Pratilipi is a web-based, cross-device sharing drop for files, media and text. Create one unlisted upload session, send its QR/link to another device, upload one or many files, paste text, and immediately get direct download URLs and QR codes for the resulting items.

## Product goals

1. **One place for anything** — images, songs, videos, documents, archives and other files.
2. **Fast input** — drag & drop, direct file picker and clipboard paste for files/images/text.
3. **Phone handoff** — scan one QR code to open the same upload session on a mobile device.
4. **Direct downloads** — generated `/d/...` links redirect straight to the object download; the recipient does not land on a Pratilipi dashboard.
5. **Simple text sharing** — paste text into the dedicated text section and create a direct `.txt` download link.
6. **Cross-device live view** — an upload session refreshes automatically so a desktop can see mobile uploads as they arrive.
7. **Cloudflare-first deployment** — static UI on Pages, metadata in D1, binary objects in a private R2 bucket, signed URLs for browser-to-R2 transfer.
8. **No build-time file storage** — user content never becomes a Pages static asset.

## Core flow

```text
Create Drop
   ↓
Desktop gets /u/<drop-token>
   ↓
Show QR / copy upload URL
   ↓
Phone scans QR → same /u/<drop-token>
   ↓
Choose / drag / paste files OR paste text
   ↓
Browser requests short-lived R2 presigned PUT URL
   ↓
Browser uploads directly to private R2
   ↓
Pratilipi records metadata in D1
   ↓
Pratilipi shows direct /d/<file-token> links + QR codes
   ↓
Recipient clicks link → Pages Function issues signed R2 GET redirect
```

## Architecture

- **Frontend:** Vite + vanilla JavaScript + CSS
- **Hosting:** Cloudflare Pages
- **Server-side API:** Cloudflare Pages Functions
- **Metadata:** Cloudflare D1
- **Binary storage:** private Cloudflare R2 bucket
- **Temporary transfer authorization:** R2 S3-compatible presigned URLs using `aws4fetch`
- **QR generation:** `qrcode` npm package in the browser

Cloudflare documents Pages Functions as the server-side runtime for Pages, file-based routing for `/functions`, D1/R2 bindings, and presigned R2 URLs for direct browser uploads/downloads. See the official docs linked below.

## Important deployment fact

Do **not** put uploaded files in `dist/` or rely on Pages static assets for user content. Cloudflare's current Pages Free limit is **25 MiB per static asset**. R2 supports much larger objects and its current free tier includes **10 GB-month of Standard storage**, **1 million Class A operations/month**, **10 million Class B operations/month**, and free egress. Pages Functions use the Workers Free quota, currently **100,000 requests/day**. These limits apply to the Cloudflare account/product plan and can change, so verify them before production rollout.

## Repository structure

```text
.
├── functions/
│   ├── _lib.js
│   ├── api/
│   │   └── [[path]].js
│   ├── d/
│   │   ├── [id].js
│   │   └── text/[id].js
│   └── u/[id].js
├── public/
│   ├── _headers
│   └── r2-cors.json
├── src/
│   ├── main.js
│   └── styles.css
├── index.html
├── package.json
├── schema.sql
├── vite.config.js
└── wrangler.toml
```

## Cloudflare resources required

Create these once in the same Cloudflare account:

1. **R2 bucket:** `pratilipi`
2. **D1 database:** `pratilipi`
3. **R2 S3 API token** with permission to read/write the `pratilipi` bucket. Use the generated access key ID and secret access key as Pages/Worker secrets.
4. **Pages project:** `pratilipi`

The application expects these bindings/variables:

| Name | Type | Purpose |
|---|---|---|
| `DB` | D1 binding | Drop/file/text metadata |
| `BUCKET` | R2 binding | Private uploaded objects |
| `R2_ACCOUNT_ID` | variable | R2 S3 endpoint construction |
| `R2_BUCKET_NAME` | variable | R2 bucket name |
| `APP_ORIGIN` | variable | Canonical application origin |
| `R2_ACCESS_KEY_ID` | secret | R2 presigning |
| `R2_SECRET_ACCESS_KEY` | secret | R2 presigning |

## First-time setup

Authenticate Wrangler:

```bash
npx wrangler login
```

Create the R2 bucket:

```bash
npx wrangler r2 bucket create pratilipi
```

Create the D1 database:

```bash
npx wrangler d1 create pratilipi
```

Copy the returned D1 `database_id` into `wrangler.toml` in place of `REPLACE_WITH_D1_DATABASE_ID`.

Set `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, and `APP_ORIGIN` in `wrangler.toml`.

Apply the schema to the remote D1 database:

```bash
npx wrangler d1 execute pratilipi --remote --file=./schema.sql
```

Install dependencies and create a production build:

```bash
npm install
npm run build
```

## R2 CORS

Because uploads use browser-side presigned `PUT` requests, configure the R2 bucket CORS policy. A ready-to-edit policy is included at `public/r2-cors.json`.

Use the real Pages/custom-domain origin in `AllowedOrigins` before deploying.

## R2 signing secrets

Generate an R2 S3 API token/key for the bucket, then configure these as **secrets**, not source-controlled variables:

```bash
npx wrangler pages secret put R2_ACCESS_KEY_ID --project-name pratilipi
npx wrangler pages secret put R2_SECRET_ACCESS_KEY --project-name pratilipi
```

When prompted, paste the corresponding R2 credentials.

## Pages deployment

### Git-connected deployment

Connect `Loverof-Darkness/pratilipi` to Cloudflare Pages and use:

- **Production branch:** `main`
- **Build command:** `npm install && npm run build`
- **Build output directory:** `dist`
- **Root directory:** `/`

Configure the D1 and R2 bindings plus the variables/secrets above in the Pages project.

### Wrangler deployment

From a local checkout:

```bash
npm install
npm run build
npx wrangler pages deploy dist --project-name pratilipi
```

Pages Functions are deployed through the Pages Functions/Wrangler flow; the Cloudflare dashboard's simple Direct Upload flow does not compile a `functions/` directory.

## Local development

Build first:

```bash
npm run build
```

For the browser-only UI without Cloudflare bindings:

```bash
npm run dev
```

For a Cloudflare Pages-style local run with bindings, use Wrangler after configuring a local/remote D1 and R2 environment:

```bash
npx wrangler pages dev dist
```

## URL model

- `/` — create/open a Pratilipi drop
- `/u/<drop-token>` — upload page for a particular drop, suitable for QR/mobile handoff
- `/d/<file-token>` — direct file download endpoint
- `/d/text/<text-token>` — direct text download endpoint
- `/api/drop...` — JSON API used by the frontend

The download endpoints do not render a Pratilipi page. They issue a short-lived signed R2 download redirect instead.

## Current MVP behavior

- Multi-file selection is supported.
- Drag & drop is supported.
- Clipboard file/image paste is supported where the browser exposes clipboard file items.
- Clipboard text is inserted into the text section when focus is outside the textarea.
- Mobile upload works through the same drop URL opened after QR scan.
- Direct download URLs and QR codes are generated after successful upload/save.
- Files can be deleted from the current drop.
- Drop records expire after 7 days at the metadata layer.

## Explicit non-goals for v0.1

- User accounts and permanent libraries
- Server-side ZIP creation for multiple files
- End-to-end encryption before R2 storage
- Automatic background deletion of expired R2 objects
- Virus scanning/content moderation

These can be added without changing the basic Pages + D1 + R2 architecture.

## Official references

- Cloudflare Pages limits: https://developers.cloudflare.com/pages/platform/limits/
- Pages Functions: https://developers.cloudflare.com/pages/functions/
- Pages Functions routing: https://developers.cloudflare.com/pages/functions/routing/
- Pages Functions pricing: https://developers.cloudflare.com/pages/functions/pricing/
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- R2 pricing: https://developers.cloudflare.com/r2/pricing/
- R2 limits: https://developers.cloudflare.com/r2/platform/limits/
- R2 presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- R2 `aws4fetch` example: https://developers.cloudflare.com/r2/examples/aws/aws4fetch/
