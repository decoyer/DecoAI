export type CustomBgOptions = {
  scaleX: number
  invert: number
  grayscale: number
  blur: number
  brightness: number
  position: string
  glassBlur: number
  opacity: number
  hideHeader: boolean
  hideFooter: boolean
}
export type CustomTheme = {
  id: string
  name: string
  text: string
  accent: string
  bgUrl: string
  bgColor: string
  bgOptions: CustomBgOptions
}

export type SiteType = "chatgpt" | "gemini" | "claude" | "grok"
export type ModelEnabledMap = Record<SiteType, boolean>

export type WidgetKey = "note" | "todo" | "dday" | "timer" | "stopwatch"
export type WidgetInstance = {
  id: string
  type: WidgetKey
  name?: string
}
export type WidgetEnabledMap = Record<WidgetKey, boolean>
export type WidgetLayoutOptions = {
  textColor: string
  backgroundColor: string
  accentColor: string
  opacity: number
  glassBlur: number
}
export type DdayWidgetState = {
  targetDate: string
}
export type TimerWidgetState = {
  timerDurationSeconds: number
  timerRemainingSeconds: number
  timerEndAt: number | null
  timerRunning: boolean
}
export type StopwatchWidgetState = {
  stopwatchElapsedMilliseconds: number
  stopwatchStartedAt: number | null
  stopwatchRunning: boolean
}
export type WidgetFrame = {
  x: number
  y: number
  width: number
  height: number
}
export type WidgetFrameMap = Record<string, WidgetFrame>
export type WidgetSize = {
  width: number
  height: number
}

type ThemeImportData = {
  app?: string
  version?: number
  customThemes?: Partial<CustomTheme>[]
}

export const CUSTOM_THEMES_STORAGE_KEY = "custom-themes"
export const SELECTED_CUSTOM_THEME_ID_STORAGE_KEY = "selected-custom-theme-id"
export const SELECTED_THEME_STORAGE_KEY = "selected-theme"
export const FAB_HIDDEN_STORAGE_KEY = "fab-hidden"
export const THEME_HIDDEN_STORAGE_KEY = "theme-hidden"
export const WIDGET_HIDDEN_STORAGE_KEY = "widget-hidden"
export const MODEL_ENABLED_STORAGE_KEY = "model-enabled-map"
export const WIDGET_ENABLED_STORAGE_KEY = "widget-enabled-map"
export const WIDGET_LAYOUT_STORAGE_KEY = "widget-layout"
export const WIDGET_FRAME_STORAGE_KEY = "widget-frame-map"
export const WIDGET_INSTANCES_STORAGE_KEY = "widget-instances"
export const TIMER_WIDGET_STATE_STORAGE_KEY = "timer-widget-state"
export const STOPWATCH_WIDGET_STATE_STORAGE_KEY = "stopwatch-widget-state"
export const DDAY_WIDGET_STATE_STORAGE_KEY = "dday-widget-state"
export const CUSTOM_THEME_LAYOUT_STORAGE_KEY = "custom-theme-layout-map"
export const THEME_LOADING_EVENT = "decoai:theme-loading"
export const FAB_OPEN_EVENT = "decoai:fab-open"
export const CUSTOM_THEME_PREVIEW_EVENT = "decoai:custom-theme-preview"
export const WIDGET_LAYOUT_PREVIEW_EVENT = "decoai:widget-layout-preview"
export const THEME_FILE_APP_ID = "decoai"
export const THEME_FILE_VERSION = 1
export const IMAGE_HEADER_BYTES = 64 * 1024
export const DATA_URL_SAMPLE_CHARS = 96 * 1024
export const MAX_FILE_BYTES = 10 * 1024 * 1024

export const DEFAULT_CUSTOM_BG_OPTIONS: CustomBgOptions = {
  scaleX: 1,
  invert: 0,
  grayscale: 0,
  blur: 0,
  brightness: 1,
  position: "50% 50%",
  glassBlur: 10,
  opacity: 0.8,
  hideHeader: false,
  hideFooter: false
}

export const DEFAULT_MODEL_ENABLED: ModelEnabledMap = {
  chatgpt: true,
  gemini: true,
  claude: true,
  grok: true
}

export const DEFAULT_WIDGET_INSTANCES: WidgetInstance[] = [
  { id: "note", type: "note" },
  { id: "todo", type: "todo" },
  { id: "dday", type: "dday" },
  { id: "timer", type: "timer" },
  { id: "stopwatch", type: "stopwatch" }
]

export const DEFAULT_WIDGET_ENABLED: WidgetEnabledMap = {
  note: false,
  todo: false,
  dday: false,
  timer: false,
  stopwatch: false
}

export const DEFAULT_WIDGET_LAYOUT: WidgetLayoutOptions = {
  textColor: "",
  backgroundColor: "",
  accentColor: "",
  opacity: DEFAULT_CUSTOM_BG_OPTIONS.opacity,
  glassBlur: DEFAULT_CUSTOM_BG_OPTIONS.glassBlur
}

