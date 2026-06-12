import { Vibrant } from "node-vibrant/browser"
import type { PlasmoCSConfig } from "plasmo"
import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ToastContainer } from "react-toastify"

import { Storage } from "@plasmohq/storage"

import { getValidAuthSessionSnapshot } from "./auth-utils"
import { FabPanelApp } from "./panel"
import {
  clampNumber,
  clearAnimatedBgUrl,
  CUSTOM_THEME_PREVIEW_EVENT,
  CUSTOM_THEMES_STORAGE_KEY,
  detectCurrentSite,
  FAB_OPEN_EVENT,
  isAnimatedCustomTheme,
  MODEL_ENABLED_STORAGE_KEY,
  PREMIUM_THEME_BACKUP_STORAGE_KEY,
  sanitizeColor,
  sanitizeCustomBgOptions,
  sanitizeCustomBgUrl,
  sanitizePosition,
  SELECTED_CUSTOM_THEME_ID_STORAGE_KEY,
  SELECTED_THEME_STORAGE_KEY,
  THEME_HIDDEN_STORAGE_KEY,
  THEME_LOADING_EVENT,
  type CustomBgOptions,
  type CustomTheme,
  type ModelEnabledMap,
  type SiteType
} from "./theme-utils"

export const config: PlasmoCSConfig = {
  matches: [
    "https://chatgpt.com/*",
    "https://gemini.google.com/*",
    "https://claude.ai/*",
    "https://grok.com/*"
  ],
  all_frames: false,
  run_at: "document_start"
}

interface ThemeConfig {
  bgUrl: string
  bgColor: string
  accentColor: string
  lightTextColor: string
  darkTextColor: string
}

type ThemeName =
  | "random"
  | "nasa"
  | "neon"
  | "pink"
  | "vintage"
  | "fractal"
  | "terminal"
  | "custom"
  | "default"

const SITE_SELECTORS = {
  chatgpt: {
    container: "body",
    header: "header",
    footer:
      "#thread-bottom-container > div:is(.mt-auto, .-mt-4) > div > div > div > div, .leading-none",
    elements:
      '[data-testid="use-case-prompt-chips"] button, .btn-secondary, .agent-turn, .user-message-bubble-color, .shadow-short-composer',
    darkClass: "html.dark"
  },
  gemini: {
    container: "body",
    header: "top-bar-actions",
    footer: ".capabilities-disclaimer p",
    elements:
      "model-response, .dual-response-panel, .user-query-bubble-with-background, .input-box-shadow",
    darkClass: "body.dark-theme"
  },
  claude: {
    container: "body",
    header:
      'header, #main-content > div > div > main > div:first-child, .z-header, [data-testid="wiggle-controls-actions"]',
    footer: 'div[data-disclaimer="true"]',
    elements:
      'li.inline-block button, .font-claude-response, div[data-user-message-bubble="true"], .\\!box-content',
    darkClass: 'html[data-mode="dark"]'
  },
  grok: {
    container: "body",
    header: ".from-surface-base",
    footer: "",
    elements:
      '[data-testid="assistant-message"], [data-testid="user-message"], .query-bar',
    darkClass: "html.dark"
  }
}

const storage = new Storage()
const localStorageInstance = new Storage({ area: "local" })
let applyThemeQueued = false
let applyThemeRunning = false
let applyThemeRequestId = 0
let currentLocation = location.href
let fabMounted = false
let fabOpen = false
let fabThemeRoot: Root | null = null
let toastMounted = false
let cachedThemeKey: string | null = null
let cachedThemeData: ThemeConfig | null = null
let customThemePreview: { themeId: string; theme: CustomTheme } | null = null

const EMPTY_THEME: ThemeConfig = {
  bgUrl: "",
  bgColor: "",
  accentColor: "",
  lightTextColor: "",
  darkTextColor: ""
}

const TERMINAL_THEME: ThemeConfig = {
  bgUrl: "",
  bgColor: "",
  accentColor: "#33ff33",
  lightTextColor: "#33ff33",
  darkTextColor: "#33ff33"
}

