import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #fb923c 0%, #c2410c 100%)',
          fontFamily: 'sans-serif',
          fontWeight: 700,
          fontSize: 108,
          color: '#fff',
        }}
      >
        J
      </div>
    ),
    { ...size }
  )
}
