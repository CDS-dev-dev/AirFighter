/**
 * AirFighter Multiplayer Server
 * Cloudflare Workers + Durable Objects
 *
 * Architecture:
 *   Worker (index.ts)  — HTTP/WS entry, matchmaking queue
 *   GameRoom (room.ts) — Durable Object, one per active room, relays state between players
 */

import { GameRoom } from './room'
export { GameRoom }

export interface Env {
  ROOMS: DurableObjectNamespace
}

// Simple in-memory waiting queue (per isolate — good enough for small scale)
// For production, use Durable Objects or KV for cross-isolate matchmaking.
const waitingPlayers: Map<string, { resolve: (roomId: string) => void }> = new Map()

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() })
    }

    // GET /match?mode=dogfight  — matchmaking + WebSocket upgrade
    if (url.pathname === '/match') {
      const mode = url.searchParams.get('mode') ?? 'dogfight'
      return handleMatch(req, env, mode)
    }

    // GET /health
    if (url.pathname === '/health') {
      return json({ ok: true })
    }

    return new Response('Not found', { status: 404 })
  },
}

async function handleMatch(req: Request, env: Env, mode: string): Promise<Response> {
  // Must be a WebSocket upgrade
  const upgrade = req.headers.get('Upgrade')
  if (upgrade !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 })
  }

  // Generate a player ID
  const playerId = crypto.randomUUID()

  // Check for a waiting player in the same mode
  const waitKey = `mode:${mode}`
  const waiting = waitingPlayers.get(waitKey)

  let roomId: string

  if (waiting) {
    // Match found — reuse room already created by the waiting player
    waitingPlayers.delete(waitKey)
    roomId = waitKey  // room keyed by mode for simplicity (one room per mode)
    waiting.resolve(roomId)
  } else {
    // No waiting player — create a new room and wait
    roomId = waitKey
    await new Promise<void>((res) => {
      waitingPlayers.set(waitKey, {
        resolve: (_roomId) => { res() },
      })
      // Timeout after 30s — join as solo anyway
      setTimeout(() => {
        if (waitingPlayers.has(waitKey)) {
          waitingPlayers.delete(waitKey)
          res()
        }
      }, 30_000)
    })
  }

  // Forward to Durable Object room
  const roomName = env.ROOMS.idFromName(roomId)
  const roomStub = env.ROOMS.get(roomName)

  // Pass playerId in header for the DO to identify this player
  const newReq = new Request(req.url, {
    method: req.method,
    headers: new Headers({ ...Object.fromEntries(req.headers), 'X-Player-Id': playerId }),
  })

  return roomStub.fetch(newReq)
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Upgrade',
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  })
}
