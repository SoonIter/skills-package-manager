export function normalizeLinkSource(sourcePart: string): string {
  const linkPath = sourcePart.slice('link:'.length).replace(/\\/g, '/').replace(/\/+$/, '')
  return `link:${linkPath}`
}
