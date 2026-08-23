# Style Guide Editor — user guide

This Figma plugin builds and refreshes a **color style guide** from your file’s variables. You place three empty parent frames, capture a few templates, then run the plugin. It fills those frames with swatches, token rows, and contrast charts.

It works in **Figma desktop** (development plugins cannot be imported in the browser).

---

## 1. Install and import into Figma

### Build the plugin

```bash
npm install
npm run build
```

That compiles `src/code.ts` into `code.js`, which `manifest.json` points at.

While changing code, use:

```bash
npm run watch
```

After each rebuild, reload the plugin in Figma (**Plugins → Development → Style Guide Editor**, or close and run it again).

### Import the manifest

1. Open **Figma desktop**.
2. Open the file that contains your color variables (Primitives + Tokens).
3. Go to **Plugins → Development → Import plugin from manifest…**
4. Select `manifest.json` in this folder.
5. Confirm **Style Guide Editor** appears under **Plugins → Development**.

You do not publish this plugin to the Community to use it on your own files.

### Run it

**Plugins → Development → Style Guide Editor**

The panel stays open. Capture templates first, then click **Update style guide**.

---

## 2. What you must have in the Figma file

### Variable collections

The plugin reads **local color variables**, not JSON token files.

Typical setup:

| Collection | Role |
|------------|------|
| Primitives (or similar) | Raw colors, e.g. `Color/Greyscale/950`, `Color/Brand/Primary Color 1/600` |
| Tokens (Light / Dark modes) | Semantic aliases, e.g. `Background/bg-primary` → a primitive |

Token groups the plugin understands by **first path segment**:

- **Background** and **Surface** → contrast chart backgrounds  
- **Foreground** and **Text** → contrast chart rows  
- **Stroke** (and the groups above) → token table sections  

If a family has a string variable named `Color Name` next to its shades, that label is used as the primitive section title (e.g. “Greyscale”).

### Three parent frames

Create **frames** (not groups) and name them exactly. Matching is case-insensitive after trim.

| Frame name | Used for |
|------------|----------|
| `$primitives-parent` | Primitive swatch sections |
| `$token-parent` | Semantic token table |
| `$contrast-parent` | Contrast charts |

You can leave them **empty**. The plugin creates sections, headings, and children inside them.

Why `-parent`? Chart and token **templates** already contain layers named `$token` and `$contrast`. Distinct parent names stop the plugin from treating those inner layers as the page containers.

**Tips**

- Put all three on the style-guide page (or select them if you use Selection scope).
- Vertical auto-layout on the parent is helpful; if layout is None, the plugin turns it on.
- You do **not** hand-build every swatch. You *do* need the templates below.

---

## 3. Templates (required building blocks)

The plugin never draws charts from scratch. It **clones** components (or frames) you capture.

For each slot:

1. Select **one** component, component set, instance, or frame on the canvas.  
2. In the plugin, click **Use selection** next to that slot.

Templates are saved **per Figma file** and persist between runs.

| Plugin slot | Typical source | Required when |
|-------------|----------------|---------------|
| Primitive swatch | Regular shade card | Updating primitives |
| Brand swatch | Hero / brand shade card | Any family has a brand shade checked |
| Contrast chart | Full contrast card (swatch + table) | Updating contrast |
| Token row | One table row (Light + Dark cells) | Updating tokens |
| Section heading | Style Guide Heading | Primitives or contrast |
| Token group heading | “Background / Foreground / …” row | Updating tokens |

If a required template is missing, the run stops with an error for that category.

---

## 4. Named layers inside each template

The plugin finds layers by **name** (any depth). Names must match exactly except case and extra spaces.

Optional layers are skipped if absent. Required ones are called out below.

### Primitive swatch

Used once per shade (50, 100, 600, …).

