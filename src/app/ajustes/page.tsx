import Link from 'next/link'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { leerAutonomia, sinCambios } from '@/lib/autonomia'
import { CATEGORIAS, MARCAS_CON_IA } from '@/lib/ia'
import { NOMBRE_EMAIL } from '@/lib/emails'
import { fechaHora } from '@/lib/leads'
import { Interruptor, Pausa, ResumenAhora, type Cifras } from './interruptores'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const metadata = { title: 'Ajustes · JOUX Hub' }

const NOMBRE_CATEGORIA: Record<string, string> = {
  precio: 'Precio', plazos: 'Plazos', encargo: 'Encargo', informacion: 'Información', material: 'Material', otro: 'Otro',
}

// Ajustes de autonomía (fase 5): qué sale solo y con qué datos decidirlo. Todo empieza apagado.
// La métrica cuenta lo que Joel envió a mano: sin cambios frente a editado. Lo enviado solo no cuenta.
export default async function AjustesPage() {
  const [autonomia, { data: plantillas }, { data: marcas }, { data: enviados }, { data: resumen }] = await Promise.all([
    leerAutonomia(),
    sb.from('plantillas').select('clave, marca, idioma, auto').order('marca'),
    sb.from('marcas').select('key, nombre, orden').order('orden'),
    sb.from('mensajes').select('lead_id, proyecto_id, plantilla, categoria_ia, generado_por, asunto, cuerpo, asunto_original, cuerpo_original, auto')
      .eq('direccion', 'saliente').not('enviado_en', 'is', null).limit(5000),
    sb.from('eventos').select('datos, created_at').eq('tipo', 'resumen.diario').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  const nombreMarca = new Map((marcas || []).map(m => [m.key, m.nombre as string]))
  const msgs = enviados || []

  // Marca de cada mensaje: la de su lead o la de su proyecto.
  const leadIds = Array.from(new Set(msgs.map(m => m.lead_id).filter(Boolean))) as number[]
  const proyIds = Array.from(new Set(msgs.map(m => m.proyecto_id).filter(Boolean))) as number[]
  const [{ data: leads }, { data: proyectos }] = await Promise.all([
    leadIds.length ? sb.from('leads').select('id, marca').in('id', leadIds) : Promise.resolve({ data: [] as { id: number; marca: string }[] }),
    proyIds.length ? sb.from('proyectos').select('id, marca').in('id', proyIds) : Promise.resolve({ data: [] as { id: number; marca: string | null }[] }),
  ])
  const marcaLead = new Map((leads || []).map(l => [l.id, l.marca]))
  const marcaProy = new Map((proyectos || []).map(p => [p.id, p.marca]))

  const cifras = (lista: typeof msgs): Cifras => {
    const manuales = lista.filter(m => !m.auto)
    const r = { tal_cual: 0, editados: 0, auto: lista.length - manuales.length }
    for (const m of manuales) {
      // Sin original guardado (envíos de antes de la fase 5) no cuenta para ninguno de los dos.
      const igual = sinCambios(m)
      if (igual === true) r.tal_cual++
      else if (igual === false) r.editados++
    }
    return r
  }

  // Plantillas: una fila por clave y marca (los dos idiomas van juntos).
  const filasPlantilla = Array.from(new Map((plantillas || []).map(p => [`${p.marca}|${p.clave}`, p])).values()).map(p => {
    const idiomas = (plantillas || []).filter(x => x.marca === p.marca && x.clave === p.clave)
    return {
      clave: p.clave, marca: p.marca, auto: idiomas.every(x => x.auto), mixto: idiomas.some(x => x.auto) && !idiomas.every(x => x.auto),
      cifras: cifras(msgs.filter(m => m.plantilla === p.clave && m.proyecto_id && marcaProy.get(m.proyecto_id) === p.marca)),
    }
  })
  const marcasPlantillas = Array.from(new Set(filasPlantilla.map(p => p.marca)))

  const categorias = CATEGORIAS.filter(c => c !== 'spam')
  const ultimo = resumen as { datos: { linea?: string; vacio?: boolean; prueba?: boolean }; created_at: string } | null

  return (
    <div className="app">
      <header className="frame frame--top caps">
        <Link href="/" className="mark" style={{ textDecoration: 'none' }}>JOUX HUB</Link>
        <Link href="/" className="copy">← Overview</Link>
      </header>
      <main className="main">
        <header className="page-header ajustes">
          <div className="page-header__txt">
            <h1 className="page-title">Ajustes</h1>
            <p className="tags caps">Resumen diario y envíos automáticos</p>
          </div>
        </header>

        <div className="ajustes">
        <section className="block" aria-label="Resumen diario">
          <p className="label caps"><span>Resumen diario</span><i className="rule" /><span className="label__m">8:00 · push + email</span></p>
          <p className="nota">
            Cada día a partir de las 8:00 llega a joel@joelschneider.io lo que espera de ti: leads, borradores, revisiones y facturas.
            Si no hay nada, no llega nada.
            {ultimo ? <> Último: {fechaHora(ultimo.created_at)}{ultimo.datos.prueba ? ' (prueba)' : ''} · {ultimo.datos.vacio ? 'nada pendiente, no se envió' : ultimo.datos.linea}.</> : null}
          </p>
          <ResumenAhora />
        </section>

        <section className="block" aria-label="Pausa">
          <p className="label caps"><span>Envíos automáticos</span><i className="rule" /></p>
          <Pausa activo={autonomia.pausa} />
        </section>

        <section className="block" aria-label="Plantillas">
          <p className="label caps"><span>Emails de proyectos</span><i className="rule" /><span className="label__m">enviar sin aprobación</span></p>
          <p className="nota">Al encender una plantilla, sale sola cuando está completa (destinatario y enlace). Las cifras son tus envíos a mano: sin tocar frente a editados.</p>
          {marcasPlantillas.map(marca => (
            <div key={marca} className="ajustes__grupo">
              <p className="caps dim">{nombreMarca.get(marca) || marca}</p>
              <ul className="list">
                {filasPlantilla.filter(p => p.marca === marca).map(p => (
                  <li key={p.clave}>
                    <Interruptor tipo="plantilla" clave={p.clave} marca={p.marca} activo={p.auto}
                      titulo={NOMBRE_EMAIL[p.clave] || p.clave} cifras={p.cifras} aviso={p.mixto ? 'Solo un idioma está encendido' : undefined} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="block" aria-label="Respuestas de IA">
          <p className="label caps"><span>Respuestas a leads</span><i className="rule" /><span className="label__m">responder automáticamente</span></p>
          <p className="nota">El borrador de la IA sale solo si su categoría está encendida en esa marca, no tiene marcas [[Joel: …]] ni alertas. «Regenerar» nunca envía.</p>
          {MARCAS_CON_IA.map(marca => (
            <div key={marca} className="ajustes__grupo">
              <p className="caps dim">{nombreMarca.get(marca) || marca}</p>
              <ul className="list">
                {categorias.map(c => (
                  <li key={c}>
                    <Interruptor tipo="categoria" marca={marca} categoria={c} activo={(autonomia.respuestas[marca] || []).includes(c)}
                      titulo={NOMBRE_CATEGORIA[c] || c}
                      cifras={cifras(msgs.filter(m => m.lead_id && m.categoria_ia === c && marcaLead.get(m.lead_id) === marca))} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
        </div>
      </main>
    </div>
  )
}
