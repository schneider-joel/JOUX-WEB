// «Marcar ganado» (solo servidor): cliente fiscal (si es nuevo) + proyecto en fase «confirmado» + lead ganado +
// evento, y la carpeta de Drive o el local de Cartela. Lo usan el botón de la ficha del lead y el piloto
// automático (rediseño comercial, 2026-10-26). Las filas salen de filasGanado(), la misma que pinta la vista previa.
import { randomBytes } from 'crypto'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { faltaGanado, filasGanado, formInicial, precioPropuesto, type ClienteFiscal, type FormGanado } from '@/lib/ganado'
import { esCorreoPrueba, type Lead } from '@/lib/leads'
import { crearCarpetaProyecto } from '@/lib/drive'
import { SUBCARPETAS } from '@/lib/drive-carpetas'
import { crearLocalCartela } from '@/lib/cartela-cambios'
import { disenoDelLead } from '@/lib/prueba-gratis'
import { notificar } from '@/lib/push'
import { pilotoActivo } from '@/lib/autonomia'
import { enviarBienvenida } from '@/lib/bienvenida'

type Fallo = { error: string; status: number; proyecto_id?: number }
export type Ganado = { ok: true; proyecto_id: number; drive: unknown; local: unknown; bienvenida: Bienvenida }
type Bienvenida = { enviada: true; factura: string | null } | { error: string } | null

export async function ganarLead(leadId: number | string, form: FormGanado, fuente = 'joux-hub'): Promise<Fallo | Ganado> {
  const { data: lead } = await sb.from('leads').select('id, marca, estado, nombre, email, empresa, pais, idioma, interes, proyecto_id, prueba').eq('id', leadId).maybeSingle()
  if (!lead) return { error: 'No existe', status: 404 }
  if (lead.proyecto_id) return { error: 'Este lead ya tiene proyecto', status: 409 }
  const { data: marca } = await sb.from('marcas').select('key, nombre, modo').eq('key', lead.marca).maybeSingle()
  if (!marca) return { error: 'Marca desconocida', status: 400 }

  const falta = faltaGanado(form, marca)
  if (falta) return { error: falta, status: 400 }
  const { clienteFiscal, proyecto, evento } = filasGanado(lead as Lead, marca, form)

  // Cliente: el existente tiene que existir de verdad; el nuevo no puede pisar a otro con el mismo nombre.
  const { data: yaExiste } = await sb.from('clientes_fiscales').select('cliente').eq('cliente', proyecto.cliente).maybeSingle()
  if (form.existente && !yaExiste) return { error: `${proyecto.cliente} no está en Clientes`, status: 400 }
  if (!form.existente && yaExiste) return { error: `${proyecto.cliente} ya está en Clientes: elígelo de la lista`, status: 409 }
  if (clienteFiscal) {
    const { error } = await sb.from('clientes_fiscales').insert(clienteFiscal)
    if (error) return { error: error.message, status: 500 }
  }

  // Datos fiscales por formulario: el proyecto lleva el token de su enlace público (/datos/<token>).
  const token_fiscal = form.datos_cliente && !form.existente ? randomBytes(18).toString('base64url') : null
  const { data: nuevo, error: errP } = await sb.from('proyectos').insert({ ...proyecto, ...(token_fiscal ? { token_fiscal } : {}) }).select('id').single()
  if (errP || !nuevo) {
    // Sin proyecto no dejamos un cliente fiscal huérfano recién creado.
    if (clienteFiscal) await sb.from('clientes_fiscales').delete().eq('cliente', clienteFiscal.cliente)
    return { error: errP?.message || 'No se pudo crear el proyecto', status: 500 }
  }

  const { error: errL } = await sb.from('leads').update({ estado: 'ganado', proyecto_id: nuevo.id, updated_at: new Date().toISOString() }).eq('id', lead.id)
  if (errL) return { error: errL.message, status: 500, proyecto_id: nuevo.id }
  await sb.from('eventos').insert({ ...evento, fuente, lead_id: lead.id, proyecto_id: nuevo.id, datos: { ...evento.datos, de: lead.estado } })
  // Los borradores de IA que queden en el lead ya no sirven: lo siguiente es la bienvenida.
  await sb.from('mensajes').update({ estado: 'descartado' }).eq('lead_id', lead.id).eq('estado', 'borrador').eq('generado_por', 'ia')
  // Carpeta de Drive para el material (solo marcas con subcarpetas). Si falla, el proyecto ya está creado:
  // el motivo queda en proyectos.drive_error y la ficha ofrece «Reintentar».
  const drive = SUBCARPETAS[marca.key] ? await crearCarpetaProyecto(nuevo.id).catch(e => ({ error: String(e?.message || e) })) : null
  // Cartela: el local y su enlace de cambios, para la bienvenida. Si falla, el proyecto queda igual.
  const local = marca.key === 'cartela'
    ? await crearLocalCartela(nuevo.id, { nombre: lead.empresa || proyecto.cliente, plan: proyecto.plan ?? null, email: lead.email || null, prueba: !!lead.prueba }).catch(e => ({ ok: false as const, error: String(e?.message || e) }))
    : null
  if (local && !local.ok) console.error('ganado/cartela', local.error)
  const bienvenida = await bienvenidaSola(nuevo.id, marca.key, lead)
  return { ok: true, proyecto_id: nuevo.id, drive, local, bienvenida }
}

