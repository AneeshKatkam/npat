import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  supabase, isConfigured, createRoom, joinPlayer,
  getRoom, getWorldRooms
} from '../lib/supabase.js'
import {
  AVATARS, AVATAR_COLORS, generatePlayerId,
  LS, toast, Audio
} from '../lib/game.js'

export default function Home() {
  const nav = useNavigate()
  const [tab, setTab] = useState('create')
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState(AVATARS[0])
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0])
  const [targetScore, setTargetScore] = useState('50')
  const [roomType, setRoomType] = useState('private')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const configured = isConfigured()

  // Restore profile
  useEffect(() => {
    const saved = LS.get('npat_profile')
    if (saved) {
      setName(saved.name || '')
      setAvatar(saved.avatar || AVATARS[0])
      setAvatarColor(saved.avatarColor || AVATAR_COLORS[0])
    }
    // Check URL for room code
    const params = new URLSearchParams(window.location.search)
    const code = params.get('join')
    if (code) { setJoinCode(code.toUpperCase()); setTab('join') }
  }, [])

  function saveProfile() {
    LS.set('npat_profile', { name, avatar, avatarColor })
  }

  async function handleCreate() {
    if (!name.trim()) { toast('Please enter your name! 😊', 'var(--danger)'); return }
    if (!configured) { toast('Please configure Supabase first — go to /setup', 'var(--secondary)'); return }
    setLoading(true)
    try {
      saveProfile()
      const playerId = LS.get('npat_pid') || generatePlayerId()
      LS.set('npat_pid', playerId)

      const room = await createRoom({ hostId: playerId, targetScore: Math.min(200, Math.max(10, parseInt(targetScore)||50)), roomType })
      await joinPlayer({
        id: playerId,
        roomId: room.id,
        name: name.trim(),
        avatar,
        avatarColor,
        isHost: true,
      })
      Audio.join()
      nav(`/room/${room.id}`)
    } catch (e) {
      toast('Error creating room: ' + e.message, 'var(--danger)')
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin() {
    if (!name.trim()) { toast('Please enter your name!', 'var(--danger)'); return }
    if (!joinCode.trim()) { toast('Enter a room code!', 'var(--danger)'); return }
    if (!configured) { toast('Please configure Supabase first', 'var(--secondary)'); return }
    setLoading(true)
    try {
      saveProfile()
      const room = await getRoom(joinCode.trim().toUpperCase())
      if (room.status === 'finished') { toast('That game has already ended!', 'var(--danger)'); setLoading(false); return }

      const playerId = LS.get('npat_pid') || generatePlayerId()
      LS.set('npat_pid', playerId)

      await joinPlayer({
        id: playerId,
        roomId: room.id,
        name: name.trim(),
        avatar,
        avatarColor,
        isHost: false,
      })
      Audio.join()
      nav(`/room/${room.id}`)
    } catch (e) {
      toast('Room not found or error: ' + e.message, 'var(--danger)')
    } finally {
      setLoading(false)
    }
  }

  async function handleWorldRoom() {
    if (!name.trim()) { toast('Please enter your name!', 'var(--danger)'); return }
    if (!configured) { toast('Please configure Supabase first', 'var(--secondary)'); return }
    setLoading(true)
    try {
      saveProfile()
      const playerId = LS.get('npat_pid') || generatePlayerId()
      LS.set('npat_pid', playerId)

      // Try to find an existing world lobby
      const rooms = await getWorldRooms()
      let room
      if (rooms.length > 0) {
        room = rooms[0]
      } else {
        room = await createRoom({ hostId: playerId, targetScore: 30, roomType: 'world' })
      }

      await joinPlayer({
        id: playerId,
        roomId: room.id,
        name: name.trim(),
        avatar,
        avatarColor,
        isHost: room.host_id === playerId,
      })
      Audio.join()
      nav(`/room/${room.id}`)
    } catch (e) {
      toast('Error: ' + e.message, 'var(--danger)')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-container">
      <div style={{ paddingTop: 24, marginBottom: 24 }}>
        <h1 className="logo">🌍 Name. Place.<br />Animal. Thing.</h1>
        <p className="tagline">The classic word game — now real-time multiplayer!</p>
      </div>

      {!configured && (
        <div className="card" style={{ borderColor: 'rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.05)', marginBottom: 16 }}>
          <div className="flex gap-8 items-center mb-8">
            <span style={{ fontSize: '1.3rem' }}>⚠️</span>
            <strong>Supabase not configured</strong>
          </div>
          <p className="text-sm text-muted mb-12">
            To enable real multiplayer, you need to connect a free Supabase database.
          </p>
          <button className="btn btn-gold btn-sm" onClick={() => nav('/setup')}>
            🔧 Setup Guide →
          </button>
        </div>
      )}

      <div className="card">
        {/* Tabs */}
        <div className="tab-row">
          {[['create','🏠 Create Room'],['join','🔑 Join Room']].map(([t, label]) => (
            <button key={t} className={`tab${tab===t?' active':''}`} onClick={() => setTab(t)}>{label}</button>
          ))}
        </div>

        {/* Profile */}
        <div className="section-title">👤 Your Profile</div>
        <div className="input-group">
          <label className="input-label">Your Name</label>
          <input
            type="text"
            placeholder="Enter your name..."
            value={name}
            maxLength={20}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') tab === 'create' ? handleCreate() : handleJoin() }}
          />
        </div>

        <div className="input-group">
          <label className="input-label">Pick Your Avatar</label>
          <div className="avatar-picker">
            {AVATARS.map((av, i) => {
              const col = AVATAR_COLORS[i % AVATAR_COLORS.length]
              return (
                <div
                  key={av}
                  className={`avatar-opt${avatar===av?' selected':''}`}
                  style={{ background: col+'22', borderColor: avatar===av ? col : 'transparent' }}
                  onClick={() => { setAvatar(av); setAvatarColor(col) }}
                  title={av}
                >
                  {av}
                </div>
              )
            })}
          </div>
        </div>

        <hr className="divider" />

        {tab === 'create' ? (
          <>
            <div className="section-title">🎮 Room Settings</div>
            <div className="grid-2 mb-16">
              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label">🎯 Play to Points</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={targetScore}
                  placeholder="50"
                  onChange={e => {
                    const raw = e.target.value.replace(/[^0-9]/g, '')
                    setTargetScore(raw)
                  }}
                  onBlur={() => {
                    const n = parseInt(targetScore) || 50
                    setTargetScore(String(Math.min(200, Math.max(10, n))))
                  }}
                />
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label">🌐 Room Type</label>
                <select value={roomType} onChange={e => setRoomType(e.target.value)}>
                  <option value="private">🔒 Private</option>
                  <option value="world">🌍 World (Public)</option>
                </select>
              </div>
            </div>

            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={handleCreate}
              disabled={loading}
            >
              {loading ? '⏳ Creating...' : '🚀 Create Room'}
            </button>
          </>
        ) : (
          <>
            <div className="section-title">🔑 Join with Code</div>
            <div className="input-group">
              <label className="input-label">Room Code</label>
              <input
                type="text"
                placeholder="e.g. AB12CD"
                value={joinCode}
                maxLength={6}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', textAlign: 'center', letterSpacing: '6px' }}
              />
            </div>
            <button
              className="btn btn-primary btn-full btn-lg mb-16"
              onClick={handleJoin}
              disabled={loading}
            >
              {loading ? '⏳ Joining...' : '🎮 Join Game'}
            </button>

            <hr className="divider" />

            <div className="section-title">🌍 World Room</div>
            <div className="world-card" onClick={handleWorldRoom}>
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🌎</div>
              <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>Play with Strangers</div>
              <p className="text-sm text-muted">Join a public room and play with random players from anywhere in the world!</p>
            </div>
          </>
        )}
      </div>

      {/* How to play */}
      <div className="card">
        <div className="card-title">📖 How to Play</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            ['🔤','A random letter is picked each round'],
            ['⏱️','You have 45 seconds to write answers'],
            ['✅','1 pt for a unique correct answer'],
            ['½','½ pt if others wrote the same word'],
            ['🔁','0 pt for repeating a word from a prior same-letter round'],
            ['🏆','First to reach the target score wins!'],
          ].map(([icon, text], i) => (
            <div key={i} className="player-row" style={{ padding: '10px 12px' }}>
              <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{icon}</span>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
