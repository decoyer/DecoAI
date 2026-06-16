import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier
} from "@dnd-kit/core"
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  useSortable
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Icon } from "@iconify/react"
import { Vibrant } from "node-vibrant/browser"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react"
import { toast } from "react-toastify"

import { Storage } from "@plasmohq/storage"
import { useStorage } from "@plasmohq/storage/hook"

import {
  AUTH_SESSION_STORAGE_KEY,
  getValidAuthSessionSnapshot,
  signInAndSaveAuthSession,
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
  detectCurrentSite,
  FAB_OPEN_EVENT,
  getPositionXPercent,
  getPositionYPercent,
  hasAnimatedBackground,
  isAnimatedBgUrl,
  isAnimatedImage,
  MAX_FILE_BYTES,
  parseImportedThemes,
  PREMIUM_THEME_BACKUP_STORAGE_KEY,
  renderImageToCanvas,
  sanitizeCustomBgUrl,
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

const t = (key: string) => chrome.i18n.getMessage(key)
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
type PremiumThemeBackup = {
  customThemes: CustomTheme[]
  selectedCustomThemeId: string
}

const WIDGET_LIST: Array<{ key: WidgetKey; labelKey: string; icon: string }> = [
  { key: "note", labelKey: "noteWidget", icon: "sticky-note" },
  { key: "todo", labelKey: "todoWidget", icon: "list-checks" },
  { key: "timer", labelKey: "timerWidget", icon: "timer" }
]

const isSameWidgetLayout = (
  left: WidgetLayoutOptions,
  right: WidgetLayoutOptions
) =>
  left.textColor === right.textColor &&
  left.backgroundColor === right.backgroundColor &&
  left.accentColor === right.accentColor &&
  left.opacity === right.opacity &&
  left.glassBlur === right.glassBlur

const createWidgetInstance = (
  key: WidgetKey,
  currentItems: WidgetInstance[]
): WidgetInstance => {
  const widgetMeta = WIDGET_LIST.find((widget) => widget.key === key)

  return {
    id: currentItems.some((item) => item.id === key)
      ? `${key}-${crypto.randomUUID()}`
      : key,
    type: key,
    name: t(widgetMeta?.labelKey || "noteWidget")
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
  padding: "10px 5px",
  overflow: "auto"
} as const
const sectionStyle = {
  padding: "10px 5px",
  display: "flex",
  flexDirection: "column",
  gap: 8
} as const
const editSectionScrollStyle = {
  ...sectionStyle,
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  overflowX: "hidden"
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
const colorInputStyle = {
  width: 50,
  height: 30,
  backgroundColor: "#4b5563",
  border: "none",
  borderRadius: 8,
  padding: 4,
  cursor: "pointer",
  overflow: "hidden"
} as const
const controlButtonStyle = {
  paddingTop: 4,
  paddingBottom: 4,
  backgroundColor: "#4b5563",
  color: "#fff",
  border: "none",
  borderRadius: 12,
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
  gap: 4,
  alignItems: "center"
} as const
const centeredHeadingStyle = { margin: 0, textAlign: "center" } as const
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
const fieldLabelStyle = { padding: "4px 0px" } as const
const inlineControlStyle = {
  display: "flex",
  gap: 4,
  alignItems: "center"
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
  color: "#fff"
} as const
const footerButtonStyle = {
  ...controlButtonStyle,
  display: "flex",
  justifyContent: "center",
  flex: 1,
  border: "none",
  padding: 8
} as const

const downloadCustomTheme = (themeData: CustomTheme) => {
  const blob = createThemeExportBlob(themeData)
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
    cursor: enabled ? "pointer" : "not-allowed",
    pointerEvents: enabled ? "auto" : "none"
  }) as const

const clearFileInput = (input: HTMLInputElement | null) => {
  if (input) input.value = ""
}

const isCurrentPageDarkMode = () => {
  const currentSite = detectCurrentSite()
  return currentSite
    ? document.querySelector(SITE_DARK_SELECTORS[currentSite]) !== null
    : false
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })

const restrictToParentElement: Modifier = ({
  transform,
  containerNodeRect,
  draggingNodeRect
}) => {
  if (!containerNodeRect || !draggingNodeRect) return transform

  const minX = containerNodeRect.left - draggingNodeRect.left
  const maxX = containerNodeRect.right - draggingNodeRect.right
  const minY = containerNodeRect.top - draggingNodeRect.top
  const maxY = containerNodeRect.bottom - draggingNodeRect.bottom

  return {
    ...transform,
    x: Math.min(Math.max(transform.x, minX), maxX),
    y: Math.min(Math.max(transform.y, minY), maxY)
  }
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
  onCustomCardDuplicateClick: (
    event: React.MouseEvent<HTMLButtonElement>,
    customThemeItem: CustomTheme
  ) => void
  onCustomCardDeleteClick: (
    event: React.MouseEvent<HTMLButtonElement>,
    customThemeItem: CustomTheme
  ) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id })

  return (
    <div
      ref={setNodeRef}
      className="custom-theme-card-wrap"
      style={{
        position: "relative",
        transform: transform ? CSS.Transform.toString(transform) : undefined,
        transition,
        zIndex: isDragging ? 2 : "auto"
      }}>
      <button
        type="button"
        className={`custom-theme-card${draggingCustomThemeId === item.id ? " is-dragging" : ""}`}
        onClick={() => onCustomCardClick(item)}
        {...attributes}
        {...listeners}
        style={{
          touchAction: "none",
          boxShadow:
            theme === "custom" && selectedCustomThemeId === item.id
              ? "inset 2px 2px 5px rgba(0, 0, 0, 0.2), 0 0 0 3px #66cdaa"
              : "none"
        }}>
        <div
          className="custom-theme-card__bg"
          style={{
            backgroundImage: item.bgUrl ? `url(${item.bgUrl})` : "none",
            backgroundColor: !item.bgUrl ? item.bgColor : "transparent"
          }}
        />
        <div className="custom-theme-card__title">{item.name}</div>
      </button>
      {!isDragging && (
        <div className="custom-theme-card__actions">
          <button
            type="button"
            className="custom-theme-card__action custom-theme-card__duplicate"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => onCustomCardDuplicateClick(event, item)}>
            <Icon
              icon="lucide:copy-plus"
              height={16}
              color="#fff"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            className="custom-theme-card__action custom-theme-card__delete"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => onCustomCardDeleteClick(event, item)}>
            <Icon
              icon="lucide:trash-2"
              height={16}
              color="#fff"
              aria-hidden="true"
            />
          </button>
        </div>
      )}
    </div>
  )
}

