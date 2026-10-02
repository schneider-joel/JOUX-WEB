import CompartidosVista from '../../compartidos-vista'

export const dynamic = 'force-dynamic'

// Al añadirla a la pantalla de inicio del iPhone se llama "Casona" (como el
// tricount) y usa su propio icono (apple-icon.tsx de esta carpeta).
export const metadata = {
  title: 'Casona · gastos compartidos',
  description: 'Quién pagó qué y quién debe a quién',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'Casona', statusBarStyle: 'black-translucent' as const },
}

// Link privado de la pareja: solo la cuenta compartida, sin acceso al hub.
// El token lo valida /api/compartidos.
export default function CompartidosPareja({ params }: { params: { token: string } }) {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '28px 16px 60px' }}>
      <h1 className="page-title" style={{ marginBottom: 4 }}>Gastos compartidos</h1>
      <div className="page-sub" style={{ marginBottom: 18 }}>Quién pagó qué y quién debe a quién</div>
      <CompartidosVista token={params.token} />
    </main>
  )
}
