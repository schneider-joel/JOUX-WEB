import AppShell from '../app-shell'

// Todas las páginas privadas del hub van dentro del mismo marco (menú, migas y barra del móvil).
// Las públicas (/invoice, /t, /th, /ab, /c, /datos, /login) quedan fuera de este grupo, sin cambios.
export default function MarcoLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
