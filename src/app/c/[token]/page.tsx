import CompartidosVista from '../../compartidos-vista'

export const dynamic = 'force-dynamic'

// Al añadirla a la pantalla de inicio del iPhone se llama "Casona" (como el
// tricount) y usa su propio icono (apple-icon.tsx de esta carpeta).
export const metadata = {
  title: 'Casona · gastos compartidos',
  description: 'Quién pagó qué y quién debe a quién',
  robots: { index: false, follow: false },
  // Sin el manifest del hub: el icono de Casona tiene que abrir este link.
  manifest: null,
  appleWebApp: { capable: true, title: 'Casona', statusBarStyle: 'black-translucent' as const },
}

// Link privado de la pareja: solo la cuenta compartida, sin acceso al hub.
// El token lo valida /api/compartidos.
// Con el aspecto del hub (.app), pero sin su marco: solo el título y la cuenta.
export default function CompartidosPareja({ params }: { params: { token: string } }) {
  return (
    <div className="app">
      <main className="casona">
        <header className="page-header">
          <div className="page-header__txt">
            <h1 className="page-title">Gastos compartidos</h1>
            <p className="tags caps">Quién pagó qué y quién debe a quién</p>
          </div>
        </header>
        <CompartidosVista token={params.token} />
      </main>
    </div>
  )
}
