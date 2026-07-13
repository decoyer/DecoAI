import { Icon } from "@iconify/react"
import { Storage } from "@plasmohq/storage"
import { useStorage } from "@plasmohq/storage/hook"
import { Vibrant } from "node-vibrant/browser"
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import SortableList, { SortableItem } from "react-easy-sort"
import Tilt from "react-parallax-tilt"
import { toast } from "react-toastify"

import {
  AUTH_REFRESH_MS,
  AUTH_SESSION_STORAGE_KEY,
  getCurrentUserIdToken,
  getValidAuthSessionSnapshot,
  getVerifiedPremiumStatus,
  signInAndSaveAuthSession,
  type AuthSessionSnapshot,
  type PremiumStatus
} from "./auth"
import {
  clearAnimatedBgUrl,
  createCustomTheme,
  createThemeExportBlob,
  CUSTOM_THEME_PREVIEW_EVENT,
  CUSTOM_THEMES_STORAGE_KEY,
  DEFAULT_CUSTOM_BG_OPTIONS,
  DEFAULT_WIDGET_ENABLED,
  DEFAULT_WIDGET_INSTANCES,
  DEFAULT_WIDGET_LAYOUT,
  deleteImageData,
  detectCurrentSite,
  FAB_OPEN_EVENT,
  getImageDataUrl,
  getPositionXPercent,
  getPositionYPercent,
  hasAnimatedBackground,
  isAnimatedBgUrl,
  isAnimatedImage,
  isJsonFile,
  MAX_FILE_BYTES,
  parseImportedThemes,
  renderImageToCanvas,
  sanitizeCustomBgUrl,
  saveImageDataUrl,
  SELECTED_CUSTOM_THEME_ID_STORAGE_KEY,
  SELECTED_THEME_STORAGE_KEY,
  THEME_LOADING_EVENT,
  WIDGET_ENABLED_STORAGE_KEY,
  WIDGET_INSTANCES_STORAGE_KEY,
  WIDGET_LAYOUT_PREVIEW_EVENT,
  WIDGET_LAYOUT_STORAGE_KEY,
  type CustomBgOptions,
  type CustomTheme,
  type SiteType,
  type WidgetEnabledMap,
  type WidgetInstance,
  type WidgetKey,
  type WidgetLayoutOptions
} from "./utils"

const t = (key: string, value?: string) => chrome.i18n.getMessage(key, value)
const localStorageInstance = new Storage({ area: "local" })

const THEME_LIST = [
  { key: "random", color: "#ddd", emoji: "🎲" },
  { key: "nasa", color: "#0b3d91", emoji: "🪐" },
  { key: "neon", color: "#8f00ff", emoji: "💫" },
  { key: "pink", color: "#ff3cac", emoji: "💗" },
  { key: "vintage", color: "#400000", emoji: "🎻" },
  { key: "fractal", color: "#f5de10", emoji: "🌈" },
  { key: "terminal", color: "#000", emoji: "📟" },
  { key: "default", color: "#666", emoji: "⚙️" }
]

const SITE_DARK_SELECTORS: Record<SiteType, string> = {
  chatgpt: "html.dark",
  gemini: "body.dark-theme",
  claude: 'html[data-mode="dark"]',
  grok: "html.dark"
}

type PanelView = "themes" | "custom"
type PanelMode = "theme" | "widget"
type ThemeTab = "preset" | "custom"
type WidgetTab = "visibility" | "layout"
type CustomEditTab = "general" | "background" | "layout"

const WIDGET_LIST: Array<{ key: WidgetKey; labelKey: string; icon: string }> = [
  { key: "note", labelKey: "noteWidget", icon: "notepad-text" },
  { key: "todo", labelKey: "todoWidget", icon: "list-checks" },
  { key: "dday", labelKey: "ddayWidget", icon: "calendar-1" },
  { key: "timer", labelKey: "timerWidget", icon: "alarm-clock" },
  { key: "stopwatch", labelKey: "stopwatchWidget", icon: "timer" },
  { key: "photo", labelKey: "photoWidget", icon: "sticker" }
]

const themeTiltProps = {
  glareEnable: true,
  glareBorderRadius: "12px",
  glareMaxOpacity: 0.2,
  glarePosition: "all" as const,
  tiltMaxAngleX: 12,
  tiltMaxAngleY: 12
}

const isSameWidgetLayout = (
  left: WidgetLayoutOptions,
  right: WidgetLayoutOptions
) =>
  left.textColor === right.textColor &&
  left.backgroundColor === right.backgroundColor &&
  left.accentColor === right.accentColor &&
  left.opacity === right.opacity &&
  left.glassBlur === right.glassBlur

const createWidgetInstance = (key: WidgetKey): WidgetInstance => {
  const widgetMeta = WIDGET_LIST.find((widget) => widget.key === key)

  return {
    id: key === "photo" ? `${key}-${crypto.randomUUID()}` : key,
    type: key,
    name: t(widgetMeta?.labelKey)
  }
}

const wrapperStyle = { position: "relative", width: 250, height: 500 } as const
const rootStyle = {
  width: 250,
  height: 500,
  display: "flex",
  flexDirection: "column",
  fontFamily: "sans-serif",
  color: "#fff",
  overflow: "hidden"
} as const
const contentStyle = {
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
  padding: "20px 20px 0",
  display: "flex",
  flexDirection: "column"
} as const
const themeSectionStyle = {
  marginTop: 20,
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0
} as const
const themeGridScrollStyle = {
  flex: 1,
  minHeight: 0,
  margin: "10px 5px",
  overflow: "auto"
} as const
const sectionStyle = {
  display: "flex",
  flexDirection: "column",
  padding: "10px 5px",
  gap: 8
} as const
const editSectionScrollStyle = {
  ...sectionStyle,
  flex: 1,
  minHeight: 0,
  overflowX: "hidden",
  overflowY: "auto"
} as const
const cardStyle = {
  backgroundColor: "#3f3f46",
  border: "1px solid transparent",
  borderRadius: 8,
  padding: 10
} as const
const rowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center"
} as const
const controlButtonStyle = {
  paddingTop: 4,
  paddingBottom: 4,
  backgroundColor: "#4b5563",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  whiteSpace: "nowrap",
  cursor: "pointer"
} as const
const proButtonStyle = {
  ...controlButtonStyle,
  width: "100%",
  border: "none",
  padding: 8,
  color: "#fff",
  background:
    "linear-gradient(90deg, #F472B6, #C084FC, #60A5FA, #C084FC, #F472B6)",
  backgroundSize: "500% 100%"
} as const
const iconLabelStyle = {
  display: "flex",
  alignItems: "center",
  gap: 4
} as const
const centeredHeadingStyle = {
  margin: 0,
  textAlign: "center"
} as const
const tabGridStyle = {
  display: "grid",
  gap: 8,
  borderBottom: "2px solid #66cdaa"
} as const
const twoColumnGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: 8
} as const
const fieldLabelStyle = {
  padding: "4px 0px"
} as const
const columnControlStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 8
} as const
const textInputStyle = {
  width: 125,
  border: "none",
  borderRadius: 8,
  padding: "8px 4px",
  textAlign: "center",
  backgroundColor: "#4b5563",
  color: "#fff",
  userSelect: "text",
  WebkitUserSelect: "text"
} as const
const footerButtonStyle = {
  ...controlButtonStyle,
  display: "flex",
  flex: 1,
  justifyContent: "center",
  padding: 8
} as const

const downloadCustomTheme = async (themeData: CustomTheme) => {
  const bgUrl = themeData.bgImageId ? await getImageDataUrl(themeData.bgImageId).catch(() => "") : ""
  const blob = createThemeExportBlob({ ...themeData, ...(bgUrl ? { bgUrl } : {}) })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `decoai-theme-${themeData.name}.json`
  link.click()
  URL.revokeObjectURL(url)
}

const disabledControlStyle = (enabled: boolean) =>
  ({ opacity: enabled ? 1 : 0.5, pointerEvents: enabled ? "auto" : "none" }) as const

const clearFileInput = (input: HTMLInputElement | null) => {
  if (input) input.value = ""
}

