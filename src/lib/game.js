export const AVATARS = ['🦊','🐯','🦁','🐸','🦄','🐺','🐼','🦅','🐙','🦋','🐬','🦓','🐉','🦝','🦜','🦘','🦏','🦚','🐻','🦩']
export const AVATAR_COLORS = [
  '#6C3CE1','#E14C3C','#3CA5E1','#10B981','#F59E0B',
  '#E91E8C','#00BCD4','#9C27B0','#FF5722','#607D8B'
]
export const CATEGORIES = ['Name', 'Place', 'Animal', 'Thing']
export const CAT_ICONS = { Name: '👤', Place: '🗺️', Animal: '🐾', Thing: '🔧' }
export const ALPHABET = 'ABCDEFGHIJKLMNOPRSTW'
export const ROUND_TIME = 45

export function generatePlayerId() {
  return 'p_' + Math.random().toString(36).slice(2, 12)
}

export function getRandomLetter(avoid = []) {
  const available = ALPHABET.split('').filter(l => !avoid.includes(l))
  const pool = available.length > 0 ? available : ALPHABET.split('')
  return pool[Math.floor(Math.random() * pool.length)]
}

export function getRankIcon(rank) {
  if (rank === 0) return '🥇'
  if (rank === 1) return '🥈'
  if (rank === 2) return '🥉'
  return `#${rank + 1}`
}

// Calculate points for a round
// allAnswers: [{playerId, answers, valid}]
// letterHistory: previous rounds' used words
export function calculateRoundPoints(allAnswers, letter, letterHistory) {
  const prevRoundsForLetter = letterHistory.filter(h => h.letter === letter)

  const scored = allAnswers.map(pa => ({
    ...pa,
    points: { Name: 0, Place: 0, Animal: 0, Thing: 0 },
    pointReason: { Name: '', Place: '', Animal: '', Thing: '' },
    total: 0,
  }))

  for (const cat of CATEGORIES) {
    const catKey = cat.toLowerCase() + '_answer'
    const validKey = cat.toLowerCase() + '_valid'

    // Gather all valid answers this round
    const wordCounts = {}
    for (const pa of scored) {
      if (!pa[validKey]) continue
      const word = (pa[catKey] || '').trim().toLowerCase()
      if (!word) continue
      wordCounts[word] = (wordCounts[word] || 0) + 1
    }

    for (const pa of scored) {
      if (!pa[validKey]) {
        pa.pointReason[cat] = 'invalid'
        continue
      }
      const word = (pa[catKey] || '').trim().toLowerCase()
      if (!word) {
        pa.pointReason[cat] = 'empty'
        continue
      }

      // Check if word was used in previous rounds with same letter
      const usedBefore = prevRoundsForLetter.some(h =>
        (h.usedWords?.[cat] || []).map(w => w.toLowerCase()).includes(word)
      )
      if (usedBefore) {
        pa.points[cat] = 0
        pa.pointReason[cat] = 'repeated'
      } else {
        const count = wordCounts[word] || 1
        pa.points[cat] = count > 1 ? 0.5 : 1
        pa.pointReason[cat] = count > 1 ? 'shared' : 'unique'
      }
    }
  }

  for (const pa of scored) {
    pa.total = Object.values(pa.points).reduce((a, b) => a + b, 0)
  }
  return scored
}

// Build the letter history entry
export function buildLetterHistoryEntry(letter, scored) {
  const usedWords = {}
  for (const cat of CATEGORIES) {
    const catKey = cat.toLowerCase() + '_answer'
    const validKey = cat.toLowerCase() + '_valid'
    usedWords[cat] = scored
      .filter(s => s[validKey] && (s[catKey] || '').trim())
      .map(s => (s[catKey] || '').trim())
  }
  return { letter, usedWords }
}

// ─── Audio ────────────────────────────────────────────────────────────────────
let _ctx = null
function getCtx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)()
  return _ctx
}
function tone(freq, dur, type = 'sine', vol = 0.25) {
  try {
    const c = getCtx()
    const o = c.createOscillator()
    const g = c.createGain()
    o.connect(g); g.connect(c.destination)
    o.type = type; o.frequency.value = freq
    g.gain.setValueAtTime(vol, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur)
    o.start(); o.stop(c.currentTime + dur)
  } catch {}
}

export const Audio = {
  roundStart() { [300,400,600,800].forEach((f,i) => setTimeout(() => tone(f,0.15,'sine',0.28), i*90)) },
  tick() { tone(880, 0.04, 'square', 0.08) },
  urgent() { tone(660, 0.06, 'square', 0.15) },
  success() { [523,659,784,1047].forEach((f,i) => setTimeout(() => tone(f,0.2,'sine',0.22), i*75)) },
  half() { [440,554].forEach((f,i) => setTimeout(() => tone(f,0.18,'triangle',0.18), i*90)) },
  zero() { tone(180, 0.4, 'sawtooth', 0.18) },
  win() { [523,659,784,659,784,1047,1047,1319].forEach((f,i) => setTimeout(() => tone(f,0.22,'sine',0.28), i*110)) },
  join() { [440,660].forEach((f,i) => setTimeout(() => tone(f,0.15,'sine',0.2), i*80)) },
}

