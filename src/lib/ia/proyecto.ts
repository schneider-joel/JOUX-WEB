import Anthropic from '@anthropic-ai/sdk'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { pilotoActivo } from '@/lib/autonomia'
import { notificar } from '@/lib/push'
import { BUCKET_CARTELA } from '@/lib/cartela-cambios'
import { BUCKET_LEADS, type AdjuntoMensaje } from '@/lib/prueba-gratis'

// Piloto automático en la etapa de proyecto: cada respuesta del cliente en el hilo del lead ganado se clasifica
// (aprobado, cambios, pregunta, otro). Con el paso del piloto encendido en su marca:
// - «cambios» en Cartela → petición en la bandeja de cambios (/cartela/cambios), que recoge el agente.
// - «aprobado» en Revisión o Cambios → etapa Entregado. La entrega con la factura 2 la envía siempre Joel.
// Lo demás (o con el paso apagado) solo da el push de siempre, con el resumen de la IA.
const MODELO = 'claude-sonnet-5-5'
const cliente = () => new Anthropic({ timeout: 40_000, maxRetries: 1 })
const TIPOS = ['aprobado', 'cambios', 'pregunta', 'otro'] as const
type Tipo = typeof TIPOS[number]
type Clasificacion = { tipo: Tipo; cambios: string; resumen: string }

const REGLAS = `Eres el asistente de Joel, diseñador web autónomo. Un cliente con un proyecto en marcha ha respondido por email.
Clasifica su último mensaje:
- aprobado: da por buena la versión que le enviamos, sin pedir nada más («perfecto», «me encanta, adelante», «todo bien, publicadla»).
- cambios: pide cambios concretos sobre su web o su carta (textos, precios, platos, fotos, colores…), aunque también diga que le gusta.
- pregunta: pregunta algo o duda, sin pedir cambios ni aprobar.
- otro: agradecimientos, avisos, material que manda sin pedir nada, o no está claro.
Si dudas entre aprobado y cambios, es cambios. Si dudas entre aprobado y otro, es otro.
cambios: si es «cambios», la lista de cambios en español, una línea por cambio, con los datos exactos que da el cliente (nombres, precios, textos); vacío en otro caso.
resumen: una frase corta en español de lo que dice.`

const ESQUEMA = {
  type: 'object',
  properties: {
    tipo: { type: 'string', enum: [...TIPOS] },
    cambios: { type: 'string' },
    resumen: { type: 'string' },
  },
  required: ['tipo', 'cambios', 'resumen'],
  additionalProperties: false,
}

async function clasificar(fase: string, ultimoNuestro: string | null, texto: string): Promise<Clasificacion | null> {
  try {
    const r = await cliente().beta.messages.create({
      model: MODELO,
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } },
      system: [{ type: 'text', text: REGLAS, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: `Etapa del proyecto: ${fase}${ultimoNuestro ? `\n\n<nuestro_ultimo_email>\n${ultimoNuestro.slice(0, 3000)}\n</nuestro_ultimo_email>` : ''}\n\n<respuesta_del_cliente>\n${texto.slice(0, 6000)}\n</respuesta_del_cliente>`,
      }],
    })
    if (r.stop_reason !== 'end_turn') return null
    const salida = JSON.parse(r.content.flatMap(b => b.type === 'text' ? [b.text] : []).join('')) as Clasificacion
    return TIPOS.includes(salida.tipo) ? salida : null
  } catch (e) {
    console.error('ia proyecto', (e as Error)?.message)
    return null
  }
}

async function copiarFotos(fotos: AdjuntoMensaje[], carpeta: string) {
  const rutas: string[] = []
  for (const f of fotos.slice(0, 10)) {
    const { data } = await sb.storage.from(BUCKET_LEADS).download(f.ruta)
    if (!data) continue
    const ruta = `${carpeta}/${f.ruta.split('/').pop()}`
    const { error } = await sb.storage.from(BUCKET_CARTELA).upload(ruta, Buffer.from(await data.arrayBuffer()), { contentType: f.tipo, upsert: true })
    if (error) console.error('piloto foto', error.message)
    else rutas.push(ruta)
  }
  return rutas
}

