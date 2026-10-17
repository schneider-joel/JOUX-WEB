import Link from 'next/link'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { esFaseProyecto } from '@/lib/leads'
import type { ProyectoSeguimiento } from '@/lib/seguimiento'
import Seguimiento from './seguimiento'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const metadata = { title: 'Proyectos · JOUX Hub' }

// Seguimiento visual de cada web por fase (proyectos.fase). Solo marcas de webs (modo «cerrado»:
// Arkevo, Custom Websites…); los treatments no se siguen por etapas. Entran las activas y las que ya
// tienen fase; la fase se cambia aquí a mano y queda en eventos (proyecto.fase).
export default async function ProyectosPage() {
  const { data: marcas } = await sb.from('marcas').select('key, nombre, orden').eq('modo', 'cerrado').order('orden')
  const { data: proyectos, error } = await sb.from('proyectos').select('id, nombre, cliente, marca, fase, lead_id, ref_entrega, drive_url, drive_error, created_at')
    .or('status.eq.activo,fase.not.is.null').in('marca', (marcas || []).map(m => m.key)).order('created_at', { ascending: false })
  const ids = (proyectos || []).map(p => p.id)
  const { data: eventos } = ids.length
    ? await sb.from('eventos').select('proyecto_id, tipo, datos, created_at').in('proyecto_id', ids).in('tipo', ['proyecto.fase', 'lead.ganado', 'material.completo']).order('created_at')
    : { data: [] }
  // Los emails salen de `mensajes` (no de los eventos) para saber si Resend avisó luego de un rebote.
  const { data: mensajes } = ids.length
    ? await sb.from('mensajes').select('proyecto_id, plantilla, estado, error, enviado_en, auto').in('proyecto_id', ids).eq('direccion', 'saliente').not('enviado_en', 'is', null).order('enviado_en')
    : { data: [] }
  const { data: borradores } = ids.length
    ? await sb.from('mensajes').select('id, proyecto_id, plantilla, error').in('proyecto_id', ids).eq('estado', 'borrador').order('created_at')
    : { data: [] }
  const { data: rondas } = ids.length
    ? await sb.from('revisiones').select('proyecto_id, ronda, estado, comentarios, abierta_en, url').in('proyecto_id', ids).order('abierta_en')
    : { data: [] }

  const lista: ProyectoSeguimiento[] = (proyectos || []).map(p => {
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
    }
  })

  return (
    <div className="app">
      <header className="frame frame--top caps">
        <Link href="/" className="mark" style={{ textDecoration: 'none' }}>JOUX HUB</Link>
        <Link href="/" className="copy">← Overview</Link>
      </header>
      <main className="main">
        <header className="page-header trk__ancho">
          <div className="page-header__txt">
            <h1 className="page-title">Proyectos</h1>
            <p className="tags caps">Webs · seguimiento por etapa</p>
          </div>
          <Link href="/pipeline" className="copy caps">Leads →</Link>
        </header>
        {error ? <p className="empty trk__ancho">No se pudieron cargar los proyectos.</p>
          : <Seguimiento proyectos={lista} marcas={(marcas || []).map(m => ({ key: m.key as string, nombre: m.nombre as string }))} />}
      </main>
    </div>
  )
}
