import * as THREE from 'three'
import { Sky } from 'three/addons/objects/Sky.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { TokyoMapSystem } from './tokyoMapSystem'

// ===== VERSION =====
const VERSION = '3.3.5'
const APP_URL = 'https://cds-dev-dev.github.io/AirFighter/'
console.log(`%cAirFighter v${VERSION}`, 'font-size: 18px; font-weight: bold; color: #4af;')
console.log(`%c${APP_URL}`, 'font-size: 12px; color: #888;')

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
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setSize(initW, initH)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
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

const camera = new THREE.PerspectiveCamera(70, initW / initH, 0.1, 8000)

// ===== POST-PROCESSING =====
// ブルームは白飛びの原因になるため Phase 1 では無効化
// Phase 6 で選択的ブルームとして再導入予定
let composer: EffectComposer | null = null

// ===== SKY =====
const sky = new Sky()
sky.scale.setScalar(8000)
scene.add(sky)
const skyUniforms = sky.material.uniforms
// 午後3時頃の黄金時間帯に近い空（霞・大気散乱を強調）
skyUniforms['turbidity'].value = 3.0
skyUniforms['rayleigh'].value = 3.5
skyUniforms['mieCoefficient'].value = 0.005
skyUniforms['mieDirectionalG'].value = 0.94

const sunVec = new THREE.Vector3()
// 地平線から28°の低い太陽（ドラマチックな斜め光）
sunVec.setFromSphericalCoords(1, THREE.MathUtils.degToRad(62), THREE.MathUtils.degToRad(195))
skyUniforms['sunPosition'].value.copy(sunVec)

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
sun.shadow.mapSize.set(2048, 2048)
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
type GameMap = 'original' | 'tokyo'
let currentMap: GameMap = 'original' as GameMap  // デフォルトMAP
let tokyoMapSystem: TokyoMapSystem | null = null  // 東京MAPシステム
let terrainGLB: THREE.Group | null = null  // terrain.glbのシーン参照

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

// ガウシアン地形パッチ
function gauss2d(x: number, z: number, ax: number, az: number, rx: number, rz: number, ht: number): number {
  return ht * Math.exp(-((x-ax)*(x-ax))/(rx*rx) - ((z-az)*(z-az))/(rz*rz))
}

// ═══════════════════════════════════════════════════════
//  人設計地形 v3: 3倍縦方向スケール・劇的高低差
//
//  地理:
//    北  — 大山脈 (Peak A〜D, 900-1400m)
//    中央 — 孤立中央スパイア (~650m, ランドマーク)
//    中西 — メサ (平頂山, ~350m)
//    東  — 東部プラトー + 南北大峡谷 (~-300m)
//    西  — 断崖海岸 + 海食柱 → 孤島群
//    南  — 南山地 (350-650m) + 湾 + 半島
//    ※ 山は高く、谷は深く、30秒飛ぶたびに景観が変わる
// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
// 東京MAP専用システム（完全0ベース、OpenStreetMap参照）
// ═══════════════════════════════════════════════════════

// 東京MAP用の地形関数は削除 - TokyoMapSystemが完全に管理

// MAP別地形関数の切り替え
function terrainH(x: number, z: number): number {
  if (currentMap === 'tokyo') {
    // 東京MAPシステムを使用（完全独立）
    return tokyoMapSystem ? tokyoMapSystem.getTerrainHeight(x, z) : 0
  }
  // Original MAP
  // ── ベース: 平野部を広く確保（基地配置用）─────────────────
  // 中央〜東部に広大な平地（高度 50-80m）
  let h = 65
    + Math.sin(x * 0.00035 + 0.8) * 22
    + Math.sin(z * 0.00045 + 0.3) * 18
    + Math.sin((x - z) * 0.00028 + 1.1) * 15
    + Math.sin((x + z * 0.6) * 0.00018) * 12

  // ── 北部山脈 メインリッジ (z≈-1400) ──────────────────
  const mdt = (z + 1400) / 680
  h += Math.max(0, 1 - mdt * mdt) * (780 + Math.sin(x * 0.0022 + 0.7) * 215 + Math.sin(x * 0.006) * 115)

  // ── 主要峰 ───────────────────────────────────────────
  h += gauss2d(x, z,  200, -1820, 340, 360, 1150)  // Peak A 最高峰 (~1400m)
  h += gauss2d(x, z, -720, -1570, 310, 320, 1000)  // Peak B 北西峰 (~1200m)
  h += gauss2d(x, z,  980, -1350, 280, 295,  800)  // Peak C 北東峰 (~1000m)
  h += gauss2d(x, z,   60, -1060, 255, 245,  550)  // Peak D 前衛峰 (~700m)

  // ── 中央孤立スパイア（全方向から見えるランドマーク）────
  h += gauss2d(x, z,   80,  -30, 160, 160, 680)  // より高く（ランドマーク強調）

  // ── メサ（平頂山: 上部を 320m でクリップして平坦化）──
  h += Math.min(gauss2d(x, z, -480, 280, 280, 260, 420), 320)

  // ── 中央東部大平原（基地・戦闘エリア確保）────────────────
  const plainCX = 400, plainCZ = 200
  const plainDist = Math.hypot(x - plainCX, z - plainCZ)
  if (plainDist < 800) {
    const flatFactor = Math.cos((plainDist / 800) * Math.PI * 0.5)
    h *= (1 - flatFactor * 0.6)  // 平坦化
    h += 55 * flatFactor  // 基準高度に引き寄せる
  }

  // ── 中央北部高地 ────────────────────────────────────
  h += gauss2d(x, z, -180, -640, 900, 520, 380)
  h += gauss2d(x, z,  620, -520, 440, 400, 265)

  // ── 南部山地 ────────────────────────────────────────
  h += gauss2d(x, z, -720,  480, 520, 440, 340)   // 南西山地
  h += gauss2d(x, z,  380,  580, 360, 320, 235)   // 南東丘陵
  h += gauss2d(x, z, -160,  920, 320, 280, 190)   // 南部内陸丘

  // ── 東部プラトー ────────────────────────────────────
  h += gauss2d(x, z, 1100, -380, 680, 520, 235)

  // ── 北西高地 ────────────────────────────────────────
  h += gauss2d(x, z, -1080, -720, 480, 560, 270)

  // ── 南西丘陵 ────────────────────────────────────────
  h += gauss2d(x, z, -580, 720, 580, 490, 220)

  // ── 西部海食柱（断崖外の細い岩塔）────────────────────
  h += gauss2d(x, z, -1900,  200,  60,  55, 180)
  h += gauss2d(x, z, -1750, -100,  45,  40, 150)

  // ── 東西横断峡谷 (z≈-220、深さ ~350m) ──────────────
  const ewZ = -220 + Math.sin(x * 0.00085) * 150 + Math.sin(x * 0.0022 + 0.6) * 65
  const ewD = Math.abs(z - ewZ)
  const ewA = clamp01((x + 900) / 350) * clamp01((900 - x) / 350)
  h -= Math.exp(-(ewD / 80) * (ewD / 80)) * 440 * ewA
  h += Math.exp(-((ewD - 170) / 55) * ((ewD - 170) / 55)) * 110 * ewA  // 峡谷リム

  // ── 中央南北渓谷 (x≈-350、深さ ~280m) ──────────────
  const nsX = -350 + Math.sin(z * 0.0007) * 140 + Math.sin(z * 0.0019 + 1.2) * 55
  const nsD = Math.abs(x - nsX)
  const nsA = clamp01((z + 1100) / 400) * clamp01((1100 - z) / 400)
  h -= Math.exp(-(nsD / 70) * (nsD / 70)) * 300 * nsA

  // ── 東部大峡谷 (x≈920、深さ ~400m) ──────────────────
  const cxC = 920 + Math.sin(z * 0.0008) * 120 + Math.sin(z * 0.002 + 0.5) * 48
  const cxD = Math.abs(x - cxC)
  const cxA = clamp01((x - 350) / 320)
           * clamp01((z + 700) / 380)
           * clamp01(1 - (z - 700) / 380)
  const cxW = Math.max(0, cxD - 130)
  h -= Math.exp(-(cxW / 62) * (cxW / 62)) * 445 * cxA
  h += Math.exp(-((cxD - 205) / 65) * ((cxD - 205) / 65)) * 120 * cxA  // 峡谷リム

  // ── 斜行渓谷 SW→NE ──────────────────────────────────
  const diagT = ((x - z) + 400) / 160
  const diagA = clamp01((x + 700) / 500) * clamp01((300 - x) / 500)
             * clamp01((z - 100) / 300) * clamp01((900 - z) / 300)
  h -= Math.exp(-(diagT * diagT)) * 260 * diagA

  // ── 河川 (南北方向, x≈120) ───────────────────────────
  const rvX = 120 + Math.sin(z * 0.0009) * 175 + Math.sin(z * 0.0025 + 1) * 55
  const rvD = Math.abs(x - rvX)
  const rvA = clamp01((z + 1300) / 350) * clamp01(1 - (z - 1400) / 350)
  h -= Math.exp(-(rvD / 105) * (rvD / 105)) * 165 * rvA

  // ── 西部断崖・海岸 (x<-1100 で海へ急降下) ─────────────
  if (x < -1100) {
    const cliffX = -1650 + Math.sin(z * 0.0006) * 185 + Math.sin(z * 0.0018) * 65
    const dfc = -(x - cliffX)
    h -= clamp01(dfc / 360) * 720
  }

  // ── 南部湾（縮小：陸地を増やす）─────────────────────────
  const bayX = Math.exp(-(x / 420) * (x / 420))  // 幅を縮小
  const bayZ = clamp01((z - 900) / 280) * clamp01(1 - (z - 1500) / 280)  // 奥行きも縮小
  h -= bayX * bayZ * 180  // 深さも浅く

  // ── 南部半島 ────────────────────────────────────────
  const penX = Math.exp(-(x / 155) * (x / 155))
  const penZ = clamp01((z - 860) / 260) * clamp01(1 - (z - 1720) / 340)
  h += penX * penZ * 240

  // ── 西部孤島群 ───────────────────────────────────────
  h += gauss2d(x, z, -2180,  -150, 145, 130, 145)
  h += gauss2d(x, z, -2480,   320, 120, 108, 125)
  h += gauss2d(x, z, -2090,  -640,  95,  88, 115)
  h += gauss2d(x, z, -2700,   100, 100,  92,  75)

  // ── テクスチャノイズ ─────────────────────────────────
  h += (fbm(x * 0.006 + 5.1, z * 0.006 - 3.8, 4) - 0.5) * 105

  return h
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
  const terrainGeo = new THREE.PlaneGeometry(12000, 12000, 256, 256)
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
  const terrainGeo = new THREE.PlaneGeometry(9000, 9000, 128, 128)
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

// 初期化時の地形生成（東京MAP以外）
let ground: THREE.Mesh
if (currentMap === 'tokyo') {
  // 東京MAPの場合は空のプレースホルダー（TokyoMapSystemが後で生成）
  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ visible: false })
  )
} else {
  ground = generateTerrainMesh()
}
scene.add(ground)

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
    scene.remove(ground)
    terrainGLB = gltf.scene  // グローバル変数に保存
    scene.add(terrainGLB)
    console.log('[Terrain] GLB loaded — procedural terrain replaced')
  },
  undefined,
  (err) => {
    console.warn('[Terrain] GLB not found, using procedural fallback:', err)
  }
)

