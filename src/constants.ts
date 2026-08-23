/// <reference path="../node_modules/@figma/plugin-typings/index.d.ts" />

/** Parent container frame names — distinct from child layer names like $token / $contrast. */
export const PARENT_FRAMES = {
  primitives: '$primitives-parent',
  contrast: '$contrast-parent',
  tokens: '$token-parent'
} as const

export type ParentFrameKind = keyof typeof PARENT_FRAMES
