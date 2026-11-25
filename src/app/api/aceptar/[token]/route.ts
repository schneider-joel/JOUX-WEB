import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { aceptarPresupuesto } from '@/lib/presupuestos'
import { htmlConfirmacionPortal, type DatosEmailPortal } from '@/lib/email-portal'
import { textoConfirmacion } from '@/lib/presupuestos'
import { enviarGmail } from '@/lib/gmail'
import { remitenteLead } from '@/lib/remitentes'
import { CORREOS_PRUEBA } from '@/lib/leads'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache.
export const fetchCache = 'force-no-store'
// Ganar el lead (con su carpeta de Drive) y la confirmación por Gmail siguen tras responder.
export const maxDuration = 60

// Aceptación pública de un presupuesto (/aceptar/<token>). Público en el middleware: el token es la llave.
// La IP y el navegador van a la prueba de la aceptación. Errores con claves cortas que traduce la página.
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'datos' }, { status: 400 })
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null
  const r = await aceptarPresupuesto(params.token, { nombre: String(body.nombre ?? ''), acepto: body.acepto === true, ip, ua: req.headers.get('user-agent') })
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })
  if (r.despues) waitUntil(r.despues())
  return NextResponse.json({ ok: true })
}

// Vista previa del email de confirmación del portal, con datos de ejemplo: /api/aceptar/demo-email (solo en local).
// ?lang=es en español; ?sin=factura como sale si la factura aún no se ha podido emitir; ?enviar=1 la manda al correo de pruebas.
export async function GET(req: Request, { params }: { params: { token: string } }) {
  if (params.token !== 'demo-email' || process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'enlace' }, { status: 404 })
  const q = new URL(req.url).searchParams
  const d: DatosEmailPortal = {
    idioma: q.get('lang') === 'es' ? 'es' : 'en', nombre: 'Alex', concepto: 'Alex Rivera · director website', moneda: 'USD', precio: 3500, sinIva: true,
    plazo: '3–4 weeks from the list of spots', portal: 'https://project.joelschneider.io/demo', condiciones: 'https://project.joelschneider.io/condiciones/2?lang=en', version: 2,
    factura: q.get('sin') === 'factura' ? null : { numero: 'F-2026-91', total: 1750, url: 'https://project.joelschneider.io/invoice/91' },
  }
  const html = htmlConfirmacionPortal(d)
  // ?enviar=1: la manda de verdad, con el alias de Custom, pero solo al correo de pruebas (para verla en Gmail).
  if (q.get('enviar') === '1') {
    const de = remitenteLead('custom', d.idioma)
    if (!de) return NextResponse.json({ error: 'Sin remitente' }, { status: 400 })
    const texto = textoConfirmacion({ marca: 'custom', idioma: d.idioma, modo: 'cerrado', concepto: d.concepto, precio: 3500, tarifa_dia: null, dias: null, token: 'demo', moneda: 'USD', sin_iva: true }, { marca: 'custom', version: 2, idioma: 'en' }, 'Alex Rivera', 'Joel Schneider', !!d.factura)
    const r = await enviarGmail({ de, para: CORREOS_PRUEBA[0], asunto: `[Prueba] ${texto.asunto}`, texto: texto.cuerpo, html })
    return NextResponse.json({ ok: true, para: CORREOS_PRUEBA[0], id: r.id })
  }
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