// ===== WATER =====
const waterUniforms = { time: { value: 0 }, sunDir: { value: sunVec.clone().normalize() } }
const waterMesh = new THREE.Mesh(
  (() => { const g = new THREE.PlaneGeometry(8000, 8000, 80, 80); g.rotateX(-Math.PI/2); return g })(),
  new THREE.ShaderMaterial({
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
  scene.add(body)
})

// ===== TREES (instanced) =====
const TREE_COUNT = 1500
const trunkIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4,0.72,5.2,6), new THREE.MeshStandardMaterial({color:0x6b4423,roughness:0.95}), TREE_COUNT)
const foliIM  = new THREE.InstancedMesh(new THREE.ConeGeometry(4.4,10,8,2),         new THREE.MeshStandardMaterial({color:0x2f7d2b,roughness:0.9}),   TREE_COUNT)
const foli2IM = new THREE.InstancedMesh(new THREE.ConeGeometry(3.2,7,8,2),          new THREE.MeshStandardMaterial({color:0x5f9d3a,roughness:0.88}),  TREE_COUNT)
trunkIM.castShadow = foliIM.castShadow = foli2IM.castShadow = true
trunkIM.receiveShadow = foliIM.receiveShadow = foli2IM.receiveShadow = true
const _d = new THREE.Object3D()
for (let i = 0; i < TREE_COUNT; i++) {
  const tx = (Math.random()-0.5)*5600, tz = (Math.random()-0.5)*5600
  const ty = terrainH(tx, tz)
  const treeSlope = Math.hypot(terrainH(tx + 16, tz) - terrainH(tx - 16, tz), terrainH(tx, tz + 16) - terrainH(tx, tz - 16)) / 32
  if (ty > 800 || treeSlope > 6.0 || (fbm(tx * 0.0015 + 8, tz * 0.0015 - 4, 3) < 0.34 && Math.random() < 0.75)) { i--; continue }
  if (ty < 4) { i--; continue }  // 水面下・峡谷底には植樹しない
  const s = 0.7 + Math.random()*0.7
  _d.position.set(tx, ty+2*s, tz); _d.scale.setScalar(s); _d.rotation.y = Math.random()*Math.PI*2; _d.updateMatrix()
  trunkIM.setMatrixAt(i, _d.matrix)
  _d.position.set(tx, ty+7.5*s, tz); _d.updateMatrix()
  foliIM.setMatrixAt(i, _d.matrix)
  _d.position.set(tx, ty+11.5*s, tz); _d.scale.setScalar(s * 0.78); _d.updateMatrix()
  foli2IM.setMatrixAt(i, _d.matrix)
}
trunkIM.instanceMatrix.needsUpdate = true; foliIM.instanceMatrix.needsUpdate = true; foli2IM.instanceMatrix.needsUpdate = true
scene.add(trunkIM); scene.add(foliIM); scene.add(foli2IM)

// ===== ROCK PILLARS (Blender GLB) =====
// rock_pillar.glb: height=1.0, base_r≈0.26 (unit scale). Loaded async, placed at cluster positions.
const PILLAR_SPECS: Array<{ cx:number; cz:number; n:number }> = [
  { cx:  920, cz:  100, n: 12 },
  { cx:  900, cz: -300, n: 10 },
  { cx:  940, cz: -550, n:  8 },
  { cx: -1080, cz: -720, n: 9 },
  { cx:  -620, cz:  720, n: 7 },
]
const ISOLATED_TOWERS = [[920,300,130,13],[920,-600,115,11],[-1080,-720,125,12]] as const

gltfLoader.load(import.meta.env.BASE_URL + 'models/rock_pillar.glb', (gltf) => {
  const proto = gltf.scene
  proto.traverse(c => { if ((c as THREE.Mesh).isMesh) { (c as THREE.Mesh).castShadow = true; (c as THREE.Mesh).receiveShadow = true } })

  for (const cl of PILLAR_SPECS) {
    for (let j = 0; j < cl.n; j++) {
      const px = cl.cx + (Math.random()-0.5)*250
      const pz = cl.cz + (Math.random()-0.5)*250
      const ph = terrainH(px, pz)
      const ht = 50 + Math.random()*90
      const rb = 9 + Math.random()*16
      const inst = proto.clone()
      inst.position.set(px, ph, pz)
      inst.scale.set(rb/0.26, ht, rb/0.26)
      inst.rotation.y = Math.random()*Math.PI*2
      scene.add(inst)
    }
  }
  // 孤立高塔
  for (const [px, pz, ht, rb] of ISOLATED_TOWERS) {
    const ph = terrainH(px, pz)
    const inst = proto.clone()
    inst.position.set(px, ph, pz)
    inst.scale.set(rb/0.26, ht, rb/0.26)
    inst.rotation.y = Math.random()*Math.PI*2
    scene.add(inst)
  }
}, undefined, () => { /* fallback: no pillars if GLB fails */ })

// ===== ARCHES (Blender GLB) =====
// rock_arch.glb: half-span=1.0, height=0.62 (unit scale)
const ARCH_SPECS = [
  [920,   80, 100, 62,  0.0],
  [905, -200,  92, 58,  0.06],
  [935, -480,  85, 54, -0.05],
  [820,  320,  78, 50,  1.4],
  [1020, -350, 82, 52, -1.5],
  [-1080,-720, 90, 58,  0.8],
  [-80,  480,  72, 48,  2.1],
] as const

