// Rutas del hub (fase 1 del rediseño): cada pestaña antigua del Overview tiene ahora su ruta.
// Lo usan el hub (qué pantalla pintar), el marco (menú y migas) y las redirecciones de los
// enlaces viejos (/?tab=…, que siguen saliendo en las notificaciones y en la vuelta del banco).
// Solo presentación: no lee ni escribe datos.

// Pestañas sin marca → ruta. Las de marca son `ts:<key>` (treatments) y `mk:<key>` (webs): /work/<key>.
export const RUTA_TAB: Record<string, string> = {
  dashboard: '/',
  facturas: '/finanzas/facturas',
  compras: '/finanzas/compras',
  impuestos: '/finanzas/impuestos',
  bancos: '/finanzas/bancos',
  presupuesto: '/finanzas/presupuesto',
  clientes: '/finanzas/clientes',
  compartidos: '/compartidos',
}

export function rutaDeTab(tab: string): string | null {
  if (RUTA_TAB[tab]) return RUTA_TAB[tab]
  const m = tab.match(/^(ts|mk):([\w-]+)$/)
  return m ? `/work/${m[2]}` : null
}

// Ruta → pestaña. En /work/<key> hace falta saber si la marca es de webs (precio cerrado) o de treatments.
export function tabDeRuta(ruta: string, esWeb: (key: string) => boolean): string {
  const m = ruta.match(/^\/work\/([\w-]+)\/?$/)
  if (m) return `${esWeb(m[1]) ? 'mk' : 'ts'}:${m[1]}`
  const limpia = ruta.replace(/\/$/, '') || '/'
  return Object.keys(RUTA_TAB).find(t => RUTA_TAB[t] === limpia) || 'dashboard'
}
