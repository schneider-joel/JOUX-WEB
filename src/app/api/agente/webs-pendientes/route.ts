import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { fuenteDeClave } from '@/lib/intake'
import { CLAVE_AGENTE } from '@/lib/agente'
import { disenoDelLead, estudioDelLead, materialDeLeads, rondaDe, slugDiseno } from '@/lib/prueba-gratis'
import { MARCAS_AGENTE, estadosAgente, pendienteParaAgente } from '@/lib/primera-version'
import { BUCKET_MATERIAL, copiarMaterial, puedeLeerDrive } from '@/lib/drive'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const maxDuration = 60

// Webs que el agente de primera versión tiene que montar. Pública en el middleware: valida INTAKE_KEY_AGENTE.
// Pendiente = hay `web.encargo` sin `web.lista`, sin `web.error` posterior y sin `web.empezada` reciente.
// Antes de responder copia lo que falte de la carpeta de Drive (un poco; el resto lo hace el tick).
// Contrato en automatizacion.md («Agente de primera versión»).
export async function GET(req: NextRequest) {
  if (!fuenteDeClave(req.headers.get('authorization'), CLAVE_AGENTE)) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })
  try {
    const { data: encargos } = await sb.from('eventos').select('proyecto_id').eq('tipo', 'web.encargo').not('proyecto_id', 'is', null)
    // ?proyecto_id=206 limita la lista a esa web (el agente lo usa al lanzarlo a mano).
    const solo = req.nextUrl.searchParams.get('proyecto_id')
    const candidatos = Array.from(new Set((encargos || []).map(e => e.proyecto_id as number))).filter(id => !solo || String(id) === solo)
    const estados = await estadosAgente(candidatos)
    const ids = candidatos.filter(id => pendienteParaAgente(estados.get(id) || null))
    if (!ids.length) return NextResponse.json({ webs: [], caducan_en: 3600 })

    const { data: proyectos } = await sb.from('proyectos').select('id, nombre, cliente, marca, web, plan, idioma, prueba, contacto_nombre, contacto_email, lead_id, drive_folder_id, drive_url')
      .in('id', ids).in('marca', MARCAS_AGENTE)
    const leadIds = (proyectos || []).map(p => p.lead_id).filter((x): x is number => !!x)
    const { data: leads } = leadIds.length
      ? await sb.from('leads').select('id, idioma, nombre, empresa, email, interes, campos, mensaje, adjuntos').in('id', leadIds)
      : { data: [] }
    const material = await materialDeLeads(leads || [])
    const { data: pruebas } = leadIds.length
      ? await sb.from('eventos').select('lead_id, datos, created_at').in('lead_id', leadIds).eq('tipo', 'prueba.lista').order('created_at')
      : { data: [] }

    // Material de Drive: si se puede leer, se copia lo que falte antes de contestar.
    let lectura = false
    try { lectura = await puedeLeerDrive() } catch (e: any) { console.error('agente/webs-pendientes google', e?.message) }
    const conCarpeta = (proyectos || []).filter(p => p.drive_folder_id).map(p => p.id)
    if (lectura && conCarpeta.length) await copiarMaterial(conCarpeta, 25 * 1024 * 1024).catch(e => console.error('agente/webs-pendientes copia', e?.message))
    const { data: copias } = conCarpeta.length
      ? await sb.from('drive_copias').select('proyecto_id, file_id, ruta, nombre, tipo, bytes, modificado, de_cliente, storage_path, error, copiado_en').in('proyecto_id', conCarpeta).order('ruta')
      : { data: [] }
    const rutas = (copias || []).map(c => c.storage_path).filter((r): r is string => !!r)
    const { data: firmadas } = rutas.length ? await sb.storage.from(BUCKET_MATERIAL).createSignedUrls(rutas, 3600) : { data: [] }
    const urlDe = new Map(rutas.map((r, i) => [r, firmadas?.[i]?.signedUrl || null]))

    const webs = (proyectos || []).map(p => {
      const lead = (leads || []).find(l => l.id === p.lead_id) || null
      const diseno = lead ? disenoDelLead(lead) : null
      // La última portada de la prueba gratis (ronda 2 si hubo ajustes): el agente parte de ahí.
      const prueba = (pruebas || []).filter(e => e.lead_id === p.lead_id).sort((a, b) => rondaDe(a.datos) - rondaDe(b.datos) || a.created_at.localeCompare(b.created_at)).pop()
      const archivos = (copias || []).filter(c => c.proyecto_id === p.id)
      const estadoDrive = !p.drive_folder_id ? 'sin_carpeta' : !lectura ? 'sin_permiso'
        : archivos.some(c => !c.copiado_en && !c.error) ? 'copiando' : 'listo'
      const a = estados.get(p.id)!
      return {
        proyecto_id: p.id, encargado_en: a.fecha, marca: p.marca, idioma: (p.idioma || lead?.idioma) === 'en' ? 'en' : 'es', prueba: !!p.prueba,
        cliente: p.cliente, proyecto: p.nombre, web: p.web, plan: p.plan,
        contacto: { nombre: p.contacto_nombre || lead?.nombre || null, email: p.contacto_email || lead?.email || null },
        lead_id: p.lead_id, estudio: lead ? estudioDelLead(lead) : p.cliente,
        diseno, diseno_slug: diseno ? slugDiseno(diseno) : null,
        nota: 'nota' in a ? a.nota : null,
        prueba_gratis: prueba ? { url: typeof prueba.datos?.url === 'string' ? prueba.datos.url : null, ronda: rondaDe(prueba.datos), cambios: Array.isArray(prueba.datos?.cambios) ? prueba.datos.cambios : [] } : null,
        formulario: lead?.mensaje || null, interes: lead?.interes || {}, campos: lead?.campos || {},
        ...(lead ? material.get(lead.id)! : { mensajes: [], adjuntos: [] }),
        drive: {
          estado: estadoDrive, url: p.drive_url,
          archivos: archivos.map(c => ({
            file_id: c.file_id, ruta: c.ruta, carpeta: c.ruta.includes('/') ? c.ruta.split('/')[0] : null, nombre: c.nombre,
            tipo: c.tipo, bytes: c.bytes, modificado: c.modificado, de_cliente: c.de_cliente,
            url: c.storage_path ? urlDe.get(c.storage_path) ?? null : null, error: c.error,
          })),
        },
      }
    }).sort((a, b) => a.encargado_en.localeCompare(b.encargado_en))
    return NextResponse.json({ webs, caducan_en: 3600 })
  } catch (e: any) {
    console.error('agente/webs-pendientes', e?.message)
    return NextResponse.json({ error: 'interno' }, { status: 500 })
  }
}
