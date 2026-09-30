import type { Metadata } from 'next'
import { supabaseServer as supabase } from '@/lib/supabase-server'
import { GRUPOS_FIJOS, TOKEN_CLIENTE, grupoDeCliente, type GrupoTimesheet } from '@/lib/timesheets'
import PublicTimesheetView from './view'

export type RutaPublica = 'ab' | 'th' | 't'

// Grupo al que da acceso un token, o null si el token no es válido.
// /ab y /th tienen un token fijo cada uno; /t guarda "timesheet_token:<cliente>".
export async function grupoDeToken(ruta: RutaPublica, token: string): Promise<GrupoTimesheet | null> {
  const fijo = GRUPOS_FIJOS.find(g => g.ruta === ruta)
  if (fijo) {
    const { data } = await supabase.from('configuracion').select('valor').eq('clave', fijo.tokenKey).maybeSingle()
    return data?.valor && data.valor === token ? fijo : null
  }
  const { data } = await supabase.from('configuracion').select('clave').eq('valor', token).like('clave', `${TOKEN_CLIENTE}%`).maybeSingle()
  return data?.clave ? grupoDeCliente(data.clave.slice(TOKEN_CLIENTE.length)) : null
}

// Lo que muestra la vista previa del link (WhatsApp, iMessage, Slack...):
// el timesheet del cliente en vez de los datos del hub. Sin indexar.
export async function metadataTimesheet(ruta: RutaPublica, token: string): Promise<Metadata> {
  const grupo = await grupoDeToken(ruta, token)
  if (!grupo) return { title: 'Not found', robots: { index: false, follow: false } }
  const title = `Timesheet · ${grupo.label}`
  const description = `Joel Schneider · projects, days and invoices for ${grupo.label}`
  const image = { url: `/t/og/${ruta}/${token}`, width: 1200, height: 630, alt: title }
  return {
    title,
    description,
    robots: { index: false, follow: false },
    appleWebApp: { title },
    openGraph: { title, description, siteName: 'Joel Schneider', type: 'website', images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  }
}

const NoEncontrado = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Inter, sans-serif', color: '#888', background: '#f5f5f5' }}>
    Not found
  </div>
)

// Vista pública de solo lectura del timesheet de un grupo de clientes.
export async function PaginaTimesheet({ ruta, token }: { ruta: RutaPublica; token: string }) {
  const grupo = await grupoDeToken(ruta, token)
  if (!grupo) return <NoEncontrado />

  const { data: proyectos } = await supabase.from('proyectos').select('*').in('cliente', grupo.clientes)
  const ids = (proyectos || []).map(p => p.id)
  const [diasRes, facturasRes] = ids.length
    ? await Promise.all([
        supabase.from('dias_trabajados').select('*').in('proyecto_id', ids),
        supabase.from('facturas').select('id, proyecto_id').eq('origen', 'timesheet').in('proyecto_id', ids),
      ])
    : [{ data: [] }, { data: [] }]

  return (
    <PublicTimesheetView
      titulo={grupo.label}
      clientes={grupo.clientes}
      proyectos={proyectos || []}
      dias={diasRes.data || []}
      facturas={facturasRes.data || []}
    />
  )
}
