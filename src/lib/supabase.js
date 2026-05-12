import { createClient } from '@supabase/supabase-js'

// These are safe to expose publicly — they are anon/public keys
// Row Level Security protects your data server-side
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 20 } }
    })
  : null

export const isConfigured = () => !!supabase

// ─── SQL to run in Supabase SQL Editor ───────────────────────────────────────
// (Shown in Setup screen when not configured)
export const SETUP_SQL = `
-- Enable UUID generation
create extension if not exists "pgcrypto";

-- Rooms table
create table if not exists rooms (
  id text primary key default upper(substring(gen_random_uuid()::text, 1, 6)),
  host_id text not null,
  target_score int not null default 50,
  room_type text not null default 'private', -- private | world
  status text not null default 'lobby',      -- lobby | playing | finished
  current_letter text,
  round_number int not null default 0,
  used_letters text[] not null default '{}',
  letter_history jsonb not null default '[]',
  settings jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Players table
create table if not exists players (
  id text primary key,
  room_id text references rooms(id) on delete cascade,
  name text not null,
  avatar text not null default '🦊',
  avatar_color text not null default '#6C3CE1',
  is_host boolean not null default false,
  score numeric not null default 0,
  is_online boolean not null default true,
  last_seen timestamptz default now(),
  created_at timestamptz default now()
);

-- Round answers table
create table if not exists round_answers (
  id uuid primary key default gen_random_uuid(),
  room_id text references rooms(id) on delete cascade,
  player_id text references players(id) on delete cascade,
  round_number int not null,
  letter text not null,
  name_answer text default '',
  place_answer text default '',
  animal_answer text default '',
  thing_answer text default '',
  name_valid boolean,
  place_valid boolean,
  animal_valid boolean,
  thing_valid boolean,
  name_points numeric default 0,
  place_points numeric default 0,
  animal_points numeric default 0,
  thing_points numeric default 0,
  total_points numeric default 0,
  submitted_at timestamptz default now()
);

-- Room events (for real-time chat/notifications)
create table if not exists room_events (
  id uuid primary key default gen_random_uuid(),
  room_id text references rooms(id) on delete cascade,
  event_type text not null,
  payload jsonb default '{}',
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_players_room on players(room_id);
create index if not exists idx_answers_room_round on round_answers(room_id, round_number);
create index if not exists idx_events_room on room_events(room_id);
create index if not exists idx_rooms_type_status on rooms(room_type, status);

-- Enable Realtime
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table round_answers;
alter publication supabase_realtime add table room_events;

-- CRITICAL: Set REPLICA IDENTITY FULL so UPDATE events broadcast old+new row
-- Without this, only INSERT events work reliably with Supabase Realtime
alter table rooms enable row level security;
alter table players enable row level security;
alter table round_answers enable row level security;
alter table room_events enable row level security;

alter table round_answers replica identity full;
alter table rooms replica identity full;
alter table players replica identity full;

-- RLS Policies (allow anonymous access for the game)
create policy "Public rooms" on rooms for all using (true) with check (true);
create policy "Public players" on players for all using (true) with check (true);
create policy "Public answers" on round_answers for all using (true) with check (true);
create policy "Public events" on room_events for all using (true) with check (true);
`

// ─── DB helpers ──────────────────────────────────────────────────────────────
export async function createRoom({ hostId, targetScore, roomType }) {
  const { data, error } = await supabase
    .from('rooms')
    .insert({ host_id: hostId, target_score: targetScore, room_type: roomType })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getRoom(roomId) {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single()
  if (error) throw error
  return data
}

export async function updateRoom(roomId, updates) {
  const { error } = await supabase
    .from('rooms')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', roomId)
  if (error) throw error
}

export async function joinPlayer({ id, roomId, name, avatar, avatarColor, isHost }) {
  const { error } = await supabase
    .from('players')
    .upsert({
      id,
      room_id: roomId,
      name,
      avatar,
      avatar_color: avatarColor,
      is_host: isHost,
      is_online: true,
      last_seen: new Date().toISOString()
    })
  if (error) throw error
}

export async function getPlayers(roomId) {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function getRoomAnswers(roomId, roundNumber) {
  const { data, error } = await supabase
    .from('round_answers')
    .select('*')
    .eq('room_id', roomId)
    .eq('round_number', roundNumber)
  if (error) throw error
  return data
}

export async function submitAnswer({ roomId, playerId, roundNumber, letter, answers }) {
  // Delete any existing answer first (re-submit case), then insert fresh
  // This ensures realtime INSERT fires reliably for all listeners
  await supabase
    .from('round_answers')
    .delete()
    .eq('room_id', roomId)
    .eq('player_id', playerId)
    .eq('round_number', roundNumber)

  const { error } = await supabase
    .from('round_answers')
    .insert({
      room_id: roomId,
      player_id: playerId,
      round_number: roundNumber,
      letter,
      name_answer: answers.Name || '',
      place_answer: answers.Place || '',
      animal_answer: answers.Animal || '',
      thing_answer: answers.Thing || '',
    })
  if (error) throw error
}

export async function updateAnswerScores(answerId, scores) {
  const { error } = await supabase
    .from('round_answers')
    .update(scores)
    .eq('id', answerId)
  if (error) throw error
}

export async function updatePlayerScore(playerId, score) {
  const { error } = await supabase
    .from('players')
    .update({ score })
    .eq('id', playerId)
  if (error) throw error
}

export async function sendRoomEvent(roomId, eventType, payload = {}) {
  const { error } = await supabase
    .from('room_events')
    .insert({ room_id: roomId, event_type: eventType, payload })
  if (error) console.error('Event error', error)
}

export async function pingPlayer(playerId) {
  await supabase
    .from('players')
    .update({ is_online: true, last_seen: new Date().toISOString() })
    .eq('id', playerId)
}

export async function getWorldRooms() {
  const { data, error } = await supabase
    .from('rooms')
    .select('id, status, target_score')
    .eq('room_type', 'world')
    .eq('status', 'lobby')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return data || []
}
