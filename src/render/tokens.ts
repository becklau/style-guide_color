/// <reference path="../../node_modules/@figma/plugin-typings/index.d.ts" />

import type { CategoryCounts } from '../messages'
import type { SemanticModel, SemanticToken } from '../model/semantic'
import { createFromTemplate } from '../settings'
import {
  collectDescendants,
  findAllDeepByName,
  setTextValue
} from '../utils/nodes'
import { applyModeToNode, ensureAutoLayout, fillColorMeta } from './fill'
import { emptyCounts } from './reconcile'

async function fillTokenRow(
  row: SceneNode,
  token: SemanticToken,
  model: SemanticModel,
  warnings: string[]
) {
  // The token component contains one $token block per mode
  const blocks = findAllDeepByName(row, '$token')

  if (blocks.length === 0) {
    // Treat the whole row as a single block (fallback)
    const mode = token.modes[0]
    if (!mode) return
    await fillColorMeta(row, {
      variable: token.variable,
      rgba: mode.rgba,
      name: token.name,
      path: mode.primitivePath,
      includeHsla: false
    })
    applyModeToNode(row, model.collection, mode.modeId, warnings)
    return
  }

  if (blocks.length < model.modes.length) {
    warnings.push(
      `Token row for "${token.name}" has ${blocks.length} $token block(s) but ${model.modes.length} modes — extra modes skipped.`
    )
  }

  for (let i = 0; i < blocks.length && i < model.modes.length; i++) {
    const block = blocks[i]
    const modeInfo = model.modes[i]
    const modeVal = token.modes.find(m => m.modeId === modeInfo.modeId) ?? token.modes[i]
    if (!modeVal) continue

    applyModeToNode(block, model.collection, modeInfo.modeId, warnings)

    await fillColorMeta(block, {
      variable: token.variable,
      rgba: modeVal.rgba,
      name: i === 0 ? token.name : undefined,
      path: i === 0 ? modeVal.primitivePath : undefined,
      includeHsla: false
    })
  }

  // Also set $name / $path on the row root if present outside blocks
  const all = collectDescendants(row)
  // Prefer first block's values already set; ensure root-level $name exists
  const rootName = all.find(
    n =>
      n.name.trim().toLowerCase() === '$name' &&
      !blocks.some(b => collectDescendants(b).includes(n) || b === n)
  )
  if (rootName && token.modes[0]) {
    await setTextValue(rootName, token.name)
  }
  const rootPath = all.find(
    n =>
      n.name.trim().toLowerCase() === '$path' &&
      !blocks.some(b => collectDescendants(b).includes(n) || b === n)
  )
  if (rootPath && token.modes[0]) {
    await setTextValue(rootPath, token.modes[0].primitivePath)
  }
}

async function setGroupHeadingLabel(row: SceneNode, label: string) {
  // Prefer a text node inside .Row Heading Label, else first text
  if ('findOne' in row) {
    const labelFrame = (row as FrameNode).findOne(
      n => n.name.trim().toLowerCase() === '.row heading label'
    )
    if (labelFrame && 'findOne' in labelFrame) {
      const text = (labelFrame as FrameNode).findOne(n => n.type === 'TEXT') as TextNode | null
      if (text) {
        await setTextValue(text, label)
        return
      }
    }
    const text = (row as FrameNode).findOne(n => n.type === 'TEXT') as TextNode | null
    if (text) await setTextValue(text, label)
  }
}

