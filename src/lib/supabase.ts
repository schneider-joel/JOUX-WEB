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
  importe: number
  fecha: string
  fecha_cobro?: string
  estado: 'pendiente' | 'cobrada'
  cuenta_destino_id?: number
  origen: string
  notion_proyecto?: string
  idioma?: 'es' | 'en'
}

export type NotionProyectoPendiente = {
  notionId: string
  proyecto: string
  cliente: string
  total: number
}

export type PresupuestoItem = {
  id: number
  nombre: string
  limite: number
  gastado: number
  mes: string
}