export const DEFAULT_DDAY_WIDGET_STATE: DdayWidgetState = {
  targetDate: ""
}

export const DEFAULT_TIMER_WIDGET_STATE: TimerWidgetState = {
  timerDurationSeconds: 300,
  timerRemainingSeconds: 300,
  timerEndAt: null,
  timerRunning: false
}

export const DEFAULT_STOPWATCH_WIDGET_STATE: StopwatchWidgetState = {
  stopwatchElapsedMilliseconds: 0,
  stopwatchStartedAt: null,
  stopwatchRunning: false
}

export const DEFAULT_WIDGET_MIN_SIZE: WidgetSize = {
  width: 250,
  height: 150
}

export const IMAGE_SOURCE_URLS = new Set([
  "https://bing.biturl.top/?format=image&index=random&mkt=random",
  "https://decoai.cokr.workers.dev/apod",
  "https://wallpaperaccess.com/full/2068583.jpg",
  "https://wallpapercave.com/wp/wp11886768.jpg",
  "https://wallpaperaccess.com/full/1461802.jpg",
  "https://i.imgur.com/H1rtAbm.png"
])

export const detectCurrentSite = (): SiteType | null => {
  const { hostname } = window.location
  if (hostname.includes("chatgpt.com")) return "chatgpt"
  if (hostname.includes("gemini.google.com")) return "gemini"
  if (hostname.includes("claude.ai")) return "claude"
  if (hostname.includes("grok.com")) return "grok"

  return null
}

export const clampNumber = (
  value: unknown,
  min: number,
  max: number,
  fallback: number
) => {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return fallback
  return Math.min(max, Math.max(min, numberValue))
}

export const sanitizeColor = (value: unknown) => {
  if (typeof value !== "string") return ""
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) ? value : ""
}

export const sanitizeCustomBgUrl = (value: unknown) => {
  if (typeof value !== "string" || !value) return ""
  return /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,/i.test(value)
    ? value
    : ""
}

export const sanitizePosition = (value: unknown) => {
  const position = String(value)
  const percentMatch = position.match(
    /^(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%$/
  )
  if (percentMatch) {
    return `${clampNumber(percentMatch[1], 0, 100, 50)}% ${clampNumber(
      percentMatch[2],
      0,
      100,
      50
    )}%`
  }

  return DEFAULT_CUSTOM_BG_OPTIONS.position
}

const getSanitizedPositionPercentPair = (value: unknown) => {
  const position = sanitizePosition(value)
  const percentMatch = position.match(/^(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/)

  return {
    x: percentMatch ? clampNumber(percentMatch[1], 0, 100, 50) : 50,
    y: percentMatch ? clampNumber(percentMatch[2], 0, 100, 50) : 50
  }
}

export const getPositionXPercent = (value: unknown) => {
  return getSanitizedPositionPercentPair(value).x
}

export const getPositionYPercent = (value: unknown) => {
  return getSanitizedPositionPercentPair(value).y
}

export const sanitizeCustomBgOptions = (
  options?: Partial<CustomBgOptions>
): CustomBgOptions => ({
  scaleX: options?.scaleX === -1 ? -1 : 1,
  invert: clampNumber(options?.invert, 0, 1, DEFAULT_CUSTOM_BG_OPTIONS.invert),
  grayscale: clampNumber(options?.grayscale, 0, 1, DEFAULT_CUSTOM_BG_OPTIONS.grayscale),
  blur: clampNumber(options?.blur, 0, 50, DEFAULT_CUSTOM_BG_OPTIONS.blur),
  brightness: clampNumber(options?.brightness, 0, 5, DEFAULT_CUSTOM_BG_OPTIONS.brightness),
  position: sanitizePosition(options?.position),
  glassBlur: clampNumber(options?.glassBlur, 0, 50, DEFAULT_CUSTOM_BG_OPTIONS.glassBlur),
  opacity: clampNumber(options?.opacity, 0, 1, DEFAULT_CUSTOM_BG_OPTIONS.opacity),
  hideHeader: options?.hideHeader === true,
  hideFooter: options?.hideFooter === true
})

export const renderImageToCanvas = async (
  imageSource: string,
  options?: Partial<CustomBgOptions>,
  maxSize = 256
) => {
  const imageUrl = sanitizeCustomBgUrl(imageSource)
  const imageOptions = sanitizeCustomBgOptions(options)
  const position = getSanitizedPositionPercentPair(imageOptions.position)

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const nextImage = new Image()
    nextImage.onload = () => resolve(nextImage)
    nextImage.onerror = () => reject()
    nextImage.src = imageUrl
  })

  const canvas = document.createElement("canvas")
  canvas.width = maxSize
  canvas.height = maxSize

  const context = canvas.getContext("2d")
  const scale = Math.max(
    canvas.width / image.naturalWidth,
    canvas.height / image.naturalHeight
  )
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  const drawX = (canvas.width - drawWidth) * (position.x / 100)
  const drawY = (canvas.height - drawHeight) * (position.y / 100)

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.filter = `invert(${imageOptions.invert}) grayscale(${imageOptions.grayscale}) blur(${imageOptions.blur}px) brightness(${imageOptions.brightness})`
  context.save()
  if (imageOptions.scaleX === -1) {
    context.translate(canvas.width, 0)
    context.scale(-1, 1)
  }
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight)
  context.restore()
  context.filter = "none"

  return canvas
}

