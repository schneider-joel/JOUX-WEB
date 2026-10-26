// Seguimiento de proyectos por fase (/proyectos). Usable en el navegador.
import { FASES_PROYECTO, type FaseProyecto } from './leads'
import { EMAIL_RECORDATORIO } from './emails'

// Treatments que se siguen por etapas (además de las webs, marcas de modo «cerrado»). Sus etapas son
// menos: sin «Cambios» (las rondas van en Pitchview). Los de antes de entrar aquí no tienen fase y no salen.
export const MARCAS_TREATMENT = ['pitchlab']
export const FASES_TREATMENT: readonly FaseProyecto[] = ['confirmado', 'material', 'comenzado', 'revision', 'entregado', 'cerrado']
export const fasesDe = (marca: string | null): readonly FaseProyecto[] => MARCAS_TREATMENT.includes(marca || '') ? FASES_TREATMENT : FASES_PROYECTO

// Qué toca en cada fase, para la columna «Ahora».
export const AHORA: Record<FaseProyecto, string> = {
  confirmado: 'Enviar bienvenida y pedir material',
  material: 'Esperando material · «Comenzar» al ver cobrado el pago 1',
  comenzado: 'Trabajando en la primera versión',
  revision: 'Esperando comentarios del cliente',
  cambios: 'Aplicar cambios y preparar la siguiente ronda',
  entregado: 'Pendiente del cobro final',
  cerrado: 'Terminado',
}

// A partir de cuántos días en la misma fase se marca como parado (cerrado nunca).
export const DIAS_ALERTA: Record<FaseProyecto, number | null> = {
  confirmado: 3, material: 5, comenzado: 10, revision: 4, cambios: 4, entregado: 30, cerrado: null,
}

export type ProyectoSeguimiento = {
  id: number
  nombre: string
  cliente: string
  marca: string | null
  fase: FaseProyecto | null
  desde: string                 // cuándo entró en la fase actual (o se creó)
  lead_id: number | null
  historial: { fase: FaseProyecto; fecha: string }[]  // cambios de fase, del más antiguo al más reciente
  emails: { plantilla: string; fecha: string; error: string | null; auto: boolean }[]  // emails enviados al cliente; error = rebotado, spam…; auto = sin aprobación
  ref_entrega: string | null    // slug de arkevo-revision o carpeta de Pitchview (para sus avisos)
  rondas: { ronda: string; estado: 'abierta' | 'comentada' | 'cerrada'; comentarios: number; abierta_en: string; url: string }[]
  borradores: { id: number; plantilla: string; error: string | null }[]  // emails preparados por un aviso o el cron, sin enviar
  material_completo: boolean    // el cliente respondió «ya está todo» estando en «Material» (se propone «Comenzar»)
  drive_url: string | null      // carpeta de Drive compartida con el cliente
  drive_error: string | null    // por qué falló el último intento de crearla o compartirla
  agente: AgenteWeb | null      // encargo al agente (diseño, custom o treatment)
  encargo_tipo: TipoEncargo | null  // qué agente le toca al pulsar «Comenzar» (null = lo hace Joel)
  plan: string | null
  precio: number | null         // precio cerrado (webs); null en los treatments
  prueba: boolean               // proyecto de prueba de Joel: su factura no tiene validez fiscal
  brief: Brief | null           // brief de dirección (solo custom de Arkevo)
  plantillas: string[]          // emails que tiene su marca (para proponer solo los que existen)
  material: { copiados: number; pendientes: number; errores: { ruta: string; error: string }[] } | null  // copia de Drive para el agente
}

// Encargo al agente: encargada → montándose → lista (vista previa solo para Joel) o error.
// `pasada` > 1 = se vuelve a montar con material nuevo; `anterior` = la vista previa de la pasada anterior.
export type TipoEncargo = 'diseno' | 'custom' | 'treatment' | 'carta'
export const NOMBRE_ENCARGO: Record<TipoEncargo, string> = { diseno: 'primera versión', custom: 'web custom', treatment: 'treatment', carta: 'carta' }
type Pasada = { tipo: TipoEncargo; pasada: number; anterior: string | null }
export type AgenteWeb = Pasada & (
  | { estado: 'encargada' | 'montandose'; fecha: string; nota: string | null }
  | { estado: 'lista'; fecha: string; url: string | null; notas: string[]; diseno: string | null }
  | { estado: 'error'; fecha: string; motivo: string; nota: string | null })

