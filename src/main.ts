import * as THREE from 'three'
import { Sky } from 'three/addons/objects/Sky.js'
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'

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

// ===== SCENE =====
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x9ccfe4)
// 空気遠近法：近景は明確に、地平線だけ霞む
scene.fog = new THREE.Fog(0x9ccfe4, 1700, 6900)

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
const sun = new THREE.DirectionalLight(0xfff4de, 3.7)
sun.position.copy(sunVec).multiplyScalar(600)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)  // 4096→2048で軽量化（品質十分）
sun.shadow.camera.near = 1; sun.shadow.camera.far = 2000
sun.shadow.camera.left = -600; sun.shadow.camera.right = 600
sun.shadow.camera.top = 600; sun.shadow.camera.bottom = -600
sun.shadow.bias = -0.0004
scene.add(sun)
// 環境光：やや青みがかった空の反射
scene.add(new THREE.AmbientLight(0x4668aa, 0.42))
// 半球光：空→地面のグラデーション（草の照り返し）
scene.add(new THREE.HemisphereLight(0x9fd4ff, 0x436d2c, 1.35))
// バックフィル：影部分を自然に（逆方向から弱く）
const fillLight = new THREE.DirectionalLight(0x6688bb, 0.4)
fillLight.position.set(-sunVec.x, sunVec.y * 0.3, -sunVec.z).multiplyScalar(400)
scene.add(fillLight)

// Engine glow light (moves with player)
const engineLight = new THREE.PointLight(0xff6600, 4, 25)
scene.add(engineLight)


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

function ridgedNoise(x: number, z: number, octaves = 4): number {
  let total = 0, amp = 0.55, freq = 1, norm = 0
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise(x * freq, z * freq) * 2 - 1)
    total += n * n * amp
    norm += amp
    amp *= 0.52
    freq *= 2.11
  }
  return total / norm
}

function mound(x: number, z: number, cx: number, cz: number, radius: number, height: number, power = 1.7): number {
  const d = Math.hypot(x - cx, z - cz)
  return Math.pow(Math.max(0, 1 - d / radius), power) * height
}

function mesa(x: number, z: number, cx: number, cz: number, radius: number, height: number): number {
  const d = Math.hypot(x - cx, z - cz)
  const shoulder = 1 - smoothstep(radius * 0.52, radius, d)
  const crown = 1 - smoothstep(radius * 0.18, radius * 0.48, d)
  return (shoulder * 0.72 + crown * 0.28) * height
}

