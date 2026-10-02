// Clasificación de movimientos bancarios (compartido entre servidor y navegador).
//
// clase: 'cobro' (pago de un cliente, ligado a facturas) · 'ingreso' (otro
// ingreso) · 'interno' (traspaso entre tus cuentas) · 'personal' (amigos,
// Bizum: no es actividad) · 'reembolso' (te devuelven parte de un gasto
// compartido, p. ej. la pareja la mitad del alquiler) · 'gasto'.
// categoria: nombre de una partida del presupuesto (fijos o variables).
// trabajo: gasto de la actividad (debería tener su factura en Compras).

export type Clase = 'cobro' | 'ingreso' | 'interno' | 'personal' | 'reembolso' | 'gasto'

export type MovimientoBase = {
  importe: number
  contraparte: string | null
  concepto: string | null
}

export type Regla = { id?: number; patron: string; clase: string | null; categoria: string | null; trabajo: boolean | null }

export const CLASES: { value: Clase; label: string }[] = [
  { value: 'cobro', label: 'Cobro de cliente' },
  { value: 'ingreso', label: 'Otro ingreso' },
  { value: 'gasto', label: 'Gasto' },
  { value: 'interno', label: 'Traspaso entre mis cuentas' },
  { value: 'reembolso', label: 'Me devuelven un gasto compartido' },
  { value: 'personal', label: 'Personal (amigos, Bizum)' },
]

// Nombre legible del comercio o la contraparte. El BBVA lo pone al final del
// concepto ("PAGO CON TARJETA EN ... // PAGO CON TARJETA // COMERCIO") y Wise
// dentro de "Card transaction of X EUR issued by COMERCIO CIUDAD".
export function comercio(m: MovimientoBase): string {
  if (m.contraparte && !/^\*+$/.test(m.contraparte)) return m.contraparte
  const concepto = (m.concepto || '').trim()
  const wise = concepto.match(/issued by (.+)$/i)
  if (wise) return wise[1].replace(/\s+[A-Z]{3,}$/, '').trim()
  const partes = concepto.split(' // ').map(p => p.trim()).filter(Boolean)
  return partes[partes.length - 1] || 'Movimiento'
}

export const textoDe = (m: MovimientoBase) => `${m.contraparte || ''} ${m.concepto || ''}`.toLowerCase()

type Regla0 = { re: RegExp; clase?: Clase; categoria?: string; trabajo?: boolean; soloIngresos?: boolean; soloGastos?: boolean }

