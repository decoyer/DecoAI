import { Icon } from "@iconify/react"
import { ListKit } from "@tiptap/extension-list"
import { Placeholder } from "@tiptap/extensions"
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { differenceInCalendarDays, formatISO, parseISO, startOfDay } from "date-fns"
import { Vibrant } from "node-vibrant/browser"
import type { PlasmoCSConfig } from "plasmo"
import React, { createElement, useMemo, useRef, useState, type CSSProperties } from "react"
import { createRoot, type Root } from "react-dom/client"
import Moveable from "react-moveable"
import { useStopwatch, useTimer } from "react-timer-hook"
import { toast, ToastContainer } from "react-toastify"

import { Storage } from "@plasmohq/storage"
import { useStorage } from "@plasmohq/storage/hook"

import { AUTH_REFRESH_MS, AUTH_SESSION_STORAGE_KEY, getAuthSessionSnapshot, getVerifiedPremiumStatus } from "./auth"
import { FabPanelApp } from "./panel"
import {
  clampNumber,
  clearAnimatedBgUrl,
  CUSTOM_THEME_PREVIEW_EVENT,
  CUSTOM_THEMES_STORAGE_KEY,
  DDAY_WIDGET_STATE_STORAGE_KEY,
  DEFAULT_DDAY_WIDGET_STATE,
  DEFAULT_PHOTO_WIDGET_STATE,
  DEFAULT_STOPWATCH_WIDGET_STATE,
  DEFAULT_TIMER_WIDGET_STATE,
  DEFAULT_WIDGET_ENABLED,
  DEFAULT_WIDGET_INSTANCES,
  DEFAULT_WIDGET_LAYOUT,
  DEFAULT_WIDGET_MIN_SIZE,
  detectCurrentSite,
  FAB_OPEN_EVENT,
  isAnimatedBgUrl,
  isAnimatedCustomTheme,
  isAnimatedImage,
  MAX_FILE_BYTES,
  MODEL_ENABLED_STORAGE_KEY,
  PHOTO_WIDGET_STATE_STORAGE_KEY,
  sanitizeColor,
  sanitizeCustomBgOptions,
  sanitizeCustomBgUrl,
  SELECTED_CUSTOM_THEME_ID_STORAGE_KEY,
  SELECTED_THEME_STORAGE_KEY,
  STOPWATCH_WIDGET_STATE_STORAGE_KEY,
  THEME_HIDDEN_STORAGE_KEY,
  THEME_LOADING_EVENT,
  TIMER_WIDGET_STATE_STORAGE_KEY,
  WIDGET_ENABLED_STORAGE_KEY,
  WIDGET_FRAME_STORAGE_KEY,
  WIDGET_HIDDEN_STORAGE_KEY,
  WIDGET_INSTANCES_STORAGE_KEY,
  WIDGET_LAYOUT_PREVIEW_EVENT,
  WIDGET_LAYOUT_STORAGE_KEY,
  type CustomBgOptions,
  type CustomTheme,
  type DdayWidgetState,
  type ModelEnabledMap,
  type PhotoWidgetState,
  type SiteType,
  type StopwatchWidgetState,
  type TimerWidgetState,
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
    footer: "#thread-bottom-container > div:is(.mt-auto, .-mt-4) > div > div > div > div, .leading-none",
    elements: '[data-testid="use-case-prompt-chips"] button, .btn-secondary, .agent-turn, .user-message-bubble-color, .shadow-short-composer',
    darkClass: "html.dark"
  },
  gemini: {
    container: "body",
    header: "top-bar-actions",
    footer: ".capabilities-disclaimer p",
    elements: "model-response, .dual-response-panel, .user-query-bubble-with-background, .input-box-shadow",
    darkClass: "body.dark-theme"
  },
  claude: {
    container: "body",
    header: 'header, #main-content > div > div > main > div:first-child, .z-header, [data-testid="wiggle-controls-actions"]',
    footer: 'div[data-disclaimer="true"]',
    elements: 'li.inline-block button, .font-claude-response, div[data-user-message-bubble="true"], .\\!box-content',
    darkClass: 'html[data-mode="dark"]'
  },
  grok: {
    container: "body",
    header: ".from-surface-base",
    footer: "",
    elements: '[data-testid="assistant-message"], [data-testid="user-message"], .query-bar',
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

const t = (key: string, value?: string) => chrome.i18n.getMessage(key, value)

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
const TEXT_WIDGET_STATE_STORAGE_KEY = "text-widget-state"
const CUSTOM_THEME_WATCH_STORAGE_KEYS = [CUSTOM_THEMES_STORAGE_KEY, SELECTED_CUSTOM_THEME_ID_STORAGE_KEY]
let premiumCache: { checkedAt: number; value: boolean } | null = null

type FabPanelView = "theme" | "widget"

const WIDGET_LIST: Array<{
  key: WidgetKey
  labelKey: string
  icon: string
}> = [
    { key: "note", labelKey: "noteWidget", icon: "notepad-text" },
    { key: "todo", labelKey: "todoWidget", icon: "list-checks" },
    { key: "dday", labelKey: "ddayWidget", icon: "calendar-1" },
    { key: "timer", labelKey: "timerWidget", icon: "alarm-clock" },
    { key: "stopwatch", labelKey: "stopwatchWidget", icon: "timer" },
    { key: "photo", labelKey: "photoWidget", icon: "sticker" }
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
  window.dispatchEvent(new CustomEvent(THEME_LOADING_EVENT, { detail: { loading } }))
}

const getPremiumStatus = async ({
  forceRefresh = false,
  interactiveFallback = false
} = {}) => {
  if (!forceRefresh && premiumCache && Date.now() - premiumCache.checkedAt < AUTH_REFRESH_MS) {
    return { isPremium: premiumCache.value, isChecked: true }
  }

  const snapshot = await getAuthSessionSnapshot()

  try {
    const isPremium = await getVerifiedPremiumStatus(forceRefresh, interactiveFallback)
    const nextSnapshot = await getAuthSessionSnapshot()
    const hasVerifiedNewStatus =
      Boolean(nextSnapshot?.checkedAt) &&
      nextSnapshot?.checkedAt !== snapshot?.checkedAt

    if (
      !isPremium &&
      snapshot?.premiumStatus === "premium" &&
      nextSnapshot &&
      !hasVerifiedNewStatus
    ) {
      return { isPremium: false, isChecked: false }
    }
    premiumCache = { checkedAt: Date.now(), value: isPremium }
    return { isPremium, isChecked: true }
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
        pointer-events: none;
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
        display: flex;
        flex-direction: row-reverse;
        align-items: center;
        gap: 10px;
        pointer-events: auto;
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
        display: block;
        overflow: hidden;
        background-color: rgba(24, 24, 24, var(--decoai-surface-opacity, 0.8));
        border-radius: 16px;
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
      autoClose: 2000,
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
  const source = customThemes.find(({ id }) => id === selectedCustomThemeId) ?? customThemes[0]
  if (!source) return null
  const theme = clearAnimatedBgUrl(source)

  if (customThemes.length !== 1 || customThemes[0]?.id !== theme.id || theme !== source) {
    await localStorageInstance.set(CUSTOM_THEMES_STORAGE_KEY, [theme])
  }
  if (selectedCustomThemeId !== theme.id) {
    await localStorageInstance.set(SELECTED_CUSTOM_THEME_ID_STORAGE_KEY, theme.id)
  }

  return theme
}

const hasMultipleWidgets = (widgetItems: WidgetInstance[]) => {
  const retainedTypes = new Set<WidgetKey>()
  return widgetItems.some((item) => {
    if (retainedTypes.has(item.type)) return true
    retainedTypes.add(item.type)
    return false
  })
}

const normalizeCustomWidgets = (widgetItems: WidgetInstance[]) => {
  const retainedTypes = new Set<WidgetKey>()
  return widgetItems.filter((item) => {
    if (retainedTypes.has(item.type)) return false
    retainedTypes.add(item.type)
    return true
  })
}

const getSelectedCustomTheme = async (): Promise<{
  isPremium: boolean
  theme: CustomTheme | null
}> => {
  const customData = await localStorageInstance.getMany([
    CUSTOM_THEMES_STORAGE_KEY,
    SELECTED_CUSTOM_THEME_ID_STORAGE_KEY
  ])
  const customThemes = customData[CUSTOM_THEMES_STORAGE_KEY] as
    | CustomTheme[]
    | undefined
  const selectedCustomThemeId = customData[SELECTED_CUSTOM_THEME_ID_STORAGE_KEY] as string | undefined

  if (!Array.isArray(customThemes) || !selectedCustomThemeId) {
    return { isPremium: false, theme: null }
  }

  if (customThemePreview && customThemePreview.themeId === selectedCustomThemeId) {
    return { isPremium: false, theme: customThemePreview.theme }
  }

  const selectedTheme = customThemes.find((item) => item.id === selectedCustomThemeId) || null
  const hasAnimatedTheme = customThemes.some(isAnimatedCustomTheme)
  const needsPremium = customThemes.length > 1 || hasAnimatedTheme
  const premiumStatus = needsPremium ? await getPremiumStatus() : { isPremium: false, isChecked: false }

  if (premiumStatus.isPremium) return { isPremium: true, theme: selectedTheme }

  if (needsPremium) {
    if (!premiumStatus.isChecked) {
      return { isPremium: false, theme: selectedTheme }
    }

    const normalizedTheme = await normalizeCustomThemes(customThemes, selectedCustomThemeId)

    return {
      isPremium: false,
      theme: normalizedTheme
    }
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
  if (theme === "custom") return getCustomThemeData()
  if (cachedThemeKey === theme && cachedThemeData) return cachedThemeData

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
    y: clampNumber(frame.y, 0, Math.max(0, viewportHeight - height), 0),
    rotation: normalizeWidgetRotation(frame.rotation)
  }
}

const PHOTO_WIDGET_MIN_SIZE: WidgetSize = {
  width: 100,
  height: 100
}

const getInitialWidgetFrame = (index: number): WidgetFrame => {
  const viewportWidth = Math.max(document.documentElement.clientWidth, 320)
  const viewportHeight = Math.max(document.documentElement.clientHeight, 240)
  const width = Math.min(DEFAULT_WIDGET_MIN_SIZE.width, viewportWidth)
  const height = Math.min(DEFAULT_WIDGET_MIN_SIZE.height, viewportHeight)
  const maxX = Math.max(0, viewportWidth - width)
  const maxY = Math.max(0, viewportHeight - height)
  const x = Math.min(maxX, 300)
  const y = Math.min(maxY, index * 100 + 25)

  return { x, y, width, height, rotation: 0 }
}

const getWidgetTransform = (frame: WidgetFrame) =>
  `translate(${frame.x}px, ${frame.y}px) rotate(${normalizeWidgetRotation(frame.rotation)}deg)`

const normalizeWidgetRotation = (rotation: number) => {
  const normalized = rotation % 360
  return normalized < 0 ? normalized + 360 : normalized
}

const WIDGET_ROTATION_DEGREES = Array.from({ length: 25 }, (_, index) => index * 15)
const MAX_STOPWATCH_MILLISECONDS = 60 * 60 * 1000

const isWidgetDarkMode = () => {
  const currentSite = detectCurrentSite()
  if (!currentSite) return false
  return document.querySelector(SITE_SELECTORS[currentSite].darkClass) !== null
}

const getSyncedTimerSeconds = (state: TimerWidgetState) => {
  if (!state.timerRunning || !state.timerEndAt) {
    return Math.max(0, state.timerRemainingSeconds)
  }

  return Math.max(0, Math.ceil((state.timerEndAt - Date.now()) / 1000))
}

const getSyncedStopwatchMilliseconds = (state: StopwatchWidgetState) => {
  if (!state.stopwatchRunning || !state.stopwatchStartedAt) {
    return Math.max(0, state.stopwatchElapsedMilliseconds)
  }

  return Math.max(0, state.stopwatchElapsedMilliseconds + Date.now() - state.stopwatchStartedAt)
}

const offsetTimestamp = (milliseconds: number) => {
  const timestamp = new Date()
  timestamp.setMilliseconds(timestamp.getMilliseconds() + Math.max(0, milliseconds))
  return timestamp
}

const expiryTimestamp = (seconds: number) => {
  const timestamp = new Date()
  timestamp.setSeconds(timestamp.getSeconds() + Math.max(0, seconds))
  return timestamp
}

const getTimerDisplayParts = (timer: ReturnType<typeof useTimer>) => {
  const totalSeconds = Math.max(0, Math.floor(timer.totalMilliseconds / 1000))

  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60
  }
}

const getStopwatchMilliseconds = (
  stopwatch: ReturnType<typeof useStopwatch>
) => stopwatch.totalSeconds * 1000 + stopwatch.milliseconds

const resizePhotoWidgetImage = (file: File) =>
  new Promise<string | null>((resolve) => {
    const reader = new FileReader()
    reader.onerror = () => resolve(null)
    reader.onload = () => resolve(sanitizeCustomBgUrl(reader.result) || null)
    reader.readAsDataURL(file)
  })

const controlButton = (
  icon: string,
  onClick: () => void,
  disabled = false
) =>
  createElement(
    "button",
    {
      type: "button",
      className: "decoai-widget-control",
      disabled,
      onPointerDown: (e) => e.stopPropagation(),
      onPointerUp: (e) => e.stopPropagation(),
      onClick: (e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick()
      }
    },
    createElement(Icon, { icon, height: "50%", "aria-hidden": "true" })
  )

const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] }