// Brief de dirección de una web custom de Arkevo: lo escribe Joel antes de que empiece el agente.
export type Brief = { referencias: string[]; tono: string; tipografia: string; colores: string; paginas: string; notas: string; guardado_en?: string }
export const PLANES_CUSTOM: Record<string, string> = {
  esencial: 'Una página (portada con todas las secciones) + hasta 4 obras con su página · 1 idioma',
  estudio: 'Inicio, estudio, servicios y contacto + hasta 8 obras con su página · 2 idiomas · plantas interactivas',
  signature: 'Todo lo de Estudio + hasta 12 obras con su página · modelos 3D con sus planos · set de planos con lupa',
}
// 'Essential' / 'Studio' (los nombres en inglés del formulario) cuentan como Esencial / Estudio.
export const planCustom = (plan: string | null | undefined) => {
  const p = (plan || '').trim().toLowerCase()
  return p === 'essential' ? 'esencial' : p === 'studio' ? 'estudio' : PLANES_CUSTOM[p] ? p : null
}
const URL_OK = /^https?:\/\/\S+\.\S+/i
// Qué le falta al brief para poder encargar; null = completo. 2–3 referencias, tono y páginas.
export function faltaBrief(b: Partial<Brief> | null | undefined): string | null {
  const refs = (b?.referencias || []).map(r => r.trim()).filter(Boolean)
  if (refs.length < 2) return 'Faltan referencias (2 o 3 enlaces)'
  if (refs.length > 5) return 'Como mucho 5 referencias'
  if (refs.some(r => !URL_OK.test(r))) return 'Las referencias tienen que ser enlaces (https://…)'
  if (!b?.tono?.trim()) return 'Falta el tono'
  if (!b?.paginas?.trim()) return 'Faltan las páginas'
  return null
}

export const ESTADO_RONDA = { abierta: 'esperando comentarios', comentada: 'comentada', cerrada: 'cerrada' } as const

export const diasDesde = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))

// «Comenzar» un proyecto con agente que aún no tiene encargo en marcha (ni hecho).
export const encargaAgente = (p: ProyectoSeguimiento, fase: FaseProyecto) =>
  fase === 'comenzado' && !!p.encargo_tipo && (!p.agente || p.agente.estado === 'error')
// Qué pasa al pulsar «Comenzar», en la confirmación.
export function alComenzar(p: ProyectoSeguimiento) {
  if (!p.encargo_tipo) return 'sin agente: la haces tú'
  if (p.agente && p.agente.estado !== 'error') return 'el encargo ya existe'
  if (p.encargo_tipo === 'custom' && faltaBrief(p.brief)) return 'el agente espera tu brief de dirección (se pide al comenzar)'
  if (p.encargo_tipo === 'treatment') return 'el agente empieza el treatment con el material de Drive'
  if (p.encargo_tipo === 'custom') return 'el agente de custom empieza con tu brief'
  return 'el agente monta la primera versión con el material que haya'
}
// Se puede «Comenzar» desde las etapas de antes (sin etapa, confirmado o material).
export const antesDeComenzar = (p: ProyectoSeguimiento) => !p.fase || p.fase === 'confirmado' || p.fase === 'material'

// Parado = lleva en su etapa más días de los que toca (cerrado nunca).
export const estaParado = (p: Pick<ProyectoSeguimiento, 'fase' | 'desde'>) => !!p.fase && DIAS_ALERTA[p.fase] != null && diasDesde(p.desde) >= DIAS_ALERTA[p.fase]!

// Lo que te toca en un proyecto, en dos o tres palabras (el detalle y los botones están en su ficha).
export function queToca(p: ProyectoSeguimiento, parado: boolean): string | null {
  if (p.borradores.length) return p.borradores.length === 1 ? 'Email por enviar' : `${p.borradores.length} emails por enviar`
  if (p.agente?.estado === 'error') return 'El agente no pudo terminar'
  if (p.agente?.estado === 'lista' && p.fase === 'comenzado') return 'Revisar lo que hizo el agente'
  if (p.fase === 'comenzado' && p.encargo_tipo === 'custom' && !p.agente) return 'Escribir el brief'
  if (antesDeComenzar(p) && p.material_completo) return 'Listo para comenzar'
  if (p.drive_error && !p.drive_url) return 'Drive no se pudo crear'
  if (parado && p.fase && EMAIL_RECORDATORIO[p.fase]) return 'Parado · mandar recordatorio'
  if (!p.fase) return 'Ponle su etapa'
  return null
}


