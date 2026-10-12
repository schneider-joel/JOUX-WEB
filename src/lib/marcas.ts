// Marcas (Arkevo, y las que vengan): una marca NO es un cliente, es un negocio que tiene clientes.
// Pestaña = marca; dentro, una sección por cliente y debajo sus proyectos (de precio cerrado, 50 % / 50 %).
// De momento los datos reales no tienen `marca`; con ?demo=marcas se ve la pestaña con datos de ejemplo.
export type Marca = { key: string; nombre: string }
export type PaisFiscal = 'ES' | 'UE' | 'EXT'
export type Hito = 'sin_facturar' | 'pendiente' | 'cobrada'
export type ProyectoMarca = {
  id: number; marca: string; cliente: string; nombre: string; plan: string
  precio: number                      // base, sin impuestos
  pais: PaisFiscal
  estado: 'activo' | 'completado' | 'facturado'
  inicio: Hito; fin: Hito             // factura del 50 % al empezar y del 50 % al publicar
}

export const demoMarcasActivo = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === 'marcas'

export const DEMO_MARCAS: Marca[] = [
  { key: 'arkevo', nombre: 'Arkevo' },
  { key: 'clinicas', nombre: 'Clínicas (ejemplo)' },
]

export const DEMO_PROYECTOS: ProyectoMarca[] = [
  { id: -1, marca: 'arkevo', cliente: 'Estudio Ejemplo SL', nombre: 'Web Estudio Ejemplo', plan: 'Studio', precio: 3900, pais: 'ES', estado: 'activo', inicio: 'cobrada', fin: 'sin_facturar' },
  { id: -2, marca: 'arkevo', cliente: 'Estudio Ejemplo SL', nombre: 'Landing concurso', plan: 'Essential', precio: 990, pais: 'ES', estado: 'completado', inicio: 'cobrada', fin: 'pendiente' },
  { id: -3, marca: 'arkevo', cliente: 'Construcciones Muestra', nombre: 'Web Construcciones Muestra', plan: 'Essential', precio: 990, pais: 'ES', estado: 'activo', inicio: 'pendiente', fin: 'sin_facturar' },
  { id: -4, marca: 'arkevo', cliente: 'Muestra Architects Ltd', nombre: 'Website Muestra', plan: 'Signature', precio: 8500, pais: 'EXT', estado: 'activo', inicio: 'sin_facturar', fin: 'sin_facturar' },
  { id: -5, marca: 'clinicas', cliente: 'Clínica Dental Ejemplo', nombre: 'Web Clínica Ejemplo', plan: 'Studio', precio: 2500, pais: 'ES', estado: 'activo', inicio: 'pendiente', fin: 'sin_facturar' },
]

// Lo que paga realmente el cliente por una base: con IVA 21 % y retención 15 % si es de España.
export const aCobrar = (base: number, pais: PaisFiscal) => Math.round(base * (pais === 'ES' ? 1 + 0.21 - 0.15 : 1) * 100) / 100
