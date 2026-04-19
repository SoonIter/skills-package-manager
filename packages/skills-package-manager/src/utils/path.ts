import path from 'node:path'

export function toPortableRelativePath(from: string, to: string): string {
  const relativePath = path.relative(from, to) || '.'
  return path.sep === '/' ? relativePath : relativePath.split(path.sep).join('/')
}