export async function renderTokens(
  container: FrameNode,
  model: SemanticModel,
  templates: {
    tokenRow: ComponentNode | FrameNode
    groupHeading: ComponentNode | FrameNode
  },
  warnings: string[]
): Promise<CategoryCounts> {
  if (container.layoutMode === 'NONE') {
    ensureAutoLayout(container, 'VERTICAL', { gap: 0 })
  }

  let totals = emptyCounts()

  // Remove a plugin-generated page heading if one exists from older runs
  for (const child of [...container.children]) {
    if (child.getPluginData('sgKind') === 'page-heading') {
      child.remove()
    }
  }

  // Content frame (table body)
  let body = container.children.find(
    c =>
      c.type === 'FRAME' &&
      (c.getPluginData('sgKind') === 'token-body' ||
        c.name.toLowerCase() === 'tokens')
  ) as FrameNode | undefined

  if (!body) {
    body = container.children.find(
      c =>
        c.type === 'FRAME' &&
        c.getPluginData('sgKind') !== 'page-heading' &&
        !c.name.toLowerCase().includes('heading')
    ) as FrameNode | undefined
  }

  if (!body) {
    body = figma.createFrame()
    body.name = 'tokens'
    ensureAutoLayout(body, 'VERTICAL', { gap: 0 })
    container.appendChild(body)
  }
  body.setPluginData('sgKind', 'token-body')
  body.setPluginData('sgKey', 'token-body')
  if (body.layoutMode === 'NONE') {
    ensureAutoLayout(body, 'VERTICAL', { gap: 0 })
  }

  // Build desired list: group heading + tokens interleaved
  type Item =
    | { kind: 'group'; key: string; label: string }
    | { kind: 'token'; key: string; token: SemanticToken }

  const items: Item[] = []
  for (const group of model.groups) {
    items.push({ kind: 'group', key: `group:${group.name}`, label: group.name })
    for (const token of group.tokens) {
      items.push({
        kind: 'token',
        key: token.variable.id,
        token
      })
    }
  }

  // Preserve an existing Header row if present
  const header = body.children.find(
    c => c.name.trim().toLowerCase() === 'header'
  )
  if (header) {
    header.setPluginData('sgKind', 'header')
    header.setPluginData('sgKey', 'header')
  }

  // Custom reconcile that creates the right template per item kind
  const children = [...body.children]
  const managed = new Map<string, SceneNode>()
  const untagged: SceneNode[] = []

  for (const child of children) {
    const kind = child.getPluginData('sgKind')
    const key = child.getPluginData('sgKey')
    if (
      (kind === 'heading' || kind === 'tokenRow' || kind === 'group') &&
      key
    ) {
      managed.set(key, child)
    } else if (kind === 'header') {
      // keep header
    } else if (!kind) {
      untagged.push(child)
    }
  }

  // Adoption
  for (const item of items) {
    const key = item.kind === 'group' ? item.key : item.key
    if (managed.has(key)) continue
    const adoptName = item.kind === 'group' ? item.label : item.token.name
    const idx = untagged.findIndex(n => {
      if ('findOne' in n) {
        const text = (n as FrameNode).findOne(c => c.type === 'TEXT') as TextNode | null
        return text !== null && text.characters.trim().toLowerCase() === adoptName.toLowerCase()
      }
      return false
    })
    if (idx >= 0) {
      const node = untagged.splice(idx, 1)[0]
      node.setPluginData('sgKind', item.kind === 'group' ? 'heading' : 'tokenRow')
      node.setPluginData('sgKey', key)
      managed.set(key, node)
    }
  }

  const ordered: SceneNode[] = []
  for (const item of items) {
    const key = item.key
    let node = managed.get(key)
    if (!node) {
      if (item.kind === 'group') {
        node = createFromTemplate(templates.groupHeading)
        node.setPluginData('sgKind', 'heading')
      } else {
        node = createFromTemplate(templates.tokenRow)
        node.setPluginData('sgKind', 'tokenRow')
      }
      node.setPluginData('sgKey', key)
      body.appendChild(node)
      managed.set(key, node)
      totals.created++
    } else {
      totals.updated++
    }

    if (item.kind === 'group') {
      await setGroupHeadingLabel(node, item.label)
    } else {
      await fillTokenRow(node, item.token, model, warnings)
    }
    ordered.push(node)
  }

  // Reorder: header first if present, then ordered items
  let insertAt = header ? body.children.indexOf(header) + 1 : 0
  if (header && body.children.indexOf(header) !== 0) {
    body.insertChild(0, header)
    insertAt = 1
  }
  for (const node of ordered) {
    const currentIndex = body.children.indexOf(node)
    if (currentIndex !== insertAt) {
      body.insertChild(insertAt, node)
    }
    insertAt++
  }

  // Remove stale
  const desiredKeys = new Set(items.map(i => i.key))
  for (const [key, node] of managed) {
    if (!desiredKeys.has(key)) {
      node.remove()
      totals.removed++
    }
  }

  return totals
}