const THEME_BG_URLS: Partial<Record<ThemeName, string>> = {
  random: "https://bing.biturl.top/?format=image&index=random&mkt=random",
  nasa: "https://decoai.cokr.workers.dev/apod",
  neon: "https://wallpaperaccess.com/full/2068583.jpg",
  pink: "https://wallpapercave.com/wp/wp11886768.jpg",
  vintage: "https://wallpaperaccess.com/full/1461802.jpg",
  fractal: "https://i.imgur.com/H1rtAbm.png"
}

const t = (key: string) => chrome.i18n.getMessage(key)

const THEME_STYLE_ID = "ai-theme-style"
const FAB_STYLE_ID = "decoai-fab-style"
const FAB_ROOT_ID = "decoai-fab-root"
const FAB_ROOT_CLASS = "decoai-fab"
const FAB_OPEN_CLASS = "is-open"
const FAB_ACTION_CLASS = "decoai-fab-action"
const FAB_THEME_BTN_CLASS = "decoai-fab-theme"
const FAB_TOOLTIP_CLASS = "decoai-fab-tooltip"
const FAB_THEME_PANEL_CLASS = "decoai-fab-theme-panel"
const FAB_THEME_MOUNT_ID = "decoai-fab-theme-mount"
const TOAST_STYLE_ID = "decoai-toastify-style"
const TOAST_ROOT_ID = "decoai-toast-root"
const FAB_THEME_BTN_ICON = `<img src="${chrome.runtime.getURL("assets/wallpaper.svg")}" alt="theme settings" draggable="false" style={{ height: 24 }} />`
const CUSTOM_THEME_WATCH_STORAGE_KEYS = [
  CUSTOM_THEMES_STORAGE_KEY,
  SELECTED_CUSTOM_THEME_ID_STORAGE_KEY
]
const PREMIUM_CACHE_MS = 5 * 60 * 1000
let premiumCache: { checkedAt: number; value: boolean } | null = null
type PremiumThemeBackup = {
  customThemes: CustomTheme[]
  selectedCustomThemeId: string
}

const appendToPage = (element: HTMLElement) => {
  ; (document.head || document.documentElement).appendChild(element)
}

const getOrCreateStyle = (id: string) => {
  let style = document.getElementById(id) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement("style")
    style.id = id
    appendToPage(style)
  }
  return style
}

const emitThemeLoading = (loading: boolean) => {
  window.dispatchEvent(
    new CustomEvent(THEME_LOADING_EVENT, { detail: { loading } })
  )
}

const getPremiumStatus = async ({ forceRefresh = false } = {}) => {
  if (
    !forceRefresh &&
    premiumCache &&
    Date.now() - premiumCache.checkedAt < PREMIUM_CACHE_MS
  ) {
    return {
      isPremium: premiumCache.value,
      isChecked: true
    }
  }

  try {
    const authSession = await getValidAuthSessionSnapshot()

    if (authSession) {
      const isPremium = authSession.premiumStatus === "premium"
      premiumCache = { checkedAt: Date.now(), value: isPremium }

      return { isPremium, isChecked: authSession.premiumStatus !== "unknown" }
    }

    premiumCache = { checkedAt: Date.now(), value: false }
    return { isPremium: false, isChecked: true }
  } catch {
    return { isPremium: false, isChecked: false }
  }
}

const whiteListUrl = (site: SiteType) => {
  const { pathname } = window.location

  switch (site) {
    case "chatgpt":
      return pathname === "/" || pathname.startsWith("/c/")
    case "gemini":
      return pathname.startsWith("/app")
    case "claude":
      return pathname.startsWith("/new") || pathname.startsWith("/chat")
    case "grok":
      return pathname === "/" || pathname.startsWith("/c/")
    default:
      return false
  }
}

const getThemeStyle = () => getOrCreateStyle(THEME_STYLE_ID)

