import { destroyCloudinaryAsset } from '../functions/_lib.js';

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(cleanupExpiredDrops(env));
  }
};

async function cleanupExpiredDrops(env) {
  const expired = await env.DB.prepare(
    'SELECT id FROM drops WHERE expires_at <= ?1 LIMIT 50'
  ).bind(Date.now()).all();

  for (const drop of expired.results || []) {
    const files = await env.DB.prepare(
      'SELECT id, public_id, resource_type FROM files WHERE drop_id = ?1'
    ).bind(drop.id).all();

    let deleteFailed = false;
    for (const file of files.results || []) {
      try {
        await destroyCloudinaryAsset(env, {
          publicId: file.public_id,
          resourceType: file.resource_type || 'raw',
          invalidate: true
        });
      } catch (cause) {
        deleteFailed = true;
        console.error('Cloudinary delete failed', drop.id, file.public_id, cause);
      }
    }

    if (!deleteFailed) {
      await env.DB.prepare('DELETE FROM drops WHERE id = ?1').bind(drop.id).run();
    }
  }
}
