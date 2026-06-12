import * as THREE from 'three'
import { Sky } from 'three/addons/objects/Sky.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { NeoTokyoMapSystem } from './neoTokyoMapSystem'
import { MultiplayerClient } from './multiplayer'
import { CollectibleSystem } from './collectibleSystem'
import { loadLogsData, createLogVisuals, checkLogDiscovery, discoverLog, getLogsStats, type LogEntry } from './logsSystem'
import { getStoryScenesByMap, createStorySceneVisuals } from './environmentalStorySystem'
import { getDetailedAreasByMap, createRouteMarkers } from './detailedAreasSystem'

// ===== VERSION =====
const VERSION = '7.10.0'
const APP_URL = 'https://cds-dev-dev.github.io/AirFighter/'
if (import.meta.env.DEV) {
  console.log(`%cAirFighter v${VERSION}`, 'font-size: 18px; font-weight: bold; color: #4af;')
  console.log(`%c${APP_URL}`, 'font-size: 12px; color: #888;')
}

// 縦画面強制横向き: CSS rotate(90deg)で回転するため canvas も landscape サイズで初期化する
function isPortraitMode() {
  return navigator.maxTouchPoints > 0 && window.innerHeight > window.innerWidth
}
function getEffectiveSize() {
  return isPortraitMode()
    ? { w: window.innerHeight, h: window.innerWidth }
    : { w: window.innerWidth,  h: window.innerHeight }
}
const { w: initW, h: initH } = getEffectiveSize()

// ===== RENDERER =====
const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

// パフォーマンス設定を一元管理
const PERF_CONFIG = {
  terrainSegments: isMobileDevice ? 64 : 256,
  shadowEnabled: !isMobileDevice,
  skyEnabled: !isMobileDevice,
  glbZonesEnabled: !isMobileDevice,
  pixelRatio: Math.min(window.devicePixelRatio, isMobileDevice ? 1.5 : 2),
  waterSegments: isMobileDevice ? 10 : 80,
  shadowMapSize: isMobileDevice ? 512 : 512,  // 両方512で統一済み
}
const renderer = new THREE.WebGLRenderer({ antialias: !isMobileDevice, powerPreference: 'high-performance' })
renderer.setSize(initW, initH)
renderer.setPixelRatio(PERF_CONFIG.pixelRatio)
renderer.shadowMap.enabled = PERF_CONFIG.shadowEnabled  // モバイルはシャドウ無効（大幅な描画負荷削減）
renderer.shadowMap.type = THREE.BasicShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMappingExposure = 0.78
document.body.appendChild(renderer.domElement)

// ===== GLTF LOADER（地形・機体GLB読み込みで共有）=====
const gltfLoader = new GLTFLoader()

// ===== SCENE =====
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x7da8c8)
// 指数フォグ：距離に比例した大気の霞み（より自然なフォールオフ）
scene.fog = new THREE.FogExp2(0x8db5cc, 0.000075)
const neoTokyoBackgroundTexture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}neo-tokyo-panorama.png`)
neoTokyoBackgroundTexture.colorSpace = THREE.SRGBColorSpace
neoTokyoBackgroundTexture.mapping = THREE.EquirectangularReflectionMapping

const camera = new THREE.PerspectiveCamera(70, initW / initH, 0.1, 16000)

// ===== POST-PROCESSING =====
// ブルームは白飛びの原因になるため Phase 1 では無効化
// Phase 6 で選択的ブルームとして再導入予定
let composer: EffectComposer | null = null

// ===== SKY =====
const sky = new Sky()
sky.scale.setScalar(8000)
const skyUniforms = sky.material.uniforms
skyUniforms['turbidity'].value = 3.0
skyUniforms['rayleigh'].value = 3.5
skyUniforms['mieCoefficient'].value = 0.005
skyUniforms['mieDirectionalG'].value = 0.94

const sunVec = new THREE.Vector3()
sunVec.setFromSphericalCoords(1, THREE.MathUtils.degToRad(62), THREE.MathUtils.degToRad(195))
skyUniforms['sunPosition'].value.copy(sunVec)

if (PERF_CONFIG.skyEnabled) {
  scene.add(sky)
} else {
  // モバイルはスカイシェーダー無効（高コスト）→ 背景色で代替
  scene.background = new THREE.Color(0x7ab8d4)
}

// ===== ENV MAP（PMREMGenerator で IBL: 機体・水面の金属反射）=====
// Sky を先にレンダリングしてから PMREM でフィルタリング
const pmremGen = new THREE.PMREMGenerator(renderer)
pmremGen.compileCubemapShader()
const cubeRT = new THREE.WebGLCubeRenderTarget(512)
const cubeCamera = new THREE.CubeCamera(1, 8000, cubeRT)
cubeCamera.position.set(0, 120, 0)
scene.add(cubeCamera)
cubeCamera.update(renderer, scene)
scene.environment = pmremGen.fromCubemap(cubeRT.texture).texture
pmremGen.dispose()
scene.remove(cubeCamera)

// ===== LIGHTING =====
// メインサン：低い太陽の暖かい橙色光（黄金時間帯）
const sun = new THREE.DirectionalLight(0xffecd0, 4.5)
sun.position.copy(sunVec).multiplyScalar(600)
sun.castShadow = true
sun.shadow.mapSize.set(512, 512)  // 2048 → 512（パフォーマンス改善）
sun.shadow.camera.near = 1; sun.shadow.camera.far = 2000
sun.shadow.camera.left = -600; sun.shadow.camera.right = 600
sun.shadow.camera.top = 600; sun.shadow.camera.bottom = -600
sun.shadow.bias = -0.0004
scene.add(sun)
// 環境光：黄昏時の大気散乱（やや橙がかった空）
scene.add(new THREE.AmbientLight(0x6070a0, 0.52))
// 半球光：空→地面のグラデーション（強めで立体感アップ）
scene.add(new THREE.HemisphereLight(0xb8d4ff, 0x5c7a3e, 1.6))
// バックフィル：影部分を青空色で自然に補光
const fillLight = new THREE.DirectionalLight(0x7799cc, 0.55)
fillLight.position.set(-sunVec.x, sunVec.y * 0.4, -sunVec.z).multiplyScalar(400)
scene.add(fillLight)

// Engine glow light (moves with player)
const engineLight = new THREE.PointLight(0xff6600, 4, 25)
scene.add(engineLight)

// ===== STRUCTURAL MATERIALS（基地・港・橋で共有）=====
const concMat  = new THREE.MeshStandardMaterial({ color: 0x8a8a80, roughness: 0.94, metalness: 0.02 })
const steelMat = new THREE.MeshStandardMaterial({ color: 0x58636e, roughness: 0.50, metalness: 0.82, envMapIntensity: 1.6 })
const milGreen = new THREE.MeshStandardMaterial({ color: 0x3c4a28, roughness: 0.90, metalness: 0.12 })
const radarDishes: THREE.Group[] = []  // 回転アニメ用

// ===== MAP SYSTEM =====
type GameMap = 'original' | 'tokyo' | 'space'
let currentMap: GameMap = 'original' as GameMap  // デフォルトMAP
let neoTokyoMapSystem: NeoTokyoMapSystem | null = null  // NEO東京MAPシステム
let terrainGLB: THREE.Group | null = null  // terrain.glbのシーン参照
let mapSwitchPromise: Promise<void> | null = null

// コレクティブルシステム
const collectibleSystem = new CollectibleSystem(scene)

// Logsシステム
let logsData: LogEntry[] = []
let logsGroup: THREE.Group | null = null

// 環境ストーリーシステム
let storyGroup: THREE.Group | null = null

// 詳細エリアシステム
let routeMarkersGroup: THREE.Group | null = null

// ゲームプレイ効果システム（バイオーム・地形戦術効果）
// 将来の実装用：現在はシステム初期化のみ

interface MapBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  warningMargin: number
}

const MAP_BOUNDS: Record<GameMap, MapBounds> = {
  original: { minX: -8600, maxX: 8600, minZ: -8600, maxZ: 8600, warningMargin: 1100 },
  tokyo: { minX: -8600, maxX: 8600, minZ: -8600, maxZ: 8600, warningMargin: 1100 },
  space: { minX: -6000, maxX: 6000, minZ: -6000, maxZ: 6000, warningMargin: 800 },
}

// ===== TERRAIN =====
const WATER_LEVEL = 1.8

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function smoothstep(edge0: number, edge1: number, v: number): number {
  const t = clamp01((v - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function hash2(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123
  return n - Math.floor(n)
}

function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z)
  const fx = x - ix, fz = z - iz
  const ux = fx * fx * (3 - 2 * fx)
  const uz = fz * fz * (3 - 2 * fz)
  const a = hash2(ix, iz)
  const b = hash2(ix + 1, iz)
  const c = hash2(ix, iz + 1)
  const d = hash2(ix + 1, iz + 1)
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, ux), THREE.MathUtils.lerp(c, d, ux), uz)
}

function fbm(x: number, z: number, octaves = 5): number {
  let total = 0, amp = 0.5, freq = 1, norm = 0
  for (let i = 0; i < octaves; i++) {
    total += valueNoise(x * freq, z * freq) * amp
    norm += amp
    amp *= 0.5
    freq *= 2.03
  }
  return total / norm
}

// 東京MAP用の地形関数は削除 - TokyoMapSystemが完全に管理

// ===== バイオーム判定関数 =====
type Biome = 'temperate' | 'snow' | 'jungle' | 'desert'

function getBiome(x: number, z: number): Biome {
  // 雪山エリア（北部、z < -2000）
  if (z < -2000) return 'snow'

  // ジャングルエリア（東部、x > 2000）
  if (x > 2000) return 'jungle'

  // 砂漠エリア（南部、z > 2500）
  if (z > 2500) return 'desert'

  // 温帯エリア（中央部）
  return 'temperate'
}

// バイオーム遷移の強度を返す（0.0-1.0）
function getBiomeTransition(x: number, z: number): { biome: Biome; strength: number } {
  // 雪山→温帯 遷移帯（-2000～-1000m）
  if (z >= -2000 && z < -1000) {
    const t = (z + 2000) / 1000  // 0.0（雪山100%）→ 1.0（温帯100%）
    return { biome: z < -1500 ? 'snow' : 'temperate', strength: z < -1500 ? 1 - t : t }
  }

  // 温帯→ジャングル 遷移帯（1000～2000m）
  if (x >= 1000 && x < 2000) {
    const t = (x - 1000) / 1000  // 0.0（温帯100%）→ 1.0（ジャングル100%）
    return { biome: x < 1500 ? 'temperate' : 'jungle', strength: x < 1500 ? 1 - t : t }
  }

  // 温帯→砂漠 遷移帯（1500～2500m）
  if (z >= 1500 && z < 2500) {
    const t = (z - 1500) / 1000  // 0.0（温帯100%）→ 1.0（砂漠100%）
    return { biome: z < 2000 ? 'temperate' : 'desert', strength: z < 2000 ? 1 - t : t }
  }

  // 遷移帯外（純粋なバイオーム）
  return { biome: getBiome(x, z), strength: 1.0 }
}

// MAP別地形関数の切り替え
function terrainH(x: number, z: number): number {
  if (currentMap === 'space') return 0
  if (currentMap === 'tokyo') {
    // NEO東京MAPシステムを使用
    return neoTokyoMapSystem ? neoTokyoMapSystem.getTerrainHeight(x, z) : 0
  }

  // ===== 極限地形MAP（4方向山脈＋十字峡谷＋フラクタル）=====
  // gen_terrain.py と完全一致（terrain.glb と同じ地形）
  let h = 300

  h += Math.exp(-((x) ** 2      / 800000 + (z + 1200) ** 2 / 300000)) * 500
  h += Math.exp(-((x + 300) ** 2 / 700000 + (z - 1000) ** 2 / 400000)) * 400
  h += Math.exp(-((x - 1000) ** 2/ 400000 + (z - 200) ** 2  / 800000)) * 450
  h += Math.exp(-((x + 1200) ** 2/ 500000 + (z + 400) ** 2  / 600000)) * 550

  // 中央巨大岩山（高さ600m、直径400m）
  const distToCenter = Math.sqrt(x ** 2 + z ** 2)
  if (distToCenter < 200) {
    h += 600 * Math.exp(-((distToCenter / 120) ** 2))
  }

  const crossX = Math.abs(x)
  const crossZ = Math.abs(z)
  // X軸峡谷（深さ強調: -500 → -700）
  if (crossX < 200 && Math.abs(z) > 250) h -= 700 * Math.exp(-((crossX / 100) ** 2))
  // Z軸峡谷（深さ強調: -500 → -700）
  if (crossZ < 200 && Math.abs(x) > 250) h -= 700 * Math.exp(-((crossZ / 100) ** 2))

  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2
    const rotX = x * Math.cos(angle) + z * Math.sin(angle)
    const rotZ = (-x) * Math.sin(angle) + z * Math.cos(angle)
    const dist = Math.abs(rotZ)
    if (dist < 100 && Math.abs(rotX) < 2000) {
      h -= 400 * Math.exp(-((dist / 60) ** 2))
    }
  }

  h += Math.sin(x * 0.003) * Math.cos(z * 0.004) * 250
  h += Math.sin(x * 0.007) * Math.sin(z * 0.006) * 180
  h += Math.sin(x * 0.012) * Math.cos(z * 0.010) * 120
  h += Math.sin(x * 0.0025 + 2.3) * 150
  h += Math.cos(z * 0.0032 + 1.7) * 130
  h += Math.sin((x + z) * 0.0018) * 110

  const plainDist = Math.hypot(x - 400, z - 200)
  if (plainDist < 600) {
    const flatFactor = Math.cos((plainDist / 600) * Math.PI * 0.5)
    h *= (1 - flatFactor * 0.5)
    h += 250 * flatFactor
  }

  // バイオーム別の高度調整
  const biome = getBiome(x, z)
  if (biome === 'snow') {
    // 雪山: 高度+400m、急峻な地形
    h += 400
    h += Math.sin(x * 0.02) * Math.cos(z * 0.02) * 200
  } else if (biome === 'jungle') {
    // ジャングル: 低地、なだらかな地形
    h *= 0.4
    h = Math.max(20, h)  // 最低高度20m
  } else if (biome === 'desert') {
    // 砂漠: 砂丘（波状地形）
    h *= 0.5
    h += Math.sin(x * 0.01) * 50 + Math.sin(z * 0.015) * 40
    h = Math.max(10, h)  // 最低高度10m
  }

  return Math.max(0, h)
}

function mkGroundTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 512
  const ctx = c.getContext('2d')!
  const grd = ctx.createLinearGradient(0, 0, 512, 512)
  grd.addColorStop(0, '#6fa84a')
  grd.addColorStop(0.45, '#4d8439')
  grd.addColorStop(1, '#87745a')
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, 512, 512)

  for (let i = 0; i < 900; i++) {
    const h = 58 + Math.random() * 72
    const s = 24 + Math.random() * 28
    const l = 18 + Math.random() * 34
    ctx.fillStyle = `hsla(${h},${s}%,${l}%,${0.11 + Math.random() * 0.18})`
    const r = 2 + Math.random() * 16
    ctx.beginPath()
    ctx.ellipse(Math.random()*512, Math.random()*512, r, r*(0.25 + Math.random()*0.35), Math.random()*Math.PI, 0, Math.PI*2)
    ctx.fill()
  }

  for (let i = 0; i < 180; i++) {
    const x = Math.random() * 512
    const y = Math.random() * 512
    ctx.strokeStyle = `rgba(235,220,180,${0.08 + Math.random() * 0.1})`
    ctx.lineWidth = 0.8 + Math.random() * 1.6
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + (Math.random() - 0.5) * 46, y + (Math.random() - 0.5) * 18)
    ctx.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(92, 92)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  return t
}

// ===== 東京MAP専用地形メッシュ生成（完全独立） =====
function generateTokyoTerrainMesh(): THREE.Mesh {
  // TokyoMapSystemが使用されるため、プレースホルダーのみ
  // 実際の地形はTokyoMapSystemが生成
  const terrSegs = isMobileDevice ? 64 : 256
  const terrainGeo = new THREE.PlaneGeometry(12000, 12000, terrSegs, terrSegs)
  terrainGeo.rotateX(-Math.PI / 2)
  const tPos = terrainGeo.attributes.position as THREE.BufferAttribute
  const tCol = new Float32Array(tPos.count * 3)

  for (let i = 0; i < tPos.count; i++) {
    const x = tPos.getX(i), z = tPos.getZ(i)
    const h = 0  // 完全フラット（TokyoMapSystemに任せる）
    tPos.setY(i, h)

    let r: number, g: number, b: number
    const noise = (Math.sin(x * 0.03) * Math.cos(z * 0.03)) * 0.04

    if (h < WATER_LEVEL) {
      // 水域（川・湾）: 深い青
      r = 0.10 + noise; g = 0.22 + noise; b = 0.40 + noise
    } else {
      // 道路判定（OpenStreetMap風）
      const isMainRoad = (
        Math.abs(x + 800) < 18 ||  // 環七
        Math.abs(x + 1200) < 18 || // 環八
        Math.abs(x) < 15 ||         // 山手通り
        Math.abs(z) < 15 ||         // 中央通り
        Math.abs(z - 300) < 15 ||   // 青山通り
        Math.abs(z + 300) < 15      // 靖国通り
      )

      const isSmallRoad = (
        Math.abs(x % 150) < 6 || Math.abs(z % 150) < 6
      )

      // 公園判定
      const toPalace = Math.hypot(x + 400, z + 200)
      const toMeiji = Math.hypot(x + 700, z + 50)
      const toYoyogi = Math.hypot(x + 500, z + 200)
      const toUeno = Math.hypot(x + 100, z + 800)
      const isPark = (toPalace < 250) || (toMeiji < 180) || (toYoyogi < 120) || (toUeno < 150)

      if (isPark) {
        // 公園: 濃い緑
        r = 0.20 + noise; g = 0.36 + noise; b = 0.18 + noise
      } else if (isMainRoad) {
        // 主要道路: 濃いグレー（アスファルト）
        r = 0.26 + noise; g = 0.25 + noise; b = 0.24 + noise
      } else if (isSmallRoad) {
        // 細街路: 中間グレー
        r = 0.38 + noise; g = 0.37 + noise; b = 0.36 + noise
      } else {
        // ビル街: 明るいコンクリート
        r = 0.56 + noise; g = 0.54 + noise; b = 0.52 + noise
      }
    }

    tCol[i*3]   = Math.max(0, Math.min(1, r))
    tCol[i*3+1] = Math.max(0, Math.min(1, g))
    tCol[i*3+2] = Math.max(0, Math.min(1, b))
  }

  terrainGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3))
  terrainGeo.computeVertexNormals()
  const mesh = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.85, metalness: 0.05
  }))
  mesh.receiveShadow = true
  return mesh
}

// ===== オリジナルMAP地形メッシュ生成 =====
function generateOriginalTerrainMesh(): THREE.Mesh {
  const terrSegs = isMobileDevice ? 64 : 256
  const terrainGeo = new THREE.PlaneGeometry(9000, 9000, terrSegs, terrSegs)
  terrainGeo.rotateX(-Math.PI / 2)
  const tPos = terrainGeo.attributes.position as THREE.BufferAttribute
  const tCol = new Float32Array(tPos.count * 3)

  for (let i = 0; i < tPos.count; i++) {
    const x = tPos.getX(i), z = tPos.getZ(i)
    tPos.setY(i, terrainH(x, z))
    const y = tPos.getY(i)
    let r: number, g: number, b: number

    {
      // ===== ORIGINAL MAP: 自然カラーリング =====
      const freckles = (fbm(x * 0.018 + 7, z * 0.018 - 11, 3) - 0.5) * 0.14
      const microNoise = (fbm(x * 0.08 + 13, z * 0.08 - 7, 2) - 0.5) * 0.06

      if (y < WATER_LEVEL + 2.5) {
        r = 0.64 + freckles; g = 0.56 + freckles * 0.6; b = 0.38
      } else if (y < 50) {
        r = 0.38 + freckles; g = 0.72 + freckles; b = 0.26
      } else if (y < 120) {
        r = 0.32 + freckles; g = 0.62 + freckles; b = 0.24
      } else if (y < 280) {
        r = 0.36 + freckles; g = 0.54 + freckles * 0.8; b = 0.22
      } else if (y < 520) {
        r = 0.48 + freckles; g = 0.44 + freckles; b = 0.28
      } else {
        r = 0.68 + freckles * 0.5; g = 0.60 + freckles * 0.5; b = 0.48
      }

      const gradX = terrainH(x + 18, z) - terrainH(x - 18, z)
      const gradZ = terrainH(x, z + 18) - terrainH(x, z - 18)
      const slope = clamp01(Math.hypot(gradX, gradZ) / 165)
      const rock = clamp01(slope * 1.6 + smoothstep(380, 720, y) * 0.4)
      r = THREE.MathUtils.lerp(r, 0.52 + freckles, rock)
      g = THREE.MathUtils.lerp(g, 0.46 + freckles, rock)
      b = THREE.MathUtils.lerp(b, 0.40 + freckles, rock)

      const snow = smoothstep(880, 1150, y)
      r = THREE.MathUtils.lerp(r, 0.95, snow)
      g = THREE.MathUtils.lerp(g, 0.96, snow)
      b = THREE.MathUtils.lerp(b, 0.98, snow)

      r += microNoise; g += microNoise; b += microNoise
    }

    tCol[i*3]   = clamp01(r)
    tCol[i*3+1] = clamp01(g)
    tCol[i*3+2] = clamp01(b)
  }

  terrainGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3))
  terrainGeo.computeVertexNormals()
  const mesh = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({
    map: mkGroundTex(), vertexColors: true, roughness: 0.88, metalness: 0.0
  }))
  mesh.receiveShadow = true
  return mesh
}

// ===== 統合地形生成関数（マップに応じて呼び分け） =====
function generateTerrainMesh(): THREE.Mesh {
  if (currentMap === 'tokyo') {
    return generateTokyoTerrainMesh()
  } else {
    return generateOriginalTerrainMesh()
  }
}

// 初期化時の地形生成（オリジナルMAPのみ）
let ground: THREE.Mesh
if (currentMap === 'original') {
  ground = generateTerrainMesh()
  ground.name = 'OriginalGround'
  scene.add(ground)
} else {
  // 東京MAP・宇宙MAPの場合は空のプレースホルダー
  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ visible: false })
  )
}

// ===== TERRAIN GLB（Blender生成の高品質地形）=====
// 非同期で読み込み、完了後にプロシージャル地形と差し替え
gltfLoader.load(
  import.meta.env.BASE_URL + 'terrain.glb',
  (gltf) => {
    gltf.scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const m = child as THREE.Mesh
        m.receiveShadow = true
        // 頂点カラーを確実に有効化
        if (Array.isArray(m.material)) {
          m.material.forEach(mat => { (mat as THREE.MeshStandardMaterial).vertexColors = true })
        } else {
          (m.material as THREE.MeshStandardMaterial).vertexColors = true
        }
      }
    })
    // プロシージャル地形を非表示にして GLB 地形に切り替え
    // ただし東京MAP・宇宙MAPの場合は追加しない
    if (currentMap === 'original') {
      scene.remove(ground)
      terrainGLB = gltf.scene  // グローバル変数に保存
      terrainGLB.name = 'OriginalTerrainGLB'
      terrainGLB.traverse(child => {
        if (child.name) {
          child.name = 'Original_' + child.name
        }
      })
      scene.add(terrainGLB)
      if (import.meta.env.DEV) console.log('[Terrain] GLB loaded — procedural terrain replaced')
    } else {
      terrainGLB = gltf.scene
      if (import.meta.env.DEV) console.log(`[Terrain] GLB loaded but not added (current map: ${currentMap})`)
    }
  },
  undefined,
  (err) => {
    if (import.meta.env.DEV) console.warn('[Terrain] GLB not found, using procedural fallback:', err)
  }
)

// ===== WATER =====
const waterUniforms = { time: { value: 0 }, sunDir: { value: sunVec.clone().normalize() } }
const waterMesh = new THREE.Mesh(
  (() => {
    const segs = isMobileDevice ? 10 : 80
    const g = new THREE.PlaneGeometry(8000, 8000, segs, segs); g.rotateX(-Math.PI/2); return g
  })(),
  isMobileDevice
    ? new THREE.MeshBasicMaterial({ color: 0x1a4d7a, transparent: true, opacity: 0.85 })
    : new THREE.ShaderMaterial({
        uniforms: waterUniforms,
        transparent: true,
        vertexShader: `
          uniform float time;
          varying vec3 vNorm; varying vec3 vPos;
          void main(){
            vec3 p=position;
            p.y+=sin(p.x*.055+time*1.1)*.45+sin(p.z*.043+time*.85)*.42+sin((p.x+p.z)*.026+time*1.4)*.26;
            vPos=(modelMatrix*vec4(p,1.)).xyz;
            vec3 n=normalize(vec3(cos(p.x*.07+time)*.12,1.,cos(p.z*.055+time*.85)*.1));
            vNorm=normalMatrix*n;
            gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
          }`,
        fragmentShader: `
          uniform vec3 sunDir; varying vec3 vNorm; varying vec3 vPos;
          void main(){
            vec3 n=normalize(vNorm);
            float ndl=max(0.,dot(n,normalize(sunDir)));
            float spec=pow(max(0.,dot(reflect(-normalize(sunDir),n),vec3(0,0,-1))),70.)*4.2;
            float fresnel=pow(1.-abs(n.y),2.2)*.7;
            vec3 deep=vec3(.03,.20,.42), shallow=vec3(.18,.56,.70);
            vec3 col=mix(deep,shallow,fresnel+ndl*.25)+vec3(1.,.96,.88)*spec;
            gl_FragColor=vec4(col,.82);
          }`
      })
)
waterMesh.position.y = WATER_LEVEL
waterMesh.name = 'OriginalWater'
scene.add(waterMesh)

// ===== MOUNTAINS =====
const mountainMat = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.96, metalness: 0, flatShading: false
})

function makeMountainGeometry(radius: number, height: number, seed: number): THREE.ConeGeometry {
  const geo = new THREE.ConeGeometry(radius, height, 17, 7, false)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const col = new Float32Array(pos.count * 3)

  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i)
    const level = clamp01((py + height / 2) / height)
    const angle = Math.atan2(pz, px)
    const side = 1 - level * 0.82
    const rough = 1
      + Math.sin(angle * 3.1 + seed) * 0.14 * side
      + Math.sin(angle * 7.4 - seed * 0.6) * 0.07 * side
      + (valueNoise(Math.cos(angle) * 4 + seed, Math.sin(angle) * 4 - seed) - 0.5) * 0.15 * side
    if (level < 0.98) {
      pos.setX(i, px * rough)
      pos.setZ(i, pz * rough)
    }
    pos.setY(i, py + (valueNoise(px * 0.012 + seed, pz * 0.012 - seed) - 0.5) * height * 0.04 * side)

    const snow = smoothstep(0.68, 0.88, level)
    const green = 1 - smoothstep(0.08, 0.34, level)
    const shade = (valueNoise(px * 0.018 + seed, pz * 0.018 - seed) - 0.5) * 0.13
    let r = THREE.MathUtils.lerp(0.36, 0.62, level) + shade
    let g = THREE.MathUtils.lerp(0.33, 0.56, level) + shade
    let b = THREE.MathUtils.lerp(0.29, 0.50, level) + shade * 0.7
    r = THREE.MathUtils.lerp(r, 0.28, green)
    g = THREE.MathUtils.lerp(g, 0.48, green)
    b = THREE.MathUtils.lerp(b, 0.21, green)
    col[i*3]   = clamp01(THREE.MathUtils.lerp(r, 0.93, snow))
    col[i*3+1] = clamp01(THREE.MathUtils.lerp(g, 0.94, snow))
    col[i*3+2] = clamp01(THREE.MathUtils.lerp(b, 0.98, snow))
  }

  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.computeVertexNormals()
  return geo
}

// 新地形の主要峰に合わせてメッシュを配置
// [x, z, コーン高さ, コーン半径, シード]
;[
  // ── 北部主要峰 ──
  [ 200, -1820, 580, 320, 1.0],  // Peak A 最高峰
  [-720, -1570, 500, 275, 2.5],  // Peak B 北西
  [ 980, -1350, 420, 245, 4.1],  // Peak C 北東
  [  60, -1060, 300, 205, 6.3],  // Peak D 前衛峰
  // ── リッジ補完サブピーク ──
  [-320, -1680, 380, 210, 8.0],
  [ 560, -1720, 350, 195, 9.5],
  [-1040,-1480, 310, 185, 11.2],
  [ 1300,-1200, 290, 175, 12.8],
  // ── 北西高地の高台 ──
  [-1080,  -720, 200, 220, 14.1],
  // ── 南西丘陵の丘 ──
  [ -580,   720, 120, 190, 15.7],
].forEach(([x,z,h,r,seed], i) => {
  const base = terrainH(x,z)
  const body = new THREE.Mesh(makeMountainGeometry(r, h, seed + i * 3.7), mountainMat)
  body.position.set(x, base + h/2 - 12, z)
  body.castShadow = true
  body.receiveShadow = true
  body.name = `OriginalMountain_${i}`
  scene.add(body)
})

// ===== TREES (instanced) =====
const TREE_COUNT = isMobileDevice ? 400 : 1500
const _treeMat = (c: number) => isMobileDevice
  ? new THREE.MeshBasicMaterial({ color: c })
  : new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 })
const trunkIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4,0.72,5.2,5), _treeMat(0x6b4423), TREE_COUNT)
const foliIM  = new THREE.InstancedMesh(new THREE.ConeGeometry(4.4,10,6,2),         _treeMat(0x2f7d2b), TREE_COUNT)
const foli2IM = new THREE.InstancedMesh(new THREE.ConeGeometry(3.2,7,6,2),          _treeMat(0x5f9d3a), TREE_COUNT)
trunkIM.castShadow = foliIM.castShadow = foli2IM.castShadow = !isMobileDevice
trunkIM.receiveShadow = foliIM.receiveShadow = foli2IM.receiveShadow = !isMobileDevice
// 決定的な疑似ランダム関数（シード値ベース）
function deterministicRandom(seed: number): number {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

const _d = new THREE.Object3D()
let treeIndex = 0
// グリッドベース配置（決定的）
const gridSize = 40  // 40mグリッド
const gridRange = 200  // -4000〜4000mを40mグリッドで分割
for (let gx = -gridRange; gx < gridRange && treeIndex < TREE_COUNT; gx++) {
  for (let gz = -gridRange; gz < gridRange && treeIndex < TREE_COUNT; gz++) {
    const baseX = gx * gridSize
    const baseZ = gz * gridSize
    // グリッド内でのオフセット（決定的）
    const seed = gx * 10000 + gz
    const offsetX = (deterministicRandom(seed) - 0.5) * gridSize * 0.8
    const offsetZ = (deterministicRandom(seed + 1) - 0.5) * gridSize * 0.8
    const tx = baseX + offsetX
    const tz = baseZ + offsetZ

    const ty = terrainH(tx, tz)
    const treeSlope = Math.hypot(terrainH(tx + 16, tz) - terrainH(tx - 16, tz), terrainH(tx, tz + 16) - terrainH(tx, tz - 16)) / 32

    // バイオーム遷移チェック
    const transition = getBiomeTransition(tx, tz)

    // 雪山エリアでは広葉樹を減らす（遷移帯では徐々に）
    if (transition.biome === 'snow' && deterministicRandom(seed + 2) > transition.strength * 0.3) continue

    // 砂漠エリアでは広葉樹を大幅に減らす（遷移帯では徐々に）
    if (transition.biome === 'desert' && deterministicRandom(seed + 3) > transition.strength * 0.1) continue

    // ジャングル遷移帯では密度が上がる（スキップ率を下げる）
    if (transition.biome === 'jungle' && deterministicRandom(seed + 4) < (1 - transition.strength) * 0.5) {
      // ジャングルに近いほど配置確率が上がる
    }

    // 標高別植生: 高地（500m-）には木を生やさない
    if (ty > 500) continue
    if (ty < 4) continue  // 水面下・峡谷底には植樹しない
    if (treeSlope > 6.0) continue

    // 中腹（200-500m）: まばらな木（60%の確率でスキップ）
    if (ty > 200 && deterministicRandom(seed + 5) < 0.6) continue

    // ノイズによる森林パターン
    if (fbm(tx * 0.0015 + 8, tz * 0.0015 - 4, 3) < 0.34 && deterministicRandom(seed + 6) < 0.75) continue

    const s = 0.7 + deterministicRandom(seed + 7) * 0.7
    _d.position.set(tx, ty+2*s, tz); _d.scale.setScalar(s); _d.rotation.y = deterministicRandom(seed + 8) * Math.PI * 2; _d.updateMatrix()
    trunkIM.setMatrixAt(treeIndex, _d.matrix)
    _d.position.set(tx, ty+7.5*s, tz); _d.updateMatrix()
    foliIM.setMatrixAt(treeIndex, _d.matrix)
    _d.position.set(tx, ty+11.5*s, tz); _d.scale.setScalar(s * 0.78); _d.updateMatrix()
    foli2IM.setMatrixAt(treeIndex, _d.matrix)

    treeIndex++
  }
}
trunkIM.instanceMatrix.needsUpdate = true; foliIM.instanceMatrix.needsUpdate = true; foli2IM.instanceMatrix.needsUpdate = true
trunkIM.name = 'OriginalTrees_Trunk'
foliIM.name = 'OriginalTrees_Foliage1'
foli2IM.name = 'OriginalTrees_Foliage2'
scene.add(trunkIM); scene.add(foliIM); scene.add(foli2IM)

// ===== 高地植生（灌木・草地、500-800m） =====
const HIGH_ALTITUDE_SHRUB_COUNT = isMobileDevice ? 200 : 500
const shrubMat = _treeMat(0x4a6b3f)
const shrubIM = new THREE.InstancedMesh(new THREE.SphereGeometry(1.5, 6, 4), shrubMat, HIGH_ALTITUDE_SHRUB_COUNT)
shrubIM.castShadow = shrubIM.receiveShadow = !isMobileDevice
let shrubIndex = 0
const shrubGrid = 50  // 50mグリッド
const shrubRange = 56  // -2800〜2800m
for (let gx = -shrubRange; gx < shrubRange && shrubIndex < HIGH_ALTITUDE_SHRUB_COUNT; gx++) {
  for (let gz = -shrubRange; gz < shrubRange && shrubIndex < HIGH_ALTITUDE_SHRUB_COUNT; gz++) {
    const baseSx = gx * shrubGrid
    const baseSz = gz * shrubGrid
    const seed = gx * 20000 + gz + 50000  // 木とは異なるシード範囲
    const offsetX = (deterministicRandom(seed) - 0.5) * shrubGrid * 0.7
    const offsetZ = (deterministicRandom(seed + 1) - 0.5) * shrubGrid * 0.7
    const sx = baseSx + offsetX
    const sz = baseSz + offsetZ
    const sy = terrainH(sx, sz)

    // 高地（500-800m）のみ
    if (sy < 500 || sy > 800) continue

    const slope = Math.hypot(terrainH(sx + 16, sz) - terrainH(sx - 16, sz), terrainH(sx, sz + 16) - terrainH(sx, sz - 16)) / 32
    if (slope > 8.0) continue

    const s = 0.8 + deterministicRandom(seed + 2) * 0.6
    _d.position.set(sx, sy + s, sz)
    _d.scale.setScalar(s)
    _d.rotation.y = deterministicRandom(seed + 3) * Math.PI * 2
    _d.updateMatrix()
    shrubIM.setMatrixAt(shrubIndex, _d.matrix)
    shrubIndex++
  }
}
shrubIM.instanceMatrix.needsUpdate = true
shrubIM.name = 'HighAltitudeShrubs'
scene.add(shrubIM)
console.log(`✅ High altitude vegetation created: ${HIGH_ALTITUDE_SHRUB_COUNT} shrubs`)

// ===== バイオーム別植生（雪山・ジャングル・砂漠） =====
gltfLoader.load(import.meta.env.BASE_URL + 'models/biome_assets.glb', (gltf) => {
  // 雪山エリア: 針葉樹300本（決定的配置）
  let pineCount = 0
  for (let gx = -15; gx < 15 && pineCount < 300; gx++) {
    for (let gz = -20; gz < 0 && pineCount < 300; gz++) {
      const gridSize = 100
      const seed = gx * 30000 + gz + 100000
      const x = gx * gridSize + (deterministicRandom(seed) - 0.5) * gridSize * 0.7
      const z = -2500 + gz * gridSize + (deterministicRandom(seed + 1) - 0.5) * gridSize * 0.7
      const y = terrainH(x, z)

      if (getBiome(x, z) !== 'snow') continue
      if (y < 800) continue  // 標高800m以上

      const pine = gltf.scene.children.find((c: any) => c.name === 'PineTrunk')?.clone()
      if (pine) {
        pine.traverse((c: any) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
        pine.position.set(x, y, z)
        pine.scale.setScalar(0.8 + deterministicRandom(seed + 2) * 0.4)
        pine.rotation.y = deterministicRandom(seed + 3) * Math.PI * 2
        scene.add(pine)
        pineCount++
      }
    }
  }

  // ジャングルエリア: 巨大樹20本（決定的配置）
  let giantCount = 0
  for (let gx = 0; gx < 20 && giantCount < 20; gx++) {
    for (let gz = -15; gz < 15 && giantCount < 20; gz++) {
      const gridSize = 200
      const seed = gx * 40000 + gz + 200000
      const x = 2500 + gx * gridSize + (deterministicRandom(seed) - 0.5) * gridSize * 0.8
      const z = gz * gridSize + (deterministicRandom(seed + 1) - 0.5) * gridSize * 0.8
      const y = terrainH(x, z)

      if (getBiome(x, z) !== 'jungle') continue

      const giantTree = gltf.scene.children.find((c: any) => c.name === 'GiantTrunk')?.clone()
      if (giantTree) {
        giantTree.traverse((c: any) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
        giantTree.position.set(x, y, z)
        giantTree.scale.setScalar(0.8 + deterministicRandom(seed + 2) * 0.4)
        giantTree.rotation.y = deterministicRandom(seed + 3) * Math.PI * 2
        scene.add(giantTree)
        giantCount++
      }
    }
  }

  // 砂漠エリア: サボテン200本（決定的配置）
  let cactusCount = 0
  for (let gx = -15; gx < 15 && cactusCount < 200; gx++) {
    for (let gz = 0; gz < 20 && cactusCount < 200; gz++) {
      const gridSize = 100
      const seed = gx * 50000 + gz + 300000
      const x = gx * gridSize + (deterministicRandom(seed) - 0.5) * gridSize * 0.7
      const z = 2500 + gz * gridSize + (deterministicRandom(seed + 1) - 0.5) * gridSize * 0.7
      const y = terrainH(x, z)

      if (getBiome(x, z) !== 'desert') continue

      const cactus = gltf.scene.children.find((c: any) => c.name === 'CactusBody')?.clone()
      if (cactus) {
        cactus.traverse((c: any) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
        cactus.position.set(x, y, z)
        cactus.scale.setScalar(0.6 + deterministicRandom(seed + 2) * 0.8)
        cactus.rotation.y = deterministicRandom(seed + 3) * Math.PI * 2
        scene.add(cactus)
        cactusCount++
      }
    }
  }

  console.log('✅ Biome vegetation loaded (snow: 300 pines, jungle: 20 giants, desert: 200 cacti) - deterministic placement')
})

// ===== ROCK PILLARS (Blender GLB) =====
// rock_pillar.glb: height=1.0, base_r≈0.26 (unit scale). Loaded async, placed at cluster positions.
const PILLAR_SPECS: Array<{ cx:number; cz:number; n:number }> = [
  { cx:  920, cz:  100, n: 12 },
  { cx:  900, cz: -300, n: 10 },
  { cx:  940, cz: -550, n:  8 },
  { cx: -1080, cz: -720, n: 9 },
  { cx:  -620, cz:  720, n: 7 },
]
const ISOLATED_TOWERS = [[920,300,280,20],[920,-600,250,18],[-1080,-720,320,22]] as const  // 高さ2-3倍、半径1.5-2倍

gltfLoader.load(import.meta.env.BASE_URL + 'models/rock_pillar.glb', (gltf) => {
  const proto = gltf.scene
  proto.traverse(c => { if ((c as THREE.Mesh).isMesh) { (c as THREE.Mesh).castShadow = true; (c as THREE.Mesh).receiveShadow = true } })

  for (const cl of PILLAR_SPECS) {
    for (let j = 0; j < cl.n; j++) {
      const seed = cl.cx * 60000 + cl.cz * 100 + j + 400000
      const px = cl.cx + (deterministicRandom(seed) - 0.5) * 250
      const pz = cl.cz + (deterministicRandom(seed + 1) - 0.5) * 250
      const ph = terrainH(px, pz)
      const ht = 150 + deterministicRandom(seed + 2) * 150  // 150-300m
      const rb = 15 + deterministicRandom(seed + 3) * 25    // 15-40m
      const inst = proto.clone()
      inst.position.set(px, ph, pz)
      inst.scale.set(rb/0.26, ht, rb/0.26)
      inst.rotation.y = deterministicRandom(seed + 4) * Math.PI * 2
      inst.name = `OriginalRockPillar_${cl.cx}_${j}`
      scene.add(inst)
    }
  }
  // 孤立高塔（決定的配置）
  for (let idx = 0; idx < ISOLATED_TOWERS.length; idx++) {
    const [px, pz, ht, rb] = ISOLATED_TOWERS[idx]
    const ph = terrainH(px, pz)
    const seed = px * 70000 + pz + 500000
    const inst = proto.clone()
    inst.position.set(px, ph, pz)
    inst.scale.set(rb/0.26, ht, rb/0.26)
    inst.rotation.y = deterministicRandom(seed) * Math.PI * 2
    inst.name = `OriginalRockTower_${idx}`
    scene.add(inst)
  }
}, undefined, () => { /* fallback: no pillars if GLB fails */ })

// ===== ARCHES (Blender GLB) =====
// rock_arch.glb: half-span=1.0, height=0.62 (unit scale)
const ARCH_SPECS = [
  [920,   80, 100, 100,  0.0],
  [905, -200,  92, 95,  0.06],
  [935, -480,  85, 90, -0.05],
  [820,  320,  78, 85,  1.4],
  [1020, -350, 82, 88, -1.5],
  [-1080,-720, 90, 95,  0.8],
  [-80,  480,  72, 80,  2.1],
] as const

gltfLoader.load(import.meta.env.BASE_URL + 'models/rock_arch.glb', (gltf) => {
  const proto = gltf.scene
  proto.traverse(c => { if ((c as THREE.Mesh).isMesh) { (c as THREE.Mesh).castShadow = true; (c as THREE.Mesh).receiveShadow = true } })

  for (let idx = 0; idx < ARCH_SPECS.length; idx++) {
    const [x, z, w, h, rotY] = ARCH_SPECS[idx]
    const base = terrainH(x, z)
    const inst = proto.clone()
    inst.position.set(x, base, z)
    // half-span=1.0 → scale X by w/2, height=0.62 → scale Y by h/0.62
    inst.scale.set(w / 2, h / 0.62, w / 4)
    inst.rotation.y = rotY
    inst.name = `OriginalRockArch_${idx}`
    scene.add(inst)
  }
}, undefined, () => { /* fallback: no arches if GLB fails */ })

// ===== SURFACE DETAIL =====
const BOULDER_COUNT = 420
const boulderIM = new THREE.InstancedMesh(
  new THREE.DodecahedronGeometry(1, 1),
  new THREE.MeshStandardMaterial({ color: 0x776b5b, roughness: 0.96, metalness: 0, flatShading: true }),
  BOULDER_COUNT
)
boulderIM.castShadow = true
boulderIM.receiveShadow = true
let boulderIndex = 0
const boulderGrid = 70  // 70mグリッド
const boulderRange = 44  // -3080〜3080m
for (let gx = -boulderRange; gx < boulderRange && boulderIndex < BOULDER_COUNT; gx++) {
  for (let gz = -boulderRange; gz < boulderRange && boulderIndex < BOULDER_COUNT; gz++) {
    const baseBx = gx * boulderGrid
    const baseBz = gz * boulderGrid
    const seed = gx * 80000 + gz + 600000
    const offsetX = (deterministicRandom(seed) - 0.5) * boulderGrid * 0.6
    const offsetZ = (deterministicRandom(seed + 1) - 0.5) * boulderGrid * 0.6
    const bx = baseBx + offsetX
    const bz = baseBz + offsetZ
    const by = terrainH(bx, bz)
    const slope = Math.hypot(terrainH(bx + 14, bz) - terrainH(bx - 14, bz), terrainH(bx, bz + 14) - terrainH(bx, bz - 14)) / 28
    if (by < WATER_LEVEL + 5 || by > 900 || slope > 9.0) continue
    const s = 2.4 + deterministicRandom(seed + 2) * 8
    _d.position.set(bx, by + s * 0.45, bz)
    _d.scale.set(
      s * (0.8 + deterministicRandom(seed + 3) * 0.6),
      s * (0.45 + deterministicRandom(seed + 4) * 0.45),
      s * (0.7 + deterministicRandom(seed + 5) * 0.7)
    )
    _d.rotation.set(
      deterministicRandom(seed + 6) * Math.PI,
      deterministicRandom(seed + 7) * Math.PI,
      deterministicRandom(seed + 8) * Math.PI
    )
    _d.updateMatrix()
    boulderIM.setMatrixAt(boulderIndex, _d.matrix)
    boulderIndex++
  }
}
boulderIM.instanceMatrix.needsUpdate = true
boulderIM.name = 'OriginalBoulders'
scene.add(boulderIM)

// ===== SUPPLY POINTS =====
// Original MAP: 基地施設付近に配置（視認しやすい）
const ORIGINAL_SUPPLY_POSITIONS: THREE.Vector3[] = [
  new THREE.Vector3(60, 0, -30),       // 中央基地 Alpha
  new THREE.Vector3(1080, 0, -320),    // 東部高原基地 Bravo
  new THREE.Vector3(-780, 0, -680),    // 北西高地基地
  new THREE.Vector3(-200, 0, 480),     // 中央平野（開けた安全地帯）
]

// Tokyo MAP: ランドマーク付近に配置
const TOKYO_SUPPLY_POSITIONS: THREE.Vector3[] = [
  new THREE.Vector3(0, 400, 0),        // 東京タワー
  new THREE.Vector3(1200, 650, 800),   // スカイツリー
  new THREE.Vector3(-800, 320, -600),  // 新宿副都心
  new THREE.Vector3(800, 180, -1200),  // 渋谷
]

// Space MAP: 既存の補給ステーション（line 3308で定義済み）
// SPACE_SUPPLY_POSITIONS は後で定義

// 現在のMAPに応じて切り替わるグローバル配列（初期値：Original）
const SUPPLY_POSITIONS: THREE.Vector3[] = [
  new THREE.Vector3(60, 0, -30),
  new THREE.Vector3(1080, 0, -320),
  new THREE.Vector3(-780, 0, -680),
  new THREE.Vector3(-200, 0, 480),
]
SUPPLY_POSITIONS.forEach(p => { p.y = terrainH(p.x, p.z) + 18 })

const supplyCooldowns = new Array(SUPPLY_POSITIONS.length).fill(0)
const supplyMeshes: THREE.Mesh[] = []

const supplyMat = new THREE.MeshStandardMaterial({
  color: 0x00ffaa, emissive: 0x00bb66, emissiveIntensity: 2.5, roughness: 0.3, metalness: 0.2
})
SUPPLY_POSITIONS.forEach(pos => {
  const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(7), supplyMat.clone())
  mesh.position.copy(pos)
  scene.add(mesh)
  supplyMeshes.push(mesh)

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(14, 0.6, 8, 32),
    new THREE.MeshStandardMaterial({ color: 0x00ffaa, emissive: 0x00bb66, emissiveIntensity: 1.5, roughness: 0.5 })
  )
  ring.position.copy(pos); ring.rotation.x = Math.PI / 2; scene.add(ring)
  // パフォーマンス改善：補給ポイントのライトを削除（emissiveで代用）
})

// ===== BUILDING GLB PROTOTYPES =====
// Load building models; world structures built after all protos are ready
let glbHangar: THREE.Group | null = null
let glbControlTower: THREE.Group | null = null
let glbRadarDish: THREE.Group | null = null
let glbFuelTank: THREE.Group | null = null
let glbDam: THREE.Group | null = null
let glbCityBuilding01: THREE.Group | null = null
let glbCityBuilding02: THREE.Group | null = null
let glbCityBuilding03: THREE.Group | null = null
let glbCityBuilding04: THREE.Group | null = null
let glbCityBuilding05: THREE.Group | null = null
// Tokyo MAP用のGLBはTokyoMapSystemが管理するため、ここでは不要

let _bldgGLBsLoaded = 0
const _totalBuildingGLBs = 10  // オリジナルMAP用のビルディングGLB数
function _onBuildingGLBLoaded() {
  _bldgGLBsLoaded++
  if (_bldgGLBsLoaded >= _totalBuildingGLBs) {
    // オリジナルマップのみワールド構造物を配置
    if (currentMap === 'original') {
      buildWorldStructures()
    }
  }
}
function buildWorldStructures() {
  // ===== 橋梁（20本）=====
  // 主要峡谷横断橋（大型）
  buildBridge(   80, -185, 220, 0)             // 東西峡谷橋 #1
  buildBridge( -350,  400, 180, Math.PI/2)     // 南北渓谷橋 #2
  buildBridge(  920,  100, 260, Math.PI/2)     // 東部大峡谷橋 #3

  // 追加の峡谷橋（中型）
  buildBridge(  -50, -300, 160, 0)             // 東西峡谷橋 #4
  buildBridge(  200, -150, 140, Math.PI/4)     // 斜行橋 #5
  buildBridge( -450,  200, 150, Math.PI/2)     // 南北渓谷橋 #6
  buildBridge( -250,  600, 120, Math.PI/2)     // 南部渓谷橋 #7
  buildBridge(  850,  -50, 180, Math.PI/2)     // 東部峡谷橋 #8
  buildBridge(  950,  250, 150, Math.PI/3)     // 東部斜行橋 #9

  // 小規模渓谷橋
  buildBridge( -600, -100, 100, 0)             // 西部渓谷橋 #10
  buildBridge(  400,  500, 110, Math.PI/2)     // 南東渓谷橋 #11
  buildBridge(  100,  -50, 90, Math.PI/6)      // 中央斜行橋 #12
  buildBridge( -150,   50, 100, -Math.PI/6)    // 中央西橋 #13
  buildBridge(  600, -400, 120, 0)             // 北東橋 #14
  buildBridge( -800,  300, 130, Math.PI/4)     // 西部大橋 #15
  buildBridge(  300,  100, 80, Math.PI/3)      // 中央東橋 #16
  buildBridge( -500, -300, 110, -Math.PI/4)    // 北西橋 #17
  buildBridge(  700,  350, 100, Math.PI/2)     // 東部南橋 #18
  buildBridge(   50,  250, 90, 0)              // 中央南橋 #19
  buildBridge( -250, -150, 100, Math.PI/5)     // 中央北橋 #20

  // ===== 空軍基地 =====
  buildAirBase(   0,  -60, 0,           'A')   // 中央基地 Alpha
  buildAirBase(1100, -280, Math.PI*0.1, 'B')   // 東部高原基地 Bravo
  buildAirBase( 400,  200, Math.PI*0.25,'C')   // 中央東部平原基地 Charlie

  // ===== ダム =====
  addDam(  120, -800, 180, Math.PI/2)          // 北部渓谷ダム
  addDam( -350,  600, 140, Math.PI/2)          // 南部渓谷ダム

  // ===== 都市エリア =====
  addCityArea( -600,  100, 150, 25)            // 西部都市
  addCityArea(  650,  450, 120, 18)            // 東部都市

  // ===== 峡谷入口ナビゲーションビーコン =====
  const CANYON_BEACONS = [
    { x: -1200, z: 0, label: 'West Canyon' },
    { x: 1200, z: 0, label: 'East Canyon' },
    { x: 0, z: -1200, label: 'North Canyon' },
    { x: 0, z: 1200, label: 'South Canyon' },
  ]

  for (const beacon of CANYON_BEACONS) {
    const beaconGroup = new THREE.Group()
    beaconGroup.name = `CanyonBeacon_${beacon.label}`
    beaconGroup.position.set(beacon.x, terrainH(beacon.x, beacon.z) + 50, beacon.z)

    // 発光マーカー
    const marker = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 8, 60, 8),
      new THREE.MeshStandardMaterial({
        color: 0x00ff88,
        emissive: 0x00ff88,
        emissiveIntensity: 0.8
      })
    )
    beaconGroup.add(marker)
    scene.add(beaconGroup)
    navigationBeacons.push(beaconGroup)
  }

  // ===== ランドマーク: Titan Peak（タイタンピーク - 高さ1200m） =====
  gltfLoader.load(import.meta.env.BASE_URL + 'models/landmark_titan_peak.glb', (gltf) => {
    const titanPeak = gltf.scene
    titanPeak.traverse((c: any) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
    const base = terrainH(0, 0)
    titanPeak.position.set(0, base, 0)
    titanPeak.name = 'TitanPeak'
    scene.add(titanPeak)
    console.log('✅ Titan Peak loaded (1200m landmark)')
  })

  // ===== 巨大奇岩（Monolith - GLB 3バリエーション） =====
  const MONOLITHS = [
    { x: -500, z: -1200, h: 480 },
    { x: 600, z: 1000, h: 520 },
    { x: -1000, z: 800, h: 450 },
    { x: 1100, z: -900, h: 500 },
    { x: -200, z: 0, h: 600 },
  ]

  // 3種類のモデルを並列ロード
  const MONOLITH_MODELS = ['small', 'medium', 'large']
  Promise.all(MONOLITH_MODELS.map(size =>
    new Promise((resolve) => {
      gltfLoader.load(import.meta.env.BASE_URL + `models/rock_monolith_${size}.glb`, resolve)
    })
  )).then((gltfs: any[]) => {
    for (const mono of MONOLITHS) {
      // 高さに応じてモデルを選択
      let modelIndex = 0
      if (mono.h > 550) modelIndex = 2      // large
      else if (mono.h > 480) modelIndex = 1 // medium
      else modelIndex = 0                    // small

      const gltf = gltfs[modelIndex]
      const inst = gltf.scene.clone()
      inst.traverse((c: any) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })

      const base = terrainH(mono.x, mono.z)
      inst.position.set(mono.x, base, mono.z)
      inst.scale.setScalar(mono.h / 500) // 基準高500m
      inst.rotation.y = Math.random() * Math.PI
      inst.name = 'OriginalMonolith'
      scene.add(inst)
    }
  })

  // ===== 自然橋（Natural Bridge - GLB 3バリエーション） =====
  const NATURAL_BRIDGES = [
    // 既存3本
    { x: 400, z: -600, span: 120, h: 80 },
    { x: -700, z: 500, span: 140, h: 90 },
    { x: 200, z: 800, span: 100, h: 70 },
    // 追加3本（主要地点を結ぶ）
    { x: -450, z: -350, span: 110, h: 75 },  // 西側ルート
    { x: 750, z: 550, span: 130, h: 85 },    // 東側ルート
    { x: -100, z: 950, span: 105, h: 72 },   // 南側ルート
  ]

  const BRIDGE_MODELS = ['small', 'medium', 'large']
  Promise.all(BRIDGE_MODELS.map(size =>
    new Promise((resolve) => {
      gltfLoader.load(import.meta.env.BASE_URL + `models/rock_natural_bridge_${size}.glb`, resolve)
    })
  )).then((gltfs: any[]) => {
    for (const bridge of NATURAL_BRIDGES) {
      // スパンに応じてモデルを選択
      let modelIndex = 0
      if (bridge.span > 130) modelIndex = 2      // large
      else if (bridge.span > 110) modelIndex = 1 // medium
      else modelIndex = 0                         // small

      const gltf = gltfs[modelIndex]
      const inst = gltf.scene.clone()
      inst.traverse((c: any) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })

      const base = terrainH(bridge.x, bridge.z)
      inst.position.set(bridge.x, base + bridge.h, bridge.z)
      inst.scale.setScalar(bridge.span / 120) // 基準スパン120m
      inst.rotation.y = Math.random() * Math.PI
      inst.name = 'NaturalBridge'
      scene.add(inst)
    }
  })

  // ===== 岩塔・巨岩配置 =====
  createRockFormations()

  // ===== 中央岩山の洞窟（内部飛行可能）=====
  addMountainCave()

  // ===== 地下洞窟ネットワーク（3層構造） =====
  addUndergroundCaveNetwork()

  // ===== ストーリー要素: 古代遺跡 =====
  const ANCIENT_RUINS_POSITIONS = [
    { x: -800, z: -600, scale: 1.0, rotation: 0 },
    { x: 300, z: 400, scale: 0.8, rotation: Math.PI / 3 },
    { x: -200, z: 800, scale: 1.2, rotation: -Math.PI / 4 },
    { x: 900, z: -300, scale: 0.9, rotation: Math.PI / 2 },
    { x: -600, z: 500, scale: 1.1, rotation: Math.PI },
  ]

  gltfLoader.load(import.meta.env.BASE_URL + 'models/story_ancient_ruins.glb', (gltf) => {
    for (const pos of ANCIENT_RUINS_POSITIONS) {
      const ruins = gltf.scene.clone()
      ruins.traverse((c: any) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
      const base = terrainH(pos.x, pos.z)
      ruins.position.set(pos.x, base, pos.z)
      ruins.scale.setScalar(pos.scale)
      ruins.rotation.y = pos.rotation
      ruins.name = 'AncientRuins'
      scene.add(ruins)
    }
    console.log('✅ Ancient Ruins loaded (5 locations)')
  })
}

function addMountainCave() {
  // 洞窟入口（4方向）
  const caveEntrances = [
    { x: 0, z: -180, angle: 0 },        // 北入口
    { x: 180, z: 0, angle: Math.PI/2 }, // 東入口
    { x: 0, z: 180, angle: Math.PI },   // 南入口
    { x: -180, z: 0, angle: -Math.PI/2 }, // 西入口
  ]

  const caveMat = new THREE.MeshStandardMaterial({
    color: 0x3a3a3a,
    roughness: 0.95,
    metalness: 0.05,
  })

  for (const entrance of caveEntrances) {
    // 入口アーチ
    const archGeo = new THREE.TorusGeometry(35, 8, 12, 24, Math.PI)
    const arch = new THREE.Mesh(archGeo, caveMat)
    const h = terrainH(entrance.x, entrance.z)
    arch.position.set(entrance.x, h + 35, entrance.z)
    arch.rotation.set(0, entrance.angle, 0)
    originalMapGroup.add(arch)

    // 入口標識（発光）
    const markerMat = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      emissive: 0xff8800,
      emissiveIntensity: 1.5,
    })
    const marker = new THREE.Mesh(new THREE.BoxGeometry(4, 15, 4), markerMat)
    marker.position.set(entrance.x + Math.cos(entrance.angle) * 50, h + 20, entrance.z + Math.sin(entrance.angle) * 50)
    originalMapGroup.add(marker)
  }

  // 中央洞窟空間（プレイヤーは実際に岩山の中心を飛べる想定）
  // 視覚的表現のため、中心に発光オーブを配置
  const coreOrb = new THREE.Mesh(
    new THREE.SphereGeometry(20, 16, 16),
    new THREE.MeshStandardMaterial({
      color: 0x4488ff,
      emissive: 0x2266ff,
      emissiveIntensity: 2.0,
      transparent: true,
      opacity: 0.6,
    })
  )
  coreOrb.position.set(0, terrainH(0, 0) + 200, 0)
  originalMapGroup.add(coreOrb)
}

// ===== 地下洞窟ネットワーク（3層構造） =====
function addUndergroundCaveNetwork() {
  const caveMat = new THREE.MeshStandardMaterial({
    color: 0x3a3a3a,
    roughness: 0.95,
    metalness: 0.05,
  })

  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x88ffff,
    emissive: 0x44dddd,
    emissiveIntensity: 1.0,
  })

  // 第1層（地下30-80m）: 入口8箇所、大広間15箇所、トンネル30本
  const L1_ENTRANCES = [
    { x: -800, z: -600 }, { x: 800, z: -600 },
    { x: -800, z: 600 }, { x: 800, z: 600 },
    { x: 0, z: -1000 }, { x: 0, z: 1000 },
    { x: -1000, z: 0 }, { x: 1000, z: 0 },
  ]

  const L1_CHAMBERS = [
    { x: -500, y: -50, z: -400, r: 40 },
    { x: 500, y: -50, z: -400, r: 35 },
    { x: -500, y: -60, z: 400, r: 45 },
    { x: 500, y: -60, z: 400, r: 38 },
    { x: -300, y: -55, z: 0, r: 42 },
    { x: 300, y: -55, z: 0, r: 40 },
    { x: 0, y: -50, z: -600, r: 50 },
    { x: 0, y: -50, z: 600, r: 48 },
    { x: -700, y: -65, z: -200, r: 36 },
    { x: 700, y: -65, z: -200, r: 34 },
    { x: -700, y: -70, z: 200, r: 38 },
    { x: 700, y: -70, z: 200, r: 40 },
    { x: -200, y: -60, z: -800, r: 44 },
    { x: 200, y: -60, z: -800, r: 42 },
    { x: 0, y: -55, z: 0, r: 60 },  // 中央大広間
  ]

  // 入口を配置
  for (const entrance of L1_ENTRANCES) {
    const h = terrainH(entrance.x, entrance.z)
    const archGeo = new THREE.TorusGeometry(25, 6, 12, 24, Math.PI)
    const arch = new THREE.Mesh(archGeo, caveMat)
    arch.position.set(entrance.x, h + 25, entrance.z)
    arch.rotation.x = Math.PI / 2
    originalMapGroup.add(arch)

    // 入口マーカー
    const marker = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 8), glowMat)
    marker.position.set(entrance.x, h + 10, entrance.z)
    originalMapGroup.add(marker)
  }

  // 第1層の大広間
  for (const chamber of L1_CHAMBERS) {
    const chamberGeo = new THREE.SphereGeometry(chamber.r, 16, 16)
    const chamberMesh = new THREE.Mesh(chamberGeo, caveMat)
    chamberMesh.position.set(chamber.x, chamber.y, chamber.z)
    originalMapGroup.add(chamberMesh)

    // 光る鉱石
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2
      const r = chamber.r * 0.8
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(2 + Math.random() * 3),
        glowMat
      )
      crystal.position.set(
        chamber.x + Math.cos(angle) * r,
        chamber.y + (Math.random() - 0.5) * chamber.r * 0.5,
        chamber.z + Math.sin(angle) * r
      )
      crystal.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
      originalMapGroup.add(crystal)
    }
  }

  // トンネル（第1層の広間を接続）
  for (let i = 0; i < L1_CHAMBERS.length - 1; i++) {
    const c1 = L1_CHAMBERS[i]
    const c2 = L1_CHAMBERS[i + 1]
    const length = Math.hypot(c2.x - c1.x, c2.z - c1.z, c2.y - c1.y)
    const midX = (c1.x + c2.x) / 2
    const midY = (c1.y + c2.y) / 2
    const midZ = (c1.z + c2.z) / 2

    const tunnel = new THREE.Mesh(
      new THREE.CylinderGeometry(15, 15, length, 12),
      caveMat
    )
    tunnel.position.set(midX, midY, midZ)

    const angleY = Math.atan2(c2.z - c1.z, c2.x - c1.x)
    const angleX = Math.atan2(c2.y - c1.y, Math.hypot(c2.x - c1.x, c2.z - c1.z))
    tunnel.rotation.set(angleX, 0, angleY + Math.PI / 2)

    originalMapGroup.add(tunnel)
  }

  // 第2層（地下100-150m）: 大広間10箇所
  const L2_CHAMBERS = [
    { x: -400, y: -120, z: -300, r: 50 },
    { x: 400, y: -120, z: -300, r: 45 },
    { x: -400, y: -130, z: 300, r: 48 },
    { x: 400, y: -130, z: 300, r: 46 },
    { x: 0, y: -125, z: 0, r: 70 },  // 中央大広間
    { x: -600, y: -135, z: 0, r: 42 },
    { x: 600, y: -135, z: 0, r: 44 },
    { x: 0, y: -120, z: -500, r: 40 },
    { x: 0, y: -120, z: 500, r: 38 },
    { x: -300, y: -140, z: -500, r: 36 },
  ]

  for (const chamber of L2_CHAMBERS) {
    const chamberGeo = new THREE.SphereGeometry(chamber.r, 16, 16)
    const chamberMesh = new THREE.Mesh(chamberGeo, caveMat)
    chamberMesh.position.set(chamber.x, chamber.y, chamber.z)
    originalMapGroup.add(chamberMesh)

    // 巨大クリスタル
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(15),
      glowMat
    )
    crystal.position.set(chamber.x, chamber.y, chamber.z)
    crystal.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0)
    originalMapGroup.add(crystal)
  }

  // 第2層のトンネル
  for (let i = 0; i < L2_CHAMBERS.length - 1; i++) {
    const c1 = L2_CHAMBERS[i]
    const c2 = L2_CHAMBERS[i + 1]
    const length = Math.hypot(c2.x - c1.x, c2.z - c1.z, c2.y - c1.y)
    const midX = (c1.x + c2.x) / 2
    const midY = (c1.y + c2.y) / 2
    const midZ = (c1.z + c2.z) / 2

    const tunnel = new THREE.Mesh(
      new THREE.CylinderGeometry(12, 12, length, 12),
      caveMat
    )
    tunnel.position.set(midX, midY, midZ)

    const angleY = Math.atan2(c2.z - c1.z, c2.x - c1.x)
    const angleX = Math.atan2(c2.y - c1.y, Math.hypot(c2.x - c1.x, c2.z - c1.z))
    tunnel.rotation.set(angleX, 0, angleY + Math.PI / 2)

    originalMapGroup.add(tunnel)
  }

  // 第3層（地下200m）: 最深部の祭殿
  const L3_CHAMBERS = [
    { x: 0, y: -200, z: 0, r: 80 },  // 最深部祭殿
    { x: -200, y: -200, z: -200, r: 50 },
    { x: 200, y: -200, z: -200, r: 50 },
    { x: -200, y: -200, z: 200, r: 50 },
    { x: 200, y: -200, z: 200, r: 50 },
  ]

  for (const chamber of L3_CHAMBERS) {
    const chamberGeo = new THREE.SphereGeometry(chamber.r, 16, 16)
    const chamberMesh = new THREE.Mesh(chamberGeo, caveMat)
    chamberMesh.position.set(chamber.x, chamber.y, chamber.z)
    originalMapGroup.add(chamberMesh)

    // 古代遺跡の装飾
    if (chamber.r > 70) {
      // 祭壇
      const altar = new THREE.Mesh(
        new THREE.BoxGeometry(30, 10, 20),
        new THREE.MeshStandardMaterial({ color: 0x886633, roughness: 0.9 })
      )
      altar.position.set(chamber.x, chamber.y - 30, chamber.z)
      originalMapGroup.add(altar)

      // 巨大クリスタル×4
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2
        const r = 50
        const crystal = new THREE.Mesh(
          new THREE.OctahedronGeometry(20),
          glowMat
        )
        crystal.position.set(
          chamber.x + Math.cos(angle) * r,
          chamber.y,
          chamber.z + Math.sin(angle) * r
        )
        crystal.rotation.set(0, angle, 0)
        originalMapGroup.add(crystal)
      }
    }
  }

  // 第3層のトンネル
  for (let i = 1; i < L3_CHAMBERS.length; i++) {
    const c1 = L3_CHAMBERS[0]  // 中央祭殿
    const c2 = L3_CHAMBERS[i]
    const length = Math.hypot(c2.x - c1.x, c2.z - c1.z, c2.y - c1.y)
    const midX = (c1.x + c2.x) / 2
    const midY = (c1.y + c2.y) / 2
    const midZ = (c1.z + c2.z) / 2

    const tunnel = new THREE.Mesh(
      new THREE.CylinderGeometry(10, 10, length, 12),
      caveMat
    )
    tunnel.position.set(midX, midY, midZ)

    const angleY = Math.atan2(c2.z - c1.z, c2.x - c1.x)
    const angleX = Math.atan2(c2.y - c1.y, Math.hypot(c2.x - c1.x, c2.z - c1.z))
    tunnel.rotation.set(angleX, 0, angleY + Math.PI / 2)

    originalMapGroup.add(tunnel)
  }

  // 層間接続（第1層→第2層、第2層→第3層）
  // 縦穴
  const shafts = [
    { x: 0, y1: -80, y2: -100, z: 0 },
    { x: -500, y1: -80, y2: -100, z: -400 },
    { x: 500, y1: -80, y2: -100, z: 400 },
    { x: 0, y1: -150, y2: -200, z: 0 },
    { x: -200, y1: -150, y2: -200, z: -200 },
  ]

  for (const shaft of shafts) {
    const height = Math.abs(shaft.y2 - shaft.y1)
    const shaftMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(20, 20, height, 12),
      caveMat
    )
    shaftMesh.position.set(shaft.x, (shaft.y1 + shaft.y2) / 2, shaft.z)
    originalMapGroup.add(shaftMesh)
  }

  console.log('✅ Underground cave network created (3 layers, 30 chambers, 50+ tunnels)')

  // ===== 隠しエリア（Hidden Areas - 10箇所） =====
  const hiddenMat = new THREE.MeshStandardMaterial({
    color: 0xffaa00,
    emissive: 0xff8800,
    emissiveIntensity: 0.6,
    metalness: 0.3,
    roughness: 0.4
  })

  const HIDDEN_AREAS_ORIGINAL = [
    // 既存10個
    { name: '滝の裏の空間', x: -800, y: 150, z: 600, type: 'sphere', size: 15 },
    { name: 'クレバス底部', x: 50, y: -50, z: -250, type: 'sphere', size: 12 },
    { name: '巨大樹の樹洞', x: 2500, y: 100, z: 300, type: 'sphere', size: 18 },
    { name: '雪山頂上の祠', x: 0, y: 1500, z: -2800, type: 'box', size: 20 },
    { name: '砂漠オアシスの地下', x: 300, y: -20, z: 2500, type: 'sphere', size: 14 },
    { name: '洞窟の最深部', x: 0, y: -200, z: 0, type: 'sphere', size: 16 },
    { name: '自然橋の下の空間', x: 400, y: 40, z: -600, type: 'sphere', size: 13 },
    { name: '峡谷の隠し横穴', x: 80, y: 10, z: -200, type: 'sphere', size: 11 },
    { name: '温泉', x: -1500, y: 50, z: 500, type: 'cylinder', size: 20 },
    { name: '古代の天文台跡', x: 1200, y: 900, z: -800, type: 'box', size: 25 },

    // 追加20個（手作業設計）
    { name: 'Titan Peak中腹のキャンプ跡', x: 0, y: 600, z: -2800, type: 'sphere', size: 12 },
    { name: 'Titan Peak見晴らし台', x: -100, y: 900, z: -2700, type: 'box', size: 15 },
    { name: 'Grand Canyon横穴1', x: -2050, y: 50, z: 1300, type: 'sphere', size: 10 },
    { name: 'Grand Canyon横穴2', x: -2000, y: 80, z: 1500, type: 'sphere', size: 10 },
    { name: 'Grand Canyon底部の祭壇', x: -2000, y: -250, z: 1500, type: 'box', size: 18 },
    { name: 'Great Waterfall虹の祠', x: 1520, y: 100, z: -1050, type: 'sphere', size: 14 },
    { name: 'Natural Arch門番の塔', x: 2450, y: 370, z: 2000, type: 'cylinder', size: 12 },
    { name: 'Alpine Lake湖畔の碑', x: 450, y: 1002, z: -2500, type: 'box', size: 10 },
    { name: 'Jungle Heart樹上集落', x: 2500, y: 150, z: 400, type: 'sphere', size: 16 },
    { name: 'Jungle Heart地下洞窟', x: 2550, y: -30, z: 300, type: 'sphere', size: 12 },
    { name: 'Desert Oasis地下水路', x: 250, y: -25, z: 2500, type: 'cylinder', size: 15 },
    { name: 'Desert Oasis商隊宿', x: 350, y: 5, z: 2550, type: 'box', size: 14 },
    { name: 'Snow Temple鐘楼', x: -50, y: 1520, z: -2850, type: 'cylinder', size: 13 },
    { name: 'Snow Temple僧侶像', x: 50, y: 1505, z: -2800, type: 'sphere', size: 11 },
    { name: '地下聖域祭壇', x: 0, y: -195, z: 5, type: 'box', size: 17 },
    { name: '地下聖域光の柱', x: -10, y: -180, z: -10, type: 'cylinder', size: 8 },
    { name: '遠方の峰展望台', x: -7000, y: 1100, z: -7000, type: 'box', size: 15 },
    { name: '西の断崖灯台跡', x: -7500, y: 850, z: 0, type: 'cylinder', size: 12 },
    { name: '大湖の島', x: -6000, y: 52, z: 3000, type: 'sphere', size: 13 },
    { name: '森の深部の祠', x: 6500, y: 30, z: 500, type: 'box', size: 14 },
  ]

  for (const area of HIDDEN_AREAS_ORIGINAL) {
    let marker: THREE.Mesh
    if (area.type === 'sphere') {
      marker = new THREE.Mesh(
        new THREE.SphereGeometry(area.size, 12, 12),
        hiddenMat
      )
    } else if (area.type === 'cylinder') {
      marker = new THREE.Mesh(
        new THREE.CylinderGeometry(area.size, area.size, 5, 16),
        hiddenMat
      )
    } else {
      marker = new THREE.Mesh(
        new THREE.BoxGeometry(area.size, area.size, area.size),
        hiddenMat
      )
    }
    marker.position.set(area.x, area.y, area.z)
    marker.name = `HiddenArea_${area.name}`
    originalMapGroup.add(marker)
  }

  console.log('✅ Hidden areas created (10 locations in Original MAP)')

  // ===== 中型ランドマーク（Mid-size Landmarks - 5個、300-500m級） =====
  const landmarkMat = new THREE.MeshStandardMaterial({
    color: 0x8a7a6a,
    roughness: 0.9,
    metalness: 0.1
  })

  // 1. 大峡谷（Grand Canyon）
  const GRAND_CANYON = { x: -2000, z: 1500, length: 2000, width: 400, depth: 300 }
  for (let i = 0; i < 10; i++) {
    const t = i / 9
    const cx = GRAND_CANYON.x + (Math.random() - 0.5) * GRAND_CANYON.width
    const cz = GRAND_CANYON.z - t * GRAND_CANYON.length
    const cy = terrainH(cx, cz) - GRAND_CANYON.depth + (Math.random() * 50)

    const canyonWall = new THREE.Mesh(
      new THREE.BoxGeometry(
        GRAND_CANYON.width / 10 + Math.random() * 50,
        GRAND_CANYON.depth,
        100
      ),
      landmarkMat
    )
    canyonWall.position.set(cx, cy + GRAND_CANYON.depth / 2, cz)
    canyonWall.rotation.y = Math.random() * 0.3
    canyonWall.name = 'GrandCanyon_Wall'
    originalMapGroup.add(canyonWall)
  }

  // 峡谷底に川
  const canyonRiverMat = new THREE.MeshBasicMaterial({ color: 0x3366aa, transparent: true, opacity: 0.7 })
  const canyonRiver = new THREE.Mesh(
    new THREE.PlaneGeometry(GRAND_CANYON.width * 0.3, GRAND_CANYON.length),
    canyonRiverMat
  )
  canyonRiver.position.set(GRAND_CANYON.x, terrainH(GRAND_CANYON.x, GRAND_CANYON.z) - GRAND_CANYON.depth + 5, GRAND_CANYON.z - GRAND_CANYON.length / 2)
  canyonRiver.rotation.x = -Math.PI / 2
  originalMapGroup.add(canyonRiver)

  // 2. 大滝（Great Waterfall）
  const GREAT_WATERFALL = { x: 1500, z: -1000, height: 400, width: 200 }
  const waterfallMat = new THREE.MeshBasicMaterial({
    color: 0xaaccee,
    transparent: true,
    opacity: 0.6
  })
  const waterfall = new THREE.Mesh(
    new THREE.PlaneGeometry(GREAT_WATERFALL.width, GREAT_WATERFALL.height),
    waterfallMat
  )
  const waterfallTop = terrainH(GREAT_WATERFALL.x, GREAT_WATERFALL.z) + 50
  waterfall.position.set(GREAT_WATERFALL.x, waterfallTop - GREAT_WATERFALL.height / 2, GREAT_WATERFALL.z)
  waterfall.rotation.y = Math.PI / 4
  waterfall.name = 'GreatWaterfall'
  originalMapGroup.add(waterfall)

  // 滝壺
  const waterfallBasin = new THREE.Mesh(
    new THREE.CircleGeometry(80, 32),
    new THREE.MeshBasicMaterial({ color: 0x2266aa, transparent: true, opacity: 0.8 })
  )
  waterfallBasin.position.set(GREAT_WATERFALL.x, waterfallTop - GREAT_WATERFALL.height + 2, GREAT_WATERFALL.z)
  waterfallBasin.rotation.x = -Math.PI / 2
  originalMapGroup.add(waterfallBasin)

  // 3. 巨大洞窟入口（Giant Cave Entrance）
  const GIANT_CAVE = { x: -1000, z: -2000, width: 150, height: 200 }
  const caveEntranceMat = new THREE.MeshStandardMaterial({
    color: 0x333333,
    roughness: 1.0,
    metalness: 0
  })
  const caveEntrance = new THREE.Mesh(
    new THREE.CylinderGeometry(GIANT_CAVE.width / 2, GIANT_CAVE.width / 2, 20, 16, 1, true),
    caveEntranceMat
  )
  const caveY = terrainH(GIANT_CAVE.x, GIANT_CAVE.z)
  caveEntrance.position.set(GIANT_CAVE.x, caveY + GIANT_CAVE.height / 2, GIANT_CAVE.z)
  caveEntrance.rotation.z = Math.PI / 2
  caveEntrance.name = 'GiantCaveEntrance'
  originalMapGroup.add(caveEntrance)

  // 洞窟の開口部マーキング
  const caveOpening = new THREE.Mesh(
    new THREE.CircleGeometry(GIANT_CAVE.width / 2, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  )
  caveOpening.position.set(GIANT_CAVE.x, caveY + 10, GIANT_CAVE.z + 10)
  caveOpening.rotation.y = Math.PI / 4
  originalMapGroup.add(caveOpening)

  // 4. 天然アーチ（Natural Arch）
  const NATURAL_ARCH = { x: 2500, z: 2000, height: 350, width: 180 }
  const archMat = new THREE.MeshStandardMaterial({
    color: 0xaa8866,
    roughness: 0.95,
    metalness: 0.05
  })

  // アーチの柱×2
  for (let side of [-1, 1]) {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(30, 40, NATURAL_ARCH.height, 12),
      archMat
    )
    const archY = terrainH(NATURAL_ARCH.x, NATURAL_ARCH.z)
    pillar.position.set(NATURAL_ARCH.x + side * (NATURAL_ARCH.width / 2), archY + NATURAL_ARCH.height / 2, NATURAL_ARCH.z)
    pillar.name = 'NaturalArch_Pillar'
    originalMapGroup.add(pillar)
  }

  // アーチの天井
  const archTop = new THREE.Mesh(
    new THREE.TorusGeometry(NATURAL_ARCH.width / 2, 25, 16, 32, Math.PI),
    archMat
  )
  const archY = terrainH(NATURAL_ARCH.x, NATURAL_ARCH.z)
  archTop.position.set(NATURAL_ARCH.x, archY + NATURAL_ARCH.height, NATURAL_ARCH.z)
  archTop.rotation.z = Math.PI / 2
  originalMapGroup.add(archTop)

  // 5. 高山湖（Alpine Lake）
  const ALPINE_LAKE = { x: 500, z: -2500, radius: 250, altitude: 1000 }
  const alpineLakeMat = new THREE.MeshBasicMaterial({
    color: 0x0088dd,
    transparent: true,
    opacity: 0.8
  })
  const alpineLake = new THREE.Mesh(
    new THREE.CircleGeometry(ALPINE_LAKE.radius, 32),
    alpineLakeMat
  )
  alpineLake.position.set(ALPINE_LAKE.x, ALPINE_LAKE.altitude + 2, ALPINE_LAKE.z)
  alpineLake.rotation.x = -Math.PI / 2
  alpineLake.name = 'AlpineLake'
  originalMapGroup.add(alpineLake)

  console.log('✅ Mid-size landmarks created (5 landmarks: Grand Canyon, Great Waterfall, Giant Cave, Natural Arch, Alpine Lake)')

  // ===== 細部ディテール（Natural Details） =====
  const flowerMat = new THREE.MeshLambertMaterial({ color: 0xff88cc })
  const mushroomMat = new THREE.MeshLambertMaterial({ color: 0xddaa88 })
  const logMat = new THREE.MeshLambertMaterial({ color: 0x6b4423 })
  const rockPileMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 })

  // 花（群生）1000本
  const flowerCount = isMobileDevice ? 400 : 1000
  for (let i = 0; i < flowerCount; i++) {
    const sx = (Math.random() - 0.5) * 8000
    const sz = (Math.random() - 0.5) * 8000
    const sy = terrainH(sx, sz)
    if (sy < WATER_LEVEL || sy > 600) continue  // 水中・高山を除外

    const flower = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 4, 4),
      flowerMat
    )
    flower.position.set(sx, sy + 0.5, sz)
    originalMapGroup.add(flower)
  }

  // キノコ500本
  const mushroomCount = isMobileDevice ? 200 : 500
  for (let i = 0; i < mushroomCount; i++) {
    const sx = (Math.random() - 0.5) * 8000
    const sz = (Math.random() - 0.5) * 8000
    const sy = terrainH(sx, sz)
    if (sy < WATER_LEVEL || sy > 500) continue

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.2, 1, 6),
      mushroomMat
    )
    stem.position.set(sx, sy + 0.5, sz)
    originalMapGroup.add(stem)

    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 0.4, 8),
      mushroomMat
    )
    cap.position.set(sx, sy + 1.2, sz)
    originalMapGroup.add(cap)
  }

  // 倒木200本
  const fallenLogCount = isMobileDevice ? 80 : 200
  for (let i = 0; i < fallenLogCount; i++) {
    const sx = (Math.random() - 0.5) * 8000
    const sz = (Math.random() - 0.5) * 8000
    const sy = terrainH(sx, sz)
    if (sy < WATER_LEVEL || sy > 700) continue

    const log = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.6, 12, 8),
      logMat
    )
    log.position.set(sx, sy + 0.5, sz)
    log.rotation.set(0, Math.random() * Math.PI * 2, Math.PI / 2)
    originalMapGroup.add(log)
  }

  // 岩の堆積300個
  const rockPileCount = isMobileDevice ? 120 : 300
  for (let i = 0; i < rockPileCount; i++) {
    const sx = (Math.random() - 0.5) * 8000
    const sz = (Math.random() - 0.5) * 8000
    const sy = terrainH(sx, sz)
    if (sy < WATER_LEVEL) continue

    const rockPile = new THREE.Mesh(
      new THREE.DodecahedronGeometry(2 + Math.random() * 2, 0),
      rockPileMat
    )
    rockPile.position.set(sx, sy + 1, sz)
    rockPile.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
    originalMapGroup.add(rockPile)
  }

  // 小川20本（SimpleLine）
  const streamMat = new THREE.LineBasicMaterial({ color: 0x4488ff, opacity: 0.6, transparent: true })
  for (let i = 0; i < 20; i++) {
    const startX = (Math.random() - 0.5) * 7000
    const startZ = (Math.random() - 0.5) * 7000
    const points: THREE.Vector3[] = []
    let x = startX, z = startZ
    for (let j = 0; j < 20; j++) {
      const y = terrainH(x, z)
      if (y > WATER_LEVEL) points.push(new THREE.Vector3(x, y + 0.2, z))
      x += (Math.random() - 0.5) * 30
      z += (Math.random() - 0.5) * 30
    }
    if (points.length > 1) {
      const streamGeo = new THREE.BufferGeometry().setFromPoints(points)
      const stream = new THREE.Line(streamGeo, streamMat)
      originalMapGroup.add(stream)
    }
  }

  // 池10箇所
  const pondMat = new THREE.MeshBasicMaterial({ color: 0x2266aa, transparent: true, opacity: 0.7 })
  for (let i = 0; i < 10; i++) {
    const px = (Math.random() - 0.5) * 7000
    const pz = (Math.random() - 0.5) * 7000
    const py = terrainH(px, pz)
    if (py < WATER_LEVEL + 5 || py > 400) continue

    const pond = new THREE.Mesh(
      new THREE.CircleGeometry(15 + Math.random() * 20, 16),
      pondMat
    )
    pond.position.set(px, py + 0.5, pz)
    pond.rotation.x = -Math.PI / 2
    originalMapGroup.add(pond)
  }

  // 人工物の残骸: 焚き火跡30個
  const campfireMat = new THREE.MeshLambertMaterial({ color: 0x333333 })
  for (let i = 0; i < 30; i++) {
    const cx = (Math.random() - 0.5) * 6000
    const cz = (Math.random() - 0.5) * 6000
    const cy = terrainH(cx, cz)
    if (cy < WATER_LEVEL || cy > 500) continue

    const campfire = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 2, 0.3, 16),
      campfireMat
    )
    campfire.position.set(cx, cy + 0.15, cz)
    originalMapGroup.add(campfire)
  }

  // テント（廃）20個
  const tentMat = new THREE.MeshLambertMaterial({ color: 0x665544 })
  for (let i = 0; i < 20; i++) {
    const tx = (Math.random() - 0.5) * 6000
    const tz = (Math.random() - 0.5) * 6000
    const ty = terrainH(tx, tz)
    if (ty < WATER_LEVEL || ty > 500) continue

    const tent = new THREE.Mesh(
      new THREE.ConeGeometry(2, 3, 4),
      tentMat
    )
    tent.position.set(tx, ty + 1.5, tz)
    tent.rotation.y = Math.random() * Math.PI * 2
    originalMapGroup.add(tent)
  }

  // 石像15体
  const statueMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.8 })
  for (let i = 0; i < 15; i++) {
    const stx = (Math.random() - 0.5) * 7000
    const stz = (Math.random() - 0.5) * 7000
    const sty = terrainH(stx, stz)
    if (sty < WATER_LEVEL || sty > 600) continue

    const statue = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1.5, 5, 8),
      statueMat
    )
    statue.position.set(stx, sty + 2.5, stz)
    originalMapGroup.add(statue)

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 8, 8),
      statueMat
    )
    head.position.set(stx, sty + 5.5, stz)
    originalMapGroup.add(head)
  }

  console.log('✅ Natural details added (1000 flowers, 500 mushrooms, 200 logs, 300 rock piles, 20 streams, 10 ponds, 65 artifacts)')

  // ===== 外周エリアの詳細化（Outer Area Details, 4300-8600m圏） =====
  const distantMountainMat = new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 0.9, metalness: 0.1 })

  // 北側: 雪山山脈の延長
  const NORTHERN_PEAKS = [
    { x: -7000, z: -7000, peaks: 5, baseHeight: 1000 },
    { x: 0, z: -7500, peaks: 3, baseHeight: 1200 },
    { x: 7000, z: -7000, peaks: 4, baseHeight: 1100 },
  ]

  for (const range of NORTHERN_PEAKS) {
    for (let i = 0; i < range.peaks; i++) {
      const peakX = range.x + (Math.random() - 0.5) * 1000
      const peakZ = range.z + (Math.random() - 0.5) * 500
      const peakHeight = range.baseHeight + Math.random() * 400

      const peak = new THREE.Mesh(
        new THREE.ConeGeometry(200 + Math.random() * 100, peakHeight, 8),
        distantMountainMat
      )
      peak.position.set(peakX, peakHeight / 2, peakZ)
      peak.name = 'DistantPeak'
      originalMapGroup.add(peak)
    }
  }

  // 西側: 海岸線・断崖
  const WESTERN_CLIFFS = [
    { x: -7500, z: -2000, height: 800 },
    { x: -7500, z: 0, height: 850 },
    { x: -7500, z: 2000, height: 800 },
  ]

  for (const cliff of WESTERN_CLIFFS) {
    const cliffMesh = new THREE.Mesh(
      new THREE.BoxGeometry(100, cliff.height, 1000),
      distantMountainMat
    )
    cliffMesh.position.set(cliff.x, cliff.height / 2, cliff.z)
    cliffMesh.name = 'WesternCliff'
    originalMapGroup.add(cliffMesh)
  }

  // 東側: ジャングルの深部（樹木密度アップは既存システムで対応）
  const DISTANT_FORESTS = [
    { x: 6000, z: 0, radius: 1500 },
    { x: 7000, z: 2000, radius: 1000 },
  ]

  for (const forest of DISTANT_FORESTS) {
    // フォレストマーカー（視覚的ガイド用）
    const forestMarker = new THREE.Mesh(
      new THREE.CylinderGeometry(forest.radius, forest.radius, 50, 32, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x2a5a2a,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
      })
    )
    forestMarker.position.set(forest.x, 25, forest.z)
    originalMapGroup.add(forestMarker)
  }

  // 大湖×2
  const LARGE_LAKES = [
    { x: -6000, z: 3000, radius: 800 },
    { x: 5000, z: -4000, radius: 600 },
  ]

  const largeLakeMat = new THREE.MeshBasicMaterial({
    color: 0x2266aa,
    transparent: true,
    opacity: 0.8
  })

  for (const lake of LARGE_LAKES) {
    const largeLake = new THREE.Mesh(
      new THREE.CircleGeometry(lake.radius, 32),
      largeLakeMat
    )
    largeLake.position.set(lake.x, terrainH(lake.x, lake.z) + 1, lake.z)
    largeLake.rotation.x = -Math.PI / 2
    largeLake.name = 'LargeLake'
    originalMapGroup.add(largeLake)
  }

  console.log('✅ Outer area details added (12 distant peaks, 3 cliffs, 2 forest zones, 2 large lakes)')
}

function _glbSetShadow(g: THREE.Group) {
  g.traverse(c => { if ((c as THREE.Mesh).isMesh) { (c as THREE.Mesh).castShadow = true; (c as THREE.Mesh).receiveShadow = true } })
}
;[
  ['models/hangar.glb',                (g: THREE.Group) => { glbHangar             = g }],
  ['models/control_tower.glb',         (g: THREE.Group) => { glbControlTower       = g }],
  ['models/radar_dish.glb',            (g: THREE.Group) => { glbRadarDish          = g }],
  ['models/fuel_tank.glb',             (g: THREE.Group) => { glbFuelTank           = g }],
  ['models/dam.glb',                   (g: THREE.Group) => { glbDam                = g }],
  ['models/city_building_01.glb',      (g: THREE.Group) => { glbCityBuilding01     = g }],
  ['models/city_building_02.glb',      (g: THREE.Group) => { glbCityBuilding02     = g }],
  ['models/city_building_03.glb',      (g: THREE.Group) => { glbCityBuilding03     = g }],
  ['models/city_building_04.glb',      (g: THREE.Group) => { glbCityBuilding04     = g }],
  ['models/city_building_05.glb',      (g: THREE.Group) => { glbCityBuilding05     = g }],
].forEach(([url, setter]) => {
  gltfLoader.load(import.meta.env.BASE_URL + (url as string), (gltf) => {
    const g = gltf.scene; _glbSetShadow(g); (setter as (g: THREE.Group) => void)(g)
    _onBuildingGLBLoaded()
  }, undefined, () => _onBuildingGLBLoaded())
})

// Tokyo MAP用のGLBロードはTokyoMapSystemが管理するため、ここでは不要

// ===== AIRCRAFT GLB PROTOTYPES =====
// Blender Z-axis → GLTF Y-axis after export_yup; apply rotation.x=π/2 to orient correctly
let glbFighter: THREE.Group | null = null
let glbHeli: THREE.Group | null = null
let glbBomber: THREE.Group | null = null

gltfLoader.load(import.meta.env.BASE_URL + 'models/fighter.glb', (gltf) => {
  glbFighter = gltf.scene
  _glbSetShadow(glbFighter)
  // Replace player visuals with GLB model
  while (player.children.length > 0) player.remove(player.children[0])
  const pi = glbFighter.clone()
  pi.rotation.x = Math.PI / 2  // Blender Z-forward → Three.js -Z-forward
  pi.scale.setScalar(0.70)
  player.add(pi)
}, undefined, () => { /* keep procedural player on error */ })

gltfLoader.load(import.meta.env.BASE_URL + 'models/heli.glb', (gltf) => {
  glbHeli = gltf.scene
  _glbSetShadow(glbHeli)
}, undefined, () => { })

gltfLoader.load(import.meta.env.BASE_URL + 'models/bomber.glb', (gltf) => {
  glbBomber = gltf.scene
  _glbSetShadow(glbBomber)
}, undefined, () => { })

// ===== FACTORIES =====
function createAircraft(bodyColor: number, darkColor: number): THREE.Group {
  if (glbFighter) {
    const g = new THREE.Group()
    const inst = glbFighter.clone()
    inst.rotation.x = Math.PI / 2
    inst.scale.setScalar(0.70)
    const teamCol = new THREE.Color(bodyColor)
    inst.traverse(c => {
      if ((c as THREE.Mesh).isMesh) {
        const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial
        if (m && m.isMeshStandardMaterial && (m.emissive.r + m.emissive.g + m.emissive.b) < 0.01) {
          const tm = m.clone()
          tm.color.lerp(teamCol, 0.45)
          ;(c as THREE.Mesh).material = tm
        }
      }
    })
    g.add(inst)
    return g
  }
  const g = new THREE.Group()
  const mat = new THREE.MeshPhysicalMaterial({
    color: bodyColor, roughness: 0.06, metalness: 0.94,
    clearcoat: 1.0, clearcoatRoughness: 0.02, envMapIntensity: 2.5
  })
  const dark = new THREE.MeshPhysicalMaterial({
    color: darkColor, roughness: 0.16, metalness: 0.90,
    clearcoat: 0.6, clearcoatRoughness: 0.08, envMapIntensity: 2.0
  })
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x88bbff, transparent: true, opacity: 0.22,
    roughness: 0.0, metalness: 0.0, transmission: 0.82, ior: 1.5,
    envMapIntensity: 3.0
  })
  const pylonMat = new THREE.MeshPhysicalMaterial({
    color: darkColor, roughness: 0.22, metalness: 0.85, envMapIntensity: 1.8
  })
  const missileSkinMat = new THREE.MeshPhysicalMaterial({
    color: 0xcccccc, roughness: 0.28, metalness: 0.72, envMapIntensity: 1.5
  })

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 4.5, 12), mat)
  fuselage.rotation.x = Math.PI / 2; fuselage.castShadow = true; g.add(fuselage)

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2.2, 12), mat)
  nose.rotation.x = Math.PI / 2; nose.position.z = -3.2; g.add(nose)

  const wing = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.12, 2.2), mat)
  wing.position.z = 0.5; wing.castShadow = true; g.add(wing)

  for (const side of [-4.25, 4.25]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 1.0), mat)
    tip.position.set(side, 0.03, 0.5); g.add(tip)
  }

  const vTail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.8, 1.3), mat)
  vTail.position.set(0, 0.9, 2.1); g.add(vTail)

  const hTail = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 1.1), dark)
  hTail.position.z = 2.1; g.add(hTail)

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 8), glass)
  cockpit.scale.set(1, 0.65, 1.6); cockpit.position.set(0, 0.45, -0.6); g.add(cockpit)

  const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.20, 1.4, 10), dark)
  intake.rotation.x = Math.PI / 2; intake.position.z = 2.3; g.add(intake)

  // ウイングパイロン + 外装ミサイル（左右対称）
  for (const side of [-2.6, 2.6]) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 1.0), pylonMat)
    pylon.position.set(side, -0.22, 0.5); g.add(pylon)
    const mBody = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 7), missileSkinMat)
    mBody.rotation.x = Math.PI / 2; mBody.position.set(side, -0.46, 0.5); g.add(mBody)
    const mTip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 7), missileSkinMat)
    mTip.rotation.x = Math.PI / 2; mTip.position.set(side, -0.46, -0.04); g.add(mTip)
    const mFin = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.18), missileSkinMat)
    mFin.position.set(side, -0.46, 0.88); g.add(mFin)
  }

  // エンジンノズルグロー
  const nozzleMat = new THREE.MeshStandardMaterial({
    color: 0xff6600, emissive: 0xff3300, emissiveIntensity: 8, roughness: 0.4
  })
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.5, 10), nozzleMat)
  nozzle.rotation.x = Math.PI / 2; nozzle.position.z = 2.95; g.add(nozzle)

  return g
}

// ===== ミサイルジオメトリプール（パフォーマンス最適化：発射時のフリーズ防止） =====
const missileBodyGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.0, 8)
const missileTipGeo = new THREE.ConeGeometry(0.08, 0.35, 8)
const missileExhaustGeo = new THREE.ConeGeometry(0.07, 0.45, 8)
const missileExhaustMat = new THREE.MeshStandardMaterial({
  color: 0xff5500, emissive: 0xff3300, emissiveIntensity: 5.0, roughness: 0.4
})

function createMissileModel(mat: THREE.Material): THREE.Group {
  const g = new THREE.Group()
  const body = new THREE.Mesh(missileBodyGeo, mat)
  body.rotation.x = Math.PI / 2; g.add(body)
  const tip = new THREE.Mesh(missileTipGeo, mat)
  tip.rotation.x = Math.PI / 2; tip.position.z = -0.67; g.add(tip)
  const exhaust = new THREE.Mesh(missileExhaustGeo, missileExhaustMat)
  exhaust.rotation.x = -Math.PI / 2; exhaust.position.z = 0.72; g.add(exhaust)
  return g
}

// ===== GLTF LOADER（地形GLB + 将来の機体モデル差し替え用インフラ）=====

// GLBモデル読み込みユーティリティ。Phase 3 以降で機体・建造物の置き換えに使用する。
// window に公開することで将来のコード（動的 import 等）から呼び出せる。
;(window as unknown as Record<string, unknown>).loadAircraftGLB = function(url: string, onLoad: (group: THREE.Group) => void): void {
  gltfLoader.load(url, (gltf) => {
    const group = gltf.scene
    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        mesh.castShadow = true
        mesh.receiveShadow = true
        const mat = mesh.material as THREE.MeshStandardMaterial
        if (mat) mat.envMapIntensity = 2.5
      }
    })
    onLoad(group)
  }, undefined, (err) => {
    if (import.meta.env.DEV) console.warn('GLB load failed:', err)
  })
}

// ===== CLOUDS (billboard sprites — always face camera, no sphere geometry) =====
function makeCloudTex(warm: boolean): THREE.CanvasTexture {
  const sz = 128
  const c = document.createElement('canvas'); c.width = c.height = sz
  const ctx = c.getContext('2d')!
  const puffs: [number, number, number][] = [[64,64,48],[42,62,32],[86,60,30],[62,42,24],[65,82,22],[32,52,18],[95,70,16]]
  for (const [cx, cy, r] of puffs) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    if (warm) {
      g.addColorStop(0,   'rgba(255,238,210,0.92)')
      g.addColorStop(0.5, 'rgba(255,225,185,0.50)')
      g.addColorStop(1,   'rgba(255,230,200,0)')
    } else {
      g.addColorStop(0,   'rgba(248,253,255,0.94)')
      g.addColorStop(0.5, 'rgba(232,246,255,0.52)')
      g.addColorStop(1,   'rgba(220,240,255,0)')
    }
    ctx.fillStyle = g; ctx.fillRect(0, 0, sz, sz)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
const cloudTexCool = makeCloudTex(false)
const cloudTexWarm = makeCloudTex(true)
const cloudMatCool = new THREE.SpriteMaterial({ map: cloudTexCool, transparent: true, opacity: 0.82, depthWrite: false })
const cloudMatWarm = new THREE.SpriteMaterial({ map: cloudTexWarm, transparent: true, opacity: 0.65, depthWrite: false })

for (let i = 0; i < 160; i++) {
  const warm = Math.random() < 0.22
  const mat = warm ? cloudMatWarm : cloudMatCool
  const cx = (Math.random() - 0.5) * 7000
  const cz = (Math.random() - 0.5) * 7000
  const baseY = 500 + Math.random() * 1200
  const puffs = 2 + Math.floor(Math.random() * 5)
  for (let j = 0; j < puffs; j++) {
    const sp = new THREE.Sprite(mat)
    const w = 200 + Math.random() * 450
    sp.scale.set(w, w * (0.36 + Math.random() * 0.22), 1)
    sp.position.set(
      cx + (Math.random() - 0.5) * 550,
      baseY + (Math.random() - 0.5) * 130,
      cz + (Math.random() - 0.5) * 220
    )
    scene.add(sp)
  }
}

// ===== CONTRAILS =====
function makeSoftCircle(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 32
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
  g.addColorStop(0, 'rgba(240,248,255,1)')
  g.addColorStop(0.4, 'rgba(200,225,255,0.5)')
  g.addColorStop(1, 'rgba(200,225,255,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32)
  return new THREE.CanvasTexture(c)
}

const TRAIL_CAP = 300
const trailBuf = new Float32Array(TRAIL_CAP * 3)
let trailSize = 0
const trailAttr = new THREE.BufferAttribute(trailBuf, 3)
trailAttr.setUsage(THREE.DynamicDrawUsage)
const trailGeo = new THREE.BufferGeometry()
trailGeo.setAttribute('position', trailAttr)
trailGeo.setDrawRange(0, 0)
scene.add(new THREE.Points(trailGeo, new THREE.PointsMaterial({
  size: 6, sizeAttenuation: true, map: makeSoftCircle(),
  transparent: true, opacity: 0.28, depthWrite: false, color: 0xddeeff,
})))

// ===== PLAYER =====
const player = createAircraft(0x2255cc, 0x112244)
// 安全なスポーン位置（峡谷を避ける）
const safeSpawnX = 500
const safeSpawnZ = 500
player.position.set(safeSpawnX, terrainH(safeSpawnX, safeSpawnZ) + 150, safeSpawnZ)  // 初期位置を高く（90→150m）
player.rotation.y = Math.PI  // 南向き（北の山とは反対方向）に初期化
// スマホでは機体を大きく表示
if (isMobileDevice) player.scale.setScalar(1.5)
scene.add(player)
let cameraOffset = new THREE.Vector3(0, 5, 20)
const camQuat = new THREE.Quaternion()
let speed = 150  // 初期速度 150 m/s（540 km/h）操作性向上のため低速化

// ===== MOUSE / ADVANCED INPUT STATE =====
const mouseState = { nx: 0, ny: 0, leftDown: false, leftHoldTime: 0 }
let wheelSpeedTarget = 150  // 巡航速度 150 m/s（操作性向上）
let camShakeAmt = 0
let decelerateMode = false
let lastSpaceTime = 0
const multiLockTargets: Enemy[] = []
let flareBurstLeft = 0
let flareBurstTimer = 0

// バレルロール機動状態
const barrelRollState = {
  active: false,
  direction: 0,  // -1: 左, +1: 右
  progress: 0,   // 0 → 1
  duration: 0.6  // 継続時間（秒）
}

// ===== INPUT =====
const keys: Record<string, boolean> = {}
const keysJustPressed = new Set<string>()
window.addEventListener('keydown', e => {
  if (e.code === 'Tab') e.preventDefault()
  if (!keys[e.code]) keysJustPressed.add(e.code)
  keys[e.code] = true
})
window.addEventListener('keyup', e => { keys[e.code] = false })

// ===== MOUSE CONTROLS =====
renderer.domElement.addEventListener('mousemove', (e) => {
  const { w, h } = getEffectiveSize()
  mouseState.nx = (e.clientX / w - 0.5) * 2
  mouseState.ny = -((e.clientY / h - 0.5) * 2) // 上下反転：マウスを上に動かすと機体が上昇
})
renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button === 0) { mouseState.leftDown = true; mouseState.leftHoldTime = 0 }
  if (e.button === 2) handleRightLock()
})
renderer.domElement.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    if (currentMode && !missionComplete) {
      if (mouseState.leftHoldTime < 0.5) firePlayerMissile()
      else handleLeftRelease(mouseState.leftHoldTime)
    }
    mouseState.leftDown = false; mouseState.leftHoldTime = 0
  }
})
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault())
renderer.domElement.addEventListener('wheel', (e) => {
  // ホイール前（上スクロール）= deltaY < 0 → 加速
  // ホイール後ろ（下スクロール）= deltaY > 0 → 減速
  // 現在速度の±10%を変化量とする（相対値）
  const changeRate = -e.deltaY * 0.0001  // deltaY=-100で0.01（1%）の変化
  const delta = wheelSpeedTarget * changeRate
  wheelSpeedTarget = Math.max(8, Math.min(600, wheelSpeedTarget + delta))

  // 横スクロール（deltaX）でバレルロール開始
  if (Math.abs(e.deltaX) > 1 && !barrelRollState.active && currentMode !== null) {
    barrelRollState.active = true
    barrelRollState.direction = e.deltaX > 0 ? 1 : -1  // 右: +1, 左: -1
    barrelRollState.progress = 0
  }
}, { passive: true })

// ===== TOUCH INPUT =====
const touchState = {
  pitch: 0, yaw: 0,
  boost: false, brake: false, gun: false,
  missilePressed: false, flarePressed: false, lockPressed: false,
  cameraYaw: 0, cameraPitch: 0,  // 視点操作用
}

function setupTouchControls() {
  const zone = document.getElementById('joystick-zone')!
  const base = document.getElementById('joystick-base')!
  const knob = document.getElementById('joystick-knob')!
  const MAX_R = 52

  let joyId: number | null = null
  let ox = 0, oy = 0

  zone.addEventListener('touchstart', (e) => {
    e.preventDefault()
    initAudio()
    const t = e.changedTouches[0]
    joyId = t.identifier; ox = t.clientX; oy = t.clientY
    // 縦持ち強制横向き時: body(landscape座標系)に変換して配置
    // viewport(px,py) → element_local(x=py, y=W-px) where W=innerWidth
    const portrait = isPortraitMode()
    const W = window.innerWidth
    const bx = portrait ? oy       : ox
    const by = portrait ? (W - ox) : oy
    base.style.left = bx + 'px'; base.style.top = by + 'px'; base.style.opacity = '1'
    knob.style.left = bx + 'px'; knob.style.top  = by + 'px'; knob.style.opacity = '1'
  }, { passive: false })

  zone.addEventListener('touchmove', (e) => {
    e.preventDefault()
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== joyId) continue
      const portrait = isPortraitMode()
      // 縦持ち時: viewport dx/dy → landscape ldx/ldy に変換
      let ldx = portrait ? (t.clientY - oy) : (t.clientX - ox)
      let ldy = portrait ? -(t.clientX - ox) : (t.clientY - oy)
      const d = Math.hypot(ldx, ldy)
      if (d > MAX_R) { ldx = ldx/d*MAX_R; ldy = ldy/d*MAX_R }
      touchState.yaw   =  ldx / MAX_R
      touchState.pitch = -ldy / MAX_R
      // ノブのCSS位置（landscape座標系）: base + delta
      const W = window.innerWidth
      knob.style.left = (portrait ? oy + ldx            : ox + ldx) + 'px'
      knob.style.top  = (portrait ? (W - ox) + ldy      : oy + ldy) + 'px'
    }
  }, { passive: false })

  const endJoy = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== joyId) continue
      joyId = null
      touchState.yaw = touchState.pitch = 0
      base.style.opacity = '0'; knob.style.opacity = '0'
    }
  }
  zone.addEventListener('touchend',   endJoy, { passive: false })
  zone.addEventListener('touchcancel', endJoy, { passive: false })

  function holdBtn(id: string, set: (v: boolean) => void) {
    const el = document.getElementById(id)!
    el.addEventListener('touchstart', e => { e.preventDefault(); set(true);  el.classList.add('pressed') }, { passive: false })
    el.addEventListener('touchend',   e => { e.preventDefault(); set(false); el.classList.remove('pressed') }, { passive: false })
    el.addEventListener('touchcancel',() => { set(false); el.classList.remove('pressed') })
  }

  function tapBtn(id: string, fire: () => void) {
    const el = document.getElementById(id)!
    el.addEventListener('touchstart', e => {
      e.preventDefault(); initAudio(); fire()
      el.classList.add('pressed')
      setTimeout(() => el.classList.remove('pressed'), 150)
    }, { passive: false })
  }

  holdBtn('btn-boost', v => { touchState.boost = v })
  holdBtn('btn-brake', v => { touchState.brake = v })
  holdBtn('btn-gun',   v => { touchState.gun = v; if (v) initAudio() })
  tapBtn('btn-msl',  () => { touchState.missilePressed = true })
  tapBtn('btn-flr',  () => { touchState.flarePressed   = true })
  tapBtn('btn-lock', () => { touchState.lockPressed    = true })

  // 右側：視点操作ゾーン
  const camZone = document.getElementById('camera-zone')!
  let camTouchId: number | null = null
  let camStartX = 0, camStartY = 0

  camZone.addEventListener('touchstart', (e) => {
    e.preventDefault()
    const t = e.changedTouches[0]
    camTouchId = t.identifier
    camStartX = t.clientX
    camStartY = t.clientY
  }, { passive: false })

  camZone.addEventListener('touchmove', (e) => {
    e.preventDefault()
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== camTouchId) continue
      const portrait = isPortraitMode()
      // 縦持ち時: viewport delta → landscape delta に変換
      const dx = portrait ? (t.clientY - camStartY) : (t.clientX - camStartX)
      const dy = portrait ? -(t.clientX - camStartX) : (t.clientY - camStartY)
      touchState.cameraYaw = dx / 200
      touchState.cameraPitch = -dy / 200
    }
  }, { passive: false })

  const endCam = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== camTouchId) continue
      camTouchId = null
      touchState.cameraYaw = touchState.cameraPitch = 0
    }
  }
  camZone.addEventListener('touchend',   endCam, { passive: false })
  camZone.addEventListener('touchcancel', endCam, { passive: false })
}
setupTouchControls()

// 横画面ロック（対応デバイスのみ）
if (screen.orientation && typeof (screen.orientation as any).lock === 'function') {
  ;(screen.orientation as any).lock('landscape').catch(() => {})
}

// ===== AUDIO =====
let audioCtx: AudioContext | null = null
let engineOsc: OscillatorNode | null = null
let engineGain: GainNode | null = null
let audioReady = false
let audioEnabled = false  // デフォルトは消音

function initAudio() {
  if (audioReady || !audioEnabled) return
  audioReady = true
  audioCtx = new AudioContext()
  audioCtx.resume()  // iOS Safari: AudioContext starts suspended, must resume explicitly
  const ctx = audioCtx
  engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 70
  const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 320; lpf.Q.value = 1.5
  engineGain = ctx.createGain(); engineGain.gain.value = 0.06
  engineOsc.connect(lpf); lpf.connect(engineGain); engineGain.connect(ctx.destination); engineOsc.start()
}

function updateEngineSound(spd: number, boost: boolean) {
  if (!audioCtx || !engineOsc || !engineGain) return
  const t = audioCtx.currentTime
  engineOsc.frequency.setTargetAtTime(50 + spd * 2.5 + (boost ? 55 : 0), t, 0.1)
  engineGain.gain.setTargetAtTime(0.05 + (boost ? 0.05 : 0), t, 0.1)
}

function mkNoise(dur: number): AudioBuffer {
  const ctx = audioCtx!
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return buf
}

function playGunSound() {
  if (!audioCtx) return
  const buf = mkNoise(0.04); const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] *= (1 - i / d.length)
  const src = audioCtx.createBufferSource(); src.buffer = buf
  const f = audioCtx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.6
  const g = audioCtx.createGain(); g.gain.value = 0.18
  src.connect(f); f.connect(g); g.connect(audioCtx.destination); src.start()
}

function playMissileSound() {
  if (!audioCtx) return
  const ctx = audioCtx; const osc = ctx.createOscillator(); osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(120, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.12)
  osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.9)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.4, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.0)
  osc.connect(g); g.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 1.0)
}

function playFlareSound() {
  if (!audioCtx) return
  const buf = mkNoise(0.09); const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] *= Math.exp(-i / (d.length * 0.12))
  const src = audioCtx.createBufferSource(); src.buffer = buf
  const f = audioCtx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500
  const g = audioCtx.createGain(); g.gain.value = 0.28
  src.connect(f); f.connect(g); g.connect(audioCtx.destination); src.start()
}


function playExplosionSound(scale = 1.0) {
  if (!audioCtx) return
  const buf = mkNoise(0.8); const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] *= Math.exp(-i / (d.length * 0.18)) * scale
  const src = audioCtx.createBufferSource(); src.buffer = buf
  const f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260
  const g = audioCtx.createGain(); g.gain.value = Math.min(1.0, 0.6 * scale)
  src.connect(f); f.connect(g); g.connect(audioCtx.destination); src.start()
}

// ===== MULTIPLAYER =====
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''
const MP_READY = !!(SUPABASE_URL && SUPABASE_ANON_KEY)
let mpClient: MultiplayerClient | null = null

// ===== GAME OBJECTS =====
type GameMode = 'dogfight' | 'souryokusen' | 'free'
type FlightMode = 'arcade' | 'realistic'
let currentMode: GameMode | null = null
let flightMode: FlightMode = 'arcade'  // デフォルトはアーケード（水平旋回）
let isPaused = false  // ポーズ状態
// dogfight: player spawn position (ally side)
let dfSpawnX = 0, dfSpawnZ = 0
let missionComplete = false
let modeObjectiveTotal = 0
let modeObjectiveKilled = 0

interface Projectile { mesh: THREE.Object3D; vel: THREE.Vector3; life: number }
interface HomingMissile extends Projectile { mesh: THREE.Group; target: THREE.Object3D | null; diverted: boolean; spd: number; turnRate: number; light: THREE.PointLight | null }
interface Enemy {
  group: THREE.Group;
  health: number;
  fireCooldown: number;
  gunCooldown: number;
  missileAmmo: number;
  seekingSupply: boolean;
  evadeDelay: number;
  lastPos: THREE.Vector3;
  velocity: THREE.Vector3;
  currentSpeed: number;
  tacticType: number;
  preferredDistance: number;
  preferredHeightOffset: number;
  spawnZone?: string;  // スポーンしたゾーン（戦術に影響）
}
interface Ally { group: THREE.Group; health: number; fireCooldown: number; missileAmmo: number }
interface Explosion { particles: Array<{ mesh: THREE.Mesh; vel: THREE.Vector3 }>; life: number }
interface GroundTarget {
  group: THREE.Group; health: number; maxHealth: number; vel: THREE.Vector3
  type?: 'ship'|'tank'|'sam'|'bomber'|'heli'|'battleship'|'turret'
  fireCooldown?: number   // SAM/砲台専用: 発射クールダウン
  smokeTimer?: number     // 煙エフェクトタイマー
  patrolAngle?: number    // ヘリ専用: 旋回角度
  patrolCenter?: THREE.Vector3  // ヘリ専用: 旋回中心
  attachedTo?: string     // 砲台専用: どのゾーンに付属しているか
  turretRotation?: number // 砲台専用: 砲塔の回転角度
}
interface SmokeParticle { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; maxLife: number }
interface MissileTrail { mesh: THREE.Mesh; life: number }

const bullets: Projectile[] = []
const enemyBullets: Projectile[] = []
const playerMissiles: HomingMissile[] = []
const enemyMissiles: HomingMissile[] = []
const allyMissiles: HomingMissile[] = []
const flares: Projectile[] = []
const enemies: Enemy[] = []
const allies: Ally[] = []
const smokeParticles: SmokeParticle[] = []
const missileTrails: MissileTrail[] = []  // ミサイル軌跡パーティクル
const heliBlades: THREE.Group[] = []  // ヘリローター回転用
const explosions: Explosion[] = []
const groundTargets: GroundTarget[] = []

let dfAllyCount = 2
let dfEnemyCount = 3

// MAP別のDogfight初期敵数
const DOGFIGHT_INITIAL_ENEMIES: Record<GameMap, number> = {
  original: 5,
  tokyo: 7,    // 広いMAPなので多め
  space: 7
}

let missileAmmo = 6, flareAmmo = 3, score = 0
let gunCooldown = 0, pMissileCooldown = 0, flareCooldown = 0
let gunFireTime = 0  // マシンガンを連続発射している時間
let gunLeadPosition: THREE.Vector3 | null = null  // マシンガン予測位置（表示用）
let hitFlashTimer = 0, gunSoundCooldown = 0, trailFrame = 0, radarFrame = 0
let lockedTarget: { group: THREE.Group } | null = null  // Enemy | GroundTarget どちらもロック可能
let playerHP = 3, invincibleTimer = 0, respawnFlash = 0, respawnTimer = 0
let boundaryWarningTimer = 0
const MAX_HP = 3

const bulletMat = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffdd00, emissiveIntensity: 28.0, roughness: 0.1, metalness: 0 })
const enemyBulletMat = new THREE.MeshStandardMaterial({ color: 0xff3300, emissive: 0xff1100, emissiveIntensity: 24.0, roughness: 0.1, metalness: 0 })

// ===== SHARED GEOMETRIES (avoid per-shot allocation) =====
const _playerBulletGeo = new THREE.SphereGeometry(0.5, 6, 6)
const _enemyBulletGeo  = new THREE.SphereGeometry(0.4, 6, 6)

// ===== SCRATCH VECTORS / QUATERNIONS (avoid per-frame allocation) =====
const _sv1    = new THREE.Vector3()
const _sv2    = new THREE.Vector3()
const _sq1    = new THREE.Quaternion()
const _sEuler = new THREE.Euler()

// ===== HUD RAYCASTER (module-level, not per-frame) =====
const _hudRaycaster = new THREE.Raycaster()
let   _hudFrameCount = 0
const _hudOcclusionCache = new Map<THREE.Group, boolean>()

// ===== MISSILE TRAIL POOL =====
const _trailGeo = new THREE.SphereGeometry(0.3, 4, 4)
const _trailBaseMat = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.8 })
const TRAIL_POOL_SIZE = 60
const _trailPool: THREE.Mesh[] = []
for (let _ti = 0; _ti < TRAIL_POOL_SIZE; _ti++) {
  const _tm = new THREE.Mesh(_trailGeo, _trailBaseMat.clone())
  _tm.visible = false
  scene.add(_tm)
  _trailPool.push(_tm)
}
let _trailPoolIdx = 0
const playerMissileMat = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 20.0, roughness: 0.2, metalness: 0.9 })
const enemyMissileMat = new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xcc2200, emissiveIntensity: 2.0, roughness: 0.5, metalness: 0.3 })
const allyMissileMat  = new THREE.MeshStandardMaterial({ color: 0x44ff88, emissive: 0x00cc44, emissiveIntensity: 3.0, roughness: 0.5, metalness: 0.3 })
const _fwd = new THREE.Vector3(0, 0, -1)

// ===== LOCK-ON =====
function cycleLock() {
  const allTargets: Array<{ group: THREE.Group }> = [...enemies, ...groundTargets]
  if (!allTargets.length) { lockedTarget = null; return }
  if (!lockedTarget || !allTargets.includes(lockedTarget)) {
    lockedTarget = allTargets.reduce((n, t) =>
      t.group.position.distanceTo(player.position) < n.group.position.distanceTo(player.position) ? t : n)
    return
  }
  const idx = allTargets.indexOf(lockedTarget)
  lockedTarget = idx >= allTargets.length - 1 ? null : allTargets[idx + 1]
}

// ===== ENEMIES =====
function spawnEnemyAt(sx: number, sz: number) {
  const group = createAircraft(0xcc2222, 0x661111)
  const spawnY = currentMap === 'space'
    ? THREE.MathUtils.clamp(player.position.y + (Math.random() - 0.5) * 360, -520, 620)
    : currentMap === 'tokyo'
    ? Math.max(terrainH(sx, sz) + 240, 520 + Math.random() * 260)
    : terrainH(sx, sz) + 75 + Math.random() * 55
  group.position.set(sx, spawnY, sz)

  // 前方が開けた方向を向く（南側にスポーンするので北向き）
  if (currentMode === 'dogfight') {
    group.rotation.y = 0  // 北向き（z負方向）
  }

  scene.add(group)

  // 戦術タイプに応じた個性付け
  const tacticType = enemies.length % 4
  let preferredDistance, preferredHeightOffset

  switch (tacticType) {
    case 0:  // 後方追跡型
      preferredDistance = 100
      preferredHeightOffset = 0
      break
    case 1:  // 側面攻撃型
      preferredDistance = 120
      preferredHeightOffset = 5
      break
    case 2:  // 高高度型
      preferredDistance = 150
      preferredHeightOffset = 25
      break
    case 3:  // 接近戦型
      preferredDistance = 80
      preferredHeightOffset = -5
      break
    default:
      preferredDistance = 100
      preferredHeightOffset = 0
  }

  // ゾーン情報を取得（宇宙MAPの場合）
  let spawnZone: string | undefined = undefined
  if (currentMap === 'space' && spaceZones.length > 0) {
    // 最も近いゾーンを判定
    let nearestZone: string | null = null
    let minDist = Infinity
    for (const zone of spaceZones) {
      const dist = group.position.distanceTo(new THREE.Vector3(zone.position.x, zone.position.y, zone.position.z))
      if (dist < 600 && dist < minDist) {
        minDist = dist
        nearestZone = zone.zone_id
      }
    }
    if (nearestZone) spawnZone = nearestZone
  }

  enemies.push({
    group, health: 2, fireCooldown: 8 + Math.random() * 7, gunCooldown: Math.random() * 0.5,
    missileAmmo: 4, seekingSupply: false, evadeDelay: 0,
    lastPos: group.position.clone(), velocity: new THREE.Vector3(),
    currentSpeed: 150,
    tacticType,
    preferredDistance,
    preferredHeightOffset,
    spawnZone
  })
}

function spawnEnemy() {
  if (currentMap === 'space') {
    // スポーンポイントがあればゾーン相対座標を使用
    if (spaceSpawnPoints && spaceSpawnPoints.enemy.length > 0) {
      const spawnDef = spaceSpawnPoints.enemy[Math.floor(Math.random() * spaceSpawnPoints.enemy.length)]
      const zone = spaceZones.find(z => z.zone_id === spawnDef.zone)
      if (zone) {
        const sx = zone.position.x + spawnDef.offset.x + (Math.random() - 0.5) * 80
        const sz = zone.position.z + spawnDef.offset.z + (Math.random() - 0.5) * 80
        spawnEnemyAt(sx, sz)
        return
      }
    }
    // フォールバック: 前方600m-1200mに散らす
    const fwdDir = new THREE.Vector3(0, 0, -1).applyQuaternion(player.quaternion)
    const dist = 600 + Math.random() * 600
    const spreadX = (Math.random() - 0.5) * 400
    const spawnX = player.position.x + fwdDir.x * dist + spreadX
    const spawnZ = player.position.z + fwdDir.z * dist
    spawnEnemyAt(spawnX, spawnZ)
    return
  }
  if (currentMap === 'tokyo') {
    const anchors = [
      { x: 520, z: -360 },
      { x: 940, z: 520 },
      { x: 1760, z: 1540 },
      { x: -460, z: 1740 },
    ]
    const p = anchors[Math.floor(Math.random() * anchors.length)]
    spawnEnemyAt(p.x + (Math.random() - 0.5) * 520, p.z + (Math.random() - 0.5) * 520)
    return
  }
  const angle = Math.random() * Math.PI * 2
  spawnEnemyAt(Math.cos(angle) * (220 + Math.random() * 220), Math.sin(angle) * (220 + Math.random() * 220))
}

function spawnAlly(sx: number, sz: number) {
  const group = createAircraft(0x22cc55, 0x116633)

  // 宇宙MAPでは左右後方に編隊配置
  if (currentMap === 'space') {
    const side = allies.length % 2 === 0 ? 1 : -1
    const offset = (Math.floor(allies.length / 2) + 1) * 80
    const backDir = new THREE.Vector3(0, 0, 1).applyQuaternion(player.quaternion)
    const rightDir = new THREE.Vector3(1, 0, 0).applyQuaternion(player.quaternion)
    const spawnPos = player.position.clone()
      .add(backDir.multiplyScalar(120 + Math.random() * 60))
      .add(rightDir.multiplyScalar(side * offset))
    group.position.copy(spawnPos)
    group.position.y = THREE.MathUtils.clamp(player.position.y + (Math.random() - 0.5) * 80, -420, 520)
    // プレイヤーと同じ方向を向く
    group.quaternion.copy(player.quaternion)
  } else {
    const spawnY = currentMap === 'tokyo'
      ? Math.max(terrainH(sx, sz) + 220, 660 + Math.random() * 120)
      : terrainH(sx, sz) + 75 + Math.random() * 55
    group.position.set(sx, spawnY, sz)
    // 前方が開けた方向を向く（北側にスポーンするので南向き）
    group.rotation.y = Math.PI  // 南向き（z正方向）
  }

  scene.add(group)
  allies.push({ group, health: 2, fireCooldown: 3 + Math.random() * 3, missileAmmo: 8 })
}

function fireAllyMissile(ally: Ally, target: Enemy) {
  const mesh = createMissileModel(allyMissileMat)
  mesh.position.copy(ally.group.position)
  const toTarget = target.group.position.clone().sub(ally.group.position).normalize()
  mesh.quaternion.setFromUnitVectors(_fwd, toTarget)
  scene.add(mesh)
  allyMissiles.push({ mesh, vel: toTarget.clone().multiplyScalar(90), life: 14, target: target.group, diverted: false, spd: 140, turnRate: 3.5, light: null })  // 追尾性能向上: spd 110→140, turnRate 2.5→3.5
}

function killEnemy(ei: number) {
  const dead = enemies[ei]
  if (lockedTarget === dead) lockedTarget = null
  const mli = multiLockTargets.indexOf(dead)
  if (mli !== -1) multiLockTargets.splice(mli, 1)
  createExplosion(dead.group.position.clone(), 2.0)
  playExplosionSound(1.5)
  scene.remove(enemies[ei].group)
  enemies.splice(ei, 1)
  score++; scoreEl.textContent = score.toString()
  if (currentMode === 'dogfight' || currentMode === 'souryokusen') setTimeout(() => spawnEnemy(), 4000)
}

function updateAllies(dt: number) {
  for (let i = 0; i < allies.length; i++) {
    const ally = allies[i]
    let target: Enemy | null = null
    let minDist = Infinity
    for (const e of enemies) {
      const d = e.group.position.distanceTo(ally.group.position)
      if (d < minDist) { minDist = d; target = e }
    }

    let tx: number, ty: number, tz: number
    if (target) {
      // 味方も攻撃的AI：敵を積極的に追跡
      const toTarget = target.group.position.clone().sub(ally.group.position)
      const dist = toTarget.length()

      // 味方は後方追跡型（敵の6時方向を狙う）
      const targetFwd = _fwd.clone().applyQuaternion(target.group.quaternion)
      const behindPos = target.group.position.clone().add(targetFwd.multiplyScalar(-120))
      tx = behindPos.x
      tz = behindPos.z
      ty = target.group.position.y + 5

      // ミサイル発射判定
      ally.fireCooldown -= dt
      const angleToTarget = Math.acos(
        toTarget.clone().normalize().dot(
          _fwd.clone().applyQuaternion(ally.group.quaternion)
        )
      )
      if (ally.fireCooldown <= 0 && ally.missileAmmo > 0 && dist > 150 && dist < 350 && angleToTarget < Math.PI / 5) {
        ally.missileAmmo--
        ally.fireCooldown = 5 + Math.random() * 5
        fireAllyMissile(ally, target)
      }
    } else {
      // 敵がいない場合はプレイヤーの後方を編隊飛行
      const formationOffset = new THREE.Vector3(
        (i % 2 === 0 ? 1 : -1) * 40,  // 左右に配置
        -10,
        80 + Math.floor(i / 2) * 50  // 後方に配置
      )
      const formationPos = player.position.clone().add(
        formationOffset.applyQuaternion(player.quaternion)
      )
      tx = formationPos.x
      tz = formationPos.z
      ty = formationPos.y
    }

    const dir = new THREE.Vector3(tx - ally.group.position.x, ty - ally.group.position.y, tz - ally.group.position.z)
    if (dir.length() > 0.5) {
      dir.normalize()
      ally.group.position.addScaledVector(dir, 190 * dt)  // 味方機も190m/s（684km/h）で移動
      ally.group.position.y = Math.max(terrainH(ally.group.position.x, ally.group.position.z) + 12, ally.group.position.y)
      const flat = new THREE.Vector3(dir.x, 0, dir.z)
      if (flat.lengthSq() > 0.01) ally.group.quaternion.slerp(
        new THREE.Quaternion().setFromUnitVectors(_fwd, flat.normalize()), 0.09
      )
    }
  }
}

// 敵はstartGame()で生成される

// ===== WEAPONS =====
// マシンガン予測照準：敵の移動先を先読みして照準
// 予測機能を一旦無効化（2026-05-12）
/*
function calculateGunLeadPosition(target: { group: THREE.Group }): THREE.Vector3 | null {
  const bulletSpeed = 230  // マシンガン弾速
  const targetPos = target.group.position.clone()
  const toTarget = targetPos.clone().sub(player.position)
  const dist = toTarget.length()
  const timeToHit = dist / bulletSpeed

  // 敵の速度を推定（前フレームとの位置差から）
  // 簡易版：敵は約180m/sで旋回移動と仮定
  const enemyVel = new THREE.Vector3(
    Math.sin(Date.now() * 0.0001) * 180,
    Math.sin(Date.now() * 0.00015) * 50,
    Math.cos(Date.now() * 0.0001) * 180
  )

  // 予測位置 = 現在位置 + 速度 * 到達時間
  return targetPos.add(enemyVel.multiplyScalar(timeToHit))
}
*/

function fireGun() {
  if (gunCooldown > 0) return
  gunCooldown = 0.08
  if (!audioReady) initAudio()

  const fwd = _fwd.clone().applyQuaternion(player.quaternion)
  let aimDir = fwd.clone()

  // 1秒以上連続発射している場合、ロック中の敵への高精度予測射撃を行う
  if (gunFireTime > 1.0 && lockedTarget) {
    const targetPos = lockedTarget.group.position.clone()
    let targetVel = new THREE.Vector3()

    // 敵の実際の速度ベクトルを使用（高精度予測）
    const enemy = enemies.find(e => e.group === lockedTarget!.group)
    if (enemy) {
      targetVel.copy(enemy.velocity)
    } else {
      // 地上目標の場合は速度ベクトルを使用
      const gt = groundTargets.find(g => g.group === lockedTarget!.group)
      if (gt && gt.vel) {
        targetVel.copy(gt.vel)
      }
    }

    const bulletSpeed = 700

    // 距離と相対速度から到達時間を反復計算（より正確）
    let dist = targetPos.distanceTo(player.position)
    let timeToHit = dist / bulletSpeed
    let leadPos = targetPos.clone()

    // 3回反復して精度向上
    for (let iter = 0; iter < 3; iter++) {
      leadPos = targetPos.clone().add(targetVel.clone().multiplyScalar(timeToHit))
      dist = leadPos.distanceTo(player.position)
      timeToHit = dist / bulletSpeed
    }

    // 重力による弾道落下を補正（遠距離ほど影響大）
    const gravity = 9.8
    const drop = 0.5 * gravity * timeToHit * timeToHit
    leadPos.y += drop * 0.3  // 重力補正（30%適用）

    const toLeadPos = leadPos.clone().sub(player.position).normalize()

    // 前方60度以内なら予測照準を適用
    if (fwd.angleTo(toLeadPos) < Math.PI / 3) {
      aimDir = toLeadPos
      gunLeadPosition = leadPos.clone()  // 予測位置を保存（表示用）
    } else {
      gunLeadPosition = null
    }
  } else {
    gunLeadPosition = null
  }

  for (const side of [-0.7, 0.7]) {
    const offset = new THREE.Vector3(side, 0, -3).applyQuaternion(player.quaternion)
    const mesh = new THREE.Mesh(_playerBulletGeo, bulletMat)
    mesh.position.copy(player.position).add(offset)
    scene.add(mesh)
    const playerVel = _fwd.clone().applyQuaternion(player.quaternion).multiplyScalar(speed)
    bullets.push({ mesh, vel: aimDir.clone().multiplyScalar(700).add(playerVel), life: 1.8 })
  }
  if (gunSoundCooldown <= 0) { playGunSound(); gunSoundCooldown = 0.06 }
  // 砲口フラッシュ削除（パフォーマンス最適化：ミサイル発射時のフリーズ防止）
}

function firePlayerMissile() {
  if (pMissileCooldown > 0 || missileAmmo <= 0) return
  if (!audioReady) initAudio()
  pMissileCooldown = 1.5; missileAmmo--
  missileEl.textContent = missileAmmo.toString()
  updatePips(missilePips, missileAmmo, 'on')
  updateMobileAmmo()  // スマホ版ボタン内の残量更新

  const target: THREE.Object3D | null = lockedTarget?.group ?? (() => {
    let nearest: THREE.Object3D | null = null, minD = Infinity
    for (const e of enemies) { const d = e.group.position.distanceTo(player.position); if (d < minD) { minD = d; nearest = e.group } }
    for (const gt of groundTargets) { const d = gt.group.position.distanceTo(player.position); if (d < minD) { minD = d; nearest = gt.group } }
    return nearest
  })()

  const mesh = createMissileModel(playerMissileMat)
  mesh.position.copy(player.position).add(new THREE.Vector3(0, -0.5, 2).applyQuaternion(player.quaternion))
  mesh.quaternion.copy(player.quaternion)
  scene.add(mesh)
  // プレイヤーミサイルに明るい発光ライトを追加（視認性向上）
  const missileLight = new THREE.PointLight(0xffff00, 15, 50)
  missileLight.position.copy(mesh.position)
  scene.add(missileLight)
  // ミサイル速度 = プレイヤー速度 + 相対速度200 m/s
  const missileAbsoluteSpeed = speed + 200
  playerMissiles.push({ mesh, vel: _fwd.clone().applyQuaternion(player.quaternion).multiplyScalar(missileAbsoluteSpeed), life: 12, target, diverted: false, spd: missileAbsoluteSpeed, turnRate: 3.5, light: missileLight })
  camShakeAmt = Math.max(camShakeAmt, 0.22)
  playMissileSound()
}

function fireEnemyMissile(enemy: Enemy) {
  if (enemy.missileAmmo <= 0) return
  enemy.missileAmmo--
  const mesh = createMissileModel(enemyMissileMat)
  mesh.position.copy(enemy.group.position)
  // 味方がいる場合、40%の確率で味方を狙う（チーム戦らしさ）
  let target: THREE.Object3D = player
  if (currentMode === 'dogfight' && allies.length > 0 && Math.random() < 0.40) {
    target = allies[Math.floor(Math.random() * allies.length)].group
  }
  const toTarget = target.position.clone().sub(enemy.group.position).normalize()
  mesh.quaternion.setFromUnitVectors(_fwd, toTarget)
  scene.add(mesh)
  // 敵ミサイル速度 = 敵速度180 + 相対速度120 = 300 m/s
  const enemyMissileSpeed = 180 + 120
  enemyMissiles.push({ mesh, vel: toTarget.clone().multiplyScalar(enemyMissileSpeed), life: 15, target, diverted: false, spd: enemyMissileSpeed, turnRate: 0.85, light: null })
}

function _dropSingleFlare() {
  // フレア放出（消費はtriggerFlareBurstで1個のみ）
  const mat = new THREE.MeshStandardMaterial({ color: 0xff8800, emissive: 0xff5500, emissiveIntensity: 9.0, roughness: 0.4 })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.32, 7, 7), mat)
  mesh.position.copy(player.position).add(new THREE.Vector3((Math.random()-0.5)*1.5, -0.5, 2.5).applyQuaternion(player.quaternion))
  scene.add(mesh)
  // PointLight削除（パフォーマンス最適化：フリーズ防止）
  const backward = new THREE.Vector3(0, 0, 4).applyQuaternion(player.quaternion)
  backward.add(new THREE.Vector3((Math.random()-0.5)*32, -5+Math.random()*10, (Math.random()-0.5)*32))
  flares.push({ mesh, vel: backward, life: 7.0 })
  playFlareSound()
}

function triggerFlareBurst() {
  if (flareCooldown > 0 || flareAmmo <= 0) return
  if (!audioReady) initAudio()
  flareCooldown = 1.2
  flareBurstLeft = 3  // 常に3個放出
  flareBurstTimer = 0
  flareAmmo--  // 消費は1個のみ
  flareEl.textContent = flareAmmo.toString()
  updatePips(flarePips, flareAmmo, 'flare-on')
  updateMobileAmmo()  // スマホ版ボタン内の残量更新
}

/**
 * MAP種別に応じた地形遮蔽判定（宇宙MAPではfalse）
 */
function isBlockedByMapGeometry(raycaster: THREE.Raycaster): boolean {
  if (currentMap === 'space') {
    // 宇宙マップ: 小惑星とゾーン構造物で遮蔽判定
    // 見えるものは物理的に存在する（ミサイル・弾丸も当たる）
    const hits: THREE.Intersection[] = []
    if (spaceAsteroids) {
      hits.push(...raycaster.intersectObject(spaceAsteroids, false))
    }
    if (spaceIndividualAsteroids.length > 0) {
      hits.push(...raycaster.intersectObjects(spaceIndividualAsteroids, false))
    }
    if (spaceZoneGroups.length > 0) {
      hits.push(...raycaster.intersectObjects(spaceZoneGroups, true))
    }
    return hits.length > 0
  }
  if (currentMap === 'tokyo' && neoTokyoMapSystem) {
    return raycaster.intersectObjects(neoTokyoMapSystem.getCollisionObjects(), true).length > 0
  }
  if (!ground || !ground.parent) return false
  return raycaster.intersectObject(ground, false).length > 0
}

function handleRightLock() {
  if (!currentMode || missionComplete) return
  if (lockedTarget) { lockedTarget = null; return }
  const fwdWorld = _fwd.clone().applyQuaternion(player.quaternion)
  let best: { group: THREE.Group } | null = null, bestScore = -Infinity
  const allTargets: Array<{ group: THREE.Group }> = [...enemies, ...groundTargets]

  // レイキャスター for地形遮蔽判定
  const raycaster = new THREE.Raycaster()

  for (const t of allTargets) {
    const toT = t.group.position.clone().sub(player.position)
    const dist = toT.length()
    if (dist > MISSILE_LOCK_RANGE) continue
    const toTNorm = toT.normalize()
    const dot = toTNorm.dot(fwdWorld)
    // 地上目標は前方90度（dot > 0）、航空機は前方60度（dot > 0.5）
    const isGround = groundTargets.some(gt => gt === t)
    const minDot = isGround ? 0 : 0.5
    if (dot > minDot) {
      raycaster.set(player.position, toTNorm)
      raycaster.far = dist - 5
      if (isBlockedByMapGeometry(raycaster)) continue

      const sc = dot - dist / MISSILE_LOCK_RANGE * 0.25
      if (sc > bestScore) { bestScore = sc; best = t }
    }
  }
  lockedTarget = best
}

function handleLeftRelease(holdTime: number) {
  if (!currentMode || missionComplete) return
  if (holdTime >= 2.0) {
    // Multi-lock: add up to 4 enemies in front arc
    multiLockTargets.length = 0
    const fwdWorld = _fwd.clone().applyQuaternion(player.quaternion)
    const raycaster = new THREE.Raycaster()
    const sorted = enemies.slice().filter(e => {
      const toE = e.group.position.clone().sub(player.position)
      const dist = toE.length()
      if (dist > MISSILE_LOCK_RANGE || toE.normalize().dot(fwdWorld) <= 0.2) return false
      // 地形遮蔽チェック
      raycaster.set(player.position, toE.normalize())
      raycaster.far = dist - 5
      return !isBlockedByMapGeometry(raycaster)
    }).sort((a, b) => a.group.position.distanceTo(player.position) - b.group.position.distanceTo(player.position))
    multiLockTargets.push(...sorted.slice(0, 4))
    // Sequential fire
    multiLockTargets.forEach((e, i) => {
      setTimeout(() => {
        if (missileAmmo > 0 && enemies.includes(e)) firePlayerMissile()
      }, i * 320)
    })
  } else {
    // Hold 0.5–2s = scan lock
    handleRightLock()
  }
}

// ===== GROUND TARGET MODELS =====
// ═══════════════════════════════════════════════════════
//  WORLD STRUCTURE BUILDERS
//  function宣言はホイストされるため、上部の配置呼び出しより
//  後に定義しても実行時には問題ない
// ═══════════════════════════════════════════════════════

function mkRunwayTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 256; c.height = 1024
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#1c1c20'; ctx.fillRect(0, 0, 256, 1024)
  // 中央線（破線）
  for (let y = 60; y < 960; y += 90) {
    ctx.fillStyle = '#d8d8d0'; ctx.fillRect(120, y, 16, 48)
  }
  // 閾値マーキング
  for (const yOff of [16, 994]) {
    for (let x = 36; x < 220; x += 30) {
      ctx.fillStyle = '#e0e0d8'; ctx.fillRect(x, yOff, 18, 14)
    }
  }
  // エッジライン
  ctx.fillStyle = '#c8c8c0'
  ctx.fillRect(18, 0, 4, 1024); ctx.fillRect(234, 0, 4, 1024)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace
  return t
}

const _runwayTex = mkRunwayTex()  // 共有テクスチャ

function addRunway(cx: number, cz: number, length: number, rotY: number): void {
  const w = 32, g2 = new THREE.Group()
  const deck = new THREE.Mesh(
    new THREE.PlaneGeometry(w, length),
    new THREE.MeshStandardMaterial({ map: _runwayTex, roughness: 0.98, metalness: 0 })
  )
  deck.rotation.x = -Math.PI / 2; deck.receiveShadow = true; g2.add(deck)
  // 誘導灯（両サイド交互に白/赤）
  for (let i = -length/2 + 20; i < length/2; i += 24) {
    for (const side of [-w/2 - 1.8, w/2 + 1.8]) {
      const col = Math.abs(i) < 80 ? 0xff3300 : 0xeeeedd
      const lm = new THREE.Mesh(new THREE.SphereGeometry(0.45, 5, 5),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 10 }))
      lm.position.set(side, 0.35, i); g2.add(lm)
    }
  }
  g2.position.set(cx, terrainH(cx, cz) + 0.3, cz); g2.rotation.y = rotY; scene.add(g2)
}

function addHangar(cx: number, cz: number, w: number, h: number, d: number, rotY: number, baseY: number): void {
  if (glbHangar) {
    // GLB hangar: W≈38, D≈28, arch height≈20m
    const inst = glbHangar.clone()
    inst.scale.set(w / 38, h / 20, d / 28)
    inst.position.set(cx, baseY, cz)
    inst.rotation.y = rotY
    scene.add(inst)
    return
  }
  const g2 = new THREE.Group()
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.58, d), milGreen)
  wall.position.y = h * 0.29; wall.castShadow = true; wall.receiveShadow = true; g2.add(wall)
  const roofGeo = new THREE.CylinderGeometry(w * 0.52, w * 0.52, d, 14, 1, false, 0, Math.PI)
  roofGeo.rotateZ(Math.PI / 2)
  const roof = new THREE.Mesh(roofGeo, steelMat)
  roof.position.y = h * 0.56; roof.castShadow = true; g2.add(roof)
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w * 0.68, h * 0.52, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8, metalness: 0.5 }))
  frame.position.set(0, h * 0.26, -d / 2); g2.add(frame)
  g2.position.set(cx, baseY, cz); g2.rotation.y = rotY; scene.add(g2)
}

function addControlTower(cx: number, cz: number, baseY: number): void {
  if (glbControlTower) {
    // GLB tower: H_BASE=22 + H_CAB=5 = 27m, antenna adds ~8m → ~35m total
    const inst = glbControlTower.clone()
    inst.scale.setScalar(1.5)  // scale up to match procedural proportions
    inst.position.set(cx, baseY, cz)
    scene.add(inst)
    // Navigation light on top
    const navL = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0xff1100, emissive: 0xff1100, emissiveIntensity: 14 }))
    navL.position.set(cx, baseY + 54, cz); scene.add(navL)
    return
  }
  const g2 = new THREE.Group()
  const base2 = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 9), concMat)
  base2.position.y = 2.5; base2.castShadow = true; g2.add(base2)
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(5.5, 30, 5.5), concMat)
  shaft.position.y = 20; shaft.castShadow = true; g2.add(shaft)
  const glassMat2 = new THREE.MeshPhysicalMaterial({
    color: 0x88ccee, transparent: true, opacity: 0.5,
    roughness: 0, metalness: 0, transmission: 0.6, envMapIntensity: 3
  })
  const cab = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 10), glassMat2)
  cab.position.y = 37.5; g2.add(cab)
  const roofS = new THREE.Mesh(new THREE.BoxGeometry(12, 0.7, 12), steelMat)
  roofS.position.y = 40.5; g2.add(roofS)
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 9, 6), steelMat)
  ant.position.y = 45.5; g2.add(ant)
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0xff1100, emissive: 0xff1100, emissiveIntensity: 14 }))
  navL.position.y = 50.5; g2.add(navL)
  g2.position.set(cx, baseY, cz); scene.add(g2)
}

function addRadarDish(cx: number, cz: number, baseY: number): void {
  if (glbRadarDish) {
    const inst = glbRadarDish.clone()
    inst.scale.setScalar(1.4)
    inst.position.set(cx, baseY, cz)
    scene.add(inst)
    // Keep a spinning group reference (GLB dish root rotates in updateRadarDishes)
    radarDishes.push(inst)
    return
  }
  const g2 = new THREE.Group()
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 15, 8), steelMat)
  mast.position.y = 7.5; mast.castShadow = true; g2.add(mast)
  const rotGrp = new THREE.Group(); rotGrp.position.y = 15.5
  const rim = new THREE.Mesh(new THREE.TorusGeometry(5.8, 0.38, 8, 24), steelMat)
  rim.rotation.y = Math.PI / 2; rotGrp.add(rim)
  for (let i = 0; i < 8; i++) {
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 5.8, 4), steelMat)
    sp.rotation.z = Math.PI / 2; sp.rotation.x = (i / 8) * Math.PI; rotGrp.add(sp)
  }
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 2, 8), steelMat)
  feed.rotation.z = Math.PI / 2; feed.position.x = 7; rotGrp.add(feed)
  g2.add(rotGrp); radarDishes.push(rotGrp)
  g2.position.set(cx, baseY, cz); scene.add(g2)
}

function addFuelTanks(cx: number, cz: number, baseY: number, count: number): void {
  const offsets = [[-18,0],[18,0],[0,-18],[0,18],[-18,-18],[18,18]].slice(0, count)
  if (glbFuelTank) {
    // GLB fuel tank: horizontal cylinder R=4.5, L=14m. Scale to look large.
    offsets.forEach(([ox, oz], i) => {
      const inst = glbFuelTank!.clone()
      const sc = 1.2 + (i % 3) * 0.15
      inst.scale.setScalar(sc)
      inst.position.set(cx + ox, baseY, cz + oz)
      inst.rotation.y = (i * Math.PI) / 3
      scene.add(inst)
    })
    return
  }
  const specs = [{r:9,h:16},{r:11,h:20},{r:8,h:13},{r:10,h:17},{r:7,h:11},{r:9,h:14}].slice(0, count)
  const tankMat2 = new THREE.MeshStandardMaterial({ color: 0x8a929e, roughness: 0.32, metalness: 0.82, envMapIntensity: 1.8 })
  const bermMat  = new THREE.MeshStandardMaterial({ color: 0x606248, roughness: 0.96, metalness: 0 })
  specs.forEach(({ r, h }, i) => {
    const a = (i / specs.length) * Math.PI * 2, dist = 20 + i * 5
    const tx = cx + Math.cos(a) * dist, tz = cz + Math.sin(a) * dist
    const berm = new THREE.Mesh(new THREE.CylinderGeometry(r+5, r+8, 2.8, 10), bermMat)
    berm.position.set(tx, baseY + 1.4, tz); scene.add(berm)
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), tankMat2)
    tank.position.set(tx, baseY + h/2 + 2.5, tz); tank.castShadow = true; scene.add(tank)
    const top2 = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 6, 0, Math.PI*2, 0, Math.PI/2), tankMat2)
    top2.position.set(tx, baseY + h + 2.5, tz); scene.add(top2)
  })
}

function addPerimeterWall(cx: number, cz: number, baseY: number, rx: number, rz: number, rotY: number): void {
  const wallH = 5.5, wallT = 2.5
  const corners = [[-rx,-rz],[rx,-rz],[rx,rz],[-rx,rz]]
  for (let i = 0; i < 4; i++) {
    const [ax,az] = corners[i], [bx,bz] = corners[(i+1)%4]
    const mx = (ax+bx)/2, mz = (az+bz)/2
    const len = Math.hypot(bx-ax, bz-az), angle = Math.atan2(bx-ax, bz-az)
    const cos = Math.cos(rotY), sin = Math.sin(rotY)
    const wall = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, len), concMat)
    wall.position.set(cx + mx*cos - mz*sin, baseY + wallH/2, cz + mx*sin + mz*cos)
    wall.rotation.y = rotY + angle; wall.castShadow = true; wall.receiveShadow = true; scene.add(wall)
  }
  // 四隅の番兵塔
  corners.forEach(([wx,wz]) => {
    const cos = Math.cos(rotY), sin = Math.sin(rotY)
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.8, wallH+7, 8), concMat)
    tower.position.set(cx + wx*cos - wz*sin, baseY + (wallH+7)/2, cz + wx*sin + wz*cos)
    tower.castShadow = true; scene.add(tower)
    const top3 = new THREE.Mesh(new THREE.BoxGeometry(8, 1.5, 8), concMat)
    top3.position.set(cx + wx*cos - wz*sin, baseY + wallH + 7.5, cz + wx*sin + wz*cos)
    scene.add(top3)
  })
}

function buildAirBase(cx: number, cz: number, rotY: number, label: 'A' | 'B' | 'C'): void {
  const baseY = terrainH(cx, cz)
  // エプロン（コンクリート舗装）
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(135, 110), concMat)
  apron.rotation.x = -Math.PI/2; apron.receiveShadow = true
  apron.position.set(cx, baseY + 0.22, cz + 55); scene.add(apron)
  // 滑走路
  addRunway(cx, cz - 18, 300, rotY)
  // 格納庫 x3
  const hw = 44, hh = 19, hd = 58
  for (let i = -1; i <= 1; i++) addHangar(cx + i*(hw+10), cz + 100, hw, hh, hd, rotY, baseY)
  // 管制塔
  addControlTower(cx + 78, cz - 55, baseY)
  // レーダーアンテナ
  addRadarDish(cx - 82, cz - 65, baseY)
  // 燃料タンク群
  addFuelTanks(cx + 115, cz + 65, baseY, label === 'A' ? 4 : 3)
  // 周壁 + 番兵塔
  addPerimeterWall(cx, cz + 28, baseY, 155, 148, rotY)
}

function buildBridge(cx: number, cz: number, span: number, rotY: number): void {
  const w = 20
  const yN = terrainH(cx + (rotY===0 ? 0 : -span/2), cz + (rotY===0 ? -span/2 : 0))
  const yS = terrainH(cx + (rotY===0 ? 0 :  span/2), cz + (rotY===0 ?  span/2 : 0))
  const bY = Math.max(yN, yS) + 4

  const deckMat2 = new THREE.MeshStandardMaterial({ color: 0x606270, roughness: 0.88, metalness: 0.08 })
  const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 1.8, span), deckMat2)
  deck.position.set(cx, bY, cz); deck.rotation.y = rotY
  deck.castShadow = true; deck.receiveShadow = true; scene.add(deck)

  // アーチ（左右一対）
  const archMat3 = new THREE.MeshStandardMaterial({ color: 0x708090, roughness: 0.48, metalness: 0.80 })
  const archR = span * 0.44
  for (const side of [-w/2 + 1.5, w/2 - 1.5]) {
    const lx = cx + (rotY === 0 ? side : 0)
    const lz = cz + (rotY === 0 ? 0 : side)
    const arch = new THREE.Mesh(new THREE.TorusGeometry(archR, 2, 9, 36, Math.PI), archMat3)
    arch.position.set(lx, bY + 1, lz)
    arch.rotation.z = Math.PI / 2; if (rotY !== 0) arch.rotation.y = rotY
    arch.castShadow = true; scene.add(arch)
    // ハンガー（吊り材）
    for (let t = -0.38; t <= 0.38; t += 0.12) {
      const hx = Math.sin(t * Math.PI) * archR
      const topY = Math.sqrt(Math.max(0, archR*archR - hx*hx))
      const hangerH = topY  // アーチの高さ
      if (hangerH < 1) continue
      const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, hangerH, 4), archMat3)
      // 回転に応じて正しい位置に配置
      const hangerX = rotY === 0 ? lx : cx + t * span
      const hangerZ = rotY === 0 ? cz + t * span : lz
      hanger.position.set(hangerX, bY + hangerH/2, hangerZ)
      scene.add(hanger)
    }
  }
  // 橋台（両端）
  for (const end of [-span/2, span/2]) {
    const ex = cx + (rotY===0 ? 0 : end), ez = cz + (rotY===0 ? end : 0)
    const abt = new THREE.Mesh(new THREE.BoxGeometry(w + 10, 10, 14), concMat)
    abt.position.set(ex, bY - 3.5, ez); abt.castShadow = true; scene.add(abt)
  }
  // ガードレール
  for (const side of [-w/2 - 0.5, w/2 + 0.5]) {
    const rlx = cx + (rotY===0 ? side : 0), rlz = cz + (rotY===0 ? 0 : side)
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.6, span), steelMat)
    rail.position.set(rlx, bY + 1.8, rlz); scene.add(rail)
  }
}

// ===== DAM =====
function addDam(cx: number, cz: number, width: number, rotY: number): void {
  if (!glbDam) return  // GLB未ロードなら処理スキップ
  const baseY = terrainH(cx, cz)

  const dam = glbDam.clone()
  dam.position.set(cx, baseY, cz)
  dam.rotation.y = rotY
  // width調整（必要に応じてスケール）
  const baseWidth = 90  // Blenderでの基準幅
  dam.scale.setScalar(width / baseWidth)
  scene.add(dam)

  // 水面エフェクト（下流側）
  const waterSurf = new THREE.Mesh(
    new THREE.PlaneGeometry(width, 30),
    new THREE.MeshStandardMaterial({ color: 0x1a4d6f, transparent: true, opacity: 0.6, roughness: 0.2, metalness: 0.3 })
  )
  waterSurf.rotation.x = -Math.PI / 2
  waterSurf.position.set(cx, baseY - 5, cz + (rotY === 0 ? 18 : 0))
  waterSurf.rotation.z = rotY
  scene.add(waterSurf)
}

// ===== CITY AREA =====
function addCityArea(cx: number, cz: number, radius: number, buildingCount: number): void {
  const glbBuildings = [glbCityBuilding01, glbCityBuilding02, glbCityBuilding03, glbCityBuilding04, glbCityBuilding05]
  const availableGLBs = glbBuildings.filter(g => g !== null)
  if (availableGLBs.length === 0) return  // GLB未ロードならスキップ

  // 決定的な配置（シード値ベース）
  const baseSeed = Math.floor(cx * 1000 + cz)
  for (let i = 0; i < buildingCount; i++) {
    const seed = baseSeed + i * 1000 + 700000
    const angle = deterministicRandom(seed) * Math.PI * 2
    const dist = deterministicRandom(seed + 1) * radius
    const bx = cx + Math.cos(angle) * dist
    const bz = cz + Math.sin(angle) * dist
    const by = terrainH(bx, bz)

    if (by < WATER_LEVEL + 3) continue  // 水没回避

    // 決定的にGLBを選択
    const glbIndex = Math.floor(deterministicRandom(seed + 2) * availableGLBs.length)
    const glb = availableGLBs[glbIndex]!
    const building = glb.clone()
    building.position.set(bx, by, bz)
    building.rotation.y = deterministicRandom(seed + 3) * Math.PI * 2
    // 決定的スケール（0.8〜1.2倍）
    const scale = 0.8 + deterministicRandom(seed + 4) * 0.4
    building.scale.setScalar(scale)
    scene.add(building)

    // 屋上ライト（夜間用、現在は昼間なので控えめ）
    // パフォーマンス改善：装飾ライト削除
  }
}

// ===== ROCK FORMATIONS（岩塔・巨岩）戦略的配置 =====
function createRockFormations(): void {
  if (import.meta.env.DEV) console.log('🪨 岩塔・巨岩の戦略的配置開始')

  // 岩のマテリアル（茶色・灰色・赤褐色の自然な岩）
  const rockMat1 = new THREE.MeshStandardMaterial({
    color: 0x6a5a4a,  // 茶色
    roughness: 0.95,
    metalness: 0.05
  })
  const rockMat2 = new THREE.MeshStandardMaterial({
    color: 0x5a4a3a,  // 濃い茶色
    roughness: 0.98,
    metalness: 0.02
  })
  const rockMat3 = new THREE.MeshStandardMaterial({
    color: 0x8a6a5a,  // 赤褐色
    roughness: 0.92,
    metalness: 0.08
  })

  let pillarCount = 0
  let boulderCount = 0

  // ===== 戦略1: 十字峡谷の縁に岩塔を集中配置（50本）=====
  for (let i = 0; i < 50; i++) {
    // X軸峡谷の縁（z≈±100-200）
    const x = (Math.random() - 0.5) * 1800
    const z = (Math.random() < 0.5 ? 1 : -1) * (100 + Math.random() * 100)
    const baseY = terrainH(x, z)

    if (baseY < WATER_LEVEL + 10) continue

    const height = 60 + Math.random() * 80  // 60-140m（さらに高く、視認性向上）
    const radius = 15 + Math.random() * 20  // 15-35m（より太く、回避しやすく）

    const pillarGeo = new THREE.CylinderGeometry(
      radius * 0.6,
      radius,
      height,
      8,
      1
    )

    const pillar = new THREE.Mesh(pillarGeo, i % 3 === 0 ? rockMat1 : i % 3 === 1 ? rockMat2 : rockMat3)
    pillar.position.set(x, baseY + height / 2, z)
    pillar.rotation.y = Math.random() * Math.PI * 2
    pillar.castShadow = true
    pillar.receiveShadow = true
    pillar.name = `CanyonPillar_${pillarCount++}`
    scene.add(pillar)
  }

  // ===== 戦略2: 放射峡谷の縁に岩塔を配置（30本）=====
  for (let i = 0; i < 30; i++) {
    const angle = Math.random() * Math.PI * 2
    const distance = 500 + Math.random() * 1500
    const offset = (Math.random() < 0.5 ? 1 : -1) * (60 + Math.random() * 50)

    const x = Math.cos(angle) * distance + Math.sin(angle) * offset
    const z = Math.sin(angle) * distance - Math.cos(angle) * offset
    const baseY = terrainH(x, z)

    if (baseY < WATER_LEVEL + 10) continue

    const height = 55 + Math.random() * 70  // 55-125m（視認性向上）
    const radius = 12 + Math.random() * 18  // 12-30m（回避しやすく）

    const pillarGeo = new THREE.CylinderGeometry(
      radius * 0.65,
      radius,
      height,
      8,
      1
    )

    const pillar = new THREE.Mesh(pillarGeo, i % 3 === 0 ? rockMat1 : i % 3 === 1 ? rockMat2 : rockMat3)
    pillar.position.set(x, baseY + height / 2, z)
    pillar.rotation.y = Math.random() * Math.PI * 2
    pillar.castShadow = true
    pillar.receiveShadow = true
    pillar.name = `RadialPillar_${pillarCount++}`
    scene.add(pillar)
  }

  // ===== 戦略3: 山の頂上付近に岩塔（20本）=====
  const mountainPeaks = [
    { x: 0, z: -1200 },      // 北部山脈
    { x: -300, z: 1000 },    // 南部山脈
    { x: 1000, z: 200 },     // 東部山脈
    { x: -1200, z: -400 }    // 西部山脈
  ]

  for (const peak of mountainPeaks) {
    for (let i = 0; i < 5; i++) {
      const x = peak.x + (Math.random() - 0.5) * 400
      const z = peak.z + (Math.random() - 0.5) * 400
      const baseY = terrainH(x, z)

      if (baseY < 500) continue  // 高地のみ

      const height = 50 + Math.random() * 60  // 50-110m（視認性向上）
      const radius = 10 + Math.random() * 15  // 10-25m（回避しやすく）

      const pillarGeo = new THREE.CylinderGeometry(
        radius * 0.7,
        radius,
        height,
        8,
        1
      )

      const pillar = new THREE.Mesh(pillarGeo, rockMat3)  // 赤褐色で統一
      pillar.position.set(x, baseY + height / 2, z)
      pillar.rotation.y = Math.random() * Math.PI * 2
      pillar.castShadow = true
      pillar.receiveShadow = true
      pillar.name = `MountainPillar_${pillarCount++}`
      scene.add(pillar)
    }
  }

  if (import.meta.env.DEV) console.log(`✅ 岩塔${pillarCount}本配置完了`)

  // ===== 巨岩配置 =====
  // 戦略1: 峡谷周辺に集中（150個）
  for (let i = 0; i < 150; i++) {
    const x = (Math.random() - 0.5) * 2000
    const z = (Math.random() - 0.5) * 2000
    const baseY = terrainH(x, z)

    if (baseY < WATER_LEVEL + 5 || baseY > 600) continue  // 低地と高地は避ける

    const size = 12 + Math.random() * 25

    const rockGeo = new THREE.DodecahedronGeometry(size, 0)
    const boulder = new THREE.Mesh(rockGeo, i % 3 === 0 ? rockMat1 : i % 3 === 1 ? rockMat2 : rockMat3)
    boulder.position.set(x, baseY + size * 0.3, z)
    boulder.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    )
    boulder.castShadow = true
    boulder.receiveShadow = true
    boulder.name = `CanyonBoulder_${boulderCount++}`
    scene.add(boulder)
  }

  // 戦略2: 全域に散在（150個）
  for (let i = 0; i < 150; i++) {
    const x = (Math.random() - 0.5) * 4000
    const z = (Math.random() - 0.5) * 4000
    const baseY = terrainH(x, z)

    // 平地（基地エリア）は避ける
    const plainDist = Math.hypot(x - 400, z - 200)
    if (plainDist < 700 || baseY < WATER_LEVEL + 5) continue

    const size = 10 + Math.random() * 20

    const rockGeo = new THREE.DodecahedronGeometry(size, 0)
    const boulder = new THREE.Mesh(rockGeo, i % 3 === 0 ? rockMat1 : i % 3 === 1 ? rockMat2 : rockMat3)
    boulder.position.set(x, baseY + size * 0.35, z)
    boulder.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    )
    boulder.castShadow = true
    boulder.receiveShadow = true
    boulder.name = `ScatteredBoulder_${boulderCount++}`
    scene.add(boulder)
  }

  if (import.meta.env.DEV) {
    console.log(`✅ 巨岩${boulderCount}個配置完了`)
    console.log(`🎉 総計: 岩塔${pillarCount}本 + 巨岩${boulderCount}個 = ${pillarCount + boulderCount}オブジェクト`)
  }
}

// ===== SMOKE PARTICLE SYSTEM =====
const _smokeGeo = new THREE.SphereGeometry(1, 4, 4)
const _smokeMatBase = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.55, depthWrite: false })
const SMOKE_CAP = isMobileDevice ? 30 : 60

function spawnSmoke(pos: THREE.Vector3, radius = 3.5, col = 0x1a1a1a): void {
  if (smokeParticles.length > SMOKE_CAP) return
  const mat = _smokeMatBase.clone(); mat.color.set(col)
  const mesh = new THREE.Mesh(_smokeGeo, mat)
  mesh.scale.setScalar(radius)
  mesh.position.copy(pos).add(new THREE.Vector3(
    (Math.random()-0.5)*4, 0, (Math.random()-0.5)*4
  ))
  scene.add(mesh)
  const maxLife = 3.5 + Math.random() * 2
  smokeParticles.push({
    mesh,
    vel: new THREE.Vector3((Math.random()-0.5)*3, 5 + Math.random()*4, (Math.random()-0.5)*3),
    life: 0, maxLife
  })
}

function updateSmoke(dt: number): void {
  for (let i = smokeParticles.length - 1; i >= 0; i--) {
    const sp = smokeParticles[i]
    sp.life += dt
    sp.mesh.position.addScaledVector(sp.vel, dt)
    sp.vel.x *= 0.97; sp.vel.z *= 0.97  // 横方向減衰
    const t = sp.life / sp.maxLife
    ;(sp.mesh.material as THREE.MeshStandardMaterial).opacity = 0.55 * (1 - t * t)
    sp.mesh.scale.setScalar(1 + t * 1.8)
    if (sp.life >= sp.maxLife) {
      scene.remove(sp.mesh)
      smokeParticles.splice(i, 1)
    }
  }
}

// ===== HELICOPTER TARGET =====
function createHelicopterTarget(): THREE.Group {
  if (glbHeli) {
    const g = new THREE.Group()
    const inst = glbHeli.clone()
    inst.rotation.x = Math.PI / 2
    inst.scale.setScalar(1.0)
    g.add(inst)
    // Add a world-space rotor disc that spins around world Y
    const rotorDisc = new THREE.Group()
    rotorDisc.position.set(0, 2.2, 0)
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x2a3020, roughness: 0.6, metalness: 0.5, transparent: true, opacity: 0.72 })
    for (let bi = 0; bi < 4; bi++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.08, 0.7), bladeMat)
      b.rotation.y = bi * Math.PI / 2; rotorDisc.add(b)
    }
    g.add(rotorDisc)
    heliBlades.push(rotorDisc)
    return g
  }
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x4a5a38, roughness: 0.86, metalness: 0.22 })
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a3820, roughness: 0.90, metalness: 0.15 })
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x88ccee, transparent: true, opacity: 0.38, roughness: 0, transmission: 0.65
  })

  // 機体（横長楕円）
  const body = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.8, 8, 10), mat)
  body.rotation.z = Math.PI / 2; body.castShadow = true; g.add(body)
  // コクピットバブル
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 7, 0, Math.PI*2, 0, Math.PI*0.62), glassMat)
  cockpit.position.set(-3, 0.4, 0); cockpit.rotation.z = -0.3; g.add(cockpit)
  // テールブーム
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.3, 9, 7), darkMat)
  tail.rotation.z = Math.PI / 2; tail.position.set(7.5, 0.5, 0); tail.castShadow = true; g.add(tail)
  // テール垂直安定板
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.5, 2.2), mat)
  fin.position.set(12, 1.8, 0); g.add(fin)

  // メインローター
  const mastM = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.5, 7), darkMat)
  mastM.position.set(0, 3.2, 0); g.add(mastM)
  const rotorGrp = new THREE.Group(); rotorGrp.position.set(0, 4.7, 0)
  const bladeShape = new THREE.BoxGeometry(11, 0.12, 0.85)
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(bladeShape, mat)
    blade.rotation.y = (i / 4) * Math.PI * 2; rotorGrp.add(blade)
  }
  heliBlades.push(rotorGrp); g.add(rotorGrp)

  // テールローター
  const tailRotGrp = new THREE.Group(); tailRotGrp.position.set(12.5, 2.5, 0.8)
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.8, 0.45), mat)
    blade.rotation.x = (i / 3) * Math.PI * 2; tailRotGrp.add(blade)
  }
  heliBlades.push(tailRotGrp); g.add(tailRotGrp)

  // スキッド（着陸脚）
  for (const side of [-2.2, 2.2]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 9, 6), darkMat)
    skid.rotation.z = Math.PI / 2; skid.position.set(1, -3, side); g.add(skid)
    for (const bx of [-2, 2]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 3.2, 5), darkMat)
      strut.position.set(bx, -1.4, side); strut.rotation.z = 0.2; g.add(strut)
    }
  }

  // 武装ポッド（ロケット）
  for (const side of [-2.5, 2.5]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 3.5, 7), darkMat)
    pod.rotation.z = Math.PI / 2; pod.position.set(-1, -1.5, side); g.add(pod)
  }

  return g
}

// ===== SAM LAUNCHER（地上目標） =====
function createSAMLauncher(): THREE.Group {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x4a5a38, roughness: 0.86, metalness: 0.22 })
  // 基盤パッド
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 1, 8), mat)
  pad.position.y = 0.5; g.add(pad)
  // 発射台支柱
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 6, 8), mat)
  ped.position.y = 4; g.add(ped)
  // 追跡レーダー
  const rGrp = new THREE.Group(); rGrp.position.y = 7.5
  const rDish = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 5, 0, Math.PI*2, 0, Math.PI/2), steelMat)
  rDish.rotation.x = -Math.PI*0.25; rGrp.add(rDish)
  const rAnt = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.5, 6), steelMat)
  rAnt.position.y = 2.2; rGrp.add(rAnt)
  radarDishes.push(rGrp); g.add(rGrp)
  // ミサイルチューブ × 4
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 5.5, 7), mat)
    tube.rotation.x = -Math.PI * 0.28; tube.position.set(Math.cos(a)*4.5, 2.8, Math.sin(a)*4.5); g.add(tube)
    const msl = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 5, 7), steelMat)
    msl.rotation.x = -Math.PI * 0.28; msl.position.set(Math.cos(a)*4.5, 3.2, Math.sin(a)*4.5); g.add(msl)
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.44, 1.2, 7), steelMat)
    tip.rotation.x = -Math.PI * 0.28
    const tip_y = 3.2 + Math.cos(Math.PI * 0.28) * 3.1
    const tip_z = Math.sin(a)*4.5 - Math.sin(Math.PI * 0.28) * 3.1
    tip.position.set(Math.cos(a)*4.5, tip_y, tip_z); g.add(tip)
  }
  return g
}

function createShipTarget(): THREE.Group {
  const g = new THREE.Group()
  const hullMat  = new THREE.MeshStandardMaterial({ color: 0x253545, roughness: 0.68, metalness: 0.55, envMapIntensity: 1.4 })
  const superMat2 = new THREE.MeshStandardMaterial({ color: 0x3a5065, roughness: 0.60, metalness: 0.45 })
  const waterline = new THREE.MeshStandardMaterial({ color: 0x8b3022, roughness: 0.80, metalness: 0.1 })
  // 船体（喫水線上/下で2層）
  const hullTop = new THREE.Mesh(new THREE.BoxGeometry(14, 4.5, 72), hullMat)
  hullTop.position.y = 4.5; hullTop.castShadow = true; g.add(hullTop)
  const hullBot = new THREE.Mesh(new THREE.BoxGeometry(16, 4, 68), waterline)
  hullBot.position.y = 0.5; g.add(hullBot)
  // 船首バルバス
  const bow = new THREE.Mesh(new THREE.CylinderGeometry(3, 4.5, 10, 8), hullMat)
  bow.rotation.z = Math.PI/2; bow.position.set(0, 3, -38); g.add(bow)
  // ブリッジ複数層
  const br1 = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 24), superMat2)
  br1.position.set(0, 11.5, -10); br1.castShadow = true; g.add(br1)
  const br2 = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 16), superMat2)
  br2.position.set(0, 18, -10); g.add(br2)
  const br3 = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 11), superMat2)
  br3.position.set(0, 23.5, -10); g.add(br3)
  // マスト
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 18, 8), steelMat)
  mast.position.set(0, 35, -10); g.add(mast)
  // レーダー（回転）
  const shipRadar = new THREE.Group(); shipRadar.position.set(0, 44, -10)
  const srd = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 1.5), steelMat)
  shipRadar.add(srd); radarDishes.push(shipRadar); g.add(shipRadar)
  // 主砲前部
  const gunBase = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 2.5, 8), superMat2)
  gunBase.position.set(0, 8, -28); g.add(gunBase)
  const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 12, 7), hullMat)
  gunBarrel.rotation.x = Math.PI/2; gunBarrel.position.set(0, 9.5, -34); g.add(gunBarrel)
  // 後部砲
  const gunBase2 = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 2.2, 8), superMat2)
  gunBase2.position.set(0, 8, 24); g.add(gunBase2)
  const gunBarrel2 = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 10, 7), hullMat)
  gunBarrel2.rotation.x = Math.PI/2; gunBarrel2.position.set(0, 9.2, 29); g.add(gunBarrel2)
  // 煙突
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 8, 8), hullMat)
  stack.position.set(0, 14.5, 4); g.add(stack)
  // VLSミサイルセル（前甲板）
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const cell = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.2, 2.8), superMat2)
    cell.position.set((j-0.5)*3.2, 7.4, -14 + i*4); g.add(cell)
  }
  return g
}

function createTankTarget(): THREE.Group {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x4a5a38, roughness: 0.88, metalness: 0.22 })
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x2a2a24, roughness: 0.96, metalness: 0.3 })
  // 車体本体
  const body = new THREE.Mesh(new THREE.BoxGeometry(7.5, 2.8, 12), mat)
  body.position.y = 2.4; body.castShadow = true; body.receiveShadow = true; g.add(body)
  // 傾斜装甲（前面）
  const frontArmor = new THREE.Mesh(new THREE.BoxGeometry(7.5, 3.5, 1.5), mat)
  frontArmor.position.set(0, 2.4, -6); frontArmor.rotation.x = -0.4; g.add(frontArmor)
  // 履帯（左右）
  for (const side of [-4, 4]) {
    const track = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 13.5), trackMat)
    track.position.set(side, 1.1, 0); track.castShadow = true; g.add(track)
    // 転輪
    for (let wi = -2; wi <= 2; wi++) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 2.0, 10), trackMat)
      wheel.rotation.z = Math.PI/2; wheel.position.set(side, 1.1, wi * 2.8); g.add(wheel)
    }
  }
  // 砲塔
  const turret = new THREE.Mesh(new THREE.BoxGeometry(5, 2.8, 5.5), mat)
  turret.position.set(0, 5.2, -0.8); g.add(turret)
  const turretTop = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1, 5), mat)
  turretTop.position.set(0, 6.9, -0.8); g.add(turretTop)
  // 主砲
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 11, 7), mat)
  barrel.rotation.x = Math.PI/2; barrel.position.set(0, 5.4, -6.3); g.add(barrel)
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.8, 7), mat)
  muzzle.rotation.x = Math.PI/2; muzzle.position.set(0, 5.4, -11.8); g.add(muzzle)
  // 機銃
  const mg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 6), mat)
  mg.rotation.x = Math.PI/2; mg.position.set(1.5, 7.2, -2.5); g.add(mg)
  return g
}

function createBomberModel(): THREE.Group {
  if (glbBomber) {
    const g = new THREE.Group()
    const inst = glbBomber.clone()
    inst.rotation.x = Math.PI / 2
    inst.scale.setScalar(1.0)
    g.add(inst)
    return g
  }
  const g = new THREE.Group()
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x667788, roughness: 0.14, metalness: 0.88, clearcoat: 0.8 })
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, 18, 12), mat)
  fuselage.rotation.x = Math.PI/2; fuselage.castShadow = true; g.add(fuselage)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5, 12), mat)
  nose.rotation.x = Math.PI/2; nose.position.z = -11.5; g.add(nose)
  const wing = new THREE.Mesh(new THREE.BoxGeometry(32, 0.35, 6), mat); wing.position.z = 1; wing.castShadow = true; g.add(wing)
  for (const side of [-13, -7, 7, 13]) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 3.5, 8), mat)
    eng.rotation.x = Math.PI/2; eng.position.set(side, -1.0, 2); g.add(eng)
  }
  const vTail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 4), mat); vTail.position.set(0, 3, 7); g.add(vTail)
  const hTail = new THREE.Mesh(new THREE.BoxGeometry(14, 0.35, 3.5), mat); hTail.position.z = 7; g.add(hTail)
  return g
}

// ===== GAME MODE LOGIC =====
function setObjective(text: string) {
  const el = document.getElementById('objective-text')!
  el.textContent = text
}

function stopGame() {
  currentMode = null
  missionComplete = false

  // マルチプレイ切断
  if (mpClient) { mpClient.disconnect(); mpClient = null }
  if (mpStartBtn) { mpStartBtn.disabled = !MP_READY }
  if (mpStatusEl) mpStatusEl.textContent = MP_READY ? '' : 'サーバー未設定'

  // 全てのゲームオブジェクトをクリア
  for (const e of [...enemies]) scene.remove(e.group)
  enemies.length = 0
  for (const a of [...allies]) scene.remove(a.group)
  allies.length = 0
  for (const gt of [...groundTargets]) scene.remove(gt.group)
  groundTargets.length = 0
  for (const b of [...bullets]) scene.remove(b.mesh)
  bullets.length = 0
  for (const b of [...enemyBullets]) scene.remove(b.mesh)
  enemyBullets.length = 0
  for (const m of [...playerMissiles]) { if (m.light) scene.remove(m.light); scene.remove(m.mesh) }
  playerMissiles.length = 0
  for (const m of [...allyMissiles]) scene.remove(m.mesh)
  allyMissiles.length = 0
  for (const m of [...enemyMissiles]) scene.remove(m.mesh)
  enemyMissiles.length = 0
  for (const t of missileTrails) { t.mesh.visible = false; t.mesh.scale.set(1,1,1) }
  missileTrails.length = 0
  for (const ex of [...explosions]) {
    for (const p of ex.particles) scene.remove(p.mesh)
  }
  explosions.length = 0

  lockedTarget = null
  document.getElementById('objective-hud')!.style.display = 'none'
}

async function startGame(mode: GameMode) {
  if (mapSwitchPromise) await mapSwitchPromise
  const selectedMap = getActiveMapFromMenu()
  if (selectedMap !== currentMap) await switchMapAndTrack(selectedMap)
  currentMode = mode
  missionComplete = false
  modeObjectiveKilled = 0

  // クリア
  for (const e of [...enemies]) scene.remove(e.group)
  enemies.length = 0
  for (const gt of [...groundTargets]) scene.remove(gt.group)
  groundTargets.length = 0
  for (const b of [...bullets]) scene.remove(b.mesh); bullets.length = 0
  for (const m of [...playerMissiles]) { if (m.light) scene.remove(m.light); scene.remove(m.mesh) }; playerMissiles.length = 0
  for (const m of [...enemyMissiles]) scene.remove(m.mesh); enemyMissiles.length = 0
  for (const t of missileTrails) { t.mesh.visible = false; t.mesh.scale.set(1,1,1) }; missileTrails.length = 0
  lockedTarget = null
  score = 0; scoreEl.textContent = '0'
  missileAmmo = 6; flareAmmo = 3
  playerHP = MAX_HP; invincibleTimer = 0
  updateHPDisplay()
  updatePips(missilePips, missileAmmo, 'on')
  updatePips(flarePips, flareAmmo, 'flare-on')

  document.getElementById('mode-screen')!.style.display = 'none'
  document.getElementById('mission-complete')!.style.display = 'none'
  document.getElementById('objective-hud')!.style.display = 'block'

  // 味方を全クリア
  for (const a of [...allies]) scene.remove(a.group); allies.length = 0
  for (const m of [...allyMissiles]) scene.remove(m.mesh); allyMissiles.length = 0

  switch (mode) {
    case 'dogfight': {
      modeObjectiveTotal = 0
      setObjective('敵機を撃墜せよ — SCORE: 0')
      const tokyoDogfightSpawn = currentMap === 'tokyo' && neoTokyoMapSystem
        ? neoTokyoMapSystem.getSafeSpawnPosition()
        : null
      const spaceDogfightSpawn = currentMap === 'space'
      // MAP別の初期敵数を設定
      const initialEnemies = DOGFIGHT_INITIAL_ENEMIES[currentMap]
      // 敵は南側、味方・プレイヤーは北側にスポーン
      for (let i = 0; i < initialEnemies; i++) {
        if (spaceDogfightSpawn) {
          const a = Math.PI + (Math.random() - 0.5) * 1.4
          const r = 520 + Math.random() * 420
          spawnEnemyAt(Math.cos(a) * r, -260 + Math.sin(a) * r)
        } else if (tokyoDogfightSpawn) {
          const anchors = [
            { x: 520, z: -360 },
            { x: 940, z: 520 },
            { x: 1760, z: 1540 },
            { x: -460, z: 1740 },
          ]
          const p = anchors[i % anchors.length]
          spawnEnemyAt(p.x + (Math.random() - 0.5) * 420, p.z + (Math.random() - 0.5) * 420)
        } else {
          const a = Math.PI + (Math.random() - 0.5) * 1.2
          const r = 550 + Math.random() * 350
          spawnEnemyAt(Math.cos(a) * r, Math.sin(a) * r)
        }
      }
      if (import.meta.env.DEV) console.log(`Spawning ${dfAllyCount} allies`)
      for (let i = 0; i < dfAllyCount; i++) {
        if (spaceDogfightSpawn) {
          // スポーンポイントがあればゾーン相対座標を使用
          if (spaceSpawnPoints && spaceSpawnPoints.ally.length > 0) {
            const spawnDef = spaceSpawnPoints.ally[i % spaceSpawnPoints.ally.length]
            const zone = spaceZones.find(z => z.zone_id === spawnDef.zone)
            if (zone) {
              const sx = zone.position.x + spawnDef.offset.x + (Math.random() - 0.5) * 60
              const sz = zone.position.z + spawnDef.offset.z + (Math.random() - 0.5) * 60
              spawnAlly(sx, sz)
              if (import.meta.env.DEV) console.log(`Ally ${i+1} spawned at zone ${spawnDef.zone}`)
            } else {
              // フォールバック
              const a = (Math.random() - 0.5) * 0.9
              const r = 180 + Math.random() * 180
              spawnAlly(Math.cos(a) * r, 260 + Math.sin(a) * r)
            }
          } else {
            // フォールバック
            const a = (Math.random() - 0.5) * 0.9
            const r = 180 + Math.random() * 180
            spawnAlly(Math.cos(a) * r, 260 + Math.sin(a) * r)
          }
          if (import.meta.env.DEV) console.log(`Ally ${i+1} spawned in space sector`)
        } else if (tokyoDogfightSpawn) {
          const side = i % 2 === 0 ? -1 : 1
          const sx = tokyoDogfightSpawn.x + side * (220 + Math.random() * 90)
          const sz = tokyoDogfightSpawn.z + 160 + i * 120
          spawnAlly(sx, sz)
          if (import.meta.env.DEV) console.log(`Ally ${i+1} spawned at position:`, sx, sz)
        } else {
          // プレイヤーの近くにスポーン（より視認しやすく）
          const a = (Math.random() - 0.5) * 0.8
          const r = 150 + Math.random() * 150  // 150-300mの範囲に変更（元：550-900m）
          spawnAlly(Math.cos(a) * r, Math.sin(a) * r)
          if (import.meta.env.DEV) console.log(`Ally ${i+1} spawned at position:`, Math.cos(a) * r, Math.sin(a) * r)
        }
      }
      if (import.meta.env.DEV) console.log(`Total allies after spawn: ${allies.length}`)
      // プレイヤーも味方側（北）にスポーン
      if (spaceDogfightSpawn) {
        dfSpawnX = 200
        dfSpawnZ = 600
        player.position.set(200, 160, 600)
        const lookAngle = Math.atan2(-350 - 600, 0 - 200)
        player.rotation.y = lookAngle
        player.quaternion.setFromEuler(new THREE.Euler(0, lookAngle, 0, 'YXZ'))
        camQuat.copy(player.quaternion)
      } else if (tokyoDogfightSpawn) {
        dfSpawnX = tokyoDogfightSpawn.x
        dfSpawnZ = tokyoDogfightSpawn.z
        player.position.set(tokyoDogfightSpawn.x, tokyoDogfightSpawn.y, tokyoDogfightSpawn.z)
      } else {
        // 味方と同じ範囲に配置（r=150-300、北側）
        const a = (Math.random() - 0.5) * 0.8
        const r = 150 + Math.random() * 150
        dfSpawnX = Math.cos(a) * r
        dfSpawnZ = Math.sin(a) * r
        player.position.set(dfSpawnX, terrainH(dfSpawnX, dfSpawnZ) + 200, dfSpawnZ)
      }
      // 前方が開けた方向を向く（北側にスポーンするので南向き）
      player.rotation.y = Math.PI  // 南向き（z正方向）
      player.quaternion.identity()
      player.rotation.y = Math.PI
      camQuat.identity()
      speed = 200  // ゲーム開始時も巡航速度
      break
    }
    case 'souryokusen':
      if (currentMap === 'space') {
        // 宇宙MAP総力戦: 戦艦・砲台・敵機
        spawnSpaceTotalWarEnemies()
        const battleshipCount = groundTargets.filter(gt => gt.type === 'battleship').length
        const turretCount = groundTargets.filter(gt => gt.type === 'turret').length
        modeObjectiveTotal = battleshipCount + turretCount
        setObjective(`敵艦隊を殲滅せよ — 0 / ${modeObjectiveTotal}`)

        // 敵機も追加スポーン
        for (let i = 0; i < 7; i++) spawnEnemy()

        // プレイヤーを中央ステーション付近に配置
        player.position.set(200, 160, 600)
        const lookAngle = Math.atan2(-350 - 600, 0 - 200)
        player.rotation.y = lookAngle
        player.quaternion.setFromEuler(new THREE.Euler(0, lookAngle, 0, 'YXZ'))
        camQuat.copy(player.quaternion)
        speed = 220
        break
      } else if (currentMap === 'tokyo') {
        // Tokyo MAP総力戦: 都市防衛戦
        spawnTokyoSouryokusen()
        break
      }
      // Original MAP総力戦: 従来の総力戦
      modeObjectiveTotal = 17  // 3艦船 + 4戦車 + 2爆撃機 + 4SAM + 3ヘリ + 浮遊空母1
      setObjective(`地上目標を破壊 0 / 17`)
      spawnSouryokusen()
      break
    case 'free':
      modeObjectiveTotal = 0
      if (currentMap === 'space') {
        // 中央ハブ近くでスポーン、要塞・リング方向を向く
        player.position.set(200, 160, 600)
        const lookAngle = Math.atan2(-350 - 600, 0 - 200)
        player.rotation.y = lookAngle
        player.quaternion.setFromEuler(new THREE.Euler(0, lookAngle, 0, 'YXZ'))
        camQuat.copy(player.quaternion)
        speed = 220
        wheelSpeedTarget = 150
        syncFlightReadouts()
      }
      setObjective('フリーフライト')
      break
  }
}

// 地上MAP用の固定砲台を生成
function createGroundTurret(x: number, y: number, z: number): GroundTarget {
  const group = new THREE.Group()

  // 基部
  const baseGeo = new THREE.CylinderGeometry(8, 12, 15, 8)
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.7, metalness: 0.6 })
  const base = new THREE.Mesh(baseGeo, baseMat)
  group.add(base)

  // 砲塔
  const turretGeo = new THREE.SphereGeometry(10, 12, 8)
  const turret = new THREE.Mesh(turretGeo, baseMat)
  turret.position.y = 10
  group.add(turret)

  // 砲身
  const barrelGeo = new THREE.CylinderGeometry(2, 2, 35, 8)
  const barrel = new THREE.Mesh(barrelGeo, baseMat)
  barrel.rotation.z = Math.PI / 2
  barrel.position.set(17, 10, 0)
  group.add(barrel)

  // 発光（レーダー風）
  const light = new THREE.PointLight(0xff4444, 1, 60)
  light.position.y = 15
  group.add(light)

  group.position.set(x, y, z)
  scene.add(group)

  return {
    group,
    health: 8,
    maxHealth: 8,
    vel: new THREE.Vector3(0, 0, 0),
    type: 'turret',
    fireCooldown: 2.5,
    turretRotation: 0
  }
}

function spawnSouryokusen() {
  // 空中の敵 x5（リスポーンあり）
  for (let i = 0; i < 5; i++) spawnEnemy()

  // 艦船 x3（西部海・南部湾）
  for (const [sx, sz] of [[-2100, -150], [-2450, 280], [-380, 1200]] as [number,number][]) {
    const group = createShipTarget()
    group.position.set(sx, WATER_LEVEL + 2.5, sz)
    group.rotation.y = Math.random() * Math.PI * 2
    scene.add(group)
    groundTargets.push({ group, health: 40, maxHealth: 40, vel: new THREE.Vector3(), type: 'ship' })
  }

  // 戦車 x4
  for (const [tx, tz] of [[110, 90], [-160, 210], [200, -90], [-200, -160]] as [number,number][]) {
    const group = createTankTarget()
    group.position.set(tx, terrainH(tx, tz), tz)
    group.rotation.y = Math.random() * Math.PI * 2
    scene.add(group)
    groundTargets.push({ group, health: 20, maxHealth: 20, vel: new THREE.Vector3(), type: 'tank' })
  }

  // 爆撃機 x2（西から東へ飛行）
  for (let i = 0; i < 2; i++) {
    const group = createBomberModel()
    group.position.set(-2200, 160 + i * 40, -200 + i * 340)
    group.rotation.y = -Math.PI / 2
    scene.add(group)
    groundTargets.push({ group, health: 55, maxHealth: 55, vel: new THREE.Vector3(42, 0, 0), type: 'bomber' })
  }

  // SAMサイト x4（各基地・高地に配置）
  for (const [sx, sz] of [
    [  60,  -30],   // 中央基地 Alpha
    [1080, -320],   // 東部高原基地 Bravo
    [-780, -680],   // 北西高地
    [ 320,  560],   // 南部丘陵
  ] as [number, number][]) {
    const group = createSAMLauncher()
    group.position.set(sx, terrainH(sx, sz), sz)
    group.rotation.y = Math.random() * Math.PI * 2
    scene.add(group)
    groundTargets.push({ group, health: 15, maxHealth: 15, vel: new THREE.Vector3(), type: 'sam', fireCooldown: 8 + Math.random() * 6 })
  }

  // 攻撃ヘリ x3（各エリアを旋回哨戒）
  for (const [hx, hz] of [[200, -300], [-500, 400], [800, -100]] as [number,number][]) {
    const group = createHelicopterTarget()
    const baseY = terrainH(hx, hz) + 55
    group.position.set(hx, baseY, hz)
    scene.add(group)
    groundTargets.push({
      group, health: 30, maxHealth: 30, vel: new THREE.Vector3(), type: 'heli',
      patrolAngle: Math.random() * Math.PI * 2,
      patrolCenter: new THREE.Vector3(hx, baseY, hz)
    })
  }

  // 浮遊空母（BOSS）- GLBロード
  gltfLoader.load(import.meta.env.BASE_URL + 'models/carrier.glb', (gltf) => {
    if (currentMode !== 'souryokusen') return  // モード変更済みなら無視
    const carrierGroup = gltf.scene
    carrierGroup.traverse(c => {
      if ((c as THREE.Mesh).isMesh) {
        (c as THREE.Mesh).castShadow = true
        ;(c as THREE.Mesh).receiveShadow = true
      }
    })
    // 北西の高空に浮遊（X=-900, Y=420, Z=-700）
    carrierGroup.position.set(-900, 420, -700)
    carrierGroup.rotation.y = Math.PI * 0.15
    carrierGroup.scale.setScalar(1.0)
    scene.add(carrierGroup)
    // パフォーマンス改善：エンジングローライト削除
    groundTargets.push({
      group: carrierGroup,
      health: 200, maxHealth: 200,
      vel: new THREE.Vector3(4, 0, 2),  // ゆっくり漂流
      type: 'ship'
    })
  }, undefined, () => {
    // GLBロード失敗時は目標数を1減らす
    modeObjectiveTotal = Math.max(1, modeObjectiveTotal - 1)
  })

  // 固定砲台を追加（Original MAP用のみ）
  // ※Tokyo MAPはspawnTokyoSouryokusen()で独自に配置
  if (currentMap === 'original') {
    // Original MAP: 岩柱・アーチの上に砲台配置
    const turretPositions = [
      { x: 0, z: -2800 },    // 北部岩柱群
      { x: 2800, z: 0 },     // 東部アーチ
      { x: -2800, z: 0 },    // 西部タワー
      { x: 0, z: 2800 }      // 南部
    ]
    turretPositions.forEach(pos => {
      const y = terrainH(pos.x, pos.z) + 120  // 地形＋120m（構造物の上）
      const turret = createGroundTurret(pos.x, y, pos.z)
      groundTargets.push(turret)
    })
    modeObjectiveTotal += 4  // 砲台4基を目標に追加
  }

  // 目標数を更新
  setObjective(`地上目標を破壊 0 / ${modeObjectiveTotal}`)
}

// Tokyo MAP専用の総力戦（都市防衛戦）
function spawnTokyoSouryokusen() {
  // 空中の敵 x5（リスポーンあり）
  for (let i = 0; i < 5; i++) spawnEnemy()

  // 地上装甲車両 x6（道路上を移動）
  const roadPositions = [
    { x: 0, z: 300 },      // 中央通り
    { x: 0, z: -300 },     // 青山通り
    { x: -800, z: 0 },     // 環七
    { x: 800, z: 0 },      // 山手通り
    { x: -1200, z: 500 },  // 西部幹線
    { x: 1200, z: -500 },  // 東部幹線
  ]
  for (const pos of roadPositions) {
    const group = createTankTarget()
    const y = neoTokyoMapSystem ? neoTokyoMapSystem.getTerrainHeight(pos.x, pos.z) : 0
    group.position.set(pos.x, y, pos.z)
    group.rotation.y = Math.random() * Math.PI * 2
    scene.add(group)
    groundTargets.push({
      group,
      health: 20,
      maxHealth: 20,
      vel: new THREE.Vector3(),  // 静止目標
      type: 'tank'
    })
  }

  // ビル屋上SAM x5
  const samPositions = [
    { x: 0, y: 400, z: 0 },         // 東京タワー付近
    { x: 1200, y: 650, z: 800 },    // スカイツリー付近
    { x: -800, y: 320, z: -600 },   // 新宿副都心
    { x: 800, y: 180, z: -1200 },   // 渋谷
    { x: -400, y: 200, z: 800 },    // 上野
  ]
  for (const pos of samPositions) {
    const group = createSAMLauncher()
    group.position.set(pos.x, pos.y, pos.z)
    group.rotation.y = Math.random() * Math.PI * 2
    scene.add(group)
    groundTargets.push({
      group,
      health: 15,
      maxHealth: 15,
      vel: new THREE.Vector3(),
      type: 'sam',
      fireCooldown: 8 + Math.random() * 6
    })
  }

  // 攻撃ヘリ x4（ビル間を低空飛行）
  const heliPositions = [
    { x: 400, z: 0 },
    { x: -600, z: -400 },
    { x: 800, z: 600 },
    { x: -400, z: 800 }
  ]
  for (const pos of heliPositions) {
    const group = createHelicopterTarget()
    const baseY = neoTokyoMapSystem ? neoTokyoMapSystem.getTerrainHeight(pos.x, pos.z) + 80 : 80
    group.position.set(pos.x, baseY, pos.z)
    scene.add(group)
    groundTargets.push({
      group,
      health: 30,
      maxHealth: 30,
      vel: new THREE.Vector3(),
      type: 'heli',
      patrolAngle: Math.random() * Math.PI * 2,
      patrolCenter: new THREE.Vector3(pos.x, baseY, pos.z)
    })
  }

  // 大型輸送機 x2（高度300m、爆撃ルート）
  for (let i = 0; i < 2; i++) {
    const group = createBomberModel()
    group.position.set(-3000, 300 + i * 50, -1000 + i * 500)
    group.rotation.y = 0  // 東向き
    scene.add(group)
    groundTargets.push({
      group,
      health: 55,
      maxHealth: 55,
      vel: new THREE.Vector3(50, 0, 0),  // 高速で東へ
      type: 'bomber'
    })
  }

  // 司令部ビル（BOSS）x1 - 既存のビルを流用せず、専用マーカーを配置
  const commandCenterPos = { x: 0, y: 420, z: 0 }  // 東京タワー位置
  const commandGroup = new THREE.Group()
  // 赤い光る立方体（司令部マーカー）
  const markerGeo = new THREE.BoxGeometry(25, 25, 25)
  const markerMat = new THREE.MeshStandardMaterial({
    color: 0xff0000,
    emissive: 0xff3333,
    emissiveIntensity: 2.0,
    roughness: 0.3,
    metalness: 0.8
  })
  const marker = new THREE.Mesh(markerGeo, markerMat)
  commandGroup.add(marker)

  // 回転リング（目立つ演出）
  const ringGeo = new THREE.TorusGeometry(40, 2, 8, 32)
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xff4444,
    emissive: 0xff0000,
    emissiveIntensity: 1.5
  })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.rotation.x = Math.PI / 2
  commandGroup.add(ring)

  commandGroup.position.set(commandCenterPos.x, commandCenterPos.y, commandCenterPos.z)
  scene.add(commandGroup)
  groundTargets.push({
    group: commandGroup,
    health: 150,
    maxHealth: 150,
    vel: new THREE.Vector3(),
    type: 'ship'  // BOSSとして扱う
  })

  // 固定砲台 x4（既存のPhase 3実装）
  const turretPositions = [
    { x: 0, y: 380, z: 0 },           // 東京タワー付近
    { x: 1200, y: 620, z: 800 },      // スカイツリー付近
    { x: -800, y: 300, z: -600 },     // 新宿高層ビル
    { x: 800, y: 160, z: -1200 }      // 渋谷ビル
  ]
  turretPositions.forEach(pos => {
    const turret = createGroundTurret(pos.x, pos.y, pos.z)
    groundTargets.push(turret)
  })

  // 目標数: 装甲車6 + SAM5 + ヘリ4 + 輸送機2 + 司令部1 + 砲台4 = 22
  modeObjectiveTotal = 22
  setObjective(`地上目標を破壊 0 / ${modeObjectiveTotal}`)
}

function updateGroundTargets(dt: number) {
  for (const gt of groundTargets) {
    const hpRatio = gt.health / gt.maxHealth

    // ── 爆撃機: 移動 ──────────────────────────────────────
    if (gt.type === 'bomber' && gt.vel.lengthSq() > 0.01) {
      gt.group.position.addScaledVector(gt.vel, dt)
      if (gt.group.position.x > 2400) gt.group.position.x = -2400
    }

    // ── ヘリコプター: 低高度旋回 ──────────────────────────
    if (gt.type === 'heli') {
      gt.patrolAngle = (gt.patrolAngle ?? 0) + dt * 0.28
      const center = gt.patrolCenter ?? gt.group.position.clone()
      gt.patrolCenter = center
      const r = 120
      gt.group.position.x = center.x + Math.cos(gt.patrolAngle) * r
      gt.group.position.z = center.z + Math.sin(gt.patrolAngle) * r
      gt.group.position.y = terrainH(gt.group.position.x, gt.group.position.z) + 55
                          + Math.sin(gt.patrolAngle * 2.3) * 8
      gt.group.rotation.y = -gt.patrolAngle + Math.PI / 2
    }

    // ── SAM: プレイヤー検知 → ミサイル発射 ───────────────
    if (gt.type === 'sam' && currentMode !== null) {
      gt.fireCooldown = (gt.fireCooldown ?? 14) - dt
      const dist = gt.group.position.distanceTo(player.position)
      if (dist < 950 && (gt.fireCooldown ?? 0) <= 0 && invincibleTimer <= 0) {
        const m = createMissileModel(enemyMissileMat)
        m.position.copy(gt.group.position).y += 9
        scene.add(m)
        const vel = player.position.clone().sub(m.position).normalize().multiplyScalar(175)
        enemyMissiles.push({
          mesh: m, vel, life: 0,
          target: player, diverted: false, spd: 175, turnRate: 0.55, light: null
        })
        gt.fireCooldown = 14 + Math.random() * 8
        playMissileSound()
      }
    }

    // ── 戦艦: プレイヤー検知 → 主砲発射 ───────────────────
    if (gt.type === 'battleship' && currentMode !== null) {
      gt.fireCooldown = (gt.fireCooldown ?? 2.0) - dt
      const dist = gt.group.position.distanceTo(player.position)
      if (dist < 1200 && (gt.fireCooldown ?? 0) <= 0 && invincibleTimer <= 0) {
        // 主砲弾（高速弾丸）を3発同時発射
        for (let i = 0; i < 3; i++) {
          const bulletOffset = new THREE.Vector3(-60 + i * 80, 35, 0)
          bulletOffset.applyQuaternion(gt.group.quaternion)
          const bulletPos = gt.group.position.clone().add(bulletOffset)

          const mesh = new THREE.Mesh(_enemyBulletGeo, enemyBulletMat)
          mesh.position.copy(bulletPos)
          scene.add(mesh)

          const aimDir = player.position.clone().sub(bulletPos).normalize()
          enemyBullets.push({
            mesh,
            vel: aimDir.clone().multiplyScalar(500),  // 高速
            life: 2.0
          })
        }
        gt.fireCooldown = 2.0 + Math.random() * 1.0
        playGunSound()
      }
    }

    // ── 砲台: プレイヤー検知 → レーザー弾発射 ─────────────
    if (gt.type === 'turret' && currentMode !== null) {
      gt.fireCooldown = (gt.fireCooldown ?? 3.0) - dt
      const dist = gt.group.position.distanceTo(player.position)
      if (dist < 800 && (gt.fireCooldown ?? 0) <= 0 && invincibleTimer <= 0) {
        // 砲塔を回転（プレイヤー方向）
        const toPlayer = player.position.clone().sub(gt.group.position)
        const targetAngle = Math.atan2(toPlayer.x, toPlayer.z)
        gt.turretRotation = targetAngle

        // 砲身位置から発射
        const barrelOffset = new THREE.Vector3(25, 15, 0)
        barrelOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle)
        const bulletPos = gt.group.position.clone().add(barrelOffset)

        const mesh = new THREE.Mesh(_enemyBulletGeo, enemyBulletMat)
        mesh.position.copy(bulletPos)
        scene.add(mesh)

        const aimDir = player.position.clone().sub(bulletPos).normalize()
        enemyBullets.push({
          mesh,
          vel: aimDir.clone().multiplyScalar(600),  // 超高速
          life: 1.5
        })

        gt.fireCooldown = 3.0 + Math.random() * 1.5
        playGunSound()
      }

      // 砲塔の回転アニメーション
      if (gt.turretRotation !== undefined) {
        const turretMesh = gt.group.children[1]  // 砲塔部分（仮定）
        if (turretMesh) {
          turretMesh.rotation.y = gt.turretRotation
        }
      }
    }

    // ── 被弾煙エフェクト（HP50%以下） ────────────────────
    if (hpRatio < 0.55) {
      gt.smokeTimer = (gt.smokeTimer ?? 0) - dt
      const rate = (1 - hpRatio) * 3.5  // HP低いほど煙が濃い
      if ((gt.smokeTimer ?? 0) <= 0) {
        const smokeY = gt.group.position.y + (gt.type === 'heli' ? 5 : 10)
        spawnSmoke(new THREE.Vector3(gt.group.position.x, smokeY, gt.group.position.z))
        gt.smokeTimer = 1 / rate
      }
    }
  }
}

function destroyGroundTarget(gi: number) {
  const gt = groundTargets[gi]
  if (lockedTarget === gt) lockedTarget = null  // ロック対象が破壊されたらリセット
  createExplosion(gt.group.position.clone(), 2.5)
  playExplosionSound(2.0)
  scene.remove(gt.group)
  groundTargets.splice(gi, 1)
  modeObjectiveKilled++
  score++; scoreEl.textContent = score.toString()
  if (currentMode === 'dogfight' || currentMode === 'free') return
  setObjective(`地上目標を破壊 ${modeObjectiveKilled} / ${modeObjectiveTotal}`)
  if (modeObjectiveKilled >= modeObjectiveTotal) completeMission()
}

function checkGroundTargetCollisions() {
  outer: for (let bi = bullets.length - 1; bi >= 0; bi--) {
    for (let gi = groundTargets.length - 1; gi >= 0; gi--) {
      if (bullets[bi].mesh.position.distanceTo(groundTargets[gi].group.position) < 14) {
        scene.remove(bullets[bi].mesh); bullets.splice(bi, 1)
        groundTargets[gi].health -= 1
        if (groundTargets[gi].health <= 0) destroyGroundTarget(gi)
        continue outer
      }
    }
  }
  for (let mi = playerMissiles.length - 1; mi >= 0; mi--) {
    const m = playerMissiles[mi]; if (!m) continue
    for (let gi = groundTargets.length - 1; gi >= 0; gi--) {
      if (m.mesh.position.distanceTo(groundTargets[gi].group.position) < 18) {
        createExplosion(m.mesh.position.clone(), 2.0); playExplosionSound(1.8)
        if (m.light) scene.remove(m.light)
        scene.remove(m.mesh); playerMissiles.splice(mi, 1)
        groundTargets[gi].health -= 14
        if (groundTargets[gi].health <= 0) destroyGroundTarget(gi)
        break
      }
    }
  }
}

function completeMission() {
  missionComplete = true
  const overlay = document.getElementById('mission-complete')!
  document.getElementById('mc-score')!.textContent = `スコア: ${score}`
  overlay.style.display = 'flex'
}

// 東京ランドマーク・ビルを管理する配列
const tokyoObjects: THREE.Object3D[] = []

// オリジナルマップの構造物を管理するグループ
const originalMapGroup = new THREE.Group()
originalMapGroup.name = 'OriginalMapStructures'
scene.add(originalMapGroup)
const SPACE_SUPPLY_POSITIONS = [
  new THREE.Vector3(-320, 240, -400),  // 上層・建造現場内
  new THREE.Vector3(360, -40, -570),   // 下層・墓場エリア
  new THREE.Vector3(0, 120, 50),       // 中央回廊・スタート付近
]
let spaceMapGroup: THREE.Group | null = null
let spaceAsteroids: THREE.InstancedMesh | null = null
const spaceZoneGroups: THREE.Group[] = []
const spaceIndividualAsteroids: THREE.Mesh[] = [] // ゾーン周辺の個別小惑星
const rotatingSpaceObjects: THREE.Object3D[] = []
const spaceHazards: Array<{ pos: THREE.Vector3; radius: number }> = []

// ===== SPACE NAVIGATION SYSTEM =====
interface SpaceZone {
  zone_id: string
  position: { x: number; y: number; z: number }
  name: string
  description: string
  layer?: 'upper' | 'middle' | 'lower'
}

const spaceZones: SpaceZone[] = []
const spaceBeacons: THREE.Group[] = []
const navigationBeacons: THREE.Group[] = []  // 全MAP共通のナビゲーションビーコン
let spaceSpawnPoints: { enemy: Array<{ zone: string; offset: { x: number; y: number; z: number } }>; ally: Array<{ zone: string; offset: { x: number; y: number; z: number } }> } | null = null
let spaceNavigationRoutes: Array<{ from: string; to: string; distance: number; direction: { x: number; y: number; z: number } }> = []
const ZONE_COLORS: Record<string, number> = {
  central_hub: 0x00ffff,  // cyan
  fortress: 0xff4444,      // red
  mining_colony: 0xff8844, // orange
  ship_graveyard: 0x888888,// gray
  orbital_ring: 0x4488ff,  // blue
  construction: 0xffdd44   // yellow
}
let currentZone: string | null = null  // 現在いるゾーン
let zoneDisplayTimer = 0  // ゾーン名表示タイマー

// MAP境界の格子表示（戦闘エリアの外周）- 全MAP共通
let mapBoundaryMesh: THREE.LineSegments | null = null

// MAP別の格子設定
interface GridConfig {
  spacing: number      // 格子間隔
  color: number        // 色
  opacity: number      // 最大透明度
  fadeInDistance: number   // フェードイン開始距離
  fadeEndDistance: number  // フェードイン終了距離
}

const GRID_CONFIG: Record<GameMap, GridConfig> = {
  original: {
    spacing: 300,
    color: 0x88ff44,  // 緑
    opacity: 0.6,
    fadeInDistance: 500,
    fadeEndDistance: 150
  },
  tokyo: {
    spacing: 400,
    color: 0xff4488,  // ピンク
    opacity: 0.6,
    fadeInDistance: 700,
    fadeEndDistance: 200
  },
  space: {
    spacing: 200,
    color: 0xff6600,  // オレンジ
    opacity: 0.7,
    fadeInDistance: 300,
    fadeEndDistance: 100
  }
}

function clearSpaceMap() {
  if (!spaceMapGroup) return
  scene.remove(spaceMapGroup)
  spaceMapGroup.traverse(child => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.Line) {
      child.geometry?.dispose()
      const material = child.material
      if (Array.isArray(material)) material.forEach(mat => mat.dispose())
      else material?.dispose()
    }
  })
  spaceMapGroup = null
  spaceAsteroids = null
  spaceZoneGroups.length = 0
  spaceIndividualAsteroids.length = 0 // 個別小惑星もクリア
  rotatingSpaceObjects.length = 0
  spaceHazards.length = 0
  spaceZones.length = 0
  spaceSpawnPoints = null
  spaceNavigationRoutes.length = 0
  spaceBeacons.forEach(b => {
    scene.remove(b)
    b.traverse(child => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
        child.geometry?.dispose()
        const mat = child.material
        if (Array.isArray(mat)) mat.forEach(m => m.dispose())
        else mat?.dispose()
      }
    })
  })
  spaceBeacons.length = 0

  // MAP境界もクリア
  if (mapBoundaryMesh) {
    scene.remove(mapBoundaryMesh)
    mapBoundaryMesh.geometry.dispose()
    ;(mapBoundaryMesh.material as THREE.Material).dispose()
    mapBoundaryMesh = null
  }
}

async function loadSpaceZones(parentGroup: THREE.Group) {
  if (import.meta.env.DEV) console.log('🌌 宇宙MAPゾーンを読み込み中...')

  try {
    // ゾーン設定をJSON から読み込み
    const response = await fetch(import.meta.env.BASE_URL + 'space_map_zones.json')
    if (!response.ok) {
      if (import.meta.env.DEV) console.warn('⚠️ space_map_zones.json が見つかりません。プロシージャル生成のみ使用します')
      return
    }

    const config = await response.json()
    const totalZones = Object.keys(config.zones).length
    const glbZones = Object.values(config.zones).filter((z: any) => z.glb_file !== null).length
    if (import.meta.env.DEV) console.log(`📍 全${totalZones}個のゾーン、うちGLBファイルあり: ${glbZones}個`)

    // ゾーンデータをグローバル配列に保存（ナビゲーション用）
    spaceZones.length = 0
    for (const [, zoneConfig] of Object.entries(config.zones)) {
      const zone = zoneConfig as any
      spaceZones.push({
        zone_id: zone.zone_id,
        position: zone.position,
        name: zone.name,
        description: zone.description,
        layer: zone.layer
      })
    }

    // スポーンポイントを保存
    spaceSpawnPoints = config.spawn_points
    if (import.meta.env.DEV && spaceSpawnPoints) console.log(`🎯 スポーンポイント: 敵${spaceSpawnPoints.enemy.length}箇所、味方${spaceSpawnPoints.ally.length}箇所`)

    // ナビゲーションルートを保存
    spaceNavigationRoutes = config.navigation_routes || []
    if (import.meta.env.DEV) console.log(`🗺️ ナビゲーションルート: ${spaceNavigationRoutes.length}本`)

    // モバイル環境ではGLBを読み込まない（パフォーマンス対策）
    if (isMobileDevice) {
      if (import.meta.env.DEV) console.log('📱 モバイル環境: GLB読み込みをスキップ（プロシージャル生成のみ）')
      // ナビゲーションビーコンは作成
      createSpaceBeacons()
      return
    }

    // 各ゾーンのGLBを読み込み
    const loadPromises: Promise<void>[] = []

    for (const [zoneId, zoneConfig] of Object.entries(config.zones)) {
      const zone = zoneConfig as any

      // central_hubはGLBなし（既存の補給ステーションを使用）
      if (!zone.glb_file) {
        if (import.meta.env.DEV) console.log(`⏭️ ${zone.name}: GLBファイルなし（スキップ）`)
        continue
      }

      const loadPromise = (async () => {
        try {
          if (import.meta.env.DEV) console.log(`📦 ${zone.name} (${zone.glb_file}) を読み込み中...`)

          const gltf = await gltfLoader.loadAsync(import.meta.env.BASE_URL + zone.glb_file)
          const zoneGroup = gltf.scene
          zoneGroup.name = `Zone_${zoneId}`

          // 位置・回転・スケールを適用
          zoneGroup.position.set(zone.position.x, zone.position.y, zone.position.z)
          zoneGroup.rotation.set(zone.rotation.x, zone.rotation.y, zone.rotation.z)
          zoneGroup.scale.setScalar(zone.scale)

          // シャドウ設定
          zoneGroup.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = !isMobileDevice
              child.receiveShadow = !isMobileDevice
            }
          })

          parentGroup.add(zoneGroup)
          spaceZoneGroups.push(zoneGroup)

          // デバッグ: バウンディングボックス情報
          const bbox = new THREE.Box3().setFromObject(zoneGroup)
          const size = bbox.getSize(new THREE.Vector3())
          const center = bbox.getCenter(new THREE.Vector3())
          if (import.meta.env.DEV) {
            console.log(`✅ ${zone.name} 読み込み完了`)
            console.log(`   位置: (${zone.position.x}, ${zone.position.y}, ${zone.position.z})`)
            console.log(`   サイズ: ${size.x.toFixed(0)}×${size.y.toFixed(0)}×${size.z.toFixed(0)}m`)
            console.log(`   中心: (${center.x.toFixed(0)}, ${center.y.toFixed(0)}, ${center.z.toFixed(0)})`)
          }
        } catch (error) {
          console.error(`❌ ${zone.name} (${zone.glb_file}) の読み込みに失敗:`, error)
          // フォールバック: プリミティブで代替
          if (import.meta.env.DEV) console.log(`🔧 ${zone.name} のフォールバック生成中...`)

          const fallbackGroup = new THREE.Group()
          fallbackGroup.name = `Zone_${zoneId}_Fallback`

          // ゾーンサイズに応じたプリミティブ生成
          let geometry: THREE.BufferGeometry
          let size = 100
          if (zone.size === 'xlarge') {
            geometry = new THREE.TorusGeometry(180, 30, 16, 48)
            size = 180
          } else if (zone.size === 'large') {
            geometry = new THREE.BoxGeometry(150, 100, 150)
            size = 150
          } else {
            geometry = new THREE.SphereGeometry(80, 16, 12)
            size = 80
          }

          const material = new THREE.MeshStandardMaterial({
            color: ZONE_COLORS[zoneId] || 0x888888,
            roughness: 0.7,
            metalness: 0.3,
            wireframe: true
          })
          const mesh = new THREE.Mesh(geometry, material)
          fallbackGroup.add(mesh)

          // 位置・回転・スケールを適用
          fallbackGroup.position.set(zone.position.x, zone.position.y, zone.position.z)
          fallbackGroup.rotation.set(zone.rotation.x, zone.rotation.y, zone.rotation.z)
          fallbackGroup.scale.setScalar(zone.scale)

          parentGroup.add(fallbackGroup)
          spaceZoneGroups.push(fallbackGroup)

          if (import.meta.env.DEV) {
            console.log(`✅ ${zone.name} フォールバック生成完了（${zone.size}, ${size}m）`)
          }
        }
      })()

      loadPromises.push(loadPromise)
    }

    // 全てのGLB読み込みを待機
    await Promise.all(loadPromises)
    if (import.meta.env.DEV) console.log('✅ 全ゾーンの読み込み完了')

    // ナビゲーションビーコンを作成
    createSpaceBeacons()

  } catch (error) {
    console.error('❌ ゾーン設定の読み込みに失敗:', error)
    // エラーでも処理を続行（プロシージャル生成のみ使用）
  }
}

// MAP境界の格子を生成（戦闘エリアの外周、近づくと見える）
// MAP境界格子を生成（全MAP共通）
function createMapBoundary(map: GameMap) {
  const bounds = MAP_BOUNDS[map]
  const config = GRID_CONFIG[map]
  const gridSpacing = isMobileDevice ? config.spacing * 2 : config.spacing

  const vertices: number[] = []
  const { minX, maxX, minZ, maxZ } = bounds

  // 地上MAPは2D境界（上下なし）、宇宙MAPは3D境界
  if (map === 'space') {
    const minY = -400, maxY = 500

    // XZ平面の格子（上下2枚）
    for (let y of [minY, maxY]) {
      for (let z = minZ; z <= maxZ; z += gridSpacing) {
        vertices.push(minX, y, z, maxX, y, z)
      }
      for (let x = minX; x <= maxX; x += gridSpacing) {
        vertices.push(x, y, minZ, x, y, maxZ)
      }
    }

    // XY平面の格子（前後2枚）
    for (let z of [minZ, maxZ]) {
      for (let y = minY; y <= maxY; y += gridSpacing) {
        vertices.push(minX, y, z, maxX, y, z)
      }
      for (let x = minX; x <= maxX; x += gridSpacing) {
        vertices.push(x, minY, z, x, maxY, z)
      }
    }

    // YZ平面の格子（左右2枚）
    for (let x of [minX, maxX]) {
      for (let y = minY; y <= maxY; y += gridSpacing) {
        vertices.push(x, y, minZ, x, y, maxZ)
      }
      for (let z = minZ; z <= maxZ; z += gridSpacing) {
        vertices.push(x, minY, z, x, maxY, z)
      }
    }
  } else {
    // 地上MAP: 垂直の壁（4面）のみ
    const groundY = map === 'tokyo' ? 0 : 0
    const wallHeight = 1500  // 1.5km高さの壁

    // 前後の壁
    for (let z of [minZ, maxZ]) {
      for (let y = groundY; y <= groundY + wallHeight; y += gridSpacing) {
        vertices.push(minX, y, z, maxX, y, z)
      }
      for (let x = minX; x <= maxX; x += gridSpacing) {
        vertices.push(x, groundY, z, x, groundY + wallHeight, z)
      }
    }

    // 左右の壁
    for (let x of [minX, maxX]) {
      for (let y = groundY; y <= groundY + wallHeight; y += gridSpacing) {
        vertices.push(x, y, minZ, x, y, maxZ)
      }
      for (let z = minZ; z <= maxZ; z += gridSpacing) {
        vertices.push(x, groundY, z, x, groundY + wallHeight, z)
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))

  const material = new THREE.LineBasicMaterial({
    color: config.color,
    transparent: true,
    opacity: 0,  // 初期状態は完全に透明（近づくとフェードイン）
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })

  mapBoundaryMesh = new THREE.LineSegments(geometry, material)
  scene.add(mapBoundaryMesh)

  if (import.meta.env.DEV) {
    const size = `${(maxX-minX)/1000}×${(maxZ-minZ)/1000}km`
    console.log(`🔲 ${map.toUpperCase()} MAP境界格子を生成（${size}、格子間隔${gridSpacing}m）`)
  }
}

// ナビゲーションビーコンを各ゾーンに配置
function createSpaceBeacons() {
  spaceZones.forEach(zone => {
    const beaconGroup = new THREE.Group()
    beaconGroup.name = `Beacon_${zone.zone_id}`
    beaconGroup.position.set(zone.position.x, zone.position.y, zone.position.z)

    // パーティクル風のビーコン（小さなポイント群）
    const particleCount = 20
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)
    const color = new THREE.Color(ZONE_COLORS[zone.zone_id] || 0xffffff)

    for (let i = 0; i < particleCount; i++) {
      const radius = 15 + Math.random() * 10
      const theta = Math.random() * Math.PI * 2
      const phi = Math.random() * Math.PI
      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius
      positions[i * 3 + 1] = Math.cos(phi) * radius
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const mat = new THREE.PointsMaterial({
      size: 3,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })

    const points = new THREE.Points(geo, mat)
    beaconGroup.add(points)

    // 発光リング（中心マーカー）
    const ringGeo = new THREE.RingGeometry(8, 12, 16)
    const ringMat = new THREE.MeshBasicMaterial({
      color: ZONE_COLORS[zone.zone_id] || 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    beaconGroup.add(ring)

    scene.add(beaconGroup)
    spaceBeacons.push(beaconGroup)
  })

  if (import.meta.env.DEV) console.log(`🎯 ${spaceBeacons.length}個のナビゲーションビーコンを配置`)
}

// 全MAP共通のナビゲーションビーコン生成
function createNavigationBeacons(map: GameMap) {
  // 既存のビーコンをクリア
  navigationBeacons.forEach(b => {
    scene.remove(b)
    b.traverse(child => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
        child.geometry?.dispose()
        const mat = child.material
        if (Array.isArray(mat)) mat.forEach(m => m.dispose())
        else mat?.dispose()
      }
    })
  })
  navigationBeacons.length = 0

  interface BeaconDef {
    x: number
    y: number
    z: number
    name: string
    color: number
  }

  let beacons: BeaconDef[] = []

  if (map === 'original') {
    // Original MAP: 岩柱・アーチにビーコン
    beacons = [
      { x: 0, y: 0, z: -2800, name: '北部岩柱群', color: 0x88ff44 },
      { x: 2800, y: 0, z: 0, name: '東部アーチ', color: 0x88ff44 },
      { x: -2800, y: 0, z: 0, name: '西部タワー', color: 0x88ff44 },
      { x: 0, y: 0, z: 2800, name: '南部平原', color: 0x88ff44 }
    ]
  } else if (map === 'tokyo') {
    // Tokyo MAP: ランドマークにビーコン
    beacons = [
      { x: 0, y: 400, z: 0, name: '東京タワー', color: 0xff4488 },
      { x: 1200, y: 650, z: 800, name: 'スカイツリー', color: 0xff4488 },
      { x: -800, y: 320, z: -600, name: '新宿副都心', color: 0xff4488 },
      { x: 800, y: 180, z: -1200, name: '渋谷', color: 0xff4488 }
    ]
  }

  // ビーコン生成
  beacons.forEach(def => {
    const beaconGroup = new THREE.Group()
    beaconGroup.name = `NavBeacon_${def.name}`

    // Y座標を地形高度に合わせる（地上MAPのみ）
    let y = def.y
    if (map === 'original') {
      y = terrainH(def.x, def.z) + 180  // 地形＋180m上空
    } else if (map === 'tokyo') {
      y = def.y  // Tokyoは既に絶対高度
    }
    beaconGroup.position.set(def.x, y, def.z)

    // パーティクル
    const particleCount = 20
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)
    const color = new THREE.Color(def.color)

    for (let i = 0; i < particleCount; i++) {
      const radius = 15 + Math.random() * 10
      const theta = Math.random() * Math.PI * 2
      const phi = Math.random() * Math.PI
      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius
      positions[i * 3 + 1] = Math.cos(phi) * radius
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const mat = new THREE.PointsMaterial({
      size: 3,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })

    const points = new THREE.Points(geo, mat)
    beaconGroup.add(points)

    // 発光リング
    const ringGeo = new THREE.RingGeometry(8, 12, 16)
    const ringMat = new THREE.MeshBasicMaterial({
      color: def.color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    beaconGroup.add(ring)

    scene.add(beaconGroup)
    navigationBeacons.push(beaconGroup)
  })

  if (import.meta.env.DEV && beacons.length > 0) {
    console.log(`🎯 ${map.toUpperCase()}: ${beacons.length}個のナビゲーションビーコンを配置`)
  }
}

// 宇宙MAP総力戦モード用の戦艦を生成
function createBattleship(x: number, y: number, z: number): GroundTarget {
  const group = new THREE.Group()

  // 船体（長さ400m、幅80m、高さ60m）
  const hullGeo = new THREE.BoxGeometry(400, 60, 80)
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.6, metalness: 0.7 })
  const hull = new THREE.Mesh(hullGeo, hullMat)
  group.add(hull)

  // 艦橋（前方）
  const bridgeGeo = new THREE.BoxGeometry(60, 80, 50)
  const bridge = new THREE.Mesh(bridgeGeo, hullMat)
  bridge.position.set(120, 40, 0)
  group.add(bridge)

  // 主砲塔（3基）
  for (let i = 0; i < 3; i++) {
    const turretBase = new THREE.Mesh(new THREE.CylinderGeometry(20, 25, 15, 8), hullMat)
    turretBase.position.set(-60 + i * 80, 35, 0)
    group.add(turretBase)

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 80, 8), hullMat)
    barrel.rotation.z = Math.PI / 2
    barrel.position.set(-60 + i * 80 + 40, 35, 0)
    group.add(barrel)
  }

  // 発光エンジン（後方）
  const engineLight = new THREE.PointLight(0x4488ff, 3, 200)
  engineLight.position.set(-220, 0, 0)
  group.add(engineLight)

  group.position.set(x, y, z)
  group.rotation.y = Math.random() * Math.PI * 2
  scene.add(group)

  return {
    group,
    health: 20,
    maxHealth: 20,
    vel: new THREE.Vector3(0, 0, 0),
    type: 'battleship',
    fireCooldown: 2.0,
    turretRotation: 0
  }
}

// 構造物に付属する砲台を生成
function createTurret(attachedZone: string, offsetX: number, offsetY: number, offsetZ: number): GroundTarget {
  const zone = spaceZones.find(z => z.zone_id === attachedZone)
  if (!zone) {
    // フォールバック
    return createTurret('central_hub', offsetX, offsetY, offsetZ)
  }

  const group = new THREE.Group()

  // 基部
  const baseGeo = new THREE.CylinderGeometry(12, 18, 20, 8)
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.7, metalness: 0.6 })
  const base = new THREE.Mesh(baseGeo, baseMat)
  group.add(base)

  // 砲塔
  const turretGeo = new THREE.SphereGeometry(15, 12, 8)
  const turret = new THREE.Mesh(turretGeo, baseMat)
  turret.position.y = 15
  group.add(turret)

  // 砲身
  const barrelGeo = new THREE.CylinderGeometry(3, 3, 50, 8)
  const barrel = new THREE.Mesh(barrelGeo, baseMat)
  barrel.rotation.z = Math.PI / 2
  barrel.position.set(25, 15, 0)
  group.add(barrel)

  // 発光（レーダー風）
  const light = new THREE.PointLight(0xff4444, 1.5, 80)
  light.position.y = 20
  group.add(light)

  const x = zone.position.x + offsetX
  const y = zone.position.y + offsetY
  const z = zone.position.z + offsetZ

  group.position.set(x, y, z)
  scene.add(group)

  return {
    group,
    health: 5,
    maxHealth: 5,
    vel: new THREE.Vector3(0, 0, 0),
    type: 'turret',
    fireCooldown: 3.0,
    attachedTo: attachedZone,
    turretRotation: 0
  }
}

// 宇宙MAP総力戦モードの敵配置
function spawnSpaceTotalWarEnemies() {
  if (import.meta.env.DEV) console.log('🚀 宇宙MAP総力戦モード開始')

  // 戦艦を配置（各ゾーン付近に1隻ずつ）
  const battleshipPositions = [
    { x: 800, y: -600, z: -2200 },   // 要塞付近
    { x: -2000, y: -1600, z: -200 }, // 採掘コロニー付近
    { x: 2000, y: 800, z: 1800 },    // 船墓場付近
    { x: -400, y: 1800, z: -2000 },  // 軌道リング付近
  ]

  battleshipPositions.forEach(pos => {
    const battleship = createBattleship(pos.x, pos.y, pos.z)
    groundTargets.push(battleship)
  })

  // 砲台を配置（各主要ゾーンに3-4基）
  const turretPlacements: Array<{ zone: string; offsets: Array<{ x: number; y: number; z: number }> }> = [
    { zone: 'fortress', offsets: [
      { x: 250, y: 0, z: 200 },
      { x: -250, y: 0, z: 200 },
      { x: 0, y: 150, z: 0 },
      { x: 0, y: -150, z: 0 }
    ]},
    { zone: 'mining_colony', offsets: [
      { x: 200, y: 0, z: 200 },
      { x: -200, y: 0, z: -200 },
      { x: 0, y: 150, z: 0 }
    ]},
    { zone: 'ship_graveyard', offsets: [
      { x: 250, y: 0, z: 250 },
      { x: -250, y: 0, z: -250 },
      { x: 150, y: 100, z: -150 }
    ]},
    { zone: 'orbital_ring', offsets: [
      { x: 0, y: 200, z: 0 },
      { x: 200, y: 0, z: 200 },
      { x: -200, y: 0, z: -200 }
    ]}
  ]

  turretPlacements.forEach(placement => {
    placement.offsets.forEach(offset => {
      const turret = createTurret(placement.zone, offset.x, offset.y, offset.z)
      groundTargets.push(turret)
    })
  })

  if (import.meta.env.DEV) console.log(`⚔️ 総力戦: 戦艦${battleshipPositions.length}隻、砲台${turretPlacements.reduce((sum, p) => sum + p.offsets.length, 0)}基を配置`)
}

async function buildSpaceMap() {
  clearSpaceMap()
  const space = new THREE.Group()
  space.name = 'SpaceSectorMap'
  spaceMapGroup = space
  scene.add(space)

  // GLBゾーンを読み込み
  await loadSpaceZones(space)

  const starCount = isMobileDevice ? 1200 : 2600
  const starPos = new Float32Array(starCount * 3)
  const starCol = new Float32Array(starCount * 3)
  const starPalette = [0xffffff, 0xbcd7ff, 0x88a8ff, 0xffe2aa]
  for (let i = 0; i < starCount; i++) {
    const radius = 2300 + Math.random() * 9200
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    starPos[i * 3] = Math.sin(phi) * Math.cos(theta) * radius
    starPos[i * 3 + 1] = Math.cos(phi) * radius
    starPos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius
    const col = new THREE.Color(starPalette[Math.floor(Math.random() * starPalette.length)])
    const twinkle = 0.72 + Math.random() * 0.28
    starCol[i * 3] = col.r * twinkle
    starCol[i * 3 + 1] = col.g * twinkle
    starCol[i * 3 + 2] = col.b * twinkle
  }
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3))
  space.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
    size: 9, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
  })))

  const nebulaCount = isMobileDevice ? 260 : 620
  const nebulaPos = new Float32Array(nebulaCount * 3)
  const nebulaCol = new Float32Array(nebulaCount * 3)
  for (let i = 0; i < nebulaCount; i++) {
    const t = (i / nebulaCount) * Math.PI * 2
    const spread = 520 + Math.random() * 1700
    nebulaPos[i * 3] = Math.cos(t * 0.7) * spread + (Math.random() - 0.5) * 1000
    nebulaPos[i * 3 + 1] = Math.sin(t * 1.9) * 360 + (Math.random() - 0.5) * 780
    nebulaPos[i * 3 + 2] = -2600 + Math.sin(t) * 1700 + (Math.random() - 0.5) * 1200
    const col = new THREE.Color(Math.random() > 0.45 ? 0x49cfff : 0xb264ff)
    nebulaCol[i * 3] = col.r
    nebulaCol[i * 3 + 1] = col.g
    nebulaCol[i * 3 + 2] = col.b
  }
  const nebulaGeo = new THREE.BufferGeometry()
  nebulaGeo.setAttribute('position', new THREE.BufferAttribute(nebulaPos, 3))
  nebulaGeo.setAttribute('color', new THREE.BufferAttribute(nebulaCol, 3))
  space.add(new THREE.Points(nebulaGeo, new THREE.PointsMaterial({
    size: 46, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.20,
    depthWrite: false, blending: THREE.AdditiveBlending,
  })))

  const eclipticMat = new THREE.MeshBasicMaterial({
    color: 0x5ce7ff, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false,
  })
  for (const radius of [520, 920, 1480, 2140]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 1.6, radius + 1.6, 180), eclipticMat)
    ring.rotation.x = -Math.PI / 2
    space.add(ring)
  }
  const axisGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-2400, 0, 0), new THREE.Vector3(2400, 0, 0),
    new THREE.Vector3(0, 0, -2400), new THREE.Vector3(0, 0, 2400),
    new THREE.Vector3(0, -560, 0), new THREE.Vector3(0, 560, 0),
  ])
  space.add(new THREE.LineSegments(axisGeo, new THREE.LineBasicMaterial({
    color: 0x6df7ff, transparent: true, opacity: 0.22,
  })))

  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(720, 48, 32),
    new THREE.MeshStandardMaterial({ color: 0x2f68a8, emissive: 0x061b3f, emissiveIntensity: 0.55, roughness: 0.86, metalness: 0 })
  )
  planet.position.set(-2550, -780, -4300)
  space.add(planet)
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(900, 1240, 144),
    new THREE.MeshBasicMaterial({ color: 0x8fb7ff, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false })
  )
  ring.position.copy(planet.position)
  ring.rotation.set(1.16, 0.24, -0.38)
  space.add(ring)
  rotatingSpaceObjects.push(planet, ring)

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(170, 28, 18),
    new THREE.MeshStandardMaterial({ color: 0xa0a9b8, roughness: 0.92, metalness: 0.02 })
  )
  moon.position.set(1850, 560, -2900)
  space.add(moon)
  rotatingSpaceObjects.push(moon)

  const asteroidGeo = new THREE.DodecahedronGeometry(1, 1)
  const asteroidMat = new THREE.MeshStandardMaterial({ color: 0x7b7780, roughness: 0.95, metalness: 0.04, flatShading: true })
  const asteroidCount = isMobileDevice ? 480 : 1200  // デブリ密度2倍
  const asteroids = new THREE.InstancedMesh(asteroidGeo, asteroidMat, asteroidCount)
  const obj = new THREE.Object3D()

  for (let i = 0; i < asteroidCount; i++) {
    // レイヤー構造（各300m厚）
    const layer = i % 3
    let y = 0
    if (layer === 0) {
      y = -400 + Math.random() * 300  // 下層: -400〜-100m
    } else if (layer === 1) {
      y = -100 + Math.random() * 300  // 中層: -100〜+200m
    } else {
      y = 200 + Math.random() * 300   // 上層: +200〜+500m
    }

    // XZ平面：MAP全体（6km×6km）に配置
    const x = -2800 + Math.random() * 5600
    const z = -2800 + Math.random() * 5600

    // 中央補給ステーション周辺クリア（0,50,0）半径300m
    const hubDist = Math.sqrt(x * x + z * z)
    if (hubDist < 300 && Math.abs(y - 50) < 150) {
      continue
    }

    // 主要ルート（幅400m）をクリア：補給→要塞→リング
    if (Math.abs(x) < 200 && z < 200 && z > -2500 && Math.abs(y - 50) < 150) {
      continue
    }

    // レイヤー別のサイズ分布
    let s = 0
    if (layer === 0) {
      // 下層：中〜大型（密集感・カバー）
      s = 12 + Math.random() * 35  // 12〜47m
    } else if (layer === 1) {
      // 中層：小〜中型（バランス）
      s = 8 + Math.random() * 22   // 8〜30m
    } else {
      // 上層：小型主体（開放感）
      s = 5 + Math.random() * 15   // 5〜20m
    }

    // 位置に多少のランダムオフセットを追加
    obj.position.set(
      x + (Math.random() - 0.5) * 100,
      y + (Math.random() - 0.5) * 80,
      z + (Math.random() - 0.5) * 100
    )

    const hazardRadius = s * 1.15 + 7
    spaceHazards.push({ pos: obj.position.clone(), radius: hazardRadius })

    obj.scale.set(s * (0.75 + Math.random() * 0.8), s * (0.55 + Math.random() * 0.65), s * (0.75 + Math.random() * 0.75))
    obj.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
    obj.updateMatrix()
    asteroids.setMatrixAt(i, obj.matrix)
  }
  asteroids.instanceMatrix.needsUpdate = true
  asteroids.castShadow = !isMobileDevice
  asteroids.receiveShadow = !isMobileDevice
  space.add(asteroids)
  spaceAsteroids = asteroids

  // ===== 小惑星クラスター（密集エリア） =====
  const ASTEROID_CLUSTERS = [
    { x: -1500, y: 100, z: -1000, count: 1500, radius: 500 },  // 採掘コロニー付近（10倍密度、拡張）
    { x: 1000, y: -200, z: 800, count: 120, radius: 250 },    // 南東エリア
    { x: -800, y: 400, z: 1200, count: 100, radius: 200 },    // 建造現場付近
  ]

  const clusterAsteroidCount = ASTEROID_CLUSTERS.reduce((sum, c) => sum + c.count, 0)
  const clusterAsteroids = new THREE.InstancedMesh(asteroidGeo, asteroidMat, clusterAsteroidCount)
  let clusterIndex = 0

  for (const cluster of ASTEROID_CLUSTERS) {
    for (let i = 0; i < cluster.count; i++) {
      // クラスター中心からの球体分布
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = Math.random() * cluster.radius

      const offsetX = r * Math.sin(phi) * Math.cos(theta)
      const offsetY = r * Math.sin(phi) * Math.sin(theta)
      const offsetZ = r * Math.cos(phi)

      obj.position.set(
        cluster.x + offsetX,
        cluster.y + offsetY,
        cluster.z + offsetZ
      )

      const s = 8 + Math.random() * 25  // サイズ8-33m
      obj.scale.set(s * (0.75 + Math.random() * 0.8), s * (0.55 + Math.random() * 0.65), s * (0.75 + Math.random() * 0.75))
      obj.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
      obj.updateMatrix()
      clusterAsteroids.setMatrixAt(clusterIndex++, obj.matrix)

      const hazardRadius = s * 1.15 + 7
      spaceHazards.push({ pos: obj.position.clone(), radius: hazardRadius })
    }
  }

  clusterAsteroids.instanceMatrix.needsUpdate = true
  clusterAsteroids.castShadow = !isMobileDevice
  clusterAsteroids.receiveShadow = !isMobileDevice
  space.add(clusterAsteroids)

  // ゾーン周辺の戦術的障害物配置
  if (spaceZones.length > 0) {
    const zoneAsteroidGeo = new THREE.DodecahedronGeometry(1, 1)
    const zoneAsteroidMat = new THREE.MeshStandardMaterial({ color: 0x8a8288, roughness: 0.9, metalness: 0.08, flatShading: true })

    for (const zone of spaceZones) {
      if (zone.zone_id === 'central_hub') continue // 補給ステーションは障害物なし

      // ゾーンごとの特徴的な小惑星配置
      let count = 0
      let radiusMin = 0
      let radiusMax = 0
      let sizeMin = 0
      let sizeMax = 0

      if (zone.zone_id === 'mining_colony') {
        // 採掘コロニー：密集（半径300m内に80個）
        count = 80
        radiusMin = 50
        radiusMax = 300
        sizeMin = 20
        sizeMax = 80
      } else if (zone.zone_id === 'ship_graveyard') {
        // 船墓場：中型デブリ散在
        count = 40
        radiusMin = 100
        radiusMax = 350
        sizeMin = 15
        sizeMax = 50
      } else if (zone.zone_id === 'fortress') {
        // 要塞：外周に中型
        count = 30
        radiusMin = 150
        radiusMax = 250
        sizeMin = 15
        sizeMax = 40
      } else if (zone.zone_id === 'construction') {
        // 建造現場：フレーム周辺
        count = 40
        radiusMin = 120
        radiusMax = 280
        sizeMin = 15
        sizeMax = 40
      } else if (zone.zone_id === 'orbital_ring') {
        // 軌道リング：ほぼクリア
        count = 15
        radiusMin = 400
        radiusMax = 600
        sizeMin = 8
        sizeMax = 20
      } else {
        // 補給ステーション：クリア
        continue
      }

      for (let j = 0; j < count; j++) {
        const angle = (j / count) * Math.PI * 2 + (Math.random() - 0.5) * 1.0
        const dist = radiusMin + Math.random() * (radiusMax - radiusMin)
        const offsetX = Math.cos(angle) * dist
        const offsetZ = Math.sin(angle) * dist
        const offsetY = (Math.random() - 0.5) * 150

        const size = sizeMin + Math.random() * (sizeMax - sizeMin)
        const asteroid = new THREE.Mesh(zoneAsteroidGeo, zoneAsteroidMat)
        asteroid.position.set(
          zone.position.x + offsetX,
          zone.position.y + offsetY,
          zone.position.z + offsetZ
        )
        asteroid.scale.set(
          size * (0.7 + Math.random() * 0.6),
          size * (0.6 + Math.random() * 0.5),
          size * (0.7 + Math.random() * 0.6)
        )
        asteroid.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
        asteroid.castShadow = !isMobileDevice
        asteroid.receiveShadow = !isMobileDevice
        space.add(asteroid)
        spaceIndividualAsteroids.push(asteroid) // 衝突判定用に登録
      }
    }
  }

  const railMat = new THREE.MeshStandardMaterial({ color: 0x9fb6c8, emissive: 0x14355a, emissiveIntensity: 0.9, roughness: 0.44, metalness: 0.72 })
  const glowCyan = new THREE.MeshStandardMaterial({ color: 0x6df7ff, emissive: 0x00b7ff, emissiveIntensity: 2.9, roughness: 0.25, metalness: 0.25 })
  const glowViolet = new THREE.MeshBasicMaterial({ color: 0xb05cff, transparent: true, opacity: 0.42, side: THREE.DoubleSide })
  const laneMat = new THREE.MeshBasicMaterial({ color: 0x5ce7ff, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false })

  const navPath = [
    new THREE.Vector3(0, 50, 0),          // 補給ステーション
    new THREE.Vector3(0, 30, -600),       // 要塞手前
    new THREE.Vector3(0, 0, -1800),       // 要塞中心
    new THREE.Vector3(-1000, -150, -1650), // 採掘コロニーへ
    new THREE.Vector3(-2000, -250, -1500), // 採掘コロニー
    new THREE.Vector3(0, -100, -1800),    // 要塞下層経由
    new THREE.Vector3(1050, -150, -1700), // 船墓場へ
    new THREE.Vector3(2100, -200, -1600), // 船墓場
    new THREE.Vector3(0, 100, -2100),     // リング手前上昇
    new THREE.Vector3(0, 350, -2400),     // 軌道リング
    new THREE.Vector3(-900, 350, 0),      // 建造現場へ
    new THREE.Vector3(-1800, 350, 1600),  // 建造現場
  ]
  for (let i = 0; i < navPath.length; i++) {
    const navRing = new THREE.Mesh(new THREE.TorusGeometry(34 + i * 4, 1.6, 8, 56), laneMat)
    const dir = (navPath[i + 1] ?? navPath[i]).clone().sub(navPath[Math.max(0, i - 1)])
    navRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.lengthSq() > 0 ? dir.normalize() : new THREE.Vector3(0, 0, -1))
    navRing.position.copy(navPath[i])
    space.add(navRing)
    rotatingSpaceObjects.push(navRing)
  }


  const station = new THREE.Group()
  const railHub = new THREE.Mesh(new THREE.CylinderGeometry(24, 34, 130, 16), railMat)
  railHub.rotation.z = Math.PI / 2
  station.add(railHub)
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(170, 10, 12), railMat)
    arm.rotation.z = i * Math.PI / 2
    station.add(arm)
    const pod = new THREE.Mesh(new THREE.BoxGeometry(24, 24, 46), glowCyan)
    pod.position.set(Math.cos(i * Math.PI / 2) * 100, Math.sin(i * Math.PI / 2) * 100, 0)
    station.add(pod)
  }
  station.position.set(-1200, 200, 500)  // 建造現場近く
  station.rotation.set(0.3, -0.4, 0.5)
  space.add(station)
  rotatingSpaceObjects.push(station)
  const stationLight = new THREE.PointLight(0x60e7ff, 5.8, 900)
  stationLight.position.copy(station.position)
  space.add(stationLight)

  const rift = new THREE.Mesh(new THREE.RingGeometry(110, 190, 96), glowViolet)
  rift.position.set(1400, -150, -1200)  // 船墓場近く
  rift.rotation.set(0.3, -0.5, 0.2)
  space.add(rift)
  rotatingSpaceObjects.push(rift)

  for (const p of SPACE_SUPPLY_POSITIONS) {
    const beacon = new THREE.Group()
    beacon.add(new THREE.Mesh(new THREE.OctahedronGeometry(18), glowCyan))
    const halo1 = new THREE.Mesh(new THREE.TorusGeometry(42, 1.8, 8, 44), glowCyan)
    const halo2 = new THREE.Mesh(new THREE.TorusGeometry(60, 1.2, 8, 52), glowCyan)
    halo2.rotation.y = Math.PI / 2
    beacon.add(halo1, halo2)
    // 遠距離でも見えるパルスリング（大きめ）
    const pulseMat = new THREE.MeshBasicMaterial({
      color: 0x00d4ff, transparent: true, opacity: 0.60, side: THREE.DoubleSide, depthWrite: false
    })
    const pulseRing = new THREE.Mesh(new THREE.RingGeometry(80, 90, 32), pulseMat)
    pulseRing.rotation.x = Math.PI / 2
    beacon.add(pulseRing)
    beacon.position.copy(p)
    space.add(beacon)
    rotatingSpaceObjects.push(beacon)
    const tether = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -230, 0), new THREE.Vector3(0, 230, 0)]),
      new THREE.LineBasicMaterial({ color: 0x6df7ff, transparent: true, opacity: 0.44 })
    )
    tether.position.copy(p)
    space.add(tether)
  }

  // ゾーンごとの特徴的ライト
  // 採掘コロニー: オレンジ色の採掘ライト
  const miningLight = new THREE.PointLight(0xff8800, 8, 600)
  miningLight.position.set(-2000, -250, -1500)
  space.add(miningLight)

  // 船墓場: 赤い警告灯
  const graveyardLight = new THREE.PointLight(0xff3300, 6, 550)
  graveyardLight.position.set(2100, -200, -1600)
  space.add(graveyardLight)

  // 軌道リング: 白い構造ライト
  const ringLight = new THREE.PointLight(0xffffff, 12, 900)
  ringLight.position.set(0, 350, -2400)
  space.add(ringLight)

  // 要塞: 青白い非常灯
  const fortressLight = new THREE.PointLight(0x88aaff, 7, 650)
  fortressLight.position.set(0, 0, -1800)
  space.add(fortressLight)

  // 建造現場: 黄色い作業灯
  const constructionLight = new THREE.PointLight(0xffdd00, 7, 600)
  constructionLight.position.set(-1800, 350, 1600)
  space.add(constructionLight)

  // ===== ランドマーク: Mothership Wreck（マザーシップ残骸 - 全長1500m） =====
  gltfLoader.load(import.meta.env.BASE_URL + 'models/landmark_mothership_wreck.glb', (gltf) => {
    const mothership = gltf.scene
    mothership.position.set(0, -500, -3000) // MAP奥深く
    mothership.rotation.y = Math.PI / 4
    mothership.rotation.x = Math.PI / 12
    mothership.name = 'MothershipWreck'
    space.add(mothership)
    console.log('✅ Mothership Wreck loaded (1500m landmark)')
  })

  // ===== ストーリー要素: 戦闘デブリ =====
  const BATTLE_DEBRIS_POSITIONS = [
    // 脱出ポッド（12個）
    { x: -1000, y: 200, z: -500, scale: 1.0, rotation: 0, type: 'pod' },
    { x: 800, y: -300, z: 600, scale: 1.1, rotation: Math.PI / 3, type: 'pod' },
    { x: -1200, y: 400, z: 1000, scale: 0.9, rotation: -Math.PI / 4, type: 'pod' },
    { x: 1400, y: -500, z: -400, scale: 1.0, rotation: Math.PI / 2, type: 'pod' },
    { x: -700, y: 300, z: -800, scale: 1.2, rotation: Math.PI, type: 'pod' },
    { x: 600, y: -200, z: 900, scale: 0.8, rotation: -Math.PI / 6, type: 'pod' },
    { x: -1400, y: 150, z: 400, scale: 1.1, rotation: Math.PI / 4, type: 'pod' },
    { x: 1000, y: 350, z: -1000, scale: 0.9, rotation: -Math.PI / 3, type: 'pod' },
    { x: -500, y: -400, z: 700, scale: 1.0, rotation: Math.PI / 6, type: 'pod' },
    { x: 900, y: 250, z: -700, scale: 1.1, rotation: -Math.PI / 2, type: 'pod' },
    { x: -1100, y: -100, z: -600, scale: 0.95, rotation: Math.PI / 3, type: 'pod' },
    { x: 1200, y: 400, z: 500, scale: 1.05, rotation: -Math.PI / 4, type: 'pod' },

    // 戦闘機残骸（8個）
    { x: 1500, y: -300, z: 800, scale: 1.5, rotation: Math.PI / 4, type: 'fighter' },
    { x: -1300, y: 200, z: -900, scale: 1.4, rotation: -Math.PI / 3, type: 'fighter' },
    { x: 700, y: 400, z: -1100, scale: 1.6, rotation: Math.PI / 2, type: 'fighter' },
    { x: -900, y: -250, z: 1200, scale: 1.3, rotation: Math.PI, type: 'fighter' },
    { x: 1100, y: 300, z: -500, scale: 1.5, rotation: -Math.PI / 6, type: 'fighter' },
    { x: -1400, y: -400, z: 600, scale: 1.4, rotation: Math.PI / 3, type: 'fighter' },
    { x: 500, y: 150, z: 1000, scale: 1.6, rotation: -Math.PI / 4, type: 'fighter' },
    { x: -600, y: -350, z: -800, scale: 1.3, rotation: Math.PI / 6, type: 'fighter' },

    // ミサイル残骸（20個、広範囲に散布）
    { x: -400, y: 100, z: -300, scale: 0.8, rotation: 0, type: 'missile' },
    { x: 300, y: -150, z: 400, scale: 0.9, rotation: Math.PI / 3, type: 'missile' },
    { x: -700, y: 250, z: 600, scale: 0.7, rotation: -Math.PI / 4, type: 'missile' },
    { x: 900, y: -200, z: -500, scale: 0.85, rotation: Math.PI / 2, type: 'missile' },
    { x: -1000, y: 350, z: 200, scale: 0.75, rotation: Math.PI, type: 'missile' },
    { x: 600, y: -300, z: -700, scale: 0.9, rotation: -Math.PI / 6, type: 'missile' },
    { x: -500, y: 200, z: 900, scale: 0.8, rotation: Math.PI / 4, type: 'missile' },
    { x: 1100, y: -100, z: 300, scale: 0.85, rotation: -Math.PI / 3, type: 'missile' },
    { x: -800, y: 400, z: -400, scale: 0.7, rotation: Math.PI / 6, type: 'missile' },
    { x: 400, y: -250, z: 800, scale: 0.9, rotation: -Math.PI / 2, type: 'missile' },
    { x: -1200, y: 150, z: -100, scale: 0.75, rotation: Math.PI / 3, type: 'missile' },
    { x: 800, y: 300, z: -900, scale: 0.85, rotation: -Math.PI / 4, type: 'missile' },
    { x: -300, y: -350, z: 500, scale: 0.8, rotation: Math.PI / 2, type: 'missile' },
    { x: 1000, y: 250, z: -200, scale: 0.9, rotation: Math.PI, type: 'missile' },
    { x: -900, y: -150, z: 700, scale: 0.7, rotation: -Math.PI / 6, type: 'missile' },
    { x: 500, y: 350, z: -600, scale: 0.85, rotation: Math.PI / 4, type: 'missile' },
    { x: -600, y: 100, z: 1100, scale: 0.75, rotation: -Math.PI / 3, type: 'missile' },
    { x: 1300, y: -200, z: 100, scale: 0.9, rotation: Math.PI / 6, type: 'missile' },
    { x: -1100, y: 400, z: -700, scale: 0.8, rotation: -Math.PI / 2, type: 'missile' },
    { x: 700, y: -300, z: 600, scale: 0.85, rotation: Math.PI / 3, type: 'missile' },
  ]

  gltfLoader.load(import.meta.env.BASE_URL + 'models/story_battle_debris.glb', (gltf) => {
    for (const pos of BATTLE_DEBRIS_POSITIONS) {
      const debris = gltf.scene.clone()
      debris.position.set(pos.x, pos.y, pos.z)
      debris.scale.setScalar(pos.scale)
      debris.rotation.set(
        Math.random() * Math.PI,
        pos.rotation,
        Math.random() * Math.PI
      )
      debris.name = 'BattleDebris'
      space.add(debris)
    }
    console.log('✅ Battle Debris loaded (40 objects: 12 pods, 8 fighters, 20 missiles)')
  })

  // ===== 巨大回転リングステーション（GLB 3バリエーション - ゾーン別配置） =====
  // 軌道リング周辺に配置（テーマ性）
  const RING_STATIONS = [
    { x: -200, y: 350, z: -2200, radius: 250, rotSpeed: 0.0012 },  // 軌道リング近く
    { x: 300, y: 400, z: -2600, radius: 200, rotSpeed: 0.001 },    // 軌道リング近く
    { x: -400, y: 300, z: -2000, radius: 180, rotSpeed: -0.0008 }, // 軌道リング近く
  ]

  const RING_MODELS = ['small', 'medium', 'large']
  Promise.all(RING_MODELS.map(size =>
    new Promise((resolve) => {
      gltfLoader.load(import.meta.env.BASE_URL + `models/space_ring_station_${size}.glb`, resolve)
    })
  )).then((gltfs: any[]) => {
    for (const ring of RING_STATIONS) {
      // 半径に応じてモデルを選択
      let modelIndex = 0
      if (ring.radius > 220) modelIndex = 2      // large
      else if (ring.radius > 190) modelIndex = 1 // medium
      else modelIndex = 0                         // small

      const gltf = gltfs[modelIndex]
      const inst = gltf.scene.clone()
      inst.position.set(ring.x, ring.y, ring.z)
      inst.scale.setScalar(ring.radius / 200) // 基準半径200m
      inst.rotation.x = Math.random() * Math.PI
      inst.rotation.z = Math.random() * Math.PI
      inst.name = 'SpaceRingStation'
      space.add(inst)
      rotatingSpaceObjects.push(inst)
    }
  })

  // ===== 巨大通信アンテナ（GLB 2バリエーション） =====
  const ANTENNAS = [
    { x: -600, y: 200, z: -400, h: 300 },
    { x: 800, y: -100, z: 700, h: 350 },
    { x: -400, y: 500, z: 800, h: 280 },
  ]

  const ANTENNA_MODELS = ['small', 'large']
  Promise.all(ANTENNA_MODELS.map(size =>
    new Promise((resolve) => {
      gltfLoader.load(import.meta.env.BASE_URL + `models/space_antenna_${size}.glb`, resolve)
    })
  )).then((gltfs: any[]) => {
    for (const ant of ANTENNAS) {
      // 高さに応じてモデルを選択
      let modelIndex = 0
      if (ant.h > 320) modelIndex = 1 // large
      else modelIndex = 0              // small

      const gltf = gltfs[modelIndex]
      const inst = gltf.scene.clone()
      inst.position.set(ant.x, ant.y, ant.z)
      inst.scale.setScalar(ant.h / 350) // 基準高350m
      inst.name = 'SpaceAntenna'
      space.add(inst)
    }
  })

  // ===== 破損船体（大型・GLB 5バリエーション - 船墓場に集中配置） =====
  // 船墓場中心: (2100, -200, -1600)
  // ===== 外周構造物（通信衛星・観測ステーション） =====
  const OUTER_STRUCTURES = [
    { x: -3000, y: 500, z: -2000, type: 'satellite', scale: 30 },
    { x: 2800, y: -400, z: 2500, type: 'observatory', scale: 40 },
    { x: -2500, y: 300, z: 3000, type: 'relay', scale: 35 },
    { x: 3200, y: 200, z: -1500, type: 'satellite', scale: 28 },
    { x: -2800, y: -300, z: -2500, type: 'observatory', scale: 38 },
    { x: 2600, y: 450, z: 2200, type: 'relay', scale: 32 },
    { x: -3100, y: -200, z: 1800, type: 'satellite', scale: 30 },
    { x: 2900, y: 350, z: -2300, type: 'observatory', scale: 42 },
    { x: -2400, y: -450, z: 2800, type: 'relay', scale: 36 },
    { x: 3300, y: 100, z: 1600, type: 'satellite', scale: 29 },
    { x: -2700, y: 400, z: -1900, type: 'observatory', scale: 39 },
    { x: 2500, y: -350, z: 2900, type: 'relay', scale: 33 },
    { x: -3200, y: 250, z: 2200, type: 'satellite', scale: 31 },
    { x: 3000, y: -100, z: -2600, type: 'observatory', scale: 41 },
    { x: -2600, y: 500, z: -2700, type: 'relay', scale: 34 },
  ]

  // 簡易な構造物（Box + Sphere）
  const satelliteMat = new THREE.MeshStandardMaterial({ color: 0x444466, metalness: 0.8, roughness: 0.3 })
  const observatoryMat = new THREE.MeshStandardMaterial({ color: 0x556677, metalness: 0.7, roughness: 0.4 })
  const relayMat = new THREE.MeshStandardMaterial({ color: 0x665544, metalness: 0.6, roughness: 0.5 })

  for (const struct of OUTER_STRUCTURES) {
    const group = new THREE.Group()

    if (struct.type === 'satellite') {
      // 衛星: 球体 + パネル
      const core = new THREE.Mesh(new THREE.SphereGeometry(struct.scale * 0.3, 8, 8), satelliteMat)
      group.add(core)

      // ソーラーパネル×2
      for (let i = 0; i < 2; i++) {
        const panel = new THREE.Mesh(
          new THREE.BoxGeometry(struct.scale * 0.8, struct.scale * 0.1, struct.scale * 1.5),
          satelliteMat
        )
        panel.position.x = (i === 0 ? -1 : 1) * struct.scale * 0.6
        group.add(panel)
      }
    } else if (struct.type === 'observatory') {
      // 観測ステーション: 円柱 + ドーム
      const body = new THREE.Mesh(new THREE.CylinderGeometry(struct.scale * 0.4, struct.scale * 0.4, struct.scale, 8), observatoryMat)
      group.add(body)

      const dome = new THREE.Mesh(new THREE.SphereGeometry(struct.scale * 0.5, 8, 8), observatoryMat)
      dome.position.y = struct.scale * 0.7
      group.add(dome)
    } else {
      // 中継ステーション: Box + アンテナ
      const body = new THREE.Mesh(new THREE.BoxGeometry(struct.scale, struct.scale * 0.6, struct.scale * 0.8), relayMat)
      group.add(body)

      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(struct.scale * 0.05, struct.scale * 0.05, struct.scale * 1.2, 6), relayMat)
      antenna.position.y = struct.scale * 0.9
      group.add(antenna)
    }

    group.position.set(struct.x, struct.y, struct.z)
    group.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI * 2, Math.random() * Math.PI)
    group.name = 'OuterStructure'
    space.add(group)
  }
  console.log('✅ Outer structures created: 15 (5 satellites, 5 observatories, 5 relays)')

  const WRECKS = [
    { x: 2100, y: -200, z: -1600, scale: 100 },  // 船墓場中心
    { x: 2300, y: -150, z: -1700, scale: 90 },
    { x: 1900, y: -250, z: -1500, scale: 95 },
    { x: 2200, y: -180, z: -1400, scale: 85 },
    { x: 2000, y: -220, z: -1800, scale: 80 },
    { x: 2400, y: -170, z: -1650, scale: 75 },
    { x: 1800, y: -230, z: -1550, scale: 70 },
    { x: 2250, y: -190, z: -1750, scale: 85 },
    { x: 2050, y: -210, z: -1450, scale: 80 },
    { x: 2150, y: -200, z: -1700, scale: 90 },
  ]

  // 5種類の破損船体モデルを並列ロード
  const wreckTypes = ['type1', 'type2', 'type3', 'type4', 'type5']
  Promise.all(wreckTypes.map(type =>
    new Promise((resolve) => {
      gltfLoader.load(import.meta.env.BASE_URL + `models/space_wreck_${type}.glb`, resolve)
    })
  )).then((gltfs: any[]) => {
    for (const wreck of WRECKS) {
      // ランダムにバリエーションを選択
      const gltf = gltfs[Math.floor(Math.random() * gltfs.length)]
      const inst = gltf.scene.clone()
      inst.position.set(wreck.x, wreck.y, wreck.z)
      inst.scale.setScalar(wreck.scale / 80) // 基準スケール80
      inst.rotation.set(
        Math.random() * Math.PI / 4,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI / 4
      )
      inst.name = 'SpaceWreck'
      space.add(inst)
    }
  })

  // ===== 要塞内部構造（3層） =====
  const fortressCenter = { x: 600, y: -800, z: -2400 }
  const fortressMat = new THREE.MeshStandardMaterial({ color: 0x333344, metalness: 0.7, roughness: 0.5 })
  const fortressLightMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2.0 })

  // 第1層（外殻、0～-100m）: 司令室、兵器庫、ハンガーベイ
  const l1Rooms = [
    { x: 0, y: -50, z: 0, w: 80, h: 40, d: 80, name: 'command' },
    { x: 100, y: -50, z: 0, w: 60, h: 30, d: 60, name: 'armory' },
    { x: -100, y: -50, z: 0, w: 60, h: 30, d: 60, name: 'armory' },
    { x: 0, y: -50, z: 100, w: 120, h: 50, d: 80, name: 'hangar' },
    { x: 0, y: -50, z: -100, w: 50, h: 30, d: 50, name: 'room' },
  ]

  for (const room of l1Rooms) {
    const roomMesh = new THREE.Mesh(
      new THREE.BoxGeometry(room.w, room.h, room.d),
      fortressMat
    )
    roomMesh.position.set(
      fortressCenter.x + room.x,
      fortressCenter.y + room.y,
      fortressCenter.z + room.z
    )
    space.add(roomMesh)

    // 照明
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(room.w * 0.5, 2, room.d * 0.5),
      fortressLightMat
    )
    light.position.set(
      fortressCenter.x + room.x,
      fortressCenter.y + room.y + room.h / 2 - 2,
      fortressCenter.z + room.z
    )
    space.add(light)
  }

  // 廊下（第1層）
  const l1Corridors = [
    { x: 50, y: -50, z: 0, length: 40, angle: 0 },
    { x: -50, y: -50, z: 0, length: 40, angle: 0 },
    { x: 0, y: -50, z: 50, length: 40, angle: Math.PI / 2 },
    { x: 0, y: -50, z: -50, length: 40, angle: Math.PI / 2 },
  ]

  for (const corridor of l1Corridors) {
    const corridorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(corridor.length, 15, 10),
      fortressMat
    )
    corridorMesh.position.set(
      fortressCenter.x + corridor.x,
      fortressCenter.y + corridor.y,
      fortressCenter.z + corridor.z
    )
    corridorMesh.rotation.y = corridor.angle
    space.add(corridorMesh)
  }

  // 第2層（中層、-100～-200m）
  const l2Rooms = [
    { x: 0, y: -150, z: 0, w: 100, h: 40, d: 100, name: 'reactor' },
    { x: 80, y: -150, z: 0, w: 50, h: 30, d: 50, name: 'life_support' },
    { x: -80, y: -150, z: 0, w: 50, h: 30, d: 50, name: 'quarters' },
    { x: 0, y: -150, z: 80, w: 60, h: 30, d: 60, name: 'quarters' },
    { x: 0, y: -150, z: -80, w: 60, h: 30, d: 60, name: 'storage' },
  ]

  for (const room of l2Rooms) {
    const roomMesh = new THREE.Mesh(
      new THREE.BoxGeometry(room.w, room.h, room.d),
      fortressMat
    )
    roomMesh.position.set(
      fortressCenter.x + room.x,
      fortressCenter.y + room.y,
      fortressCenter.z + room.z
    )
    space.add(roomMesh)

    // 動力炉の発光
    if (room.name === 'reactor') {
      const reactor = new THREE.Mesh(
        new THREE.SphereGeometry(30, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0x0088ff, emissive: 0x0066ff, emissiveIntensity: 3.0 })
      )
      reactor.position.set(
        fortressCenter.x + room.x,
        fortressCenter.y + room.y,
        fortressCenter.z + room.z
      )
      space.add(reactor)
    }
  }

  // 第3層（深部、-200～-300m）: コア制御室
  const l3Core = new THREE.Mesh(
    new THREE.BoxGeometry(80, 30, 80),
    new THREE.MeshStandardMaterial({ color: 0x222244, metalness: 0.9, roughness: 0.3 })
  )
  l3Core.position.set(fortressCenter.x, fortressCenter.y - 250, fortressCenter.z)
  space.add(l3Core)

  // コア中央の制御装置
  const coreDevice = new THREE.Mesh(
    new THREE.CylinderGeometry(15, 15, 20, 12),
    new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00cccc, emissiveIntensity: 4.0 })
  )
  coreDevice.position.set(fortressCenter.x, fortressCenter.y - 250, fortressCenter.z)
  space.add(coreDevice)

  // 層間接続シャフト
  const shafts = [
    { x: 0, y1: -100, y2: -200 },
    { x: 50, y1: -100, y2: -200 },
    { x: -50, y1: -100, y2: -200 },
    { x: 0, y1: -200, y2: -300 },
  ]

  for (const shaft of shafts) {
    const height = Math.abs(shaft.y2 - shaft.y1)
    const shaftMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 8, height, 12),
      fortressMat
    )
    shaftMesh.position.set(
      fortressCenter.x + shaft.x,
      fortressCenter.y + (shaft.y1 + shaft.y2) / 2,
      fortressCenter.z
    )
    space.add(shaftMesh)
  }

  console.log('✅ Fortress interior structure created (3 layers, 15 rooms, 4 shafts)')

  // ===== B. 宇宙ステーション居住区（Habitat Module） =====
  const HABITAT_MODULE = {
    position: { x: -1000, y: 500, z: 1500 },
    size: { length: 400, width: 200, height: 150 },
  }

  const habitatMat = new THREE.MeshStandardMaterial({
    color: 0xcccccc,
    metalness: 0.6,
    roughness: 0.4,
    emissive: 0x2a3a4a,
    emissiveIntensity: 0.3
  })

  // 居住モジュール8個
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    const r = 80
    const x = HABITAT_MODULE.position.x + Math.cos(angle) * r
    const z = HABITAT_MODULE.position.z + Math.sin(angle) * r

    const module = new THREE.Mesh(
      new THREE.CylinderGeometry(25, 25, 60, 16),
      habitatMat
    )
    module.position.set(x, HABITAT_MODULE.position.y, z)
    module.rotation.z = Math.PI / 2
    module.name = 'HabitatModule'
    space.add(module)
  }

  // 回転重力リング（中心を囲む）
  const gravityRingMat = new THREE.MeshStandardMaterial({
    color: 0x888888,
    metalness: 0.8,
    roughness: 0.3
  })

  const gravityRing = new THREE.Mesh(
    new THREE.TorusGeometry(120, 15, 16, 64),
    gravityRingMat
  )
  gravityRing.position.set(HABITAT_MODULE.position.x, HABITAT_MODULE.position.y, HABITAT_MODULE.position.z)
  gravityRing.rotation.x = Math.PI / 2
  gravityRing.name = 'GravityRing'
  space.add(gravityRing)
  rotatingSpaceObjects.push(gravityRing)

  // 農業ドーム2個
  const domeMat = new THREE.MeshStandardMaterial({
    color: 0x88ff88,
    metalness: 0.1,
    roughness: 0.2,
    transparent: true,
    opacity: 0.6
  })

  for (let i = 0; i < 2; i++) {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(40, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      domeMat
    )
    dome.position.set(
      HABITAT_MODULE.position.x + (i === 0 ? -100 : 100),
      HABITAT_MODULE.position.y + 50,
      HABITAT_MODULE.position.z
    )
    dome.name = 'AgriculturalDome'
    space.add(dome)
  }

  // 太陽光パネルアレイ（4枚）
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x1a2a4a,
    metalness: 0.9,
    roughness: 0.1,
    emissive: 0x0a1a3a,
    emissiveIntensity: 0.2
  })

  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4
    const r = 180
    const x = HABITAT_MODULE.position.x + Math.cos(angle) * r
    const z = HABITAT_MODULE.position.z + Math.sin(angle) * r

    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(60, 1, 40),
      panelMat
    )
    panel.position.set(x, HABITAT_MODULE.position.y, z)
    panel.rotation.y = angle
    panel.name = 'SolarPanel'
    space.add(panel)
  }

  console.log('✅ Habitat module created (8 modules, gravity ring, 2 domes, 4 solar panels)')

  // ===== C. 廃棄船墓場の拡張（巨大戦艦5隻追加） =====
  const ADDITIONAL_CAPITAL_SHIPS = [
    { x: 2000, y: -100, z: -1400, length: 800, type: 'battleship' },
    { x: 2400, y: -300, z: -1800, length: 1000, type: 'carrier' },
    { x: 1800, y: 0, z: -1200, length: 700, type: 'cruiser' },
    { x: 2200, y: -200, z: -2000, length: 900, type: 'dreadnought' },
    { x: 2600, y: -400, z: -1600, length: 600, type: 'destroyer' },
  ]

  const capitalShipMat = new THREE.MeshStandardMaterial({
    color: 0x4a4a5a,
    metalness: 0.6,
    roughness: 0.7,
    emissive: 0x1a1a2a,
    emissiveIntensity: 0.1
  })

  for (const ship of ADDITIONAL_CAPITAL_SHIPS) {
    // 艦体（メイン）
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(ship.length, ship.length * 0.15, ship.length * 0.25),
      capitalShipMat
    )
    hull.position.set(ship.x, ship.y, ship.z)
    hull.rotation.set(
      (Math.random() - 0.5) * 0.3,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * 0.3
    )
    hull.name = `CapitalShip_${ship.type}`
    space.add(hull)

    // 艦橋
    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(ship.length * 0.15, ship.length * 0.1, ship.length * 0.12),
      capitalShipMat
    )
    bridge.position.set(ship.x, ship.y + ship.length * 0.12, ship.z)
    bridge.rotation.copy(hull.rotation)
    space.add(bridge)

    // エンジンブロック×2
    for (let i = 0; i < 2; i++) {
      const engine = new THREE.Mesh(
        new THREE.CylinderGeometry(ship.length * 0.08, ship.length * 0.1, ship.length * 0.2, 12),
        new THREE.MeshStandardMaterial({
          color: 0x3a3a4a,
          metalness: 0.8,
          roughness: 0.5,
          emissive: 0xff3300,
          emissiveIntensity: 0.05  // 微弱な発光（死んでいるエンジン）
        })
      )
      const offsetZ = (i === 0 ? -1 : 1) * ship.length * 0.08
      engine.position.set(
        ship.x - ship.length * 0.4,
        ship.y,
        ship.z + offsetZ
      )
      engine.rotation.set(hull.rotation.x, hull.rotation.y, Math.PI / 2)
      space.add(engine)
    }

    // 破損箇所（穴）
    const damageCount = 3 + Math.floor(Math.random() * 3)
    for (let i = 0; i < damageCount; i++) {
      const damage = new THREE.Mesh(
        new THREE.SphereGeometry(ship.length * 0.05, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x000000 })
      )
      damage.position.set(
        ship.x + (Math.random() - 0.5) * ship.length * 0.8,
        ship.y + (Math.random() - 0.5) * ship.length * 0.1,
        ship.z + (Math.random() - 0.5) * ship.length * 0.2
      )
      space.add(damage)
    }

    // 衝突判定（船全体）
    spaceHazards.push({
      pos: new THREE.Vector3(ship.x, ship.y, ship.z),
      radius: ship.length * 0.6
    })
  }

  console.log('✅ Additional capital ships created (5 ships: battleship, carrier, cruiser, dreadnought, destroyer)')

  // ===== 軌道パス（Orbital Path - 推奨飛行ルート可視化） =====
  const ORBITAL_PATH = [
    { x: 0, y: 0, z: 0 },                     // 中央ハブ
    { x: 0, y: 350, z: -2400 },               // 軌道リング
    { x: 2100, y: -200, z: -1600 },           // 船墓場
    { x: -2300, y: -1800, z: -400 },          // 採掘コロニー
    { x: 600, y: -800, z: -2400 },            // 要塞
    { x: 0, y: 0, z: 0 },                     // 中央ハブに戻る
  ]

  // パス上に誘導ビーコン（光る球体）
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.4 })
  const beaconGeo = new THREE.SphereGeometry(15, 8, 8)

  for (let i = 0; i < ORBITAL_PATH.length; i++) {
    const current = ORBITAL_PATH[i]
    const next = ORBITAL_PATH[(i + 1) % ORBITAL_PATH.length]

    // 2点間に10個のビーコン配置
    for (let j = 0; j < 10; j++) {
      const t = j / 10
      const x = current.x + (next.x - current.x) * t
      const y = current.y + (next.y - current.y) * t
      const z = current.z + (next.z - current.z) * t

      const beacon = new THREE.Mesh(beaconGeo, beaconMat)
      beacon.position.set(x, y, z)
      beacon.name = 'OrbitalBeacon'
      space.add(beacon)
    }
  }
  console.log('✅ Orbital path created (50 beacons along 5 routes)')

  // ===== 隠しエリア（Hidden Areas - 10箇所） =====
  const hiddenMat = new THREE.MeshStandardMaterial({
    color: 0xffaa00,
    emissive: 0xff8800,
    emissiveIntensity: 0.8,
    metalness: 0.5,
    roughness: 0.3
  })

  const HIDDEN_AREAS_SPACE = [
    // 既存10個
    { name: 'Mothership艦橋の隠し部屋', x: 0, y: -400, z: -3000, size: 20 },
    { name: '要塞コア制御室', x: 600, y: -1000, z: -2400, size: 18 },
    { name: '小惑星内部の採掘施設', x: -1500, y: 100, z: -1000, size: 25 },
    { name: '廃棄戦艦のブラックボックス', x: 2400, y: -300, z: -1800, size: 15 },
    { name: '宇宙ステーションの秘密ドック', x: -1000, y: 500, z: 1500, size: 22 },
    { name: 'リングステーションの中枢', x: -200, y: 350, z: -2200, size: 17 },
    { name: 'デブリフィールドの隠し船', x: 800, y: -200, z: 600, size: 16 },
    { name: '小惑星の内部神殿', x: -1600, y: 50, z: -1100, size: 28 },
    { name: '凍結した宇宙船', x: 1500, y: 300, z: 1200, size: 19 },
    { name: 'ワームホールの痕跡', x: 0, y: 0, z: 0, size: 30 },

    // 追加20個（手作業設計）
    { name: 'Mothership司令室', x: -10, y: -350, z: -3010, size: 17 },
    { name: 'Mothership艦長室', x: 15, y: -420, z: -2995, size: 14 },
    { name: 'Mothership脱出ポッド格納庫', x: -50, y: -380, z: -3050, size: 18 },
    { name: '要塞第1層司令室', x: 600, y: -850, z: -2400, size: 16 },
    { name: '要塞第2層動力炉', x: 600, y: -950, z: -2400, size: 19 },
    { name: '要塞兵器庫', x: 620, y: -880, z: -2420, size: 15 },
    { name: '採掘コロニー司令室', x: -2300, y: -1750, z: -400, size: 17 },
    { name: '採掘コロニー鉱夫宿舎', x: -2320, y: -1800, z: -420, size: 14 },
    { name: 'Cruiser艦橋', x: -2000, y: -295, z: 1500, size: 16 },
    { name: 'Mining Platform制御室', x: 2500, y: 220, z: -1000, size: 15 },
    { name: 'Comm Tower通信室', x: -1500, y: 600, z: -2000, size: 13 },
    { name: 'Habitat Ring個室群', x: 1800, y: -200, z: 2175, size: 14 },
    { name: 'Fuel Refinery精製室', x: -2200, y: 120, z: 2200, size: 17 },
    { name: 'Observatory観測室', x: 2000, y: 370, z: 1800, size: 16 },
    { name: '外周Station研究室', x: 5000, y: 20, z: 5000, size: 15 },
    { name: '廃棄Station居住区', x: -5500, y: 410, z: 0, size: 16 },
    { name: 'Debris Belt隠し補給船', x: 4500, y: 100, z: -4500, size: 14 },
    { name: '小惑星内部寺院祭壇', x: -1600, y: 55, z: -1095, size: 20 },
    { name: 'Battleship艦橋', x: 2000, y: -95, z: -1400, size: 18 },
    { name: 'Carrier格納庫', x: 2400, y: -295, z: -1800, size: 22 },
  ]

  for (const area of HIDDEN_AREAS_SPACE) {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(area.size, 16, 16),
      hiddenMat
    )
    marker.position.set(area.x, area.y, area.z)
    marker.name = `HiddenArea_${area.name}`
    space.add(marker)
  }

  console.log('✅ Hidden areas created (10 locations in Space MAP)')

  // ===== 中型ランドマーク（Mid-size Landmarks - 6個、300-500m級） =====
  const spaceLandmarkMat = new THREE.MeshStandardMaterial({
    color: 0x5a5a6a,
    metalness: 0.7,
    roughness: 0.5,
    emissive: 0x1a1a2a,
    emissiveIntensity: 0.2
  })

  // 1. 中型戦艦（Cruiser Class, 500m）
  const CRUISER = { x: -2000, y: -300, z: 1500, length: 500 }
  const cruiserHull = new THREE.Mesh(
    new THREE.BoxGeometry(CRUISER.length, CRUISER.length * 0.12, CRUISER.length * 0.2),
    spaceLandmarkMat
  )
  cruiserHull.position.set(CRUISER.x, CRUISER.y, CRUISER.z)
  cruiserHull.rotation.set(0.2, Math.PI / 6, 0.1)
  cruiserHull.name = 'MidCruiser'
  space.add(cruiserHull)

  // 艦橋
  const cruiserBridge = new THREE.Mesh(
    new THREE.BoxGeometry(CRUISER.length * 0.15, CRUISER.length * 0.08, CRUISER.length * 0.1),
    spaceLandmarkMat
  )
  cruiserBridge.position.set(CRUISER.x + 50, CRUISER.y + 40, CRUISER.z)
  cruiserBridge.rotation.copy(cruiserHull.rotation)
  space.add(cruiserBridge)

  // 2. 採掘プラットフォーム（直径400m）
  const MINING_PLATFORM = { x: 2500, y: 200, z: -1000, radius: 200 }
  const platformCore = new THREE.Mesh(
    new THREE.CylinderGeometry(MINING_PLATFORM.radius, MINING_PLATFORM.radius, 80, 16),
    new THREE.MeshStandardMaterial({
      color: 0x6a5a4a,
      metalness: 0.6,
      roughness: 0.6,
      emissive: 0xff8800,
      emissiveIntensity: 0.15
    })
  )
  platformCore.position.set(MINING_PLATFORM.x, MINING_PLATFORM.y, MINING_PLATFORM.z)
  platformCore.name = 'MiningPlatform'
  space.add(platformCore)

  // 採掘アーム×4
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(150, 20, 20),
      spaceLandmarkMat
    )
    arm.position.set(
      MINING_PLATFORM.x + Math.cos(angle) * 150,
      MINING_PLATFORM.y,
      MINING_PLATFORM.z + Math.sin(angle) * 150
    )
    arm.rotation.y = angle
    space.add(arm)
  }

  // 3. 通信アレイ塔（高さ450m）
  const COMM_TOWER = { x: -1500, y: 400, z: -2000, height: 450 }
  const commTower = new THREE.Mesh(
    new THREE.CylinderGeometry(10, 25, COMM_TOWER.height, 8),
    new THREE.MeshStandardMaterial({
      color: 0x888888,
      metalness: 0.8,
      roughness: 0.3,
      emissive: 0x0088ff,
      emissiveIntensity: 0.3
    })
  )
  commTower.position.set(COMM_TOWER.x, COMM_TOWER.y + COMM_TOWER.height / 2, COMM_TOWER.z)
  commTower.name = 'CommTower'
  space.add(commTower)

  // アンテナディッシュ×3
  for (let i = 0; i < 3; i++) {
    const dish = new THREE.Mesh(
      new THREE.CylinderGeometry(40, 40, 5, 16),
      spaceLandmarkMat
    )
    dish.position.set(COMM_TOWER.x, COMM_TOWER.y + 150 + i * 120, COMM_TOWER.z)
    dish.rotation.x = Math.PI / 2
    space.add(dish)
  }

  // 4. 居住リング（中型、直径350m）
  const HABITAT_RING = { x: 1800, y: -200, z: 2000, radius: 175 }
  const habitatRing = new THREE.Mesh(
    new THREE.TorusGeometry(HABITAT_RING.radius, 25, 16, 32),
    new THREE.MeshStandardMaterial({
      color: 0xaaaaaa,
      metalness: 0.7,
      roughness: 0.4,
      emissive: 0x333333,
      emissiveIntensity: 0.2
    })
  )
  habitatRing.position.set(HABITAT_RING.x, HABITAT_RING.y, HABITAT_RING.z)
  habitatRing.rotation.x = Math.PI / 2
  habitatRing.name = 'HabitatRing'
  space.add(habitatRing)
  rotatingSpaceObjects.push(habitatRing)

  // 5. 燃料精製施設（300m×300m×300m）
  const REFINERY = { x: -2200, y: 100, z: 2200, size: 300 }
  const refineryCore = new THREE.Mesh(
    new THREE.BoxGeometry(REFINERY.size, REFINERY.size, REFINERY.size),
    new THREE.MeshStandardMaterial({
      color: 0x5a4a3a,
      metalness: 0.5,
      roughness: 0.7,
      emissive: 0xff4400,
      emissiveIntensity: 0.2
    })
  )
  refineryCore.position.set(REFINERY.x, REFINERY.y, REFINERY.z)
  refineryCore.name = 'FuelRefinery'
  space.add(refineryCore)

  // タンク×4
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(40, 40, 100, 16),
      spaceLandmarkMat
    )
    tank.position.set(
      REFINERY.x + Math.cos(angle) * 200,
      REFINERY.y,
      REFINERY.z + Math.sin(angle) * 200
    )
    space.add(tank)
  }

  // 6. 観測ステーション（球体、直径300m）
  const OBSERVATORY = { x: 2000, y: 350, z: 1800, radius: 150 }
  const observatory = new THREE.Mesh(
    new THREE.SphereGeometry(OBSERVATORY.radius, 24, 24),
    new THREE.MeshStandardMaterial({
      color: 0x3a4a5a,
      metalness: 0.8,
      roughness: 0.3,
      emissive: 0x00ffaa,
      emissiveIntensity: 0.25
    })
  )
  observatory.position.set(OBSERVATORY.x, OBSERVATORY.y, OBSERVATORY.z)
  observatory.name = 'Observatory'
  space.add(observatory)

  console.log('✅ Mid-size landmarks created (6 landmarks: Cruiser, Mining Platform, Comm Tower, Habitat Ring, Fuel Refinery, Observatory)')

  // ===== 細部ディテール（Space Details） =====
  const smallDebrisMat = new THREE.MeshStandardMaterial({ color: 0x7a7a7a, roughness: 0.9, metalness: 0.2 })
  const cableMat = new THREE.MeshBasicMaterial({ color: 0x555555 })
  const debrisPanelMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.7, metalness: 0.5 })
  const containerMat = new THREE.MeshLambertMaterial({ color: 0x4a4a5a })
  const smallSatMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5, metalness: 0.6 })

  // 小型デブリ2000個（1m以下）- 決定的配置
  const smallDebrisCount = isMobileDevice ? 800 : 2000
  for (let i = 0; i < smallDebrisCount; i++) {
    const seed = i + 800000
    const dx = (deterministicRandom(seed) - 0.5) * 11000
    const dy = (deterministicRandom(seed + 1) - 0.5) * 1000
    const dz = (deterministicRandom(seed + 2) - 0.5) * 11000

    const debris = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.3 + deterministicRandom(seed + 3) * 0.7, 0),
      smallDebrisMat
    )
    debris.position.set(dx, dy, dz)
    debris.rotation.set(
      deterministicRandom(seed + 4) * Math.PI,
      deterministicRandom(seed + 5) * Math.PI,
      deterministicRandom(seed + 6) * Math.PI
    )
    space.add(debris)
  }

  // 浮遊ケーブル300本 - 決定的配置
  const cableCount = isMobileDevice ? 120 : 300
  for (let i = 0; i < cableCount; i++) {
    const seed = i + 900000
    const startX = (deterministicRandom(seed) - 0.5) * 10000
    const startY = (deterministicRandom(seed + 1) - 0.5) * 800
    const startZ = (deterministicRandom(seed + 2) - 0.5) * 10000

    const points: THREE.Vector3[] = []
    let x = startX, y = startY, z = startZ
    for (let j = 0; j < 10; j++) {
      points.push(new THREE.Vector3(x, y, z))
      x += (deterministicRandom(seed + j * 3 + 3) - 0.5) * 20
      y += (deterministicRandom(seed + j * 3 + 4) - 0.5) * 20
      z += (deterministicRandom(seed + j * 3 + 5) - 0.5) * 20
    }
    const cableGeo = new THREE.BufferGeometry().setFromPoints(points)
    const cable = new THREE.Line(cableGeo, cableMat)
    space.add(cable)
  }

  // パネル破片400個 - 決定的配置
  const panelCount = isMobileDevice ? 160 : 400
  for (let i = 0; i < panelCount; i++) {
    const seed = i + 1000000
    const px = (deterministicRandom(seed) - 0.5) * 10000
    const py = (deterministicRandom(seed + 1) - 0.5) * 800
    const pz = (deterministicRandom(seed + 2) - 0.5) * 10000

    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(
        3 + deterministicRandom(seed + 3) * 4,
        0.1,
        2 + deterministicRandom(seed + 4) * 3
      ),
      debrisPanelMat
    )
    panel.position.set(px, py, pz)
    panel.rotation.set(
      deterministicRandom(seed + 5) * Math.PI,
      deterministicRandom(seed + 6) * Math.PI,
      deterministicRandom(seed + 7) * Math.PI
    )
    space.add(panel)
  }

  // 貨物コンテナ200個 - 決定的配置
  const containerCount = isMobileDevice ? 80 : 200
  for (let i = 0; i < containerCount; i++) {
    const seed = i + 1100000
    const cx = (deterministicRandom(seed) - 0.5) * 10000
    const cy = (deterministicRandom(seed + 1) - 0.5) * 800
    const cz = (deterministicRandom(seed + 2) - 0.5) * 10000

    const container = new THREE.Mesh(
      new THREE.BoxGeometry(8, 3, 3),
      containerMat
    )
    container.position.set(cx, cy, cz)
    container.rotation.set(
      deterministicRandom(seed + 3) * Math.PI,
      deterministicRandom(seed + 4) * Math.PI,
      deterministicRandom(seed + 5) * Math.PI
    )
    space.add(container)
  }

  // 小型衛星50個 - 決定的配置
  const smallSatCount = isMobileDevice ? 20 : 50
  for (let i = 0; i < smallSatCount; i++) {
    const seed = i + 1200000
    const sx = (deterministicRandom(seed) - 0.5) * 11000
    const sy = (deterministicRandom(seed + 1) - 0.5) * 900
    const sz = (deterministicRandom(seed + 2) - 0.5) * 11000

    // 本体
    const satBody = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      smallSatMat
    )
    satBody.position.set(sx, sy, sz)
    satBody.rotation.set(
      deterministicRandom(seed + 3) * Math.PI,
      deterministicRandom(seed + 4) * Math.PI,
      deterministicRandom(seed + 5) * Math.PI
    )
    space.add(satBody)

    // ソーラーパネル×2
    for (let j = 0; j < 2; j++) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(4, 0.1, 2),
        new THREE.MeshStandardMaterial({ color: 0x1a2a4a, metalness: 0.9, roughness: 0.1 })
      )
      panel.position.set(sx + (j === 0 ? -3 : 3), sy, sz)
      panel.rotation.copy(satBody.rotation)
      space.add(panel)
    }
  }

  // 浮遊工具100個 - 決定的配置
  const toolCount = isMobileDevice ? 40 : 100
  for (let i = 0; i < toolCount; i++) {
    const seed = i + 1300000
    const tx = (deterministicRandom(seed) - 0.5) * 10000
    const ty = (deterministicRandom(seed + 1) - 0.5) * 800
    const tz = (deterministicRandom(seed + 2) - 0.5) * 10000

    const tool = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 1.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.4 })
    )
    tool.position.set(tx, ty, tz)
    tool.rotation.set(
      deterministicRandom(seed + 3) * Math.PI,
      deterministicRandom(seed + 4) * Math.PI,
      deterministicRandom(seed + 5) * Math.PI
    )
    space.add(tool)
  }

  console.log('✅ Space details added (2000 small debris, 300 cables, 400 panels, 200 containers, 50 satellites, 100 tools)')

  // ===== 外周エリアの詳細化（Outer Area Details, 3000-6000m圏） =====
  const outerStationMat = new THREE.MeshStandardMaterial({
    color: 0x5a5a6a,
    metalness: 0.6,
    roughness: 0.5,
    emissive: 0x2a2a3a,
    emissiveIntensity: 0.2
  })

  // 外周宇宙ステーション群×4
  const OUTER_STATIONS = [
    { x: 5000, y: 0, z: 5000, type: 'research', size: 200 },
    { x: -5000, y: 200, z: 5000, type: 'refinery', size: 300 },
    { x: 5000, y: -200, z: -5000, type: 'military', size: 250 },
    { x: -5000, y: 100, z: -5000, type: 'trading', size: 180 },
  ]

  for (const station of OUTER_STATIONS) {
    // 中央モジュール
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(station.size, station.size * 0.6, station.size * 0.8),
      outerStationMat
    )
    core.position.set(station.x, station.y, station.z)
    core.rotation.set(Math.random() * 0.3, Math.random() * Math.PI * 2, Math.random() * 0.3)
    core.name = `OuterStation_${station.type}`
    space.add(core)

    // 接続モジュール×4
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2
      const module = new THREE.Mesh(
        new THREE.CylinderGeometry(station.size * 0.15, station.size * 0.15, station.size * 0.4, 12),
        outerStationMat
      )
      module.position.set(
        station.x + Math.cos(angle) * station.size * 0.7,
        station.y,
        station.z + Math.sin(angle) * station.size * 0.7
      )
      module.rotation.z = Math.PI / 2
      module.rotation.y = angle
      space.add(module)
    }
  }

  // デブリベルト（半径4000-6000m、高密度）
  const DEBRIS_BELT = {
    innerRadius: 4000,
    outerRadius: 6000,
    count: isMobileDevice ? 800 : 2000,
  }

  const debrisBeltMat = new THREE.MeshStandardMaterial({
    color: 0x6a6a6a,
    roughness: 0.95,
    metalness: 0.3,
    flatShading: true
  })

  for (let i = 0; i < DEBRIS_BELT.count; i++) {
    const angle = Math.random() * Math.PI * 2
    const r = DEBRIS_BELT.innerRadius + Math.random() * (DEBRIS_BELT.outerRadius - DEBRIS_BELT.innerRadius)
    const dx = Math.cos(angle) * r
    const dz = Math.sin(angle) * r
    const dy = (Math.random() - 0.5) * 1000

    const debris = new THREE.Mesh(
      new THREE.DodecahedronGeometry(2 + Math.random() * 8, 0),
      debrisBeltMat
    )
    debris.position.set(dx, dy, dz)
    debris.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
    space.add(debris)
  }

  // 廃棄ステーション群×4
  const ABANDONED_STATIONS = [
    { x: 5500, y: -300, z: 0, size: 150 },
    { x: -5500, y: 400, z: 0, size: 200 },
    { x: 0, y: -500, z: 5500, size: 180 },
    { x: 0, y: 300, z: -5500, size: 160 },
  ]

  const abandonedMat = new THREE.MeshStandardMaterial({
    color: 0x444444,
    metalness: 0.5,
    roughness: 0.8,
    emissive: 0x110000,
    emissiveIntensity: 0.1
  })

  for (const abandoned of ABANDONED_STATIONS) {
    const station = new THREE.Mesh(
      new THREE.BoxGeometry(abandoned.size, abandoned.size * 0.5, abandoned.size * 0.7),
      abandonedMat
    )
    station.position.set(abandoned.x, abandoned.y, abandoned.z)
    station.rotation.set(Math.random() * 0.5, Math.random() * Math.PI * 2, Math.random() * 0.5)
    station.name = 'AbandonedStation'
    space.add(station)

    // 破損パネル×4
    for (let i = 0; i < 4; i++) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(abandoned.size * 0.4, abandoned.size * 0.05, abandoned.size * 0.3),
        abandonedMat
      )
      panel.position.set(
        abandoned.x + (Math.random() - 0.5) * abandoned.size * 1.5,
        abandoned.y + (Math.random() - 0.5) * abandoned.size * 0.8,
        abandoned.z + (Math.random() - 0.5) * abandoned.size * 1.5
      )
      panel.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
      space.add(panel)
    }
  }

  console.log('✅ Outer area details added (4 outer stations, 2000 debris belt objects, 4 abandoned stations)')
}

// Tokyo MAP用のランドマーク配置関数
// 新宿駅を原点(0,0)として実際の東京を再現
// スケール: 1unit = 10m
// buildTokyoLandmarks関数は削除 - TokyoMapSystemが完全に独立して管理

async function switchMap(map: GameMap) {
  if (import.meta.env.DEV) console.log(`🗺️ MAP切り替え開始: ${map}`)

  // 宇宙MAPオブジェクトを事前にクリア
  clearSpaceMap()

  if (map === 'space') {
    // ===== 宇宙MAP (SPACE SECTOR) =====
    if (import.meta.env.DEV) console.log('🪐 SPACE SECTORに切り替え')

    scene.background = new THREE.Color(0x020513)
    scene.fog = null
    sky.visible = false
    renderer.toneMappingExposure = 0.95

    // NEO東京MAPシステムをクリーンアップ
    if (neoTokyoMapSystem) {
      neoTokyoMapSystem.cleanup()
      neoTokyoMapSystem = null
    }

    // オリジナルMAPの地形を削除
    if (terrainGLB) {
      scene.remove(terrainGLB)
      terrainGLB.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose()
          const material = child.material
          if (Array.isArray(material)) material.forEach(mat => mat.dispose())
          else material?.dispose()
        }
      })
      terrainGLB = null
    }

    // オリジナルMAPの構造物を削除
    if (originalMapGroup && originalMapGroup.parent) {
      scene.remove(originalMapGroup)
      originalMapGroup.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose()
          const material = child.material
          if (Array.isArray(material)) material.forEach(mat => mat.dispose())
          else material?.dispose()
        }
      })
      originalMapGroup.clear()
    }

    // オリジナルMAPの地面を削除
    if (ground) {
      if (ground.parent) {
        scene.remove(ground)
      }
      ground.geometry?.dispose()
      const material = ground.material
      if (Array.isArray(material)) material.forEach(mat => mat.dispose())
      else material?.dispose()
      ground = null as any
    }

    // オリジナルMAPの水面・岩・木を削除
    const originalMapMeshes = [waterMesh, boulderIM, trunkIM, foliIM, foli2IM]
    for (const mesh of originalMapMeshes) {
      if (mesh && mesh.parent) {
        scene.remove(mesh)
      }
    }

    // 名前で検索して削除（OriginalGround, OriginalRockPillar等）
    const originalNames = ['OriginalGround', 'OriginalRockPillar', 'OriginalRockTower', 'OriginalRockArch']
    for (const name of originalNames) {
      const obj = scene.getObjectByName(name)
      if (obj) {
        scene.remove(obj)
        obj.traverse(child => {
          if (child instanceof THREE.Mesh) {
            child.geometry?.dispose()
            const mat = child.material
            if (Array.isArray(mat)) mat.forEach(m => m.dispose())
            else mat?.dispose()
          }
        })
      }
    }

    // 既存のオブジェクトを削除（プレイヤー・カメラ・ライト・敵機・補給ポイントは保護）
    const to_remove: THREE.Object3D[] = []
    const children_copy = [...scene.children]

    for (const obj of children_copy) {
      // プレイヤー・カメラは保護
      if (obj === player || obj === camera) continue

      // ライトは保護
      if (obj.type.includes('Light')) continue

      // 敵機は保護
      if (enemies.some(e => e.group === obj)) continue

      // 味方機は保護
      if (allies.some(a => a.group === obj)) continue

      // 地上目標は保護
      if (groundTargets.some(gt => gt.group === obj)) continue

      // 補給ポイントは保護
      if (supplyMeshes.some(sm => sm === obj || obj.parent === sm)) continue

      // 宇宙MAPグループは保護（既にクリア済み）
      if (obj.name === 'SpaceSectorMap') continue

      // 地形らしきMeshは強制削除（名前やジオメトリで判定）
      if (obj instanceof THREE.Mesh) {
        const name = obj.name.toLowerCase()
        if (name.includes('ground') || name.includes('terrain') || name.includes('originalground')) {
          to_remove.push(obj)
          continue
        }
        // PlaneGeometryで大きなサイズのものは地形の可能性が高い
        if (obj.geometry instanceof THREE.PlaneGeometry) {
          // @ts-ignore
          const params = obj.geometry.parameters
          if (params && (params.width > 1000 || params.height > 1000)) {
            to_remove.push(obj)
            continue
          }
        }
      }

      // それ以外はすべて削除
      to_remove.push(obj)
    }

    // すべて削除してメモリ解放
    for (const obj of to_remove) {
      scene.remove(obj)
      obj.traverse(child => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
          child.geometry?.dispose()
          const material = child.material
          if (Array.isArray(material)) material.forEach(mat => mat.dispose())
          else material?.dispose()
        }
      })
    }

    // 宇宙MAPを構築（非同期）
    await buildSpaceMap()

    // MAP境界格子を生成
    createMapBoundary('space')

    // Space MAPはゾーンビーコンがあるので追加ナビゲーションビーコン不要

    // プレイヤーを宇宙MAP開始位置に配置
    // 中央ハブ近くでスポーン、要塞・リング方向を向く（南西）
    player.position.set(200, 160, 600)
    const lookAngle = Math.atan2(-350 - 600, 0 - 200)  // fortress方向
    player.rotation.y = lookAngle
    player.quaternion.setFromEuler(new THREE.Euler(0, lookAngle, 0, 'YXZ'))
    camQuat.copy(player.quaternion)
    speed = 220

    // 補給ポイントを宇宙MAP用に再配置
    for (let i = 0; i < Math.min(supplyMeshes.length, SPACE_SUPPLY_POSITIONS.length); i++) {
      SUPPLY_POSITIONS[i].copy(SPACE_SUPPLY_POSITIONS[i])
      supplyMeshes[i].position.copy(SPACE_SUPPLY_POSITIONS[i])
    }

    if (import.meta.env.DEV) console.log('✅ SPACE SECTOR切り替え完了')
    return
  }

  if (map === 'tokyo') {
    // ===== NEO東京MAP =====
    if (import.meta.env.DEV) console.log('🌃 NEO東京MAPに切り替え（サイバーパンク）')
    scene.background = neoTokyoBackgroundTexture
    scene.fog = new THREE.FogExp2(0x214a68, 0.000055)
    sky.visible = false
    renderer.toneMappingExposure = 0.7

    // 宇宙MAPを削除
    clearSpaceMap()

    // ステップ1: オリジナルMAPのすべてのオブジェクトを削除
    const to_remove: THREE.Object3D[] = []

    // scene.childrenをコピーしてから削除（イテレーション中の変更を回避）
    const children_copy = [...scene.children]

    for (const obj of children_copy) {
      // プレイヤー・カメラは保護
      if (obj === player || obj === camera) continue

      // ライトは保護
      if (obj.type.includes('Light')) continue

      // 敵機は保護
      let isEnemy = false
      for (const e of enemies) {
        if (e.group === obj) {
          isEnemy = true
          break
        }
      }
      if (isEnemy) continue

      // 補給ポイントは保護
      let isSupply = false
      for (const sm of supplyMeshes) {
        if (sm === obj || obj.parent === sm) {
          isSupply = true
          break
        }
      }
      if (isSupply) continue

      // 東京/NEO東京MAPオブジェクトは保護
      if (obj.name?.includes('Tokyo') || obj.name?.includes('Neo') || obj.name?.includes('Mega') || obj.name?.includes('Skyway') || obj.name?.includes('Hologram')) continue

      // それ以外はすべて削除（オリジナルMAP）
      to_remove.push(obj)
    }

    // すべて削除してメモリ解放
    for (const obj of to_remove) {
      scene.remove(obj)

      // 再帰的にメモリ解放
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.geometry) {
            child.geometry.dispose()
          }
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => mat.dispose())
            } else {
              child.material.dispose()
            }
          }
        }
      })
    }

    // ステップ2: NEO東京MAPを初期化
    if (!neoTokyoMapSystem) {
      neoTokyoMapSystem = new NeoTokyoMapSystem(scene, isMobileDevice, gltfLoader)
    }
    await neoTokyoMapSystem.initialize()

    // ランドマーク: Mega Tower（メガタワー - 高さ800m）
    gltfLoader.load(import.meta.env.BASE_URL + 'models/landmark_mega_tower.glb', (gltf) => {
      const megaTower = gltf.scene
      megaTower.traverse((c: any) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
      megaTower.position.set(0, 0, 0) // Tokyo MAP中央
      megaTower.name = 'MegaTower'
      scene.add(megaTower)
      console.log('✅ Mega Tower loaded (800m landmark)')
    })

    // ストーリー要素: 放棄車両
    const ABANDONED_VEHICLE_POSITIONS = [
      { x: -1200, z: 300, scale: 1.0, rotation: 0, type: 'car' },
      { x: 800, z: -700, scale: 1.2, rotation: Math.PI / 4, type: 'car' },
      { x: -600, z: -400, scale: 1.0, rotation: -Math.PI / 3, type: 'truck' },
      { x: 1500, z: 500, scale: 0.9, rotation: Math.PI / 2, type: 'car' },
      { x: -1000, z: 900, scale: 1.1, rotation: Math.PI, type: 'truck' },
      { x: 500, z: 350, scale: 2.0, rotation: Math.PI / 6, type: 'helicopter' }, // 墜落ヘリ
    ]

    gltfLoader.load(import.meta.env.BASE_URL + 'models/story_abandoned_vehicles.glb', (gltf) => {
      for (const pos of ABANDONED_VEHICLE_POSITIONS) {
        const vehicle = gltf.scene.clone()
        vehicle.traverse((c: any) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
        vehicle.position.set(pos.x, 0, pos.z)
        vehicle.scale.setScalar(pos.scale)
        vehicle.rotation.y = pos.rotation
        vehicle.name = 'AbandonedVehicle'
        scene.add(vehicle)
      }
      console.log('✅ Abandoned Vehicles loaded (6 locations)')
    })

    // Step 3: place the player in a clear northern approach corridor
    const tokyoSpawn = neoTokyoMapSystem.getSafeSpawnPosition()
    player.position.set(tokyoSpawn.x, tokyoSpawn.y, tokyoSpawn.z)
    player.rotation.set(0, Math.PI, 0)
    if (import.meta.env.DEV) console.log('✈️ プレイヤーをNEO東京・北側進入空域に配置')

    // ステップ4: 補給ポイントを新地形に合わせて再配置（台地上）
    const tokyoSupplyPositions = TOKYO_SUPPLY_POSITIONS.map(p => p.clone())
    for (let i = 0; i < Math.min(supplyMeshes.length, tokyoSupplyPositions.length); i++) {
      SUPPLY_POSITIONS[i].copy(tokyoSupplyPositions[i])
      supplyMeshes[i].position.copy(tokyoSupplyPositions[i])
    }
    if (import.meta.env.DEV) console.log('✅ 補給ポイントを東京MAP用に再配置')

    // MAP境界格子を生成
    createMapBoundary('tokyo')

    // ナビゲーションビーコンを生成
    createNavigationBeacons('tokyo')

    if (import.meta.env.DEV) console.log('✅ 東京MAP切り替え完了')

  } else {
    // ===== オリジナルMAP =====
    if (import.meta.env.DEV) console.log('🏔️ オリジナルMAPに切り替え')
    scene.background = new THREE.Color(0x7da8c8)
    scene.fog = new THREE.FogExp2(0x8db5cc, 0.000075)
    sky.visible = !isMobileDevice
    renderer.toneMappingExposure = 0.78

    // NEO東京MAPを完全削除
    if (neoTokyoMapSystem) {
      neoTokyoMapSystem.cleanup()
      neoTokyoMapSystem = null
    }

    // 宇宙MAPを削除
    clearSpaceMap()

    // 東京オブジェクトをクリア（念のため）
    tokyoObjects.forEach(obj => {
      scene.remove(obj)
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose()
        if (Array.isArray(obj.material)) {
          obj.material.forEach(mat => mat.dispose())
        } else {
          obj.material?.dispose()
        }
      }
    })
    tokyoObjects.length = 0

    // オリジナル地形を再生成
    ground = generateTerrainMesh()
    scene.add(ground)
    if (import.meta.env.DEV) console.log('🗻 オリジナル地形再生成')

    // terrain.glb（高品質）があれば差し替え
    if (terrainGLB) {
      scene.remove(ground)
      scene.add(terrainGLB)
      if (import.meta.env.DEV) console.log('🗻 terrain.glb 復元')
    }

    // 水面を追加（元々あったものは削除されている）
    scene.add(waterMesh)
    waterMesh.visible = true
    if (import.meta.env.DEV) console.log('💧 水面再追加')

    // 岩塔・巨岩・木々を復元（名前で検索して再追加）
    const namesToRestore = ['OriginalRockPillar', 'OriginalRockTower', 'OriginalRockArch',
                            'OriginalBoulders', 'OriginalTrees']
    for (const key of namesToRestore) {
      if (!scene.getObjectByName(key) && !scene.getObjectByName(key + '_0_0')) {
        // InstancedMesh（boulderIM, trunkIM等）を再追加
        if (key === 'OriginalBoulders') scene.add(boulderIM)
        if (key === 'OriginalTrees') { scene.add(trunkIM); scene.add(foliIM); scene.add(foli2IM) }
      }
    }
    // 岩塔・アーチはGLBロード済みインスタンスを持つグループとして保存されていないため、
    // 名前付きオブジェクトが存在しなければ再配置をスキップ（ページリロードが確実）

    // オリジナルMAPの構造物を再構築
    buildWorldStructures()
    if (import.meta.env.DEV) console.log('🏗️ オリジナル構造物再構築')

    // プレイヤー位置をオリジナルMAP用に設定（峡谷を避ける）
    const spawnX = 500
    const spawnZ = 500
    player.position.set(spawnX, terrainH(spawnX, spawnZ) + 150, spawnZ)
    if (import.meta.env.DEV) console.log('✈️ プレイヤーをオリジナルMAP上空に配置')

    // 補給ポイントをオリジナルMAP用の位置に再配置
    const originalSupplyPositions = ORIGINAL_SUPPLY_POSITIONS.map(p => p.clone())
    for (let i = 0; i < Math.min(supplyMeshes.length, originalSupplyPositions.length); i++) {
      originalSupplyPositions[i].y = terrainH(originalSupplyPositions[i].x, originalSupplyPositions[i].z) + 18
      SUPPLY_POSITIONS[i].copy(originalSupplyPositions[i])
      supplyMeshes[i].position.copy(originalSupplyPositions[i])
    }
    if (import.meta.env.DEV) console.log('✅ 補給ポイントをオリジナルMAP用に再配置')

    // MAP境界格子を生成
    createMapBoundary('original')

    // ナビゲーションビーコンを生成
    createNavigationBeacons('original')

    if (import.meta.env.DEV) console.log('✅ オリジナルMAP切り替え完了')
  }

  // Logsシステム初期化（全MAP共通）
  logsData = loadLogsData()
  if (logsGroup) {
    scene.remove(logsGroup)
  }
  logsGroup = createLogVisuals(scene, logsData.filter(log => log.mapName === map))
  if (import.meta.env.DEV) {
    const stats = getLogsStats(logsData)
    console.log(`📜 Logsシステム初期化: ${stats.byMap[map]?.total || 0}個のログを配置`)
  }

  // 環境ストーリーシステム初期化
  if (storyGroup) {
    scene.remove(storyGroup)
  }
  const storyScenes = getStoryScenesByMap(map)
  storyGroup = createStorySceneVisuals(scene, storyScenes)
  if (import.meta.env.DEV) {
    const totalObjects = storyScenes.reduce((sum, scene) => sum + scene.objects.length, 0)
    console.log(`📖 環境ストーリー初期化: ${storyScenes.length}シーン、${totalObjects}オブジェクト配置`)
  }

  // 詳細エリアシステム初期化
  if (routeMarkersGroup) {
    scene.remove(routeMarkersGroup)
  }
  const detailedAreas = getDetailedAreasByMap(map)
  routeMarkersGroup = createRouteMarkers(scene, detailedAreas)
  if (import.meta.env.DEV) {
    const totalRoutes = detailedAreas.reduce((sum, area) => sum + area.routes.length, 0)
    console.log(`🗺️ 詳細エリア初期化: ${detailedAreas.length}エリア、${totalRoutes}ルート配置`)
  }

  // ゲームプレイ効果システム初期化（将来の実装用）
  if (import.meta.env.DEV) {
    console.log(`⚙️ ゲームプレイ効果システム: 準備完了（将来の実装用）`)
  }
}

// MAP選択ハンドラー関数
function getActiveMapFromMenu(): GameMap {
  if (document.getElementById('map-btn-space')?.classList.contains('active')) return 'space'
  if (document.getElementById('map-btn-tokyo')?.classList.contains('active')) return 'tokyo'
  return 'original'
}

async function switchMapAndTrack(mapType: GameMap) {
  currentMap = mapType
  if (import.meta.env.DEV) console.log(`🗺️ switchMap()呼び出し: ${currentMap}`)
  const pendingSwitch = switchMap(currentMap)
  mapSwitchPromise = pendingSwitch
  try {
    await pendingSwitch
    if (import.meta.env.DEV) console.log(`✅ switchMap()完了`)
  } finally {
    if (mapSwitchPromise === pendingSwitch) mapSwitchPromise = null
  }
}

// MAP選択イベント（直接ID指定で確実に登録）
if (import.meta.env.DEV) console.log('🔧 MAP選択イベントを設定中...')

async function handleMapSwitch(mapType: GameMap) {
  if (import.meta.env.DEV) console.log(`🖱️ MAP切り替え開始: ${mapType}`)

  // アクティブ状態の切り替え（MAPボタンのみ）
  document.getElementById('map-btn-original')?.classList.remove('active')
  document.getElementById('map-btn-tokyo')?.classList.remove('active')
  document.getElementById('map-btn-space')?.classList.remove('active')
  if (mapType === 'tokyo') {
    document.getElementById('map-btn-tokyo')?.classList.add('active')
  } else if (mapType === 'space') {
    document.getElementById('map-btn-space')?.classList.add('active')
  } else {
    document.getElementById('map-btn-original')?.classList.add('active')
  }

  // MAP切り替え
  currentMap = mapType
  if (import.meta.env.DEV) console.log(`🗺️ switchMap()呼び出し: ${currentMap}`)
  await switchMap(currentMap)
  if (import.meta.env.DEV) console.log(`✅ switchMap()完了`)

  // コレクティブルシステムを初期化
  collectibleSystem.initialize(currentMap)
  if (import.meta.env.DEV) console.log(`🎯 コレクティブル初期化完了: ${currentMap}`)
}

// 東京MAPボタン
const tokyoBtn = document.getElementById('map-btn-tokyo')
if (tokyoBtn) {
  if (import.meta.env.DEV) console.log('🔧 東京MAPボタン登録成功')
  tokyoBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (import.meta.env.DEV) console.log('✅ 東京MAPボタンクリック検出！')
    handleMapSwitch('tokyo')
  })
} else {
  console.error('❌ 東京MAPボタンが見つかりません')
}

// オリジナルMAPボタン
const originalBtn = document.getElementById('map-btn-original')
if (originalBtn) {
  if (import.meta.env.DEV) console.log('🔧 オリジナルMAPボタン登録成功')
  originalBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (import.meta.env.DEV) console.log('✅ オリジナルMAPボタンクリック検出！')
    handleMapSwitch('original')
  })
} else {
  console.error('❌ オリジナルMAPボタンが見つかりません')
}

// 宇宙MAPボタン
const spaceBtn = document.getElementById('map-btn-space')
if (spaceBtn) {
  if (import.meta.env.DEV) console.log('🔧 宇宙MAPボタン登録成功')
  spaceBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (import.meta.env.DEV) console.log('✅ 宇宙MAPボタンクリック検出！')
    handleMapSwitch('space')
  })
} else {
  console.error('❌ 宇宙MAPボタンが見つかりません')
}

// 音声設定ボタン
const audioOffBtn = document.getElementById('audio-btn-off')
const audioOnBtn = document.getElementById('audio-btn-on')

if (audioOffBtn && audioOnBtn) {
  audioOffBtn.addEventListener('click', () => {
    audioEnabled = false
    audioOffBtn.classList.add('active')
    audioOnBtn.classList.remove('active')
    if (import.meta.env.DEV) console.log('🔇 音声OFF')
  })

  audioOnBtn.addEventListener('click', () => {
    audioEnabled = true
    audioOnBtn.classList.add('active')
    audioOffBtn.classList.remove('active')
    initAudio()  // ゲーム中にONにした場合も即初期化（iOS Safari対応）
    if (audioCtx?.state === 'suspended') audioCtx.resume()
  })
}

// 操作モード設定ボタン
const flightArcadeBtn = document.getElementById('flight-btn-arcade')
const flightRealisticBtn = document.getElementById('flight-btn-realistic')

if (flightArcadeBtn && flightRealisticBtn) {
  flightArcadeBtn.addEventListener('click', () => {
    flightMode = 'arcade'
    flightArcadeBtn.classList.add('active')
    flightRealisticBtn.classList.remove('active')
    if (import.meta.env.DEV) console.log('🎮 操作モード: アーケード（水平旋回）')
  })

  flightRealisticBtn.addEventListener('click', () => {
    flightMode = 'realistic'
    flightRealisticBtn.classList.add('active')
    flightArcadeBtn.classList.remove('active')
    if (import.meta.env.DEV) console.log('✈️ 操作モード: リアル（バンキング）')
  })
}

// モードボタンとbackボタンのイベント
document.querySelectorAll<HTMLElement>('.ms-start').forEach(btn => {
  btn.addEventListener('click', () => { void startGame(btn.dataset.mode as GameMode) })
})
document.getElementById('mc-back')!.addEventListener('click', () => {
  // ミッション完了画面からモード選択に戻る
  document.getElementById('mission-complete')!.style.display = 'none'
  document.getElementById('mode-screen')!.style.display = 'flex'
})

// ポーズ機能
function togglePause() {
  if (!currentMode || missionComplete) return
  isPaused = !isPaused
  const pauseScreen = document.getElementById('pause-screen')!
  pauseScreen.style.display = isPaused ? 'flex' : 'none'
}

document.getElementById('pause-resume')!.addEventListener('click', togglePause)
document.getElementById('menu-btn')!.addEventListener('click', togglePause)

// ===== MULTIPLAYER BUTTON =====
const mpStatusEl = document.getElementById('mp-status')
const mpStartBtn = document.getElementById('btn-multi-start') as HTMLButtonElement | null
if (mpStartBtn) {
  if (!MP_READY) {
    mpStartBtn.disabled = true
    if (mpStatusEl) mpStatusEl.textContent = 'サーバー未設定'
  } else {
    mpStartBtn.addEventListener('click', async () => {
      if (!MP_READY) return
      mpStartBtn.disabled = true
      if (mpStatusEl) mpStatusEl.textContent = 'マッチング中...'
      try {
        const client = new MultiplayerClient(
          scene,
          () => createAircraft(0xcc2222, 0x661111),
          (evt) => {
            if (evt.kind === 'explosion') {
              const d = evt.data as { pos: [number, number, number]; scale: number }
              createExplosion(new THREE.Vector3(...d.pos), d.scale)
              playExplosionSound(d.scale)
            }
          },
        )
        await client.connect(SUPABASE_URL, SUPABASE_ANON_KEY, `dogfight:${currentMap}`)
        mpClient = client
        if (mpStatusEl) mpStatusEl.textContent = '接続完了'
        startGame('dogfight')
      } catch (e) {
        console.error('[MP] Connect failed', e)
        if (mpStatusEl) mpStatusEl.textContent = '接続失敗'
        mpStartBtn.disabled = false
      }
    })
  }
}

// メニューに戻るボタン
document.getElementById('back-to-menu')!.addEventListener('click', () => {
  isPaused = false
  document.getElementById('pause-screen')!.style.display = 'none'
  stopGame()
  document.getElementById('mode-screen')!.style.display = 'flex'
})

// キーボードイベント（P / Escでポーズ）
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (currentMode && !missionComplete) {
      togglePause()
      e.preventDefault()
    }
  }
})

// ドッグファイト人数調整ボタン
function clamp(v: number, mn: number, mx: number) { return Math.max(mn, Math.min(mx, v)) }
document.getElementById('ally-minus')!.addEventListener('click', () => {
  dfAllyCount = clamp(dfAllyCount - 1, 0, 8)
  document.getElementById('ally-count')!.textContent = dfAllyCount.toString()
})
document.getElementById('ally-plus')!.addEventListener('click', () => {
  dfAllyCount = clamp(dfAllyCount + 1, 0, 8)
  document.getElementById('ally-count')!.textContent = dfAllyCount.toString()
})
document.getElementById('enemy-minus')!.addEventListener('click', () => {
  dfEnemyCount = clamp(dfEnemyCount - 1, 1, 10)
  document.getElementById('enemy-count')!.textContent = dfEnemyCount.toString()
})
document.getElementById('enemy-plus')!.addEventListener('click', () => {
  dfEnemyCount = clamp(dfEnemyCount + 1, 1, 10)
  document.getElementById('enemy-count')!.textContent = dfEnemyCount.toString()
})

// ===== HOMING =====
function updateHoming(m: HomingMissile, dt: number) {
  if (!m.diverted) {
    let best = 120, bestFlare: Projectile | null = null
    for (const f of flares) { const d = f.mesh.position.distanceTo(m.mesh.position); if (d < best) { best = d; bestFlare = f } }
    if (bestFlare) { m.target = bestFlare.mesh; m.diverted = true }
  }
  if (m.target) {
    const currentDir = m.vel.clone().normalize()
    const toTarget = m.target.position.clone().sub(m.mesh.position)
    const targetDir = toTarget.normalize()
    const angle = currentDir.angleTo(targetDir)

    // 目標が後方140°超 → 追尾ロスト（Uターン不可）
    if (angle > Math.PI * 0.78) {  // 0.67 → 0.78（約120° → 140°）
      m.target = null
    } else {
      // 最大旋回角を dt ごとに制限（Uターン防止）
      const maxTurn = m.turnRate * dt
      const lerpFactor = angle > 0.001 ? Math.min(maxTurn, angle) / angle : 0
      const newDir = currentDir.lerp(targetDir, lerpFactor).normalize()
      m.vel.copy(newDir).multiplyScalar(m.spd)
    }
  }
  m.life -= dt
  m.mesh.position.addScaledVector(m.vel, dt)
  if (m.light) m.light.position.copy(m.mesh.position)
  if (m.vel.lengthSq() > 0.01) m.mesh.quaternion.setFromUnitVectors(_fwd, m.vel.clone().normalize())

  // ミサイル軌跡（プールから再利用）- プレイヤーミサイルは高頻度で視認性向上
  const isPlayerMissile = playerMissiles.some(pm => pm.mesh === m.mesh)
  const trailChance = isPlayerMissile ? 0.35 : 0.15  // プレイヤーミサイルは35%の確率でトレイル生成
  if (Math.random() < trailChance) {
    const trailMesh = _trailPool[_trailPoolIdx % TRAIL_POOL_SIZE]
    _trailPoolIdx++
    trailMesh.position.copy(m.mesh.position)
    trailMesh.visible = true
    ;(trailMesh.material as THREE.MeshBasicMaterial).opacity = isPlayerMissile ? 1.0 : 0.8
    ;(trailMesh.material as THREE.MeshBasicMaterial).color.setHex(isPlayerMissile ? 0xffff00 : 0xff8800)
    missileTrails.push({ mesh: trailMesh, life: 0.6 })
  }
}

// ===== EXPLOSIONS =====
const _explosionGeo = new THREE.SphereGeometry(1, 4, 4)
const _explosionMatCore = new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, depthWrite: false })
const _explosionMatOuter = new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, depthWrite: false })

function createExplosion(pos: THREE.Vector3, scale = 1.0) {
  const particles: Array<{ mesh: THREE.Mesh; vel: THREE.Vector3 }> = []
  const count = Math.floor(4 + scale * 2)
  for (let i = 0; i < count; i++) {
    const core = i < count * 0.5
    const mat = (core ? _explosionMatCore : _explosionMatOuter).clone()
    const mesh = new THREE.Mesh(_explosionGeo, mat)
    mesh.scale.setScalar((0.3 + Math.random() * 0.7) * scale)
    mesh.position.copy(pos)
    scene.add(mesh)
    particles.push({ mesh, vel: new THREE.Vector3((Math.random() - 0.5) * 28 * scale, Math.random() * 18 * scale, (Math.random() - 0.5) * 28 * scale) })
  }
  if (!isMobileDevice) {
    const flash = new THREE.PointLight(0xff6600, 6 * scale, 40)
    flash.position.copy(pos)
    scene.add(flash)
    setTimeout(() => scene.remove(flash), 150)
  }
  explosions.push({ particles, life: 1.1 })
}

// ===== UPDATE =====
function updateBullets(dt: number) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    bullets[i].life -= dt
    const oldPos = bullets[i].mesh.position.clone()
    bullets[i].mesh.position.addScaledVector(bullets[i].vel, dt)
    // 宇宙MAPでの弾丸衝突判定
    if (currentMap === 'space') {
      const dir = bullets[i].vel.clone().normalize()
      const dist = bullets[i].vel.length() * dt
      _missileRaycaster.set(oldPos, dir)
      _missileRaycaster.far = dist + 5
      const hits: THREE.Intersection[] = []
      if (spaceAsteroids) hits.push(..._missileRaycaster.intersectObject(spaceAsteroids, false))
      if (spaceZoneGroups.length > 0) hits.push(..._missileRaycaster.intersectObjects(spaceZoneGroups, true))
      if (hits.length > 0) {
        scene.remove(bullets[i].mesh); bullets.splice(i, 1); continue
      }
    }
    if (bullets[i].life <= 0) { scene.remove(bullets[i].mesh); bullets.splice(i, 1) }
  }
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    enemyBullets[i].life -= dt
    const oldPos = enemyBullets[i].mesh.position.clone()
    enemyBullets[i].mesh.position.addScaledVector(enemyBullets[i].vel, dt)
    // 宇宙MAPでの敵弾丸衝突判定
    if (currentMap === 'space') {
      const dir = enemyBullets[i].vel.clone().normalize()
      const dist = enemyBullets[i].vel.length() * dt
      _missileRaycaster.set(oldPos, dir)
      _missileRaycaster.far = dist + 5
      const hits: THREE.Intersection[] = []
      if (spaceAsteroids) hits.push(..._missileRaycaster.intersectObject(spaceAsteroids, false))
      if (spaceZoneGroups.length > 0) hits.push(..._missileRaycaster.intersectObjects(spaceZoneGroups, true))
      if (hits.length > 0) {
        scene.remove(enemyBullets[i].mesh); enemyBullets.splice(i, 1); continue
      }
    }
    if (enemyBullets[i].life <= 0) { scene.remove(enemyBullets[i].mesh); enemyBullets.splice(i, 1) }
  }
}

const _missileRaycaster = new THREE.Raycaster()
function updateMissileArr(arr: HomingMissile[], dt: number, onExpire: (m: HomingMissile) => void, checkBuildings = false) {
  for (let i = arr.length - 1; i >= 0; i--) {
    updateHoming(arr[i], dt)
    const m = arr[i]

    // 地形衝突（terrainH は数式計算のみ、無コスト）- 宇宙MAP以外のみ
    if (currentMap !== 'space' && m.mesh.position.y < terrainH(m.mesh.position.x, m.mesh.position.z) + 3) {
      onExpire(m); scene.remove(m.mesh); if (m.light) scene.remove(m.light!); arr.splice(i, 1); continue
    }

    // NEO東京ビル衝突（プレイヤーミサイルのみ）
    if (checkBuildings && currentMap === 'tokyo' && neoTokyoMapSystem) {
      const colliders = neoTokyoMapSystem.getCollisionObjects()
      if (colliders.length > 0) {
        _missileRaycaster.set(m.mesh.position, m.vel.clone().normalize())
        _missileRaycaster.far = m.vel.length() * dt * 2 + 8
        if (_missileRaycaster.intersectObjects(colliders, true).length > 0) {
          onExpire(m); scene.remove(m.mesh); if (m.light) scene.remove(m.light!); arr.splice(i, 1); continue
        }
      }
    }

    // 宇宙MAP 小惑星・ゾーン衝突
    if (currentMap === 'space') {
      _missileRaycaster.set(m.mesh.position, m.vel.clone().normalize())
      _missileRaycaster.far = m.vel.length() * dt * 2 + 8
      const hits: THREE.Intersection[] = []
      if (spaceAsteroids) hits.push(..._missileRaycaster.intersectObject(spaceAsteroids, false))
      if (spaceZoneGroups.length > 0) hits.push(..._missileRaycaster.intersectObjects(spaceZoneGroups, true))
      if (hits.length > 0) {
        onExpire(m); scene.remove(m.mesh); if (m.light) scene.remove(m.light!); arr.splice(i, 1); continue
      }
    }

    if (m.life <= 0) { onExpire(m); scene.remove(m.mesh); if (m.light) scene.remove(m.light!); arr.splice(i, 1) }
  }
}

function updateFlares(dt: number) {
  for (let i = flares.length - 1; i >= 0; i--) {
    const f = flares[i]
    // 宇宙MAPでは重力なし
    if (currentMap !== 'space') f.vel.y -= 9 * dt
    f.life -= dt
    f.mesh.position.addScaledVector(f.vel, dt)
    ;((f.mesh as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 4.0 + Math.random() * 3.5
    if (f.life <= 0 || (currentMap !== 'space' && f.mesh.position.y < 1)) { scene.remove(f.mesh); flares.splice(i, 1) }
  }
}

function updateEnemies(dt: number) {
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i]

    // 補給モード処理
    let supplyTarget: THREE.Vector3 | null = null
    if (enemy.seekingSupply) {
      let nearestIdx = 0, nearestDist = Infinity
      for (let si = 0; si < SUPPLY_POSITIONS.length; si++) {
        const d = enemy.group.position.distanceTo(SUPPLY_POSITIONS[si])
        if (d < nearestDist) { nearestDist = d; nearestIdx = si }
      }
      supplyTarget = SUPPLY_POSITIONS[nearestIdx]

      // 補給ポイント到達判定
      if (nearestDist < 40) {
        enemy.missileAmmo = 4
        enemy.seekingSupply = false
        supplyTarget = null
      }
    }

    // 戦闘ターゲットの決定
    const target: THREE.Object3D = (currentMode === 'dogfight' && allies.length > 0 && i % 3 === 2)
      ? allies[i % allies.length].group
      : player

    // ミサイル回避チェック
    let evadeVector = new THREE.Vector3()
    let isEvading = false
    const allThreats = [...playerMissiles, ...allyMissiles]

    for (const m of allThreats) {
      const dist = m.mesh.position.distanceTo(enemy.group.position)
      if (dist < 60 && m.target === enemy.group) {
        // 検知失敗の確率（30%）
        if (Math.random() < 0.3) continue

        // 反応遅延処理
        if (enemy.evadeDelay > 0) {
          enemy.evadeDelay -= dt
          continue
        }

        if (enemy.evadeDelay === 0) {
          enemy.evadeDelay = 0.3 + Math.random() * 0.2
          continue
        }

        // 回避開始
        isEvading = true
        const missileDir = m.mesh.position.clone().sub(enemy.group.position).normalize()
        evadeVector.set(-missileDir.z, 0.3, missileDir.x)  // 横方向+少し上昇
        if (Math.random() < 0.5) evadeVector.x *= -1
        evadeVector.normalize()
        break
      } else if (dist >= 60) {
        enemy.evadeDelay = 0
      }
    }

    // 目標位置の決定（補給 or 戦闘ターゲット）
    const goalPosition = supplyTarget ? supplyTarget : target.position
    const toTarget = goalPosition.clone().sub(enemy.group.position)
    const distToTarget = toTarget.length()

    // 希望する方向ベクトルを計算
    let desiredDirection = new THREE.Vector3()

    if (isEvading) {
      // 回避モード：回避方向へ
      desiredDirection.copy(evadeVector)
    } else if (enemy.seekingSupply) {
      // 補給モード：補給ポイントへ直進
      desiredDirection.copy(toTarget).normalize()
    } else {
      // 戦闘モード：戦術タイプに応じた位置取り
      const targetFwd = _fwd.clone().applyQuaternion(target.quaternion)
      const targetRight = new THREE.Vector3(1, 0, 0).applyQuaternion(target.quaternion)

      // ターゲットの速度推定（プレイヤーの場合）
      const targetVel = target === player
        ? targetFwd.clone().multiplyScalar(speed)
        : new THREE.Vector3()

      let idealOffset = new THREE.Vector3()

      switch (enemy.tacticType) {
        case 0:  // 後方追跡型
          // 後方に位置取り、距離を維持
          const behindOffset = distToTarget < enemy.preferredDistance ? -1.2 : -1.0
          idealOffset.copy(targetFwd).multiplyScalar(behindOffset * enemy.preferredDistance)
          idealOffset.y = enemy.preferredHeightOffset
          break

        case 1:  // 側面攻撃型
          // 側面に回り込む
          const sideDir = (i % 2 === 0) ? 1 : -1
          idealOffset.copy(targetRight).multiplyScalar(sideDir * enemy.preferredDistance * 0.8)
          idealOffset.add(targetVel.clone().multiplyScalar(0.5))  // 少し先回り
          idealOffset.y = enemy.preferredHeightOffset
          break

        case 2:  // 高高度型
          // 上方から追跡
          idealOffset.copy(targetVel.clone().multiplyScalar(0.4))
          idealOffset.y = enemy.preferredHeightOffset
          if (distToTarget < enemy.preferredDistance * 0.8) {
            // 近すぎたら距離を取る
            idealOffset.add(targetFwd.clone().multiplyScalar(-50))
          }
          break

        case 3:  // 接近戦型
          // 積極的に接近
          if (distToTarget > enemy.preferredDistance * 1.5) {
            // 遠い場合は正面から接近
            idealOffset.copy(targetFwd).multiplyScalar(enemy.preferredDistance)
          } else {
            // 近い場合は後方に回り込む
            idealOffset.copy(targetFwd).multiplyScalar(-enemy.preferredDistance * 0.7)
            idealOffset.add(targetRight.clone().multiplyScalar((i % 2 === 0) ? 50 : -50))
          }
          idealOffset.y = enemy.preferredHeightOffset
          break
      }

      // 理想位置へのベクトル
      const idealPos = target.position.clone().add(idealOffset)
      desiredDirection.copy(idealPos).sub(enemy.group.position).normalize()
    }

    // 現在の前方向
    const currentForward = _fwd.clone().applyQuaternion(enemy.group.quaternion)

    // ゾーン別の戦術パラメータ調整
    let zoneSpeedMultiplier = 1.0
    let zoneDistanceModifier = 0
    let zoneTurnRateMultiplier = 1.0

    if (currentMap === 'space' && enemy.spawnZone) {
      switch (enemy.spawnZone) {
        case 'mining_colony':
          // 採掘コロニー：密集小惑星 → 低速近接戦
          zoneSpeedMultiplier = 0.7
          zoneDistanceModifier = -30  // より近距離を好む
          zoneTurnRateMultiplier = 1.2  // 旋回性能アップ
          break
        case 'ship_graveyard':
          // 船墓場：峡谷地形 → 中速、待ち伏せ型、垂直移動
          zoneSpeedMultiplier = 0.85
          zoneDistanceModifier = 20  // やや中距離
          break
        case 'orbital_ring':
          // 軌道リング：開放空間 → 高速戦闘
          zoneSpeedMultiplier = 1.5
          zoneDistanceModifier = 60  // 長距離を好む
          zoneTurnRateMultiplier = 0.8  // 高速のため旋回は鈍い
          break
        case 'fortress':
          // 要塞：バランス型
          zoneSpeedMultiplier = 1.0
          zoneDistanceModifier = 0
          zoneTurnRateMultiplier = 1.0
          break
        case 'construction':
          // 建造現場：迷路状 → 視界制限、高機動
          zoneSpeedMultiplier = 0.9
          zoneDistanceModifier = -20  // やや近距離
          zoneTurnRateMultiplier = 1.4  // 高い旋回性能
          break
        case 'central_hub':
          // 中央ステーション：標準
          zoneSpeedMultiplier = 1.0
          zoneDistanceModifier = 0
          zoneTurnRateMultiplier = 1.0
          break
      }
    }

    // 目標速度の計算（ゾーン補正を適用）
    let targetSpeed = isEvading ? 200 : 160 * zoneSpeedMultiplier

    if (!isEvading && !enemy.seekingSupply) {
      // 距離に応じた速度調整（ゾーン補正を考慮）
      const adjustedPreferredDistance = enemy.preferredDistance + zoneDistanceModifier
      if (distToTarget < adjustedPreferredDistance * 0.7) {
        // 近すぎる：減速
        targetSpeed = 120
      } else if (distToTarget > enemy.preferredDistance * 1.5) {
        // 遠い：加速
        targetSpeed = 180
      }
    }

    // 速度の滑らかな変化
    const accel = isEvading ? 150 : 80  // 加減速度（m/s²）
    if (enemy.currentSpeed < targetSpeed) {
      enemy.currentSpeed = Math.min(targetSpeed, enemy.currentSpeed + accel * dt)
    } else {
      enemy.currentSpeed = Math.max(targetSpeed, enemy.currentSpeed - accel * dt)
    }

    // 旋回速度の制限（角速度）- ゾーン補正を適用
    const baseTurnRate = isEvading ? 0.10 : 0.06
    const turnRate = baseTurnRate * zoneTurnRateMultiplier
    const newForward = currentForward.clone().lerp(desiredDirection, turnRate)
    newForward.normalize()

    // 位置更新
    const oldPos = enemy.group.position.clone()
    enemy.group.position.addScaledVector(newForward, enemy.currentSpeed * dt)

    // MAP境界制限（全MAP共通：敵も戦闘エリアから出られない）
    const bounds = MAP_BOUNDS[currentMap]
    if (enemy.group.position.x < bounds.minX) enemy.group.position.x = bounds.minX
    if (enemy.group.position.x > bounds.maxX) enemy.group.position.x = bounds.maxX
    if (enemy.group.position.z < bounds.minZ) enemy.group.position.z = bounds.minZ
    if (enemy.group.position.z > bounds.maxZ) enemy.group.position.z = bounds.maxZ

    // 宇宙MAPは上下の境界も制限
    if (currentMap === 'space') {
      if (enemy.group.position.y < -400) enemy.group.position.y = -400
      if (enemy.group.position.y > 500) enemy.group.position.y = 500
    }

    // 高度制御
    if (currentMap !== 'space') {
      // 通常MAP：地形からの高度を保つ（最低20m）
      const terrainHeight = terrainH(enemy.group.position.x, enemy.group.position.z)
      const minAlt = 20

      if (enemy.group.position.y < terrainHeight + minAlt) {
        // 地面に近すぎる：上昇
        enemy.group.position.y = terrainHeight + minAlt
        } else if (!isEvading && enemy.group.position.y > terrainHeight + 120) {
        // 高すぎる：徐々に降下
        enemy.group.position.y -= 30 * dt
      } else if (!isEvading && !enemy.seekingSupply) {
        // 通常時：目標高度に近づける
        const targetAlt = target.position.y + enemy.preferredHeightOffset
        const heightDiff = targetAlt - enemy.group.position.y
        enemy.group.position.y += heightDiff * 0.5 * dt
      }
    } else if (enemy.spawnZone === 'ship_graveyard' && !isEvading && !enemy.seekingSupply) {
      // 宇宙MAP・船墓場：垂直振動（峡谷を活かした待ち伏せ）
      const time = Date.now() * 0.001
      const verticalOffset = Math.sin(time * 0.5 + i * 0.7) * 40  // ±40mの振動
      const targetAlt = target.position.y + enemy.preferredHeightOffset + verticalOffset
      const heightDiff = targetAlt - enemy.group.position.y
      enemy.group.position.y += heightDiff * 0.8 * dt
    } else if (currentMap === 'space' && !isEvading && !enemy.seekingSupply) {
      // 宇宙MAP・その他のゾーン：目標高度に緩やかに追従
      const targetAlt = target.position.y + enemy.preferredHeightOffset
      const heightDiff = targetAlt - enemy.group.position.y
      enemy.group.position.y += heightDiff * 0.5 * dt
    }

    // 速度ベクトル記録（マシンガン予測用）
    enemy.velocity.copy(enemy.group.position).sub(oldPos).divideScalar(dt)
    enemy.lastPos.copy(oldPos)

    // 機体の向き更新（水平成分のみ）
    const flatForward = new THREE.Vector3(newForward.x, 0, newForward.z)
    if (flatForward.lengthSq() > 0.01) {
      flatForward.normalize()
      enemy.group.quaternion.slerp(
        new THREE.Quaternion().setFromUnitVectors(_fwd, flatForward),
        isEvading ? 0.12 : 0.08
      )
    }

    // ミサイル発射判定
    if (!isEvading && !enemy.seekingSupply) {
      enemy.fireCooldown -= dt
      const angleToTarget = Math.acos(
        Math.max(-1, Math.min(1, toTarget.clone().normalize().dot(currentForward)))
      )

      // ミサイル発射判定（ゾーン補正を適用）
      const adjustedPreferredDistance = enemy.preferredDistance + zoneDistanceModifier
      const missileMinRange = adjustedPreferredDistance * 0.5
      const missileMaxRange = adjustedPreferredDistance * 3.0
      if (enemy.fireCooldown <= 0 && distToTarget > missileMinRange && distToTarget < missileMaxRange && angleToTarget < Math.PI / 6) {
        if (enemy.missileAmmo > 0) {
          enemy.fireCooldown = 9 + Math.random() * 7
          fireEnemyMissile(enemy)
        } else {
          enemy.seekingSupply = true
          enemy.fireCooldown = 3
        }
      }

      // マシンガン射撃判定（ゾーン補正を適用）
      enemy.gunCooldown -= dt
      const gunMaxRange = Math.min(200, adjustedPreferredDistance * 1.5)
      if (enemy.gunCooldown <= 0 && distToTarget < gunMaxRange && distToTarget > 30 && angleToTarget < Math.PI / 9) {
        enemy.gunCooldown = 0.10 + Math.random() * 0.04
        const aimDir = toTarget.clone().normalize()
        const enemyVel = currentForward.clone().multiplyScalar(enemy.currentSpeed)
        for (const side of [-0.5, 0.5]) {
          const offset = new THREE.Vector3(side, 0, 0).applyQuaternion(enemy.group.quaternion)
          const mesh = new THREE.Mesh(_enemyBulletGeo, enemyBulletMat)
          mesh.position.copy(enemy.group.position).add(offset)
          scene.add(mesh)
          enemyBullets.push({ mesh, vel: aimDir.clone().multiplyScalar(700).add(enemyVel), life: 0.4 })
        }
      }
    }
  }
}

function updateExplosions(dt: number) {
  for (let i = explosions.length - 1; i >= 0; i--) {
    const ex = explosions[i]; ex.life -= dt
    for (const p of ex.particles) {
      p.mesh.position.addScaledVector(p.vel, dt)
      // 宇宙MAPでは重力なし
      if (currentMap !== 'space') p.vel.y -= 5 * dt
      p.vel.multiplyScalar(0.94)
      const mat = p.mesh.material as THREE.MeshStandardMaterial
      mat.opacity = Math.max(0, ex.life / 1.3); mat.emissiveIntensity = ex.life * 3.5
    }
    if (ex.life <= 0) { ex.particles.forEach(p => scene.remove(p.mesh)); explosions.splice(i, 1) }
  }
}

function updateMissileTrails(dt: number) {
  for (let i = missileTrails.length - 1; i >= 0; i--) {
    const trail = missileTrails[i]
    trail.life -= dt
    const mat = trail.mesh.material as THREE.MeshBasicMaterial
    mat.opacity = Math.max(0, trail.life / 0.6)
    trail.mesh.scale.multiplyScalar(1 + dt * 2)  // 徐々に拡大
    if (trail.life <= 0) {
      trail.mesh.visible = false
      trail.mesh.scale.set(1, 1, 1)  // スケールリセット（次回再利用のため）
      missileTrails.splice(i, 1)
    }
  }
}

function updateContrails() {
  if (++trailFrame % 3 !== 0 || speed < 150) return  // 更新頻度削減（2フレーム→3フレームごと）
  for (const wo of [new THREE.Vector3(-2.8, 0, 2.1), new THREE.Vector3(2.8, 0, 2.1)]) {
    const p = wo.clone().applyQuaternion(player.quaternion).add(player.position)
    if (trailSize < TRAIL_CAP) {
      trailBuf[trailSize * 3] = p.x; trailBuf[trailSize * 3 + 1] = p.y; trailBuf[trailSize * 3 + 2] = p.z
      trailSize++
    } else {
      trailBuf.copyWithin(0, 3)
      trailBuf[(TRAIL_CAP - 1) * 3] = p.x; trailBuf[(TRAIL_CAP - 1) * 3 + 1] = p.y; trailBuf[(TRAIL_CAP - 1) * 3 + 2] = p.z
    }
  }
  trailAttr.needsUpdate = true
  trailGeo.setDrawRange(0, trailSize)
}

// ===== COLLISION =====
function checkCollisions() {
  outer: for (let bi = bullets.length - 1; bi >= 0; bi--) {
    for (let ei = enemies.length - 1; ei >= 0; ei--) {
      if (bullets[bi].mesh.position.distanceTo(enemies[ei].group.position) < 3.5) {
        scene.remove(bullets[bi].mesh); bullets.splice(bi, 1)
        if (--enemies[ei].health <= 0) killEnemy(ei)
        continue outer
      }
    }
  }
  for (let mi = playerMissiles.length - 1; mi >= 0; mi--) {
    const missile = playerMissiles[mi]
    if (!missile) continue
    for (let ei = enemies.length - 1; ei >= 0; ei--) {
      if (missile.mesh.position.distanceTo(enemies[ei].group.position) < 6) {
        createExplosion(missile.mesh.position.clone(), 1.5); playExplosionSound(1.2)
        if (missile.light) scene.remove(missile.light)
        scene.remove(missile.mesh); playerMissiles.splice(mi, 1)
        killEnemy(ei); break
      }
    }
  }
  for (let mi = allyMissiles.length - 1; mi >= 0; mi--) {
    const missile = allyMissiles[mi]
    if (!missile) continue
    for (let ei = enemies.length - 1; ei >= 0; ei--) {
      if (missile.mesh.position.distanceTo(enemies[ei].group.position) < 6) {
        createExplosion(missile.mesh.position.clone(), 1.5); playExplosionSound(1.2)
        scene.remove(missile.mesh); allyMissiles.splice(mi, 1)
        killEnemy(ei); break
      }
    }
  }
  for (let mi = enemyMissiles.length - 1; mi >= 0; mi--) {
    const m = enemyMissiles[mi]
    if (!m) continue
    if (m.mesh.position.distanceTo(player.position) < 4) {
      createExplosion(m.mesh.position.clone(), 1.0); playExplosionSound(0.8)
      if (m.light) scene.remove(m.light)
      scene.remove(m.mesh); enemyMissiles.splice(mi, 1)
      if (invincibleTimer <= 0) {
        playerHP = Math.max(0, playerHP - 1)
        hitFlashTimer = 0.5
        camShakeAmt = Math.max(camShakeAmt, 1.8)
        updateHPDisplay()
        if (playerHP <= 0) {
          // 即時リスポーンではなく3秒カウントダウン開始
          respawnTimer = 3.0
          player.visible = false
          const cd = document.getElementById('respawn-countdown')!
          const respawnOvr = document.getElementById('respawn-overlay')!
          cd.style.display = 'block'
          respawnOvr.style.opacity = '1'
          return
        }
      }
      continue
    }
    if (m.diverted) {
      for (let fi = flares.length - 1; fi >= 0; fi--) {
        if (m.mesh.position.distanceTo(flares[fi].mesh.position) < 12) {
          createExplosion(m.mesh.position.clone(), 0.6)
          if (m.light) scene.remove(m.light)
          scene.remove(m.mesh); enemyMissiles.splice(mi, 1)
          scene.remove(flares[fi].mesh); flares.splice(fi, 1); break
        }
      }
    }
  }

  // 敵マシンガン弾 → プレイヤー
  if (invincibleTimer <= 0) {
    for (let bi = enemyBullets.length - 1; bi >= 0; bi--) {
      if (enemyBullets[bi].mesh.position.distanceTo(player.position) < 4) {
        scene.remove(enemyBullets[bi].mesh); enemyBullets.splice(bi, 1)
        playerHP = Math.max(0, playerHP - 1)
        hitFlashTimer = 0.4
        camShakeAmt = Math.max(camShakeAmt, 0.8)
        updateHPDisplay()
        if (playerHP <= 0) {
          respawnTimer = 3.0; player.visible = false
          const cd = document.getElementById('respawn-countdown')!
          const respawnOvr = document.getElementById('respawn-overlay')!
          cd.style.display = 'block'; respawnOvr.style.opacity = '1'
          return
        }
        break
      }
    }
  }
}

// ===== UI =====
const speedEl    = document.getElementById('speed')!
const altEl      = document.getElementById('altitude')!
const missileEl  = document.getElementById('missiles')!
const flareEl    = document.getElementById('flares')!
const mslCountEl = document.getElementById('msl-count')  // スマホ版ボタン内の残量表示
const flrCountEl = document.getElementById('flr-count')  // スマホ版ボタン内の残量表示
const scoreEl    = document.getElementById('score')!
const hitOverlay = document.getElementById('hit-overlay') as HTMLDivElement
const respawnOverlay = document.getElementById('respawn-overlay') as HTMLDivElement
const supplyIndicator = document.getElementById('supply-indicator') as HTMLDivElement
const warningEl  = document.getElementById('warning') as HTMLDivElement
const boundaryWarningEl = document.getElementById('boundary-warning') as HTMLDivElement
const reticleEl  = document.getElementById('reticle') as HTMLDivElement
const gunLeadReticleEl = document.getElementById('gun-lead-reticle') as HTMLDivElement
const boostFill  = document.getElementById('boost-fill') as HTMLDivElement
const missilePips = document.getElementById('missile-pips')!
const flarePips   = document.getElementById('flare-pips')!
const hpFill  = document.getElementById('hp-fill') as HTMLDivElement
const hpText  = document.getElementById('hp-text')!
const radarCanvas = document.getElementById('radar') as HTMLCanvasElement
const radarCtx = radarCanvas.getContext('2d')!
const overlayCanvas = document.getElementById('enemy-overlay') as HTMLCanvasElement
const overlayCtx = overlayCanvas.getContext('2d')!
const centerXhairEl = document.getElementById('center-xhair') as HTMLDivElement
const landmarksHudEl = document.getElementById('hud-landmarks') as HTMLDivElement
const landmarkListEl = document.getElementById('landmark-list') as HTMLDivElement

// ピップ初期化
function initPips(el: HTMLElement, count: number, cls: string) {
  el.innerHTML = ''
  for (let i = 0; i < count; i++) {
    const d = document.createElement('div'); d.className = `pip ${cls}`; el.appendChild(d)
  }
}
initPips(missilePips, 6, 'on')
initPips(flarePips, 8, 'flare-on')

function updatePips(el: HTMLElement, current: number, cls: string) {
  const pips = el.querySelectorAll<HTMLElement>('.pip')
  pips.forEach((p, i) => { p.classList.toggle(cls, i < current) })
}

// スマホ版ボタン内の残量表示を更新
function updateMobileAmmo() {
  if (mslCountEl) mslCountEl.textContent = missileAmmo.toString()
  if (flrCountEl) flrCountEl.textContent = flareAmmo.toString()
}

function updateReticle() {
  if (!lockedTarget) {
    reticleEl.style.display = 'none'
    gunLeadReticleEl.style.display = 'none'
    return
  }

  // 通常のロックオンレティクル（敵本体位置）
  const pos = lockedTarget.group.position.clone()
  if (pos.clone().sub(camera.position).dot(_fwd.clone().applyQuaternion(camera.quaternion)) < 0) {
    reticleEl.style.display = 'none'
    gunLeadReticleEl.style.display = 'none'
    return
  }
  pos.project(camera)
  const { w: rW, h: rH } = getEffectiveSize()
  reticleEl.style.display = 'block'
  reticleEl.style.left = ((pos.x + 1) / 2 * rW) + 'px'
  reticleEl.style.top = ((-pos.y + 1) / 2 * rH) + 'px'

  // マシンガン予測照準レティクル
  // 予測機能を一旦無効化（2026-05-12）
  /*
  const leadPos = calculateGunLeadPosition(lockedTarget)
  if (leadPos) {
    const leadPosCam = leadPos.clone().sub(camera.position)
    const fwd = _fwd.clone().applyQuaternion(camera.quaternion)
    if (leadPosCam.dot(fwd) > 0) {
      leadPos.project(camera)
      gunLeadReticleEl.style.display = 'block'
      gunLeadReticleEl.style.left = ((leadPos.x + 1) / 2 * rW - 12) + 'px'  // -12: 中心調整
      gunLeadReticleEl.style.top = ((-leadPos.y + 1) / 2 * rH - 12) + 'px'
    } else {
      gunLeadReticleEl.style.display = 'none'
    }
  } else {
    gunLeadReticleEl.style.display = 'none'
  }
  */
  gunLeadReticleEl.style.display = 'none'
}

function updateWarning() {
  let closest = Infinity
  for (const m of enemyMissiles) closest = Math.min(closest, m.mesh.position.distanceTo(player.position))
  if (closest < 200) {
    const urgency = 1 - closest / 200
    warningEl.style.display = 'block'
    warningEl.style.opacity = Math.sin(Date.now() * 0.001 * (1 + urgency * 9) * Math.PI * 2) > 0 ? '1' : '0'
    warningEl.style.color = urgency > 0.6 ? '#ff2200' : '#ff8800'
    warningEl.style.textShadow = `0 0 ${12 + urgency * 20}px ${urgency > 0.6 ? '#ff0000' : '#ff6600'}`
  } else {
    warningEl.style.display = 'none'
  }
}

function updateBoundaryWarning(dt: number) {
  boundaryWarningTimer = Math.max(0, boundaryWarningTimer - dt)
  if (boundaryWarningTimer > 0) {
    boundaryWarningEl.style.display = 'block'
    boundaryWarningEl.style.opacity = Math.min(1, boundaryWarningTimer * 2).toString()
  } else {
    boundaryWarningEl.style.display = 'none'
  }
}

function enforceMapBounds() {
  if (!currentMode) return
  const bounds = MAP_BOUNDS[currentMap]
  const clampedX = THREE.MathUtils.clamp(player.position.x, bounds.minX, bounds.maxX)
  const clampedZ = THREE.MathUtils.clamp(player.position.z, bounds.minZ, bounds.maxZ)
  const outside = clampedX !== player.position.x || clampedZ !== player.position.z
  if (outside) {
    player.position.x = clampedX
    player.position.z = clampedZ
    speed = Math.min(speed, 180)
    wheelSpeedTarget = Math.min(wheelSpeedTarget, 150)
    boundaryWarningTimer = 1.2
    hitFlashTimer = Math.max(hitFlashTimer, 0.18)
    camShakeAmt = Math.max(camShakeAmt, 0.28)
    return
  }

  const distanceToEdge = Math.min(
    player.position.x - bounds.minX,
    bounds.maxX - player.position.x,
    player.position.z - bounds.minZ,
    bounds.maxZ - player.position.z,
  )
  if (distanceToEdge < bounds.warningMargin) boundaryWarningTimer = Math.max(boundaryWarningTimer, 0.35)
}

const MISSILE_LOCK_RANGE = 3000

function _drawCornerBrackets(ctx: CanvasRenderingContext2D, sx: number, sy: number, SZ: number, ARM: number) {
  for (const [cx2, cy2, dx, dy] of [
    [sx - SZ, sy - SZ,  1,  1], [sx + SZ, sy - SZ, -1,  1],
    [sx - SZ, sy + SZ,  1, -1], [sx + SZ, sy + SZ, -1, -1],
  ] as [number, number, number, number][]) {
    ctx.beginPath()
    ctx.moveTo(cx2 + dx * ARM, cy2); ctx.lineTo(cx2, cy2); ctx.lineTo(cx2, cy2 + dy * ARM)
    ctx.stroke()
  }
}

function _drawOffscreenArrow(ctx: CanvasRenderingContext2D, worldPos: THREE.Vector3, w: number, h: number, color: string = 'rgba(255,80,80,0.9)') {
  const toTarget = worldPos.clone().sub(camera.position)
  const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
  const camUp    = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
  const angle = Math.atan2(-toTarget.dot(camUp), toTarget.dot(camRight))
  const margin = 32
  const cx = w / 2 + Math.cos(angle) * (w / 2 - margin)
  const cy = h / 2 + Math.sin(angle) * (h / 2 - margin)
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle)
  ctx.fillStyle = color
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill()
  ctx.restore()
}

function drawEnemyBrackets() {
  const { w, h } = getEffectiveSize()
  if (overlayCanvas.width !== w || overlayCanvas.height !== h) {
    overlayCanvas.width = w; overlayCanvas.height = h
  }
  const ctx = overlayCtx
  ctx.clearRect(0, 0, w, h)
  if (!currentMode) return

  const t = Date.now()
  const camFwd = _fwd.clone().applyQuaternion(camera.quaternion)
  const playerFwd = _fwd.clone().applyQuaternion(player.quaternion)

  function projectToScreen(pos: THREE.Vector3): [number, number, boolean] {
    const toPos = pos.clone().sub(camera.position)
    if (toPos.dot(camFwd) < 0) return [0, 0, false]
    const ndc = pos.clone().project(camera)
    return [(ndc.x + 1) / 2 * w, (-ndc.y + 1) / 2 * h, true]
  }

  // Air enemies
  _hudFrameCount++
  const _shouldRaycast = _hudFrameCount % 3 === 0
  for (const e of enemies) {
    const dist = e.group.position.distanceTo(player.position)
    const toE = e.group.position.clone().sub(player.position)
    const toENorm = toE.clone().normalize()
    const frontDot = toENorm.dot(playerFwd)

    // 地形遮蔽チェック（3フレームに1回だけレイキャスト、他はキャッシュ使用）
    let blockedByTerrain: boolean
    if (_shouldRaycast) {
      _hudRaycaster.set(player.position, toENorm)
      _hudRaycaster.far = dist - 5
      blockedByTerrain = isBlockedByMapGeometry(_hudRaycaster)
      _hudOcclusionCache.set(e.group, blockedByTerrain)
    } else {
      blockedByTerrain = _hudOcclusionCache.get(e.group) ?? false
    }

    const [sx, sy, vis] = projectToScreen(e.group.position)
    const isLocked = e === lockedTarget
    const isMulti  = multiLockTargets.includes(e)
    const inRange  = dist < MISSILE_LOCK_RANGE

    if (!vis) {
      if (isLocked) _drawOffscreenArrow(ctx, e.group.position, w, h)
      continue
    }

    // 地形に遮られている場合は表示しない
    if (blockedByTerrain && !isLocked && !isMulti) continue

    if (isLocked || isMulti) {
      const pulse = 0.65 + 0.35 * Math.sin(t * 0.007)
      const r = isMulti && !isLocked ? 22 : 28
      const col = isMulti ? `rgba(255,200,50,${pulse})` : `rgba(255,70,70,${pulse})`
      ctx.strokeStyle = col; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = col.replace(/[\d.]+\)$/, `${pulse * 0.5})`); ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(sx, sy, r * 0.65, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = col; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'
      if (isMulti && !isLocked) {
        ctx.fillText(`[${multiLockTargets.indexOf(e) + 1}]`, sx, sy - r - 5)
      } else {
        ctx.fillText('LOCKED', sx, sy + r + 14)
      }
      ctx.font = 'bold 14px monospace'
      ctx.fillText(`${Math.round(dist)}m`, sx, sy + r + 28)
      if (!inRange) {
        ctx.fillStyle = 'rgba(255,80,80,0.9)'
        ctx.font = '9px monospace'
        ctx.fillText('OUT OF RANGE', sx, sy - r - 8)
      }
    } else if (inRange && frontDot > 0.25) {
      // 射程内: 赤ブラケット（ミサイル撃てる）
      const spin = t * 0.0022
      const r = 22
      ctx.strokeStyle = 'rgba(255,70,50,0.85)'; ctx.lineWidth = 1.2
      for (let i = 0; i < 4; i++) {
        const a0 = spin + (i / 4) * Math.PI * 2
        ctx.beginPath(); ctx.arc(sx, sy, r, a0, a0 + Math.PI * 0.42); ctx.stroke()
      }
      ctx.strokeStyle = 'rgba(255,80,60,0.6)'
      _drawCornerBrackets(ctx, sx, sy, 16, 6)
      ctx.strokeStyle = 'rgba(255,80,60,0.35)'
      _drawCornerBrackets(ctx, sx, sy, 22, 8)
      ctx.fillStyle = 'rgba(255,90,70,0.9)'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'
      ctx.fillText(`${Math.round(dist)}m`, sx, sy + 22 + 16)
    } else {
      // 射程外: 黄ブラケット（まだ遠い）
      ctx.strokeStyle = 'rgba(255,210,60,0.35)'; ctx.lineWidth = 1
      _drawCornerBrackets(ctx, sx, sy, 16, 5)
      ctx.fillStyle = 'rgba(255,210,60,0.5)'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'
      ctx.fillText(`${Math.round(dist)}m`, sx, sy + 16 + 14)
    }
  }

  // Ground targets (souryokusen)
  if (currentMode === 'souryokusen') {
    for (const gt of groundTargets) {
      const dist = gt.group.position.distanceTo(player.position)
      if (dist > MISSILE_LOCK_RANGE * 1.4) continue

      // 地形遮蔽チェック（_hudRaycaster を再利用）
      const toGT = gt.group.position.clone().sub(player.position)
      _hudRaycaster.set(player.position, toGT.normalize())
      _hudRaycaster.far = dist - 5
      if (isBlockedByMapGeometry(_hudRaycaster) && gt !== lockedTarget) continue

      const [sx, sy, vis] = projectToScreen(gt.group.position)
      if (!vis) {
        // ロック中は画面外でも矢印表示
        if (gt === lockedTarget) _drawOffscreenArrow(ctx, gt.group.position, w, h)
        continue
      }

      const isLocked = gt === lockedTarget
      const inR = dist < MISSILE_LOCK_RANGE

      // ロック中は航空機と同じ表示（赤い円形）
      if (isLocked) {
        const pulse = 0.65 + 0.35 * Math.sin(t * 0.007)
        const r = 28
        const col = `rgba(255,70,70,${pulse})`
        ctx.strokeStyle = col; ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke()
        ctx.strokeStyle = col.replace(/[\d.]+\)$/, `${pulse * 0.5})`); ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(sx, sy, r * 0.65, 0, Math.PI * 2); ctx.stroke()
        ctx.fillStyle = col; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'
        ctx.fillText('LOCKED', sx, sy + r + 14)
        ctx.font = 'bold 14px monospace'
        ctx.fillText(`${Math.round(dist)}m`, sx, sy + r + 28)
        if (!inR) {
          ctx.fillStyle = 'rgba(255,80,80,0.9)'
          ctx.font = '9px monospace'
          ctx.fillText('OUT OF RANGE', sx, sy - r - 8)
        }
      } else {
        // 射程内:赤、射程外:黄（空中目標と統一）
        ctx.strokeStyle = inR ? 'rgba(255,70,50,0.85)' : 'rgba(255,210,60,0.35)'
        ctx.lineWidth = inR ? 1.5 : 1
        _drawCornerBrackets(ctx, sx, sy, 18, 6)
        if (inR) {
          ctx.strokeStyle = 'rgba(255,80,60,0.4)'
          _drawCornerBrackets(ctx, sx, sy, 24, 8)
        }
        ctx.fillStyle = inR ? 'rgba(255,90,70,0.9)' : 'rgba(255,210,60,0.45)'
        ctx.font = inR ? 'bold 12px monospace' : 'bold 11px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(`${Math.round(dist)}m`, sx, sy + 18 + 16)
      }
    }
  }

  // 宇宙MAP：次のゾーンへの方向キュー（画面外の場合）
  if (currentMap === 'space' && spaceZones.length > 0) {
    // 最も近いゾーンを探す
    let closestZone: SpaceZone | null = null
    let minDist = Infinity
    for (const zone of spaceZones) {
      if (zone.zone_id === 'central_hub') continue  // 中央ステーションは除外
      const zonePos = new THREE.Vector3(zone.position.x, zone.position.y, zone.position.z)
      const dist = player.position.distanceTo(zonePos)
      if (dist < minDist && dist > 600) {
        minDist = dist
        closestZone = zone
      }
    }

    if (closestZone) {
      const zonePos = new THREE.Vector3(closestZone.position.x, closestZone.position.y, closestZone.position.z)
      const [_sx, _sy, vis] = projectToScreen(zonePos)
      // 画面外の場合のみ矢印表示
      if (!vis) {
        const zoneColor = ZONE_COLORS[closestZone.zone_id] || 0xffffff
        const r = (zoneColor >> 16) & 0xff
        const g = (zoneColor >> 8) & 0xff
        const b = zoneColor & 0xff
        _drawOffscreenArrow(ctx, zonePos, w, h, `rgba(${r}, ${g}, ${b}, 0.6)`)
      }
    }
  }
}

function updateRendererSize() {
  const { w, h } = getEffectiveSize()
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  composer?.setSize(w, h)
}
window.addEventListener('resize', updateRendererSize)
window.addEventListener('orientationchange', () => setTimeout(updateRendererSize, 150))

// ===== HP / RESPAWN =====
function updateHPDisplay() {
  hpFill.style.width = `${(playerHP / MAX_HP) * 100}%`
  hpFill.style.background = playerHP > 1
    ? 'linear-gradient(90deg,#f44,#f80)'
    : 'linear-gradient(90deg,#f00,#f44)'
  hpText.textContent = `HP ${playerHP}/${MAX_HP}`
}

function respawnPlayer() {
  playerHP = MAX_HP
  let rx = currentMode === 'dogfight' ? dfSpawnX : 500  // オリジナルMAPでは(500, 500)
  let rz = currentMode === 'dogfight' ? dfSpawnZ : 500
  let ry = 200

  // 宇宙MAPの場合
  if (currentMap === 'space') {
    rx = 0
    ry = 130
    rz = 420
  }
  // 東京MAPの場合は安全なスポーン位置を使用
  else if (currentMap === 'tokyo' && neoTokyoMapSystem) {
    const safePos = neoTokyoMapSystem.getSafeSpawnPosition()
    rx = safePos.x
    ry = safePos.y
    rz = safePos.z
  } else {
    ry = terrainH(rx, rz) + 200  // オリジナルMAP: 地形+200m
  }

  player.position.set(rx, ry, rz)
  player.quaternion.identity()
  camQuat.identity()
  speed = 200  // リスポーン時も巡航速度
  invincibleTimer = 3.0
  respawnFlash = 0.8

  // ミサイル・フレアを全回復
  missileAmmo = 6
  flareAmmo = 3
  missileEl.textContent = missileAmmo.toString()
  flareEl.textContent = flareAmmo.toString()
  updatePips(missilePips, missileAmmo, 'on')
  updatePips(flarePips, flareAmmo, 'flare-on')
  updateMobileAmmo()

  // 近くの敵ミサイルを除去
  for (let i = enemyMissiles.length - 1; i >= 0; i--) {
    scene.remove(enemyMissiles[i].mesh); enemyMissiles.splice(i, 1)
  }
  updateHPDisplay()
}

// ===== 宇宙MAP専用：ハザード・ゲート判定 =====
function updateSpaceHazards(_dt: number) {
  if (currentMap !== 'space') return
  // 小惑星との衝突判定（押し戻しのみ、ダメージなし）
  for (const hazard of spaceHazards) {
    const dist = player.position.distanceTo(hazard.pos)
    const limit = hazard.radius + 8
    if (dist >= limit) continue

    // 小惑星から押し戻す（他のMAPの地形と同じ挙動）
    const away = player.position.clone().sub(hazard.pos)
    if (away.lengthSq() < 0.001) away.set(0, 1, 0)
    away.normalize()
    player.position.addScaledVector(away, (limit - dist) * 0.6 + 3)
    speed *= 0.85  // 速度も減衰
    break  // 1フレームに1つの小惑星のみ処理
  }
}

// MAP境界の透明度を更新（近づくとフェードイン）
// MAP境界の透明度を更新（全MAP共通）
function updateMapBoundary() {
  if (!mapBoundaryMesh) return

  const bounds = MAP_BOUNDS[currentMap]
  const config = GRID_CONFIG[currentMap]
  const pos = player.position

  // 各面からの距離を計算
  const distToEdges = [
    bounds.maxX - pos.x,  // 右
    pos.x - bounds.minX,  // 左
    bounds.maxZ - pos.z,  // 前
    pos.z - bounds.minZ   // 後
  ]

  // 宇宙MAPは上下の面も考慮
  if (currentMap === 'space') {
    distToEdges.push(500 - pos.y)    // 上
    distToEdges.push(pos.y - (-400)) // 下
  }

  const minDistToEdge = Math.min(...distToEdges)

  // フェードイン処理
  const fadeStartDist = config.fadeInDistance
  const fadeEndDist = config.fadeEndDistance

  let opacity = 0
  if (minDistToEdge > fadeStartDist) {
    opacity = 0  // 遠すぎる：見えない
  } else if (minDistToEdge < fadeEndDist) {
    opacity = config.opacity  // 境界近く：最大透明度
  } else {
    // フェードイン範囲
    const t = 1 - (minDistToEdge - fadeEndDist) / (fadeStartDist - fadeEndDist)
    opacity = t * config.opacity
  }

  const material = mapBoundaryMesh.material as THREE.LineBasicMaterial
  material.opacity = opacity
}


// ===== SUPPLY POINTS =====
let supplyIndicatorTimer = 0

function updateSupplyPoints(dt: number) {
  for (let i = 0; i < supplyMeshes.length; i++) {
    supplyMeshes[i].rotation.y += dt * 1.2
    supplyCooldowns[i] = Math.max(0, supplyCooldowns[i] - dt)

    const dist = player.position.distanceTo(SUPPLY_POSITIONS[i])
    if (dist < 38 && supplyCooldowns[i] <= 0) {
      const prevMsl = missileAmmo, prevFlr = flareAmmo, prevHP = playerHP
      missileAmmo = 6  // 全回復
      flareAmmo   = 3  // 全回復
      playerHP    = MAX_HP
      if (missileAmmo !== prevMsl || flareAmmo !== prevFlr || playerHP !== prevHP) {
        missileEl.textContent = missileAmmo.toString()
        flareEl.textContent   = flareAmmo.toString()
        updatePips(missilePips, missileAmmo, 'on')
        updatePips(flarePips,   flareAmmo,   'flare-on')
        updateMobileAmmo()  // スマホ版ボタン内の残量更新
        updateHPDisplay()  // HP表示を更新
        supplyCooldowns[i] = 20
        supplyIndicatorTimer = 1.8
      }
    }
  }
  supplyIndicatorTimer = Math.max(0, supplyIndicatorTimer - dt)
  supplyIndicator.style.display = supplyIndicatorTimer > 0 ? 'block' : 'none'
}

// ===== GUN LEAD INDICATOR =====
function updateGunLeadIndicator() {
  if (!gunLeadReticleEl) return

  if (gunLeadPosition && gunFireTime > 1.0) {
    // 3D位置をスクリーン座標に変換
    const screenPos = gunLeadPosition.clone().project(camera)
    const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth
    const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight

    // 画面内にあるか確認
    if (screenPos.z < 1 && x > 0 && x < window.innerWidth && y > 0 && y < window.innerHeight) {
      gunLeadReticleEl.style.display = 'block'
      gunLeadReticleEl.style.left = `${x}px`
      gunLeadReticleEl.style.top = `${y}px`
    } else {
      gunLeadReticleEl.style.display = 'none'
    }
  } else {
    gunLeadReticleEl.style.display = 'none'
  }
}

// ===== HUD更新関数 =====
function syncFlightReadouts() {
  speedEl.textContent = Math.round(speed * 3.6).toString()
  altEl.textContent = Math.round(player.position.y).toString()
}

// ===== SPACE NAVIGATION HUD更新 =====
function updateSpaceNavigationHUD() {
  if (currentMap !== 'space' || spaceZones.length === 0) {
    landmarksHudEl.style.display = 'none'
    return
  }

  landmarksHudEl.style.display = 'block'

  // プレイヤー位置から各ゾーンまでの距離を計算
  const distancesWithZones = spaceZones.map(zone => {
    const zonePos = new THREE.Vector3(zone.position.x, zone.position.y, zone.position.z)
    const distance = player.position.distanceTo(zonePos)
    return { zone, distance }
  })

  // 距離でソート（近い順）
  distancesWithZones.sort((a, b) => a.distance - b.distance)

  // 最も近い3つを表示
  const nearest = distancesWithZones.slice(0, 3)
  let html = nearest.map(({ zone, distance }) => {
    const distKm = (distance / 1000).toFixed(1)
    return `<div class="lm-item">${zone.name} ${distKm}km</div>`
  }).join('')

  // 推奨ルート表示（最寄りゾーンからの推奨ルート）
  if (spaceNavigationRoutes.length > 0 && nearest.length > 0) {
    const currentZoneId = nearest[0].zone.zone_id
    const recommendedRoute = spaceNavigationRoutes.find(r => r.from === currentZoneId)
    if (recommendedRoute) {
      const toZone = spaceZones.find(z => z.zone_id === recommendedRoute.to)
      if (toZone) {
        html += `<div class="lm-item" style="color: #88ddff; font-size: 0.9em;">→ ${toZone.name}</div>`
      }
    }
  }

  landmarkListEl.innerHTML = html
}

// ビーコンの可視性とフェード処理
function updateSpaceBeacons() {
  if (currentMap !== 'space') return

  spaceBeacons.forEach((beacon, index) => {
    if (index >= spaceZones.length) return
    const zone = spaceZones[index]
    const zonePos = new THREE.Vector3(zone.position.x, zone.position.y, zone.position.z)
    const distance = player.position.distanceTo(zonePos)

    // 1000-3000mの範囲で表示、距離に応じてフェード
    let opacity = 0
    if (distance > 1000 && distance < 3000) {
      // 1000mで0、1500mで1.0、2500mで1.0、3000mで0
      if (distance < 1500) {
        opacity = (distance - 1000) / 500
      } else if (distance < 2500) {
        opacity = 1.0
      } else {
        opacity = (3000 - distance) / 500
      }
    }

    beacon.visible = opacity > 0
    beacon.traverse(child => {
      if (child instanceof THREE.Points || child instanceof THREE.Mesh) {
        const mat = child.material as THREE.PointsMaterial | THREE.MeshBasicMaterial
        mat.opacity = opacity * 0.8
      }
    })

    // ビーコンをプレイヤー方向に向ける（常に見やすいように）
    beacon.lookAt(player.position)
  })
}

// ゾーン接近ラベルの更新
const zoneLabelElements: Map<string, HTMLDivElement> = new Map()

function updateZoneProximityLabels() {
  if (currentMap !== 'space') {
    // 全ラベルを削除
    zoneLabelElements.forEach(el => el.remove())
    zoneLabelElements.clear()
    return
  }

  const activeZones = new Set<string>()

  spaceZones.forEach(zone => {
    const zonePos = new THREE.Vector3(zone.position.x, zone.position.y, zone.position.z)
    const distance = player.position.distanceTo(zonePos)

    // 500m以内で表示
    if (distance < 500) {
      activeZones.add(zone.zone_id)

      // ラベル要素を取得または作成
      let labelEl = zoneLabelElements.get(zone.zone_id)
      if (!labelEl) {
        labelEl = document.createElement('div')
        labelEl.className = 'zone-label'
        document.body.appendChild(labelEl)
        zoneLabelElements.set(zone.zone_id, labelEl)
      }

      // 3D座標をスクリーン座標に変換
      const screenPos = zonePos.clone().project(camera)
      const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth
      const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight

      // ラベルテキストと位置を更新
      labelEl.textContent = zone.name
      labelEl.style.left = `${x}px`
      labelEl.style.top = `${y}px`
      labelEl.style.transform = 'translate(-50%, -50%)'

      // 距離に応じた不透明度（500mで0、300mで1）
      const opacity = distance < 300 ? 1.0 : (500 - distance) / 200
      labelEl.style.opacity = opacity.toString()
    }
  })

  // 範囲外のラベルを削除
  zoneLabelElements.forEach((el, zoneId) => {
    if (!activeZones.has(zoneId)) {
      el.remove()
      zoneLabelElements.delete(zoneId)
    }
  })
}

// ===== RADAR =====
const RADAR_RANGE = 900
const RADAR_R = 70

function drawRadar() {
  const ctx = radarCtx
  const cx = 80, cy = 80

  ctx.clearRect(0, 0, 160, 160)

  // 背景円
  ctx.fillStyle = 'rgba(0,15,8,0.75)'
  ctx.beginPath(); ctx.arc(cx, cy, RADAR_R, 0, Math.PI * 2); ctx.fill()

  // グリッド
  ctx.strokeStyle = 'rgba(0,200,80,0.18)'
  ctx.lineWidth = 0.5
  for (const r of [0.35, 0.67, 1.0]) {
    ctx.beginPath(); ctx.arc(cx, cy, RADAR_R * r, 0, Math.PI * 2); ctx.stroke()
  }

  // 十字線
  ctx.strokeStyle = 'rgba(0,200,80,0.12)'
  ctx.lineWidth = 0.5
  ctx.beginPath(); ctx.moveTo(cx - RADAR_R, cy); ctx.lineTo(cx + RADAR_R, cy); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx, cy - RADAR_R); ctx.lineTo(cx, cy + RADAR_R); ctx.stroke()

  // プレイヤーの向きに基づく回転角（XZ平面）
  const fwd = _fwd.clone().applyQuaternion(player.quaternion)
  const heading = Math.atan2(fwd.x, fwd.z)

  function worldToRadar(pos: THREE.Vector3): [number, number] {
    const rel = pos.clone().sub(player.position)
    const rx = rel.x * Math.cos(heading) - rel.z * Math.sin(heading)
    const rz = rel.x * Math.sin(heading) + rel.z * Math.cos(heading)
    const scale = Math.min(1, Math.hypot(rx, rz) / RADAR_RANGE)
    const norm = Math.hypot(rx, rz) > 0.01 ? Math.hypot(rx, rz) : 1
    return [cx - (rx / norm) * scale * RADAR_R, cy - (rz / norm) * scale * RADAR_R]
  }

  // 補給ポイント（緑菱形）- 常に表示、範囲外は縁に表示
  for (const sp of SUPPLY_POSITIONS) {
    const dist = sp.distanceTo(player.position)
    const [px, py] = worldToRadar(sp)

    // 範囲外の場合はレーダー縁にクリップ
    const dx = px - cx
    const dy = py - cy
    const len = Math.hypot(dx, dy)
    const finalPx = len > RADAR_R ? cx + (dx / len) * RADAR_R : px
    const finalPy = len > RADAR_R ? cy + (dy / len) * RADAR_R : py

    // 発光効果付き緑菱形
    ctx.fillStyle = dist < RADAR_RANGE ? '#0fa' : '#0a8'
    ctx.shadowColor = '#0fa'
    ctx.shadowBlur = 4
    ctx.beginPath()
    ctx.moveTo(finalPx, finalPy - 5)
    ctx.lineTo(finalPx + 4, finalPy)
    ctx.lineTo(finalPx, finalPy + 5)
    ctx.lineTo(finalPx - 4, finalPy)
    ctx.closePath()
    ctx.fill()
    ctx.shadowBlur = 0
  }

  // 味方（青丸）
  for (const a of allies) {
    if (a.group.position.distanceTo(player.position) > RADAR_RANGE * 1.2) continue
    const [px, py] = worldToRadar(a.group.position)
    ctx.fillStyle = '#44aaff'
    ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill()
  }

  // 敵（赤丸、ロック中は黄色）
  for (const e of enemies) {
    if (e.group.position.distanceTo(player.position) > RADAR_RANGE * 1.2) continue
    const [px, py] = worldToRadar(e.group.position)
    ctx.fillStyle = e === lockedTarget ? '#ff0' : (e.seekingSupply ? '#f80' : '#f44')
    ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill()
  }

  // 地上目標（総力戦モード時: 橙の四角）
  if (currentMode === 'souryokusen') {
    for (const gt of groundTargets) {
      if (gt.group.position.distanceTo(player.position) > RADAR_RANGE * 1.2) continue
      const [px, py] = worldToRadar(gt.group.position)
      const col = gt.type === 'ship' ? '#f84' : gt.type === 'heli' ? '#fa0' : '#f62'
      ctx.fillStyle = col
      ctx.fillRect(px - 3, py - 3, 6, 6)
    }
  }

  // 敵ミサイル（オレンジ三角）
  for (const m of enemyMissiles) {
    if (m.mesh.position.distanceTo(player.position) > RADAR_RANGE) continue
    const [px, py] = worldToRadar(m.mesh.position)
    ctx.fillStyle = '#f80'
    ctx.beginPath(); ctx.moveTo(px, py-3); ctx.lineTo(px+2.5, py+2); ctx.lineTo(px-2.5, py+2); ctx.closePath(); ctx.fill()
  }

  // 宇宙MAP：垂直キュー表示（ゾーンと補給ポイント）
  if (currentMap === 'space') {
    for (const zone of spaceZones) {
      const zonePos = new THREE.Vector3(zone.position.x, zone.position.y, zone.position.z)
      const hdist = Math.sqrt((zone.position.x - player.position.x) ** 2 + (zone.position.z - player.position.z) ** 2)
      if (hdist < RADAR_RANGE) {
        const [px, py] = worldToRadar(zonePos)
        const vdiff = zone.position.y - player.position.y
        const zoneColor = ZONE_COLORS[zone.zone_id] || 0xffffff
        const r = (zoneColor >> 16) & 0xff
        const g = (zoneColor >> 8) & 0xff
        const b = zoneColor & 0xff
        ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`
        ctx.lineWidth = 1.2
        ctx.setLineDash([2, 2])
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.stroke()
        ctx.setLineDash([])
        if (Math.abs(vdiff) > 15) {
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
          ctx.font = 'bold 9px monospace'
          ctx.textAlign = 'center'
          ctx.fillText(vdiff > 0 ? '↑' : '↓', px, py + 3)
        }
      }
    }
  }

  // 自機（水色矢印）
  ctx.fillStyle = '#4cf'
  ctx.beginPath(); ctx.moveTo(cx, cy-6); ctx.lineTo(cx+4, cy+4); ctx.lineTo(cx, cy+1); ctx.lineTo(cx-4, cy+4); ctx.closePath(); ctx.fill()

  // 境界円
  ctx.strokeStyle = 'rgba(0,200,80,0.45)'
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.arc(cx, cy, RADAR_R, 0, Math.PI * 2); ctx.stroke()
}

// ===== GAME LOOP =====
let last = performance.now()
function loop() {
  requestAnimationFrame(loop)
  const now = performance.now()
  const dt = Math.min((now - last) / 1000, 0.05)
  last = now

  // === PAUSE CHECK ===
  if (isPaused) {
    // ポーズ中はレンダリングのみ実行
    if (composer) composer.render()
    else renderer.render(scene, camera)
    return
  }

  // === SPEED CONTROL ===
  if (keysJustPressed.has('Space')) {
    const now2 = performance.now()
    decelerateMode = (now2 - lastSpaceTime < 400) ? !decelerateMode : false
    lastSpaceTime = now2
  }
  const brake = touchState.brake || decelerateMode
  const boost = (!!keys['Space'] || touchState.boost) && !brake
  const boostTarget = brake ? 50 : (boost ? 550 : wheelSpeedTarget)  // 減速50m/s、ブースト550m/s（1,980km/h）
  speed += (boostTarget - speed) * dt * 2.2
  if (!boost && !decelerateMode) wheelSpeedTarget += (150 - wheelSpeedTarget) * dt * 0.4  // 巡航速度150に自動復帰

  // === MOUSE HOLD TIMER ===
  if (mouseState.leftDown) mouseState.leftHoldTime += dt

  // === FLARE BURST TIMER ===
  if (flareBurstLeft > 0) {
    flareBurstTimer -= dt
    if (flareBurstTimer <= 0) { _dropSingleFlare(); flareBurstLeft--; flareBurstTimer = 0.18 }
  }

  // === FLIGHT INPUT ===
  const DEAD = 0.04
  const rawMX = Math.abs(mouseState.nx) > DEAD ? mouseState.nx : 0
  const rawMY = Math.abs(mouseState.ny) > DEAD ? mouseState.ny : 0
  const mousePitch = Math.sign(rawMY) * rawMY * rawMY * 1.4
  const mouseYaw   = Math.sign(rawMX) * rawMX * rawMX * 1.1
  const keyPitch = (keys['KeyS'] || keys['ArrowDown']  ? 1 : 0) - (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0)
  const keyYaw   = (keys['ArrowRight'] ? 1 : 0) - (keys['ArrowLeft'] ? 1 : 0)
  const tPitch = Math.abs(touchState.pitch) > 0.08 ? touchState.pitch : 0
  const tYaw   = Math.abs(touchState.yaw)   > 0.08 ? touchState.yaw   : 0
  const pitchInput = keyPitch !== 0 ? keyPitch : (tPitch !== 0 ? tPitch : mousePitch)
  const yawInput   = keyYaw   !== 0 ? keyYaw   : (tYaw   !== 0 ? tYaw   : mouseYaw)

  // === FLIGHT PHYSICS ===
  if (pitchInput !== 0)
    player.quaternion.multiply(_sq1.setFromAxisAngle(_sv1.set(1, 0, 0), pitchInput * 1.9 * dt))
  if (yawInput !== 0) {
    const localUp = _sv2.set(0, 1, 0).applyQuaternion(player.quaternion)
    player.quaternion.premultiply(_sq1.setFromAxisAngle(localUp, -yawInput * 1.5 * dt))
  }

  // フライトモードに応じた処理
  if (flightMode === 'realistic') {
    const targetBankZ = -yawInput * 0.72
    const fwdAxis = _fwd.clone().applyQuaternion(player.quaternion)
    player.quaternion.multiply(_sq1.setFromAxisAngle(fwdAxis, targetBankZ * dt * 5))
  }

  // バレルロール機動
  if (barrelRollState.active) {
    barrelRollState.progress += dt / barrelRollState.duration
    if (barrelRollState.progress >= 1) {
      barrelRollState.active = false
      barrelRollState.progress = 0
    } else {
      const rollSpeed = (Math.PI * 2) / barrelRollState.duration  // 360度/秒
      const rollAngle = barrelRollState.direction * rollSpeed * dt

      // 機体自身の前方軸（ローカルZ軸）を回転軸として使用
      // Quaternionを使って機体ローカル座標系でロール回転
      const localRollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), rollAngle)
      player.quaternion.multiply(localRollQuat)

      // 機体が傾くことによる横方向への移動（揚力効果）
      // 現在の機体の横軸方向に移動
      const lateralForce = new THREE.Vector3(1, 0, 0).applyQuaternion(player.quaternion)
      const lateralSpeed = speed * 0.3  // 前進速度の30%で横移動
      player.position.add(lateralForce.multiplyScalar(barrelRollState.direction * lateralSpeed * dt))
    }
  }

  // 自動水平復帰（ロールのみ・ピッチは補正しない）- 宇宙MAP以外のみ
  if (currentMap !== 'space' && Math.abs(yawInput) < 0.05) {
    _sEuler.setFromQuaternion(player.quaternion, 'YXZ')
    _sEuler.z *= Math.exp(-dt * 3.5)
    player.quaternion.setFromEuler(_sEuler)
  }
  player.quaternion.normalize()

  // 移動前の位置を保存
  const prevPos = player.position.clone()
  // 常に機体の現在姿勢に基づいて前進（バレルロール中も同様）
  const moveVec = _fwd.clone().applyQuaternion(player.quaternion).multiplyScalar(speed * dt)
  const newPos = prevPos.clone().add(moveVec)

  // 宇宙MAPでは地形衝突判定をスキップ
  // MAP境界の更新（全MAP共通）
  updateMapBoundary()

  // MAP境界制限（全MAP共通：プレイヤーが戦闘エリアから出られない）
  const bounds = MAP_BOUNDS[currentMap]
  if (player.position.x < bounds.minX) player.position.x = bounds.minX
  if (player.position.x > bounds.maxX) player.position.x = bounds.maxX
  if (player.position.z < bounds.minZ) player.position.z = bounds.minZ
  if (player.position.z > bounds.maxZ) player.position.z = bounds.maxZ

  // 宇宙MAPは上下の境界も制限
  if (currentMap === 'space') {
    if (player.position.y < -400) player.position.y = -400
    if (player.position.y > 500) player.position.y = 500
  }

  if (currentMap === 'space') {
    player.position.copy(newPos)
    updateSpaceHazards(dt)

    // ゾーン進入検出
    if (spaceZones.length > 0) {
      let nearestZone: string | null = null
      let minDist = Infinity
      for (const zone of spaceZones) {
        const dist = player.position.distanceTo(new THREE.Vector3(zone.position.x, zone.position.y, zone.position.z))
        if (dist < 400 && dist < minDist) {  // 400m以内
          minDist = dist
          nearestZone = zone.zone_id
        }
      }
      if (nearestZone !== currentZone) {
        currentZone = nearestZone
        zoneDisplayTimer = 3  // 3秒表示
      }
    }
    zoneDisplayTimer = Math.max(0, zoneDisplayTimer - dt)
  } else {
    // 移動先の地形高度チェック（水平方向の衝突判定）
    const newTerrainHeight = terrainH(newPos.x, newPos.z) + 10

    // 移動先が地形より低い場合は、地形に沿って移動
    if (newPos.y < newTerrainHeight) {
      // 地形に衝突する場合
      const oldTerrainHeight = terrainH(prevPos.x, prevPos.z) + 10

      // 現在位置も地形より低い場合は、地形上に押し出す
      if (prevPos.y < oldTerrainHeight) {
        player.position.set(prevPos.x, oldTerrainHeight, prevPos.z)
      } else {
        // 衝突を避けるため、移動を制限（地形に沿ってスライド）
        const slidePos = prevPos.clone()
        slidePos.x = newPos.x
        slidePos.z = newPos.z
        const slideTerrainHeight = terrainH(slidePos.x, slidePos.z) + 10

        if (slidePos.y >= slideTerrainHeight) {
          // 水平方向のみ移動可能
          player.position.copy(slidePos)
        } else {
          // 移動不可、現在位置を維持
          player.position.copy(prevPos)
        }
      }

      // 地形衝突時は視覚フィードバックのみ（リスポーンなし）
      hitFlashTimer = 0.3
    } else {
      // 通常移動
      player.position.copy(newPos)

      // 移動後の高度チェック（下方への衝突）
      const minAltitude = terrainH(player.position.x, player.position.z) + 10
      if (player.position.y < minAltitude) {
        player.position.y = minAltitude
        // 地形衝突時は視覚フィードバックのみ
        hitFlashTimer = 0.3
      }
    }
  }

  enforceMapBounds()

  // 衝突判定：構造物との衝突（建物、地上目標）
  const collisionRadius = 8  // プレイヤーの衝突半径

  // 東京MAPの建物・ランドマークとの衝突
  if (currentMap === 'tokyo' && neoTokyoMapSystem) {
    let insideTube = false
    let insideTubeClearance = -Infinity
    let tubeHit: {
      x: number
      y: number
      z: number
      targetRadius: number
      radial: number
      px: number
      py: number
      pz: number
    } | null = null
    const nearTubeOpening = neoTokyoMapSystem.getTubeOpenings().some(opening => {
      const ox = player.position.x - opening.x
      const oy = player.position.y - opening.y
      const oz = player.position.z - opening.z
      return Math.sqrt(ox * ox + oy * oy + oz * oz) < opening.radius
    })

    const tubeSweepSteps = Math.max(1, Math.ceil(prevPos.distanceTo(player.position) / 42))
    for (const tube of neoTokyoMapSystem.getTubeCorridors()) {
      const dx = tube.x2 - tube.x1
      const dy = (tube.y2 ?? tube.y) - tube.y
      const dz = tube.z2 - tube.z1
      const lenSq = dx * dx + dy * dy + dz * dz
      if (lenSq <= 0.0001) continue

      for (let sweep = 1; sweep <= tubeSweepSteps; sweep++) {
        const sweepT = sweep / tubeSweepSteps
        const sx = prevPos.x + (player.position.x - prevPos.x) * sweepT
        const sy = prevPos.y + (player.position.y - prevPos.y) * sweepT
        const sz = prevPos.z + (player.position.z - prevPos.z) * sweepT
        const t = Math.max(0, Math.min(1, ((sx - tube.x1) * dx + (sy - tube.y) * dy + (sz - tube.z1) * dz) / lenSq))
        const along = Math.sqrt(lenSq) * t
        const inEntrySlot = along % tube.entrySpacing < tube.entryLength
        const cx = tube.x1 + dx * t
        const cy = tube.y + dy * t
        const cz = tube.z1 + dz * t
        const px = sx - cx
        const py = sy - cy
        const pz = sz - cz
        const radial = Math.sqrt(px * px + py * py + pz * pz)

        if (radial < tube.innerRadius - collisionRadius) {
          insideTube = true
          insideTubeClearance = Math.max(insideTubeClearance, tube.innerRadius - collisionRadius - radial)
        }

        if (!inEntrySlot && !nearTubeOpening && radial > tube.innerRadius - collisionRadius && radial < tube.outerRadius + collisionRadius) {
          const targetRadius = radial < (tube.innerRadius + tube.outerRadius) / 2
            ? tube.innerRadius - collisionRadius
            : tube.outerRadius + collisionRadius
          const penetration = Math.abs(radial - targetRadius)
          if (!tubeHit || penetration < Math.abs(tubeHit.radial - tubeHit.targetRadius)) {
            tubeHit = { x: cx, y: cy, z: cz, targetRadius, radial, px, py, pz }
          }
        }
      }
    }

    for (const tube of neoTokyoMapSystem.getRingTubeCorridors()) {
      const dx = player.position.x - tube.x
      const dz = player.position.z - tube.z
      const horizontalRadius = Math.sqrt(dx * dx + dz * dz)
      let angle = Math.atan2(dz, dx)
      if (angle < 0) angle += Math.PI * 2
      const inEntrySlot = angle % tube.entryAngleSpacing < tube.entryAngle
      const radial = Math.sqrt((horizontalRadius - tube.radius) ** 2 + (player.position.y - tube.y) ** 2)

      if (radial < tube.innerRadius - collisionRadius) {
        insideTube = true
        insideTubeClearance = Math.max(insideTubeClearance, tube.innerRadius - collisionRadius - radial)
      }

      if (!inEntrySlot && !nearTubeOpening && radial > tube.innerRadius - collisionRadius && radial < tube.outerRadius + collisionRadius) {
        const targetRadius = radial < (tube.innerRadius + tube.outerRadius) / 2
          ? tube.innerRadius - collisionRadius
          : tube.outerRadius + collisionRadius
        const invHorizontal = horizontalRadius > 0.001 ? 1 / horizontalRadius : 0
        const cx = tube.x + dx * invHorizontal * tube.radius
        const cz = tube.z + dz * invHorizontal * tube.radius
        const px = player.position.x - cx
        const py = player.position.y - tube.y
        const pz = player.position.z - cz
        const penetration = Math.abs(radial - targetRadius)
        if (!tubeHit || penetration < Math.abs(tubeHit.radial - tubeHit.targetRadius)) {
          tubeHit = { x: cx, y: tube.y, z: cz, targetRadius, radial, px, py, pz }
        }
      }
    }

    if (!nearTubeOpening && tubeHit && insideTubeClearance < 24) {
      const inv = tubeHit.radial > 0.001 ? 1 / tubeHit.radial : 0
      player.position.x = tubeHit.x + tubeHit.px * inv * tubeHit.targetRadius
      player.position.y = tubeHit.y + tubeHit.py * inv * tubeHit.targetRadius
      player.position.z = tubeHit.z + tubeHit.pz * inv * tubeHit.targetRadius
      hitFlashTimer = 0.3
      camShakeAmt = Math.max(camShakeAmt, 0.5)
    }

    const collisionObjects = neoTokyoMapSystem.getCollisionObjects()
    if (!insideTube && !nearTubeOpening) {
      for (const obj of collisionObjects) {
        const box = new THREE.Box3().setFromObject(obj)
        if (box.isEmpty()) continue
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())

        const dx = player.position.x - center.x
        const dy = player.position.y - center.y
        const dz = player.position.z - center.z
        const distXZ = Math.sqrt(dx * dx + dz * dz)

        if (distXZ < collisionRadius + size.x / 2 && Math.abs(dy) < size.y / 2) {
          const pushDir = new THREE.Vector3(dx, 0, dz).normalize()
          player.position.x = center.x + pushDir.x * (collisionRadius + size.x / 2)
          player.position.z = center.z + pushDir.z * (collisionRadius + size.z / 2)
          // 衝突時は視覚フィードバックのみ
          hitFlashTimer = 0.3
          camShakeAmt = Math.max(camShakeAmt, 0.5)
          break
        }
      }
    }
  }

  // オリジナルMAPの建物との衝突
  if (currentMap === 'original') {
    for (const obj of tokyoObjects) {
      const dx = player.position.x - obj.position.x
      const dz = player.position.z - obj.position.z
      const distXZ = Math.sqrt(dx * dx + dz * dz)

      if (distXZ < collisionRadius + 15) {
        const buildingHeight = obj.scale.y * 40
        if (player.position.y < obj.position.y + buildingHeight) {
          const pushDir = new THREE.Vector3(dx, 0, dz).normalize()
          player.position.x = obj.position.x + pushDir.x * (collisionRadius + 15)
          player.position.z = obj.position.z + pushDir.z * (collisionRadius + 15)
          // 衝突時は視覚フィードバックのみ
          hitFlashTimer = 0.3
          camShakeAmt = Math.max(camShakeAmt, 0.5)
        }
      }
    }
  }

  // 地上目標（戦車、建物、艦船など）との衝突
  for (const gt of groundTargets) {
    const dx = player.position.x - gt.group.position.x
    const dz = player.position.z - gt.group.position.z
    const distXZ = Math.sqrt(dx * dx + dz * dz)

    if (distXZ < collisionRadius + 12 && player.position.y < gt.group.position.y + 25) {
      const pushDir = new THREE.Vector3(dx, 0, dz).normalize()
      player.position.x = gt.group.position.x + pushDir.x * (collisionRadius + 12)
      player.position.z = gt.group.position.z + pushDir.z * (collisionRadius + 12)
      player.position.y = Math.max(player.position.y, gt.group.position.y + 25)
      // 衝突時は視覚フィードバックのみ
      hitFlashTimer = 0.3
      camShakeAmt = Math.max(camShakeAmt, 0.5)
    }
  }

  // 宇宙MAPの小惑星・ゾーン構造物との衝突
  if (currentMap === 'space') {
    const adjustedCollisionRadius = collisionRadius * 0.5 // 8m -> 4m（より厳密に）

    // InstancedMeshの小惑星との衝突判定（レイキャスト）
    if (spaceAsteroids && spaceAsteroids.count > 0) {
      const raycaster = new THREE.Raycaster()
      const moveDir = player.position.clone().sub(prevPos).normalize()
      const moveDist = player.position.distanceTo(prevPos)
      if (moveDist > 0.1) {
        raycaster.set(prevPos, moveDir)
        raycaster.far = moveDist + adjustedCollisionRadius
        const hits = raycaster.intersectObject(spaceAsteroids, false)
        if (hits.length > 0 && hits[0].distance < moveDist + adjustedCollisionRadius * 0.8) {
          player.position.copy(prevPos)
          hitFlashTimer = 0.3
          camShakeAmt = Math.max(camShakeAmt, 0.6)
        }
      }
    }

    // 個別小惑星との衝突判定（ゾーン周辺）
    for (const asteroid of spaceIndividualAsteroids) {
      const dist = player.position.distanceTo(asteroid.position)
      // ジオメトリ半径1に対してスケールをかけるが、衝突判定は0.7倍に縮小
      const asteroidRadius = Math.max(asteroid.scale.x, asteroid.scale.y, asteroid.scale.z) * 0.35
      if (dist < adjustedCollisionRadius + asteroidRadius) {
        // 衝突：押し出し
        const pushDir = player.position.clone().sub(asteroid.position).normalize()
        if (pushDir.length() < 0.1) pushDir.set(0, 1, 0)
        player.position.copy(asteroid.position).add(pushDir.multiplyScalar(adjustedCollisionRadius + asteroidRadius + 2))
        hitFlashTimer = 0.3
        camShakeAmt = Math.max(camShakeAmt, 0.6)
        break
      }
    }

    // ゾーン構造物との衝突判定（レイキャスト）
    // 見えるものは物理的に存在する（他MAPと同じ思想）
    if (spaceZoneGroups.length > 0) {
      const raycaster = new THREE.Raycaster()
      const moveDir = player.position.clone().sub(prevPos).normalize()
      const moveDist = player.position.distanceTo(prevPos)
      if (moveDist > 0.1) {
        raycaster.set(prevPos, moveDir)
        raycaster.far = moveDist + adjustedCollisionRadius
        for (const zoneGroup of spaceZoneGroups) {
          const hits = raycaster.intersectObject(zoneGroup, true)  // recursive
          if (hits.length > 0 && hits[0].distance < moveDist + adjustedCollisionRadius) {
            player.position.copy(prevPos)
            hitFlashTimer = 0.3
            camShakeAmt = Math.max(camShakeAmt, 0.6)
            break
          }
        }
      }
    }
  }

  // Engine glow follows player
  engineLight.position.copy(player.position).add(new THREE.Vector3(0, 0, 2).applyQuaternion(player.quaternion))
  engineLight.intensity = boost ? 8 : 4

  gunCooldown = Math.max(0, gunCooldown - dt)
  pMissileCooldown = Math.max(0, pMissileCooldown - dt)
  flareCooldown = Math.max(0, flareCooldown - dt)
  gunSoundCooldown = Math.max(0, gunSoundCooldown - dt)

  if (currentMode !== null && !missionComplete) {
    if (keysJustPressed.has('Tab') || touchState.lockPressed) cycleLock()
    if (keysJustPressed.has('Escape')) lockedTarget = null
    if (keys['KeyZ'] || keys['KeyA'] || keys['KeyQ'] || touchState.gun) {
      fireGun()
      gunFireTime += dt  // 連続発射時間を累積
    } else {
      gunFireTime = 0  // 発射していない時はリセット
    }
    if (keysJustPressed.has('KeyX') || touchState.missilePressed) firePlayerMissile()
    if (keysJustPressed.has('KeyC') || touchState.flarePressed) triggerFlareBurst()
  }
  keysJustPressed.clear()
  touchState.missilePressed = false
  touchState.flarePressed   = false
  touchState.lockPressed    = false

  updateBullets(dt)
  updateMissileArr(playerMissiles, dt, m => createExplosion(m.mesh.position.clone(), 0.6), true)
  updateMissileArr(enemyMissiles, dt, m => createExplosion(m.mesh.position.clone(), 0.5), true)
  updateMissileArr(allyMissiles, dt, m => createExplosion(m.mesh.position.clone(), 0.6), true)
  updateFlares(dt)
  if (currentMode !== null && !missionComplete) {
    updateEnemies(dt)
    updateAllies(dt)
    checkCollisions()
    checkGroundTargetCollisions()
  }
  updateGroundTargets(dt)
  updateExplosions(dt)
  updateMissileTrails(dt)
  updateContrails()
  if (currentMode !== null) updateSupplyPoints(dt)

  // 宇宙MAPオブジェクトの回転アニメーション
  for (const obj of rotatingSpaceObjects) {
    obj.rotation.y += dt * 0.12
  }

  // HUD更新
  syncFlightReadouts()

  if (currentMode === 'dogfight') setObjective(`敵機を撃墜せよ — SCORE: ${score}`)
  if (currentMode === 'souryokusen') {
    if (currentMap === 'space') {
      setObjective(`宙域制圧作戦 — 敵艦隊を殲滅せよ ${modeObjectiveKilled} / ${modeObjectiveTotal} — SCORE: ${score}`)
    } else {
      setObjective(`地上目標を破壊 ${modeObjectiveKilled} / ${modeObjectiveTotal} — SCORE: ${score}`)
    }
  }

  // ── リスポーンカウントダウン ──────────────────────────
  if (respawnTimer > 0) {
    respawnTimer -= dt
    const remaining = Math.ceil(respawnTimer)
    const countEl = document.getElementById('respawn-count')
    if (countEl) countEl.textContent = String(Math.max(1, remaining))
    if (respawnTimer <= 0) {
      respawnTimer = 0
      const cd = document.getElementById('respawn-countdown')!
      const respawnOvr = document.getElementById('respawn-overlay')!
      cd.style.display = 'none'
      respawnOvr.style.opacity = '0'
      respawnPlayer()
    }
    requestAnimationFrame(loop); return  // 死亡中はゲームロジックをスキップ
  }

  // 無敵タイマー
  if (invincibleTimer > 0) {
    invincibleTimer -= dt
    // 無敵中は点滅
    player.visible = Math.floor(invincibleTimer * 8) % 2 === 0
  } else {
    player.visible = true
  }

  // リスポーン演出フラッシュ
  respawnFlash = Math.max(0, respawnFlash - dt * 1.5)
  respawnOverlay.style.opacity = respawnFlash.toString()

  // Camera – quaternion slerp でジンバルロック解消
  // 速度連動プルバック（高速時はカメラを遠ざける）
  // スマホではカメラを近づけて機体を見やすくする
  const isMobile = 'ontouchstart' in window
  const baseCamZ = isMobile ? 7 : 18  // スマホは7、PCは18（より近づけて機体を大きく表示）
  const speedPullback = isMobile ? 12 : 28  // スマホは速度による引きを半分以下に
  const targetCamZ = baseCamZ + (speed / 550) * speedPullback
  cameraOffset.z += (targetCamZ - cameraOffset.z) * dt * 3

  // 視点操作（タッチによるカメラ回転）
  const camYawOffset = touchState.cameraYaw * 25   // 左右視点
  const camPitchOffset = touchState.cameraPitch * 15  // 上下視点
  const viewOffset = cameraOffset.clone().add(new THREE.Vector3(camYawOffset, camPitchOffset, 0))

  // カメラシェイク
  camShakeAmt *= Math.exp(-dt * 8)
  const _sk = camShakeAmt
  const desiredCamPos = viewOffset.clone().applyQuaternion(player.quaternion)
    .add(player.position)
    .add(new THREE.Vector3((Math.random() - 0.5) * _sk, (Math.random() - 0.5) * _sk, 0))
  camera.position.lerp(desiredCamPos, 0.12)
  // バレルロール中はカメラを水平に保つ（機体のロールに追従しない）
  const playerUp = barrelRollState.active
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(0, 1, 0).applyQuaternion(player.quaternion)
  const lookM = new THREE.Matrix4().lookAt(camera.position, player.position, playerUp)
  const tQ = new THREE.Quaternion().setFromRotationMatrix(lookM)
  if (camQuat.dot(tQ) < 0) { tQ.x = -tQ.x; tQ.y = -tQ.y; tQ.z = -tQ.z; tQ.w = -tQ.w }
  camQuat.slerp(tQ, 0.12)
  camera.quaternion.copy(camQuat)

  // 速度によるFOV拡大（高速時の視野拡大）
  const targetFOV = 62 + (speed / 550) * 32 + (boost ? 8 : 0)  // 最高速時+40度まで拡大
  camera.fov += (targetFOV - camera.fov) * dt * 4
  camera.updateProjectionMatrix()
  centerXhairEl.style.display = (currentMode && !missionComplete) ? 'block' : 'none'

  if (audioReady) updateEngineSound(speed, boost)

  hitFlashTimer -= dt
  hitOverlay.style.opacity = hitFlashTimer > 0 ? (hitFlashTimer / 0.5).toString() : '0'

  speedEl.textContent = Math.round(speed * 3.6).toString()
  altEl.textContent = Math.round(player.position.y).toString()
  boostFill.style.width = `${Math.min(100, (speed / 550) * 100)}%`  // 最高速550m/sで100%
  updateReticle()
  updateWarning()
  updateBoundaryWarning(dt)
  drawEnemyBrackets()
  updateGunLeadIndicator()
  // レーダー描画を3フレームに1回に制限（パフォーマンス改善）
  if (++radarFrame % 3 === 0) drawRadar()

  // 宇宙MAPナビゲーション更新
  if (currentMap === 'space') {
    updateSpaceNavigationHUD()
    updateSpaceBeacons()
    updateZoneProximityLabels()
  }

  if (!isMobileDevice) waterUniforms.time.value += dt
  radarDishes.forEach(d => { d.rotation.y += dt * 0.65 })
  heliBlades.forEach(d => { d.rotation.y += dt * 18 })  // ローター高速回転
  updateSmoke(dt)

  // プレイヤー被弾時の煙トレイル
  if (playerHP < MAX_HP && currentMode !== null) {
    const smokeRate = (MAX_HP - playerHP) * 1.8
    if (Math.random() < dt * smokeRate) {
      const tailPos = player.position.clone()
        .addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(player.quaternion), 4)
      spawnSmoke(tailPos, 1.8, 0x222200)
    }
  }

  // ===== MULTIPLAYER =====
  if (mpClient?.connected) {
    mpClient.tick(dt)
    mpClient.sendState({
      pos: [player.position.x, player.position.y, player.position.z],
      quat: [player.quaternion.x, player.quaternion.y, player.quaternion.z, player.quaternion.w],
      spd: speed,
      hp: playerHP,
      score,
    }, dt)
  }

  // コレクティブルシステム更新
  collectibleSystem.update(dt)
  const collected = collectibleSystem.checkCollection(player.position)
  if (collected) {
    // TODO: サウンド・エフェクト追加
    if (import.meta.env.DEV) console.log(`✨ Collected: ${collected.id}`)
  }

  // Logsシステム更新
  const discoveredLog = checkLogDiscovery(player.position, logsData)
  if (discoveredLog) {
    discoverLog(discoveredLog.id, logsData)
    // ビジュアル更新（発見済みログは非表示）
    if (logsGroup) {
      logsGroup.children.forEach(child => {
        if (child.userData.logId === discoveredLog.id) {
          child.visible = false
        }
      })
    }
  }

  if (composer) {
    try { composer.render() }
    catch(e) { composer = null; renderer.render(scene, camera) }
  } else {
    renderer.render(scene, camera)
  }
}

// ===== 東京MAP初期化（デフォルトは無効、MAP選択から選べる） =====
// 初期状態ではオリジナルMAPなので何もしない
// ユーザーがMAP選択で東京を選んだ時にswitchMap()が呼ばれる

loop()
