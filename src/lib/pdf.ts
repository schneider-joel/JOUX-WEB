// PDF de una factura (solo servidor): imprime la vista pública /invoice/[id] con Chrome sin cabeza,
// la misma plantilla que ve el cliente. En Vercel, @sparticuz/chromium; en local, el Chrome instalado.
export async function lanzarChrome() {
  const puppeteer = (await import('puppeteer-core')).default
  if (process.env.VERCEL) {
    const chromium = (await import('@sparticuz/chromium')).default
    return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: 'shell' })
  }
  return puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
}

export async function pdfFactura(origen: string, id: number): Promise<Buffer> {
  const browser = await lanzarChrome()
  try {
    const page = await browser.newPage()
    await page.goto(`${origen}/invoice/${id}`, { waitUntil: 'load', timeout: 30000 })
    return Buffer.from(await page.pdf({ format: 'A4', printBackground: true }))
  } finally {
    await browser.close()
  }
}
