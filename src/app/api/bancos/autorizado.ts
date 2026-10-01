import { cookies } from 'next/headers'

// Mismo control que /api/db: el cookie con la contraseña de la app.
export const autorizado = () => {
  const c = cookies().get('joux_auth')?.value
  return !!c && !!process.env.APP_PASSWORD && c === process.env.APP_PASSWORD
}
