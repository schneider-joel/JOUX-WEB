import { ImageResponse } from 'next/og'

// Icono de la cuenta compartida: una casa sobre fondo cálido. Lo usan el
// Apple touch icon y el favicon del link de la pareja.
const casa = (color: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 14 L88 46 H77 V84 H58 V62 H42 V84 H23 V46 H12 Z" fill="${color}" stroke="${color}" stroke-width="4" stroke-linejoin="round"/></svg>`
  )}`

export function iconoCasa(lado: number, redondeo: number) {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: redondeo, background: 'linear-gradient(135deg, #fbbf24 0%, #f97316 55%, #c2410c 100%)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={casa('#ffffff')} width={lado * 0.62} height={lado * 0.62} alt="" />
      </div>
    ),
    { width: lado, height: lado }
  )
}
