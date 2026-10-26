import { redirect } from 'next/navigation'

// Los leads van ahora junto a los proyectos, en una franja por marca (Work › Proyectos, rediseño comercial
// fase 1). Los enlaces viejos a /leads y /leads?marca= llevan allí; la ficha /leads/<id> sigue igual.
export default function LeadsPage({ searchParams }: { searchParams: { marca?: string } }) {
  redirect(searchParams.marca ? `/work?marca=${encodeURIComponent(searchParams.marca)}` : '/work')
}
