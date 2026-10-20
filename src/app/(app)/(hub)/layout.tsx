import Hub from '../../hub'

// Las pantallas del antiguo Overview (antes pestañas en memoria) comparten este layout: el hub se
// monta una vez, carga los datos y pinta la pantalla de la ruta. Cambiar de sección no recarga nada.
// Las páginas de este grupo dan la ruta y el título; la de cada marca, además, sus cifras y su tablero
// (el hub las pinta dentro de la pantalla de la marca).
export default function HubLayout({ children }: { children: React.ReactNode }) {
  return <Hub>{children}</Hub>
}