function terrainH(x: number, z: number): number {
  const broad = fbm(x * 0.00055 + 12.4, z * 0.00055 - 7.8, 5)
  const mid = fbm(x * 0.0018 - 33.0, z * 0.0018 + 21.0, 4)
  const detail = fbm(x * 0.0065 + 5.1, z * 0.0065 - 18.2, 3)
  const ridges = ridgedNoise(x * 0.00115 - 14.2, z * 0.00115 + 6.8, 5)
  let h = -55
    + (broad - 0.38) * 260
    + (mid - 0.5) * 86
    + (detail - 0.5) * 24
    + Math.pow(ridges, 2.05) * 155

  const riverX = 210 + Math.sin(z * 0.00125) * 340 + Math.sin(z * 0.0036 + 1.1) * 95
  const riverDist = Math.abs(x - riverX)
  const gorge = 1 - smoothstep(95, 420, riverDist)
  const rim = Math.exp(-Math.pow((riverDist - 285) / 95, 2))
  h -= gorge * 178
  h += rim * 45

  h -= mound(x, z, -520, 740, 560, 92, 1.85)
  h += mesa(x, z, -1220, 820, 640, 165)
  h += mesa(x, z, 1180, 410, 520, 145)
  h += mesa(x, z, 820, -1180, 480, 132)
  h += mound(x, z, -1650, -250, 740, 150, 1.35)
  h += mound(x, z, 1600, 1190, 640, 134, 1.45)

  // 渓谷1: x≈400 に沿ってN-S方向（ミサイル回避の主要ルート）
  const d1 = Math.abs(x - 400)
  if (d1 < 140) h -= Math.pow(Math.max(0, 1 - d1/140), 1.8) * 110

  // 渓谷2: 斜め（北西〜南東）
  const d2 = Math.abs(x * 0.8 + z * 0.6 + 300)
  if (d2 < 110) h -= Math.pow(Math.max(0, 1 - d2/110), 1.8) * 85

  // 西部高台（安全地帯）
  const pd = Math.hypot(x + 400, z - 650)
  if (pd < 380) h += Math.pow(Math.max(0, 1 - pd/380), 1.5) * 62

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

const terrainGeo = new THREE.PlaneGeometry(9000, 9000, 256, 256)
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
  if (y < -45)      { r=0.30+v; g=0.25+v; b=0.22 }   // 深谷岩盤
  else if (y < -5)  { r=0.22+v; g=0.48+v; b=0.35 }   // 渓谷底・湿岩
  else if (y < 8)   { r=0.28+v; g=0.74+v; b=0.22 }   // 低地草原
  else if (y < 25)  { r=0.24+v; g=0.63+v; b=0.17 }   // 中腹草
  else if (y < 48)  { r=0.26+v; g=0.56+v; b=0.14+v } // 高丘
  else if (y < 75)  { r=0.54+v; g=0.46+v; b=0.28+v } // 岩場
  else if (y < 105) { r=0.70+v; g=0.67+v; b=0.62 }   // 高山
  else              { r=0.90+v; g=0.89+v; b=0.94 }    // 雪頂
  tCol[i*3]   = Math.max(0, Math.min(1, r))
  tCol[i*3+1] = Math.max(0, Math.min(1, g))
  tCol[i*3+2] = Math.max(0, Math.min(1, b))

  const gradX = terrainH(x + 18, z) - terrainH(x - 18, z)
  const gradZ = terrainH(x, z + 18) - terrainH(x, z - 18)
  const slope = clamp01(Math.hypot(gradX, gradZ) / 56)
  const freckles = (fbm(x * 0.018 + 7, z * 0.018 - 11, 3) - 0.5) * 0.12
  if (y < WATER_LEVEL + 2.5) {
    r = 0.55 + freckles; g = 0.48 + freckles * 0.6; b = 0.32
  } else if (y < 13) {
    r = 0.49 + freckles; g = 0.67 + freckles; b = 0.31
  } else if (y < 45) {
    r = 0.28 + freckles; g = 0.58 + freckles; b = 0.22
  } else if (y < 92) {
    r = 0.36 + freckles; g = 0.50 + freckles * 0.8; b = 0.25
  } else if (y < 145) {
    r = 0.53 + freckles; g = 0.48 + freckles; b = 0.37 + freckles * 0.4
  } else {
    r = 0.80 + freckles * 0.4; g = 0.78 + freckles * 0.4; b = 0.76 + freckles * 0.6
  }
  const rock = clamp01(slope * 1.45 + smoothstep(72, 138, y) * 0.4)
  r = THREE.MathUtils.lerp(r, 0.47 + freckles, rock)
  g = THREE.MathUtils.lerp(g, 0.43 + freckles, rock)
  b = THREE.MathUtils.lerp(b, 0.37 + freckles, rock)
  const snow = smoothstep(168, 230, y)
  tCol[i*3]   = clamp01(THREE.MathUtils.lerp(r, 0.92, snow))
  tCol[i*3+1] = clamp01(THREE.MathUtils.lerp(g, 0.93, snow))
  tCol[i*3+2] = clamp01(THREE.MathUtils.lerp(b, 0.96, snow))
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
  (() => { const g = new THREE.PlaneGeometry(3600, 3600, 72, 72); g.rotateX(-Math.PI/2); return g })(),
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

;[[-1420,-1180,520,310], [980,-1280,470,280], [-520,1420,430,260],
  [1450, 640,560,330], [-1580, 420,500,300], [680,-1560,390,240],
  [-980,-1540,360,220], [1300,1360,520,315], [-1540,1120,430,265],
  [160,1640,390,245], [-1900,-220,620,360], [1840,-320,540,325],
  [-680,-1840,410,250], [1180,-880,360,220], [-1180,760,450,275],
  [2300, 920,610,370], [-2450, -980,560,335],
].forEach(([x,z,h,r], i) => {
  const base = terrainH(x,z)
  const body = new THREE.Mesh(makeMountainGeometry(r, h, i * 13.37 + 2.5), mountainMat)
  body.position.set(x, base + h/2 - 10, z)
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
  if (ty > 165 || treeSlope > 2.2 || (fbm(tx * 0.0015 + 8, tz * 0.0015 - 4, 3) < 0.34 && Math.random() < 0.75)) { i--; continue }
  if (ty < 3) { i--; continue }  // 水面下・渓谷底には植樹しない
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

// ===== ROCK PILLARS =====
const pillarMat    = new THREE.MeshStandardMaterial({ color: 0x7a6855, roughness: 0.96, metalness: 0 })
const pillarCapMat = new THREE.MeshStandardMaterial({ color: 0x9a8870, roughness: 0.93, metalness: 0 })

function makePillarGeometry(bottom: number, top: number, height: number, sides: number, seed: number): THREE.CylinderGeometry {
  const geo = new THREE.CylinderGeometry(top, bottom, height, sides, 5)
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i)
    const angle = Math.atan2(pz, px)
    const level = clamp01((py + height / 2) / height)
    const rough = 1 + Math.sin(angle * 3.5 + seed + level * 1.7) * 0.16 + Math.sin(angle * 8.2 - seed) * 0.05
    pos.setX(i, px * rough)
    pos.setZ(i, pz * rough)
  }
  geo.computeVertexNormals()
  return geo
}

const PILLAR_CLUSTERS: Array<{ cx:number; cz:number; n:number }> = [
  { cx:  430, cz:  550, n: 14 },  // 渓谷1 北出口
  { cx:  380, cz: -250, n: 12 },  // 渓谷1 南
  { cx: -180, cz: -400, n: 11 },  // 斜め渓谷沿い
  { cx:  860, cz:  280, n:  9 },  // 東平原
  { cx: -560, cz:  320, n:  8 },  // 高台西麓
]
for (const cl of PILLAR_CLUSTERS) {
  for (let j = 0; j < cl.n; j++) {
    const px = cl.cx + (Math.random()-0.5) * 250
    const pz = cl.cz + (Math.random()-0.5) * 250
    const ph = terrainH(px, pz)
    const ht = 40 + Math.random() * 70
    const rb = 8 + Math.random() * 14
    const rt = rb * (0.38 + Math.random() * 0.32)
    const sides = 5 + Math.floor(Math.random() * 3)
    const body = new THREE.Mesh(makePillarGeometry(rb, rt, ht, sides, px * 0.017 + pz * 0.011), pillarMat)
    body.position.set(px, ph + ht/2, pz); body.rotation.y = Math.random()*Math.PI; body.castShadow = true; scene.add(body)
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(rt*0.45, rt*1.15, rb*0.55, sides), pillarCapMat)
    cap.position.set(px, ph + ht + rb*0.28, pz); cap.rotation.y = Math.random()*Math.PI; cap.castShadow = true; scene.add(cap)
  }
}

