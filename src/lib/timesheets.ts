// Cada cliente tiene su propio timesheet, salvo los que se agrupan acá:
// comparten pestaña y link público.
export type GrupoTimesheet = { key: string; label: string; clientes: string[] }

export type GrupoFijo = GrupoTimesheet & { ruta: string; tokenKey: string }

export const GRUPOS_FIJOS: GrupoFijo[] = [
  { key: 'ab', label: 'Ambushed / BoldMove', clientes: ['Ambushed', 'BoldMove'], ruta: 'ab', tokenKey: 'timesheet_public_token' },
  { key: 'th', label: 'Tays / Hans', clientes: ['Hans Emanuel', 'Tays Perez'], ruta: 'th', tokenKey: 'timesheet_th_public_token' },
]

export const TOKEN_CLIENTE = 'timesheet_token:'

export const grupoDeCliente = (cliente: string): GrupoTimesheet =>
  GRUPOS_FIJOS.find(g => g.clientes.includes(cliente)) || { key: `c:${cliente}`, label: cliente, clientes: [cliente] }

export const grupoDeKey = (key: string): GrupoTimesheet =>
  GRUPOS_FIJOS.find(g => g.key === key) || grupoDeCliente(key.replace(/^c:/, ''))

// Grupos fijos primero; después un timesheet por cada cliente con proyectos.
export function gruposTimesheet(proyectos: { cliente: string }[]): GrupoTimesheet[] {
  const sueltos = Array.from(new Set(proyectos.map(p => p.cliente)))
    .filter(c => !GRUPOS_FIJOS.some(g => g.clientes.includes(c)))
    .sort((a, b) => a.localeCompare(b))
  return [...GRUPOS_FIJOS, ...sueltos.map(grupoDeCliente)]
}

// Dónde vive el link público del grupo: ruta (/ab, /th o /t) y clave del token en configuracion.
export function linkPublico(grupo: GrupoTimesheet): { ruta: string; tokenKey: string } {
  const fijo = GRUPOS_FIJOS.find(g => g.key === grupo.key)
  return fijo ? { ruta: fijo.ruta, tokenKey: fijo.tokenKey } : { ruta: 't', tokenKey: TOKEN_CLIENTE + grupo.clientes[0] }
}

// Valor de la columna legacy proyectos.tipo (NOT NULL); la agrupación real es por cliente.
export const tipoLegacy = (cliente: string) => {
  const key = grupoDeCliente(cliente).key
  return key === 'ab' ? 'ambushed_boldmove' : key === 'th' ? 'tays_hans' : 'propio'
}
