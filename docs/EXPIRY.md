# Pratilipi expiry policy

Pratilipi supports per-drop retention. The selected retention is fixed when a new Drop is created.

| Option | Retention |
|---|---:|
| 1 Hour | 1 hour |
| 12 Hours | 12 hours |
| 1 Day | 24 hours |
| 1 Week | 7 days |
| 1 Month | 30 days |

**Default: 1 Day.**

## What expires

The expiry belongs to the whole Drop, so all Cloudinary-backed files and text snippets in that Drop become unavailable together. Download endpoints check the Drop expiry before redirecting to Cloudinary, so an expired direct link returns `410` even when the old URL is still known.

## Physical deletion

An hourly Cloudflare Worker (`pratilipi-cleanup`) finds expired Drops, deletes their Cloudinary assets using the authenticated Destroy API, and only then deletes the D1 Drop record. The cleanup job runs at the top of every UTC hour, so physical deletion can occur shortly after the configured expiry rather than at the exact millisecond of expiry. Application access is blocked immediately when the expiry timestamp is reached.

## Deployment

Deploy the cleanup Worker separately from the Pages site:

```bash
npx wrangler d1 create pratilipi
# Put the returned database_id into wrangler.toml and wrangler.cleanup.toml
npx wrangler deploy --config wrangler.cleanup.toml
```

Set these Worker secrets:

```text
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

The cleanup Worker uses the same D1 database and Cloudinary product environment as the Pages Functions. Cloudinary documents the Destroy API as a server-side authenticated operation. urlhttps://cloudinary.com/documentation/delete_assets

## Security behavior

- Expiry values are server-validated; unknown values fall back to the 1-day default.
- The client selector is only a convenience. The server is authoritative.
- Expired Drops cannot be read, uploaded to, or downloaded from.
- Cloudinary assets are deleted before the corresponding D1 Drop record is removed.
