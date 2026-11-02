import { NextRequest, NextResponse } from 'next/server'
import { autorizarCarta, avisarParar } from '@/lib/cartela-acceso'
import { modificarPeticion, peticionPublica } from '@/lib/cartela-cambios'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// El local cambia, cancela o pide parar una petición suya: { accion: 'cambiar' | 'cancelar' | 'parar', texto?, op?, valor? }.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const a = await autorizarCarta(req, req.nextUrl.searchParams.get('slug'))
  if ('error' in a) return NextResponse.json({ error: a.error }, { status: a.status })
  const id = Number(params.id)
  const body = await req.json().catch(() => null)
  if (!Number.isInteger(id) || !body) return NextResponse.json({ error: 'datos' }, { status: 400 })
  const s = (v: unknown, max: number) => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
  const r = await modificarPeticion(a.local, id, String(body.accion ?? ''), { texto: s(body.texto, 2000) ?? undefined, op: s(body.op, 20), valor: s(body.valor, 40) })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  if (body.accion === 'parar') await avisarParar(a.local, r.peticion.texto, r.peticion.id)
  return NextResponse.json({ peticion: peticionPublica(r.peticion) })
}
