// Portal del cliente (2026-11-25; primer caso, Duncan Heger). El enlace del presupuesto
// (presupuesto.<dominio>/<token>) no muere al aceptar: es la página del proyecto para el cliente, del presupuesto
// al lanzamiento. Todo sale de lo que ya hay en Joux Hub (presupuesto, proyecto con su fase, facturas); lo único
// nuevo son los campos del portal en `proyectos` (review mode, web en vivo, dominio, pendientes del cliente), que
// Joel edita en la ficha del proyecto. Solo lee. Solo servidor.
//
// Etapas que ve el cliente, siempre en el mismo enlace:
//   propuesta  → presupuesto, condiciones y «Aceptar» (lo de siempre de /aceptar)
//   factura    → aceptado; Joel aún no ha emitido la factura del pago 1
//   pago       → la factura del pago 1 emitida y sin cobrar, con cómo pagarla
//   proyecto   → pago 1 cobrado: fases, pendientes, review mode y facturas
// Siempre, tras aceptar: las formas de pago, los datos de facturación y las facturas con su PDF.
//   lanzamiento→ entregado o cerrado: web en vivo, dominio y la factura final
import { supabaseServer as sb } from '@/lib/supabase-server'
import { enlaceFactura } from '@/lib/factura-enlace'
import { desglose } from '@/lib/importes'
import { esFaseProyecto, type FaseProyecto } from '@/lib/leads'
import { PORTAL_MARCAS, presupuestoDeToken } from '@/lib/presupuestos'
import type { Moneda } from '@/lib/moneda'

export type EtapaPortal = 'propuesta' | 'factura' | 'pago' | 'proyecto' | 'lanzamiento'
export type Pendiente = { texto: string; hecho: boolean }
export type ClientePortal = { nombre: string; identificador: string | null; direccion: string | null }
export type FacturaPortal = { id: number; numero: string; pago: number | null; fecha: string; vence: string | null; total: number; moneda: Moneda; cobrada: boolean; url: string; prueba: boolean }
export type ProyectoPortal = {
  fase: FaseProyecto | null; url_revision: string | null; url_live: string | null
  dominio: string | null; dominio_estado: 'pendiente' | 'conectado' | null; pendientes: Pendiente[]
}

// Los cinco pasos que ve el cliente y en cuál está cada fase del hub (las 7 fases plegadas).
export const PASOS_PORTAL = ['kickoff', 'material', 'build', 'review', 'launch'] as const
export function pasoDeFase(fase: FaseProyecto | null, etapa: EtapaPortal): number {
  if (etapa === 'factura' || etapa === 'pago' || !fase) return 0
  return ({ confirmado: 0, material: 1, comenzado: 2, revision: 3, cambios: 3, entregado: 4, cerrado: 5 } as Record<FaseProyecto, number>)[fase]
}

// La lista de pendientes tal como se guarda (jsonb): se limpia por si acaso, el cliente la ve tal cual.
export const limpiarPendientes = (x: unknown): Pendiente[] => (Array.isArray(x) ? x : [])
  .filter(i => i && typeof i.texto === 'string' && i.texto.trim())
  .slice(0, 30).map(i => ({ texto: String(i.texto).trim().slice(0, 300), hecho: i.hecho === true }))

const url = (u: string | null | undefined) => u && /^https?:\/\//.test(u) ? u : u ? `https://${u}` : null

// Cómo se paga: las instrucciones de la moneda (configuracion.pago_instrucciones_<MONEDA>, texto libre que Joel
// escribe: Wise, PayPal…). En EUR, si no hay, la transferencia al IBAN de las facturas.
export async function instruccionesPago(moneda: Moneda): Promise<string | null> {
  const { data } = await sb.from('configuracion').select('clave, valor').in('clave', [`pago_instrucciones_${moneda}`, 'emisor_iban', 'emisor_swift', 'emisor_nombre'])
  const v = (k: string) => data?.find(c => c.clave === k)?.valor?.trim() || ''
  if (v(`pago_instrucciones_${moneda}`)) return v(`pago_instrucciones_${moneda}`)
  if (moneda === 'EUR' && v('emisor_iban')) return `Transferencia bancaria / Bank transfer\n${v('emisor_nombre')}\nIBAN ${v('emisor_iban')}${v('emisor_swift') ? `\nSWIFT/BIC ${v('emisor_swift')}` : ''}`
  return null
}

