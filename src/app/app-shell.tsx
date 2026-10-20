'use client'

import { createContext, Suspense, useCallback, useContext, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { esAgencia, porOrden, type Marca } from '@/lib/marcas'
import NotificacionesBoton from './notificaciones-boton'
import ModoPrivado from './modo-privado'
import { EstadoBancos, TemaBoton } from './marco'
import { rutaDeTab } from './rutas'

// Marco del hub (rediseño, fase 1): barra lateral agrupada con iconos, cabecera con migas y, en el
// móvil, barra inferior. Solo presentación: lee las marcas y cuántos leads esperan, nada más.
// Las insignias de Facturas y de cada marca las calcula el hub (hub.tsx), igual que antes en sus
// pestañas, y las publica aquí; se recuerdan en esta pestaña del navegador para el resto de páginas.

type Publicado = { insignias?: Record<string, number>; bancosSync?: number | null; actualizar?: () => void; datos?: string }
const Ctx = createContext<(p: Publicado) => void>(() => {})
export const usePublicarMarco = () => useContext(Ctx)
const CLAVE_INSIGNIAS = 'joux_insignias'

const svg = { className: 'sh__i', viewBox: '0 0 24 24', 'aria-hidden': true } as const
const I = {
  home: <svg {...svg}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>,
  inbox: <svg {...svg}><path d="M3 13h5l2 3h4l2-3h5" /><path d="M5 5h14l2 8v6H3v-6z" /></svg>,
  flag: <svg {...svg}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>,
  cube: <svg {...svg}><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></svg>,
  cup: <svg {...svg}><path d="M5 8h12v5a6 6 0 0 1-12 0z" /><path d="M17 9h2a2 2 0 0 1 0 4h-2" /></svg>,
  film: <svg {...svg}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 5v14M17 5v14M3 10h4M17 10h4M3 14h4M17 14h4" /></svg>,
  code: <svg {...svg}><path d="M9 8l-4 4 4 4M15 8l4 4-4 4" /></svg>,
  clock: <svg {...svg}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>,
  doc: <svg {...svg}><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></svg>,
  cart: <svg {...svg}><path d="M3 4h2l2 11h11l2-8H6" /><circle cx="9" cy="19" r="1.3" /><circle cx="17" cy="19" r="1.3" /></svg>,
  euro: <svg {...svg}><path d="M17 6a7 7 0 1 0 0 12M4 10h9M4 14h9" /></svg>,
  bank: <svg {...svg}><path d="M3 10l9-5 9 5M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18" /></svg>,
  chart: <svg {...svg}><path d="M4 19h16" /><path d="M5 15l4-4 4 3 6-7" /></svg>,
  card: <svg {...svg}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M7 10h4M7 14h10" /></svg>,
  users: <svg {...svg}><circle cx="9" cy="9" r="3" /><path d="M3 19a6 6 0 0 1 12 0M16 7a3 3 0 0 1 0 6M18 19a5 5 0 0 0-3-4.6" /></svg>,
  gear: <svg {...svg}><circle cx="12" cy="12" r="3" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" /></svg>,
  more: <svg {...svg}><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></svg>,
  refresh: <svg {...svg}><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" /></svg>,
}
const ICONO_MARCA: Record<string, JSX.Element> = { arkevo: I.cube, cartela: I.cup, pitchlab: I.film, custom: I.code, ab: I.clock }

// Finanzas: las pestañas de Facturación, Bancos y Presupuesto. Patrimonio llega en la fase 5.
const FINANZAS = [
  { tab: 'facturas', label: 'Facturas', icono: I.doc },
  { tab: 'compras', label: 'Compras', icono: I.cart },
  { tab: 'impuestos', label: 'Impuestos', icono: I.euro },
  { tab: 'bancos', label: 'Bancos', icono: I.bank },
  { tab: 'presupuesto', label: 'Presupuesto', icono: I.chart },
  { tab: 'clientes', label: 'Clientes', icono: I.card },
].map(f => ({ ...f, href: rutaDeTab(f.tab)! }))

type Item = { href: string; label: string; icono?: JSX.Element; n?: number; tranquilo?: boolean; activo: boolean }

function Entrada({ it, sub }: { it: Item; sub?: boolean }) {
  return (
    <Link href={it.href} className={`sh__it${sub ? ' sh__it--sub' : ''}`} aria-current={it.activo ? 'page' : undefined}>
      {it.icono}<span className="sh__l">{it.label}</span>
      {!!it.n && <span className={`sh__n${it.tranquilo ? ' dim' : ''}`}>{it.n}</span>}
    </Link>
  )
}

type DatosMenu = { marcas: Marca[]; insignias: Record<string, number>; leads: number }

// Menú agrupado: el mismo en la barra lateral y en «Más» del móvil.
function Menu({ datos, marcaQ }: { datos: DatosMenu; marcaQ: string | null }) {
  const ruta = usePathname()
  const { marcas, insignias, leads } = datos
  const marcaAbierta = ruta.match(/^\/work\/([\w-]+)/)?.[1] || (ruta === '/leads' ? marcaQ : null)
  return (
    <>
      <nav className="sh__grp" aria-label="Inicio">
        <span className="sh__h caps">Inicio</span>
        <Entrada it={{ href: '/', label: 'Hoy', icono: I.home, activo: ruta === '/' }} />
      </nav>
      <nav className="sh__grp" aria-label="Work">
        <span className="sh__h caps">Work</span>
        <Entrada it={{ href: '/leads', label: 'Leads', icono: I.inbox, n: leads, activo: ruta.startsWith('/leads') && !marcaQ }} />
        <Entrada it={{ href: '/work', label: 'Proyectos', icono: I.flag, activo: ruta === '/work' }} />
      </nav>
      {/* Las marcas, aparte de Leads y Proyectos (que son de todas): cada una con su pantalla. */}
      <nav className="sh__grp" aria-label="Marcas">
        <span className="sh__h caps">Marcas</span>
        {marcas.map(m => {
          const web = esAgencia(m)
          const abierta = marcaAbierta === m.key
          return (
            <div key={m.key} className="sh__marca">
              <Entrada it={{ href: `/work/${m.key}`, label: m.nombre, icono: ICONO_MARCA[m.key] || I.cube, n: insignias[`${web ? 'mk' : 'ts'}:${m.key}`], tranquilo: !web, activo: false }} />
              {abierta && (
                <div className="sh__subs">
                  <Entrada sub it={{ href: `/work/${m.key}`, label: 'Proyectos', activo: ruta === `/work/${m.key}` }} />
                  {m.key !== 'ab' && <Entrada sub it={{ href: `/leads?marca=${m.key}`, label: 'Leads', activo: ruta === '/leads' && marcaQ === m.key }} />}
                </div>
              )}
            </div>
          )
        })}
      </nav>
      <nav className="sh__grp" aria-label="Finanzas">
        <span className="sh__h caps">Finanzas</span>
        {FINANZAS.map(f => <Entrada key={f.tab} it={{ href: f.href, label: f.label, icono: f.icono, n: insignias[f.tab], activo: ruta === f.href }} />)}
      </nav>
      <nav className="sh__grp sh__pie" aria-label="Más">
        <Entrada it={{ href: '/compartidos', label: 'Compartidos', icono: I.users, activo: ruta === '/compartidos' }} />
        <Entrada it={{ href: '/ajustes', label: 'Ajustes', icono: I.gear, activo: ruta === '/ajustes' }} />
      </nav>
    </>
  )
}

// Migas: la sección y la página. /leads?marca= y /leads/<id> dicen de qué marca.
function Migas({ marcas, marcaQ }: { marcas: Marca[]; marcaQ: string | null }) {
  const ruta = usePathname()
  const nombre = (k: string | null) => (k && marcas.find(m => m.key === k)?.nombre) || k
  const f = FINANZAS.find(x => x.href === ruta)
  const partes: { t: string; href?: string }[] =
    ruta === '/' ? [{ t: 'Inicio' }, { t: 'Hoy' }]
    : f ? [{ t: 'Finanzas' }, { t: f.label }]
    : ruta === '/work' ? [{ t: 'Work' }, { t: 'Proyectos' }]
    : ruta.startsWith('/work/') ? [{ t: 'Marcas' }, { t: nombre(ruta.split('/')[2]) || '' }]
    : ruta === '/leads' ? [{ t: 'Work' }, { t: 'Leads', href: marcaQ ? '/leads' : undefined }, ...(marcaQ ? [{ t: nombre(marcaQ) || '' }] : [])]
    : ruta.startsWith('/leads/') ? [{ t: 'Work' }, { t: 'Leads', href: '/leads' }, { t: `#${ruta.split('/')[2]}` }]
    : ruta === '/compartidos' ? [{ t: 'Compartidos' }]
    : ruta === '/ajustes' ? [{ t: 'Ajustes' }]
    : []
  return (
    <nav className="sh__migas" aria-label="Estás en">
      {partes.map((p, i) => (
        <span key={i} className="sh__miga">
          {i > 0 && <span className="sh__sep" aria-hidden="true">/</span>}
          {p.href ? <Link href={p.href}>{p.t}</Link> : <span aria-current={i === partes.length - 1 ? 'page' : undefined}>{p.t}</span>}
        </span>
      ))}
    </nav>
  )
}

// En el móvil no hay barra lateral: las páginas hermanas de Finanzas y de Work, en una tira de chips.
function Hermanas({ marcas }: { marcas: Marca[] }) {
  const ruta = usePathname()
  const lista = ruta.startsWith('/finanzas/') ? FINANZAS.map(f => ({ href: f.href, label: f.label }))
    : ruta === '/work' || ruta.startsWith('/work/') ? [{ href: '/work', label: 'Proyectos' }, ...marcas.map(m => ({ href: `/work/${m.key}`, label: m.nombre }))]
    : null
  if (!lista) return null
  return (
    <nav className="sh__hermanas chips__row" aria-label="Secciones">
      {lista.map(x => <Link key={x.href} href={x.href} className="chip" aria-current={ruta === x.href ? 'page' : undefined}><span>{x.label}</span></Link>)}
    </nav>
  )
}

// useSearchParams obliga a un Suspense en las páginas estáticas; mientras, el menú sale sin el filtro.
function ConQuery({ hijo }: { hijo: (marcaQ: string | null) => React.ReactNode }) {
  const q = useSearchParams()
  return <>{hijo(q.get('marca'))}</>
}
const conQuery = (hijo: (marcaQ: string | null) => React.ReactNode) => <Suspense fallback={hijo(null)}><ConQuery hijo={hijo} /></Suspense>

export default function AppShell({ children }: { children: React.ReactNode }) {
  const ruta = usePathname()
  const router = useRouter()
  const [marcas, setMarcas] = useState<Marca[]>([])
  const [leads, setLeads] = useState(0)
  const [pub, setPub] = useState<Publicado>({})
  const [mas, setMas] = useState(false)

  useEffect(() => {
    try { const g = sessionStorage.getItem(CLAVE_INSIGNIAS); if (g) setPub(p => ({ insignias: JSON.parse(g), ...p })) } catch {}
    supabase.from('marcas').select('*').order('created_at').then(({ data }) => { if (data) setMarcas([...(data as Marca[])].sort(porOrden)) })
  }, [])
  // Leads que esperan a Joel (los mismos que la tarjeta «Leads» del Overview). Se recuenta al cambiar de página.
  useEffect(() => {
    fetch('/api/leads').then(r => r.ok ? r.json() : null).then(j => { if (j) setLeads(j.nuevos?.length || 0) }).catch(() => {})
  }, [ruta])
  useEffect(() => { setMas(false) }, [ruta])
  useEffect(() => {
    if (!mas) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMas(false) }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [mas])

  const publicar = useCallback((p: Publicado) => {
    setPub(prev => ({ ...prev, ...p }))
    if (p.insignias) try { sessionStorage.setItem(CLAVE_INSIGNIAS, JSON.stringify(p.insignias)) } catch {}
  }, [])
  const datos: DatosMenu = { marcas, insignias: pub.insignias || {}, leads }

  // Barra inferior del móvil: Hoy · Work · Leads · Finanzas · Más.
  const abajo = [
    { href: '/', label: 'Hoy', icono: I.home, on: ruta === '/' },
    { href: '/work', label: 'Work', icono: I.cube, on: ruta.startsWith('/work') },
    { href: '/leads', label: 'Leads', icono: I.inbox, on: ruta.startsWith('/leads'), n: leads },
    { href: '/finanzas/facturas', label: 'Finanzas', icono: I.euro, on: ruta.startsWith('/finanzas'), n: pub.insignias?.facturas },
  ]

  return (
    <Ctx.Provider value={publicar}>
      <div className="app shell">
        <aside className="sh__side" aria-label="Menú">
          <Link href="/" className="sh__brand"><i aria-hidden="true">J</i>JOUX HUB</Link>
          {conQuery(q => <Menu datos={datos} marcaQ={q} />)}
        </aside>

        <div className="sh__cuerpo">
          <header className="sh__top">
            {conQuery(q => <Migas marcas={marcas} marcaQ={q} />)}
            <div className="sh__tools caps">
              <EstadoBancos sync={pub.bancosSync ?? null} />
              {pub.actualizar && <button type="button" className="tgl hit" onClick={pub.actualizar} title={pub.datos ? `Datos de las ${pub.datos}. Volver a cargar` : 'Volver a cargar los datos'}>{I.refresh}<span className="sh__solo-ancho">Actualizar</span></button>}
              <ModoPrivado />
              <TemaBoton />
              <NotificacionesBoton onIr={t => { const r = rutaDeTab(t); if (r) router.push(r) }} />
            </div>
          </header>
          <Hermanas marcas={marcas} />
          {children}
        </div>

        <nav className="sh__barra" aria-label="Secciones">
          {abajo.map(b => (
            <Link key={b.href} href={b.href} className="sh__b" aria-current={b.on ? 'page' : undefined}>
              {b.icono}<span>{b.label}</span>{!!b.n && <span className="sh__bn">{b.n}</span>}
            </Link>
          ))}
          <button type="button" className="sh__b" aria-expanded={mas} aria-controls="sh-mas" aria-current={!mas && (ruta === '/compartidos' || ruta === '/ajustes') ? 'page' : undefined} onClick={() => setMas(!mas)}>
            {I.more}<span>Más</span>
          </button>
        </nav>
        {mas && (
          <>
            <div className="sh__velo" onClick={() => setMas(false)} />
            <div className="sh__hoja" id="sh-mas" role="dialog" aria-label="Menú">
              {conQuery(q => <Menu datos={datos} marcaQ={q} />)}
            </div>
          </>
        )}
      </div>
    </Ctx.Provider>
  )
}
