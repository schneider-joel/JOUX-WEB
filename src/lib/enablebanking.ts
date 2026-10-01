import { createSign, createHash } from 'crypto'
import fs from 'fs'
import path from 'path'

// Cliente mínimo de la API de Enable Banking (open banking PSD2, solo lectura).
// Credenciales solo en el servidor: ENABLE_BANKING_APP_ID y la clave privada
// en ENABLE_BANKING_PRIVATE_KEY (PEM, con "\n" escapados) o, en local, el
// archivo <APP_ID>.pem en la raíz del proyecto (ignorado por git).
const API = 'https://api.enablebanking.com'

function clavePrivada(appId: string): string {
  const env = process.env.ENABLE_BANKING_PRIVATE_KEY
  if (env) return env.replace(/\\n/g, '\n')
  const archivo = path.join(process.cwd(), `${appId}.pem`)
  if (fs.existsSync(archivo)) return fs.readFileSync(archivo, 'utf8')
  throw new Error('Falta la clave privada de Enable Banking')
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url')

function jwt(): string {
  const appId = process.env.ENABLE_BANKING_APP_ID
  if (!appId) throw new Error('Falta ENABLE_BANKING_APP_ID')
  const iat = Math.floor(Date.now() / 1000)
  const cabecera = b64url(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: appId }))
  const cuerpo = b64url(JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + 3600 }))
  const firma = createSign('RSA-SHA256').update(`${cabecera}.${cuerpo}`).sign(clavePrivada(appId))
  return `${cabecera}.${cuerpo}.${b64url(firma)}`
}

export const enableBankingConfigurado = () => !!process.env.ENABLE_BANKING_APP_ID

export async function eb<T = any>(ruta: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(API + ruta, {
    method: init.method || 'GET',
    headers: { Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  })
  const texto = await res.text()
  const datos = texto ? JSON.parse(texto) : {}
  if (!res.ok) throw new Error(`Enable Banking ${res.status}: ${datos.message || datos.error || texto.slice(0, 200)}`)
  return datos as T
}

export type Aspsp = { name: string; country: string; logo?: string; maximum_consent_validity?: number; psu_types?: string[] }

export type CuentaEB = { uid: string; name?: string; currency?: string; account_id?: { iban?: string }; product?: string }

export type SaldoEB = { name?: string; balance_type: string; balance_amount: { amount: string; currency: string }; reference_date?: string }

export type MovimientoEB = {
  entry_reference?: string
  transaction_id?: string
  transaction_amount: { amount: string; currency: string }
  credit_debit_indicator: 'CRDT' | 'DBIT'
  status?: string
  booking_date?: string
  value_date?: string
  transaction_date?: string
  creditor?: { name?: string }
  debtor?: { name?: string }
  remittance_information?: string[]
}

// Id estable para no duplicar movimientos entre sincronizaciones.
export function idMovimiento(cuentaUid: string, m: MovimientoEB): string {
  const ref = m.entry_reference || m.transaction_id
  if (ref) return `${cuentaUid}:${ref}`
  const huella = [m.booking_date || m.value_date, m.transaction_amount.amount, m.credit_debit_indicator, (m.remittance_information || []).join(' ')].join('|')
  return `${cuentaUid}:h${createHash('sha1').update(huella).digest('hex').slice(0, 16)}`
}