type TodoItem = {
  checked: boolean
  text: string
}

const getTodoItems = (content?: JSONContent): TodoItem[] =>
  (content?.content || [])
    .flatMap((node) => node.type === "taskList" ? node.content || [] : [])
    .map((node) => ({
      checked: node.attrs?.checked === true,
      text: node.content?.[0]?.content?.[0]?.text || ""
    }))

const createTodoDoc = (items: TodoItem[]): JSONContent => ({
  type: "doc",
  content: items.length
    ? [
      {
        type: "taskList",
        content: items.map((item) => ({
          type: "taskItem",
          attrs: { checked: item.checked },
          content: [{ type: "paragraph", content: item.text ? [{ type: "text", text: item.text }] : [] }]
        }))
      }
    ]
    : EMPTY_DOC.content
})

const textWidgetButton = (
  icon: string,
  onClick: () => void,
  active = false
) =>
  createElement(
    "button",
    {
      type: "button",
      className: `decoai-text-tool${active ? " is-active" : ""}`,
      onPointerDown: (e) => e.stopPropagation(),
      onClick: (e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick()
      }
    },
    createElement(Icon, { icon, height: "50%", "aria-hidden": "true" })
  )

function NoteWidgetContent({ widgetId }: { widgetId: string }) {
  const [content, setContent] = useStorage<JSONContent>(
    `${TEXT_WIDGET_STATE_STORAGE_KEY}:${widgetId}`,
    EMPTY_DOC
  )
  const pendingContentRef = useRef<JSONContent | null>(null)
  const setContentRef = useRef(setContent)
  const saveTimeoutRef = useRef<number | null>(null)
  const scheduleSaveContent = (nextContent: JSONContent) => {
    pendingContentRef.current = nextContent
    if (saveTimeoutRef.current !== null) window.clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = window.setTimeout(() => {
      if (pendingContentRef.current) setContentRef.current(pendingContentRef.current)
      pendingContentRef.current = null
      saveTimeoutRef.current = null
    }, 250)
  }
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: t("place_noteWidget") })
    ],
    content: content || EMPTY_DOC,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { class: "decoai-text-editor" } },
    onUpdate: ({ editor }) => scheduleSaveContent(editor.getJSON())
  })

  React.useEffect(() => {
    if (!editor || !content) return
    if (JSON.stringify(editor.getJSON()) === JSON.stringify(content)) return

    editor.commands.setContent(content)
  }, [content, editor])

  React.useEffect(() => {
    setContentRef.current = setContent
  }, [setContent])

  React.useEffect(() => () => {
    if (saveTimeoutRef.current !== null) window.clearTimeout(saveTimeoutRef.current)
    if (pendingContentRef.current) setContentRef.current(pendingContentRef.current)
  }, [])

  return createElement(
    "div",
    {
      className: "decoai-note-widget",
      onPointerDown: (e) => e.stopPropagation()
    },
    createElement(EditorContent, { editor, className: "decoai-note-editor-wrap" }),
    createElement(
      "div",
      { className: "decoai-note-toolbar" },
      textWidgetButton("lucide:bold", () => editor?.chain().focus().toggleBold().run(), editor?.isActive("bold")),
      textWidgetButton("lucide:italic", () => editor?.chain().focus().toggleItalic().run(), editor?.isActive("italic")),
      textWidgetButton("lucide:underline", () => editor?.chain().focus().toggleUnderline().run(), editor?.isActive("underline")),
      textWidgetButton("lucide:strikethrough", () => editor?.chain().focus().toggleStrike().run(), editor?.isActive("strike")),
      textWidgetButton("lucide:list", () => editor?.chain().focus().toggleBulletList().run(), editor?.isActive("bulletList")),
      textWidgetButton("lucide:list-ordered", () => editor?.chain().focus().toggleOrderedList().run(), editor?.isActive("orderedList"))
    )
  )
}

