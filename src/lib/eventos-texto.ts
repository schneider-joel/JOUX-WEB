import { ETIQUETA_ESTADO, ETIQUETA_FASE, esEstadoLead, esFaseProyecto, type Evento } from '@/lib/leads'

// Texto de cada evento de la línea de tiempo (ficha del lead y ficha del proyecto). Usable en el navegador.
const valor = (v: unknown) => v == null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)

export function textoEvento(e: Pick<Evento, 'tipo' | 'datos'>) {
  if (e.tipo === 'lead.nuevo') return `Lead recibido desde ${valor(e.datos.origen)}`
  if (e.tipo === 'lead.estado') {
    const de = esEstadoLead(e.datos.de) ? ETIQUETA_ESTADO[e.datos.de] : valor(e.datos.de)
    const a = esEstadoLead(e.datos.a) ? ETIQUETA_ESTADO[e.datos.a] : valor(e.datos.a)
    return `Estado: ${de} → ${a}`
  }
  if (e.tipo === 'lead.ganado') return `Ganado: ${valor(e.datos.cliente)}${e.datos.cliente_nuevo ? ' (cliente nuevo)' : ''}${e.datos.tarifa_dia ? ` · €${valor(e.datos.tarifa_dia)}/día` : ''}`
  if (e.tipo === 'lead.perdido') return `Perdido${e.datos.motivo ? `: ${valor(e.datos.motivo)}` : ''}`
  if (e.tipo === 'ia.borrador') return `Borrador de IA${e.datos.motivo === 'regenerar' ? ' (regenerado)' : e.datos.motivo === 'respuesta' ? ' para su respuesta' : ''}${e.datos.categoria ? ` · ${valor(e.datos.categoria)}` : ''}`
  if (e.tipo === 'mensaje.descartado') return 'Borrador descartado'
  if (e.tipo === 'material.recibido') return `Material para la prueba gratis${e.datos.fotos ? ` · ${valor(e.datos.fotos)} fotos` : ''}${e.datos.diseno ? ` · ${valor(e.datos.diseno)}` : ''}`
  if (e.tipo === 'prueba.lista') return `${Number(e.datos.ronda) === 2 ? 'Prueba gratis con ajustes lista' : 'Prueba gratis lista'}${e.datos.diseno ? ` en ${valor(e.datos.diseno)}` : ''}`
  if (e.tipo === 'prueba.ajustes') return `Ajustes pedidos al agente: ${valor(e.datos.peticion)}`
  if (e.tipo === 'prueba.error') return `El agente no pudo montar la prueba: ${valor(e.datos.motivo)}`
  if (e.tipo === 'drive.creada') return `Carpeta de Drive compartida con ${valor(e.datos.compartida_con)}`
  if (e.tipo === 'material.subido') return `Ha subido ${valor(e.datos.n)} archivo${Number(e.datos.n) === 1 ? '' : 's'} a Drive`
  if (e.tipo === 'datos.fiscales') return `${e.datos.corrigiendo ? 'Ha corregido' : 'Ha enviado'} sus datos fiscales: ${valor(e.datos.cliente)} (${valor(e.datos.pais)})`
  if (e.tipo === 'material.completo') return 'Ha avisado de que ya está todo el material subido'
  if (e.tipo === 'factura.emitida') return `Factura ${valor(e.datos.numero)} emitida (pago ${valor(e.datos.pago)})${e.datos.prueba ? ' · prueba, sin validez fiscal' : ''}`
  if (e.tipo === 'proyecto.fase') return `Fase del proyecto: ${esFaseProyecto(e.datos.de) ? ETIQUETA_FASE[e.datos.de] : '—'} → ${esFaseProyecto(e.datos.a) ? ETIQUETA_FASE[e.datos.a] : valor(e.datos.a)}`
  // Los de la ficha del proyecto (agente, revisiones y emails)
  if (e.tipo === 'web.encargo') return `Encargo al agente${e.datos.tipo ? ` (${valor(e.datos.tipo)})` : ''}${Number(e.datos.pasada) > 1 ? ` · pasada ${valor(e.datos.pasada)}` : ''}`
  if (e.tipo === 'web.empezada') return 'El agente ha empezado'
  if (e.tipo === 'web.lista') return `El agente ha terminado${e.datos.diseno ? ` · ${valor(e.datos.diseno)}` : ''}`
  if (e.tipo === 'web.error') return `El agente no pudo terminar: ${valor(e.datos.motivo)}`
  if (e.tipo === 'brief.guardado') return 'Brief de dirección guardado'
  if (e.tipo === 'mensaje.enviado') return `Email enviado${e.datos.asunto ? `: «${valor(e.datos.asunto)}»` : ''}`
  if (e.tipo === 'mensaje.recibido') return 'Ha respondido por email'
  if (e.tipo === 'mensaje.rebotado') return `Un email no llegó${e.datos.motivo ? `: ${valor(e.datos.motivo)}` : ''}`
  if (e.tipo === 'revision.aplicada') return `Cambios de ${valor(e.datos.ronda)} aplicados`
  if (e.tipo.startsWith('revision.')) return `Revisión${e.datos.ronda ? ` ${valor(e.datos.ronda)}` : ''}: ${e.tipo.slice(9).replace(/[._]/g, ' ')}`
  return e.tipo
}
