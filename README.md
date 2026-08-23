# Style Guide Editor — Figma Plugin

Generate and update a color style guide from your Figma variables. The plugin
reads the **Primitives** and **Tokens** collections, then reconciles the
contents of parent frames named `$primitives-parent`, `$contrast-parent`, and
`$token-parent`.

## How it works

1. Open the plugin — a panel asks what to update and where to look.
2. Capture template components (select on canvas → **Use selection**).
3. For each primitive color set, optionally mark a brand shade (e.g. Primary Color 1 → `600`).
4. Click **Update style guide**. The plugin creates, updates, and removes
   children so the frames match your variables.

Variables are the source of truth. The plugin **writes** fills and text onto
generated instances — it does not read `$color` layers to discover colors.

## Parent frames

| Frame name            | Contents generated                                                                 |
|-----------------------|------------------------------------------------------------------------------------|
| `$primitives-parent`  | One section per color family, with a heading and a swatch per shade                |
| `$contrast-parent`    | One section per mode (Light / Dark), with a contrast chart per background token    |
| `$token-parent`       | A token table with group headings and one row per semantic token (Light + Dark)    |

These parent names are intentionally distinct from child layer names like `$token`
and `$contrast` (used inside chart/token components) so the plugin never mistakes
a chart swatch block for a token table container.

Place empty (or previously generated) frames with these names in your file.
Scope can be the current selection, the current page, or the entire file.

## Templates to capture

Select each component (or instance / frame) on the canvas and click
**Use selection** in the plugin:

| Slot                 | Source component in your file                          |
|----------------------|--------------------------------------------------------|
| Primitive swatch     | `Swatch` component                                     |
| Brand swatch         | Brand/hero swatch component                            |
| Contrast chart       | `contrast` component (with a `tokens` slot of rows)    |
| Token row            | `token` component (one `$token` block per mode)        |
| Section heading      | `Style Guide Heading`                                  |
| Token group heading  | The `Row` frame that wraps `.Row Heading Label`        |

Templates are stored per file in plugin data and persist across runs.

### Contrast chart rows

The chart component must keep **at least one** `$contrast` row inside its
`tokens` slot. The plugin clones that row when more foreground tokens are
needed, and hides/removes extras when reconciling.

### Token row modes

Each `$token` block inside the token component maps to one collection mode
by index (first block = Light, second = Dark, etc.).

## What gets generated

### Primitives

- Every shade of every `Color/…` family in the primitives collection
- Sections ordered: **Greyscale → Status → Primary brand → Secondary brand**
- Section title from the family's `Color Name` string variable
- Swatch fields: `$color` (bound), `$name`, `$hex`, `$rgba`, `$hsla`
- Optional **brand shade** per family uses the Brand swatch template instead of the regular swatch

### Contrast

- Backgrounds: tokens in the **Background** and **Surface** groups
- Foreground rows: tokens in the **Foreground** and **Text** groups
- Charts for **every mode** in the token collection
- Per row: `$bg` / `$fg` fills, `$name`, `$ratio`, PASS/FAIL for
  `$AAN` / `$AAL` / `$AAAN` / `$AAAL` / `$UI`

### Tokens

- Group headings: Background, Foreground, Surface, Text, Stroke
- Per row: `$name`, `$path` (resolved primitive), and per-mode `$color` /
  `$hex` / `$rgba`

## Setup

```bash
npm install
npm run build
```

In Figma desktop: **Plugins → Development → Import plugin from manifest…**
and select `manifest.json`.

While developing: `npm run watch`.

## Reconcile behavior

Re-running does not wipe the frame. The plugin:

- Tags generated nodes with plugin data (`sgKind` / `sgKey`)
- Reuses existing items when keys match
- Adopts untagged children on first run by matching `$name` text
- Removes only managed children whose variable no longer exists

## Files

| Path | Role |
|------|------|
| `ui.html` | Plugin panel |
| `src/code.ts` | Message router |
| `src/settings.ts` | Template + preference persistence |
| `src/variables.ts` | Variables API helpers + collection detection |
| `src/model/` | Primitive + semantic token models |
| `src/render/` | Reconcile engine + generators |
| `src/wcag.ts` | Contrast math + PASS/FAIL colors |
| `src/colors.ts` | hex / rgba / hsla formatters |

## Notes

- Collection dropdowns auto-detect the token collection (mostly aliases) and
  its primitive target; override if needed.
- If mode overrides fail on an instance sublayer, the plugin falls back to
  static fills and reports a warning.
- Nested layers also named `$contrast` or `$token` (rows / mode blocks) are
  ignored as containers — parents use `-parent` suffixes to avoid collisions.
