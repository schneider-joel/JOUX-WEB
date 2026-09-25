/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Chrome headless para generar los PDF del ZIP trimestral: tiene que
    // quedar fuera del bundle y llevarse sus binarios a la función.
    serverComponentsExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
    outputFileTracingIncludes: {
      '/api/trimestre/zip': ['./node_modules/@sparticuz/chromium/bin/**'],
    },
  },
}
module.exports = nextConfig
