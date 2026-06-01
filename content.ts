import { Storage } from "@plasmohq/storage"
import { Vibrant } from "node-vibrant/browser"
import type { PlasmoCSConfig } from "plasmo"
import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FabPanelApp } from "./panel"

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
  bgColor: string
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
let fabMounted = false
let fabOpen = false
let fabPanelRoot: Root | null = null
let cachedThemeKey: string | null = null
let cachedThemeData: ThemeConfig | null = null

const EMPTY_THEME: ThemeConfig = { bgUrl: "", bgColor: "", accentColor: "", lightTextColor: "", darkTextColor: "" }

const TERMINAL_THEME: ThemeConfig = {
  bgUrl: "",
  bgColor: "",
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

const FAB_STYLE_ID = "kasutamu-fab-style"
const FAB_ROOT_ID = "kasutamu-fab-root"
const FAB_ROOT_CLASS = "kasutamu-fab"
const FAB_OPEN_CLASS = "is-open"
const FAB_MAIN_BTN_CLASS = "kasutamu-fab-main"
const FAB_PANEL_CLASS = "kasutamu-fab-panel"
const FAB_PANEL_MOUNT_ID = "kasutamu-fab-panel-mount"
const FAB_HIDDEN_STORAGE_KEY = "fab-hidden"
const FAB_MAIN_BTN_ICON = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7.5 5.6 10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7l2.5-1.4zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14l-2.5 1.4zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5L22 2zM13.34 12.78l2.44-2.44-2.12-2.12-2.44 2.44 2.12 2.12zm1.03-5.49 2.34 2.34c.39.39.39 1.03 0 1.42l-7.66 7.66c-.39.39-1.03.39-1.42 0l-2.34-2.34a.9959.9959 0 0 1 0-1.42l7.66-7.66c.39-.39 1.03-.39 1.42 0z"></path></svg>`
const THEME_LOADING_EVENT = "kasutamu:theme-loading"

const emitThemeLoading = (loading: boolean) => {
  window.dispatchEvent(new CustomEvent(THEME_LOADING_EVENT, { detail: { loading } }))
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

const getFABStyle = () => {
  let style = document.getElementById(FAB_STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement("style")
    style.id = FAB_STYLE_ID
    style.textContent = `
      .${FAB_ROOT_CLASS} {
        position: fixed;
        right: 38px;
        bottom: 78px;
        z-index: 2147483646;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 10px;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      }

      .${FAB_MAIN_BTN_CLASS} {
        width: 45px;
        height: 45px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 999px;
        background-color: #fff;
        border: 1px solid var(--kasutamu-accent);
        color: #66cdaa;
        cursor: pointer;
        opacity: 0.8;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .${FAB_PANEL_CLASS} {
        display: block;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 14px;
        backdrop-filter: blur(10px);
        box-shadow: inset 0 2px 16px var(--kasutamu-accent);
        opacity: 0;
        pointer-events: none;
        visibility: hidden;
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .${FAB_ROOT_CLASS}.${FAB_OPEN_CLASS} .${FAB_PANEL_CLASS} {
        opacity: 0.8;
        pointer-events: auto;
        visibility: visible;
      }

      .${FAB_MAIN_BTN_CLASS}:hover {
        opacity: 1;
      }

      .${FAB_ROOT_CLASS}.${FAB_OPEN_CLASS} .${FAB_PANEL_CLASS}:hover {
        opacity: 1;
      }
    `
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
      bgColor: "",
      accentColor: palette.Vibrant?.hex || "",
      lightTextColor: palette.DarkVibrant?.hex || "",
      darkTextColor: palette.LightVibrant?.hex || ""
    }
  } catch {
    return { ...EMPTY_THEME, bgUrl }
  }
}

const getCustomThemeData = async (): Promise<ThemeConfig> => {
  const [bgResult, bgColor, textColor, accentColor] = await Promise.all([
    chrome.storage.local.get("custom-bg-image"),
    storage.get<string>("custom-bg-color"),
    storage.get<string>("custom-text-color"),
    storage.get<string>("custom-text-accent")
  ])

  return {
    bgUrl: bgResult["custom-bg-image"] || "",
    bgColor: bgColor || "",
    accentColor: accentColor || "",
    lightTextColor: textColor || "",
    darkTextColor: textColor || ""
  }
}

const getThemeData = async (theme: string): Promise<ThemeConfig> => {
  if (cachedThemeKey === theme && cachedThemeData) {
    return cachedThemeData
  }

  let nextThemeData: ThemeConfig

  switch (theme) {
    case "terminal":
      nextThemeData = TERMINAL_THEME
      break
    case "custom":
      nextThemeData = await getCustomThemeData()
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
  root.style.setProperty("--kasutamu-accent", (accentColor || "#66cdaa") + "4D")
}

const setFabVisibility = async () => {
  const root = document.getElementById(FAB_ROOT_ID)
  if (!root) return
  const isHidden = (await storage.get<boolean>(FAB_HIDDEN_STORAGE_KEY)) === true
  root.style.display = isHidden ? "none" : "flex"
}

const onOutsideFabClick = (event: MouseEvent) => {
  const root = document.getElementById(FAB_ROOT_ID)
  if (!root) return
  const target = event.target as Node
  if (!root.contains(target)) closeFabDock()
}

const mountFab = async () => {
  if (fabMounted || document.getElementById(FAB_ROOT_ID)) {
    fabMounted = true
    return
  }

  getFABStyle()
  const root = document.createElement("div")
  root.id = FAB_ROOT_ID
  root.className = FAB_ROOT_CLASS

  const panel = document.createElement("aside")
  panel.className = FAB_PANEL_CLASS
  const panelHost = document.createElement("div")
  panelHost.id = FAB_PANEL_MOUNT_ID
  panelHost.style.width = "100%"
  panelHost.style.height = "100%"
  panel.appendChild(panelHost)

  const mainButton = document.createElement("button")
  mainButton.type = "button"
  mainButton.className = FAB_MAIN_BTN_CLASS
  mainButton.setAttribute("aria-label", "Open theme quick menu")
  mainButton.innerHTML = FAB_MAIN_BTN_ICON
  mainButton.addEventListener("click", (event) => {
    event.stopPropagation()
    fabOpen = !fabOpen
    root.classList.toggle(FAB_OPEN_CLASS, fabOpen)
  })

  root.appendChild(panel)
  root.appendChild(mainButton)
    ; (document.body || document.documentElement).appendChild(root)
  document.addEventListener("click", onOutsideFabClick, { capture: true })
  const shadowRoot = panelHost.attachShadow({ mode: "open" })
  const shadowMount = document.createElement("div")
  shadowMount.style.width = "100%"
  shadowMount.style.height = "100%"
  shadowRoot.appendChild(shadowMount)

  fabPanelRoot = createRoot(shadowMount)
  fabPanelRoot.render(createElement(FabPanelApp))

  fabMounted = true
  await setFabVisibility()
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
  { bgUrl, bgColor, accentColor, lightTextColor, darkTextColor }: ThemeConfig,
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

  const getBgStyle = () => (bgUrl || bgColor) ? `
    body::before {
      content: ""; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      ${bgUrl ? `background-image: url('${bgUrl}') !important;` : "background-image: none !important;"}
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
      background-color: rgba(255, 255, 255, 0.8) !important;
      box-shadow: inset 0 2px 16px ${accentColor}4D !important;
      backdrop-filter: blur(12px) saturate(140%) !important;
      opacity: 0.9 !important;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }
    ${darkSelectors} {
      background-color: rgba(24, 24, 24, 0.8) !important;
    }
    ${hoverSelectors} {
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
    ${accentColor ? `::-webkit-scrollbar { width: auto !important; }::-webkit-scrollbar-thumb { background-color: ${accentColor}4D !important; border-radius: 22px !important; }` : ""}
  `

  const getTextStyle = () => (lightTextColor && darkTextColor) ? `
    *:not(pre *) { color: ${lightTextColor} !important; }
    ${darkClass} *:not(pre *) { color: ${darkTextColor} !important; }
  ` : ""

  return [getBgStyle(), getElStyle(), getTextStyle()].join("\n")
}

const applyTheme = async () => {
  await mountFab()
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
    setFabAccentColor("")
    return
  }

  const [themeData, customBgOptions] = await Promise.all([
    getThemeData(currentTheme),
    currentTheme === "custom" ? getCustomBgOptions() : Promise.resolve(undefined)
  ])

  style.textContent = generateCSS(currentSite, themeData, customBgOptions)
  setFabAccentColor(themeData.accentColor)
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

const invalidateThemeCache = () => {
  cachedThemeKey = null
  cachedThemeData = null
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
  "selected-theme": () => {
    invalidateThemeCache()
    scheduleApplyTheme()
  },
  "custom-text-color": () => {
    invalidateThemeCache()
    scheduleApplyTheme()
  },
  "custom-text-accent": () => {
    invalidateThemeCache()
    scheduleApplyTheme()
  },
  "custom-bg-color": () => {
    invalidateThemeCache()
    scheduleApplyTheme()
  },
  "custom-bg-options": () => {
    invalidateThemeCache()
    scheduleApplyTheme()
  },
  "model-enabled-map": () => scheduleApplyTheme(),
  "fab-hidden": () => setFabVisibility()
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes["custom-bg-image"]) {
    invalidateThemeCache()
    scheduleApplyTheme()
  }
})

watchLocationChange()
applyTheme()
