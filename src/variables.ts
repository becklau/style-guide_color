/// <reference path="../node_modules/@figma/plugin-typings/index.d.ts" />

import type { CollectionInfo } from './messages'

let stringVariablesCache: Variable[] | null = null
let colorVariablesCache: Variable[] | null = null
let collectionsCache: VariableCollection[] | null = null

export function isVariableAlias(value: VariableValue): value is VariableAlias {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    (value as VariableAlias).type === 'VARIABLE_ALIAS'
  )
}

export function isRGBorRGBA(value: VariableValue): value is RGB | RGBA {
  return typeof value === 'object' && value !== null && 'r' in value && 'g' in value && 'b' in value
}

export function toRGBA(color: RGB | RGBA): RGBA {
  if ('a' in color && color.a !== undefined) return color as RGBA
  return { r: color.r, g: color.g, b: color.b, a: 1 }
}

export async function getLocalCollections(): Promise<VariableCollection[]> {
  if (!collectionsCache) {
    collectionsCache = await figma.variables.getLocalVariableCollectionsAsync()
  }
  return collectionsCache
}

export async function getColorVariables(): Promise<Variable[]> {
  if (!colorVariablesCache) {
    colorVariablesCache = await figma.variables.getLocalVariablesAsync('COLOR')
  }
  return colorVariablesCache
}

export async function getStringVariables(): Promise<Variable[]> {
  if (!stringVariablesCache) {
    stringVariablesCache = await figma.variables.getLocalVariablesAsync('STRING')
  }
  return stringVariablesCache
}

export function clearVariableCaches() {
  stringVariablesCache = null
  colorVariablesCache = null
  collectionsCache = null
}

export function getModeIdForCollection(
  consumer: SceneNode,
  collection: VariableCollection
): string {
  if ('resolvedVariableModes' in consumer) {
    const modeId = consumer.resolvedVariableModes[collection.id]
    if (modeId) return modeId
  }
  return collection.defaultModeId
}

/** Resolve alias chain for a specific mode id (not consumer-dependent). */
export async function resolveAliasChainForMode(
  variable: Variable,
  modeId: string
): Promise<Variable> {
  let current = variable
  const visited = new Set<string>()

  while (true) {
    if (visited.has(current.id)) break
    visited.add(current.id)

    const collection = await figma.variables.getVariableCollectionByIdAsync(
      current.variableCollectionId
    )
    if (!collection) break

    // Use the requested mode if it belongs to this collection, else default
    const effectiveMode = collection.modes.some(m => m.modeId === modeId)
      ? modeId
      : collection.defaultModeId

    const value = current.valuesByMode[effectiveMode]
    if (value && isVariableAlias(value)) {
      const next = await figma.variables.getVariableByIdAsync(value.id)
      if (!next) break
      current = next
    } else {
      break
    }
  }

  return current
}

export async function resolveAliasChain(
  variable: Variable,
  consumer: SceneNode
): Promise<Variable> {
  const collection = await figma.variables.getVariableCollectionByIdAsync(
    variable.variableCollectionId
  )
  const modeId = collection
    ? getModeIdForCollection(consumer, collection)
    : variable.variableCollectionId
  return resolveAliasChainForMode(variable, modeId)
}

export function getTokenLeafName(variable: Variable): string {
  const parts = variable.name.split('/')
  return parts[parts.length - 1]
}

export function getTokenGroupName(variable: Variable): string {
  const parts = variable.name.split('/')
  return parts.length >= 2 ? parts[0] : 'Other'
}

export async function getColorNameLabel(
  parentPath: string,
  collection: VariableCollection
): Promise<string | null> {
  const colorNameVarPath = `${parentPath}/Color Name`
  const stringVars = await getStringVariables()
  const colorNameVar = stringVars.find(
    v =>
      v.name === colorNameVarPath && v.variableCollectionId === collection.id
  )
  if (!colorNameVar) return null

  const value = colorNameVar.valuesByMode[collection.defaultModeId]
  return typeof value === 'string' ? value : null
}

export async function getPrimitiveDisplayName(
  primitiveVariable: Variable,
  collection: VariableCollection
): Promise<string> {
  const path = primitiveVariable.name
  const segments = path.split('/')
  const shade = segments[segments.length - 1]
  const parentPath = segments.slice(0, -1).join('/')

  const label = await getColorNameLabel(parentPath, collection)
  if (label) return `${label} ${shade}`

  if (segments.length >= 2) {
    return `${segments[segments.length - 2]} ${shade}`
  }
  return path
}

