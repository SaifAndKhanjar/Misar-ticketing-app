import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { networkInterfaces } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3001;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'saif';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: FRONTEND_ORIGIN } });

app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

const TOKEN_EXPIRY = '24h';

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

app.get('/api/health', (req, res) => res.status(200).json({ ok: true }));

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    res.json({ ok: true, token });
  } else {
    res.status(401).json({ error: 'Incorrect password' });
  }
});

let queue = [];
let currentStartedAt = null;
let queueOpen = true;

const MINS_PER_MISAR = 3;
const QUEUE_TICK_MS = 60_000;

function round1(n) {
  return Math.round(n * 10) / 10;
}

function getQueueState() {
  const now = Date.now();
  const elapsed = queue.length > 0 && currentStartedAt
    ? Math.floor((now - currentStartedAt) / 60000)
    : 0;
  let cumulative = 0;
  const customers = queue.map((c, i) => {
    const baseWait = cumulative;
    cumulative += c.misars * MINS_PER_MISAR;
    const waitBefore = i === 0 ? 0 : Math.max(0, baseWait - elapsed);
    return { ...c, position: i + 1, waitBefore };
  });
  const totalFullWait = cumulative;
  const totalWait = Math.max(0, totalFullWait - elapsed);
  return { customers, totalWait, queueOpen };
}

async function loadQueueFromSupabase() {
  if (!supabase) return;
  const [queueRes, metaRes] = await Promise.all([
    supabase.from('queue').select('id, name, phone, misars, joined_at').order('id', { ascending: true }),
    supabase.from('queue_meta').select('current_started_at, queue_open').eq('id', 1).single()
  ]);
  if (queueRes.data) queue = queueRes.data.map(r => ({ id: r.id, name: r.name, phone: r.phone, misars: r.misars, joinedAt: r.joined_at }));
  if (metaRes.data?.current_started_at != null) currentStartedAt = metaRes.data.current_started_at;
  if (metaRes.data?.queue_open !== undefined) queueOpen = metaRes.data.queue_open;
}

async function saveMetaToSupabase() {
  if (!supabase) return;
  const { error } = await supabase
    .from('queue_meta')
    .update({ current_started_at: currentStartedAt, queue_open: queueOpen })
    .eq('id', 1);
  if (error) {
    console.warn('Supabase queue_meta update failed:', error.message);
  }
}

setInterval(() => {
  if (queue.length > 0) {
    io.emit('queue:update', getQueueState());
  }
}, QUEUE_TICK_MS);

app.get('/api/queue', (req, res) => res.json(getQueueState()));

function validateJoinBody(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  let misars = parseInt(body.misars, 10);
  if (Number.isNaN(misars) || misars < 1) misars = 1;
  if (misars > 10) misars = 10;

  if (!name || name.length > 100) {
    return { error: 'Invalid name', status: 400 };
  }
  if (!phone || phone.length > 20) {
    return { error: 'Invalid phone', status: 400 };
  }
  return { name, phone, misars };
}

