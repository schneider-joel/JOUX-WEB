// Remitente de las respuestas a leads por marca: alias de «Enviar como» en el Gmail de joel@joelschneider.io.
// Usable en el navegador. Si el alias no está verificado en Gmail, el envío se corta (ver enviarGmail).
const REMITENTES: Record<string, { es: string; en: string }> = {
  arkevo: { es: 'Arkevo <hola@arkevostudio.com>', en: 'Arkevo <hello@arkevostudio.com>' },
  // Sin nombres de persona: firma The Pitch Lab.
  pitchlab: { es: 'The Pitch Lab <hello@thepitchlab.xyz>', en: 'The Pitch Lab <hello@thepitchlab.xyz>' },
  // Custom Websites es la marca personal: sale de la cuenta principal (decisión de Joel, 2026-10-16).
  custom: { es: 'Joel Schneider <joel@joelschneider.io>', en: 'Joel Schneider <joel@joelschneider.io>' },
}

export const remitenteLead = (marca: string, idioma: string) => {
  const r = REMITENTES[marca]
  return r ? r[idioma === 'en' ? 'en' : 'es'] : null
}

export const direccion = (remitente: string) => (remitente.match(/<([^>]+)>/)?.[1] || remitente).trim().toLowerCase()

// Marcas `[[Joel: …]]` que la IA deja para lo que no sabe: mientras quede una, no se envía.
export const marcasJoel = (texto: string) => texto.match(/\[\[Joel:[^\]]*\]\]/g) || []
