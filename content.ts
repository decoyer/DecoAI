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
  DEFAULT_WIDGET_INSTANCES,
  DEFAULT_WIDGET_LAYOUT,
  DEFAULT_WIDGET_MIN_SIZE,
  deleteImageData,
  detectCurrentSite,
  FAB_OPEN_EVENT,
  getBgImageIds,
  getBgTransform,
  getImageDataUrl,
  hasRemovedBg,
  isAnimatedCustomTheme,
  isAnimatedImage,
  LOADING_OVERLAY_STYLE,
  MAX_FILE_BYTES,
  MODEL_ENABLED_STORAGE_KEY,
  PHOTO_WIDGET_STATE_STORAGE_KEY,
  removeBgFromState,
  removeImageBg,
  restoreBgState,
  sanitizeBg,
  sanitizeColor,
  sanitizeCustomBgOptions,
  sanitizeCustomBgUrl,
  saveImageDataUrl,
  SELECTED_CUSTOM_THEME_ID_STORAGE_KEY,
  SELECTED_THEME_STORAGE_KEY,
  STOPWATCH_WIDGET_STATE_STORAGE_KEY,
  TEXT_WIDGET_STATE_STORAGE_KEY,
  THEME_HIDDEN_STORAGE_KEY,
  THEME_LOADING_EVENT,
  TIMER_WIDGET_STATE_STORAGE_KEY,
  trimTransparentImage,
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
  matches: ["https://chatgpt.com/*", "https://gemini.google.com/*", "https://claude.ai/*", "https://grok.com/*"],
  all_frames: false,
  run_at: "document_start"
}

interface ThemeConfig {
  bgUrl: string
  bgColor: string
  borderColor: string
  lightTextColor: string
  darkTextColor: string
}

type ThemeName = "random" | "nasa" | "neon" | "pink" | "vintage" | "fractal" | "terminal" | "custom" | "default"

