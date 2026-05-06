import * as THREE from 'three'
import { Sky } from 'three/addons/objects/Sky.js'
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'

// ===== RENDERER =====
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.6   // 白飛び防止
renderer.outputColorSpace = THREE.LinearSRGBColorSpace
document.body.appendChild(renderer.domElement)

// ===== SCENE =====
const scene = new THREE.Scene()
// 空気遠近法：近景は明確に、地平線だけ霞む
scene.fog = new THREE.Fog(0x7aaec8, 1400, 5500)

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 8000)

// ===== POST-PROCESSING =====
// ブルームは白飛びの原因になるため Phase 1 では無効化
// Phase 6 で選択的ブルームとして再導入予定
let composer: EffectComposer | null = null

// ===== SKY =====
const sky = new Sky()
sky.scale.setScalar(8000)
scene.add(sky)
const skyUniforms = sky.material.uniforms
// 澄んだ午後の空（BotW的明るい昼間）
skyUniforms['turbidity'].value = 0.8
skyUniforms['rayleigh'].value = 2.2
skyUniforms['mieCoefficient'].value = 0.002
skyUniforms['mieDirectionalG'].value = 0.88

const sunVec = new THREE.Vector3()
// 45°の斜め光（昼すぎの柔らかい角度）
sunVec.setFromSphericalCoords(1, THREE.MathUtils.degToRad(46), THREE.MathUtils.degToRad(195))
skyUniforms['sunPosition'].value.copy(sunVec)

// ===== ENV MAP（空を機体・水面に反射させる）=====
const cubeRT = new THREE.WebGLCubeRenderTarget(256)
const cubeCamera = new THREE.CubeCamera(1, 6000, cubeRT)
cubeCamera.position.set(0, 120, 0)
scene.add(cubeCamera)
// 空だけある状態でキャプチャ（ゲームオブジェクト追加前）
cubeCamera.update(renderer, scene)
scene.environment = cubeRT.texture
scene.remove(cubeCamera)

// ===== LIGHTING =====
// メインサン：暖かい白昼光
const sun = new THREE.DirectionalLight(0xfff8ec, 3.2)
sun.position.copy(sunVec).multiplyScalar(600)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)  // 4096→2048で軽量化（品質十分）
sun.shadow.camera.near = 1; sun.shadow.camera.far = 2000
sun.shadow.camera.left = -600; sun.shadow.camera.right = 600
sun.shadow.camera.top = 600; sun.shadow.camera.bottom = -600
sun.shadow.bias = -0.0004
scene.add(sun)
// 環境光：やや青みがかった空の反射
scene.add(new THREE.AmbientLight(0x4466cc, 0.55))
// 半球光：空→地面のグラデーション（草の照り返し）
scene.add(new THREE.HemisphereLight(0x88bbff, 0x4a7a25, 1.1))
// バックフィル：影部分を自然に（逆方向から弱く）
const fillLight = new THREE.DirectionalLight(0x6688bb, 0.4)
fillLight.position.set(-sunVec.x, sunVec.y * 0.3, -sunVec.z).multiplyScalar(400)
scene.add(fillLight)

// Engine glow light (moves with player)
const engineLight = new THREE.PointLight(0xff6600, 4, 25)
scene.add(engineLight)


// ===== TERRAIN =====
function terrainH(x: number, z: number): number {
  return Math.sin(x * 0.003) * Math.cos(z * 0.002) * 38
       + Math.sin(x * 0.008 + z * 0.006) * 16
       + Math.sin(x * 0.02 + 1.3) * Math.cos(z * 0.017) * 7
       + Math.max(0, Math.sin(x * 0.0015 + z * 0.001) * 90 - 50)
}

function mkGroundTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 512
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#4a7c3f'; ctx.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 120; i++) {
    const h = 90 + Math.random() * 50, l = 22 + Math.random() * 22
    ctx.fillStyle = `hsl(${h},38%,${l}%)`
    const r = 8 + Math.random() * 35
    ctx.beginPath()
    ctx.ellipse(Math.random()*512, Math.random()*512, r, r*0.55, Math.random()*Math.PI, 0, Math.PI*2)
    ctx.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(70, 70)
  return t
}

