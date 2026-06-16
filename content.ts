import { Icon } from "@iconify/react"
import { Vibrant } from "node-vibrant/browser"
import type { PlasmoCSConfig } from "plasmo"
import React, {
  createElement,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from "react"
import { createRoot, type Root } from "react-dom/client"
import Moveable from "react-moveable"
import { toast, ToastContainer } from "react-toastify"

import { Storage } from "@plasmohq/storage"
import { useStorage } from "@plasmohq/storage/hook"

import { getValidAuthSessionSnapshot } from "./auth"
import { FabPanelApp } from "./panel"
import {
  clampNumber,
  clearAnimatedBgUrl,
  CUSTOM_THEME_PREVIEW_EVENT,
  CUSTOM_THEMES_STORAGE_KEY,
  DEFAULT_WIDGET_ENABLED,
  DEFAULT_WIDGET_INSTANCES,
  DEFAULT_WIDGET_LAYOUT,
  DEFAULT_WIDGET_MIN_SIZE,
  detectCurrentSite,
  FAB_OPEN_EVENT,
  isAnimatedCustomTheme,
  MODEL_ENABLED_STORAGE_KEY,
  PREMIUM_THEME_BACKUP_STORAGE_KEY,
  sanitizeColor,
  sanitizeCustomBgOptions,
  sanitizeCustomBgUrl,
  SELECTED_CUSTOM_THEME_ID_STORAGE_KEY,
  SELECTED_THEME_STORAGE_KEY,
  THEME_HIDDEN_STORAGE_KEY,
  THEME_LOADING_EVENT,
  WIDGET_ENABLED_STORAGE_KEY,
  WIDGET_FRAME_STORAGE_KEY,
  WIDGET_HIDDEN_STORAGE_KEY,
  WIDGET_INSTANCES_STORAGE_KEY,
  WIDGET_LAYOUT_PREVIEW_EVENT,
  WIDGET_LAYOUT_STORAGE_KEY,
  type CustomBgOptions,
  type CustomTheme,
  type ModelEnabledMap,
  type SiteType,
  type WidgetFrame,
  type WidgetFrameMap,
  type WidgetInstance,
  type WidgetKey,
  type WidgetLayoutOptions,
  type WidgetSize
} from "./utils"

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
let fabPanelView: FabPanelView = "theme"
let fabThemeRoot: Root | null = null
let widgetMounted = false
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
const FAB_WIDGET_BTN_CLASS = "decoai-fab-widget"
const FAB_TOOLTIP_CLASS = "decoai-fab-tooltip"
const FAB_THEME_PANEL_CLASS = "decoai-fab-theme-panel"
const FAB_THEME_MOUNT_ID = "decoai-fab-theme-mount"
const WIDGET_ROOT_ID = "decoai-widget-root"
const TOAST_STYLE_ID = "decoai-toastify-style"
const TOAST_ROOT_ID = "decoai-toast-root"
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

type FabPanelView = "theme" | "widget"

const WIDGET_LIST: Array<{
  key: WidgetKey
  labelKey: string
  icon: string
}> = [
    { key: "note", labelKey: "noteWidget", icon: "lucide:notepad-text" },
    { key: "todo", labelKey: "todoWidget", icon: "lucide:list-checks" },
    { key: "timer", labelKey: "timerWidget", icon: "lucide:clock" }
  ]

const appendToPage = (element: HTMLElement) => {
  ; (document.head || document.documentElement).appendChild(element)
}

const appendToBody = (element: HTMLElement) => {
  ; (document.body || document.documentElement).appendChild(element)
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

const isAllowedRoute = (site: SiteType) => {
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
      }

      .${FAB_THEME_BTN_CLASS},
      .${FAB_WIDGET_BTN_CLASS} {
        width: 45px;
        height: 45px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background-color: #000;
        border: none;
        border-radius: 999px;
        color: #66cdaa;
        cursor: pointer;
      }

      html.dark .${FAB_THEME_BTN_CLASS},
      html.dark .${FAB_WIDGET_BTN_CLASS},
      body.dark-theme .${FAB_THEME_BTN_CLASS},
      body.dark-theme .${FAB_WIDGET_BTN_CLASS},
      html[data-mode="dark"] .${FAB_THEME_BTN_CLASS},
      html[data-mode="dark"] .${FAB_WIDGET_BTN_CLASS} {
        background-color: #fff;
      }

      .${FAB_THEME_BTN_CLASS}:hover,
      .${FAB_WIDGET_BTN_CLASS}:hover {
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
      .${FAB_THEME_BTN_CLASS}:focus-visible + .${FAB_TOOLTIP_CLASS},
      .${FAB_WIDGET_BTN_CLASS}:hover + .${FAB_TOOLTIP_CLASS},
      .${FAB_WIDGET_BTN_CLASS}:focus-visible + .${FAB_TOOLTIP_CLASS} {
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
  appendToBody(root)

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
  const premiumThemeBackup = customData[PREMIUM_THEME_BACKUP_STORAGE_KEY] as
    | PremiumThemeBackup
    | null
    | undefined
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

  const selectedTheme =
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
    const nextSelectedThemeId =
      selectedCustomThemeId || customThemes[0]?.id || ""
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

const clampWidgetFrameToViewport = (
  frame: WidgetFrame,
  minSize: WidgetSize
): WidgetFrame => {
  const viewportWidth = Math.max(document.documentElement.clientWidth, 320)
  const viewportHeight = Math.max(document.documentElement.clientHeight, 240)
  const minWidth = Math.min(minSize.width, viewportWidth)
  const minHeight = Math.min(minSize.height, viewportHeight)
  const width = clampNumber(frame.width, minWidth, viewportWidth, minWidth)
  const height = clampNumber(frame.height, minHeight, viewportHeight, minHeight)
  return {
    width,
    height,
    x: clampNumber(frame.x, 0, Math.max(0, viewportWidth - width), 0),
    y: clampNumber(frame.y, 0, Math.max(0, viewportHeight - height), 0)
  }
}

const getInitialWidgetFrame = (index: number): WidgetFrame => {
  const gap = 20
  const itemsPerColumn = 5
  const viewportWidth = Math.max(document.documentElement.clientWidth, 320)
  const viewportHeight = Math.max(document.documentElement.clientHeight, 240)
  const width = Math.min(DEFAULT_WIDGET_MIN_SIZE.width, viewportWidth)
  const height = Math.min(DEFAULT_WIDGET_MIN_SIZE.height, viewportHeight)
  const maxX = Math.max(0, viewportWidth - width)
  const maxY = Math.max(0, viewportHeight - height)
  const column = Math.floor(index / itemsPerColumn)
  const row = index % itemsPerColumn
  const x = Math.min(maxX, 300 + column * (width + gap))
  const y = Math.min(maxY, gap + row * (height + gap))

  return { x, y, width, height }
}

const isWidgetDarkMode = () => {
  const currentSite = detectCurrentSite()
  if (!currentSite) return false
  return document.querySelector(SITE_SELECTORS[currentSite].darkClass) !== null
}

function WidgetOverlayApp() {
  const [previewLayout, setPreviewLayout] =
    useState<WidgetLayoutOptions | null>(null)
  const [isDarkMode, setIsDarkMode] = useState(isWidgetDarkMode)
  const [widgetItems, setWidgetItems] = useStorage<WidgetInstance[]>(
    WIDGET_INSTANCES_STORAGE_KEY,
    DEFAULT_WIDGET_INSTANCES
  )
  const [enabledMap] = useStorage(
    WIDGET_ENABLED_STORAGE_KEY,
    DEFAULT_WIDGET_ENABLED
  )
  const [layoutOptions] = useStorage<WidgetLayoutOptions>(
    WIDGET_LAYOUT_STORAGE_KEY,
    DEFAULT_WIDGET_LAYOUT
  )
  const [frameMap, setFrameMap] = useStorage<WidgetFrameMap>(
    WIDGET_FRAME_STORAGE_KEY,
    {}
  )
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null)
  const widgetRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const liveFrameRef = useRef<Partial<WidgetFrameMap>>({})
  const interactionStartFrameRef = useRef<WidgetFrame | null>(null)
  const layout = {
    ...DEFAULT_WIDGET_LAYOUT,
    ...(previewLayout || layoutOptions)
  }
  const frames = useMemo(
    () =>
      (widgetItems || DEFAULT_WIDGET_INSTANCES).reduce(
        (nextFrames, item, index) => {
          const fallback = getInitialWidgetFrame(index)
          nextFrames[item.id] = clampWidgetFrameToViewport(
            { ...fallback, ...frameMap?.[item.id] },
            DEFAULT_WIDGET_MIN_SIZE
          )
          return nextFrames
        },
        {} as WidgetFrameMap
      ),
    [frameMap, widgetItems]
  )
  const selectedTarget = editingWidgetId
    ? widgetRefs.current[editingWidgetId] || null
    : null

  React.useEffect(() => {
    const onWidgetLayoutPreview = (event: Event) => {
      const customEvent = event as CustomEvent<WidgetLayoutOptions | null>
      setPreviewLayout(customEvent.detail)
    }
    window.addEventListener(WIDGET_LAYOUT_PREVIEW_EVENT, onWidgetLayoutPreview)
    return () =>
      window.removeEventListener(
        WIDGET_LAYOUT_PREVIEW_EVENT,
        onWidgetLayoutPreview
      )
  }, [])

  React.useEffect(() => {
    const updateDarkMode = () => setIsDarkMode(isWidgetDarkMode())
    const observer = new MutationObserver(updateDarkMode)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-mode"]
    })
    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"]
      })
    }
    updateDarkMode()
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    const onDocumentPointerDown = (event: PointerEvent) => {
      if (!editingWidgetId) return
      const target = event.target as Element | null
      if (
        target?.closest(".decoai-widget-card") ||
        target?.closest(".moveable-control-box")
      ) {
        return
      }
      setEditingWidgetId(null)
    }
    document.addEventListener("pointerdown", onDocumentPointerDown, {
      capture: true
    })
    return () =>
      document.removeEventListener("pointerdown", onDocumentPointerDown, true)
  }, [editingWidgetId])

  const getWidgetStyle = (id: string): CSSProperties => {
    const frame = frames[id]
    const opacity = clampNumber(layout.opacity, 0, 1, 0.8)
    const textColor = layout.textColor
    const accentColor = layout.accentColor
    const backgroundColor =
      layout.backgroundColor ||
      (isDarkMode
        ? `rgba(24, 24, 24, ${opacity})`
        : `rgba(255, 255, 255, ${opacity})`)

    return {
      position: "absolute",
      left: 0,
      top: 0,
      width: frame.width,
      height: frame.height,
      transform: `translate(${frame.x}px, ${frame.y}px)`,
      backgroundColor,
      color: textColor,
      "--decoai-widget-bg": backgroundColor,
      "--decoai-widget-text": textColor || "inherit",
      border: "none",
      borderRadius: 8,
      boxShadow: accentColor ? `inset 0 2px 16px ${accentColor}4D` : "none",
      backdropFilter: `blur(${clampNumber(layout.glassBlur, 0, 50, 10)}px) saturate(140%)`,
      overflow: "hidden",
      pointerEvents: "auto",
      touchAction: "none",
      willChange: "transform, width, height"
    } as CSSProperties
  }

  const persistLiveFrame = (id: string | null) => {
    if (!id || !liveFrameRef.current[id]) return
    const nextFrame = liveFrameRef.current[id] as WidgetFrame
    setFrameMap((prev) => ({
      ...prev,
      [id]: clampWidgetFrameToViewport(nextFrame, DEFAULT_WIDGET_MIN_SIZE)
    }))
  }

  const duplicateWidget = async (item: WidgetInstance) => {
    const { isPremium } = await getPremiumStatus({ forceRefresh: true })
    if (!isPremium) {
      toast.error(t("pro_widgetLimit"))
      return
    }

    const sourceFrame = frames[item.id]
    const copiedId = `${item.type}-${crypto.randomUUID()}`
    setWidgetItems((prev) => {
      const nextItems = [...(prev || DEFAULT_WIDGET_INSTANCES)]
      const sourceIndex = nextItems.findIndex((widget) => widget.id === item.id)
      const widgetMeta = WIDGET_LIST.find((widget) => widget.key === item.type)
      nextItems.splice(sourceIndex + 1, 0, {
        id: copiedId,
        type: item.type,
        name: t(widgetMeta?.labelKey || "noteWidget")
      })
      return nextItems
    })
    setFrameMap((prev) => ({
      ...prev,
      [copiedId]: {
        ...sourceFrame,
        x: sourceFrame.x + 50,
        y: sourceFrame.y + 50
      }
    }))
  }

  const deleteWidget = (item: WidgetInstance) => {
    setWidgetItems((prev) =>
      (prev || DEFAULT_WIDGET_INSTANCES).filter(
        (widget) => widget.id !== item.id
      )
    )
    if (editingWidgetId === item.id) setEditingWidgetId(null)
  }

  const updateWidgetName = (id: string, name: string) => {
    setWidgetItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, name } : item))
    )
  }

  return createElement(
    "div",
    {
      style: {
        position: "fixed",
        inset: 0,
        zIndex: 4,
        pointerEvents: "none"
      } as CSSProperties
    },
    (widgetItems || DEFAULT_WIDGET_INSTANCES).map((item) => {
      const widgetMeta = WIDGET_LIST.find((widget) => widget.key === item.type)
      if (!widgetMeta) return null
      if (enabledMap?.[item.type] === false) return null
      return createElement(
        "div",
        {
          key: item.id,
          ref: (node: HTMLDivElement | null) => {
            widgetRefs.current[item.id] = node
          },
          className: "decoai-widget-card",
          onClick: (e) => {
            e.stopPropagation()
            setEditingWidgetId(item.id)
          },
          style: getWidgetStyle(item.id)
        },
        createElement(
          "div",
          { className: "decoai-widget-card__actions" },
          createElement(
            "button",
            {
              type: "button",
              className:
                "decoai-widget-card__action decoai-widget-card__duplicate",
              "aria-hidden": "true",
              onClick: (e) => {
                e.preventDefault()
                e.stopPropagation()
                void duplicateWidget(item)
              }
            },
            createElement(Icon, {
              icon: "lucide:copy-plus",
              height: 16,
              "aria-hidden": "true"
            })
          ),
          createElement(
            "button",
            {
              type: "button",
              className:
                "decoai-widget-card__action decoai-widget-card__delete",
              "aria-hidden": "true",
              onClick: (e) => {
                e.preventDefault()
                e.stopPropagation()
                deleteWidget(item)
              }
            },
            createElement(Icon, {
              icon: "lucide:trash-2",
              height: 16,
              "aria-hidden": "true"
            })
          )
        ),
        createElement(
          "div",
          {
            style: {
              height: 32,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 10px"
            }
          },
          createElement(Icon, {
            icon: widgetMeta.icon,
            height: 16,
            "aria-hidden": "true"
          }),
          createElement("input", {
            type: "text",
            defaultValue: item.name,
            maxLength: 20,
            spellCheck: false,
            autoComplete: "off",
            onChange: (e) =>
              updateWidgetName(item.id, e.target.value.slice(0, 20)),
            onKeyDown: (e) => e.stopPropagation(),
            onKeyUp: (e) => e.stopPropagation(),
            style: {
              width: 160,
              padding: 0,
              border: "none",
              outline: "none",
              background: "transparent",
              font: "inherit",
              color: "inherit",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }
          })
        )
      )
    }),
    createElement(Moveable, {
      target: selectedTarget,
      draggable: true,
      resizable: true,
      checkInput: true,
      snappable: true,
      snapDirections: true,
      elementSnapDirections: true,
      elementGuidelines: Object.entries(widgetRefs.current)
        .filter(([id, node]) => id !== editingWidgetId && node)
        .map(([, node]) => node as HTMLDivElement),
      snapGap: true,
      isDisplaySnapDigit: false,
      origin: false,
      edge: false,
      keepRatio: false,
      bounds: {
        left: 0,
        top: 0,
        right: Math.max(document.documentElement.clientWidth, 320),
        bottom: Math.max(document.documentElement.clientHeight, 240)
      },
      hideDefaultLines: false,
      renderDirections: ["nw", "n", "ne", "w", "e", "sw", "s", "se"],
      throttleDrag: 0,
      throttleResize: 0,
      onDragStart: () => {
        interactionStartFrameRef.current = editingWidgetId
          ? frames[editingWidgetId]
          : null
      },
      onDrag: (event) => {
        if (!editingWidgetId) return
        const frame =
          interactionStartFrameRef.current || frames[editingWidgetId]
        const [deltaX, deltaY] = event.beforeDist
        const nextFrame = clampWidgetFrameToViewport(
          {
            ...frame,
            x: frame.x + deltaX,
            y: frame.y + deltaY
          },
          DEFAULT_WIDGET_MIN_SIZE
        )
        event.target.style.transform = `translate(${nextFrame.x}px, ${nextFrame.y}px)`
        liveFrameRef.current[editingWidgetId] = nextFrame
      },
      onDragEnd: () => {
        persistLiveFrame(editingWidgetId)
        interactionStartFrameRef.current = null
      },
      onResizeStart: () => {
        interactionStartFrameRef.current = editingWidgetId
          ? frames[editingWidgetId]
          : null
      },
      onResize: (event) => {
        if (!editingWidgetId) return
        const frame =
          interactionStartFrameRef.current || frames[editingWidgetId]
        const [deltaX, deltaY] = event.drag.beforeDist
        const nextFrame = clampWidgetFrameToViewport(
          {
            ...frame,
            x: frame.x + deltaX,
            y: frame.y + deltaY,
            width: event.width,
            height: event.height
          },
          DEFAULT_WIDGET_MIN_SIZE
        )
        event.target.style.width = `${nextFrame.width}px`
        event.target.style.height = `${nextFrame.height}px`
        event.target.style.transform = `translate(${nextFrame.x}px, ${nextFrame.y}px)`
        liveFrameRef.current[editingWidgetId] = nextFrame
      },
      onResizeEnd: () => {
        persistLiveFrame(editingWidgetId)
        interactionStartFrameRef.current = null
      }
    })
  )
}