const getFABStyle = () => {
  const style = getOrCreateStyle(FAB_STYLE_ID)
  if (!style.textContent) {
    style.textContent = `
      .${FAB_ROOT_CLASS} {
        position: fixed;
        right: 48px;
        bottom: 78px;
        z-index: 2;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 10px;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      }

      .${FAB_THEME_BTN_CLASS} {
        width: 45px;
        height: 45px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background-color: #000;
        border: 1px solid #66cdaa4D;
        border-radius: 999px;
        color: #66cdaa;
        cursor: pointer;
      }

      html.dark .${FAB_THEME_BTN_CLASS},
      body.dark-theme .${FAB_THEME_BTN_CLASS},
      html[data-mode="dark"] .${FAB_THEME_BTN_CLASS} {
        background-color: #fff;
      }

      .${FAB_THEME_BTN_CLASS}:hover {
        opacity: 0.7;
      }

      .${FAB_ACTION_CLASS} {
        position: relative;
        z-index: 2;
        display: flex;
        flex-direction: row-reverse;
        align-items: center;
        gap: 10px;
      }

      .${FAB_TOOLTIP_CLASS} {
        padding: 4px 8px;
        background-color: #000;
        border: 1px solid #66cdaa4D;
        border-radius: 8px;
        color: #fff;
        font-size: 12px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transform: translateX(4px);
      }

      .${FAB_THEME_BTN_CLASS}:hover + .${FAB_TOOLTIP_CLASS},
      .${FAB_THEME_BTN_CLASS}:focus-visible + .${FAB_TOOLTIP_CLASS} {
        opacity: 1;
      }

      .${FAB_THEME_PANEL_CLASS} {
        position: relative;
        z-index: 2;
        display: block;
        overflow: hidden;
        background-color: rgba(24, 24, 24, var(--decoai-surface-opacity, 0.8));
        border-radius: 14px;
        backdrop-filter: blur(var(--decoai-glass-blur, 10px)) saturate(140%);
        box-shadow: var(--decoai-accent-shadow, none);
        opacity: 0;
        pointer-events: none;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .${FAB_ROOT_CLASS}.${FAB_OPEN_CLASS} .${FAB_THEME_PANEL_CLASS} {
        pointer-events: auto;
        opacity: 0.8;
      }

      .${FAB_ROOT_CLASS}.${FAB_OPEN_CLASS} .${FAB_THEME_PANEL_CLASS}:hover {
        opacity: 1;
      }
    `
  }
  return style
}

const mountToastContainer = () => {
  if (toastMounted || document.getElementById(TOAST_ROOT_ID)) {
    toastMounted = true
    return
  }

  if (!document.getElementById(TOAST_STYLE_ID)) {
    const link = document.createElement("link")
    link.id = TOAST_STYLE_ID
    link.rel = "stylesheet"
    link.href = chrome.runtime.getURL("assets/ReactToastify.css")
    appendToPage(link)
  }

  const root = document.createElement("div")
  root.id = TOAST_ROOT_ID
    ; (document.body || document.documentElement).appendChild(root)

  createRoot(root).render(
    createElement(ToastContainer, {
      position: "top-right",
      theme: "colored",
      autoClose: 1500,
      closeOnClick: true,
      pauseOnFocusLoss: false,
      newestOnTop: true,
      limit: 3
    })
  )
  toastMounted = true
}

const convertToDataUrl = async (url: string): Promise<string> =>
  new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "FETCH_IMAGE_AS_DATA_URL", url },
      (response) => resolve(response?.success ? response.dataUrl : "")
    )
  })

const getPaletteData = async (bgUrl: string): Promise<ThemeConfig> => {
  try {
    const palette = await Vibrant.from(bgUrl).getPalette()
    return {
      bgUrl,
      bgColor: "",
      accentColor: palette.Vibrant?.hex || "",
      lightTextColor: palette.DarkVibrant?.hex || "",
      darkTextColor: palette.LightVibrant?.hex || ""
    }
  } catch {
    return { ...EMPTY_THEME, bgUrl }
  }
}

