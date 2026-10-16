// Envío con Resend (solo servidor). Los dominios de las marcas están verificados en Resend (eu-west-1).
import { createHmac, timingSafeEqual } from 'crypto'
const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Texto plano → HTML sencillo: párrafos, saltos de línea y enlaces clicables.
export function aHtml(texto: string) {
  const enlaces = (s: string) => s.replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}">${u}</a>`)
  const parrafos = texto.trim().split(/\n{2,}/).map(p => `<p style="margin:0 0 16px">${enlaces(escapar(p)).replace(/\n/g, '<br>')}</p>`)
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.55;color:#1b1b19;max-width:560px">${parrafos.join('')}</div>`
}

export async function enviarEmail(m: { de: string; para: string; asunto: string; texto: string }): Promise<{ id?: string; error?: string }> {
  const clave = process.env.RESEND_API_KEY
  if (!clave) return { error: 'Falta RESEND_API_KEY' }
  // Las respuestas van al mismo remitente de la marca (que reenvía a joel@joelschneider.io).
  const responder = m.de.match(/<([^>]+)>/)?.[1] || m.de
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: m.de, to: [m.para], reply_to: responder, subject: m.asunto, text: m.texto, html: aHtml(m.texto) }),
  }).catch(() => null)
  const j = await r?.json().catch(() => ({}))
  if (!r?.ok) return { error: j?.message || 'Resend no respondió' }
  return { id: j.id }
}

// Firma de los webhooks de Resend (formato svix): HMAC-SHA256 de «id.timestamp.cuerpo» con el secreto
// `whsec_…` en base64. Se hace a mano con crypto para no añadir la dependencia de svix.
export function firmaValida(cuerpo: string, h: { id: string | null; ts: string | null; firma: string | null }, secreto: string) {
  if (!h.id || !h.ts || !h.firma) return false
  // Más de 5 minutos de diferencia: o es un reenvío viejo o alguien repite una petición capturada.
  if (Math.abs(Date.now() / 1000 - Number(h.ts)) > 300) return false
  const clave = Buffer.from(secreto.replace(/^whsec_/, ''), 'base64')
  const esperada = Buffer.from(createHmac('sha256', clave).update(`${h.id}.${h.ts}.${cuerpo}`).digest('base64'))
  // La cabecera puede traer varias firmas («v1,xxx v1,yyy») mientras se rota el secreto.
  return h.firma.split(' ').some(f => {
    const [v, b64] = f.split(',')
    const dada = Buffer.from(b64 || '')
    return v === 'v1' && dada.length === esperada.length && timingSafeEqual(dada, esperada)
  })
}
