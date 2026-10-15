'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const params = useSearchParams()

  const submit = async () => {
    if (!password) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    setLoading(false)
    if (res.ok) {
      router.push(params.get('from') || '/')
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Contraseña incorrecta')
    }
  }

  // Una sola contraseña, con el campo de una línea y el botón de la web (mismo envío que antes).
  return (
    <div className="app">
      <main className="login">
        <h1 className="login__marca caps">JOUX Hub</h1>
        <div className={`field${error ? ' is-bad' : ''}`}>
          <label className="caps" htmlFor="pw">Contraseña</label>
          <input
            id="pw"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            autoFocus
          />
        </div>
        <div className="login__foot">
          {error && <span className="login__msg caps" role="alert">{error}</span>}
          <button type="button" className="pill" onClick={submit} disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </main>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
