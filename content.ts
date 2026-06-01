import { Storage } from "@plasmohq/storage"
import { Vibrant } from "node-vibrant/browser"
import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: [
    "https://chatgpt.com/*",
    "https://gemini.google.com/*",
    "https://claude.ai/*",
    "https://grok.com/*",
  ],
  run_at: "document_start"
}

interface ThemeConfig {
  bgUrl: string
  accentColor: string
  lightTextColor: string
  darkTextColor: string
}

interface CustomBgOptions {
  scaleX: number
  invert: number
  grayscale: number
  blur: number
  brightness: number
  position: string
}

type SiteType = "chatgpt" | "gemini" | "claude" | "grok"
type ThemeName = "random" | "nasa" | "neon" | "pink" | "vintage" | "fractal" | "terminal" | "custom" | "default"
type ModelEnabledMap = { chatgpt: boolean; gemini: boolean; claude: boolean; grok: boolean }

const SITE_SELECTORS = {
  chatgpt: {
    container: "#main, body",
    elements: '[data-testid="use-case-prompt-chips"] button, .agent-turn, .user-message-bubble-color, .shadow-short-composer',
    darkClass: "html.dark"
  },
  gemini: {
    container: "#main, body",
    elements: "model-response, .dual-response-panel, .user-query-bubble-with-background, .input-box-shadow",
    darkClass: "body.dark-theme"
  },
  claude: {
    container: "#main, body",
    elements: 'li.inline-block button, .font-claude-response, div[data-user-message-bubble="true"], .\\!box-content',
    darkClass: 'html[data-mode="dark"]'
  },
  grok: {
    container: "#main, body",
    elements: '[data-testid="assistant-message"], [data-testid="user-message"], .query-bar',
    darkClass: "html.dark"
  },
}

const storage = new Storage()
let applyThemeQueued = false
let currentLocation = location.href

const EMPTY_THEME: ThemeConfig = { bgUrl: "", accentColor: "", lightTextColor: "", darkTextColor: "" }

const TERMINAL_THEME: ThemeConfig = {
  bgUrl: "",
  accentColor: "#33ff33",
  lightTextColor: "#33ff33",
  darkTextColor: "#33ff33"
}

const DEFAULT_CUSTOM_BG_OPTIONS: CustomBgOptions = {
  scaleX: 1,
  invert: 0,
  grayscale: 0,
  blur: 0,
  brightness: 1,
  position: "center center"
}

const THEME_BG_URLS: Partial<Record<ThemeName, string>> = {
  random: "https://bing.biturl.top/?format=image&index=random&mkt=random",
  nasa: "https://kasutamu.cokr.workers.dev/apod",
  neon: "https://wallpaperaccess.com/full/2068583.jpg",
  pink: "https://wallpapercave.com/wp/wp11886768.jpg",
  vintage: "https://wallpaperaccess.com/full/1461802.jpg",
  fractal: "https://i.imgur.com/H1rtAbm.png"
}

const detectCurrentSite = (): SiteType | null => {
  const { hostname } = window.location
  if (hostname.includes("chatgpt.com")) return "chatgpt"
  if (hostname.includes("gemini.google.com")) return "gemini"
  if (hostname.includes("claude.ai")) return "claude"
  if (hostname.includes("grok.com")) return "grok"

  return null
}

const isThemeAllowedForCurrentUrl = (site: SiteType) => {
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

const getThemeStyle = () => {
  let style = document.getElementById("ai-theme-style") as HTMLStyleElement | null
  if (!style) {
    style = document.createElement("style")
    style.id = "ai-theme-style"
      ; (document.head || document.documentElement).appendChild(style)
  }
  return style
}

const convertToDataUrl = async (url: string): Promise<string> =>
  new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "FETCH_IMAGE_AS_DATA_URL", url },
      (response) => resolve(response?.success ? response.dataUrl : "")
    )
  })

const getPaletteData = async (bgUrl: string): Promise<ThemeConfig> => {
  try {
    const palette = await Vibrant.from(bgUrl).getPalette()
    return {
      bgUrl,
      accentColor: palette.Vibrant?.hex || "",
      lightTextColor: palette.DarkVibrant?.hex || "",
      darkTextColor: palette.LightVibrant?.hex || ""
    }
  } catch {
    return { ...EMPTY_THEME, bgUrl }
  }
}

const getCustomThemeData = async (): Promise<ThemeConfig> => {
  const [bgResult, textColor, accentColor] = await Promise.all([
    chrome.storage.local.get("custom-bg-image"),
    storage.get<string>("custom-text-color"),
    storage.get<string>("custom-text-accent")
  ])

  return {
    bgUrl: bgResult["custom-bg-image"] || "",
    accentColor: accentColor || "",
    lightTextColor: textColor || "",
    darkTextColor: textColor || ""
  }
}