app.post('/api/join', async (req, res) => {
  if (!queueOpen) {
    return res.status(403).json({ error: 'Queue is currently closed. Please try again later.' });
  }
  const validated = validateJoinBody(req.body);
  if (validated.error) {
    return res.status(validated.status || 400).json({ error: validated.error });
  }
  const { name, phone, misars } = validated;
  const joinedAt = Date.now();

  if (supabase) {
    const { data: row, error } = await supabase.from('queue').insert({ name, phone, misars, joined_at: joinedAt }).select('id, name, phone, misars, joined_at').single();
    if (error) {
      console.error('Supabase queue insert failed:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      const suffix = process.env.NODE_ENV === 'production' ? '' : ` (${error.message})`;
      return res.status(500).json({ error: `Failed to join queue${suffix}` });
    }
    // Fire-and-forget: keep a deduped directory of customers (unique by phone).
    void (async () => {
      const { data: existing, error: selErr } = await supabase
        .from('queue_customers')
        .select('phone, join_count, first_seen_at')
        .eq('phone', row.phone)
        .maybeSingle();
      if (selErr) {
        console.warn('queue_customers select failed:', selErr.message);
        return;
      }
      if (!existing) {
        const { error: insErr } = await supabase.from('queue_customers').insert({
          phone: row.phone,
          name: row.name,
          first_seen_at: joinedAt,
          last_seen_at: joinedAt,
          join_count: 1
        });
        if (insErr) console.warn('queue_customers insert failed:', insErr.message);
        return;
      }
      const { error: updErr } = await supabase
        .from('queue_customers')
        .update({
          name: row.name,
          last_seen_at: joinedAt,
          join_count: (existing.join_count || 0) + 1
        })
        .eq('phone', row.phone);
      if (updErr) console.warn('queue_customers update failed:', updErr.message);
    })();
    // Fire-and-forget (do not await): Supabase v2 builders aren't real Promises (no .catch()).
    void (async () => {
      const { error: joinErr } = await supabase
        .from('queue_joins')
        .insert({ name: row.name, phone: row.phone, misars: row.misars, joined_at: joinedAt, queue_ticket_id: row.id });
      if (joinErr) {
        console.warn('queue_joins insert failed:', joinErr.message);
      }
    })();
    const ticket = { id: row.id, name: row.name, phone: row.phone, misars: row.misars, joinedAt: row.joined_at };
    if (queue.length === 0) {
      currentStartedAt = joinedAt;
      await saveMetaToSupabase();
    }
    queue.push(ticket);
    const state = getQueueState();
    io.emit('queue:update', state);
    return res.json(state.customers.find(c => c.id === ticket.id));
  }

  const nextId = queue.length === 0 ? 1 : Math.max(...queue.map(c => c.id), 0) + 1;
  const ticket = { id: nextId, name, phone, misars, joinedAt };
  if (queue.length === 0) currentStartedAt = joinedAt;
  queue.push(ticket);
  const state = getQueueState();
  io.emit('queue:update', state);
  res.json(state.customers.find(c => c.id === ticket.id));
});

app.post('/api/queue/toggle', authMiddleware, async (req, res) => {
  queueOpen = !queueOpen;
  if (supabase) await saveMetaToSupabase();
  io.emit('queue:update', getQueueState());
  res.json({ queueOpen });
});

app.delete('/api/queue/:id/done', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  const isFront = queue.length > 0 && queue[0].id === id;
  const doneTicket = queue.find(c => c.id === id);
  const startedAtForTicket = isFront ? currentStartedAt : null;
  const endedAtForTicket = Date.now();
  if (supabase) {
    const { error } = await supabase.from('queue').delete().eq('id', id);
    if (error) return res.status(500).json({ error: 'Failed to update queue' });
  }
  queue = queue.filter(c => c.id !== id);
  if (supabase && isFront && doneTicket && startedAtForTicket) {
    const actualMinutes = round1((endedAtForTicket - startedAtForTicket) / 60000);
    const expectedMinutes = doneTicket.misars * MINS_PER_MISAR;
    const minutesPerMisar = round1(actualMinutes / Math.max(1, doneTicket.misars));
    void (async () => {
      const { error: metricErr } = await supabase.from('queue_service_metrics').insert({
        queue_ticket_id: doneTicket.id,
        name: doneTicket.name,
        phone: doneTicket.phone,
        misars: doneTicket.misars,
        started_at: startedAtForTicket,
        ended_at: endedAtForTicket,
        actual_minutes: actualMinutes,
        expected_minutes: expectedMinutes,
        minutes_per_misar: minutesPerMisar
      });
      if (metricErr) console.warn('queue_service_metrics insert failed:', metricErr.message);
    })();
  }
  if (isFront) {
    currentStartedAt = queue.length > 0 ? Date.now() : null;
    if (supabase) await saveMetaToSupabase();
  }
  io.emit('queue:update', getQueueState());
  res.json({ ok: true });
});

app.delete('/api/queue/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  const isFront = queue.length > 0 && queue[0].id === id;
  if (supabase) {
    const { error } = await supabase.from('queue').delete().eq('id', id);
    if (error) return res.status(500).json({ error: 'Failed to update queue' });
  }
  queue = queue.filter(c => c.id !== id);
  if (isFront) {
    currentStartedAt = queue.length > 0 ? Date.now() : null;
    if (supabase) await saveMetaToSupabase();
  }
  io.emit('queue:update', getQueueState());
  res.json({ ok: true });
});

const SERVER_INFO_CACHE_MS = 45_000; // 45s
let serverInfoCache = null;
let serverInfoCacheAt = 0;

app.get('/api/server-info', authMiddleware, (req, res) => {
  const now = Date.now();
  if (serverInfoCache && now - serverInfoCacheAt < SERVER_INFO_CACHE_MS) {
    return res.json(serverInfoCache);
  }
  const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL;
  let payload;
  if (baseUrl) {
    const url = baseUrl.replace(/\/$/, '');
    payload = { ip: url, port: PORT, joinUrl: `${url}/join` };
  } else {
    const nets = networkInterfaces();
    let ip = 'localhost';
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) { ip = net.address; break; }
      }
      if (ip !== 'localhost') break;
    }
    payload = { ip, port: PORT, joinUrl: `http://${ip}:${PORT}/join` };
  }
  serverInfoCache = payload;
  serverInfoCacheAt = now;
  res.json(payload);
});

// SPA fallback (Express 5 / path-to-regexp doesn't accept bare '*')
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'), (err) => {
    if (err) res.send('Worker is running. Use Vite dev server for UI.');
  });
});

async function start() {
  if (supabase) {
    try {
      await loadQueueFromSupabase();
      console.log('Queue loaded from Supabase');
    } catch (err) {
      console.warn('Supabase load failed, starting with empty queue:', err.message);
    }
  }
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server on ${PORT}${supabase ? ' (Supabase enabled)' : ''}`);
  });
}

start();
