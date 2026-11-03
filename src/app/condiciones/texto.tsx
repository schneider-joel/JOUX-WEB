// Pinta el Markdown sencillo de las condiciones (## títulos, párrafos y listas con «- »). Sin HTML del texto:
// todo sale como texto de React, así una versión nunca puede inyectar nada en la página.
export default function TextoCondiciones({ texto }: { texto: string }) {
  const bloques = texto.trim().split(/\n{2,}/)
  return (
    <div className="condiciones">
      {bloques.map((b, i) => {
        if (b.startsWith('## ')) return <h2 key={i}>{b.slice(3).trim()}</h2>
        const lineas = b.split('\n')
        if (lineas.every(l => l.startsWith('- '))) return <ul key={i}>{lineas.map((l, j) => <li key={j}>{l.slice(2)}</li>)}</ul>
        return <p key={i}>{b}</p>
      })}
    </div>
  )
}