gltfLoader.load(import.meta.env.BASE_URL + 'models/rock_arch.glb', (gltf) => {
  const proto = gltf.scene
  proto.traverse(c => { if ((c as THREE.Mesh).isMesh) { (c as THREE.Mesh).castShadow = true; (c as THREE.Mesh).receiveShadow = true } })

  for (const [x, z, w, h, rotY] of ARCH_SPECS) {
    const base = terrainH(x, z)
    const inst = proto.clone()
    inst.position.set(x, base, z)
    // half-span=1.0 → scale X by w/2, height=0.62 → scale Y by h/0.62
    inst.scale.set(w / 2, h / 0.62, w / 4)
    inst.rotation.y = rotY
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
for (let i = 0; i < BOULDER_COUNT; i++) {
  const bx = (Math.random() - 0.5) * 6200
  const bz = (Math.random() - 0.5) * 6200
  const by = terrainH(bx, bz)
  const slope = Math.hypot(terrainH(bx + 14, bz) - terrainH(bx - 14, bz), terrainH(bx, bz + 14) - terrainH(bx, bz - 14)) / 28
  if (by < WATER_LEVEL + 5 || by > 900 || slope > 9.0) { i--; continue }
  const s = 2.4 + Math.random() * 8
  _d.position.set(bx, by + s * 0.45, bz)
  _d.scale.set(s * (0.8 + Math.random() * 0.6), s * (0.45 + Math.random() * 0.45), s * (0.7 + Math.random() * 0.7))
  _d.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
  _d.updateMatrix()
  boulderIM.setMatrixAt(i, _d.matrix)
}
boulderIM.instanceMatrix.needsUpdate = true
scene.add(boulderIM)

// ===== SUPPLY POINTS =====
const SUPPLY_POSITIONS: THREE.Vector3[] = [
  new THREE.Vector3( 920,  0,  0),     // 東部峡谷内（低高度・危険）
  new THREE.Vector3(-200,  0,  480),   // 中央平野（開けた安全地帯）
  new THREE.Vector3(1200,  0, -380),   // 東部プラトー（高地・敵が来やすい）
  new THREE.Vector3(-1080, 0, -720),   // 北西高地（遠い補給拠点）
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

  const light = new THREE.PointLight(0x00ffaa, 3, 60)
  light.position.copy(pos); scene.add(light)
})

// ===== BUILDING GLB PROTOTYPES =====
// Load building models; world structures built after all protos are ready
let glbHangar: THREE.Group | null = null
let glbControlTower: THREE.Group | null = null
let glbRadarDish: THREE.Group | null = null
let glbFuelTank: THREE.Group | null = null
let glbWarehouse: THREE.Group | null = null
let glbDam: THREE.Group | null = null
let glbCityBuilding01: THREE.Group | null = null
let glbCityBuilding02: THREE.Group | null = null
let glbCityBuilding03: THREE.Group | null = null
let glbCityBuilding04: THREE.Group | null = null
let glbCityBuilding05: THREE.Group | null = null
let glbDefenseBunker: THREE.Group | null = null
let glbMountainRadarBase: THREE.Group | null = null
// Tokyo MAP用のGLBはTokyoMapSystemが管理するため、ここでは不要

let _bldgGLBsLoaded = 0
const _totalBuildingGLBs = 13  // オリジナルMAP用のビルディングGLB数
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
  // ===== 橋梁 =====
  buildBridge(   80, -185, 220, 0)             // 東西峡谷橋
  buildBridge( -350,  400, 180, Math.PI/2)     // 南北渓谷橋
  buildBridge(  920,  100, 260, Math.PI/2)     // 東部大峡谷橋

  // ===== 空軍基地 =====
  buildAirBase(   0,  -60, 0,           'A')   // 中央基地 Alpha
  buildAirBase(1100, -280, Math.PI*0.1, 'B')   // 東部高原基地 Bravo
  buildAirBase( 400,  200, Math.PI*0.25,'C')   // 中央東部平原基地 Charlie（新規）

  // ===== 港湾 =====
  buildPort(   -130,  920, 0)                  // 南部湾 軍港
  buildPort(  -1600,  350, Math.PI*0.3)        // 西部沿岸港（新規）

  // ===== ダム =====
  addDam(  120, -800, 180, Math.PI/2)          // 北部渓谷ダム
  addDam( -350,  600, 140, Math.PI/2)          // 南部渓谷ダム

  // ===== 都市エリア =====
  addCityArea( -600,  100, 150, 25)            // 西部都市
  addCityArea(  650,  450, 120, 18)            // 東部都市

  // ===== 山岳レーダー基地 =====
  addMountainRadarBase(  200, -1820)           // Peak A 最高峰
  addMountainRadarBase( -720, -1570)           // Peak B 北西峰
  addMountainRadarBase(  980, -1350)           // Peak C 北東峰

  // ===== 防空陣地 =====
  addDefensePosition( -180, -640, 4)           // 中央北部高地防空陣地
  addDefensePosition( 1100, -380, 3)           // 東部プラトー防空陣地
}

function _glbSetShadow(g: THREE.Group) {
  g.traverse(c => { if ((c as THREE.Mesh).isMesh) { (c as THREE.Mesh).castShadow = true; (c as THREE.Mesh).receiveShadow = true } })
}
;[
  ['models/hangar.glb',                (g: THREE.Group) => { glbHangar             = g }],
  ['models/control_tower.glb',         (g: THREE.Group) => { glbControlTower       = g }],
  ['models/radar_dish.glb',            (g: THREE.Group) => { glbRadarDish          = g }],
  ['models/fuel_tank.glb',             (g: THREE.Group) => { glbFuelTank           = g }],
  ['models/warehouse.glb',             (g: THREE.Group) => { glbWarehouse          = g }],
  ['models/dam.glb',                   (g: THREE.Group) => { glbDam                = g }],
  ['models/city_building_01.glb',      (g: THREE.Group) => { glbCityBuilding01     = g }],
  ['models/city_building_02.glb',      (g: THREE.Group) => { glbCityBuilding02     = g }],
  ['models/city_building_03.glb',      (g: THREE.Group) => { glbCityBuilding03     = g }],
  ['models/city_building_04.glb',      (g: THREE.Group) => { glbCityBuilding04     = g }],
  ['models/city_building_05.glb',      (g: THREE.Group) => { glbCityBuilding05     = g }],
  ['models/defense_bunker.glb',        (g: THREE.Group) => { glbDefenseBunker      = g }],
  ['models/mountain_radar_base.glb',   (g: THREE.Group) => { glbMountainRadarBase  = g }],
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

function createMissileModel(mat: THREE.Material): THREE.Group {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.0, 8), mat)
  body.rotation.x = Math.PI / 2; g.add(body)
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 8), mat)
  tip.rotation.x = Math.PI / 2; tip.position.z = -0.67; g.add(tip)
  const exhaustMat = new THREE.MeshStandardMaterial({
    color: 0xff5500, emissive: 0xff3300, emissiveIntensity: 5.0, roughness: 0.4
  })
  const exhaust = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.45, 8), exhaustMat)
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
  }, undefined, (err) => console.warn('GLB load failed:', err))
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
player.position.set(0, terrainH(0, 0) + 150, 0)  // 初期位置を高く（90→150m）
scene.add(player)
let cameraOffset = new THREE.Vector3(0, 5, 20)
const camQuat = new THREE.Quaternion()
let speed = 200  // 初期速度 200 m/s（720 km/h）

// ===== MOUSE / ADVANCED INPUT STATE =====
const mouseState = { nx: 0, ny: 0, leftDown: false, leftHoldTime: 0 }
let wheelSpeedTarget = 200  // 巡航速度 200 m/s
let camShakeAmt = 0
let decelerateMode = false
let lastSpaceTime = 0
const multiLockTargets: Enemy[] = []
let flareBurstLeft = 0
let flareBurstTimer = 0

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
  // ホイール前（上に回す）→ 加速、ホイール後ろ（下に回す）→ 減速
  const delta = e.deltaY > 0 ? -5 : 5  // deltaY > 0 は下/後ろ → 減速、deltaY < 0 は上/前 → 加速
  wheelSpeedTarget = Math.max(8, Math.min(90, wheelSpeedTarget + delta))
}, { passive: true })