const terrainGeo = new THREE.PlaneGeometry(8000, 8000, 128, 128)
terrainGeo.rotateX(-Math.PI / 2)
const tPos = terrainGeo.attributes.position as THREE.BufferAttribute
const tCol = new Float32Array(tPos.count * 3)
for (let i = 0; i < tPos.count; i++) {
  const x = tPos.getX(i), z = tPos.getZ(i)
  tPos.setY(i, terrainH(x, z))
  const y = tPos.getY(i)
  // 横方向の色ノイズで単調さを回避
  const v = Math.sin(x * 0.042 + z * 0.063) * 0.06 + Math.sin(x * 0.11 - z * 0.09) * 0.04
  let r: number, g: number, b: number
  if (y < 0)        { r=0.18+v; g=0.52+v; b=0.62 }   // 水際・湿地（青緑）
  else if (y < 6)   { r=0.28+v; g=0.76+v; b=0.22 }   // 低地・明るい草原
  else if (y < 18)  { r=0.24+v; g=0.65+v; b=0.17 }   // 中腹・濃い草
  else if (y < 35)  { r=0.26+v; g=0.58+v; b=0.14+v } // 丘・やや暗い緑
  else if (y < 55)  { r=0.55+v; g=0.48+v; b=0.30+v } // 岩場・褐色
  else              { r=0.74+v; g=0.72+v; b=0.70 }    // 高山・石灰色
  tCol[i*3]   = Math.max(0, Math.min(1, r))
  tCol[i*3+1] = Math.max(0, Math.min(1, g))
  tCol[i*3+2] = Math.max(0, Math.min(1, b))
}
terrainGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3))
terrainGeo.computeVertexNormals()
const ground = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({
  map: mkGroundTex(), vertexColors: true, roughness: 0.88, metalness: 0.0
}))
ground.receiveShadow = true
scene.add(ground)

// ===== WATER =====
const waterUniforms = { time: { value: 0 }, sunDir: { value: sunVec.clone().normalize() } }
const waterMesh = new THREE.Mesh(
  (() => { const g = new THREE.PlaneGeometry(2800, 2800, 48, 48); g.rotateX(-Math.PI/2); return g })(),
  new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    transparent: true,
    vertexShader: `
      uniform float time;
      varying vec3 vNorm; varying vec3 vPos;
      void main(){
        vec3 p=position;
        p.y+=sin(p.x*.07+time*1.1)*.7+sin(p.z*.055+time*.85)*.6+sin((p.x+p.z)*.035+time*1.4)*.35;
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
        float spec=pow(max(0.,dot(reflect(-normalize(sunDir),n),vec3(0,0,-1))),55.)*3.5;
        float fresnel=pow(1.-abs(n.y),2.2)*.7;
        vec3 deep=vec3(.04,.18,.52), shallow=vec3(.10,.45,.72);
        vec3 col=mix(deep,shallow,fresnel+ndl*.25)+vec3(1.,.96,.88)*spec;
        gl_FragColor=vec4(col,.82);
      }`
  })
)
waterMesh.position.y = 1.8
scene.add(waterMesh)

// ===== MOUNTAINS =====
;[[-1200,-1000,420,260],[ 900,-1100,380,240],[-500,1300,360,230],
  [1400, 600,470,290],[-1500, 400,400,250],[600,-1400,320,200],
  [-900,-1400,290,185],[1200,1200,430,270],[-1400,1000,355,225],
  [200,1500,315,205],[-1800,-200,500,310],[1700,-300,450,280],
  [-600,-1700,340,215],[1100,-800,290,180],[-1100,700,370,235],
].forEach(([x,z,h,r]) => {
  const base = terrainH(x,z)
  const body = new THREE.Mesh(new THREE.ConeGeometry(r,h,9), new THREE.MeshStandardMaterial({color:0x7a8870,roughness:0.96,metalness:0.0}))
  body.position.set(x, base + h/2, z); body.castShadow = true; scene.add(body)
  const cap = new THREE.Mesh(new THREE.ConeGeometry(r*0.3,h*0.22,9), new THREE.MeshStandardMaterial({color:0xf0f5ff,roughness:0.9}))
  cap.position.set(x, base + h*0.89, z); scene.add(cap)
})

