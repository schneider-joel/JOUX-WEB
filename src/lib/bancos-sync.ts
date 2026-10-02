import { supabaseServer as sb } from '@/lib/supabase-server'
import { conciliarTodo } from '@/lib/conciliar'
import { eb, idMovimiento, type CuentaEB, type MovimientoEB, type SaldoEB } from '@/lib/enablebanking'

// Orden de preferencia del saldo que actualiza la cuenta de JOUX Hub: el
// disponible primero (ITAV/CLAV), después el contable.
const PREFERENCIA = ['ITAV', 'CLAV', 'XPCD', 'ITBD', 'CLBD', 'OPBD']

export function elegirSaldo(saldos: SaldoEB[], tipo?: string | null): SaldoEB | undefined {
  if (tipo) return saldos.find(s => s.balance_type === tipo)
  return PREFERENCIA.map(t => saldos.find(s => s.balance_type === t)).find(Boolean) || saldos[0]
}

// Guarda las cuentas que devuelve una sesión nueva de Enable Banking.
export async function guardarSesion(s: { session_id: string; aspsp: { name: string; country: string }; access?: { valid_until?: string }; accounts: (CuentaEB | string)[] }) {
  await sb.from('bancos_sesiones').upsert({ session_id: s.session_id, aspsp: s.aspsp.name, pais: s.aspsp.country, valid_until: s.access?.valid_until || null })
  for (const a of s.accounts) {
    const c: CuentaEB = typeof a === 'string' ? { uid: a, ...(await eb<CuentaEB>(`/accounts/${a}/details`).catch(() => ({}))) } : a
    await sb.from('bancos_cuentas').upsert({ uid: c.uid, session_id: s.session_id, aspsp: s.aspsp.name, nombre: c.name || c.product || null, iban: c.account_id?.iban || null, moneda: c.currency || null })
  }
}

const dia = (d: Date) => d.toISOString().slice(0, 10)

// Trae saldos y movimientos de todas las cuentas con sesión vigente. Los
// bancos suelen permitir 4 lecturas al día sin el usuario delante.
export async function sincronizarBancos() {
  const ahora = new Date().toISOString()
  const { data: sesiones } = await sb.from('bancos_sesiones').select('*')
  const { data: cuentas } = await sb.from('bancos_cuentas').select('*')
  const resumen = { cuentas: 0, movimientos: 0, errores: [] as string[] }

  for (const s of sesiones || []) {
    if (s.valid_until && s.valid_until < ahora) { resumen.errores.push(`${s.aspsp}: el permiso venció, hay que renovarlo`); continue }
    let error: string | null = null
    for (const c of (cuentas || []).filter(c => c.session_id === s.session_id)) {
      try {
        const { balances } = await eb<{ balances: SaldoEB[] }>(`/accounts/${c.uid}/balances`)
        await sb.from('bancos_cuentas').update({ saldos: balances, actualizado: ahora }).eq('uid', c.uid)
        const saldo = elegirSaldo(balances, c.tipo_saldo)
        if (c.cuenta_id && saldo) await sb.from('cuentas').update({ saldo: Number(saldo.balance_amount.amount) }).eq('id', c.cuenta_id)

        // Desde el último movimiento guardado (con margen) o los últimos 90 días.
        const { data: ultimo } = await sb.from('movimientos').select('fecha').eq('cuenta_uid', c.uid).order('fecha', { ascending: false }).limit(1).maybeSingle()
        const desde = new Date(ultimo ? `${ultimo.fecha}T00:00:00Z` : Date.now() - 90 * 864e5)
        if (ultimo) desde.setUTCDate(desde.getUTCDate() - 5)
        let continuation: string | undefined
        const filas: any[] = []
        const pendientes: any[] = []
        do {
          const q = new URLSearchParams({ date_from: dia(desde) })
          if (continuation) q.set('continuation_key', continuation)
          const r = await eb<{ transactions: MovimientoEB[]; continuation_key?: string }>(`/accounts/${c.uid}/transactions?${q}`)
          for (const m of r.transactions || []) {
            const pendiente = !!m.status && m.status !== 'BOOK'
            const signo = m.credit_debit_indicator === 'DBIT' ? -1 : 1
            ;(pendiente ? pendientes : filas).push({
              // Sin referencia del banco, dos pendientes iguales se distinguen por su posición.
              id: pendiente && !(m.entry_reference || m.transaction_id) ? `${idMovimiento(c.uid, m)}:${pendientes.length}` : idMovimiento(c.uid, m), cuenta_uid: c.uid,
              fecha: m.booking_date || m.value_date || m.transaction_date,
              importe: signo * Math.abs(Number(m.transaction_amount.amount)), moneda: m.transaction_amount.currency,
              contraparte: (signo > 0 ? m.debtor?.name : m.creditor?.name) || null,
              concepto: (m.remittance_information || []).join(' ').trim() || null,
              estado: m.status || null, raw: m,
            })
          }
          continuation = r.continuation_key || undefined
        } while (continuation)
        if (filas.length) {
          // Sin factura_id en el upsert: no pisa una conciliación ya hecha.
          const { error: e } = await sb.from('movimientos').upsert(filas.filter(f => f.fecha))
          if (e) throw new Error(e.message)
        }
        // Los pendientes (pagos con tarjeta sin contabilizar) cambian de id al
        // contabilizarse: se reemplazan enteros en cada sincronización.
        // Algunos bancos siguen listando como pendiente un pago ya contabilizado:
        // se descarta si ya hay uno contabilizado igual (importe y ±3 días).
        const { data: recientes } = await sb.from('movimientos').select('fecha,importe').eq('cuenta_uid', c.uid).neq('estado', 'PDNG').gte('fecha', dia(new Date(Date.now() - 10 * 864e5)))
        const libres = [...(recientes || [])]
        const nuevos = pendientes.filter(p => {
          const i = libres.findIndex(r => Number(r.importe) === p.importe && Math.abs(new Date(r.fecha).getTime() - new Date(p.fecha).getTime()) <= 3 * 864e5)
          if (i === -1) return true
          libres.splice(i, 1)
          return false
        })
        // Se borran los pendientes que el banco ya no lista y los no tocados a
        // mano; uno clasificado a mano se conserva mientras siga pendiente
        // (p. ej. un cobro rechazado que el banco aún no ha liberado).
        const actuales = new Set(nuevos.map(p => p.id))
        const { data: viejos } = await sb.from('movimientos').select('id,manual').eq('cuenta_uid', c.uid).eq('estado', 'PDNG')
        const borrar = (viejos || []).filter(v => !v.manual || !actuales.has(v.id)).map(v => v.id)
        if (borrar.length) await sb.from('movimientos').delete().in('id', borrar)
        if (nuevos.length) {
          const { error: e } = await sb.from('movimientos').upsert(nuevos.filter(f => f.fecha).map(f => ({ ...f, estado: 'PDNG' })))
          if (e) throw new Error(e.message)
        }
        resumen.cuentas++
        resumen.movimientos += filas.length + pendientes.length
      } catch (e: any) {
        error = `${c.nombre || c.uid}: ${e.message}`
        resumen.errores.push(`${s.aspsp} · ${error}`)
      }
    }
    await sb.from('bancos_sesiones').update({ ultimo_sync: ahora, ultimo_error: error }).eq('session_id', s.session_id)
  }
  // Clasifica lo nuevo y lo cruza con facturas de venta y de compra.
  return { ...resumen, ...(await conciliarTodo()) }
}
