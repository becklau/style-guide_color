/// <reference path="../../node_modules/@figma/plugin-typings/index.d.ts" />

import {
  getColorVariables,
  getLocalCollections,
  getTokenGroupName,
  getTokenLeafName,
  resolveColorThroughAliases
} from '../variables'

export type ModeInfo = {
  modeId: string
  name: string
}

export type TokenModeValue = {
  modeId: string
  modeName: string
  rgba: RGBA
  primitivePath: string
  primitive: Variable
}

export type SemanticToken = {
  variable: Variable
  name: string
  group: string
  modes: TokenModeValue[]
}

export type SemanticGroup = {
  name: string
  tokens: SemanticToken[]
}

export type SemanticModel = {
  collection: VariableCollection
  modes: ModeInfo[]
  groups: SemanticGroup[]
  backgrounds: SemanticToken[]
  foregrounds: SemanticToken[]
}

const BACKGROUND_GROUPS = ['Background', 'Surface']
const FOREGROUND_GROUPS = ['Foreground', 'Text']

const GROUP_ORDER = ['Background', 'Foreground', 'Surface', 'Text', 'Stroke']

export async function buildSemanticTokens(
  collectionId: string
): Promise<SemanticModel> {
  const collections = await getLocalCollections()
  const collection = collections.find(c => c.id === collectionId)
  if (!collection) throw new Error('Token collection not found.')

  const colors = await getColorVariables()
  const inCollection = colors.filter(v => v.variableCollectionId === collectionId)

  const modes: ModeInfo[] = collection.modes.map(m => ({
    modeId: m.modeId,
    name: m.name
  }))

  const tokens: SemanticToken[] = []

  for (const v of inCollection) {
    const modeValues: TokenModeValue[] = []

    for (const mode of modes) {
      const resolved = await resolveColorThroughAliases(v, mode.modeId)
      if (!resolved) continue
      modeValues.push({
        modeId: mode.modeId,
        modeName: mode.name,
        rgba: resolved.rgba,
        primitivePath: resolved.primitive.name,
        primitive: resolved.primitive
      })
    }

    if (modeValues.length === 0) continue

    tokens.push({
      variable: v,
      name: getTokenLeafName(v),
      group: getTokenGroupName(v),
      modes: modeValues
    })
  }

  // Variables panel order (not getLocalVariablesAsync order)
  const panelIndex = new Map<string, number>()
  collection.variableIds.forEach((id, i) => panelIndex.set(id, i))
  const byPanelOrder = (a: SemanticToken, b: SemanticToken) =>
    (panelIndex.get(a.variable.id) ?? Number.MAX_SAFE_INTEGER) -
    (panelIndex.get(b.variable.id) ?? Number.MAX_SAFE_INTEGER)

  tokens.sort(byPanelOrder)

  // Group tokens preserving panel order within each group
  const groupMap = new Map<string, SemanticToken[]>()
  const groupOrderSeen: string[] = []

  for (const t of tokens) {
    if (!groupMap.has(t.group)) {
      groupMap.set(t.group, [])
      groupOrderSeen.push(t.group)
    }
    groupMap.get(t.group)!.push(t)
  }

  // Sort groups by preferred order, then any extras
  const sortedGroupNames = [
    ...GROUP_ORDER.filter(g => groupMap.has(g)),
    ...groupOrderSeen.filter(g => !GROUP_ORDER.includes(g))
  ]

  const groups: SemanticGroup[] = sortedGroupNames.map(name => ({
    name,
    tokens: groupMap.get(name) ?? []
  }))

  const backgrounds = tokens
    .filter(t => BACKGROUND_GROUPS.includes(t.group))
    .sort(byPanelOrder)

  const foregrounds = tokens
    .filter(t => FOREGROUND_GROUPS.includes(t.group))
    .sort(byPanelOrder)

  return { collection, modes, groups, backgrounds, foregrounds }
}
