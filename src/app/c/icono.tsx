import { ImageResponse } from 'next/og'

// Icono de la cuenta compartida "Casona": degradado de celeste a rosa, lo
// bastante oscuro para que el texto blanco contraste. El grande (pantalla de
// inicio) lleva el nombre; el pequeño (favicon) solo la inicial.
const FONDO = 'linear-gradient(135deg, #0284c7 0%, #7c3aed 52%, #db2777 100%)'

export function iconoCasona(lado: number, redondeo = 0) {
  const grande = lado >= 120
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: redondeo, background: FONDO, color: '#fff', fontFamily: 'sans-serif' }}>
        {grande ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ display: 'flex', fontSize: lado * 0.2, fontWeight: 700, letterSpacing: lado * 0.006 }}>CASONA</div>
            <div style={{ display: 'flex', fontSize: lado * 0.083, fontWeight: 600, letterSpacing: lado * 0.022, marginTop: lado * 0.03, opacity: 0.9 }}>SOX Y JOEL</div>
          </div>
        ) : (
          <div style={{ fontSize: lado * 0.66, fontWeight: 700, lineHeight: 1 }}>C</div>
        )}
      </div>
    ),
    { width: lado, height: lado }
  )
}
