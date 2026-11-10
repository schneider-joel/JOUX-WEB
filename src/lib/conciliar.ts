import { supabaseServer as sb } from '@/lib/supabase-server'
import { clasificar, comercio, palabrasClave, textoDe, type Regla } from '@/lib/movimientos'
import { sincronizarCompartidos } from '@/lib/compartidos-server'
import { notificar } from '@/lib/push'
import { traspasosDeHoy } from '@/lib/que-mover-server'

const IVA = 0.21
const RETENCION = 0.15
const DIA = 864e5

// Lo que el cliente paga realmente por una factura (con IVA y retención si es de España).
export const totalACobrar = (f: { importe: number; tipo_factura?: string | null }) =>
  Math.round(Number(f.importe) * (f.tipo_factura === 'dentro_ue' ? 1 + IVA - RETENCION : 1) * 100) / 100

// 1. Clase, categoría y si es gasto de trabajo, para los movimientos que el
// usuario no clasificó a mano.
export async function clasificarMovimientos() {
  const [{ data: reglas }, { data: movs }] = await Promise.all([
    sb.from('reglas_movimientos').select('*').order('id', { ascending: false }),
    sb.from('movimientos').select('id,importe,contraparte,concepto,clase,categoria,trabajo,compra_id').eq('manual', false),
  ])
  const grupos = new Map<string, { patch: any; ids: string[] }>()
  for (const m of movs || []) {
    if (m.clase === 'cobro') continue // ya conciliado con facturas
    const c = clasificar(m, (reglas || []) as Regla[])
    const trabajo = c.trabajo || !!m.compra_id
    if (c.clase === m.clase && c.categoria === m.categoria && trabajo === m.trabajo) continue
    const clave = JSON.stringify([c.clase, c.categoria, trabajo])
    const g = grupos.get(clave) || { patch: { clase: c.clase, categoria: c.categoria, trabajo }, ids: [] }
    g.ids.push(m.id)
    grupos.set(clave, g)
  }
  for (const { patch, ids } of Array.from(grupos.values())) {
    for (let i = 0; i < ids.length; i += 200) await sb.from('movimientos').update(patch).in('id', ids.slice(i, i + 200))
  }
  return Array.from(grupos.values()).reduce((s, g) => s + g.ids.length, 0)
}

// Referencias que el cliente escribe en el concepto ("274 to 277", "268 269",
// "to 277" cuando el banco corta el principio). `hasta` = el final de un "to N".
export function referenciasDe(concepto: string | null | undefined) {
  const t = (concepto || '').toLowerCase()
  const nums = new Set<string>()
  let hasta: number | null = null
  let desde: number | null = null
  const rango = t.match(/(?:\b(\d{2,5})\s*)?(?:\b(?:to|al|hasta)\b|(?<=\d\s*)-)\s*(\d{2,5})\b/)
  if (rango) {
    hasta = Number(rango[2])
    if (rango[1]) desde = Number(rango[1])
  }
  for (const n of t.match(/\b\d{2,5}\b/g) || []) nums.add(String(Number(n)))
  return { nums, desde, hasta }
}

type Candidata = { total: number; estado?: string | null; numero_referencia?: string | null }