// ===== TOUCH INPUT =====
const touchState = {
  pitch: 0, yaw: 0,
  boost: false, gun: false,
  missilePressed: false, flarePressed: false, lockPressed: false,
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
    // 縦持ち強制横向き時: HTML座標系に変換して表示
    const portrait = isPortraitMode()
    const H = window.innerHeight
    const bx = portrait ? (H - oy) : ox
    const by = portrait ? ox       : oy
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
      // ノブのCSS位置（HTML座標系）
      const H = window.innerHeight
      knob.style.left = (portrait ? H - oy + ldx : ox + ldx) + 'px'
      knob.style.top  = (portrait ? ox + ldy      : oy + ldy) + 'px'
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
  holdBtn('btn-gun',   v => { touchState.gun = v; if (v) initAudio() })
  tapBtn('btn-msl',  () => { touchState.missilePressed = true })
  tapBtn('btn-flr',  () => { touchState.flarePressed   = true })
  tapBtn('btn-lock', () => { touchState.lockPressed    = true })
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

function initAudio() {
  if (audioReady) return
  audioReady = true
  audioCtx = new AudioContext()
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

// ===== GAME OBJECTS =====
type GameMode = 'dogfight' | 'souryokusen' | 'free'
let currentMode: GameMode | null = null
let isPaused = false  // ポーズ状態
// dogfight: player spawn position (ally side)
let dfSpawnX = 0, dfSpawnZ = 0
let missionComplete = false
let modeObjectiveTotal = 0
let modeObjectiveKilled = 0

interface Projectile { mesh: THREE.Object3D; vel: THREE.Vector3; life: number }
interface HomingMissile extends Projectile { mesh: THREE.Group; target: THREE.Object3D | null; diverted: boolean; spd: number; turnRate: number; light: THREE.PointLight | null }
interface Enemy { group: THREE.Group; health: number; orbitAngle: number; fireCooldown: number; missileAmmo: number; seekingSupply: boolean }
interface Ally { group: THREE.Group; health: number; orbitAngle: number; fireCooldown: number; missileAmmo: number }
interface Explosion { particles: Array<{ mesh: THREE.Mesh; vel: THREE.Vector3 }>; life: number }
interface GroundTarget {
  group: THREE.Group; health: number; maxHealth: number; vel: THREE.Vector3
  type?: 'ship'|'tank'|'sam'|'bomber'|'heli'
  fireCooldown?: number   // SAM専用: 発射クールダウン
  smokeTimer?: number     // 煙エフェクトタイマー
  patrolAngle?: number    // ヘリ専用: 旋回角度
  patrolCenter?: THREE.Vector3  // ヘリ専用: 旋回中心
}
interface SmokeParticle { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; maxLife: number }

const bullets: Projectile[] = []
const playerMissiles: HomingMissile[] = []
const enemyMissiles: HomingMissile[] = []
const allyMissiles: HomingMissile[] = []
const flares: Projectile[] = []
const enemies: Enemy[] = []
const allies: Ally[] = []
const smokeParticles: SmokeParticle[] = []
const heliBlades: THREE.Group[] = []  // ヘリローター回転用
const explosions: Explosion[] = []
const groundTargets: GroundTarget[] = []

let dfAllyCount = 2
let dfEnemyCount = 3

let missileAmmo = 6, flareAmmo = 8, score = 0
let gunCooldown = 0, pMissileCooldown = 0, flareCooldown = 0
let hitFlashTimer = 0, gunSoundCooldown = 0, trailFrame = 0
let lockedTarget: { group: THREE.Group } | null = null  // Enemy | GroundTarget どちらもロック可能
let playerHP = 3, invincibleTimer = 0, respawnFlash = 0, respawnTimer = 0
const MAX_HP = 3

const bulletMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffdd00, emissiveIntensity: 18.0, roughness: 0.1, metalness: 0 })
const playerMissileMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff8800, emissiveIntensity: 6.0, roughness: 0.3, metalness: 0.7 })
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
  group.position.set(sx, terrainH(sx, sz) + 75 + Math.random() * 55, sz)
  scene.add(group)
  const angle = Math.atan2(sz, sx)
  enemies.push({ group, health: 2, orbitAngle: angle, fireCooldown: 8 + Math.random() * 7, missileAmmo: 4, seekingSupply: false })
}

function spawnEnemy() {
  const angle = Math.random() * Math.PI * 2
  spawnEnemyAt(Math.cos(angle) * (220 + Math.random() * 220), Math.sin(angle) * (220 + Math.random() * 220))
}

function spawnAlly(sx: number, sz: number) {
  const group = createAircraft(0x22cc55, 0x116633)
  group.position.set(sx, terrainH(sx, sz) + 75 + Math.random() * 55, sz)
  scene.add(group)
  allies.push({ group, health: 2, orbitAngle: Math.atan2(sz, sx), fireCooldown: 3 + Math.random() * 3, missileAmmo: 8 })
}

function fireAllyMissile(ally: Ally, target: Enemy) {
  const mesh = createMissileModel(allyMissileMat)
  mesh.position.copy(ally.group.position)
  const toTarget = target.group.position.clone().sub(ally.group.position).normalize()
  mesh.quaternion.setFromUnitVectors(_fwd, toTarget)
  scene.add(mesh)
  allyMissiles.push({ mesh, vel: toTarget.clone().multiplyScalar(80), life: 14, target: target.group, diverted: false, spd: 95, turnRate: 1.8, light: null })
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
      ally.orbitAngle += dt * 0.38
      const r = 90 + Math.sin(ally.orbitAngle * 0.3) * 20
      tx = target.group.position.x + Math.cos(ally.orbitAngle) * r
      tz = target.group.position.z + Math.sin(ally.orbitAngle) * r
      ty = target.group.position.y + 8 + Math.sin(ally.orbitAngle * 0.6) * 18

      ally.fireCooldown -= dt
      if (ally.fireCooldown <= 0 && ally.missileAmmo > 0 && minDist < 350) {
        ally.missileAmmo--
        ally.fireCooldown = 5 + Math.random() * 5
        fireAllyMissile(ally, target)
      }
    } else {
      ally.orbitAngle += dt * 0.18
      const r = 150
      tx = player.position.x + Math.cos(ally.orbitAngle) * r
      tz = player.position.z + Math.sin(ally.orbitAngle) * r
      ty = player.position.y + 10 + Math.sin(ally.orbitAngle * 0.5) * 15
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

function fireGun() {
  if (gunCooldown > 0) return
  gunCooldown = 0.08
  if (!audioReady) initAudio()

  const fwd = _fwd.clone().applyQuaternion(player.quaternion)
  let aimDir = fwd.clone()

  // ロック中は予測位置に照準
  if (lockedTarget) {
    const leadPos = calculateGunLeadPosition(lockedTarget)
    if (leadPos) {
      const toLeadPos = leadPos.clone().sub(player.position).normalize()
      // 前方60度以内なら予測照準を適用
      if (fwd.angleTo(toLeadPos) < Math.PI / 3) {
        aimDir = toLeadPos
      }
    }
  }

  for (const side of [-0.7, 0.7]) {
    const offset = new THREE.Vector3(side, 0, -3).applyQuaternion(player.quaternion)
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 6), bulletMat)
    mesh.position.copy(player.position).add(offset)
    scene.add(mesh)
    bullets.push({ mesh, vel: aimDir.clone().multiplyScalar(230), life: 1.8 })
  }
  if (gunSoundCooldown <= 0) { playGunSound(); gunSoundCooldown = 0.06 }
  // 砲口フラッシュ（パフォーマンス最適化：2発に1回のみ表示）
  if (Math.random() < 0.5) {
    const mFlash = new THREE.PointLight(0xffee00, 6, 20)
    mFlash.position.copy(player.position).add(new THREE.Vector3(0, 0, -3.5).applyQuaternion(player.quaternion))
    scene.add(mFlash)
    setTimeout(() => scene.remove(mFlash), 40)
  }
}

function firePlayerMissile() {
  if (pMissileCooldown > 0 || missileAmmo <= 0) return
  if (!audioReady) initAudio()
  pMissileCooldown = 1.5; missileAmmo--
  missileEl.textContent = missileAmmo.toString()
  updatePips(missilePips, missileAmmo, 'on')

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
  const mLight = new THREE.PointLight(0xff8800, 4, 30)  // 強度6→4、範囲55→30に削減
  mLight.position.copy(mesh.position)
  scene.add(mLight)
  playerMissiles.push({ mesh, vel: _fwd.clone().applyQuaternion(player.quaternion).multiplyScalar(80), life: 12, target, diverted: false, spd: 95, turnRate: 1.8, light: mLight })
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
  enemyMissiles.push({ mesh, vel: toTarget.clone().multiplyScalar(65), life: 15, target, diverted: false, spd: 70, turnRate: 0.85, light: null })
}

function _dropSingleFlare() {
  if (flareAmmo <= 0) return
  flareAmmo--
  flareEl.textContent = flareAmmo.toString()
  updatePips(flarePips, flareAmmo, 'flare-on')
  const mat = new THREE.MeshStandardMaterial({ color: 0xff8800, emissive: 0xff5500, emissiveIntensity: 9.0, roughness: 0.4 })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.32, 7, 7), mat)
  mesh.position.copy(player.position).add(new THREE.Vector3((Math.random()-0.5)*1.5, -0.5, 2.5).applyQuaternion(player.quaternion))
  scene.add(mesh)
  const fLight = new THREE.PointLight(0xff6600, 5, 18)
  fLight.position.copy(mesh.position); scene.add(fLight)
  setTimeout(() => scene.remove(fLight), 400)
  const backward = new THREE.Vector3(0, 0, 4).applyQuaternion(player.quaternion)
  backward.add(new THREE.Vector3((Math.random()-0.5)*32, -5+Math.random()*10, (Math.random()-0.5)*32))
  flares.push({ mesh, vel: backward, life: 7.0 })
  playFlareSound()
}

