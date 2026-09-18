import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'JOUX Hub',
  description: 'Panel financiero personal',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
