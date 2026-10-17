'use client'

import { useEffect, useState } from 'react'
import { nombreArchivoFactura } from './nombre-archivo'
import { supabase, Factura, ClienteFiscal, DiaTrabajado } from '@/lib/supabase'

const fmt2 = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const textos = {
  es: {
    titulo: 'Factura', numero: 'Número', referencia: 'Referencia', fecha: 'Fecha', vencimiento: 'Vencimiento', para: 'Para', de: 'De',
    concepto: 'Concepto', precio: 'Precio', unidades: 'Unidades', unidadesCorto: 'Uds.', subtotal: 'Subtotal', iva: 'IVA', retencion: 'Retención', total: 'Total',
    baseImponible: 'Base imponible', totalLabel: 'Total', imprimir: 'Imprimir / Guardar PDF', editar: 'Editar', vista: 'Vista previa',
    guardar: 'Guardar cambios', guardando: 'Guardando...',
    notaFueraUe: 'Operación no sujeta a IVA por el art. 69.Uno.1º LIVA',
    notaTransferencia: 'Pagar por transferencia bancaria al siguiente número de cuenta',
    horas: 'Horas trabajadas', standby: 'Standby',
  },
  en: {
    titulo: 'Invoice', numero: 'Number', referencia: 'Reference', fecha: 'Date', vencimiento: 'Due date', para: 'To', de: 'From',
    concepto: 'Description', precio: 'Price', unidades: 'Qty', unidadesCorto: 'Qty', subtotal: 'Subtotal', iva: 'VAT', retencion: 'Withholding', total: 'Total',
    baseImponible: 'Net amount', totalLabel: 'Total', imprimir: 'Print / Save PDF', editar: 'Edit', vista: 'Preview',
    guardar: 'Save changes', guardando: 'Saving...',
    notaFueraUe: 'Not subject to VAT under art. 69.One.1 of the Spanish VAT Law',
    notaTransferencia: 'Pay by bank transfer to the following account number',
    horas: 'Hours worked', standby: 'Standby',
  },
}

const IVA_PCT = 21
const RETENCION_PCT = 15

function siguienteNumero(ultimo: string): string {
  const m = ultimo.match(/^(.*?)(\d+)$/)
  if (!m) return ''
  const [, prefijo, digitos] = m
  const siguiente = String(Number(digitos) + 1).padStart(digitos.length, '0')
  return `${prefijo}${siguiente}`
}