function TodoWidgetContent({ widgetId }: { widgetId: string }) {
  const [inputValue, setInputValue] = useState("")
  const [content, setContent] = useStorage<JSONContent>(
    `${TEXT_WIDGET_STATE_STORAGE_KEY}:${widgetId}`,
    EMPTY_DOC
  )
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false
      }),
      ListKit.configure({
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        taskItem: { nested: true }
      })
    ],
    content: content || EMPTY_DOC,
    editable: false
  })
  const todoItems = getTodoItems(content)

  const setTodoItems = (items: TodoItem[]) => {
    const nextContent = createTodoDoc(items)
    setContent(nextContent)
    editor?.commands.setContent(nextContent)
  }

  const addTodo = () => {
    const text = inputValue.trim()
    if (!text) return
    setTodoItems([...todoItems, { checked: false, text }])
    setInputValue("")
  }

  return createElement(
    "div",
    {
      className: "decoai-todo-widget",
      onPointerDown: (e) => e.stopPropagation()
    },
    createElement(
      "div",
      { className: "decoai-todo-input-row" },
      createElement("input", {
        className: "decoai-todo-input",
        value: inputValue,
        placeholder: t("place_todoWidget"),
        onChange: (e) => setInputValue(e.currentTarget.value),
        onKeyDown: (e) => {
          e.stopPropagation()
          if (e.key === "Enter") addTodo()
        },
        onKeyUp: (e) => e.stopPropagation()
      }),
      createElement(
        "button",
        {
          type: "button",
          className: "decoai-todo-add",
          disabled: inputValue.trim().length === 0,
          onClick: (e) => {
            e.preventDefault()
            e.stopPropagation()
            addTodo()
          }
        },
        createElement(Icon, { icon: "lucide:pencil", height: "75%", "aria-hidden": "true" })
      )
    ),
    createElement(
      "div",
      { className: "decoai-todo-list" },
      todoItems.map((item, index) =>
        createElement(
          "div",
          { key: `${index}:${item.text}`, className: "decoai-todo-item" },
          createElement("label",
            { className: "decoai-todo-check-label" },
            createElement("input", {
              type: "checkbox",
              className: "decoai-todo-checkbox",
              checked: item.checked,
              onChange: (e) => {
                const nextItems = [...todoItems]
                nextItems[index] = { ...item, checked: e.currentTarget.checked }
                setTodoItems(nextItems)
              }
            }),
            createElement(
              "span",
              { className: item.checked ? "is-done" : "" },
              item.text
            ),
          ),
          createElement(
            "button",
            {
              type: "button",
              className: "decoai-todo-delete",
              onClick: (e) => {
                e.preventDefault()
                e.stopPropagation()
                setTodoItems(todoItems.filter((_, itemIndex) => itemIndex !== index))
              }
            },
            createElement(Icon, { icon: "lucide:eraser", height: "75%", "aria-hidden": "true" })
          )
        )
      )
    )
  )
}

const getDdayLabel = (targetDate: Date, today: Date) => {
  const dayDiff = differenceInCalendarDays(startOfDay(targetDate), startOfDay(today))

  if (dayDiff === 0) return "D-day"
  if (dayDiff > 0) return `D-${dayDiff}`
  return `D+${Math.abs(dayDiff)}`
}

function DdayWidgetContent({ widgetId }: { widgetId: string }) {
  const [state, setState] = useStorage<DdayWidgetState>(
    `${DDAY_WIDGET_STATE_STORAGE_KEY}:${widgetId}`,
    DEFAULT_DDAY_WIDGET_STATE
  )
  const [today, setToday] = useState(() => new Date())
  const ddayState = { ...DEFAULT_DDAY_WIDGET_STATE, ...state }
  const parsedTargetDate = ddayState.targetDate ? parseISO(ddayState.targetDate) : null
  const targetDate = parsedTargetDate ?? today
  const targetDateValue = parsedTargetDate ? ddayState.targetDate : formatISO(today, { representation: "date" })

  React.useEffect(() => {
    const intervalId = window.setInterval(() => {
      setToday(new Date())
    }, 60 * 1000)

    return () => window.clearInterval(intervalId)
  }, [])

  return createElement(
    "div",
    {
      className: "decoai-dday-widget",
      onPointerDown: (e) => e.stopPropagation()
    },
    createElement(
      "div",
      { className: "decoai-dday-display" },
      getDdayLabel(targetDate, today)
    ),
    createElement(
      "label",
      {
        className: "decoai-widget-control",
        style: { width: "max(32px, 16cqmin)", height: "max(32px, 16cqmin)" },
        onPointerDown: (e) => e.stopPropagation(),
        onPointerUp: (e) => e.stopPropagation(),
        onClick: (e) => e.stopPropagation()
      },
      createElement(Icon, { icon: "lucide:calendar-days", height: "75%", "aria-hidden": "true" }),
      createElement("input", {
        type: "date",
        className: "decoai-dday-input",
        value: targetDateValue,
        onChange: (e) => setState({ targetDate: e.currentTarget.value }),
        onClick: (e) => e.stopPropagation(),
        onPointerDown: (e) => e.stopPropagation(),
        onPointerUp: (e) => e.stopPropagation()
      })
    )
  )
}

