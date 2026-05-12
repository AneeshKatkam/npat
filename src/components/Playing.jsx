import React, { useMemo } from 'react'
import { CATEGORIES, CAT_ICONS, ROUND_TIME } from '../lib/game.js'

export default function Playing({
  room, players, me, answers, setAnswers,
  timeLeft, submitted, submittedCount, scores, onSubmit
}) {
  const pct = (timeLeft / ROUND_TIME * 100).toFixed(1)
  const timerColor = timeLeft <= 10 ? 'var(--danger)' : timeLeft <= 20 ? 'var(--secondary)' : 'var(--accent)'
  const letter = room.current_letter || '?'

  const myScore = scores[me.id] || 0
  // submittedCount passed as prop

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => (scores[b.id]||0) - (scores[a.id]||0))
  }, [players, scores])

  function handleInput(cat, val) {
    if (submitted) return
    setAnswers(prev => ({ ...prev, [cat]: val }))
  }

  const filledCount = CATEGORIES.filter(c => (answers[c] || '').trim()).length

  return (
    <>
      {/* Header bar */}
      <div className="card card-sm" style={{ marginBottom: 12 }}>
        <div className="flex-between">
          <div>
            <div className="text-xs text-muted" style={{ textTransform:'uppercase', letterSpacing:'1px', fontWeight:700 }}>
              Round {room.round_number}
            </div>
            <div className="font-display" style={{ fontSize:'1.1rem', color:'var(--secondary)' }}>
              {myScore} / {room.target_score} pts
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted mb-4">The Letter</div>
            <div className="letter-hero" style={{ fontSize: 'clamp(3.5rem,12vw,5.5rem)' }}>{letter}</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div className="text-xs text-muted" style={{ textTransform:'uppercase', letterSpacing:'1px', fontWeight:700 }}>
              Submitted
            </div>
            <div className="font-display" style={{ fontSize:'1.1rem', color:'var(--accent)' }}>
              {submittedCount} / {players.length}
            </div>
          </div>
        </div>
      </div>

      {/* Timer */}
      <div className="timer-wrap">
        <div
          className="timer-ring"
          style={{ background: `conic-gradient(${timerColor} ${pct}%, var(--surface2) 0)` }}
        >
          <div className="timer-num" style={{ color: timeLeft <= 10 ? 'var(--danger)' : 'var(--text)' }}>
            {timeLeft}
          </div>
        </div>
        <div className="text-xs text-muted mt-4">seconds left</div>
      </div>

      {/* Answer grid */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>
          {submitted ? '✅ Answers Submitted!' : `✍️ Write your answers starting with "${letter}"`}
        </div>

        <div className="answer-grid">
          {CATEGORIES.map(cat => (
            <div key={cat} className="answer-field">
              <label>{CAT_ICONS[cat]} {cat}</label>
              <input
                type="text"
                placeholder={`${cat} starting with ${letter}...`}
                value={answers[cat]}
                onChange={e => handleInput(cat, e.target.value)}
                disabled={submitted}
                maxLength={40}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className={(answers[cat]||'').trim() ? 'valid-indicator' : ''}
              />
            </div>
          ))}
        </div>

        {!submitted ? (
          <button
            className="btn btn-primary btn-full mt-16"
            onClick={onSubmit}
            style={{ fontSize: '1.05rem', padding: '13px' }}
          >
            ✅ Submit Answers
            {filledCount > 0 && <span style={{ opacity:0.7, fontSize:'0.85rem' }}>({filledCount}/4 filled)</span>}
          </button>
        ) : (
          <div style={{
            textAlign:'center', padding:'16px', marginTop:16,
            background:'rgba(16,185,129,0.08)', borderRadius:'var(--radius-sm)',
            border:'1px solid rgba(16,185,129,0.25)'
          }}>
            <div style={{ fontSize:'2rem', marginBottom:6 }}>✅</div>
            <div style={{ fontWeight:800, color:'var(--accent)' }}>Submitted! Waiting for others...</div>
            <div className="text-sm text-muted mt-4">
              {submittedCount} of {players.length} players done
            </div>
          </div>
        )}
      </div>

      {/* Live scoreboard */}
      <div className="card">
        <div className="section-title">🏆 Scoreboard</div>
        {sortedPlayers.map((p, i) => {
          const sc = scores[p.id] || 0
          const hasSubmitted = false // individual status not tracked, use count
          const barPct = Math.min(100, (sc / room.target_score) * 100)
          return (
            <div key={p.id} className={`scoreboard-row rank-${i+1}${p.id===me.id?' is-you':''}`}>
              <div className="score-bar-fill" style={{ width: barPct + '%' }} />
              <div className="rank-icon">{getRankDisplay(i)}</div>
              <div
                className="avatar avatar-sm"
                style={{ background: p.avatar_color+'22', borderColor: p.avatar_color, fontSize:'1rem' }}
              >
                {p.avatar}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:800, fontSize:'0.9rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {p.name}{p.id===me.id&&<span style={{ color:'var(--primary-light)', fontSize:'0.75rem', marginLeft:4 }}>(you)</span>}
                </div>
              </div>
              {hasSubmitted
                ? <span style={{ fontSize:'0.75rem', color:'var(--accent)', fontWeight:800 }}>✅ done</span>
                : <span className="text-xs text-muted pulse">✍️ writing</span>
              }
              <div style={{ textAlign:'right', minWidth:48 }}>
                <div className="font-display" style={{ fontSize:'1.2rem', color: i===0?'var(--gold)':i===1?'var(--silver)':i===2?'var(--bronze)':'var(--text)' }}>
                  {sc}
                </div>
                <div className="text-xs text-muted">pts</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Used letters */}
      {(room.used_letters||[]).length > 0 && (
        <div className="card card-sm">
          <div className="text-xs text-muted mb-8" style={{ textTransform:'uppercase', letterSpacing:'1px', fontWeight:700 }}>
            Letters Used
          </div>
          <div className="letter-pills">
            {(room.used_letters||[]).map(l => (
              <div key={l} className={`letter-pill${l===letter?' current':''}`}>{l}</div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function getRankDisplay(i) {
  if (i === 0) return '🥇'
  if (i === 1) return '🥈'
  if (i === 2) return '🥉'
  return `#${i+1}`
}