const normalizeCustomThemes = async (
  customThemes: CustomTheme[],
  selectedCustomThemeId: string
) => {
  const retainedSource =
    customThemes.find((theme) => theme.id === selectedCustomThemeId) ||
    customThemes[0] ||
    null
  if (!retainedSource) return null

  const retainedTheme = clearAnimatedBgUrl(retainedSource)
  let changed = false
  if (customThemes.length !== 1 || customThemes[0]?.id !== retainedTheme.id) {
    changed = true
  }
  if (retainedTheme !== retainedSource) changed = true

  if (changed) {
    await localStorageInstance.set(CUSTOM_THEMES_STORAGE_KEY, [retainedTheme])
  }
  if (selectedCustomThemeId !== retainedTheme.id) {
    await localStorageInstance.set(
      SELECTED_CUSTOM_THEME_ID_STORAGE_KEY,
      retainedTheme.id
    )
  }

  return retainedTheme
}

const restorePremiumThemes = async (backup: PremiumThemeBackup) => {
  await localStorageInstance.set(CUSTOM_THEMES_STORAGE_KEY, backup.customThemes)
  await localStorageInstance.set(
    SELECTED_CUSTOM_THEME_ID_STORAGE_KEY,
    backup.selectedCustomThemeId
  )
}

const getSelectedCustomTheme = async (): Promise<{
  isPremium: boolean
  theme: CustomTheme | null
}> => {
  const customData = await localStorageInstance.getMany([
    CUSTOM_THEMES_STORAGE_KEY,
    PREMIUM_THEME_BACKUP_STORAGE_KEY,
    SELECTED_CUSTOM_THEME_ID_STORAGE_KEY
  ])
  const customThemes = customData[CUSTOM_THEMES_STORAGE_KEY] as
    | CustomTheme[]
    | undefined
  const premiumThemeBackup = customData[
    PREMIUM_THEME_BACKUP_STORAGE_KEY
  ] as PremiumThemeBackup | null | undefined
  const selectedCustomThemeId = customData[
    SELECTED_CUSTOM_THEME_ID_STORAGE_KEY
  ] as string | undefined

  if (!Array.isArray(customThemes) || !selectedCustomThemeId) {
    return { isPremium: false, theme: null }
  }

  if (
    customThemePreview &&
    customThemePreview.themeId === selectedCustomThemeId
  ) {
    return { isPremium: false, theme: customThemePreview.theme }
  }

  let selectedTheme =
    customThemes.find((item) => item.id === selectedCustomThemeId) || null
  const hasAnimatedTheme = customThemes.some(isAnimatedCustomTheme)
  const needsPremium = customThemes.length > 1 || hasAnimatedTheme
  const premiumStatus = needsPremium
    ? await getPremiumStatus({ forceRefresh: true })
    : { isPremium: false, isChecked: false }

  if (premiumStatus.isPremium) {
    if (premiumThemeBackup?.customThemes.length) {
      await restorePremiumThemes(premiumThemeBackup)
      await localStorageInstance.set(PREMIUM_THEME_BACKUP_STORAGE_KEY, null)

      const restoredTheme =
        premiumThemeBackup.customThemes.find(
          (item) => item.id === premiumThemeBackup.selectedCustomThemeId
        ) ||
        premiumThemeBackup.customThemes[0] ||
        null

      return { isPremium: true, theme: restoredTheme }
    }

    return { isPremium: true, theme: selectedTheme }
  }

  if (needsPremium) {
    const nextSelectedThemeId = selectedCustomThemeId || customThemes[0]?.id || ""
    if (!premiumThemeBackup) {
      await localStorageInstance.set(PREMIUM_THEME_BACKUP_STORAGE_KEY, {
        customThemes,
        selectedCustomThemeId: nextSelectedThemeId
      })
    }

    const normalizedTheme = await normalizeCustomThemes(
      customThemes,
      selectedCustomThemeId
    )

    if (premiumStatus.isChecked) {
      await localStorageInstance.set(PREMIUM_THEME_BACKUP_STORAGE_KEY, null)
    }

    return {
      isPremium: false,
      theme: normalizedTheme
    }
  }

  if (premiumStatus.isChecked && premiumThemeBackup) {
    await localStorageInstance.set(PREMIUM_THEME_BACKUP_STORAGE_KEY, null)
  }

  return { isPremium: premiumStatus.isPremium, theme: selectedTheme }
}