function TimerWidgetContent({ widgetId }: { widgetId: string }) {
  const [state, setState] = useStorage<TimerWidgetState>(
    `${TIMER_WIDGET_STATE_STORAGE_KEY}:${widgetId}`,
    DEFAULT_TIMER_WIDGET_STATE
  )
  const timerState = { ...DEFAULT_TIMER_WIDGET_STATE, ...state }
  const savedTimerRemaining = getSyncedTimerSeconds(timerState)
  const timer = useTimer({
    expiryTimestamp: expiryTimestamp(savedTimerRemaining),
    autoStart: timerState.timerRunning && savedTimerRemaining > 0,
    interval: 10,
    onExpire: () => {
      setState((prev) => ({
        ...DEFAULT_TIMER_WIDGET_STATE,
        ...prev,
        timerEndAt: null,
        timerRemainingSeconds: 0,
        timerRunning: false
      }))
      chrome.runtime.sendMessage({ type: "TIMER_EXPIRED", widgetId })
    }
  })

  React.useEffect(() => {
    const nextRemaining = getSyncedTimerSeconds(timerState)
    timer.restart(expiryTimestamp(nextRemaining), timerState.timerRunning && nextRemaining > 0)
  }, [
    timerState.timerEndAt,
    timerState.timerRemainingSeconds,
    timerState.timerRunning
  ])

  const timerDisplay = getTimerDisplayParts(timer)

  const setTimerTimePart = (
    part: "hours" | "minutes" | "seconds",
    value: string
  ) => {
    const nextParts = { ...timerDisplay, [part]: clampNumber(value, 0, 59, timer[part]) }
    const nextSeconds = nextParts.hours * 3600 + nextParts.minutes * 60 + nextParts.seconds
    const shouldRun = Boolean(timer.isRunning && nextSeconds > 0)

    timer.restart(expiryTimestamp(nextSeconds), shouldRun)
    setState((prev) => ({
      ...DEFAULT_TIMER_WIDGET_STATE,
      ...prev,
      timerDurationSeconds: nextSeconds,
      timerRemainingSeconds: nextSeconds,
      timerEndAt: shouldRun ? Date.now() + nextSeconds * 1000 : null,
      timerRunning: shouldRun
    }))
  }

  const startTimer = () => {
    const seconds = timer.totalSeconds || timerState.timerDurationSeconds
    if (seconds <= 0) return

    timer.restart(expiryTimestamp(seconds), true)
    setState((prev) => ({
      ...DEFAULT_TIMER_WIDGET_STATE,
      ...prev,
      timerRemainingSeconds: seconds,
      timerEndAt: Date.now() + seconds * 1000,
      timerRunning: true
    }))
  }

  const pauseTimer = () => {
    timer.pause()
    setState((prev) => ({
      ...DEFAULT_TIMER_WIDGET_STATE,
      ...prev,
      timerEndAt: null,
      timerRemainingSeconds: timer.totalSeconds,
      timerRunning: false
    }))
  }

  const resetTimer = () => {
    const durationSeconds = timerState.timerDurationSeconds || DEFAULT_TIMER_WIDGET_STATE.timerDurationSeconds

    timer.restart(expiryTimestamp(durationSeconds), false)
    setState((prev) => ({
      ...DEFAULT_TIMER_WIDGET_STATE,
      ...prev,
      timerEndAt: null,
      timerRemainingSeconds: durationSeconds,
      timerRunning: false
    }))
  }

  const changeTimerTimePart = (
    part: "hours" | "minutes" | "seconds",
    delta: number
  ) => {
    const currentValue = timerDisplay[part]
    const nextValue = (currentValue + delta + 60) % 60

    setTimerTimePart(part, String(nextValue))
  }

  const timeInput = (
    part: "hours" | "minutes" | "seconds",
    value: number
  ) => {
    const stepButton = (icon: string, delta: number) =>
      createElement(
        "button",
        {
          type: "button",
          className: "decoai-time-step",
          disabled: timer.isRunning,
          onPointerDown: (e) => e.stopPropagation(),
          onPointerUp: (e) => e.stopPropagation(),
          onClick: (e) => {
            e.preventDefault()
            e.stopPropagation()
            changeTimerTimePart(part, delta)
          }
        },
        createElement(Icon, { icon, height: "50%", "aria-hidden": "true" })
      )

    return createElement(
      "div",
      { className: "decoai-time-stepper" },
      stepButton("lucide:chevron-up", 1),
      createElement("input", {
        className: "decoai-time-input",
        type: "text",
        min: 0,
        max: 59,
        value: String(value).padStart(2, "0"),
        disabled: timer.isRunning,
        onChange: (e) => setTimerTimePart(part, e.target.value),
        onClick: (e) => e.currentTarget.select()
      }),
      stepButton("lucide:chevron-down", -1)
    )
  }

  return createElement(
    "div",
    {
      className: "decoai-time-widget",
      onPointerDown: (e) => e.stopPropagation()
    },
    createElement(
      "div",
      { className: "decoai-time-row" },
      createElement(
        "div",
        { className: "decoai-time-display" },
        timeInput("hours", timerDisplay.hours),
        createElement("span", null, ":"),
        timeInput("minutes", timerDisplay.minutes),
        createElement("span", null, ":"),
        timeInput("seconds", timerDisplay.seconds)
      ),
      createElement(
        "div",
        { className: "decoai-widget-controls" },
        timer.isRunning
          ? controlButton("lucide:pause", pauseTimer)
          : controlButton("lucide:play", startTimer, timer.totalSeconds <= 0),
        controlButton("lucide:rotate-ccw", resetTimer)
      )
    )
  )
}

function StopwatchWidgetContent({ widgetId }: { widgetId: string }) {
  const [state, setState] = useStorage<StopwatchWidgetState>(
    `${STOPWATCH_WIDGET_STATE_STORAGE_KEY}:${widgetId}`,
    DEFAULT_STOPWATCH_WIDGET_STATE
  )
  const stopwatchState = { ...DEFAULT_STOPWATCH_WIDGET_STATE, ...state }
  const savedElapsedMilliseconds = getSyncedStopwatchMilliseconds(stopwatchState)
  const shouldResetSavedStopwatch = savedElapsedMilliseconds >= MAX_STOPWATCH_MILLISECONDS
  const stopwatchExceedNotifiedRef = React.useRef(false)
  const stopwatch = useStopwatch({
    autoStart: stopwatchState.stopwatchRunning && !shouldResetSavedStopwatch,
    interval: 10,
    offsetTimestamp: offsetTimestamp(shouldResetSavedStopwatch ? 0 : savedElapsedMilliseconds)
  })

  const resetStopwatch = () => {
    stopwatch.reset(offsetTimestamp(0), false)
    setState((prev) => ({
      ...DEFAULT_STOPWATCH_WIDGET_STATE,
      ...prev,
      stopwatchElapsedMilliseconds: 0,
      stopwatchStartedAt: null,
      stopwatchRunning: false
    }))
  }

  React.useEffect(() => {
    if (shouldResetSavedStopwatch) {
      resetStopwatch()
      return
    }

    stopwatch.reset(
      offsetTimestamp(getSyncedStopwatchMilliseconds(stopwatchState)),
      stopwatchState.stopwatchRunning
    )
  }, [
    stopwatchState.stopwatchElapsedMilliseconds,
    stopwatchState.stopwatchRunning,
    stopwatchState.stopwatchStartedAt,
    shouldResetSavedStopwatch
  ])

  React.useEffect(() => {
    const elapsedMilliseconds = getStopwatchMilliseconds(stopwatch)
    if (elapsedMilliseconds < MAX_STOPWATCH_MILLISECONDS) {
      stopwatchExceedNotifiedRef.current = false
      return
    }

    if (!stopwatchExceedNotifiedRef.current && stopwatch.isRunning) {
      stopwatchExceedNotifiedRef.current = true
      chrome.runtime.sendMessage({ type: "STOPWATCH_EXCEED", widgetId })
      resetStopwatch()
    }
  }, [stopwatch.totalSeconds, stopwatch.milliseconds, stopwatch.isRunning])

  const startStopwatch = () => {
    const elapsedMilliseconds = getStopwatchMilliseconds(stopwatch)

    stopwatch.start()
    setState((prev) => ({
      ...DEFAULT_STOPWATCH_WIDGET_STATE,
      ...prev,
      stopwatchElapsedMilliseconds: elapsedMilliseconds,
      stopwatchStartedAt: Date.now(),
      stopwatchRunning: true
    }))
  }

  const pauseStopwatch = () => {
    const elapsedMilliseconds = getStopwatchMilliseconds(stopwatch)

    stopwatch.pause()
    setState((prev) => ({
      ...DEFAULT_STOPWATCH_WIDGET_STATE,
      ...prev,
      stopwatchElapsedMilliseconds: elapsedMilliseconds,
      stopwatchStartedAt: null,
      stopwatchRunning: false
    }))
  }

  const timeInput = (value: number) =>
    createElement("input", {
      className: "decoai-time-input",
      type: "number",
      value: String(value).padStart(2, "0"),
      disabled: true
    })

  return createElement(
    "div",
    {
      className: "decoai-time-widget",
      onPointerDown: (e) => e.stopPropagation()
    },
    createElement(
      "div",
      { className: "decoai-time-row" },
      createElement(
        "div",
        { className: "decoai-time-display" },
        timeInput(Math.floor(stopwatch.totalSeconds / 60)),
        createElement("span", null, ":"),
        timeInput(stopwatch.seconds),
        createElement("span", null, "."),
        timeInput(Math.floor(stopwatch.milliseconds / 10))
      ),
      createElement(
        "div",
        { className: "decoai-widget-controls" },
        stopwatch.isRunning
          ? controlButton("lucide:pause", pauseStopwatch)
          : controlButton("lucide:play", startStopwatch),
        controlButton("lucide:rotate-ccw", resetStopwatch)
      )
    )
  )
}

