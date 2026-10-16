import { NextRequest, NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'
import { waitUntil } from '@vercel/functions'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { ErrorGmail, historial, historyIdActual, hiloIds, leerMensaje } from '@/lib/gmail'
import { generarBorrador } from '@/lib/ia'
import { enviarMensajeLead } from '@/lib/enviar-lead'
import { enviarEmail } from '@/lib/resend'
import { notificar } from '@/lib/push'
import { prepararEmailProyecto } from '@/lib/emails-proyecto'
import { resumenDiario } from '@/lib/resumen'
import { avisarMaterial, guardarAdjuntos } from '@/lib/prueba-gratis'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const maxDuration = 60

// Tick del cron (Worker de Cloudflare `joux-cron`, cada 15 min). Público en el middleware: valida
// CRON_TICK_SECRET (distinta de CRON_SECRET, que es del cron de bancos). Se puede llamar las veces
// que haga falta: los mensajes de Gmail no se duplican (índice único por id_proveedor) y los
// envíos se reservan con un cambio de estado condicional.
const CLAVE_HISTORIAL = 'gmail_history_id'
const sha = (s: string) => createHash('sha256').update(s).digest()

function autorizado(req: NextRequest) {
  const secreto = process.env.CRON_TICK_SECRET?.trim()
  const dado = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/)?.[1]?.trim()
  return !!secreto && !!dado && timingSafeEqual(sha(dado), sha(secreto))
}

const guardarHistorial = (valor: string) => sb.from('configuracion').upsert({ clave: CLAVE_HISTORIAL, valor }, { onConflict: 'clave' })

