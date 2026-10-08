// Service worker del hub: muestra las notificaciones push y abre el hub al tocarlas.
self.addEventListener('push', event => {
  let aviso = {}
  try { aviso = event.data ? event.data.json() : {} } catch (e) { aviso = { cuerpo: event.data && event.data.text() } }
  event.waitUntil(self.registration.showNotification(aviso.titulo || 'JOUX Hub', {
    body: aviso.cuerpo || '',
    icon: '/apple-icon',
    badge: '/icon',
    tag: aviso.etiqueta,
    data: { url: aviso.url || '/' },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ventanas => {
    for (const v of ventanas) {
      if (new URL(v.url).origin === self.location.origin && 'focus' in v) { v.navigate(url); return v.focus() }
    }
    return self.clients.openWindow(url)
  }))
})
