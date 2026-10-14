'use client'

import { useEffect, useRef, useState } from 'react'

// Piezas del marco del hub (las esquinas y el menú de la web joelschneider.io).
// Solo presentación: no leen ni escriben datos.

// Hora de Valencia, con segundos. En una sola cadena para que el modo privado no la tome por un importe.
const fmtHora = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
export function Reloj() {
  const [hora, setHora] = useState<string[] | null>(null)
  useEffect(() => {
    const tic = () => setHora(fmtHora.format(new Date()).split(':'))
    tic()
    const t = setInterval(tic, 1000)
    return () => clearInterval(t)
  }, [])
  return <span className="tnum">{hora ? `${hora[0]}:${hora[1]}` : '--:--'}<span className="sec">{hora ? `:${hora[2]}` : ':--'}</span></span>
}

// Estado de los bancos: verde si la lectura más antigua es de las últimas 26 h (el cron pasa cada día).
const fmtCorta = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })
const fmtDia = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short' })
export function EstadoBancos({ sync }: { sync: number | null }) {
  if (sync === null) return null
  const horas = (Date.now() - sync) / 3600e3
  const alDia = sync > 0 && horas < 26
  const texto = !sync ? 'Bancos sin sincronizar'
    : alDia ? `Bancos al día · ${fmtCorta.format(sync)}`
    : `Bancos · ${fmtDia.format(sync).replace('.', '')}`
  return (
    <span className="status" title={sync ? `Última lectura de los bancos: ${fmtDia.format(sync)}, ${fmtCorta.format(sync)}` : undefined}>
      <i className={`dot ${alDia ? 'dot--green' : 'dot--amber'}`} aria-hidden="true" />{texto}
    </span>
  )
}

// Tema claro u oscuro: se guarda en este navegador (el script de layout.tsx lo aplica antes de pintar).
export const CLAVE_TEMA = 'joux_tema'
export function TemaBoton() {
  const [oscuro, setOscuro] = useState(true)
  useEffect(() => { setOscuro(document.documentElement.dataset.theme !== 'light') }, [])
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', oscuro ? '#0B0B0B' : '#FAFAF9')
  }, [oscuro])
  const alternar = () => {
    const tema = oscuro ? 'light' : 'dark'
    document.documentElement.dataset.theme = tema
    try { localStorage.setItem(CLAVE_TEMA, tema) } catch {}
    setOscuro(!oscuro)
  }
  return (
    <button type="button" className="tgl hit" onClick={alternar} title="Cambiar entre tema claro y oscuro">
      <span className="theme__dot" aria-hidden="true" />{oscuro ? 'Oscuro' : 'Claro'}
    </button>
  )
}

// Menú de secciones: numeradas y la activa entre corchetes; en el móvil, una tira abajo.
export type ItemMenu = { id: string; label: string; badge: number; tranquilo?: boolean }
export function Menu({ items, activa, onAbrir }: { items: ItemMenu[]; activa: string; onAbrir: (id: string) => void }) {
  const ref = useRef<HTMLElement>(null)
  // En el móvil la tira se desplaza: la sección actual, a la vista.
  useEffect(() => {
    const nav = ref.current, on = nav?.querySelector<HTMLElement>('.is-on')
    if (nav && on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = on.offsetLeft - 22
  }, [activa])
  return (
    <nav className="nav caps" aria-label="Secciones" ref={ref} data-r style={{ '--d': 1 } as React.CSSProperties}>
      {items.map((s, i) => (
        <button key={s.id} type="button" className={`nav__a${s.id === activa ? ' is-on' : ''}`} aria-current={s.id === activa ? 'page' : undefined} onClick={() => onAbrir(s.id)}>
          <span className="nav__n">{String(i + 1).padStart(2, '0')}</span>
          <span className="nav__l">{s.label}</span>
          {s.badge > 0 && <span className={`nav__b${s.tranquilo ? ' dim' : ''}`}>{s.badge}</span>}
        </button>
      ))}
    </nav>
  )
}