// 孤立高塔（遠くから見えるランドマーク）
;[[410,-600,120,12],[-820,420,140,10],[1300,-100,110,14]].forEach(([px,pz,ht,rb]) => {
  const ph = terrainH(px, pz)
  const body = new THREE.Mesh(makePillarGeometry(rb, rb * 0.3, ht, 6, px * 0.021 + pz * 0.017), pillarMat)
  body.position.set(px, ph+ht/2, pz); body.castShadow=true; scene.add(body)
})

// ===== ARCHES =====
const archMat = new THREE.MeshStandardMaterial({ color: 0x6a5848, roughness: 0.97, metalness: 0 })
function mkArch(x: number, z: number, w: number, h: number, thick: number, rotY: number) {
  const base = terrainH(x, z)
  const g = new THREE.Group()
  const pillarGeo = makePillarGeometry(thick * 0.72, thick * 0.45, h, 7, x * 0.01 + z * 0.02)
  const lp = new THREE.Mesh(pillarGeo, archMat); lp.position.set(-w/2, h/2, 0); lp.castShadow=true; lp.receiveShadow=true; g.add(lp)
  const rp = new THREE.Mesh(pillarGeo.clone(), archMat); rp.position.set(w/2, h/2, 0); rp.castShadow=true; rp.receiveShadow=true; g.add(rp)
  const crown = new THREE.Mesh(new THREE.TorusGeometry(w * 0.5, thick * 0.42, 8, 32, Math.PI), archMat)
  crown.position.set(0, h, 0)
  crown.castShadow = true
  crown.receiveShadow = true
  g.add(crown)
  g.position.set(x, base, z); g.rotation.y = rotY; scene.add(g)
}
// 渓谷1内（Z方向に飛行で通過）
mkArch( 405,  130, 90, 55, 17, 0)
mkArch( 395, -110, 82, 50, 16, 0.08)
mkArch( 420,  580, 95, 60, 18, 0.05)
// 斜め渓谷内（-0.64 rad で進行方向に正対）
mkArch(-160, -310, 86, 52, 16, -0.64)
mkArch(-240, -470, 78, 48, 15, -0.60)
// 平原・高地の孤立アーチ
mkArch( 700,  420, 98, 64, 20, 1.3)
mkArch(-680,   30, 80, 52, 16, -0.5)

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
  if (by < WATER_LEVEL + 5 || by > 190 || slope > 3.1) { i--; continue }
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
  new THREE.Vector3( 408,  0,  420),   // 渓谷1底（低高度・危険だが隠れやすい）
  new THREE.Vector3(-370,  0,  680),   // 西部高台（高高度・広い視界）
  new THREE.Vector3( 960,  0, -180),   // 山岳基地（中高度）
  new THREE.Vector3(-850,  0, -320),   // 海岸平野（低高度・開けた場所）
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

