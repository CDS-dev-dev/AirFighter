import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const registryPath = path.join(root, 'blender', 'asset-registry.json')
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'))

const assets = Array.isArray(registry.assets) ? registry.assets : []
let missing = 0

console.log(`Blender asset registry v${registry.version}`)
console.log(`source_of_truth=${registry.source_of_truth}`)

for (const asset of assets) {
  const publicExists = asset.publicPath ? fs.existsSync(path.join(root, asset.publicPath)) : false
  const sourceExists = asset.sourceScript ? fs.existsSync(path.join(root, asset.sourceScript)) : false
  const requiresFiles = asset.status === 'implemented_glb'
  const ok = requiresFiles ? (publicExists && sourceExists) : true
  const status = ok ? (asset.status === 'implemented_glb' ? 'OK' : 'TODO') : 'MISSING'
  if (!ok) missing += 1
  console.log(`${status} ${asset.map} ${asset.id} status=${asset.status} public=${asset.publicPath ?? '-'} source=${asset.sourceScript ?? '-'}`)
}

if (missing > 0) process.exitCode = 1
