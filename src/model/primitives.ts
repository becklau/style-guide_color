/// <reference path="../../node_modules/@figma/plugin-typings/index.d.ts" />

import {
  getColorNameLabel,
  getColorVariables,
  getLocalCollections,
  resolveColorValueForMode
} from '../variables'

export type PrimitiveShade = {
  variable: Variable
  shade: string
  displayName: string
  rgba: RGBA
  path: string
}

export type PrimitiveFamily = {
  path: string
  label: string
  shades: PrimitiveShade[]
}

export function toFamilyInfo(
  families: PrimitiveFamily[]
): { path: string; label: string; shades: string[] }[] {
  return families.map(f => ({
    path: f.path,
    label: f.label,
    shades: f.shades.map(s => s.shade)
  }))
}

function shadeSortKey(shade: string): number {
  const n = Number(shade)
  return Number.isFinite(n) ? n : 9999
}

/** Greyscale → Status → Primary brand → Secondary brand → other */
function familySortKey(path: string): [number, number, string] {
  const lower = path.toLowerCase()
  if (lower.includes('/greyscale') || lower.includes('/grayscale')) {
    return [0, 0, path]
  }
  if (lower.includes('/status/')) {
    return [1, 0, path]
  }
  const primaryMatch = lower.match(/\/brand\/primary[^/]*\/?/)
  if (primaryMatch || lower.includes('/primary color')) {
    const n = Number((path.match(/Primary Color\s+(\d+)/i) || [])[1] || 0)
    return [2, n, path]
  }
  const secondaryMatch = lower.match(/\/brand\/secondary/) || lower.includes('/secondary color')
  if (secondaryMatch) {
    const n = Number((path.match(/Secondary Color\s+(\d+)/i) || [])[1] || 0)
    return [3, n, path]
  }
  if (lower.includes('/brand/')) {
    return [4, 0, path]
  }
  return [5, 0, path]
}

/**
 * Build primitive color families from a collection.
 * Expects paths like Color/Greyscale/950 or Color/Brand/Primary Color 1/600.
 * Skips "Color Name" string siblings (those are STRING type, not in color list).
 */
export async function buildPrimitives(
  collectionId: string
): Promise<PrimitiveFamily[]> {
  const collections = await getLocalCollections()
  const collection = collections.find(c => c.id === collectionId)
  if (!collection) throw new Error('Primitive collection not found.')

  const colors = await getColorVariables()
  const inCollection = colors.filter(v => v.variableCollectionId === collectionId)

  // Group by parent path (everything except the last segment)
  const familyMap = new Map<string, Variable[]>()
  for (const v of inCollection) {
    // Skip non-Color paths if any
    if (!v.name.startsWith('Color/')) continue
    const segments = v.name.split('/')
    if (segments.length < 3) continue // need at least Color/Family/shade
    const parentPath = segments.slice(0, -1).join('/')
    const list = familyMap.get(parentPath) ?? []
    list.push(v)
    familyMap.set(parentPath, list)
  }

  const families: PrimitiveFamily[] = []
  const modeId = collection.defaultModeId

  const orderedPaths = [...familyMap.keys()].sort((a, b) => {
    const ka = familySortKey(a)
    const kb = familySortKey(b)
    if (ka[0] !== kb[0]) return ka[0] - kb[0]
    if (ka[1] !== kb[1]) return ka[1] - kb[1]
    return ka[2].localeCompare(kb[2])
  })

  for (const path of orderedPaths) {
    const vars = familyMap.get(path) ?? []
    const label =
      (await getColorNameLabel(path, collection)) ??
      path.split('/').slice(-1)[0]

    const shades: PrimitiveShade[] = []
    for (const v of vars) {
      const shade = v.name.split('/').slice(-1)[0]
      const rgba = resolveColorValueForMode(v, modeId)
      if (!rgba) continue
      shades.push({
        variable: v,
        shade,
        displayName: `${label} ${shade}`,
        rgba,
        path: v.name
      })
    }

    shades.sort((a, b) => shadeSortKey(a.shade) - shadeSortKey(b.shade))

    if (shades.length > 0) {
      families.push({ path, label, shades })
    }
  }

  return families
}