// ===== CENTER AREA STRUCTURES（マップ中央の建造物・廃墟） =====
;(() => {
  const conMat = new THREE.MeshStandardMaterial({ color: 0x8a7e6e, roughness: 0.94, metalness: 0.0 })
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x5a6a78, roughness: 0.72, metalness: 0.55 })
  // 格納庫群
  const structs: [number, number, number, number, number][] = [
    [75, 0, 55, 38, 16], [-85, 0, -35, 32, 13], [155, 0, 25, 24, 11],
    [155, 0, 72, 24, 11], [-130, 0, 105, 28, 14], [-55, 0, 125, 18, 9],
    [95, 0, -130, 20, 9], [-10, 0, -90, 26, 12],
  ]
  for (const [x, _y, z, w, h] of structs) {
    void _y
    const ty = terrainH(x, z)
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 1.6), conMat)
    m.position.set(x, ty + h/2, z); m.rotation.y = Math.random() * 0.5 - 0.25
    m.castShadow = true; m.receiveShadow = true; scene.add(m)
  }
  // 管制塔
  const tx = 48, tz = -75, ty = terrainH(tx, tz)
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.5, 38, 8), metalMat)
  tower.position.set(tx, ty + 19, tz); tower.castShadow = true; scene.add(tower)
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 2.5, 4, 8), metalMat)
  cap.position.set(tx, ty + 40, tz); scene.add(cap)
  // 防壁リング
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, r = 185 + Math.random() * 45
    const wx = Math.cos(a) * r, wz = Math.sin(a) * r
    const wy = terrainH(wx, wz)
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.2, 5 + Math.random() * 4, 14 + Math.random() * 8), conMat)
    wall.position.set(wx, wy + 4, wz); wall.rotation.y = a + Math.PI/2
    wall.castShadow = true; scene.add(wall)
  }
})()

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
const cloudMat    = new THREE.MeshStandardMaterial({ color: 0xf2f8ff, roughness: 1, transparent: true, opacity: 0.78 })
const cloudMatLit = new THREE.MeshStandardMaterial({ color: 0xffeedd, roughness: 1, transparent: true, opacity: 0.56 })
for (let i = 0; i < 130; i++) {
  const cg = new THREE.Group()
  const count = 5 + Math.floor(Math.random() * 7)
  const useWarm = Math.random() < 0.25
  for (let j = 0; j < count; j++) {
    const r = 9 + Math.random() * 21
    const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 9), useWarm ? cloudMatLit : cloudMat)
    puff.position.set(j * 11 - count * 5.5 + (Math.random()-0.5)*8, (Math.random()-0.5)*8, (Math.random()-0.5)*14)
    puff.scale.set(1, 0.55, 1)
    cg.add(puff)
  }
  cg.position.set((Math.random()-0.5)*5200, 230 + Math.random()*470, (Math.random()-0.5)*5200)
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
player.position.set(0, terrainH(0, 0) + 90, 0)
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
type GameMode = 'dogfight' | 'base' | 'fleet' | 'bomber' | 'tank' | 'free'
let currentMode: GameMode | null = null
let missionComplete = false
let modeObjectiveTotal = 0
let modeObjectiveKilled = 0

