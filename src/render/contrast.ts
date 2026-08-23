/// <reference path="../../node_modules/@figma/plugin-typings/index.d.ts" />

import type { CategoryCounts } from '../messages'
import type { SemanticModel, SemanticToken } from '../model/semantic'
import { createFromTemplate } from '../settings'
import {
  collectDescendants,
  findByName,
  findSlot,
  setBoundFill,
  setTextValue
} from '../utils/nodes'
import {
  contrastRatio,
  ratioLabel,
  setResultState,
  WCAG_THRESHOLDS
} from '../wcag'
import {
  applyModeToNode,
  ensureAutoLayout,
  fillColorMeta,
  hideHeadingSeparator,
  lightModeId,
  setHeadingText
} from './fill'
import { emptyCounts, mergeCounts, reconcile, tagNode } from './reconcile'

async function fillContrastRow(
  row: SceneNode,
  bg: SemanticToken,
  fg: SemanticToken,
  modeId: string,
  collection: VariableCollection,
  warnings: string[]
) {
  const modeBg = bg.modes.find(m => m.modeId === modeId) ?? bg.modes[0]
  const modeFg = fg.modes.find(m => m.modeId === modeId) ?? fg.modes[0]
  if (!modeBg || !modeFg) return

  const all = collectDescendants(row)
  const search = [row, ...all]

  const bgNode = findByName(search, '$bg')
  const fgNode = findByName(search, '$fg')

  if (bgNode) setBoundFill(bgNode, bg.variable, modeBg.rgba)
  if (fgNode) setBoundFill(fgNode, fg.variable, modeFg.rgba)

  // Mode on the row so bound fills resolve correctly
  applyModeToNode(row, collection, modeId, warnings)

  const nameNode = findByName(search, '$name')
  if (nameNode) await setTextValue(nameNode, fg.name)

  const ratio = contrastRatio(modeBg.rgba, modeFg.rgba)
  const ratioNode = findByName(search, '$ratio')
  if (ratioNode) await setTextValue(ratioNode, ratioLabel(ratio))

  const outputs: { name: string; pass: boolean }[] = [
    { name: '$AAN', pass: ratio >= WCAG_THRESHOLDS.AAN },
    { name: '$AAL', pass: ratio >= WCAG_THRESHOLDS.AAL },
    { name: '$AAAN', pass: ratio >= WCAG_THRESHOLDS.AAAN },
    { name: '$AAAL', pass: ratio >= WCAG_THRESHOLDS.AAAL },
    { name: '$UI', pass: ratio >= WCAG_THRESHOLDS.UI }
  ]

  for (const spec of outputs) {
    const node = findByName(search, spec.name)
    if (node) await setResultState(node, spec.pass)
  }
}

async function fillContrastChart(
  chart: SceneNode,
  bg: SemanticToken,
  foregrounds: SemanticToken[],
  modeId: string,
  collection: VariableCollection,
  warnings: string[]
): Promise<CategoryCounts> {
  const modeBg = bg.modes.find(m => m.modeId === modeId) ?? bg.modes[0]
  if (!modeBg) return emptyCounts()

  applyModeToNode(chart, collection, modeId, warnings)

  // Fill the left swatch / token block
  await fillColorMeta(chart, {
    variable: bg.variable,
    rgba: modeBg.rgba,
    name: bg.name,
    path: modeBg.primitivePath,
    includeHsla: false
  })

  // Find the tokens slot and reconcile rows
  const slot = findSlot(chart, 'tokens')
  if (!slot) {
    warnings.push(
      `Contrast chart for "${bg.name}" has no "tokens" slot — rows skipped.`
    )
    return emptyCounts()
  }

  // Template charts ship placeholder $contrast rows (all labeled "TOKEN NAME").
  // Claim them in order for real foreground tokens, then drop leftovers so
  // they are not left as extra example rows.
  const placeholders = slot.children.filter(
    c => c.name.trim().toLowerCase() === '$contrast'
  )
  let prototype: SceneNode | null = placeholders[0] ?? slot.children[0] ?? null

  if (!prototype) {
    warnings.push(
      `Contrast chart for "${bg.name}" has an empty tokens slot — add one $contrast row to the component.`
    )
    return emptyCounts()
  }

  const prototypeClone = prototype

  for (let i = 0; i < foregrounds.length && i < placeholders.length; i++) {
    tagNode(placeholders[i], 'row', foregrounds[i].variable.id)
  }
  for (let i = foregrounds.length; i < placeholders.length; i++) {
    placeholders[i].remove()
  }

  return reconcile(
    slot,
    'row',
    foregrounds.map(fg => ({
      key: fg.variable.id,
      adoptName: fg.name,
      render: async (row: SceneNode) => {
        row.visible = true
        await fillContrastRow(row, bg, fg, modeId, collection, warnings)
      }
    })),
    () => {
      const clone = prototypeClone.clone()
      clone.visible = true
      return clone
    }
  )
}