export function resolveColorValueForMode(
  variable: Variable,
  modeId: string
): RGBA | null {
  const value = variable.valuesByMode[modeId]
  if (value && isRGBorRGBA(value)) return toRGBA(value)
  return null
}

/** Recursively resolve a color through aliases for a given mode. */
export async function resolveColorThroughAliases(
  variable: Variable,
  modeId: string
): Promise<{ rgba: RGBA; primitive: Variable } | null> {
  const primitive = await resolveAliasChainForMode(variable, modeId)
  const collection = await figma.variables.getVariableCollectionByIdAsync(
    primitive.variableCollectionId
  )
  if (!collection) return null

  const effectiveMode = collection.modes.some(m => m.modeId === modeId)
    ? modeId
    : collection.defaultModeId

  const rgba = resolveColorValueForMode(primitive, effectiveMode)
  if (!rgba) return null
  return { rgba, primitive }
}

export async function getBoundColorVariable(node: SceneNode): Promise<Variable | null> {
  if (!('fills' in node)) return null
  const fills = (node as GeometryMixin).fills
  if (fills === figma.mixed || !Array.isArray(fills)) return null

  for (const paint of fills) {
    if (paint.type === 'SOLID' && paint.visible !== false) {
      const alias = paint.boundVariables?.color
      if (!alias) return null
      return await figma.variables.getVariableByIdAsync(alias.id)
    }
  }
  return null
}

export async function resolveColorValue(
  variable: Variable,
  consumer: SceneNode
): Promise<RGBA | null> {
  const resolved = variable.resolveForConsumer(consumer)
  if (resolved.resolvedType === 'COLOR' && isRGBorRGBA(resolved.value)) {
    return toRGBA(resolved.value)
  }
  return null
}

/**
 * Auto-detect primitive vs token collections:
 * - Token collection: color variables that mostly alias other variables
 * - Primitive collection: the collection those aliases target
 */
export async function detectCollections(): Promise<{
  collections: CollectionInfo[]
  primitiveCollectionId: string | null
  tokenCollectionId: string | null
}> {
  const collections = await getLocalCollections()
  const colors = await getColorVariables()

  const info: CollectionInfo[] = collections.map(c => ({
    id: c.id,
    name: c.name,
    modeCount: c.modes.length
  }))

  const byCollection = new Map<string, Variable[]>()
  for (const v of colors) {
    const list = byCollection.get(v.variableCollectionId) ?? []
    list.push(v)
    byCollection.set(v.variableCollectionId, list)
  }

  let tokenCollectionId: string | null = null
  let primitiveCollectionId: string | null = null
  let bestAliasRatio = 0

  for (const collection of collections) {
    const vars = byCollection.get(collection.id) ?? []
    if (vars.length === 0) continue

    let aliasCount = 0
    const targetCollections = new Map<string, number>()

    for (const v of vars) {
      const modeId = collection.defaultModeId
      const value = v.valuesByMode[modeId]
      if (value && isVariableAlias(value)) {
        aliasCount++
        const target = await figma.variables.getVariableByIdAsync(value.id)
        if (target) {
          targetCollections.set(
            target.variableCollectionId,
            (targetCollections.get(target.variableCollectionId) ?? 0) + 1
          )
        }
      }
    }

    const ratio = aliasCount / vars.length
    if (ratio > bestAliasRatio && ratio >= 0.5) {
      bestAliasRatio = ratio
      tokenCollectionId = collection.id

      let bestTarget: string | null = null
      let bestCount = 0
      for (const [id, count] of targetCollections) {
        if (count > bestCount) {
          bestCount = count
          bestTarget = id
        }
      }
      primitiveCollectionId = bestTarget
    }
  }

  // Fallback: pick collections by name heuristics
  if (!primitiveCollectionId) {
    const named = collections.find(c =>
      /primitiv/i.test(c.name)
    )
    if (named) primitiveCollectionId = named.id
  }
  if (!tokenCollectionId) {
    const named = collections.find(
      c => /token/i.test(c.name) || /light|dark|semantic/i.test(c.name)
    )
    if (named) tokenCollectionId = named.id
  }

  return { collections: info, primitiveCollectionId, tokenCollectionId }
}

export function createVariableAlias(variable: Variable): VariableAlias {
  return figma.variables.createVariableAlias(variable)
}
