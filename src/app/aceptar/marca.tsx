import { Archivo } from 'next/font/google'
import { Simbolo } from '../cambios/[token]/cambios'
import './presupuesto.css'

// Archivo ancho (wdth 112) para los títulos de Arkevo, como en arkevostudio.com. next/font la aloja en la propia web.
const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--archivo', display: 'swap' })

// Lo que ve el cliente (presupuesto y condiciones) va con la identidad de su marca, no con la del hub:
// colores, tipografías y logo de arkevostudio.com, cartela.live y joelschneider.io (temas en presupuesto.css).
const MARCAS_CON_TEMA = ['arkevo', 'cartela', 'custom']

export function Marco({ marca, nombre, children }: { marca: string; nombre: string; children: React.ReactNode }) {
  const tema = MARCAS_CON_TEMA.includes(marca) ? marca : 'otra'
  return (
    <div className={`pz ${archivo.variable}`} data-marca={tema}>
      <main className="pz__app">
        <header className="pz__top"><Logo marca={tema} nombre={nombre} /></header>
        {children}
      </main>
    </div>
  )
}

function Logo({ marca, nombre }: { marca: string; nombre: string }) {
  if (marca === 'arkevo') return <img className="pz__logo" src="/marcas/arkevo-logo.svg" alt="Arkevo" width="104" height="32" />
  if (marca === 'cartela') return <p className="pz__logo pz__logo--cartela"><Simbolo />cartela</p>
  if (marca === 'custom') return <img className="pz__logo" src="/marcas/joel-schneider.svg" alt="Joel Schneider" height="15" />
  return <p className="pz__logo">{nombre}</p>
}
