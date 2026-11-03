// Presupuestos con aceptación online (2026-11-03, decisión de Joel). Joel lo prepara en la ficha del lead; el cliente
// lo abre en /aceptar/<token>, marca la casilla de las condiciones vigentes de la marca y pulsa «Aceptar». Eso guarda
// la prueba (nombre, email, fecha, IP, navegador, versión y sha256 del texto) y gana el lead con el precio del
// presupuesto. Nunca factura ni envía la bienvenida: eso lo sigue haciendo Joel desde la ficha. Lo único que sale solo es
// la confirmación al cliente, su copia de lo aceptado (obligatoria si es un particular). Solo servidor.
import { createHash, randomBytes } from 'crypto'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { formInicial, type ClienteFiscal } from '@/lib/ganado'
import { ganarLead } from '@/lib/ganar'
import { notificar } from '@/lib/push'
import { enviarMensajeLead } from '@/lib/enviar-lead'
import { remitenteLead } from '@/lib/remitentes'
import type { Lead } from '@/lib/leads'

export const PUBLICA = 'https://joux-web.vercel.app'
export const enlacePresupuesto = (token: string) => `${PUBLICA}/aceptar/${token}`
export const enlaceCondiciones = (marca: string, version: number, idioma: string) => `${PUBLICA}/condiciones/${marca}/${version}${idioma === 'en' ? '?lang=en' : ''}`

export type Condiciones = { id: number; marca: string; version: number; idioma: string; titulo: string; texto: string; created_at: string }
export type Presupuesto = {
  id: number; lead_id: number; marca: string; token: string; idioma: 'es' | 'en'; modo: 'cerrado' | 'dia'
  concepto: string; plan: string | null; precio: number | null; tarifa_dia: number | null; dias: number | null
  incluye: string | null; plazo: string | null; caduca: string | null; condiciones_id: number
  estado: 'enviado' | 'aceptado' | 'anulado'; aceptado_at: string | null; aceptado_nombre: string | null; aceptado_email: string | null
  aceptado_ip: string | null; aceptado_ua: string | null; condiciones_sha256: string | null; proyecto_id: number | null; created_at: string
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const hoy = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })   // AAAA-MM-DD

// Las vigentes: la versión más alta de la marca en ese idioma; si no hay en ese idioma, la del otro.
export async function condicionesVigentes(marca: string, idioma: string): Promise<Condiciones | null> {
  const { data } = await sb.from('condiciones').select('*').eq('marca', marca).order('version', { ascending: false })
  const filas = (data || []) as Condiciones[]
  return filas.find(c => c.idioma === idioma) || filas[0] || null
}

export async function condicionesVersion(marca: string, version: number, idioma: string): Promise<Condiciones | null> {
  const { data } = await sb.from('condiciones').select('*').eq('marca', marca).eq('version', version)
  const filas = (data || []) as Condiciones[]
  return filas.find(c => c.idioma === idioma) || filas[0] || null
}

export type NuevoPresupuesto = {
  concepto: string; plan?: string | null; precio?: number | null; tarifa_dia?: number | null; dias?: number | null
  incluye?: string | null; plazo?: string | null; caduca?: string | null; idioma?: string | null
}

