import * as THREE from 'three'

// Scene setup
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x87ceeb)
scene.fog = new THREE.Fog(0x87ceeb, 100, 800)

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
document.body.appendChild(renderer.domElement)

// Lights
const sun = new THREE.DirectionalLight(0xffffff, 1.5)
sun.position.set(100, 200, 100)
sun.castShadow = true
scene.add(sun)
scene.add(new THREE.AmbientLight(0x88aaff, 0.6))

// Ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(2000, 2000, 40, 40),
  new THREE.MeshLambertMaterial({ color: 0x2d8a2d, wireframe: false })
)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

// Player aircraft (assembled from basic geometries)
function createAircraft(): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshPhongMaterial({ color: 0x2255cc })
  const darkMat = new THREE.MeshPhongMaterial({ color: 0x112244 })
  const glassMat = new THREE.MeshPhongMaterial({ color: 0x88ddff, transparent: true, opacity: 0.6 })

  // Fuselage
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 4, 8), mat)
  fuselage.rotation.x = Math.PI / 2
  group.add(fuselage)

  // Nose cone
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.5, 8), mat)
  nose.rotation.x = Math.PI / 2
  nose.position.z = -2.75
  group.add(nose)

  // Main wings
  const wingGeo = new THREE.BoxGeometry(6, 0.1, 1.5)
  const wing = new THREE.Mesh(wingGeo, mat)
  wing.position.z = 0.5
  group.add(wing)

  // Tail fins
  const vTail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 1.0), mat)
  vTail.position.set(0, 0.6, 1.8)
  group.add(vTail)

  const hTail = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 0.8), darkMat)
  hTail.position.z = 1.8
  group.add(hTail)

  // Cockpit
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), glassMat)
  cockpit.scale.set(1, 0.7, 1.2)
  cockpit.position.set(0, 0.35, -0.5)
  group.add(cockpit)

  return group
}

const aircraft = createAircraft()
aircraft.position.set(0, 50, 0)
scene.add(aircraft)

// Camera follows behind aircraft
const cameraOffset = new THREE.Vector3(0, 3, 12)

// Clouds
function addClouds() {
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
  for (let i = 0; i < 40; i++) {
    const group = new THREE.Group()
    const count = 3 + Math.floor(Math.random() * 3)
    for (let j = 0; j < count; j++) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(4 + Math.random() * 4, 7, 7),
        cloudMat
      )
      puff.position.set(j * 5 - count * 2.5, Math.random() * 3, Math.random() * 4)
      group.add(puff)
    }
    group.position.set(
      (Math.random() - 0.5) * 600,
      30 + Math.random() * 80,
      (Math.random() - 0.5) * 600
    )
    scene.add(group)
  }
}
addClouds()

// Input state
const keys: Record<string, boolean> = {}
window.addEventListener('keydown', e => { keys[e.code] = true })
window.addEventListener('keyup', e => { keys[e.code] = false })

// Aircraft physics state
const velocity = new THREE.Vector3(0, 0, -1)
let pitch = 0  // nose up/down
let roll = 0   // bank left/right
let yaw = 0    // turn left/right
let speed = 30

// UI elements
const speedEl = document.getElementById('speed')!
const altEl = document.getElementById('altitude')!

function update(dt: number) {
  const boost = keys['Space'] ? 1.5 : 1.0
  const targetSpeed = boost * 30

  // Boost
  speed += (targetSpeed - speed) * dt * 2

  // Controls
  const pitchInput = (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0) - (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0)
  const rollInput = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0)

  pitch += pitchInput * dt * 1.2
  roll += rollInput * dt * 1.5
  yaw += -rollInput * dt * 0.4

  // Damping
  pitch *= 0.97
  roll *= 0.94
  yaw *= 0.96

  // Apply rotation
  aircraft.rotation.x = pitch
  aircraft.rotation.z = -roll
  aircraft.rotation.y += yaw * dt

  // Move forward
  const forward = new THREE.Vector3(0, 0, -1)
  forward.applyQuaternion(aircraft.quaternion)
  forward.multiplyScalar(speed * dt)

  // Pitch affects vertical movement
  aircraft.position.addScaledVector(forward, 1)
  aircraft.position.y += pitch * speed * dt * -0.5

  // Ground clamp
  aircraft.position.y = Math.max(3, aircraft.position.y)

  // Camera follow
  const desiredCamPos = cameraOffset.clone().applyQuaternion(aircraft.quaternion).add(aircraft.position)
  camera.position.lerp(desiredCamPos, 0.1)
  camera.lookAt(aircraft.position)

  // UI
  speedEl.textContent = Math.round(speed * 3.6).toString()
  altEl.textContent = Math.round(aircraft.position.y).toString()
}

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// Game loop
let last = performance.now()
function loop() {
  requestAnimationFrame(loop)
  const now = performance.now()
  const dt = Math.min((now - last) / 1000, 0.05)
  last = now
  update(dt)
  renderer.render(scene, camera)
}
loop()