const SITE_SELECTORS = {
  chatgpt: {
    container: "body",
    header: "#page-header",
    footer: 'div[data-scroll-root][data-show-disclaimer] div[data-testid="thread-disclaimer"]',
    elements:
      ".btn-secondary, .agent-turn, .user-message-bubble-color, .shadow-short-composer, .origin-top-right > aside",
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
    header:
      'header, #main-content > div > div > main > div:first-child, .z-header, [data-testid="wiggle-controls-actions"]',
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
let applyThemeFrameId: number | null = null
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
  borderColor: "",
  lightTextColor: "",
  darkTextColor: ""
}

const TERMINAL_THEME: ThemeConfig = {
  bgUrl: "",
  bgColor: "",
  borderColor: "#33ff33",
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

const updateWidgetTitleOverflow = (title: HTMLElement) => {
  const titleText = title.querySelector<HTMLElement>(".decoai-widget-title__text")
  title.classList.remove("title-overflow")
  title.classList.toggle("title-overflow", Boolean(titleText && titleText.scrollWidth > titleText.clientWidth + 1))
}

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

const getPremiumStatus = async ({ forceRefresh = false } = {}) => {
  if (!forceRefresh && premiumCache && Date.now() - premiumCache.checkedAt < AUTH_REFRESH_MS) {
    return { isPremium: premiumCache.value, isChecked: true }
  }

  const snapshot = await getAuthSessionSnapshot()

  try {
    const isPremium = await getVerifiedPremiumStatus(forceRefresh)
    const nextSnapshot = await getAuthSessionSnapshot()
    const hasVerifiedNewStatus = Boolean(nextSnapshot?.checkedAt) && nextSnapshot?.checkedAt !== snapshot?.checkedAt

    if (!isPremium && snapshot?.premiumStatus === "premium" && nextSnapshot && !hasVerifiedNewStatus) {
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
    const site = detectCurrentSite()
    const elements = [FAB_THEME_BTN_CLASS, FAB_WIDGET_BTN_CLASS, FAB_TOOLTIP_CLASS].map((item) => `.${item}`).join(", ")

    const darkClass = SITE_SELECTORS[site]?.darkClass
    const darkSelectors = mapSelectors(elements, { prefix: `${darkClass} ` })

    style.textContent = `
      .${FAB_ROOT_CLASS} {
        position: fixed;
        right: clamp(1rem, 2vw, 3rem);
        bottom: clamp(2rem, 10vh, 5rem);
        z-index: 2;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.75rem;
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

      ${darkSelectors} {
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
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 4px 8px;
        box-sizing: border-box;
        background-color: #000;
        border: 1px solid #66cdaa4D;
        color: #fff;
        font-size: 12px;
        border-radius: 8px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transform: translateX(4px);
      }

      ${darkClass} .${FAB_TOOLTIP_CLASS} {
        color: #000;
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
        background-color: rgba(24, 24, 24, 0.8);
        border-radius: 16px;
        backdrop-filter: blur(10px) saturate(140%);
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
      theme: "colored",
      autoClose: 2000,
      hideProgressBar: true,
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
    chrome.runtime.sendMessage({ type: "FETCH_IMAGE_AS_DATA_URL", url }, (response) =>
      resolve(response?.success ? response.dataUrl : "")
    )
  })

const getPaletteData = async (bgUrl: string): Promise<ThemeConfig> => {
  try {
    const palette = await Vibrant.from(bgUrl).getPalette()
    return {
      bgUrl,
      bgColor: "",
      borderColor: palette.Vibrant?.hex || "",
      lightTextColor: palette.DarkVibrant?.hex || "",
      darkTextColor: palette.LightVibrant?.hex || ""
    }
  } catch {
    return { ...EMPTY_THEME, bgUrl }
  }
}

const normalizeCustomThemes = async (customThemes: CustomTheme[], selectedCustomThemeId: string) => {
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
  const customThemes = customData[CUSTOM_THEMES_STORAGE_KEY] as CustomTheme[] | undefined
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

    return { isPremium: false, theme: normalizedTheme }
  }

  return { isPremium: premiumStatus.isPremium, theme: selectedTheme }
}

const getCustomThemeData = async (): Promise<ThemeConfig> => {
  const { theme: customTheme } = await getSelectedCustomTheme()
  if (!customTheme) return EMPTY_THEME

  const bgUrl =
    sanitizeCustomBgUrl(customTheme.bgUrl) ||
    (customTheme.bgImageId ? await getImageDataUrl(customTheme.bgImageId).catch(() => "") : "")

  return {
    bgUrl,
    bgColor: sanitizeBg(customTheme.bgColor),
    borderColor: sanitizeColor(customTheme.border),
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

const isFabThemeEditing = () => {
  const panelHost = document.getElementById(FAB_THEME_MOUNT_ID)
  return panelHost?.shadowRoot?.querySelector('[data-decoai-theme-editing="true"]') !== null
}

const clampWidgetFrameToViewport = (frame: WidgetFrame, minSize: WidgetSize): WidgetFrame => {
  const widthRatio = clampNumber(frame.widthRatio, minSize.widthRatio, 1, minSize.widthRatio)
  const heightRatio = clampNumber(frame.heightRatio, minSize.heightRatio, 1, minSize.heightRatio)
  return {
    widthRatio,
    heightRatio,
    xRatio: clampNumber(frame.xRatio, 0, Math.max(0, 1 - widthRatio), 0),
    yRatio: clampNumber(frame.yRatio, 0, Math.max(0, 1 - heightRatio), 0),
    rotation: normalizeWidgetRotation(frame.rotation)
  }
}

const PHOTO_WIDGET_MIN_SIZE: WidgetSize = {
  widthRatio: 0.05,
  heightRatio: 0.1
}

const getInitialWidgetFrame = (index: number): WidgetFrame => {
  const widthRatio = 0.12
  const heightRatio = 0.15
  const xRatio = Math.min(1 - widthRatio, 0.16)
  const yRatio = Math.min(1 - heightRatio, index * 0.1 + 0.025)

  return { xRatio, yRatio, widthRatio, heightRatio, rotation: 0 }
}

type ViewportSize = { width: number; height: number }
type PixelWidgetFrame = {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
}
type PixelWidgetFrameMap = Record<string, PixelWidgetFrame>

const getViewportSize = (): ViewportSize => ({
  width: Math.max(document.documentElement.clientWidth, 1),
  height: Math.max(document.documentElement.clientHeight, 1)
})

const toPixelWidgetFrame = (frame: WidgetFrame, viewport: ViewportSize): PixelWidgetFrame => ({
  x: frame.xRatio * viewport.width,
  y: frame.yRatio * viewport.height,
  width: frame.widthRatio * viewport.width,
  height: frame.heightRatio * viewport.height,
  rotation: frame.rotation
})

const toRelativeWidgetFrame = (frame: PixelWidgetFrame, viewport: ViewportSize, minSize: WidgetSize): WidgetFrame =>
  clampWidgetFrameToViewport(
    {
      xRatio: frame.x / viewport.width,
      yRatio: frame.y / viewport.height,
      widthRatio: frame.width / viewport.width,
      heightRatio: frame.height / viewport.height,
      rotation: frame.rotation
    },
    minSize
  )

const clampPixelWidgetFrameToViewport = (frame: PixelWidgetFrame, minSize: WidgetSize, viewport: ViewportSize) =>
  toPixelWidgetFrame(toRelativeWidgetFrame(frame, viewport, minSize), viewport)

const getWidgetTransform = (frame: PixelWidgetFrame, viewport: ViewportSize) =>
  `translate(${(frame.x / viewport.width) * 100}vw, ${(frame.y / viewport.height) * 100}vh) rotate(${normalizeWidgetRotation(frame.rotation)}deg)`

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

const getSiteDefaultTextColor = () => {
  const style = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null
  const wasDisabled = style?.disabled ?? false

  if (style) style.disabled = true
  try {
    return getComputedStyle(document.body || document.documentElement).color
  } finally {
    if (style) style.disabled = wasDisabled
  }
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
  const totalSeconds = Math.max(0, Math.ceil(timer.totalMilliseconds / 1000))

  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60
  }
}

const getStopwatchMilliseconds = (stopwatch: ReturnType<typeof useStopwatch>) =>
  stopwatch.totalSeconds * 1000 + stopwatch.milliseconds

const readImageFileAsDataUrl = (file: File) =>
  new Promise<string | null>((resolve) => {
    const reader = new FileReader()
    reader.onerror = () => resolve(null)
    reader.onload = () => resolve(sanitizeCustomBgUrl(reader.result) || null)
    reader.readAsDataURL(file)
  })

const controlButton = (icon: string, onClick: () => void, disabled = false) =>
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
    .flatMap((node) => (node.type === "taskList" ? node.content || [] : []))
    .map((node) => ({
      checked: node.attrs?.checked === true,
      text: node.content?.[0]?.content?.[0]?.text || ""
    }))

const createTodoDoc = (items: TodoItem[]): JSONContent => ({
  type: "doc",
  content: items.length
    ? [{
      type: "taskList",
      content: items.map((item) => ({
        type: "taskItem",
        attrs: { checked: item.checked },
        content: [{ type: "paragraph", content: item.text ? [{ type: "text", text: item.text }] : [] }]
      }))
    }]
    : EMPTY_DOC.content
})

const textWidgetButton = (icon: string, onClick: () => void, active = false) =>
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
    {
      key: `${TEXT_WIDGET_STATE_STORAGE_KEY}:${widgetId}`,
      instance: localStorageInstance
    },
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
    extensions: [StarterKit, Placeholder.configure({ placeholder: t("place_noteWidget") })],
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

  React.useEffect(
    () => () => {
      if (saveTimeoutRef.current !== null) window.clearTimeout(saveTimeoutRef.current)
      if (pendingContentRef.current) setContentRef.current(pendingContentRef.current)
    },
    []
  )

  return createElement(
    "div",
    {
      className: "decoai-note-widget",
      onPointerDown: (e) => e.stopPropagation()
    },
    createElement(EditorContent, {
      editor,
      className: "decoai-note-editor-wrap"
    }),
    createElement(
      "div",
      { className: "decoai-note-toolbar" },
      textWidgetButton("lucide:bold", () => editor?.chain().focus().toggleBold().run(), editor?.isActive("bold")),
      textWidgetButton("lucide:italic", () => editor?.chain().focus().toggleItalic().run(), editor?.isActive("italic")),
      textWidgetButton(
        "lucide:underline",
        () => editor?.chain().focus().toggleUnderline().run(),
        editor?.isActive("underline")
      ),
      textWidgetButton(
        "lucide:strikethrough",
        () => editor?.chain().focus().toggleStrike().run(),
        editor?.isActive("strike")
      ),
      textWidgetButton(
        "lucide:list",
        () => editor?.chain().focus().toggleBulletList().run(),
        editor?.isActive("bulletList")
      ),
      textWidgetButton(
        "lucide:list-ordered",
        () => editor?.chain().focus().toggleOrderedList().run(),
        editor?.isActive("orderedList")
      )
    )
  )
}

function TodoWidgetContent({ widgetId }: { widgetId: string }) {
  const composerRef = useRef<HTMLInputElement | null>(null)
  const [content, setContent] = useStorage<JSONContent>(
    {
      key: `${TEXT_WIDGET_STATE_STORAGE_KEY}:${widgetId}`,
      instance: localStorageInstance
    },
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

  const addTodo = (keepFocus = false) => {
    const composer = composerRef.current
    const text = (composer?.value || "").trim()
    if (text) {
      setTodoItems([...todoItems, { checked: false, text }])
      if (composer) composer.value = ""
    }
    if (keepFocus) requestAnimationFrame(() => composerRef.current?.focus())
  }

  return createElement(
    "div",
    {
      className: todoItems.length === 0 ? "decoai-todo-widget is-empty" : "decoai-todo-widget",
      onPointerDown: (e) => e.stopPropagation()
    },
    createElement(
      "div",
      { className: "decoai-todo-list" },
      todoItems.map((item, index) =>
        createElement(
          "div",
          { key: `${index}:${item.text}`, className: "decoai-todo-item" },
          createElement(
            "div",
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
              {
                className: item.checked ? "is-done" : "",
                contentEditable: true,
                suppressContentEditableWarning: true,
                onKeyDown: (e) => {
                  e.stopPropagation()
                  if (e.key === "Enter") {
                    e.preventDefault()
                    e.currentTarget.blur()
                  }
                },
                onBlur: (e) => {
                  const text = (e.currentTarget.textContent || "").trim()
                  if (!text) return
                  const nextItems = [...todoItems]
                  nextItems[index] = { ...item, text }
                  setTodoItems(nextItems)
                }
              },
              item.text
            )
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
            createElement(Icon, {
              icon: "lucide:circle-minus",
              height: "50%",
              "aria-hidden": "true"
            })
          )
        )
      ),
      createElement(
        "div",
        {
          key: "todo-composer",
          className: "decoai-todo-item decoai-todo-composer"
        },
        createElement(
          "div",
          { className: "decoai-todo-check-label" },
          createElement("input", {
            ref: composerRef,
            type: "text",
            className: "decoai-todo-input",
            placeholder: t("place_todoWidget"),
            onKeyDown: (e) => {
              e.stopPropagation()
              if (e.key === "Enter") {
                e.preventDefault()
                addTodo(true)
              }
            }
          })
        ),
        createElement(
          "button",
          {
            type: "button",
            className: "decoai-todo-add",
            onPointerDown: (e) => {
              e.preventDefault()
              e.stopPropagation()
            },
            onClick: (e) => {
              e.preventDefault()
              e.stopPropagation()
              addTodo(true)
            }
          },
          createElement(Icon, {
            icon: "lucide:circle-plus",
            height: "50%",
            "aria-hidden": "true"
          })
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
    createElement("div", { className: "decoai-dday-display" }, getDdayLabel(targetDate, today)),
    createElement(
      "label",
      {
        className: "decoai-widget-control",
        style: { width: "max(32px, 16cqmin)", height: "max(32px, 16cqmin)" },
        onPointerDown: (e) => e.stopPropagation(),
        onPointerUp: (e) => e.stopPropagation(),
        onClick: (e) => e.stopPropagation()
      },
      createElement(Icon, {
        icon: "lucide:calendar-days",
        height: "75%",
        "aria-hidden": "true"
      }),
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
  }, [timerState.timerEndAt, timerState.timerRemainingSeconds, timerState.timerRunning])

  const timerDisplay = getTimerDisplayParts(timer)

  const setTimerTimePart = (part: "hours" | "minutes" | "seconds", value: string) => {
    const nextParts = {
      ...timerDisplay,
      [part]: clampNumber(value, 0, 59, timer[part])
    }
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

  const timeInput = (part: "hours" | "minutes" | "seconds", value: number) =>
    createElement("input", {
      className: "decoai-time-input decoai-timer-input",
      type: "number",
      min: 0,
      max: 59,
      value: String(value).padStart(2, "0"),
      disabled: timer.isRunning,
      onChange: (e) => setTimerTimePart(part, e.target.value)
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

    stopwatch.reset(offsetTimestamp(getSyncedStopwatchMilliseconds(stopwatchState)), stopwatchState.stopwatchRunning)
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
  onBgRemovalChange,
  disabled = false
}: {
  widgetId: string
  onBgRemovalChange?: (used: boolean) => void
  disabled?: boolean
}) {
  const uploadRef = useRef<HTMLInputElement>(null)
  const [photoState, setPhotoState] = useStorage<PhotoWidgetState>(
    {
      key: `${PHOTO_WIDGET_STATE_STORAGE_KEY}:${widgetId}`,
      instance: localStorageInstance
    },
    DEFAULT_PHOTO_WIDGET_STATE
  )
  const [imageUrl, setImageUrl] = useState("")

  React.useEffect(() => {
    let active = true
    const imageId = photoState?.imageId || ""
    if (!imageId) {
      setImageUrl("")
      return
    }

    void getImageDataUrl(imageId)
      .then((url) => {
        if (active) setImageUrl(url)
      })
      .catch(() => {
        if (active) setImageUrl("")
      })

    return () => {
      active = false
    }
  }, [photoState?.imageId])

  React.useEffect(() => {
    onBgRemovalChange?.(hasRemovedBg(photoState))
  }, [photoState?.originalImageId])

  const uploadImage = async (file?: File) => {
    if (disabled) return
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
    const nextImageUrl = await readImageFileAsDataUrl(file)
    if (!nextImageUrl) return
    const imageId = await saveImageDataUrl(nextImageUrl)
    getBgImageIds(photoState).forEach((previousImageId) => void deleteImageData(previousImageId))
    const nextPhotoState: PhotoWidgetState = {
      imageId,
      animated,
      originalImageId: "",
      originalAnimated: false
    }
    setPhotoState(nextPhotoState)
  }

  const uploadButton = disabled
    ? null
    : createElement(
      "button",
      {
        type: "button",
        className: "decoai-widget-control decoai-photo-widget-upload",
        onPointerDown: (e) => e.stopPropagation(),
        onPointerUp: (e) => e.stopPropagation(),
        onClick: (e) => {
          e.preventDefault()
          e.stopPropagation()
          uploadRef.current?.click()
        }
      },
      createElement(Icon, {
        icon: "lucide:image-up",
        height: "50%",
        "aria-hidden": "true"
      })
    )

  return createElement(
    "div",
    { className: "decoai-photo-widget" },
    !disabled
      ? createElement("input", {
        ref: uploadRef,
        type: "file",
        accept: "image/*",
        onChange: (e) => {
          void uploadImage(e.currentTarget.files?.[0])
          e.currentTarget.value = ""
        },
        style: { display: "none" }
      })
      : null,
    imageUrl
      ? createElement(
        React.Fragment,
        null,
        createElement("img", {
          className: "decoai-photo-widget-image",
          src: imageUrl,
          draggable: false
        }),
        uploadButton ? createElement("div", { className: "decoai-photo-widget-upload-overlay" }, uploadButton) : null
      )
      : uploadButton
        ? createElement("div", { className: "decoai-photo-widget-placeholder" }, uploadButton)
        : null
  )
}

function WidgetOverlayApp() {
  const [previewLayout, setPreviewLayout] = useState<WidgetLayoutOptions | null>(null)
  const [isDarkMode, setIsDarkMode] = useState(isWidgetDarkMode)
  const [widgetItems, setWidgetItems] = useStorage<WidgetInstance[]>(
    WIDGET_INSTANCES_STORAGE_KEY,
    DEFAULT_WIDGET_INSTANCES
  )
  const [layoutOptions] = useStorage<WidgetLayoutOptions>(WIDGET_LAYOUT_STORAGE_KEY, DEFAULT_WIDGET_LAYOUT)
  const [frameMap, setFrameMap] = useStorage<WidgetFrameMap>(WIDGET_FRAME_STORAGE_KEY, {})
  const [viewportSize, setViewportSize] = useState(getViewportSize)
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null)
  const [removingBgWidgetIds, setRemovingBgWidgetIds] = useState<Record<string, boolean>>({})
  const [bgRemovedWidgetIds, setBgRemovedWidgetIds] = useState<Record<string, boolean>>({})
  const [selectedTarget, setSelectedTarget] = useState<HTMLDivElement | null>(null)
  const widgetRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const removeBgToastIdsRef = useRef<Record<string, ReturnType<typeof toast.loading>>>({})
  const liveFrameRef = useRef<Partial<PixelWidgetFrameMap>>({})
  const interactionStartFrameRef = useRef<PixelWidgetFrame | null>(null)
  const layout = {
    ...DEFAULT_WIDGET_LAYOUT,
    ...(previewLayout || layoutOptions)
  }
  const siteDefaultTextColor = useMemo(getSiteDefaultTextColor, [isDarkMode])
  const visibleWidgetItems = widgetItems || DEFAULT_WIDGET_INSTANCES
  const selectedWidget = visibleWidgetItems.find((item) => item.id === editingWidgetId)
  const frames = useMemo(
    () =>
      visibleWidgetItems.reduce((nextFrames, item, index) => {
        const fallback = getInitialWidgetFrame(index)
        const relativeFrame = clampWidgetFrameToViewport(
          { ...fallback, ...frameMap?.[item.id] },
          item.type === "photo" ? PHOTO_WIDGET_MIN_SIZE : DEFAULT_WIDGET_MIN_SIZE
        )
        nextFrames[item.id] = toPixelWidgetFrame(relativeFrame, viewportSize)
        return nextFrames
      }, {} as PixelWidgetFrameMap),
    [frameMap, viewportSize, visibleWidgetItems]
  )
  React.useLayoutEffect(() => {
    let animationFrame = 0
    const updateViewportSize = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(() => {
        const next = getViewportSize()
        setViewportSize((current) => (current.width === next.width && current.height === next.height ? current : next))
      })
    }
    const observer = new ResizeObserver(updateViewportSize)
    observer.observe(document.documentElement)
    window.addEventListener("resize", updateViewportSize)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      observer.disconnect()
      window.removeEventListener("resize", updateViewportSize)
    }
  }, [])
  React.useLayoutEffect(() => {
    setSelectedTarget(editingWidgetId && !selectedWidget?.locked ? widgetRefs.current[editingWidgetId] ?? null : null)
  }, [editingWidgetId, selectedWidget?.locked, visibleWidgetItems])

  React.useEffect(() => {
    const items = widgetItems || DEFAULT_WIDGET_INSTANCES

    void (async () => {
      const removablePhotoWidgetIds: string[] = []

      for (const item of items) {
        if (item.type !== "photo") continue

        const photoState = await localStorageInstance.get<PhotoWidgetState>(
          `${PHOTO_WIDGET_STATE_STORAGE_KEY}:${item.id}`
        )
        if (photoState?.animated === true || photoState?.originalAnimated === true) {
          removablePhotoWidgetIds.push(item.id)
        }
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
          void localStorageInstance
            .get<PhotoWidgetState>(`${PHOTO_WIDGET_STATE_STORAGE_KEY}:${id}`)
            .then((photoState) => getBgImageIds(photoState).forEach((imageId) => void deleteImageData(imageId)))
          void localStorageInstance.remove(`${PHOTO_WIDGET_STATE_STORAGE_KEY}:${id}`)
        })
        toast.error(t("pro_animatedSticker"), { toastId: "normalizeSticker" })
      }
    })()
  }, [setFrameMap, setWidgetItems, widgetItems])

  React.useEffect(() => {
    const onWidgetLayoutPreview = (e: Event) => {
      const customEvent = e as CustomEvent<WidgetLayoutOptions | null>
      setPreviewLayout(customEvent.detail)
    }
    window.addEventListener(WIDGET_LAYOUT_PREVIEW_EVENT, onWidgetLayoutPreview)
    return () => window.removeEventListener(WIDGET_LAYOUT_PREVIEW_EVENT, onWidgetLayoutPreview)
  }, [])

  React.useEffect(() => {
    const updateDarkMode = () => setIsDarkMode(isWidgetDarkMode())
    const observer = new MutationObserver(updateDarkMode)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-mode"]
    })
    if (document.body)
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"]
      })

    updateDarkMode()
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    const onDocumentPointerDown = (e: PointerEvent) => {
      if (!editingWidgetId) return
      const target = e.target as Element | null
      if (target?.closest(".decoai-widget-card") || target?.closest(".moveable-control-box")) return
      setEditingWidgetId(null)
    }
    document.addEventListener("pointerdown", onDocumentPointerDown, {
      capture: true
    })
    return () => document.removeEventListener("pointerdown", onDocumentPointerDown, true)
  }, [editingWidgetId])

  const getWidgetStyle = (item: WidgetInstance): CSSProperties => {
    const frame = frames[item.id]
    const opacity = clampNumber(layout.opacity, 0, 1, 0.8)
    const textColor = sanitizeColor(layout.textColor) || siteDefaultTextColor
    const borderColor = sanitizeColor(layout.borderColor)
    const bgValue = sanitizeBg(layout.bgColor)
    const bg = bgValue || (isDarkMode ? "rgb(24, 24, 24)" : "rgb(231, 231, 231)")

    return {
      position: "absolute",
      left: 0,
      top: 0,
      width: `${(frame.width / viewportSize.width) * 100}vw`,
      height: `${(frame.height / viewportSize.height) * 100}vh`,
      transform: getWidgetTransform(frame, viewportSize),
      background: "transparent",
      color: textColor,
      border: "none",
      borderRadius: 8,
      overflow: "hidden",
      pointerEvents: "auto",
      zIndex: editingWidgetId === item.id ? 2 : 1,
      willChange: "transform, width, height",
      "--decoai-widget-bg": bg,
      "--decoai-widget-bg-opacity": opacity,
      "--decoai-widget-text": layout.textColor || "#66cdaa",
      "--decoai-widget-shadow": borderColor
        ? `inset 0 2px 16px color-mix(in srgb, ${borderColor} 30%, transparent)`
        : "none"
    } as CSSProperties
  }

  const getWidgetMinSize = (id: string | null): WidgetSize => {
    const item = visibleWidgetItems.find((widget) => widget.id === id)
    return item?.type === "photo" ? PHOTO_WIDGET_MIN_SIZE : DEFAULT_WIDGET_MIN_SIZE
  }

  const persistLiveFrame = (id: string | null) => {
    if (!id || !liveFrameRef.current[id]) return
    const nextFrame = liveFrameRef.current[id] as PixelWidgetFrame
    delete liveFrameRef.current[id]
    setFrameMap((prev) => ({
      ...prev,
      [id]: toRelativeWidgetFrame(nextFrame, viewportSize, getWidgetMinSize(id))
    }))
  }

  const deleteWidget = async (item: WidgetInstance) => {
    const stateKey = getWidgetStateKey(item)
    if (stateKey) {
      const stateStorage =
        item.type === "note" || item.type === "todo" || item.type === "photo" ? localStorageInstance : storage
      const photoState = item.type === "photo" ? await localStorageInstance.get<PhotoWidgetState>(stateKey) : null
      await stateStorage.remove(stateKey)
      getBgImageIds(photoState).forEach((imageId) => void deleteImageData(imageId))
    }
    setWidgetItems((prev) => (prev || DEFAULT_WIDGET_INSTANCES).filter((widget) => widget.id !== item.id))
    setFrameMap((prev) => {
      const { [item.id]: _removed, ...nextFrameMap } = prev || {}
      return nextFrameMap
    })
    if (item.type === "photo") {
      const toastId = removeBgToastIdsRef.current[item.id]
      if (toastId) toast.dismiss(toastId)
      delete removeBgToastIdsRef.current[item.id]
      setRemovingBgWidgetIds((prev) => {
        const { [item.id]: _removed, ...next } = prev
        return next
      })
    }
    if (editingWidgetId === item.id) setEditingWidgetId(null)
  }

  const toggleWidgetLock = (id: string) => {
    setWidgetItems((prev) =>
      (prev || DEFAULT_WIDGET_INSTANCES).map((item) => (item.id === id ? { ...item, locked: !item.locked } : item))
    )
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

  const togglePhotoWidgetBg = async (item: WidgetInstance) => {
    if (removingBgWidgetIds[item.id]) return
    const finish = () =>
      setRemovingBgWidgetIds((prev) => {
        const { [item.id]: _removed, ...next } = prev
        return next
      })

    const stateKey = `${PHOTO_WIDGET_STATE_STORAGE_KEY}:${item.id}`
    const photoState = await localStorageInstance.get<PhotoWidgetState>(stateKey)
    if (!photoState?.imageId) {
      toast.error(t("error_fileRequired"))
      return
    }

    setRemovingBgWidgetIds((prev) => ({ ...prev, [item.id]: true }))
    if (hasRemovedBg(photoState)) {
      try {
        await localStorageInstance.set(stateKey, restoreBgState(photoState))
        if (photoState.imageId !== photoState.originalImageId) {
          void deleteImageData(photoState.imageId)
        }
      } catch {
        toast.error(t("error_removeBG"))
      } finally {
        finish()
      }
      return
    }

    const { isPremium, isChecked } = await getPremiumStatus()
    if (!isPremium) {
      if (isChecked) toast.error(t("pro_removeBG"))
      finish()
      return
    }

    const imageUrl = await getImageDataUrl(photoState.imageId).catch(() => "")
    if (!imageUrl) {
      toast.error(t("error_fileRequired"))
      finish()
      return
    }

    const toastId = toast.loading(t("loading_removeBG"))
    removeBgToastIdsRef.current[item.id] = toastId
    try {
      const result = await removeImageBg(imageUrl)
      const trimmed = await trimTransparentImage(result)

      const latestState = await localStorageInstance.get<PhotoWidgetState>(stateKey)
      if (!latestState || latestState.imageId !== photoState.imageId) {
        toast.dismiss(toastId)
        return
      }

      const imageId = await saveImageDataUrl(trimmed.dataUrl)
      await localStorageInstance.set(stateKey, removeBgFromState(latestState, { imageId }))

      const frame = frames[item.id]
      const nextWidth = Math.max(frame.width * trimmed.widthRatio, viewportSize.width * PHOTO_WIDGET_MIN_SIZE.widthRatio)
      const nextHeight = Math.max(frame.height * trimmed.heightRatio, viewportSize.height * PHOTO_WIDGET_MIN_SIZE.heightRatio)
      const nextFrame = toRelativeWidgetFrame(
        {
          x: frame.x + (frame.width - nextWidth) / 2,
          y: frame.y + (frame.height - nextHeight) / 2,
          width: nextWidth,
          height: nextHeight,
          rotation: frame.rotation
        },
        viewportSize,
        PHOTO_WIDGET_MIN_SIZE
      )
      setFrameMap((prev) => ({
        ...prev,
        [item.id]: nextFrame
      }))
      setEditingWidgetId(null)
      toast.update(toastId, {
        render: t("success_removeBG"),
        type: "success",
        isLoading: false,
        autoClose: null,
        closeOnClick: null
      })
    } catch {
      toast.update(toastId, {
        render: t("error_removeBG"),
        type: "error",
        isLoading: false,
        autoClose: null,
        closeOnClick: null
      })
    } finally {
      delete removeBgToastIdsRef.current[item.id]
      finish()
    }
  }

  return createElement(
    "div",
    {
      style: {
        position: "fixed",
        inset: 0,
        zIndex: 4,
        pointerEvents: "none",
        "--decoai-widget-border": layout.borderColor || "#66cdaa"
      } as CSSProperties
    },
    visibleWidgetItems.map((item) => {
      const widgetMeta = WIDGET_LIST.find((widget) => widget.key === item.type)
      if (!widgetMeta) return null
      const isPhotoWidget = item.type === "photo"
      const isRemovingBg = Boolean(removingBgWidgetIds[item.id])
      const isBgRemoved = Boolean(bgRemovedWidgetIds[item.id])
      const isPositionLocked = item.locked === true
      return createElement(
        "div",
        {
          key: item.id,
          ref: (node: HTMLDivElement | null) => (widgetRefs.current[item.id] = node),
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
            ? createElement(Icon, { icon: `lucide:${widgetMeta.icon}`, height: 16, "aria-hidden": "true" })
            : null,
          !isPhotoWidget
            ? createElement(
              "div",
              {
                className: "decoai-widget-title",
                onPointerEnter: (e) => updateWidgetTitleOverflow(e.currentTarget),
                style: {
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  userSelect: "none"
                }
              },
              createElement(
                "span",
                { className: "decoai-widget-title__text", "data-title": item.name ?? t(widgetMeta.labelKey) },
                item.name ?? t(widgetMeta.labelKey)
              )
            )
            : null,
          createElement(
            "div",
            { className: "decoai-widget-card__actions" },
            isPhotoWidget
              ? createElement(
                "button",
                {
                  type: "button",
                  className: "decoai-widget-card__action decoai-widget-card__edit",
                  disabled: isRemovingBg,
                  onPointerDown: (e) => e.stopPropagation(),
                  onPointerUp: (e) => e.stopPropagation(),
                  onClick: (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    void togglePhotoWidgetBg(item)
                  }
                },
                createElement(Icon, {
                  icon: isBgRemoved ? "lucide:rotate-ccw" : "lucide:sparkles",
                  height: 16,
                  "aria-hidden": "true"
                })
              )
              : null,
            createElement(
              "button",
              {
                type: "button",
                className: `decoai-widget-card__action decoai-widget-card__lock`,
                onPointerDown: (e) => e.stopPropagation(),
                onPointerUp: (e) => e.stopPropagation(),
                onClick: (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  toggleWidgetLock(item.id)
                }
              },
              createElement(Icon, {
                icon: `lucide:${isPositionLocked ? "lock-keyhole" : "lock-keyhole-open"}`,
                height: 16,
                "aria-hidden": "true"
              })
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
              createElement(Icon, {
                icon: "lucide:trash-2",
                height: 16,
                "aria-hidden": "true"
              })
            )
          )
        ),
        item.type === "note" ? createElement(NoteWidgetContent, { widgetId: item.id }) : null,
        item.type === "todo" ? createElement(TodoWidgetContent, { widgetId: item.id }) : null,
        item.type === "dday" ? createElement(DdayWidgetContent, { widgetId: item.id }) : null,
        item.type === "timer" ? createElement(TimerWidgetContent, { widgetId: item.id }) : null,
        item.type === "stopwatch" ? createElement(StopwatchWidgetContent, { widgetId: item.id }) : null,
        item.type === "photo"
          ? createElement(PhotoWidgetContent, {
            widgetId: item.id,
            disabled: isRemovingBg || isPositionLocked,
            onBgRemovalChange: (used: boolean) => {
              if (bgRemovedWidgetIds[item.id] === used) return
              setBgRemovedWidgetIds((prev) => ({ ...prev, [item.id]: used }))
            }
          })
          : null,
        isRemovingBg
          ? createElement(
            "div",
            { style: LOADING_OVERLAY_STYLE },
            createElement(Icon, { icon: "line-md:loading-twotone-loop", height: 48, "aria-hidden": "true" })
          )
          : null
      )
    }),
    createElement(Moveable, {
      target: selectedTarget,
      draggable: !selectedWidget?.locked,
      resizable: !selectedWidget?.locked,
      rotatable: !selectedWidget?.locked && selectedWidget?.type === "photo",
      snapRotationDegrees: WIDGET_ROTATION_DEGREES,
      snapRotationThreshold: 4,
      checkInput: true,
      preventDefault: selectedWidget?.type !== "note",
      snappable: true,
      elementGuidelines: Object.entries(widgetRefs.current)
        .filter(([id, node]) => id !== editingWidgetId && node)
        .map(([, node]) => node as HTMLDivElement),
      isDisplaySnapDigit: false,
      origin: false,
      bounds: {
        left: 0,
        top: 0,
        right: viewportSize.width,
        bottom: viewportSize.height
      },
      onDragStart: () => (interactionStartFrameRef.current = editingWidgetId ? frames[editingWidgetId] : null),
      onDrag: (e) => {
        if (!editingWidgetId) return
        const frame = interactionStartFrameRef.current || frames[editingWidgetId]
        const [deltaX, deltaY] = e.beforeDist
        const nextFrame = clampPixelWidgetFrameToViewport(
          {
            ...frame,
            x: frame.x + deltaX,
            y: frame.y + deltaY
          },
          getWidgetMinSize(editingWidgetId),
          viewportSize
        )
        e.target.style.transform = getWidgetTransform(nextFrame, viewportSize)
        liveFrameRef.current[editingWidgetId] = nextFrame
      },
      onDragEnd: () => {
        persistLiveFrame(editingWidgetId)
        interactionStartFrameRef.current = null
      },
      onResizeStart: (e) => {
        interactionStartFrameRef.current = editingWidgetId ? frames[editingWidgetId] : null
        const minSize = getWidgetMinSize(editingWidgetId)
        e.setMin([minSize.widthRatio * viewportSize.width, minSize.heightRatio * viewportSize.height])
        e.setMax([viewportSize.width, viewportSize.height])
      },
      onResize: (e) => {
        if (!editingWidgetId) return
        const frame = interactionStartFrameRef.current || frames[editingWidgetId]
        const [deltaX, deltaY] = e.drag.beforeDist
        const nextFrame = clampPixelWidgetFrameToViewport(
          {
            ...frame,
            x: frame.x + deltaX,
            y: frame.y + deltaY,
            width: e.width,
            height: e.height
          },
          getWidgetMinSize(editingWidgetId),
          viewportSize
        )
        e.target.style.width = `${(nextFrame.width / viewportSize.width) * 100}vw`
        e.target.style.height = `${(nextFrame.height / viewportSize.height) * 100}vh`
        e.target.style.transform = getWidgetTransform(nextFrame, viewportSize)
        liveFrameRef.current[editingWidgetId] = nextFrame
      },
      onResizeEnd: () => {
        persistLiveFrame(editingWidgetId)
        interactionStartFrameRef.current = null
      },
      onRotateStart: () => {
        interactionStartFrameRef.current = editingWidgetId ? frames[editingWidgetId] : null
      },
      onRotate: (e) => {
        if (!editingWidgetId) return
        const frame = interactionStartFrameRef.current || frames[editingWidgetId]
        const nextFrame = {
          ...frame,
          rotation: normalizeWidgetRotation(e.rotation)
        }
        e.target.style.transform = getWidgetTransform(nextFrame, viewportSize)
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
      .decoai-widget-card::before,
      .decoai-widget-card::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
      }
      .decoai-widget-card::before {
        z-index: 0;
        background: var(--decoai-widget-bg);
        opacity: var(--decoai-widget-bg-opacity);
      }
      .decoai-widget-card::after {
        z-index: 2;
        box-shadow: var(--decoai-widget-shadow);
      }
      .decoai-widget-card > * {
        position: relative;
        z-index: 1;
      }
      .decoai-widget-card__actions {
        z-index: 3;
        display: flex;
        flex: 0 0 auto;
        gap: 2px;
        margin-left: auto;
        opacity: 0;
        transform: scale(0.9);
      }
      .decoai-widget-card-photo .decoai-widget-card__header {
        z-index: 5;
        pointer-events: none;
      }
      .decoai-widget-card-photo .decoai-widget-card__actions {
        z-index: 6;
        pointer-events: auto;
      }
      .moveable-control-box,
      .moveable-line,
      .moveable-control {
        --moveable-color: var(--decoai-widget-border);
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
      .decoai-widget-card-photo:has(.decoai-photo-widget-image) {
        background-color: transparent !important;
        opacity: 1;
        border-radius: 0 !important;
        box-shadow: none !important;
        overflow: visible !important;
      }
      .decoai-widget-card-photo:has(.decoai-photo-widget-image)::before,
      .decoai-widget-card-photo:has(.decoai-photo-widget-image)::after {
        display: none;
      }
      .decoai-widget-card:hover .decoai-widget-card__actions {
        opacity: 1;
        transform: scale(1);
      }
      .decoai-widget-title__text {
        display: block;
        width: max-content;
        max-width: 100%;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .decoai-widget-title.title-overflow:hover .decoai-widget-title__text {
        display: inline-flex;
        gap: 48px;
        max-width: none;
        animation: title-marquee 6s linear infinite;
      }
      .decoai-widget-title.title-overflow:hover .decoai-widget-title__text::after {
        content: attr(data-title);
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
      }
      .decoai-widget-card__edit:hover {
        background-color: #198754;
      }
      .decoai-widget-card__lock:hover {
        background-color: #ffc107;
      }
      .decoai-widget-card__delete:hover {
        background-color: #d32f2f;
      }
      @keyframes title-marquee {
        0% { transform: translateX(0); }
        75% { transform: translateX(calc(-50% - 24px)); }
        100% { transform: translateX(calc(-50% - 24px)); }
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
      .decoai-photo-widget-placeholder,
      .decoai-photo-widget-upload-overlay {
        position: absolute;
        top: -32px;
        right: 0;
        bottom: 0;
        left: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
      }
      .decoai-photo-widget-placeholder {
        width: 100%;
        height: auto;
        border-radius: 8px;
      }
      .decoai-photo-widget-upload-overlay {
        opacity: 0;
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
      .decoai-note-editor-wrap,
      .decoai-todo-list {
        flex: 1;
        min-height: 0;
        padding: 0 10px;
        overflow: auto;
        scrollbar-width: thin !important;
        scrollbar-color: color-mix(in srgb, var(--decoai-widget-text) 0%, transparent) transparent !important;
        scrollbar-gutter: stable;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .decoai-note-widget:hover .decoai-note-editor-wrap,
      .decoai-todo-widget:hover .decoai-todo-list {
        scrollbar-color: color-mix(in srgb, var(--decoai-widget-text) 30%, transparent) transparent !important;
      }
      .decoai-text-editor {
        min-height: 100%;
        outline: none;
        color: inherit !important;
        font-size: max(16px, 8cqmin);
        white-space: nowrap;
        font-weight: 400;
      }
      .decoai-text-editor p {
        margin: 0;
      }
      .decoai-text-editor p.is-editor-empty:first-child::before {
        content: attr(data-placeholder);
        float: left;
        height: 0;
        opacity: 0.35;
        pointer-events: none;
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
        padding-left: 1.25em;
      }
      .decoai-text-editor ul {
        list-style: disc outside;
      }
      .decoai-text-editor ol {
        list-style: decimal outside;
      }
      .decoai-text-editor li {
        display: list-item;
        padding-left: 2px;
      }
      .decoai-note-toolbar {
        height: max(32px, 16cqmin);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 10px;
        border-top: 1px solid var(--decoai-widget-text);
        border-bottom: 1px solid transparent;
        opacity: 0;
        pointer-events: none;
      }
      .decoai-note-widget:hover .decoai-note-toolbar,
      .decoai-note-widget:focus-within .decoai-note-toolbar {
        opacity: 1;
        pointer-events: auto;
      }
      .decoai-text-tool,
      .decoai-todo-add,
      .decoai-todo-delete {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: none;
        color: inherit !important;
        background-color: transparent;
        cursor: pointer;
      }
      .decoai-text-tool {
        width: max(28px, 14cqmin);
        height: max(28px, 14cqmin);
        border-radius: 8px;
      }
      .decoai-todo-widget {
        padding-bottom: 10px;
      }
      .decoai-todo-add,
      .decoai-todo-delete {
        width: max(32px, 16cqmin);
        height: max(32px, 16cqmin);
        border-radius: 999px;
        opacity: 0;
        pointer-events: none;
        transform: scale(0.9);
      }
      .decoai-todo-widget:hover .decoai-todo-add,
      .decoai-todo-widget:hover .decoai-todo-delete,
      .decoai-todo-widget.is-empty .decoai-todo-add {
        opacity: 1;
        pointer-events: auto;
        transform: scale(1);
      }
      .decoai-todo-list {
        display: flex;
        flex-direction: column;
      }
      .decoai-todo-item {
        display: flex;
        align-items: center;
        font-size: max(16px, 8cqmin);
        gap: 4px;
      }
      .decoai-todo-item:not(:first-child) {
        margin-top: 4px;
      }
      .decoai-todo-check-label {
        display: flex;
        align-items: center;
        flex: 1;
        min-width: 0;
        height: 100%;
        border-radius: 8px;
        gap: max(8px, 0.25em);
      }
      .decoai-todo-item:not(.decoai-todo-composer) .decoai-todo-check-label {
        padding-left: 8px;
      }
      .decoai-todo-checkbox {
        width: max(16px, 8cqmin);
        height: max(16px, 8cqmin);
        box-shadow: none;
        border-radius: 4px;
        cursor: pointer;
      }
      .decoai-todo-checkbox:checked {
        accent-color: var(--decoai-widget-text);
        background-color: var(--decoai-widget-text);
      }
      .decoai-todo-item span,
      .decoai-todo-input {
        flex: 1;
        padding: 8px 4px;
        border-radius: 8px;
        outline: none;
        overflow-wrap: anywhere;
      }
      .decoai-todo-input {
        min-width: 0;
        border: none;
        box-shadow: none;
        background-color: transparent;
      }
      .decoai-todo-input::placeholder {
        color: inherit;
        opacity: 0;
        transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .decoai-todo-widget:hover .decoai-todo-input::placeholder,
      .decoai-todo-widget.is-empty .decoai-todo-input::placeholder {
        opacity: 0.35;
      }
      .decoai-todo-item span.is-done {
        text-decoration: line-through;
        opacity: 0.5;
      }
      .decoai-widget-control:hover,
      .decoai-text-tool:hover,
      .decoai-text-tool.is-active,
      .decoai-todo-item span:hover,
      .decoai-todo-input:hover,
      .decoai-todo-add:hover,
      .decoai-todo-delete:hover {
        backdrop-filter: brightness(0.9);
      }
      .decoai-dday-widget,
      .decoai-time-widget {
        height: calc(100% - 32px);
        display: flex;
        padding: 0 10px 10px;
        pointer-events: auto;
        container-type: size;
      }
      .decoai-dday-widget {
        flex-direction: column;
        align-items: center;
        justify-content: space-evenly;
      }
      .decoai-dday-display {
        display: flex;
        align-items: center;
        font-size: max(48px, 24cqmin);
        user-select: none;
      }
      .decoai-dday-input,
      .decoai-dday-input::-webkit-calendar-picker-indicator {
        position: absolute;
        inset: 0;
      }
      .decoai-dday-input {
        padding: 0;
        border: none;
        opacity: 0;
      }
      .decoai-dday-input::-webkit-calendar-picker-indicator {
        width: 100%;
        height: 100%;
        cursor: pointer;
      }
      .decoai-time-widget {
        align-items: center;
        justify-content: center;
      }
      .decoai-time-row {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-size: max(32px, 16cqmin);
      }
      .decoai-widget-controls {
        position: relative;
        z-index: 4;
        display: flex;
        flex-direction: column;
        gap: 4px;
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
        gap: 4px;
      }
      .decoai-time-input {
        width: 100%;
        border: none;
        border-radius: 8px;
        padding: 2px 0;
        color: inherit !important;
        background-color: transparent;
        box-shadow: none;
        text-align: center;
        outline: none;
        font-size: inherit;
      }
      .decoai-time-input::-webkit-outer-spin-button,
      .decoai-time-input::-webkit-inner-spin-button {
        -webkit-appearance: none;
      }
      .decoai-widget-card__actions,
      .decoai-widget-card__action,
      .decoai-photo-widget-upload-overlay,
      .decoai-note-toolbar,
      .decoai-todo-add,
      .decoai-todo-delete {
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
    </style>
  `
  appendToBody(root)
  const mount = document.createElement("div")
  root.appendChild(mount)
  createRoot(mount).render(createElement(WidgetOverlayApp))
  widgetMounted = true
}

const setRouteScopedUiVisibility = (site: SiteType | null = detectCurrentSite()) => {
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
  if (fabOpen && (fabPanelView === "theme" ? isThemeHidden : isWidgetHidden)) closeFabDock()
}

const onOutsideFabClick = (e: MouseEvent) => {
  const root = document.getElementById(FAB_ROOT_ID)
  if (!root) return
  const target = e.target as Node
  const panel = root.querySelector(`.${FAB_THEME_PANEL_CLASS}`)
  const actionButton = target instanceof Element ? target.closest(`.${FAB_ACTION_CLASS} button`) : null
  if (panel?.contains(target) || actionButton) return
  if (isFabThemeEditing()) return
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
    button.addEventListener("click", (e) => {
      e.stopPropagation()
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
    iconComponent: React.createElement(Icon, { icon: "lucide:wallpaper", height: 24, "aria-hidden": "true" }),
    tooltipText: `${t("theme")} ${t("setting")}`,
    panelView: "theme"
  })

  const widgetAction = createFabAction({
    buttonClass: FAB_WIDGET_BTN_CLASS,
    iconComponent: React.createElement(Icon, { icon: "lucide:component", height: 24, "aria-hidden": "true" }),
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
  { bgUrl, bgColor, borderColor, lightTextColor, darkTextColor }: ThemeConfig,
  customBgOptions?: CustomBgOptions
) => {
  const config = SITE_SELECTORS[site]
  if (!config) return ""

  const { elements, darkClass, container } = config
  const darkSelectors = mapSelectors(elements, { prefix: `${darkClass} ` })
  const hoverSelectors = mapSelectors(elements, { suffix: ":hover" })

  const bgTransform = getBgTransform(customBgOptions, false)
  const invert = clampNumber(customBgOptions?.invert, 0, 1, 0)
  const grayscale = clampNumber(customBgOptions?.grayscale, 0, 1, 0)
  const brightness = clampNumber(customBgOptions?.brightness, 0, 5, 1)
  const blur = clampNumber(customBgOptions?.blur, 0, 50, 10)
  const opacity = clampNumber(customBgOptions?.opacity, 0, 1, 0.8)
  const hideHeader = customBgOptions?.hideHeader ?? true
  const hideFooter = customBgOptions?.hideFooter ?? true
  const solidBgColor = sanitizeColor(bgColor)
  const bgGradient = bgColor && !solidBgColor ? bgColor : ""
  const bgFill = solidBgColor || bgGradient || "transparent"

  const getVisibilityStyle = () => `
    ${hideHeader ? `${SITE_SELECTORS[site].header} { display: none !important; }` : ""}
    ${hideFooter
      ? `
        ${SITE_SELECTORS[site].footer} {
        ${site === "chatgpt" ? "display: none !important;" : ""}
        font-size: 0 !important;
        line-height: normal !important;
        }
      `
      : ""
    }
  `

  const getBgStyle = () =>
    bgUrl || bgColor
      ? `
        html body {
          background: ${bgFill} !important;
          background-attachment: fixed !important;
          background-size: cover !important;
        }
      ${bgUrl
        ? `
          body::before {
            content: ""; position: fixed; top: 0; left: 0;
            width: 100vw;
            height: 100vh;
            background-image: url("${bgUrl}") !important;
            background-color: transparent !important;
            background-position: center !important;
            background-size: cover !important;
            background-repeat: no-repeat !important;
            z-index: 0 !important;
            transform: ${bgTransform} !important;
            transform-origin: center !important;
            filter: invert(${invert}) grayscale(${grayscale}) brightness(${brightness}) !important;
          }
        `
        : ""
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
      background-color: rgba(231, 231, 231, ${opacity}) !important;
      ${borderColor ? `box-shadow: inset 0 2px 16px color-mix(in srgb, ${borderColor} 30%, transparent) !important;` : ""}
      border: none !important;
      backdrop-filter: blur(${blur}px) !important;
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
    ${lightTextColor && darkTextColor
      ? `
        :root { --decoai-text-color: ${lightTextColor}; }
        ${darkClass} { --decoai-text-color: ${darkTextColor}; }
        ${site === "chatgpt" || site === "gemini" ? container : "*"} {
          scrollbar-width: auto !important;
          scrollbar-color: color-mix(in srgb, var(--decoai-text-color) 30%, transparent) transparent !important;
        }
      `
      : ""
    }
  `

  const getTextStyle = () =>
    lightTextColor && darkTextColor
      ? `
        *:not(pre *):not(#${FAB_ROOT_ID} *):not(#${WIDGET_ROOT_ID} *) { color: ${lightTextColor} !important; }
        ${darkClass} *:not(pre *):not(#${FAB_ROOT_ID} *):not(#${WIDGET_ROOT_ID} *) { color: ${darkTextColor} !important; }
      `
      : ""

  return [getBgStyle(), getElStyle(), getTextStyle(), getVisibilityStyle()].join("\n")
}

const applyTheme = async (requestId: number) => {
  if (requestId !== applyThemeRequestId) return

  const currentSite = detectCurrentSite()
  if (!currentSite) return

  const style = getThemeStyle()
  if (!isAllowedRoute(currentSite)) {
    style.textContent = ""
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
    setRouteScopedUiVisibility(currentSite)
    return
  }

  const [themeData, customBgOptions] = await Promise.all([
    getThemeData(currentTheme),
    currentTheme === "custom" ? getCustomBgOptions() : Promise.resolve(undefined)
  ])

  if (requestId !== applyThemeRequestId) return
  style.textContent = generateCSS(currentSite, themeData, customBgOptions)
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

  if (applyThemeRunning || applyThemeFrameId !== null) return

  applyThemeFrameId = requestAnimationFrame(() => {
    applyThemeFrameId = null
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

const hasCustomThemeStorageChange = (changes: Record<string, chrome.storage.StorageChange>) =>
  CUSTOM_THEME_WATCH_STORAGE_KEYS.some((key) => changes[key])

const isCustomThemeSelected = async () => (await storage.get<string>(SELECTED_THEME_STORAGE_KEY)) === "custom"

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

window.addEventListener(CUSTOM_THEME_PREVIEW_EVENT, (e) => {
  const customEvent = e as CustomEvent<{
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
window.setInterval(scheduleApplyThemeOnLocationChange, 250)
