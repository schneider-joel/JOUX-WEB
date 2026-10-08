'use client'

import { useEffect, useState } from 'react'

// Campana del hub: historial de notificaciones (cobros vinculados a facturas)
// y, abajo del panel, activar el push en este dispositivo o mandar una prueba.
type Notificacion = { id: number; titulo: string; cuerpo: string | null; url: string | null; leida: boolean; created_at: string }
type Estado = 'cargando' | 'no-soportado' | 'instalar' | 'bloqueado' | 'inactivo' | 'activo'

const clave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function aBytes(base64: string) {
  const b = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b), c => c.charCodeAt(0))
}

const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
function hace(fecha: string) {
  const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`
  return new Date(fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const instalada = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true

export default function NotificacionesBoton({ onIr }: { onIr?: (tab: string) => void }) {
  const [estado, setEstado] = useState<Estado>('cargando')
  const [mensaje, setMensaje] = useState('')
  const [lista, setLista] = useState<Notificacion[]>([])
  const [panel, setPanel] = useState(false)

  const cargar = () => fetch('/api/push').then(r => r.ok ? r.json() : null).then(j => { if (j) setLista(j.notificaciones) }).catch(() => {})
  // Al abrir el hub y cada vez que vuelves a la pestaña.
  useEffect(() => {
    cargar()
    const alVolver = () => { if (document.visibilityState === 'visible') cargar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [])

  useEffect(() => {
    if (!clave || !('serviceWorker' in navigator)) return setEstado('no-soportado')
    // En iPhone las notificaciones web solo existen con el hub en la pantalla de inicio.
    if (!('PushManager' in window)) return setEstado(esIOS() && !instalada() ? 'instalar' : 'no-soportado')
    if (Notification.permission === 'denied') return setEstado('bloqueado')
    navigator.serviceWorker.register('/sw.js').then(reg => reg.pushManager.getSubscription()).then(sub => {
      setEstado(sub ? 'activo' : 'inactivo')
      // Reenvía la suscripción por si se borró en el servidor.
      if (sub) fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ suscripcion: sub.toJSON(), dispositivo: navigator.userAgent.slice(0, 120) }) }).catch(() => {})
    }).catch(() => setEstado('no-soportado'))
  }, [])

  const avisar = (texto: string) => { setMensaje(texto); setTimeout(() => setMensaje(''), 7000) }

  const pulsar = async () => {
    if (estado === 'instalar') return avisar('En iPhone las notificaciones solo funcionan con el hub en la pantalla de inicio: Compartir → Añadir a pantalla de inicio, y ábrelo desde ese icono.')
    if (estado === 'bloqueado') return avisar('Las notificaciones están bloqueadas para este sitio en los ajustes del navegador.')
    if (estado === 'no-soportado') return avisar('Este navegador no admite notificaciones push.')
    if (estado === 'activo') {
      const r = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prueba: true }) }).then(r => r.json()).catch(() => null)
      return avisar(r?.enviadas ? 'Notificación de prueba enviada.' : 'No se pudo enviar la prueba.')
    }
    const permiso = await Notification.requestPermission()
    if (permiso !== 'granted') { setEstado(permiso === 'denied' ? 'bloqueado' : 'inactivo'); return }
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(clave) })
      const r = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ suscripcion: sub.toJSON(), dispositivo: navigator.userAgent.slice(0, 120) }) })
      if (!r.ok) throw new Error()
      setEstado('activo')
      avisar('Notificaciones activadas en este dispositivo.')
    } catch {
      avisar('No se pudieron activar las notificaciones.')
    }
  }

  const activo = estado === 'activo'
  const noLeidas = lista.filter(n => !n.leida).length

  const abrirPanel = () => {
    const abrir = !panel
    setPanel(abrir)
    if (abrir) {
      cargar()
      if (noLeidas) {
        fetch('/api/push', { method: 'PATCH' }).catch(() => {})
        setTimeout(() => setLista(l => l.map(n => ({ ...n, leida: true }))), 1500)
      }
    }
  }

  const ir = (n: Notificacion) => {
    setPanel(false)
    const tab = n.url ? new URL(n.url, window.location.origin).searchParams.get('tab') : null
    if (tab) onIr?.(tab)
  }

  const eliminar = (id: number) => {
    setLista(l => l.filter(n => n.id !== id))
    fetch('/api/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notificacion: id }) }).catch(() => {})
  }

  const pushTexto: Record<Estado, string> = {
    cargando: '',
    activo: 'Push activado en este dispositivo',
    inactivo: 'Push desactivado en este dispositivo',
    instalar: 'En iPhone, añade el hub a la pantalla de inicio para recibir push',
    bloqueado: 'Push bloqueado en los ajustes del navegador',
    'no-soportado': 'Este navegador no admite push',
  }

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button className={`icon-btn${noLeidas ? ' accent' : ''}`} onClick={abrirPanel} title="Notificaciones" aria-label="Notificaciones" style={{ position: 'relative' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {noLeidas > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: 'var(--accent)', color: '#000', fontSize: 10, fontWeight: 700, lineHeight: '16px', textAlign: 'center' }}>{noLeidas}</span>
        )}
      </button>

      {panel && (
        <>
          <div onClick={() => setPanel(false)} style={{ position: 'fixed', inset: 0, zIndex: 900 }} />
          {/* Fijo arriba a la derecha: el botón puede estar a la izquierda en el móvil. */}
          <div style={{ position: 'fixed', top: 72, right: 16, width: 'min(360px, calc(100vw - 32px))', maxHeight: 'min(480px, calc(100vh - 100px))', display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,.45)', zIndex: 901, overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>Notificaciones</div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {lista.length === 0 && <div style={{ padding: '24px 14px', fontSize: 12.5, color: 'var(--text3)', textAlign: 'center' }}>Aún no hay notificaciones. Aquí aparecerá cada cobro que se vincule a una factura.</div>}
              {lista.map(n => (
                <div key={n.id} style={{ display: 'flex', alignItems: 'flex-start', background: n.leida ? 'transparent' : 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                <button onClick={() => ir(n)} style={{ display: 'flex', gap: 10, flex: 1, minWidth: 0, textAlign: 'left', padding: '11px 0 11px 14px', background: 'none', border: 'none', cursor: n.url ? 'pointer' : 'default', fontFamily: 'inherit', color: 'inherit' }}>
                  <i style={{ width: 7, height: 7, borderRadius: 4, marginTop: 5, flexShrink: 0, background: n.leida ? 'transparent' : 'var(--accent)' }} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--text)' }}>{n.titulo}</span>
                    {n.cuerpo && <span style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{n.cuerpo}</span>}
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{hace(n.created_at)}</span>
                  </span>
                </button>
                <button className="icon-btn danger" onClick={() => eliminar(n.id)} title="Quitar del panel" aria-label="Quitar del panel" style={{ width: 24, height: 24, margin: '10px 10px 0 6px', flexShrink: 0 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
                </div>
              ))}
            </div>
            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontSize: 11.5, color: activo ? 'var(--green)' : 'var(--text3)' }}>{pushTexto[estado]}</span>
              {estado !== 'cargando' && estado !== 'no-soportado' && (
                <button className="btn" style={{ fontSize: 11.5, padding: '4px 10px', flexShrink: 0 }} onClick={pulsar}>{activo ? 'Enviar prueba' : estado === 'inactivo' ? 'Activar' : 'Cómo'}</button>
              )}
            </div>
          </div>
        </>
      )}

      {mensaje && (
        // Abajo y centrado: junto al botón se salía de la pantalla en el móvil.
        <span role="status" style={{ position: 'fixed', left: '50%', bottom: 'calc(24px + env(safe-area-inset-bottom))', transform: 'translateX(-50%)', width: 'min(340px, calc(100vw - 32px))', padding: '12px 14px', borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, lineHeight: 1.45, zIndex: 1000, boxShadow: '0 8px 30px rgba(0,0,0,.4)' }}>{mensaje}</span>
      )}
    </span>
  )
}
