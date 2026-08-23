/// <reference path="../node_modules/@figma/plugin-typings/index.d.ts" />

import { setTextValue } from './utils/nodes'

export const PASS_COLOR: RGB = { r: 0.18, g: 0.75, b: 0.4 }
export const FAIL_COLOR: RGB = { r: 0.87, g: 0.25, b: 0.25 }

export function relLuminance(c: RGB): number {
  const lin = (v: number) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
}

export function contrastRatio(a: RGB, b: RGB): number {
  const lA = relLuminance(a)
  const lB = relLuminance(b)
  const lighter = Math.max(lA, lB)
  const darker = Math.min(lA, lB)
  return (lighter + 0.05) / (darker + 0.05)
}

export function ratioLabel(ratio: number): string {
  return `${ratio.toFixed(2)}:1`
}

export function setResultColor(node: SceneNode, pass: boolean) {
  if (!('fills' in node)) return
  const color = pass ? PASS_COLOR : FAIL_COLOR
  ;(node as unknown as { fills: Paint[] }).fills = [
    { type: 'SOLID', color, opacity: 1 }
  ]
}

export async function setResultState(node: SceneNode, pass: boolean) {
  if (node.type === 'TEXT') {
    await setTextValue(node, pass ? 'PASS' : 'FAIL')
  }
  setResultColor(node, pass)
}

export const WCAG_THRESHOLDS = {
  AAN: 4.5,
  AAL: 3,
  AAAN: 7,
  AAAL: 4.5,
  UI: 3
} as const