// 1. Respuestas de los leads en Gmail: solo se miran los hilos que ya tiene algún lead (gmail_hilo).
async function leerGmail() {
  const { data: conf } = await sb.from('configuracion').select('valor').eq('clave', CLAVE_HISTORIAL).maybeSingle()
  if (!conf?.valor) {
    // Primera vez: se empieza desde ahora (lo anterior no hace falta, los leads aún no tenían hilos).
    await guardarHistorial(await historyIdActual())
    return { iniciado: true, recibidos: 0, enviados_fuera: 0 }
  }

  let candidatos: { id: string; hilo: string }[], nuevoHistorial: string
  try {
    const h = await historial(conf.valor)
    candidatos = h.mensajes; nuevoHistorial = h.historyId
  } catch (e) {
    if (!(e instanceof ErrorGmail && e.status === 404)) throw e
    // El historyId caducó (Gmail guarda una semana o así): se repasan los hilos de los leads recientes.
    nuevoHistorial = await historyIdActual()
    const { data: recientes } = await sb.from('leads').select('gmail_hilo').not('gmail_hilo', 'is', null).gte('updated_at', new Date(Date.now() - 30 * 864e5).toISOString())
    candidatos = (await Promise.all((recientes || []).map(l => hiloIds(l.gmail_hilo!).catch(() => [])))).flat()
  }

  const hilos = Array.from(new Set(candidatos.map(c => c.hilo)))
  const { data: leads } = hilos.length ? await sb.from('leads').select('id, marca, nombre, empresa, email, estado, gmail_hilo, interes, campos, proyecto_id').in('gmail_hilo', hilos) : { data: [] }
  const porHilo = new Map((leads || []).map(l => [l.gmail_hilo!, l]))
  const enHilos = candidatos.filter(c => porHilo.has(c.hilo))
  const { data: yaEstan } = enHilos.length ? await sb.from('mensajes').select('id_proveedor').eq('canal', 'gmail').in('id_proveedor', enHilos.map(c => c.id)) : { data: [] }
  const conocidos = new Set((yaEstan || []).map(m => m.id_proveedor))

  let recibidos = 0, enviadosFuera = 0
  const borradores: number[] = []
  for (const c of enHilos) {
    if (conocidos.has(c.id)) continue
    const lead = porHilo.get(c.hilo)!
    const m = await leerMensaje(c.id)
    if (m.etiquetas.includes('DRAFT')) continue
    // Saliente = lo mandó esta cuenta (etiqueta SENT), salvo que el From sea el propio lead
    // (pasa cuando el lead es una dirección de la misma cuenta, como en las pruebas con joel+…).
    const deLead = (m.de.match(/<([^>]+)>/)?.[1] || m.de).trim().toLowerCase() === lead.email.toLowerCase()
    const saliente = m.etiquetas.includes('SENT') && !deLead
    if (saliente) {
      // Un envío del hub que aún no ha guardado su id de Gmail: lo registra el propio envío.
      const { count } = await sb.from('mensajes').select('id', { count: 'exact', head: true }).eq('lead_id', lead.id).eq('estado', 'enviado').is('id_proveedor', null)
      if (count) continue
    }
    const { data: fila, error } = await sb.from('mensajes').insert({
      lead_id: lead.id, direccion: saliente ? 'saliente' : 'entrante', estado: saliente ? 'enviado' : 'recibido',
      generado_por: saliente ? 'joel' : null, canal: 'gmail', id_proveedor: m.id,
      remitente: m.de.slice(0, 300), para: m.para.slice(0, 300) || lead.email, asunto: m.asunto.slice(0, 300), cuerpo: m.texto, enviado_en: m.fecha,
    }).select('id').single()
    if (error) { if (error.code === '23505') continue; throw new Error(error.message) }

    const ahora = new Date().toISOString()
    if (saliente) {
      // Joel respondió desde Gmail en el mismo hilo: queda en la ficha.
      enviadosFuera++
      await sb.from('leads').update({ ultimo_contacto: m.fecha, updated_at: ahora }).eq('id', lead.id)
      continue
    }
    recibidos++
    // Fotos y PDF de la respuesta, al bucket privado `leads`; con fotos y diseño elegido, aviso de material.
    let material = false
    if (m.adjuntos.length) {
      const guardados = await guardarAdjuntos(lead.id, fila.id, m.id, m.adjuntos)
      material = await avisarMaterial(lead, fila.id, guardados).catch(e => { console.error('tick material', e?.message); return false })
    }
    const estado = ['nuevo', 'borrador', 'respondido'].includes(lead.estado) ? 'conversacion' : lead.estado
    await sb.from('leads').update({ estado, ultimo_contacto: m.fecha, updated_at: ahora }).eq('id', lead.id)
    await sb.from('eventos').insert([
      { lead_id: lead.id, tipo: 'mensaje.recibido', fuente: 'gmail', datos: { asunto: m.asunto.slice(0, 300) } },
      ...(estado !== lead.estado ? [{ lead_id: lead.id, tipo: 'lead.estado', fuente: 'gmail', datos: { de: lead.estado, a: estado } }] : []),
    ])
    lead.estado = estado
    const { data: marca } = await sb.from('marcas').select('nombre').eq('key', lead.marca).maybeSingle()
    // Con material, el push ya lo dio avisarMaterial (uno por respuesta basta).
    if (!material) await notificar({
      titulo: `Respuesta · ${marca?.nombre || lead.marca} · ${lead.nombre || lead.email}`,
      cuerpo: m.texto.slice(0, 140),
      url: `/leads/${lead.id}`,
      etiqueta: `lead-${lead.id}`,
    }).catch(e => console.error('tick push', e?.message))
    if (!borradores.includes(lead.id)) borradores.push(lead.id)
  }

  await guardarHistorial(nuevoHistorial)
  // El borrador de IA para cada respuesta, después de contestar al Worker.
  if (borradores.length) waitUntil(Promise.all(borradores.map(id => generarBorrador(id, 'respuesta').then(r => { if (!r.ok) console.error('tick ia', id, r.error) }))))
  return { iniciado: false, recibidos, enviados_fuera: enviadosFuera }
}

// 2. Mensajes «aprobado» cuya hora ya llegó (o sin hora): los de leads por Gmail, los de proyectos por Resend.
async function enviarAprobados() {
  const { data } = await sb.from('mensajes').select('id, lead_id, proyecto_id, canal, remitente, para, asunto, cuerpo')
    .eq('estado', 'aprobado').eq('direccion', 'saliente')
    .or(`programado_para.is.null,programado_para.lte.${new Date().toISOString()}`).order('programado_para', { ascending: true, nullsFirst: true }).limit(20)
  let enviados = 0, errores = 0
  for (const m of data || []) {
    if (m.lead_id) {
      const r = await enviarMensajeLead(m.id, ['aprobado'])
      r.ok ? enviados++ : errores++
      continue
    }
    if (!m.remitente || !m.asunto) { await sb.from('mensajes').update({ estado: 'error', error: 'Falta remitente o asunto' }).eq('id', m.id); errores++; continue }
    const { data: reservado } = await sb.from('mensajes').update({ estado: 'enviado' }).eq('id', m.id).eq('estado', 'aprobado').select('id')
    if (!reservado?.length) continue
    const envio = await enviarEmail({ de: m.remitente, para: m.para, asunto: m.asunto, texto: m.cuerpo })
    await sb.from('mensajes').update(envio.error
      ? { estado: 'error', error: envio.error }
      : { canal: 'resend', id_proveedor: envio.id || null, enviado_en: new Date().toISOString() }).eq('id', m.id)
    if (envio.error) { errores++; continue }
    enviados++
    if (m.proyecto_id) await sb.from('eventos').insert({ proyecto_id: m.proyecto_id, tipo: 'mensaje.enviado', fuente: 'joux-cron', datos: { mensaje_id: m.id, para: m.para, asunto: m.asunto } })
  }
  return { enviados, errores }
}

