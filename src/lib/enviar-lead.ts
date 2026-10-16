import { supabaseServer as sb } from '@/lib/supabase-server'
import { enviarGmail } from '@/lib/gmail'
import { aHtml } from '@/lib/resend'
import { marcasJoel, remitenteLead } from '@/lib/remitentes'

// Envía un mensaje saliente de un lead por Gmail con el alias de su marca. Lo usan «Enviar» en la
// ficha y el tick (mensajes «aprobado»). El mensaje se reserva con un cambio de estado condicional,
// así dos llamadas a la vez no lo mandan dos veces.
export async function enviarMensajeLead(id: number, desde: ('borrador' | 'aprobado' | 'error')[]): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { data: m } = await sb.from('mensajes').select('*').eq('id', id).maybeSingle()
  if (!m || !m.lead_id) return { ok: false, error: 'No existe el mensaje', status: 404 }
  if (!desde.includes(m.estado)) return { ok: false, error: 'Este mensaje ya no está pendiente', status: 409 }
  if (m.direccion !== 'saliente') return { ok: false, error: 'Solo se envían mensajes salientes', status: 400 }
  const pendientes = marcasJoel(`${m.asunto || ''}\n${m.cuerpo}`)
  if (pendientes.length || /\[\[Joel:/.test(`${m.asunto}${m.cuerpo}`)) return { ok: false, error: `Quedan ${pendientes.length || 1} marcas [[Joel: …]] por rellenar`, status: 400 }

  const { data: lead } = await sb.from('leads').select('id, marca, idioma, email, estado, gmail_hilo').eq('id', m.lead_id).maybeSingle()
  if (!lead) return { ok: false, error: 'No existe el lead', status: 404 }
  // El remitente siempre es el de la marca, aunque el mensaje guarde otro.
  const remitente = remitenteLead(lead.marca, lead.idioma)
  if (!remitente) return { ok: false, error: 'Esta marca no tiene remitente de Gmail', status: 400 }

  const { data: reservado } = await sb.from('mensajes').update({ estado: 'enviado', remitente, canal: 'gmail' }).eq('id', id).eq('estado', m.estado).select('id')
  if (!reservado?.length) return { ok: false, error: 'Este mensaje ya no está pendiente', status: 409 }

  const asunto = (lead.gmail_hilo && !/^re:/i.test(m.asunto || '') ? `Re: ${m.asunto}` : m.asunto) || '(sin asunto)'
  try {
    const r = await enviarGmail({ de: remitente, para: m.para, asunto, texto: m.cuerpo, html: aHtml(m.cuerpo), hilo: lead.gmail_hilo })
    const ahora = new Date().toISOString()
    await sb.from('mensajes').update({ id_proveedor: r.id, enviado_en: ahora, asunto, error: null }).eq('id', id)
    const estado = ['nuevo', 'borrador', 'conversacion'].includes(lead.estado) ? 'respondido' : lead.estado
    await sb.from('leads').update({ gmail_hilo: lead.gmail_hilo || r.hilo, estado, ultimo_contacto: ahora, updated_at: ahora }).eq('id', lead.id)
    await sb.from('eventos').insert([
      { lead_id: lead.id, tipo: 'mensaje.enviado', fuente: 'joux-hub', datos: { mensaje_id: id, de: remitente, para: m.para, asunto, ...(m.auto ? { auto: true } : {}) } },
      ...(estado !== lead.estado ? [{ lead_id: lead.id, tipo: 'lead.estado', fuente: 'joux-hub', datos: { de: lead.estado, a: estado } }] : []),
    ])
    return { ok: true }
  } catch (e) {
    const error = (e as Error)?.message || 'Gmail no respondió'
    await sb.from('mensajes').update({ estado: 'error', error }).eq('id', id)
    return { ok: false, error: `No se envió: ${error}`, status: 502 }
  }
}
