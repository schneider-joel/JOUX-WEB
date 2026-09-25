import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import JSZip from 'jszip'
import { supabaseServer } from '@/lib/supabase-server'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const IVA = 0.21
const RETENCION = 0.15
const limpio = (s: string) => s.replace(/[\/\\:*?"<>|#]/g, '').replace(/\s+/g, ' ').trim()
const num = (n: number) => n.toFixed(2).replace('.', ',')

async function lanzarChrome() {
  const puppeteer = (await import('puppeteer-core')).default
  if (process.env.VERCEL) {
    const chromium = (await import('@sparticuz/chromium')).default
    return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: 'shell' })
  }
  return puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
}

// ZIP con todas las facturas de venta del trimestre (PDF original si es una
// factura histórica ya declarada; si no, impresa con la plantilla de JOUX Hub),
// los archivos de las compras y un resumen CSV para el gestor.
export async function GET(req: NextRequest) {
  const cookie = cookies().get('joux_auth')?.value
  if (!cookie || !process.env.APP_PASSWORD || cookie !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const anio = Number(req.nextUrl.searchParams.get('anio'))
  const q = Number(req.nextUrl.searchParams.get('q'))
  if (!anio || q < 1 || q > 4) return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
  const ini = `${anio}-${String(q * 3 - 2).padStart(2, '0')}-01`
  const sig = q === 4 ? `${anio + 1}-01-01` : `${anio}-${String(q * 3 + 1).padStart(2, '0')}-01`

  const [{ data: facturas, error: e1 }, { data: compras, error: e2 }] = await Promise.all([
    supabaseServer.from('facturas').select('id,numero,fecha,importe,cliente,tipo_factura,estado,archivo_path,fiscal').gte('fecha', ini).lt('fecha', sig).order('fecha'),
    supabaseServer.from('compras').select('*').gte('fecha', ini).lt('fecha', sig).order('fecha'),
  ])
  if (e1 || e2) return NextResponse.json({ error: (e1 || e2)!.message }, { status: 500 })
  const ventas = (facturas || []).filter(f => f.fiscal !== false)

  const zip = new JSZip()
  const carpeta = `${anio} - T${q}`
  const nombreVenta = (f: any) => `${carpeta}/Ventas/${limpio(f.numero || `sin-numero-${f.id}`)}.pdf`

  for (const f of ventas.filter(f => f.archivo_path)) {
    const { data } = await supabaseServer.storage.from('facturas').download(f.archivo_path)
    if (data) zip.file(nombreVenta(f), Buffer.from(await data.arrayBuffer()))
  }

  const aImprimir = ventas.filter(f => !f.archivo_path)
  if (aImprimir.length) {
    let browser
    try {
      browser = await lanzarChrome()
      const cola = [...aImprimir]
      await Promise.all(Array.from({ length: Math.min(4, cola.length) }, async () => {
        const page = await browser!.newPage()
        for (let f = cola.shift(); f; f = cola.shift()) {
          await page.goto(`${req.nextUrl.origin}/invoice/${f.id}`, { waitUntil: 'load', timeout: 30000 })
          zip.file(nombreVenta(f), Buffer.from(await page.pdf({ format: 'A4', printBackground: true })))
        }
        await page.close()
      }))
    } catch (e: any) {
      return NextResponse.json({ error: `No se pudieron generar los PDF: ${e.message}` }, { status: 500 })
    } finally {
      await browser?.close()
    }
  }

  for (const c of compras || []) {
    if (!c.archivo_path) continue
    const { data } = await supabaseServer.storage.from('compras').download(c.archivo_path)
    const ext = (c.archivo_path.split('.').pop() || 'pdf').toLowerCase()
    if (data) zip.file(`${carpeta}/Compras/${c.fecha} ${limpio(c.proveedor)}-${c.id}.${ext}`, Buffer.from(await data.arrayBuffer()))
  }

  const filas = ['Tipo;Número;Fecha;Cliente/Proveedor;Base;IVA;Retención;Total;Estado']
  for (const f of ventas) {
    const base = Number(f.importe)
    const ue = f.tipo_factura === 'dentro_ue'
    const iva = ue ? base * IVA : 0, ret = ue ? base * RETENCION : 0
    filas.push(['Venta', f.numero || '', f.fecha, f.cliente, num(base), num(iva), num(ret), num(base + iva - ret), f.estado].join(';'))
  }
  for (const c of compras || []) {
    const base = Number(c.base), iva = base * Number(c.iva_pct) / 100
    filas.push(['Compra', '', c.fecha, c.proveedor, num(base), num(iva), '0,00', num(base + iva), `deducible ${Number(c.deducible_pct)}%`].join(';'))
  }
  zip.file(`${carpeta}/Resumen.csv`, '﻿' + filas.join('\n'))

  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  return new NextResponse(new Uint8Array(buf), {
    headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${carpeta}.zip"` },
  })
}
