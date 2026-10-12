// Marcas: cómo se factura cada parte del negocio. Espejo de la futura tabla `marcas`
// (key, nombre, modo, dominio): una agencia nueva es una fila, sin tocar código.
// - modo 'cerrado' = agencia de nicho (Arkevo…): precio cerrado, 50 % al empezar y 50 % al publicar.
//   Sus clientes no van a Timesheets sino a la sección «Agencias», una pestaña por marca.
// - 'dia' / 'hora' = trabajo con timesheet (a mi nombre, Ambushed/BoldMove).
// Con ?demo=marcas se ven datos de ejemplo y no se escribe nada.
export type ModoMarca = 'cerrado' | 'dia' | 'hora'
export type Marca = { key: string; nombre: string; modo: ModoMarca; dominio: string | null }
export type PaisFiscal = 'ES' | 'UE' | 'EXT'

// Un pago del proyecto = una factura propia (numeración correlativa) cuando se factura.
export type Pago = { estado: 'sin_facturar' | 'pendiente' | 'cobrada'; numero?: string; fecha?: string; facturaId?: number }

// Un cliente de agencia = un proyecto de precio cerrado con dos pagos (no dos proyectos).
export type ProyectoAgencia = {
  id: number; marca: string; cliente: string
  web: string                          // dominio de la web que se le hace
  plan: string
  precio: number                       // base, sin impuestos
  pais: PaisFiscal | null              // null = el cliente aún no tiene datos fiscales
  pagos: [Pago, Pago]
}

// Proyecto real (columnas de la migración de marcas) → fila de agencia, con sus dos facturas por `pago`.
type ProyectoBD = { id: number; cliente: string; nombre: string; marca?: string | null; web?: string | null; plan?: string | null; precio_cerrado?: number | string | null }
type FacturaBD = { id: number; proyecto_id?: number | null; pago?: number | null; numero?: string | null; fecha: string; estado: string }
export const aProyectoAgencia = (p: ProyectoBD, facturas: FacturaBD[], clientes: { cliente: string; pais?: string | null }[]): ProyectoAgencia => {
  const pago = (n: 1 | 2): Pago => {
    const f = facturas.find(x => x.proyecto_id === p.id && x.pago === n)
    return f ? { estado: f.estado === 'cobrada' ? 'cobrada' : 'pendiente', numero: f.numero || undefined, fecha: f.fecha, facturaId: f.id } : { estado: 'sin_facturar' }
  }
  return {
    id: p.id, marca: p.marca || '', cliente: p.cliente, web: p.web || p.nombre, plan: p.plan || '',
    precio: Number(p.precio_cerrado || 0),
    pais: (clientes.find(c => c.cliente === p.cliente)?.pais as PaisFiscal | undefined) || null,
    pagos: [pago(1), pago(2)],
  }
}

export const esAgencia = (m: Pick<Marca, 'modo'>) => m.modo === 'cerrado'
export const ETIQUETA_PAGO = ['50 % al empezar', '50 % al publicar'] as const

export const demoMarcasActivo = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === 'marcas'

export const DEMO_MARCAS: Marca[] = [
  { key: 'arkevo', nombre: 'Arkevo', modo: 'cerrado', dominio: 'arkevostudio.com' },
  { key: 'clinic', nombre: 'Clinic (ejemplo)', modo: 'cerrado', dominio: null },
  { key: 'joel', nombre: 'Joel Schneider', modo: 'dia', dominio: 'joelschneider.io' },
  { key: 'ab', nombre: 'Ambushed / BoldMove', modo: 'hora', dominio: null },
]

const anio = new Date().getFullYear()
export const DEMO_PROYECTOS: ProyectoAgencia[] = [
  { id: -1, marca: 'arkevo', cliente: 'Estudio Ejemplo SL', web: 'estudioejemplo.es', plan: 'Studio', precio: 3900, pais: 'ES',
    pagos: [{ estado: 'cobrada', numero: `F-${anio}-31`, fecha: `${anio}-09-02` }, { estado: 'pendiente', numero: `F-${anio}-36`, fecha: `${anio}-10-06` }] },
  { id: -2, marca: 'arkevo', cliente: 'Construcciones Muestra SA', web: 'construccionesmuestra.com', plan: 'Essential', precio: 990, pais: 'ES',
    pagos: [{ estado: 'pendiente', numero: `F-${anio}-35`, fecha: `${anio}-10-01` }, { estado: 'sin_facturar' }] },
  { id: -3, marca: 'arkevo', cliente: 'Muestra Architects Ltd', web: 'muestra-architects.co.uk', plan: 'Signature', precio: 8500, pais: 'EXT',
    pagos: [{ estado: 'sin_facturar' }, { estado: 'sin_facturar' }] },
  { id: -4, marca: 'clinic', cliente: 'Clínica Dental Ejemplo SL', web: 'clinicaejemplo.es', plan: 'Studio', precio: 2500, pais: 'ES',
    pagos: [{ estado: 'sin_facturar' }, { estado: 'sin_facturar' }] },
]

// Facturas de ejemplo para la tarjeta «Ingresos por marca» (ya con su columna `marca`).
const hoy = new Date().toISOString().slice(0, 10)
export const DEMO_FACTURAS = [
  { id: -1, cliente: 'Estudio Ejemplo SL', importe: 1950, fecha: hoy, estado: 'cobrada', tipo_factura: 'dentro_ue', marca: 'arkevo' },
  { id: -2, cliente: 'Estudio Ejemplo SL', importe: 1950, fecha: hoy, estado: 'pendiente', tipo_factura: 'dentro_ue', marca: 'arkevo' },
  { id: -3, cliente: 'Construcciones Muestra SA', importe: 495, fecha: hoy, estado: 'pendiente', tipo_factura: 'dentro_ue', marca: 'arkevo' },
  { id: -4, cliente: 'Hans Emanuel', importe: 2400, fecha: hoy, estado: 'cobrada', tipo_factura: 'fuera_ue', marca: 'joel' },
  { id: -5, cliente: 'Tays Perez', importe: 1800, fecha: hoy, estado: 'pendiente', tipo_factura: 'fuera_ue', marca: 'joel' },
  { id: -6, cliente: 'Ambushed', importe: 5320, fecha: hoy, estado: 'cobrada', tipo_factura: 'fuera_ue', marca: 'ab' },
  { id: -7, cliente: 'BoldMove', importe: 1260, fecha: hoy, estado: 'pendiente', tipo_factura: 'fuera_ue', marca: 'ab' },
]

// Siguiente número correlativo del año a partir de las facturas cargadas (solo para la vista previa;
// el número real lo pone siguiente_numero_factura() en la base de datos).
export const siguienteNumero = (numeros: (string | undefined | null)[], year = anio) => {
  const n = numeros.reduce((max, x) => {
    const m = x?.match(new RegExp(`^F-${year}-(\\d+)$`))
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
  return `F-${year}-${n + 1}`
}
