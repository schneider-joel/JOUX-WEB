// "F-2026-62 - Tays Perez": nombre del PDF al imprimir / guardar la factura.
export const nombreArchivoFactura = (numero?: string | null, cliente?: string | null) =>
  [numero || 'Factura', cliente].filter(Boolean).join(' - ').replace(/[\/\\:*?"<>|#]/g, '').replace(/\s+/g, ' ').trim()

// "JOEL SCHNEIDER - AMBUSHED - 268": al abrirla desde la pestaña del cliente
// (?ref=1), con el nº de referencia del proyecto que usa el cliente.
export const nombreArchivoRef = (emisor: string, cliente: string, ref: string) =>
  [emisor, cliente, ref].join(' - ').toUpperCase().replace(/[\/\\:*?"<>|#]/g, '').replace(/\s+/g, ' ').trim()