const getCustomThemeData = async (): Promise<ThemeConfig> => {
  const { theme: customTheme } = await getSelectedCustomTheme()
  if (!customTheme) return EMPTY_THEME

  return {
    bgUrl: sanitizeCustomBgUrl(customTheme.bgUrl),
    bgColor: sanitizeColor(customTheme.bgColor),
    accentColor: sanitizeColor(customTheme.accent),
    lightTextColor: sanitizeColor(customTheme.text),
    darkTextColor: sanitizeColor(customTheme.text)
  }
}

const getThemeData = async (theme: string): Promise<ThemeConfig> => {
  if (theme === "custom") {
    return getCustomThemeData()
  }

  if (cachedThemeKey === theme && cachedThemeData) {
    return cachedThemeData
  }

  let nextThemeData: ThemeConfig

  switch (theme) {
    case "terminal":
      nextThemeData = TERMINAL_THEME
      break
    default:
      const url = THEME_BG_URLS[theme as ThemeName]
      if (url) {
        emitThemeLoading(true)
        try {
          nextThemeData = await getPaletteData(await convertToDataUrl(url))
        } finally {
          emitThemeLoading(false)
        }
      } else {
        nextThemeData = EMPTY_THEME
      }
      break
  }

  cachedThemeKey = theme
  cachedThemeData = nextThemeData
  return nextThemeData
}

const closeFabDock = () => {
  fabOpen = false
  const root = document.getElementById(FAB_ROOT_ID)
  root?.classList.remove(FAB_OPEN_CLASS)
}

const setFabAccentColor = (accentColor?: string) => {
  const root = document.getElementById(FAB_ROOT_ID)
  if (!root) return
  root.style.setProperty(
    "--decoai-accent-shadow",
    accentColor ? `inset 0 2px 16px ${accentColor}4D` : "none"
  )
}

const setFabSurfaceOptions = (customBgOptions?: CustomBgOptions) => {
  const glassBlur = clampNumber(customBgOptions?.glassBlur, 0, 50, 10)
  const opacity = clampNumber(customBgOptions?.opacity, 0, 1, 0.8)
  const root = document.getElementById(FAB_ROOT_ID)
  if (!root) return
  root.style.setProperty("--decoai-glass-blur", `${glassBlur}px`)
  root.style.setProperty("--decoai-surface-opacity", `${opacity}`)
}

const setRouteScopedUiVisibility = (
  site: SiteType | null = detectCurrentSite()
) => {
  const shouldShow = Boolean(site && whiteListUrl(site))
  const fabRoot = document.getElementById(FAB_ROOT_ID)

  if (fabRoot) fabRoot.style.display = shouldShow ? "flex" : "none"
  if (!shouldShow && fabOpen) closeFabDock()

  return shouldShow
}

const setThemeVisibility = async () => {
  const root = document.getElementById(FAB_ROOT_ID)
  if (!root) return
  if (!setRouteScopedUiVisibility()) return
  const themeButton = root.querySelector<HTMLElement>(`.${FAB_THEME_BTN_CLASS}`)
  const themeAction = themeButton?.closest<HTMLElement>(`.${FAB_ACTION_CLASS}`)
  const isHidden =
    (await storage.get<boolean>(THEME_HIDDEN_STORAGE_KEY)) === true
  if (themeAction) themeAction.style.display = isHidden ? "none" : "flex"
  if (isHidden && fabOpen) closeFabDock()
}

const onOutsideFabClick = (event: MouseEvent) => {
  const root = document.getElementById(FAB_ROOT_ID)
  if (!root) return
  const target = event.target as Node
  const panel = root.querySelector(`.${FAB_THEME_PANEL_CLASS}`)
  const action =
    target instanceof Element ? target.closest(`.${FAB_ACTION_CLASS}`) : null
  if (panel?.contains(target) || action) return
  closeFabDock()
}

