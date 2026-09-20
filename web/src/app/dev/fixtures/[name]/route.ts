import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

// Dev only: serves fixtures/<name>.scene.json so /dev?scene=<name> can render any fixture without a code change.
const dir = path.resolve(process.cwd(), '../fixtures')

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  if (name === 'index') {
    const files = (await readdir(dir)).filter((f) => f.endsWith('.scene.json')).map((f) => f.replace('.scene.json', ''))
    return Response.json(files)
  }
  if (!/^[\w-]+$/.test(name)) return new Response('bad name', { status: 400 })
  try {
    return new Response(await readFile(path.join(dir, `${name}.scene.json`)), { headers: { 'content-type': 'application/json' } })
  } catch {
    return new Response('not found', { status: 404 })
  }
}
