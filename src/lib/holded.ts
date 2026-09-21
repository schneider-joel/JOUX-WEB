// Cliente server-only para la API v2 de Holded (REST/JSON, auth Bearer).
// Nunca importar esto desde un componente 'use client' — usa el API key.

const BASE = 'https://api.holded.com/api/v2'

function headers() {
  return {
    Authorization: `Bearer ${process.env.HOLDED_API_KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

async function holdedFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers(), ...init?.headers } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Holded ${path} error: ${res.status} ${JSON.stringify(body)}`)
  return body
}

export async function buscarContactoPorNombre(nombre: string): Promise<string | null> {
  const data = await holdedFetch(`/contacts/search?name=${encodeURIComponent(nombre)}&limit=10`)
  const items = data.items || []
  const exacto = items.find((c: any) => c.name.toLowerCase() === nombre.toLowerCase())
  return (exacto || items[0])?.id || null
}

export async function crearContacto(datos: { nombre: string; identificador?: string; direccion?: string }): Promise<string> {
  const lineas = (datos.direccion || '').split('\n')
  const data = await holdedFetch('/contacts', {
    method: 'POST',
    body: JSON.stringify({
      name: datos.nombre,
      code: datos.identificador || undefined,
      type: ['client'],
      bill_address: datos.direccion ? { address: lineas[0] || '', info: lineas.slice(1).join(', ') || undefined } : undefined,
    }),
  })
  return data.id
}

export async function crearPresupuesto(datos: {
  contactId: string
  descripcion: string
  fecha: string
  importe: number
  notas: string
  numero: string
}): Promise<string> {
  const data = await holdedFetch('/estimates', {
    method: 'POST',
    body: JSON.stringify({
      contact_id: datos.contactId,
      description: datos.descripcion,
      date: datos.fecha,
      notes: datos.notas,
      number: datos.numero,
      items: [{ name: datos.descripcion, type: 'service', units: 1, price: datos.importe }],
    }),
  })
  return data.id
}
