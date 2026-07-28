import { Icon } from "@iconify/react"
import { Vibrant } from "node-vibrant/browser"
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react"
import ColorPicker, { useColorPicker } from "react-best-gradient-color-picker"
import SortableList, { SortableItem, SortableKnob } from "react-easy-sort"
import Moveable from "react-moveable"
import Tilt from "react-parallax-tilt"
import { toast } from "react-toastify"

import { Storage } from "@plasmohq/storage"
import { useStorage } from "@plasmohq/storage/hook"

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
  clampNumber,
  clearAnimatedBgUrl,
  createCustomTheme,
  createThemeExportBlob,
  CUSTOM_THEME_PREVIEW_EVENT,
  CUSTOM_THEMES_STORAGE_KEY,
  DDAY_WIDGET_STATE_STORAGE_KEY,
  DEFAULT_CUSTOM_BG_OPTIONS,
  DEFAULT_WIDGET_INSTANCES,
  DEFAULT_WIDGET_LAYOUT,
  deleteImageData,
  detectCurrentSite,
  exportCustomThemeImages,
  FAB_OPEN_EVENT,
  getBgImageIds,
  getBgTransform,
  getCustomThemeBgState,
  getImageDataUrl,
  getRenderedBgPosition,
  getStoredBgPosition,
  hasAnimatedBg,
  hasRemovedBg,
  importCustomThemeImages,
  isAnimatedImage,
  isGradient,
  isJsonFile,
  LOADING_OVERLAY_STYLE,
  MAX_FILE_BYTES,
  parseImportedThemes,
  PHOTO_WIDGET_STATE_STORAGE_KEY,
  removeBgFromState,
  removeImageBg,
  renderImageToCanvas,
  restoreBgState,
  sanitizeBg,
  sanitizeCustomBgOptions,
  sanitizeCustomBgUrl,
  saveImageDataUrl,
  SELECTED_CUSTOM_THEME_ID_STORAGE_KEY,
  SELECTED_THEME_STORAGE_KEY,
  STOPWATCH_WIDGET_STATE_STORAGE_KEY,
  TEXT_WIDGET_STATE_STORAGE_KEY,
  THEME_LOADING_EVENT,
  TIMER_WIDGET_STATE_STORAGE_KEY,
  WIDGET_FRAME_STORAGE_KEY,
  WIDGET_INSTANCES_STORAGE_KEY,
  WIDGET_LAYOUT_PREVIEW_EVENT,
  WIDGET_LAYOUT_STORAGE_KEY,
  type BgImageState,
  type CustomBgOptions,
  type CustomTheme,
  type PhotoWidgetState,
  type SiteType,
  type WidgetFrameMap,
  type WidgetInstance,
  type WidgetKey,
  type WidgetLayoutOptions
} from "./utils"

const t = (key: string, value?: string) => chrome.i18n.getMessage(key, value)
const storage = new Storage()
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

const isSameWidgetLayout = (left: WidgetLayoutOptions, right: WidgetLayoutOptions) =>
  left.textColor === right.textColor &&
  left.bgColor === right.bgColor &&
  left.borderColor === right.borderColor &&
  left.opacity === right.opacity

const wrapperStyle = {
  position: "relative",
  width: "min(16rem, 32vw)",
  height: "min(32rem, 64vh)"
} as const
const rootStyle = {
  width: "100%",
  height: "100%",
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
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
  height: 28,
  padding: 4,
  border: "none",
  borderRadius: 8,
  whiteSpace: "nowrap",
  color: "#fff",
  backgroundColor: "#4b5563",
  cursor: "pointer"
} as const
const widgetActionButtonStyle = {
  ...controlButtonStyle,
  width: 24,
  height: 24,
  padding: 0,
  borderRadius: 999
} as const
const proButtonStyle = {
  ...controlButtonStyle,
  width: "100%",
  height: "auto",
  border: "none",
  padding: 8,
  color: "#fff",
  background: "linear-gradient(90deg, #F472B6, #C084FC, #60A5FA, #C084FC, #F472B6)",
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
  padding: "8px 4px",
  border: "none",
  borderRadius: 8,
  boxShadow: "none",
  outline: "none",
  color: "#fff",
  backgroundColor: "#4b5563",
  textAlign: "center"
} as const
const footerButtonStyle = {
  ...controlButtonStyle,
  display: "flex",
  flex: 1,
  height: "auto",
  justifyContent: "center",
  padding: 8
} as const

const downloadCustomTheme = async (themeData: CustomTheme) => {
  const blob = createThemeExportBlob(await exportCustomThemeImages(themeData))
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `decoai-theme-${themeData.name}.json`
  link.click()
  URL.revokeObjectURL(url)
}

const disabledControlStyle = (enabled: boolean) =>
  ({
    opacity: enabled ? 1 : 0.5,
    pointerEvents: enabled ? "auto" : "none"
  }) as const

const clearFileInput = (input: HTMLInputElement | null) => {
  if (input) input.value = ""
}

const isCurrentPageDarkMode = () => {
  const currentSite = detectCurrentSite()
  return currentSite ? document.querySelector(SITE_DARK_SELECTORS[currentSite]) !== null : false
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })

const updateTitleOverflow = (title: HTMLElement) => {
  const text = title.querySelector<HTMLElement>(".decoai-marquee-title__text")
  if (!text) return
  title.classList.remove("title-overflow")
  title.classList.toggle("title-overflow", text.scrollWidth > text.clientWidth + 1)
}

const getUniqueNumber = (baseName: string, names: Array<string | undefined>) => {
  const existingNames = new Set(names)
  let number = 1
  while (existingNames.has(`${baseName} ${number}`)) number += 1
  return `${baseName} ${number}`
}

