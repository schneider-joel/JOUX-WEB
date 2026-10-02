import { iconoCasona } from '../icono'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

// iOS ya redondea el icono de la pantalla de inicio: va a sangre.
export default function AppleIcon() {
  return iconoCasona(180)
}