// Reglas por defecto. Las del usuario (tabla reglas_movimientos) van antes.
// Las categorías tienen que llamarse igual que las partidas del presupuesto.
const REGLAS: Regla0[] = [
  // Traspasos entre cuentas propias
  { re: /schneider/, clase: 'interno' },
  { re: /\btraspaso\b|top-up by|moved [\d.,]+ eur (to|from)/, clase: 'interno' },
  { re: /^revolut\b|\/\/ revolut\b/, clase: 'interno', soloGastos: true },
  // Bizum y similares: cuentas con amigos
  { re: /\bbizum\b/, clase: 'personal' },
  // Otros ingresos
  { re: /bonificaci|cashback|intereses/, clase: 'ingreso', soloIngresos: true },
  // Pagos a Hacienda (el banco los identifica con el NRC del pago)
  { re: /^nrc\b|\bnrc\.? \d|agencia tributaria|aeat/, clase: 'gasto', categoria: 'Impuestos' },
  // Fijos
  { re: /\balquiler\b/, clase: 'gasto', categoria: 'Alquiler' },
  { re: /tgss|seguridad social/, clase: 'gasto', categoria: 'Cuota autónomo' },
  { re: /asesor/, clase: 'gasto', categoria: 'Gestor', trabajo: true },
  { re: /orange energia|iberdrola|endesa|naturgy|holaluz|repsol luz|octopus/, clase: 'gasto', categoria: 'Luz' },
  { re: /aguas|emivasa|aigües/, clase: 'gasto', categoria: 'Agua' },
  { re: /vivagym|basic.?fit|anytime fitness|\bgym\b/, clase: 'gasto', categoria: 'Gym' },
  { re: /youtube|google one|amazon prime|apple\.com|spotify|netflix|tvmia|disney|hbo|max\.com/, clase: 'gasto', categoria: 'Suscripciones' },
  // Herramientas de trabajo
  { re: /anthropic|claude|framer|readymag|adobe|shopify|dropbox|spaceship|holded|lemsqzy|screenstudio|figma|notion|openai|vercel|github|supabase/, clase: 'gasto', categoria: 'Suscripciones', trabajo: true },
  { re: /digi spain/, clase: 'gasto', trabajo: true },
  // Variables
  { re: /mercadona|consum|carrefour|lidl|aldi|\bdia\b|alcampo|eroski|supermercado|hipercor|merkaplaya|merca\b|hundred merca|nanking|frutas|verdura/, clase: 'gasto', categoria: 'Supermercado' },
  { re: /uber|cabify|\bbolt\b|renfe|fgv|metrovalencia|emt valencia|valenbisi|taxi|omio|blablacar|alsa|gasolin|cepsa|parking|\be\.s\./, clase: 'gasto', categoria: 'Transporte' },
  { re: /zara|h&m|pull ?& ?bear|bershka|mango|primark|levi|nike|adidas|decathlon|stradivarius|massimo|bolseria/, clase: 'gasto', categoria: 'Ropa' },
  { re: /farmacia|druni|primor|afflelou|optica|peluquer|barber|melenas/, clase: 'gasto', categoria: 'Farmacia / Personal' },
  { re: /\bbar\b|\bcaf[eé]|cafeteria|cerveceria|restaurante|kebab|\bpub\b|glovo|just eat|kfc|mcdonald|burger|pizza|horchateria|gastro|tapas|\bcines?\b|steam|fourvenues|\bshots\b|piano bar|zettle|sumup|garnatxa|sequer|estanco|padel/, clase: 'gasto', categoria: 'Ocio / Bares / Salidas' },
  { re: /amazon|aliexpress|temu|bazar|sui xin|ferreteria|ikea|card delivery fee|comision/, clase: 'gasto', categoria: 'Imprevistos / Amazon' },
]

export function clasificar(m: MovimientoBase, reglasUsuario: Regla[]): { clase: Clase; categoria: string | null; trabajo: boolean } {
  const texto = textoDe(m)
  const ingreso = Number(m.importe) > 0
  for (const r of reglasUsuario) {
    if (r.patron && texto.includes(r.patron.toLowerCase())) {
      return { clase: (r.clase as Clase) || (ingreso ? 'ingreso' : 'gasto'), categoria: r.categoria, trabajo: !!r.trabajo }
    }
  }
  // Primero contra el nombre del comercio; si nada encaja, contra todo el
  // texto. Así "AMAZON" gana a la descripción genérica del banco ("PAGO CON
  // TARJETA EN RESTAURANTES Y CAFETERIAS", que a veces viene mal).
  for (const t of [comercio(m).toLowerCase(), texto]) {
    for (const r of REGLAS) {
      if ((r.soloIngresos && !ingreso) || (r.soloGastos && ingreso)) continue
      // Un abono de un comercio (devolución) sigue siendo de su categoría y resta gasto.
      if (r.re.test(t)) return { clase: r.clase || (ingreso ? 'ingreso' : 'gasto'), categoria: r.categoria || null, trabajo: !ingreso && !!r.trabajo }
    }
  }
  return { clase: ingreso ? 'ingreso' : 'gasto', categoria: null, trabajo: false }
}

// Palabras que identifican a un cliente o proveedor en el texto del banco.
const VACIAS = new Set(['limited', 'ltd', 'productions', 'production', 'creative', 'makers', 'barcelona', 'madrid', 'valencia', 'company', 'iberica', 'spain', 'technologies', 'tributarios', 'asesores'])
export function palabrasClave(nombres: (string | null | undefined)[], minimo = 4): string[] {
  const out = new Set<string>()
  for (const n of nombres) {
    for (const w of (n || '').toLowerCase().replace(/[.,·*]/g, ' ').split(/\s+/)) {
      if (w.length >= minimo && !VACIAS.has(w) && !/\d/.test(w)) out.add(w)
    }
  }
  return Array.from(out)
}
