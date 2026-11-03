// Subdominio de cada marca para lo que ve el cliente (decisión de Joel, 2026-11-03): presupuesto.<dominio>/<token>
// y presupuesto.<dominio>/condiciones. Apuntan a este mismo proyecto de Vercel; el middleware solo deja abrir ahí
// el presupuesto y las condiciones de esa marca. Sin dependencias: lo usa también el middleware (edge).
export const DOMINIO_PRESUPUESTO: Record<string, string> = {
  arkevo: 'presupuesto.arkevostudio.com',
  cartela: 'presupuesto.cartela.live',
  custom: 'presupuesto.joelschneider.io',
}

// La web de la marca, adonde va cualquier otra ruta del subdominio.
export const WEB_MARCA: Record<string, string> = {
  arkevo: 'https://arkevostudio.com', cartela: 'https://cartela.live', custom: 'https://joelschneider.io',
}

export function marcaDeHost(host: string | null | undefined): string | null {
  const h = (host || '').split(':')[0].toLowerCase()
  return Object.keys(DOMINIO_PRESUPUESTO).find(m => DOMINIO_PRESUPUESTO[m] === h) || null
}
