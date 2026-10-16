// Subcarpetas de Drive por marca (usable en el navegador; la creación está en src/lib/drive.ts).
// Una marca sin entrada no crea carpeta. The Pitch Lab queda fuera hasta que Joel decida: compartida
// desde joel@, el cliente vería «Joel Schneider» como propietario.
export const SUBCARPETAS: Record<string, string[]> = {
  arkevo: ['Fotos', 'Planos', 'Logo y marca', 'Textos', 'Otros'],
  custom: ['Fotos', 'Planos', 'Logo y marca', 'Textos', 'Otros'],
  // pitchlab: ['Brief', 'Referencias', 'Texto', 'Otros'],
}

// Las barras del nombre se cambian por guiones: la ruta se crea partiéndola por «/».
const sinBarras = (s: string) => s.replace(/\//g, '-').trim()
export const rutaCarpeta = (marca: string, cliente: string, proyecto: string) => `Clientes/${sinBarras(marca)}/${sinBarras(`${cliente} · ${proyecto}`)}`
