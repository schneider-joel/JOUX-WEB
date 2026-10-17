// «Marcar ganado»: de un lead a cliente fiscal + proyecto. La vista previa del navegador y la ruta
// del servidor usan la misma función, así lo que se enseña es exactamente lo que se escribe.
import type { Lead } from './leads'
import type { Marca } from './marcas'
import { detectarPais, type PaisFiscal } from './clientes'
import { tipoLegacy } from './timesheets'

export type ClienteFiscal = { cliente: string; identificador: string | null; direccion: string | null; pais: string | null }

export type FormGanado = {
  existente: boolean           // true = cliente ya guardado en clientes_fiscales (no se escribe)
  datos_cliente: boolean       // cliente nuevo que rellena sus datos fiscales en /datos/<token> (no se escribe ahora)
  cliente: string              // nombre fiscal
  identificador: string
  direccion: string
  pais: PaisFiscal
  nombre: string               // nombre del proyecto
  web: string                  // solo webs
  plan: string                 // solo webs
  precio: number | null        // solo webs: precio cerrado, base sin IVA
  tarifa_dia: number | null    // solo treatments por día: va al evento, proyectos no tiene columna
}

type LeadGanado = Pick<Lead, 'id' | 'nombre' | 'email' | 'empresa' | 'pais' | 'idioma' | 'interes' | 'prueba'>
type MarcaGanado = Pick<Marca, 'key' | 'nombre' | 'modo'>

export const UE_ISO = new Set(['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'])
// País fiscal sugerido: primero por NIF/dirección (src/lib/clientes.ts); si no hay pistas, el país del formulario.
export function sugerirPais(identificador: string, direccion: string, paisLead?: string | null): PaisFiscal {
  const p = detectarPais(identificador, direccion)
  if (p) return p
  const iso = (paisLead || '').toUpperCase()
  if (!iso || iso === 'ES') return 'ES'
  return UE_ISO.has(iso) ? 'UE' : 'EXT'
}

const texto = (v: unknown) => typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''
const numero = (v: unknown) => { const n = Number(String(v ?? '').replace(/[^\d.,]/g, '').replace(',', '.')); return n > 0 ? n : null }

export const nombreProyecto = (cliente: string, marca: MarcaGanado) =>
  marca.modo === 'cerrado' ? `Web ${cliente} · ${marca.nombre}` : `Treatment ${cliente}`

// Valores iniciales del formulario a partir del lead (empresa, plan y precio si el formulario los traía).
export function formInicial(lead: LeadGanado, marca: MarcaGanado, existente?: ClienteFiscal): FormGanado {
  const cliente = existente?.cliente || lead.empresa?.trim() || lead.nombre?.trim() || lead.email
  return {
    existente: !!existente, datos_cliente: !existente, cliente,
    identificador: existente?.identificador || '', direccion: existente?.direccion || '',
    pais: (existente?.pais as PaisFiscal) || sugerirPais('', '', lead.pais),
    nombre: nombreProyecto(cliente, marca),
    web: '', plan: texto(lead.interes?.plan), precio: numero(lead.interes?.precio), tarifa_dia: null,
  }
}

// Qué falta para poder crear; null = listo.
export function faltaGanado(f: FormGanado, marca: MarcaGanado): string | null {
  if (!f.cliente.trim()) return 'Falta el nombre fiscal'
  // Si los rellena el cliente, el NIF, la dirección y el país llegan luego por el formulario.
  const aMano = !f.existente && !f.datos_cliente
  if (aMano && !f.identificador.trim()) return 'Falta el NIF/CIF'
  if (aMano && !f.direccion.trim()) return 'Falta la dirección'
  if (aMano && !['ES', 'UE', 'EXT'].includes(f.pais)) return 'Falta el país'
  if (!f.nombre.trim()) return 'Falta el nombre del proyecto'
  if (marca.modo === 'cerrado' && !(Number(f.precio) > 0)) return 'Falta el precio cerrado'
  return null
}

// Las filas exactas que se van a escribir. `proyectos` sin id: lo pone la base de datos.
export function filasGanado(lead: LeadGanado, marca: MarcaGanado, f: FormGanado) {
  const cliente = f.cliente.trim()
  const clienteFiscal = f.existente || f.datos_cliente ? null : {
    cliente, identificador: f.identificador.trim() || null, direccion: f.direccion.trim() || null, pais: f.pais,
  }
  const web = marca.modo === 'cerrado'
  const proyecto = {
    nombre: f.nombre.trim(), cliente, tipo: tipoLegacy(cliente), status: 'activo',
    modo_rate: marca.modo === 'hora' ? 'hora' : 'dia', marca: marca.key,
    web: web ? f.web.trim().replace(/^https?:\/\//, '') || null : null,
    plan: web ? f.plan.trim() || null : null,
    precio_cerrado: web ? Number(f.precio) : null,
    // Solo las webs se siguen por etapas (/proyectos); los treatments van por su timesheet.
    fase: web ? 'confirmado' : null, lead_id: lead.id,
    contacto_email: lead.email, contacto_nombre: lead.nombre?.trim() || null, idioma: lead.idioma,
    // Un lead de prueba (leads.prueba) da un proyecto de prueba: sus facturas salen sin validez fiscal.
    prueba: !!lead.prueba,
  }
  const evento = {
    tipo: 'lead.ganado', fuente: 'joux-hub',
    datos: { cliente, cliente_nuevo: !f.existente, ...(f.datos_cliente && !f.existente ? { datos_por_formulario: true } : {}), ...(marca.modo === 'dia' && f.tarifa_dia ? { tarifa_dia: Number(f.tarifa_dia) } : {}) },
  }
  return { clienteFiscal, proyecto, evento }
}