const mountFab = async () => {
  mountToastContainer()

  if (fabMounted || document.getElementById(FAB_ROOT_ID)) {
    fabMounted = true
    return
  }

  getFABStyle()
  const root = document.createElement("div")
  root.id = FAB_ROOT_ID
  root.className = FAB_ROOT_CLASS

  const panel = document.createElement("aside")
  panel.className = FAB_THEME_PANEL_CLASS
  const panelHost = document.createElement("div")
  panelHost.id = FAB_THEME_MOUNT_ID
  panelHost.style.width = "100%"
  panelHost.style.height = "100%"
  panel.appendChild(panelHost)

  const createFabAction = ({
    buttonClass,
    ariaLabel,
    icon,
    tooltipText
  }: {
    buttonClass: string
    ariaLabel: string
    icon: string
    tooltipText: string
  }) => {
    const button = document.createElement("button")
    button.type = "button"
    button.className = buttonClass
    button.setAttribute("aria-label", ariaLabel)
    button.innerHTML = icon
    button.addEventListener("click", (event) => {
      event.stopPropagation()
      if (fabOpen) {
        closeFabDock()
      } else {
        fabOpen = true
        root.classList.add(FAB_OPEN_CLASS)
        window.dispatchEvent(new CustomEvent(FAB_OPEN_EVENT))
      }
    })

    const tooltip = document.createElement("span")
    tooltip.className = FAB_TOOLTIP_CLASS
    tooltip.textContent = tooltipText

    const action = document.createElement("div")
    action.className = FAB_ACTION_CLASS
    action.appendChild(button)
    action.appendChild(tooltip)
    return action
  }

  const themeAction = createFabAction({
    buttonClass: FAB_THEME_BTN_CLASS,
    ariaLabel: "Theme Settings Button",
    icon: FAB_THEME_BTN_ICON,
    tooltipText: `${t("themeSettings")}`
  })

  root.appendChild(panel)
  root.appendChild(themeAction)
    ; (document.body || document.documentElement).appendChild(root)
  document.addEventListener("click", onOutsideFabClick, { capture: true })
  const shadowRoot = panelHost.attachShadow({ mode: "open" })
  const shadowMount = document.createElement("div")
  shadowMount.style.width = "100%"
  shadowMount.style.height = "100%"
  shadowRoot.appendChild(shadowMount)

  fabThemeRoot = createRoot(shadowMount)
  fabThemeRoot.render(createElement(FabPanelApp))

  fabMounted = true
  await setThemeVisibility()
}

const mapSelectors = (
  selectors: string,
  {
    prefix = "",
    suffix = ""
  }: {
    prefix?: string
    suffix?: string
  }
) =>
  selectors
    .split(",")
    .map((s) => `${prefix}${s.trim()}${suffix}`)
    .join(", ")

const getCustomBgOptions = async (): Promise<CustomBgOptions> => {
  const { theme: customTheme } = await getSelectedCustomTheme()
  return sanitizeCustomBgOptions(customTheme?.bgOptions)
}

