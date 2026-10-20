// Resumen diario para Joel (fase 5, automatizacion.md): lo que espera de él hoy, por push y por email.
// Lo lanza el tick a partir de las 8:00 de Madrid, una vez al día; «Enviar resumen ahora» en /ajustes lo
// fuerza para probarlo. Solo servidor.
import { supabaseServer as sb } from '@/lib/supabase-server'
import { enviarEmail } from '@/lib/resend'
import { notificar } from '@/lib/push'
import { cargarHoy } from '@/lib/pendientes'

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
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
const fechaCorta = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' })
const masDias = (fecha: string, n: number) => new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

// Lo mismo que «Pendiente» en Hoy (cargarHoy, lib/pendientes.ts), para que el resumen, Hoy y la insignia
// del menú digan lo mismo. Más las fechas de los próximos 7 días (vencimientos y recordatorios).
// El impuesto del trimestre no va aquí: lo calcula el hub en el navegador (impuestos-tab).
export async function pendienteHoy() {
  const hoy = ahoraMadrid().fecha
  const { pendientes, fechas } = await cargarHoy()
  const limite = masDias(hoy, 7)
  return { hoy, pendientes, semana: fechas.filter(f => f.fecha <= limite) }
}
type Pendiente = Awaited<ReturnType<typeof pendienteHoy>>

// «2 leads, 1 proyecto, 1 factura vencida»: el asunto del email y el texto del push.
export function lineaResumen(r: Pendiente) {
  const de = (letra: string) => r.pendientes.filter(x => x.clave.startsWith(letra)).length
  const proyectos = de('p') + de('c') + de('v')
  const partes = [
    de('l') && plural(de('l'), 'lead', 'leads'),
    proyectos && plural(proyectos, 'proyecto te espera', 'proyectos te esperan'),
    de('f') && plural(de('f'), 'factura vencida', 'facturas vencidas'),
    r.semana.length && plural(r.semana.length, 'fecha esta semana', 'fechas esta semana'),
  ].filter(Boolean) as string[]
  return partes.length ? partes.join(', ') : 'nada pendiente'
}

function textoEmail(r: Pendiente) {
  const partes = [
    r.pendientes.length ? `Pendiente (${r.pendientes.length})\n${r.pendientes.map(x => `- ${x.texto} · ${x.sub}\n  ${WEB}${x.href}`).join('\n')}` : '',
    r.semana.length ? `Esta semana\n${r.semana.map(f => `- ${fechaCorta(f.fecha)} · ${f.texto} · ${f.sub}`).join('\n')}` : '',
  ].filter(Boolean)
  return partes.length ? `Buenos días. Esto espera de ti hoy:\n\n${partes.join('\n\n')}\n\nHoy: ${WEB}/` : 'Buenos días. Hoy no hay nada pendiente.'
}

// Vista previa (GET /api/resumen): el asunto y el texto de hoy, sin enviar nada.
export async function vistaPreviaResumen() {
  const r = await pendienteHoy()
  const linea = lineaResumen(r)
  return { asunto: `Joux · Hoy: ${linea}`, push: linea.charAt(0).toUpperCase() + linea.slice(1), texto: textoEmail(r) }
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