function PhotoWidgetContent({
  widgetId,
  isRemovingBG = false,
}: {
  widgetId: string
  isRemovingBG?: boolean
}) {
  const uploadRef = useRef<HTMLInputElement>(null)
  const [photoState, setPhotoState] = useStorage<PhotoWidgetState>(
    {
      key: `${PHOTO_WIDGET_STATE_STORAGE_KEY}:${widgetId}`,
      instance: localStorageInstance
    },
    DEFAULT_PHOTO_WIDGET_STATE
  )
  const imageUrl = sanitizeCustomBgUrl(photoState?.imageUrl)

  const uploadImage = async (file?: File) => {
    if (!file) {
      toast.error(t("error_fileRequired"))
      return
    }
    if (!file.type.startsWith("image/")) {
      toast.error(t("error_fileInvalid", "IMG"))
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error(t("error_fileExceed"))
      return
    }

    const animated = await isAnimatedImage(file)
    if (animated) {
      const { isPremium, isChecked } = await getPremiumStatus()
      if (!isPremium) {
        if (isChecked) toast.error(t("pro_animatedSticker"))
        return
      }
    }
    const nextImageUrl = await resizePhotoWidgetImage(file)
    if (!nextImageUrl) return
    setPhotoState({ imageUrl: nextImageUrl })
  }

  const uploadButton = createElement(
    "button",
    {
      type: "button",
      className: "decoai-widget-control decoai-photo-widget-upload",
      onPointerDown: (event) => event.stopPropagation(),
      onPointerUp: (event) => event.stopPropagation(),
      onClick: (event) => {
        event.preventDefault()
        event.stopPropagation()
        uploadRef.current?.click()
      }
    },
    createElement(Icon, { icon: "lucide:image-up", height: "50%", "aria-hidden": "true" })
  )

  return createElement(
    "div",
    { className: "decoai-photo-widget" },
    createElement("input", {
      ref: uploadRef,
      type: "file",
      accept: "image/*",
      onChange: (event) => {
        void uploadImage(event.currentTarget.files?.[0])
        event.currentTarget.value = ""
      },
      style: { display: "none" }
    }),
    imageUrl
      ? createElement(
        React.Fragment,
        null,
        createElement("img", {
          className: "decoai-photo-widget-image",
          src: imageUrl,
          draggable: false
        }),
        !isRemovingBG
          ? createElement(
            "div",
            { className: "decoai-photo-widget-upload-overlay" },
            uploadButton
          )
          : null
      )
      : createElement(
        "div",
        { className: "decoai-photo-widget-placeholder" },
        uploadButton
      )
  )
}