const mountWidgetOverlay = () => {
  if (widgetMounted || document.getElementById(WIDGET_ROOT_ID)) {
    widgetMounted = true
    return
  }

  const root = document.createElement("div")
  root.id = WIDGET_ROOT_ID
  root.style.display = "none"
  root.innerHTML = `
    <style>
      .decoai-widget-card__actions {
        position: absolute;
        top: 6px;
        right: 6px;
        z-index: 3;
        display: flex;
        gap: 2px;
        opacity: 0;
        transform: scale(0.9);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .moveable-control-box,
      .moveable-line,
      .moveable-control {
        pointer-events: auto !important;
        z-index: 4 !important;
      }
      .moveable-control {
        width: 12px !important;
        height: 12px !important;
        margin-top: -6px !important;
        margin-left: -6px !important;
        border: 2px solid #fff !important;
      }
      .moveable-bold {
        display: none !important;
      }
      .decoai-widget-card {
        background-color: var(--decoai-widget-bg) !important;
        opacity: 0.8;
        transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .decoai-widget-card,
      .decoai-widget-card *:not(.moveable-control):not(.moveable-line) {
        color: var(--decoai-widget-text) !important;
      }
      .decoai-widget-card:hover {
        opacity: 1;
      }
      .decoai-widget-card:hover .decoai-widget-card__actions {
        opacity: 1;
        transform: scale(1);
      }
      .decoai-widget-card__action {
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: none;
        border-radius: 999px;
        color: #fff !important;
        background-color: #0000004D;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .decoai-widget-card__action:hover {
        background-color: #1976d2;
      }
      .decoai-widget-card__delete:hover {
        background-color: #d32f2f;
      }
    </style>
  `
  appendToBody(root)
  const mount = document.createElement("div")
  root.appendChild(mount)
  createRoot(mount).render(createElement(WidgetOverlayApp))
  widgetMounted = true
}

