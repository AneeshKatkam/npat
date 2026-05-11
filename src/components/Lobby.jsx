import React, { useState } from 'react'
import { copyText, toast, getRankIcon } from '../lib/game.js'

export default function Lobby({ room, players, me, shareUrl, onStart }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    copyText(shareUrl)
    toast('🔗 Link copied! Share it with friends', 'var(--accent)')
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  function handleCopyCode() {
    copyText(room.id)
    toast('📋 Room code copied!', 'var(--accent)')
  }

  const isHost = me.is_host
  const canStart = players.length >= 2

  return (
    <>
      <div className="card">
        <div className="card-title">🏠 Game Lobby</div>

        {/* Room code */}
        <div style={{ marginBottom: 16 }}>
          <div className="text-xs text-muted text-center mb-8" style={{ textTransform:'uppercase', letterSpacing:'1px', fontWeight:700 }}>
            Room Code — click to copy
          </div>
          <div className="room-code-display" onClick={handleCopyCode} title="Click to copy">
            {room.id}
          </div>
        </div>

        {/* Share link */}
        <div style={{ marginBottom: 16 }}>
          <div className="text-xs text-muted mb-8" style={{ textTransform:'uppercase', letterSpacing:'1px', fontWeight:700 }}>
            Share Link
          </div>
          <div className="share-box" onClick={handleCopy}>
            {shareUrl}
          </div>
          <button className="btn btn-secondary btn-sm mt-8" onClick={handleCopy} style={{ width: '100%' }}>
            {copied ? '✅ Copied!' : '🔗 Copy Invite Link'}
          </button>
        </div>

        {/* Settings */}
        <div className="flex-between" style={{ padding:'12px 14px', background:'var(--surface2)', borderRadius:'var(--radius-sm)', marginBottom:16 }}>
          <div className="text-sm text-muted">🎯 First to</div>
          <div className="font-display" style={{ fontSize:'1.3rem', color:'var(--secondary)' }}>{room.target_score} points</div>
          <div className="text-sm text-muted">wins!</div>
        </div>

        {/* Players */}
        <div className="section-title">👥 Players ({players.length})</div>
        {players.map(p => (
          <div key={p.id} className={`player-row${p.id===me.id?' is-you':''}`}>
            <div
              className="avatar avatar-md"
              style={{ background: p.avatar_color+'22', borderColor: p.avatar_color }}
            >
              {p.avatar}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800 }}>
                {p.name}
                {p.id === me.id && <span style={{ color:'var(--primary-light)', fontSize:'0.8rem', marginLeft:6 }}>(you)</span>}
              </div>
              {p.is_online
                ? <div className="flex items-center gap-4 mt-4"><span className="status-dot status-online"></span><span className="text-xs text-muted">online</span></div>
                : <div className="flex items-center gap-4 mt-4"><span className="status-dot status-offline"></span><span className="text-xs text-muted">away</span></div>
              }
            </div>
            <span className={`badge ${p.is_host?'badge-host':'badge-ready'}`}>
              {p.is_host ? '👑 Host' : '✅ Ready'}
            </span>
          </div>
        ))}

        {players.length < 2 && (
          <div className="text-center text-muted text-sm" style={{ padding:'12px', background:'var(--surface2)', borderRadius:'var(--radius-sm)', marginBottom:12 }}>
            <span className="pulse">⏳</span> Waiting for more players... Share the link above!
          </div>
        )}
      </div>

      {isHost ? (
        <div className="card" style={{ textAlign:'center' }}>
          <p className="text-sm text-muted mb-16">
            {canStart
              ? `${players.length} players ready — you can start anytime!`
              : 'Need at least 2 players to start.'}
          </p>
          <button
            className="btn btn-success btn-full btn-lg"
            onClick={onStart}
            disabled={!canStart}
          >
            🚀 Start Game!
          </button>
        </div>
      ) : (
        <div className="card text-center">
          <div style={{ fontSize:'2.5rem', marginBottom:12 }}>⏳</div>
          <div style={{ fontWeight:800, fontSize:'1.1rem', marginBottom:8 }}>Waiting for host to start</div>
          <p className="text-sm text-muted">The host will start the game when everyone is ready.</p>
        </div>
      )}

      {/* How to play quick ref */}
      <div className="card">
        <div className="card-title" style={{ fontSize:'1rem', marginBottom:12 }}>📖 Quick Rules</div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {[
            ['✅','Unique correct answer = 1 point'],
            ['½','Same answer as others = ½ point'],
            ['🔁','Same word used in a prior round with same letter = 0 points'],
            ['⚠️','Case doesn\'t matter — Apple & apple both count'],
          ].map(([icon, text], i) => (
            <div key={i} className="flex gap-8 items-center">
              <span style={{ fontSize:'1rem', width:20, textAlign:'center', flexShrink:0 }}>{icon}</span>
              <span className="text-sm" style={{ color:'var(--text-secondary)' }}>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
