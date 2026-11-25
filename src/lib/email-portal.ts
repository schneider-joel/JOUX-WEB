// Email de confirmación en HTML para las marcas con portal (decisión de Joel, 2026-11-25: «con botones, no así»).
// HTML de email: tablas y estilos en línea (Gmail, Outlook y Apple Mail ignoran <style> y el CSS moderno) y sin imágenes
// (muchos clientes las bloquean): la marca es texto. Oscuro, como joelschneider.io y el dashboard (decisión de Joel,
// 2026-11-25): colores sólidos (nada de rgba, que Outlook no entiende), `bgcolor` además de `background` en cada bloque
// y `color-scheme: dark`, para que las apps que oscurecen los emails claros no lo retoquen.
// El texto plano de textoConfirmacion() va siempre al lado, como alternativa.
import { dinero, type Moneda } from '@/lib/moneda'

export type DatosEmailPortal = {
  idioma: 'es' | 'en'; nombre: string; concepto: string; moneda: Moneda | string; precio: number | null; sinIva: boolean
  plazo: string | null; portal: string; condiciones: string; version: number
  factura: { numero: string; total: number; url: string } | null
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const T = {
  en: {
    titulo: "You're all set", hola: (n: string) => `Hi ${n},`,
    intro: 'Thanks for accepting the quote. Everything for the project lives on one page: your invoice, how to pay it and how the site is coming along.',
    proyecto: 'Project', total: 'Total', pagos: 'Payments', plazo: 'Timing', sinIva: 'No VAT', masIva: '+ VAT',
    pagosTxt: (m: string) => `${m} to start · ${m} at launch`,
    abrir: 'Open your project page', factura: 'View invoice',
    facturaLista: (n: string, t: string) => `Your first invoice (${n}, ${t}) is ready on your project page, with how to pay it.`,
    facturaPronto: 'Your first invoice will appear on your project page shortly, with how to pay it.',
    terminos: (v: number) => `Terms of service (v${v})`, copia: 'Keep this email as your copy of what you accepted.', dudas: 'Questions? Just reply to this email.',
  },
  es: {
    titulo: 'Todo listo', hola: (n: string) => `Hola, ${n}:`,
    intro: 'Gracias por aceptar el presupuesto. Todo el proyecto está en una sola página: tu factura, cómo pagarla y cómo va la web.',
    proyecto: 'Proyecto', total: 'Total', pagos: 'Pagos', plazo: 'Plazo', sinIva: 'Sin IVA', masIva: '+ IVA',
    pagosTxt: (m: string) => `${m} para empezar · ${m} al publicar`,
    abrir: 'Abrir tu proyecto', factura: 'Ver la factura',
    facturaLista: (n: string, t: string) => `Tu primera factura (${n}, ${t}) ya está en tu página del proyecto, con cómo pagarla.`,
    facturaPronto: 'Tu primera factura aparecerá en breve en tu página del proyecto, con cómo pagarla.',
    terminos: (v: number) => `Condiciones del servicio (v${v})`, copia: 'Guarda este email como copia de lo que has aceptado.', dudas: '¿Dudas? Responde a este email.',
  },
}

// Los colores de joelschneider.io (personal/web) en sólido.
const C = { fondo: '#0b0b0b', tarjeta: '#121212', linea: '#232322', borde: '#3d3d3a', tinta: '#ededec', texto: '#c9c9c6', apagado: '#8f8f8b', verde: '#3dd68c' }

const FUENTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
const MONO = "ui-monospace,'SF Mono',Menlo,Consolas,monospace"

export function htmlConfirmacionPortal(d: DatosEmailPortal): string {
  const t = T[d.idioma]
  const din = (n: number, dec = false) => dinero(n, d.moneda, d.idioma, dec)
  const filas: [string, string][] = [
    [t.proyecto, d.concepto],
    ...(d.precio ? [[t.total, `${din(d.precio)} <span style="color:${C.apagado}">${d.sinIva ? t.sinIva : t.masIva}</span>`] as [string, string], [t.pagos, esc(t.pagosTxt(din(d.precio / 2, d.precio / 2 % 1 !== 0)))] as [string, string]] : []),
    ...(d.plazo ? [[t.plazo, esc(d.plazo)] as [string, string]] : []),
  ]
  const fila = ([k, v]: [string, string], i: number) => `
            <tr>
              <td style="padding:12px 0;${i ? `border-top:1px solid ${C.linea};` : ''}font:500 11px/1.4 ${MONO};letter-spacing:.06em;text-transform:uppercase;color:${C.apagado};width:110px;vertical-align:top">${esc(k)}</td>
              <td style="padding:12px 0;${i ? `border-top:1px solid ${C.linea};` : ''}font:15px/1.45 ${FUENTE};color:${C.tinta};text-align:right">${k === t.proyecto ? esc(v) : v}</td>
            </tr>`
  // Un botón por fila y sin partir el texto: en el móvil, dos botones en línea se parten en tres renglones.
  const boton = (href: string, texto: string, primario: boolean) => `
            <tr><td style="padding:0 0 10px">
              <a href="${esc(href)}" target="_blank" style="display:inline-block;white-space:nowrap;padding:13px 22px;border-radius:999px;font:600 15px/1 ${FUENTE};text-decoration:none;${primario ? `background:${C.tinta};color:${C.fondo};border:1px solid ${C.tinta}` : `background:${C.tarjeta};color:${C.tinta};border:1px solid ${C.borde}`}">${esc(texto)}</a>
            </td></tr>`
  const factura = d.factura ? t.facturaLista(d.factura.numero, din(d.factura.total, d.factura.total % 1 !== 0)) : t.facturaPronto

  return `<!doctype html>
<html lang="${d.idioma}" style="color-scheme:dark">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${esc(t.titulo)}</title></head>
<body style="margin:0;padding:0;background:${C.fondo}" bgcolor="${C.fondo}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.fondo}" style="background:${C.fondo}">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
        <tr><td style="padding:0 4px 20px;font:600 16px/1 ${FUENTE};letter-spacing:-.02em;color:${C.tinta}">joel schneider<span style="color:${C.verde}">_</span></td></tr>
        <tr><td bgcolor="${C.tarjeta}" style="background:${C.tarjeta};border:1px solid ${C.linea};border-radius:16px;padding:32px 28px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="font:600 28px/1.15 ${FUENTE};letter-spacing:-.03em;color:${C.tinta};padding-bottom:16px">${esc(t.titulo)}</td></tr>
            <tr><td style="font:15px/1.6 ${FUENTE};color:${C.texto};padding-bottom:8px">${esc(t.hola(d.nombre))}</td></tr>
            <tr><td style="font:15px/1.6 ${FUENTE};color:${C.texto};padding-bottom:24px">${esc(t.intro)}</td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.linea};border-bottom:1px solid ${C.linea};margin-bottom:24px">${filas.map(fila).join('')}
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="font:15px/1.6 ${FUENTE};color:${C.texto};padding-bottom:20px">${esc(factura)}</td></tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0">
${boton(d.portal, t.abrir, true)}${d.factura ? boton(d.factura.url, t.factura, false) : ''}
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding-top:18px;font:13px/1.6 ${FUENTE};color:${C.apagado}">
              <a href="${esc(d.condiciones)}" target="_blank" style="color:${C.apagado};text-decoration:underline">${esc(t.terminos(d.version))}</a> · ${esc(t.copia)}
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:18px 4px 0;font:13px/1.6 ${FUENTE};color:${C.apagado}">${esc(t.dudas)}<br>Joel Schneider · <a href="https://joelschneider.io" target="_blank" style="color:${C.apagado}">joelschneider.io</a></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
