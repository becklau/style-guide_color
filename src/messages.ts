export type Scope = 'selection' | 'page' | 'file'

export type TemplateSlot =
  | 'swatch'
  | 'brandSwatch'
  | 'contrastChart'
  | 'tokenRow'
  | 'sectionHeading'
  | 'groupHeading'

export type FamilyInfo = {
  path: string
  label: string
  shades: string[]
}

export type TemplateRef = {
  nodeId: string
  key: string
  name: string
}

export type PluginSettings = {
  templates: Partial<Record<TemplateSlot, TemplateRef>>
  primitiveCollectionId: string | null
  tokenCollectionId: string | null
  lastScope: Scope
  lastCategories: {
    primitives: boolean
    contrast: boolean
    tokens: boolean
  }
  /** family path → brand shade (e.g. "600"). Omitted/empty = no brand color. */
  brandColors: Record<string, string>
}

export type CollectionInfo = {
  id: string
  name: string
  modeCount: number
}

export type CategoryCounts = {
  created: number
  updated: number
  removed: number
}

export type RunReport = {
  primitives?: CategoryCounts
  contrast?: CategoryCounts
  tokens?: CategoryCounts
  warnings: string[]
  errors: string[]
}

export type UiToPluginMessage =
  | { type: 'init' }
  | { type: 'capture-template'; slot: TemplateSlot }
  | { type: 'clear-template'; slot: TemplateSlot }
  | { type: 'load-families'; collectionId: string }
  | {
      type: 'run'
      scope: Scope
      categories: { primitives: boolean; contrast: boolean; tokens: boolean }
      primitiveCollectionId: string | null
      tokenCollectionId: string | null
      brandColors: Record<string, string>
    }
  | {
      type: 'save-prefs'
      scope: Scope
      categories: { primitives: boolean; contrast: boolean; tokens: boolean }
      primitiveCollectionId: string | null
      tokenCollectionId: string | null
      brandColors: Record<string, string>
    }

export type PluginToUiMessage =
  | {
      type: 'ready'
      settings: PluginSettings
      collections: CollectionInfo[]
      detected: {
        primitiveCollectionId: string | null
        tokenCollectionId: string | null
      }
      families: FamilyInfo[]
    }
  | { type: 'families'; families: FamilyInfo[] }
  | { type: 'template-captured'; slot: TemplateSlot; ref: TemplateRef }
  | { type: 'template-cleared'; slot: TemplateSlot }
  | { type: 'error'; message: string }
  | { type: 'run-complete'; report: RunReport }
  | { type: 'run-progress'; message: string }