// Devuelve true si ya avisó por push (el tick no repite el suyo).
export async function respuestaEnProyecto(proyectoId: number, leadId: number, mensajeId: number, texto: string, fotos: AdjuntoMensaje[]): Promise<boolean> {
  const { data: p } = await sb.from('proyectos').select('id, marca, fase, nombre, cliente').eq('id', proyectoId).maybeSingle()
  if (!p?.fase) return false
  const pasos = await Promise.all([pilotoActivo(p.marca, 'cambios'), pilotoActivo(p.marca, 'aprobar')])
  // Sin ningún paso encendido en su marca no se llama a la IA: el push de siempre basta.
  if (!pasos.some(Boolean)) return false
  const [cambiosSolo, aprobarSolo] = pasos

  const { data: nuestro } = await sb.from('mensajes').select('cuerpo').eq('lead_id', leadId).eq('direccion', 'saliente').eq('estado', 'enviado')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  const c = await clasificar(p.fase, nuestro?.cuerpo || null, texto)
  if (!c) return false
  const quien = p.cliente || p.nombre
  await sb.from('eventos').insert({ proyecto_id: p.id, lead_id: leadId, tipo: 'respuesta.clasificada', fuente: 'piloto', datos: { mensaje_id: mensajeId, tipo: c.tipo, resumen: c.resumen.slice(0, 300) } })

  // Con la carta ya publicada (desde la primera versión y durante el año de cambios, también ya cobrada).
  if (c.tipo === 'cambios' && cambiosSolo && p.marca === 'cartela' && ['revision', 'cambios', 'entregado', 'cerrado'].includes(p.fase)) {
    const { data: local } = await sb.from('cartela_locales').select('id, nombre, prueba').eq('proyecto_id', p.id).neq('estado', 'baja').maybeSingle()
    if (local) {
      const { data: pet, error } = await sb.from('cartela_peticiones').insert({ local_id: local.id, texto: (c.cambios.trim() || texto.trim()).slice(0, 2000) }).select('id').single()
      if (!error && pet) {
        // Las fotos del correo pasan del bucket `leads` al de Cartela, como las que sube el cliente en /cambios.
        const rutas = await copiarFotos(fotos, `${local.id}/${pet.id}`)
        if (rutas.length) await sb.from('cartela_peticiones').update({ adjuntos: rutas }).eq('id', pet.id)
        await sb.from('eventos').insert({ proyecto_id: p.id, lead_id: leadId, tipo: 'cambio.por_email', fuente: 'piloto', datos: { peticion_id: pet.id, mensaje_id: mensajeId } })
        await notificar({ titulo: `Cambios por email · ${local.nombre}${local.prueba ? ' (prueba)' : ''}`, cuerpo: `Pasan al agente: ${c.resumen}`, url: '/cartela/cambios', etiqueta: `cartela-peticion-${pet.id}` })
        return true
      }
      console.error('piloto cambios', error?.message)
    }
  }

  if (c.tipo === 'aprobado' && aprobarSolo && ['revision', 'cambios'].includes(p.fase)) {
    // Condicional: si Joel la movió mientras tanto, no se pisa.
    const { data: movido } = await sb.from('proyectos').update({ fase: 'entregado' }).eq('id', p.id).eq('fase', p.fase).select('id').maybeSingle()
    if (movido) {
      await sb.from('eventos').insert({ proyecto_id: p.id, lead_id: leadId, tipo: 'proyecto.fase', fuente: 'piloto', datos: { de: p.fase, a: 'entregado', mensaje_id: mensajeId } })
      await notificar({ titulo: `Aprobada · ${quien}`, cuerpo: 'Pasa a Entregado. Te toca la entrega con la factura del pago 2.', url: `/proyectos/${p.id}`, etiqueta: `proyecto-${p.id}` })
      return true
    }
  }

  await notificar({ titulo: `Respuesta · ${quien}`, cuerpo: c.resumen, url: `/proyectos/${p.id}`, etiqueta: `proyecto-${p.id}` })
  return true
}