function triggerFlareBurst() {
  if (flareCooldown > 0 || flareAmmo <= 0) return
  if (!audioReady) initAudio()
  flareCooldown = 1.2
  flareBurstLeft = Math.min(3, flareAmmo)
  flareBurstTimer = 0
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
    if (dist > MISSILE_LOCK_RANGE) continue  // ミサイル射程内のみロックオン可能
    const dot = toT.normalize().dot(fwdWorld)
    if (dot > 0.3) {
      // 地形遮蔽チェック（プレイヤーから敵への直線上に地形がないか確認）
      raycaster.set(player.position, toT.normalize())
      raycaster.far = dist - 5  // 敵の手前までチェック
      const intersects = raycaster.intersectObject(ground, false)
      if (intersects.length > 0) continue  // 地形に遮られている場合はスキップ

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
      const intersects = raycaster.intersectObject(ground, false)
      return intersects.length === 0
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

function addDockPlatform(cx: number, cz: number, baseY: number, w: number, d: number): void {
  const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 3, d), concMat)
  deck.position.set(cx, baseY + 1.5, cz); deck.receiveShadow = true; deck.castShadow = true; scene.add(deck)
  // 杭（ピリング）
  const pn = Math.ceil(w / 28)
  for (let i = 0; i < pn; i++) {
    const px = cx - w/2 + (i + 0.5) * (w/pn)
    for (const pz of [cz - d/2 + 5, cz + d/2 - 5]) {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 14, 6), concMat)
      pile.position.set(px, baseY - 5, pz); scene.add(pile)
    }
  }
  // ボラード（係留柱）
  const steelB = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.6, metalness: 0.8 })
  for (let i = 0; i < 7; i++) {
    const bx = cx - w/2 + (i + 0.5) * (w/7)
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 2.2, 8), steelB)
    bollard.position.set(bx, baseY + 3.5, cz - d/2 + 1); scene.add(bollard)
  }
}

function addCrane(cx: number, cz: number, baseY: number, rotY: number): void {
  const g2 = new THREE.Group()
  const tower = new THREE.Mesh(new THREE.BoxGeometry(5, 45, 5), steelMat)
  tower.position.y = 22.5; tower.castShadow = true; g2.add(tower)
  const boom = new THREE.Mesh(new THREE.BoxGeometry(40, 2.5, 2.5), steelMat)
  boom.position.set(14, 46, 0); g2.add(boom)
  const counter = new THREE.Mesh(new THREE.BoxGeometry(16, 2.5, 2.5), steelMat)
  counter.position.set(-10, 46, 0); g2.add(counter)
  const cw = new THREE.Mesh(new THREE.BoxGeometry(5, 6, 4), concMat)
  cw.position.set(-17, 43, 0); g2.add(cw)
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 30, 4), steelMat)
  cable.position.set(25, 31, 0); g2.add(cable)
  const hook = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.35, 6, 12, Math.PI), steelMat)
  hook.position.set(25, 16, 0); hook.rotation.z = Math.PI/2; g2.add(hook)
  const warnL = new THREE.Mesh(new THREE.SphereGeometry(0.6, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0xff7700, emissive: 0xff5500, emissiveIntensity: 10 }))
  warnL.position.set(34, 47.5, 0); g2.add(warnL)
  g2.position.set(cx, baseY, cz); g2.rotation.y = rotY; scene.add(g2)
}

function addWarehouse(cx: number, cz: number, w: number, h: number, d: number, rotY: number, baseY: number): void {
  if (glbWarehouse) {
    // GLB warehouse: W=32, D=20, H=9
    const inst = glbWarehouse.clone()
    inst.scale.set(w / 32, h / 9, d / 20)
    inst.position.set(cx, baseY, cz)
    inst.rotation.y = rotY
    scene.add(inst)
    return
  }
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), milGreen)
  body.position.set(cx, baseY + h/2, cz); body.rotation.y = rotY
  body.castShadow = true; body.receiveShadow = true; scene.add(body)
  const roofMat2 = new THREE.MeshStandardMaterial({ color: 0x5a3c28, roughness: 0.90, metalness: 0.18 })
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(w + 2.5, 1, d + 2.5), roofMat2)
  ridge.position.set(cx, baseY + h + 0.5, cz); ridge.rotation.y = rotY; scene.add(ridge)
}

function buildPort(cx: number, cz: number, _rotY: number): void {
  const baseY = Math.max(terrainH(cx, cz), WATER_LEVEL + 3.5)
  addDockPlatform(cx, cz, baseY, 175, 65)
  // 倉庫群
  addWarehouse(cx - 50, cz + 58, 55, 15, 30, 0, terrainH(cx - 50, cz + 58))
  addWarehouse(cx + 50, cz + 58, 55, 15, 30, 0, terrainH(cx + 50, cz + 58))
  addWarehouse(cx,      cz + 95, 65, 13, 24, 0, terrainH(cx,      cz + 95))
  // クレーン x3
  for (let i = -1; i <= 1; i++) addCrane(cx + i * 52, cz - 22, baseY + 3, Math.PI/2)
  // 燃料タンク
  addFuelTanks(cx + 100, cz + 45, terrainH(cx + 100, cz + 45), 3)
  // 港湾レーダー
  addRadarDish(cx - 95, cz + 35, terrainH(cx - 95, cz + 35))
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
      const hangerH = topY - archR + archR  // from bY to arch
      if (hangerH < 1) continue
      const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, hangerH, 4), archMat3)
      hanger.position.set(lx, bY + hangerH/2, cz + t * span)
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

  for (let i = 0; i < buildingCount; i++) {
    const angle = Math.random() * Math.PI * 2
    const dist = Math.random() * radius
    const bx = cx + Math.cos(angle) * dist
    const bz = cz + Math.sin(angle) * dist
    const by = terrainH(bx, bz)

    if (by < WATER_LEVEL + 3) continue  // 水没回避

    // ランダムにGLBを選択
    const glb = availableGLBs[Math.floor(Math.random() * availableGLBs.length)]!
    const building = glb.clone()
    building.position.set(bx, by, bz)
    building.rotation.y = Math.random() * Math.PI * 2
    // ランダムスケール（0.8〜1.2倍）
    const scale = 0.8 + Math.random() * 0.4
    building.scale.setScalar(scale)
    scene.add(building)

    // 屋上ライト（夜間用、現在は昼間なので控えめ）
    if (Math.random() > 0.7) {
      const light = new THREE.PointLight(0xffaa66, 0.8, 25)
      light.position.set(bx, by + 40, bz)
      scene.add(light)
    }
  }
}

// ===== MOUNTAIN RADAR BASE =====
function addMountainRadarBase(cx: number, cz: number): void {
  if (!glbMountainRadarBase) return  // GLB未ロードならスキップ
  const baseY = terrainH(cx, cz)

  const base = glbMountainRadarBase.clone()
  base.position.set(cx, baseY, cz)
  base.rotation.y = Math.random() * Math.PI * 2
  scene.add(base)

  // レーダードーム発光
  const domeLight = new THREE.PointLight(0x66aaff, 3, 50)
  domeLight.position.set(cx, baseY + 22, cz)
  scene.add(domeLight)
}

// ===== DEFENSE POSITION (Multiple SAMs) =====
function addDefensePosition(cx: number, cz: number, samCount: number): void {
  if (!glbDefenseBunker) return  // GLB未ロードならスキップ
  const baseY = terrainH(cx, cz)

  // 中央バンカー
  const bunker = glbDefenseBunker.clone()
  bunker.position.set(cx, baseY, cz)
  scene.add(bunker)

  // SAM配置（円形配列）
  for (let i = 0; i < samCount; i++) {
    const angle = (i / samCount) * Math.PI * 2
    const sx = cx + Math.cos(angle) * 25
    const sz = cz + Math.sin(angle) * 25
    const sy = terrainH(sx, sz)

    // SAMランチャー（簡易版）
    const samBase = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.5, 1.5, 8), steelMat)
    samBase.position.set(sx, sy + 0.75, sz)
    samBase.castShadow = true
    scene.add(samBase)

    const samLauncher = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 4), steelMat)
    samLauncher.position.set(sx, sy + 2.5, sz)
    samLauncher.rotation.x = -Math.PI / 6
    samLauncher.castShadow = true
    scene.add(samLauncher)
  }
}

// ===== SMOKE PARTICLE SYSTEM =====
const _smokeMat = new THREE.MeshStandardMaterial({
  color: 0x1a1a1a, transparent: true, opacity: 0.55, roughness: 1, depthWrite: false
})

function spawnSmoke(pos: THREE.Vector3, radius = 3.5, col = 0x1a1a1a): void {
  if (smokeParticles.length > 160) return  // 上限
  const mat = _smokeMat.clone(); mat.color.set(col)
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 5, 5), mat)
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

