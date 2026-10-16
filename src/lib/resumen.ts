// Resumen diario para Joel (fase 5, automatizacion.md): lo que espera de él hoy, por push y por email.
// Lo lanza el tick a partir de las 8:00 de Madrid, una vez al día; «Enviar resumen ahora» en /ajustes lo
// fuerza para probarlo. Solo servidor.
import { supabaseServer as sb } from '@/lib/supabase-server'
import { enviarEmail } from '@/lib/resend'
import { notificar } from '@/lib/push'
import { totalACobrar } from '@/lib/importes'
import { NOMBRE_EMAIL } from '@/lib/emails'

const CLAVE_FECHA = 'resumen_diario_fecha'
const HORA = 8
const REMITENTE = 'Joux Hub <hub@joelschneider.io>'
const PARA = 'joel@joelschneider.io'
const WEB = 'https://joux-web.vercel.app'

// Fecha (AAAA-MM-DD) y hora en Madrid: el servidor de Vercel va en UTC.
export function ahoraMadrid(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map(x => [x.type, x.value]))
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) }
}
const masDias = (fecha: string, n: number) => new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
const dias = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 864e5))
const euros = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' } as Intl.NumberFormatOptions)
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
const fechaCorta = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' })

const QUE_TOCA: Record<string, string> = { nuevo: 'sin responder', borrador: 'borrador listo', conversacion: 'te ha respondido' }

export async function pendienteHoy() {
  const hoy = ahoraMadrid().fecha
  const [{ data: leads }, { data: borradores }, { data: revisiones }, { data: facturas }, { data: marcas }] = await Promise.all([
    sb.from('leads').select('id, marca, estado, nombre, email, empresa, recibido_en, ultimo_contacto').in('estado', ['nuevo', 'borrador', 'conversacion']).order('recibido_en'),
    sb.from('mensajes').select('id, lead_id, proyecto_id, plantilla').eq('direccion', 'saliente').eq('estado', 'borrador'),
    sb.from('revisiones').select('id, proyecto_id, ronda, estado, comentarios, abierta_en, comentada_en').in('estado', ['abierta', 'comentada']).order('abierta_en'),
    // Los registros internos del timesheet (fiscal = false) no son facturas reales.
    sb.from('facturas').select('id, numero, cliente, importe, tipo_factura, fecha, fecha_vencimiento, fiscal').eq('estado', 'pendiente').or('fiscal.is.null,fiscal.eq.true'),
    sb.from('marcas').select('key, nombre'),
  ])
  const nombreMarca = new Map((marcas || []).map(m => [m.key, m.nombre as string]))
  const idsProyecto = Array.from(new Set([...(borradores || []).map(b => b.proyecto_id), ...(revisiones || []).map(r => r.proyecto_id)].filter((x): x is number => x != null)))
  const { data: proyectos } = idsProyecto.length ? await sb.from('proyectos').select('id, nombre, cliente').in('id', idsProyecto) : { data: [] }
  const proyecto = new Map((proyectos || []).map(p => [p.id, p]))
  const nombreProyecto = (id: number) => { const p = proyecto.get(id); return p ? `${p.cliente} · ${p.nombre}` : `Proyecto ${id}` }

  const limite = masDias(hoy, 7)
  const conVence = (facturas || []).map(f => ({ ...f, vence: (f.fecha_vencimiento || f.fecha) as string }))
  return {
    hoy,
    leads: (leads || []).map(l => ({
      id: l.id, texto: `${l.nombre || l.email}${l.empresa ? ` (${l.empresa})` : ''} · ${nombreMarca.get(l.marca) || l.marca} · ${QUE_TOCA[l.estado]} · hace ${plural(dias(l.estado === 'conversacion' && l.ultimo_contacto ? l.ultimo_contacto : l.recibido_en), 'día', 'días')}`,
    })),
    borradoresLeads: (borradores || []).filter(b => b.lead_id).length,
    borradoresProyectos: (borradores || []).filter(b => !b.lead_id && b.proyecto_id).map(b => ({
      id: b.id, texto: `${nombreProyecto(b.proyecto_id!)} · ${NOMBRE_EMAIL[b.plantilla || ''] || b.plantilla || 'email'}`,
    })),
    comentadas: (revisiones || []).filter(r => r.estado === 'comentada').map(r => ({
      id: r.id, texto: `${nombreProyecto(r.proyecto_id)} · ${r.ronda} · ${plural(r.comentarios, 'comentario', 'comentarios')} · hace ${plural(dias(r.comentada_en || r.abierta_en), 'día', 'días')}`,
    })),
    abiertas: (revisiones || []).filter(r => r.estado === 'abierta').map(r => ({
      id: r.id, texto: `${nombreProyecto(r.proyecto_id)} · ${r.ronda} · abierta hace ${plural(dias(r.abierta_en), 'día', 'días')}, sin comentarios`,
    })),
    vencidas: conVence.filter(f => f.vence < hoy).sort((a, b) => a.vence.localeCompare(b.vence)).map(f => ({
      id: f.id, texto: `${f.cliente}${f.numero ? ` · ${f.numero}` : ''} · ${euros(totalACobrar(f))} · venció el ${fechaCorta(f.vence)}`,
    })),
    estaSemana: conVence.filter(f => f.vence >= hoy && f.vence <= limite).sort((a, b) => a.vence.localeCompare(b.vence)).map(f => ({
      id: f.id, texto: `${f.cliente}${f.numero ? ` · ${f.numero}` : ''} · ${euros(totalACobrar(f))} · vence el ${fechaCorta(f.vence)}`,
    })),
  }
}
type Pendiente = Awaited<ReturnType<typeof pendienteHoy>>

