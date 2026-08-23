/// <reference path="../../node_modules/@figma/plugin-typings/index.d.ts" />

import { formatHex, formatHsla, formatRgba } from '../colors'
import {
  collectDescendants,
  findAllByName,
  findByName,
  setBoundFill,
  setTextValue,
  trySetMode
} from '../utils/nodes'

export async function fillColorMeta(
  root: SceneNode,
  opts: {
    variable?: Variable
    rgba: RGBA
    name?: string
    path?: string
    includeHsla?: boolean
  }
) {
  const all = collectDescendants(root)
  // Also search the root itself if it's named
  const search = [root, ...all]

  if (opts.variable) {
    const colorNodes = findAllByName(search, '$color')
    for (const n of colorNodes) {
      setBoundFill(n, opts.variable, opts.rgba)
    }
  }

  if (opts.name !== undefined) {
    const nameNode = findByName(search, '$name')
    if (nameNode) await setTextValue(nameNode, opts.name)
  }

  if (opts.path !== undefined) {
    const pathNode = findByName(search, '$path')
    if (pathNode) await setTextValue(pathNode, opts.path)
  }

  const hexNode = findByName(search, '$hex')
  if (hexNode) await setTextValue(hexNode, formatHex(opts.rgba))

  const rgbaNode = findByName(search, '$rgba')
  if (rgbaNode) await setTextValue(rgbaNode, formatRgba(opts.rgba))

  if (opts.includeHsla !== false) {
    const hslaNode = findByName(search, '$hsla')
    if (hslaNode) await setTextValue(hslaNode, formatHsla(opts.rgba))
  }
}

export function ensureAutoLayout(
  frame: FrameNode,
  direction: 'HORIZONTAL' | 'VERTICAL',
  opts?: {
    gap?: number
    padding?: number
    wrap?: boolean
    primaryAxisSizing?: 'AUTO' | 'FIXED' | 'FILL'
    counterAxisSizing?: 'AUTO' | 'FIXED' | 'FILL'
  }
) {
  frame.layoutMode = direction
  frame.primaryAxisSizingMode = opts?.primaryAxisSizing === 'FIXED' ? 'FIXED' : 'AUTO'
  frame.counterAxisSizingMode = opts?.counterAxisSizing === 'FIXED' ? 'FIXED' : 'AUTO'
  frame.itemSpacing = opts?.gap ?? 20
  if (opts?.padding !== undefined) {
    frame.paddingTop = opts.padding
    frame.paddingBottom = opts.padding
    frame.paddingLeft = opts.padding
    frame.paddingRight = opts.padding
  }
  if (opts?.wrap && 'layoutWrap' in frame) {
    frame.layoutWrap = 'WRAP'
  }
  frame.fills = []
}

export async function setHeadingText(headingInstance: SceneNode, text: string) {
  // Style Guide Heading: find first TEXT descendant
  if ('findOne' in headingInstance) {
    const textNode = (headingInstance as FrameNode).findOne(
      n => n.type === 'TEXT'
    ) as TextNode | null
    if (textNode) await setTextValue(textNode, text)
  }
}

const SEPARATOR_NAMES = new Set(['line', 'divider', 'separator', 'rule', 'stroke'])

/** Hide the rule under Style Guide Heading so contrast headings match Light. */
export function hideHeadingSeparator(heading: SceneNode) {
  function strip(n: SceneNode) {
    if ('strokes' in n && n.type !== 'TEXT') {
      ;(n as GeometryMixin).strokes = []
    }
    const name = n.name.trim().toLowerCase()
    if (n.type === 'LINE' || SEPARATOR_NAMES.has(name)) {
      n.visible = false
    }
    if ('children' in n) {
      for (const child of (n as ChildrenMixin).children) {
        strip(child as SceneNode)
      }
    }
  }
  strip(heading)
}

export function lightModeId(collection: VariableCollection): string {
  const named = collection.modes.find(m => /light/i.test(m.name))
  return named?.modeId ?? collection.defaultModeId
}

export function applyModeToNode(
  node: SceneNode,
  collection: VariableCollection,
  modeId: string,
  warnings: string[]
): boolean {
  const ok = trySetMode(node, collection, modeId)
  if (!ok) {
    warnings.push(
      `Could not set mode "${modeId}" on "${node.name}" — using resolved static fills.`
    )
  }
  return ok
}