const setRouteScopedUiVisibility = (
  site: SiteType | null = detectCurrentSite()
) => {
  const shouldShow = Boolean(site && isAllowedRoute(site))
  const fabRoot = document.getElementById(FAB_ROOT_ID)
  const widgetRoot = document.getElementById(WIDGET_ROOT_ID)

  if (fabRoot) fabRoot.style.display = shouldShow ? "flex" : "none"
  if (widgetRoot) widgetRoot.style.display = shouldShow ? "block" : "none"
  if (!shouldShow && fabOpen) closeFabDock()

  return shouldShow
}

const syncFabVisibility = async () => {
  const root = document.getElementById(FAB_ROOT_ID)
  if (!root) return
  if (!setRouteScopedUiVisibility()) return
  const themeButton = root.querySelector<HTMLElement>(`.${FAB_THEME_BTN_CLASS}`)
  const themeAction = themeButton?.closest<HTMLElement>(`.${FAB_ACTION_CLASS}`)
  const widgetButton = root.querySelector<HTMLElement>(
    `.${FAB_WIDGET_BTN_CLASS}`
  )
  const widgetAction = widgetButton?.closest<HTMLElement>(
    `.${FAB_ACTION_CLASS}`
  )
  const isThemeHidden =
    (await storage.get<boolean>(THEME_HIDDEN_STORAGE_KEY)) === true
  const isWidgetHidden =
    (await storage.get<boolean>(WIDGET_HIDDEN_STORAGE_KEY)) === true
  if (themeAction) themeAction.style.display = isThemeHidden ? "none" : "flex"
  if (widgetAction)
    widgetAction.style.display = isWidgetHidden ? "none" : "flex"
  if (
    fabOpen &&
    ((isThemeHidden && fabPanelView === "theme") ||
      (isWidgetHidden && fabPanelView === "widget") ||
      (isThemeHidden && isWidgetHidden))
  ) {
    closeFabDock()
  }
}

