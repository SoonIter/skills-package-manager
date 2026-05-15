export function normalizeProtocolPathSource(
  sourcePart: string,
  protocol: 'link' | 'local',
): string {
  const prefix = `${protocol}:`
  const sourcePath = sourcePart.slice(prefix.length).replace(/\\/g, '/').replace(/\/+$/, '')
  return `${prefix}${sourcePath}`
}

export function normalizeLinkSource(sourcePart: string): string {
  return normalizeProtocolPathSource(sourcePart, 'link')
}

export function normalizeLocalSource(sourcePart: string): string {
  return normalizeProtocolPathSource(sourcePart, 'local')
}
