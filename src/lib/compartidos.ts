// Gastos compartidos con la pareja (tipo Tricount), compartido entre el hub y
// el link privado de ella.
//
// tipo 'gasto': alguien pagó algo. reparto 'mitad' = a medias; 'otro' = le
// corresponde entero a la otra persona (pagaste algo por ella, o al revés).
// tipo 'liquidacion': transferencia de una a otra para saldar la cuenta.

export type Persona = 'joel' | 'pareja'

export type GastoCompartido = {
  id: number
  tipo: 'gasto' | 'liquidacion'
  fecha: string
  concepto: string
  importe: number
  pagador: Persona
  reparto: 'mitad' | 'otro'
  categoria: string | null
  movimiento_id: string | null
  creado_por: Persona
}

// Lo que el que no pagó le debe al que pagó por este gasto.
export const deudaDe = (g: GastoCompartido) => (g.reparto === 'otro' ? Number(g.importe) : Number(g.importe) / 2)

// Saldo desde el punto de vista de Joel: positivo = la pareja le debe a Joel.
export function saldo(gastos: GastoCompartido[]): number {
  let s = 0
  for (const g of gastos) {
    const signo = g.pagador === 'joel' ? 1 : -1
    s += signo * (g.tipo === 'liquidacion' ? Number(g.importe) : deudaDe(g))
  }
  return Math.round(s * 100) / 100
}