const generateCSS = (
  site: SiteType,
  { bgUrl, bgColor, accentColor, lightTextColor, darkTextColor }: ThemeConfig,
  customBgOptions?: CustomBgOptions
) => {
  const config = SITE_SELECTORS[site]
  if (!config) return ""

  const { elements, darkClass, container } = config
  const darkSelectors = mapSelectors(elements, { prefix: `${darkClass} ` })
  const hoverSelectors = mapSelectors(elements, { suffix: ":hover" })

  const safeBgUrl = sanitizeCustomBgUrl(bgUrl)
  const safeBgColor = sanitizeColor(bgColor)
  const safeAccentColor = sanitizeColor(accentColor)
  const safeLightTextColor = sanitizeColor(lightTextColor)
  const safeDarkTextColor = sanitizeColor(darkTextColor)
  const position = sanitizePosition(customBgOptions?.position)
  const scaleX = customBgOptions?.scaleX === -1 ? -1 : 1
  const invert = clampNumber(customBgOptions?.invert, 0, 1, 0)
  const grayscale = clampNumber(customBgOptions?.grayscale, 0, 1, 0)
  const blur = clampNumber(customBgOptions?.blur, 0, 50, 0)
  const brightness = clampNumber(customBgOptions?.brightness, 0, 5, 1)
  const glassBlur = clampNumber(customBgOptions?.glassBlur, 0, 50, 10)
  const opacity = clampNumber(customBgOptions?.opacity, 0, 1, 0.8)
  const hideHeader = customBgOptions?.hideHeader ?? true
  const hideFooter = customBgOptions?.hideFooter ?? true

  const getVisibilityStyle = () => `
    ${hideHeader ? `${SITE_SELECTORS[site].header} { display: none !important; }` : ""}
    ${hideFooter ? `${SITE_SELECTORS[site].footer} { font-size: 0 !important; line-height: normal !important }` : ""}
  `

  const getBgStyle = () =>
    safeBgUrl || safeBgColor
      ? `
    body::before {
      content: ""; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      ${safeBgUrl ? `background-image: url("${safeBgUrl}") !important;` : "background-image: none !important;"}
      ${safeBgColor ? `background-color: ${safeBgColor} !important;` : ""}
      background-position: ${position} !important;
      background-size: cover !important;
      background-repeat: no-repeat !important;
      z-index: 0 !important;
      transform: scaleX(${scaleX}) translateZ(0) !important;
      transform-origin: center center !important;
      filter: invert(${invert}) grayscale(${grayscale}) blur(${blur}px) brightness(${brightness}) !important;
    }
    ${container} { background-color: transparent !important; }
    ${site === "chatgpt" ? "#page-header, div::after { background-color: transparent !important; }" : ""}
    ${site === "gemini" ? ".input-gradient { background-color: transparent !important; } .input-gradient::before { content: none !important; }" : ""}
    ${site === "claude" ? 'header { background-color: transparent !important; } header > div:first-of-type { display: none !important } div[role="note"][data-disclaimer="true"] { background-color: transparent !important; }' : ""}
    ${site === "grok" ? "main > div > div { background-image: none !important; } .chat-input-backdrop { background-color: transparent !important; }" : ""}
  `
      : ""

  const getElStyle = () => `
    ${elements} {
      background-color: rgba(255, 255, 255, ${opacity}) !important;
      ${safeAccentColor ? `box-shadow: inset 0 2px 16px ${safeAccentColor}4D !important;` : ""}
      border: none !important;
      backdrop-filter: blur(${glassBlur}px) saturate(140%) !important;
      opacity: 0.8 !important;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }
    ${darkSelectors} {
      background-color: rgba(24, 24, 24, ${opacity}) !important;
    }
    ${hoverSelectors} {
      opacity: 1 !important;
    }
    ${site === "chatgpt"
      ? `
      .agent-turn {
        margin-top: 5px !important;
        margin-bottom: 5px !important;
        padding: 10px 16px !important;
        border-radius: 22px !important;
      }
    `
      : ""
    }
    ${site === "gemini"
      ? `
      .show-lm-background::before {
        background: none !important;
      }
      model-response, .dual-response-panel {
        padding: 20px 28px !important;
        border-radius: 40px !important;
      }
    `
      : ""
    }
    ${site === "claude"
      ? `
      .font-claude-response {
        padding: 10px 16px !important;
        border-radius: 12px !important;
      }
    `
      : ""
    }
    ${site === "grok"
      ? `
      [data-testid="assistant-message"] {
        padding: 8px 16px !important;
        border-radius: 24px !important;
      }
    `
      : ""
    }
    ${safeAccentColor ? `::-webkit-scrollbar { width: auto !important; }::-webkit-scrollbar-thumb { background-color: ${safeAccentColor}4D !important; border-radius: 22px !important; }` : ""}
  `

  const getTextStyle = () =>
    safeLightTextColor && safeDarkTextColor
      ? `
    *:not(pre *) { color: ${safeLightTextColor} !important; }
    ${darkClass} *:not(pre *) { color: ${safeDarkTextColor} !important; }
  `
      : ""

  return [
    getBgStyle(),
    getElStyle(),
    getTextStyle(),
    getVisibilityStyle()
  ].join("\n")
}

