// Encargos a los agentes. Al pulsar «Comenzar» en /proyectos (Joel, al ver cobrado el pago 1) se crea
// `web.encargo` con su `tipo`:
//   - diseno: web de Arkevo sobre un diseño de la colección → /primera-version (`01 Agencias web/arkevo/`).
//   - custom: web de Arkevo con plan Esencial, Estudio o Signature → /web-custom (aún no existe). Necesita el
//     brief de dirección de Joel (`proyectos.brief`): sin él no hay encargo («esperando brief»).
//   - treatment: The Pitch Lab → agente de Pitchview (aún no existe).
//   - carta: Cartela → /montar-carta (`01 Agencias web/cartela/`): monta la carta del local con su web, su
//     Instagram y lo que mandó el cliente; en web-lista manda la URL, el QR y cuántos platos tiene.
// Custom Websites no tiene agente: «Comenzar» solo cambia la etapa.
// El agente avisa con web.empezada / web.lista / web.error. No toca la fase ni prepara emails.
// Pasadas: si en un diseño llega material nuevo («Ya está todo» o archivos en Drive), se crea otro encargo
// (`pasada` + 1) y el agente lo vuelve a montar. Solo servidor. Contrato en automatizacion.md.
import { supabaseServer as sb } from '@/lib/supabase-server'
import { faltaBrief, planCustom, type AgenteWeb, type Brief, type TipoEncargo } from '@/lib/seguimiento'
import { disenoDelLead, disenoValido } from '@/lib/prueba-gratis'

export const TIPOS_ENCARGO: TipoEncargo[] = ['diseno', 'custom', 'treatment', 'carta']
// Marcas con agente (para validar las peticiones del agente).
export const MARCAS_AGENTE = ['arkevo', 'pitchlab', 'cartela']
export const TIPOS_AGENTE = ['web.encargo', 'web.empezada', 'web.lista', 'web.error'] as const
// Una pasada de la tarea que empezó y no terminó (Mac dormido, error) deja de bloquear pasado este tiempo.
export const HORAS_EMPEZADA = 3

type EventoAgente = { tipo: string; datos: Record<string, unknown> | null; created_at: string }

const texto = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null
const frases = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
const pasadaDe = (d: Record<string, unknown> | null | undefined) => Math.max(1, Number(d?.pasada) || 1)
// Los encargos de antes de los tipos (17-10) eran todos de diseño.
const tipoDe = (d: Record<string, unknown> | null | undefined): TipoEncargo => TIPOS_ENCARGO.includes(d?.tipo as TipoEncargo) ? d!.tipo as TipoEncargo : 'diseno'

// Qué agente le toca a un proyecto. null = sin agente (Custom Websites: lo hace Joel).
export function tipoEncargo(p: { marca: string | null; plan: string | null }, lead?: { interes?: Record<string, unknown> | null; campos?: Record<string, unknown> | null } | null): TipoEncargo | null {
  if (p.marca === 'pitchlab') return 'treatment'
  if (p.marca === 'cartela') return 'carta'
  if (p.marca !== 'arkevo') return null
  if (disenoValido(p.plan)) return 'diseno'
  if (planCustom(p.plan)) return 'custom'
  // Sin plan reconocible, manda el diseño que eligió en el lead; si no eligió ninguno, es custom.
  return lead && disenoDelLead(lead) ? 'diseno' : 'custom'
}