export function FabPanelApp() {
  const panelRootRef = useRef<HTMLDivElement>(null)
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
  const [customThemes, setCustomThemes] = useStorage<CustomTheme[]>(
    { key: CUSTOM_THEMES_STORAGE_KEY, instance: localStorageInstance },
    []
  )
  const [selectedCustomThemeId, setSelectedCustomThemeId] = useStorage(
    {
      key: SELECTED_CUSTOM_THEME_ID_STORAGE_KEY,
      instance: localStorageInstance
    },
    ""
  )
  const [premiumThemeBackup, setPremiumThemeBackup] =
    useStorage<PremiumThemeBackup | null>(
      {
        key: PREMIUM_THEME_BACKUP_STORAGE_KEY,
        instance: localStorageInstance
      },
      null
    )
  const [editingCustomThemeId, setEditingCustomThemeId] = useState("")
  const [premiumStatus, setPremiumStatus] = useState<PremiumStatus>("unknown")
  const [draftBackgroundOptions, setDraftBackgroundOptions] =
    useState<CustomBgOptions>(DEFAULT_CUSTOM_BG_OPTIONS)
  const [draftTextColor, setDraftTextColor] = useState("")
  const [draftAccentColor, setDraftAccentColor] = useState("")
  const [draftCustomThemeName, setDraftCustomThemeName] = useState("")
  const [draftBackgroundColor, setDraftBackgroundColor] = useState("")
  const [draftWidgetLayout, setDraftWidgetLayout] =
    useState<WidgetLayoutOptions>(DEFAULT_WIDGET_LAYOUT)
  const [isLoading, setIsLoading] = useState(false)
  const [draggingCustomThemeId, setDraggingCustomThemeId] = useState("")
  const suppressCustomThemeClickIdRef = useRef("")
  const previousViewRef = useRef<PanelView>(view)
  const canResetText = Boolean((draftTextColor || "").trim())
  const canResetAccent = Boolean((draftAccentColor || "").trim())
  const isPremiumChecked = premiumStatus !== "unknown"
  const isPremiumUser = premiumStatus === "premium"
  const isFreeUser = premiumStatus === "free"
  const selectedCustomTheme = customThemes.find(
    (item) => item.id === selectedCustomThemeId
  )
  const customThemeIds = useMemo(
    () => customThemes.map((item) => item.id),
    [customThemes]
  )
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    })
  )
  const hasWidgetType = (key: WidgetKey) =>
    (widgetItems || DEFAULT_WIDGET_INSTANCES).some(
      (widget) => widget.type === key
    )

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
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [draftWidgetLayout, panelMode, setWidgetLayout, widgetLayout])

  useEffect(() => {
    void syncGoogleSession()

    const intervalId = window.setInterval(() => {
      void syncGoogleSession()
    }, 30_000)

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
        setView("themes")
        setDraftWidgetLayout({ ...DEFAULT_WIDGET_LAYOUT, ...widgetLayout })
      }
      setThemeTab(theme === "custom" ? "custom" : "preset")
    }
    window.addEventListener(FAB_OPEN_EVENT, onFabOpen)
    return () => window.removeEventListener(FAB_OPEN_EVENT, onFabOpen)
  }, [theme, widgetLayout])

  const editingTheme = customThemes.find(
    (item) => item.id === editingCustomThemeId
  )

  const getEditingThemeDraft = () => {
    if (!editingTheme) return null

    return {
      ...editingTheme,
      name: draftCustomThemeName,
      text: draftTextColor,
      accent: draftAccentColor,
      bgUrl: draftBackgroundImageUrl,
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
    setDraftBackgroundImageUrl(editingTheme.bgUrl || "")
    setDraftBackgroundColor(editingTheme.bgColor || "")
    setDraftBackgroundOptions(
      editingTheme.bgOptions || DEFAULT_CUSTOM_BG_OPTIONS
    )
    setDraftCustomThemeName(editingTheme.name || "")
    setCustomEditTab("general")
  }, [editingTheme?.id])

  const updateCustomBgOption = (
    key: keyof CustomBgOptions,
    value: string | number | boolean
  ) => setDraftBackgroundOptions((prev) => ({ ...prev, [key]: value }))

  const hasPremiumLockedThemes = (themes: CustomTheme[]) =>
    themes.length > 1 || themes.some((item) => isAnimatedBgUrl(item.bgUrl))

  const backupPremiumThemes = () => {
    const nextSelectedThemeId =
      selectedCustomThemeId || customThemes[0]?.id || ""
    if (
      premiumThemeBackup ||
      !nextSelectedThemeId ||
      !hasPremiumLockedThemes(customThemes)
    ) {
      return
    }

    void setPremiumThemeBackup({
      customThemes,
      selectedCustomThemeId: nextSelectedThemeId
    })
  }

  const restorePremiumThemes = () => {
    if (!premiumThemeBackup?.customThemes.length) return

    setCustomThemes(premiumThemeBackup.customThemes)
    if (premiumThemeBackup.selectedCustomThemeId) {
      setSelectedCustomThemeId(premiumThemeBackup.selectedCustomThemeId)
      if (theme === "custom") setTheme("custom")
    }
    void setPremiumThemeBackup(null)
  }

  const normalizeCustomThemes = () => {
    if (!customThemes.length) return

    const retainedSource = selectedCustomTheme || customThemes[0]
    const retainedTheme = clearAnimatedBgUrl(retainedSource)
    const nextThemes = [retainedTheme]
    const changed =
      customThemes.length !== 1 || retainedTheme !== retainedSource

    if (changed) setCustomThemes(nextThemes)
    if (selectedCustomThemeId !== retainedTheme.id)
      setSelectedCustomThemeId(retainedTheme.id)
    if (
      editingCustomThemeId &&
      !nextThemes.some((item) => item.id === editingCustomThemeId)
    ) {
      setEditingCustomThemeId("")
      setView("themes")
    }
    if (draftBackgroundImageUrl) {
      if (isAnimatedBgUrl(draftBackgroundImageUrl)) {
        setDraftBackgroundImageUrl("")
      }
    }
  }

  useEffect(() => {
    if (!customThemes.length) return
    if (!isPremiumChecked) return

    if (isPremiumUser) {
      restorePremiumThemes()
      return
    }

    if (isFreeUser && hasPremiumLockedThemes(customThemes)) {
      backupPremiumThemes()
      normalizeCustomThemes()
      return
    }

    if (isFreeUser && premiumThemeBackup) {
      void setPremiumThemeBackup(null)
    }
  }, [
    draftBackgroundImageUrl,
    customThemes,
    editingCustomThemeId,
    isFreeUser,
    isPremiumChecked,
    isPremiumUser,
    premiumThemeBackup,
    selectedCustomThemeId
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
    draftBackgroundImageUrl,
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

  const syncGoogleSession = async () => {
    const authSession = await getValidAuthSessionSnapshot()

    if (authSession) {
      setPremiumStatus(authSession.premiumStatus)
      return authSession
    }

    setPremiumStatus("free")
    return null
  }

  const refreshPremiumStatus = async () => {
    const authSession = await getValidAuthSessionSnapshot()

    if (authSession) {
      setPremiumStatus(authSession.premiumStatus)
      return authSession.premiumStatus === "premium"
    }

    setPremiumStatus("free")
    return false
  }

  const requirePremiumAccess = async (
    messageKey: "pro_themeLimit" | "pro_animatedImage" | "pro_colorMatch"
  ) => {
    setIsLoading(true)
    try {
      const premium = await refreshPremiumStatus()
      if (!premium) toast.error(t(messageKey))
      return premium
    } finally {
      setIsLoading(false)
    }
  }

  const onProClick = async () => {
    setIsLoading(true)
    try {
      const authSession = await getValidAuthSessionSnapshot()

      if (authSession) {
        setPremiumStatus(authSession.premiumStatus)
        if (authSession.premiumStatus === "premium") return
        await openCheckout(authSession.idToken)
        return
      }

      const nextAuthSession = await signInAndSaveAuthSession(true)
      setPremiumStatus(nextAuthSession.premiumStatus)
      if (nextAuthSession.premiumStatus === "premium") return
      await openCheckout(nextAuthSession.idToken)
    } catch (e) {
      if (e?.message === "The user did not approve access.") return
      toast.error(t("error_checkoutFail"))
    } finally {
      setIsLoading(false)
    }
  }

  const onExportClick = () => {
    if (theme !== "custom" || !selectedCustomTheme) return

    downloadCustomTheme(selectedCustomTheme)
    toast.success(t("success_themeExport"))
  }

  const onImportClick = async () => {
    if (
      customThemes.length > 0 &&
      !(await requirePremiumAccess("pro_themeLimit"))
    ) {
      return
    }
    importFileRef.current?.click()
  }

  const onImportFile = async (file?: File) => {
    if (!file) {
      toast.error(t("error_fileNotSelected"))
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error(t("error_fileExceed"))
      clearFileInput(importFileRef.current)
      return
    }

    const text = await file.text()
    const imported = parseImportedThemes(
      text,
      (index) => `${t("custom")} ${index + 1}`
    )

    if (!imported.length) {
      toast.error(t("error_fileInvalid"))
      clearFileInput(importFileRef.current)
      return
    }
    const hasAnimatedImportedTheme = hasAnimatedBackground(imported)
    if (
      hasAnimatedImportedTheme &&
      !(await requirePremiumAccess("pro_animatedImage"))
    ) {
      clearFileInput(importFileRef.current)
      return
    }

    const premium = await refreshPremiumStatus()

    if (premium) {
      setCustomThemes((prev) => [...prev, ...imported])
    } else {
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
      toast.error(t("error_fileNotSelected"))
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error(t("error_fileExceed"))
      clearFileInput(importFileRef.current)
      return
    }
    const animated = await isAnimatedImage(file)
    if (animated && !(await requirePremiumAccess("pro_animatedImage"))) {
      clearFileInput(bgUploadRef.current)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = sanitizeCustomBgUrl(
        typeof reader.result === "string" ? reader.result : ""
      )
      if (!result) {
        toast.error(t("error_fileInvalid"))
        clearFileInput(bgUploadRef.current)
        return
      }
      setDraftBackgroundImageUrl(result)
      clearFileInput(bgUploadRef.current)
    }
    reader.readAsDataURL(file)
  }

  const onThemeClick = (key: string) => {
    setTheme("")
    setTheme(key)
    setEditingCustomThemeId("")
    setView("themes")
  }
  const onSaveClick = () => {
    const nextTheme = getEditingThemeDraft()
    if (nextTheme) {
      setCustomThemes((prev) =>
        prev.map((item) => (item.id === nextTheme.id ? nextTheme : item))
      )
    }
    setView("themes")
    toast.success(t("success_themeSave"))
  }
  const resetCustomText = () => setDraftTextColor("")
  const resetCustomAccent = () => setDraftAccentColor("")
  const resetDraftBackgroundImage = () => {
    setDraftBackgroundImageUrl("")
    setDraftBackgroundOptions(DEFAULT_CUSTOM_BG_OPTIONS)
  }
  const resetDraftBackgroundColor = () => {
    setDraftBackgroundColor("")
  }
  const onColorMatchClick = async () => {
    if (!(await requirePremiumAccess("pro_colorMatch"))) {
      return
    }

    if (!draftBackgroundImageUrl) return

    setIsLoading(true)
    try {
      await wait(2000)
      const canvas = await renderImageToCanvas(
        draftBackgroundImageUrl,
        draftBackgroundOptions
      )
      const palette = await Vibrant.from(canvas.toDataURL()).getPalette()
      const isDarkMode = isCurrentPageDarkMode()
      const nextAccent = palette.Vibrant?.hex || ""
      const nextText = isDarkMode
        ? palette.LightVibrant?.hex || ""
        : palette.DarkVibrant?.hex || ""

      if (nextAccent) setDraftAccentColor(nextAccent)
      if (nextText) setDraftTextColor(nextText)

      toast.success(t("success_colorMatch"))
    } finally {
      setIsLoading(false)
    }
  }

  const onCustomCardClick = (customThemeItem: CustomTheme) => {
    if (suppressCustomThemeClickIdRef.current === customThemeItem.id) {
      suppressCustomThemeClickIdRef.current = ""
      return
    }
    const isSelected =
      theme === "custom" && selectedCustomThemeId === customThemeItem.id
    if (isSelected) {
      setEditingCustomThemeId(customThemeItem.id)
      setCustomEditTab("general")
      setView("custom")
      return
    }
    setEditingCustomThemeId("")
    setSelectedCustomThemeId(customThemeItem.id)
    setTheme("custom")
    setView("themes")
  }

  const onCustomCardDragStart = (event: DragStartEvent) => {
    setDraggingCustomThemeId(String(event.active.id))
  }

  const onCustomCardDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : ""

    if (activeId) {
      suppressCustomThemeClickIdRef.current = activeId
      window.setTimeout(() => {
        if (suppressCustomThemeClickIdRef.current === activeId) {
          suppressCustomThemeClickIdRef.current = ""
        }
      }, 0)
    }
    if (activeId && overId && activeId !== overId) {
      setCustomThemes((prev) => {
        const oldIndex = prev.findIndex((item) => item.id === activeId)
        const newIndex = prev.findIndex((item) => item.id === overId)
        if (oldIndex < 0 || newIndex < 0) return prev
        return arrayMove(prev, oldIndex, newIndex)
      })
    }

    setDraggingCustomThemeId("")
  }

  const onCustomCardDragCancel = () => {
    setDraggingCustomThemeId("")
  }

  const onCustomPlusClick = async () => {
    if (
      customThemes.length > 0 &&
      !(await requirePremiumAccess("pro_themeLimit"))
    ) {
      return
    }
    const created = createCustomTheme(
      `${t("custom")} ${customThemes.length + 1}`
    )
    setCustomThemes((prev) => [...prev, created])
  }

  const deleteCustomTheme = (customThemeId: string) => {
    if (!customThemeId) return
    const deletingSelected =
      selectedCustomThemeId === customThemeId && theme === "custom"
    const nextThemes = customThemes.filter((item) => item.id !== customThemeId)
    setCustomThemes(nextThemes)
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

  const onCustomCardDeleteClick = (
    event: React.MouseEvent<HTMLButtonElement>,
    customThemeItem: CustomTheme
  ) => {
    event.preventDefault()
    event.stopPropagation()
    deleteCustomTheme(customThemeItem.id)
  }

  const onCustomCardDuplicateClick = async (
    event: React.MouseEvent<HTMLButtonElement>,
    customThemeItem: CustomTheme
  ) => {
    event.preventDefault()
    event.stopPropagation()

    if (
      customThemes.length > 0 &&
      !(await requirePremiumAccess("pro_themeLimit"))
    ) {
      return
    }

    const copiedTheme = {
      ...customThemeItem,
      id: crypto.randomUUID(),
      name: String(customThemeItem.name || t("custom")).slice(0, 10)
    }
    const sourceIndex = customThemes.findIndex(
      (item) => item.id === customThemeItem.id
    )

    setCustomThemes((prev) => {
      const nextThemes = [...prev]
      nextThemes.splice(sourceIndex + 1, 0, copiedTheme)
      return nextThemes
    })

    toast.success(t("success_themeDuplicate"))
  }

  const updateWidgetEnabled = (key: WidgetKey, checked: boolean) => {
    setWidgetEnabled({
      ...DEFAULT_WIDGET_ENABLED,
      ...widgetEnabled,
      [key]: checked
    })
    if (!checked) return

    setWidgetItems((prev) => {
      const nextItems = [...(prev || DEFAULT_WIDGET_INSTANCES)]
      if (nextItems.some((widget) => widget.type === key)) return nextItems
      return [...nextItems, createWidgetInstance(key, nextItems)]
    })
  }

  const updateWidgetLayout = (
    key: keyof WidgetLayoutOptions,
    value: string | number
  ) => {
    setDraftWidgetLayout((prev) => ({
      ...prev,
      [key]: value
    }))
  }

  const resetWidgetLayout = (key: keyof WidgetLayoutOptions) => {
    setDraftWidgetLayout((prev) => ({
      ...prev,
      [key]: DEFAULT_WIDGET_LAYOUT[key]
    }))
  }

  const resetEditingThemeDraft = () => {
    setDraftBackgroundImageUrl("")
    setDraftBackgroundColor("")
    setDraftTextColor("")
    setDraftAccentColor("")
    setDraftBackgroundOptions(DEFAULT_CUSTOM_BG_OPTIONS)
  }

  const resetWidgetLayoutDraft = () => {
    setDraftWidgetLayout(DEFAULT_WIDGET_LAYOUT)
  }

  return (
    <>
      <style>{`
        * { margin: 0; box-sizing: border-box; user-select: none; -webkit-user-select: none; }
        .content-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        .content-scroll::-webkit-scrollbar { display: none; }
        input.color-picker::-webkit-color-swatch-wrapper { padding: 0; }
        input.color-picker::-webkit-color-swatch { border: none; border-radius: 6px; }
        .preset-theme-card {
          position: relative;
          overflow: hidden;
          isolation: isolate;
        }
        .preset-theme-card__bg {
          position: absolute;
          inset: 0;
          transform: scale(1);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: 0;
          background-position: center center;
          background-size: cover;
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
        .preset-theme-card__emoji {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -75%) scale(1);
          z-index: 1;
          font-size: 32px;
          line-height: 1;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .preset-theme-card:hover .preset-theme-card__bg { transform: scale(1.1); }
        .preset-theme-card:hover .preset-theme-card__emoji { transform: translate(-50%, -75%) scale(1.1); }
        .preset-theme-card:hover .preset-theme-card__label { background-color: #0000004D; }
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
          transform: scale(1);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .custom-theme-card__title {
          position: absolute;
          display: flex;
          justify-content: center;
          align-items: center;
          left: 0;
          right: 0;
          bottom: 0;
          height: 24px;
          background-color: #0000008D;
          color: #fff;
          text-align: center;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .custom-theme-card__actions {
          position: absolute;
          top: 1px;
          right: 1px;
          z-index: 3;
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
        .custom-theme-card:hover .custom-theme-card__bg { transform: scale(1.1); }
        .custom-theme-card:hover .custom-theme-card__title { background-color: #0000004D; }
        .pro-button { animation: pro-gradient 10s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
        .footer button:hover { filter: brightness(1.1); }
        @keyframes pro-gradient {
          from { background-position: 500% 50%; }
          to { background-position: 0% 50%; }
        }
      `}</style>
      <div style={wrapperStyle}>
        <div ref={panelRootRef} style={rootStyle}>
          <div style={contentStyle}>
            {panelMode === "widget" && (
              <>
                <h3 style={centeredHeadingStyle}>{t("widgetSettings")}</h3>
                <div
                  style={{
                    ...tabGridStyle,
                    marginTop: 20,
                    gridTemplateColumns: "1fr 1fr"
                  }}>
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
                          checked={
                            (widgetEnabled?.[item.key] ??
                              DEFAULT_WIDGET_ENABLED[item.key]) &&
                            hasWidgetType(item.key)
                          }
                          onChange={(checked) =>
                            updateWidgetEnabled(item.key, checked)
                          }
                        />
                      ))}
                    </>
                  )}
                  {widgetTab === "layout" && (
                    <>
                      <ColorSettingCard
                        label={t("backgroundColor")}
                        value={draftWidgetLayout.backgroundColor}
                        onChange={(value) =>
                          updateWidgetLayout("backgroundColor", value)
                        }
                        onReset={() => resetWidgetLayout("backgroundColor")}
                        canReset={
                          draftWidgetLayout.backgroundColor !==
                          DEFAULT_WIDGET_LAYOUT.backgroundColor
                        }
                      />
                      <ColorSettingCard
                        label={t("text")}
                        value={draftWidgetLayout.textColor}
                        onChange={(value) =>
                          updateWidgetLayout("textColor", value)
                        }
                        onReset={() => resetWidgetLayout("textColor")}
                        canReset={
                          draftWidgetLayout.textColor !==
                          DEFAULT_WIDGET_LAYOUT.textColor
                        }
                      />
                      <ColorSettingCard
                        label={t("accent")}
                        value={draftWidgetLayout.accentColor}
                        onChange={(value) =>
                          updateWidgetLayout("accentColor", value)
                        }
                        onReset={() => resetWidgetLayout("accentColor")}
                        canReset={
                          draftWidgetLayout.accentColor !==
                          DEFAULT_WIDGET_LAYOUT.accentColor
                        }
                      />
                      <RangeCard
                        label={t("opacity")}
                        min={0}
                        max={1}
                        step={0.1}
                        value={draftWidgetLayout.opacity}
                        onChange={(value) =>
                          updateWidgetLayout("opacity", Number(value))
                        }
                        onReset={() => resetWidgetLayout("opacity")}
                      />
                      <RangeCard
                        label={t("glassBlur")}
                        min={0}
                        max={50}
                        step={1}
                        value={draftWidgetLayout.glassBlur}
                        onChange={(value) =>
                          updateWidgetLayout("glassBlur", Number(value))
                        }
                        onReset={() => resetWidgetLayout("glassBlur")}
                      />
                    </>
                  )}
                </div>
              </>
            )}
            {panelMode === "theme" && view === "themes" && (
              <>
                <h3 style={centeredHeadingStyle}>{t("themeSettings")}</h3>
                <div style={themeSectionStyle}>
                  <div
                    style={{
                      ...tabGridStyle,
                      gridTemplateColumns: "1fr 1fr"
                    }}>
                    {(["preset", "custom"] as const).map((tab) => (
                      <TabButton
                        key={tab}
                        active={themeTab === tab}
                        label={t(tab)}
                        onClick={() => setThemeTab(tab)}
                      />
                    ))}
                  </div>
                  <div className="content-scroll" style={themeGridScrollStyle}>
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
                      <div style={twoColumnGridStyle}>
                        <DndContext
                          sensors={sensors}
                          modifiers={[restrictToParentElement]}
                          collisionDetection={closestCenter}
                          onDragStart={onCustomCardDragStart}
                          onDragEnd={onCustomCardDragEnd}
                          onDragCancel={onCustomCardDragCancel}>
                          <SortableContext
                            items={customThemeIds}
                            strategy={rectSortingStrategy}>
                            {customThemes.map((item) => (
                              <CustomThemeSortableCard
                                key={item.id}
                                item={item}
                                theme={theme}
                                selectedCustomThemeId={selectedCustomThemeId}
                                draggingCustomThemeId={draggingCustomThemeId}
                                onCustomCardClick={onCustomCardClick}
                                onCustomCardDuplicateClick={
                                  onCustomCardDuplicateClick
                                }
                                onCustomCardDeleteClick={
                                  onCustomCardDeleteClick
                                }
                              />
                            ))}
                          </SortableContext>
                          <ThemeCard
                            className="add-theme-card"
                            color="#374151"
                            emoji="✏️"
                            label={t("addTheme")}
                            onClick={onCustomPlusClick}
                          />
                        </DndContext>
                      </div>
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
                            onChange={(e) =>
                              setDraftCustomThemeName(
                                e.target.value.slice(0, 10)
                              )
                            }
                            onKeyDown={(e) => e.stopPropagation()}
                            onKeyUp={(e) => e.stopPropagation()}
                            style={{
                              ...textInputStyle,
                              userSelect: "text",
                              WebkitUserSelect: "text"
                            }}
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
                              onChange={(e) =>
                                onUploadCustomBg(e.target.files?.[0])
                              }
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
                              style={{
                                ...controlButtonStyle,
                                ...disabledControlStyle(
                                  Boolean(draftBackgroundImageUrl)
                                )
                              }}>
                              {t("reset")}
                            </button>
                          </div>
                        </label>
                      </Card>
                      {draftBackgroundImageUrl && (
                        <>
                          <Card>
                            <div style={columnControlStyle}>
                              <RangeControl
                                label={t("imagePositionX")}
                                min={0}
                                max={100}
                                step={1}
                                value={getPositionXPercent(
                                  draftBackgroundOptions.position
                                )}
                                onChange={(v) =>
                                  updateCustomBgOption(
                                    "position",
                                    `${Number(v)}% ${getPositionYPercent(
                                      draftBackgroundOptions.position
                                    )}%`
                                  )
                                }
                                onReset={() =>
                                  updateCustomBgOption(
                                    "position",
                                    `50% ${getPositionYPercent(
                                      draftBackgroundOptions.position
                                    )}%`
                                  )
                                }
                              />
                              <RangeControl
                                label={t("imagePositionY")}
                                min={0}
                                max={100}
                                step={1}
                                value={getPositionYPercent(
                                  draftBackgroundOptions.position
                                )}
                                onChange={(v) =>
                                  updateCustomBgOption(
                                    "position",
                                    `${getPositionXPercent(
                                      draftBackgroundOptions.position
                                    )}% ${Number(v)}%`
                                  )
                                }
                                onReset={() =>
                                  updateCustomBgOption(
                                    "position",
                                    `${getPositionXPercent(
                                      draftBackgroundOptions.position
                                    )}% 50%`
                                  )
                                }
                              />
                            </div>
                          </Card>
                          <CheckboxCard
                            label={t("scaleX")}
                            checked={draftBackgroundOptions.scaleX === -1}
                            onChange={(c) =>
                              updateCustomBgOption("scaleX", c ? -1 : 1)
                            }
                          />
                          <RangeCard
                            label={t("brightness")}
                            min={0}
                            max={5}
                            step={0.1}
                            value={draftBackgroundOptions.brightness}
                            onChange={(v) =>
                              updateCustomBgOption("brightness", Number(v))
                            }
                            onReset={() =>
                              updateCustomBgOption("brightness", 1)
                            }
                          />
                          <RangeCard
                            label={t("blur")}
                            min={0}
                            max={50}
                            step={1}
                            value={draftBackgroundOptions.blur}
                            onChange={(v) =>
                              updateCustomBgOption("blur", Number(v))
                            }
                            onReset={() => updateCustomBgOption("blur", 0)}
                          />
                          <CheckboxCard
                            label={t("invert")}
                            checked={draftBackgroundOptions.invert === 1}
                            onChange={(c) =>
                              updateCustomBgOption("invert", c ? 1 : 0)
                            }
                          />
                          <CheckboxCard
                            label={t("grayscale")}
                            checked={draftBackgroundOptions.grayscale === 1}
                            onChange={(c) =>
                              updateCustomBgOption("grayscale", c ? 1 : 0)
                            }
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
                              <div style={inlineControlStyle}>
                                <Icon
                                  icon="mdi:wand"
                                  height={24}
                                  color="#66cdaa"
                                  aria-hidden="true"
                                />
                                <span style={fieldLabelStyle}>
                                  {t("colorMatch")}
                                </span>
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
                        onChange={(v) =>
                          updateCustomBgOption("opacity", Number(v))
                        }
                        onReset={() => updateCustomBgOption("opacity", 0.8)}
                      />
                      <RangeCard
                        label={t("glassBlur")}
                        min={0}
                        max={50}
                        step={1}
                        value={draftBackgroundOptions.glassBlur}
                        onChange={(v) =>
                          updateCustomBgOption("glassBlur", Number(v))
                        }
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
            {panelMode === "theme" &&
              themeTab === "custom" &&
              view !== "custom" && (
                <div style={{ ...rowStyle, gap: 8 }}>
                  <FooterButton
                    onClick={onExportClick}
                    disabled={theme !== "custom"}
                    style={{
                      ...footerButtonStyle,
                      ...disabledControlStyle(theme === "custom")
                    }}
                    icon="upload"
                    label={t("exportTheme")}
                  />
                  <FooterButton
                    onClick={onImportClick}
                    style={footerButtonStyle}
                    icon="download"
                    label={t("importTheme")}
                  />
                  <input
                    ref={importFileRef}
                    type="file"
                    accept="application/json"
                    onChange={(e) => onImportFile(e.target.files?.[0])}
                    style={{ display: "none" }}
                  />
                </div>
              )}
            {panelMode === "theme" && view === "custom" && (
              <div style={{ ...rowStyle, gap: 8 }}>
                <FooterButton
                  onClick={resetEditingThemeDraft}
                  style={{
                    ...footerButtonStyle
                  }}
                  icon="rotate-ccw"
                  label={t("reset")}
                />
                <FooterButton
                  onClick={onSaveClick}
                  style={{
                    ...footerButtonStyle,
                    backgroundColor: "#1976d2"
                  }}
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
                  style={{
                    ...proButtonStyle,
                    display: "flex",
                    justifyContent: "center"
                  }}
                  icon="assets/gem_stone.gif"
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
            <Icon
              icon="line-md:loading-twotone-loop"
              height={48}
              aria-hidden="true"
            />
          </div>
        )}
      </div>
    </>
  )
}

const themeCardBg = (color: string) =>
  `linear-gradient(135deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.04) 48%, rgba(0,0,0,0.12) 100%), ${color}`

const themeCardStyle = (color: string, active: boolean) => ({
  height: 100,
  backgroundColor: color,
  border: "none",
  borderRadius: "12px",
  cursor: "pointer",
  boxShadow: active
    ? "inset 2px 2px 5px rgba(0, 0, 0, 0.2), 0 0 0 3px #66cdaa"
    : "none",
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
    <button
      type="button"
      className={`preset-theme-card${className ? ` ${className}` : ""}`}
      onClick={onClick}
      style={{
        ...themeCardStyle(color, active),
        backgroundColor: "transparent",
        cursor: "pointer"
      }}>
      <div
        className="preset-theme-card__bg"
        style={{ background: themeCardBg(color) }}
      />
      <span className="preset-theme-card__emoji" aria-hidden="true">
        {emoji}
      </span>
      <span className="preset-theme-card__label">{label}</span>
    </button>
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
          <img
            src={chrome.runtime.getURL(icon)}
            draggable="false"
            style={{ height: 16 }}
          />
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
        <div style={inlineControlStyle}>
          <input
            type="color"
            value={value || "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="color-picker"
            style={colorInputStyle}
          />
          <button
            type="button"
            onClick={onReset}
            disabled={!canReset}
            style={{
              ...controlButtonStyle,
              ...disabledControlStyle(canReset)
            }}>
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
        <div style={{ ...inlineControlStyle, gap: 8 }}>
          <span style={fieldLabelStyle}>{value}</span>
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              disabled={disabled}
              style={{
                ...controlButtonStyle,
                ...disabledControlStyle(!disabled)
              }}>
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
  disabled = false,
  onChange
}: CheckboxControlProps) {
  return (
    <label style={rowStyle}>
      <span style={fieldLabelStyle}>{label}</span>
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
    </label>
  )
}

type CheckboxControlProps = {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}
