import webpush from 'web-push'
import { supabaseServer as sb } from '@/lib/supabase-server'

// Notificaciones push (Web Push) a los dispositivos que las activaron en el
// hub. En iPhone solo funcionan con el hub añadido a la pantalla de inicio.
const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const privada = process.env.VAPID_PRIVATE_KEY?.trim()
if (publica && privada) webpush.setVapidDetails('https://joux-web.vercel.app', publica, privada)

export type Aviso = { titulo: string; cuerpo: string; url?: string; etiqueta?: string }

// Guarda el aviso en el historial de la campana del hub (salvo { guardar: false },
// p. ej. la notificación de prueba) y lo manda por push a los dispositivos.
export async function notificar(aviso: Aviso, { guardar = true } = {}) {
  if (guardar) await sb.from('notificaciones').insert({ titulo: aviso.titulo, cuerpo: aviso.cuerpo, url: aviso.url || null })
  if (!publica || !privada) return 0
  const { data: subs } = await sb.from('push_suscripciones').select('id,endpoint,keys')
  let enviadas = 0
  const caducadas: number[] = []
  await Promise.all((subs || []).map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(aviso))
      enviadas++
    } catch (e: any) {
      // 404/410: el navegador ya no tiene esa suscripción.
      if (e?.statusCode === 404 || e?.statusCode === 410) caducadas.push(s.id)
    }
  }))
  if (caducadas.length) await sb.from('push_suscripciones').delete().in('id', caducadas)
  return enviadas
}
