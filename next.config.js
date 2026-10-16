/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Chrome headless para generar los PDF del ZIP trimestral: tiene que
    // quedar fuera del bundle y llevarse sus binarios a la función.
    serverComponentsExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
    outputFileTracingIncludes: {
      '/api/trimestre/zip': ['./node_modules/@sparticuz/chromium/bin/**'],
      // Contextos de la IA por marca: se leen con fs al redactar borradores.
      '/api/intake/lead': ['./src/lib/ia/contexto/**'],
      '/api/leads/[id]/borrador': ['./src/lib/ia/contexto/**'],
      '/api/cron/tick': ['./src/lib/ia/contexto/**'],
    },
  },
}
module.exports = nextConfig
