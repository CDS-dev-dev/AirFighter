/**
 * GameRoom — Durable Object
 *
 * One instance per active match. Accepts up to MAX_PLAYERS WebSocket connections
 * and relays each player's state to all other players in the room.
 *
 * Message protocol (JSON):
 *
 *   Client → Server:
 *     { type: 'state', pos:[x,y,z], quat:[x,y,z,w], spd:number, hp:number, score:number }
 *     { type: 'event', kind: 'fire_missile'|'fire_gun'|'explosion'|'hit', data?: any }
 *     { type: 'ping', t: number }
 *
 *   Server → Client:
 *     { type: 'welcome', playerId: string, players: string[], roomId: string }
 *     { type: 'player_joined', playerId: string }
 *     { type: 'player_left', playerId: string }
 *     { type: 'state', playerId: string, pos, quat, spd, hp, score }
 *     { type: 'event', playerId: string, kind, data }
 *     { type: 'pong', t: number }
 */

export interface Env {
  ROOMS: DurableObjectNamespace
}

interface PlayerSession {
  id: string
  ws: WebSocket
  lastState: PlayerState | null
}

interface PlayerState {
  pos: [number, number, number]
  quat: [number, number, number, number]
  spd: number
  hp: number
  score: number
}

const MAX_PLAYERS = 4

export class GameRoom {
  private sessions: Map<string, PlayerSession> = new Map()
  private state: DurableObjectState

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state
  }

  async fetch(req: Request): Promise<Response> {
    if (this.sessions.size >= MAX_PLAYERS) {
      return new Response('Room full', { status: 503 })
    }

    const playerId = req.headers.get('X-Player-Id') ?? crypto.randomUUID()

    // WebSocket upgrade
    const { 0: client, 1: server } = new WebSocketPair()
    this.state.acceptWebSocket(server)

    const session: PlayerSession = { id: playerId, ws: server, lastState: null }
    this.sessions.set(playerId, session)

    // Welcome: send existing player list
    const existingIds = [...this.sessions.keys()].filter(id => id !== playerId)
    this.send(server, {
      type: 'welcome',
      playerId,
      players: existingIds,
      roomId: this.state.id.toString(),
    })

    // Notify existing players
    this.broadcast({ type: 'player_joined', playerId }, playerId)

    server.addEventListener('message', (evt) => {
      this.handleMessage(playerId, evt.data as string)
    })

    server.addEventListener('close', () => {
      this.sessions.delete(playerId)
      this.broadcast({ type: 'player_left', playerId })
    })

    server.addEventListener('error', () => {
      this.sessions.delete(playerId)
    })

    return new Response(null, { status: 101, webSocket: client })
  }

  private handleMessage(playerId: string, raw: string) {
    let msg: Record<string, unknown>
    try { msg = JSON.parse(raw) } catch { return }

    const session = this.sessions.get(playerId)
    if (!session) return

    switch (msg.type) {
      case 'state':
        session.lastState = msg as unknown as PlayerState
        // Relay to all other players
        this.broadcast({ type: 'state', playerId, ...msg }, playerId)
        break

      case 'event':
        // Relay game events (missile fire, explosion, hit) to all other players
        this.broadcast({ type: 'event', playerId, kind: msg.kind, data: msg.data }, playerId)
        break

      case 'ping':
        this.send(session.ws, { type: 'pong', t: msg.t })
        break
    }
  }

  private broadcast(msg: unknown, excludeId?: string) {
    const json = JSON.stringify(msg)
    for (const [id, session] of this.sessions) {
      if (id === excludeId) continue
      try { session.ws.send(json) } catch { /* ignore closed */ }
    }
  }

  private send(ws: WebSocket, msg: unknown) {
    try { ws.send(JSON.stringify(msg)) } catch { /* ignore closed */ }
  }
}