// Crea el presupuesto del lead y anula los anteriores sin aceptar: solo hay un enlace vivo por lead.
export async function crearPresupuesto(leadId: number, e: NuevoPresupuesto): Promise<{ ok: true; p: Presupuesto } | { error: string; status: number }> {
  const { data: lead } = await sb.from('leads').select('id, marca, idioma, estado, proyecto_id').eq('id', leadId).maybeSingle()
  if (!lead) return { error: 'No existe', status: 404 }
  if (lead.proyecto_id) return { error: 'Este lead ya está ganado', status: 409 }
  const { data: marca } = await sb.from('marcas').select('key, modo').eq('key', lead.marca).maybeSingle()
  if (!marca || !['cerrado', 'dia'].includes(marca.modo)) return { error: 'Esta marca no usa presupuestos', status: 400 }
  const modo = marca.modo as 'cerrado' | 'dia'
  const idioma = (e.idioma || lead.idioma) === 'en' ? 'en' : 'es'
  const concepto = e.concepto?.trim() || ''
  if (concepto.length < 3 || concepto.length > 200) return { error: 'Falta el concepto', status: 400 }
  if (modo === 'cerrado' && !(Number(e.precio) > 0)) return { error: 'Falta el precio', status: 400 }
  if (modo === 'dia' && !(Number(e.tarifa_dia) > 0)) return { error: 'Falta la tarifa por día', status: 400 }
  if (e.caduca && (!/^\d{4}-\d{2}-\d{2}$/.test(e.caduca) || e.caduca < hoy())) return { error: 'La fecha de validez ya ha pasado', status: 400 }
  const cond = await condicionesVigentes(lead.marca, idioma)
  if (!cond) return { error: 'Esta marca no tiene condiciones publicadas', status: 400 }

  await sb.from('presupuestos').update({ estado: 'anulado' }).eq('lead_id', leadId).eq('estado', 'enviado')
  const fila = {
    lead_id: leadId, marca: lead.marca, token: randomBytes(18).toString('base64url'), idioma, modo, concepto,
    plan: e.plan?.trim() || null, precio: modo === 'cerrado' ? Number(e.precio) : null,
    tarifa_dia: modo === 'dia' ? Number(e.tarifa_dia) : null, dias: modo === 'dia' && Number(e.dias) > 0 ? Number(e.dias) : null,
    incluye: e.incluye?.trim() || null, plazo: e.plazo?.trim() || null, caduca: e.caduca || null, condiciones_id: cond.id,
  }
  const { data: p, error } = await sb.from('presupuestos').insert(fila).select('*').single()
  if (error || !p) return { error: error?.message || 'No se pudo crear', status: 500 }
  await sb.from('eventos').insert({ tipo: 'presupuesto.creado', fuente: 'joux-hub', lead_id: leadId, datos: { presupuesto: p.id, concepto, precio: fila.precio, tarifa_dia: fila.tarifa_dia, condiciones: `v${cond.version}` } })
  return { ok: true, p: p as Presupuesto }
}

export async function anularPresupuesto(id: number): Promise<{ ok: true } | { error: string; status: number }> {
  const { data } = await sb.from('presupuestos').update({ estado: 'anulado' }).eq('id', id).eq('estado', 'enviado').select('id, lead_id')
  if (!data?.length) return { error: 'Solo se puede anular un presupuesto enviado y sin aceptar', status: 409 }
  await sb.from('eventos').insert({ tipo: 'presupuesto.anulado', fuente: 'joux-hub', lead_id: data[0].lead_id, datos: { presupuesto: id } })
  return { ok: true }
}

// Lo que ve el cliente: el presupuesto, su marca y las condiciones con las que se envió.
export async function presupuestoDeToken(token: string) {
  if (!/^[\w-]{20,40}$/.test(token)) return null
  const { data } = await sb.from('presupuestos').select('*').eq('token', token).maybeSingle()
  if (!data) return null
  const p = data as Presupuesto
  const [{ data: marca }, { data: cond }, { data: lead }] = await Promise.all([
    sb.from('marcas').select('nombre, dominio').eq('key', p.marca).maybeSingle(),
    sb.from('condiciones').select('*').eq('id', p.condiciones_id).single(),
    sb.from('leads').select('nombre, empresa, email').eq('id', p.lead_id).maybeSingle(),
  ])
  const caducado = p.estado === 'enviado' && !!p.caduca && p.caduca < hoy()
  return { p, marca: marca?.nombre || 'Joel Schneider', cond: cond as Condiciones, lead, caducado }
}

export type Aceptacion = { nombre: string; acepto: boolean; ip: string | null; ua: string | null }

