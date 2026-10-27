// Autonomía de los envíos (fase 5, automatizacion.md). Todo apagado por defecto: sin fila en `configuracion`
// no sale nada solo. Las plantillas usan su columna `plantillas.auto`; las respuestas de IA, la lista
// por marca de `auto_respuestas_ia`. La pausa global corta las dos cosas a la vez. Solo servidor.
import { supabaseServer as sb } from '@/lib/supabase-server'

const CLAVE_PAUSA = 'auto_pausa'
const CLAVE_RESPUESTAS = 'auto_respuestas_ia'   // {"arkevo": ["precio"], …}

export type RespuestasAuto = Record<string, string[]>

export async function leerAutonomia(): Promise<{ pausa: boolean; respuestas: RespuestasAuto }> {
  const { data } = await sb.from('configuracion').select('clave, valor').in('clave', [CLAVE_PAUSA, CLAVE_RESPUESTAS])
  const valor = (k: string) => data?.find(c => c.clave === k)?.valor
  let respuestas: RespuestasAuto = {}
  try { respuestas = JSON.parse(valor(CLAVE_RESPUESTAS) || '{}') } catch { /* valor roto = nada activado */ }
  return { pausa: valor(CLAVE_PAUSA) === 'true', respuestas }
}

export const enviosPausados = async () => (await leerAutonomia()).pausa

export async function guardarPausa(pausa: boolean) {
  return sb.from('configuracion').upsert({ clave: CLAVE_PAUSA, valor: String(pausa) }, { onConflict: 'clave' })
}

export async function guardarRespuestaAuto(marca: string, categoria: string, activo: boolean) {
  const { respuestas } = await leerAutonomia()
  const lista = new Set(respuestas[marca] || [])
  activo ? lista.add(categoria) : lista.delete(categoria)
  const nuevo = { ...respuestas, [marca]: Array.from(lista) }
  if (!nuevo[marca].length) delete nuevo[marca]
  return sb.from('configuracion').upsert({ clave: CLAVE_RESPUESTAS, valor: JSON.stringify(nuevo) }, { onConflict: 'clave' })
}

// ¿Puede salir solo este borrador de IA? Categoría activada en su marca, sin pausa y sin nada que pida a Joel.
// Las alertas de la IA (dudas normales) no frenan: van en el push. Frenan el spam, los [[Joel: …]] y lo sospechoso
// (el lead intenta dar instrucciones a la IA o pide algo raro).
export async function respuestaAutomatica(marca: string, categoria: string, cuerpo: string, sospechoso: boolean) {
  if (categoria === 'spam' || sospechoso || /\[\[Joel:/.test(cuerpo)) return false
  const { pausa, respuestas } = await leerAutonomia()
  return !pausa && (respuestas[marca] || []).includes(categoria)
}

// Métrica: ¿salió el mensaje tal como se generó? Los {{…}} que quedaron en el original (p. ej. {{url}},
// que Joel pega a mano) valen cualquier texto: rellenarlos no cuenta como editar.
export function sinCambios(m: { asunto: string | null; cuerpo: string; asunto_original: string | null; cuerpo_original: string | null }) {
  if (m.cuerpo_original == null) return null
  const igual = (original: string, final: string) => {
    const patron = original.trim().split(/\{\{\w+\}\}/).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]+?')
    return new RegExp(`^${patron}$`).test(final.trim())
  }
  return igual(m.cuerpo_original, m.cuerpo) && igual(m.asunto_original || '', (m.asunto || '').replace(/^re:\s*/i, ''))
}

// ---------- Piloto automático (rediseño comercial, 2026-10-26) ----------
// Pasos del recorrido que pueden ir solos, por marca, en `configuracion.piloto_auto` ({"cartela": ["ganar", …]}).
// Las facturas nunca: la bienvenida con la factura del pago 1 y la entrega con la del pago 2 las envía Joel.
// La pausa global (`auto_pausa`) también los para. Todo apagado por defecto.
const CLAVE_PILOTO = 'piloto_auto'
export const PASOS_PILOTO = {
  ganar: { titulo: 'Ganar el lead', detalle: 'Cuando «Para empezar» está completo y el cliente acepta: crea el cliente y el proyecto. Luego te toca la bienvenida con la factura.' },
  comenzar_prueba: { titulo: 'Comenzar las pruebas', detalle: 'En proyectos de prueba no llega transferencia: el agente arranca al enviar la bienvenida.' },
  cambios: { titulo: 'Cambios por email', detalle: 'Con la carta ya entregada, los cambios que pida respondiendo al correo pasan al agente de cambios. Las correcciones de la revisión van a «Repetir» en la ficha.' },
  aprobar: { titulo: 'Dar por aprobada', detalle: 'Si el cliente dice que está bien, el proyecto pasa a Entregado y la caja te pide la entrega con la factura.' },
} as const
export type PasoPiloto = keyof typeof PASOS_PILOTO
export const esPasoPiloto = (x: unknown): x is PasoPiloto => typeof x === 'string' && x in PASOS_PILOTO

export async function leerPiloto(): Promise<Record<string, PasoPiloto[]>> {
  const { data } = await sb.from('configuracion').select('valor').eq('clave', CLAVE_PILOTO).maybeSingle()
  try { return JSON.parse(data?.valor || '{}') } catch { return {} }
}

// ¿Va solo este paso en esta marca? Encendido y sin pausa global.
export async function pilotoActivo(marca: string | null | undefined, paso: PasoPiloto) {
  if (!marca) return false
  const [{ pausa }, piloto] = await Promise.all([leerAutonomia(), leerPiloto()])
  return !pausa && (piloto[marca] || []).includes(paso)
}

export async function guardarPiloto(marca: string, paso: PasoPiloto, activo: boolean) {
  const piloto = await leerPiloto()
  const lista = new Set(piloto[marca] || [])
  activo ? lista.add(paso) : lista.delete(paso)
  const nuevo = { ...piloto, [marca]: Array.from(lista) }
  if (!nuevo[marca].length) delete nuevo[marca]
  return sb.from('configuracion').upsert({ clave: CLAVE_PILOTO, valor: JSON.stringify(nuevo) }, { onConflict: 'clave' })
}
