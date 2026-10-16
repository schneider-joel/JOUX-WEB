import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { fuenteDeClave } from '@/lib/intake'
import { CLAVE_AGENTE, cuerpoAgente, idLead, urlHttps } from '@/lib/agente'
import { rellenar } from '@/lib/emails'
import { remitenteLead } from '@/lib/remitentes'
import { notificar } from '@/lib/push'
import { DISENOS, MAX_RONDA, disenoDelLead, disenoValido, estudioDelLead, plantillaRonda } from '@/lib/prueba-gratis'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

const json = (body: unknown, status: number) => NextResponse.json(body, { status })

// El agente publicó la portada: evento `prueba.lista` (uno por lead y ronda, índice único), borrador del
// email en la ficha del lead y push. Ronda 1 = plantilla `prueba.lista`; ronda 2 (ajustes que pidió Joel)
// = `prueba.ajustada`, con la lista de `cambios` que mande el agente. Nunca se envía solo: lo manda Joel.
export async function POST(req: NextRequest) {
  if (!fuenteDeClave(req.headers.get('authorization'), CLAVE_AGENTE)) return json({ error: 'no_autorizado' }, 401)
  const b = await cuerpoAgente(req)
  if (b === 'grande') return json({ error: 'demasiado_grande' }, 413)
  if (!b) return json({ error: 'json_invalido', campo: '' }, 400)
  const leadId = idLead(b.lead_id)
  if (!leadId) return json({ error: 'lead_invalido', campo: 'lead_id' }, 400)
  const url = urlHttps(b.url)
  if (!url) return json({ error: 'url_invalida', campo: 'url' }, 400)
  if (b.diseno != null && !disenoValido(b.diseno)) return json({ error: 'diseno_invalido', campo: 'diseno', validos: DISENOS }, 400)
  const ronda = b.ronda == null ? 1 : b.ronda
  if (typeof ronda !== 'number' || !Number.isInteger(ronda) || ronda < 1 || ronda > MAX_RONDA) return json({ error: 'ronda_invalida', campo: 'ronda' }, 400)
  if (b.cambios != null && (!Array.isArray(b.cambios) || b.cambios.length > 20 || b.cambios.some(c => typeof c !== 'string' || !c.trim() || c.length > 300))) return json({ error: 'cambios_invalidos', campo: 'cambios' }, 400)
  const cambios = ((b.cambios as string[] | undefined) || []).map(c => c.trim())

  try {
    const { data: lead } = await sb.from('leads').select('id, marca, idioma, nombre, empresa, email, interes, campos').eq('id', leadId).maybeSingle()
    if (!lead) return json({ error: 'lead_desconocido' }, 404)
    const { data: marca } = await sb.from('marcas').select('modo').eq('key', lead.marca).maybeSingle()
    if (marca?.modo !== 'cerrado') return json({ error: 'marca_sin_prueba' }, 400)
    const diseno = disenoValido(b.diseno) || disenoDelLead(lead)
    if (!diseno) return json({ error: 'diseno_invalido', campo: 'diseno', validos: DISENOS }, 400)

    const plantilla = plantillaRonda(ronda)
    const duplicado = async () => {
      const { data: m } = await sb.from('mensajes').select('id').eq('lead_id', lead.id).eq('plantilla', plantilla).neq('estado', 'descartado').order('created_at', { ascending: false }).limit(1).maybeSingle()
      return json({ duplicado: true, ronda, mensaje_id: m?.id ?? null }, 200)
    }
    if (ronda === 2) {
      // La ronda 2 solo existe si Joel la pidió desde la ficha («Pedir ajustes al agente»).
      const { count: pedida } = await sb.from('eventos').select('id', { count: 'exact', head: true }).eq('lead_id', lead.id).eq('tipo', 'prueba.ajustes')
      if (!pedida) return json({ error: 'sin_ajustes' }, 409)
    }
    const { error: dup } = await sb.from('eventos').insert({ lead_id: lead.id, tipo: 'prueba.lista', fuente: 'agente-prueba', datos: { url, diseno, ronda, ...(cambios.length ? { cambios } : {}) } })
    // Ya avisada (índice eventos_prueba_lista_ronda): se devuelve el borrador que hay, sin crear otro.
    if (dup) { if (dup.code !== '23505') throw new Error(dup.message); return duplicado() }

    const idioma = lead.idioma === 'en' ? 'en' : 'es'
    const estudio = estudioDelLead(lead)
    const { data: t } = await sb.from('plantillas').select('remitente, asunto, cuerpo').eq('clave', plantilla).eq('marca', lead.marca).eq('idioma', idioma).maybeSingle()
    let mensajeId: number | null = null
    if (t) {
      const vars = { nombre: (lead.nombre || estudio).split(' ')[0], estudio, diseno, url }
      // {{cambios}}: la lista del agente; sin lista, el hueco desaparece.
      const lista = cambios.map(c => `- ${c}`).join('\n')
      const asunto = rellenar(t.asunto, vars), cuerpo = rellenar(lista ? t.cuerpo.replace('{{cambios}}', lista) : t.cuerpo.replace(/\n*\{\{cambios\}\}\n*/, '\n\n'), vars)
      // Un solo borrador vivo por lead: el de la IA (si lo había) deja paso al de la prueba.
      await sb.from('mensajes').update({ estado: 'descartado' }).eq('lead_id', lead.id).eq('estado', 'borrador')
      const { data: m, error } = await sb.from('mensajes').insert({
        lead_id: lead.id, direccion: 'saliente', estado: 'borrador', plantilla, generado_por: 'plantilla', canal: 'gmail',
        remitente: remitenteLead(lead.marca, idioma) || t.remitente, para: lead.email, asunto, cuerpo, asunto_original: asunto, cuerpo_original: cuerpo,
      }).select('id').single()
      if (error) throw new Error(error.message)
      mensajeId = m.id
    }
    await notificar({
      titulo: ronda === 2 ? `Ajustes de ${estudio} listos para revisar` : `Prueba de ${estudio} lista para revisar`,
      cuerpo: `${diseno} · ${url}${t ? '' : ` · Sin plantilla ${plantilla} para esta marca: escribe el email a mano.`}`,
      url: `/leads/${lead.id}`,
      etiqueta: `lead-${lead.id}`,
    }).catch(e => console.error('agente/prueba-lista push', e?.message))
    return json({ ok: true, ronda, mensaje_id: mensajeId }, 201)
  } catch (e: any) {
    console.error('agente/prueba-lista', e?.message)
    return json({ error: 'interno' }, 500)
  }
}
