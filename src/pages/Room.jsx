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

  const [room, setRoom]               = useState(null)
  const [players, setPlayers]         = useState([])
  const [me, setMe]                   = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [answers, setAnswers]         = useState({ Name:'', Place:'', Animal:'', Thing:'' })
  const [timeLeft, setTimeLeft]       = useState(ROUND_TIME)
  const [submitted, setSubmitted]     = useState(false)
  const [submittedCount, setSubmittedCount] = useState(0)
  const [currentResults, setCurrentResults] = useState([])
  const [scores, setScores]           = useState({})
  const [processing, setProcessing]   = useState(false)

  // Refs — always-fresh values safe inside closures/intervals
  const timerRef      = useRef(null)
  const scoreTimerRef = useRef(null)   // host's delayed score trigger
  const pingRef       = useRef(null)
  const channelRef    = useRef(null)
  const submittedRef  = useRef(false)
  const scoringRef    = useRef(false)
  const meRef         = useRef(null)
  const playersRef    = useRef([])
  const answersRef    = useRef({ Name:'', Place:'', Animal:'', Thing:'' })
  const roomRef       = useRef(null)

  useEffect(() => { meRef.current = me },       [me])
  useEffect(() => { playersRef.current = players }, [players])
  useEffect(() => { answersRef.current = answers }, [answers])
  useEffect(() => { roomRef.current = room },   [room])

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
        const elapsed = Math.floor((Date.now() - new Date(r.updated_at).getTime()) / 1000)
        const remaining = Math.max(0, ROUND_TIME - elapsed)
        setTimeLeft(remaining)
        if (!submittedRef.current) {
          remaining > 0 ? startTimer(remaining, r) : doSubmit(answersRef.current, r)
        }
      }
      if (r.status === 'results' || r.status === 'finished') await loadResults(r)
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

  // ─── Load results (all players read from DB) ───────────────────────────────
  async function loadResults(r) {
    try {
      const [ans, pList] = await Promise.all([
        getRoomAnswers(roomId, r.round_number),
        getPlayers(roomId)
      ])
      const results = ans.map(a => {
        const player = pList.find(p => p.id === a.player_id)
        const np = +a.name_points, pp = +a.place_points, ap = +a.animal_points, tp = +a.thing_points
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

  // ─── Realtime — only watches rooms table (most reliable) ──────────────────
  function setupRealtime() {
    if (!supabase) return
    const ch = supabase.channel(`room_${roomId}_${Date.now()}`)

    // rooms table changes drive everything
    ch.on('postgres_changes',
      { event:'UPDATE', schema:'public', table:'rooms', filter:`id=eq.${roomId}` },
      async payload => {
        const r = payload.new
        applyRoom(r)

        if (r.status === 'playing') {
          // Non-host players start fresh round
          if (!meRef.current?.is_host) {
            resetRoundState()
            Audio.roundStart()
            startTimer(ROUND_TIME, r)
          }
        }
        if (r.status === 'results' || r.status === 'finished') {
          clearInterval(timerRef.current)
          clearTimeout(scoreTimerRef.current)
          await loadResults(r)
        }
      }
    )

    // players table — update scores display
    ch.on('postgres_changes',
      { event:'*', schema:'public', table:'players', filter:`room_id=eq.${roomId}` },
      async () => {
        const p = await getPlayers(roomId)
        applyPlayers(p)
        const myP = p.find(pl => pl.id === playerId)
        if (myP) applyMe(myP)
      }
    )

    // round_answers — just update the "X submitted" counter display
    // Uses INSERT (delete+insert pattern) so this fires reliably
    ch.on('postgres_changes',
      { event:'INSERT', schema:'public', table:'round_answers', filter:`room_id=eq.${roomId}` },
      async () => {
        const r = roomRef.current
        if (!r || r.status !== 'playing') return
        const ans = await getRoomAnswers(roomId, r.round_number)
        setSubmittedCount(ans.length)

        // If host AND everyone submitted → score immediately (don't wait for grace period)
        if (meRef.current?.is_host && ans.length >= playersRef.current.length && !scoringRef.current) {
          clearTimeout(scoreTimerRef.current)
          scoreRound(r)
        }
      }
    )

    ch.subscribe(status => console.log('RT status:', status))
    channelRef.current = ch
  }

  // ─── Timer ─────────────────────────────────────────────────────────────────
  function startTimer(seconds, currentRoom) {
    clearInterval(timerRef.current)
    setTimeLeft(seconds)
    let t = seconds
    timerRef.current = setInterval(() => {
      t--
      setTimeLeft(t)
      if (t > 0 && t <= 10) Audio.urgent()
      if (t <= 0) {
        clearInterval(timerRef.current)
        const r = currentRoom || roomRef.current
        doSubmit(answersRef.current, r)
        // Host: schedule scoring after 5s grace period (wait for slow submitters)
        if (meRef.current?.is_host) {
          scheduleScoring(r, 5000)
        }
      }
    }, 1000)
  }

  // Host schedules scoring with a grace period — cancelled early if everyone submits
  function scheduleScoring(r, delayMs) {
    clearTimeout(scoreTimerRef.current)
    scoreTimerRef.current = setTimeout(() => {
      if (!scoringRef.current) scoreRound(r)
    }, delayMs)
  }

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

  // ─── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit() { doSubmit(answersRef.current, roomRef.current) }

  async function doSubmit(currentAnswers, currentRoom) {
    if (submittedRef.current) return
    submittedRef.current = true
    setSubmitted(true)
    clearInterval(timerRef.current)

    try {
      const r = currentRoom || await getRoom(roomId)
      if (!r || r.status !== 'playing') return
      await submitAnswer({ roomId, playerId, roundNumber: r.round_number, letter: r.current_letter, answers: currentAnswers })
      setSubmittedCount(prev => prev + 1)

      // Host: if they submitted manually (not timer), schedule scoring
      if (meRef.current?.is_host) {
        scheduleScoring(r, 6000)
      }
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

      // Validate with Claude
      const validated = await Promise.all(allAnswers.map(async a => {
        const raw = { Name:a.name_answer, Place:a.place_answer, Animal:a.animal_answer, Thing:a.thing_answer }
        const v = await validateAnswers(r.current_letter, raw)
        return { ...a, name_valid:v.Name, place_valid:v.Place, animal_valid:v.Animal, thing_valid:v.Thing }
      }))

      const scored = calculateRoundPoints(validated, r.current_letter, r.letter_history||[])

      // Save to DB
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

      // This UPDATE fires realtime for ALL players → they all call loadResults()
      await updateRoom(roomId, { status: newStatus, letter_history: newHistory })

      // Host loads immediately (their own realtime echo may lag)
      const freshRoom = { ...r, status: newStatus, letter_history: newHistory }
      await loadResults(freshRoom)

    } catch(e) {
      console.error('Score error', e)
      scoringRef.current = false
      setProcessing(false)
      toast('Scoring error: ' + e.message, 'var(--danger)')
    }
  }

  // ─── Host actions ──────────────────────────────────────────────────────────
  async function startNewRound(currentRoom) {
    const letter = getRandomLetter(currentRoom.used_letters||[])
    const used = [...(currentRoom.used_letters||[]), letter]
    const updates = { status:'playing', current_letter:letter, round_number:(currentRoom.round_number||0)+1, used_letters:used }
    await updateRoom(roomId, updates)
    const newRoom = { ...currentRoom, ...updates }
    applyRoom(newRoom)
    resetRoundState()
    Audio.roundStart()
    startTimer(ROUND_TIME, newRoom)
  }

  async function handleStartGame()  { await startNewRound(room) }
  async function handleNextRound()  { await startNewRound(room) }

  async function handlePlayAgain() {
    scoringRef.current = false
    const pList = await getPlayers(roomId)
    for (const p of pList) await updatePlayerScore(p.id, 0)
    await updateRoom(roomId, { status:'lobby', round_number:0, current_letter:null, used_letters:[], letter_history:[] })
    resetRoundState()
    applyPlayers(pList.map(p => ({ ...p, score:0 })))
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  const shareUrl = `${window.location.origin}/room/${roomId}`

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

  const status = room.status

  return (
    <div className="app-container">
      <div style={{ paddingTop:16, marginBottom:16 }}>
        <h1 className="logo" style={{ fontSize:'1.6rem', marginBottom:4 }}>🌍 NPAT</h1>
        <div className="flex-center gap-8" style={{ marginBottom:4 }}>
          <span className="status-dot status-online" />
          <span className="text-xs text-muted">{players.length} player{players.length!==1?'s':''} · Room {roomId}</span>
        </div>
      </div>

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
