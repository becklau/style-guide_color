/// <reference path="../node_modules/@figma/plugin-typings/index.d.ts" />

function toRGBA(color: RGB | RGBA): RGBA {
  if ('a' in color && color.a !== undefined) return color as RGBA
  return { r: color.r, g: color.g, b: color.b, a: 1 }
}

function componentToHex(c: number): string {
  const n = Math.round(Math.max(0, Math.min(1, c)) * 255)
  return n.toString(16).toUpperCase().padStart(2, '0')
}

export function rgbToHex(color: RGB | RGBA): string {
  const c = toRGBA(color)
  return `#${componentToHex(c.r)}${componentToHex(c.g)}${componentToHex(c.b)}`
}

function formatAlpha(alpha: number): string {
  const rounded = Math.round(alpha * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function rgbToHslaComponents(color: RGBA): { h: number; s: number; l: number; a: number } {
  const { r, g, b } = color
  const a = color.a ?? 1
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) {
    return { h: 0, s: 0, l: l * 100, a }
  }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
    a
  }
}

export function formatHex(color: RGB | RGBA): string {
  return `hex: ${rgbToHex(color)}`
}

export function formatRgba(color: RGB | RGBA): string {
  const c = toRGBA(color)
  const r = Math.round(c.r * 255)
  const g = Math.round(c.g * 255)
  const b = Math.round(c.b * 255)
  return `rgba: rgba(${r}, ${g}, ${b}, ${formatAlpha(c.a ?? 1)})`
}

export function formatHsla(color: RGB | RGBA): string {
  const { h, s, l, a } = rgbToHslaComponents(toRGBA(color))
  const alpha = Math.round((a ?? 1) * 100)
  return `hsla: hsla(${h}, ${s}%, ${l}%, ${alpha}%)`
}