const isCurrentPageDarkMode = () => {
  const currentSite = detectCurrentSite()
  return currentSite ? document.querySelector(SITE_DARK_SELECTORS[currentSite]) !== null : false
}

const wait = (ms: number) => new Promise<void>((resolve) => { window.setTimeout(resolve, ms) })

const updateCustomThemeTitleOverflow = (wrap: HTMLElement) => {
  const card = wrap.querySelector<HTMLButtonElement>(".custom-theme-card")
  const titleText = card?.querySelector<HTMLSpanElement>(".custom-theme-card__title span")
  if (!card || !titleText) return
  card.classList.remove("title-overflow")
  card.classList.toggle("title-overflow", titleText.scrollWidth > titleText.clientWidth + 1)
}

function CustomThemeSortableCard({
  item,
  theme,
  selectedCustomThemeId,
  draggingCustomThemeId,
  onCustomCardClick,
  onCustomCardDuplicateClick,
  onCustomCardDeleteClick
}: {
  item: CustomTheme
  theme: string
  selectedCustomThemeId: string
  draggingCustomThemeId: string
  onCustomCardClick: (customThemeItem: CustomTheme) => void
  onCustomCardDuplicateClick: (customThemeItem: CustomTheme) => void
  onCustomCardDeleteClick: (customThemeItem: CustomTheme) => void
}) {
  const [bgUrl, setBgUrl] = useState("")
  const isDragging = draggingCustomThemeId === item.id

  useEffect(() => {
    let active = true
    if (!item.bgImageId) {
      setBgUrl("")
      return
    }

    void getImageDataUrl(item.bgImageId)
      .then((url) => {
        if (active) setBgUrl(url)
      })
      .catch(() => {
        if (active) setBgUrl("")
      })

    return () => {
      active = false
    }
  }, [item.bgImageId])

  const bgStyle = {
    "--custom-bg-scale-x": bgUrl && item.bgOptions.scaleX === -1 ? "-1" : "1",
    backgroundImage: bgUrl ? `url(${bgUrl})` : "none",
    backgroundColor: item.bgColor || "transparent",
    filter: bgUrl
      ? `invert(${item.bgOptions.invert}) grayscale(${item.bgOptions.grayscale}) blur(${item.bgOptions.blur * 0.2}px) brightness(${item.bgOptions.brightness})`
      : "none"
  } as CSSProperties & { "--custom-bg-scale-x": string }

  return (
    <div
      className="custom-theme-card-wrap"
      onPointerEnter={(e) => updateCustomThemeTitleOverflow(e.currentTarget)}
      style={{ position: "relative", zIndex: isDragging ? 2 : "auto" }}>
      <Tilt
        {...themeTiltProps}
        className="theme-card-tilt custom-theme-card-tilt"
        tiltEnable={!isDragging}>
        <button
          type="button"
          className={`custom-theme-card${theme === "custom" && selectedCustomThemeId === item.id ? " is-active" : ""}${draggingCustomThemeId === item.id ? " is-dragging" : ""}`}
          onClick={() => onCustomCardClick(item)}>
          <div className="custom-theme-card__bg" style={bgStyle} />
          <div className="custom-theme-card__title">
            <span data-title={item.name}>{item.name}</span>
          </div>
        </button>
        {!isDragging && (
          <div className="custom-theme-card__actions">
            <button
              type="button"
              className="custom-theme-card__action custom-theme-card__duplicate"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onCustomCardDuplicateClick(item)
              }}>
              <Icon icon="lucide:copy-plus" height={16} color="#fff" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="custom-theme-card__action custom-theme-card__delete"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onCustomCardDeleteClick(item)
              }}>
              <Icon icon="lucide:trash-2" height={16} color="#fff" aria-hidden="true" />
            </button>
          </div>
        )}
      </Tilt>
    </div>
  )
}

