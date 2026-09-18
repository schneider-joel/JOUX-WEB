import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export type Cuenta = {
  id: number
  nombre: string
  saldo: number
  color: string
  tipo: string
  orden: number
}

export type Crypto = {
  id: number
  symbol: string
  nombre: string
  cantidad: number
}

export type Factura = {
  id: number
  numero?: string
  cliente: string
  descripcion?: string
  concepto_detalle?: string
  importe: number
  fecha: string
  fecha_vencimiento?: string
  fecha_cobro?: string
  estado: 'pendiente' | 'cobrada'
  cuenta_destino_id?: number
  origen: string
  notion_proyecto?: string
  proyecto_id?: number
  numero_referencia?: string
  idioma?: 'es' | 'en'
}

export type ClienteFiscal = {
  cliente: string
  identificador?: string
  direccion?: string
}

export type PresupuestoItem = {
  id: number
  nombre: string
  limite: number
  gastado: number
  mes: string
}

export type TipoProyecto = 'ambushed_boldmove' | 'propio'
export type StatusProyecto = 'activo' | 'completado' | 'facturado'

export type Proyecto = {
  id: number
  nombre: string
  tipo: TipoProyecto
  cliente: string
  status: StatusProyecto
  numero_proyecto?: string
  created_at: string
}

export type DiaTrabajado = {
  id: number
  proyecto_id: number
  fecha: string
  rate: number
  hrs: number | null
  standby_hrs: number
  status: 'pendiente' | 'en_progreso' | 'hecho'
  total_day: number
}
