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

// ─── Claude batch validation ─────────────────────────────────────────────────
// Validates ALL unique words across ALL players in ONE API call.
// This guarantees consistency — the same word is never valid for one player
// and invalid for another.
//
// allAnswers: array of player answer objects from DB
// letter: the current round letter
// Returns: Map of "category:word_lowercase" → true/false
export async function validateAllAnswers(letter, allAnswers) {
  const ltr = letter.toUpperCase()

  // Collect unique non-empty words per category across all players
  const wordSets = { Name: new Set(), Place: new Set(), Animal: new Set(), Thing: new Set() }
  for (const a of allAnswers) {
    const map = { Name: a.name_answer, Place: a.place_answer, Animal: a.animal_answer, Thing: a.thing_answer }
    for (const cat of CATEGORIES) {
      const w = (map[cat] || '').trim()
      if (w.length >= 2) wordSets[cat].add(w)
    }
  }

  // Build flat list of unique words to validate
  const toValidate = []
  for (const cat of CATEGORIES) {
    for (const w of wordSets[cat]) {
      toValidate.push({ cat, word: w })
    }
  }

  // Result map: "Cat:word_lower" → boolean
  const resultMap = {}

  // Pre-fill with false for all
  toValidate.forEach(({ cat, word }) => {
    // Immediate false if doesn't start with letter
    if (word[0].toUpperCase() !== ltr) {
      resultMap[`${cat}:${word.toLowerCase()}`] = false
    }
  })

  const needsValidation = toValidate.filter(({ cat, word }) =>
    resultMap[`${cat}:${word.toLowerCase()}`] === undefined
  )

  if (needsValidation.length === 0) return resultMap

  // Build a single prompt listing all unique words
  const wordList = needsValidation.map(({ cat, word }, i) =>
    `${i + 1}. [${cat}] "${word}"`
  ).join('\n')

  const prompt = `You are a fair judge for the word game "Name, Place, Animal, Thing". Letter: "${ltr}"

Validate each word below. Return a JSON array of true/false in the SAME ORDER as the list.

RULES:
- Must start with "${ltr}" (case-insensitive)
- NAME: real human first name or surname from ANY country/culture (Chethana, Carlos, Chen → all valid)
- PLACE: real geographic location — country, city, state, river, mountain, landmark (China, Chennai, Cairo → valid; made-up places like "Estopia" → false)
- ANIMAL: real animal species or common name (Cat, Cobra, Crab → valid)
- THING: must be a PHYSICAL, TANGIBLE object you can touch (Chair, Cup, Coin → valid). REJECT abstract words, concepts, emotions, actions (Courage, Chaos, End, Energy → all false)
- Be generous for Names, Places, Animals. Be strict only for Things.

Words to validate:
${wordList}

Respond ONLY with a JSON array of true/false values matching the order above. Example: [true, false, true]`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }]
      })
    })
    const data = await res.json()
    const text = (data.content?.[0]?.text || '[]').replace(/```json|```/g, '').trim()
    const results = JSON.parse(text)

    needsValidation.forEach(({ cat, word }, i) => {
      resultMap[`${cat}:${word.toLowerCase()}`] = !!results[i]
    })
  } catch(e) {
    console.error('Batch validation error', e)
    // Fallback: simple starts-with check
    needsValidation.forEach(({ cat, word }) => {
      resultMap[`${cat}:${word.toLowerCase()}`] = word[0].toUpperCase() === ltr
    })
  }

  return resultMap
}

// Legacy single-answer validator (kept for compatibility, uses batch internally)
export async function validateAnswers(letter, answers) {
  const resultMap = await validateAllAnswers(letter, [{
    name_answer: answers.Name || '',
    place_answer: answers.Place || '',
    animal_answer: answers.Animal || '',
    thing_answer: answers.Thing || '',
  }])
  return {
    Name:   resultMap[`Name:${(answers.Name||'').trim().toLowerCase()}`]   ?? false,
    Place:  resultMap[`Place:${(answers.Place||'').trim().toLowerCase()}`]  ?? false,
    Animal: resultMap[`Animal:${(answers.Animal||'').trim().toLowerCase()}`] ?? false,
    Thing:  resultMap[`Thing:${(answers.Thing||'').trim().toLowerCase()}`]  ?? false,
  }
}
