import { NextResponse } from 'next/server'
import { conciliarTodo } from '@/lib/conciliar'
import { autorizado } from '../autorizado'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Reclasifica y vuelve a cruzar movimientos con facturas (tras crear una
// regla, subir una compra o vincular algo a mano). No llama al banco.
export async function POST() {
  if (!autorizado()) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    return NextResponse.json(await conciliarTodo())
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
