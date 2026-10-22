import { supabaseServer as sb } from '@/lib/supabase-server'
import { configCompartidos } from '@/lib/compartidos-server'
import { gastadoPorPartida } from '@/lib/presupuesto'
import type { Reales } from '@/lib/impuestos'
import { impuestosPorApartar, queMover, type Traspaso } from '@/lib/que-mover'

// «Qué mover» en el servidor, con los mismos datos que usa Hoy: para que el
// aviso de un cobro diga ya cuánto pasar a la hucha y a ahorros.
export async function traspasosDeHoy(): Promise<Traspaso[]> {
  const hoy = new Date().toISOString().slice(0, 10)
  // Movimientos desde el inicio del trimestre anterior: el gasto del mes y el cargo de Hacienda.
  const desde = new Date(Date.now() - 200 * 864e5).toISOString().slice(0, 10)
  const cfgC = await configCompartidos()
  const [cuentas, fijos, variables, movs, facturas, compras, config, compartidos] = await Promise.all([
    sb.from('cuentas').select('*'),
    sb.from('presupuesto_fijos').select('*'),
    sb.from('presupuesto_variables').select('*'),
    sb.from('movimientos').select('fecha,importe,categoria,clase,trabajo').gte('fecha', desde),
    sb.from('facturas').select('*').or('fiscal.is.null,fiscal.eq.true'),
    sb.from('compras').select('*'),
    sb.from('configuracion').select('clave,valor').or('clave.eq.cuota_autonomo_mensual,clave.like.impuesto_real_%'),
    sb.from('gastos_compartidos').select('*').eq('anulado', false).gte('fecha', cfgC.desde),
  ])
  const reales: Reales = {}
  for (const x of config.data || []) {
    const m = x.clave.match(/^impuesto_real_(\d{4})_(\d)$/)
    if (m) try { reales[`${m[1]}-${m[2]}`] = JSON.parse(x.valor) } catch {}
  }
  const cuota = Number((config.data || []).find(x => x.clave === 'cuota_autonomo_mensual')?.valor || 0)
  const variablesItems = variables.data || []
  const gastado = gastadoPorPartida(movs.data || [], new Set(variablesItems.map(v => v.nombre)), hoy.slice(0, 7), compartidos.data || null)
  const quedan = (items: { nombre: string; limite: number }[]) => items.reduce((t, i) => t + Math.max(0, Number(i.limite) - (gastado[i.nombre] || 0)), 0)
  return queMover({
    cuentas: cuentas.data || [],
    fijosPendientes: quedan(fijos.data || []),
    variablesPendientes: quedan(variablesItems),
    impuestos: impuestosPorApartar(facturas.data || [], compras.data || [], cuota, reales, movs.data || [], hoy),
  })
}
