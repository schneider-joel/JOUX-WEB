import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
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
          borderRadius: 7,
          fontFamily: 'sans-serif',
          fontWeight: 700,
          fontSize: 20,
          color: '#fff',
        }}
      >
        J
      </div>
    ),
    { ...size }
  )
}