export default function InvoiceEditor({
  factura: initialFactura,
  emisor,
  clienteFiscalInicial,
  editable,
  ultimoNumero,
  dias = [],
  modoRate,
  titulo = null,
}: {
  factura: Factura
  emisor: { nombre: string; nif: string; direccion: string; email: string; telefono: string; iban: string; swift?: string }
  clienteFiscalInicial: ClienteFiscal | null
  editable: boolean
  ultimoNumero: string
  dias?: DiaTrabajado[]
  modoRate?: string
  titulo?: string | null
}) {
  const [factura, setFactura] = useState(initialFactura)
  const [clienteFiscal, setClienteFiscal] = useState<ClienteFiscal>(
    clienteFiscalInicial || { cliente: initialFactura.cliente, identificador: '', direccion: '' }
  )
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const idioma = factura.idioma === 'en' ? 'en' : 'es'
  const t = textos[idioma]
  const dentroUe = factura.tipo_factura === 'dentro_ue'

  // Mantiene el nombre del PDF al día si se edita el número o el cliente.
  useEffect(() => { document.title = titulo || nombreArchivoFactura(factura.numero, factura.cliente) }, [titulo, factura.numero, factura.cliente])

  const set = (patch: Partial<Factura>) => setFactura({ ...factura, ...patch })

  const base = Number(factura.importe) || 0
  const ivaAmount = dentroUe ? base * (IVA_PCT / 100) : 0
  const retencionAmount = dentroUe ? base * (RETENCION_PCT / 100) : 0
  const total = base + ivaAmount - retencionAmount

  const usarSiguienteNumero = () => {
    const next = siguienteNumero(ultimoNumero)
    if (next) set({ numero: next })
  }

  const save = async () => {
    setSaving(true)
    setSaveError('')
    const { error } = await supabase.from('facturas').update({
      numero: factura.numero,
      numero_referencia: factura.numero_referencia,
      fecha: factura.fecha,
      fecha_vencimiento: factura.fecha_vencimiento || null,
      cliente: factura.cliente,
      descripcion: factura.descripcion,
      concepto_detalle: factura.concepto_detalle,
      importe: factura.importe,
      idioma: factura.idioma || 'es',
      tipo_factura: factura.tipo_factura || 'fuera_ue',
    }).eq('id', factura.id)

    if (error) {
      setSaveError(error.message)
      setSaving(false)
      return
    }

    if (clienteFiscal.identificador || clienteFiscal.direccion) {
      await supabase.from('clientes_fiscales').upsert({
        cliente: factura.cliente,
        identificador: clienteFiscal.identificador,
        direccion: clienteFiscal.direccion,
      })
    }

    // Solo hace avanzar la secuencia global si el número es válido (mismo
    // prefijo + más alto que el actual) — evita que guardar una factura con
    // un número corto/mal tipeado corrompa el contador de "siguiente número".
    // Si no se puede leer el valor actual (error de red, fila ausente), no se
    // toca nada — la opción segura es NO avanzar, nunca asumir que cualquier
    // número vale como próximo (eso fue justo lo que corrompió el contador
    // la vez anterior).
    const m = factura.numero?.match(/^(.*?)(\d+)$/)
    if (m) {
      const [, prefijoNuevo, digitosNuevo] = m
      const { data: cfgActual, error: cfgError } = await supabase.from('configuracion').select('valor').eq('clave', 'ultimo_numero_factura').single()
      const mActual = cfgActual?.valor?.match(/^(.*?)(\d+)$/)
      const esAvanceValido = !cfgError && !!mActual && mActual[1] === prefijoNuevo && Number(digitosNuevo) > Number(mActual[2])
      if (esAvanceValido) {
        await supabase.from('configuracion').update({ valor: factura.numero }).eq('clave', 'ultimo_numero_factura')
      }
    }

    setSaving(false)
    setEditMode(false)
  }

  const fechaFmt = factura.fecha
    ? new Date(factura.fecha + 'T00:00:00').toLocaleDateString(idioma === 'es' ? 'es-ES' : 'en-GB')
    : ''
  const vencimientoFmt = factura.fecha_vencimiento
    ? new Date(factura.fecha_vencimiento + 'T00:00:00').toLocaleDateString(idioma === 'es' ? 'es-ES' : 'en-GB')
    : ''

  const mostrarDetalleHoras = modoRate === 'hora' && dias.length > 0
  const totalHoras = dias.reduce((s, d) => s + (d.hrs ?? 0), 0)
  const totalStandby = dias.reduce((s, d) => s + (d.standby_hrs ?? 0), 0)

  // Barra y edición con el aspecto del hub; debajo, la hoja que recibe el cliente (siempre en claro, es lo que se imprime).
  // Mismo contenido, mismas cuentas y mismo guardado que antes.
  return (
    <div className="app inv">
      <div className="inv__col">
        <div className="inv__bar no-print">
          <span className="inv__l">
            {editable && (
              <span className="seg caps" role="group" aria-label="Modo">
                <button type="button" aria-pressed={!editMode} onClick={() => setEditMode(false)}>{t.vista}</button>
                <button type="button" aria-pressed={editMode} onClick={() => setEditMode(true)}>{t.editar}</button>
              </span>
            )}
          </span>
          <span className="inv__r">
            <span className="seg caps" role="group" aria-label={idioma === 'es' ? 'Idioma' : 'Language'}>
              <button type="button" aria-pressed={idioma === 'es'} onClick={() => set({ idioma: 'es' })}>Español</button>
              <button type="button" aria-pressed={idioma === 'en'} onClick={() => set({ idioma: 'en' })}>English</button>
            </span>
            <button type="button" className="pill pill--sm" onClick={() => window.print()}><IconoImprimir />{t.imprimir}</button>
          </span>
        </div>

        {editable && editMode && (
          <section className="block inv__edit no-print" aria-label="Editar factura">
            <div className="inv__grid">
              <div className="field">
                <label className="caps" htmlFor="f-numero">Número · para Hacienda</label>
                <span className="inv__num">
                  <input id="f-numero" value={factura.numero || ''} onChange={e => set({ numero: e.target.value })} placeholder="F260018" />
                  <button type="button" className="copy caps hit" onClick={usarSiguienteNumero} title={`Siguiente: ${siguienteNumero(ultimoNumero)}`}>Usar siguiente</button>
                </span>
              </div>
              <div className="field">
                <label className="caps" htmlFor="f-ref">Referencia · para el cliente</label>
                <input id="f-ref" value={factura.numero_referencia || ''} onChange={e => set({ numero_referencia: e.target.value })} placeholder="268" />
              </div>
              <div className="field">
                <label className="caps" htmlFor="f-cliente">Cliente</label>
                <input id="f-cliente" value={factura.cliente} onChange={e => set({ cliente: e.target.value })} />
              </div>
              <div className="field">
                <label className="caps" htmlFor="f-importe">Importe €</label>
                <input id="f-importe" type="number" value={factura.importe} onChange={e => set({ importe: Number(e.target.value) })} />
              </div>
              <div className="field">
                <label className="caps" htmlFor="f-fecha">Fecha</label>
                <input id="f-fecha" type="date" value={factura.fecha} onChange={e => set({ fecha: e.target.value })} />
              </div>
              <div className="field">
                <label className="caps" htmlFor="f-vence">Vencimiento</label>
                <input id="f-vence" type="date" value={factura.fecha_vencimiento || ''} onChange={e => set({ fecha_vencimiento: e.target.value })} />
              </div>
              <div className="field inv__ancho">
                <label className="caps" htmlFor="f-tipo">Tipo de factura</label>
                <select id="f-tipo" value={factura.tipo_factura || 'fuera_ue'} onChange={e => set({ tipo_factura: e.target.value as 'fuera_ue' | 'dentro_ue' })}>
                  <option value="fuera_ue">Fuera de España (sin IVA ni retención)</option>
                  <option value="dentro_ue">España (IVA 21% y retención -15%)</option>
                </select>
                <Chevron />
              </div>
              <div className="field inv__ancho">
                <label className="caps" htmlFor="f-concepto">Concepto · título</label>
                <input id="f-concepto" value={factura.descripcion || ''} onChange={e => set({ descripcion: e.target.value })} placeholder="Tratamiento Digital Web" />
              </div>
              <div className="field inv__ancho">
                <label className="caps" htmlFor="f-detalle">Concepto · detalle</label>
                <input id="f-detalle" value={factura.concepto_detalle || ''} onChange={e => set({ concepto_detalle: e.target.value })} placeholder="Presentación / Tratamiento Digital" />
              </div>
            </div>

            <p className="label caps"><span>Datos fiscales de {factura.cliente}</span><i className="rule" /></p>
            <div className="inv__grid">
              <div className="field inv__ancho">
                <label className="caps" htmlFor="f-id">Identificador · CIF/VAT/nº registro</label>
                <input id="f-id" value={clienteFiscal.identificador || ''} onChange={e => setClienteFiscal({ ...clienteFiscal, identificador: e.target.value })} placeholder="12810068 · VAT 12810068" />
              </div>
              <div className="field inv__ancho">
                <label className="caps" htmlFor="f-dir">Dirección</label>
                <textarea id="f-dir" value={clienteFiscal.direccion || ''} onChange={e => setClienteFiscal({ ...clienteFiscal, direccion: e.target.value })} rows={2} />
              </div>
            </div>

            <div className="inv__foot">
              {saveError && <p className="nota error">{saveError}</p>}
              <button type="button" className="pill pill--sm" onClick={save} disabled={saving}>{saving ? t.guardando : t.guardar}</button>
            </div>
          </section>
        )}

        <article className="sheet" lang={idioma}>
          {/* Facturas de un proyecto de prueba (crear_factura_pago con proyectos.prueba): que nadie las tome por buenas */}
          {factura.fiscal === false && factura.numero?.startsWith('PRUEBA-') && (
            <p style={{ margin: '0 0 24px', padding: '10px 14px', border: '2px solid #c0392b', color: '#c0392b', fontWeight: 700, letterSpacing: '.08em', textAlign: 'center', textTransform: 'uppercase' }}>
              {idioma === 'es' ? 'Prueba · sin validez fiscal' : 'Test · not a valid invoice'}
            </p>
          )}
          <div className="sh__top">
            <span className="sh__name">{emisor.nombre}</span>
            <div className="sh__kind">
              <h1 className="sh__k">{t.titulo}</h1>
              <span className="sh__no">{factura.numero ? `#${factura.numero}` : <span className="sh__bad">({idioma === 'es' ? 'sin número asignado' : 'no number assigned'})</span>}</span>
              {factura.numero_referencia && <span className="sh__k">{t.referencia}: {factura.numero_referencia}</span>}
            </div>
          </div>

          <div className="sh__hero">
            <dl className="sh__dates">
              <div><dt className="sh__k">{t.fecha}</dt><dd>{fechaFmt}</dd></div>
              {vencimientoFmt && <div><dt className="sh__k">{t.vencimiento}</dt><dd>{vencimientoFmt}</dd></div>}
            </dl>
            <div className="sh__total"><span className="sh__k">{t.totalLabel}</span><span className="sh__big">{fmt2(total)}€</span></div>
          </div>

          <div className="sh__parties">
            <div>
              <p className="sh__k sh__lab">{t.de}</p>
              <p className="sh__party">
                <b>{emisor.nombre}</b>
                <span>{emisor.nif}</span>
                {emisor.direccion.split('\n').map((l, i) => <span key={i}>{l}</span>)}
                <span>{emisor.email}</span>
                <span>{emisor.telefono}</span>
              </p>
            </div>
            <div>
              <p className="sh__k sh__lab">{t.para}</p>
              <p className="sh__party">
                <b>{factura.cliente}</b>
                {clienteFiscal.identificador && <span>{clienteFiscal.identificador}</span>}
                {clienteFiscal.direccion && clienteFiscal.direccion.split('\n').map((l, i) => <span key={i}>{l}</span>)}
              </p>
            </div>
          </div>

          <div className="sh__wrap">
            <table className="sh__lines">
              <thead>
                <tr>
                  <th scope="col">{t.concepto}</th>
                  <th scope="col" className="sh__opt">{t.precio}</th>
                  <th scope="col" className="sh__opt">{dentroUe ? t.unidadesCorto : t.unidades}</th>
                  <th scope="col">{t.subtotal}</th>
                  {dentroUe && <th scope="col" className="sh__opt">{t.iva}</th>}
                  {dentroUe && <th scope="col" className="sh__opt">{t.retencion}</th>}
                  <th scope="col">{t.total}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <span className="sh__c">
                      {factura.descripcion || factura.cliente}
                      {factura.numero_referencia && <span className="sh__ref"> · #{factura.numero_referencia}</span>}
                    </span>
                    {factura.concepto_detalle && <span className="sh__d">{factura.concepto_detalle}</span>}
                  </td>
                  <td className="sh__opt">{fmt2(base)}€</td>
                  <td className="sh__opt">1</td>
                  <td>{fmt2(base)}€</td>
                  {dentroUe && <td className="sh__opt">{IVA_PCT}%</td>}
                  {dentroUe && <td className="sh__opt">-{RETENCION_PCT}%</td>}
                  <td>{fmt2(total)}€</td>
                </tr>
              </tbody>
            </table>
          </div>

          {mostrarDetalleHoras && (
            <p className="sh__horas">
              <span><b>{t.horas}:</b> {totalHoras}h</span>
              <span><b>{t.standby}:</b> {totalStandby}h</span>
            </p>
          )}

          <dl className="sh__sum">
            <div><dt>{t.baseImponible}</dt><dd>{fmt2(base)}€</dd></div>
            {dentroUe && (
              <>
                <div><dt>{t.iva} {IVA_PCT}%</dt><dd>{fmt2(ivaAmount)}€</dd></div>
                <div><dt>{t.retencion} {RETENCION_PCT}%</dt><dd>-{fmt2(retencionAmount)}€</dd></div>
              </>
            )}
            <div className="sh__tot"><dt>{t.total}</dt><dd>{fmt2(total)}€</dd></div>
          </dl>

          {!dentroUe && <p className="sh__note">{t.notaFueraUe}</p>}

          {/* Datos de pago para todos (los emails de las webs remiten a la factura); el SWIFT solo fuera de España */}
          {emisor.iban && factura.origen !== 'regularizacion' && (
            <div className="sh__pay">
              <p className="sh__k">{t.notaTransferencia}</p>
              <p className="sh__iban">{emisor.iban}</p>
              {!dentroUe && emisor.swift && <p>SWIFT/BIC: <b>{emisor.swift}</b></p>}
            </div>
          )}
        </article>
      </div>
    </div>
  )
}

const Chevron = () => <svg className="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.2 8 10l4-3.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
const IconoImprimir = () => <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.8v7.6M4.8 7.4 8 10.6l3.2-3.2M3.5 13.2h9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
