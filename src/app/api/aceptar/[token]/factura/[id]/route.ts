import { NextResponse } from 'next/server'
import { portalDeToken } from '@/lib/portal'
import { pdfFactura } from '@/lib/pdf'
import { nombreArchivoFactura } from '@/app/invoice/[id]/nombre-archivo'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache.
export const fetchCache = 'force-no-store'
// Chrome sin cabeza tarda unos segundos en imprimir la factura.
export const maxDuration = 60

// «Descargar PDF» del portal del cliente. Pública (el token del presupuesto es la llave), pero solo sirve las
// facturas de ese proyecto: las mismas que enseña el dashboard (portalDeToken). Imprime la vista pública firmada.
export async function GET(req: Request, { params }: { params: { token: string; id: string } }) {
  const d = await portalDeToken(params.token)
  const f = d?.facturas.find(x => String(x.id) === params.id)
  if (!d || !f) return NextResponse.json({ error: 'enlace' }, { status: 404 })
  const pdf = await pdfFactura(new URL(req.url).origin, f.id).catch(e => { console.error('portal/pdf', e?.message); return null })
  if (!pdf) return NextResponse.redirect(new URL(f.url, req.url))   // sin PDF, la factura en el navegador
  const nombre = `${nombreArchivoFactura(f.numero, d.cliente?.nombre || d.lead?.nombre || '')}.pdf`
  return new NextResponse(new Uint8Array(pdf), { headers: {
    'Content-Type': 'application/pdf', 'Cache-Control': 'private, no-store',
    'Content-Disposition': `attachment; filename="${nombre.replace(/[^\w .·-]/g, '')}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
  } })
}
