import { cp, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(__dirname, '..')
const distDir = path.join(packageRoot, 'dist')

await mkdir(distDir, { recursive: true })
await cp(path.join(packageRoot, 'src/runtime.js'), path.join(distDir, 'runtime.cjs'))
console.log('built pnpm-plugin-skills')
