/// <reference path="../../node_modules/@figma/plugin-typings/index.d.ts" />

import type { CategoryCounts } from '../messages'
import { findDeepByName } from '../utils/nodes'

const KIND_KEY = 'sgKind'
const KEY_KEY = 'sgKey'

const VARIANT_KEY = 'sgVariant'

export type DesiredItem = {
  key: string
  render: (node: SceneNode) => Promise<void>
  /** Optional text used to adopt untagged children on first run. */
  adoptName?: string
  /** Recreate the node if an existing child was built from a different template. */
  variant?: string
}

export function getSgKind(node: BaseNode): string | null {
  const v = node.getPluginData(KIND_KEY)
  return v || null
}

export function getSgKey(node: BaseNode): string | null {
  const v = node.getPluginData(KEY_KEY)
  return v || null
}

export function tagNode(node: BaseNode, kind: string, key: string) {
  node.setPluginData(KIND_KEY, kind)
  node.setPluginData(KEY_KEY, key)
}

function readNameText(node: SceneNode): string | null {
  const nameNode = findDeepByName(node, '$name')
  if (nameNode && nameNode.type === 'TEXT') {
    return (nameNode as TextNode).characters.trim()
  }
  // Fallback: first text descendant
  if ('findOne' in node) {
    const text = (node as FrameNode).findOne(n => n.type === 'TEXT') as TextNode | null
    if (text) return text.characters.trim()
  }
  return null
}

/**
 * Reconcile managed children of a container against a desired list.
 * Untagged children that cannot be adopted are left untouched.
 */
export async function reconcile(
  container: BaseNode & ChildrenMixin,
  kind: string,
  desired: DesiredItem[],
  create: (item: DesiredItem) => SceneNode
): Promise<CategoryCounts> {
  const counts: CategoryCounts = { created: 0, updated: 0, removed: 0 }

  const children = [...container.children]
  const managed = new Map<string, SceneNode>()
  const untagged: SceneNode[] = []

  for (const child of children) {
    const childKind = getSgKind(child)
    const childKey = getSgKey(child)
    if (childKind === kind && childKey) {
      managed.set(childKey, child)
    } else if (!childKind) {
      untagged.push(child)
    }
  }

  // First-run adoption: match untagged children by $name text
  for (const item of desired) {
    if (managed.has(item.key)) continue
    if (!item.adoptName) continue
    const idx = untagged.findIndex(n => {
      const name = readNameText(n)
      return name !== null && name.toLowerCase() === item.adoptName!.toLowerCase()
    })
    if (idx >= 0) {
      const node = untagged.splice(idx, 1)[0]
      tagNode(node, kind, item.key)
      managed.set(item.key, node)
    }
  }

  // Create / update
  const ordered: SceneNode[] = []
  for (const item of desired) {
    let node = managed.get(item.key)
    const wantedVariant = item.variant ?? 'swatch'
    const existingVariant = node ? node.getPluginData(VARIANT_KEY) || 'swatch' : ''

    if (node && wantedVariant !== existingVariant) {
      const index = container.children.indexOf(node)
      node.remove()
      managed.delete(item.key)
      node = create(item)
      tagNode(node, kind, item.key)
      node.setPluginData(VARIANT_KEY, wantedVariant)
      if (index >= 0) container.insertChild(index, node)
      else container.appendChild(node)
      managed.set(item.key, node)
      counts.created++
    } else if (!node) {
      node = create(item)
      tagNode(node, kind, item.key)
      node.setPluginData(VARIANT_KEY, wantedVariant)
      container.appendChild(node)
      managed.set(item.key, node)
      counts.created++
    } else {
      counts.updated++
    }
    await item.render(node)
    ordered.push(node)
  }

  // Reorder managed children to match desired order, preserving untagged siblings
  // Strategy: move each desired node to the end in order, then the final
  // positions among managed nodes match desired. Untagged nodes keep relative order
  // by staying where they are relative to insertion — simpler approach:
  // insert each ordered node at index i among the final child list of managed-only.
  let insertAt = 0
  for (const node of ordered) {
    // Find current index
    const currentIndex = container.children.indexOf(node)
    if (currentIndex !== insertAt) {
      container.insertChild(insertAt, node)
    }
    insertAt++
    // Skip past any untagged nodes that should remain interleaved?
    // Plan says: reorder managed children; leave untagged untouched.
    // Putting all managed nodes first (in desired order), then untagged, is cleanest.
  }

  // Remove stale managed children
  const desiredKeys = new Set(desired.map(d => d.key))
  for (const [key, node] of managed) {
    if (!desiredKeys.has(key)) {
      node.remove()
      counts.removed++
    }
  }

  return counts
}

export function mergeCounts(a: CategoryCounts, b: CategoryCounts): CategoryCounts {
  return {
    created: a.created + b.created,
    updated: a.updated + b.updated,
    removed: a.removed + b.removed
  }
}

export function emptyCounts(): CategoryCounts {
  return { created: 0, updated: 0, removed: 0 }
}
