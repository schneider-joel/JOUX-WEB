import { ImageResponse } from 'next/og'
import { svgJo } from './marca-jo'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

// Favicon "Jō" (con esquinas redondeadas).
export default function Icon() {
  const src = `data:image/svg+xml;base64,${Buffer.from(svgJo(830)).toString('base64')}`
  // eslint-disable-next-line @next/next/no-img-element
  return new ImageResponse(<img src={src} width={size.width} height={size.height} alt="" />, { ...size })
}
