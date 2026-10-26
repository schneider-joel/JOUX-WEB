// Subcarpetas de Drive por marca (usable en el navegador; la creación está en src/lib/drive.ts).
// Una marca sin entrada no crea carpeta (Cartela tampoco: el cliente sube sus fotos desde su enlace de cambios). The Pitch Lab se comparte desde joel@ y el cliente ve
// «Joel Schneider» como propietario: Joel lo acepta (2026-10-18). Pitchview sigue siendo white-label.
export const SUBCARPETAS: Record<string, string[]> = {
  arkevo: ['Fotos', 'Planos', 'Logo y marca', 'Textos', 'Otros'],
  custom: ['Fotos', 'Planos', 'Logo y marca', 'Textos', 'Otros'],
  pitchlab: ['Brief', 'Referencias', 'Texto', 'Otros'],
}

// Las barras del nombre se cambian por guiones: la ruta se crea partiéndola por «/».
const sinBarras = (s: string) => s.replace(/\//g, '-').trim()
export const rutaCarpeta = (marca: string, cliente: string, proyecto: string) => `Clientes/${sinBarras(marca)}/${sinBarras(`${cliente} · ${proyecto}`)}`
