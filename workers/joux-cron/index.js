// joux-cron: dispara el tick de Joux Hub. Toda la lógica está en /api/cron/tick; aquí solo se llama
// con CRON_TICK_SECRET (wrangler secret) y se deja el resultado en el log del Worker.
export default {
  async scheduled(_evento, env, ctx) {
    ctx.waitUntil(tick(env))
  },
}

async function tick(env) {
  const r = await fetch(env.JOUX_TICK_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CRON_TICK_SECRET}` },
    signal: AbortSignal.timeout(70_000),
  }).catch(e => ({ ok: false, status: 0, text: async () => String(e) }))
  const cuerpo = await r.text().catch(() => '')
  if (!r.ok) throw new Error(`tick ${r.status}: ${cuerpo.slice(0, 300)}`)
  console.log('tick', cuerpo.slice(0, 500))
}