export async function portalDeToken(token: string) {
  const d = await presupuestoDeToken(token)
  if (!d) return null
  const base = { ...d, etapa: 'propuesta' as EtapaPortal, proyecto: null as ProyectoPortal | null, facturas: [] as FacturaPortal[], pago: null as string | null, cliente: null as ClientePortal | null }
  if (d.p.estado !== 'aceptado' || !PORTAL_MARCAS.includes(d.p.marca) || !d.p.proyecto_id) {
    const aceptado = d.p.estado === 'aceptado' && PORTAL_MARCAS.includes(d.p.marca)
    return { ...base, etapa: (aceptado ? 'factura' : 'propuesta') as EtapaPortal, pago: aceptado ? await instruccionesPago(d.p.moneda || 'EUR') : null }
  }
  const [{ data: pr }, { data: fs }, pago] = await Promise.all([
    sb.from('proyectos').select('*').eq('id', d.p.proyecto_id).maybeSingle(),
    sb.from('facturas').select('*').eq('proyecto_id', d.p.proyecto_id).order('fecha'),
    instruccionesPago(d.p.moneda || 'EUR'),
  ])
  if (!pr) return { ...base, etapa: 'factura' as EtapaPortal, pago }
  const proyecto: ProyectoPortal = {
    fase: esFaseProyecto(pr.fase) ? pr.fase : null, url_revision: url(pr.url_revision), url_live: url(pr.url_live),
    dominio: pr.dominio || null, dominio_estado: pr.dominio_estado === 'conectado' || pr.dominio_estado === 'pendiente' ? pr.dominio_estado : null,
    pendientes: limpiarPendientes(pr.pendientes_cliente),
  }
  // Las facturas del proyecto que de verdad se emiten (las de prueba, en un proyecto de prueba, también).
  const facturas: FacturaPortal[] = (fs || []).filter(f => f.fiscal !== false || pr.prueba).map(f => {
    const usd = f.moneda && f.moneda !== 'EUR'
    return {
      id: f.id, numero: f.numero, pago: f.pago ?? null, fecha: f.fecha, vence: f.fecha_vencimiento || null,
      total: usd ? Number(f.importe_moneda) : desglose(Number(f.importe), f.tipo_factura === 'dentro_ue')?.total ?? Number(f.importe),
      moneda: (usd ? f.moneda : 'EUR') as Moneda, cobrada: f.estado === 'cobrada', url: enlaceFactura(f.id), prueba: f.fiscal === false,
    }
  })
  const pago1 = facturas.find(f => f.pago === 1)
  const etapa: EtapaPortal = !pago1 ? 'factura' : !pago1.cobrada ? 'pago'
    : proyecto.fase === 'entregado' || proyecto.fase === 'cerrado' ? 'lanzamiento' : 'proyecto'
  // Los datos de facturación, tal como salen en sus facturas (el cliente los ve; si están mal, escribe a Joel).
  const { data: cf } = await sb.from('clientes_fiscales').select('cliente, identificador, direccion').eq('cliente', pr.cliente).maybeSingle()
  const cliente: ClientePortal | null = cf ? { nombre: cf.cliente, identificador: cf.identificador || null, direccion: cf.direccion || null } : null
  return { ...base, etapa, proyecto, facturas, pago, cliente }
}
export type Portal = NonNullable<Awaited<ReturnType<typeof portalDeToken>>>
