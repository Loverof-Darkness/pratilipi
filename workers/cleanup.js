export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(cleanupExpiredDrops(env));
  }
};

async function cleanupExpiredDrops(env) {
  const expired = await env.DB.prepare(
    'SELECT id FROM drops WHERE expires_at IS NOT NULL AND expires_at <= ?1 LIMIT 100'
  ).bind(Date.now()).all();

  for (const drop of expired.results || []) {
    const files = await env.DB.prepare(
      'SELECT object_key FROM files WHERE drop_id = ?1'
    ).bind(drop.id).all();

    for (const file of files.results || []) {
      try {
        await env.BUCKET.delete(file.object_key);
      } catch (error) {
        console.error('R2 delete failed', drop.id, file.object_key, error);
      }
    }

    await env.DB.prepare('DELETE FROM drops WHERE id = ?1').bind(drop.id).run();
  }
}
