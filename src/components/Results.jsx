import React, { useEffect } from 'react'
import { CATEGORIES, CAT_ICONS, Audio, spawnConfetti } from '../lib/game.js'

function getRankDisplay(i) {
  if (i === 0) return '🥇'
  if (i === 1) return '🥈'
  if (i === 2) return '🥉'
  return `#${i + 1}`
}

export default function Results({ room, players, me, results, scores, processing, isHost, onNext }) {

  useEffect(() => {
    if (!results.length) return
    const myResult = results.find(r => r.playerId === me.id)
    if (myResult) {
      if (myResult.total >= 3.5) { Audio.success(); spawnConfetti(40) }
      else if (myResult.total >= 2) { Audio.half() }
      else if (myResult.total === 0) { Audio.zero() }
    }
  }, [results])

  const sortedResults = [...results].sort((a, b) => b.total - a.total)
  const sortedScoreboard = Object.entries(scores)
    .map(([id, sc]) => ({ id, sc, player: players.find(p => p.id === id) }))
    .filter(x => x.player)
    .sort((a, b) => b.sc - a.sc)

  const maxScore = Math.max(...sortedScoreboard.map(x => x.sc), 1)

  if (processing) {
    return (
      <div className="card text-center" style={{ padding: '48px 24px' }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>🤖</div>
        <div className="font-display" style={{ fontSize: '1.5rem', color: 'var(--primary-light)', marginBottom: 10 }}>
          Calculating Scores...
        </div>
        <p className="text-muted text-sm">Claude AI is validating all answers. Almost done!</p>
      </div>
    )
  }

  return (
    <>
      {/* Round summary header */}
      <div className="card">
        <div className="card-title">
          📊 Round {room.round_number} Results
          <span style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-display)',
            fontSize: '1.5rem',
            background: 'linear-gradient(135deg,#A78BFA,#F59E0B)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            "{room.current_letter}"
          </span>
        </div>

        {/* Per-player results */}
        {sortedResults.map(r => {
          const isMe = r.playerId === me.id
          return (
            <div key={r.playerId} className={`result-card${isMe ? ' is-you' : ''}`}>
              {/* Player header */}
              <div className="flex-between mb-8">
                <div className="flex gap-8 items-center">
                  <div
                    className="avatar avatar-sm"
                    style={{ background: r.avatarColor + '22', borderColor: r.avatarColor, fontSize: '1rem' }}
                  >
                    {r.avatar}
                  </div>
                  <span style={{ fontWeight: 800 }}>
                    {r.playerName}
                    {isMe && <span style={{ color: 'var(--primary-light)', fontSize: '0.78rem', marginLeft: 6 }}>(you)</span>}
                  </span>
                </div>
                <div className="font-display" style={{
                  fontSize: '1.3rem',
                  color: r.total >= 3.5 ? 'var(--accent)' : r.total >= 2 ? 'var(--secondary)' : 'var(--muted)'
                }}>
                  +{r.total} pts
                </div>
              </div>

              {/* Category breakdown */}
              {CATEGORIES.map(cat => {
                const word = r.answers?.[cat] || ''
                const valid = r.valid?.[cat]
                const pts = r.points?.[cat] ?? 0
                const reason = r.pointReason?.[cat] || ''

                let badgeCls, badgeLabel
                if (!word.trim()) {
                  badgeCls = 'pts-zero'; badgeLabel = '—'
                } else if (!valid) {
                  badgeCls = 'pts-zero'; badgeLabel = '✗ invalid'
                } else if (reason === 'repeated') {
                  badgeCls = 'pts-repeated'; badgeLabel = '0 (repeated)'
                } else if (pts === 1) {
                  badgeCls = 'pts-full'; badgeLabel = '+1 ✓'
                } else if (pts === 0.5) {
                  badgeCls = 'pts-half'; badgeLabel = '+½ shared'
                } else {
                  badgeCls = 'pts-zero'; badgeLabel = '0'
                }

                return (
                  <div key={cat} className="result-answer">
                    <span style={{ color: 'var(--muted)', fontSize: '0.8rem', width: 20, flexShrink: 0 }}>
                      {CAT_ICONS[cat]}
                    </span>
                    <span style={{ color: 'var(--muted)', fontSize: '0.78rem', width: 54, flexShrink: 0 }}>{cat}</span>
                    <span style={{ flex: 1, fontWeight: 700, fontSize: '0.9rem' }}>
                      {word || <em style={{ color: 'var(--muted)', fontWeight: 400 }}>no answer</em>}
                    </span>
                    <span className={`pts-badge ${badgeCls}`}>{badgeLabel}</span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Scoreboard */}
      <div className="card">
        <div className="card-title">🏆 Leaderboard</div>
        {sortedScoreboard.map(({ id, sc, player }, i) => {
          const barPct = Math.min(100, (sc / room.target_score) * 100)
          const isMe = id === me.id
          return (
            <div key={id} className={`scoreboard-row rank-${i + 1}${isMe ? ' is-you' : ''}`}>
              <div className="score-bar-fill" style={{ width: barPct + '%' }} />
              <div className="rank-icon">{getRankDisplay(i)}</div>
              <div
                className="avatar avatar-sm"
                style={{ background: player.avatar_color + '22', borderColor: player.avatar_color, fontSize: '1rem' }}
              >
                {player.avatar}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {player.name}
                  {isMe && <span style={{ color: 'var(--primary-light)', fontSize: '0.75rem', marginLeft: 4 }}>(you)</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="font-display" style={{
                  fontSize: '1.3rem',
                  color: i === 0 ? 'var(--gold)' : i === 1 ? 'var(--silver)' : i === 2 ? 'var(--bronze)' : 'var(--text)'
                }}>
                  {sc}
                </div>
                <div className="text-xs text-muted">/ {room.target_score}</div>
              </div>
            </div>
          )
        })}

        {/* Progress bars visual */}
        <div style={{ marginTop: 16, padding: '12px 0 4px' }}>
          {sortedScoreboard.map(({ id, sc, player }, i) => (
            <div key={id} className="flex gap-8 items-center mb-8" style={{ fontSize: '0.78rem' }}>
              <span style={{ width: 20, textAlign: 'center' }}>{player.avatar}</span>
              <div style={{ flex: 1, background: 'var(--surface3)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                <div style={{
                  width: Math.min(100, sc / room.target_score * 100) + '%',
                  height: '100%',
                  background: i === 0
                    ? 'linear-gradient(90deg,#D97706,#F59E0B)'
                    : i === 1
                    ? 'linear-gradient(90deg,#9CA3AF,#D1D5DB)'
                    : 'linear-gradient(90deg,var(--primary),var(--primary-light))',
                  borderRadius: 4,
                  transition: 'width 1s ease',
                }} />
              </div>
              <span className="text-muted" style={{ width: 36, textAlign: 'right' }}>{sc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Next round */}
      {isHost ? (
        <div className="card text-center">
          <button className="btn btn-primary btn-full btn-lg" onClick={onNext}>
            ▶ Start Next Round
          </button>
        </div>
      ) : (
        <div className="card text-center">
          <div className="text-muted text-sm">
            <span className="pulse">⏳</span> Waiting for host to start the next round...
          </div>
        </div>
      )}
    </>
  )
}