function startGame(mode: GameMode) {
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
  lockedTarget = null
  score = 0; scoreEl.textContent = '0'
  missileAmmo = 6; flareAmmo = 8
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
      // 敵は南側、味方・プレイヤーは北側にスポーン
      for (let i = 0; i < dfEnemyCount; i++) {
        const a = Math.PI + (Math.random() - 0.5) * 1.2
        const r = 550 + Math.random() * 350
        spawnEnemyAt(Math.cos(a) * r, Math.sin(a) * r)
      }
      for (let i = 0; i < dfAllyCount; i++) {
        const a = (Math.random() - 0.5) * 1.2
        const r = 550 + Math.random() * 350
        spawnAlly(Math.cos(a) * r, Math.sin(a) * r)
      }
      // プレイヤーも味方側（北）にスポーン
      if (currentMap === 'tokyo' && tokyoMapSystem) {
        const safePos = tokyoMapSystem.getSafeSpawnPosition()
        dfSpawnX = safePos.x
        dfSpawnZ = safePos.z
        player.position.set(safePos.x, safePos.y, safePos.z)
      } else {
        dfSpawnX = (Math.random() - 0.5) * 120
        dfSpawnZ = -(200 + Math.random() * 150)
        player.position.set(dfSpawnX, terrainH(dfSpawnX, dfSpawnZ) + 200, dfSpawnZ)
      }
      player.quaternion.identity()
      camQuat.identity()
      speed = 200  // ゲーム開始時も巡航速度
      break
    }
    case 'souryokusen':
      modeObjectiveTotal = 17  // 3艦船 + 4戦車 + 2爆撃機 + 4SAM + 3ヘリ + 浮遊空母1
      setObjective(`地上目標を破壊 0 / 17`)
      spawnSouryokusen()
      break
    case 'free':
      modeObjectiveTotal = 0
      setObjective('フリーフライト')
      break
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
    // エンジンポッドのグロー照明
    const glowL = new THREE.PointLight(0x66aaff, 6, 120)
    glowL.position.set(0, 0, 70)
    carrierGroup.add(glowL)
    const glowR = new THREE.PointLight(0x66aaff, 6, 120)
    glowR.position.set(0, 0, -70)
    carrierGroup.add(glowR)
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

// Tokyo MAP用のランドマーク配置関数
// 新宿駅を原点(0,0)として実際の東京を再現
// スケール: 1unit = 10m
// buildTokyoLandmarks関数は削除 - TokyoMapSystemが完全に独立して管理

async function switchMap(map: GameMap) {
  console.log(`🗺️ MAP切り替え開始: ${map}`)

  if (map === 'tokyo') {
    // ===== 東京MAP（最小限バージョン）=====
    console.log('🗺️ 東京MAPに切り替え（最小限バージョン）')

    // 既存のオリジナルMAPの地形を削除
    if (ground) {
      scene.remove(ground)
      ground.geometry.dispose()
      ;(ground.material as THREE.Material).dispose()
      console.log('🗑️ オリジナル地形（プロシージャル）削除')
    }

    // terrain.glbを削除
    if (terrainGLB) {
      scene.remove(terrainGLB)
      terrainGLB.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose()
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat.dispose())
          } else {
            child.material?.dispose()
          }
        }
      })
      terrainGLB = null
      console.log('🗑️ オリジナル地形（GLB）削除')
    }

    // オリジナルマップの全構造物とterrain.glbを削除
    const objectsToRemove: THREE.Object3D[] = []
    scene.traverse((obj) => {
      // terrain.glb（GLTFScene）とオリジナルマップのオブジェクトを識別
      const isTerrainGLB = obj.type === 'Group' && obj.children.some(c =>
        c instanceof THREE.Mesh && c.geometry && c.geometry.attributes.position
      )

      if (isTerrainGLB || (obj.name && (
        obj.name.includes('Bridge') ||
        obj.name.includes('Base') ||
        obj.name.includes('Port') ||
        obj.name.includes('Dam') ||
        obj.name.includes('City') ||
        obj.name.includes('Radar') ||
        obj.name.includes('Defense') ||
        obj.name.includes('Boulder') ||
        obj.name.includes('Rock') ||
        obj.name.includes('Pillar') ||
        obj.name.includes('Arch') ||
        obj.parent === originalMapGroup
      ))) {
        objectsToRemove.push(obj)
      }
    })
    objectsToRemove.forEach(obj => {
      if (obj.parent) obj.parent.remove(obj)
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose()
        if (Array.isArray(obj.material)) {
          obj.material.forEach(mat => mat.dispose())
        } else {
          obj.material?.dispose()
        }
      }
      // Groupの場合は子要素も再帰的にdispose
      obj.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose()
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat.dispose())
          } else {
            child.material?.dispose()
          }
        }
      })
    })
    console.log(`🗑️ オリジナル構造物削除: ${objectsToRemove.length}個`)

    // 東京MAPシステムを初期化
    if (!tokyoMapSystem) {
      tokyoMapSystem = new TokyoMapSystem(scene, gltfLoader)
    }
    await tokyoMapSystem.initialize()

    console.log('✅ 東京MAP切り替え完了')

  } else {
    // ===== オリジナルMAP =====
    // 東京MAPシステムをクリーンアップ
    if (tokyoMapSystem) {
      tokyoMapSystem.dispose()
      tokyoMapSystem = null
    }

    // 東京オブジェクトをクリア
    tokyoObjects.forEach(obj => {
      scene.remove(obj)
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        if (Array.isArray(obj.material)) {
          obj.material.forEach(mat => mat.dispose())
        } else {
          obj.material.dispose()
        }
      }
    })
    tokyoObjects.length = 0

    // オリジナル地形を再生成
    ground = generateTerrainMesh()
    scene.add(ground)

    // オリジナルMAPの構造物を再構築
    buildWorldStructures()

    console.log('✅ オリジナルMAP切り替え完了')
  }
}

// MAP選択イベント（直接ID指定で確実に登録）
console.log('🔧 MAP選択イベントを設定中...')

async function handleMapSwitch(mapType: GameMap) {
  console.log(`🖱️ MAP切り替え開始: ${mapType}`)

  // アクティブ状態の切り替え
  document.querySelectorAll('.map-select-btn').forEach(b => b.classList.remove('active'))
  if (mapType === 'tokyo') {
    document.getElementById('map-btn-tokyo')?.classList.add('active')
  } else {
    document.getElementById('map-btn-original')?.classList.add('active')
  }

  // MAP切り替え
  currentMap = mapType
  console.log(`🗺️ switchMap()呼び出し: ${currentMap}`)
  await switchMap(currentMap)
  console.log(`✅ switchMap()完了`)
}

// 東京MAPボタン
const tokyoBtn = document.getElementById('map-btn-tokyo')
if (tokyoBtn) {
  console.log('🔧 東京MAPボタン登録成功')
  tokyoBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    console.log('✅ 東京MAPボタンクリック検出！')
    handleMapSwitch('tokyo')
  })
} else {
  console.error('❌ 東京MAPボタンが見つかりません')
}

// オリジナルMAPボタン
const originalBtn = document.getElementById('map-btn-original')
if (originalBtn) {
  console.log('🔧 オリジナルMAPボタン登録成功')
  originalBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    console.log('✅ オリジナルMAPボタンクリック検出！')
    handleMapSwitch('original')
  })
} else {
  console.error('❌ オリジナルMAPボタンが見つかりません')
}

// モードボタンとbackボタンのイベント
document.querySelectorAll<HTMLElement>('.ms-start').forEach(btn => {
  btn.addEventListener('click', () => startGame(btn.dataset.mode as GameMode))
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

    // 目標が後方120°超 → 追尾ロスト（Uターン不可）
    if (angle > Math.PI * 0.67) {
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
}

// ===== EXPLOSIONS =====
function createExplosion(pos: THREE.Vector3, scale = 1.0) {
  const particles: Array<{ mesh: THREE.Mesh; vel: THREE.Vector3 }> = []
  const count = Math.floor(6 + scale * 4)  // パーティクル数を半分に削減
  for (let i = 0; i < count; i++) {
    const core = i < count * 0.5
    const mat = new THREE.MeshStandardMaterial({
      color: core ? 0xff5500 : 0xffcc00,
      emissive: core ? 0xff2200 : 0xff8800,
      emissiveIntensity: 4.0, roughness: 0.8, transparent: true, opacity: 1
    })
    const mesh = new THREE.Mesh(new THREE.SphereGeometry((0.3 + Math.random() * 0.7) * scale, 4, 4), mat)  // ジオメトリ解像度5→4
    mesh.position.copy(pos)
    scene.add(mesh)
    particles.push({ mesh, vel: new THREE.Vector3((Math.random() - 0.5) * 28 * scale, Math.random() * 18 * scale, (Math.random() - 0.5) * 28 * scale) })
  }
  // Flash point light at explosion
  const flash = new THREE.PointLight(0xff6600, 6 * scale, 40)  // 強度8→6、範囲60→40に削減
  flash.position.copy(pos)
  scene.add(flash)
  setTimeout(() => scene.remove(flash), 150)  // 表示時間200ms→150msに短縮
  explosions.push({ particles, life: 1.1 })  // ライフタイム1.3→1.1に短縮
}

// ===== UPDATE =====
function updateBullets(dt: number) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    bullets[i].life -= dt; bullets[i].mesh.position.addScaledVector(bullets[i].vel, dt)
    if (bullets[i].life <= 0) { scene.remove(bullets[i].mesh); bullets.splice(i, 1) }
  }
}

