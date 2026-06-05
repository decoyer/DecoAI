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

type ThemeImportData = {
  app?: string
  version?: number
  customThemes?: Partial<CustomTheme>[]
  themes?: Partial<CustomTheme>[]
}

export const THEME_FILE_APP_ID = "kasutamu"
export const THEME_FILE_VERSION = 1
export const IMAGE_HEADER_BYTES = 64 * 1024
export const DATA_URL_SAMPLE_CHARS = 96 * 1024
export const MAX_FILE_BYTES = 10 * 1024 * 1024

export const CUSTOM_THEME_LEGACY_STORAGE_KEYS = [
  "custom-bg-image",
  "custom-bg-color",
  "custom-text-color",
  "custom-text-accent",
  "custom-bg-options"
]

export const DEFAULT_CUSTOM_BG_OPTIONS: CustomBgOptions = {
  scaleX: 1,
  invert: 0,
  grayscale: 0,
  blur: 0,
  brightness: 1,
  position: "center center",
  glassBlur: 10,
  opacity: 0.8,
  hideHeader: false,
  hideFooter: false
}

export const ALLOWED_IMAGE_SOURCE_URLS = new Set([
  "https://bing.biturl.top/?format=image&index=random&mkt=random",
  "https://kasutamu.cokr.workers.dev/apod",
  "https://wallpaperaccess.com/full/2068583.jpg",
  "https://wallpapercave.com/wp/wp11886768.jpg",
  "https://wallpaperaccess.com/full/1461802.jpg",
  "https://i.imgur.com/H1rtAbm.png"
])

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

export const sanitizePosition = (value: unknown) =>
  ["center top", "center center", "center bottom"].includes(String(value))
    ? String(value)
    : DEFAULT_CUSTOM_BG_OPTIONS.position

export const sanitizeCustomBgOptions = (
  options?: Partial<CustomBgOptions>
): CustomBgOptions => ({
  scaleX: options?.scaleX === -1 ? -1 : 1,
  invert: clampNumber(options?.invert, 0, 1, DEFAULT_CUSTOM_BG_OPTIONS.invert),
  grayscale: clampNumber(
    options?.grayscale,
    0,
    1,
    DEFAULT_CUSTOM_BG_OPTIONS.grayscale
  ),
  blur: clampNumber(options?.blur, 0, 50, DEFAULT_CUSTOM_BG_OPTIONS.blur),
  brightness: clampNumber(
    options?.brightness,
    0,
    5,
    DEFAULT_CUSTOM_BG_OPTIONS.brightness
  ),
  position: sanitizePosition(options?.position),
  glassBlur: clampNumber(
    options?.glassBlur,
    0,
    50,
    DEFAULT_CUSTOM_BG_OPTIONS.glassBlur
  ),
  opacity: clampNumber(
    options?.opacity,
    0,
    1,
    DEFAULT_CUSTOM_BG_OPTIONS.opacity
  ),
  hideHeader: options?.hideHeader === true,
  hideFooter: options?.hideFooter === true
})

export const normalizeCustomTheme = (
  themeData: Partial<CustomTheme>,
  index: number,
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
  if (data.app !== THEME_FILE_APP_ID || data.version !== THEME_FILE_VERSION) {
    return []
  }

  const themes = Array.isArray(data.customThemes)
    ? data.customThemes
    : data.themes || []

  return themes.map((theme, index) =>
    normalizeCustomTheme(theme, index, getFallbackName(index))
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
        },
        null,
        2
      )
    ],
    { type: "application/json" }
  )

export const isAnimatedBytes = (bytes: Uint8Array) => {
  const text = new TextDecoder("latin1").decode(bytes)
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return text.includes("NETSCAPE2.0")
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return text.includes("acTL")
  }
  if (text.includes("WEBP")) return text.includes("ANIM")
  if (text.includes("ftypavif") || text.includes("ftypavis")) {
    return (
      text.includes("avis") || text.includes("msf1") || text.includes("aseq")
    )
  }
  return false
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
}

export const hasAnimatedBackground = (themes: CustomTheme[]) =>
  themes.some((theme) => {
    try {
      return isAnimatedDataUrl(theme.bgUrl)
    } catch {
      return false
    }
  })
