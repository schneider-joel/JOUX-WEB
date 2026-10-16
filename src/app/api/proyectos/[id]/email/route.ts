import { NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { NOMBRE_EMAIL, pendientes, rellenar } from '@/lib/emails'
import { enviarEmail } from '@/lib/resend'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function datos(id: string, clave: string) {
  const { data: p } = await sb.from('proyectos').select('id, nombre, cliente, marca, web, idioma, contacto_email, contacto_nombre').eq('id', id).maybeSingle()
  if (!p) return { error: 'No existe', status: 404 } as const
  const { data: marca } = await sb.from('marcas').select('modo').eq('key', p.marca ?? '').maybeSingle()
  if (marca?.modo !== 'cerrado') return { error: 'Solo las webs tienen emails de seguimiento', status: 400 } as const
  const idioma = p.idioma === 'en' ? 'en' : 'es'
  const { data: t } = await sb.from('plantillas').select('remitente, asunto, cuerpo').eq('clave', clave).eq('marca', p.marca).eq('idioma', idioma).maybeSingle()
  if (!t) return { error: 'No hay plantilla para esta marca e idioma', status: 404 } as const
  // Ronda: las «revisión lista» ya enviadas + 1 (el recordatorio habla de la última).
  const { count } = await sb.from('mensajes').select('id', { count: 'exact', head: true }).eq('proyecto_id', p.id).eq('plantilla', 'revision.lista').eq('estado', 'enviado')
  const ronda = clave === 'revision.lista' ? (count || 0) + 1 : Math.max(1, count || 0)
  const vars = { nombre: (p.contacto_nombre || p.cliente).split(' ')[0], web: p.web || p.cliente, ronda }
  return { p, t, vars, asunto: rellenar(t.asunto, vars), cuerpo: rellenar(t.cuerpo, vars) }
}

// Borrador del email (plantilla ya rellenada salvo {{url}}), para revisarlo antes de enviar.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const clave = new URL(req.url).searchParams.get('clave') || ''
  if (!NOMBRE_EMAIL[clave]) return NextResponse.json({ error: 'Email desconocido' }, { status: 400 })
  const d = await datos(params.id, clave)
  if ('error' in d) return NextResponse.json({ error: d.error }, { status: d.status })
  return NextResponse.json({ remitente: d.t.remitente, para: d.p.contacto_email || '', asunto: d.asunto, cuerpo: d.cuerpo })
}

// Envía el email tal como lo dejó Joel y lo guarda en `mensajes` y en la línea de tiempo.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { clave, para, asunto, cuerpo } = await req.json().catch(() => ({}))
  if (!NOMBRE_EMAIL[clave]) return NextResponse.json({ error: 'Email desconocido' }, { status: 400 })
  if (typeof para !== 'string' || !EMAIL.test(para.trim())) return NextResponse.json({ error: 'Falta un email válido' }, { status: 400 })
  if (typeof asunto !== 'string' || !asunto.trim() || typeof cuerpo !== 'string' || !cuerpo.trim()) return NextResponse.json({ error: 'Falta el asunto o el texto' }, { status: 400 })
  const faltan = pendientes(asunto + cuerpo)
  if (faltan.length) return NextResponse.json({ error: `Falta rellenar ${faltan.join(', ')}` }, { status: 400 })
  const d = await datos(params.id, clave)
  if ('error' in d) return NextResponse.json({ error: d.error }, { status: d.status })

  const destino = para.trim()
  const envio = await enviarEmail({ de: d.t.remitente, para: destino, asunto: asunto.trim(), texto: cuerpo })
  await sb.from('mensajes').insert({
    proyecto_id: d.p.id, direccion: 'saliente', estado: envio.error ? 'error' : 'enviado', plantilla: clave, generado_por: 'plantilla',
    remitente: d.t.remitente, para: destino, asunto: asunto.trim(), cuerpo, canal: 'resend', id_proveedor: envio.id || null,
    error: envio.error || null, enviado_en: envio.error ? null : new Date().toISOString(),
  })
  if (envio.error) return NextResponse.json({ error: `No se envió: ${envio.error}` }, { status: 502 })
  if (!d.p.contacto_email) await sb.from('proyectos').update({ contacto_email: destino }).eq('id', d.p.id)
  await sb.from('eventos').insert({ proyecto_id: d.p.id, tipo: 'mensaje.enviado', fuente: 'joux-hub', datos: { plantilla: clave, para: destino, asunto: asunto.trim() } })
  return NextResponse.json({ ok: true })
}
