// API de Gmail (solo servidor) con el refresh token de joel@joelschneider.io (gmail.send + gmail.readonly).
// Las respuestas a leads salen de aquí con el alias de la marca («Enviar como») y quedan en sus hilos.
const API = 'https://gmail.googleapis.com/gmail/v1/users/me'

let token: { valor: string; caduca: number } | null = null

async function accessToken() {
  if (token && token.caduca > Date.now() + 60_000) return token.valor
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) throw new Error('Faltan las credenciales de Gmail')
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GMAIL_CLIENT_ID, client_secret: GMAIL_CLIENT_SECRET, refresh_token: GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }),
    cache: 'no-store',
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.access_token) throw new Error(`Gmail no dio acceso (${j.error || r.status})`)
  token = { valor: j.access_token, caduca: Date.now() + (j.expires_in || 3600) * 1000 }
  return token.valor
}

export class ErrorGmail extends Error { constructor(public status: number, msg: string) { super(msg) } }

async function gmail<T = any>(ruta: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${ruta}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store',
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new ErrorGmail(r.status, j?.error?.message || `Gmail respondió ${r.status}`)
  return j
}

// ── Envío ────────────────────────────────────────────────────────────────────

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
// Cabeceras con tildes en UTF-8 (RFC 2047).
const cabecera = (s: string) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`
// «Arkevo <hola@…>»: solo se codifica el nombre, nunca la dirección.
const conNombre = (s: string) => {
  const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  return m ? `${m[1] ? `${cabecera(m[1].replace(/"/g, ''))} ` : ''}<${m[2]}>` : s
}

export type Envio = { de: string; para: string; asunto: string; texto: string; html: string; hilo?: string | null }

// Alias de «Enviar como» verificados. Si el From no es uno de ellos, Gmail lo cambia por joel@ sin
// avisar (y en The Pitch Lab eso destaparía el nombre), así que se corta antes de enviar.
let alias: { lista: Set<string>; caduca: number } | null = null
async function aliasVerificados() {
  if (alias && alias.caduca > Date.now()) return alias.lista
  const j = await gmail('/settings/sendAs')
  const lista = new Set<string>((j.sendAs || []).filter((s: any) => s.isPrimary || s.verificationStatus === 'accepted').map((s: any) => String(s.sendAsEmail).toLowerCase()))
  alias = { lista, caduca: Date.now() + 10 * 60_000 }
  return lista
}

export async function enviarGmail(m: Envio): Promise<{ id: string; hilo: string }> {
  const desde = (m.de.match(/<([^>]+)>/)?.[1] || m.de).trim().toLowerCase()
  if (!(await aliasVerificados()).has(desde)) throw new Error(`${desde} no está en «Enviar como» de Gmail`)
  // En un hilo que ya existe, se responde al último mensaje para que el cliente lo vea en la misma conversación.
  let enRespuestaA: string | null = null, referencias: string | null = null
  if (m.hilo) {
    const h = await gmail(`/threads/${m.hilo}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`).catch(() => null)
    const ultimo = h?.messages?.[h.messages.length - 1]
    const cab = (n: string) => ultimo?.payload?.headers?.find((x: any) => x.name.toLowerCase() === n.toLowerCase())?.value as string | undefined
    enRespuestaA = cab('Message-ID') || null
    referencias = [cab('References'), enRespuestaA].filter(Boolean).join(' ') || null
  }
  const frontera = `joux-${Date.now().toString(36)}`
  const mime = [
    `From: ${conNombre(m.de)}`,
    `To: ${m.para}`,
    `Subject: ${cabecera(m.asunto)}`,
    ...(enRespuestaA ? [`In-Reply-To: ${enRespuestaA}`, `References: ${referencias}`] : []),
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${frontera}"`,
    '',
    `--${frontera}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(m.texto).toString('base64'),
    `--${frontera}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(m.html).toString('base64'),
    `--${frontera}--`,
  ].join('\r\n')
  const j = await gmail('/messages/send', { method: 'POST', body: JSON.stringify({ raw: b64url(mime), ...(m.hilo ? { threadId: m.hilo } : {}) }) })
  return { id: j.id, hilo: j.threadId }
}

// ── Lectura ──────────────────────────────────────────────────────────────────

export const historyIdActual = async () => String((await gmail('/profile')).historyId)

// Mensajes añadidos desde `desde` (history.list). 404 = el historyId es demasiado viejo.
export async function historial(desde: string) {
  const mensajes = new Map<string, { id: string; hilo: string }>()
  let pagina: string | undefined, ultimo = desde
  do {
    const q = new URLSearchParams({ startHistoryId: desde, historyTypes: 'messageAdded', maxResults: '500' })
    if (pagina) q.set('pageToken', pagina)
    const j = await gmail(`/history?${q}`)
    for (const h of j.history || []) for (const a of h.messagesAdded || []) mensajes.set(a.message.id, { id: a.message.id, hilo: a.message.threadId })
    if (j.historyId) ultimo = String(j.historyId)
    pagina = j.nextPageToken
  } while (pagina)
  return { mensajes: Array.from(mensajes.values()), historyId: ultimo }
}

export async function hiloIds(hilo: string): Promise<{ id: string; hilo: string }[]> {
  const j = await gmail(`/threads/${hilo}?format=minimal`)
  return (j.messages || []).map((x: any) => ({ id: x.id, hilo: x.threadId }))
}

export type Leido = { id: string; hilo: string; etiquetas: string[]; de: string; para: string; asunto: string; texto: string; fecha: string }

const decodificar = (d?: string) => d ? Buffer.from(d.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8') : ''
const sinHtml = (h: string) => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n')
  .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")

function partes(p: any, tipo: string): string[] {
  if (!p) return []
  if (p.mimeType === tipo && p.body?.data && !p.filename) return [decodificar(p.body.data)]
  return (p.parts || []).flatMap((x: any) => partes(x, tipo))
}

// Quita la cita del mensaje anterior («El … escribió:», «On … wrote:», líneas con «>»).
export function sinCita(texto: string) {
  const lineas = texto.replace(/\r\n/g, '\n').split('\n')
  const corte = lineas.findIndex(l => /^(El .+ escribi[oó]:|On .+ wrote:|-{2,}\s*(Original Message|Mensaje original)|De: .+|From: .+)\s*$/i.test(l.trim()))
  const util = (corte >= 0 ? lineas.slice(0, corte) : lineas).filter(l => !l.startsWith('>'))
  return util.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export async function leerMensaje(id: string): Promise<Leido> {
  const j = await gmail(`/messages/${id}?format=full`)
  const cab = (n: string) => (j.payload?.headers || []).find((x: any) => x.name.toLowerCase() === n)?.value || ''
  const plano = partes(j.payload, 'text/plain').join('\n')
  const texto = plano || sinHtml(partes(j.payload, 'text/html').join('\n'))
  return {
    id: j.id, hilo: j.threadId, etiquetas: j.labelIds || [],
    de: cab('from'), para: cab('to'), asunto: cab('subject'),
    texto: sinCita(texto).slice(0, 20000) || '(sin texto)',
    fecha: new Date(Number(j.internalDate) || Date.now()).toISOString(),
  }
}
