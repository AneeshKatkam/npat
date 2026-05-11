import React from 'react'

export default function Scoring() {
  return (
    <div className="card text-center" style={{ padding: '48px 24px' }}>
      <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>🤖</div>
      <div className="font-display" style={{ fontSize: '1.6rem', color: 'var(--primary-light)', marginBottom: 10 }}>
        Validating Answers...
      </div>
      <p className="text-muted text-sm" style={{ marginBottom: 24 }}>
        Claude AI is checking everyone's words for validity
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
        {[0, 1, 2].map(i => (
          <div
            key={i}
            style={{
              width: 10, height: 10,
              borderRadius: '50%',
              background: 'var(--primary-light)',
              animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`
            }}
          />
        ))}
      </div>
    </div>
  )
}
