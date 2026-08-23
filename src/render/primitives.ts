/// <reference path="../../node_modules/@figma/plugin-typings/index.d.ts" />

import type { CategoryCounts } from '../messages'
import type { PrimitiveFamily } from '../model/primitives'
import { createFromTemplate } from '../settings'
import { ensureAutoLayout, fillColorMeta, setHeadingText } from './fill'
import { emptyCounts, mergeCounts, reconcile } from './reconcile'

export async function renderPrimitives(
  container: FrameNode,
  families: PrimitiveFamily[],
  templates: {
    swatch: ComponentNode | FrameNode
    heading: ComponentNode | FrameNode
    brandSwatch?: ComponentNode | FrameNode | null
  },
  brandColors: Record<string, string> = {}
): Promise<CategoryCounts> {
  // Ensure container is vertical auto-layout
  if (container.layoutMode === 'NONE') {
    ensureAutoLayout(container, 'VERTICAL', { gap: 100 })
  }

  let totals = emptyCounts()

  const sectionItems = families.map(family => ({
    key: family.path,
    adoptName: family.label,
    render: async (sectionNode: SceneNode) => {
      const section = sectionNode as FrameNode
      if (section.layoutMode === 'NONE') {
        ensureAutoLayout(section, 'VERTICAL', { gap: 60 })
      }

      // Heading
      let heading = section.children.find(
        c => c.getPluginData('sgKind') === 'heading'
      ) as SceneNode | undefined

      if (!heading) {
        // Adopt first child that looks like a heading, or create
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
        heading.setPluginData('sgKey', `heading:${family.path}`)
      }
      await setHeadingText(heading, family.label)

      // Colors wrapper
      let colorsFrame = section.children.find(
        c =>
          c.type === 'FRAME' &&
          (c.name.toLowerCase() === 'colors' ||
            c.getPluginData('sgKind') === 'colors-wrap')
      ) as FrameNode | undefined

      if (!colorsFrame) {
        colorsFrame = figma.createFrame()
        colorsFrame.name = 'colors'
        ensureAutoLayout(colorsFrame, 'HORIZONTAL', {
          gap: 20,
          wrap: true
        })
        section.appendChild(colorsFrame)
      }
      colorsFrame.setPluginData('sgKind', 'colors-wrap')
      colorsFrame.setPluginData('sgKey', `colors:${family.path}`)
      if (colorsFrame.layoutMode === 'NONE') {
        ensureAutoLayout(colorsFrame, 'HORIZONTAL', { gap: 20, wrap: true })
      }

      const brandShade = brandColors[family.path] ?? ''
      const brandTemplate = templates.brandSwatch

      const swatchCounts = await reconcile(
        colorsFrame,
        'swatch',
        family.shades.map(shade => {
          const isBrand = Boolean(brandShade && shade.shade === brandShade && brandTemplate)
          return {
            key: shade.variable.id,
            adoptName: shade.displayName,
            variant: isBrand ? 'brand' : 'swatch',
            render: async (swatchNode: SceneNode) => {
              await fillColorMeta(swatchNode, {
                variable: shade.variable,
                rgba: shade.rgba,
                name: shade.displayName,
                includeHsla: true
              })
            }
          }
        }),
        item =>
          createFromTemplate(
            item.variant === 'brand' && brandTemplate ? brandTemplate : templates.swatch
          )
      )

      totals = mergeCounts(totals, swatchCounts)
    }
  }))

  const sectionCounts = await reconcile(
    container,
    'section',
    sectionItems,
    () => {
      const frame = figma.createFrame()
      frame.name = 'section'
      ensureAutoLayout(frame, 'VERTICAL', { gap: 60 })
      return frame
    }
  )

  totals = mergeCounts(totals, sectionCounts)
  return totals
}
