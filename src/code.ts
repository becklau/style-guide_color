/// <reference path="../node_modules/@figma/plugin-typings/index.d.ts" />

import { PARENT_FRAMES } from './constants'
import type {
  PluginToUiMessage,
  RunReport,
  TemplateSlot,
  UiToPluginMessage
} from './messages'
import { buildPrimitives, toFamilyInfo } from './model/primitives'
import { buildSemanticTokens } from './model/semantic'
import { renderContrast } from './render/contrast'
import { renderPrimitives } from './render/primitives'
import { renderTokens } from './render/tokens'
import { findTargetFrames, resolveScopeRoots } from './scan'
import {
  captureTemplateFromSelection,
  loadSettings,
  resolveTemplateNode,
  saveSettings
} from './settings'
import { clearVariableCaches, detectCollections } from './variables'

// esbuild --loader:.html=text inlines this as a string
import uiHtml from '../ui.html'

figma.showUI(uiHtml, { width: 380, height: 720, themeColors: true })

function post(msg: PluginToUiMessage) {
  figma.ui.postMessage(msg)
}

async function loadFamilies(collectionId: string | null): Promise<ReturnType<typeof toFamilyInfo>> {
  if (!collectionId) return []
  try {
    const families = await buildPrimitives(collectionId)
    return toFamilyInfo(families)
  } catch {
    return []
  }
}

async function handleInit() {
  clearVariableCaches()
  const settings = loadSettings()
  const detected = await detectCollections()
  const primitiveId =
    settings.primitiveCollectionId || detected.primitiveCollectionId
  const families = await loadFamilies(primitiveId)
  post({
    type: 'ready',
    settings,
    collections: detected.collections,
    detected: {
      primitiveCollectionId: detected.primitiveCollectionId,
      tokenCollectionId: detected.tokenCollectionId
    },
    families
  })
}

async function handleLoadFamilies(collectionId: string) {
  post({ type: 'families', families: await loadFamilies(collectionId) })
}

async function handleCapture(slot: TemplateSlot) {
  try {
    const ref = captureTemplateFromSelection(slot)
    const settings = loadSettings()
    settings.templates[slot] = ref
    saveSettings(settings)
    post({ type: 'template-captured', slot, ref })
  } catch (e) {
    post({
      type: 'error',
      message: e instanceof Error ? e.message : String(e)
    })
  }
}

function handleClear(slot: TemplateSlot) {
  const settings = loadSettings()
  delete settings.templates[slot]
  saveSettings(settings)
  post({ type: 'template-cleared', slot })
}

async function requireTemplate(
  slot: TemplateSlot,
  label: string
): Promise<ComponentNode | FrameNode> {
  const settings = loadSettings()
  const ref = settings.templates[slot]
  if (!ref) {
    throw new Error(`Capture a ${label} template before running.`)
  }
  const node = await resolveTemplateNode(ref)
  if (!node) {
    throw new Error(
      `${label} template "${ref.name}" could not be found. Re-capture it.`
    )
  }
  return node
}