// ===== TREES (instanced) =====
const TREE_COUNT = 500
const trunkIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.45,0.65,4,6), new THREE.MeshStandardMaterial({color:0x6b4423,roughness:0.95}), TREE_COUNT)
const foliIM  = new THREE.InstancedMesh(new THREE.ConeGeometry(3.8,8,7),           new THREE.MeshStandardMaterial({color:0x2e7a1a,roughness:0.88}),  TREE_COUNT)
trunkIM.castShadow = foliIM.castShadow = true
const _d = new THREE.Object3D()
for (let i = 0; i < TREE_COUNT; i++) {
  const tx = (Math.random()-0.5)*1600, tz = (Math.random()-0.5)*1600
  const ty = terrainH(tx, tz)
  const s = 0.7 + Math.random()*0.7
  _d.position.set(tx, ty+2*s, tz); _d.scale.setScalar(s); _d.rotation.y = Math.random()*Math.PI*2; _d.updateMatrix()
  trunkIM.setMatrixAt(i, _d.matrix)
  _d.position.set(tx, ty+7.5*s, tz); _d.updateMatrix()
  foliIM.setMatrixAt(i, _d.matrix)
}
trunkIM.instanceMatrix.needsUpdate = true; foliIM.instanceMatrix.needsUpdate = true
scene.add(trunkIM); scene.add(foliIM)

