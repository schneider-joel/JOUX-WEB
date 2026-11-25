// Moneda de presupuestos, proyectos y facturas (portal del cliente, 2026-11-25). EUR por defecto; USD para clientes
// de EE. UU. Usable en el navegador.
export type Moneda = 'EUR' | 'USD'
export const MONEDAS: Moneda[] = ['EUR', 'USD']
export const esMoneda = (m: unknown): m is Moneda => m === 'EUR' || m === 'USD'

// 3.500 € en español, €3,500 / $3,500 en inglés. Sin decimales si el importe es redondo.
export function dinero(n: number, moneda: Moneda | string | null | undefined = 'EUR', idioma: string = 'es', decimales?: boolean) {
  const m = esMoneda(moneda) ? moneda : 'EUR'
  const loc = idioma === 'en' ? (m === 'USD' ? 'en-US' : 'en-GB') : 'es-ES'
  const dec = decimales ?? n % 1 !== 0
  return new Intl.NumberFormat(loc, {
    style: 'currency', currency: m, minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0, useGrouping: 'always',
  } as Intl.NumberFormatOptions).format(n)
}
