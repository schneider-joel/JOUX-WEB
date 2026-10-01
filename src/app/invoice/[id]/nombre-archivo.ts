// "F-2026-62 - Tays Perez": nombre del PDF al imprimir / guardar la factura.
export const nombreArchivoFactura = (numero?: string | null, cliente?: string | null) =>
  [numero || 'Factura', cliente].filter(Boolean).join(' - ').replace(/[\/\\:*?"<>|#]/g, '').replace(/\s+/g, ' ').trim()