// ─── Confetti ─────────────────────────────────────────────────────────────────
export function spawnConfetti(count = 70) {
  const colors = ['#8B5CF6','#F59E0B','#10B981','#EF4444','#3B82F6','#EC4899','#FFD700']
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const el = document.createElement('div')
      el.className = 'confetti-piece'
      const size = 6 + Math.random() * 8
      el.style.cssText = `
        left:${Math.random()*100}vw; top:-30px;
        width:${size}px; height:${size}px;
        background:${colors[Math.floor(Math.random()*colors.length)]};
        transform:rotate(${Math.random()*360}deg);
        animation-duration:${1.8+Math.random()*2}s;
        animation-delay:${Math.random()*0.6}s;
      `
      document.body.appendChild(el)
      setTimeout(() => el.remove(), 3500)
    }, i * 25)
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────
export function toast(msg, color = 'var(--accent)') {
  const old = document.getElementById('_toast')
  if (old) { clearTimeout(old._t); old.remove() }
  const el = document.createElement('div')
  el.id = '_toast'
  el.className = 'toast'
  el.style.borderColor = color
  el.innerHTML = msg
  document.body.appendChild(el)
  el._t = setTimeout(() => el.remove(), 3200)
}

// ─── Clipboard ────────────────────────────────────────────────────────────────
export function copyText(text) {
  navigator.clipboard?.writeText(text).catch(() => {})
}

// ─── Local storage ───────────────────────────────────────────────────────────
export const LS = {
  get: (k, def = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def } catch { return def } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} },
}

// ─── Claude validation ────────────────────────────────────────────────────────
export async function validateAnswers(letter, answers) {
  try {
    const filled = CATEGORIES.filter(c => (answers[c] || '').trim())
    if (!filled.length) return { Name: false, Place: false, Animal: false, Thing: false }

    const ltr = letter.toUpperCase()
    const prompt = `You are a STRICT judge for the word game "Name, Place, Animal, Thing". Be tough — when in doubt, mark false.

The letter is: "${ltr}"
Answers submitted:
  Name  = "${answers.Name  || ''}"
  Place = "${answers.Place || ''}"
  Animal= "${answers.Animal|| ''}"
  Thing = "${answers.Thing || ''}"

RULES — apply ALL of these:

1. STARTS WITH LETTER: The answer must start with "${ltr}" (case-insensitive). If it does not, mark false immediately.

2. NAME — must be a real, widely-known human first name OR surname (e.g. Alice, Gandhi, Obama).
   ❌ REJECT: made-up names, place names used as names, common nouns, abstract words.

3. PLACE — must be a real, verifiable geographic location: country, capital city, major city, well-known state/province, famous landmark (e.g. Egypt, Edinburgh, Eiffel Tower).
   ❌ REJECT: made-up places (e.g. "Estopia", "Erewhon"), fictional locations, vague words, common nouns.

4. ANIMAL — must be a real animal species or well-known common name (e.g. Elephant, Eel, Eagle).
   ❌ REJECT: fictional creatures, general words, food items that are also animals unless clearly an animal name.

5. THING — must be a TANGIBLE, PHYSICAL object that you can touch and hold or see in the real world (e.g. Eraser, Engine, Envelope).
   ❌ REJECT: abstract concepts (e.g. "End", "Emotion", "Energy"), feelings, ideas, actions, verbs used as nouns, intangible things.

6. MINIMUM LENGTH: Any answer under 2 characters = false.

7. NOT GIBBERISH: Must be a real English word or proper noun, not random letters.

Examples of correct judgments:
  Letter E: Name="Eesha"→true, Place="Estopia"→FALSE (not real), Animal="Eel"→true, Thing="End"→FALSE (abstract)
  Letter G: Name="Gandhi"→true, Place="Germany"→true, Animal="Gorilla"→true, Thing="Goods"→true
  Letter A: Name="Alice"→true, Place="Austria"→true, Animal="Ant"→true, Thing="Ambition"→FALSE (abstract)

Respond ONLY with a JSON object, no explanation, no markdown:
{"Name":true/false,"Place":true/false,"Animal":true/false,"Thing":true/false}`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }]
      })
    })
    const data = await res.json()
    const text = (data.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim()
    const result = JSON.parse(text)

    // Extra safety: if answer is empty, always false regardless of model response
    for (const cat of CATEGORIES) {
      if (!(answers[cat] || '').trim()) result[cat] = false
      // Double-check letter starts with (model sometimes hallucinates)
      const w = (answers[cat] || '').trim()
      if (w && w[0].toUpperCase() !== ltr) result[cat] = false
    }
    return result

  } catch (e) {
    console.error('Validation error', e)
    // Fallback: simple starts-with + min length check only
    const ltr = letter.toUpperCase()
    const result = {}
    for (const cat of CATEGORIES) {
      const w = (answers[cat] || '').trim()
      result[cat] = w.length >= 2 && w[0].toUpperCase() === ltr
    }
    return result
  }
}