interface Projectile { mesh: THREE.Object3D; vel: THREE.Vector3; life: number }
interface HomingMissile extends Projectile { mesh: THREE.Group; target: THREE.Object3D | null; diverted: boolean; spd: number; turnRate: number; light: THREE.PointLight | null }
interface Enemy { group: THREE.Group; health: number; orbitAngle: number; fireCooldown: number; missileAmmo: number; seekingSupply: boolean }
interface Explosion { particles: Array<{ mesh: THREE.Mesh; vel: THREE.Vector3 }>; life: number }
interface GroundTarget { group: THREE.Group; health: number; maxHealth: number; vel: THREE.Vector3 }

const bullets: Projectile[] = []
const playerMissiles: HomingMissile[] = []
const enemyMissiles: HomingMissile[] = []
const flares: Projectile[] = []
const enemies: Enemy[] = []
const explosions: Explosion[] = []
const groundTargets: GroundTarget[] = []

let missileAmmo = 6, flareAmmo = 8, score = 0
let gunCooldown = 0, pMissileCooldown = 0, flareCooldown = 0
let hitFlashTimer = 0, gunSoundCooldown = 0, trailFrame = 0
let lockedEnemy: Enemy | null = null
let playerHP = 3, invincibleTimer = 0, respawnFlash = 0
const MAX_HP = 3

const bulletMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffdd00, emissiveIntensity: 18.0, roughness: 0.1, metalness: 0 })
const playerMissileMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff8800, emissiveIntensity: 6.0, roughness: 0.3, metalness: 0.7 })
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
  const sx = Math.cos(angle) * (190 + Math.random() * 180)
  const sz = Math.sin(angle) * (190 + Math.random() * 180)
  group.position.set(sx, terrainH(sx, sz) + 75 + Math.random() * 55, sz)
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
  if (currentMode === 'dogfight') setTimeout(() => spawnEnemy(), 4000)
}