| Layer | Type | Written value |
|-------|------|----------------|
| `$color` | Shape/frame with fill | Bound to the primitive variable |
| `$name` | Text | e.g. `Greyscale 950` |
| `$hex` | Text | `hex: #0B0B0B` |
| `$rgba` | Text | `rgba: rgba(11, 11, 11, 1)` |
| `$hsla` | Text | `hsla: hsla(0, 0%, 4%, 100%)` |

`$color` is required for a useful swatch. Text layers are optional but recommended.

### Brand swatch

Same layer names as the primitive swatch (`$color`, `$name`, `$hex`, `$rgba`, `$hsla`). Layout can be larger or “hero” styled. Only the shade you mark as brand uses this template; other shades stay on the regular swatch.

### Section heading

Any component with a **text** descendant. The plugin sets that text to the family name (primitives) or mode name (Light / Dark for contrast). Extra lines under the heading are stripped on contrast headings so Light and Dark look the same.

### Contrast chart

One instance = one **background** token.

**Left card** (often a frame named `$token`):

| Layer | Written value |
|-------|----------------|
| `$color` | Bound to the background token |
| `$name` | Token name, e.g. `bg-primary` |
| `$path` | Resolved primitive path, e.g. `Color/Greyscale/0` |
| `$hex` / `$rgba` | Formatted color |

**Right table**

| Layer | Role |
|-------|------|
| `tokens` | Frame **or** slot that holds rows. Required. |
| `$contrast` | One row prototype **inside** `tokens`. Keep at least one. Placeholder “TOKEN NAME” rows are reused, then extras removed. |

**Each `$contrast` row**

| Layer | Written value |
|-------|----------------|
| `$bg` | Fill = background token |
| `$fg` | Fill = foreground token |
| `$name` | Foreground token name |
| `$ratio` | Contrast ratio, e.g. `19.68:1` |
| `$AAN` | AA normal (4.5:1) — `PASS` / `FAIL` |
| `$AAL` | AA large (3:1) |
| `$AAAN` | AAA normal (7:1) |
| `$AAAL` | AAA large (4.5:1) |
| `$UI` | UI / graphics (3:1) |

PASS is green, FAIL is red. Text layers get the word PASS/FAIL; filled chips get the color.

The column header row (FOREGROUND, RATIO, …) is layout only. The plugin does not rename it.

### Token row

One instance = one semantic token.

Include **one `$token` block per mode**, in mode order (first = Light, second = Dark).

Inside each `$token` block (and optionally on the row itself):

| Layer | Written value |
|-------|----------------|
| `$color` | Bound fill for that mode |
| `$name` | Token leaf name (usually on the first block / row) |
| `$path` | Primitive path for that mode |
| `$hex` / `$rgba` | Formatted color |

If there are fewer `$token` blocks than modes, extra modes are skipped and a warning is shown.

### Token group heading

A row used as a section label (Background, Foreground, …). The plugin prefers a layer named `.Row Heading Label`; otherwise it uses the first text node.

`$token-parent` does **not** get a page title (“Tokens”). Only group heading rows are inserted.

---

## 5. What the plugin generates in each parent

You create the **parent**. The plugin fills **children**.

### `$primitives-parent`

For each color family (Greyscale, status colors, primary, secondary):

1. A section frame  
2. A **section heading**  
3. A wrapping `colors` frame of swatches  

Order: **Greyscale → Status → Primary brand → Secondary brand**.

You do not add `$color` children by hand inside the parent.

### `$token-parent`

1. Optional existing `Header` row is kept if already named `Header`  
2. For each token group: a **group heading** row, then one **token row** per token  
3. No page-level heading  

Row order follows the Variables panel (`variableIds`).

### `$contrast-parent`

1. One **mode section** per token-collection mode (Light, then Dark)  
2. Each section: Light-styled heading (mode name) + a `charts` list  
3. One **contrast chart** per Background + Surface token  
4. Each chart: one `$contrast` row per Foreground + Text token, in Variables panel order  