export function FabPanelApp() {
  const panelRootRef = useRef<HTMLDivElement>(null)
  const themeGridScrollRef = useRef<HTMLDivElement>(null)
  const [theme, setTheme] = useStorage(SELECTED_THEME_STORAGE_KEY, "default")
  const [panelMode, setPanelMode] = useState<PanelMode>("theme")
  const [view, setView] = useState<PanelView>("themes")
  const [themeTab, setThemeTab] = useState<ThemeTab>("preset")
  const [widgetTab, setWidgetTab] = useState<WidgetTab>("visibility")
  const [customEditTab, setCustomEditTab] = useState<CustomEditTab>("general")
  const [widgetEnabled, setWidgetEnabled] = useStorage<WidgetEnabledMap>(
    WIDGET_ENABLED_STORAGE_KEY,
    DEFAULT_WIDGET_ENABLED
  )
  const [widgetItems, setWidgetItems] = useStorage<WidgetInstance[]>(
    WIDGET_INSTANCES_STORAGE_KEY,
    DEFAULT_WIDGET_INSTANCES
  )
  const [widgetLayout, setWidgetLayout] = useStorage<WidgetLayoutOptions>(
    WIDGET_LAYOUT_STORAGE_KEY,
    DEFAULT_WIDGET_LAYOUT
  )
  const bgUploadRef = useRef<HTMLInputElement>(null)
  const importFileRef = useRef<HTMLInputElement>(null)
  const [draftBackgroundImageUrl, setDraftBackgroundImageUrl] = useState("")
  const [draftBackgroundImageId, setDraftBackgroundImageId] = useState("")
  const [draftBackgroundAnimated, setDraftBackgroundAnimated] = useState(false)
  const [storedCustomThemes, setCustomThemes] = useStorage<CustomTheme[]>(
    { key: CUSTOM_THEMES_STORAGE_KEY, instance: localStorageInstance },
    []
  )
  const [selectedCustomThemeId, setSelectedCustomThemeId] = useStorage(
    { key: SELECTED_CUSTOM_THEME_ID_STORAGE_KEY, instance: localStorageInstance }, "")
  const [editingCustomThemeId, setEditingCustomThemeId] = useState("")
  const [premiumStatus, setPremiumStatus] = useState<PremiumStatus>("unknown")
  const [draftBackgroundOptions, setDraftBackgroundOptions] = useState<CustomBgOptions>(DEFAULT_CUSTOM_BG_OPTIONS)
  const [draftTextColor, setDraftTextColor] = useState("")
  const [draftAccentColor, setDraftAccentColor] = useState("")
  const [draftCustomThemeName, setDraftCustomThemeName] = useState("")
  const [draftBackgroundColor, setDraftBackgroundColor] = useState("")
  const [draftWidgetLayout, setDraftWidgetLayout] = useState<WidgetLayoutOptions>(DEFAULT_WIDGET_LAYOUT)
  const [isLoading, setIsLoading] = useState(false)
  const [draggingCustomThemeId, setDraggingCustomThemeId] = useState("")
  const customThemeClickRef = useRef("")
  const previousViewRef = useRef<PanelView>(view)
  const canResetText = Boolean((draftTextColor || "").trim())
  const canResetAccent = Boolean((draftAccentColor || "").trim())
  const isPremiumChecked = premiumStatus !== "unknown"
  const isPremiumUser = premiumStatus === "premium"
  const isFreeUser = premiumStatus === "free"
  const customThemes = Array.isArray(storedCustomThemes) ? storedCustomThemes : []
  const selectedCustomTheme = customThemes.find((item) => item.id === selectedCustomThemeId)
  const hasWidgetType = (key: WidgetKey) =>
    (widgetItems || DEFAULT_WIDGET_INSTANCES).some((widget) => widget.type === key)

  function stopCustomThemeDragClamp() {
    document.removeEventListener("mousemove", clampCustomThemeDrag)
  }

  function clampCustomThemeDrag() {
    const scrollArea = themeGridScrollRef.current
    const dragged = panelRootRef.current?.querySelector<HTMLElement>(".custom-theme-card-dragged")
    if (!scrollArea || !dragged) return

    dragged.style.removeProperty("translate")

    const dragRect = dragged.getBoundingClientRect()
    const scrollRect = scrollArea.getBoundingClientRect()

    const x = Math.min(Math.max(scrollRect.left - dragRect.left, 0), scrollRect.right - dragRect.right)
    const y = Math.min(Math.max(scrollRect.top - dragRect.top, 0), scrollRect.bottom - dragRect.bottom)

    dragged.style.setProperty("translate", `${x}px ${y}px`)
  }

  useEffect(() => {
    if (!customThemes.length && selectedCustomThemeId)
      setSelectedCustomThemeId("")
    if (
      selectedCustomThemeId &&
      !customThemes.some((item) => item.id === selectedCustomThemeId)
    )
      setSelectedCustomThemeId("")
  }, [customThemes, selectedCustomThemeId, setSelectedCustomThemeId])

  useEffect(() => {
    if (theme === "custom") setThemeTab("custom")
  }, [theme])

  useEffect(() => {
    if (view === "custom" && previousViewRef.current !== "custom") {
      setCustomEditTab("general")
    }
    previousViewRef.current = view
  }, [view])

  useEffect(() => {
    const nextLayout = { ...DEFAULT_WIDGET_LAYOUT, ...widgetLayout }
    setDraftWidgetLayout((prev) =>
      isSameWidgetLayout(prev, nextLayout) ? prev : nextLayout
    )
  }, [widgetLayout])

  useEffect(() => {
    if (panelMode !== "widget") return
    window.dispatchEvent(
      new CustomEvent(WIDGET_LAYOUT_PREVIEW_EVENT, {
        detail: draftWidgetLayout
      })
    )
  }, [draftWidgetLayout, panelMode])

  useEffect(() => {
    if (panelMode !== "widget") return
    const savedLayout = { ...DEFAULT_WIDGET_LAYOUT, ...widgetLayout }
    if (isSameWidgetLayout(draftWidgetLayout, savedLayout)) return

    const timeoutId = window.setTimeout(() => {
      setWidgetLayout(draftWidgetLayout)
    }, 1000)

    return () => window.clearTimeout(timeoutId)
  }, [draftWidgetLayout, panelMode, setWidgetLayout, widgetLayout])

  useEffect(() => {
    void syncGoogleSession(true)

    const intervalId = window.setInterval(() => {
      void syncGoogleSession(true)
    }, AUTH_REFRESH_MS)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    const onAuthSessionChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== "local") return

      const authSessionChange = changes[AUTH_SESSION_STORAGE_KEY]
      if (!authSessionChange) return

      void syncGoogleSession()
    }

    chrome.storage.onChanged.addListener(onAuthSessionChanged)
    return () => chrome.storage.onChanged.removeListener(onAuthSessionChanged)
  }, [])

  useEffect(() => {
    const onThemeLoading = (event: Event) => {
      const customEvent = event as CustomEvent<{ loading?: boolean }>
      setIsLoading(customEvent.detail?.loading === true)
    }
    window.addEventListener(THEME_LOADING_EVENT, onThemeLoading)
    return () => window.removeEventListener(THEME_LOADING_EVENT, onThemeLoading)
  }, [])

  useEffect(() => {
    const onFabOpen = (event: Event) => {
      const customEvent = event as CustomEvent<{ view?: PanelMode }>
      void syncGoogleSession()
      setPanelMode(customEvent.detail?.view === "widget" ? "widget" : "theme")
      if (customEvent.detail?.view === "widget") {
        setDraftWidgetLayout({ ...DEFAULT_WIDGET_LAYOUT, ...widgetLayout })
      }
      setThemeTab(theme === "custom" ? "custom" : "preset")
    }
    window.addEventListener(FAB_OPEN_EVENT, onFabOpen)
    return () => window.removeEventListener(FAB_OPEN_EVENT, onFabOpen)
  }, [theme, widgetLayout])

  const editingTheme = customThemes.find((item) => item.id === editingCustomThemeId)

  const isBackgroundImageUsed = (imageId: string, ignoredThemeId = "") =>
    customThemes.some((item) => item.id !== ignoredThemeId && item.bgImageId === imageId)

  const deleteBackgroundImage = (imageId: string, ignoredThemeId = "") => {
    if (imageId && !isBackgroundImageUsed(imageId, ignoredThemeId)) void deleteImageData(imageId)
  }

  const deleteDraftBackgroundImage = (imageId = draftBackgroundImageId) => {
    if (!imageId || imageId === editingTheme?.bgImageId) return
    deleteBackgroundImage(imageId)
  }

  const getEditingThemeDraft = () => {
    if (!editingTheme) return null

    return {
      ...editingTheme,
      name: draftCustomThemeName,
      text: draftTextColor,
      accent: draftAccentColor,
      bgImageId: draftBackgroundImageId,
      ...(draftBackgroundImageUrl && !draftBackgroundImageId
        ? { bgUrl: draftBackgroundImageUrl }
        : {}),
      bgAnimated: draftBackgroundAnimated,
      bgColor: draftBackgroundColor,
      bgOptions: draftBackgroundOptions
    }
  }

  const publishEditingThemePreview = (themeData: CustomTheme | null) => {
    window.dispatchEvent(
      new CustomEvent(CUSTOM_THEME_PREVIEW_EVENT, {
        detail: themeData ? { themeId: themeData.id, theme: themeData } : null
      })
    )
  }

  useEffect(() => {
    if (!editingTheme) return
    setDraftTextColor(editingTheme.text || "")
    setDraftAccentColor(editingTheme.accent || "")
    setDraftBackgroundImageId(editingTheme.bgImageId || "")
    setDraftBackgroundAnimated(editingTheme.bgAnimated === true)
    setDraftBackgroundImageUrl("")
    if (editingTheme.bgImageId) {
      void getImageDataUrl(editingTheme.bgImageId)
        .then(setDraftBackgroundImageUrl)
        .catch(() => setDraftBackgroundImageUrl(""))
    }
    setDraftBackgroundColor(editingTheme.bgColor || "")
    setDraftBackgroundOptions(editingTheme.bgOptions || DEFAULT_CUSTOM_BG_OPTIONS)
    setDraftCustomThemeName(editingTheme.name || "")
    setCustomEditTab("general")
  }, [editingTheme?.id])

  const updateCustomBgOption = (
    key: keyof CustomBgOptions,
    value: string | number | boolean
  ) => setDraftBackgroundOptions((prev) => ({ ...prev, [key]: value }))

  const normalizeCustomThemes = () => {
    if (!customThemes.length) return false

    const source = selectedCustomTheme ?? customThemes[0]
    const theme = clearAnimatedBgUrl(source)
    const themes = [theme]
    const changed = customThemes.length !== 1 || theme !== source

    if (changed) {
      customThemes.forEach((item) => {
        if (!themes.some((theme) => theme.id === item.id)) {
          deleteBackgroundImage(item.bgImageId, item.id)
        } else if (item.bgImageId !== theme.bgImageId) {
          deleteBackgroundImage(item.bgImageId, item.id)
        }
      })
      setCustomThemes(themes)
    }
    if (selectedCustomThemeId !== theme.id) setSelectedCustomThemeId(theme.id)
    if (editingCustomThemeId && editingCustomThemeId !== theme.id) {
      setEditingCustomThemeId("")
      setView("themes")
    }
    if (draftBackgroundAnimated) {
      deleteDraftBackgroundImage()
      setDraftBackgroundImageId("")
      setDraftBackgroundImageUrl("")
      setDraftBackgroundAnimated(false)
    }

    return changed
  }

  const hasPremiumLockedWidgets = (items: WidgetInstance[]) => {
    const retainedTypes = new Set<WidgetKey>()
    return items.some((item) => {
      if (retainedTypes.has(item.type)) return true
      retainedTypes.add(item.type)
      return false
    })
  }

  const normalizeCustomWidgets = () => {
    const items = widgetItems || DEFAULT_WIDGET_INSTANCES
    const retainedTypes = new Set<WidgetKey>()
    const nextItems = items.filter((item) => {
      if (retainedTypes.has(item.type)) return false
      retainedTypes.add(item.type)
      return true
    })
    const changed =
      nextItems.length !== items.length ||
      nextItems.some((item, index) => item.id !== items[index]?.id)

    if (changed) setWidgetItems(nextItems)

    return changed
  }

  useEffect(() => {
    if (!isPremiumChecked || !isFreeUser || isPremiumUser) return

    const themeLimitLocked = customThemes.length > 1
    const animatedThemeLocked = hasAnimatedBackground(customThemes)
    const widgetLocked = hasPremiumLockedWidgets(widgetItems || DEFAULT_WIDGET_INSTANCES)

    if (themeLimitLocked || animatedThemeLocked) {
      normalizeCustomThemes()
      if (themeLimitLocked) toast.error(t("pro_themeLimit"), { toastId: "normalizeThemeLimit" })
      if (animatedThemeLocked) toast.error(t("pro_animatedBG"), { toastId: "normalizeAnimatedBG" })
    }

    if (widgetLocked) {
      normalizeCustomWidgets()
      toast.error(t("pro_widgetLimit"), { toastId: "normalizeWidget" })
    }
  }, [
    draftBackgroundAnimated,
    customThemes,
    editingCustomThemeId,
    isFreeUser,
    isPremiumChecked,
    isPremiumUser,
    selectedCustomThemeId,
    widgetItems
  ])

  useEffect(() => {
    if (!editingCustomThemeId || !editingTheme) return
    publishEditingThemePreview(getEditingThemeDraft())
  }, [
    editingCustomThemeId,
    editingTheme,
    draftCustomThemeName,
    draftTextColor,
    draftAccentColor,
    draftBackgroundImageId,
    draftBackgroundImageUrl,
    draftBackgroundAnimated,
    draftBackgroundColor,
    draftBackgroundOptions
  ])

  const openCheckout = async (idToken: string) => {
    await new Promise<void>((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: "OPEN_CHECKOUT", idToken },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          if (!response?.success) {
            reject(new Error(response?.error || "Failed to open checkout"))
            return
          }
          resolve()
        }
      )
    })
  }

  const syncGoogleSession = async (verifyGrant = false) => {
    let authSession: AuthSessionSnapshot | null = null
    try {
      authSession = await getValidAuthSessionSnapshot(
        verifyGrant
          ? { refreshPremiumStatus: true, verifyGoogleGrant: true }
          : undefined
      )
    } catch {
      authSession = null
    }

    if (authSession) {
      setPremiumStatus(authSession.premiumStatus)
      return authSession
    }

    setPremiumStatus(verifyGrant ? "unknown" : "free")
    return null
  }

  const refreshPremiumStatus = async () => {
    let isPremium = false
    try {
      isPremium = await getVerifiedPremiumStatus(false, false)
    } catch {
      isPremium = false
    }
    setPremiumStatus(isPremium ? "premium" : "free")
    return isPremium
  }

  const requirePremiumAccess = async (messageKey: string) => {
    const premium = await refreshPremiumStatus()
    if (!premium) toast.error(t(messageKey))
    return premium
  }

  const onProClick = async () => {
    setIsLoading(true)
    try {
      const authSession = await getValidAuthSessionSnapshot({
        refreshPremiumStatus: true
      })

      if (authSession) {
        setPremiumStatus(authSession.premiumStatus)
        if (authSession.premiumStatus === "premium") return
        const idToken = await getCurrentUserIdToken()
        if (idToken) {
          await openCheckout(idToken)
          return
        }

        try {
          const nextAuthSession = await signInAndSaveAuthSession(false)
          setPremiumStatus(nextAuthSession.premiumStatus)
          if (nextAuthSession.premiumStatus === "premium") return
          const nextIdToken = await getCurrentUserIdToken()
          if (nextIdToken) {
            await openCheckout(nextIdToken)
            return
          }
        } catch { }

        const nextAuthSession = await signInAndSaveAuthSession(true)
        setPremiumStatus(nextAuthSession.premiumStatus)
        if (nextAuthSession.premiumStatus === "premium") return
        const nextIdToken = await getCurrentUserIdToken()
        if (!nextIdToken) return
        await openCheckout(nextIdToken)
        return
      }

      const nextAuthSession = await signInAndSaveAuthSession(true)
      setPremiumStatus(nextAuthSession.premiumStatus)
      if (nextAuthSession.premiumStatus === "premium") return
      const idToken = await getCurrentUserIdToken()
      if (!idToken) return
      await openCheckout(idToken)
    } catch (e) {
      if (e?.message === "The user did not approve access.") return
      toast.error(t("error_checkoutFail"))
    } finally {
      setIsLoading(false)
    }
  }

  const onExportClick = async () => {
    if (theme !== "custom" || !selectedCustomTheme) return

    await downloadCustomTheme(selectedCustomTheme)
    toast.success(t("success_themeExport"))
  }

  const onImportClick = async () => {
    if (customThemes.length > 0 && !(await requirePremiumAccess("pro_themeLimit"))) return
    importFileRef.current?.click()
  }

  const onImportFile = async (file?: File) => {
    if (!file) {
      toast.error(t("error_fileRequired"))
      return
    }
    if (!isJsonFile(file)) {
      toast.error(t("error_fileInvalid", "JSON"))
      clearFileInput(importFileRef.current)
      return
    }

    let imported: Array<CustomTheme & { bgUrl?: string }> = []
    const importImageIds: string[] = []
    try {
      const text = await file.text()
      imported = parseImportedThemes(text, (index) => `${t("custom")} ${index + 1}`)
    } catch {
      toast.error(t("error_fileInvalid", "JSON"))
      clearFileInput(importFileRef.current)
      return
    }

    if (!imported.length) {
      toast.error(t("error_fileInvalid", "JSON"))
      clearFileInput(importFileRef.current)
      return
    }

    try {
      imported = await Promise.all(
        imported.map(async (themeData) => {
          const { bgUrl: importedBgUrl, ...storageTheme } = themeData
          const bgUrl = sanitizeCustomBgUrl(importedBgUrl)
          if (!bgUrl) return storageTheme
          const bgImageId = await saveImageDataUrl(bgUrl)
          importImageIds.push(bgImageId)

          return {
            ...storageTheme,
            bgImageId,
            bgAnimated: isAnimatedBgUrl(bgUrl)
          }
        })
      )
    } catch {
      importImageIds.forEach((imageId) => void deleteImageData(imageId))
      toast.error(t("error_fileInvalid", "JSON"))
      clearFileInput(importFileRef.current)
      return
    }

    const hasAnimatedImportedTheme = hasAnimatedBackground(imported)
    if (hasAnimatedImportedTheme && !(await requirePremiumAccess("pro_animatedBG"))) {
      importImageIds.forEach((imageId) => void deleteImageData(imageId))
      clearFileInput(importFileRef.current)
      return
    }

    const premium = await refreshPremiumStatus()

    if (premium) {
      setCustomThemes((prev) => [...prev, ...imported])
    } else {
      const keepImageId = imported[0].bgImageId
      importImageIds.forEach((imageId) => {
        if (imageId !== keepImageId) void deleteImageData(imageId)
      })
      setCustomThemes([imported[0]])
      setSelectedCustomThemeId(imported[0].id)
      setTheme("custom")
    }

    toast.success(t("success_themeImport"))

    setThemeTab("custom")
    clearFileInput(importFileRef.current)
  }

  const onUploadCustomBg = async (file?: File) => {
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
      clearFileInput(bgUploadRef.current)
      return
    }
    const animated = await isAnimatedImage(file)
    if (animated && !(await requirePremiumAccess("pro_animatedBG"))) {
      clearFileInput(bgUploadRef.current)
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      const result = sanitizeCustomBgUrl(reader.result)
      if (!result) {
        toast.error(t("error_fileInvalid", "IMG"))
        clearFileInput(bgUploadRef.current)
        return
      }
      try {
        deleteDraftBackgroundImage()
        setDraftBackgroundImageId("")
        setDraftBackgroundAnimated(animated)
        setDraftBackgroundImageUrl(result)
      } catch {
        toast.error(t("error_fileInvalid", "IMG"))
      } finally {
        clearFileInput(bgUploadRef.current)
      }
    }
    reader.readAsDataURL(file)
  }

  const onThemeClick = (key: string) => {
    deleteDraftBackgroundImage()
    setTheme("")
    setTheme(key)
    setEditingCustomThemeId("")
    setView("themes")
  }
  const onSaveClick = async () => {
    if (isLoading) return

    const nextTheme = getEditingThemeDraft()
    const oldImageId = editingTheme?.bgImageId || ""

    if (!nextTheme) return

    setIsLoading(true)

    try {
      const shouldSaveImage = Boolean(draftBackgroundImageUrl && !draftBackgroundImageId)
      const bgImageId = shouldSaveImage ? await saveImageDataUrl(draftBackgroundImageUrl) : draftBackgroundImageId
      const { bgUrl, ...storageTheme } = { ...nextTheme, bgImageId }

      setCustomThemes((prev) => prev.map((item) => (item.id === storageTheme.id ? storageTheme : item)))
      setDraftBackgroundImageId(bgImageId)
      if (oldImageId && oldImageId !== bgImageId) deleteBackgroundImage(oldImageId, storageTheme.id)

      setView("themes")
      toast.success(t("success_themeSave"))
    } catch {
      toast.error(t("error_themeSave"))
    } finally {
      setIsLoading(false)
    }
  }
  const resetCustomText = () => setDraftTextColor("")
  const resetCustomAccent = () => setDraftAccentColor("")
  const resetDraftBackgroundImage = () => {
    deleteDraftBackgroundImage()
    setDraftBackgroundImageId("")
    setDraftBackgroundAnimated(false)
    setDraftBackgroundImageUrl("")
    setDraftBackgroundOptions(DEFAULT_CUSTOM_BG_OPTIONS)
  }
  const resetDraftBackgroundColor = () => setDraftBackgroundColor("")

  const onRemoveBGClick = async () => {
    if (isLoading || !draftBackgroundImageUrl) return
    setIsLoading(true)

    if (!(await requirePremiumAccess("pro_removeBG"))) {
      setIsLoading(false)
      return
    }

    const toastId = toast.loading(t("loading_removeBG"))

    try {
      const result = await new Promise<string>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "REMOVE_BACKGROUND_IMAGE", imageUrl: draftBackgroundImageUrl },
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

      deleteDraftBackgroundImage()
      setDraftBackgroundImageId("")
      setDraftBackgroundAnimated(false)
      setDraftBackgroundImageUrl(result)

      toast.update(toastId, {
        render: t("success_removeBG"),
        type: "success",
        isLoading: false,
        autoClose: null,
        closeOnClick: null
      })
    } catch (error) {
      toast.update(toastId, {
        render: t("error_removeBG"),
        type: "error",
        isLoading: false,
        autoClose: null,
        closeOnClick: null
      })
    } finally {
      setIsLoading(false)
    }
  }

  const onColorMatchClick = async () => {
    if (isLoading || !draftBackgroundImageUrl) return
    setIsLoading(true)

    if (!(await requirePremiumAccess("pro_colorMatch"))) {
      setIsLoading(false)
      return
    }

    const toastId = toast.loading(t("loading_colorMatch"))

    try {
      await wait(2000)
      const canvas = await renderImageToCanvas(draftBackgroundImageUrl, draftBackgroundOptions, 256, draftBackgroundColor)
      const palette = await Vibrant.from(canvas.toDataURL()).getPalette()
      const isDarkMode = isCurrentPageDarkMode()
      const nextAccent = palette.Vibrant?.hex || ""
      const nextText = isDarkMode ? palette.LightVibrant?.hex || "" : palette.DarkVibrant?.hex || ""

      if (nextAccent) setDraftAccentColor(nextAccent)
      if (nextText) setDraftTextColor(nextText)

      toast.update(toastId, {
        render: t("success_colorMatch"),
        type: "success",
        isLoading: false,
        autoClose: null,
        closeOnClick: null
      })
    } catch (error) {
      toast.update(toastId, {
        render: t("error_colorMatch"),
        type: "error",
        isLoading: false,
        autoClose: null,
        closeOnClick: null
      })
    } finally {
      setIsLoading(false)
    }
  }

  const onCustomCardClick = (customThemeItem: CustomTheme) => {
    if (customThemeClickRef.current === customThemeItem.id) {
      customThemeClickRef.current = ""
      return
    }
    const isSelected = theme === "custom" && selectedCustomThemeId === customThemeItem.id
    if (isSelected) {
      setEditingCustomThemeId(customThemeItem.id)
      setCustomEditTab("general")
      setView("custom")
      return
    }
    deleteDraftBackgroundImage()
    setEditingCustomThemeId("")
    setSelectedCustomThemeId(customThemeItem.id)
    setTheme("custom")
    setView("themes")
  }

  const onCustomThemeSortStart = () => {
    setDraggingCustomThemeId("")

    const rect = panelRootRef.current?.getBoundingClientRect()
    if (!rect) return
    panelRootRef.current?.style.setProperty("--custom-theme-drag-left", `${-rect.left}px`)
    panelRootRef.current?.style.setProperty("--custom-theme-drag-top", `${-rect.top}px`)

    stopCustomThemeDragClamp()
    document.addEventListener("mousemove", clampCustomThemeDrag)
    document.addEventListener("mouseup", stopCustomThemeDragClamp, { once: true })
  }

  const onCustomThemeSortEnd = (oldIndex: number, newIndex: number) => {
    stopCustomThemeDragClamp()
    const activeId = customThemes[oldIndex]?.id || ""

    if (activeId) {
      customThemeClickRef.current = activeId
      window.setTimeout(() => {
        if (customThemeClickRef.current === activeId) customThemeClickRef.current = ""
      }, 0)
    }

    if (oldIndex === newIndex) return
    setCustomThemes((prev) => {
      if (oldIndex < 0 || newIndex < 0 || oldIndex >= prev.length || newIndex >= prev.length) return prev
      const next = prev.slice()
      next.splice(newIndex, 0, next.splice(oldIndex, 1)[0])
      return next
    })
  }

  const onCustomPlusClick = async () => {
    if (customThemes.length > 0 && !(await requirePremiumAccess("pro_themeLimit"))) return
    const created = createCustomTheme(`${t("custom")} ${customThemes.length + 1}`)
    setCustomThemes((prev) => [...prev, created])
  }

  const deleteCustomTheme = (customThemeId: string) => {
    if (!customThemeId) return
    const deletedTheme = customThemes.find((item) => item.id === customThemeId)
    const deletingSelected = selectedCustomThemeId === customThemeId && theme === "custom"
    const nextThemes = customThemes.filter((item) => item.id !== customThemeId)
    setCustomThemes(nextThemes)
    if (deletedTheme?.bgImageId) deleteBackgroundImage(deletedTheme.bgImageId, deletedTheme.id)
    if (deletingSelected) {
      setSelectedCustomThemeId("")
      setTheme("default")
    }
    if (editingCustomThemeId === customThemeId) {
      setEditingCustomThemeId("")
      publishEditingThemePreview(null)
    }
    setView("themes")
    toast.success(t("success_themeDelete"))
  }

  const onCustomCardDeleteClick = (customThemeItem: CustomTheme) => {
    deleteCustomTheme(customThemeItem.id)
  }

  const onCustomCardDuplicateClick = async (customThemeItem: CustomTheme) => {
    if (customThemes.length > 0 && !(await requirePremiumAccess("pro_themeLimit"))) return

    const copiedTheme = {
      ...customThemeItem,
      id: crypto.randomUUID(),
      name: String(customThemeItem.name || t("custom")).slice(0, 10)
    }
    const sourceIndex = customThemes.findIndex((item) => item.id === customThemeItem.id)

    setCustomThemes((prev) => {
      const nextThemes = [...prev]
      nextThemes.splice(sourceIndex + 1, 0, copiedTheme)
      return nextThemes
    })

    toast.success(t("success_themeDuplicate"))
  }

  const updateWidgetEnabled = (key: WidgetKey, checked: boolean) => {
    const items = widgetItems || DEFAULT_WIDGET_INSTANCES
    setWidgetEnabled({
      ...DEFAULT_WIDGET_ENABLED,
      ...widgetEnabled,
      [key]: checked
    })
    if (!checked || items.some((widget) => widget.type === key)) return
    setWidgetItems([...items, createWidgetInstance(key)])
  }

  const updateWidgetLayout = (
    key: keyof WidgetLayoutOptions,
    value: string | number
  ) => {
    setDraftWidgetLayout((prev) => ({ ...prev, [key]: value }))
  }

  const resetWidgetLayout = (key: keyof WidgetLayoutOptions) => {
    setDraftWidgetLayout((prev) => ({ ...prev, [key]: DEFAULT_WIDGET_LAYOUT[key] }))
  }

  const resetEditingThemeDraft = () => {
    deleteDraftBackgroundImage()
    setDraftBackgroundImageId("")
    setDraftBackgroundAnimated(false)
    setDraftBackgroundImageUrl("")
    setDraftBackgroundColor("")
    setDraftTextColor("")
    setDraftAccentColor("")
    setDraftBackgroundOptions(DEFAULT_CUSTOM_BG_OPTIONS)
  }

  const resetWidgetLayoutDraft = () => setDraftWidgetLayout(DEFAULT_WIDGET_LAYOUT)

  return (
    <>
      <style>{`
        * { margin: 0; box-sizing: border-box; user-select: none; -webkit-user-select: none; }
        .content-scroll { scrollbar-width: none; }
        input.color-picker::-webkit-color-swatch-wrapper { padding: 0; }
        input.color-picker::-webkit-color-swatch { border: none; border-radius: 6px; }
        .preset-theme-card {
          position: relative;
          width: 100%;
          overflow: hidden;
          isolation: isolate;
        }
        .theme-card-tilt {
          display: block;
          width: 100%;
          height: 100px;
          border-radius: 12px;
          transform-style: preserve-3d;
        }
        .custom-theme-card-tilt {
          position: relative;
        }
        .preset-theme-card__bg {
          position: absolute;
          inset: 0;
          z-index: 0;
          background-position: center center;
          background-size: cover;
        }
        .preset-theme-card__emoji {
          position: absolute;
          top: 50%;
          left: 50%;
          z-index: 1;
          font-size: 32px;
          line-height: 1;
          transform: translate(-50%, -75%);
        }
        .preset-theme-card__label {
          position: absolute;
          display: flex;
          justify-content: center;
          align-items: center;
          left: 0;
          right: 0;
          bottom: 0;
          height: 24px;
          z-index: 2;
          color: #fff;
          background-color: #0000008D;
          text-align: center;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .preset-theme-card:hover .preset-theme-card__label { background-color: #0000004D; }
        .preset-theme-card.is-active::after,
        .custom-theme-card.is-active::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 3;
          border-radius: 12px;
          box-shadow: inset 0 0 0 2px #66cdaa;
          pointer-events: none;
        }
        .custom-theme-card {
          position: relative;
          width: 100%;
          height: 100px;
          padding: 0;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          overflow: hidden;
        }
        .custom-theme-card.is-dragging {
          opacity: 0.5;
          transform: scale(0.9);
        }
        .custom-theme-card__bg {
          position: absolute;
          inset: 0;
          background-position: center center;
          background-size: cover;
          background-repeat: no-repeat;
          transform: scaleX(var(--custom-bg-scale-x, 1));
        }
        .custom-theme-card__title {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 24px;
          padding: 0 4px;
          background-color: #0000008D;
          color: #fff;
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .custom-theme-card__title span {
          display: block;
          width: max-content;
          max-width: 100%;
          margin: 0 auto;
          overflow: hidden;
          line-height: 24px;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
        .custom-theme-card-wrap:hover .title-overflow .custom-theme-card__title span {
          display: inline-flex;
          gap: 48px;
          max-width: none;
          margin: 0;
          animation: title-marquee 6s linear infinite;
        }
        .custom-theme-card-wrap:hover .title-overflow .custom-theme-card__title span::after {
          content: attr(data-title);
        }
        .custom-theme-card__actions {
          position: absolute;
          top: 4px;
          right: 4px;
          z-index: 5;
          display: flex;
          gap: 2px;
          opacity: 0;
          transform: scale(0.9);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .custom-theme-card__action {
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          border: none;
          border-radius: 999px;
          background-color: #0000004D;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .custom-theme-card-wrap {
          position: relative;
        }
        .custom-theme-card-dragged {
          top: var(--custom-theme-drag-top, 0px) !important;
          left: var(--custom-theme-drag-left, 0px) !important;
        }
        .custom-theme-card:hover .custom-theme-card__actions,
        .custom-theme-card-wrap:hover .custom-theme-card__actions {
          opacity: 1;
          transform: scale(1);
        }
        .custom-theme-card__duplicate:hover {
          background-color: #1976d2;
        }
        .custom-theme-card__delete:hover {
          background-color: #d32f2f;
        }
        .custom-theme-card:hover .custom-theme-card__title { background-color: #0000004D; }
        .pro-button { animation: pro-gradient 10s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
        .footer button:hover { filter: brightness(1.1); }
        @keyframes pro-gradient {
          from { background-position: 500% 50%; }
          to { background-position: 0% 50%; }
        }
        @keyframes title-marquee {
          0% { transform: translateX(0); }
          60% { transform: translateX(calc(-50% - 24px)); }
          100% { transform: translateX(calc(-50% - 24px)); }
        }
      `}</style>
      <div style={wrapperStyle}>
        <div ref={panelRootRef} style={rootStyle}>
          <div style={contentStyle}>
            {panelMode === "widget" && (
              <>
                <h3 style={centeredHeadingStyle}>{t("widget")} {t("setting")}</h3>
                <div
                  style={{ ...tabGridStyle, marginTop: 20, gridTemplateColumns: "1fr 1fr" }}>
                  {(["visibility", "layout"] as const).map((tab) => (
                    <TabButton
                      key={tab}
                      active={widgetTab === tab}
                      label={t(tab)}
                      onClick={() => setWidgetTab(tab)}
                    />
                  ))}
                </div>
                <div className="content-scroll" style={editSectionScrollStyle}>
                  {widgetTab === "visibility" && (
                    <>
                      {WIDGET_LIST.map((item) => (
                        <CheckboxCard
                          key={item.key}
                          label={t(item.labelKey)}
                          icon={item.icon}
                          checked={(widgetEnabled?.[item.key] ?? DEFAULT_WIDGET_ENABLED[item.key]) && hasWidgetType(item.key)}
                          onChange={(checked) => updateWidgetEnabled(item.key, checked)}
                        />
                      ))}
                    </>
                  )}
                  {widgetTab === "layout" && (
                    <>
                      <ColorSettingCard
                        label={t("backgroundColor")}
                        value={draftWidgetLayout.backgroundColor}
                        onChange={(value) => updateWidgetLayout("backgroundColor", value)}
                        onReset={() => resetWidgetLayout("backgroundColor")}
                        canReset={draftWidgetLayout.backgroundColor !== DEFAULT_WIDGET_LAYOUT.backgroundColor}
                      />
                      <ColorSettingCard
                        label={t("text")}
                        value={draftWidgetLayout.textColor}
                        onChange={(value) => updateWidgetLayout("textColor", value)}
                        onReset={() => resetWidgetLayout("textColor")}
                        canReset={draftWidgetLayout.textColor !== DEFAULT_WIDGET_LAYOUT.textColor}
                      />
                      <ColorSettingCard
                        label={t("accent")}
                        value={draftWidgetLayout.accentColor}
                        onChange={(value) => updateWidgetLayout("accentColor", value)}
                        onReset={() => resetWidgetLayout("accentColor")}
                        canReset={draftWidgetLayout.accentColor !== DEFAULT_WIDGET_LAYOUT.accentColor}
                      />
                      <RangeCard
                        label={t("opacity")}
                        min={0}
                        max={1}
                        step={0.1}
                        value={draftWidgetLayout.opacity}
                        onChange={(value) => updateWidgetLayout("opacity", Number(value))}
                        onReset={() => resetWidgetLayout("opacity")}
                      />
                      <RangeCard
                        label={t("glassBlur")}
                        min={0}
                        max={50}
                        step={1}
                        value={draftWidgetLayout.glassBlur}
                        onChange={(value) => updateWidgetLayout("glassBlur", Number(value))}
                        onReset={() => resetWidgetLayout("glassBlur")}
                      />
                    </>
                  )}
                </div>
              </>
            )}
            {panelMode === "theme" && view === "themes" && (
              <>
                <h3 style={centeredHeadingStyle}>{t("theme")} {t("setting")}</h3>
                <div style={themeSectionStyle}>
                  <div
                    style={{ ...tabGridStyle, gridTemplateColumns: "1fr 1fr" }}>
                    {(["preset", "custom"] as const).map((tab) => (
                      <TabButton
                        key={tab}
                        active={themeTab === tab}
                        label={t(tab)}
                        onClick={() => setThemeTab(tab)}
                      />
                    ))}
                  </div>
                  <div ref={themeGridScrollRef} className="content-scroll" style={themeGridScrollStyle}>
                    {themeTab === "preset" && (
                      <div style={twoColumnGridStyle}>
                        {THEME_LIST.map((item) => (
                          <ThemeCard
                            key={item.key}
                            active={theme === item.key}
                            color={item.color}
                            emoji={item.emoji}
                            label={t(item.key)}
                            onClick={() => onThemeClick(item.key)}
                          />
                        ))}
                      </div>
                    )}
                    {themeTab === "custom" && (
                      <SortableList
                        as="div"
                        autoScroll
                        customHolderRef={panelRootRef}
                        draggedItemClassName="custom-theme-card-dragged"
                        onSortStart={onCustomThemeSortStart}
                        onSortEnd={onCustomThemeSortEnd}
                        style={twoColumnGridStyle}>
                        {customThemes.map((item) => (
                          <SortableItem key={item.id}>
                            <div>
                              <CustomThemeSortableCard
                                item={item}
                                theme={theme}
                                selectedCustomThemeId={selectedCustomThemeId}
                                draggingCustomThemeId={draggingCustomThemeId}
                                onCustomCardClick={onCustomCardClick}
                                onCustomCardDuplicateClick={onCustomCardDuplicateClick}
                                onCustomCardDeleteClick={onCustomCardDeleteClick}
                              />
                            </div>
                          </SortableItem>
                        ))}
                        <ThemeCard
                          className="add-theme-card"
                          color="#374151"
                          emoji="✏️"
                          label={t("addTheme")}
                          onClick={onCustomPlusClick}
                        />
                      </SortableList>
                    )}
                  </div>
                </div>
              </>
            )}
            {panelMode === "theme" && view === "custom" && (
              <>
                <h3 style={centeredHeadingStyle}>{t("editTheme")}</h3>
                <div
                  style={{
                    ...tabGridStyle,
                    marginTop: 20,
                    gridTemplateColumns: "1fr 1fr 1fr"
                  }}>
                  {(["general", "background", "layout"] as const).map((tab) => (
                    <TabButton
                      key={tab}
                      active={customEditTab === tab}
                      label={t(tab)}
                      onClick={() => setCustomEditTab(tab)}
                    />
                  ))}
                </div>
                <div className="content-scroll" style={editSectionScrollStyle}>
                  {customEditTab === "general" && (
                    <>
                      <Card>
                        <div style={rowStyle}>
                          <span style={fieldLabelStyle}>{t("title")}</span>
                          <input
                            type="text"
                            value={draftCustomThemeName}
                            spellCheck={false}
                            autoComplete="off"
                            onChange={(e) => setDraftCustomThemeName(e.target.value.slice(0, 20))}
                            onKeyDown={(e) => e.stopPropagation()}
                            onKeyUp={(e) => e.stopPropagation()}
                            style={textInputStyle}
                          />
                        </div>
                      </Card>
                      <CheckboxCard
                        label={t("hideHeader")}
                        checked={draftBackgroundOptions.hideHeader}
                        onChange={(c) => updateCustomBgOption("hideHeader", c)}
                      />
                      <CheckboxCard
                        label={t("hideFooter")}
                        checked={draftBackgroundOptions.hideFooter}
                        onChange={(c) => updateCustomBgOption("hideFooter", c)}
                      />
                    </>
                  )}
                  {customEditTab === "background" && (
                    <>
                      <ColorSettingCard
                        label={t("backgroundColor")}
                        value={draftBackgroundColor}
                        onChange={setDraftBackgroundColor}
                        onReset={resetDraftBackgroundColor}
                        canReset={Boolean(draftBackgroundColor)}
                      />
                      <Card>
                        <label style={rowStyle}>
                          <span style={fieldLabelStyle}>
                            {t("backgroundImage")}
                          </span>
                          <div style={{ display: "flex", gap: 4 }}>
                            <input
                              ref={bgUploadRef}
                              type="file"
                              accept="image/*"
                              onChange={(e) => onUploadCustomBg(e.target.files?.[0])}
                              style={{ display: "none" }}
                            />
                            <button
                              type="button"
                              onClick={() => bgUploadRef.current?.click()}
                              style={controlButtonStyle}>
                              {t("upload")}
                            </button>
                            <button
                              type="button"
                              onClick={resetDraftBackgroundImage}
                              disabled={!draftBackgroundImageUrl}
                              style={{ ...controlButtonStyle, ...disabledControlStyle(Boolean(draftBackgroundImageUrl)) }}>
                              {t("reset")}
                            </button>
                          </div>
                        </label>
                      </Card>
                      {draftBackgroundImageUrl && (
                        <>
                          <Card>
                            <label style={rowStyle}>
                              <div style={{ ...iconLabelStyle, gap: 8 }}>
                                <Icon icon="lucide:sparkles" height={24} color="#66cdaa" aria-hidden="true" />
                                <span style={fieldLabelStyle}>{t("removeBG")}</span>
                              </div>
                              <button
                                type="button"
                                onClick={onRemoveBGClick}
                                style={controlButtonStyle}>
                                {t("apply")}
                              </button>
                            </label>
                          </Card>
                          <Card>
                            <div style={columnControlStyle}>
                              <RangeControl
                                label={t("horizontal")}
                                min={0}
                                max={100}
                                step={1}
                                value={getPositionXPercent(draftBackgroundOptions.position)}
                                onChange={(v) =>
                                  updateCustomBgOption(
                                    "position",
                                    `${Number(v)}% ${getPositionYPercent(draftBackgroundOptions.position)}%`
                                  )
                                }
                                onReset={() =>
                                  updateCustomBgOption(
                                    "position",
                                    `50% ${getPositionYPercent(draftBackgroundOptions.position)}%`
                                  )
                                }
                              />
                              <RangeControl
                                label={t("vertical")}
                                min={0}
                                max={100}
                                step={1}
                                value={getPositionYPercent(draftBackgroundOptions.position)}
                                onChange={(v) =>
                                  updateCustomBgOption(
                                    "position",
                                    `${getPositionXPercent(draftBackgroundOptions.position)}% ${Number(v)}%`
                                  )
                                }
                                onReset={() =>
                                  updateCustomBgOption(
                                    "position",
                                    `${getPositionXPercent(draftBackgroundOptions.position)}% 50%`
                                  )
                                }
                              />
                            </div>
                          </Card>
                          <CheckboxCard
                            label={t("flip")}
                            checked={draftBackgroundOptions.scaleX === -1}
                            onChange={(c) => updateCustomBgOption("scaleX", c ? -1 : 1)}
                          />
                          <RangeCard
                            label={t("brightness")}
                            min={0}
                            max={5}
                            step={0.1}
                            value={draftBackgroundOptions.brightness}
                            onChange={(v) => updateCustomBgOption("brightness", Number(v))}
                            onReset={() => updateCustomBgOption("brightness", 1)}
                          />
                          <RangeCard
                            label={t("blur")}
                            min={0}
                            max={50}
                            step={1}
                            value={draftBackgroundOptions.blur}
                            onChange={(v) => updateCustomBgOption("blur", Number(v))}
                            onReset={() => updateCustomBgOption("blur", 0)}
                          />
                          <CheckboxCard
                            label={t("invert")}
                            checked={draftBackgroundOptions.invert === 1}
                            onChange={(c) => updateCustomBgOption("invert", c ? 1 : 0)}
                          />
                          <CheckboxCard
                            label={t("grayscale")}
                            checked={draftBackgroundOptions.grayscale === 1}
                            onChange={(c) => updateCustomBgOption("grayscale", c ? 1 : 0)}
                          />
                        </>
                      )}
                    </>
                  )}
                  {customEditTab === "layout" && (
                    <>
                      {draftBackgroundImageUrl && (
                        <>
                          <Card>
                            <label style={rowStyle}>
                              <div style={{ ...iconLabelStyle, gap: 8 }}>
                                <Icon icon="lucide:sparkles" height={24} color="#66cdaa" aria-hidden="true" />
                                <span style={fieldLabelStyle}>{t("colorMatch")}</span>
                              </div>
                              <button
                                type="button"
                                onClick={onColorMatchClick}
                                style={controlButtonStyle}>
                                {t("apply")}
                              </button>
                            </label>
                          </Card>
                        </>
                      )}
                      <ColorSettingCard
                        label={t("text")}
                        value={draftTextColor}
                        onChange={setDraftTextColor}
                        onReset={resetCustomText}
                        canReset={canResetText}
                      />
                      <ColorSettingCard
                        label={t("accent")}
                        value={draftAccentColor}
                        onChange={setDraftAccentColor}
                        onReset={resetCustomAccent}
                        canReset={canResetAccent}
                      />
                      <RangeCard
                        label={t("opacity")}
                        min={0}
                        max={1}
                        step={0.1}
                        value={draftBackgroundOptions.opacity}
                        onChange={(v) => updateCustomBgOption("opacity", Number(v))}
                        onReset={() => updateCustomBgOption("opacity", 0.8)}
                      />
                      <RangeCard
                        label={t("glassBlur")}
                        min={0}
                        max={50}
                        step={1}
                        value={draftBackgroundOptions.glassBlur}
                        onChange={(v) => updateCustomBgOption("glassBlur", Number(v))}
                        onReset={() => updateCustomBgOption("glassBlur", 10)}
                      />
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          <div
            className="footer"
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "10px 20px",
              gap: 8
            }}>
            {panelMode === "theme" && themeTab === "custom" && view !== "custom" && (
              <div style={{ ...rowStyle, gap: 8 }}>
                <FooterButton
                  onClick={onImportClick}
                  style={footerButtonStyle}
                  icon="file-down"
                  label={t("import")}
                />
                <FooterButton
                  onClick={onExportClick}
                  disabled={theme !== "custom"}
                  style={{ ...footerButtonStyle, ...disabledControlStyle(theme === "custom") }}
                  icon="file-up"
                  label={t("export")}
                />
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => onImportFile(e.target.files?.[0])}
                  style={{ display: "none" }}
                />
              </div>
            )}
            {panelMode === "theme" && view === "custom" && (
              <div style={{ ...rowStyle, gap: 8 }}>
                <FooterButton
                  onClick={resetEditingThemeDraft}
                  style={footerButtonStyle}
                  icon="rotate-ccw"
                  label={t("reset")}
                />
                <FooterButton
                  onClick={onSaveClick}
                  style={{ ...footerButtonStyle, backgroundColor: "#1976d2" }}
                  icon="save"
                  label={t("save")}
                />
              </div>
            )}
            {panelMode === "widget" && widgetTab === "layout" && (
              <FooterButton
                onClick={resetWidgetLayoutDraft}
                style={footerButtonStyle}
                icon="rotate-ccw"
                label={t("reset")}
              />
            )}
            {!isPremiumUser &&
              ((panelMode === "theme" && view !== "custom") ||
                (panelMode === "widget" && widgetTab !== "layout")) && (
                <FooterButton
                  className="pro-button"
                  onClick={onProClick}
                  style={{ ...proButtonStyle, display: "flex", justifyContent: "center" }}
                  icon="assets/pro.gif"
                  label={t("upgradePro")}
                />
              )}
          </div>
        </div>
        {isLoading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              zIndex: 10,
              pointerEvents: "auto"
            }}>
            <Icon icon="line-md:loading-twotone-loop" height={48} aria-hidden="true" />
          </div>
        )}
      </div>
    </>
  )
}