// Entre las combinaciones que suman exactamente el importe, la que mejor encaja
// con las referencias del concepto. Sin referencias, la de siempre: las más
// antiguas primero y con menos facturas. A igualdad, mejor pendientes que ya
// marcadas como cobradas (dos combinaciones pueden sumar lo mismo: 836 = 660 + 176).
export function combinacion<T extends Candidata>(candidatas: T[], objetivo: number, concepto?: string | null): T[] | null {
  const n = Math.min(candidatas.length, 14)
  const exactas: number[][] = []
  const probar = (desde: number, elegidas: number[], suma: number) => {
    if (exactas.length >= 2000) return
    if (Math.abs(suma - objetivo) < 0.015 && elegidas.length) { exactas.push([...elegidas]); return }
    if (suma > objetivo + 0.015 || elegidas.length >= 7) return
    for (let i = desde; i < n; i++) probar(i + 1, [...elegidas, i], suma + candidatas[i].total)
  }
  probar(0, [], 0)
  if (!exactas.length) return null

  const ref = referenciasDe(concepto)
  const refNum = (i: number) => {
    const r = Number(candidatas[i].numero_referencia)
    return Number.isFinite(r) && r > 0 ? r : null
  }
  const todasRefs = Array.from(new Set(candidatas.slice(0, n).map((_, i) => refNum(i)).filter((r): r is number => r !== null)))
  const puntos = (x: number[]) => {
    const refs = x.map(refNum)
    const nombradas = refs.filter(r => r !== null && ref.nums.has(String(r))).length
    const conocidas = refs.filter((r): r is number => r !== null)
    const max = conocidas.length ? Math.max(...conocidas) : null
    const min = conocidas.length ? Math.min(...conocidas) : null
    // "to N": la última factura es la N y no hay ninguna por encima.
    const cierra = ref.hasta !== null && max === ref.hasta ? 1 : 0
    const empieza = ref.desde !== null && min === ref.desde ? 1 : 0
    const fuera = ref.hasta !== null ? conocidas.filter(r => r > ref.hasta! || (ref.desde !== null && r < ref.desde)).length : 0
    // Seguidas: no se salta ninguna referencia disponible entre la primera y la última.
    const seguidas = conocidas.length === x.length && min !== null && max !== null
      && todasRefs.filter(r => r >= min && r <= max).length === new Set(conocidas).size ? 1 : 0
    const yaCobradas = x.filter(i => candidatas[i].estado && candidatas[i].estado !== 'pendiente').length
    return [nombradas + cierra + empieza - fuera, ref.nums.size ? seguidas : 0, -yaCobradas, -x[x.length - 1], -x.length]
  }
  let mejor = exactas[0], pm = puntos(mejor)
  for (const x of exactas.slice(1)) {
    const px = puntos(x)
    for (let k = 0; k < px.length; k++) {
      if (px[k] === pm[k]) continue
      if (px[k] > pm[k]) { mejor = x; pm = px }
      break
    }
  }
  return mejor.map(i => candidatas[i])
}