export async function renderContrast(
  container: FrameNode,
  model: SemanticModel,
  templates: {
    chart: ComponentNode | FrameNode
    heading: ComponentNode | FrameNode
  },
  warnings: string[]
): Promise<CategoryCounts> {
  if (container.layoutMode === 'NONE') {
    ensureAutoLayout(container, 'VERTICAL', { gap: 100 })
  }

  let totals = emptyCounts()

  const modeSections = model.modes.map(mode => ({
    key: `mode:${mode.modeId}`,
    adoptName: mode.name,
    render: async (sectionNode: SceneNode) => {
      const section = sectionNode as FrameNode
      if (section.layoutMode === 'NONE') {
        ensureAutoLayout(section, 'VERTICAL', { gap: 48 })
      }

      // Heading — keep Light appearance (no inverted Dark styles, no divider)
      let heading = section.children.find(
        c => c.getPluginData('sgKind') === 'heading'
      ) as SceneNode | undefined

      if (!heading) {
        const existing = section.children.find(
          c =>
            c.name.toLowerCase().includes('heading') ||
            c.name.toLowerCase().includes('style guide')
        )
        if (existing) {
          heading = existing
        } else {
          heading = createFromTemplate(templates.heading)
          section.insertChild(0, heading)
        }
        heading.setPluginData('sgKind', 'heading')
        heading.setPluginData('sgKey', `heading:mode:${mode.modeId}`)
      }
      await setHeadingText(heading, mode.name)
      applyModeToNode(heading, model.collection, lightModeId(model.collection), warnings)
      hideHeadingSeparator(heading)

      // Charts wrapper
      let chartsFrame = section.children.find(
        c =>
          c.type === 'FRAME' &&
          (c.name.toLowerCase().includes('chart') ||
            c.getPluginData('sgKind') === 'charts-wrap')
      ) as FrameNode | undefined

      if (!chartsFrame) {
        // Prefer adopting a non-heading frame child
        chartsFrame = section.children.find(
          c =>
            c.type === 'FRAME' &&
            c.getPluginData('sgKind') !== 'heading' &&
            c !== heading
        ) as FrameNode | undefined
      }

      if (!chartsFrame) {
        chartsFrame = figma.createFrame()
        chartsFrame.name = 'charts'
        ensureAutoLayout(chartsFrame, 'VERTICAL', { gap: 48 })
        section.appendChild(chartsFrame)
      }
      chartsFrame.setPluginData('sgKind', 'charts-wrap')
      chartsFrame.setPluginData('sgKey', `charts:${mode.modeId}`)
      if (chartsFrame.layoutMode === 'NONE') {
        ensureAutoLayout(chartsFrame, 'VERTICAL', { gap: 48 })
      }

      // Mode applies to charts only so the heading stays Light-styled
      applyModeToNode(chartsFrame, model.collection, mode.modeId, warnings)

      const chartCounts = await reconcile(
        chartsFrame,
        'chart',
        model.backgrounds.map(bg => ({
          key: `${mode.modeId}:${bg.variable.id}`,
          adoptName: bg.name,
          render: async (chartNode: SceneNode) => {
            const rowCounts = await fillContrastChart(
              chartNode,
              bg,
              model.foregrounds,
              mode.modeId,
              model.collection,
              warnings
            )
            totals = mergeCounts(totals, rowCounts)
          }
        })),
        () => createFromTemplate(templates.chart)
      )

      totals = mergeCounts(totals, chartCounts)
    }
  }))

  const sectionCounts = await reconcile(
    container,
    'section',
    modeSections,
    () => {
      const frame = figma.createFrame()
      frame.name = 'mode-section'
      ensureAutoLayout(frame, 'VERTICAL', { gap: 48 })
      return frame
    }
  )

  totals = mergeCounts(totals, sectionCounts)
  return totals
}
