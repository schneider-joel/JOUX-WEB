// Agente de primera versión (webs Arkevo): al pasar una web a «En curso» se crea `web.encargo`; el agente
// (/primera-version, en `01 Agencias web/arkevo/`) la monta, la publica en una vista previa solo para Joel
// y avisa con web.empezada / web.lista / web.error. No toca la fase ni prepara emails: la ronda R1 para el
// cliente la abre Joel con arkevo-revision. Solo servidor. Contrato en automatizacion.md.
import { supabaseServer as sb } from '@/lib/supabase-server'
import type { AgenteWeb } from '@/lib/seguimiento'

// Marcas con colección de diseños (Custom no tiene catálogo: esas webs se hacen a mano).
export const MARCAS_AGENTE = ['arkevo']
export const TIPOS_AGENTE = ['web.encargo', 'web.empezada', 'web.lista', 'web.error'] as const
// Una pasada de la tarea que empezó y no terminó (Mac dormido, error) deja de bloquear pasado este tiempo.
export const HORAS_EMPEZADA = 3

type EventoAgente = { tipo: string; datos: Record<string, unknown> | null; created_at: string }

const texto = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null
const frases = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

// Estado del encargo a partir de los eventos del proyecto (en cualquier orden).
export function estadoAgente(eventos: EventoAgente[]): AgenteWeb | null {
  const orden = [...eventos].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const ultimo = (tipo: string) => orden.filter(e => e.tipo === tipo).pop()
  const lista = ultimo('web.lista')
  if (lista) {
    const d = lista.datos || {}
    return { estado: 'lista', fecha: lista.created_at, url: texto(d.url), notas: frases(d.notas), diseno: texto(d.diseno) }
  }
  const encargo = ultimo('web.encargo')
  if (!encargo) return null
  const nota = texto(encargo.datos?.nota)
  const error = ultimo('web.error')
  if (error && error.created_at > encargo.created_at) return { estado: 'error', fecha: error.created_at, motivo: texto(error.datos?.motivo) || 'Sin motivo', nota }
  const empezada = ultimo('web.empezada')
  if (empezada && empezada.created_at > encargo.created_at) return { estado: 'montandose', fecha: empezada.created_at, nota }
  return { estado: 'encargada', fecha: encargo.created_at, nota }
}

// Para el agente: encargada, o «montándose» desde hace más de HORAS_EMPEZADA (la pasada anterior se cortó).
export const pendienteParaAgente = (a: AgenteWeb | null) =>
  !!a && (a.estado === 'encargada' || (a.estado === 'montandose' && Date.now() - new Date(a.fecha).getTime() > HORAS_EMPEZADA * 3600_000))

// Estado del agente de varios proyectos de una vez.
export async function estadosAgente(ids: number[]) {
  const mapa = new Map<number, AgenteWeb>()
  if (!ids.length) return mapa
  const { data } = await sb.from('eventos').select('proyecto_id, tipo, datos, created_at').in('proyecto_id', ids).in('tipo', TIPOS_AGENTE as unknown as string[])
  for (const id of ids) {
    const a = estadoAgente((data || []).filter(e => e.proyecto_id === id) as EventoAgente[])
    if (a) mapa.set(id, a)
  }
  return mapa
}

// Proyectos que el agente tiene que montar o tiene a medias (para copiar su material de Drive).
export async function proyectosConEncargo() {
  const { data } = await sb.from('eventos').select('proyecto_id').eq('tipo', 'web.encargo').not('proyecto_id', 'is', null)
  const ids = Array.from(new Set((data || []).map(e => e.proyecto_id as number)))
  const estados = await estadosAgente(ids)
  return ids.filter(id => { const a = estados.get(id); return a && (a.estado === 'encargada' || a.estado === 'montandose') })
}

// Crea el encargo si la web es de una marca con agente, aún no tiene primera versión y no hay otro en marcha.
// Lo llaman el cambio a «En curso» y «Reintentar» / «Encargar al agente» de /proyectos.
export async function encargarWeb(proyectoId: number, nota: string | null, fuente = 'joux-hub'): Promise<{ ok: true } | { omitido: string }> {
  const { data: p } = await sb.from('proyectos').select('id, marca, lead_id').eq('id', proyectoId).maybeSingle()
  if (!p) return { omitido: 'No existe el proyecto' }
  if (!MARCAS_AGENTE.includes(p.marca || '')) return { omitido: 'Esta marca no tiene agente de primera versión' }
  const actual = (await estadosAgente([p.id])).get(p.id) || null
  if (actual?.estado === 'lista') return { omitido: 'La primera versión ya está hecha' }
  if (actual?.estado === 'encargada' || actual?.estado === 'montandose') return { omitido: 'Ya hay un encargo en marcha' }
  const { error } = await sb.from('eventos').insert({ proyecto_id: p.id, lead_id: p.lead_id, tipo: 'web.encargo', fuente, datos: nota ? { nota: nota.slice(0, 1000) } : {} })
  if (error) throw new Error(error.message)
  return { ok: true }
}

// Proyecto de una petición del agente: existe y es de una marca con agente.
type ProyectoAgente = { id: number; cliente: string; nombre: string; marca: string | null; lead_id: number | null; ref_entrega: string | null }
export async function proyectoAgente(id: number): Promise<{ error: string; status: number } | { p: ProyectoAgente; estado: AgenteWeb | null }> {
  const { data: p } = await sb.from('proyectos').select('id, cliente, nombre, marca, lead_id, ref_entrega').eq('id', id).maybeSingle()
  if (!p) return { error: 'proyecto_desconocido', status: 404 }
  if (!MARCAS_AGENTE.includes(p.marca || '')) return { error: 'marca_sin_agente', status: 400 }
  const estado = (await estadosAgente([p.id])).get(p.id) || null
  return { p, estado }
}