// 2. Cada ingreso de un cliente marca como cobradas las facturas que paga
// (Ambushed suele pagar varias juntas). También enlaza cobros antiguos con
// facturas ya marcadas como cobradas a mano, corrigiendo su fecha de cobro.
export async function conciliarCobros() {
  const [{ data: movs }, { data: facturas }, { data: clientes }, { data: cuentasBanco }, { data: enlazadas }] = await Promise.all([
    sb.from('movimientos').select('id,cuenta_uid,fecha,importe,contraparte,concepto,clase').gt('importe', 0).or('estado.is.null,estado.neq.PDNG').order('fecha'),
    sb.from('facturas').select('id,numero,numero_referencia,cliente,fecha,importe,tipo_factura,estado,fiscal,origen,movimiento_id').is('movimiento_id', null).order('fecha'),
    sb.from('clientes_fiscales').select('cliente,identificador'),
    sb.from('bancos_cuentas').select('uid,cuenta_id'),
    sb.from('facturas').select('movimiento_id').not('movimiento_id', 'is', null),
  ])
  const yaUsados = new Set((enlazadas || []).map(f => f.movimiento_id))
  // Las ya cobradas solo entran si son lo bastante recientes como para que su
  // pago esté dentro de los movimientos que tenemos del banco.
  const primerMov = movs?.[0]?.fecha
  const limiteCobradas = primerMov ? new Date(new Date(primerMov).getTime() - 40 * DIA).toISOString().slice(0, 10) : '9999'
  const disponibles = (facturas || []).filter(f => f.fiscal !== false && f.origen !== 'regularizacion' && (f.estado === 'pendiente' || f.fecha >= limiteCobradas))
  const claves = new Map<string, string[]>()
  for (const f of disponibles) {
    if (!claves.has(f.cliente)) {
      const ident = (clientes || []).find(c => c.cliente === f.cliente)?.identificador?.split('·')[0]
      claves.set(f.cliente, palabrasClave([f.cliente, ident]))
    }
  }
  const usadas = new Set<number>()
  const avisos: { cliente: string; numeros: string[]; importe: number }[] = []
  const hace10dias = new Date(Date.now() - 10 * DIA).toISOString().slice(0, 10)
  let cobros = 0
  for (const m of movs || []) {
    if (yaUsados.has(m.id) || m.clase === 'interno' || m.clase === 'personal' || m.clase === 'reembolso') continue
    const texto = textoDe(m)
    const desde = new Date(new Date(m.fecha).getTime() - 150 * DIA).toISOString().slice(0, 10)
    const candidatas = disponibles
      .filter(f => !usadas.has(f.id) && f.fecha <= m.fecha && f.fecha >= desde && (claves.get(f.cliente) || []).some(k => texto.includes(k)))
      .map(f => ({ ...f, total: totalACobrar(f) }))
    const elegidas = combinacion(candidatas, Number(m.importe), m.concepto)
    if (!elegidas) continue
    const cuenta = (cuentasBanco || []).find(c => c.uid === m.cuenta_uid)?.cuenta_id ?? null
    await sb.from('facturas').update({ estado: 'cobrada', fecha_cobro: m.fecha, movimiento_id: m.id, ...(cuenta ? { cuenta_destino_id: cuenta } : {}) }).in('id', elegidas.map(f => f.id))
    await sb.from('movimientos').update({ clase: 'cobro', categoria: null }).eq('id', m.id)
    elegidas.forEach(f => usadas.add(f.id))
    // Solo avisa de cobros nuevos (no de facturas antiguas ya cobradas a mano).
    if (m.fecha >= hace10dias && elegidas.some(f => f.estado === 'pendiente')) {
      avisos.push({ cliente: elegidas[0].cliente, numeros: elegidas.map(f => f.numero).filter(Boolean), importe: Number(m.importe) })
    }
    cobros++
  }
  const eur = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)
  // Con el cobro, qué mover ahora (hucha de impuestos y ahorros), como en Hoy.
  const mover = avisos.length ? await traspasosDeHoy().catch(() => []) : []
  const reparto = mover.filter(t => t.clave === 'imp' || t.clave === 'aho').map(t => t.texto).join(' · ')
  for (const a of avisos) {
    await notificar({
      titulo: `Cobro recibido · ${a.cliente}`,
      cuerpo: `${eur(a.importe)} → ${a.numeros.length > 1 ? `facturas ${a.numeros.join(', ')}` : `factura ${a.numeros[0] || ''}`}${reparto ? `\n${reparto}` : ''}`,
      url: reparto ? '/' : '/?tab=facturas',
    }).catch(() => {})
  }
  return cobros
}

// 3. Enlaza cada cargo con su factura de Compras (mismo proveedor, ±10 días,
// importe parecido). Los gastos de trabajo que queden sin enlazar son los
// que avisan de "falta la factura".
export async function conciliarCompras() {
  const [{ data: movs }, { data: compras }, { data: enlazadas }] = await Promise.all([
    sb.from('movimientos').select('id,fecha,importe,contraparte,concepto').lt('importe', 0).is('compra_id', null).or('clase.is.null,clase.neq.interno'),
    sb.from('compras').select('id,fecha,proveedor,base,iva_pct'),
    sb.from('movimientos').select('compra_id').not('compra_id', 'is', null),
  ])
  const usadas = new Set((enlazadas || []).map(m => m.compra_id))
  let n = 0
  for (const m of movs || []) {
    const texto = `${textoDe(m)} ${comercio(m).toLowerCase()}`
    const t = new Date(m.fecha).getTime()
    const importe = Math.abs(Number(m.importe))
    const compra = (compras || []).find(c => {
      if (usadas.has(c.id)) return false
      if (Math.abs(new Date(c.fecha).getTime() - t) > 10 * DIA) return false
      const total = Number(c.base) * (1 + Number(c.iva_pct) / 100)
      if (Math.abs(total - importe) > Math.max(1, total * 0.06)) return false
      return palabrasClave([c.proveedor], 3).some(k => texto.includes(k))
    })
    if (!compra) continue
    await sb.from('movimientos').update({ compra_id: compra.id, trabajo: true }).eq('id', m.id)
    usadas.add(compra.id)
    n++
  }
  return n
}

export async function conciliarTodo() {
  const clasificados = await clasificarMovimientos()
  const compras = await conciliarCompras()
  const cobros = await conciliarCobros()
  const compartidos = await sincronizarCompartidos()
  return { clasificados, cobros, compras, compartidos }
}