const applyTheme = async (requestId: number) => {
  if (requestId !== applyThemeRequestId) return

  const currentSite = detectCurrentSite()
  if (!currentSite) return

  const style = getThemeStyle()
  if (!whiteListUrl(currentSite)) {
    style.textContent = ""
    setFabAccentColor("")
    setFabSurfaceOptions()
    setRouteScopedUiVisibility(currentSite)
    return
  }

  await mountFab()
  setRouteScopedUiVisibility(currentSite)

  const [currentTheme, modelEnabled] = await Promise.all([
    storage.get<string>(SELECTED_THEME_STORAGE_KEY),
    storage.get<ModelEnabledMap>(MODEL_ENABLED_STORAGE_KEY)
  ])

  const isModelEnabled = modelEnabled?.[currentSite] ?? true
  if (!isModelEnabled || !currentTheme || currentTheme === "default") {
    if (requestId !== applyThemeRequestId) return
    style.textContent = ""
    setFabAccentColor("")
    setFabSurfaceOptions()
    setRouteScopedUiVisibility(currentSite)
    return
  }

  const [themeData, customBgOptions] = await Promise.all([
    getThemeData(currentTheme),
    currentTheme === "custom"
      ? getCustomBgOptions()
      : Promise.resolve(undefined)
  ])

  if (requestId !== applyThemeRequestId) return
  style.textContent = generateCSS(currentSite, themeData, customBgOptions)
  setFabAccentColor(themeData.accentColor)
  setFabSurfaceOptions(customBgOptions)
}

const flushApplyTheme = async () => {
  if (applyThemeRunning) return
  applyThemeRunning = true
  try {
    while (applyThemeQueued) {
      applyThemeQueued = false
      const requestId = ++applyThemeRequestId
      await applyTheme(requestId)
    }
  } finally {
    applyThemeRunning = false
  }
}

const scheduleApplyTheme = () => {
  applyThemeQueued = true
  requestAnimationFrame(() => {
    void flushApplyTheme()
  })
}

const scheduleApplyThemeOnLocationChange = () => {
  if (currentLocation === location.href) return
  currentLocation = location.href
  scheduleApplyTheme()
}

const invalidateThemeCache = () => {
  cachedThemeKey = null
  cachedThemeData = null
}

const hasCustomThemeStorageChange = (
  changes: Record<string, chrome.storage.StorageChange>
) => CUSTOM_THEME_WATCH_STORAGE_KEYS.some((key) => changes[key])

const isCustomThemeSelected = async () =>
  (await storage.get<string>(SELECTED_THEME_STORAGE_KEY)) === "custom"

const watchLocationChange = () => {
  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState

  history.pushState = function (...args) {
    const result = originalPushState.apply(this, args)
    scheduleApplyThemeOnLocationChange()
    return result
  }

  history.replaceState = function (...args) {
    const result = originalReplaceState.apply(this, args)
    scheduleApplyThemeOnLocationChange()
    return result
  }

  window.addEventListener("popstate", scheduleApplyThemeOnLocationChange)
  window.setInterval(scheduleApplyThemeOnLocationChange, 250)
}

storage.watch({
  [SELECTED_THEME_STORAGE_KEY]: () => {
    invalidateThemeCache()
    scheduleApplyTheme()
  },
  [MODEL_ENABLED_STORAGE_KEY]: () => scheduleApplyTheme(),
  [THEME_HIDDEN_STORAGE_KEY]: () => setThemeVisibility()
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !hasCustomThemeStorageChange(changes)) return

  void (async () => {
    if (!(await isCustomThemeSelected())) return
    invalidateThemeCache()
    scheduleApplyTheme()
  })()
})

window.addEventListener(CUSTOM_THEME_PREVIEW_EVENT, (event) => {
  const customEvent = event as CustomEvent<{
    themeId: string
    theme: CustomTheme
  } | null>
  customThemePreview = customEvent.detail
  void (async () => {
    if (!(await isCustomThemeSelected())) return
    scheduleApplyTheme()
  })()
})

watchLocationChange()
scheduleApplyTheme()