function WidgetOverlayApp() {
  const [previewLayout, setPreviewLayout] = useState<WidgetLayoutOptions | null>(null)
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
  const [titleEditingWidgetId, setTitleEditingWidgetId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState("")
  const [removingBGWidgetIds, setRemovingBGWidgetIds] = useState<Record<string, boolean>>({})
  const [selectedTarget, setSelectedTarget] = useState<HTMLDivElement | null>(null)
  const widgetRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const removeBGToastIdsRef = useRef<Record<string, ReturnType<typeof toast.loading>>>({})
  const liveFrameRef = useRef<Partial<WidgetFrameMap>>({})
  const interactionStartFrameRef = useRef<WidgetFrame | null>(null)
  const layout = { ...DEFAULT_WIDGET_LAYOUT, ...(previewLayout || layoutOptions) }
  const visibleWidgetItems = useMemo(
    () => (widgetItems || DEFAULT_WIDGET_INSTANCES).filter(
      (item) => (enabledMap?.[item.type] ?? DEFAULT_WIDGET_ENABLED[item.type]) !== false
    ),
    [enabledMap, widgetItems]
  )
  const frames = useMemo(
    () =>
      visibleWidgetItems.reduce(
        (nextFrames, item, index) => {
          const fallback = getInitialWidgetFrame(index)
          nextFrames[item.id] = clampWidgetFrameToViewport(
            { ...fallback, ...frameMap?.[item.id] },
            item.type === "photo" ? PHOTO_WIDGET_MIN_SIZE : DEFAULT_WIDGET_MIN_SIZE
          )
          return nextFrames
        },
        {} as WidgetFrameMap
      ),
    [frameMap, visibleWidgetItems]
  )
  React.useLayoutEffect(() => {
    setSelectedTarget(editingWidgetId ? widgetRefs.current[editingWidgetId] ?? null : null)
  }, [editingWidgetId, visibleWidgetItems])
  const selectedWidget = visibleWidgetItems.find((item) => item.id === editingWidgetId)

  React.useEffect(() => {
    const items = widgetItems || DEFAULT_WIDGET_INSTANCES

    void (async () => {
      const removablePhotoWidgetIds: string[] = []

      for (const item of items) {
        if (item.type !== "photo") continue

        const photoState = await localStorageInstance.get<PhotoWidgetState>(
          `${PHOTO_WIDGET_STATE_STORAGE_KEY}:${item.id}`
        )
        if (isAnimatedBgUrl(photoState?.imageUrl || "")) removablePhotoWidgetIds.push(item.id)
      }

      if (!hasMultipleWidgets(items) && removablePhotoWidgetIds.length === 0) return

      const premiumStatus = await getPremiumStatus()
      if (premiumStatus.isPremium || !premiumStatus.isChecked) return

      const set = new Set(removablePhotoWidgetIds)
      const normalizedItems = normalizeCustomWidgets(items).filter((item) => !set.has(item.id))

      setWidgetItems(normalizedItems)

      if (removablePhotoWidgetIds.length > 0) {
        setFrameMap((prev) => {
          const nextFrameMap = { ...(prev || {}) }
          removablePhotoWidgetIds.forEach((id) => delete nextFrameMap[id])
          return nextFrameMap
        })
        removablePhotoWidgetIds.forEach((id) => {
          void localStorageInstance.remove(`${PHOTO_WIDGET_STATE_STORAGE_KEY}:${id}`)
        })
        toast.error(t("pro_animatedSticker"), { toastId: "normalizeSticker" })
      }
    })()
  }, [setFrameMap, setWidgetItems, widgetItems])

  React.useEffect(() => {
    const onWidgetLayoutPreview = (event: Event) => {
      const customEvent = event as CustomEvent<WidgetLayoutOptions | null>
      setPreviewLayout(customEvent.detail)
    }
    window.addEventListener(WIDGET_LAYOUT_PREVIEW_EVENT, onWidgetLayoutPreview)
    return () =>
      window.removeEventListener(WIDGET_LAYOUT_PREVIEW_EVENT, onWidgetLayoutPreview)
  }, [])

  React.useEffect(() => {
    const updateDarkMode = () => setIsDarkMode(isWidgetDarkMode())
    const observer = new MutationObserver(updateDarkMode)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-mode"] })
    if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ["class"] })

    updateDarkMode()
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    const onDocumentPointerDown = (event: PointerEvent) => {
      if (!editingWidgetId) return
      const target = event.target as Element | null
      if (target?.closest(".decoai-widget-card") || target?.closest(".moveable-control-box")) return
      setEditingWidgetId(null)
    }
    document.addEventListener("pointerdown", onDocumentPointerDown, { capture: true })
    return () =>
      document.removeEventListener("pointerdown", onDocumentPointerDown, true)
  }, [editingWidgetId])

  const getWidgetStyle = (item: WidgetInstance): CSSProperties => {
    const frame = frames[item.id]
    const opacity = clampNumber(layout.opacity, 0, 1, 0.8)
    const textColor = layout.textColor
    const accentColor = layout.accentColor
    const backgroundColor = layout.backgroundColor || (
      isDarkMode ? `rgba(24, 24, 24, ${opacity})` : `rgba(255, 255, 255, ${opacity})`
    )

    return {
      position: "absolute",
      left: 0,
      top: 0,
      width: frame.width,
      height: frame.height,
      transform: getWidgetTransform(frame),
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
      zIndex: editingWidgetId === item.id ? 2 : 1,
      willChange: "transform, width, height"
    } as CSSProperties
  }

  const getWidgetMinSize = (id: string | null): WidgetSize => {
    const item = visibleWidgetItems.find((widget) => widget.id === id)
    return item?.type === "photo" ? PHOTO_WIDGET_MIN_SIZE : DEFAULT_WIDGET_MIN_SIZE
  }

  const persistLiveFrame = (id: string | null) => {
    if (!id || !liveFrameRef.current[id]) return
    const nextFrame = liveFrameRef.current[id] as WidgetFrame
    setFrameMap((prev) => ({
      ...prev,
      [id]: clampWidgetFrameToViewport(nextFrame, getWidgetMinSize(id))
    }))
  }

  const addWidget = async (item: WidgetInstance) => {
    const { isPremium, isChecked } = await getPremiumStatus()
    if (!isPremium) {
      if (isChecked) toast.error(t("pro_widgetLimit"))
      return
    }

    const copiedId = `${item.type}-${crypto.randomUUID()}`
    const sourceFrame = frames[item.id]
    const widgetMeta = WIDGET_LIST.find((widget) => widget.key === item.type)
    setWidgetItems((prev) =>
      [
        ...(prev || DEFAULT_WIDGET_INSTANCES),
        {
          id: copiedId,
          type: item.type,
          name: t(widgetMeta?.labelKey)
        }
      ]
    )
    if (sourceFrame) {
      setFrameMap((prev) => ({
        ...(prev || {}),
        [copiedId]: { ...sourceFrame, x: sourceFrame.x + 32, y: sourceFrame.y + 32 }
      }))
    }
    setEditingWidgetId(copiedId)
    setTitleEditingWidgetId(null)
  }

  const deleteWidget = (item: WidgetInstance) => {
    setWidgetItems((prev) => (prev || DEFAULT_WIDGET_INSTANCES).filter((widget) => widget.id !== item.id))
    setFrameMap((prev) => {
      const { [item.id]: _removed, ...nextFrameMap } = prev || {}
      return nextFrameMap
    })
    const stateKey = getWidgetStateKey(item)
    if (stateKey) {
      const stateStorage = item.type === "photo" ? localStorageInstance : storage
      void stateStorage.remove(stateKey)
    }
    if (item.type === "photo") {
      const toastId = removeBGToastIdsRef.current[item.id]
      if (toastId) {
        toast.dismiss(toastId)
        delete removeBGToastIdsRef.current[item.id]
      }
      setRemovingBGWidgetIds((prev) => {
        const { [item.id]: _removed, ...next } = prev
        return next
      })
    }
    if (editingWidgetId === item.id) setEditingWidgetId(null)
    if (titleEditingWidgetId === item.id) setTitleEditingWidgetId(null)
  }

  const getWidgetStateKey = (item: WidgetInstance) => {
    switch (item.type) {
      case "note":
      case "todo":
        return `${TEXT_WIDGET_STATE_STORAGE_KEY}:${item.id}`
      case "dday":
        return `${DDAY_WIDGET_STATE_STORAGE_KEY}:${item.id}`
      case "timer":
        return `${TIMER_WIDGET_STATE_STORAGE_KEY}:${item.id}`
      case "stopwatch":
        return `${STOPWATCH_WIDGET_STATE_STORAGE_KEY}:${item.id}`
      case "photo":
        return `${PHOTO_WIDGET_STATE_STORAGE_KEY}:${item.id}`
      default:
        return null
    }
  }

  const updateWidgetName = (id: string, name: string) => {
    setWidgetItems((prev) => (prev || DEFAULT_WIDGET_INSTANCES).map((item) =>
      item.id === id ? { ...item, name } : item)
    )
  }

  const onRemoveBGClick = async (item: WidgetInstance) => {
    if (removingBGWidgetIds[item.id]) return

    const photoState = await localStorageInstance.get<PhotoWidgetState>(
      `${PHOTO_WIDGET_STATE_STORAGE_KEY}:${item.id}`
    )
    const imageUrl = sanitizeCustomBgUrl(photoState?.imageUrl)
    if (!imageUrl) {
      toast.error(t("error_fileRequired"))
      return
    }

    const { isPremium, isChecked } = await getPremiumStatus()
    if (!isPremium) {
      if (isChecked) toast.error(t("pro_removeBG"))
      return
    }

    const toastId = toast.loading(t("loading_removeBG"))
    removeBGToastIdsRef.current[item.id] = toastId
    setRemovingBGWidgetIds((prev) => ({ ...prev, [item.id]: true }))

    try {
      const result = await new Promise<string>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "REMOVE_BACKGROUND_IMAGE", imageUrl },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message))
              return
            }
            if (!response?.success) {
              reject(new Error(response?.error || "Failed to remove background"))
              return
            }
            resolve(response.dataUrl)
          }
        )
      })

      const latestPhotoState = await localStorageInstance.get<PhotoWidgetState>(
        `${PHOTO_WIDGET_STATE_STORAGE_KEY}:${item.id}`
      )
      if (!latestPhotoState) return

      await localStorageInstance.set(`${PHOTO_WIDGET_STATE_STORAGE_KEY}:${item.id}`, { imageUrl: result })

      toast.update(toastId, {
        render: t("success_removeBG"),
        type: "success",
        isLoading: false,
        autoClose: null,
        closeOnClick: null
      })
    } catch {
      const latestPhotoState = await localStorageInstance.get<PhotoWidgetState>(
        `${PHOTO_WIDGET_STATE_STORAGE_KEY}:${item.id}`
      )
      if (!latestPhotoState) return

      toast.update(toastId, {
        render: t("error_removeBG"),
        type: "error",
        isLoading: false,
        autoClose: null,
        closeOnClick: null
      })
    }
    finally {
      delete removeBGToastIdsRef.current[item.id]
      setRemovingBGWidgetIds((prev) => {
        const { [item.id]: _removed, ...next } = prev
        return next
      })
    }
  }

  const startTitleEditing = (item: WidgetInstance) => {
    const widgetMeta = WIDGET_LIST.find((widget) => widget.key === item.type)
    setEditingWidgetId(item.id)
    setEditingTitle(item.name ?? t(widgetMeta?.labelKey))
    setTitleEditingWidgetId(item.id)
  }

  const finishTitleEditing = (item: WidgetInstance) => {
    updateWidgetName(item.id, editingTitle)
    setTitleEditingWidgetId(null)
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
    visibleWidgetItems.map((item) => {
      const widgetMeta = WIDGET_LIST.find((widget) => widget.key === item.type)
      if (!widgetMeta) return null
      const isPhotoWidget = item.type === "photo"
      const isRemovingBG = isPhotoWidget && Boolean(removingBGWidgetIds[item.id])
      const isTitleEditing = titleEditingWidgetId === item.id
      return createElement(
        "div",
        {
          key: item.id,
          ref: (node: HTMLDivElement | null) => widgetRefs.current[item.id] = node,
          className: `decoai-widget-card${isPhotoWidget ? " decoai-widget-card-photo" : ""}`,
          onPointerDown: () => setEditingWidgetId(item.id),
          onClick: (e) => {
            e.stopPropagation()
            setEditingWidgetId(item.id)
          },
          style: getWidgetStyle(item)
        },
        createElement(
          "div",
          {
            className: "decoai-widget-card__header",
            style: {
              height: 32,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 10px"
            }
          },
          !isPhotoWidget
            ? createElement(Icon, {
              icon: `lucide:${widgetMeta.icon}`,
              height: 16,
              "aria-hidden": "true"
            }) : null,
          !isPhotoWidget
            ? isTitleEditing
              ? createElement("input", {
                autoFocus: true,
                type: "text",
                value: editingTitle,
                maxLength: 20,
                spellCheck: false,
                autoComplete: "off",
                onChange: (e) => setEditingTitle(e.target.value.slice(0, 20)),
                onBlur: () => finishTitleEditing(item),
                onPointerDown: (e) => e.stopPropagation(),
                onKeyDown: (e) => {
                  e.stopPropagation()
                  if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur()
                },
                onKeyUp: (e) => e.stopPropagation(),
                style: {
                  flex: 1,
                  width: 0,
                  minWidth: 0,
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
              : createElement(
                "div",
                {
                  style: {
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    userSelect: "none"
                  }
                },
                item.name ?? t(widgetMeta.labelKey)
              )
            : null,
          createElement(
            "div",
            { className: "decoai-widget-card__actions" },
            createElement(
              "button",
              {
                type: "button",
                className: "decoai-widget-card__action decoai-widget-card__edit",
                style: isRemovingBG ? { pointerEvents: "none" } : undefined,
                onPointerDown: (e) => e.stopPropagation(),
                onPointerUp: (e) => e.stopPropagation(),
                onClick: (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  isPhotoWidget ? void onRemoveBGClick(item) : startTitleEditing(item)
                }
              },
              createElement(Icon, {
                icon: isRemovingBG ? "line-md:loading-twotone-loop" : `lucide:${isPhotoWidget ? "sparkles" : "square-pen"}`,
                height: 16,
                "aria-hidden": "true"
              })
            ),
            createElement(
              "button",
              {
                type: "button",
                className: "decoai-widget-card__action decoai-widget-card__add",
                onPointerDown: (e) => e.stopPropagation(),
                onPointerUp: (e) => e.stopPropagation(),
                onClick: (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  void addWidget(item)
                }
              },
              createElement(Icon, { icon: "lucide:square-plus", height: 16, "aria-hidden": "true" })
            ),
            createElement(
              "button",
              {
                type: "button",
                className: "decoai-widget-card__action decoai-widget-card__delete",
                onPointerDown: (e) => e.stopPropagation(),
                onPointerUp: (e) => e.stopPropagation(),
                onClick: (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  deleteWidget(item)
                }
              },
              createElement(Icon, { icon: "lucide:trash-2", height: 16, "aria-hidden": "true" })
            )
          )
        ),
        item.type === "note" ? createElement(NoteWidgetContent, { widgetId: item.id }) : null,
        item.type === "todo" ? createElement(TodoWidgetContent, { widgetId: item.id }) : null,
        item.type === "dday" ? createElement(DdayWidgetContent, { widgetId: item.id }) : null,
        item.type === "timer" ? createElement(TimerWidgetContent, { widgetId: item.id }) : null,
        item.type === "stopwatch" ? createElement(StopwatchWidgetContent, { widgetId: item.id }) : null,
        item.type === "photo" ? createElement(PhotoWidgetContent, { widgetId: item.id, isRemovingBG }) : null
      )
    }),
    createElement(Moveable, {
      target: selectedTarget,
      draggable: true,
      resizable: true,
      rotatable: selectedWidget?.type === "photo",
      snapRotationDegrees: WIDGET_ROTATION_DEGREES,
      snapRotationThreshold: 4,
      checkInput: true,
      snappable: true,
      elementGuidelines: Object.entries(widgetRefs.current)
        .filter(([id, node]) => id !== editingWidgetId && node)
        .map(([, node]) => node as HTMLDivElement),
      isDisplaySnapDigit: false,
      origin: false,
      bounds: {
        left: 0,
        top: 0,
        right: Math.max(document.documentElement.clientWidth, 320),
        bottom: Math.max(document.documentElement.clientHeight, 240)
      },
      onDragStart: () => interactionStartFrameRef.current = editingWidgetId ? frames[editingWidgetId] : null,
      onDrag: (event) => {
        if (!editingWidgetId) return
        const frame = interactionStartFrameRef.current || frames[editingWidgetId]
        const [deltaX, deltaY] = event.beforeDist
        const nextFrame = clampWidgetFrameToViewport(
          {
            ...frame,
            x: frame.x + deltaX,
            y: frame.y + deltaY
          },
          getWidgetMinSize(editingWidgetId)
        )
        event.target.style.transform = getWidgetTransform(nextFrame)
        liveFrameRef.current[editingWidgetId] = nextFrame
      },
      onDragEnd: () => {
        persistLiveFrame(editingWidgetId)
        interactionStartFrameRef.current = null
      },
      onResizeStart: (event) => {
        interactionStartFrameRef.current = editingWidgetId ? frames[editingWidgetId] : null
        const viewportWidth = Math.max(document.documentElement.clientWidth, 320)
        const viewportHeight = Math.max(document.documentElement.clientHeight, 240)
        const minSize = getWidgetMinSize(editingWidgetId)
        event.setMin([
          Math.min(minSize.width, viewportWidth),
          Math.min(minSize.height, viewportHeight)
        ])
        event.setMax([viewportWidth, viewportHeight])
      },
      onResize: (event) => {
        if (!editingWidgetId) return
        const frame = interactionStartFrameRef.current || frames[editingWidgetId]
        const [deltaX, deltaY] = event.drag.beforeDist
        const nextFrame = clampWidgetFrameToViewport(
          {
            ...frame,
            x: frame.x + deltaX,
            y: frame.y + deltaY,
            width: event.width,
            height: event.height
          },
          getWidgetMinSize(editingWidgetId)
        )
        event.target.style.width = `${nextFrame.width}px`
        event.target.style.height = `${nextFrame.height}px`
        event.target.style.transform = getWidgetTransform(nextFrame)
        liveFrameRef.current[editingWidgetId] = nextFrame
      },
      onResizeEnd: () => {
        persistLiveFrame(editingWidgetId)
        interactionStartFrameRef.current = null
      },
      onRotateStart: () => {
        interactionStartFrameRef.current = editingWidgetId ? frames[editingWidgetId] : null
      },
      onRotate: (event) => {
        if (!editingWidgetId) return
        const frame = interactionStartFrameRef.current || frames[editingWidgetId]
        const nextFrame = { ...frame, rotation: normalizeWidgetRotation(event.rotation) }
        event.target.style.transform = getWidgetTransform(nextFrame)
        liveFrameRef.current[editingWidgetId] = nextFrame
      },
      onRotateEnd: () => {
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
  root.style.position = "relative"
  root.style.zIndex = "1"
  root.innerHTML = `
    <style>
      .decoai-widget-card__actions {
        z-index: 3;
        display: flex;
        flex: 0 0 auto;
        gap: 2px;
        margin-left: auto;
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
      .decoai-widget-card-photo:has(.decoai-photo-widget-image) {
        background-color: transparent !important;
        opacity: 1;
        border-radius: 0 !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        overflow: visible !important;
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
      .decoai-widget-card__edit:hover {
        background-color: #198754;
      }
      .decoai-widget-card__add:hover {
        background-color: #1976d2;
      }
      .decoai-widget-card__delete:hover {
        background-color: #d32f2f;
      }
      .decoai-photo-widget {
        position: relative;
        width: 100%;
        height: calc(100% - 32px);
        pointer-events: auto;
        container-type: size;
      }
      .decoai-widget-card-photo:has(.decoai-photo-widget-image) .decoai-photo-widget {
        height: 100%;
        transform: translateY(-32px);
      }
      .decoai-photo-widget-image {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
        user-select: none;
        pointer-events: none;
      }
      .decoai-photo-widget-placeholder {
        position: absolute;
        top: -32px;
        right: 0;
        bottom: 0;
        left: 0;
        width: 100%;
        height: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        pointer-events: none;
      }
      .decoai-photo-widget-upload-overlay {
        position: absolute;
        top: -32px;
        right: 0;
        bottom: 0;
        left: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        pointer-events: none;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .decoai-widget-card-photo:has(.decoai-photo-widget-image) .decoai-photo-widget-upload-overlay {
        top: 0;
      }
      .decoai-photo-widget:hover .decoai-photo-widget-upload-overlay {
        opacity: 1;
        transform: scale(1);
      }
      .decoai-photo-widget-upload {
        width: max(96px, 48cqmin);
        height: max(96px, 48cqmin);
        pointer-events: auto;
      }
      .decoai-note-widget,
      .decoai-todo-widget {
        height: calc(100% - 32px);
        display: flex;
        flex-direction: column;
        min-height: 0;
        pointer-events: auto;
        container-type: size;
      }
      .decoai-note-editor-wrap {
        flex: 1;
        min-height: 0;
        padding: 0 10px;
        overflow: auto;
      }
      .decoai-text-editor {
        min-height: 100%;
        outline: none;
        color: inherit !important;
        font-size: max(16px, 8cqmin);
        white-space: pre-wrap;
        font-weight: 400;
      }
      .decoai-text-editor p {
        margin: 0;
      }
      .decoai-text-editor p.is-editor-empty:first-child::before {
        content: attr(data-placeholder);
        float: left;
        color: rgba(255, 255, 255, 0.35);
        pointer-events: none;
        height: 0;
      }
      .decoai-text-editor strong {
        font-weight: 700 !important;
      }
      .decoai-text-editor em {
        font-style: italic !important;
      }
      .decoai-text-editor ul,
      .decoai-text-editor ol {
        margin: 0;
        padding-left: max(20px, 10cqmin);
      }
      .decoai-text-editor ul {
        list-style: disc outside;
      }
      .decoai-text-editor ol {
        list-style: decimal outside;
      }
      .decoai-text-editor li {
        display: list-item;
        padding-left: max(2px, 1cqmin);
      }
      .decoai-note-toolbar {
        height: max(32px, 16cqmin);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 10px;
        border-top: 1px solid #4b5563;
        border-bottom: 1px solid transparent;
      }
      .decoai-text-tool,
      .decoai-todo-add,
      .decoai-todo-delete {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        color: inherit !important;
        background-color: transparent;
        cursor: pointer;
      }
      .decoai-text-tool {
        width: max(28px, 14cqmin);
        height: max(28px, 14cqmin);
        padding: 0;
        border-radius: 8px;
      }
      .decoai-todo-widget {
        padding: 0 10px 10px;
      }
      .decoai-todo-input-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .decoai-todo-input {
        flex: 1;
        min-width: 0;
        min-height: 24px;
        padding: max(4px, 2cqmin) max(8px, 4cqmin);
        border: 1px solid #4b5563;
        border-radius: 8px;
        background-color: transparent;
        outline: none;
        font-size: max(16px, 8cqmin);
        -webkit-text-fill-color: #fff !important;
      }
      .decoai-todo-input::placeholder {
        -webkit-text-fill-color: rgba(255, 255, 255, 0.35);
      }
      .decoai-todo-add,
      .decoai-todo-delete {
        width: max(32px, 16cqmin);
        height: max(32px, 16cqmin);
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 999px;
        padding: 0;
      }
      .decoai-todo-add:disabled {
        opacity: 0.5;
        pointer-events: none;
      }
      .decoai-todo-list {
        flex: 1;
        min-height: 0;
        overflow: auto;
        display: flex;
        flex-direction: column;
        scrollbar-width: none !important;
      }
      .decoai-todo-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: max(8px, 4cqmin) 0;
        font-size: max(16px, 8cqmin);
      }
      .decoai-todo-item:not(:first-child) {
        border-top: 1px solid #4b5563;
      }
      .decoai-todo-check-label {
        display: flex;
        align-items: center;
        flex: 1;
        min-width: 0;
        height: 100%;
        padding: max(4px, 2cqmin) max(8px, 4cqmin);
        border-radius: 8px;
        gap: max(8px, 4cqw);
        cursor: pointer;
      }
      .decoai-todo-checkbox {
        width: max(16px, 8cqmin);
        height: max(16px, 8cqmin);
        border-radius: 4px;
        cursor: pointer;
      }
      .decoai-todo-checkbox:checked {
        accent-color: #66cdaa;
        background-color: #66cdaa;
      }
      .decoai-todo-item span {
        flex: 1;
        min-width: 0;
      }
      .decoai-todo-item span.is-done {
        text-decoration: line-through;
        opacity: 0.5;
      } 
      .decoai-text-tool:hover,
      .decoai-text-tool.is-active,
      .decoai-todo-check-label:hover,
      .decoai-todo-add:hover,
      .decoai-todo-delete:hover {
        background-color: #0000004D;
      }
      .decoai-dday-widget {
        height: calc(100% - 32px);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-evenly;
        padding: 0 10px 10px;
        pointer-events: auto;
        container-type: size;
      }
      .decoai-dday-display {
        display: flex;
        align-items: center;
        font-size: max(48px, 24cqmin);
        user-select: none;
      }
      .decoai-dday-input {
        position: absolute;
        inset: 0;
        padding: 0;
        border: none;
        opacity: 0;
      }
      .decoai-dday-input::-webkit-calendar-picker-indicator {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        cursor: pointer;
      }
      .decoai-time-widget {
        height: calc(100% - 32px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 10px 10px;
        pointer-events: auto;
        container-type: size;
      }
      .decoai-time-row {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: max(8px, 4cqw);
        font-size: max(32px, 16cqmin);
      }
      .decoai-widget-controls {
        position: relative;
        z-index: 4;
        display: flex;
        flex-direction: column;
        gap: max(4px, 2cqw);
      }
      .decoai-widget-control {
        position: relative;
        z-index: 4;
        width: max(48px, 24cqmin);
        height: max(48px, 24cqmin);
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 999px;
        padding: 0;
        background-color: transparent;
        color: inherit !important;
        cursor: pointer;
        user-select: none;
      }
      .decoai-widget-control:disabled {
        opacity: 0.5;
        pointer-events: none;
      }
      .decoai-time-display {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: max(4px, 2cqw);
      }
      .decoai-time-stepper {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .decoai-time-step {
        width: max(36px, 18cqmin);
        height: max(36px, 18cqmin);
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 999px;
        padding: 0;
        background-color: transparent;
        color: inherit !important;
        cursor: pointer;
      }
      .decoai-widget-control:hover,
      .decoai-time-step:hover {
        background-color: #0000004D;
      }
      .decoai-time-input {
        width: 100%;
        border: none;
        border-radius: 8px;
        padding: 2px 0;
        color: inherit !important;
        background-color: transparent;
        text-align: center;
        outline: none;
        font-size: inherit;
      }
      .decoai-time-input::-webkit-outer-spin-button,
      .decoai-time-input::-webkit-inner-spin-button {
        -webkit-appearance: none;
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
  const widgetButton = root.querySelector<HTMLElement>(`.${FAB_WIDGET_BTN_CLASS}`)
  const widgetAction = widgetButton?.closest<HTMLElement>(`.${FAB_ACTION_CLASS}`)
  const isThemeHidden = (await storage.get<boolean>(THEME_HIDDEN_STORAGE_KEY)) === true
  const isWidgetHidden = (await storage.get<boolean>(WIDGET_HIDDEN_STORAGE_KEY)) === true
  if (themeAction) themeAction.style.display = isThemeHidden ? "none" : "flex"
  if (widgetAction) widgetAction.style.display = isWidgetHidden ? "none" : "flex"
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
  const actionButton = target instanceof Element ? target.closest(`.${FAB_ACTION_CLASS} button`) : null
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
    iconComponent,
    tooltipText,
    panelView
  }: {
    buttonClass: string
    iconComponent: React.ReactElement
    tooltipText: string
    panelView: FabPanelView
  }) => {
    const button = document.createElement("button")
    button.type = "button"
    button.className = buttonClass
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
        window.dispatchEvent(new CustomEvent(FAB_OPEN_EVENT, { detail: { view: panelView } }))
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
    iconComponent: React.createElement(Icon, {
      icon: "lucide:wallpaper",
      height: 24,
      "aria-hidden": "true"
    }),
    tooltipText: `${t("theme")} ${t("setting")}`,
    panelView: "theme"
  })

  const widgetAction = createFabAction({
    buttonClass: FAB_WIDGET_BTN_CLASS,
    iconComponent: React.createElement(Icon, {
      icon: "lucide:component",
      height: 24,
      "aria-hidden": "true"
    }),
    tooltipText: `${t("widget")} ${t("setting")}`,
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
    ` : ""

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
    ` : ""}
    ${site === "gemini"
      ? `
      .show-lm-background::before {
        background: none !important;
      }
      model-response, .dual-response-panel {
        padding: 20px 28px !important;
        border-radius: 40px !important;
      }
    ` : ""}
    ${site === "claude"
      ? `
      .font-claude-response {
        padding: 10px 16px !important;
        border-radius: 12px !important;
      }
    ` : ""}
    ${site === "grok"
      ? `
      [data-testid="assistant-message"] {
        padding: 8px 16px !important;
        border-radius: 24px !important;
      }
    ` : ""}
    ${accentColor
      ? `
      ${site === "chatgpt" || site === "gemini" ? container : "*"} {
        scrollbar-width: auto !important;
        scrollbar-color: ${accentColor}4D transparent !important;
      }
    ` : ""}
  `

  const getTextStyle = () =>
    lightTextColor && darkTextColor
      ? `
      *:not(pre *) { color: ${lightTextColor} !important; }
      ${darkClass} *:not(pre *) { color: ${darkTextColor} !important; }
    ` : ""

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
    currentTheme === "custom" ? getCustomBgOptions() : Promise.resolve(undefined)
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
  requestAnimationFrame(() => void flushApplyTheme())
  window.setTimeout(() => scheduleApplyTheme(), 250)
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
  if (areaName !== "local") return

  if (changes[AUTH_SESSION_STORAGE_KEY]) premiumCache = null
  if (!hasCustomThemeStorageChange(changes)) return

  void (async () => {
    if (!(await isCustomThemeSelected())) return
    invalidateThemeCache()
    scheduleApplyTheme()
  })()
})

window.addEventListener(CUSTOM_THEME_PREVIEW_EVENT, (event) => {
  const customEvent = event as CustomEvent<{ themeId: string; theme: CustomTheme } | null>
  customThemePreview = customEvent.detail
  void (async () => {
    if (!(await isCustomThemeSelected())) return
    scheduleApplyTheme()
  })()
})

watchLocationChange()
scheduleApplyTheme()
