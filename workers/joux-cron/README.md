# joux-cron

Worker de Cloudflare con cron cada 15 min que llama a `POST https://joux-web.vercel.app/api/cron/tick` (automatización, fase 2). El tick lee las respuestas de los leads en Gmail y envía los mensajes `aprobado` que ya tocan. Es idempotente: se puede disparar a mano sin miedo.

- Secreto `CRON_TICK_SECRET`: el mismo valor que en `.env.local` y en Vercel. Se pone sin imprimirlo, desde la raíz de joux-hub:

  ```bash
  grep '^CRON_TICK_SECRET=' .env.local | cut -d= -f2- | tr -d '\r\n' | npx wrangler secret put CRON_TICK_SECRET --config workers/joux-cron/wrangler.toml
  ```

- Publicar (solo con el OK de Joel): `npx wrangler deploy --config workers/joux-cron/wrangler.toml`.
- Logs en vivo: `npx wrangler tail joux-cron`.
- Sin `workers.dev`: no tiene dirección pública, solo corre por el cron.