// ===== SUPPLY POINTS =====
const SUPPLY_POSITIONS: THREE.Vector3[] = [
  new THREE.Vector3( 420,  0,  180),
  new THREE.Vector3(-360,  0, -310),
  new THREE.Vector3( 100,  0, -520),
  new THREE.Vector3(-150,  0,  450),
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

// ===== FACTORIES =====
function createAircraft(bodyColor: number, darkColor: number): THREE.Group {
  const g = new THREE.Group()
  const mat = new THREE.MeshPhysicalMaterial({
    color: bodyColor, roughness: 0.08, metalness: 0.92,
    clearcoat: 1.0, clearcoatRoughness: 0.05, envMapIntensity: 1.2
  })
  const dark = new THREE.MeshPhysicalMaterial({
    color: darkColor, roughness: 0.18, metalness: 0.88,
    clearcoat: 0.5, clearcoatRoughness: 0.1
  })
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x99ccff, transparent: true, opacity: 0.28,
    roughness: 0.0, metalness: 0.0, transmission: 0.7, ior: 1.5
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

// ===== CLOUDS (volumetric-ish) =====
const cloudMat    = new THREE.MeshStandardMaterial({ color: 0xf2f8ff, roughness: 1, transparent: true, opacity: 0.86 })
const cloudMatLit = new THREE.MeshStandardMaterial({ color: 0xffeedd, roughness: 1, transparent: true, opacity: 0.60 })
for (let i = 0; i < 90; i++) {
  const cg = new THREE.Group()
  const count = 5 + Math.floor(Math.random() * 7)
  const useWarm = Math.random() < 0.25
  for (let j = 0; j < count; j++) {
    const r = 7 + Math.random() * 14
    const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 9), useWarm ? cloudMatLit : cloudMat)
    puff.position.set(j * 11 - count * 5.5 + (Math.random()-0.5)*8, (Math.random()-0.5)*8, (Math.random()-0.5)*14)
    puff.scale.set(1, 0.55, 1)
    cg.add(puff)
  }
  cg.position.set((Math.random()-0.5)*2000, 80 + Math.random()*220, (Math.random()-0.5)*2000)
  scene.add(cg)
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
player.position.set(0, 60, 0)
scene.add(player)
const cameraOffset = new THREE.Vector3(0, 5, 20)
const camQuat = new THREE.Quaternion()
let speed = 30

// ===== INPUT =====
const keys: Record<string, boolean> = {}
const keysJustPressed = new Set<string>()
window.addEventListener('keydown', e => {
  if (e.code === 'Tab') e.preventDefault()
  if (!keys[e.code]) keysJustPressed.add(e.code)
  keys[e.code] = true
})
window.addEventListener('keyup', e => { keys[e.code] = false })

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
    base.style.left = ox + 'px'; base.style.top = oy + 'px'; base.style.opacity = '1'
    knob.style.left = ox + 'px'; knob.style.top  = oy + 'px'; knob.style.opacity = '1'
  }, { passive: false })

  zone.addEventListener('touchmove', (e) => {
    e.preventDefault()
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== joyId) continue
      let dx = t.clientX - ox, dy = t.clientY - oy
      const d = Math.hypot(dx, dy)
      if (d > MAX_R) { dx = dx / d * MAX_R; dy = dy / d * MAX_R }
      touchState.yaw   =  dx / MAX_R
      touchState.pitch = -dy / MAX_R  // 上スワイプ→上昇
      knob.style.left = (ox + dx) + 'px'
      knob.style.top  = (oy + dy) + 'px'
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
interface Projectile { mesh: THREE.Object3D; vel: THREE.Vector3; life: number }
interface HomingMissile extends Projectile { mesh: THREE.Group; target: THREE.Object3D | null; diverted: boolean; spd: number }
interface Enemy { group: THREE.Group; health: number; orbitAngle: number; fireCooldown: number; missileAmmo: number; seekingSupply: boolean }
interface Explosion { particles: Array<{ mesh: THREE.Mesh; vel: THREE.Vector3 }>; life: number }

const bullets: Projectile[] = []
const playerMissiles: HomingMissile[] = []
const enemyMissiles: HomingMissile[] = []
const flares: Projectile[] = []
const enemies: Enemy[] = []
const explosions: Explosion[] = []

let missileAmmo = 6, flareAmmo = 8, score = 0
let gunCooldown = 0, pMissileCooldown = 0, flareCooldown = 0
let hitFlashTimer = 0, gunSoundCooldown = 0, trailFrame = 0
let lockedEnemy: Enemy | null = null
let playerHP = 3, invincibleTimer = 0, respawnFlash = 0
const MAX_HP = 3

const bulletMat = new THREE.MeshStandardMaterial({ color: 0xffee00, emissive: 0xffaa00, emissiveIntensity: 5.0, roughness: 0.2, metalness: 0 })
const playerMissileMat = new THREE.MeshStandardMaterial({ color: 0xccccdd, roughness: 0.35, metalness: 0.9 })
const enemyMissileMat = new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xcc2200, emissiveIntensity: 2.0, roughness: 0.5, metalness: 0.3 })
const _fwd = new THREE.Vector3(0, 0, -1)

// ===== LOCK-ON =====
function cycleLock() {
  if (!enemies.length) { lockedEnemy = null; return }
  if (!lockedEnemy || !enemies.includes(lockedEnemy)) {
    lockedEnemy = enemies.reduce((n, e) =>
      e.group.position.distanceTo(player.position) < n.group.position.distanceTo(player.position) ? e : n)
    return
  }
  const idx = enemies.indexOf(lockedEnemy)
  lockedEnemy = idx >= enemies.length - 1 ? null : enemies[idx + 1]
}

// ===== ENEMIES =====
function spawnEnemy() {
  const angle = Math.random() * Math.PI * 2
  const group = createAircraft(0xcc2222, 0x661111)
  group.position.set(Math.cos(angle) * (160 + Math.random() * 80), 45 + Math.random() * 45, Math.sin(angle) * (160 + Math.random() * 80))
  scene.add(group)
  enemies.push({ group, health: 2, orbitAngle: angle, fireCooldown: 5 + Math.random() * 5, missileAmmo: 4, seekingSupply: false })
}

