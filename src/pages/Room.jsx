import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  supabase, getRoom, getPlayers, updateRoom, getRoomAnswers,
  submitAnswer, updateAnswerScores, updatePlayerScore,
  sendRoomEvent, pingPlayer
} from '../lib/supabase.js'
import {
  CATEGORIES, ROUND_TIME, getRandomLetter, calculateRoundPoints,
  buildLetterHistoryEntry, validateAnswers, Audio, spawnConfetti,
  toast, LS, getRankIcon, copyText
} from '../lib/game.js'
import Lobby from '../components/Lobby.jsx'
import Playing from '../components/Playing.jsx'
import Scoring from '../components/Scoring.jsx'
import Results from '../components/Results.jsx'
import Winner from '../components/Winner.jsx'

export default function Room() {
  const { roomId } = useParams()
  const nav = useNavigate()
  const playerId = LS.get('npat_pid')

  const [room, setRoom] = useState(null)
  const [players, setPlayers] = useState([])
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Game state
  const [answers, setAnswers] = useState({ Name:'', Place:'', Animal:'', Thing:'' })
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME)
  const [submitted, setSubmitted] = useState(false)
  const [roundAnswers, setRoundAnswers] = useState([])
  const [currentResults, setCurrentResults] = useState([])
  const [scores, setScores] = useState({})
  const [processing, setProcessing] = useState(false)

  const timerRef = useRef(null)
  const pingRef = useRef(null)
  const channelRef = useRef(null)
  const submittedRef = useRef(false)

  // ─── Load room & players ───────────────────────────────────────────────────
  useEffect(() => {
    if (!playerId) { nav('/'); return }
    loadRoom()
    return () => cleanup()
  }, [roomId])

  async function loadRoom() {
    try {
      const [r, p] = await Promise.all([getRoom(roomId), getPlayers(roomId)])
      setRoom(r)
      setPlayers(p)
      const myPlayer = p.find(pl => pl.id === playerId)
      if (!myPlayer) {
        // Player session expired — redirect
        nav(`/?join=${roomId}`)
        return
      }
      setMe(myPlayer)
      buildScores(p)
      setLoading(false)
      setupRealtime()
      startPing()

      if (r.status === 'playing') {
        // Re-joining mid-game: restore timer
        const elapsed = Math.floor((Date.now() - new Date(r.updated_at).getTime()) / 1000)
        setTimeLeft(Math.max(0, ROUND_TIME - elapsed))
        if (!submittedRef.current) startTimer(Math.max(0, ROUND_TIME - elapsed))
      }
    } catch (e) {
      setError('Room not found. ' + e.message)
      setLoading(false)
    }
  }

  function buildScores(playerList) {
    const s = {}
    for (const p of playerList) s[p.id] = parseFloat(p.score) || 0
    setScores(s)
  }

  function cleanup() {
    clearInterval(timerRef.current)
    clearInterval(pingRef.current)
    if (channelRef.current) supabase?.removeChannel(channelRef.current)
  }

  function startPing() {
    pingRef.current = setInterval(() => {
      if (playerId) pingPlayer(playerId)
    }, 20000)
  }

  // ─── Realtime subscriptions ───────────────────────────────────────────────
  function setupRealtime() {
    if (!supabase) return
    const ch = supabase.channel(`room:${roomId}`, { config: { broadcast: { self: false } } })

    // Room changes
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
      payload => {
        const r = payload.new
        setRoom(r)
        if (r.status === 'playing' && r.round_number) {
          setAnswers({ Name:'', Place:'', Animal:'', Thing:'' })
          setSubmitted(false)
          submittedRef.current = false
          setRoundAnswers([])
          setCurrentResults([])
          clearInterval(timerRef.current)
          Audio.roundStart()
          startTimer(ROUND_TIME)
        }
      }
    )

    // Player changes
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
      async () => {
        const p = await getPlayers(roomId)
        setPlayers(p)
        buildScores(p)
        const myP = p.find(pl => pl.id === playerId)
        if (myP) setMe(myP)
      }
    )

    // Answer submissions (host tracks these)
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'round_answers', filter: `room_id=eq.${roomId}` },
      async () => {
        const r = await getRoom(roomId)
        if (r.status !== 'playing') return
        const ans = await getRoomAnswers(roomId, r.round_number)
        setRoundAnswers(ans)
      }
    )

    // Room events
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_events', filter: `room_id=eq.${roomId}` },
      payload => handleRoomEvent(payload.new)
    )

    ch.subscribe()
    channelRef.current = ch
  }

  function handleRoomEvent(event) {
    const { event_type, payload } = event
    if (event_type === 'player_joined') {
      toast(`🎮 ${payload.name} joined the game!`, 'var(--accent)')
      Audio.join()
    } else if (event_type === 'round_scored') {
      setCurrentResults(payload.results || [])
      setProcessing(false)
    } else if (event_type === 'game_winner') {
      spawnConfetti()
      Audio.win()
    }
  }

  // ─── Timer ────────────────────────────────────────────────────────────────
  function startTimer(seconds = ROUND_TIME) {
    clearInterval(timerRef.current)
    setTimeLeft(seconds)
    let t = seconds
    timerRef.current = setInterval(() => {
      t--
      setTimeLeft(t)
      if (t <= 10) Audio.urgent()
      else if (t % 10 === 0) Audio.tick()
      if (t <= 0) {
        clearInterval(timerRef.current)
        if (!submittedRef.current) handleSubmit()
      }
    }, 1000)
  }

  // ─── Submit answers ───────────────────────────────────────────────────────
  async function handleSubmit() {
    if (submittedRef.current) return
    submittedRef.current = true
    setSubmitted(true)
    clearInterval(timerRef.current)

    const r = await getRoom(roomId)
    await submitAnswer({
      roomId,
      playerId,
      roundNumber: r.round_number,
      letter: r.current_letter,
      answers,
    })

    // If host: wait a moment then score the round
    if (me?.is_host) {
      setTimeout(() => scoreRound(r), 3000)
    }
  }

  // ─── Score round (host only) ──────────────────────────────────────────────
  async function scoreRound(r) {
    setProcessing(true)
    try {
      // Get all answers
      const allAnswers = await getRoomAnswers(roomId, r.round_number)
      const playerList = await getPlayers(roomId)

      // Validate each player's answers via Claude
      const validatedAnswers = await Promise.all(
        allAnswers.map(async (a) => {
          const raw = {
            Name: a.name_answer, Place: a.place_answer,
            Animal: a.animal_answer, Thing: a.thing_answer
          }
          const valid = await validateAnswers(r.current_letter, raw)
          return { ...a, name_valid: valid.Name, place_valid: valid.Place, animal_valid: valid.Animal, thing_valid: valid.Thing }
        })
      )

      // Calculate points
      const letterHistory = r.letter_history || []
      const scored = calculateRoundPoints(validatedAnswers, r.current_letter, letterHistory)

      // Save scored answers & update player totals
      const newScores = {}
      for (const p of playerList) newScores[p.id] = parseFloat(p.score) || 0

      for (const s of scored) {
        await updateAnswerScores(s.id, {
          name_valid: s.name_valid, place_valid: s.place_valid,
          animal_valid: s.animal_valid, thing_valid: s.thing_valid,
          name_points: s.points.Name, place_points: s.points.Place,
          animal_points: s.points.Animal, thing_points: s.points.Thing,
          total_points: s.total,
        })
        newScores[s.player_id] = Math.round(((newScores[s.player_id] || 0) + s.total) * 2) / 2
      }

      for (const [pid, sc] of Object.entries(newScores)) {
        await updatePlayerScore(pid, sc)
      }

      // Build results for broadcast
      const results = scored.map(s => {
        const player = playerList.find(p => p.id === s.player_id)
        return {
          playerId: s.player_id,
          playerName: player?.name || 'Unknown',
          avatar: player?.avatar,
          avatarColor: player?.avatar_color,
          answers: {
            Name: s.name_answer, Place: s.place_answer,
            Animal: s.animal_answer, Thing: s.thing_answer
          },
          valid: { Name: s.name_valid, Place: s.place_valid, Animal: s.animal_valid, Thing: s.thing_valid },
          points: { Name: s.points.Name, Place: s.points.Place, Animal: s.points.Animal, Thing: s.points.Thing },
          pointReason: s.pointReason,
          total: s.total,
        }
      })

      // Update letter history
      const histEntry = buildLetterHistoryEntry(r.current_letter, scored)
      const newHistory = [...(r.letter_history || []), histEntry]

      // Check for winner
      const winner = Object.entries(newScores).find(([, sc]) => sc >= r.target_score)

      await updateRoom(roomId, {
        status: winner ? 'finished' : 'results',
        letter_history: newHistory,
      })

      await sendRoomEvent(roomId, 'round_scored', { results, scores: newScores })

      if (winner) {
        const winnerPlayer = playerList.find(p => p.id === winner[0])
        await sendRoomEvent(roomId, 'game_winner', { playerId: winner[0], playerName: winnerPlayer?.name })
      }

      // Set local results immediately for host
      setCurrentResults(results)
      setProcessing(false)

    } catch (e) {
      console.error('Score error', e)
      setProcessing(false)
      toast('Error scoring round: ' + e.message, 'var(--danger)')
    }
  }

  // ─── Start game (host) ────────────────────────────────────────────────────
  async function handleStartGame() {
    const letter = getRandomLetter(room.used_letters || [])
    const usedLetters = [...(room.used_letters || []), letter]
    await updateRoom(roomId, {
      status: 'playing',
      current_letter: letter,
      round_number: (room.round_number || 0) + 1,
      used_letters: usedLetters,
    })
    Audio.roundStart()
    startTimer(ROUND_TIME)
  }

  // ─── Next round (host) ────────────────────────────────────────────────────
  async function handleNextRound() {
    submittedRef.current = false
    setSubmitted(false)
    setCurrentResults([])
    setRoundAnswers([])
    setAnswers({ Name:'', Place:'', Animal:'', Thing:'' })
    const letter = getRandomLetter(room.used_letters || [])
    const usedLetters = [...(room.used_letters || []), letter]
    await updateRoom(roomId, {
      status: 'playing',
      current_letter: letter,
      round_number: (room.round_number || 0) + 1,
      used_letters: usedLetters,
    })
    Audio.roundStart()
    startTimer(ROUND_TIME)
  }

  // ─── Play again (host) ───────────────────────────────────────────────────
  async function handlePlayAgain() {
    const pList = await getPlayers(roomId)
    for (const p of pList) await updatePlayerScore(p.id, 0)
    await updateRoom(roomId, {
      status: 'lobby',
      round_number: 0,
      current_letter: null,
      used_letters: [],
      letter_history: [],
    })
    setCurrentResults([])
    setRoundAnswers([])
    setAnswers({ Name:'', Place:'', Animal:'', Thing:'' })
    submittedRef.current = false
    setSubmitted(false)
  }

  const shareUrl = `${window.location.origin}/room/${roomId}`

  if (loading) return (
    <div className="loading-screen">
      <div style={{ fontSize: '3rem' }}>🌍</div>
      <div className="font-display" style={{ fontSize: '1.5rem', color: 'var(--primary-light)' }}>Loading game...</div>
    </div>
  )

  if (error) return (
    <div className="loading-screen">
      <div style={{ fontSize: '3rem' }}>😕</div>
      <div style={{ fontSize: '1.1rem', color: 'var(--danger)', marginBottom: 16 }}>{error}</div>
      <button className="btn btn-primary" onClick={() => nav('/')}>← Back Home</button>
    </div>
  )

  if (!room || !me) return null

  const status = room.status

  return (
    <div className="app-container">
      <div style={{ paddingTop: 16, marginBottom: 16 }}>
        <h1 className="logo" style={{ fontSize: '1.6rem', marginBottom: 4 }}>🌍 NPAT</h1>
        <div className="flex-center gap-8" style={{ marginBottom: 4 }}>
          <span className="status-dot status-online"></span>
          <span className="text-xs text-muted">{players.length} player{players.length!==1?'s':''} · Room {roomId}</span>
        </div>
      </div>

      {status === 'lobby' && (
        <Lobby
          room={room}
          players={players}
          me={me}
          shareUrl={shareUrl}
          onStart={handleStartGame}
        />
      )}
      {status === 'playing' && (
        <Playing
          room={room}
          players={players}
          me={me}
          answers={answers}
          setAnswers={setAnswers}
          timeLeft={timeLeft}
          submitted={submitted}
          roundAnswers={roundAnswers}
          scores={scores}
          onSubmit={handleSubmit}
        />
      )}
      {(status === 'results' || (status === 'playing' && currentResults.length > 0)) && currentResults.length > 0 && (
        <Results
          room={room}
          players={players}
          me={me}
          results={currentResults}
          scores={scores}
          processing={processing}
          isHost={me.is_host}
          onNext={handleNextRound}
        />
      )}
      {status === 'finished' && (
        <Winner
          room={room}
          players={players}
          me={me}
          scores={scores}
          isHost={me.is_host}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </div>
  )
}
