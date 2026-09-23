// Shim de cliente (navegador). En vez de hablar con Supabase directo con la
// key pública, manda cada consulta a /api/db, una ruta del servidor protegida
// por la contraseña de la app que ejecuta la consulta con la service_role key.
// Mantiene la misma forma encadenable/awaitable de supabase-js para el
// subconjunto que usa la app (select/insert/update/upsert/delete + eq/order/
// single/maybeSingle), así los sitios de llamada no cambian.
type Filtro = { col: string; val: any }
type Resultado = { data: any; error: { message: string } | null }

class QueryBuilder implements PromiseLike<Resultado> {
  private table: string
  private op = 'select'
  private _columns?: string
  private _payload?: any
  private _filters: Filtro[] = []
  private _order?: { col: string; ascending: boolean }
  private _returning = false
  private _single = false
  private _maybeSingle = false

  constructor(table: string) { this.table = table }

  select(columns = '*') {
    if (this.op === 'select') this._columns = columns
    else { this._returning = true; this._columns = columns }
    return this
  }
  insert(payload: any) { this.op = 'insert'; this._payload = payload; return this }
  update(payload: any) { this.op = 'update'; this._payload = payload; return this }
  upsert(payload: any) { this.op = 'upsert'; this._payload = payload; return this }
  delete() { this.op = 'delete'; return this }
  eq(col: string, val: any) { this._filters.push({ col, val }); return this }
  order(col: string, opts?: { ascending?: boolean }) { this._order = { col, ascending: opts?.ascending !== false }; return this }
  single() { this._single = true; return this }
  maybeSingle() { this._maybeSingle = true; return this }

  private async exec(): Promise<Resultado> {
    try {
      const res = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: this.table, op: this.op, columns: this._columns, payload: this._payload,
          filters: this._filters, order: this._order, returning: this._returning,
          single: this._single, maybeSingle: this._maybeSingle,
        }),
      })
      return await res.json()
    } catch (e: any) {
      return { data: null, error: { message: e?.message || 'Error de red' } }
    }
  }

  then<R1 = Resultado, R2 = never>(
    onF?: ((v: Resultado) => R1 | PromiseLike<R1>) | null,
    onR?: ((r: any) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.exec().then(onF, onR)
  }
}

export const supabase = {
  from(table: string) { return new QueryBuilder(table) },
}

export type Cuenta = {
  id: number
  nombre: string
  saldo: number
  color: string
  tipo: string
  orden: number
  moneda?: string
}

export type PatrimonioSnapshot = {
  fecha: string
  total: number
  liquidez: number
  crypto: number
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
  tipo_factura?: 'fuera_ue' | 'dentro_ue'
  holded_estimate_id?: string
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