function killEnemy(ei: number) {
  if (lockedEnemy === enemies[ei]) lockedEnemy = null
  createExplosion(enemies[ei].group.position.clone(), 2.0)
  playExplosionSound(1.5)
  scene.remove(enemies[ei].group)
  enemies.splice(ei, 1)
  score++; scoreEl.textContent = score.toString()
  setTimeout(() => spawnEnemy(), 4000)
}

for (let i = 0; i < 3; i++) spawnEnemy()

// ===== WEAPONS =====
function fireGun() {
  if (gunCooldown > 0) return
  gunCooldown = 0.08
  if (!audioReady) initAudio()

  const fwd = _fwd.clone().applyQuaternion(player.quaternion)
  let aimDir = fwd.clone()
  if (lockedEnemy) {
    const toT = lockedEnemy.group.position.clone().sub(player.position).normalize()
    if (fwd.angleTo(toT) < Math.PI / 6) aimDir = toT
  }

  for (const side of [-0.7, 0.7]) {
    const offset = new THREE.Vector3(side, 0, -3).applyQuaternion(player.quaternion)
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 5, 5), bulletMat)
    mesh.position.copy(player.position).add(offset)
    scene.add(mesh)
    bullets.push({ mesh, vel: aimDir.clone().multiplyScalar(230), life: 1.8 })
  }
  if (gunSoundCooldown <= 0) { playGunSound(); gunSoundCooldown = 0.06 }
}

function firePlayerMissile() {
  if (pMissileCooldown > 0 || missileAmmo <= 0) return
  if (!audioReady) initAudio()
  pMissileCooldown = 1.5; missileAmmo--
  missileEl.textContent = missileAmmo.toString()
  updatePips(missilePips, missileAmmo, 'on')

  const target: THREE.Object3D | null = lockedEnemy?.group ?? (() => {
    let nearest: THREE.Object3D | null = null, minD = Infinity
    for (const e of enemies) { const d = e.group.position.distanceTo(player.position); if (d < minD) { minD = d; nearest = e.group } }
    return nearest
  })()

  const mesh = createMissileModel(playerMissileMat)
  mesh.position.copy(player.position).add(new THREE.Vector3(0, -0.5, 2).applyQuaternion(player.quaternion))
  mesh.quaternion.copy(player.quaternion)
  scene.add(mesh)
  playerMissiles.push({ mesh, vel: _fwd.clone().applyQuaternion(player.quaternion).multiplyScalar(80), life: 12, target, diverted: false, spd: 95 })
  playMissileSound()
}

function fireEnemyMissile(enemy: Enemy) {
  if (enemy.missileAmmo <= 0) return
  enemy.missileAmmo--
  const mesh = createMissileModel(enemyMissileMat)
  mesh.position.copy(enemy.group.position)
  const toPlayer = player.position.clone().sub(enemy.group.position).normalize()
  mesh.quaternion.setFromUnitVectors(_fwd, toPlayer)
  scene.add(mesh)
  enemyMissiles.push({ mesh, vel: toPlayer.clone().multiplyScalar(70), life: 15, target: player, diverted: false, spd: 75 })
}

function dropFlare() {
  if (flareCooldown > 0 || flareAmmo <= 0) return
  if (!audioReady) initAudio()
  flareCooldown = 0.4; flareAmmo--
  flareEl.textContent = flareAmmo.toString()
  updatePips(flarePips, flareAmmo, 'flare-on')
  const mat = new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 6.0, roughness: 0.5 })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 7, 7), mat)
  mesh.position.copy(player.position).add(new THREE.Vector3(0, 0, 3).applyQuaternion(player.quaternion))
  scene.add(mesh)
  const backward = new THREE.Vector3(0, 0, 4).applyQuaternion(player.quaternion)
  backward.add(new THREE.Vector3((Math.random()-0.5)*30, -4+Math.random()*8, (Math.random()-0.5)*30))
  flares.push({ mesh, vel: backward, life: 7.0 })
  playFlareSound()
}

