import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  // Base para las URLs absolutas de las imágenes de vista previa (og:image).
  metadataBase: new URL(process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000'),
  title: 'JOUX Hub',
  description: 'Panel financiero personal',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'JOUX Hub',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0908',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
