// Subdominio de cada marca para lo que ve el cliente (decisión de Joel, 2026-11-03): presupuesto.<dominio>/<token>
// y presupuesto.<dominio>/condiciones (Custom: project.joelschneider.io desde el 2026-11-25, porque con el portal el
// enlace es la página del proyecto, no solo el presupuesto). Apuntan a este mismo proyecto de Vercel; el middleware solo deja abrir ahí
// el presupuesto y las condiciones de esa marca. Sin dependencias: lo usa también el middleware (edge).
export const DOMINIO_PRESUPUESTO: Record<string, string> = {
  arkevo: 'presupuesto.arkevostudio.com',
  cartela: 'presupuesto.cartela.live',
  custom: 'project.joelschneider.io',
}

// Subdominios que ya no se usan: el middleware los manda al nuevo con la misma ruta, para que los enlaces viejos sigan.
export const DOMINIO_ANTIGUO: Record<string, string> = {
  'presupuesto.joelschneider.io': 'project.joelschneider.io',
}

// La web de la marca, adonde va cualquier otra ruta del subdominio.
export const WEB_MARCA: Record<string, string> = {
  arkevo: 'https://arkevostudio.com', cartela: 'https://cartela.live', custom: 'https://joelschneider.io',
}

export function marcaDeHost(host: string | null | undefined): string | null {
  const h = (host || '').split(':')[0].toLowerCase()
  return Object.keys(DOMINIO_PRESUPUESTO).find(m => DOMINIO_PRESUPUESTO[m] === h) || null
}
