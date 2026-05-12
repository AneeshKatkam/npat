import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SETUP_SQL } from '../lib/supabase.js'
import { copyText, toast } from '../lib/game.js'

const MIGRATION_SQL = `
-- Run this if you already have the database set up (fixes timer sync + realtime reliability)

-- 1. Add REPLICA IDENTITY FULL (fixes UPDATE realtime events)
alter table round_answers replica identity full;
alter table rooms replica identity full;
alter table players replica identity full;

-- 2. The settings column already exists if you ran the original SQL.
--    If not, add it:
alter table rooms add column if not exists settings jsonb not null default '{}';
`

export default function Setup() {
  const nav = useNavigate()
  const [step, setStep] = useState(1)
  const [supaUrl, setSupaUrl] = useState('')
  const [supaKey, setSupaKey] = useState('')
  const [copied, setCopied] = useState(false)
  const [copiedMigration, setCopiedMigration] = useState(false)

  function handleCopySQL() {
    copyText(SETUP_SQL)
    setCopied(true)
    toast('✅ SQL copied! Paste it in the Supabase SQL Editor', 'var(--accent)')
    setTimeout(() => setCopied(false), 3000)
  }

  function handleCopyMigration() {
    copyText(MIGRATION_SQL)
    setCopiedMigration(true)
    toast('✅ Migration SQL copied!', 'var(--accent)')
    setTimeout(() => setCopiedMigration(false), 3000)
  }

  function handleSaveEnv() {
    if (!supaUrl.trim() || !supaKey.trim()) {
      toast('Please enter both values!', 'var(--danger)')
      return
    }
    const envContent = `VITE_SUPABASE_URL=${supaUrl.trim()}
VITE_SUPABASE_ANON_KEY=${supaKey.trim()}`
    copyText(envContent)
    toast('📋 .env content copied! Create a .env file in your project root and paste it.', 'var(--accent)')
  }

  const steps = [
    { n: 1, title: 'Create Supabase Project' },
    { n: 2, title: 'Run Database Setup' },
    { n: 3, title: 'Configure Environment' },
    { n: 4, title: 'Deploy & Share' },
  ]

  return (
    <div className="app-container">
      <div style={{ paddingTop: 24, marginBottom: 24 }}>
        <h1 className="logo" style={{ fontSize: '1.8rem' }}>🔧 Setup Guide</h1>
        <p className="tagline">Connect your free Supabase database to enable real multiplayer</p>
      </div>

      {/* Step nav */}
      <div className="card card-sm" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {steps.map(s => (
            <div
              key={s.n}
              onClick={() => setStep(s.n)}
              style={{
                flex: 1, textAlign: 'center', padding: '8px 4px',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                background: step === s.n ? 'var(--primary)' : 'var(--surface2)',
                border: '1px solid ' + (step === s.n ? 'var(--primary-light)' : 'var(--border)'),
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>{s.n}</div>
              <div style={{ fontSize: '0.65rem', color: step === s.n ? 'rgba(255,255,255,0.8)' : 'var(--muted)', fontWeight: 700, lineHeight: 1.2 }}>
                {s.title}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="card">
          <div className="card-title">1️⃣ Create a Free Supabase Project</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              ['Go to Supabase', 'Visit supabase.com and sign up for a free account (no credit card required).', 'https://supabase.com'],
              ['Create New Project', 'Click "New Project", choose a name like "npat-game", set a strong database password, and pick the region closest to your players.', null],
              ['Wait for Setup', 'Supabase will spin up your project in about 1-2 minutes. You\'ll see a dashboard when ready.', null],
            ].map(([title, desc, link], i) => (
              <div key={i} className="player-row" style={{ alignItems: 'flex-start', gap: 14 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-display)', fontSize: '0.9rem', marginTop: 2,
                }}>
                  {i + 1}
                </div>
                <div>
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>{title}</div>
                  <div className="text-sm text-muted">{desc}</div>
                  {link && (
                    <a href={link} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-light)', fontSize: '0.85rem', fontWeight: 700 }}>
                      Open {link} →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button className="btn btn-primary btn-full mt-16" onClick={() => setStep(2)}>
            Done → Run Database Setup
          </button>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="card">
          <div className="card-title">2️⃣ Run the Database Setup SQL</div>
          <p className="text-sm text-muted mb-16">
            In your Supabase dashboard, click <strong style={{ color: 'var(--text)' }}>SQL Editor</strong> in the left sidebar, 
            paste the SQL below, and click <strong style={{ color: 'var(--text)' }}>Run</strong>.
          </p>

          <div style={{
            background: 'var(--bg)', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)', padding: 16, marginBottom: 14,
            maxHeight: 260, overflowY: 'auto', fontFamily: 'monospace',
            fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.7,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {SETUP_SQL.trim()}
          </div>

          <button className="btn btn-gold btn-full mb-12" onClick={handleCopySQL}>
            {copied ? '✅ Copied!' : '📋 Copy Full SQL'}
          </button>

          <div style={{
            background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
            borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 16,
          }}>
            <div style={{ fontWeight: 800, color: 'var(--accent)', marginBottom: 6 }}>✅ This SQL creates:</div>
            <div className="text-sm text-muted" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div>• <strong style={{ color: 'var(--text)' }}>rooms</strong> — game rooms with settings & state</div>
              <div>• <strong style={{ color: 'var(--text)' }}>players</strong> — player profiles & scores</div>
              <div>• <strong style={{ color: 'var(--text)' }}>round_answers</strong> — all answers per round</div>
              <div>• <strong style={{ color: 'var(--text)' }}>room_events</strong> — real-time game events</div>
              <div>• Realtime subscriptions & public RLS policies</div>
            </div>
          </div>

          <hr className="divider" />

          <div style={{
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 14,
          }}>
            <div style={{ fontWeight: 800, color: 'var(--secondary)', marginBottom: 6 }}>
              ⚡ Already have the DB set up? Run this migration instead
            </div>
            <p className="text-sm text-muted" style={{ marginBottom: 10 }}>
              This fixes timer sync between devices and realtime reliability (required for the latest update).
            </p>
            <div style={{
              background: 'var(--bg)', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)', padding: 12, marginBottom: 10,
              fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--text-secondary)',
              lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {MIGRATION_SQL.trim()}
            </div>
            <button className="btn btn-secondary btn-sm btn-full" onClick={handleCopyMigration}>
              {copiedMigration ? '✅ Copied!' : '📋 Copy Migration SQL'}
            </button>
          </div>

          <button className="btn btn-primary btn-full" onClick={() => setStep(3)}>
            Done → Configure Environment
          </button>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="card">
          <div className="card-title">3️⃣ Add Your Supabase Credentials</div>
          <p className="text-sm text-muted mb-16">
            In Supabase dashboard → <strong style={{ color: 'var(--text)' }}>Settings → API</strong>. 
            Copy your Project URL and anon/public key.
          </p>

          <div className="input-group">
            <label className="input-label">Project URL</label>
            <input
              type="text"
              placeholder="https://xxxxxxxxxxxx.supabase.co"
              value={supaUrl}
              onChange={e => setSupaUrl(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label className="input-label">Anon / Public Key</label>
            <input
              type="text"
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
              value={supaKey}
              onChange={e => setSupaKey(e.target.value)}
            />
          </div>

          <div style={{
            background: 'var(--surface2)', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)', padding: 14, marginBottom: 16,
          }}>
            <div style={{ fontWeight: 800, marginBottom: 8, fontSize: '0.85rem' }}>Create a <code style={{ color: 'var(--accent)' }}>.env</code> file in your project root:</div>
            <div style={{
              fontFamily: 'monospace', fontSize: '0.82rem',
              color: 'var(--text-secondary)', lineHeight: 1.8,
            }}>
              VITE_SUPABASE_URL=https://xxxx.supabase.co<br />
              VITE_SUPABASE_ANON_KEY=eyJhbGci...
            </div>
          </div>

          <button className="btn btn-gold btn-full mb-12" onClick={handleSaveEnv}>
            📋 Copy .env Content
          </button>
          <button className="btn btn-primary btn-full" onClick={() => setStep(4)}>
            Done → Deploy Guide
          </button>
        </div>
      )}

      {/* Step 4 */}
      {step === 4 && (
        <div className="card">
          <div className="card-title">4️⃣ Deploy & Share with Friends!</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            {[
              {
                name: 'Vercel (Recommended — Free)',
                url: 'https://vercel.com',
                steps: ['Push your project to GitHub', 'Connect repo to Vercel', 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY as Environment Variables', 'Deploy! You\'ll get a free .vercel.app URL to share'],
                color: 'var(--primary-light)',
              },
              {
                name: 'Netlify (Also Free)',
                url: 'https://netlify.com',
                steps: ['Push to GitHub or drag & drop the dist/ folder', 'Set environment variables in Site Settings → Environment', 'Done — share the .netlify.app URL'],
                color: 'var(--accent)',
              },
            ].map(platform => (
              <div key={platform.name} style={{
                background: 'var(--surface2)', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', padding: 16,
              }}>
                <div style={{ fontWeight: 800, marginBottom: 8, color: platform.color }}>
                  {platform.name}
                </div>
                {platform.steps.map((s, i) => (
                  <div key={i} className="text-sm text-muted flex gap-8" style={{ marginBottom: 6 }}>
                    <span style={{ color: platform.color, fontWeight: 800, flexShrink: 0 }}>{i + 1}.</span>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div style={{
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 16,
          }}>
            <div style={{ fontWeight: 800, color: 'var(--secondary)', marginBottom: 6 }}>📌 Build command</div>
            <code style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              npm install && npm run build
            </code>
            <div style={{ marginTop: 8, fontWeight: 800, color: 'var(--secondary)' }}>📌 Output directory</div>
            <code style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>dist</code>
          </div>

          <div style={{
            background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
            borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 20,
          }}>
            <div style={{ fontWeight: 800, color: 'var(--accent)', marginBottom: 6 }}>🌍 Supports 100s of simultaneous games!</div>
            <p className="text-sm text-muted">
              Each room is isolated — hundreds of groups can play simultaneously. 
              Supabase free tier supports 500 concurrent connections, 
              and upgrading is cheap for large scale.
            </p>
          </div>

          <button className="btn btn-primary btn-full btn-lg" onClick={() => nav('/')}>
            🚀 Go Play!
          </button>
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: 12 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => nav('/')}>← Back to Home</button>
      </div>
    </div>
  )
}