function updateMissileArr(arr: HomingMissile[], dt: number, onExpire: (m: HomingMissile) => void) {
  for (let i = arr.length - 1; i >= 0; i--) {
    updateHoming(arr[i], dt)
    if (arr[i].life <= 0) { onExpire(arr[i]); scene.remove(arr[i].mesh); if (arr[i].light) scene.remove(arr[i].light!); arr.splice(i, 1) }
  }
}

function updateFlares(dt: number) {
  for (let i = flares.length - 1; i >= 0; i--) {
    const f = flares[i]; f.vel.y -= 9 * dt; f.life -= dt
    f.mesh.position.addScaledVector(f.vel, dt)
    ;((f.mesh as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 4.0 + Math.random() * 3.5
    if (f.life <= 0 || f.mesh.position.y < 1) { scene.remove(f.mesh); flares.splice(i, 1) }
  }
}

function updateEnemies(dt: number) {
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i]
    let tx: number, tz: number, ty: number

    if (enemy.seekingSupply) {
      // 最寄りの補給ポイントへ向かう
      let nearestIdx = 0, nearestDist = Infinity
      for (let si = 0; si < SUPPLY_POSITIONS.length; si++) {
        const d = enemy.group.position.distanceTo(SUPPLY_POSITIONS[si])
        if (d < nearestDist) { nearestDist = d; nearestIdx = si }
      }
      const sp = SUPPLY_POSITIONS[nearestIdx]
      tx = sp.x; tz = sp.z; ty = sp.y + 15
      if (nearestDist < 40) {
        enemy.missileAmmo = 4
        enemy.seekingSupply = false
      }
    } else {
      enemy.orbitAngle += dt * 0.22
      const r = 110 + i * 25
      // 味方がいる場合、一部の敵は味方を狙う（チーム戦AI）
      const orbitBase = (currentMode === 'dogfight' && allies.length > 0 && i % 3 === 2)
        ? allies[i % allies.length].group.position
        : player.position
      tx = orbitBase.x + Math.cos(enemy.orbitAngle) * r
      tz = orbitBase.z + Math.sin(enemy.orbitAngle) * r
      ty = orbitBase.y + 8 + Math.sin(enemy.orbitAngle * 0.6) * 20

      enemy.fireCooldown -= dt
      if (enemy.fireCooldown <= 0) {
        if (enemy.missileAmmo > 0) {
          enemy.fireCooldown = 9 + Math.random() * 7
          fireEnemyMissile(enemy)
        } else {
          enemy.seekingSupply = true
          enemy.fireCooldown = 3
        }
      }
    }

    const dir = new THREE.Vector3(tx - enemy.group.position.x, ty - enemy.group.position.y, tz - enemy.group.position.z)
    if (dir.length() > 0.5) {
      dir.normalize()
      enemy.group.position.addScaledVector(dir, 180 * dt)  // 敵機も180m/s（648km/h）で移動
      const flat = new THREE.Vector3(dir.x, 0, dir.z)
      if (flat.lengthSq() > 0.01) enemy.group.quaternion.slerp(
        new THREE.Quaternion().setFromUnitVectors(_fwd, flat.normalize()), 0.055
      )
    }
  }
}

function updateExplosions(dt: number) {
  for (let i = explosions.length - 1; i >= 0; i--) {
    const ex = explosions[i]; ex.life -= dt
    for (const p of ex.particles) {
      p.mesh.position.addScaledVector(p.vel, dt); p.vel.y -= 5 * dt; p.vel.multiplyScalar(0.94)
      const mat = p.mesh.material as THREE.MeshStandardMaterial
      mat.opacity = Math.max(0, ex.life / 1.3); mat.emissiveIntensity = ex.life * 3.5
    }
    if (ex.life <= 0) { ex.particles.forEach(p => scene.remove(p.mesh)); explosions.splice(i, 1) }
  }
}

function updateContrails() {
  if (++trailFrame % 2 !== 0 || speed < 150) return  // 150m/s（540km/h）以上で飛行機雲生成
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
}

// ===== UI =====
const speedEl    = document.getElementById('speed')!
const altEl      = document.getElementById('altitude')!
const missileEl  = document.getElementById('missiles')!
const flareEl    = document.getElementById('flares')!
const scoreEl    = document.getElementById('score')!
const hitOverlay = document.getElementById('hit-overlay') as HTMLDivElement
const respawnOverlay = document.getElementById('respawn-overlay') as HTMLDivElement
const supplyIndicator = document.getElementById('supply-indicator') as HTMLDivElement
const warningEl  = document.getElementById('warning') as HTMLDivElement
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

const MISSILE_LOCK_RANGE = 750

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

