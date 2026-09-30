// País fiscal del cliente → formato de la factura. España lleva IVA 21% y
// retención 15% (tipo_factura 'dentro_ue'); UE y fuera de la UE van sin IVA
// ni retención ('fuera_ue').
export type PaisFiscal = 'ES' | 'UE' | 'EXT'

export const PAISES: { value: PaisFiscal; label: string }[] = [
  { value: 'ES', label: 'España · IVA 21% + retención 15%' },
  { value: 'UE', label: 'Unión Europea · sin IVA' },
  { value: 'EXT', label: 'Fuera de la UE · sin IVA' },
]

export const tipoFacturaDePais = (pais?: string | null): 'dentro_ue' | 'fuera_ue' =>
  pais === 'ES' ? 'dentro_ue' : 'fuera_ue'

const EXTRANJERO = /\b(uk|united kingdom|england|london|wimbledon|usa|united states|california|los angeles|new york|canada|australia|argentina|buenos aires|m[eé]xico|brasil|brazil|chile|colombia|uruguay|switzerland|suiza|norway|noruega)\b/i
const UE = /\b(france|francia|paris|germany|alemania|deutschland|berlin|italy|italia|portugal|lisboa|lisbon|netherlands|pa[ií]ses bajos|amsterdam|belgium|b[eé]lgica|ireland|irlanda|dublin|austria|sweden|suecia|denmark|dinamarca|poland|polonia|greece|grecia)\b/i
const ESPANA = /\b(españa|espana|spain|madrid|barcelona|valencia|sevilla|málaga|malaga|bilbao|zaragoza|alicante)\b/i
// NIF, NIE y CIF españoles.
const ID_ESPANOL = /\b(\d{8}[A-Z]|[XYZ]\d{7}[A-Z]|[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J])\b/i

// Sugerencia a partir de la dirección y el identificador; null si no hay pistas.
export function detectarPais(identificador = '', direccion = ''): PaisFiscal | null {
  if (EXTRANJERO.test(direccion)) return 'EXT'
  if (UE.test(direccion)) return 'UE'
  if (ESPANA.test(direccion) || ID_ESPANOL.test(identificador)) return 'ES'
  return null
}