// ===== HOMING =====
function updateHoming(m: HomingMissile, dt: number) {
  if (!m.diverted) {
    let best = 120, bestFlare: Projectile | null = null
    for (const f of flares) { const d = f.mesh.position.distanceTo(m.mesh.position); if (d < best) { best = d; bestFlare = f } }
    if (bestFlare) { m.target = bestFlare.mesh; m.diverted = true }
  }
  if (m.target) {
    const dir = m.vel.clone().normalize().lerp(m.target.position.clone().sub(m.mesh.position).normalize(), 2.5 * dt).normalize()
    m.vel.copy(dir).multiplyScalar(m.spd)
  }
  m.life -= dt
  m.mesh.position.addScaledVector(m.vel, dt)
  if (m.vel.lengthSq() > 0.01) m.mesh.quaternion.setFromUnitVectors(_fwd, m.vel.clone().normalize())
}

// ===== EXPLOSIONS =====
function createExplosion(pos: THREE.Vector3, scale = 1.0) {
  const particles: Array<{ mesh: THREE.Mesh; vel: THREE.Vector3 }> = []
  const count = Math.floor(10 + scale * 8)
  for (let i = 0; i < count; i++) {
    const core = i < count * 0.5
    const mat = new THREE.MeshStandardMaterial({
      color: core ? 0xff5500 : 0xffcc00,
      emissive: core ? 0xff2200 : 0xff8800,
      emissiveIntensity: 4.0, roughness: 0.8, transparent: true, opacity: 1
    })
    const mesh = new THREE.Mesh(new THREE.SphereGeometry((0.2 + Math.random() * 0.6) * scale, 5, 5), mat)
    mesh.position.copy(pos)
    scene.add(mesh)
    particles.push({ mesh, vel: new THREE.Vector3((Math.random() - 0.5) * 28 * scale, Math.random() * 18 * scale, (Math.random() - 0.5) * 28 * scale) })
  }
  // Flash point light at explosion
  const flash = new THREE.PointLight(0xff6600, 8 * scale, 60)
  flash.position.copy(pos)
  scene.add(flash)
  setTimeout(() => scene.remove(flash), 200)
  explosions.push({ particles, life: 1.3 })
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
    if (arr[i].life <= 0) { onExpire(arr[i]); scene.remove(arr[i].mesh); arr.splice(i, 1) }
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
      tx = player.position.x + Math.cos(enemy.orbitAngle) * r
      tz = player.position.z + Math.sin(enemy.orbitAngle) * r
      ty = player.position.y + 8 + Math.sin(enemy.orbitAngle * 0.6) * 20

      enemy.fireCooldown -= dt
      if (enemy.fireCooldown <= 0) {
        if (enemy.missileAmmo > 0) {
          enemy.fireCooldown = 5 + Math.random() * 4
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
      enemy.group.position.addScaledVector(dir, 30 * dt)
      const flat = new THREE.Vector3(dir.x, 0, dir.z)
      if (flat.lengthSq() > 0.01) enemy.group.quaternion.slerp(
        new THREE.Quaternion().setFromUnitVectors(_fwd, flat.normalize()), 0.12
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
  if (++trailFrame % 2 !== 0 || speed < 5) return
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
    for (let ei = enemies.length - 1; ei >= 0; ei--) {
      if (playerMissiles[mi].mesh.position.distanceTo(enemies[ei].group.position) < 6) {
        createExplosion(playerMissiles[mi].mesh.position.clone(), 1.5); playExplosionSound(1.2)
        scene.remove(playerMissiles[mi].mesh); playerMissiles.splice(mi, 1)
        killEnemy(ei); break
      }
    }
  }
  for (let mi = enemyMissiles.length - 1; mi >= 0; mi--) {
    const m = enemyMissiles[mi]
    if (m.mesh.position.distanceTo(player.position) < 4) {
      createExplosion(m.mesh.position.clone(), 1.0); playExplosionSound(0.8)
      scene.remove(m.mesh); enemyMissiles.splice(mi, 1)
      if (invincibleTimer <= 0) {
        playerHP = Math.max(0, playerHP - 1)
        hitFlashTimer = 0.5
        updateHPDisplay()
        if (playerHP <= 0) respawnPlayer()
      }
      continue
    }
    if (m.diverted) {
      for (let fi = flares.length - 1; fi >= 0; fi--) {
        if (m.mesh.position.distanceTo(flares[fi].mesh.position) < 12) {
          createExplosion(m.mesh.position.clone(), 0.6)
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
const boostFill  = document.getElementById('boost-fill') as HTMLDivElement
const missilePips = document.getElementById('missile-pips')!
const flarePips   = document.getElementById('flare-pips')!
const hpFill  = document.getElementById('hp-fill') as HTMLDivElement
const hpText  = document.getElementById('hp-text')!
const radarCanvas = document.getElementById('radar') as HTMLCanvasElement
const radarCtx = radarCanvas.getContext('2d')!

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
  if (!lockedEnemy) { reticleEl.style.display = 'none'; return }
  const pos = lockedEnemy.group.position.clone()
  if (pos.clone().sub(camera.position).dot(_fwd.clone().applyQuaternion(camera.quaternion)) < 0) { reticleEl.style.display = 'none'; return }
  pos.project(camera)
  reticleEl.style.display = 'block'
  reticleEl.style.left = ((pos.x + 1) / 2 * window.innerWidth) + 'px'
  reticleEl.style.top = ((-pos.y + 1) / 2 * window.innerHeight) + 'px'
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

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  composer?.setSize(window.innerWidth, window.innerHeight)
})

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
  player.position.set(0, 80, 0)
  player.quaternion.identity()
  camQuat.identity()
  speed = 30
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
    const rx = rel.x * Math.cos(-heading) - rel.z * Math.sin(-heading)
    const rz = rel.x * Math.sin(-heading) + rel.z * Math.cos(-heading)
    const scale = Math.min(1, Math.hypot(rx, rz) / RADAR_RANGE)
    const norm = Math.hypot(rx, rz) > 0.01 ? Math.hypot(rx, rz) : 1
    return [cx + (rx / norm) * scale * RADAR_R, cy - (rz / norm) * scale * RADAR_R]
  }

  // 補給ポイント（緑菱形）
  for (const sp of SUPPLY_POSITIONS) {
    if (sp.distanceTo(player.position) > RADAR_RANGE * 1.2) continue
    const [px, py] = worldToRadar(sp)
    ctx.fillStyle = '#0fa'
    ctx.beginPath(); ctx.moveTo(px, py-4); ctx.lineTo(px+3, py); ctx.lineTo(px, py+4); ctx.lineTo(px-3, py); ctx.closePath(); ctx.fill()
  }

  // 敵（赤丸、ロック中は黄色）
  for (const e of enemies) {
    if (e.group.position.distanceTo(player.position) > RADAR_RANGE * 1.2) continue
    const [px, py] = worldToRadar(e.group.position)
    ctx.fillStyle = e === lockedEnemy ? '#ff0' : (e.seekingSupply ? '#f80' : '#f44')
    ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill()
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

  const boost = !!keys['Space'] || touchState.boost
  speed += ((boost ? 58 : 30) - speed) * dt * 2

  const keyPitch = (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0) - (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0)
  const keyYaw   = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0)
  const tPitch = Math.abs(touchState.pitch) > 0.08 ? touchState.pitch : 0
  const tYaw   = Math.abs(touchState.yaw)   > 0.08 ? touchState.yaw   : 0
  const pitchInput = keyPitch || tPitch
  const rollInput  = keyYaw   || tYaw

  // ピッチ：機体ローカル軸で前後
  if (pitchInput !== 0)
    player.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0), pitchInput * 2.8 * dt))

  // ヨー：世界Y軸基準（premultiply）→ 機体の傾きに関係なく画面左右に動く
  if (rollInput !== 0)
    player.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0), -rollInput * 2.2 * dt))

  // ロール自動水平復帰：ピッチ入力中はループを妨げないよう無効化
  if (pitchInput === 0) {
    const _euler = new THREE.Euler().setFromQuaternion(player.quaternion, 'YXZ')
    _euler.z *= 0.82
    player.quaternion.setFromEuler(_euler)
  }
  player.quaternion.normalize()

  player.position.addScaledVector(_fwd.clone().applyQuaternion(player.quaternion), speed * dt)
  player.position.y = Math.max(terrainH(player.position.x, player.position.z) + 4, player.position.y)

  // Engine glow follows player
  engineLight.position.copy(player.position).add(new THREE.Vector3(0, 0, 2).applyQuaternion(player.quaternion))
  engineLight.intensity = boost ? 8 : 4

  gunCooldown = Math.max(0, gunCooldown - dt)
  pMissileCooldown = Math.max(0, pMissileCooldown - dt)
  flareCooldown = Math.max(0, flareCooldown - dt)
  gunSoundCooldown = Math.max(0, gunSoundCooldown - dt)

  if (keysJustPressed.has('Tab') || touchState.lockPressed) cycleLock()
  if (keysJustPressed.has('Escape')) lockedEnemy = null
  if (keys['KeyZ'] || touchState.gun) fireGun()
  if (keysJustPressed.has('KeyX') || touchState.missilePressed) firePlayerMissile()
  if (keys['KeyC'] || touchState.flarePressed) dropFlare()
  keysJustPressed.clear()
  touchState.missilePressed = false
  touchState.flarePressed   = false
  touchState.lockPressed    = false

  updateBullets(dt)
  updateMissileArr(playerMissiles, dt, m => createExplosion(m.mesh.position.clone(), 0.6))
  updateMissileArr(enemyMissiles, dt, m => createExplosion(m.mesh.position.clone(), 0.5))
  updateFlares(dt)
  updateEnemies(dt)
  checkCollisions()
  updateExplosions(dt)
  updateContrails()
  updateSupplyPoints(dt)

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
  const desiredCamPos = cameraOffset.clone().applyQuaternion(player.quaternion).add(player.position)
  camera.position.lerp(desiredCamPos, 0.12)
  const playerUp = new THREE.Vector3(0, 1, 0).applyQuaternion(player.quaternion)
  const lookM = new THREE.Matrix4().lookAt(camera.position, player.position, playerUp)
  const tQ = new THREE.Quaternion().setFromRotationMatrix(lookM)
  if (camQuat.dot(tQ) < 0) { tQ.x = -tQ.x; tQ.y = -tQ.y; tQ.z = -tQ.z; tQ.w = -tQ.w }
  camQuat.slerp(tQ, 0.12)
  camera.quaternion.copy(camQuat)

  // 速度によるFOV拡大
  const targetFOV = 65 + (speed / 58) * 20 + (boost ? 6 : 0)
  camera.fov += (targetFOV - camera.fov) * dt * 4
  camera.updateProjectionMatrix()

  if (audioReady) updateEngineSound(speed, boost)

  hitFlashTimer -= dt
  hitOverlay.style.opacity = hitFlashTimer > 0 ? (hitFlashTimer / 0.5).toString() : '0'

  speedEl.textContent = Math.round(speed * 3.6).toString()
  altEl.textContent = Math.round(player.position.y).toString()
  boostFill.style.width = `${Math.min(100, (speed / 58) * 100)}%`
  updateReticle()
  updateWarning()
  drawRadar()

  waterUniforms.time.value += dt

  if (composer) {
    try { composer.render() }
    catch(e) { composer = null; renderer.render(scene, camera) }
  } else {
    renderer.render(scene, camera)
  }
}
loop()
