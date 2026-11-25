// Facturas de los pagos de una web de precio cerrado (solo servidor). Envuelve crear_factura_pago() para las dos
// cosas que la base no puede hacer sola:
// - Proyecto en otra moneda (USD): la base de la factura (`importe`) se guarda en EUR al cambio del BCE del día de
//   emisión, porque impuestos, gráficas y reparto van en EUR; lo que ve el cliente queda en `importe_moneda`.
//   El cambio se pide ANTES de crear la factura: si el BCE no responde, no se crea nada.
// - Factura en inglés: el concepto en inglés («Website · 50% to start»), no el de la base en español.
import { supabaseServer as sb } from '@/lib/supabase-server'
import { esMoneda } from '@/lib/moneda'

type FilaFactura = { id: number; numero: string; importe: number; tipo_factura: string; idioma: string | null; descripcion: string | null; fecha: string; [k: string]: unknown }

// USD por 1 EUR, el último cambio de referencia del BCE publicado hasta esa fecha.
export async function cambioBCE(moneda: string, fecha: string): Promise<{ valor: number; fecha: string }> {
  const url = `https://data-api.ecb.europa.eu/service/data/EXR/D.${moneda}.EUR.SP00.A?endPeriod=${fecha}&lastNObservations=1&format=csvdata`
  const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
  if (!r.ok) throw new Error(`El BCE no da el cambio (${r.status})`)
  const [cab, fila] = (await r.text()).trim().split('\n')
  const cols = cab.split(','), vals = fila?.split(',') || []
  const valor = Number(vals[cols.indexOf('OBS_VALUE')]), dia = vals[cols.indexOf('TIME_PERIOD')]
  if (!(valor > 0) || !dia) throw new Error('El BCE no da el cambio')
  return { valor, fecha: dia }
}

const conceptoEn = (pago: number, plan: string | null, web: string | null) =>
  ['Website', plan ? `· ${plan}` : '', web ? `(${web})` : '', `· ${pago === 1 ? '50% to start' : '50% at launch'}`].filter(Boolean).join(' ')

export async function crearFacturaPago(proyecto: number, pago: 1 | 2): Promise<{ data: FilaFactura; error: null } | { data: null; error: { message: string } }> {
  const { data: pr } = await sb.from('proyectos').select('id, moneda, plan, web, prueba').eq('id', proyecto).maybeSingle()
  const moneda = esMoneda(pr?.moneda) ? pr!.moneda : 'EUR'
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
  let cambio: { valor: number; fecha: string } | null = null
  if (moneda !== 'EUR') {
    try { cambio = await cambioBCE(moneda, hoy) } catch (e) { return { data: null, error: { message: `${(e as Error).message}: inténtalo en un rato` } } }
  }

  const { data, error } = await sb.rpc('crear_factura_pago', { p_proyecto: proyecto, p_pago: pago })
  if (error || !data) return { data: null, error: { message: error?.message || 'No se pudo crear la factura' } }
  const f = data as FilaFactura

  const cambios: Record<string, unknown> = {}
  if (f.idioma === 'en') cambios.descripcion = [pr?.prueba ? 'TEST · not a valid invoice' : null, conceptoEn(pago, pr?.plan ?? null, pr?.web ?? null)].filter(Boolean).join(' · ')
  if (cambio) {
    const enMoneda = Number(f.importe)
    Object.assign(cambios, { moneda, importe_moneda: enMoneda, tipo_cambio: cambio.valor, importe: Math.round(enMoneda / cambio.valor * 100) / 100 })
  }
  if (!Object.keys(cambios).length) return { data: f, error: null }
  const { data: hecha, error: e2 } = await sb.from('facturas').update(cambios).eq('id', f.id).select('*').single()
  // La factura ya existe: si falla el ajuste, mejor que Joel lo vea que dejar la base en USD como si fueran EUR.
  if (e2 || !hecha) return { data: null, error: { message: `Factura ${f.numero} creada pero sin convertir a EUR: ${e2?.message}. Revísala antes de enviarla.` } }
  return { data: hecha as FilaFactura, error: null }
}