function _drawOffscreenArrow(ctx: CanvasRenderingContext2D, worldPos: THREE.Vector3, w: number, h: number) {
  const toTarget = worldPos.clone().sub(camera.position)
  const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
  const camUp    = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
  const angle = Math.atan2(-toTarget.dot(camUp), toTarget.dot(camRight))
  const margin = 32
  const cx = w / 2 + Math.cos(angle) * (w / 2 - margin)
  const cy = h / 2 + Math.sin(angle) * (h / 2 - margin)
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle)
  ctx.fillStyle = 'rgba(255,80,80,0.9)'
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
  const raycaster = new THREE.Raycaster()
  for (const e of enemies) {
    const dist = e.group.position.distanceTo(player.position)
    const toE = e.group.position.clone().sub(player.position)
    const toENorm = toE.clone().normalize()
    const frontDot = toENorm.dot(playerFwd)

    // 地形遮蔽チェック
    raycaster.set(player.position, toENorm)
    raycaster.far = dist - 5
    let blockedByTerrain = false
    if (currentMap === 'tokyo' && tokyoMapSystem) {
      // 東京MAP: ビル・ランドマークによる遮蔽判定
      const intersects = raycaster.intersectObjects(tokyoMapSystem.getCollisionObjects(), true)
      blockedByTerrain = intersects.length > 0
    } else {
      // オリジナルMAP: 地形による遮蔽判定
      const intersects = raycaster.intersectObject(ground, false)
      blockedByTerrain = intersects.length > 0
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
      // Lockable: rotating dashed ring + double corner brackets (射程内)
      const spin = t * 0.0022
      const r = 22
      ctx.strokeStyle = 'rgba(255,210,60,0.8)'; ctx.lineWidth = 1.2
      for (let i = 0; i < 4; i++) {
        const a0 = spin + (i / 4) * Math.PI * 2
        ctx.beginPath(); ctx.arc(sx, sy, r, a0, a0 + Math.PI * 0.42); ctx.stroke()
      }
      ctx.strokeStyle = 'rgba(255,210,60,0.55)'
      _drawCornerBrackets(ctx, sx, sy, 16, 6)  // 内側ブラケット
      ctx.strokeStyle = 'rgba(255,210,60,0.35)'
      _drawCornerBrackets(ctx, sx, sy, 22, 8)  // 外側ブラケット（射程内表示）
      ctx.fillStyle = 'rgba(255,210,60,0.8)'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'
      ctx.fillText(`${Math.round(dist)}m`, sx, sy + 22 + 16)
    } else {
      // Out of range or behind: dim single brackets
      ctx.strokeStyle = 'rgba(200,70,70,0.35)'; ctx.lineWidth = 1
      _drawCornerBrackets(ctx, sx, sy, 16, 5)
      ctx.fillStyle = 'rgba(200,70,70,0.5)'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'
      ctx.fillText(`${Math.round(dist)}m`, sx, sy + 16 + 14)
    }
  }

  // Ground targets (souryokusen)
  if (currentMode === 'souryokusen') {
    for (const gt of groundTargets) {
      const dist = gt.group.position.distanceTo(player.position)
      if (dist > MISSILE_LOCK_RANGE * 1.4) continue

      // 地形遮蔽チェック
      const toGT = gt.group.position.clone().sub(player.position)
      raycaster.set(player.position, toGT.normalize())
      raycaster.far = dist - 5
      const intersects = raycaster.intersectObject(ground, false)
      if (intersects.length > 0 && gt !== lockedTarget) continue  // 遮蔽されている場合はスキップ

      const [sx, sy, vis] = projectToScreen(gt.group.position)
      if (!vis) continue
      const inR = dist < MISSILE_LOCK_RANGE
      ctx.strokeStyle = inR ? 'rgba(255,155,40,0.9)' : 'rgba(200,120,40,0.35)'
      ctx.lineWidth = inR ? 1.5 : 1
      _drawCornerBrackets(ctx, sx, sy, 18, 6)
      if (inR) {
        // 射程内は二重ブラケット
        ctx.strokeStyle = 'rgba(255,155,40,0.4)'
        _drawCornerBrackets(ctx, sx, sy, 24, 8)
      }
      ctx.fillStyle = inR ? 'rgba(255,175,60,0.9)' : 'rgba(180,120,50,0.45)'
      ctx.font = inR ? 'bold 12px monospace' : 'bold 11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`${Math.round(dist)}m`, sx, sy + 18 + 16)
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
  let rx = currentMode === 'dogfight' ? dfSpawnX : 0
  let rz = currentMode === 'dogfight' ? dfSpawnZ : 0
  let ry = 200

  // 東京MAPの場合は安全なスポーン位置を使用
  if (currentMap === 'tokyo' && tokyoMapSystem) {
    const safePos = tokyoMapSystem.getSafeSpawnPosition()
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
  // 近くの敵ミサイルを除去
  for (let i = enemyMissiles.length - 1; i >= 0; i--) {
    scene.remove(enemyMissiles[i].mesh); enemyMissiles.splice(i, 1)
  }
  updateHPDisplay()
}

// ===== SUPPLY POINTS =====
let supplyIndicatorTimer = 0

function updateSupplyPoints(dt: number) {
  for (let i = 0; i < supplyMeshes.length; i++) {
    supplyMeshes[i].rotation.y += dt * 1.2
    supplyCooldowns[i] = Math.max(0, supplyCooldowns[i] - dt)

    const dist = player.position.distanceTo(SUPPLY_POSITIONS[i])
    if (dist < 38 && supplyCooldowns[i] <= 0) {
      const prevMsl = missileAmmo, prevFlr = flareAmmo
      missileAmmo = Math.min(6, missileAmmo + 3)
      flareAmmo   = Math.min(8, flareAmmo   + 4)
      if (missileAmmo !== prevMsl || flareAmmo !== prevFlr) {
        missileEl.textContent = missileAmmo.toString()
        flareEl.textContent   = flareAmmo.toString()
        updatePips(missilePips, missileAmmo, 'on')
        updatePips(flarePips,   flareAmmo,   'flare-on')
        supplyCooldowns[i] = 20
        supplyIndicatorTimer = 1.8
      }
    }
  }
  supplyIndicatorTimer = Math.max(0, supplyIndicatorTimer - dt)
  supplyIndicator.style.display = supplyIndicatorTimer > 0 ? 'block' : 'none'
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

  // 補給ポイント（緑菱形）
  for (const sp of SUPPLY_POSITIONS) {
    if (sp.distanceTo(player.position) > RADAR_RANGE * 1.2) continue
    const [px, py] = worldToRadar(sp)
    ctx.fillStyle = '#0fa'
    ctx.beginPath(); ctx.moveTo(px, py-4); ctx.lineTo(px+3, py); ctx.lineTo(px, py+4); ctx.lineTo(px-3, py); ctx.closePath(); ctx.fill()
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
  const boost = (!!keys['Space'] || touchState.boost) && !decelerateMode
  const boostTarget = decelerateMode ? 50 : (boost ? 550 : wheelSpeedTarget)  // 減速50m/s、ブースト550m/s（1,980km/h）
  speed += (boostTarget - speed) * dt * 2.2
  if (!boost && !decelerateMode) wheelSpeedTarget += (200 - wheelSpeedTarget) * dt * 0.4  // 巡航速度に自動復帰

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
    player.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0), pitchInput * 1.9 * dt))
  if (yawInput !== 0)
    player.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0), -yawInput * 1.5 * dt))

  // バンキング: ヨー入力 → ロール（自然なバンク旋回）+ 自動水平復帰
  const _bEuler = new THREE.Euler().setFromQuaternion(player.quaternion, 'YXZ')
  const targetBankZ = -yawInput * 0.72
  _bEuler.z += (targetBankZ - _bEuler.z) * dt * 5
  if (pitchInput === 0 && Math.abs(yawInput) < 0.05) _bEuler.z *= 0.88
  player.quaternion.setFromEuler(_bEuler)
  player.quaternion.normalize()

  // 移動前の位置を保存
  const prevPos = player.position.clone()
  player.position.addScaledVector(_fwd.clone().applyQuaternion(player.quaternion), speed * dt)

  // 衝突判定：地形との衝突
  const minAltitude = terrainH(player.position.x, player.position.z) + 10
  if (player.position.y < minAltitude) {
    player.position.y = minAltitude
    // 地形衝突時はダメージ
    if (player.position.y - prevPos.y < -5) {
      playerHP -= 15
      updateHPDisplay()
      hitFlashTimer = 0.5
      if (playerHP <= 0) respawnPlayer()
    }
  }

  // 衝突判定：構造物との衝突（建物、地上目標）
  const collisionRadius = 8  // プレイヤーの衝突半径

  // 東京MAPの建物・ランドマークとの衝突
  if (currentMap === 'tokyo' && tokyoMapSystem) {
    const collisionObjects = tokyoMapSystem.getCollisionObjects()
    for (const obj of collisionObjects) {
      if (!(obj as any).isMesh) continue
      const mesh = obj as THREE.Mesh
      const box = new THREE.Box3().setFromObject(mesh)
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
        playerHP -= 20
        updateHPDisplay()
        hitFlashTimer = 0.5
        camShakeAmt = Math.max(camShakeAmt, 0.8)
        if (playerHP <= 0) respawnPlayer()
        break
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
          playerHP -= 20
          updateHPDisplay()
          hitFlashTimer = 0.5
          camShakeAmt = Math.max(camShakeAmt, 0.8)
          if (playerHP <= 0) respawnPlayer()
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
      playerHP -= 25
      updateHPDisplay()
      hitFlashTimer = 0.5
      camShakeAmt = Math.max(camShakeAmt, 1.0)
      if (playerHP <= 0) respawnPlayer()
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
    if (keys['KeyZ'] || keys['KeyA'] || keys['KeyQ'] || touchState.gun) fireGun()
    if (keysJustPressed.has('KeyX') || touchState.missilePressed) firePlayerMissile()
    if (keysJustPressed.has('KeyC') || touchState.flarePressed) triggerFlareBurst()
  }
  keysJustPressed.clear()
  touchState.missilePressed = false
  touchState.flarePressed   = false
  touchState.lockPressed    = false

  updateBullets(dt)
  updateMissileArr(playerMissiles, dt, m => createExplosion(m.mesh.position.clone(), 0.6))
  updateMissileArr(enemyMissiles, dt, m => createExplosion(m.mesh.position.clone(), 0.5))
  updateMissileArr(allyMissiles, dt, m => createExplosion(m.mesh.position.clone(), 0.6))
  updateFlares(dt)
  if (currentMode !== null && !missionComplete) {
    updateEnemies(dt)
    updateAllies(dt)
    checkCollisions()
    checkGroundTargetCollisions()
  }
  updateGroundTargets(dt)
  updateExplosions(dt)
  updateContrails()
  if (currentMode !== null) updateSupplyPoints(dt)
  if (currentMode === 'dogfight') setObjective(`敵機を撃墜せよ — SCORE: ${score}`)
  if (currentMode === 'souryokusen') setObjective(`地上目標を破壊 ${modeObjectiveKilled} / ${modeObjectiveTotal} — SCORE: ${score}`)

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
  const targetCamZ = 18 + (speed / 550) * 28  // 最高速時+28m引く
  cameraOffset.z += (targetCamZ - cameraOffset.z) * dt * 3
  // カメラシェイク
  camShakeAmt *= Math.exp(-dt * 8)
  const _sk = camShakeAmt
  const desiredCamPos = cameraOffset.clone().applyQuaternion(player.quaternion)
    .add(player.position)
    .add(new THREE.Vector3((Math.random() - 0.5) * _sk, (Math.random() - 0.5) * _sk, 0))
  camera.position.lerp(desiredCamPos, 0.12)
  const playerUp = new THREE.Vector3(0, 1, 0).applyQuaternion(player.quaternion)
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
  drawEnemyBrackets()
  drawRadar()

  waterUniforms.time.value += dt
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