export const normalizeCustomTheme = (
  themeData: Partial<CustomTheme>,
  fallbackName: string
): CustomTheme => ({
  id: crypto.randomUUID(),
  name: String(themeData.name || fallbackName).slice(0, 10),
  text: sanitizeColor(themeData.text),
  accent: sanitizeColor(themeData.accent),
  bgUrl: sanitizeCustomBgUrl(themeData.bgUrl),
  bgColor: sanitizeColor(themeData.bgColor),
  bgOptions: sanitizeCustomBgOptions(themeData.bgOptions)
})

export const createCustomTheme = (name: string): CustomTheme => ({
  id: crypto.randomUUID(),
  name,
  text: "",
  accent: "",
  bgUrl: "",
  bgColor: "",
  bgOptions: { ...DEFAULT_CUSTOM_BG_OPTIONS }
})

export const parseImportedThemes = (
  text: string,
  getFallbackName: (index: number) => string
) => {
  const data = JSON.parse(text) as ThemeImportData
  if (data.app !== THEME_FILE_APP_ID || data.version !== THEME_FILE_VERSION) return []

  const themes = Array.isArray(data.customThemes) ? data.customThemes : []

  return themes.map((theme, index) =>
    normalizeCustomTheme(theme, getFallbackName(index))
  )
}

export const createThemeExportBlob = (themeData: CustomTheme) =>
  new Blob(
    [
      JSON.stringify(
        {
          app: THEME_FILE_APP_ID,
          version: THEME_FILE_VERSION,
          exportedAt: new Date().toISOString(),
          customThemes: [themeData]
        }
      )
    ],
    { type: "application/json" }
  )

const decoder = new TextDecoder("latin1")
const GIF_SIGNATURE = [0x47, 0x49, 0x46] as const
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47] as const
const ANIMATED_MARKERS = ["avis", "msf1", "aseq"] as const
const startsWith = (bytes: Uint8Array, signature: readonly number[]) =>
  signature.every((byte, i) => bytes[i] === byte)

export const isAnimatedBytes = (bytes: Uint8Array) => {
  const text = decoder.decode(bytes)

  if (startsWith(bytes, GIF_SIGNATURE)) return text.includes("NETSCAPE2.0")
  if (startsWith(bytes, PNG_SIGNATURE)) return text.includes("acTL")
  if (text.includes("WEBP")) return text.includes("ANIM")

  return (
    (text.includes("ftypavif") || text.includes("ftypavis")) &&
    ANIMATED_MARKERS.some((marker) => text.includes(marker))
  )
}

export const isAnimatedImage = async (file: File) => {
  const buffer = await file.slice(0, IMAGE_HEADER_BYTES).arrayBuffer()
  return isAnimatedBytes(new Uint8Array(buffer))
}

export const getAlignedBase64Chunk = (text: string) => {
  const chunk = text.slice(0, DATA_URL_SAMPLE_CHARS)
  return chunk.slice(0, chunk.length - (chunk.length % 4))
}

export const isAnimatedDataUrl = (dataUrl: string) => {
  try {
    if (!dataUrl.startsWith("data:image/")) return false

    const commaIndex = dataUrl.indexOf(",")
    if (commaIndex < 0) return false

    const metadata = dataUrl.slice(0, commaIndex)
    const payload = dataUrl.slice(commaIndex + 1)

    const raw = metadata.includes(";base64")
      ? atob(getAlignedBase64Chunk(payload))
      : decodeURIComponent(payload.slice(0, DATA_URL_SAMPLE_CHARS))

    const bytes = new Uint8Array(Math.min(raw.length, IMAGE_HEADER_BYTES))

    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = raw.charCodeAt(index)
    }

    return isAnimatedBytes(bytes)
  } catch {
    return false
  }
}

export const isAnimatedBgUrl = (value: string) =>
  value ? isAnimatedDataUrl(value) : false

export const hasAnimatedBackground = (themes: CustomTheme[]) =>
  themes.some((theme) => isAnimatedBgUrl(theme.bgUrl))

export const isAnimatedCustomTheme = (theme: CustomTheme) =>
  isAnimatedBgUrl(theme.bgUrl)

export const clearAnimatedBgUrl = (theme: CustomTheme) =>
  isAnimatedCustomTheme(theme) ? { ...theme, bgUrl: "" } : theme
