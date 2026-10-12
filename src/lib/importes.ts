// Lo que el cliente paga realmente por una factura: con IVA 21 % y retención 15 % si es de
// España (tipo_factura 'dentro_ue'); sin IVA ni retención en el resto. Sin dependencias de
// servidor, para poder usarlo en componentes del navegador (lib/conciliar.ts no se puede).
export const IVA = 0.21
export const RETENCION = 0.15
export const totalACobrar = (f: { importe: number; tipo_factura?: string | null }) =>
  Math.round(Number(f.importe) * (f.tipo_factura === 'dentro_ue' ? 1 + IVA - RETENCION : 1) * 100) / 100

// Desglose de una base con IVA y retención (solo clientes de España); null si no aplica.
export const desglose = (base: number, espana: boolean) => {
  if (!espana) return null
  const iva = Math.round(base * IVA * 100) / 100
  const ret = Math.round(base * RETENCION * 100) / 100
  return { base, iva, ret, total: Math.round((base + iva - ret) * 100) / 100 }
}
export const desgloseFactura = (f: { importe: number; tipo_factura?: string | null }) => desglose(Number(f.importe), f.tipo_factura === 'dentro_ue')