// Piloto «Enviar la bienvenida con la factura» (2026-10-27): al ganar, la bienvenida sale sola con la factura del pago 1
// (PRUEBA-… en un proyecto de prueba; el comenzar de las pruebas va dentro de enviarBienvenida). Seguro: un lead
// del correo de prueba de Joel que no esté marcado como prueba nunca factura solo. Si no sale, queda para Joel.
const PUBLICA = 'https://joux-web.vercel.app'
async function bienvenidaSola(proyectoId: number, marca: string, lead: { id: number; email: string | null; prueba: boolean | null }): Promise<Bienvenida> {
  if (!(await pilotoActivo(marca, 'bienvenida'))) return null
  const nombre = `proyecto-${proyectoId}`
  if (esCorreoPrueba(lead.email) && !lead.prueba) {
    await notificar({ titulo: 'Bienvenida sin enviar', cuerpo: 'El lead viene de tu correo de prueba y no está marcado como prueba: no facturo solo.', url: `/leads/${lead.id}`, etiqueta: nombre }).catch(() => {})
    return { error: 'correo de prueba sin marcar' }
  }
  const r = await enviarBienvenida(proyectoId, PUBLICA, 'proyecto.bienvenida').catch(e => ({ error: String(e?.message || e), status: 500 }))
  if ('error' in r) {
    await notificar({ titulo: 'La bienvenida no salió sola', cuerpo: `${r.error}. Envíala tú desde la ficha del lead.`, url: `/leads/${lead.id}`, etiqueta: nombre }).catch(() => {})
    return { error: r.error }
  }
  return { enviada: true, factura: r.factura }
}

// Piloto automático «Ganar el lead»: el mismo formulario que vería Joel en la ficha, relleno con lo que hay (datos
// fiscales que leyó la IA, cliente existente por su NIF, precio de la última propuesta o del formulario). Si falta
// algo para ganar, no se gana y se avisa. Nunca factura: la bienvenida con la factura la envía Joel.
export async function ganarSolo(leadId: number) {
  const { data: lead } = await sb.from('leads').select('*').eq('id', leadId).maybeSingle()
  if (!lead || lead.proyecto_id || lead.estado === 'ganado') return { omitido: 'ya ganado' }
  const { data: marca } = await sb.from('marcas').select('key, nombre, modo').eq('key', lead.marca).maybeSingle()
  if (!marca) return { omitido: 'marca desconocida' }
  const nif = (lead.para_empezar as Lead['para_empezar'])?.fiscales?.datos?.nif?.trim()
  const [{ data: existente }, { data: enviados }] = await Promise.all([
    nif ? sb.from('clientes_fiscales').select('cliente, identificador, direccion, pais').ilike('identificador', nif).maybeSingle() : Promise.resolve({ data: null }),
    sb.from('mensajes').select('cuerpo, enviado_en, created_at').eq('lead_id', leadId).eq('direccion', 'saliente').eq('estado', 'enviado'),
  ])
  const propuesto = marca.modo === 'cerrado'
    ? precioPropuesto((enviados || []).map(m => ({ cuerpo: m.cuerpo, fecha: m.enviado_en || m.created_at })), lead.marca === 'arkevo' ? disenoDelLead(lead) : null)
    : null
  const form = formInicial(lead, marca, (existente as ClienteFiscal | null) || undefined, propuesto)
  const r = await ganarLead(leadId, form, 'piloto')
  const nombre = lead.empresa || lead.nombre || lead.email
  await notificar('error' in r
    ? { titulo: `Tiene todo, pero no se pudo ganar solo · ${nombre}`, cuerpo: `${r.error}. Márcalo ganado tú desde su ficha.`, url: `/leads/${leadId}`, etiqueta: `lead-${leadId}` }
    : r.bienvenida && 'enviada' in r.bienvenida
      ? { titulo: `Ganado y bienvenida enviada · ${nombre}`, cuerpo: `${r.bienvenida.factura ? `Con la factura ${r.bienvenida.factura}.` : 'Sin factura todavía (datos fiscales por formulario).'}`, url: `/proyectos/${r.proyecto_id}`, etiqueta: `lead-${leadId}` }
      : { titulo: `Ganado solo · ${nombre}`, cuerpo: r.bienvenida ? 'La bienvenida no salió sola: envíala tú.' : 'Te toca la bienvenida con la factura del pago 1.', url: `/leads/${leadId}`, etiqueta: `lead-${leadId}` }
  ).catch(e => console.error('ganar solo push', e?.message))
  return r
}
