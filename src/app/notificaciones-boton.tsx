'use client'

import { useEffect, useState } from 'react'

// Activa las notificaciones push en este dispositivo (cobros vinculados a
// facturas). Ya activadas, el botón manda una notificación de prueba.
type Estado = 'cargando' | 'no-soportado' | 'instalar' | 'bloqueado' | 'inactivo' | 'activo'

const clave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function aBytes(base64: string) {
  const b = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b), c => c.charCodeAt(0))
}

const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const instalada = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true

export default function NotificacionesBoton() {
  const [estado, setEstado] = useState<Estado>('cargando')
  const [mensaje, setMensaje] = useState('')

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

  const avisar = (texto: string) => { setMensaje(texto); setTimeout(() => setMensaje(''), 4000) }

  const pulsar = async () => {
    if (estado === 'instalar') return avisar('En iPhone: Compartir → Añadir a pantalla de inicio, y abre el hub desde ese icono.')
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

  if (estado === 'cargando') return null
  const activo = estado === 'activo'
  const titulo = activo ? 'Notificaciones de cobros activadas · pulsa para enviar una prueba' : 'Activar notificaciones de cobros en este dispositivo'

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button className={`icon-btn${activo ? ' accent' : ''}`} onClick={pulsar} title={titulo} aria-label={titulo}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          {!activo && <path d="M2 2l20 20" />}
        </svg>
      </button>
      {mensaje && (
        <span style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 260, padding: '8px 10px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: 12, lineHeight: 1.45, zIndex: 50 }}>{mensaje}</span>
      )}
    </span>
  )
}
