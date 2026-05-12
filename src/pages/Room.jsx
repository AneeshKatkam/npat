import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  supabase, getRoom, getPlayers, updateRoom, getRoomAnswers,
  submitAnswer, updateAnswerScores, updatePlayerScore,
  sendRoomEvent, pingPlayer
} from '../lib/supabase.js'
import {
  CATEGORIES, ROUND_TIME, getRandomLetter, calculateRoundPoints,
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

  const [room, setRoom] = useState(null)
  const [players, setPlayers] = useState([])
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [answers, setAnswers] = useState({ Name: '', Place: '', Animal: '', Thing: '' })
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME)
  const [submitted, setSubmitted] = useState(false)
  const [roundAnswers, setRoundAnswers] = useState([])
  const [currentResults, setCurrentResults] = useState([])
  const [scores, setScores] = useState({})
  const [processing, setProcessing] = useState(false)

  // Refs — always hold latest values, safe to use inside intervals/callbacks
  const timerRef = useRef(null)
  const pingRef = useRef(null)
  const pollRef = useRef(null)
  const channelRef = useRef(null)
  const submittedRef = useRef(false)
  const scoringRef = useRef(false)
  const meRef = useRef(null)
  const playersRef = useRef([])
  const answersRef = useRef({ Name: '', Place: '', Animal: '', Thing: '' })
  const roomRef = useRef(null)

  useEffect(() => { meRef.current = me }, [me])
  useEffect(() => { playersRef.current = players }, [players])
  useEffect(() => { answersRef.current = answers }, [answers])
  useEffect(() => { roomRef.current = room }, [room])

  useEffect(() => {
    if (!playerId) { nav('/'); return }
    loadRoom()
    return () => cleanup()
  }, [roomId])

  async function loadRoom() {
    try {
      const [r, p] = await Promise.all([getRoom(roomId), getPlayers(roomId)])
      setRoom(r); roomRef.current = r
      setPlayers(p); playersRef.current = p
      const myPlayer = p.find(pl => pl.id === playerId)
      if (!myPlayer) { nav(`/?join=${roomId}`); return }
      setMe(myPlayer); meRef.current = myPlayer
      buildScores(p)
      setLoading(false)
      setupRealtime()
      startPing()

      if (r.status === 'playing') {
        const elapsed = Math.floor((Date.now() - new Date(r.updated_at).getTime()) / 1000)
        const remaining = Math.max(0, ROUND_TIME - elapsed)
        setTimeLeft(remaining)
        if (remaining > 0 && !submittedRef.current) startTimer(remaining)
        else if (remaining <= 0 && !submittedRef.current) doSubmit(answersRef.current, r)
      }
      if (r.status === 'results' || r.status === 'finished') {
        await loadResults(r)
      }
    } catch (e) {
      setError('Room not found: ' + e.message)
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
    clearInterval(pollRef.current)
    if (channelRef.current) supabase?.removeChannel(channelRef.current)
  }

  function startPing() {
    pingRef.current = setInterval(() => { if (playerId) pingPlayer(playerId) }, 15000)
  }

  async function loadResults(r) {
    try {
      const [ans, playerList] = await Promise.all([
        getRoomAnswers(roomId, r.round_number),
        getPlayers(roomId)
      ])
      const resultsFromDB = ans.map(a => {
        const player = playerList.find(p => p.id === a.player_id)
        return {
          playerId: a.player_id,
          playerName: player?.name || 'Unknown',
          avatar: player?.avatar,
          avatarColor: player?.avatar_color,
          answers: { Name: a.name_answer, Place: a.place_answer, Animal: a.animal_answer, Thing: a.thing_answer },
          valid: { Name: a.name_valid, Place: a.place_valid, Animal: a.animal_valid, Thing: a.thing_valid },
          points: { Name: +a.name_points, Place: +a.place_points, Animal: +a.animal_points, Thing: +a.thing_points },
          pointReason: {
            Name:   +a.name_points===1?'unique':+a.name_points===0.5?'shared':a.name_valid?'repeated':'invalid',
            Place:  +a.place_points===1?'unique':+a.place_points===0.5?'shared':a.place_valid?'repeated':'invalid',
            Animal: +a.animal_points===1?'unique':+a.animal_points===0.5?'shared':a.animal_valid?'repeated':'invalid',
            Thing:  +a.thing_points===1?'unique':+a.thing_points===0.5?'shared':a.thing_valid?'repeated':'invalid',
          },
          total: +a.total_points,
        }
      })
      setCurrentResults(resultsFromDB)
      buildScores(playerList)
      setProcessing(false)
      if (r.status === 'finished') { spawnConfetti(); Audio.win() }
    } catch (e) { console.error('loadResults error', e) }
  }

  function setupRealtime() {
    if (!supabase) return
    const ch = supabase.channel(`room:${roomId}`)

    ch.on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
      async payload => {
        const r = payload.new
        setRoom(r); roomRef.current = r

        if (r.status === 'playing') {
          // Non-host players reset and start timer when room goes to playing
          // Host already did this in handleStartGame/handleNextRound
          if (!meRef.current?.is_host) {
            setAnswers({ Name:'',Place:'',Animal:'',Thing:'' })
            answersRef.current = { Name:'',Place:'',Animal:'',Thing:'' }
            setSubmitted(false)
            submittedRef.current = false
            scoringRef.current = false
            setRoundAnswers([])
            setCurrentResults([])
            setProcessing(false)
            clearInterval(timerRef.current)
            Audio.roundStart()
            startTimer(ROUND_TIME)
          }
        }

        if (r.status === 'results' || r.status === 'finished') {
          clearInterval(timerRef.current)
          clearInterval(pollRef.current)
          await loadResults(r)
        }
      }
    )

    ch.on('postgres_changes',
      { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
      async () => {
        const p = await getPlayers(roomId)
        setPlayers(p); playersRef.current = p
        buildScores(p)
        const myP = p.find(pl => pl.id === playerId)
        if (myP) { setMe(myP); meRef.current = myP }
      }
    )

    ch.on('postgres_changes',
      { event: '*', schema: 'public', table: 'round_answers', filter: `room_id=eq.${roomId}` },
      async () => {
        const r = roomRef.current
        if (!r || r.status !== 'playing') return
        const ans = await getRoomAnswers(roomId, r.round_number)
        setRoundAnswers(ans)
      }
    )

    ch.subscribe()
    channelRef.current = ch
  }

  function startTimer(seconds = ROUND_TIME) {
    clearInterval(timerRef.current)
    setTimeLeft(seconds)
    let t = seconds
    timerRef.current = setInterval(() => {
      t--
      setTimeLeft(t)
      if (t <= 10 && t > 0) Audio.urgent()
      if (t <= 0) {
        clearInterval(timerRef.current)
        doSubmit(answersRef.current, roomRef.current)
      }
    }, 1000)
  }

  async function handleSubmit() {
    doSubmit(answersRef.current, roomRef.current)
  }

  async function doSubmit(currentAnswers, currentRoom) {
    if (submittedRef.current) return
    submittedRef.current = true
    setSubmitted(true)
    clearInterval(timerRef.current)

    try {
      const r = currentRoom || await getRoom(roomId)
      if (!r || r.status !== 'playing') return

      await submitAnswer({
        roomId,
        playerId,
        roundNumber: r.round_number,
        letter: r.current_letter,
        answers: currentAnswers,
      })

      // Only the host scores the round
      if (meRef.current?.is_host) {
        startScoringPoller(r)
      }
    } catch (e) {
      console.error('Submit error', e)
      toast('Submit error: ' + e.message, 'var(--danger)')
    }
  }

  // Polls every 1.5s after host submits.
  // Triggers scoring when all submitted OR 8s grace period passes.
  function startScoringPoller(r) {
    if (scoringRef.current) return
    const startedAt = Date.now()
    const GRACE_MS = 8000

    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      if (scoringRef.current) { clearInterval(pollRef.current); return }
      try {
        const ans = await getRoomAnswers(roomId, r.round_number)
        setRoundAnswers(ans)
        const allSubmitted = ans.length >= playersRef.current.length
        const graceExpired = Date.now() - startedAt >= GRACE_MS
        if (allSubmitted || graceExpired) {
          clearInterval(pollRef.current)
          scoreRound(r, ans)
        }
      } catch (e) { console.error('Poll error', e) }
    }, 1500)
  }

  async function scoreRound(r, existingAnswers) {
    if (scoringRef.current) return
    scoringRef.current = true
    setProcessing(true)

    try {
      const allAnswers = existingAnswers || await getRoomAnswers(roomId, r.round_number)
      const playerList = await getPlayers(roomId)

      const validatedAnswers = await Promise.all(
        allAnswers.map(async (a) => {
          const raw = { Name: a.name_answer, Place: a.place_answer, Animal: a.animal_answer, Thing: a.thing_answer }
          const valid = await validateAnswers(r.current_letter, raw)
          return { ...a, name_valid: valid.Name, place_valid: valid.Place, animal_valid: valid.Animal, thing_valid: valid.Thing }
        })
      )

      const letterHistory = r.letter_history || []
      const scored = calculateRoundPoints(validatedAnswers, r.current_letter, letterHistory)

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

      const histEntry = buildLetterHistoryEntry(r.current_letter, scored)
      const newHistory = [...(r.letter_history || []), histEntry]
      const winner = Object.entries(newScores).find(([, sc]) => sc >= r.target_score)

      // Update room status — triggers loadResults() for ALL players via realtime
      await updateRoom(roomId, {
        status: winner ? 'finished' : 'results',
        letter_history: newHistory,
      })

      if (winner) {
        const winnerPlayer = playerList.find(p => p.id === winner[0])
        await sendRoomEvent(roomId, 'game_winner', { playerId: winner[0], playerName: winnerPlayer?.name })
      }

      // Host loads results directly (don't wait for their own realtime echo)
      const freshRoom = { ...r, status: winner ? 'finished' : 'results', letter_history: newHistory }
      await loadResults(freshRoom)

    } catch (e) {
      console.error('Score error', e)
      scoringRef.current = false
      setProcessing(false)
      toast('Scoring error: ' + e.message, 'var(--danger)')
    }
  }

  async function handleStartGame() {
    const letter = getRandomLetter(room.used_letters || [])
    const usedLetters = [...(room.used_letters || []), letter]
    const updates = { status:'playing', current_letter:letter, round_number:(room.round_number||0)+1, used_letters:usedLetters }
    await updateRoom(roomId, updates)
    const newRoom = { ...room, ...updates }
    setRoom(newRoom); roomRef.current = newRoom
    setAnswers({ Name:'',Place:'',Animal:'',Thing:'' }); answersRef.current = { Name:'',Place:'',Animal:'',Thing:'' }
    setSubmitted(false); submittedRef.current = false; scoringRef.current = false
    setCurrentResults([]); setRoundAnswers([])
    Audio.roundStart(); startTimer(ROUND_TIME)
  }

  async function handleNextRound() {
    const letter = getRandomLetter(room.used_letters || [])
    const usedLetters = [...(room.used_letters || []), letter]
    const updates = { status:'playing', current_letter:letter, round_number:(room.round_number||0)+1, used_letters:usedLetters }
    await updateRoom(roomId, updates)
    const newRoom = { ...room, ...updates }
    setRoom(newRoom); roomRef.current = newRoom
    setAnswers({ Name:'',Place:'',Animal:'',Thing:'' }); answersRef.current = { Name:'',Place:'',Animal:'',Thing:'' }
    setSubmitted(false); submittedRef.current = false; scoringRef.current = false
    setCurrentResults([]); setRoundAnswers([])
    clearInterval(pollRef.current)
    Audio.roundStart(); startTimer(ROUND_TIME)
  }

  async function handlePlayAgain() {
    scoringRef.current = false
    const pList = await getPlayers(roomId)
    for (const p of pList) await updatePlayerScore(p.id, 0)
    await updateRoom(roomId, { status:'lobby', round_number:0, current_letter:null, used_letters:[], letter_history:[] })
    setCurrentResults([]); setRoundAnswers([])
    setAnswers({ Name:'',Place:'',Animal:'',Thing:'' }); answersRef.current = { Name:'',Place:'',Animal:'',Thing:'' }
    submittedRef.current = false; setSubmitted(false)
    buildScores(pList.map(p => ({ ...p, score: 0 })))
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
  const showProcessing = submitted && processing && currentResults.length === 0

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
        <Lobby room={room} players={players} me={me} shareUrl={shareUrl} onStart={handleStartGame} />
      )}

      {status === 'playing' && !showProcessing && currentResults.length === 0 && (
        <Playing
          room={room} players={players} me={me}
          answers={answers}
          setAnswers={val => { setAnswers(val); answersRef.current = val }}
          timeLeft={timeLeft} submitted={submitted}
          roundAnswers={roundAnswers} scores={scores}
          onSubmit={handleSubmit}
        />
      )}

      {showProcessing && (
        <div className="card text-center" style={{ padding: '48px 24px' }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>🤖</div>
          <div className="font-display" style={{ fontSize: '1.5rem', color: 'var(--primary-light)', marginBottom: 8 }}>
            Validating Answers...
          </div>
          <p className="text-muted text-sm">Claude AI is checking all words. Hang on!</p>
        </div>
      )}

      {(status === 'results' || status === 'finished') && currentResults.length === 0 && (
        <div className="card text-center" style={{ padding: '48px 24px' }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>⏳</div>
          <div className="font-display" style={{ fontSize: '1.5rem', color: 'var(--primary-light)', marginBottom: 8 }}>
            Loading Results...
          </div>
          <p className="text-muted text-sm">Scores are ready — fetching them now!</p>
        </div>
      )}

      {(status === 'results') && currentResults.length > 0 && (
        <Results
          room={room} players={players} me={me}
          results={currentResults} scores={scores}
          processing={false} isHost={me.is_host}
          onNext={handleNextRound}
        />
      )}

      {status === 'finished' && currentResults.length > 0 && (
        <>
          <Results
            room={room} players={players} me={me}
            results={currentResults} scores={scores}
            processing={false} isHost={false}
            onNext={null}
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
