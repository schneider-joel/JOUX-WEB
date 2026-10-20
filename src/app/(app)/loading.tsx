// Mientras llega una página del servidor (Leads, Proyectos, una ficha…): el menú se queda y aquí sale
// esto al instante, para que el clic se note aunque la página tarde.
export default function Cargando() {
  return (
    <main className="main sh__cargando" aria-busy="true" aria-label="Cargando">
      <span className="sh__cl" style={{ width: '38%' }} />
      <span className="sh__cl" style={{ width: '22%' }} />
      <span className="sh__cl sh__cl--b" />
      <span className="sh__cl" style={{ width: '64%' }} />
      <span className="sh__cl" style={{ width: '52%' }} />
    </main>
  )
}