async function handleRun(msg: Extract<UiToPluginMessage, { type: 'run' }>) {
  const settings = loadSettings()
  settings.lastScope = msg.scope
  settings.lastCategories = msg.categories
  settings.primitiveCollectionId = msg.primitiveCollectionId
  settings.tokenCollectionId = msg.tokenCollectionId
  settings.brandColors = msg.brandColors ?? {}
  saveSettings(settings)

  const report: RunReport = {
    warnings: [],
    errors: []
  }

  try {
    clearVariableCaches()
    post({ type: 'run-progress', message: 'Resolving scope…' })
    const roots = await resolveScopeRoots(msg.scope)

    const needPrimitives = msg.categories.primitives
    const needContrast = msg.categories.contrast
    const needTokens = msg.categories.tokens

    // Validate templates up front
    const swatchTpl = needPrimitives
      ? await requireTemplate('swatch', 'primitive swatch')
      : null
    const hasBrandPicks =
      needPrimitives &&
      Object.values(settings.brandColors).some(v => Boolean(v))
    const brandSwatchTpl = hasBrandPicks
      ? await requireTemplate('brandSwatch', 'brand swatch')
      : null
    const chartTpl = needContrast
      ? await requireTemplate('contrastChart', 'contrast chart')
      : null
    const tokenRowTpl = needTokens
      ? await requireTemplate('tokenRow', 'token row')
      : null
    const headingTpl =
      needPrimitives || needContrast
        ? await requireTemplate('sectionHeading', 'section heading')
        : null
    const groupHeadingTpl = needTokens
      ? await requireTemplate('groupHeading', 'token group heading')
      : null

    if (needPrimitives) {
      if (!msg.primitiveCollectionId) {
        throw new Error('Select a primitives collection.')
      }
      post({ type: 'run-progress', message: 'Building primitives…' })
      const families = await buildPrimitives(msg.primitiveCollectionId)
      const frames = findTargetFrames(roots, PARENT_FRAMES.primitives)
      if (frames.length === 0) {
        report.warnings.push(
          `No ${PARENT_FRAMES.primitives} frames found in scope.`
        )
      } else {
        let counts = { created: 0, updated: 0, removed: 0 }
        for (const frame of frames) {
          post({
            type: 'run-progress',
            message: `Updating primitives in "${frame.name}"…`
          })
          const c = await renderPrimitives(
            frame,
            families,
            {
              swatch: swatchTpl!,
              heading: headingTpl!,
              brandSwatch: brandSwatchTpl
            },
            settings.brandColors
          )
          counts = {
            created: counts.created + c.created,
            updated: counts.updated + c.updated,
            removed: counts.removed + c.removed
          }
        }
        report.primitives = counts
      }
    }

    if (needContrast || needTokens) {
      if (!msg.tokenCollectionId) {
        throw new Error('Select a tokens collection.')
      }
      post({ type: 'run-progress', message: 'Building semantic tokens…' })
      const model = await buildSemanticTokens(msg.tokenCollectionId)

      if (needTokens) {
        const frames = findTargetFrames(roots, PARENT_FRAMES.tokens)
        if (frames.length === 0) {
          report.warnings.push(
            `No ${PARENT_FRAMES.tokens} frames found in scope.`
          )
        } else {
          let counts = { created: 0, updated: 0, removed: 0 }
          for (const frame of frames) {
            post({
              type: 'run-progress',
              message: `Updating tokens in "${frame.name}"…`
            })
            const c = await renderTokens(
              frame,
              model,
              {
                tokenRow: tokenRowTpl!,
                groupHeading: groupHeadingTpl!
              },
              report.warnings
            )
            counts = {
              created: counts.created + c.created,
              updated: counts.updated + c.updated,
              removed: counts.removed + c.removed
            }
          }
          report.tokens = counts
        }
      }

      if (needContrast) {
        const frames = findTargetFrames(roots, PARENT_FRAMES.contrast)
        if (frames.length === 0) {
          report.warnings.push(
            `No ${PARENT_FRAMES.contrast} frames found in scope.`
          )
        } else {
          let counts = { created: 0, updated: 0, removed: 0 }
          for (const frame of frames) {
            post({
              type: 'run-progress',
              message: `Updating contrast in "${frame.name}"…`
            })
            const c = await renderContrast(
              frame,
              model,
              { chart: chartTpl!, heading: headingTpl! },
              report.warnings
            )
            counts = {
              created: counts.created + c.created,
              updated: counts.updated + c.updated,
              removed: counts.removed + c.removed
            }
          }
          report.contrast = counts
        }
      }
    }

    post({ type: 'run-complete', report })
  } catch (e) {
    report.errors.push(e instanceof Error ? e.message : String(e))
    post({ type: 'run-complete', report })
  }
}

figma.ui.onmessage = async (msg: UiToPluginMessage) => {
  if (msg.type === 'init') {
    await handleInit()
    return
  }
  if (msg.type === 'capture-template') {
    await handleCapture(msg.slot)
    return
  }
  if (msg.type === 'clear-template') {
    handleClear(msg.slot)
    return
  }
  if (msg.type === 'load-families') {
    await handleLoadFamilies(msg.collectionId)
    return
  }
  if (msg.type === 'run') {
    await handleRun(msg)
    return
  }
  if (msg.type === 'save-prefs') {
    const settings = loadSettings()
    settings.lastScope = msg.scope
    settings.lastCategories = msg.categories
    settings.primitiveCollectionId = msg.primitiveCollectionId
    settings.tokenCollectionId = msg.tokenCollectionId
    settings.brandColors = msg.brandColors ?? settings.brandColors
    saveSettings(settings)
  }
}