// Estado del encargo a partir de los eventos del proyecto (en cualquier orden). Manda el último encargo:
// lista si hay un `web.lista` de su pasada (o posterior); si no, error / montándose / encargada.
export function estadoAgente(eventos: EventoAgente[]): AgenteWeb | null {
  const orden = [...eventos].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const ultimo = (tipo: string) => orden.filter(e => e.tipo === tipo).pop()
  const encargo = ultimo('web.encargo')
  const listas = orden.filter(e => e.tipo === 'web.lista')
  const ultimaLista = listas[listas.length - 1]
  // Primeras versiones de antes de los encargos con tipo: la lista sola basta.
  if (!encargo) {
    if (!ultimaLista) return null
    const d = ultimaLista.datos || {}
    return { tipo: 'diseno', pasada: pasadaDe(d), anterior: null, estado: 'lista', fecha: ultimaLista.created_at, url: texto(d.url), notas: frases(d.notas), diseno: texto(d.diseno) }
  }
  const tipo = tipoDe(encargo.datos), pasada = pasadaDe(encargo.datos)
  const lista = listas.filter(e => pasadaDe(e.datos) >= pasada).pop()
  if (lista) {
    const d = lista.datos || {}
    const previa = listas.filter(e => pasadaDe(e.datos) < pasadaDe(d)).pop()
    return { tipo, pasada, anterior: texto(previa?.datos?.url), estado: 'lista', fecha: lista.created_at, url: texto(d.url), notas: frases(d.notas), diseno: texto(d.diseno) }
  }
  const base = { tipo, pasada, anterior: texto(ultimaLista?.datos?.url) }
  const nota = texto(encargo.datos?.nota)
  const error = ultimo('web.error')
  if (error && error.created_at > encargo.created_at) return { ...base, estado: 'error', fecha: error.created_at, motivo: texto(error.datos?.motivo) || 'Sin motivo', nota }
  const empezada = ultimo('web.empezada')
  if (empezada && empezada.created_at > encargo.created_at) return { ...base, estado: 'montandose', fecha: empezada.created_at, nota }
  return { ...base, estado: 'encargada', fecha: encargo.created_at, nota }
}

// Pasada que está montando el agente ahora: la del último encargo anterior a su último web.empezada
// (si llegó material nuevo mientras montaba, ese encargo es la pasada siguiente y sigue pendiente).
export function pasadaEnCurso(eventos: EventoAgente[]) {
  const orden = [...eventos].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const empezada = orden.filter(e => e.tipo === 'web.empezada').pop()
  // Sin web-empezada vale el último encargo. Repetir web-lista de una pasada ya avisada da «duplicado»:
  // por eso el agente tiene que llamar a web-empezada al empezar cada pasada.
  const enMarcha = orden.filter(e => e.tipo === 'web.encargo' && empezada && e.created_at <= empezada.created_at).pop()
  return pasadaDe((enMarcha || orden.filter(e => e.tipo === 'web.encargo').pop())?.datos)
}

// Para el agente: encargada, o «montándose» desde hace más de HORAS_EMPEZADA (la pasada anterior se cortó).
export const pendienteParaAgente = (a: AgenteWeb | null) =>
  !!a && (a.estado === 'encargada' || (a.estado === 'montandose' && Date.now() - new Date(a.fecha).getTime() > HORAS_EMPEZADA * 3600_000))

async function eventosAgente(ids: number[]) {
  if (!ids.length) return [] as (EventoAgente & { proyecto_id: number })[]
  const { data } = await sb.from('eventos').select('proyecto_id, tipo, datos, created_at').in('proyecto_id', ids).in('tipo', TIPOS_AGENTE as unknown as string[])
  return (data || []) as (EventoAgente & { proyecto_id: number })[]
}

// Estado del agente de varios proyectos de una vez.
export async function estadosAgente(ids: number[]) {
  const mapa = new Map<number, AgenteWeb>()
  const eventos = await eventosAgente(ids)
  for (const id of ids) {
    const a = estadoAgente(eventos.filter(e => e.proyecto_id === id))
    if (a) mapa.set(id, a)
  }
  return mapa
}

export async function pasadaDelProyecto(id: number) {
  return pasadaEnCurso(await eventosAgente([id]))
}

// Proyectos que el agente tiene que montar o tiene a medias (para copiar su material de Drive).
export async function proyectosConEncargo() {
  const { data } = await sb.from('eventos').select('proyecto_id').eq('tipo', 'web.encargo').not('proyecto_id', 'is', null)
  const ids = Array.from(new Set((data || []).map(e => e.proyecto_id as number)))
  const estados = await estadosAgente(ids)
  return ids.filter(id => { const a = estados.get(id); return a && (a.estado === 'encargada' || a.estado === 'montandose') })
}

