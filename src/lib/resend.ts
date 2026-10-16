// Envío con Resend (solo servidor). Los dominios de las marcas están verificados en Resend (eu-west-1).
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
