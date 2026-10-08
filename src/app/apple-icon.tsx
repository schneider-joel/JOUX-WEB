import { ImageResponse } from 'next/og'
import { svgJo } from './marca-jo'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

// Icono de la pantalla de inicio: cuadrado, iOS ya le pone las esquinas.
export default function AppleIcon() {
  const src = `data:image/svg+xml;base64,${Buffer.from(svgJo(0)).toString('base64')}`
  // eslint-disable-next-line @next/next/no-img-element
  return new ImageResponse(<img src={src} width={size.width} height={size.height} alt="" />, { ...size })
}
