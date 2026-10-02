import { cookies } from 'next/headers'
import { supabaseServer as sb } from '@/lib/supabase-server'
import type { Persona } from '@/lib/compartidos'

export async function configCompartidos() {
  const { data } = await sb.from('configuracion').select('clave,valor').like('clave', 'compartidos_%')
  const v = (k: string): string => data?.find(c => c.clave === `compartidos_${k}`)?.valor || ''
  return { token: v('token'), pareja: v('pareja') || 'Pareja', desde: v('desde') || '2026-10-01', categorias: v('categorias').split(',').map(s => s.trim()).filter(Boolean) }
}

// La pareja entra con el token de su link; Joel con el cookie del hub. El
// token manda: abrir el link de ella muestra siempre su vista.
export async function quienEs(token?: string | null): Promise<Persona | null> {
  if (token) {
    const cfg = await configCompartidos()
    return cfg.token && token === cfg.token ? 'pareja' : null
  }
  const c = cookies().get('joux_auth')?.value
  return c && process.env.APP_PASSWORD && c === process.env.APP_PASSWORD ? 'joel' : null
}

// Añade solos a la cuenta compartida los pagos de Joel de las categorías
// compartidas (alquiler, agua) y registra como liquidación lo que la pareja
// le transfiere (movimientos de clase 'reembolso'). Solo desde la fecha de
// arranque; un gasto anulado no se vuelve a crear.
export async function sincronizarCompartidos() {
  const cfg = await configCompartidos()
  const [{ data: movs }, { data: ya }] = await Promise.all([
    sb.from('movimientos').select('id,fecha,importe,contraparte,concepto,clase,categoria,estado').gte('fecha', cfg.desde).or('estado.is.null,estado.neq.PDNG'),
    sb.from('gastos_compartidos').select('id,tipo,fecha,importe,pagador,movimiento_id'),
  ])
  const usados = new Set((ya || []).map(g => g.movimiento_id).filter(Boolean))
  // Apuntados a mano antes de que el banco lo mostrara (p. ej. "Saldar cuenta"):
  // se enlazan con el movimiento en vez de duplicarse.
  const manuales = (ya || []).filter(g => !g.movimiento_id)
  const nuevos: any[] = []
  for (const m of movs || []) {
    if (usados.has(m.id)) continue
    const importe = Math.abs(Number(m.importe))
    const tipo = Number(m.importe) > 0 ? 'liquidacion' : 'gasto'
    const gemelo = manuales.find(g => g.tipo === tipo && Number(g.importe) === importe && g.pagador === (tipo === 'liquidacion' ? 'pareja' : 'joel') && Math.abs(new Date(g.fecha).getTime() - new Date(m.fecha).getTime()) <= 7 * 864e5)
    if (gemelo && (m.clase === 'reembolso' || (m.clase === 'gasto' && m.categoria && cfg.categorias.includes(m.categoria)))) {
      await sb.from('gastos_compartidos').update({ movimiento_id: m.id }).eq('id', gemelo.id)
      manuales.splice(manuales.indexOf(gemelo), 1)
      continue
    }
    if (Number(m.importe) < 0 && m.clase === 'gasto' && m.categoria && cfg.categorias.includes(m.categoria)) {
      nuevos.push({ tipo: 'gasto', fecha: m.fecha, concepto: m.categoria, importe, pagador: 'joel', reparto: 'mitad', categoria: m.categoria, movimiento_id: m.id, creado_por: 'joel' })
    } else if (Number(m.importe) > 0 && m.clase === 'reembolso') {
      nuevos.push({ tipo: 'liquidacion', fecha: m.fecha, concepto: `Transferencia de ${cfg.pareja}`, importe, pagador: 'pareja', reparto: 'mitad', movimiento_id: m.id, creado_por: 'joel' })
    }
  }
  if (nuevos.length) await sb.from('gastos_compartidos').insert(nuevos)
  return nuevos.length
}