const getThemeData = async (theme: string): Promise<ThemeConfig> => {
  switch (theme) {
    case "terminal": return TERMINAL_THEME
    case "custom": return getCustomThemeData()
    default:
      const url = THEME_BG_URLS[theme as ThemeName]
      return url ? getPaletteData(await convertToDataUrl(url)) : EMPTY_THEME
  }
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
  const options = await storage.get<Partial<CustomBgOptions>>("custom-bg-options")
  if (!options) return DEFAULT_CUSTOM_BG_OPTIONS

  return {
    ...DEFAULT_CUSTOM_BG_OPTIONS,
    ...options
  }
}

const generateCSS = (
  site: SiteType,
  { bgUrl, accentColor, lightTextColor, darkTextColor }: ThemeConfig,
  customBgOptions?: CustomBgOptions
) => {
  const config = SITE_SELECTORS[site]
  if (!config) return ""

  const { elements, darkClass, container } = config
  const darkSelectors = mapSelectors(elements, { prefix: `${darkClass} ` })
  const hoverSelectors = mapSelectors(elements, { suffix: ":hover" })

  const position = customBgOptions?.position || "center center"
  const scaleX = customBgOptions?.scaleX || 1
  const invert = customBgOptions?.invert ?? 0
  const grayscale = customBgOptions?.grayscale ?? 0
  const blur = customBgOptions?.blur ?? 0
  const brightness = customBgOptions?.brightness ?? 1

  const getBgStyle = () => bgUrl ? `
    body::before {
      content: ""; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background-image: url('${bgUrl}') !important;
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
      background-color: rgba(255, 255, 255, 0.8) !important;
      box-shadow: 0 0 0 1px transparent !important;
      backdrop-filter: blur(12px) saturate(140%) !important;
      opacity: 0.9 !important;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }
    ${darkSelectors} {
      background-color: rgba(24, 24, 24, 0.8) !important;
    }
    ${hoverSelectors} {
      box-shadow: 0 0 0 1px ${accentColor}4D !important;
      opacity: 1 !important;
    }
    ${site === "chatgpt" ? `
      .agent-turn {
        margin-top: 5px !important;
        margin-bottom: 5px !important;
        padding: 10px 16px !important;
        border-radius: 22px !important;
      }
    ` : ""}
    ${site === "gemini" ? `
      .show-lm-background::before {
        background: radial-gradient(ellipse 100% 100% at center 8%, ${accentColor}2D 0, ${accentColor}2D 50%) !important;
      }
      model-response {
        padding: 20px 28px !important;
        border-radius: 40px !important;
      }
    ` : ""}
    ${site === "claude" ? `
      .font-claude-response {
        padding: 10px 16px !important;
        border-radius: 12px !important;
      }
    ` : ""}
    ${site === "grok" ? `
      [data-testid="assistant-message"] {
        padding: 8px 16px !important;
        border-radius: 24px !important;
      }
    ` : ""}
    ${accentColor ? `::-webkit-scrollbar { width: 10px !important; } ::-webkit-scrollbar-thumb { background-color: ${accentColor}4D !important; border-radius: 22px !important; }` : ""}
  `

  const getTextStyle = () => (lightTextColor && darkTextColor) ? `
    *:not(pre *) { color: ${lightTextColor} !important; }
    ${darkClass} *:not(pre *) { color: ${darkTextColor} !important; }
  ` : ""

  return [getBgStyle(), getElStyle(), getTextStyle()].join("\n")
}

const applyTheme = async () => {
  const currentSite = detectCurrentSite()
  if (!currentSite) return

  const style = getThemeStyle()
  if (!isThemeAllowedForCurrentUrl(currentSite)) {
    style.textContent = ""
    return
  }

  const [currentTheme, modelEnabled] = await Promise.all([
    storage.get<string>("selected-theme"),
    storage.get<ModelEnabledMap>("model-enabled-map")
  ])

  const isModelEnabled = modelEnabled?.[currentSite] ?? true
  if (!isModelEnabled || !currentTheme || currentTheme === "default") {
    style.textContent = ""
    return
  }

  const [themeData, customBgOptions] = await Promise.all([
    getThemeData(currentTheme),
    currentTheme === "custom" ? getCustomBgOptions() : Promise.resolve(undefined)
  ])

  style.textContent = generateCSS(currentSite, themeData, customBgOptions)
}

const scheduleApplyTheme = () => {
  if (applyThemeQueued) return
  applyThemeQueued = true
  requestAnimationFrame(() => {
    applyThemeQueued = false
    applyTheme()
  })
}

const scheduleApplyThemeOnLocationChange = () => {
  if (currentLocation === location.href) return
  currentLocation = location.href
  scheduleApplyTheme()
}

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
  "selected-theme": () => scheduleApplyTheme(),
  "custom-text-color": () => scheduleApplyTheme(),
  "custom-text-accent": () => scheduleApplyTheme(),
  "custom-bg-options": () => scheduleApplyTheme(),
  "model-enabled-map": () => scheduleApplyTheme()
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes["custom-bg-image"]) {
    scheduleApplyTheme()
  }
})

watchLocationChange()
applyTheme()