// 敵はstartGame()で生成される

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
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 6), bulletMat)
    mesh.position.copy(player.position).add(offset)
    scene.add(mesh)
    bullets.push({ mesh, vel: aimDir.clone().multiplyScalar(230), life: 1.8 })
  }
  if (gunSoundCooldown <= 0) { playGunSound(); gunSoundCooldown = 0.06 }
  // 砲口フラッシュ
  const mFlash = new THREE.PointLight(0xffee00, 10, 30)
  mFlash.position.copy(player.position).add(new THREE.Vector3(0, 0, -3.5).applyQuaternion(player.quaternion))
  scene.add(mFlash)
  setTimeout(() => scene.remove(mFlash), 55)
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
    for (const gt of groundTargets) { const d = gt.group.position.distanceTo(player.position); if (d < minD) { minD = d; nearest = gt.group } }
    return nearest
  })()

  const mesh = createMissileModel(playerMissileMat)
  mesh.position.copy(player.position).add(new THREE.Vector3(0, -0.5, 2).applyQuaternion(player.quaternion))
  mesh.quaternion.copy(player.quaternion)
  scene.add(mesh)
  const mLight = new THREE.PointLight(0xff8800, 6, 55)
  mLight.position.copy(mesh.position)
  scene.add(mLight)
  playerMissiles.push({ mesh, vel: _fwd.clone().applyQuaternion(player.quaternion).multiplyScalar(80), life: 12, target, diverted: false, spd: 95, turnRate: 1.8, light: mLight })
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
  enemyMissiles.push({ mesh, vel: toPlayer.clone().multiplyScalar(70), life: 15, target: player, diverted: false, spd: 75, turnRate: 1.4, light: null })
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

// ===== GROUND TARGET MODELS =====
function createBaseTarget(): THREE.Group {
  const g = new THREE.Group()
  const bldMat = new THREE.MeshStandardMaterial({ color: 0x556644, roughness: 0.92, metalness: 0.1 })
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a4432, roughness: 0.95 })
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(20, 14, 26), bldMat); b1.position.y = 7; b1.castShadow = true; g.add(b1)
  const b2 = new THREE.Mesh(new THREE.BoxGeometry(12, 9, 16), bldMat); b2.position.set(-15, 4.5, 5); b2.castShadow = true; g.add(b2)
  const b3 = new THREE.Mesh(new THREE.BoxGeometry(10, 7, 18), bldMat); b3.position.set(14, 3.5, -6); b3.castShadow = true; g.add(b3)
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 22, 8), roofMat); tower.position.set(0, 18, 0); g.add(tower)
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 1, 12), roofMat); dish.position.set(0, 30, 0); g.add(dish)
  return g
}

function createShipTarget(): THREE.Group {
  const g = new THREE.Group()
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x2a3d52, roughness: 0.7, metalness: 0.5 })
  const superMat = new THREE.MeshStandardMaterial({ color: 0x3d5568, roughness: 0.65, metalness: 0.4 })
  const hull = new THREE.Mesh(new THREE.BoxGeometry(16, 5, 65), hullMat); hull.position.y = 2.5; hull.castShadow = true; g.add(hull)
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(11, 9, 22), superMat); bridge.position.set(0, 10, -8); bridge.castShadow = true; g.add(bridge)
  const top = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 12), superMat); top.position.set(0, 17, -8); g.add(top)
  for (const tz of [-24, 24]) {
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3.5, 8), hullMat); gun.position.set(0, 7, tz); g.add(gun)
  }
  return g
}

function createTankTarget(): THREE.Group {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x4a5a38, roughness: 0.88, metalness: 0.2 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(7, 3, 11), mat); body.position.y = 2; body.castShadow = true; g.add(body)
  const turret = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.5, 5), mat); turret.position.set(0, 4.8, -0.5); g.add(turret)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 9, 6), mat)
  barrel.rotation.x = Math.PI/2; barrel.position.set(0, 4.8, -5.5); g.add(barrel)
  return g
}

