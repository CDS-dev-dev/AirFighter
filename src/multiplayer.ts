/**
 * AirFighter Multiplayer Client — Supabase Realtime
 *
 * Uses Supabase Realtime Broadcast (no dedicated server required).
 * Players in the same mode share one channel; Presence handles join/leave.
 *
 * Setup: create a free project at supabase.com, then set in .env.local:
 *   VITE_SUPABASE_URL=https://xxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY=your-anon-key
 */

import { createClient } from '@supabase/supabase-js'
import type { RealtimeChannel } from '@supabase/supabase-js'
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
  renderPos: THREE.Vector3
  renderQuat: THREE.Quaternion
  group: THREE.Group
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

const SEND_INTERVAL_MS = 50
const LERP_FACTOR = 12
const TIMEOUT_MS = 5000

export class MultiplayerClient {
  private channel: RealtimeChannel | null = null
  private playerId: string = crypto.randomUUID()
  private remotePlayers = new Map<string, RemotePlayer>()
  private scene: THREE.Scene
  private onEvent: (evt: RemoteEvent) => void
  private makePlayerGroup: () => THREE.Group
  private sendTimer = 0
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

  async connect(supabaseUrl: string, supabaseKey: string, mode: string): Promise<void> {
    const supabase = createClient(supabaseUrl, supabaseKey)

    return new Promise((resolve, reject) => {
      this.channel = supabase.channel(`airfighter:${mode}`, {
        config: {
          broadcast: { self: false, ack: false },
          presence: { key: this.playerId },
        },
      })

      this.channel
        .on('presence', { event: 'join' }, ({ newPresences }: { newPresences: unknown }) => {
          for (const p of newPresences as Array<{ id: string }>) {
            if (p.id !== this.playerId && !this.remotePlayers.has(p.id)) {
              this._addRemotePlayer(p.id)
            }
          }
        })
        .on('presence', { event: 'leave' }, ({ leftPresences }: { leftPresences: unknown }) => {
          for (const p of leftPresences as Array<{ id: string }>) {
            this._removeRemotePlayer(p.id)
          }
        })
        .on('broadcast', { event: 'state' }, ({ payload }: { payload: any }) => {
          const id = payload.playerId as string
          let rp = this.remotePlayers.get(id)
          if (!rp) rp = this._addRemotePlayer(id)
          rp.state = payload as RemotePlayerState
          rp.lastUpdate = Date.now()
        })
        .on('broadcast', { event: 'game_event' }, ({ payload }: { payload: any }) => {
          this.onEvent({
            playerId: payload.playerId as string,
            kind: payload.kind as RemoteEventKind,
            data: payload.data,
          })
        })
        .subscribe(async (status: string, err?: Error) => {
          if (status === 'SUBSCRIBED') {
            await this.channel!.track({ id: this.playerId })
            this.connected = true
            console.log(`[MP] Connected to airfighter:${mode} as ${this.playerId}`)
            resolve()
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('[MP] Subscribe error', err)
            reject(err ?? new Error(status))
          }
        })
    })
  }

  disconnect() {
    this.channel?.unsubscribe()
    this.channel = null
    this.connected = false
    this._cleanupAll()
  }

  tick(dt: number) {
    if (!this.connected) return
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
  }

  sendState(state: LocalState, dt: number) {
    if (!this.connected) return
    this.sendTimer += dt * 1000
    if (this.sendTimer < SEND_INTERVAL_MS) return
    this.sendTimer = 0
    this.channel?.send({
      type: 'broadcast',
      event: 'state',
      payload: { playerId: this.playerId, ...state },
    })
  }

  sendEvent(kind: RemoteEventKind, data?: unknown) {
    if (!this.connected) return
    this.channel?.send({
      type: 'broadcast',
      event: 'game_event',
      payload: { playerId: this.playerId, kind, data },
    })
  }

  get players(): RemotePlayer[] {
    return [...this.remotePlayers.values()]
  }

  get latency(): number { return 0 }
  get myId(): string { return this.playerId }

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
}
