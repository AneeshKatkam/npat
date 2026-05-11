# 🌍 Name. Place. Animal. Thing. — Multiplayer

A real-time multiplayer word game built with React + Supabase. Supports hundreds of simultaneous game rooms.

## ✨ Features

- **Real-time multiplayer** — share a link, friends join instantly from any device
- **Private rooms** — 6-character room codes
- **World rooms** — play with random strangers
- **AI word validation** — Claude validates every answer
- **Full scoring rules**:
  - ✅ Unique correct answer = 1 point
  - ½ Same word as another player = ½ point  
  - 🔁 Word repeated from a prior same-letter round = 0 points
  - ❌ Invalid/wrong-letter word = 0 points
- **Avatars** — 20 animal avatars with color rings
- **Sound effects** — tick, success, fail, win sounds
- **Confetti** — celebrate big scores and wins
- **Leaderboard** — live score tracking with progress bars

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set up Supabase (free)
1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the SQL from `src/lib/supabase.js` (the `SETUP_SQL` export)
3. Copy your Project URL and anon key from **Settings → API**

### 3. Configure environment
Create a `.env` file in the project root:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Run locally
```bash
npm run dev
```

### 5. Build for production
```bash
npm run build
```

## 🌐 Deploy (Free)

### Vercel (recommended)
1. Push to GitHub
2. Import repo at [vercel.com](https://vercel.com)
3. Add environment variables in project settings
4. Deploy — you get a free `.vercel.app` URL!

### Netlify
1. Connect GitHub repo at [netlify.com](https://netlify.com)  
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Add env vars in Site Settings → Environment

## 🎮 How to Play

1. **Create a room** → set target score → share the link/code
2. **Everyone joins** → host clicks Start Game
3. **A random letter is drawn** → 45 seconds to fill in:
   - 👤 **Name** — a person's name starting with the letter
   - 🗺️ **Place** — a city, country, or region
   - 🐾 **Animal** — any real animal species
   - 🔧 **Thing** — any real physical object
4. **Answers validated by Claude AI** → scored automatically
5. **First to reach target score wins!**

## 🏗️ Architecture

```
React (Vite) Frontend
  │
  ├── Supabase Realtime (WebSockets)
  │     ├── rooms table — game state
  │     ├── players table — player profiles + scores
  │     ├── round_answers — answers per round
  │     └── room_events — notifications/events
  │
  └── Anthropic Claude API — word validation
```

**Scalability**: Each game room uses its own Supabase channel. The free tier supports 500 concurrent connections (250+ simultaneous games). Upgrade for larger scale — Supabase Pro supports 10k+ connections.

## 📁 Project Structure

```
src/
├── pages/
│   ├── Home.jsx      — create/join room landing page
│   ├── Room.jsx      — main game orchestrator
│   └── Setup.jsx     — Supabase setup guide
├── components/
│   ├── Lobby.jsx     — waiting room + share links
│   ├── Playing.jsx   — active round (timer + answers)
│   ├── Scoring.jsx   — loading state during validation
│   ├── Results.jsx   — round results + leaderboard
│   └── Winner.jsx    — game over + final standings
├── lib/
│   ├── supabase.js   — DB client + all queries + SQL
│   └── game.js       — scoring logic, audio, utilities
└── index.css         — full design system
```

## ⚙️ Game Configuration

- **Target score**: 10–200 points (set when creating room)
- **Round time**: 45 seconds per round
- **Max players**: Unlimited (Supabase handles it)
- **Letters**: A–W excluding Q, U, V, X, Y, Z (common letters only)
