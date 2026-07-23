export type CustomBgOptions = {
  scaleX: number
  rotation: number
  invert: number
  grayscale: number
  blur: number
  brightness: number
  position: string
  opacity: number
  hideHeader: boolean
  hideFooter: boolean
}
export type CustomTheme = {
  id: string
  name: string
  text: string
  border: string
  bgImageId: string
  bgUrl?: string
  bgAnimated: boolean
  bgColor: string
  bgOptions: CustomBgOptions
}

export type SiteType = "chatgpt" | "gemini" | "claude" | "grok"
export type ModelEnabledMap = Record<SiteType, boolean>

export type WidgetKey = "note" | "todo" | "dday" | "timer" | "stopwatch" | "photo"
export type WidgetInstance = {
  id: string
  type: WidgetKey
  name?: string
  locked?: boolean
}
export type WidgetLayoutOptions = {
  textColor: string
  backgroundColor: string
  borderColor: string
  opacity: number
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
export type PhotoWidgetState = {
  imageId: string
  animated: boolean
}
export type WidgetFrame = {
  xRatio: number
  yRatio: number
  widthRatio: number
  heightRatio: number
  rotation?: number
}
export type WidgetFrameMap = Record<string, WidgetFrame>
export type WidgetSize = {
  widthRatio: number
  heightRatio: number
}

type ThemeImportFile = {
  app?: string
  version?: number
  type?: string
  sync?: Record<string, unknown>
  local?: Record<string, unknown>
  images?: Record<string, unknown>
  customThemes?: Array<Partial<CustomTheme> & { bgUrl?: string }>
}

export type DataImportFile = {
  sync: Record<string, unknown>
  local: Record<string, unknown>
  images: Record<string, string>
  customThemes: Array<CustomTheme & { bgUrl?: string }>
  sourceThemeIds: string[]
}

export const CUSTOM_THEMES_STORAGE_KEY = "custom-themes"
export const SELECTED_CUSTOM_THEME_ID_STORAGE_KEY = "selected-custom-theme-id"
export const SELECTED_THEME_STORAGE_KEY = "selected-theme"
export const FAB_HIDDEN_STORAGE_KEY = "fab-hidden"
export const THEME_HIDDEN_STORAGE_KEY = "theme-hidden"
export const WIDGET_HIDDEN_STORAGE_KEY = "widget-hidden"
export const MODEL_ENABLED_STORAGE_KEY = "model-enabled-map"
export const WIDGET_LAYOUT_STORAGE_KEY = "widget-layout"
export const WIDGET_FRAME_STORAGE_KEY = "widget-frame-map"
export const WIDGET_INSTANCES_STORAGE_KEY = "widget-instances"
export const TEXT_WIDGET_STATE_STORAGE_KEY = "text-widget-state"
export const TIMER_WIDGET_STATE_STORAGE_KEY = "timer-widget-state"
export const STOPWATCH_WIDGET_STATE_STORAGE_KEY = "stopwatch-widget-state"
export const DDAY_WIDGET_STATE_STORAGE_KEY = "dday-widget-state"
export const PHOTO_WIDGET_STATE_STORAGE_KEY = "photo-widget-state"
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
  rotation: 0,
  invert: 0,
  grayscale: 0,
  blur: 10,
  brightness: 1,
  position: "50% 50%",
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

export const DEFAULT_WIDGET_INSTANCES: WidgetInstance[] = []

export const DEFAULT_WIDGET_LAYOUT: WidgetLayoutOptions = {
  textColor: "",
  backgroundColor: "",
  borderColor: "",
  opacity: DEFAULT_CUSTOM_BG_OPTIONS.opacity
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

export const DEFAULT_PHOTO_WIDGET_STATE: PhotoWidgetState = {
  imageId: "",
  animated: false
}

export const DEFAULT_WIDGET_MIN_SIZE: WidgetSize = {
  widthRatio: 0.12,
  heightRatio: 0.15
}

export const IMAGE_SOURCE_URLS = new Set([
  "https://bing.biturl.top/?format=image&index=random&mkt=random",
  "https://decoai.cokr.workers.dev/apod",
  "https://wallpaperaccess.com/full/2068583.jpg",
  "https://wallpapercave.com/wp/wp11886768.jpg",
  "https://wallpaperaccess.com/full/1461802.jpg",
  "https://i.imgur.com/H1rtAbm.png"
])

export const isJsonFile = (file: File) =>
  file.type === "application/json" || file.name.toLowerCase().endsWith(".json")

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

const CSS_GRADIENT_PATTERN = /^(?:repeating-)?(?:linear|radial)-gradient\(/i

export const isGradient = (value: unknown) => typeof value === "string" && CSS_GRADIENT_PATTERN.test(value.trim())

const sanitizeCssValue = (value: unknown, property: string) => {
  const nextValue = typeof value === "string" ? value.trim() : ""
  return nextValue && !/[;{}]/.test(nextValue) && CSS.supports(property, nextValue) ? nextValue : ""
}

export const sanitizeColor = (value: unknown) => sanitizeCssValue(value, "color")

export const sanitizeBg = (value: unknown) => {
  const color = sanitizeColor(value)
  if (color) return color
  return isGradient(value) ? sanitizeCssValue(value, "background-image") : ""
}

export const sanitizeCustomBgUrl = (value: unknown) => {
  if (typeof value !== "string" || !value) return ""
  return /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,/i.test(value) ? value : ""
}

const sendRuntimeMessage = <T>(message: Record<string, unknown>) =>
  new Promise<T>((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      if (!response?.success) {
        reject(new Error(response?.error || "Runtime message failed"))
        return
      }
      resolve(response as T)
    })
  })

export const saveImageDataUrl = async (dataUrl: string) => {
  const response = await sendRuntimeMessage<{ id: string }>({ type: "SAVE_IMAGE_DATA_URL", dataUrl })
  if (typeof response.id !== "string") throw new Error("Failed to save image")
  return response.id
}

export const getImageDataUrl = async (id: string) => {
  const response = await sendRuntimeMessage<{ dataUrl: string }>({ type: "GET_IMAGE_DATA_URL", id })
  return sanitizeCustomBgUrl(response.dataUrl)
}

export const deleteImageData = (id: string) =>
  sendRuntimeMessage<void>({ type: "DELETE_IMAGE", id })

export const sanitizePosition = (value: unknown) => {
  const position = String(value)
  const percentMatch = position.match(/^(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%$/)
  if (percentMatch) return `${clampNumber(percentMatch[1], 0, 100, 50)}% ${clampNumber(percentMatch[2], 0, 100, 50)}%`
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

export const normalizeBackgroundRotation = (value: unknown) => {
  const rotation = Number(value)
  if (!Number.isFinite(rotation)) return DEFAULT_CUSTOM_BG_OPTIONS.rotation
  const normalized = (Math.round(rotation / 90) * 90) % 360
  return normalized < 0 ? normalized + 360 : normalized
}

export const getRenderedBackgroundPosition = (
  value: unknown,
  rotationValue: unknown,
  scaleXValue: unknown
) => {
  const { x, y } = getSanitizedPositionPercentPair(value)
  const rotation = normalizeBackgroundRotation(rotationValue)
  const isFlipped = scaleXValue === -1

  switch (rotation) {
    case 90:
      return { x: isFlipped ? 100 - y : y, y: 100 - x }
    case 180:
      return { x: isFlipped ? x : 100 - x, y: 100 - y }
    case 270:
      return { x: isFlipped ? y : 100 - y, y: x }
    default:
      return { x: isFlipped ? 100 - x : x, y }
  }
}

export const sanitizeCustomBgOptions = (
  options?: Partial<CustomBgOptions>
): CustomBgOptions => ({
  scaleX: options?.scaleX === -1 ? -1 : 1,
  rotation: normalizeBackgroundRotation(options?.rotation),
  invert: clampNumber(options?.invert, 0, 1, DEFAULT_CUSTOM_BG_OPTIONS.invert),
  grayscale: clampNumber(options?.grayscale, 0, 1, DEFAULT_CUSTOM_BG_OPTIONS.grayscale),
  blur: clampNumber(options?.blur, 0, 50, DEFAULT_CUSTOM_BG_OPTIONS.blur),
  brightness: clampNumber(options?.brightness, 0, 5, DEFAULT_CUSTOM_BG_OPTIONS.brightness),
  position: sanitizePosition(options?.position),
  opacity: clampNumber(options?.opacity, 0, 1, DEFAULT_CUSTOM_BG_OPTIONS.opacity),
  hideHeader: options?.hideHeader === true,
  hideFooter: options?.hideFooter === true
})

export const renderImageToCanvas = async (
  imageSource = "",
  options?: Partial<CustomBgOptions>,
  maxSize = 256,
  backgroundColor = ""
) => {
  const imageUrl = sanitizeCustomBgUrl(imageSource)
  const imageOptions = sanitizeCustomBgOptions(options)
  const canvasBackground = sanitizeBg(backgroundColor)
  const position = getRenderedBackgroundPosition(imageOptions.position, imageOptions.rotation, imageOptions.scaleX)

  const image = imageUrl
    ? await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image()
      nextImage.onload = () => resolve(nextImage)
      nextImage.onerror = () => reject()
      nextImage.src = imageUrl
    })
    : null

  const canvas = document.createElement("canvas")
  canvas.width = maxSize
  canvas.height = maxSize

  const sourceCanvas = document.createElement("canvas")
  sourceCanvas.width = maxSize
  sourceCanvas.height = maxSize

  const context = canvas.getContext("2d")
  const sourceContext = sourceCanvas.getContext("2d")

  sourceContext.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height)
  if (canvasBackground) {
    const solidColor = sanitizeColor(canvasBackground)
    const gradientColors = solidColor
      ? [solidColor]
      : (canvasBackground.match(/#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b|(?:rgba?|hsla?)\([^)]*\)/gi) || [])
        .map(sanitizeColor)
        .filter(Boolean)
    if (gradientColors.length) {
      const fill = sourceContext.createLinearGradient(0, 0, sourceCanvas.width, 0)
      gradientColors.forEach((color, index) => {
        fill.addColorStop(gradientColors.length === 1 ? 0 : index / (gradientColors.length - 1), color)
      })
      sourceContext.fillStyle = gradientColors.length > 1 ? fill : gradientColors[0]
      sourceContext.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height)
    }
  }
  if (image) {
    const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight)
    const drawWidth = image.naturalWidth * scale
    const drawHeight = image.naturalHeight * scale
    const drawX = (canvas.width - drawWidth) * (position.x / 100)
    const drawY = (canvas.height - drawHeight) * (position.y / 100)

    sourceContext.save()
    sourceContext.translate(sourceCanvas.width / 2, sourceCanvas.height / 2)
    sourceContext.rotate((imageOptions.rotation * Math.PI) / 180)
    sourceContext.scale(imageOptions.scaleX, 1)
    sourceContext.translate(-sourceCanvas.width / 2, -sourceCanvas.height / 2)
    sourceContext.drawImage(image, drawX, drawY, drawWidth, drawHeight)
    sourceContext.restore()
  }

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.filter = `invert(${imageOptions.invert}) grayscale(${imageOptions.grayscale}) brightness(${imageOptions.brightness})`
  context.drawImage(sourceCanvas, 0, 0)
  context.filter = "none"

  return canvas
}