const DEFAULT_PREVIEW = "conic-gradient(#ccc 25%, #fff 0 50%, #ccc 0 75%, #fff 0)"

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

  const bgValue = sanitizeBg(item.bgColor)
  const cardBg = bgValue || DEFAULT_PREVIEW
  const bgStyle = {
    backgroundImage: bgUrl ? `url(${bgUrl})` : "none",
    backgroundColor: "transparent",
    transform: getBgTransform(item.bgOptions),
    filter: bgUrl
      ? `invert(${item.bgOptions.invert}) grayscale(${item.bgOptions.grayscale}) brightness(${item.bgOptions.brightness})`
      : "none"
  } as CSSProperties

  return (
    <div className="custom-theme-card-wrap" style={{ position: "relative", zIndex: isDragging ? 2 : "auto" }}>
      <Tilt {...themeTiltProps} className="theme-card-tilt custom-theme-card-tilt" tiltEnable={!isDragging}>
        <button
          type="button"
          className={`theme-card custom-theme-card decoai-marquee-title${theme === "custom" && selectedCustomThemeId === item.id ? " is-active" : ""}${draggingCustomThemeId === item.id ? " is-dragging" : ""}`}
          style={cardBg ? { background: cardBg, backgroundSize: bgValue ? undefined : "16px 16px" } : undefined}
          onPointerEnter={(e) => updateTitleOverflow(e.currentTarget)}
          onClick={() => onCustomCardClick(item)}>
          <div className="theme-card__bg custom-theme-card__bg" style={bgStyle} />
          <div className="theme-card__title">
            <span className="decoai-marquee-title__text" data-title={item.name}>
              {item.name}
            </span>
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

function WidgetGroup({
  item,
  widgets,
  expanded,
  onToggle,
  onAdd,
  holderRef,
  onSortStart,
  onSortEnd,
  onRename,
  onDelete
}: {
  item: (typeof WIDGET_LIST)[number]
  widgets: WidgetInstance[]
  expanded: boolean
  onToggle: () => void
  onAdd: () => void
  holderRef: RefObject<HTMLDivElement>
  onSortStart: (bounds: HTMLElement | null) => void
  onSortEnd: (oldIndex: number, newIndex: number) => void
  onRename: (widget: WidgetInstance, name: string) => void
  onDelete: (widget: WidgetInstance) => void
}) {
  const [editingWidgetId, setEditingWidgetId] = useState("")
  const [editingTitle, setEditingTitle] = useState("")
  const listRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = titleInputRef.current
    if (!input) return

    const stopPropagation = (e: KeyboardEvent) => e.stopPropagation()
    input.addEventListener("keypress", stopPropagation)
    return () => input.removeEventListener("keypress", stopPropagation)
  }, [editingWidgetId])

  const startTitleEditing = (widget: WidgetInstance) => {
    setEditingWidgetId(widget.id)
    setEditingTitle(widget.name ?? t(item.labelKey))
  }

  const finishTitleEditing = (widget: WidgetInstance) => {
    onRename(widget, editingTitle)
    setEditingWidgetId("")
  }

  return (
    <Card>
      <div style={rowStyle}>
        <span style={{ ...iconLabelStyle, gap: 8 }}>
          <Icon icon={`lucide:${item.icon}`} height={16} aria-hidden="true" />
          <span style={fieldLabelStyle}>{t(item.labelKey)}</span>
        </span>
        <div style={iconLabelStyle}>
          <button type="button" className="decoai-widget-action__add" onClick={onAdd} style={widgetActionButtonStyle}>
            <Icon icon="lucide:plus" height={16} aria-hidden="true" />
          </button>
          <button type="button" className="decoai-control-button" onClick={onToggle} style={widgetActionButtonStyle}>
            <Icon icon={`lucide:chevron-${expanded ? "up" : "down"}`} height={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      {expanded && widgets.length > 0 && (
        <div ref={listRef}>
          <SortableList
            as="div"
            lockAxis="y"
            customHolderRef={holderRef}
            draggedItemClassName="widget-group-row-dragged"
            onSortStart={() => onSortStart(listRef.current)}
            onSortEnd={onSortEnd}
            style={{ ...sectionStyle, padding: 4 }}>
            {widgets.map((widget) => (
              <SortableItem key={widget.id}>
                <div className="widget-group-row" style={{ ...rowStyle, gap: 8 }}>
                  <SortableKnob>
                    <button type="button" className="decoai-control-button" style={widgetActionButtonStyle}>
                      <Icon icon="lucide:grip-horizontal" height={16} aria-hidden="true" />
                    </button>
                  </SortableKnob>
                  {editingWidgetId === widget.id ? (
                    <input
                      ref={titleInputRef}
                      autoFocus
                      type="text"
                      value={editingTitle}
                      maxLength={20}
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(e) => setEditingTitle(e.target.value.slice(0, 20))}
                      onBlur={() => finishTitleEditing(widget)}
                      onPointerDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur()
                      }}
                      onKeyUp={(e) => e.stopPropagation()}
                      style={{
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
                      }}
                    />
                  ) : (
                    <div
                      className="decoai-widget-title decoai-marquee-title"
                      onClick={() => startTitleEditing(widget)}
                      onPointerEnter={(e) => updateTitleOverflow(e.currentTarget)}>
                      <span className="decoai-marquee-title__text" data-title={widget.name}>
                        {widget.name}
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    className="decoai-widget-action__delete"
                    style={widgetActionButtonStyle}
                    onClick={() => onDelete(widget)}>
                    <Icon icon="lucide:trash-2" height={16} aria-hidden="true" />
                  </button>
                </div>
              </SortableItem>
            ))}
          </SortableList>
        </div>
      )}
    </Card>
  )
}

