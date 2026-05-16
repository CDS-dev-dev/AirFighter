/**
 * AirFighter Multiplayer Client
 *
 * Connects to Cloudflare Workers server via WebSocket.
 * Syncs local player state and renders remote players.
 *
 * Usage:
 *   const mp = new MultiplayerClient(scene, getLocalState, onRemoteEvent)
 *   await mp.connect(serverUrl, 'dogfight')
 *   // In game loop:
 *   mp.tick(dt)
 *   mp.sendState(localState)
 */

import * as THREE from 'three'

export interface RemotePlayerState {
  pos: [number, number, number]
  quat: [number, number, number, number]
  spd: number
  hp: number
  score: number
}

export interface RemotePlayer {
  id: string
  state: RemotePlayerState
  // Smoothed rendering state
  renderPos: THREE.Vector3
  renderQuat: THREE.Quaternion
  group: THREE.Group
  nameTag?: THREE.Sprite
  lastUpdate: number
}

export type RemoteEventKind = 'fire_missile' | 'fire_gun' | 'explosion' | 'hit'

export interface RemoteEvent {
  playerId: string
  kind: RemoteEventKind
  data?: unknown
}

export interface LocalState {
  pos: [number, number, number]
  quat: [number, number, number, number]
  spd: number
  hp: number
  score: number
}

const SEND_INTERVAL_MS = 50   // 20Hz state broadcast
const LERP_FACTOR = 12        // position/rotation interpolation speed (per second)
const TIMEOUT_MS = 5000       // remove player if no update for 5s

export class MultiplayerClient {
  private ws: WebSocket | null = null
  private playerId: string | null = null
  private roomId: string | null = null
  private remotePlayers = new Map<string, RemotePlayer>()
  private scene: THREE.Scene
  private onEvent: (evt: RemoteEvent) => void
  private makePlayerGroup: () => THREE.Group
  private sendTimer = 0
  private pingTimer = 0
  private latencyMs = 0
  private _pingT = 0
  public connected = false

  constructor(
    scene: THREE.Scene,
    makePlayerGroup: () => THREE.Group,
    onEvent: (evt: RemoteEvent) => void,
  ) {
    this.scene = scene
    this.makePlayerGroup = makePlayerGroup
    this.onEvent = onEvent
  }

  /** Connect to matchmaking server and join a room */
  async connect(serverUrl: string, mode: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = serverUrl.replace(/^http/, 'ws') + `/match?mode=${mode}`
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        console.log('[MP] WebSocket connected')
      }

      this.ws.onmessage = (evt) => {
        this._handleMessage(JSON.parse(evt.data as string))
      }

      this.ws.onclose = () => {
        console.log('[MP] Disconnected')
        this.connected = false
        this._cleanupAll()
      }

      this.ws.onerror = (err) => {
        console.error('[MP] WebSocket error', err)
        reject(err)
      }

      // Resolve when we receive 'welcome'
      const origHandle = this._handleMessage.bind(this)
      this._handleMessage = (msg) => {
        if (msg.type === 'welcome') {
          this.playerId = msg.playerId as string
          this.roomId = msg.roomId as string
          this.connected = true
          console.log(`[MP] Joined room ${this.roomId} as ${this.playerId}`)
          // Register already-present players
          for (const id of (msg.players as string[])) {
            this._addRemotePlayer(id)
          }
          this._handleMessage = origHandle
          resolve()
        } else {
          origHandle(msg)
        }
      }
    })
  }

  disconnect() {
    this.ws?.close()
    this.ws = null
    this.connected = false
    this._cleanupAll()
  }

  /** Call every game frame */
  tick(dt: number) {
    if (!this.connected) return

    // Interpolate remote player positions
    const now = Date.now()
    for (const [id, rp] of this.remotePlayers) {
      if (now - rp.lastUpdate > TIMEOUT_MS) {
        this._removeRemotePlayer(id)
        continue
      }
      const t = Math.min(1, LERP_FACTOR * dt)
      rp.renderPos.lerp(new THREE.Vector3(...rp.state.pos), t)
      rp.renderQuat.slerp(new THREE.Quaternion(...rp.state.quat), t)
      rp.group.position.copy(rp.renderPos)
      rp.group.quaternion.copy(rp.renderQuat)
    }

    // Ping every 3s
    this.pingTimer += dt
    if (this.pingTimer > 3) {
      this.pingTimer = 0
      this._pingT = Date.now()
      this._send({ type: 'ping', t: this._pingT })
    }
  }

  /** Send local player state (called from game loop at SEND_INTERVAL_MS) */
  sendState(state: LocalState, dt: number) {
    if (!this.connected) return
    this.sendTimer += dt * 1000
    if (this.sendTimer < SEND_INTERVAL_MS) return
    this.sendTimer = 0
    this._send({ type: 'state', ...state })
  }

  /** Send a game event to all remote players */
  sendEvent(kind: RemoteEventKind, data?: unknown) {
    if (!this.connected) return
    this._send({ type: 'event', kind, data })
  }

  get players(): RemotePlayer[] {
    return [...this.remotePlayers.values()]
  }

  get latency(): number { return this.latencyMs }
  get myId(): string | null { return this.playerId }

  // ── Private ──────────────────────────────────────────────

  private _handleMessage(msg: Record<string, unknown>) {
    switch (msg.type) {
      case 'welcome':
        // handled in connect()
        break

      case 'player_joined': {
        const id = msg.playerId as string
        if (!this.remotePlayers.has(id)) this._addRemotePlayer(id)
        break
      }

      case 'player_left':
        this._removeRemotePlayer(msg.playerId as string)
        break

      case 'state': {
        const id = msg.playerId as string
        let rp = this.remotePlayers.get(id)
        if (!rp) rp = this._addRemotePlayer(id)
        rp.state = msg as unknown as RemotePlayerState
        rp.lastUpdate = Date.now()
        break
      }

      case 'event':
        this.onEvent({
          playerId: msg.playerId as string,
          kind: msg.kind as RemoteEventKind,
          data: msg.data,
        })
        break

      case 'pong':
        this.latencyMs = Date.now() - this._pingT
        break
    }
  }

  private _addRemotePlayer(id: string): RemotePlayer {
    const group = this.makePlayerGroup()
    this.scene.add(group)
    const rp: RemotePlayer = {
      id,
      state: { pos: [0, 200, 0], quat: [0, 0, 0, 1], spd: 150, hp: 3, score: 0 },
      renderPos: new THREE.Vector3(0, 200, 0),
      renderQuat: new THREE.Quaternion(),
      group,
      lastUpdate: Date.now(),
    }
    this.remotePlayers.set(id, rp)
    console.log(`[MP] Player joined: ${id}`)
    return rp
  }

  private _removeRemotePlayer(id: string) {
    const rp = this.remotePlayers.get(id)
    if (!rp) return
    this.scene.remove(rp.group)
    this.remotePlayers.delete(id)
    console.log(`[MP] Player left: ${id}`)
  }

  private _cleanupAll() {
    for (const id of this.remotePlayers.keys()) this._removeRemotePlayer(id)
  }

  private _send(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }
}
