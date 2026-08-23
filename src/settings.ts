/// <reference path="../node_modules/@figma/plugin-typings/index.d.ts" />

import type { PluginSettings, TemplateRef, TemplateSlot } from './messages'

const SETTINGS_KEY = 'styleGuideEditor.v1'

const DEFAULT_SETTINGS: PluginSettings = {
  templates: {},
  primitiveCollectionId: null,
  tokenCollectionId: null,
  lastScope: 'page',
  lastCategories: {
    primitives: true,
    contrast: true,
    tokens: true
  },
  brandColors: {}
}

export function loadSettings(): PluginSettings {
  try {
    const raw = figma.root.getPluginData(SETTINGS_KEY)
    if (!raw) {
      return {
        ...DEFAULT_SETTINGS,
        templates: {},
        lastCategories: { ...DEFAULT_SETTINGS.lastCategories },
        brandColors: {}
      }
    }
    const parsed = JSON.parse(raw) as Partial<PluginSettings>
    return {
      templates: parsed.templates ?? {},
      primitiveCollectionId: parsed.primitiveCollectionId ?? null,
      tokenCollectionId: parsed.tokenCollectionId ?? null,
      lastScope: parsed.lastScope ?? 'page',
      lastCategories: {
        primitives: parsed.lastCategories?.primitives ?? true,
        contrast: parsed.lastCategories?.contrast ?? true,
        tokens: parsed.lastCategories?.tokens ?? true
      },
      brandColors: parsed.brandColors ?? {}
    }
  } catch {
    return {
      ...DEFAULT_SETTINGS,
      templates: {},
      lastCategories: { ...DEFAULT_SETTINGS.lastCategories },
      brandColors: {}
    }
  }
}

export function saveSettings(settings: PluginSettings) {
  figma.root.setPluginData(SETTINGS_KEY, JSON.stringify(settings))
}

export function captureTemplateFromSelection(slot: TemplateSlot): TemplateRef {
  const selection = figma.currentPage.selection
  if (selection.length !== 1) {
    throw new Error('Select exactly one component, component set, or instance.')
  }

  const node = selection[0]
  let component: ComponentNode | null = null

  if (node.type === 'COMPONENT') {
    component = node
  } else if (node.type === 'COMPONENT_SET') {
    component = node.defaultVariant
  } else if (node.type === 'INSTANCE') {
    component = node.mainComponent
  } else if (node.type === 'FRAME') {
    // Allow capturing a plain frame as a cloneable template (group heading row)
    return {
      nodeId: node.id,
      key: node.id,
      name: node.name
    }
  }

  if (!component) {
    throw new Error('Selection must be a component, component set, instance, or frame.')
  }

  return {
    nodeId: component.id,
    key: component.key,
    name: component.name
  }
}

export async function resolveTemplateNode(
  ref: TemplateRef
): Promise<ComponentNode | FrameNode | null> {
  // Prefer live node id (local components)
  try {
    const byId = await figma.getNodeByIdAsync(ref.nodeId)
    if (byId) {
      if (byId.type === 'COMPONENT') return byId
      if (byId.type === 'FRAME') return byId
      if (byId.type === 'COMPONENT_SET') return byId.defaultVariant
    }
  } catch {
    // fall through
  }

  // Try importing by key (published / library components)
  if (ref.key && ref.key !== ref.nodeId) {
    try {
      const imported = await figma.importComponentByKeyAsync(ref.key)
      return imported
    } catch {
      // fall through
    }
  }

  return null
}

export function createFromTemplate(template: ComponentNode | FrameNode): SceneNode {
  if (template.type === 'COMPONENT') {
    return template.createInstance()
  }
  return template.clone()
}