export function FabPanelApp() {
  const panelRootRef = useRef<HTMLDivElement>(null)
  const themeGridScrollRef = useRef<HTMLDivElement>(null)
  const widgetSortScrollRef = useRef<HTMLElement>(null)
  const [theme, setTheme] = useStorage(SELECTED_THEME_STORAGE_KEY, "default")
  const [panelMode, setPanelMode] = useState<PanelMode>("theme")
  const [view, setView] = useState<PanelView>("themes")
  const [themeTab, setThemeTab] = useState<ThemeTab>("preset")
  const [widgetTab, setWidgetTab] = useState<WidgetTab>("visibility")
  const [customEditTab, setCustomEditTab] = useState<CustomEditTab>("general")
  const [widgetItems, setWidgetItems] = useStorage<WidgetInstance[]>(WIDGET_INSTANCES_STORAGE_KEY, DEFAULT_WIDGET_INSTANCES)
  const [, setWidgetFrameMap] = useStorage<WidgetFrameMap>(WIDGET_FRAME_STORAGE_KEY, {})
  const [widgetLayout, setWidgetLayout] = useStorage<WidgetLayoutOptions>(WIDGET_LAYOUT_STORAGE_KEY, DEFAULT_WIDGET_LAYOUT)
  const bgUploadRef = useRef<HTMLInputElement>(null)
  const bgPreviewRef = useRef<HTMLDivElement>(null)
  const [bgPreviewTarget, setBgPreviewTarget] = useState<HTMLElement | null>(null)
  const importFileRef = useRef<HTMLInputElement>(null)
  const [draftBgImageUrl, setDraftBgImageUrl] = useState("")
  const [draftBgImageId, setDraftBgImageId] = useState("")
  const [draftBgAnimated, setDraftBgAnimated] = useState(false)
  const [draftOriginalBgImageUrl, setDraftOriginalBgImageUrl] = useState("")
  const [draftOriginalBgImageId, setDraftOriginalBgImageId] = useState("")
  const [draftOriginalBgAnimated, setDraftOriginalBgAnimated] = useState(false)
  const [storedCustomThemes, setCustomThemes] = useStorage<CustomTheme[]>(
    { key: CUSTOM_THEMES_STORAGE_KEY, instance: localStorageInstance }, []
  )
  const [selectedCustomThemeId, setSelectedCustomThemeId] = useStorage(
    { key: SELECTED_CUSTOM_THEME_ID_STORAGE_KEY, instance: localStorageInstance }, ""
  )
  const [editingCustomThemeId, setEditingCustomThemeId] = useState("")
  const [premiumStatus, setPremiumStatus] = useState<PremiumStatus>("unknown")
  const [draftBgOptions, setDraftBgOptions] = useState<CustomBgOptions>(DEFAULT_CUSTOM_BG_OPTIONS)
  const [draftTextColor, setDraftTextColor] = useState("")
  const [draftBorderColor, setDraftBorderColor] = useState("")
  const [draftCustomThemeName, setDraftCustomThemeName] = useState("")
  const [draftBgColor, setDraftBgColor] = useState("")
  const [draftWidgetLayout, setDraftWidgetLayout] = useState<WidgetLayoutOptions>(DEFAULT_WIDGET_LAYOUT)
  const [isLoading, setIsLoading] = useState(false)
  const [draggingCustomThemeId, setDraggingCustomThemeId] = useState("")
  const [expandedWidgetTypes, setExpandedWidgetTypes] = useState<Partial<Record<WidgetKey, boolean>>>({})
  const customThemeClickRef = useRef("")
  const previousViewRef = useRef<PanelView>(view)
  const canResetText = Boolean((draftTextColor || "").trim())
  const canResetBorder = Boolean((draftBorderColor || "").trim())
  const isPremiumChecked = premiumStatus !== "unknown"
  const isPremiumUser = premiumStatus === "premium"
  const isFreeUser = premiumStatus === "free"
  const customThemes = Array.isArray(storedCustomThemes) ? storedCustomThemes : []
  const selectedCustomTheme = customThemes.find((item) => item.id === selectedCustomThemeId)
  function stopCustomThemeDragClamp() {
    document.removeEventListener("mousemove", clampCustomThemeDrag)
  }

  function clampCustomThemeDrag() {
    const dragged = panelRootRef.current?.querySelector<HTMLElement>(
      ".custom-theme-card-dragged, .widget-group-row-dragged"
    )
    const scrollArea = dragged?.classList.contains("widget-group-row-dragged")
      ? widgetSortScrollRef.current
      : themeGridScrollRef.current
    if (!scrollArea || !dragged) return

    dragged.style.removeProperty("translate")

    const dragRect = dragged.getBoundingClientRect()
    const scrollRect = scrollArea.getBoundingClientRect()

    const x = Math.min(Math.max(scrollRect.left - dragRect.left, 0), scrollRect.right - dragRect.right)
    const y = Math.min(Math.max(scrollRect.top - dragRect.top, 0), scrollRect.bottom - dragRect.bottom)

    dragged.style.setProperty("translate", `${x}px ${y}px`)
  }

  useEffect(() => {
    if (!customThemes.length && selectedCustomThemeId) setSelectedCustomThemeId("")
    if (selectedCustomThemeId && !customThemes.some((item) => item.id === selectedCustomThemeId))
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
    setDraftWidgetLayout((prev) => (isSameWidgetLayout(prev, nextLayout) ? prev : nextLayout))
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
    }, 250)

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
    const onAuthSessionChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== "local") return

      const authSessionChange = changes[AUTH_SESSION_STORAGE_KEY]
      if (!authSessionChange) return

      void syncGoogleSession()
    }

    chrome.storage.onChanged.addListener(onAuthSessionChanged)
    return () => chrome.storage.onChanged.removeListener(onAuthSessionChanged)
  }, [])

  useEffect(() => {
    const onThemeLoading = (e: Event) => {
      const customEvent = e as CustomEvent<{ loading?: boolean }>
      setIsLoading(customEvent.detail?.loading === true)
    }
    window.addEventListener(THEME_LOADING_EVENT, onThemeLoading)
    return () => window.removeEventListener(THEME_LOADING_EVENT, onThemeLoading)
  }, [])

  useEffect(() => {
    const onFabOpen = (e: Event) => {
      const customEvent = e as CustomEvent<{ view?: PanelMode }>
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
  const getThemeImageIds = (themeData?: CustomTheme) =>
    themeData ? getBgImageIds(getCustomThemeBgState(themeData)) : []

  const isBgImageUsed = (imageId: string, ignoredThemeId = "") =>
    customThemes.some(
      (item) => item.id !== ignoredThemeId && (item.bgImageId === imageId || item.bgOriginalImageId === imageId)
    )

  const deleteBgImage = (imageId: string, ignoredThemeId = "") => {
    if (imageId && !isBgImageUsed(imageId, ignoredThemeId)) void deleteImageData(imageId)
  }

  const deleteDraftBgImage = (imageId = draftBgImageId) => {
    if (!imageId || imageId === editingTheme?.bgImageId || imageId === editingTheme?.bgOriginalImageId) return
    deleteBgImage(imageId)
  }

  const getDraftBgState = (): BgImageState => ({
    imageId: draftBgImageId,
    imageUrl: draftBgImageUrl,
    animated: draftBgAnimated,
    originalImageId: draftOriginalBgImageId,
    originalImageUrl: draftOriginalBgImageUrl,
    originalAnimated: draftOriginalBgAnimated
  })
  const setDraftBgState = (state: BgImageState) => {
    setDraftBgImageId(state.imageId)
    setDraftBgImageUrl(state.imageUrl || "")
    setDraftBgAnimated(state.animated)
    setDraftOriginalBgImageId(state.originalImageId || "")
    setDraftOriginalBgImageUrl(state.originalImageUrl || "")
    setDraftOriginalBgAnimated(state.originalAnimated === true)
  }
  const draftBgRemovalUsed = hasRemovedBg(getDraftBgState())

  const getEditingThemeDraft = () => {
    if (!editingTheme) return null

    return {
      ...editingTheme,
      name: draftCustomThemeName,
      text: draftTextColor,
      border: draftBorderColor,
      bgImageId: draftBgImageId,
      bgUrl: draftBgImageUrl && !draftBgImageId ? draftBgImageUrl : undefined,
      bgAnimated: draftBgAnimated,
      bgOriginalImageId: draftOriginalBgImageId,
      bgOriginalAnimated: draftOriginalBgAnimated,
      bgOriginalUrl: draftOriginalBgImageUrl && !draftOriginalBgImageId ? draftOriginalBgImageUrl : undefined,
      bgColor: draftBgColor,
      bgOptions: draftBgOptions
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
    const bgState = getCustomThemeBgState(editingTheme)
    const bgRemovalUsed = hasRemovedBg(bgState)
    setDraftTextColor(editingTheme.text || "")
    setDraftBorderColor(editingTheme.border || "")
    setDraftBgState(bgState)
    if (editingTheme.bgImageId) {
      void getImageDataUrl(editingTheme.bgImageId)
        .then(setDraftBgImageUrl)
        .catch(() => {
          setDraftBgImageUrl("")
        })
    }
    if (bgRemovalUsed && editingTheme.bgOriginalImageId) {
      void getImageDataUrl(editingTheme.bgOriginalImageId)
        .then(setDraftOriginalBgImageUrl)
        .catch(() => setDraftOriginalBgImageUrl(""))
    }
    setDraftBgColor(editingTheme.bgColor || "")
    setDraftBgOptions(sanitizeCustomBgOptions(editingTheme.bgOptions))
    setDraftCustomThemeName(editingTheme.name || "")
    setCustomEditTab("general")
  }, [editingTheme?.id])

  const updateCustomBgOption = (key: keyof CustomBgOptions, value: string | number | boolean) =>
    setDraftBgOptions((prev) => ({ ...prev, [key]: value }))

  const rotateDraftBg = (degrees: -90 | 90) => {
    setDraftBgOptions((prev) => {
      const nextRotation = ((Number(prev.rotation) || 0) + degrees) % 360
      return {
        ...prev,
        rotation: nextRotation < 0 ? nextRotation + 360 : nextRotation
      }
    })
  }

  const zoomDraftBg = (amount: number) => {
    setDraftBgOptions((prev) => ({
      ...prev,
      zoom: clampNumber(prev.zoom + amount, 1, 3, 1)
    }))
  }

  const fitDraftBg = () => {
    setDraftBgOptions((prev) => ({ ...prev, zoom: 1, position: "50% 50%" }))
  }

  const dragDraftBg = (deltaX: number, deltaY: number) => {
    const bounds = bgPreviewRef.current?.getBoundingClientRect()
    if (!bounds?.width || !bounds.height) return

    setDraftBgOptions((prev) => {
      const sideways = prev.rotation === 90 || prev.rotation === 270
      const position = getRenderedBgPosition(prev.position, prev.rotation, prev.scaleX)
      const stored = getStoredBgPosition(
        clampNumber(position.x + (deltaX / (sideways ? bounds.height : bounds.width)) * 100, 0, 100, 50),
        clampNumber(position.y + (deltaY / (sideways ? bounds.width : bounds.height)) * 100, 0, 100, 50),
        prev.rotation,
        prev.scaleX
      )
      return { ...prev, position: `${stored.x}% ${stored.y}%` }
    })
  }

  const bgPreviewActions = [
    {
      icon: "zoom-in",
      onClick: () => zoomDraftBg(0.1),
      disabled: draftBgOptions.zoom >= 3
    },
    {
      icon: "zoom-out",
      onClick: () => zoomDraftBg(-0.1),
      disabled: draftBgOptions.zoom <= 1
    },
    { icon: "expand", onClick: fitDraftBg },
    { icon: "undo-dot", onClick: () => rotateDraftBg(-90) },
    { icon: "redo-dot", onClick: () => rotateDraftBg(90) },
    {
      icon: "flip-horizontal-2",
      onClick: () => updateCustomBgOption("scaleX", draftBgOptions.scaleX === -1 ? 1 : -1)
    }
  ]
  const normalizeCustomThemes = () => {
    if (!customThemes.length) return false

    const source = selectedCustomTheme ?? customThemes[0]
    const theme = clearAnimatedBgUrl(source)
    const themes = [theme]
    const changed = customThemes.length !== 1 || theme !== source

    if (changed) {
      customThemes.forEach((item) => {
        if (!themes.some((theme) => theme.id === item.id)) {
          getThemeImageIds(item).forEach((imageId) => deleteBgImage(imageId, item.id))
        } else {
          getThemeImageIds(item)
            .filter((imageId) => !getThemeImageIds(theme).includes(imageId))
            .forEach((imageId) => deleteBgImage(imageId, item.id))
        }
      })
      setCustomThemes(themes)
    }
    if (selectedCustomThemeId !== theme.id) setSelectedCustomThemeId(theme.id)
    if (editingCustomThemeId && editingCustomThemeId !== theme.id) {
      setEditingCustomThemeId("")
      setView("themes")
    }
    if (draftBgAnimated) {
      deleteDraftBgImage()
      setDraftBgImageId("")
      setDraftBgImageUrl("")
      setDraftBgAnimated(false)
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
    const changed = nextItems.length !== items.length || nextItems.some((item, index) => item.id !== items[index]?.id)

    if (changed) setWidgetItems(nextItems)

    return changed
  }

  useEffect(() => {
    if (!isPremiumChecked || !isFreeUser || isPremiumUser) return

    const themeLimitLocked = customThemes.length > 1
    const animatedThemeLocked = hasAnimatedBg(customThemes)
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
    draftBgAnimated,
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
    draftBorderColor,
    draftBgImageId,
    draftBgImageUrl,
    draftBgAnimated,
    draftBgColor,
    draftBgOptions
  ])

  const openCheckout = async (idToken: string) => {
    await new Promise<void>((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "OPEN_CHECKOUT", idToken }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        if (!response?.success) {
          reject(new Error(response?.error || "Failed to open checkout"))
          return
        }
        resolve()
      })
    })
  }

  const syncGoogleSession = async (verifyGrant = false) => {
    let authSession: AuthSessionSnapshot | null = null
    try {
      authSession = await getValidAuthSessionSnapshot(
        verifyGrant ? { refreshPremiumStatus: true, verifyGoogleGrant: true } : undefined
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
      isPremium = await getVerifiedPremiumStatus(false)
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

    let imported: CustomTheme[] = []
    const importImageIds: string[] = []
    try {
      const text = await file.text()
      imported = parseImportedThemes(text, (index) => `${t("theme")} ${index + 1}`)
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
      const result = await importCustomThemeImages(imported)
      imported = result.themes
      importImageIds.push(...result.imageIds)
    } catch {
      importImageIds.forEach((imageId) => void deleteImageData(imageId))
      toast.error(t("error_fileInvalid", "JSON"))
      clearFileInput(importFileRef.current)
      return
    }

    const hasAnimatedImportedTheme = hasAnimatedBg(imported)
    if (hasAnimatedImportedTheme && !(await requirePremiumAccess("pro_animatedBG"))) {
      importImageIds.forEach((imageId) => void deleteImageData(imageId))
      clearFileInput(importFileRef.current)
      return
    }

    const premium = await refreshPremiumStatus()

    if (premium) {
      setCustomThemes((prev) => [...prev, ...imported])
    } else {
      const keepImageIds = new Set(getThemeImageIds(imported[0]))
      importImageIds.forEach((imageId) => {
        if (!keepImageIds.has(imageId)) void deleteImageData(imageId)
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
        deleteDraftBgImage()
        setDraftBgState({ imageId: "", imageUrl: result, animated })
      } catch {
        toast.error(t("error_fileInvalid", "IMG"))
      } finally {
        clearFileInput(bgUploadRef.current)
      }
    }
    reader.readAsDataURL(file)
  }

  const onThemeClick = (key: string) => {
    deleteDraftBgImage()
    setTheme("")
    setTheme(key)
    setEditingCustomThemeId("")
    setView("themes")
  }
  const onSaveClick = async () => {
    if (isLoading) return

    const nextTheme = getEditingThemeDraft()
    const oldImageIds = getThemeImageIds(editingTheme)

    if (!nextTheme) return

    setIsLoading(true)

    try {
      const shouldSaveImage = Boolean(draftBgImageUrl && !draftBgImageId)
      const shouldSaveOriginalImage = Boolean(draftOriginalBgImageUrl && !draftOriginalBgImageId)
      const [bgImageId, bgOriginalImageId] = await Promise.all([
        shouldSaveImage ? saveImageDataUrl(draftBgImageUrl) : draftBgImageId,
        shouldSaveOriginalImage ? saveImageDataUrl(draftOriginalBgImageUrl) : draftOriginalBgImageId
      ])
      const { bgUrl, bgOriginalUrl, ...storageTheme } = {
        ...nextTheme,
        bgImageId,
        bgOriginalImageId
      }

      setCustomThemes((prev) => prev.map((item) => (item.id === storageTheme.id ? storageTheme : item)))
      setDraftBgImageId(bgImageId)
      setDraftOriginalBgImageId(bgOriginalImageId)
      const nextImageIds = new Set(getThemeImageIds(storageTheme))
      oldImageIds.forEach((imageId) => {
        if (imageId && !nextImageIds.has(imageId)) {
          deleteBgImage(imageId, storageTheme.id)
        }
      })

      setView("themes")
      toast.success(t("success_themeSave"))
    } catch {
      toast.error(t("error_themeSave"))
    } finally {
      setIsLoading(false)
    }
  }
  const resetCustomText = () => setDraftTextColor("")
  const resetCustomBorder = () => setDraftBorderColor("")
  const resetDraftBgImage = () => {
    deleteDraftBgImage()
    setDraftBgState({ imageId: "", animated: false })
    setDraftBgOptions(DEFAULT_CUSTOM_BG_OPTIONS)
  }
  const restoreDraftBgImage = () => {
    if (!draftBgRemovalUsed || !draftOriginalBgImageUrl) return
    deleteDraftBgImage()
    setDraftBgState(restoreBgState(getDraftBgState()))
  }
  const resetDraftBgColor = () => setDraftBgColor("")

  const onRemoveBgClick = async () => {
    if (isLoading || !draftBgImageUrl || draftBgRemovalUsed) return
    setIsLoading(true)

    if (!(await requirePremiumAccess("pro_removeBG"))) {
      setIsLoading(false)
      return
    }

    const toastId = toast.loading(t("loading_removeBG"))

    try {
      const result = await removeImageBg(draftBgImageUrl)

      deleteDraftBgImage()
      setDraftBgState(removeBgFromState(getDraftBgState(), { imageUrl: result }))

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
    if (isLoading || (!draftBgImageUrl && !sanitizeBg(draftBgColor))) return
    setIsLoading(true)

    if (!(await requirePremiumAccess("pro_colorMatch"))) {
      setIsLoading(false)
      return
    }

    const toastId = toast.loading(t("loading_colorMatch"))

    try {
      await wait(2000)
      const canvas = await renderImageToCanvas(draftBgImageUrl, draftBgOptions, 256, draftBgColor)
      const palette = await Vibrant.from(canvas.toDataURL()).getPalette()
      const isDarkMode = isCurrentPageDarkMode()
      const nextBorder = palette.Vibrant?.hex || ""
      const nextText = isDarkMode ? palette.LightVibrant?.hex || "" : palette.DarkVibrant?.hex || ""

      if (nextBorder) setDraftBorderColor(nextBorder)
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
    deleteDraftBgImage()
    setEditingCustomThemeId("")
    setSelectedCustomThemeId(customThemeItem.id)
    setTheme("custom")
    setView("themes")
  }

  const onCustomThemeSortStart = (widgetBounds: HTMLElement | null = null) => {
    widgetSortScrollRef.current = widgetBounds
    setDraggingCustomThemeId("")

    const rect = panelRootRef.current?.getBoundingClientRect()
    if (!rect) return
    panelRootRef.current?.style.setProperty("--custom-theme-drag-left", `${-rect.left}px`)
    panelRootRef.current?.style.setProperty("--custom-theme-drag-top", `${-rect.top}px`)

    stopCustomThemeDragClamp()
    document.addEventListener("mousemove", clampCustomThemeDrag)
    document.addEventListener("mouseup", stopCustomThemeDragClamp, {
      once: true
    })
  }

  const onCustomThemeSortEnd = (oldIndex: number, newIndex: number) => {
    stopCustomThemeDragClamp()
    widgetSortScrollRef.current = null
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
    const baseName = t("theme")
    setCustomThemes((prev) => [
      ...prev,
      createCustomTheme(
        getUniqueNumber(
          baseName,
          prev.map((item) => item.name)
        )
      )
    ])
  }

  const deleteCustomTheme = (customThemeId: string) => {
    if (!customThemeId) return
    const deletedTheme = customThemes.find((item) => item.id === customThemeId)
    const deletingSelected = selectedCustomThemeId === customThemeId && theme === "custom"
    const nextThemes = customThemes.filter((item) => item.id !== customThemeId)
    setCustomThemes(nextThemes)
    getThemeImageIds(deletedTheme).forEach((imageId) => deleteBgImage(imageId, deletedTheme?.id || ""))
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

    const copiedTheme = { ...customThemeItem, id: crypto.randomUUID() }
    const sourceIndex = customThemes.findIndex((item) => item.id === customThemeItem.id)

    setCustomThemes((prev) => {
      const nextThemes = [...prev]
      nextThemes.splice(sourceIndex + 1, 0, copiedTheme)
      return nextThemes
    })

    toast.success(t("success_themeDuplicate"))
  }

  const addWidget = async (key: WidgetKey) => {
    const items = widgetItems || DEFAULT_WIDGET_INSTANCES
    if (items.some((widget) => widget.type === key) && !(await requirePremiumAccess("pro_widgetLimit"))) {
      return
    }

    const widgetMeta = WIDGET_LIST.find((widget) => widget.key === key)
    const baseName = t(widgetMeta?.labelKey)
    setWidgetItems((prev) => {
      const currentItems = prev || DEFAULT_WIDGET_INSTANCES
      const sameTypeNames = currentItems.filter((widget) => widget.type === key).map((widget) => widget.name)

      return [
        ...currentItems,
        {
          id: `${key}-${crypto.randomUUID()}`,
          type: key,
          name: getUniqueNumber(baseName, sameTypeNames)
        }
      ]
    })
    setExpandedWidgetTypes((prev) => ({ ...prev, [key]: true }))
  }

  const sortWidgets = (key: WidgetKey, oldIndex: number, newIndex: number) => {
    stopCustomThemeDragClamp()
    widgetSortScrollRef.current = null
    if (oldIndex === newIndex) return

    setWidgetItems((prev) => {
      const items = prev || DEFAULT_WIDGET_INSTANCES
      const typeItems = items.filter((widget) => widget.type === key)
      typeItems.splice(newIndex, 0, typeItems.splice(oldIndex, 1)[0])
      let index = 0
      return items.map((widget) => (widget.type === key ? typeItems[index++] : widget))
    })
  }

  const renameWidget = (widget: WidgetInstance, name: string) => {
    setWidgetItems((prev) =>
      (prev || DEFAULT_WIDGET_INSTANCES).map((item) => (item.id === widget.id ? { ...item, name } : item))
    )
  }

  const getWidgetStateKey = (widget: WidgetInstance) => {
    switch (widget.type) {
      case "note":
      case "todo":
        return `${TEXT_WIDGET_STATE_STORAGE_KEY}:${widget.id}`
      case "dday":
        return `${DDAY_WIDGET_STATE_STORAGE_KEY}:${widget.id}`
      case "timer":
        return `${TIMER_WIDGET_STATE_STORAGE_KEY}:${widget.id}`
      case "stopwatch":
        return `${STOPWATCH_WIDGET_STATE_STORAGE_KEY}:${widget.id}`
      case "photo":
        return `${PHOTO_WIDGET_STATE_STORAGE_KEY}:${widget.id}`
      default:
        return null
    }
  }

  const deleteWidget = async (widget: WidgetInstance) => {
    const stateKey = getWidgetStateKey(widget)
    if (stateKey) {
      const stateStorage =
        widget.type === "note" || widget.type === "todo" || widget.type === "photo" ? localStorageInstance : storage
      const photoState = widget.type === "photo" ? await localStorageInstance.get<PhotoWidgetState>(stateKey) : null
      await stateStorage.remove(stateKey)
      getBgImageIds(photoState).forEach((imageId) => void deleteImageData(imageId))
    }

    setWidgetItems((prev) => (prev || DEFAULT_WIDGET_INSTANCES).filter((item) => item.id !== widget.id))
    setWidgetFrameMap((prev) => {
      const { [widget.id]: _removed, ...nextFrameMap } = prev || {}
      return nextFrameMap
    })
  }

  const updateWidgetLayout = (key: keyof WidgetLayoutOptions, value: string | number) => {
    setDraftWidgetLayout((prev) => ({ ...prev, [key]: value }))
  }

  const resetWidgetLayout = (key: keyof WidgetLayoutOptions) => {
    setDraftWidgetLayout((prev) => ({
      ...prev,
      [key]: DEFAULT_WIDGET_LAYOUT[key]
    }))
  }

  const cancelEditingTheme = () => {
    deleteDraftBgImage()
    publishEditingThemePreview(null)
    setEditingCustomThemeId("")
    setView("themes")
  }

  return (
    <>
      <style>{`
        * { margin: 0; box-sizing: border-box; user-select: none; -webkit-user-select: none; }
        .content-scroll { scrollbar-width: none; }
        .theme-card {
          position: relative;
          width: 100%;
          overflow: hidden;
        }
        .preset-theme-card {
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
        .theme-card__bg {
          position: absolute;
          background-position: center center;
          background-size: cover;
        }
        .preset-theme-card__bg {
          inset: 0;
          z-index: 0;
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
        .theme-card__title {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 24px;
          padding: 0 4px;
          background-color: #0000008D;
          color: #fff;
          overflow: hidden;
        }
        .theme-card:hover .theme-card__title { background-color: #0000004D; }
        .theme-card__title .decoai-marquee-title__text {
          margin: 0 auto;
          line-height: 24px;
        }
        .theme-card.title-overflow:hover .decoai-marquee-title__text {
          margin: 0;
        }
        .theme-card.is-active::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 3;
          border-radius: 12px;
          box-shadow: inset 0 0 0 2px #66cdaa;
          pointer-events: none;
        }
        .custom-theme-card {
          height: 100px;
          padding: 0;
          border: none;
          border-radius: 12px;
          cursor: pointer;
        }
        .custom-theme-card.is-dragging {
          opacity: 0.5;
          transform: scale(0.9);
        }
        .custom-theme-card__bg {
          top: 50%;
          left: 50%;
          width: 100%;
          height: 100%;
          background-size: cover;
          background-repeat: no-repeat;
          transform-origin: center center;
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
        }
        .custom-theme-card-wrap {
          position: relative;
        }
        .custom-theme-card-dragged,
        .widget-group-row-dragged {
          top: var(--custom-theme-drag-top, 0px) !important;
          left: var(--custom-theme-drag-left, 0px) !important;
        }
        .decoai-widget-title {
          flex: 1;
          width: 100%;
          min-height: 1em;
          overflow: hidden;
          cursor: text;
          user-select: none;
        }
        .decoai-marquee-title__text {
          display: block;
          width: max-content;
          max-width: 100%;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
        .decoai-marquee-title.title-overflow:hover .decoai-marquee-title__text {
          display: inline-flex;
          gap: 48px;
          max-width: none;
          animation: title-marquee 6s linear infinite;
        }
        .decoai-marquee-title.title-overflow:hover .decoai-marquee-title__text::after {
          content: attr(data-title);
        }
        .custom-theme-card:hover .custom-theme-card__actions,
        .custom-theme-card-wrap:hover .custom-theme-card__actions {
          opacity: 1;
          transform: scale(1);
        }
        .theme-card__title,
        .custom-theme-card__actions,
        .custom-theme-card__action,
        .decoai-control-button,
        .decoai-widget-action__add,
        .decoai-widget-action__delete { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        .custom-theme-card__duplicate:hover,
        .decoai-widget-action__add:hover { background-color: #1976d2 !important; }
        .custom-theme-card__delete:hover,
        .decoai-widget-action__delete:hover { background-color: #d32f2f !important; }
        .pro-button { animation: pro-gradient 10s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
        .decoai-control-button:not(:disabled):hover,
        .footer button:not(:disabled):hover { filter: brightness(1.1); }
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
        <div
          ref={panelRootRef}
          data-decoai-theme-editing={panelMode === "theme" && view === "custom" && editingTheme ? "true" : "false"}
          style={rootStyle}>
          <div style={contentStyle}>
            {panelMode === "widget" && (
              <>
                <h3 style={centeredHeadingStyle}>
                  {t("widget")} {t("setting")}
                </h3>
                <div
                  style={{
                    ...tabGridStyle,
                    marginTop: 20,
                    gridTemplateColumns: "1fr 1fr"
                  }}>
                  {(["visibility", "layout"] as const).map((tab) => (
                    <TabButton key={tab} active={widgetTab === tab} label={t(tab)} onClick={() => setWidgetTab(tab)} />
                  ))}
                </div>
                <div className="content-scroll" style={editSectionScrollStyle}>
                  {widgetTab === "visibility" && (
                    <>
                      {WIDGET_LIST.map((item) => {
                        const typeWidgets = (widgetItems || DEFAULT_WIDGET_INSTANCES).filter(
                          (widget) => widget.type === item.key
                        )

                        return (
                          <WidgetGroup
                            key={item.key}
                            item={item}
                            widgets={typeWidgets}
                            expanded={Boolean(expandedWidgetTypes[item.key])}
                            holderRef={panelRootRef}
                            onToggle={() =>
                              setExpandedWidgetTypes((prev) => ({
                                ...prev,
                                [item.key]: !prev[item.key]
                              }))
                            }
                            onAdd={() => void addWidget(item.key)}
                            onSortStart={onCustomThemeSortStart}
                            onSortEnd={(oldIndex, newIndex) => sortWidgets(item.key, oldIndex, newIndex)}
                            onRename={renameWidget}
                            onDelete={deleteWidget}
                          />
                        )
                      })}
                    </>
                  )}
                  {widgetTab === "layout" && (
                    <>
                      <ColorSettingCard
                        label={t("backgroundColor")}
                        value={draftWidgetLayout.bgColor}
                        onChange={(value) => updateWidgetLayout("bgColor", value)}
                        onReset={() => resetWidgetLayout("bgColor")}
                        canReset={draftWidgetLayout.bgColor !== DEFAULT_WIDGET_LAYOUT.bgColor}
                        allowGradient
                      />
                      <ColorSettingCard
                        label={t("text")}
                        value={draftWidgetLayout.textColor}
                        onChange={(value) => updateWidgetLayout("textColor", value)}
                        onReset={() => resetWidgetLayout("textColor")}
                        canReset={draftWidgetLayout.textColor !== DEFAULT_WIDGET_LAYOUT.textColor}
                      />
                      <ColorSettingCard
                        label={t("border")}
                        value={draftWidgetLayout.borderColor}
                        onChange={(value) => updateWidgetLayout("borderColor", value)}
                        onReset={() => resetWidgetLayout("borderColor")}
                        canReset={draftWidgetLayout.borderColor !== DEFAULT_WIDGET_LAYOUT.borderColor}
                      />
                      <RangeCard
                        label={t("opacity")}
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round(draftWidgetLayout.opacity * 100)}
                        onChange={(value) => updateWidgetLayout("opacity", Number(value) / 100)}
                        onReset={() => resetWidgetLayout("opacity")}
                      />
                    </>
                  )}
                </div>
              </>
            )}
            {panelMode === "theme" && view === "themes" && (
              <>
                <h3 style={centeredHeadingStyle}>
                  {t("theme")} {t("setting")}
                </h3>
                <div style={themeSectionStyle}>
                  <div style={{ ...tabGridStyle, gridTemplateColumns: "1fr 1fr" }}>
                    {(["preset", "custom"] as const).map((tab) => (
                      <TabButton key={tab} active={themeTab === tab} label={t(tab)} onClick={() => setThemeTab(tab)} />
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
                        checked={draftBgOptions.hideHeader}
                        onChange={(c) => updateCustomBgOption("hideHeader", c)}
                      />
                      <CheckboxCard
                        label={t("hideFooter")}
                        checked={draftBgOptions.hideFooter}
                        onChange={(c) => updateCustomBgOption("hideFooter", c)}
                      />
                    </>
                  )}
                  {customEditTab === "background" && (
                    <>
                      <ColorSettingCard
                        label={t("backgroundColor")}
                        value={draftBgColor}
                        onChange={setDraftBgColor}
                        onReset={resetDraftBgColor}
                        canReset={Boolean(draftBgColor)}
                        allowGradient
                      />
                      <Card>
                        <div style={rowStyle}>
                          <span style={fieldLabelStyle}>{t("backgroundImage")}</span>
                          <div style={iconLabelStyle}>
                            <input
                              ref={bgUploadRef}
                              type="file"
                              accept="image/*"
                              onChange={(e) => onUploadCustomBg(e.target.files?.[0])}
                              style={{ display: "none" }}
                            />
                            <button
                              type="button"
                              className="decoai-control-button"
                              onClick={() => bgUploadRef.current?.click()}
                              style={controlButtonStyle}>
                              <Icon icon="lucide:image-up" height={20} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="decoai-control-button"
                              onClick={resetDraftBgImage}
                              disabled={!draftBgImageUrl}
                              style={{
                                ...controlButtonStyle,
                                ...disabledControlStyle(Boolean(draftBgImageUrl))
                              }}>
                              <Icon icon="lucide:rotate-ccw" height={20} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </Card>
                      {draftBgImageUrl && (
                        <>
                          <Card>
                            <div style={rowStyle}>
                              <span style={fieldLabelStyle}>{t("removeBG")}</span>
                              <div style={iconLabelStyle}>
                                <button
                                  type="button"
                                  className="decoai-control-button"
                                  onClick={draftBgRemovalUsed ? restoreDraftBgImage : onRemoveBgClick}
                                  disabled={isLoading || (draftBgRemovalUsed && !draftOriginalBgImageUrl)}
                                  style={{
                                    ...controlButtonStyle,
                                    ...disabledControlStyle(
                                      !isLoading && (!draftBgRemovalUsed || Boolean(draftOriginalBgImageUrl))
                                    )
                                  }}>
                                  <Icon
                                    icon={draftBgRemovalUsed ? "lucide:rotate-ccw" : "lucide:sparkles"}
                                    height={20}
                                    color={draftBgRemovalUsed ? undefined : "#66cdaa"}
                                    aria-hidden="true"
                                  />
                                </button>
                              </div>
                            </div>
                          </Card>
                          <Card>
                            <div style={{ ...columnControlStyle, gap: 8 }}>
                              <div
                                ref={bgPreviewRef}
                                style={{
                                  position: "relative",
                                  width: "100%",
                                  aspectRatio: "16 / 9",
                                  overflow: "hidden",
                                  borderRadius: 8,
                                  background: sanitizeBg(draftBgColor) || DEFAULT_PREVIEW,
                                  backgroundSize: draftBgColor ? undefined : "16px 16px"
                                }}>
                                <img
                                  ref={setBgPreviewTarget}
                                  src={draftBgImageUrl}
                                  draggable={false}
                                  style={{
                                    position: "absolute",
                                    top: "50%",
                                    left: "50%",
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "contain",
                                    cursor: "grab",
                                    userSelect: "none",
                                    transform: getBgTransform(draftBgOptions),
                                    filter: `invert(${draftBgOptions.invert}) grayscale(${draftBgOptions.grayscale}) brightness(${draftBgOptions.brightness})`
                                  }}
                                />
                                <Moveable
                                  target={bgPreviewTarget}
                                  draggable
                                  origin={false}
                                  hideDefaultLines
                                  preventDefault
                                  stopPropagation
                                  onDrag={(e) => dragDraftBg(e.delta[0], e.delta[1])}
                                />
                                <div
                                  style={{
                                    position: "absolute",
                                    inset: 0,
                                    zIndex: 2,
                                    borderRadius: 8,
                                    boxShadow: "inset 0 0 0 2px #66cdaa",
                                    pointerEvents: "none"
                                  }}
                                />
                              </div>
                              <div
                                style={{ ...rowStyle, justifyContent: "center", gap: 6 }}>
                                {bgPreviewActions.map((action) => (
                                  <button
                                    key={action.icon}
                                    type="button"
                                    className="decoai-control-button"
                                    disabled={action.disabled}
                                    onClick={action.onClick}
                                    style={{ ...controlButtonStyle, ...disabledControlStyle(!action.disabled) }}>
                                    <Icon icon={`lucide:${action.icon}`} height={20} aria-hidden="true" />
                                  </button>
                                ))}
                              </div>
                            </div>
                          </Card>
                        </>
                      )}
                      {(draftBgImageUrl || draftBgColor) && (
                        <>
                          <RangeCard
                            label={t("brightness")}
                            min={0}
                            max={5}
                            step={0.1}
                            value={draftBgOptions.brightness}
                            onChange={(v) => updateCustomBgOption("brightness", Number(v))}
                            onReset={() => updateCustomBgOption("brightness", 1)}
                          />
                          <CheckboxCard
                            label={t("invert")}
                            checked={draftBgOptions.invert === 1}
                            onChange={(c) => updateCustomBgOption("invert", c ? 1 : 0)}
                          />
                          <CheckboxCard
                            label={t("grayscale")}
                            checked={draftBgOptions.grayscale === 1}
                            onChange={(c) => updateCustomBgOption("grayscale", c ? 1 : 0)}
                          />
                        </>
                      )}
                    </>
                  )}
                  {customEditTab === "layout" && (
                    <>
                      {(draftBgImageUrl || draftBgColor) && (
                        <>
                          <Card>
                            <div style={rowStyle}>
                              <span style={fieldLabelStyle}>{t("colorMatch")}</span>
                              <button
                                type="button"
                                className="decoai-control-button"
                                onClick={onColorMatchClick}
                                style={controlButtonStyle}>
                                <Icon icon="lucide:sparkles" height={20} color="#66cdaa" aria-hidden="true" />
                              </button>
                            </div>
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
                        label={t("border")}
                        value={draftBorderColor}
                        onChange={setDraftBorderColor}
                        onReset={resetCustomBorder}
                        canReset={canResetBorder}
                      />
                      <RangeCard
                        label={t("opacity")}
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round(draftBgOptions.opacity * 100)}
                        onChange={(value) => updateCustomBgOption("opacity", Number(value) / 100)}
                        onReset={() => updateCustomBgOption("opacity", 0.8)}
                      />
                      <RangeCard
                        label={t("blur")}
                        min={0}
                        max={50}
                        step={1}
                        value={draftBgOptions.blur}
                        onChange={(v) => updateCustomBgOption("blur", Number(v))}
                        onReset={() => updateCustomBgOption("blur", 10)}
                      />
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="footer" style={{ ...columnControlStyle, padding: "10px 20px" }}>
            {panelMode === "theme" && themeTab === "custom" && view !== "custom" && (
              <div style={{ ...rowStyle, gap: 8 }}>
                <FooterButton onClick={onImportClick} style={footerButtonStyle} icon="download" label={t("import")} />
                <FooterButton
                  onClick={onExportClick}
                  disabled={theme !== "custom"}
                  style={{
                    ...footerButtonStyle,
                    ...disabledControlStyle(theme === "custom")
                  }}
                  icon="upload"
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
                  onClick={cancelEditingTheme}
                  style={footerButtonStyle}
                  icon="undo-2"
                  label={t("cancel")}
                />
                <FooterButton
                  onClick={onSaveClick}
                  style={{ ...footerButtonStyle, backgroundColor: "#1976d2" }}
                  icon="save"
                  label={t("save")}
                />
              </div>
            )}
            {!isPremiumUser && ((panelMode === "theme" && view !== "custom") || panelMode === "widget") && (
              <FooterButton
                className="pro-button"
                onClick={onProClick}
                style={{
                  ...proButtonStyle,
                  display: "flex",
                  justifyContent: "center"
                }}
                icon="assets/pro.gif"
                label={t("upgradePro")}
              />
            )}
          </div>
        </div>
        {isLoading && (
          <div style={LOADING_OVERLAY_STYLE}>
            <Icon icon="line-md:loading-twotone-loop" height={48} aria-hidden="true" />
          </div>
        )}
      </div>
    </>
  )
}

const themeCardStyle = {
  display: "block",
  width: "100%",
  height: 100,
  border: "none",
  borderRadius: 12,
  cursor: "pointer",
  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
} as const

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="decoai-control-button"
      onClick={onClick}
      style={{
        ...controlButtonStyle,
        height: "auto",
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
        className={`theme-card preset-theme-card decoai-marquee-title${active ? " is-active" : ""}${className ? ` ${className}` : ""}`}
        onPointerEnter={(e) => updateTitleOverflow(e.currentTarget)}
        onClick={onClick}
        style={{ ...themeCardStyle, backgroundColor: "transparent" }}>
        <div className="theme-card__bg preset-theme-card__bg" style={{ backgroundColor: color }} />
        <span className="preset-theme-card__emoji">{emoji}</span>
        <div className="theme-card__title">
          <span className="decoai-marquee-title__text" data-title={label}>
            {label}
          </span>
        </div>
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
        {icon.includes("assets") ? (
          <img src={chrome.runtime.getURL(icon)} draggable="false" style={{ height: 16 }} />
        ) : (
          <Icon icon={`lucide:${icon}`} height={16} aria-hidden="true" />
        )}
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
  canReset,
  allowGradient = false
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onReset: () => void
  canReset: boolean
  allowGradient?: boolean
}) {
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const pickerContainerRef = useRef<HTMLDivElement>(null)
  const pickerIdSuffix = useId().replace(/:/g, "")

  useEffect(() => {
    if (!isPickerOpen) return

    const closePicker = (e: MouseEvent) => {
      const pickerContainer = pickerContainerRef.current
      if (pickerContainer && !e.composedPath().includes(pickerContainer)) {
        setIsPickerOpen(false)
      }
    }

    document.addEventListener("mousedown", closePicker)
    return () => document.removeEventListener("mousedown", closePicker)
  }, [isPickerOpen])

  const pickerValue = value || "#000"
  const isGradientValue = isGradient(pickerValue)
  const { rgbaArr } = useColorPicker(pickerValue, onChange)
  const solidColor = `rgba(${rgbaArr.join(", ")})`
  const pickerConfig = {
    defaultColor: solidColor,
    defaultGradient: isGradientValue ? pickerValue : `linear-gradient(180deg, ${solidColor} 0%, ${solidColor} 100%)`
  }

  return (
    <Card>
      <div ref={pickerContainerRef}>
        <div style={rowStyle}>
          <span style={fieldLabelStyle}>{label}</span>
          <div style={iconLabelStyle}>
            <button
              type="button"
              className="decoai-control-button"
              onClick={() => setIsPickerOpen((open) => !open)}
              style={{ ...controlButtonStyle, width: 45, padding: 4 }}>
              <span
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: 4,
                  background: value ? pickerValue : `${DEFAULT_PREVIEW} 0 / 8px 8px`
                }}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              className="decoai-control-button"
              onClick={onReset}
              disabled={!canReset}
              style={{
                ...controlButtonStyle,
                ...disabledControlStyle(canReset)
              }}>
              <Icon icon="lucide:rotate-ccw" height={20} aria-hidden="true" />
            </button>
          </div>
        </div>
        {isPickerOpen && (
          <div
            style={{
              marginTop: 8,
              padding: 6,
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: 8,
              backgroundColor: "#202020",
              boxSizing: "border-box"
            }}>
            <ColorPicker
              idSuffix={pickerIdSuffix}
              value={pickerValue}
              onChange={onChange}
              locales={{
                CONTROLS: { SOLID: t("solid"), GRADIENT: t("gradient") }
              }}
              config={pickerConfig}
              width={170}
              height={120}
              hidePresets
              hideOpacity
              hideAdvancedSliders
              hideColorGuide
              hideInputType
              hideColorTypeBtns={!allowGradient}
              hideGradientControls={!allowGradient}
              hideGradientStop
            />
          </div>
        )}
      </div>
    </Card>
  )
}

function RangeControl({ label, min, max, step, value, disabled = false, onChange, onReset }: RangeControlProps) {
  const rangePosition = max === min ? 0 : Math.min(1, Math.max(0, (Number(value) - min) / (max - min)))
  const outputLeft = `calc(${rangePosition * 100}% + ${(0.5 - rangePosition) * 16}px)`

  return (
    <div style={{ ...columnControlStyle, gap: 4 }}>
      <div style={rowStyle}>
        <span style={fieldLabelStyle}>{label}</span>
        <div>
          {onReset && (
            <button
              type="button"
              className="decoai-control-button"
              onClick={onReset}
              disabled={disabled}
              style={{
                ...controlButtonStyle,
                ...disabledControlStyle(!disabled)
              }}>
              <Icon icon="lucide:rotate-ccw" height={20} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <div>
        <output
          style={{
            display: "block",
            width: "max-content",
            marginLeft: outputLeft,
            marginBottom: 4,
            color: "#fff",
            fontSize: 12,
            lineHeight: 1,
            textAlign: "center",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            transform: "translateX(-50%)"
          }}>
          {value}
        </output>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          style={{
            display: "block",
            width: "100%",
            accentColor: "#66cdaa",
            ...disabledControlStyle(!disabled)
          }}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
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

function CheckboxControl({ label, checked, icon, disabled = false, onChange }: CheckboxControlProps) {
  return (
    <div style={rowStyle}>
      <div style={{ ...rowStyle, gap: 8 }}>
        {icon && <Icon icon={`lucide:${icon}`} height={16} aria-hidden="true" />}
        <span style={fieldLabelStyle}>{label}</span>
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        style={{
          width: 20,
          height: 20,
          accentColor: "#66cdaa",
          ...disabledControlStyle(!disabled)
        }}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  )
}

type CheckboxControlProps = {
  label: string
  checked: boolean
  icon?: string
  disabled?: boolean
  onChange: (checked: boolean) => void
}
