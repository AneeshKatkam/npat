import React, { useEffect } from 'react'
import { Audio, spawnConfetti } from '../lib/game.js'

function getRankDisplay(i) {
  if (i === 0) return '🥇'
  if (i === 1) return '🥈'
  if (i === 2) return '🥉'
  return `#${i + 1}`
}

export default function Winner({ room, players, me, scores, isHost, onPlayAgain }) {
  const sortedScoreboard = Object.entries(scores)
    .map(([id, sc]) => ({ id, sc, player: players.find(p => p.id === id) }))
    .filter(x => x.player)
    .sort((a, b) => b.sc - a.sc)

  const winner = sortedScoreboard[0]
  const isWinner = winner?.id === me.id

  useEffect(() => {
    Audio.win()
    spawnConfetti(100)
  }, [])

  return (
    <>
      <div className="winner-banner">
        <div className="winner-avatar">{winner?.player?.avatar || '🏆'}</div>
        <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: 6 }}>
          {isWinner ? '🎉 You won! Congratulations!' : '🎊 Game Over — Winner!'}
        </div>
        <div className="winner-name">{winner?.player?.name || 'Winner'}</div>
        <div style={{ color: 'var(--muted)', marginTop: 10, fontSize: '0.95rem' }}>
          {winner?.sc} points · {room.round_number} rounds played
        </div>
        {isWinner && (
          <div style={{
            marginTop: 16,
            fontSize: '1rem',
            fontWeight: 800,
            color: 'var(--gold)',
            background: 'rgba(255,215,0,0.1)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 20px',
            display: 'inline-block',
          }}>
            🏆 You are the Champion!
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">🏆 Final Standings</div>
        {sortedScoreboard.map(({ id, sc, player }, i) => {
          const isMe = id === me.id
          return (
            <div key={id} className={`scoreboard-row rank-${i + 1}${isMe ? ' is-you' : ''}`}>
              <div className="score-bar-fill" style={{ width: Math.min(100, sc / room.target_score * 100) + '%' }} />
              <div className="rank-icon" style={{ fontSize: i < 3 ? '1.4rem' : '1rem' }}>
                {getRankDisplay(i)}
              </div>
              <div
                className="avatar avatar-md"
                style={{ background: player.avatar_color + '22', borderColor: player.avatar_color }}
              >
                {player.avatar}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800 }}>
                  {player.name}
                  {isMe && <span style={{ color: 'var(--primary-light)', fontSize: '0.78rem', marginLeft: 6 }}>(you)</span>}
                </div>
                <div className="text-xs text-muted">{room.round_number} rounds played</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="font-display" style={{
                  fontSize: '1.5rem',
                  color: i === 0 ? 'var(--gold)' : i === 1 ? 'var(--silver)' : i === 2 ? 'var(--bronze)' : 'var(--text)'
                }}>
                  {sc}
                </div>
                <div className="text-xs text-muted">points</div>
              </div>
            </div>
          )
        })}
      </div>

      {isHost ? (
        <div className="card text-center">
          <p className="text-muted text-sm mb-16">All scores reset for a fresh game.</p>
          <button className="btn btn-primary btn-full btn-lg" onClick={onPlayAgain}>
            🔄 Play Again
          </button>
        </div>
      ) : (
        <div className="card text-center">
          <p className="text-muted text-sm">
            <span className="pulse">⏳</span> Waiting for host to start a new game...
          </p>
        </div>
      )}
    </>
  )
}
