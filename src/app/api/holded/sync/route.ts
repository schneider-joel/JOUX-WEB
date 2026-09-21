import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { buscarContactoPorNombre, crearContacto, crearPresupuesto } from '@/lib/holded'

export async function POST(req: NextRequest) {
  try {
    const { facturaId } = await req.json()
    if (!facturaId) return NextResponse.json({ error: 'Falta facturaId' }, { status: 400 })

    const { data: factura } = await supabase.from('facturas').select('*').eq('id', facturaId).single()
    if (!factura) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    if (factura.holded_estimate_id) return NextResponse.json({ error: 'Esta factura ya se envió a Holded' }, { status: 400 })

    let contactId = await buscarContactoPorNombre(factura.cliente)
    if (!contactId) {
      const { data: clienteFiscal } = await supabase.from('clientes_fiscales').select('*').eq('cliente', factura.cliente).maybeSingle()
      contactId = await crearContacto({
        nombre: factura.cliente,
        identificador: clienteFiscal?.identificador,
        direccion: clienteFiscal?.direccion,
      })
    }

    const refs = [factura.numero, factura.numero_referencia].filter(Boolean)
    const notas = `Ref. JOUX Hub${refs.length ? `: ${refs.join(' · ')}` : ''}. Generado automáticamente, pendiente de aprobar.`

    const estimateId = await crearPresupuesto({
      contactId,
      descripcion: factura.descripcion || factura.cliente,
      fecha: factura.fecha,
      importe: Number(factura.importe),
      notas,
    })

    const { data: updated, error } = await supabase
      .from('facturas')
      .update({ holded_estimate_id: estimateId })
      .eq('id', facturaId)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ factura: updated })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Error desconocido' }, { status: 500 })
  }
}
