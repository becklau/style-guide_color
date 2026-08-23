"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

  // src/constants.ts
  var PARENT_FRAMES = {
    primitives: "$primitives-parent",
    contrast: "$contrast-parent",
    tokens: "$token-parent"
  };

  // src/variables.ts
  var stringVariablesCache = null;
  var colorVariablesCache = null;
  var collectionsCache = null;
  function isVariableAlias(value) {
    return typeof value === "object" && value !== null && "type" in value && value.type === "VARIABLE_ALIAS";
  }
  function isRGBorRGBA(value) {
    return typeof value === "object" && value !== null && "r" in value && "g" in value && "b" in value;
  }
  function toRGBA(color) {
    if ("a" in color && color.a !== void 0) return color;
    return { r: color.r, g: color.g, b: color.b, a: 1 };
  }
  async function getLocalCollections() {
    if (!collectionsCache) {
      collectionsCache = await figma.variables.getLocalVariableCollectionsAsync();
    }
    return collectionsCache;
  }
  async function getColorVariables() {
    if (!colorVariablesCache) {
      colorVariablesCache = await figma.variables.getLocalVariablesAsync("COLOR");
    }
    return colorVariablesCache;
  }
  async function getStringVariables() {
    if (!stringVariablesCache) {
      stringVariablesCache = await figma.variables.getLocalVariablesAsync("STRING");
    }
    return stringVariablesCache;
  }
  function clearVariableCaches() {
    stringVariablesCache = null;
    colorVariablesCache = null;
    collectionsCache = null;
  }
  async function resolveAliasChainForMode(variable, modeId) {
    let current = variable;
    const visited = /* @__PURE__ */ new Set();
    while (true) {
      if (visited.has(current.id)) break;
      visited.add(current.id);
      const collection = await figma.variables.getVariableCollectionByIdAsync(
        current.variableCollectionId
      );
      if (!collection) break;
      const effectiveMode = collection.modes.some((m) => m.modeId === modeId) ? modeId : collection.defaultModeId;
      const value = current.valuesByMode[effectiveMode];
      if (value && isVariableAlias(value)) {
        const next = await figma.variables.getVariableByIdAsync(value.id);
        if (!next) break;
        current = next;
      } else {
        break;
      }
    }
    return current;
  }
  function getTokenLeafName(variable) {
    const parts = variable.name.split("/");
    return parts[parts.length - 1];
  }
  function getTokenGroupName(variable) {
    const parts = variable.name.split("/");
    return parts.length >= 2 ? parts[0] : "Other";
  }
  async function getColorNameLabel(parentPath, collection) {
    const colorNameVarPath = `${parentPath}/Color Name`;
    const stringVars = await getStringVariables();
    const colorNameVar = stringVars.find(
      (v) => v.name === colorNameVarPath && v.variableCollectionId === collection.id
    );
    if (!colorNameVar) return null;
    const value = colorNameVar.valuesByMode[collection.defaultModeId];
    return typeof value === "string" ? value : null;
  }
  function resolveColorValueForMode(variable, modeId) {
    const value = variable.valuesByMode[modeId];
    if (value && isRGBorRGBA(value)) return toRGBA(value);
    return null;
  }
  async function resolveColorThroughAliases(variable, modeId) {
    const primitive = await resolveAliasChainForMode(variable, modeId);
    const collection = await figma.variables.getVariableCollectionByIdAsync(
      primitive.variableCollectionId
    );
    if (!collection) return null;
    const effectiveMode = collection.modes.some((m) => m.modeId === modeId) ? modeId : collection.defaultModeId;
    const rgba = resolveColorValueForMode(primitive, effectiveMode);
    if (!rgba) return null;
    return { rgba, primitive };
  }
  async function detectCollections() {
    var _a, _b, _c;
    const collections = await getLocalCollections();
    const colors = await getColorVariables();
    const info = collections.map((c) => ({
      id: c.id,
      name: c.name,
      modeCount: c.modes.length
    }));
    const byCollection = /* @__PURE__ */ new Map();
    for (const v of colors) {
      const list = (_a = byCollection.get(v.variableCollectionId)) != null ? _a : [];
      list.push(v);
      byCollection.set(v.variableCollectionId, list);
    }
    let tokenCollectionId = null;
    let primitiveCollectionId = null;
    let bestAliasRatio = 0;
    for (const collection of collections) {
      const vars = (_b = byCollection.get(collection.id)) != null ? _b : [];
      if (vars.length === 0) continue;
      let aliasCount = 0;
      const targetCollections = /* @__PURE__ */ new Map();
      for (const v of vars) {
        const modeId = collection.defaultModeId;
        const value = v.valuesByMode[modeId];
        if (value && isVariableAlias(value)) {
          aliasCount++;
          const target = await figma.variables.getVariableByIdAsync(value.id);
          if (target) {
            targetCollections.set(
              target.variableCollectionId,
              ((_c = targetCollections.get(target.variableCollectionId)) != null ? _c : 0) + 1
            );
          }
        }
      }
      const ratio = aliasCount / vars.length;
      if (ratio > bestAliasRatio && ratio >= 0.5) {
        bestAliasRatio = ratio;
        tokenCollectionId = collection.id;
        let bestTarget = null;
        let bestCount = 0;
        for (const [id, count] of targetCollections) {
          if (count > bestCount) {
            bestCount = count;
            bestTarget = id;
          }
        }
        primitiveCollectionId = bestTarget;
      }
    }
    if (!primitiveCollectionId) {
      const named = collections.find(
        (c) => /primitiv/i.test(c.name)
      );
      if (named) primitiveCollectionId = named.id;
    }
    if (!tokenCollectionId) {
      const named = collections.find(
        (c) => /token/i.test(c.name) || /light|dark|semantic/i.test(c.name)
      );
      if (named) tokenCollectionId = named.id;
    }
    return { collections: info, primitiveCollectionId, tokenCollectionId };
  }

  // src/model/primitives.ts
  function toFamilyInfo(families) {
    return families.map((f) => ({
      path: f.path,
      label: f.label,
      shades: f.shades.map((s) => s.shade)
    }));
  }
  function shadeSortKey(shade) {
    const n = Number(shade);
    return Number.isFinite(n) ? n : 9999;
  }
  function familySortKey(path) {
    const lower = path.toLowerCase();
    if (lower.includes("/greyscale") || lower.includes("/grayscale")) {
      return [0, 0, path];
    }
    if (lower.includes("/status/")) {
      return [1, 0, path];
    }
    const primaryMatch = lower.match(/\/brand\/primary[^/]*\/?/);
    if (primaryMatch || lower.includes("/primary color")) {
      const n = Number((path.match(/Primary Color\s+(\d+)/i) || [])[1] || 0);
      return [2, n, path];
    }
    const secondaryMatch = lower.match(/\/brand\/secondary/) || lower.includes("/secondary color");
    if (secondaryMatch) {
      const n = Number((path.match(/Secondary Color\s+(\d+)/i) || [])[1] || 0);
      return [3, n, path];
    }
    if (lower.includes("/brand/")) {
      return [4, 0, path];
    }
    return [5, 0, path];
  }
  async function buildPrimitives(collectionId) {
    var _a, _b, _c;
    const collections = await getLocalCollections();
    const collection = collections.find((c) => c.id === collectionId);
    if (!collection) throw new Error("Primitive collection not found.");
    const colors = await getColorVariables();
    const inCollection = colors.filter((v) => v.variableCollectionId === collectionId);
    const familyMap = /* @__PURE__ */ new Map();
    for (const v of inCollection) {
      if (!v.name.startsWith("Color/")) continue;
      const segments = v.name.split("/");
      if (segments.length < 3) continue;
      const parentPath = segments.slice(0, -1).join("/");
      const list = (_a = familyMap.get(parentPath)) != null ? _a : [];
      list.push(v);
      familyMap.set(parentPath, list);
    }
    const families = [];
    const modeId = collection.defaultModeId;
    const orderedPaths = [...familyMap.keys()].sort((a, b) => {
      const ka = familySortKey(a);
      const kb = familySortKey(b);
      if (ka[0] !== kb[0]) return ka[0] - kb[0];
      if (ka[1] !== kb[1]) return ka[1] - kb[1];
      return ka[2].localeCompare(kb[2]);
    });
    for (const path of orderedPaths) {
      const vars = (_b = familyMap.get(path)) != null ? _b : [];
      const label = (_c = await getColorNameLabel(path, collection)) != null ? _c : path.split("/").slice(-1)[0];
      const shades = [];
      for (const v of vars) {
        const shade = v.name.split("/").slice(-1)[0];
        const rgba = resolveColorValueForMode(v, modeId);
        if (!rgba) continue;
        shades.push({
          variable: v,
          shade,
          displayName: `${label} ${shade}`,
          rgba,
          path: v.name
        });
      }
      shades.sort((a, b) => shadeSortKey(a.shade) - shadeSortKey(b.shade));
      if (shades.length > 0) {
        families.push({ path, label, shades });
      }
    }
    return families;
  }

  // src/model/semantic.ts
  var BACKGROUND_GROUPS = ["Background", "Surface"];
  var FOREGROUND_GROUPS = ["Foreground", "Text"];
  var GROUP_ORDER = ["Background", "Foreground", "Surface", "Text", "Stroke"];
  async function buildSemanticTokens(collectionId) {
    const collections = await getLocalCollections();
    const collection = collections.find((c) => c.id === collectionId);
    if (!collection) throw new Error("Token collection not found.");
    const colors = await getColorVariables();
    const inCollection = colors.filter((v) => v.variableCollectionId === collectionId);
    const modes = collection.modes.map((m) => ({
      modeId: m.modeId,
      name: m.name
    }));
    const tokens = [];
    for (const v of inCollection) {
      const modeValues = [];
      for (const mode of modes) {
        const resolved = await resolveColorThroughAliases(v, mode.modeId);
        if (!resolved) continue;
        modeValues.push({
          modeId: mode.modeId,
          modeName: mode.name,
          rgba: resolved.rgba,
          primitivePath: resolved.primitive.name,
          primitive: resolved.primitive
        });
      }
      if (modeValues.length === 0) continue;
      tokens.push({
        variable: v,
        name: getTokenLeafName(v),
        group: getTokenGroupName(v),
        modes: modeValues
      });
    }
    const panelIndex = /* @__PURE__ */ new Map();
    collection.variableIds.forEach((id, i) => panelIndex.set(id, i));
    const byPanelOrder = (a, b) => {
      var _a, _b;
      return ((_a = panelIndex.get(a.variable.id)) != null ? _a : Number.MAX_SAFE_INTEGER) - ((_b = panelIndex.get(b.variable.id)) != null ? _b : Number.MAX_SAFE_INTEGER);
    };
    tokens.sort(byPanelOrder);
    const groupMap = /* @__PURE__ */ new Map();
    const groupOrderSeen = [];
    for (const t of tokens) {
      if (!groupMap.has(t.group)) {
        groupMap.set(t.group, []);
        groupOrderSeen.push(t.group);
      }
      groupMap.get(t.group).push(t);
    }
    const sortedGroupNames = [
      ...GROUP_ORDER.filter((g) => groupMap.has(g)),
      ...groupOrderSeen.filter((g) => !GROUP_ORDER.includes(g))
    ];
    const groups = sortedGroupNames.map((name) => {
      var _a;
      return {
        name,
        tokens: (_a = groupMap.get(name)) != null ? _a : []
      };
    });
    const backgrounds = tokens.filter((t) => BACKGROUND_GROUPS.includes(t.group)).sort(byPanelOrder);
    const foregrounds = tokens.filter((t) => FOREGROUND_GROUPS.includes(t.group)).sort(byPanelOrder);
    return { collection, modes, groups, backgrounds, foregrounds };
  }

  // src/settings.ts
  var SETTINGS_KEY = "styleGuideEditor.v1";
  var DEFAULT_SETTINGS = {
    templates: {},
    primitiveCollectionId: null,
    tokenCollectionId: null,
    lastScope: "page",
    lastCategories: {
      primitives: true,
      contrast: true,
      tokens: true
    },
    brandColors: {}
  };
  function loadSettings() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
    try {
      const raw = figma.root.getPluginData(SETTINGS_KEY);
      if (!raw) {
        return __spreadProps(__spreadValues({}, DEFAULT_SETTINGS), {
          templates: {},
          lastCategories: __spreadValues({}, DEFAULT_SETTINGS.lastCategories),
          brandColors: {}
        });
      }
      const parsed = JSON.parse(raw);
      return {
        templates: (_a = parsed.templates) != null ? _a : {},
        primitiveCollectionId: (_b = parsed.primitiveCollectionId) != null ? _b : null,
        tokenCollectionId: (_c = parsed.tokenCollectionId) != null ? _c : null,
        lastScope: (_d = parsed.lastScope) != null ? _d : "page",
        lastCategories: {
          primitives: (_f = (_e = parsed.lastCategories) == null ? void 0 : _e.primitives) != null ? _f : true,
          contrast: (_h = (_g = parsed.lastCategories) == null ? void 0 : _g.contrast) != null ? _h : true,
          tokens: (_j = (_i = parsed.lastCategories) == null ? void 0 : _i.tokens) != null ? _j : true
        },
        brandColors: (_k = parsed.brandColors) != null ? _k : {}
      };
    } catch (e) {
      return __spreadProps(__spreadValues({}, DEFAULT_SETTINGS), {
        templates: {},
        lastCategories: __spreadValues({}, DEFAULT_SETTINGS.lastCategories),
        brandColors: {}
      });
    }
  }
  function saveSettings(settings) {
    figma.root.setPluginData(SETTINGS_KEY, JSON.stringify(settings));
  }
  function captureTemplateFromSelection(slot) {
    const selection = figma.currentPage.selection;
    if (selection.length !== 1) {
      throw new Error("Select exactly one component, component set, or instance.");
    }
    const node = selection[0];
    let component = null;
    if (node.type === "COMPONENT") {
      component = node;
    } else if (node.type === "COMPONENT_SET") {
      component = node.defaultVariant;
    } else if (node.type === "INSTANCE") {
      component = node.mainComponent;
    } else if (node.type === "FRAME") {
      return {
        nodeId: node.id,
        key: node.id,
        name: node.name
      };
    }
    if (!component) {
      throw new Error("Selection must be a component, component set, instance, or frame.");
    }
    return {
      nodeId: component.id,
      key: component.key,
      name: component.name
    };
  }
  async function resolveTemplateNode(ref) {
    try {
      const byId = await figma.getNodeByIdAsync(ref.nodeId);
      if (byId) {
        if (byId.type === "COMPONENT") return byId;
        if (byId.type === "FRAME") return byId;
        if (byId.type === "COMPONENT_SET") return byId.defaultVariant;
      }
    } catch (e) {
    }
    if (ref.key && ref.key !== ref.nodeId) {
      try {
        const imported = await figma.importComponentByKeyAsync(ref.key);
        return imported;
      } catch (e) {
      }
    }
    return null;
  }
  function createFromTemplate(template) {
    if (template.type === "COMPONENT") {
      return template.createInstance();
    }
    return template.clone();
  }

  // src/utils/nodes.ts
  function collectDescendants(node) {
    const result = [];
    function walk(n) {
      if ("children" in n) {
        for (const child of n.children) {
          result.push(child);
          walk(child);
        }
      }
    }
    walk(node);
    return result;
  }
  function findByName(nodes, name) {
    const target = name.trim().toLowerCase();
    for (const n of nodes) {
      if (n.name.trim().toLowerCase() === target) return n;
    }
    return null;
  }
  function findAllByName(nodes, name) {
    const target = name.trim().toLowerCase();
    return nodes.filter((n) => n.name.trim().toLowerCase() === target);
  }
  function findDeepByName(root, name) {
    return findByName(collectDescendants(root), name);
  }
  function findAllDeepByName(root, name) {
    return findAllByName(collectDescendants(root), name);
  }
  function findSlot(root, name = "tokens") {
    const all = collectDescendants(root);
    const target = name.trim().toLowerCase();
    for (const n of all) {
      if (n.type === "SLOT" && n.name.trim().toLowerCase() === target) {
        return n;
      }
    }
    for (const n of all) {
      if ((n.type === "FRAME" || n.type === "GROUP") && n.name.trim().toLowerCase() === target) {
        return n;
      }
    }
    return null;
  }
  async function setTextValue(node, text) {
    if (node.type !== "TEXT") return;
    const textNode = node;
    try {
      if (textNode.fontName === figma.mixed) {
        const len = textNode.characters.length;
        const fonts = /* @__PURE__ */ new Set();
        for (let i = 0; i < len; i++) {
          const f = textNode.getRangeFontName(i, i + 1);
          fonts.add(JSON.stringify(f));
        }
        for (const f of fonts) {
          await figma.loadFontAsync(JSON.parse(f));
        }
      } else {
        await figma.loadFontAsync(textNode.fontName);
      }
      textNode.characters = text;
    } catch (e) {
    }
  }
  function setBoundFill(node, variable, fallbackColor) {
    var _a, _b;
    if (!("fills" in node)) return;
    try {
      const alias = figma.variables.createVariableAlias(variable);
      const paint = {
        type: "SOLID",
        color: fallbackColor ? { r: fallbackColor.r, g: fallbackColor.g, b: fallbackColor.b } : { r: 0, g: 0, b: 0 },
        opacity: (_a = fallbackColor == null ? void 0 : fallbackColor.a) != null ? _a : 1,
        boundVariables: { color: alias }
      };
      node.fills = [paint];
    } catch (e) {
      if (fallbackColor) {
        ;
        node.fills = [
          {
            type: "SOLID",
            color: { r: fallbackColor.r, g: fallbackColor.g, b: fallbackColor.b },
            opacity: (_b = fallbackColor.a) != null ? _b : 1
          }
        ];
      }
    }
  }
  function trySetMode(node, collection, modeId) {
    try {
      if ("setExplicitVariableModeForCollection" in node) {
        ;
        node.setExplicitVariableModeForCollection(collection, modeId);
        return true;
      }
    } catch (e) {
    }
    return false;
  }
  function matchesName(node, name) {
    return node.name.trim().toLowerCase() === name.trim().toLowerCase();
  }

  // src/wcag.ts
  var PASS_COLOR = { r: 0.18, g: 0.75, b: 0.4 };
  var FAIL_COLOR = { r: 0.87, g: 0.25, b: 0.25 };
  function relLuminance(c) {
    const lin = (v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  }
  function contrastRatio(a, b) {
    const lA = relLuminance(a);
    const lB = relLuminance(b);
    const lighter = Math.max(lA, lB);
    const darker = Math.min(lA, lB);
    return (lighter + 0.05) / (darker + 0.05);
  }
  function ratioLabel(ratio) {
    return `${ratio.toFixed(2)}:1`;
  }
  function setResultColor(node, pass) {
    if (!("fills" in node)) return;
    const color = pass ? PASS_COLOR : FAIL_COLOR;
    node.fills = [
      { type: "SOLID", color, opacity: 1 }
    ];
  }
  async function setResultState(node, pass) {
    if (node.type === "TEXT") {
      await setTextValue(node, pass ? "PASS" : "FAIL");
    }
    setResultColor(node, pass);
  }
  var WCAG_THRESHOLDS = {
    AAN: 4.5,
    AAL: 3,
    AAAN: 7,
    AAAL: 4.5,
    UI: 3
  };

  // src/colors.ts
  function toRGBA2(color) {
    if ("a" in color && color.a !== void 0) return color;
    return { r: color.r, g: color.g, b: color.b, a: 1 };
  }
  function componentToHex(c) {
    const n = Math.round(Math.max(0, Math.min(1, c)) * 255);
    return n.toString(16).toUpperCase().padStart(2, "0");
  }
  function rgbToHex(color) {
    const c = toRGBA2(color);
    return `#${componentToHex(c.r)}${componentToHex(c.g)}${componentToHex(c.b)}`;
  }
  function formatAlpha(alpha) {
    const rounded = Math.round(alpha * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }
  function rgbToHslaComponents(color) {
    var _a;
    const { r, g, b } = color;
    const a = (_a = color.a) != null ? _a : 1;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) {
      return { h: 0, s: 0, l: l * 100, a };
    }
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
      a
    };
  }
  function formatHex(color) {
    return `hex: ${rgbToHex(color)}`;
  }
  function formatRgba(color) {
    var _a;
    const c = toRGBA2(color);
    const r = Math.round(c.r * 255);
    const g = Math.round(c.g * 255);
    const b = Math.round(c.b * 255);
    return `rgba: rgba(${r}, ${g}, ${b}, ${formatAlpha((_a = c.a) != null ? _a : 1)})`;
  }
  function formatHsla(color) {
    const { h, s, l, a } = rgbToHslaComponents(toRGBA2(color));
    const alpha = Math.round((a != null ? a : 1) * 100);
    return `hsla: hsla(${h}, ${s}%, ${l}%, ${alpha}%)`;
  }

  // src/render/fill.ts
  async function fillColorMeta(root, opts) {
    const all = collectDescendants(root);
    const search = [root, ...all];
    if (opts.variable) {
      const colorNodes = findAllByName(search, "$color");
      for (const n of colorNodes) {
        setBoundFill(n, opts.variable, opts.rgba);
      }
    }
    if (opts.name !== void 0) {
      const nameNode = findByName(search, "$name");
      if (nameNode) await setTextValue(nameNode, opts.name);
    }
    if (opts.path !== void 0) {
      const pathNode = findByName(search, "$path");
      if (pathNode) await setTextValue(pathNode, opts.path);
    }
    const hexNode = findByName(search, "$hex");
    if (hexNode) await setTextValue(hexNode, formatHex(opts.rgba));
    const rgbaNode = findByName(search, "$rgba");
    if (rgbaNode) await setTextValue(rgbaNode, formatRgba(opts.rgba));
    if (opts.includeHsla !== false) {
      const hslaNode = findByName(search, "$hsla");
      if (hslaNode) await setTextValue(hslaNode, formatHsla(opts.rgba));
    }
  }
  function ensureAutoLayout(frame, direction, opts) {
    var _a;
    frame.layoutMode = direction;
    frame.primaryAxisSizingMode = (opts == null ? void 0 : opts.primaryAxisSizing) === "FIXED" ? "FIXED" : "AUTO";
    frame.counterAxisSizingMode = (opts == null ? void 0 : opts.counterAxisSizing) === "FIXED" ? "FIXED" : "AUTO";
    frame.itemSpacing = (_a = opts == null ? void 0 : opts.gap) != null ? _a : 20;
    if ((opts == null ? void 0 : opts.padding) !== void 0) {
      frame.paddingTop = opts.padding;
      frame.paddingBottom = opts.padding;
      frame.paddingLeft = opts.padding;
      frame.paddingRight = opts.padding;
    }
    if ((opts == null ? void 0 : opts.wrap) && "layoutWrap" in frame) {
      frame.layoutWrap = "WRAP";
    }
    frame.fills = [];
  }
  async function setHeadingText(headingInstance, text) {
    if ("findOne" in headingInstance) {
      const textNode = headingInstance.findOne(
        (n) => n.type === "TEXT"
      );
      if (textNode) await setTextValue(textNode, text);
    }
  }
  var SEPARATOR_NAMES = /* @__PURE__ */ new Set(["line", "divider", "separator", "rule", "stroke"]);
  function hideHeadingSeparator(heading) {
    function strip(n) {
      if ("strokes" in n && n.type !== "TEXT") {
        ;
        n.strokes = [];
      }
      const name = n.name.trim().toLowerCase();
      if (n.type === "LINE" || SEPARATOR_NAMES.has(name)) {
        n.visible = false;
      }
      if ("children" in n) {
        for (const child of n.children) {
          strip(child);
        }
      }
    }
    strip(heading);
  }
  function lightModeId(collection) {
    var _a;
    const named = collection.modes.find((m) => /light/i.test(m.name));
    return (_a = named == null ? void 0 : named.modeId) != null ? _a : collection.defaultModeId;
  }
  function applyModeToNode(node, collection, modeId, warnings) {
    const ok = trySetMode(node, collection, modeId);
    if (!ok) {
      warnings.push(
        `Could not set mode "${modeId}" on "${node.name}" \u2014 using resolved static fills.`
      );
    }
    return ok;
  }

  // src/render/reconcile.ts
  var KIND_KEY = "sgKind";
  var KEY_KEY = "sgKey";
  var VARIANT_KEY = "sgVariant";
  function getSgKind(node) {
    const v = node.getPluginData(KIND_KEY);
    return v || null;
  }
  function getSgKey(node) {
    const v = node.getPluginData(KEY_KEY);
    return v || null;
  }
  function tagNode(node, kind, key) {
    node.setPluginData(KIND_KEY, kind);
    node.setPluginData(KEY_KEY, key);
  }
  function readNameText(node) {
    const nameNode = findDeepByName(node, "$name");
    if (nameNode && nameNode.type === "TEXT") {
      return nameNode.characters.trim();
    }
    if ("findOne" in node) {
      const text = node.findOne((n) => n.type === "TEXT");
      if (text) return text.characters.trim();
    }
    return null;
  }
  async function reconcile(container, kind, desired, create) {
    var _a;
    const counts = { created: 0, updated: 0, removed: 0 };
    const children = [...container.children];
    const managed = /* @__PURE__ */ new Map();
    const untagged = [];
    for (const child of children) {
      const childKind = getSgKind(child);
      const childKey = getSgKey(child);
      if (childKind === kind && childKey) {
        managed.set(childKey, child);
      } else if (!childKind) {
        untagged.push(child);
      }
    }
    for (const item of desired) {
      if (managed.has(item.key)) continue;
      if (!item.adoptName) continue;
      const idx = untagged.findIndex((n) => {
        const name = readNameText(n);
        return name !== null && name.toLowerCase() === item.adoptName.toLowerCase();
      });
      if (idx >= 0) {
        const node = untagged.splice(idx, 1)[0];
        tagNode(node, kind, item.key);
        managed.set(item.key, node);
      }
    }
    const ordered = [];
    for (const item of desired) {
      let node = managed.get(item.key);
      const wantedVariant = (_a = item.variant) != null ? _a : "swatch";
      const existingVariant = node ? node.getPluginData(VARIANT_KEY) || "swatch" : "";
      if (node && wantedVariant !== existingVariant) {
        const index = container.children.indexOf(node);
        node.remove();
        managed.delete(item.key);
        node = create(item);
        tagNode(node, kind, item.key);
        node.setPluginData(VARIANT_KEY, wantedVariant);
        if (index >= 0) container.insertChild(index, node);
        else container.appendChild(node);
        managed.set(item.key, node);
        counts.created++;
      } else if (!node) {
        node = create(item);
        tagNode(node, kind, item.key);
        node.setPluginData(VARIANT_KEY, wantedVariant);
        container.appendChild(node);
        managed.set(item.key, node);
        counts.created++;
      } else {
        counts.updated++;
      }
      await item.render(node);
      ordered.push(node);
    }
    let insertAt = 0;
    for (const node of ordered) {
      const currentIndex = container.children.indexOf(node);
      if (currentIndex !== insertAt) {
        container.insertChild(insertAt, node);
      }
      insertAt++;
    }
    const desiredKeys = new Set(desired.map((d) => d.key));
    for (const [key, node] of managed) {
      if (!desiredKeys.has(key)) {
        node.remove();
        counts.removed++;
      }
    }
    return counts;
  }
  function mergeCounts(a, b) {
    return {
      created: a.created + b.created,
      updated: a.updated + b.updated,
      removed: a.removed + b.removed
    };
  }
  function emptyCounts() {
    return { created: 0, updated: 0, removed: 0 };
  }

  // src/render/contrast.ts
  async function fillContrastRow(row, bg, fg, modeId, collection, warnings) {
    var _a, _b;
    const modeBg = (_a = bg.modes.find((m) => m.modeId === modeId)) != null ? _a : bg.modes[0];
    const modeFg = (_b = fg.modes.find((m) => m.modeId === modeId)) != null ? _b : fg.modes[0];
    if (!modeBg || !modeFg) return;
    const all = collectDescendants(row);
    const search = [row, ...all];
    const bgNode = findByName(search, "$bg");
    const fgNode = findByName(search, "$fg");
    if (bgNode) setBoundFill(bgNode, bg.variable, modeBg.rgba);
    if (fgNode) setBoundFill(fgNode, fg.variable, modeFg.rgba);
    applyModeToNode(row, collection, modeId, warnings);
    const nameNode = findByName(search, "$name");
    if (nameNode) await setTextValue(nameNode, fg.name);
    const ratio = contrastRatio(modeBg.rgba, modeFg.rgba);
    const ratioNode = findByName(search, "$ratio");
    if (ratioNode) await setTextValue(ratioNode, ratioLabel(ratio));
    const outputs = [
      { name: "$AAN", pass: ratio >= WCAG_THRESHOLDS.AAN },
      { name: "$AAL", pass: ratio >= WCAG_THRESHOLDS.AAL },
      { name: "$AAAN", pass: ratio >= WCAG_THRESHOLDS.AAAN },
      { name: "$AAAL", pass: ratio >= WCAG_THRESHOLDS.AAAL },
      { name: "$UI", pass: ratio >= WCAG_THRESHOLDS.UI }
    ];
    for (const spec of outputs) {
      const node = findByName(search, spec.name);
      if (node) await setResultState(node, spec.pass);
    }
  }
  async function fillContrastChart(chart, bg, foregrounds, modeId, collection, warnings) {
    var _a, _b, _c;
    const modeBg = (_a = bg.modes.find((m) => m.modeId === modeId)) != null ? _a : bg.modes[0];
    if (!modeBg) return emptyCounts();
    applyModeToNode(chart, collection, modeId, warnings);
    await fillColorMeta(chart, {
      variable: bg.variable,
      rgba: modeBg.rgba,
      name: bg.name,
      path: modeBg.primitivePath,
      includeHsla: false
    });
    const slot = findSlot(chart, "tokens");
    if (!slot) {
      warnings.push(
        `Contrast chart for "${bg.name}" has no "tokens" slot \u2014 rows skipped.`
      );
      return emptyCounts();
    }
    const placeholders = slot.children.filter(
      (c) => c.name.trim().toLowerCase() === "$contrast"
    );
    let prototype = (_c = (_b = placeholders[0]) != null ? _b : slot.children[0]) != null ? _c : null;
    if (!prototype) {
      warnings.push(
        `Contrast chart for "${bg.name}" has an empty tokens slot \u2014 add one $contrast row to the component.`
      );
      return emptyCounts();
    }
    const prototypeClone = prototype;
    for (let i = 0; i < foregrounds.length && i < placeholders.length; i++) {
      tagNode(placeholders[i], "row", foregrounds[i].variable.id);
    }
    for (let i = foregrounds.length; i < placeholders.length; i++) {
      placeholders[i].remove();
    }
    return reconcile(
      slot,
      "row",
      foregrounds.map((fg) => ({
        key: fg.variable.id,
        adoptName: fg.name,
        render: async (row) => {
          row.visible = true;
          await fillContrastRow(row, bg, fg, modeId, collection, warnings);
        }
      })),
      () => {
        const clone = prototypeClone.clone();
        clone.visible = true;
        return clone;
      }
    );
  }
  async function renderContrast(container, model, templates, warnings) {
    if (container.layoutMode === "NONE") {
      ensureAutoLayout(container, "VERTICAL", { gap: 100 });
    }
    let totals = emptyCounts();
    const modeSections = model.modes.map((mode) => ({
      key: `mode:${mode.modeId}`,
      adoptName: mode.name,
      render: async (sectionNode) => {
        const section = sectionNode;
        if (section.layoutMode === "NONE") {
          ensureAutoLayout(section, "VERTICAL", { gap: 48 });
        }
        let heading = section.children.find(
          (c) => c.getPluginData("sgKind") === "heading"
        );
        if (!heading) {
          const existing = section.children.find(
            (c) => c.name.toLowerCase().includes("heading") || c.name.toLowerCase().includes("style guide")
          );
          if (existing) {
            heading = existing;
          } else {
            heading = createFromTemplate(templates.heading);
            section.insertChild(0, heading);
          }
          heading.setPluginData("sgKind", "heading");
          heading.setPluginData("sgKey", `heading:mode:${mode.modeId}`);
        }
        await setHeadingText(heading, mode.name);
        applyModeToNode(heading, model.collection, lightModeId(model.collection), warnings);
        hideHeadingSeparator(heading);
        let chartsFrame = section.children.find(
          (c) => c.type === "FRAME" && (c.name.toLowerCase().includes("chart") || c.getPluginData("sgKind") === "charts-wrap")
        );
        if (!chartsFrame) {
          chartsFrame = section.children.find(
            (c) => c.type === "FRAME" && c.getPluginData("sgKind") !== "heading" && c !== heading
          );
        }
        if (!chartsFrame) {
          chartsFrame = figma.createFrame();
          chartsFrame.name = "charts";
          ensureAutoLayout(chartsFrame, "VERTICAL", { gap: 48 });
          section.appendChild(chartsFrame);
        }
        chartsFrame.setPluginData("sgKind", "charts-wrap");
        chartsFrame.setPluginData("sgKey", `charts:${mode.modeId}`);
        if (chartsFrame.layoutMode === "NONE") {
          ensureAutoLayout(chartsFrame, "VERTICAL", { gap: 48 });
        }
        applyModeToNode(chartsFrame, model.collection, mode.modeId, warnings);
        const chartCounts = await reconcile(
          chartsFrame,
          "chart",
          model.backgrounds.map((bg) => ({
            key: `${mode.modeId}:${bg.variable.id}`,
            adoptName: bg.name,
            render: async (chartNode) => {
              const rowCounts = await fillContrastChart(
                chartNode,
                bg,
                model.foregrounds,
                mode.modeId,
                model.collection,
                warnings
              );
              totals = mergeCounts(totals, rowCounts);
            }
          })),
          () => createFromTemplate(templates.chart)
        );
        totals = mergeCounts(totals, chartCounts);
      }
    }));
    const sectionCounts = await reconcile(
      container,
      "section",
      modeSections,
      () => {
        const frame = figma.createFrame();
        frame.name = "mode-section";
        ensureAutoLayout(frame, "VERTICAL", { gap: 48 });
        return frame;
      }
    );
    totals = mergeCounts(totals, sectionCounts);
    return totals;
  }

  // src/render/primitives.ts
  async function renderPrimitives(container, families, templates, brandColors = {}) {
    if (container.layoutMode === "NONE") {
      ensureAutoLayout(container, "VERTICAL", { gap: 100 });
    }
    let totals = emptyCounts();
    const sectionItems = families.map((family) => ({
      key: family.path,
      adoptName: family.label,
      render: async (sectionNode) => {
        var _a;
        const section = sectionNode;
        if (section.layoutMode === "NONE") {
          ensureAutoLayout(section, "VERTICAL", { gap: 60 });
        }
        let heading = section.children.find(
          (c) => c.getPluginData("sgKind") === "heading"
        );
        if (!heading) {
          const existing = section.children.find(
            (c) => c.name.toLowerCase().includes("heading") || c.name.toLowerCase().includes("style guide")
          );
          if (existing) {
            heading = existing;
          } else {
            heading = createFromTemplate(templates.heading);
            section.insertChild(0, heading);
          }
          heading.setPluginData("sgKind", "heading");
          heading.setPluginData("sgKey", `heading:${family.path}`);
        }
        await setHeadingText(heading, family.label);
        let colorsFrame = section.children.find(
          (c) => c.type === "FRAME" && (c.name.toLowerCase() === "colors" || c.getPluginData("sgKind") === "colors-wrap")
        );
        if (!colorsFrame) {
          colorsFrame = figma.createFrame();
          colorsFrame.name = "colors";
          ensureAutoLayout(colorsFrame, "HORIZONTAL", {
            gap: 20,
            wrap: true
          });
          section.appendChild(colorsFrame);
        }
        colorsFrame.setPluginData("sgKind", "colors-wrap");
        colorsFrame.setPluginData("sgKey", `colors:${family.path}`);
        if (colorsFrame.layoutMode === "NONE") {
          ensureAutoLayout(colorsFrame, "HORIZONTAL", { gap: 20, wrap: true });
        }
        const brandShade = (_a = brandColors[family.path]) != null ? _a : "";
        const brandTemplate = templates.brandSwatch;
        const swatchCounts = await reconcile(
          colorsFrame,
          "swatch",
          family.shades.map((shade) => {
            const isBrand = Boolean(brandShade && shade.shade === brandShade && brandTemplate);
            return {
              key: shade.variable.id,
              adoptName: shade.displayName,
              variant: isBrand ? "brand" : "swatch",
              render: async (swatchNode) => {
                await fillColorMeta(swatchNode, {
                  variable: shade.variable,
                  rgba: shade.rgba,
                  name: shade.displayName,
                  includeHsla: true
                });
              }
            };
          }),
          (item) => createFromTemplate(
            item.variant === "brand" && brandTemplate ? brandTemplate : templates.swatch
          )
        );
        totals = mergeCounts(totals, swatchCounts);
      }
    }));
    const sectionCounts = await reconcile(
      container,
      "section",
      sectionItems,
      () => {
        const frame = figma.createFrame();
        frame.name = "section";
        ensureAutoLayout(frame, "VERTICAL", { gap: 60 });
        return frame;
      }
    );
    totals = mergeCounts(totals, sectionCounts);
    return totals;
  }

  // src/render/tokens.ts
  async function fillTokenRow(row, token, model, warnings) {
    var _a;
    const blocks = findAllDeepByName(row, "$token");
    if (blocks.length === 0) {
      const mode = token.modes[0];
      if (!mode) return;
      await fillColorMeta(row, {
        variable: token.variable,
        rgba: mode.rgba,
        name: token.name,
        path: mode.primitivePath,
        includeHsla: false
      });
      applyModeToNode(row, model.collection, mode.modeId, warnings);
      return;
    }
    if (blocks.length < model.modes.length) {
      warnings.push(
        `Token row for "${token.name}" has ${blocks.length} $token block(s) but ${model.modes.length} modes \u2014 extra modes skipped.`
      );
    }
    for (let i = 0; i < blocks.length && i < model.modes.length; i++) {
      const block = blocks[i];
      const modeInfo = model.modes[i];
      const modeVal = (_a = token.modes.find((m) => m.modeId === modeInfo.modeId)) != null ? _a : token.modes[i];
      if (!modeVal) continue;
      applyModeToNode(block, model.collection, modeInfo.modeId, warnings);
      await fillColorMeta(block, {
        variable: token.variable,
        rgba: modeVal.rgba,
        name: i === 0 ? token.name : void 0,
        path: i === 0 ? modeVal.primitivePath : void 0,
        includeHsla: false
      });
    }
    const all = collectDescendants(row);
    const rootName = all.find(
      (n) => n.name.trim().toLowerCase() === "$name" && !blocks.some((b) => collectDescendants(b).includes(n) || b === n)
    );
    if (rootName && token.modes[0]) {
      await setTextValue(rootName, token.name);
    }
    const rootPath = all.find(
      (n) => n.name.trim().toLowerCase() === "$path" && !blocks.some((b) => collectDescendants(b).includes(n) || b === n)
    );
    if (rootPath && token.modes[0]) {
      await setTextValue(rootPath, token.modes[0].primitivePath);
    }
  }
  async function setGroupHeadingLabel(row, label) {
    if ("findOne" in row) {
      const labelFrame = row.findOne(
        (n) => n.name.trim().toLowerCase() === ".row heading label"
      );
      if (labelFrame && "findOne" in labelFrame) {
        const text2 = labelFrame.findOne((n) => n.type === "TEXT");
        if (text2) {
          await setTextValue(text2, label);
          return;
        }
      }
      const text = row.findOne((n) => n.type === "TEXT");
      if (text) await setTextValue(text, label);
    }
  }
  async function renderTokens(container, model, templates, warnings) {
    if (container.layoutMode === "NONE") {
      ensureAutoLayout(container, "VERTICAL", { gap: 0 });
    }
    let totals = emptyCounts();
    for (const child of [...container.children]) {
      if (child.getPluginData("sgKind") === "page-heading") {
        child.remove();
      }
    }
    let body = container.children.find(
      (c) => c.type === "FRAME" && (c.getPluginData("sgKind") === "token-body" || c.name.toLowerCase() === "tokens")
    );
    if (!body) {
      body = container.children.find(
        (c) => c.type === "FRAME" && c.getPluginData("sgKind") !== "page-heading" && !c.name.toLowerCase().includes("heading")
      );
    }
    if (!body) {
      body = figma.createFrame();
      body.name = "tokens";
      ensureAutoLayout(body, "VERTICAL", { gap: 0 });
      container.appendChild(body);
    }
    body.setPluginData("sgKind", "token-body");
    body.setPluginData("sgKey", "token-body");
    if (body.layoutMode === "NONE") {
      ensureAutoLayout(body, "VERTICAL", { gap: 0 });
    }
    const items = [];
    for (const group of model.groups) {
      items.push({ kind: "group", key: `group:${group.name}`, label: group.name });
      for (const token of group.tokens) {
        items.push({
          kind: "token",
          key: token.variable.id,
          token
        });
      }
    }
    const header = body.children.find(
      (c) => c.name.trim().toLowerCase() === "header"
    );
    if (header) {
      header.setPluginData("sgKind", "header");
      header.setPluginData("sgKey", "header");
    }
    const children = [...body.children];
    const managed = /* @__PURE__ */ new Map();
    const untagged = [];
    for (const child of children) {
      const kind = child.getPluginData("sgKind");
      const key = child.getPluginData("sgKey");
      if ((kind === "heading" || kind === "tokenRow" || kind === "group") && key) {
        managed.set(key, child);
      } else if (kind === "header") {
      } else if (!kind) {
        untagged.push(child);
      }
    }
    for (const item of items) {
      const key = item.kind === "group" ? item.key : item.key;
      if (managed.has(key)) continue;
      const adoptName = item.kind === "group" ? item.label : item.token.name;
      const idx = untagged.findIndex((n) => {
        if ("findOne" in n) {
          const text = n.findOne((c) => c.type === "TEXT");
          return text !== null && text.characters.trim().toLowerCase() === adoptName.toLowerCase();
        }
        return false;
      });
      if (idx >= 0) {
        const node = untagged.splice(idx, 1)[0];
        node.setPluginData("sgKind", item.kind === "group" ? "heading" : "tokenRow");
        node.setPluginData("sgKey", key);
        managed.set(key, node);
      }
    }
    const ordered = [];
    for (const item of items) {
      const key = item.key;
      let node = managed.get(key);
      if (!node) {
        if (item.kind === "group") {
          node = createFromTemplate(templates.groupHeading);
          node.setPluginData("sgKind", "heading");
        } else {
          node = createFromTemplate(templates.tokenRow);
          node.setPluginData("sgKind", "tokenRow");
        }
        node.setPluginData("sgKey", key);
        body.appendChild(node);
        managed.set(key, node);
        totals.created++;
      } else {
        totals.updated++;
      }
      if (item.kind === "group") {
        await setGroupHeadingLabel(node, item.label);
      } else {
        await fillTokenRow(node, item.token, model, warnings);
      }
      ordered.push(node);
    }
    let insertAt = header ? body.children.indexOf(header) + 1 : 0;
    if (header && body.children.indexOf(header) !== 0) {
      body.insertChild(0, header);
      insertAt = 1;
    }
    for (const node of ordered) {
      const currentIndex = body.children.indexOf(node);
      if (currentIndex !== insertAt) {
        body.insertChild(insertAt, node);
      }
      insertAt++;
    }
    const desiredKeys = new Set(items.map((i) => i.key));
    for (const [key, node] of managed) {
      if (!desiredKeys.has(key)) {
        node.remove();
        totals.removed++;
      }
    }
    return totals;
  }

  // src/scan.ts
  function findFramesByName(root, frameName) {
    if (!("findAll" in root)) return [];
    return root.findAll(
      (node) => (node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE") && matchesName(node, frameName)
    );
  }
  function findFramesInNode(node, frameName) {
    const results = [];
    if ((node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE") && matchesName(node, frameName)) {
      results.push(node);
    }
    if ("findAll" in node) {
      const nested = node.findAll(
        (n) => (n.type === "FRAME" || n.type === "COMPONENT" || n.type === "INSTANCE") && matchesName(n, frameName)
      );
      results.push(...nested);
    }
    return results;
  }
  async function resolveScopeRoots(scope) {
    if (scope === "selection") {
      const sel = figma.currentPage.selection;
      if (sel.length === 0) {
        throw new Error(
          "Nothing selected. Select frames containing $primitives-parent, $contrast-parent, or $token-parent."
        );
      }
      return [...sel];
    }
    if (scope === "page") {
      return [figma.currentPage];
    }
    await figma.loadAllPagesAsync();
    return [...figma.root.children];
  }
  function findTargetFrames(roots, frameName) {
    const found = [];
    const seen = /* @__PURE__ */ new Set();
    for (const root of roots) {
      let frames = [];
      if (root.type === "PAGE") {
        frames = findFramesByName(root, frameName);
      } else if ("children" in root) {
        frames = findFramesInNode(root, frameName);
      }
      for (const f of frames) {
        if (!seen.has(f.id)) {
          seen.add(f.id);
          found.push(f);
        }
      }
    }
    return found.filter((frame) => {
      let parent = frame.parent;
      while (parent) {
        if (seen.has(parent.id)) return false;
        parent = parent.parent;
      }
      return true;
    });
  }

  // ui.html
  var ui_default = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    :root {
      --bg: #ffffff;
      --fg: #1a1a1a;
      --muted: #6b6b6b;
      --border: #e5e5e5;
      --accent: #2556ff;
      --accent-hover: #1a3fcc;
      --danger: #de4040;
      --success: #2ebf66;
      --surface: #f7f7f7;
      --radius: 8px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      font: 12px/1.45 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--fg);
      background: var(--bg);
    }
    h1 {
      margin: 0 0 4px;
      font-size: 14px;
      font-weight: 600;
    }
    .subtitle {
      margin: 0 0 16px;
      color: var(--muted);
      font-size: 11px;
    }
    section {
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    section:last-of-type { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    .label {
      display: block;
      margin-bottom: 8px;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .row label {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
    }
    select {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--bg);
      font: inherit;
      color: var(--fg);
    }
    .field { margin-bottom: 10px; }
    .field > span {
      display: block;
      margin-bottom: 4px;
      font-size: 11px;
      color: var(--muted);
    }
    .template {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      margin-bottom: 6px;
      background: var(--surface);
      border-radius: var(--radius);
    }
    .template .meta {
      flex: 1;
      min-width: 0;
    }
    .template .meta .name {
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .template .meta .empty {
      color: var(--muted);
      font-style: italic;
    }
    .template .meta .slot-label {
      font-size: 10px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    button {
      border: none;
      border-radius: 6px;
      padding: 6px 10px;
      font: inherit;
      font-weight: 500;
      cursor: pointer;
      background: var(--accent);
      color: #fff;
      white-space: nowrap;
    }
    button:hover { background: var(--accent-hover); }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    button.secondary {
      background: var(--bg);
      color: var(--fg);
      border: 1px solid var(--border);
    }
    button.secondary:hover { background: var(--surface); }
    button.ghost {
      background: transparent;
      color: var(--muted);
      padding: 4px 6px;
    }
    button.ghost:hover { color: var(--danger); }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    .actions button.primary {
      flex: 1;
      padding: 10px;
      font-size: 13px;
    }
    #status {
      margin-top: 12px;
      padding: 10px;
      border-radius: var(--radius);
      background: var(--surface);
      font-size: 11px;
      display: none;
      white-space: pre-wrap;
      word-break: break-word;
    }
    #status.visible { display: block; }
    #status.error { background: #fdecec; color: var(--danger); }
    #status.success { background: #eaf8f0; color: #1a7a45; }
    #status.progress { color: var(--muted); }
    .hint {
      margin: 0 0 8px;
      font-size: 11px;
      color: var(--muted);
    }
    .brand-list {
      max-height: 220px;
      overflow-y: auto;
      border: 1px solid var(--border);
      border-radius: 6px;
    }
    .brand-row {
      display: grid;
      grid-template-columns: 1fr auto 72px;
      gap: 6px;
      align-items: center;
      padding: 6px 8px;
      border-bottom: 1px solid var(--border);
    }
    .brand-row:last-child { border-bottom: none; }
    .brand-row .fam {
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .brand-row select {
      width: 72px;
      padding: 4px 4px;
    }
    .brand-empty {
      padding: 10px 8px;
      color: var(--muted);
      font-style: italic;
    }
  </style>
</head>
<body>
  <h1>Style Guide Editor</h1>
  <p class="subtitle">Generate and update color style guide frames (<code>$primitives-parent</code>, <code>$contrast-parent</code>, <code>$token-parent</code>) from Figma variables.</p>

  <section>
    <div class="label">What to update</div>
    <div class="row"><label><input type="checkbox" id="cat-primitives" checked /> Primitive colors</label></div>
    <div class="row"><label><input type="checkbox" id="cat-tokens" checked /> Token charts</label></div>
    <div class="row"><label><input type="checkbox" id="cat-contrast" checked /> Contrast checks</label></div>
  </section>

  <section>
    <div class="label">Where to look</div>
    <div class="row"><label><input type="radio" name="scope" value="selection" /> Current selection</label></div>
    <div class="row"><label><input type="radio" name="scope" value="page" checked /> Current page</label></div>
    <div class="row"><label><input type="radio" name="scope" value="file" /> Entire file</label></div>
  </section>

  <section>
    <div class="label">Collections</div>
    <div class="field">
      <span>Primitives</span>
      <select id="primitive-collection"></select>
    </div>
    <div class="field">
      <span>Tokens</span>
      <select id="token-collection"></select>
    </div>
  </section>

  <section>
    <div class="label">Templates</div>
    <div id="templates"></div>
  </section>

  <section>
    <div class="label">Brand colors</div>
    <p class="hint">For each primitive set, optionally mark one shade as the brand color. That shade uses the brand swatch template.</p>
    <div id="brand-sets"></div>
  </section>

  <div class="actions">
    <button class="primary" id="run">Update style guide</button>
  </div>

  <div id="status"></div>

  <script>
    const TEMPLATE_SLOTS = [
      { id: 'swatch', label: 'Primitive swatch' },
      { id: 'brandSwatch', label: 'Brand swatch' },
      { id: 'contrastChart', label: 'Contrast chart' },
      { id: 'tokenRow', label: 'Token row' },
      { id: 'sectionHeading', label: 'Section heading' },
      { id: 'groupHeading', label: 'Token group heading' }
    ];

    const templates = {};
    let families = [];
    let brandColors = {};

    const el = (id) => document.getElementById(id);
    const statusEl = el('status');

    function setStatus(message, kind) {
      statusEl.textContent = message;
      statusEl.className = 'visible ' + (kind || '');
    }

    function clearStatus() {
      statusEl.className = '';
      statusEl.textContent = '';
    }

    function renderTemplates() {
      const root = el('templates');
      root.innerHTML = '';
      for (const slot of TEMPLATE_SLOTS) {
        const ref = templates[slot.id];
        const row = document.createElement('div');
        row.className = 'template';
        row.innerHTML =
          '<div class="meta">' +
            '<div class="slot-label">' + slot.label + '</div>' +
            (ref
              ? '<div class="name" title="' + escapeHtml(ref.name) + '">' + escapeHtml(ref.name) + '</div>'
              : '<div class="empty">Not set \u2014 select on canvas</div>') +
          '</div>';

        const useBtn = document.createElement('button');
        useBtn.className = 'secondary';
        useBtn.textContent = 'Use selection';
        useBtn.onclick = () => parent.postMessage({ pluginMessage: { type: 'capture-template', slot: slot.id } }, '*');
        row.appendChild(useBtn);

        if (ref) {
          const clearBtn = document.createElement('button');
          clearBtn.className = 'ghost';
          clearBtn.textContent = 'Clear';
          clearBtn.onclick = () => parent.postMessage({ pluginMessage: { type: 'clear-template', slot: slot.id } }, '*');
          row.appendChild(clearBtn);
        }

        root.appendChild(row);
      }
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function fillCollections(select, collections, selectedId) {
      select.innerHTML = '';
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = '\u2014 Select \u2014';
      select.appendChild(empty);
      for (const c of collections) {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name + (c.modeCount > 1 ? ' (' + c.modeCount + ' modes)' : '');
        if (c.id === selectedId) opt.selected = true;
        select.appendChild(opt);
      }
    }

    function getCategories() {
      return {
        primitives: el('cat-primitives').checked,
        contrast: el('cat-contrast').checked,
        tokens: el('cat-tokens').checked
      };
    }

    function getScope() {
      const checked = document.querySelector('input[name="scope"]:checked');
      return checked ? checked.value : 'page';
    }

    function preferredShade(shades) {
      if (shades.indexOf('600') !== -1) return '600';
      if (shades.indexOf('500') !== -1) return '500';
      return shades[0] || '';
    }

    function renderBrandSets() {
      const root = el('brand-sets');
      root.innerHTML = '';
      if (!families.length) {
        const empty = document.createElement('div');
        empty.className = 'brand-empty';
        empty.textContent = 'Select a primitives collection to configure brand colors.';
        root.appendChild(empty);
        return;
      }
      const list = document.createElement('div');
      list.className = 'brand-list';
      for (const fam of families) {
        const selected = brandColors[fam.path] || '';
        const row = document.createElement('div');
        row.className = 'brand-row';
        row.dataset.path = fam.path;

        const name = document.createElement('div');
        name.className = 'fam';
        name.title = fam.path;
        name.textContent = fam.label;
        row.appendChild(name);

        const checkLabel = document.createElement('label');
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = Boolean(selected);
        checkLabel.appendChild(check);
        checkLabel.appendChild(document.createTextNode(' Brand'));
        row.appendChild(checkLabel);

        const select = document.createElement('select');
        const none = document.createElement('option');
        none.value = '';
        none.textContent = '\u2014';
        select.appendChild(none);
        for (const shade of fam.shades) {
          const opt = document.createElement('option');
          opt.value = shade;
          opt.textContent = shade;
          if (shade === selected) opt.selected = true;
          select.appendChild(opt);
        }
        select.disabled = !check.checked;
        row.appendChild(select);

        check.onchange = () => {
          if (check.checked) {
            select.disabled = false;
            if (!select.value) select.value = preferredShade(fam.shades);
            brandColors[fam.path] = select.value;
          } else {
            select.disabled = true;
            select.value = '';
            delete brandColors[fam.path];
          }
        };
        select.onchange = () => {
          if (check.checked && select.value) brandColors[fam.path] = select.value;
          else delete brandColors[fam.path];
        };

        list.appendChild(row);
      }
      root.appendChild(list);
    }

    function getBrandColors() {
      const next = {};
      for (const path of Object.keys(brandColors)) {
        if (brandColors[path]) next[path] = brandColors[path];
      }
      return next;
    }

    function applySettings(settings) {
      el('cat-primitives').checked = settings.lastCategories.primitives;
      el('cat-contrast').checked = settings.lastCategories.contrast;
      el('cat-tokens').checked = settings.lastCategories.tokens;
      const scopeRadio = document.querySelector('input[name="scope"][value="' + settings.lastScope + '"]');
      if (scopeRadio) scopeRadio.checked = true;
      Object.assign(templates, settings.templates || {});
      brandColors = Object.assign({}, settings.brandColors || {});
      renderTemplates();
      renderBrandSets();
    }

    el('run').onclick = () => {
      const categories = getCategories();
      if (!categories.primitives && !categories.contrast && !categories.tokens) {
        setStatus('Select at least one category to update.', 'error');
        return;
      }
      clearStatus();
      setStatus('Running\u2026', 'progress');
      el('run').disabled = true;
      parent.postMessage({
        pluginMessage: {
          type: 'run',
          scope: getScope(),
          categories,
          primitiveCollectionId: el('primitive-collection').value || null,
          tokenCollectionId: el('token-collection').value || null,
          brandColors: getBrandColors()
        }
      }, '*');
    };

    function formatCounts(label, c) {
      if (!c) return '';
      return label + ': +' + c.created + ' ~' + c.updated + ' \u2212' + c.removed;
    }

    window.onmessage = (event) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;

      if (msg.type === 'ready') {
        applySettings(msg.settings);
        const primId = msg.settings.primitiveCollectionId || msg.detected.primitiveCollectionId;
        const tokId = msg.settings.tokenCollectionId || msg.detected.tokenCollectionId;
        fillCollections(el('primitive-collection'), msg.collections, primId);
        fillCollections(el('token-collection'), msg.collections, tokId);
        families = msg.families || [];
        renderBrandSets();

        el('primitive-collection').onchange = () => {
          const id = el('primitive-collection').value;
          if (!id) {
            families = [];
            renderBrandSets();
            return;
          }
          parent.postMessage({ pluginMessage: { type: 'load-families', collectionId: id } }, '*');
        };
      }

      if (msg.type === 'families') {
        families = msg.families || [];
        renderBrandSets();
      }

      if (msg.type === 'template-captured') {
        templates[msg.slot] = msg.ref;
        renderTemplates();
        setStatus('Captured "' + msg.ref.name + '".', 'success');
      }

      if (msg.type === 'template-cleared') {
        delete templates[msg.slot];
        renderTemplates();
        clearStatus();
      }

      if (msg.type === 'error') {
        el('run').disabled = false;
        setStatus(msg.message, 'error');
      }

      if (msg.type === 'run-progress') {
        setStatus(msg.message, 'progress');
      }

      if (msg.type === 'run-complete') {
        el('run').disabled = false;
        const r = msg.report;
        const lines = [];
        const p = formatCounts('Primitives', r.primitives);
        const c = formatCounts('Contrast', r.contrast);
        const t = formatCounts('Tokens', r.tokens);
        if (p) lines.push(p);
        if (c) lines.push(c);
        if (t) lines.push(t);
        if (r.warnings && r.warnings.length) {
          lines.push('');
          lines.push('Warnings:');
          r.warnings.slice(0, 5).forEach(w => lines.push('\u2022 ' + w));
          if (r.warnings.length > 5) lines.push('\u2022 \u2026and ' + (r.warnings.length - 5) + ' more');
        }
        if (r.errors && r.errors.length) {
          lines.push('');
          lines.push('Errors:');
          r.errors.forEach(e => lines.push('\u2022 ' + e));
          setStatus(lines.join('\\n') || 'Done with errors.', 'error');
        } else {
          setStatus(lines.join('\\n') || 'Done.', 'success');
        }
      }
    };

    parent.postMessage({ pluginMessage: { type: 'init' } }, '*');
  <\/script>
</body>
</html>
`;

  // src/code.ts
  figma.showUI(ui_default, { width: 380, height: 720, themeColors: true });
  function post(msg) {
    figma.ui.postMessage(msg);
  }
  async function loadFamilies(collectionId) {
    if (!collectionId) return [];
    try {
      const families = await buildPrimitives(collectionId);
      return toFamilyInfo(families);
    } catch (e) {
      return [];
    }
  }
  async function handleInit() {
    clearVariableCaches();
    const settings = loadSettings();
    const detected = await detectCollections();
    const primitiveId = settings.primitiveCollectionId || detected.primitiveCollectionId;
    const families = await loadFamilies(primitiveId);
    post({
      type: "ready",
      settings,
      collections: detected.collections,
      detected: {
        primitiveCollectionId: detected.primitiveCollectionId,
        tokenCollectionId: detected.tokenCollectionId
      },
      families
    });
  }
  async function handleLoadFamilies(collectionId) {
    post({ type: "families", families: await loadFamilies(collectionId) });
  }
  async function handleCapture(slot) {
    try {
      const ref = captureTemplateFromSelection(slot);
      const settings = loadSettings();
      settings.templates[slot] = ref;
      saveSettings(settings);
      post({ type: "template-captured", slot, ref });
    } catch (e) {
      post({
        type: "error",
        message: e instanceof Error ? e.message : String(e)
      });
    }
  }
  function handleClear(slot) {
    const settings = loadSettings();
    delete settings.templates[slot];
    saveSettings(settings);
    post({ type: "template-cleared", slot });
  }
  async function requireTemplate(slot, label) {
    const settings = loadSettings();
    const ref = settings.templates[slot];
    if (!ref) {
      throw new Error(`Capture a ${label} template before running.`);
    }
    const node = await resolveTemplateNode(ref);
    if (!node) {
      throw new Error(
        `${label} template "${ref.name}" could not be found. Re-capture it.`
      );
    }
    return node;
  }
  async function handleRun(msg) {
    var _a;
    const settings = loadSettings();
    settings.lastScope = msg.scope;
    settings.lastCategories = msg.categories;
    settings.primitiveCollectionId = msg.primitiveCollectionId;
    settings.tokenCollectionId = msg.tokenCollectionId;
    settings.brandColors = (_a = msg.brandColors) != null ? _a : {};
    saveSettings(settings);
    const report = {
      warnings: [],
      errors: []
    };
    try {
      clearVariableCaches();
      post({ type: "run-progress", message: "Resolving scope\u2026" });
      const roots = await resolveScopeRoots(msg.scope);
      const needPrimitives = msg.categories.primitives;
      const needContrast = msg.categories.contrast;
      const needTokens = msg.categories.tokens;
      const swatchTpl = needPrimitives ? await requireTemplate("swatch", "primitive swatch") : null;
      const hasBrandPicks = needPrimitives && Object.values(settings.brandColors).some((v) => Boolean(v));
      const brandSwatchTpl = hasBrandPicks ? await requireTemplate("brandSwatch", "brand swatch") : null;
      const chartTpl = needContrast ? await requireTemplate("contrastChart", "contrast chart") : null;
      const tokenRowTpl = needTokens ? await requireTemplate("tokenRow", "token row") : null;
      const headingTpl = needPrimitives || needContrast ? await requireTemplate("sectionHeading", "section heading") : null;
      const groupHeadingTpl = needTokens ? await requireTemplate("groupHeading", "token group heading") : null;
      if (needPrimitives) {
        if (!msg.primitiveCollectionId) {
          throw new Error("Select a primitives collection.");
        }
        post({ type: "run-progress", message: "Building primitives\u2026" });
        const families = await buildPrimitives(msg.primitiveCollectionId);
        const frames = findTargetFrames(roots, PARENT_FRAMES.primitives);
        if (frames.length === 0) {
          report.warnings.push(
            `No ${PARENT_FRAMES.primitives} frames found in scope.`
          );
        } else {
          let counts = { created: 0, updated: 0, removed: 0 };
          for (const frame of frames) {
            post({
              type: "run-progress",
              message: `Updating primitives in "${frame.name}"\u2026`
            });
            const c = await renderPrimitives(
              frame,
              families,
              {
                swatch: swatchTpl,
                heading: headingTpl,
                brandSwatch: brandSwatchTpl
              },
              settings.brandColors
            );
            counts = {
              created: counts.created + c.created,
              updated: counts.updated + c.updated,
              removed: counts.removed + c.removed
            };
          }
          report.primitives = counts;
        }
      }
      if (needContrast || needTokens) {
        if (!msg.tokenCollectionId) {
          throw new Error("Select a tokens collection.");
        }
        post({ type: "run-progress", message: "Building semantic tokens\u2026" });
        const model = await buildSemanticTokens(msg.tokenCollectionId);
        if (needTokens) {
          const frames = findTargetFrames(roots, PARENT_FRAMES.tokens);
          if (frames.length === 0) {
            report.warnings.push(
              `No ${PARENT_FRAMES.tokens} frames found in scope.`
            );
          } else {
            let counts = { created: 0, updated: 0, removed: 0 };
            for (const frame of frames) {
              post({
                type: "run-progress",
                message: `Updating tokens in "${frame.name}"\u2026`
              });
              const c = await renderTokens(
                frame,
                model,
                {
                  tokenRow: tokenRowTpl,
                  groupHeading: groupHeadingTpl
                },
                report.warnings
              );
              counts = {
                created: counts.created + c.created,
                updated: counts.updated + c.updated,
                removed: counts.removed + c.removed
              };
            }
            report.tokens = counts;
          }
        }
        if (needContrast) {
          const frames = findTargetFrames(roots, PARENT_FRAMES.contrast);
          if (frames.length === 0) {
            report.warnings.push(
              `No ${PARENT_FRAMES.contrast} frames found in scope.`
            );
          } else {
            let counts = { created: 0, updated: 0, removed: 0 };
            for (const frame of frames) {
              post({
                type: "run-progress",
                message: `Updating contrast in "${frame.name}"\u2026`
              });
              const c = await renderContrast(
                frame,
                model,
                { chart: chartTpl, heading: headingTpl },
                report.warnings
              );
              counts = {
                created: counts.created + c.created,
                updated: counts.updated + c.updated,
                removed: counts.removed + c.removed
              };
            }
            report.contrast = counts;
          }
        }
      }
      post({ type: "run-complete", report });
    } catch (e) {
      report.errors.push(e instanceof Error ? e.message : String(e));
      post({ type: "run-complete", report });
    }
  }
  figma.ui.onmessage = async (msg) => {
    var _a;
    if (msg.type === "init") {
      await handleInit();
      return;
    }
    if (msg.type === "capture-template") {
      await handleCapture(msg.slot);
      return;
    }
    if (msg.type === "clear-template") {
      handleClear(msg.slot);
      return;
    }
    if (msg.type === "load-families") {
      await handleLoadFamilies(msg.collectionId);
      return;
    }
    if (msg.type === "run") {
      await handleRun(msg);
      return;
    }
    if (msg.type === "save-prefs") {
      const settings = loadSettings();
      settings.lastScope = msg.scope;
      settings.lastCategories = msg.categories;
      settings.primitiveCollectionId = msg.primitiveCollectionId;
      settings.tokenCollectionId = msg.tokenCollectionId;
      settings.brandColors = (_a = msg.brandColors) != null ? _a : settings.brandColors;
      saveSettings(settings);
    }
  };
})();
