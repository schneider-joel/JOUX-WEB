// Renueva GMAIL_REFRESH_TOKEN (joel@joelschneider.io) cuando Google lo da por caducado o revocado
// («invalid_grant»). Uso, desde la raíz de joux-hub: node scripts/gmail-token.mjs
// Abre el permiso de Google en el navegador, guarda el token nuevo en .env.local y lo deja en el
// portapapeles para pegarlo en Vercel. Nunca lo imprime.
import { createServer } from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const PUERTO = 53682
const REDIRECCION = `http://localhost:${PUERTO}/`
// Los 4 de siempre: Gmail (enviar y leer hilos de leads) y Drive (carpetas que crea la app y nombres de lo que sube el cliente).
const PERMISOS = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
]

const env = readFileSync('.env.local', 'utf8')
const leer = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '')
const id = leer('GMAIL_CLIENT_ID'), secreto = leer('GMAIL_CLIENT_SECRET')
if (!id || !secreto) { console.error('Faltan GMAIL_CLIENT_ID o GMAIL_CLIENT_SECRET en .env.local'); process.exit(1) }

const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: id, redirect_uri: REDIRECCION, response_type: 'code', scope: PERMISOS.join(' '),
  // offline + consent: sin esto Google no devuelve refresh token.
  access_type: 'offline', prompt: 'consent', login_hint: 'joel@joelschneider.io',
})

const servidor = createServer(async (req, res) => {
  const q = new URL(req.url, REDIRECCION).searchParams
  if (!q.get('code') && !q.get('error')) { res.end(); return }
  const fin = (texto, codigo = 0) => { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(texto); servidor.close(); process.exitCode = codigo }
  if (q.get('error')) { console.error(`Google respondió: ${q.get('error')}`); return fin('No se concedió el permiso. Vuelve a la terminal.', 1) }

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: q.get('code'), client_id: id, client_secret: secreto, redirect_uri: REDIRECCION, grant_type: 'authorization_code' }),
  })
  const j = await r.json().catch(() => ({}))
  if (!j.refresh_token) { console.error(`Sin refresh token (${j.error || r.status}${j.error_description ? `: ${j.error_description}` : ''})`); return fin('Algo falló. Vuelve a la terminal.', 1) }

  const concedidos = String(j.scope || '').split(' ')
  const faltan = PERMISOS.filter(p => !concedidos.includes(p))
  const linea = `GMAIL_REFRESH_TOKEN=${j.refresh_token}`
  writeFileSync('.env.local', /^GMAIL_REFRESH_TOKEN=.*$/m.test(env) ? env.replace(/^GMAIL_REFRESH_TOKEN=.*$/m, linea) : `${env.replace(/\n?$/, '\n')}${linea}\n`)
  execFileSync('pbcopy', { input: j.refresh_token })
  console.log('Listo: token nuevo guardado en .env.local y copiado al portapapeles (pégalo en Vercel como GMAIL_REFRESH_TOKEN).')
  if (faltan.length) console.log(`Ojo, faltan permisos: ${faltan.map(p => p.split('/').pop()).join(', ')}. Repite y marca todas las casillas.`)
  fin('Listo. Ya puedes cerrar esta pestaña y volver a la terminal.')
})

servidor.listen(PUERTO, () => {
  console.log('Abriendo el permiso de Google en el navegador (entra con joel@joelschneider.io y marca todas las casillas)…')
  execFileSync('open', [url])
})