type ProyectoEncargo = { id: number; marca: string | null; plan: string | null; lead_id: number | null; brief: Brief | null }
async function proyectoParaEncargo(id: number) {
  const { data: p } = await sb.from('proyectos').select('id, marca, plan, lead_id, brief').eq('id', id).maybeSingle()
  if (!p) return null
  const { data: lead } = p.lead_id ? await sb.from('leads').select('interes, campos').eq('id', p.lead_id).maybeSingle() : { data: null }
  return { p: p as ProyectoEncargo, tipo: tipoEncargo(p, lead) }
}

export type ResultadoEncargo = { ok: true; tipo: TipoEncargo } | { omitido: string; esperando_brief?: true }

// Crea el encargo si la marca tiene agente, no hay otro en marcha y (en custom) hay brief. Lo llaman
// «Comenzar», «Reintentar» / «Encargar al agente» y guardar el brief de un proyecto ya comenzado.
export async function encargarWeb(proyectoId: number, nota: string | null, fuente = 'joux-hub'): Promise<ResultadoEncargo> {
  const r = await proyectoParaEncargo(proyectoId)
  if (!r) return { omitido: 'No existe el proyecto' }
  const { p, tipo } = r
  if (!tipo) return { omitido: 'Esta marca no tiene agente: la hace Joel' }
  if (tipo === 'custom' && faltaBrief(p.brief)) return { omitido: `Esperando el brief de dirección (${faltaBrief(p.brief)!.toLowerCase()})`, esperando_brief: true }
  const actual = (await estadosAgente([p.id])).get(p.id) || null
  if (actual?.estado === 'lista') return { omitido: 'La primera versión ya está hecha' }
  if (actual?.estado === 'encargada' || actual?.estado === 'montandose') return { omitido: 'Ya hay un encargo en marcha' }
  // Tras un error, la misma pasada; si no, la siguiente a la última hecha.
  const pasada = actual ? actual.pasada : 1
  const { error } = await sb.from('eventos').insert({
    proyecto_id: p.id, lead_id: p.lead_id, tipo: 'web.encargo', fuente,
    datos: { tipo, pasada, ...(nota ? { nota: nota.slice(0, 1000) } : {}) },
  })
  if (error) throw new Error(error.message)
  return { ok: true, tipo }
}

// Material nuevo en un diseño ya comenzado («Ya está todo» o archivos en Drive): el agente lo vuelve a
// montar. No hace nada si el encargo aún no ha empezado (esa pasada ya verá el material), si la web ha
// pasado a revisión con el cliente o si no es un diseño.
export async function repetirPasada(proyectoId: number, motivo: string, fuente: string): Promise<{ ok: true; pasada: number } | { omitido: string }> {
  const { data: p } = await sb.from('proyectos').select('id, fase, lead_id').eq('id', proyectoId).maybeSingle()
  if (!p || p.fase !== 'comenzado') return { omitido: 'No está en «Comenzado»' }
  const eventos = await eventosAgente([p.id])
  const a = estadoAgente(eventos)
  if (!a || a.tipo !== 'diseno') return { omitido: 'Sin encargo de diseño' }
  if (a.estado === 'encargada') return { omitido: 'El encargo aún no ha empezado' }
  // Montándose: el encargo nuevo es la pasada siguiente a la que está montando.
  const pasada = a.estado === 'montandose' ? pasadaEnCurso(eventos) + 1 : a.pasada + 1
  const { error } = await sb.from('eventos').insert({ proyecto_id: p.id, lead_id: p.lead_id, tipo: 'web.encargo', fuente, datos: { tipo: 'diseno', pasada, repetir: motivo.slice(0, 300) } })
  if (error) throw new Error(error.message)
  return { ok: true, pasada }
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
