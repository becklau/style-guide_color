/// <reference path="../../node_modules/@figma/plugin-typings/index.d.ts" />

export function collectDescendants(node: BaseNode): SceneNode[] {
  const result: SceneNode[] = []
  function walk(n: BaseNode) {
    if ('children' in n) {
      for (const child of (n as ChildrenMixin & SceneNode).children) {
        result.push(child)
        walk(child)
      }
    }
  }
  walk(node)
  return result
}

export function findByName(nodes: SceneNode[], name: string): SceneNode | null {
  const target = name.trim().toLowerCase()
  for (const n of nodes) {
    if (n.name.trim().toLowerCase() === target) return n
  }
  return null
}

export function findAllByName(nodes: SceneNode[], name: string): SceneNode[] {
  const target = name.trim().toLowerCase()
  return nodes.filter(n => n.name.trim().toLowerCase() === target)
}

export function findDeepByName(root: BaseNode, name: string): SceneNode | null {
  return findByName(collectDescendants(root), name)
}

export function findAllDeepByName(root: BaseNode, name: string): SceneNode[] {
  return findAllByName(collectDescendants(root), name)
}

export function findSlot(root: BaseNode, name = 'tokens'): SlotNode | null {
  const all = collectDescendants(root)
  const target = name.trim().toLowerCase()
  for (const n of all) {
    if (n.type === 'SLOT' && n.name.trim().toLowerCase() === target) {
      return n as SlotNode
    }
  }
  // Fallback: a frame named "tokens" that behaves as a row container
  for (const n of all) {
    if (
      (n.type === 'FRAME' || n.type === 'GROUP') &&
      n.name.trim().toLowerCase() === target
    ) {
      return n as unknown as SlotNode
    }
  }
  return null
}

export async function setTextValue(node: SceneNode, text: string) {
  if (node.type !== 'TEXT') return
  const textNode = node as TextNode

  try {
    if (textNode.fontName === figma.mixed) {
      const len = textNode.characters.length
      const fonts = new Set<string>()
      for (let i = 0; i < len; i++) {
        const f = textNode.getRangeFontName(i, i + 1) as FontName
        fonts.add(JSON.stringify(f))
      }
      for (const f of fonts) {
        await figma.loadFontAsync(JSON.parse(f))
      }
    } else {
      await figma.loadFontAsync(textNode.fontName as FontName)
    }
    textNode.characters = text
  } catch {
    // Font load failure — leave existing text
  }
}

/** Set a solid fill bound to a color variable. Falls back to static fill. */
export function setBoundFill(node: SceneNode, variable: Variable, fallbackColor?: RGBA) {
  if (!('fills' in node)) return

  try {
    const alias = figma.variables.createVariableAlias(variable)
    const paint: SolidPaint = {
      type: 'SOLID',
      color: fallbackColor
        ? { r: fallbackColor.r, g: fallbackColor.g, b: fallbackColor.b }
        : { r: 0, g: 0, b: 0 },
      opacity: fallbackColor?.a ?? 1,
      boundVariables: { color: alias }
    }
    ;(node as unknown as { fills: Paint[] }).fills = [paint]
  } catch {
    if (fallbackColor) {
      ;(node as unknown as { fills: Paint[] }).fills = [
        {
          type: 'SOLID',
          color: { r: fallbackColor.r, g: fallbackColor.g, b: fallbackColor.b },
          opacity: fallbackColor.a ?? 1
        }
      ]
    }
  }
}

export function setSolidFill(node: SceneNode, color: RGB | RGBA) {
  if (!('fills' in node)) return
  const a = 'a' in color ? color.a : 1
  ;(node as unknown as { fills: Paint[] }).fills = [
    {
      type: 'SOLID',
      color: { r: color.r, g: color.g, b: color.b },
      opacity: a ?? 1
    }
  ]
}

/** Try to set an explicit variable mode on a node; return false if unsupported. */
export function trySetMode(
  node: SceneNode,
  collection: VariableCollection,
  modeId: string
): boolean {
  try {
    if ('setExplicitVariableModeForCollection' in node) {
      ;(node as SceneNode & {
        setExplicitVariableModeForCollection: (
          c: VariableCollection,
          m: string
        ) => void
      }).setExplicitVariableModeForCollection(collection, modeId)
      return true
    }
  } catch {
    // unsupported on this node
  }
  return false
}

export function matchesName(node: BaseNode, name: string): boolean {
  return node.name.trim().toLowerCase() === name.trim().toLowerCase()
}
