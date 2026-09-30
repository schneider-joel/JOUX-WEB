import { ImageResponse } from 'next/og'
import { grupoDeToken, type RutaPublica } from '../../../cargar'

export const dynamic = 'force-dynamic'

// Imagen de la vista previa del link público (1200×630). Solo se genera con
// un token válido, para que no sirva como generador de imágenes con texto libre.
export async function GET(_req: Request, { params }: { params: { ruta: string; token: string } }) {
  if (!['ab', 'th', 't'].includes(params.ruta)) return new Response('Not found', { status: 404 })
  const grupo = await grupoDeToken(params.ruta as RutaPublica, params.token)
  if (!grupo) return new Response('Not found', { status: 404 })

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '72px 80px', background: '#f5f5f5', fontFamily: 'sans-serif', color: '#111' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #fb923c 0%, #c2410c 100%)', color: '#fff', fontSize: 38, fontWeight: 700 }}>J</div>
          <div style={{ fontSize: 32, color: '#666' }}>Joel Schneider</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 34, color: '#c2410c', fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase' }}>Timesheet</div>
          <div style={{ fontSize: grupo.label.length > 22 ? 76 : 96, fontWeight: 700, lineHeight: 1.05, marginTop: 12 }}>{grupo.label}</div>
        </div>
        <div style={{ fontSize: 28, color: '#888' }}>Projects · days · invoices</div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