// ---------- Vista simple de Work (rediseño comercial, fase 1) ----------
// Las 7 fases de la base se enseñan como 4 etapas. Solo cambia lo que se ve: `proyectos.fase` no se toca.
export const ETAPAS_VISTA = ['Preparando', 'Revisión', 'Entregado', 'Cobrado'] as const
const VISTA_DE_FASE: Record<FaseProyecto, number> = { confirmado: 0, material: 0, comenzado: 0, revision: 1, cambios: 1, entregado: 2, cerrado: 3 }
export const etapaVista = (fase: FaseProyecto | null) => fase ? VISTA_DE_FASE[fase] : 0

// Una sola línea de estado por tarjeta: «tu» = te toca (ámbar), «espera» = esperando a otro (gris),
// «parado» = lleva más días de la cuenta (rojo), «ok» = cerrado. La usan Work, su insignia y las fichas.
export type Estado = { k: 'tu' | 'espera' | 'parado' | 'ok'; texto: string }
const conDias = (texto: string, d: number) => d > 0 ? `${texto} · ${d} d` : texto

// Con los cambios de la última ronda aplicados (cerrada) y la web aún en «Cambios», toca abrir la siguiente
// ronda o entregar; las dos cosas se hacen en arkevo-revision y su aviso pone al día el hub. Devuelve 'R3'…
export function rondaSiguiente(p: Pick<ProyectoSeguimiento, 'fase' | 'rondas'>): string | null {
  const ultima = p.rondas[p.rondas.length - 1]
  if (p.fase !== 'cambios' || ultima?.estado !== 'cerrada') return null
  const n = Number(ultima.ronda.replace(/\D/g, ''))
  return n ? `R${n + 1}` : 'siguiente ronda'
}
export const PASO_ARKEVO_REVISION = 'Se hace en la herramienta de revisión de Arkevo (desde su sesión): al abrir la ronda o entregar, Joux Hub se pone al día solo con su aviso.'

// Web de precio cerrado entregada sin el email de entrega (que lleva la factura del pago 2, la cree o la adjunte).
export const entregaPendiente = (p: Pick<ProyectoSeguimiento, 'fase' | 'precio' | 'emails'>) =>
  p.fase === 'entregado' && !!p.precio && !p.emails.some(e => e.plantilla === 'entrega.final' && !e.error)

export function estadoDe(p: ProyectoSeguimiento, pago1Cobrado: boolean): Estado {
  if (p.fase === 'cerrado') return { k: 'ok', texto: 'Cerrado' }
  const parado = estaParado(p), d = diasDesde(p.desde)
  if (antesDeComenzar(p) && pago1Cobrado && !p.agente) return { k: 'tu', texto: 'Pago 1 cobrado: comenzar' }
  // Proyecto de prueba: no habrá transferencia, así que se comienza a mano tras la bienvenida.
  if (p.prueba && p.fase === 'material' && !p.agente) return { k: 'tu', texto: 'Prueba: comienza sin cobro' }
  const comentada = p.rondas.find(r => r.estado === 'comentada')
  if (comentada) return { k: 'tu', texto: `Aplicar ${comentada.comentarios} comentario${comentada.comentarios === 1 ? '' : 's'} de ${comentada.ronda}` }
  const siguiente = rondaSiguiente(p)
  if (siguiente) return { k: 'tu', texto: `Cambios aplicados: abre la ${siguiente} o entrega la web` }
  const toca = queToca(p, parado)
  if (toca?.startsWith('Parado')) return { k: 'parado', texto: conDias('Parado: manda un recordatorio', d) }
  if (toca) return { k: 'tu', texto: toca }
  if (p.fase === 'confirmado') return { k: 'tu', texto: 'Enviar la bienvenida' }
  if (p.fase === 'cambios') return { k: 'tu', texto: 'Aplicar cambios y preparar la siguiente ronda' }
  if (entregaPendiente(p)) return { k: 'tu', texto: 'Envía la entrega con la factura final' }
  const espera = p.fase === 'material' ? 'Esperando el pago 1'
    : p.fase === 'comenzado' ? (p.agente ? 'El agente está montando la primera versión' : 'La primera versión la haces tú')
    : p.fase === 'revision' ? 'Esperando comentarios del cliente'
    : p.fase === 'entregado' ? 'Esperando el cobro final' : 'Sin etapa'
  return { k: parado ? 'parado' : 'espera', texto: conDias(espera, d) }
}
// El nombre que Joel reconoce es el del local o estudio («Web La Cola Del Pez · Cartela» → «La Cola Del Pez»),
// no la razón social del cliente fiscal.
export const nombreCorto = (nombre: string, cliente: string, marca: string) => nombre.replace(/^Web\s+/i, '').replace(` · ${marca}`, '').trim() || cliente
export const ORDEN_ESTADO: Record<Estado['k'], number> = { tu: 0, parado: 1, espera: 2, ok: 3 }