const onOutsideFabClick = (event: MouseEvent) => {
  const root = document.getElementById(FAB_ROOT_ID)
  if (!root) return
  const target = event.target as Node
  const panel = root.querySelector(`.${FAB_THEME_PANEL_CLASS}`)
  const actionButton =
    target instanceof Element
      ? target.closest(`.${FAB_ACTION_CLASS} button`)
      : null
  if (panel?.contains(target) || actionButton) return
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
    iconComponent,
    tooltipText,
    panelView
  }: {
    buttonClass: string
    ariaLabel: string
    iconComponent: React.ReactElement
    tooltipText: string
    panelView: FabPanelView
  }) => {
    const button = document.createElement("button")
    button.type = "button"
    button.className = buttonClass
    button.setAttribute("aria-label", ariaLabel)
    const iconRoot = createRoot(button)
    iconRoot.render(iconComponent)
    button.addEventListener("click", (event) => {
      event.stopPropagation()
      if (fabOpen && fabPanelView === panelView) {
        closeFabDock()
      } else {
        fabPanelView = panelView
        fabOpen = true
        root.classList.add(FAB_OPEN_CLASS)
        window.dispatchEvent(
          new CustomEvent(FAB_OPEN_EVENT, { detail: { view: panelView } })
        )
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
    iconComponent: React.createElement(Icon, {
      icon: "lucide:wallpaper",
      height: 24,
      "aria-hidden": "true"
    }),
    tooltipText: t("themeSettings"),
    panelView: "theme"
  })

  const widgetAction = createFabAction({
    buttonClass: FAB_WIDGET_BTN_CLASS,
    ariaLabel: "Widget Settings Button",
    iconComponent: React.createElement(Icon, {
      icon: "lucide:component",
      height: 24,
      "aria-hidden": "true"
    }),
    tooltipText: t("widgetSettings"),
    panelView: "widget"
  })

  root.appendChild(panel)
  root.appendChild(widgetAction)
  root.appendChild(themeAction)
  appendToBody(root)
  document.addEventListener("click", onOutsideFabClick, { capture: true })
  const shadowRoot = panelHost.attachShadow({ mode: "open" })
  const shadowMount = document.createElement("div")
  shadowMount.style.width = "100%"
  shadowMount.style.height = "100%"
  shadowRoot.appendChild(shadowMount)

  fabThemeRoot = createRoot(shadowMount)
  fabThemeRoot.render(createElement(FabPanelApp))

  fabMounted = true
  await syncFabVisibility()
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

  const position = customBgOptions?.position || "50% 50%"
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
    bgUrl || bgColor
      ? `
    body::before {
      content: ""; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      ${bgUrl ? `background-image: url("${bgUrl}") !important;` : "background-image: none !important;"}
      ${bgColor ? `background-color: ${bgColor} !important;` : ""}
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
      ${accentColor ? `box-shadow: inset 0 2px 16px ${accentColor}4D !important;` : ""}
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
    ${accentColor ? `::-webkit-scrollbar { width: auto !important; }::-webkit-scrollbar-thumb { background-color: ${accentColor}4D !important; border-radius: 22px !important; }` : ""}
  `

  const getTextStyle = () =>
    lightTextColor && darkTextColor
      ? `
    *:not(pre *) { color: ${lightTextColor} !important; }
    ${darkClass} *:not(pre *) { color: ${darkTextColor} !important; }
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
  if (!isAllowedRoute(currentSite)) {
    style.textContent = ""
    setFabAccentColor("")
    setFabSurfaceOptions()
    setRouteScopedUiVisibility(currentSite)
    return
  }

  await mountFab()
  mountWidgetOverlay()
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
  [THEME_HIDDEN_STORAGE_KEY]: () => syncFabVisibility(),
  [WIDGET_HIDDEN_STORAGE_KEY]: () => syncFabVisibility()
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
