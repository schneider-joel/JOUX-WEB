import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  // Base para las URLs absolutas de las imágenes de vista previa (og:image).
  metadataBase: new URL(process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000'),
  title: 'JOUX Hub',
  description: 'Panel financiero personal',
  // Para añadir el hub a la pantalla de inicio (en iPhone es lo que permite
  // recibir notificaciones push).
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'JOUX Hub',
  },
}

export const viewport: Viewport = {
  themeColor: '#0B0B0B',
  // Ocupa también la zona del notch; el contenido se aparta con env(safe-area-inset-*).
  viewportFit: 'cover',
}

// Tema claro u oscuro (oscuro por defecto): se aplica antes de pintar para que no parpadee.
// La clave es la de TemaBoton (marco.tsx).
const scriptTema = `try{var t=localStorage.getItem('joux_tema');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: scriptTema }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