function createBomberModel(): THREE.Group {
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
  lockedEnemy = null
  score = 0; scoreEl.textContent = '0'
  missileAmmo = 6; flareAmmo = 8
  playerHP = MAX_HP; invincibleTimer = 0
  updateHPDisplay()
  updatePips(missilePips, missileAmmo, 'on')
  updatePips(flarePips, flareAmmo, 'flare-on')

  document.getElementById('mode-screen')!.style.display = 'none'
  document.getElementById('mission-complete')!.style.display = 'none'
  document.getElementById('objective-hud')!.style.display = 'block'

  switch (mode) {
    case 'dogfight':
      modeObjectiveTotal = 0
      setObjective('敵機を撃墜せよ — SCORE: 0')
      for (let i = 0; i < 3; i++) spawnEnemy()
      break
    case 'base':
      modeObjectiveTotal = 5
      setObjective(`地上基地を破壊 0 / 5`)
      spawnBases()
      for (let i = 0; i < 2; i++) spawnEnemy()
      break
    case 'fleet':
      modeObjectiveTotal = 4
      setObjective(`艦船を撃沈 0 / 4`)
      spawnShips()
      break
    case 'bomber':
      modeObjectiveTotal = 3
      setObjective(`爆撃機を迎撃 0 / 3`)
      spawnBombers()
      break
    case 'tank':
      modeObjectiveTotal = 5
      setObjective(`戦車を撃破 0 / 5`)
      spawnTanks()
      break
    case 'free':
      modeObjectiveTotal = 0
      setObjective('フリーフライト')
      break
  }
}

function spawnBases() {
  const positions: [number, number, number][] = [
    [380, 0, 200], [-280, 0, -360], [550, 0, -160], [-480, 0, 280], [120, 0, -520]
  ]
  for (const [bx, by, bz] of positions) {
    const ty = terrainH(bx, bz); void by
    const group = createBaseTarget()
    group.position.set(bx, ty, bz)
    group.rotation.y = Math.random() * Math.PI * 2
    scene.add(group)
    groundTargets.push({ group, health: 30, maxHealth: 30, vel: new THREE.Vector3() })
  }
}

function spawnShips() {
  const positions: [number, number][] = [[-180, -220], [140, -310], [-310, 90], [240, 180]]
  for (const [sx, sz] of positions) {
    const group = createShipTarget()
    group.position.set(sx, WATER_LEVEL + 2.5, sz)
    group.rotation.y = Math.random() * Math.PI * 2
    scene.add(group)
    groundTargets.push({ group, health: 40, maxHealth: 40, vel: new THREE.Vector3() })
  }
}

function spawnBombers() {
  for (let i = 0; i < 3; i++) {
    const group = createBomberModel()
    group.position.set(-2200, 160 + i * 28, -600 + i * 240)
    group.rotation.y = -Math.PI / 2
    scene.add(group)
    groundTargets.push({ group, health: 55, maxHealth: 55, vel: new THREE.Vector3(42, 0, 0) })
  }
}

function spawnTanks() {
  const positions: [number, number][] = [[110, 90], [-160, 210], [200, -90], [-200, -160], [60, -200]]
  for (const [tx, tz] of positions) {
    const ty = terrainH(tx, tz)
    const group = createTankTarget()
    group.position.set(tx, ty, tz)
    group.rotation.y = Math.random() * Math.PI * 2
    scene.add(group)
    groundTargets.push({ group, health: 20, maxHealth: 20, vel: new THREE.Vector3() })
  }
}

function updateGroundTargets(dt: number) {
  for (const gt of groundTargets) {
    if (gt.vel.lengthSq() < 0.01) continue
    gt.group.position.addScaledVector(gt.vel, dt)
    if (gt.vel.y === 0) {
      gt.group.position.y = terrainH(gt.group.position.x, gt.group.position.z)
      gt.group.rotation.y = Math.atan2(gt.vel.x, gt.vel.z) + Math.PI
    }
    // 爆撃機がマップ端に達したらループ
    if (gt.group.position.x > 2400) gt.group.position.x = -2400
  }
}

