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
export async function respuestaAutomatica(marca: string, categoria: string, cuerpo: string, alertas: string[]) {
  if (categoria === 'spam' || alertas.length || /\[\[Joel:/.test(cuerpo)) return false
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
