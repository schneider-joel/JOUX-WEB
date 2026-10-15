import { NextRequest, NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { notificar } from '@/lib/push'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

// Entrada de leads desde las webs (Workers de Cloudflare), de servidor a servidor. Pública en el
// middleware: se protege con una clave por fuente (Bearer) y cada clave solo escribe en sus marcas.
// Contrato completo en automatizacion.md («Contrato del endpoint de entrada»).
const FUENTES = [
  { env: 'INTAKE_KEY_THEPITCHLAB', fuente: 'thepitchlab', marcas: ['pitchlab'] },
  { env: 'INTAKE_KEY_ARKEVO', fuente: 'arkevo', marcas: ['arkevo'] },
  { env: 'INTAKE_KEY_PERSONAL', fuente: 'personal', marcas: ['custom'] },
]
const MAX_BYTES = 64 * 1024

// Se comparan los hashes: mismo largo siempre, así timingSafeEqual no filtra la longitud de la clave.
const sha = (s: string) => createHash('sha256').update(s).digest()
function fuenteDeClave(auth: string | null) {
  const m = auth?.match(/^Bearer\s+(.+)$/)
  if (!m) return null
  const dada = sha(m[1].trim())
  let encontrada: typeof FUENTES[number] | null = null
  for (const f of FUENTES) {
    const clave = process.env[f.env]?.trim()
    // Sin cortar el bucle: el tiempo no depende de qué clave coincide.
    if (clave && timingSafeEqual(dada, sha(clave))) encontrada = f
  }
  return encontrada
}

const json = (body: unknown, status: number) => NextResponse.json(body, { status })
const invalido = (error: string, campo: string) => json({ error, campo }, 400)
const esObjeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Texto opcional: recortado, vacío = null; si no es texto o se pasa de largo, error.
function texto(v: unknown, max: number): string | null | undefined {
  if (v == null) return null
  if (typeof v !== 'string' || v.length > max) return undefined
  return v.trim() || null
}

export async function POST(req: NextRequest) {
  const fuente = fuenteDeClave(req.headers.get('authorization'))
  if (!fuente) return json({ error: 'no_autorizado' }, 401)

  if (Number(req.headers.get('content-length') || 0) > MAX_BYTES) return json({ error: 'demasiado_grande' }, 413)
  const crudo = await req.text()
  if (Buffer.byteLength(crudo) > MAX_BYTES) return json({ error: 'demasiado_grande' }, 413)

  let b: unknown
  try { b = JSON.parse(crudo) } catch { return invalido('json_invalido', '') }
  if (!esObjeto(b)) return invalido('json_invalido', '')

  if (typeof b.marca !== 'string' || !b.marca) return invalido('marca_obligatoria', 'marca')
  if (!fuente.marcas.includes(b.marca)) return json({ error: 'marca_no_permitida' }, 403)

  const origen = texto(b.origen, 200)
  if (!origen || origen.includes('?')) return invalido('origen_invalido', 'origen')

  const c = esObjeto(b.contacto) ? b.contacto : null
  if (!c) return invalido('email_invalido', 'contacto.email')
  const email = typeof c.email === 'string' ? c.email.trim().toLowerCase() : ''
  if (!email || email.length > 254 || !EMAIL.test(email)) return invalido('email_invalido', 'contacto.email')

  const contacto: Record<string, string | null> = {}
  for (const [k, max] of [['nombre', 200], ['empresa', 200], ['telefono', 50], ['pais', 2]] as const) {
    const v = texto(c[k], max)
    if (v === undefined) return invalido('campo_invalido', `contacto.${k}`)
    contacto[k] = k === 'pais' && v ? v.toUpperCase() : v
  }

  const idExterno = texto(b.id_externo, 200)
  if (idExterno === undefined) return invalido('campo_invalido', 'id_externo')

  const idioma = b.idioma ?? 'es'
  if (idioma !== 'es' && idioma !== 'en') return invalido('idioma_invalido', 'idioma')

  let recibidoEn: string | undefined
  if (b.recibido_en != null) {
    const d = typeof b.recibido_en === 'string' ? new Date(b.recibido_en) : null
    if (!d || isNaN(d.getTime())) return invalido('fecha_invalida', 'recibido_en')
    recibidoEn = d.toISOString()
  }

  for (const k of ['interes', 'campos'] as const) if (b[k] != null && !esObjeto(b[k])) return invalido('campo_invalido', k)

  const mensaje = texto(b.mensaje, 20000)
  if (mensaje === undefined) return invalido('campo_invalido', 'mensaje')

  const adjuntos: { nombre: string | null; url: string; bytes: number | null; caduca: string | null }[] = []
  if (b.adjuntos != null) {
    if (!Array.isArray(b.adjuntos) || b.adjuntos.length > 10) return invalido('adjuntos_invalidos', 'adjuntos')
    for (let i = 0; i < b.adjuntos.length; i++) {
      const a: unknown = b.adjuntos[i]
      let url: URL | null = null
      try { url = esObjeto(a) && typeof a.url === 'string' ? new URL(a.url) : null } catch {}
      if (!esObjeto(a) || !url || url.protocol !== 'https:') return invalido('adjunto_invalido', `adjuntos[${i}].url`)
      const nombre = texto(a.nombre, 300)
      if (nombre === undefined) return invalido('adjunto_invalido', `adjuntos[${i}].nombre`)
      adjuntos.push({ nombre, url: url.toString(), bytes: typeof a.bytes === 'number' ? a.bytes : null, caduca: typeof a.caduca === 'string' ? a.caduca : null })
    }
  }

  if (b.consentimiento != null && typeof b.consentimiento !== 'boolean') return invalido('campo_invalido', 'consentimiento')

  // Reintento de la fuente: mismo (origen, id_externo) → el lead que ya existe.
  const existente = async () => idExterno
    ? (await sb.from('leads').select('id').eq('origen', origen).eq('id_externo', idExterno).maybeSingle()).data
    : null
  const ya = await existente()
  if (ya) return json({ id: ya.id, duplicado: true }, 200)

  const { data: lead, error } = await sb.from('leads').insert({
    marca: b.marca, origen, id_externo: idExterno, idioma, email, ...contacto,
    interes: b.interes ?? {}, campos: b.campos ?? {}, mensaje, adjuntos,
    consentimiento: b.consentimiento === true,
    ...(recibidoEn ? { recibido_en: recibidoEn } : {}),
  }).select('id, estado').single()

  if (error) {
    // Dos envíos a la vez con el mismo id_externo: el segundo choca con el índice único.
    if (error.code === '23505') {
      const otro = await existente()
      if (otro) return json({ id: otro.id, duplicado: true }, 200)
    }
    console.error('intake/lead', error.message)
    return json({ error: 'interno' }, 500)
  }

  // El lead ya está guardado: si falla el evento o el push, se responde 201 igual (no debe reintentarse).
  try {
    const ev = await sb.from('eventos').insert({ lead_id: lead.id, tipo: 'lead.nuevo', fuente: fuente.fuente, datos: { origen } })
    if (ev.error) console.error('intake/lead evento', ev.error.message)
    const { data: marca } = await sb.from('marcas').select('nombre').eq('key', b.marca).maybeSingle()
    await notificar({
      titulo: `Nuevo lead · ${marca?.nombre || b.marca} · ${contacto.nombre || email}`,
      cuerpo: [contacto.empresa, mensaje?.slice(0, 120)].filter(Boolean).join(' · ') || email,
      url: `/leads/${lead.id}`,
      etiqueta: `lead-${lead.id}`,
    })
  } catch (e: any) {
    console.error('intake/lead aviso', e?.message)
  }

  return json({ id: lead.id, estado: lead.estado }, 201)
}
