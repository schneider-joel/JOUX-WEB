// Emails de seguimiento de una web (solo servidor): plantilla rellenada, borrador en `mensajes` y envío.
import { supabaseServer as sb } from '@/lib/supabase-server'
import { pendientes, rellenar } from '@/lib/emails'
import { enviarEmail } from '@/lib/resend'
import { enviosPausados } from '@/lib/autonomia'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// 'R2' → 2: las plantillas dicen «ronda {{ronda}} de 2».
export const numeroRonda = (ronda: string) => Number(ronda.replace(/\D/g, '')) || ronda

// Plantilla de un proyecto ya rellenada. Sin `url` se deja {{url}} para que Joel lo pegue.
export async function plantillaProyecto(id: number | string, clave: string, extra: { ronda?: string; url?: string; vars?: Record<string, string | null> } = {}) {
  const { data: p } = await sb.from('proyectos').select('id, nombre, cliente, marca, web, idioma, contacto_email, contacto_nombre, lead_id, drive_url').eq('id', id).maybeSingle()
  if (!p) return { error: 'No existe', status: 404 } as const
  const { data: marca } = await sb.from('marcas').select('modo').eq('key', p.marca ?? '').maybeSingle()
  if (marca?.modo !== 'cerrado') return { error: 'Solo las webs tienen emails de seguimiento', status: 400 } as const
  const idioma = p.idioma === 'en' ? 'en' : 'es'
  const { data: t } = await sb.from('plantillas').select('remitente, asunto, cuerpo, auto').eq('clave', clave).eq('marca', p.marca).eq('idioma', idioma).maybeSingle()
  if (!t) return { error: 'No hay plantilla para esta marca e idioma', status: 404 } as const
  // Ronda: la que avisa el sistema de revisión; si no, la última registrada; si no, las «revisión lista» enviadas (+1 al abrir).
  let ronda: string | number | undefined = extra.ronda ? numeroRonda(extra.ronda) : undefined
  if (ronda == null) {
    const { data: ultima } = await sb.from('revisiones').select('ronda').eq('proyecto_id', p.id).order('abierta_en', { ascending: false }).limit(1).maybeSingle()
    if (ultima) ronda = numeroRonda(ultima.ronda)
  }
  if (ronda == null) {
    const { count } = await sb.from('mensajes').select('id', { count: 'exact', head: true }).eq('proyecto_id', p.id).eq('plantilla', 'revision.lista').eq('estado', 'enviado')
    ronda = clave === 'revision.lista' ? (count || 0) + 1 : Math.max(1, count || 0)
  }
  const vars = { nombre: (p.contacto_nombre || p.cliente).split(' ')[0], web: p.web || p.cliente, ronda, url: extra.url, drive_url: p.drive_url, ...extra.vars }
  return { p, t, asunto: rellenar(t.asunto, vars), cuerpo: rellenar(t.cuerpo, vars) }
}

// Envía por Resend y deja constancia en `mensajes` (fila nueva o el borrador `mensajeId`) y en eventos.
export async function enviarEmailProyecto(m: {
  proyectoId: number; leadId?: number | null; clave: string; remitente: string; para: string; asunto: string; cuerpo: string
  mensajeId?: number; fuente?: string
  // La plantilla rellenada antes de que Joel la toque (para la métrica de ajustes) y si salió sin aprobación.
  original?: { asunto: string; cuerpo: string }; auto?: boolean
}) {
  const envio = await enviarEmail({ de: m.remitente, para: m.para, asunto: m.asunto, texto: m.cuerpo })
  // Un borrador que no sale vuelve a borrador (con el motivo) para reintentarlo desde /proyectos.
  const fila = {
    estado: envio.error ? (m.mensajeId ? 'borrador' : 'error') : 'enviado', remitente: m.remitente, para: m.para, asunto: m.asunto, cuerpo: m.cuerpo,
    canal: 'resend', id_proveedor: envio.id || null, error: envio.error || null, enviado_en: envio.error ? null : new Date().toISOString(),
    ...(m.auto ? { auto: true } : {}),
  }
  if (m.mensajeId) await sb.from('mensajes').update(fila).eq('id', m.mensajeId)
  else await sb.from('mensajes').insert({
    ...fila, proyecto_id: m.proyectoId, direccion: 'saliente', plantilla: m.clave, generado_por: 'plantilla',
    asunto_original: m.original?.asunto ?? null, cuerpo_original: m.original?.cuerpo ?? null,
  })
  if (envio.error) return { error: envio.error }
  await sb.from('eventos').insert({ proyecto_id: m.proyectoId, lead_id: m.leadId ?? null, tipo: 'mensaje.enviado', fuente: m.fuente || 'joux-hub', datos: { plantilla: m.clave, para: m.para, asunto: m.asunto, ...(m.auto ? { auto: true } : {}) } })
  return { ok: true }
}

// Prepara el email de una plantilla como borrador para enviarlo desde /proyectos con un toque.
// Solo sale solo si la plantilla es `auto` y está completo (destinatario y sin {{…}} pendientes).
// Los borradores anteriores de la misma plantilla se descartan: siempre vale el último.
export async function prepararEmailProyecto(proyectoId: number, clave: string, extra: { ronda?: string; url?: string }, fuente: string) {
  const d = await plantillaProyecto(proyectoId, clave, extra)
  if ('error' in d) return { omitido: d.error }
  const para = d.p.contacto_email?.trim() || ''
  const completo = EMAIL.test(para) && pendientes(d.asunto + d.cuerpo).length === 0
  const original = { asunto: d.asunto, cuerpo: d.cuerpo }
  // La pausa de emergencia de /ajustes convierte cualquier envío automático en borrador.
  // El push lo da quien llama (intake/evento, tick) con su propio texto.
  if (d.t.auto && completo && !(await enviosPausados())) {
    const r = await enviarEmailProyecto({ proyectoId, leadId: d.p.lead_id, clave, remitente: d.t.remitente, para, asunto: d.asunto, cuerpo: d.cuerpo, fuente, original, auto: true })
    return r.error ? { error: r.error } : { enviado: true }
  }
  await sb.from('mensajes').update({ estado: 'descartado' }).eq('proyecto_id', proyectoId).eq('plantilla', clave).eq('estado', 'borrador')
  const { data, error } = await sb.from('mensajes').insert({
    proyecto_id: proyectoId, direccion: 'saliente', estado: 'borrador', plantilla: clave, generado_por: 'plantilla',
    remitente: d.t.remitente, para, asunto: d.asunto, cuerpo: d.cuerpo, canal: 'resend',
    asunto_original: original.asunto, cuerpo_original: original.cuerpo,
  }).select('id').single()
  if (error) return { error: error.message }
  return { borrador: data.id as number }
}
