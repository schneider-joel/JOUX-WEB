import { supabaseServer as sb } from '@/lib/supabase-server'
import { esFaseProyecto } from '@/lib/leads'
import { MARCAS_TREATMENT, type Brief, type ProyectoSeguimiento } from '@/lib/seguimiento'
import { estadosAgente, tipoEncargo } from '@/lib/primera-version'

// Datos del seguimiento por etapa (servidor): los usan Work › Proyectos (/work) y la ficha de cada
// proyecto (/proyectos/<id>, con `id`). Las webs (modo «cerrado») activas o con fase, y los treatments
// de The Pitch Lab con fase. Solo lee.
export async function cargarSeguimiento(filtro: { id?: number } = {}) {
  const { data: todas } = await sb.from('marcas').select('key, nombre, orden, modo').order('orden')
  const marcas = (todas || []).filter(m => m.modo === 'cerrado' || MARCAS_TREATMENT.includes(m.key))
  const webs = marcas.filter(m => m.modo === 'cerrado').map(m => m.key)
  const base = sb.from('proyectos').select('id, nombre, cliente, marca, fase, plan, precio_cerrado, prueba, brief, lead_id, ref_entrega, drive_url, drive_error, created_at')
    .in('marca', marcas.map(m => m.key))
  // La ficha pide un proyecto aunque ya no esté activo ni tenga fase.
  const { data: crudos, error } = await (filtro.id != null ? base.eq('id', filtro.id) : base.or('status.eq.activo,fase.not.is.null'))
    .order('created_at', { ascending: false })
  const proyectos = (crudos || []).filter(p => filtro.id != null || webs.includes(p.marca || '') || p.fase)
  const ids = proyectos.map(p => p.id)
  const leadIds = proyectos.map(p => p.lead_id).filter((x): x is number => !!x)
  // Todo a la vez: la base está en Irlanda y cada consulta cuesta un viaje (antes iban una detrás de otra).
  const vacio = Promise.resolve({ data: [] as never[] })
  const [{ data: leads }, { data: plantillas }, { data: eventos }, { data: mensajes }, { data: borradores }, { data: rondas }, agentes, { data: copias }] = await Promise.all([
    leadIds.length ? sb.from('leads').select('id, interes, campos').in('id', leadIds) : vacio,
    sb.from('plantillas').select('clave, marca'),
    ids.length ? sb.from('eventos').select('proyecto_id, tipo, datos, created_at').in('proyecto_id', ids).in('tipo', ['proyecto.fase', 'lead.ganado', 'material.completo']).order('created_at') : vacio,
    // Los emails salen de `mensajes` (no de los eventos) para saber si Resend avisó luego de un rebote.
    ids.length ? sb.from('mensajes').select('proyecto_id, plantilla, estado, error, enviado_en, auto').in('proyecto_id', ids).eq('direccion', 'saliente').not('enviado_en', 'is', null).order('enviado_en') : vacio,
    ids.length ? sb.from('mensajes').select('id, proyecto_id, plantilla, error').in('proyecto_id', ids).eq('estado', 'borrador').order('created_at') : vacio,
    ids.length ? sb.from('revisiones').select('proyecto_id, ronda, estado, comentarios, abierta_en, url').in('proyecto_id', ids).order('abierta_en') : vacio,
    // Agente de primera versión y copia del material de Drive que usa.
    estadosAgente(ids),
    ids.length ? sb.from('drive_copias').select('proyecto_id, ruta, copiado_en, error').in('proyecto_id', ids) : vacio,
  ])

  const lista: ProyectoSeguimiento[] = proyectos.map(p => {
    const propios = (eventos || []).filter(e => e.proyecto_id === p.id)
    const historial = propios.filter(e => e.tipo !== 'material.completo')
      .map(e => ({ fase: e.tipo === 'lead.ganado' ? 'confirmado' : (e.datos as { a?: unknown })?.a, fecha: e.created_at as string }))
      .filter((h): h is ProyectoSeguimiento['historial'][number] => esFaseProyecto(h.fase))
    const emails = (mensajes || []).filter(m => m.proyecto_id === p.id)
      .map(m => ({ plantilla: m.plantilla || '', fecha: m.enviado_en as string, error: m.estado === 'error' ? m.error || 'No entregado' : null, auto: !!m.auto }))
    const ultimo = [...historial].reverse().find(h => h.fase === p.fase)
    // El cliente avisó por email de que ya lo ha subido todo, después de entrar en «Material».
    const materialCompleto = p.fase === 'material' && propios.some(e => e.tipo === 'material.completo' && e.created_at >= (ultimo?.fecha || p.created_at))
    return {
      id: p.id, nombre: p.nombre, cliente: p.cliente, marca: p.marca, lead_id: p.lead_id,
      fase: esFaseProyecto(p.fase) ? p.fase : null, desde: ultimo?.fecha || p.created_at, historial, emails,
      ref_entrega: p.ref_entrega, material_completo: materialCompleto, drive_url: p.drive_url, drive_error: p.drive_error,
      rondas: (rondas || []).filter(r => r.proyecto_id === p.id).map(({ proyecto_id, ...r }) => r),
      borradores: (borradores || []).filter(m => m.proyecto_id === p.id).map(m => ({ id: m.id, plantilla: m.plantilla || '', error: m.error })),
      agente: agentes.get(p.id) || null,
      encargo_tipo: tipoEncargo(p, (leads || []).find(l => l.id === p.lead_id)),
      plan: p.plan, precio: p.precio_cerrado == null ? null : Number(p.precio_cerrado), prueba: !!p.prueba, brief: (p.brief as Brief | null) || null,
      plantillas: Array.from(new Set((plantillas || []).filter(t => t.marca === p.marca).map(t => t.clave as string))),
      material: (() => {
        const c = (copias || []).filter(x => x.proyecto_id === p.id)
        return c.length ? {
          copiados: c.filter(x => x.copiado_en).length, pendientes: c.filter(x => !x.copiado_en && !x.error).length,
          errores: c.filter(x => x.error).map(x => ({ ruta: x.ruta as string, error: x.error as string })),
        } : null
      })(),
    }
  })

  return { marcas, lista, error }
}