// 3. Rondas abiertas sin comentarios: recordatorio n+1 a los 3·(n+1) días (como máximo 2). En las webs
// queda el borrador «revision.recordatorio» para enviarlo desde /proyectos; en los treatments, solo el push.
const DIAS_RECORDATORIO = 3, MAX_RECORDATORIOS = 2
async function recordatoriosRevision() {
  const { data } = await sb.from('revisiones').select('id, proyecto_id, ronda, url, abierta_en, recordatorios')
    .eq('estado', 'abierta').lt('recordatorios', MAX_RECORDATORIOS).lte('abierta_en', new Date(Date.now() - DIAS_RECORDATORIO * 864e5).toISOString())
  let preparados = 0
  for (const r of data || []) {
    if (new Date(r.abierta_en).getTime() + DIAS_RECORDATORIO * (r.recordatorios + 1) * 864e5 > Date.now()) continue
    // Se reserva con un cambio condicional: dos ticks a la vez no preparan dos recordatorios.
    const { data: reservado } = await sb.from('revisiones').update({ recordatorios: r.recordatorios + 1 }).eq('id', r.id).eq('recordatorios', r.recordatorios).eq('estado', 'abierta').select('id')
    if (!reservado?.length) continue
    const { data: p } = await sb.from('proyectos').select('id, nombre, cliente, marca, lead_id').eq('id', r.proyecto_id).maybeSingle()
    if (!p) continue
    const { data: marca } = await sb.from('marcas').select('modo').eq('key', p.marca ?? '').maybeSingle()
    const esWeb = marca?.modo === 'cerrado'
    const email = esWeb ? await prepararEmailProyecto(p.id, 'revision.recordatorio', { ronda: r.ronda, url: r.url }, 'joux-cron') : null
    if (email && 'error' in email) console.error('tick recordatorio', p.id, email.error)
    await sb.from('eventos').insert({ proyecto_id: p.id, lead_id: p.lead_id, tipo: 'revision.recordatorio', fuente: 'joux-cron', datos: { ronda: r.ronda, n: r.recordatorios + 1 } })
    const dias = Math.floor((Date.now() - new Date(r.abierta_en).getTime()) / 864e5)
    await notificar({
      titulo: `Revisión sin comentarios · ${p.cliente} · ${p.nombre}`,
      cuerpo: `Ronda ${r.ronda} abierta hace ${dias} días.${email && 'borrador' in email ? ' Recordatorio preparado para enviar.' : email && 'enviado' in email ? ' Recordatorio enviado automáticamente.' : ''}`,
      url: esWeb ? '/proyectos' : '/',
      etiqueta: `proyecto-${p.id}`,
    }).catch(e => console.error('tick push', e?.message))
    preparados++
  }
  return { preparados }
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })
  const resultado: Record<string, unknown> = {}
  // Cada parte por separado: si Gmail falla, los envíos programados siguen saliendo.
  try { resultado.gmail = await leerGmail() } catch (e: any) { console.error('tick gmail', e?.message); resultado.gmail = { error: e?.message || 'error' } }
  try { resultado.envios = await enviarAprobados() } catch (e: any) { console.error('tick envios', e?.message); resultado.envios = { error: e?.message || 'error' } }
  try { resultado.recordatorios = await recordatoriosRevision() } catch (e: any) { console.error('tick recordatorios', e?.message); resultado.recordatorios = { error: e?.message || 'error' } }
  // Al final: así el resumen ya cuenta las respuestas y recordatorios de este mismo tick.
  try { resultado.resumen = await resumenDiario() } catch (e: any) { console.error('tick resumen', e?.message); resultado.resumen = { error: e?.message || 'error' } }
  return NextResponse.json(resultado)
}