const themeCardStyle = (color: string, active: boolean) => ({
  display: "block",
  width: "100%",
  height: 100,
  backgroundColor: color,
  border: "none",
  borderRadius: 12,
  cursor: "pointer",
  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
})

function TabButton({
  active,
  label,
  onClick
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...controlButtonStyle,
        padding: "8px",
        borderRadius: "12px 12px 0 0",
        backgroundColor: active ? "#66cdaa" : "#4b5563"
      }}>
      {label}
    </button>
  )
}

function ThemeCard({
  active = false,
  className,
  color,
  emoji,
  label,
  onClick
}: {
  active?: boolean
  className?: string
  color: string
  emoji: string
  label: string
  onClick: () => void
}) {
  return (
    <Tilt {...themeTiltProps} className="theme-card-tilt">
      <button
        type="button"
        className={`preset-theme-card${active ? " is-active" : ""}${className ? ` ${className}` : ""}`}
        onClick={onClick}
        style={{ ...themeCardStyle(color, active), backgroundColor: "transparent", cursor: "pointer" }}>
        <div className="preset-theme-card__bg" style={{ backgroundColor: color }} />
        <span className="preset-theme-card__emoji">{emoji}</span>
        <span className="preset-theme-card__label">{label}</span>
      </button>
    </Tilt>
  )
}