function destroyGroundTarget(gi: number) {
  const gt = groundTargets[gi]
  createExplosion(gt.group.position.clone(), 2.5)
  playExplosionSound(2.0)
  scene.remove(gt.group)
  groundTargets.splice(gi, 1)
  modeObjectiveKilled++
  score++; scoreEl.textContent = score.toString()
  if (currentMode === 'dogfight' || currentMode === 'free') return
  setObjective(`目標を破壊 ${modeObjectiveKilled} / ${modeObjectiveTotal}`)
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

function returnToModeScreen() {
  document.getElementById('mission-complete')!.style.display = 'none'
  document.getElementById('mode-screen')!.style.display = 'flex'
  document.getElementById('objective-hud')!.style.display = 'none'
  currentMode = null
  missionComplete = false
  score = 0; scoreEl.textContent = '0'
  for (const e of [...enemies]) scene.remove(e.group); enemies.length = 0
  for (const gt of [...groundTargets]) scene.remove(gt.group); groundTargets.length = 0
  for (const b of [...bullets]) scene.remove(b.mesh); bullets.length = 0
  for (const m of [...playerMissiles]) { if (m.light) scene.remove(m.light); scene.remove(m.mesh) }; playerMissiles.length = 0
  for (const m of [...enemyMissiles]) scene.remove(m.mesh); enemyMissiles.length = 0
  lockedEnemy = null
  player.position.set(0, terrainH(0, 0) + 90, 0)
  player.quaternion.identity(); camQuat.identity(); speed = 30
  playerHP = MAX_HP; invincibleTimer = 0; updateHPDisplay()
  missileAmmo = 6; flareAmmo = 8
  updatePips(missilePips, missileAmmo, 'on')
  updatePips(flarePips, flareAmmo, 'flare-on')
}

// モードボタンとbackボタンのイベント
document.querySelectorAll<HTMLElement>('.ms-btn').forEach(btn => {
  btn.addEventListener('click', () => startGame(btn.dataset.mode as GameMode))
})
document.getElementById('mc-back')!.addEventListener('click', returnToModeScreen)

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
        updateHPDisplay()
        if (playerHP <= 0) {
          respawnPlayer()
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
  const { w: rW, h: rH } = getEffectiveSize()
  reticleEl.style.display = 'block'
  reticleEl.style.left = ((pos.x + 1) / 2 * rW) + 'px'
  reticleEl.style.top = ((-pos.y + 1) / 2 * rH) + 'px'
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
  player.position.set(0, terrainH(0, 0) + 90, 0)
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
    return [cx - (rx / norm) * scale * RADAR_R, cy - (rz / norm) * scale * RADAR_R]
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

  if (currentMode !== null && !missionComplete) {
    if (keysJustPressed.has('Tab') || touchState.lockPressed) cycleLock()
    if (keysJustPressed.has('Escape')) lockedEnemy = null
    if (keys['KeyZ'] || touchState.gun) fireGun()
    if (keysJustPressed.has('KeyX') || touchState.missilePressed) firePlayerMissile()
    if (keys['KeyC'] || touchState.flarePressed) dropFlare()
  }
  keysJustPressed.clear()
  touchState.missilePressed = false
  touchState.flarePressed   = false
  touchState.lockPressed    = false

  updateBullets(dt)
  updateMissileArr(playerMissiles, dt, m => createExplosion(m.mesh.position.clone(), 0.6))
  updateMissileArr(enemyMissiles, dt, m => createExplosion(m.mesh.position.clone(), 0.5))
  updateFlares(dt)
  if (currentMode !== null && !missionComplete) {
    updateEnemies(dt)
    checkCollisions()
    checkGroundTargetCollisions()
  }
  updateGroundTargets(dt)
  updateExplosions(dt)
  updateContrails()
  if (currentMode !== null) updateSupplyPoints(dt)
  // dogfightはスコアをリアルタイム更新
  if (currentMode === 'dogfight') setObjective(`敵機を撃墜せよ — SCORE: ${score}`)

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