// «2 leads, 1 borrador, 1 factura vencida»: el asunto del email y el texto del push.
export function lineaResumen(r: Pendiente) {
  const borradores = r.borradoresLeads + r.borradoresProyectos.length
  const partes = [
    r.leads.length && plural(r.leads.length, 'lead', 'leads'),
    borradores && plural(borradores, 'borrador', 'borradores'),
    r.comentadas.length && plural(r.comentadas.length, 'revisión por aplicar', 'revisiones por aplicar'),
    r.abiertas.length && plural(r.abiertas.length, 'revisión sin respuesta', 'revisiones sin respuesta'),
    r.vencidas.length && plural(r.vencidas.length, 'factura vencida', 'facturas vencidas'),
    r.estaSemana.length && plural(r.estaSemana.length, 'factura vence esta semana', 'facturas vencen esta semana'),
  ].filter(Boolean) as string[]
  return partes.length ? partes.join(', ') : 'nada pendiente'
}

function textoEmail(r: Pendiente) {
  const bloque = (titulo: string, filas: { texto: string }[], enlace: string) =>
    filas.length ? `${titulo} (${filas.length})\n${filas.map(f => `- ${f.texto}`).join('\n')}\n${WEB}${enlace}` : ''
  const partes = [
    bloque('Leads esperando respuesta', r.leads, '/pipeline'),
    r.borradoresLeads ? `Borradores de leads por aprobar: ${r.borradoresLeads} (en la ficha de cada lead)` : '',
    bloque('Emails de proyectos por aprobar', r.borradoresProyectos, '/proyectos'),
    bloque('Revisiones comentadas sin aplicar', r.comentadas, '/proyectos'),
    bloque('Revisiones abiertas sin respuesta del cliente', r.abiertas, '/proyectos'),
    bloque('Facturas vencidas', r.vencidas, '/'),
    bloque('Facturas que vencen esta semana', r.estaSemana, '/'),
  ].filter(Boolean)
  return partes.length ? `Buenos días. Esto espera de ti hoy:\n\n${partes.join('\n\n')}` : 'Buenos días. Hoy no hay nada pendiente.'
}

// Envía el resumen (push + email). Con `forzar` sale siempre, aunque no haya nada (botón de prueba).
// Sin `forzar` (el tick): solo a partir de las 8:00, una vez al día, y si no hay nada no manda nada.
export async function resumenDiario({ forzar = false } = {}) {
  const { fecha, hora } = ahoraMadrid()
  if (!forzar) {
    if (hora < HORA) return { omitido: 'antes de las 8' }
    const { data: conf } = await sb.from('configuracion').select('valor').eq('clave', CLAVE_FECHA).maybeSingle()
    if (conf?.valor === fecha) return { omitido: 'ya enviado hoy' }
    // Se marca antes de enviar: si algo falla a medias no se repite cada 15 minutos.
    await sb.from('configuracion').upsert({ clave: CLAVE_FECHA, valor: fecha }, { onConflict: 'clave' })
  }
  const r = await pendienteHoy()
  const linea = lineaResumen(r)
  const vacio = linea === 'nada pendiente'
  if (vacio && !forzar) {
    await sb.from('eventos').insert({ tipo: 'resumen.diario', fuente: 'joux-cron', datos: { fecha, vacio: true } })
    return { vacio: true }
  }
  const asunto = `Joux · Hoy: ${linea}`
  const [email, push] = await Promise.all([
    enviarEmail({ de: REMITENTE, para: PARA, asunto, texto: textoEmail(r) }),
    notificar({ titulo: 'Joux · Hoy', cuerpo: linea.charAt(0).toUpperCase() + linea.slice(1), url: '/', etiqueta: 'resumen-diario' }).catch(e => { console.error('resumen push', e?.message); return 0 }),
  ])
  await sb.from('eventos').insert({
    tipo: 'resumen.diario', fuente: forzar ? 'joux-hub' : 'joux-cron',
    datos: { fecha, linea, push, email: email.error ? { error: email.error } : { id: email.id }, ...(forzar ? { prueba: true } : {}) },
  })
  return { asunto, push, email }
}
