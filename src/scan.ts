/// <reference path="../node_modules/@figma/plugin-typings/index.d.ts" />

import { matchesName } from './utils/nodes'
import type { Scope } from './messages'

export function findFramesByName(
  root: BaseNode & ChildrenMixin,
  frameName: string
): FrameNode[] {
  if (!('findAll' in root)) return []
  return (root as PageNode).findAll(
    (node): node is FrameNode =>
      (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') &&
      matchesName(node, frameName)
  ) as FrameNode[]
}

export function findFramesInNode(node: SceneNode, frameName: string): FrameNode[] {
  const results: FrameNode[] = []
  if (
    (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') &&
    matchesName(node, frameName)
  ) {
    results.push(node as FrameNode)
  }
  if ('findAll' in node) {
    const nested = (node as FrameNode).findAll(
      (n): n is FrameNode =>
        (n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'INSTANCE') &&
        matchesName(n, frameName)
    ) as FrameNode[]
    results.push(...nested)
  }
  return results
}

export async function resolveScopeRoots(scope: Scope): Promise<BaseNode[]> {
  if (scope === 'selection') {
    const sel = figma.currentPage.selection
    if (sel.length === 0) {
      throw new Error(
        'Nothing selected. Select frames containing $primitives-parent, $contrast-parent, or $token-parent.'
      )
    }
    return [...sel]
  }

  if (scope === 'page') {
    return [figma.currentPage]
  }

  // Entire file
  await figma.loadAllPagesAsync()
  return [...figma.root.children]
}

export function findTargetFrames(
  roots: BaseNode[],
  frameName: string
): FrameNode[] {
  const found: FrameNode[] = []
  const seen = new Set<string>()

  for (const root of roots) {
    let frames: FrameNode[] = []
    if (root.type === 'PAGE') {
      frames = findFramesByName(root as PageNode, frameName)
    } else if ('children' in root) {
      frames = findFramesInNode(root as SceneNode, frameName)
    }

    for (const f of frames) {
      if (!seen.has(f.id)) {
        seen.add(f.id)
        found.push(f)
      }
    }
  }

  // Keep only outermost matches — nested layers also named $contrast / $token
  // (row templates, mode blocks) must not be treated as parent containers.
  return found.filter(frame => {
    let parent: BaseNode | null = frame.parent
    while (parent) {
      if (seen.has(parent.id)) return false
      parent = parent.parent
    }
    return true
  })
}