// Guarda la aceptación y devuelve `despues`: ganar el lead y enviar la confirmación (Drive y Gmail tardan unos
// segundos). La ruta lo pasa a waitUntil para que el cliente vea «Aceptado» al momento.
export async function aceptarPresupuesto(token: string, a: Aceptacion): Promise<{ ok: true; ya?: boolean; despues?: () => Promise<void> } | { error: string; status: number }> {
  const nombre = a.nombre?.trim().replace(/\s+/g, ' ') || ''
  if (nombre.length < 2 || nombre.length > 200) return { error: 'nombre', status: 400 }
  if (a.acepto !== true) return { error: 'casilla', status: 400 }
  const d = await presupuestoDeToken(token)
  if (!d) return { error: 'enlace', status: 404 }
  if (d.p.estado === 'aceptado') return { ok: true, ya: true }
  if (d.p.estado === 'anulado') return { error: 'anulado', status: 410 }
  if (d.caducado) return { error: 'caducado', status: 410 }

  // Update condicional: dos clics a la vez no aceptan dos veces.
  const { data: hecho, error } = await sb.from('presupuestos').update({
    estado: 'aceptado', aceptado_at: new Date().toISOString(), aceptado_nombre: nombre, aceptado_email: d.lead?.email || null,
    aceptado_ip: a.ip?.slice(0, 64) || null, aceptado_ua: a.ua?.slice(0, 400) || null, condiciones_sha256: sha(d.cond.texto),
  }).eq('id', d.p.id).eq('estado', 'enviado').select('id')
  if (error) return { error: 'servidor', status: 500 }
  if (!hecho?.length) return { ok: true, ya: true }

  await sb.from('eventos').insert({ tipo: 'presupuesto.aceptado', fuente: 'aceptacion', lead_id: d.p.lead_id, datos: { presupuesto: d.p.id, nombre, condiciones: `v${d.cond.version}`, ip: a.ip || null } })
  const despues = async () => {
    await ganarPorAceptacion(d.p, nombre).catch(e => console.error('aceptar/ganar', e?.message))
    await enviarConfirmacion(d.p, d.cond, nombre).catch(e => console.error('aceptar/confirmacion', e?.message))
  }
  return { ok: true, despues }
}

// Gana el lead con el mismo formulario que vería Joel en la ficha y el precio del presupuesto. Sin bienvenida
// ni factura (decisión de Joel, 2026-11-03). Si no se puede ganar solo, queda aceptado y se avisa.
async function ganarPorAceptacion(p: Presupuesto, nombre: string) {
  const { data: lead } = await sb.from('leads').select('*').eq('id', p.lead_id).maybeSingle()
  const quien = lead?.empresa || lead?.nombre || nombre
  const aviso = (titulo: string, cuerpo: string, url: string) => notificar({ titulo, cuerpo, url, etiqueta: `lead-${p.lead_id}` }).catch(() => {})
  if (!lead) return
  if (lead.proyecto_id) {
    await sb.from('presupuestos').update({ proyecto_id: lead.proyecto_id }).eq('id', p.id)
    return aviso(`${quien} ha aceptado el presupuesto`, 'El lead ya estaba ganado.', `/proyectos/${lead.proyecto_id}`)
  }
  const { data: marca } = await sb.from('marcas').select('key, nombre, modo').eq('key', lead.marca).maybeSingle()
  if (!marca) return
  const nif = (lead.para_empezar as Lead['para_empezar'])?.fiscales?.datos?.nif?.trim()
  const { data: existente } = nif
    ? await sb.from('clientes_fiscales').select('cliente, identificador, direccion, pais').ilike('identificador', nif).maybeSingle()
    : { data: null }
  const form = formInicial(lead, marca, (existente as ClienteFiscal | null) || undefined,
    p.modo === 'cerrado' ? { precio: Number(p.precio), fuente: 'el presupuesto aceptado', diseno: p.plan } : null)
  if (p.plan) form.plan = p.plan
  if (p.modo === 'dia') form.tarifa_dia = Number(p.tarifa_dia)
  const r = await ganarLead(lead.id, form, 'aceptacion', { bienvenida: false })
  if ('error' in r) return aviso(`${quien} ha aceptado el presupuesto`, `No se pudo marcar ganado solo: ${r.error}. Hazlo tú desde su ficha.`, `/leads/${lead.id}`)
  await sb.from('presupuestos').update({ proyecto_id: r.proyecto_id }).eq('id', p.id)
  return aviso(`${quien} ha aceptado el presupuesto`, p.modo === 'cerrado' ? 'Ganado. Te toca la bienvenida con la factura del pago 1.' : 'Ganado. Te toca la bienvenida.', `/leads/${lead.id}`)
}

