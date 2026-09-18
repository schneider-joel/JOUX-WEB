'use client'

export default function PrintButton({ label }: { label: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="no-print"
      style={{
        position: 'fixed', top: 24, right: 24, padding: '10px 20px', borderRadius: 8,
        background: '#3b82f6', color: '#fff', border: 'none', fontSize: 14, fontWeight: 500,
        cursor: 'pointer', fontFamily: 'Inter, sans-serif',
      }}
    >
      {label}
    </button>
  )
}