Headings stay Light-styled even in the Dark section so they remain readable on a light style-guide page.

---

## 6. Using the plugin panel

### What to update

Check any combination:

1. **Primitive colors**  
2. **Token charts** (runs before contrast)  
3. **Contrast checks**

### Where to look

| Scope | Effect |
|-------|--------|
| Current selection | Only selected nodes (and their descendants) |
| Current page | Entire current page |
| Entire file | Every page (loads all pages first) |

If Selection is empty, the plugin errors and asks you to select frames.

### Collections

Dropdowns list local variable collections. Auto-detect prefers:

- **Tokens** = collection whose colors are mostly aliases  
- **Primitives** = collection those aliases point at  

Override if detection is wrong.

### Brand colors

After a primitives collection is selected, each family appears as a row:

- Leave **Brand** unchecked → every shade uses the primitive swatch  
- Check **Brand** and pick a number (e.g. `600`) → that shade uses the **Brand swatch** template  

Not every family needs a brand shade (Greyscale often has none). Picks are saved per file.

If any brand shade is set, you **must** capture the Brand swatch template.

### Update style guide

Click **Update style guide**. The plugin:

1. Builds primitives (if checked)  
2. Builds tokens (if checked)  
3. Builds contrast (if checked)  

A summary shows created / updated / removed counts, plus warnings.

---

## 7. First-time checklist

1. `npm install` and `npm run build`  
2. Import `manifest.json` in Figma desktop  
3. Confirm Primitives and Tokens collections exist with color variables  
4. Create empty frames: `$primitives-parent`, `$token-parent`, `$contrast-parent`  
5. Run the plugin and capture all templates you need  
6. Set brand shades (optional)  
7. Click **Update style guide** with the right checkboxes and scope  

On later runs, re-capture templates only if you changed the component. Re-run after you edit variables; existing tagged items update in place.

---

## 8. How updates work (reconcile)

Re-running does **not** delete the whole parent and start over.

- Generated nodes are tagged (`sgKind` / `sgKey`)  
- Matching keys are reused and rewritten  
- First run can adopt untagged children by `$name` text  
- Only tagged children whose variable disappeared are removed  
- Untagged extra layers you added by hand are left alone when possible  

Contrast placeholder rows named `$contrast` that still say “TOKEN NAME” are claimed in order, then leftovers are deleted.

---

## 9. Troubleshooting

| Symptom | What to check |
|--------|----------------|
| “No `$primitives-parent` frames found” | Frame name spelling; scope (wrong page / empty selection) |
| “Capture a … template before running” | **Use selection** for that slot |
| Contrast charts still show “TOKEN NAME” | `tokens` frame must contain `$contrast` rows; re-run after updating the plugin |
| Contrast overwritten by token tables | Parent must be `$contrast-parent` / `$token-parent`, not `$contrast` / `$token` |
| Dark heading looks inverted | Contrast headings are forced to Light mode; re-run contrast |
| Brand shade still looks like a normal swatch | Brand checkbox + shade number, and Brand swatch template captured |
| Extra modes missing on token rows | Add another `$token` block to the token row component |
| Font didn’t update | Plugin couldn’t load the text layer’s font; check mixed fonts |
| Wrong collection | Pick Primitives vs Tokens in the dropdowns |

---

## 10. Developer files

| Path | Role |
|------|------|
| `manifest.json` | Plugin name, `code.js`, `ui.html` |
| `ui.html` | Plugin panel |
| `src/code.ts` | Run order and messaging |
| `src/settings.ts` | Saved templates, collections, brand picks |
| `src/scan.ts` | Finds `-parent` frames |
| `src/variables.ts` | Variables API + collection detection |
| `src/model/` | Primitive families + semantic tokens |
| `src/render/` | Generators + reconcile |
| `src/wcag.ts` | Contrast math |
| `src/colors.ts` | hex / rgba / hsla strings |
