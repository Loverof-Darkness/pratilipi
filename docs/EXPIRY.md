# Pratilipi expiry policy

Pratilipi now supports per-drop retention. The selection applies when a new upload drop is created.

| Option | Retention |
|---|---:|
| 1 Hour | 1 hour |
| 12 Hours | 12 hours |
| 1 Day | 24 hours |
| 1 Week | 7 days |
| 1 Month | 30 days |

**Default: 1 Day.**

## What expires

The expiry belongs to the whole drop, so all files and text snippets in that drop become unavailable together. Download endpoints check the drop expiry before issuing a download URL, so an expired direct link returns `410` even if its old URL is still known.

## Physical deletion

An hourly Cloudflare Worker (`pratilipi-cleanup`) finds expired drops, deletes their R2 objects, and then deletes the D1 drop record. The cleanup job runs at the top of every UTC hour, so physical deletion can occur shortly after the configured expiry rather than at the exact millisecond of expiry. The application itself blocks access immediately when the expiry timestamp is reached.

## Deployment

Deploy the cleanup Worker separately from the Pages site:

```bash
npx wrangler d1 create pratilipi
# Put the returned database_id into wrangler.toml and wrangler.cleanup.toml
npx wrangler deploy --config wrangler.cleanup.toml
```

The cleanup Worker uses the same D1 database and R2 bucket as the Pages Functions. Cron Triggers are a standard Cloudflare Workers feature and can run scheduled maintenance jobs. Cloudflare documents `0 * * * *` as an every-hour trigger example.

## Security behavior

- Expiry values are server-validated; unknown values fall back to the 1-day default.
- The client selector is only a convenience. The server is authoritative.
- Expired drops cannot be read, uploaded to, or downloaded from.
- Cleanup deletes R2 objects before deleting the corresponding D1 drop record.