const eur = (n: number, idioma: string) => new Intl.NumberFormat(idioma === 'en' ? 'en-GB' : 'es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: n % 1 ? 2 : 0, useGrouping: 'always' } as Intl.NumberFormatOptions).format(n)

// Texto de la confirmación: qué ha aceptado, cómo se paga, con qué condiciones y dónde volver a verlo.
export function textoConfirmacion(p: Pick<Presupuesto, 'marca' | 'idioma' | 'modo' | 'concepto' | 'precio' | 'tarifa_dia' | 'dias' | 'token'>, cond: Pick<Condiciones, 'marca' | 'version' | 'idioma'>, nombre: string, firma: string) {
  const en = p.idioma === 'en'
  const pila = nombre.split(' ')[0]
  const precio = Number(p.precio), tarifa = Number(p.tarifa_dia)
  const importe = p.modo === 'cerrado'
    ? (en ? `${eur(precio, 'en')} + VAT, in two payments: 50% to start and 50% ${p.marca === 'cartela' ? 'on delivery' : 'before launch'}.` : `${eur(precio, 'es')} + IVA, en dos pagos: 50 % para empezar y 50 % ${p.marca === 'cartela' ? 'al entregar la carta' : 'antes de publicar'}.`)
    : (en ? `${eur(tarifa, 'en')}/day + VAT${Number(p.dias) > 0 ? `, about ${p.dias} days` : ''}, invoiced on delivery.` : `${eur(tarifa, 'es')}/día + IVA${Number(p.dias) > 0 ? `, unos ${p.dias} días` : ''}, a la entrega.`)
  const cuerpo = en
    ? `Hi ${pila},\n\nThis confirms you have accepted the quote "${p.concepto}":\n\n${importe}\n\nTerms of service (v${cond.version}): ${enlaceCondiciones(cond.marca, cond.version, cond.idioma)}\nYour quote: ${enlacePresupuesto(p.token)}\n\nKeep this email as your copy. We will be in touch shortly with the next steps.\n\n${firma}`
    : `Hola, ${pila}:\n\nTe confirmamos que has aceptado el presupuesto «${p.concepto}»:\n\n${importe}\n\nCondiciones del servicio (v${cond.version}): ${enlaceCondiciones(cond.marca, cond.version, cond.idioma)}\nTu presupuesto: ${enlacePresupuesto(p.token)}\n\nGuarda este correo como copia. En breve te escribimos con los siguientes pasos.\n\n${firma}`
  return { asunto: en ? `Quote accepted · ${p.concepto}` : `Presupuesto aceptado · ${p.concepto}`, cuerpo }
}

// La confirmación sale sola por Gmail, en el hilo del lead y con el alias de la marca (mismo envío que la ficha).
// Si falla, la aceptación ya está guardada: queda el mensaje en «error» en la ficha y se avisa a Joel.
async function enviarConfirmacion(p: Presupuesto, cond: Condiciones, nombre: string) {
  const { data: lead } = await sb.from('leads').select('id, email, marca, idioma, proyecto_id').eq('id', p.lead_id).maybeSingle()
  if (!lead?.email) return
  const remitente = remitenteLead(lead.marca, lead.idioma)
  if (!remitente) return
  const { data: marca } = await sb.from('marcas').select('nombre').eq('key', p.marca).maybeSingle()
  const { asunto, cuerpo } = textoConfirmacion(p, cond, nombre, marca?.nombre || 'Joel Schneider')
  const { data: m, error } = await sb.from('mensajes').insert({
    lead_id: lead.id, proyecto_id: lead.proyecto_id, direccion: 'saliente', estado: 'borrador', generado_por: 'plantilla', plantilla: 'presupuesto.aceptado',
    auto: true, canal: 'gmail', remitente, para: lead.email, asunto, cuerpo,
  }).select('id').single()
  if (error || !m) throw new Error(error?.message || 'No se pudo guardar la confirmación')
  const r = await enviarMensajeLead(m.id, ['borrador'])
  if (!r.ok) await notificar({ titulo: 'La confirmación del presupuesto no salió', cuerpo: `${r.error}. Reenvíala desde la ficha.`, url: `/leads/${lead.id}`, etiqueta: `lead-${lead.id}` }).catch(() => {})
}
