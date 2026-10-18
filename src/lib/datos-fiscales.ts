// Datos fiscales que rellena el cliente en /datos/<token> (solo servidor). Crean (o corrigen) su ficha en
// clientes_fiscales y ponen su razón social como cliente del proyecto. Después Joel emite la factura del
// pago 1 desde la ficha del lead («Emitir y enviar»); aquí no se factura nada.
import { supabaseServer as sb } from '@/lib/supabase-server'
import { UE_ISO } from '@/lib/ganado'
import { tipoLegacy } from '@/lib/timesheets'
import { notificar } from '@/lib/push'
import { MARCAS_TREATMENT } from '@/lib/seguimiento'

export type EnvioDatos = { razon: string; nif: string; direccion: string; pais: string }   // pais: ISO o 'OTRO'

const nifNormal = (s: string | null | undefined) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const paisFiscal = (iso: string) => iso === 'ES' ? 'ES' : UE_ISO.has(iso) ? 'UE' : 'EXT'

// Lo que ve el formulario: el proyecto del enlace y, si ya los mandó, sus datos.
export async function proyectoDeToken(token: string) {
  if (!/^[\w-]{20,40}$/.test(token)) return null
  const { data: p } = await sb.from('proyectos').select('id, cliente, nombre, marca, idioma, lead_id').eq('token_fiscal', token).maybeSingle()
  if (!p) return null
  const [{ data: marca }, { data: cf }, { count }] = await Promise.all([
    sb.from('marcas').select('nombre').eq('key', p.marca ?? '').maybeSingle(),
    sb.from('clientes_fiscales').select('cliente, identificador, direccion, pais').eq('cliente', p.cliente).maybeSingle(),
    sb.from('facturas').select('id', { count: 'exact', head: true }).eq('proyecto_id', p.id),
  ])
  return { p, marca: marca?.nombre || 'Joel Schneider', datos: cf, facturado: (count || 0) > 0 }
}

export async function guardarDatosFiscales(token: string, e: EnvioDatos): Promise<{ ok: true } | { error: string; status: number }> {
  const razon = e.razon?.trim().replace(/\s+/g, ' ') || '', nif = e.nif?.trim() || '', direccion = e.direccion?.trim() || '', iso = (e.pais || '').toUpperCase()
  if (razon.length < 2 || razon.length > 200) return { error: 'razon', status: 400 }
  if (nifNormal(nif).length < 3 || nif.length > 40) return { error: 'nif', status: 400 }
  if (direccion.length < 5 || direccion.length > 500) return { error: 'direccion', status: 400 }
  if (!/^([A-Z]{2}|OTRO)$/.test(iso)) return { error: 'pais', status: 400 }

  const d = await proyectoDeToken(token)
  if (!d) return { error: 'enlace', status: 404 }
  // Con la factura ya emitida, cambiar los datos la descuadraría: se corrige por email.
  if (d.facturado) return { error: 'facturado', status: 409 }
  const { p } = d
  const fila = { cliente: razon, identificador: nif, direccion, pais: paisFiscal(iso) }

  // Otro cliente con esa razón social: si es el mismo NIF se reutiliza; si no, que lo resuelva Joel.
  if (razon !== p.cliente) {
    const { data: otro } = await sb.from('clientes_fiscales').select('identificador').eq('cliente', razon).maybeSingle()
    if (otro && nifNormal(otro.identificador) !== nifNormal(nif)) return { error: 'duplicado', status: 409 }
  }
  // La ficha que creó este mismo formulario antes (si corrige algo) se actualiza; si no, se crea.
  if (d.datos && razon !== p.cliente) await sb.from('clientes_fiscales').delete().eq('cliente', p.cliente)
  const { error } = await sb.from('clientes_fiscales').upsert(fila, { onConflict: 'cliente' })
  if (error) return { error: error.message, status: 500 }
  if (razon !== p.cliente) await sb.from('proyectos').update({ cliente: razon, tipo: tipoLegacy(razon) }).eq('id', p.id)

  await sb.from('eventos').insert({ proyecto_id: p.id, lead_id: p.lead_id, tipo: 'datos.fiscales', fuente: 'formulario', datos: { cliente: razon, antes: p.cliente !== razon ? p.cliente : null, pais: fila.pais, corrigiendo: !!d.datos } })
  await notificar({
    titulo: `${razon} ha enviado sus datos fiscales`,
    cuerpo: fila.pais === 'UE' ? 'Cliente de la UE: antes de facturar, el ROI.'
      : MARCAS_TREATMENT.includes(p.marca || '') ? 'Listos para la factura de la entrega (sale del timesheet).' : 'La factura del pago 1 está lista para revisar y enviar.',
    url: p.lead_id ? `/leads/${p.lead_id}` : '/proyectos', etiqueta: `proyecto-${p.id}`,
  }).catch(err => console.error('datos push', err?.message))
  return { ok: true }
}
