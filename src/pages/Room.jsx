import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  supabase, getRoom, getPlayers, updateRoom, getRoomAnswers,
  submitAnswer, updateAnswerScores, updatePlayerScore,
  sendRoomEvent, pingPlayer
} from '../lib/supabase.js'
import {
  ROUND_TIME, getRandomLetter, calculateRoundPoints,
  buildLetterHistoryEntry, validateAnswers, Audio, spawnConfetti,
  toast, LS
} from '../lib/game.js'
import Lobby from '../components/Lobby.jsx'
import Playing from '../components/Playing.jsx'
import Results from '../components/Results.jsx'
import Winner from '../components/Winner.jsx'

export default function Room() {
  const { roomId } = useParams()
  const nav = useNavigate()
  const playerId = LS.get('npat_pid')

  const [room, setRoom]             = useState(null)
  const [players, setPlayers]       = useState([])
  const [me, setMe]                 = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [answers, setAnswers]       = useState({ Name:'', Place:'', Animal:'', Thing:'' })
  const [timeLeft, setTimeLeft]     = useState(ROUND_TIME)
  const [submitted, setSubmitted]   = useState(false)
  const [submittedCount, setSubmittedCount] = useState(0)
  const [currentResults, setCurrentResults] = useState([])
  const [scores, setScores]         = useState({})
  const [processing, setProcessing] = useState(false)
  const [showExitModal, setShowExitModal] = useState(false)

  // Refs — always-fresh, safe in closures/intervals
  const timerRef      = useRef(null)
  const scoreTimerRef = useRef(null)
  const pingRef       = useRef(null)
  const channelRef    = useRef(null)
  const submittedRef  = useRef(false)
  const scoringRef    = useRef(false)
  const meRef         = useRef(null)
  const playersRef    = useRef([])
  const answersRef    = useRef({ Name:'', Place:'', Animal:'', Thing:'' })
  const roomRef       = useRef(null)

  useEffect(() => { meRef.current = me },           [me])
  useEffect(() => { playersRef.current = players }, [players])
  useEffect(() => { answersRef.current = answers }, [answers])
  useEffect(() => { roomRef.current = room },       [room])

  // ─── Boot ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playerId) { nav('/'); return }
    loadRoom()
    return cleanup
  }, [roomId])

  async function loadRoom() {
    try {
      const [r, p] = await Promise.all([getRoom(roomId), getPlayers(roomId)])
      applyRoom(r); applyPlayers(p)
      const myP = p.find(pl => pl.id === playerId)
      if (!myP) { nav(`/?join=${roomId}`); return }
      applyMe(myP)
      setLoading(false)
      setupRealtime()
      startPing()

      if (r.status === 'playing') {
        if (!submittedRef.current) startServerSyncedTimer(r)
      }
      if (r.status === 'paused') {
        // Show paused state — nothing to start
      }
      if (r.status === 'results' || r.status === 'finished') {
        await loadResults(r)
      }
    } catch (e) {
      setError('Room not found: ' + e.message)
      setLoading(false)
    }
  }

  function applyRoom(r)    { setRoom(r);    roomRef.current = r }
  function applyPlayers(p) { setPlayers(p); playersRef.current = p; buildScores(p) }
  function applyMe(m)      { setMe(m);      meRef.current = m }
  function buildScores(p)  { const s={}; p.forEach(x => s[x.id]=parseFloat(x.score)||0); setScores(s) }

  function cleanup() {
    clearTimeout(scoreTimerRef.current)
    clearInterval(timerRef.current)
    clearInterval(pingRef.current)
    if (channelRef.current) supabase?.removeChannel(channelRef.current)
  }

  function startPing() {
    pingRef.current = setInterval(() => playerId && pingPlayer(playerId), 15000)
  }

  // ─── SERVER-SYNCED TIMER ───────────────────────────────────────────────────
  // All devices compute timeLeft from the same server timestamp stored in DB.
  // This guarantees every device shows the same countdown, regardless of when
  // they joined or how much their local clock has drifted.
  function startServerSyncedTimer(r) {
    clearInterval(timerRef.current)

    // round_started_at is stored in DB settings when a round begins
    const startedAt = r.settings?.round_started_at
      ? new Date(r.settings.round_started_at).getTime()
      : new Date(r.updated_at).getTime()

    function tick() {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000)
      const remaining = Math.max(0, ROUND_TIME - elapsed)
      setTimeLeft(remaining)

      if (remaining > 0 && remaining <= 10) Audio.urgent()

      if (remaining <= 0) {
        clearInterval(timerRef.current)
        const currentRoom = roomRef.current
        if (!submittedRef.current) {
          doSubmit(answersRef.current, currentRoom)
        }
        // Host scores after 5s grace
        if (meRef.current?.is_host && !scoringRef.current) {
          scheduleScoring(currentRoom, 5000)
        }
      }
    }

    tick() // run immediately so display is instant
    timerRef.current = setInterval(tick, 1000)
  }

  function scheduleScoring(r, delayMs) {
    clearTimeout(scoreTimerRef.current)
    scoreTimerRef.current = setTimeout(() => {
      if (!scoringRef.current) scoreRound(r)
    }, delayMs)
  }

  // ─── Load results ──────────────────────────────────────────────────────────
  async function loadResults(r) {
    try {
      const [ans, pList] = await Promise.all([
        getRoomAnswers(roomId, r.round_number),
        getPlayers(roomId)
      ])
      const results = ans.map(a => {
        const player = pList.find(p => p.id === a.player_id)
        const np=+a.name_points, pp=+a.place_points, ap=+a.animal_points, tp=+a.thing_points
        return {
          playerId: a.player_id,
          playerName: player?.name || '?',
          avatar: player?.avatar,
          avatarColor: player?.avatar_color,
          answers: { Name:a.name_answer, Place:a.place_answer, Animal:a.animal_answer, Thing:a.thing_answer },
          valid:   { Name:a.name_valid,  Place:a.place_valid,  Animal:a.animal_valid,  Thing:a.thing_valid  },
          points:  { Name:np, Place:pp, Animal:ap, Thing:tp },
          pointReason: {
            Name:   np===1?'unique':np===.5?'shared':a.name_valid?'repeated':'invalid',
            Place:  pp===1?'unique':pp===.5?'shared':a.place_valid?'repeated':'invalid',
            Animal: ap===1?'unique':ap===.5?'shared':a.animal_valid?'repeated':'invalid',
            Thing:  tp===1?'unique':tp===.5?'shared':a.thing_valid?'repeated':'invalid',
          },
          total: +a.total_points,
        }
      })
      setCurrentResults(results)
      applyPlayers(pList)
      setProcessing(false)
      if (r.status === 'finished') { spawnConfetti(); Audio.win() }
    } catch(e) { console.error('loadResults', e) }
  }

  // ─── Realtime ──────────────────────────────────────────────────────────────
  function setupRealtime() {
    if (!supabase) return
    const ch = supabase.channel(`room_${roomId}_${Date.now()}`)

    ch.on('postgres_changes',
      { event:'UPDATE', schema:'public', table:'rooms', filter:`id=eq.${roomId}` },
      async payload => {
        const r = payload.new
        applyRoom(r)

        if (r.status === 'playing') {
          if (!meRef.current?.is_host) {
            resetRoundState()
            Audio.roundStart()
            startServerSyncedTimer(r)
          }
        }

        if (r.status === 'paused') {
          clearInterval(timerRef.current)
          clearTimeout(scoreTimerRef.current)
          toast('⏸️ Game paused by host', 'var(--secondary)')
        }

        if (r.status === 'results' || r.status === 'finished') {
          clearInterval(timerRef.current)
          clearTimeout(scoreTimerRef.current)
          await loadResults(r)
        }
      }
    )

    ch.on('postgres_changes',
      { event:'*', schema:'public', table:'players', filter:`room_id=eq.${roomId}` },
      async () => {
        const p = await getPlayers(roomId)
        applyPlayers(p)
        const myP = p.find(pl => pl.id === playerId)
        if (myP) applyMe(myP)
      }
    )

    ch.on('postgres_changes',
      { event:'INSERT', schema:'public', table:'round_answers', filter:`room_id=eq.${roomId}` },
      async () => {
        const r = roomRef.current
        if (!r || r.status !== 'playing') return
        const ans = await getRoomAnswers(roomId, r.round_number)
        setSubmittedCount(ans.length)
        if (meRef.current?.is_host && ans.length >= playersRef.current.length && !scoringRef.current) {
          clearTimeout(scoreTimerRef.current)
          scoreRound(r)
        }
      }
    )

    ch.subscribe()
    channelRef.current = ch
  }

  // ─── Reset round state ─────────────────────────────────────────────────────
  function resetRoundState() {
    setAnswers({ Name:'', Place:'', Animal:'', Thing:'' })
    answersRef.current = { Name:'', Place:'', Animal:'', Thing:'' }
    setSubmitted(false); submittedRef.current = false
    scoringRef.current = false
    setCurrentResults([])
    setSubmittedCount(0)
    setProcessing(false)
    clearTimeout(scoreTimerRef.current)
    clearInterval(timerRef.current)
  }

  // ─── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() { doSubmit(answersRef.current, roomRef.current) }

  async function doSubmit(currentAnswers, currentRoom) {
    if (submittedRef.current) return
    submittedRef.current = true
    setSubmitted(true)
    clearInterval(timerRef.current)
    try {
      const r = currentRoom || await getRoom(roomId)
      if (!r || r.status !== 'playing') return
      await submitAnswer({ roomId, playerId, roundNumber:r.round_number, letter:r.current_letter, answers:currentAnswers })
      setSubmittedCount(prev => prev + 1)
      if (meRef.current?.is_host) scheduleScoring(r, 6000)
    } catch(e) {
      console.error('Submit error', e)
      toast('Submit error: ' + e.message, 'var(--danger)')
    }
  }

  // ─── Score round (host only) ───────────────────────────────────────────────
  async function scoreRound(r) {
    if (scoringRef.current) return
    scoringRef.current = true
    clearTimeout(scoreTimerRef.current)
    setProcessing(true)
    try {
      const [allAnswers, pList] = await Promise.all([
        getRoomAnswers(roomId, r.round_number),
        getPlayers(roomId)
      ])
      const validated = await Promise.all(allAnswers.map(async a => {
        const raw = { Name:a.name_answer, Place:a.place_answer, Animal:a.animal_answer, Thing:a.thing_answer }
        const v = await validateAnswers(r.current_letter, raw)
        return { ...a, name_valid:v.Name, place_valid:v.Place, animal_valid:v.Animal, thing_valid:v.Thing }
      }))
      const scored = calculateRoundPoints(validated, r.current_letter, r.letter_history||[])
      const newScores = {}
      pList.forEach(p => newScores[p.id] = parseFloat(p.score)||0)
      for (const s of scored) {
        await updateAnswerScores(s.id, {
          name_valid:s.name_valid, place_valid:s.place_valid, animal_valid:s.animal_valid, thing_valid:s.thing_valid,
          name_points:s.points.Name, place_points:s.points.Place, animal_points:s.points.Animal, thing_points:s.points.Thing,
          total_points:s.total,
        })
        newScores[s.player_id] = Math.round(((newScores[s.player_id]||0) + s.total) * 2) / 2
      }
      for (const [pid, sc] of Object.entries(newScores)) await updatePlayerScore(pid, sc)
      const newHistory = [...(r.letter_history||[]), buildLetterHistoryEntry(r.current_letter, scored)]
      const winner = Object.entries(newScores).find(([,sc]) => sc >= r.target_score)
      const newStatus = winner ? 'finished' : 'results'
      await updateRoom(roomId, { status:newStatus, letter_history:newHistory })
      const freshRoom = { ...r, status:newStatus, letter_history:newHistory }
      await loadResults(freshRoom)
    } catch(e) {
      console.error('Score error', e)
      scoringRef.current = false
      setProcessing(false)
      toast('Scoring error: ' + e.message, 'var(--danger)')
    }
  }

  // ─── Round management ──────────────────────────────────────────────────────
  async function startNewRound(currentRoom) {
    const letter = getRandomLetter(currentRoom.used_letters||[])
    const used = [...(currentRoom.used_letters||[]), letter]
    const roundStartedAt = new Date().toISOString()
    const updates = {
      status: 'playing',
      current_letter: letter,
      round_number: (currentRoom.round_number||0) + 1,
      used_letters: used,
      settings: { ...(currentRoom.settings||{}), round_started_at: roundStartedAt },
    }
    await updateRoom(roomId, updates)
    const newRoom = { ...currentRoom, ...updates }
    applyRoom(newRoom)
    resetRoundState()
    Audio.roundStart()
    startServerSyncedTimer(newRoom)
  }

  async function handleStartGame() { await startNewRound(room) }
  async function handleNextRound() { await startNewRound(room) }

  async function handlePlayAgain() {
    scoringRef.current = false
    const pList = await getPlayers(roomId)
    for (const p of pList) await updatePlayerScore(p.id, 0)
    await updateRoom(roomId, { status:'lobby', round_number:0, current_letter:null, used_letters:[], letter_history:[], settings:{} })
    resetRoundState()
    applyPlayers(pList.map(p => ({ ...p, score:0 })))
  }

  // ─── Pause / Resume ────────────────────────────────────────────────────────
  async function handlePause() {
    setShowExitModal(false)
    clearInterval(timerRef.current)
    clearTimeout(scoreTimerRef.current)
    // Store how much time was left so we can resume correctly
    const timeRemaining = timeLeft
    await updateRoom(roomId, {
      status: 'paused',
      settings: { ...(room.settings||{}), paused_time_remaining: timeRemaining }
    })
    toast('⏸️ Game paused', 'var(--secondary)')
  }

  async function handleResume() {
    if (!me.is_host) return
    const remaining = room.settings?.paused_time_remaining ?? ROUND_TIME
    // Set a new round_started_at so timer re-syncs from now
    const roundStartedAt = new Date(Date.now() - (ROUND_TIME - remaining) * 1000).toISOString()
    await updateRoom(roomId, {
      status: 'playing',
      settings: { ...(room.settings||{}), round_started_at: roundStartedAt, paused_time_remaining: null }
    })
    const newRoom = { ...room, status:'playing', settings:{ ...(room.settings||{}), round_started_at: roundStartedAt } }
    applyRoom(newRoom)
    startServerSyncedTimer(newRoom)
    toast('▶️ Game resumed!', 'var(--accent)')
  }

  async function handleExitRoom() {
    setShowExitModal(false)
    cleanup()
    nav('/')
  }

  async function handleEndGame() {
    setShowExitModal(false)
    clearInterval(timerRef.current)
    clearTimeout(scoreTimerRef.current)
    await updateRoom(roomId, { status: 'lobby' })
    resetRoundState()
    toast('🏠 Returned to lobby', 'var(--secondary)')
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  const shareUrl = `${window.location.origin}/room/${roomId}`
  const status = room?.status

  if (loading) return (
    <div className="loading-screen">
      <div style={{ fontSize:'3rem' }}>🌍</div>
      <div className="font-display" style={{ fontSize:'1.5rem', color:'var(--primary-light)' }}>Loading game...</div>
    </div>
  )
  if (error) return (
    <div className="loading-screen">
      <div style={{ fontSize:'3rem' }}>😕</div>
      <div style={{ fontSize:'1.1rem', color:'var(--danger)', marginBottom:16 }}>{error}</div>
      <button className="btn btn-primary" onClick={() => nav('/')}>← Back Home</button>
    </div>
  )
  if (!room || !me) return null

  return (
    <div className="app-container">
      {/* Header */}
      <div style={{ paddingTop:16, marginBottom:16 }}>
        <div className="flex-between">
          <h1 className="logo" style={{ fontSize:'1.4rem', marginBottom:0 }}>🌍 NPAT</h1>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowExitModal(true)}
            style={{ fontSize:'0.8rem', padding:'6px 12px' }}
          >
            ☰ Menu
          </button>
        </div>
        <div className="flex-center gap-8" style={{ marginTop:4 }}>
          <span className="status-dot status-online" />
          <span className="text-xs text-muted">
            {players.length} player{players.length!==1?'s':''} · Room {roomId}
            {status === 'paused' && <span style={{ color:'var(--secondary)', marginLeft:6 }}>· ⏸ PAUSED</span>}
          </span>
        </div>
      </div>

      {/* Exit / Menu Modal */}
      {showExitModal && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.7)',
          display:'flex', alignItems:'center', justifyContent:'center',
          zIndex:1000, padding:20
        }}>
          <div className="card" style={{ width:'100%', maxWidth:380, margin:0 }}>
            <div className="card-title" style={{ marginBottom:20 }}>⚙️ Game Menu</div>

            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {/* Pause — only during active play, only host */}
              {me.is_host && status === 'playing' && (
                <button className="btn btn-gold btn-full" onClick={handlePause}>
                  ⏸️ Pause Game
                </button>
              )}

              {/* Resume — only when paused, only host */}
              {me.is_host && status === 'paused' && (
                <button className="btn btn-success btn-full" onClick={handleResume}>
                  ▶️ Resume Game
                </button>
              )}

              {/* End round / return to lobby — host only */}
              {me.is_host && (status === 'playing' || status === 'paused') && (
                <button className="btn btn-secondary btn-full" onClick={handleEndGame}>
                  🏠 End Round & Return to Lobby
                </button>
              )}

              {/* Leave room — anyone */}
              <button className="btn btn-danger btn-full" onClick={handleExitRoom}>
                🚪 Leave Room
              </button>

              <button className="btn btn-secondary btn-full" onClick={() => setShowExitModal(false)}>
                ✕ Cancel
              </button>
            </div>

            {!me.is_host && (
              <p className="text-xs text-muted text-center mt-12">
                Only the host can pause or end the game.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Paused screen */}
      {status === 'paused' && (
        <div className="card text-center" style={{ padding:'48px 24px' }}>
          <div style={{ fontSize:'3.5rem', marginBottom:12 }}>⏸️</div>
          <div className="font-display" style={{ fontSize:'1.8rem', color:'var(--secondary)', marginBottom:8 }}>
            Game Paused
          </div>
          <p className="text-muted text-sm" style={{ marginBottom:24 }}>
            {me.is_host ? 'Resume the game when everyone is ready.' : 'Waiting for the host to resume...'}
          </p>
          {me.is_host && (
            <button className="btn btn-success btn-full btn-lg" onClick={handleResume}>
              ▶️ Resume Game
            </button>
          )}
        </div>
      )}

      {status === 'lobby' && (
        <Lobby room={room} players={players} me={me} shareUrl={shareUrl} onStart={handleStartGame} />
      )}

      {status === 'playing' && currentResults.length === 0 && (
        <Playing
          room={room} players={players} me={me}
          answers={answers}
          setAnswers={val => { setAnswers(val); answersRef.current = val }}
          timeLeft={timeLeft} submitted={submitted}
          submittedCount={submittedCount}
          scores={scores} onSubmit={handleSubmit}
        />
      )}

      {processing && currentResults.length === 0 && (
        <div className="card text-center" style={{ padding:'48px 24px' }}>
          <div style={{ fontSize:'3rem', marginBottom:16 }}>🤖</div>
          <div className="font-display" style={{ fontSize:'1.5rem', color:'var(--primary-light)', marginBottom:8 }}>
            Validating Answers...
          </div>
          <p className="text-muted text-sm">Claude AI is checking all words!</p>
        </div>
      )}

      {(status==='results'||status==='finished') && currentResults.length === 0 && !processing && (
        <div className="card text-center" style={{ padding:'48px 24px' }}>
          <div style={{ fontSize:'3rem', marginBottom:16 }}>⏳</div>
          <div className="font-display" style={{ fontSize:'1.5rem', color:'var(--primary-light)', marginBottom:8 }}>
            Loading Results...
          </div>
          <p className="text-muted text-sm">Hang on, fetching scores!</p>
        </div>
      )}

      {status==='results' && currentResults.length > 0 && (
        <Results
          room={room} players={players} me={me}
          results={currentResults} scores={scores}
          processing={false} isHost={me.is_host}
          onNext={handleNextRound}
        />
      )}

      {status==='finished' && currentResults.length > 0 && (
        <>
          <Results
            room={room} players={players} me={me}
            results={currentResults} scores={scores}
            processing={false} isHost={false} onNext={null}
          />
          <Winner
            room={room} players={players} me={me}
            scores={scores} isHost={me.is_host}
            onPlayAgain={handlePlayAgain}
          />
        </>
      )}
    </div>
  )
}