export const normalizeCustomTheme = (
  themeData: Partial<CustomTheme> & { bgUrl?: string },
  fallbackName: string
): CustomTheme & { bgUrl?: string } => {
  const bgUrl = sanitizeCustomBgUrl(themeData.bgUrl)

  return {
    id: crypto.randomUUID(),
    name: String(themeData.name || fallbackName).slice(0, 10),
    text: sanitizeColor(themeData.text),
    border: sanitizeColor(themeData.border),
    bgImageId: typeof themeData.bgImageId === "string" ? themeData.bgImageId : "",
    bgAnimated: themeData.bgAnimated === true || isAnimatedBgUrl(bgUrl),
    bgColor: sanitizeBg(themeData.bgColor),
    bgOptions: sanitizeCustomBgOptions(themeData.bgOptions),
    ...(bgUrl ? { bgUrl } : {})
  }
}

export const createCustomTheme = (name: string): CustomTheme => ({
  id: crypto.randomUUID(),
  name,
  text: "",
  border: "",
  bgImageId: "",
  bgAnimated: false,
  bgColor: "",
  bgOptions: { ...DEFAULT_CUSTOM_BG_OPTIONS }
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const parseFileData = (text: string) => {
  try {
    const data = JSON.parse(text) as ThemeImportFile
    if (data.app !== THEME_FILE_APP_ID || data.version !== THEME_FILE_VERSION) return null
    return data
  } catch {
    return null
  }
}

const getThemeSources = (data: ThemeImportFile | null) =>
  Array.isArray(data?.customThemes) ? data.customThemes : []

export const parseImportedThemes = (
  text: string,
  getFallbackName: (index: number) => string
) => {
  const data = parseFileData(text)
  if (data?.type !== "theme") return []
  const theme = getThemeSources(data)[0]
  return theme ? [normalizeCustomTheme(theme, getFallbackName(0))] : []
}

export const parseDataImportFile = (
  text: string,
  getFallbackName: (index: number) => string
): DataImportFile | null => {
  const data = parseFileData(text)
  if (data?.type !== "data" || !isRecord(data.sync) || !isRecord(data.local)) return null

  const images = Object.fromEntries(
    Object.entries(isRecord(data.images) ? data.images : {}).filter(
      ([, value]) => typeof value === "string" && Boolean(sanitizeCustomBgUrl(value))
    )
  ) as Record<string, string>
  const themeSources = getThemeSources(data)

  return {
    sync: data.sync,
    local: data.local,
    images,
    customThemes: themeSources.map((theme, index) => normalizeCustomTheme(theme, getFallbackName(index))),
    sourceThemeIds: themeSources.map((theme) => (typeof theme.id === "string" ? theme.id : ""))
  }
}

export const createExportBlob = (data: {
  type?: "data" | "theme"
  sync?: Record<string, unknown>
  local?: Record<string, unknown>
  images?: Record<string, string>
  customThemes: Array<CustomTheme & { bgUrl?: string }>
}) =>
  new Blob(
    [
      JSON.stringify(
        {
          app: THEME_FILE_APP_ID,
          version: THEME_FILE_VERSION,
          exportedAt: new Date().toISOString(),
          ...data
        }
      )
    ],
    { type: "application/json" }
  )

export const createThemeExportBlob = (themeData: CustomTheme & { bgUrl?: string }) =>
  createExportBlob({
    type: "theme",
    customThemes: [themeData]
  })

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
  themes.some((theme) => theme.bgAnimated)

export const isAnimatedCustomTheme = (theme: CustomTheme) =>
  theme.bgAnimated

export const clearAnimatedBgUrl = (theme: CustomTheme) =>
  isAnimatedCustomTheme(theme) ? { ...theme, bgImageId: "", bgAnimated: false } : theme