function Card({ children }: { children: ReactNode }) {
  return <div style={cardStyle}>{children}</div>
}

function RangeCard(props: RangeControlProps) {
  return (
    <Card>
      <RangeControl {...props} />
    </Card>
  )
}

function CheckboxCard(props: CheckboxControlProps) {
  return (
    <Card>
      <CheckboxControl {...props} />
    </Card>
  )
}

function FooterButton({
  icon,
  label,
  ...buttonProps
}: {
  icon: string
  label: string
  className?: string
  disabled?: boolean
  onClick: () => void
  style?: CSSProperties
}) {
  return (
    <button type="button" {...buttonProps}>
      <div style={iconLabelStyle}>
        {icon.includes("assets")
          ? <img src={chrome.runtime.getURL(icon)} draggable="false" style={{ height: 16 }} />
          : <Icon icon={`lucide:${icon}`} height={16} aria-hidden="true" />
        }
        <span>{label}</span>
      </div>
    </button>
  )
}

function ColorSettingCard({
  label,
  value,
  onChange,
  onReset,
  canReset
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onReset: () => void
  canReset: boolean
}) {
  return (
    <Card>
      <label style={rowStyle}>
        <span style={fieldLabelStyle}>{label}</span>
        <div style={iconLabelStyle}>
          <input
            type="color"
            value={value || "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="color-picker"
            style={{ ...controlButtonStyle, padding: 4 }}
          />
          <button
            type="button"
            onClick={onReset}
            disabled={!canReset}
            style={{ ...controlButtonStyle, ...disabledControlStyle(canReset) }}>
            {t("reset")}
          </button>
        </div>
      </label>
    </Card>
  )
}

function RangeControl({
  label,
  min,
  max,
  step,
  value,
  disabled = false,
  onChange,
  onReset
}: RangeControlProps) {
  return (
    <label style={columnControlStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
        <span style={fieldLabelStyle}>{label}</span>
        <div style={{ ...iconLabelStyle, gap: 8 }}>
          <span style={fieldLabelStyle}>{value}</span>
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              disabled={disabled}
              style={{ ...controlButtonStyle, ...disabledControlStyle(!disabled) }}>
              {t("reset")}
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ accentColor: "#66cdaa", ...disabledControlStyle(!disabled) }}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

type RangeControlProps = {
  label: string
  min: number
  max: number
  step: number
  value: number
  disabled?: boolean
  onChange: (value: string) => void
  onReset?: () => void
}

function CheckboxControl({
  label,
  checked,
  icon,
  disabled = false,
  onChange
}: CheckboxControlProps) {
  return (
    <label style={rowStyle}>
      <div style={{ ...rowStyle, gap: 8 }}>
        {icon && (<Icon icon={`lucide:${icon}`} height={16} aria-hidden="true" />)}
        <span style={fieldLabelStyle}>{label}</span>
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        style={{ width: 20, height: 20, accentColor: "#66cdaa", ...disabledControlStyle(!disabled) }}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
}

type CheckboxControlProps = {
  label: string
  checked: boolean
  icon?: string
  disabled?: boolean
  onChange: (checked: boolean) => void
}
