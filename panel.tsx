import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  type User
} from "firebase/auth"
import { Vibrant } from "node-vibrant/browser"
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode
} from "react"
import { toast } from "react-toastify"

import { Storage } from "@plasmohq/storage"
import { useStorage } from "@plasmohq/storage/hook"

import { app } from "./firebase"
import {
  clearAnimatedBgUrl,
  createCustomTheme,
  createThemeExportBlob,
  DEFAULT_CUSTOM_BG_OPTIONS,
  detectCurrentSite,
  FAB_OPEN_EVENT,
  getPositionXPercent,
  getPositionYPercent,
  hasAnimatedBackground,
  isAnimatedBgUrl,
  isAnimatedImage,
  MAX_FILE_BYTES,
  parseImportedThemes,
  renderStyledImageToCanvas,
  sanitizeCustomBgUrl,
  THEME_LOADING_EVENT,
  type CustomBgOptions,
  type CustomTheme,
  type SiteType
} from "./theme-utils"

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

type ViewType = "themes" | "custom"
type ThemeTabType = "preset" | "custom"
type CustomEditTabType = "general" | "background" | "layout"

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
  link.download = `${themeData.name}_kasutamu-theme.json`
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

export function FabPanelApp() {
  const panelRootRef = useRef<HTMLDivElement>(null)
  const [theme, setTheme] = useStorage("selected-theme", "default")
  const [view, setView] = useState<ViewType>("themes")
  const [themeTab, setThemeTab] = useState<ThemeTabType>("preset")
  const [customEditTab, setCustomEditTab] =
    useState<CustomEditTabType>("general")
  const bgUploadRef = useRef<HTMLInputElement>(null)
  const importFileRef = useRef<HTMLInputElement>(null)
  const [customBg, setCustomBg] = useState("")
  const [customThemes, setCustomThemes] = useStorage<CustomTheme[]>(
    { key: "custom-themes", instance: localStorageInstance },
    []
  )
  const [selectedCustomThemeId, setSelectedCustomThemeId] = useStorage(
    { key: "selected-custom-theme-id", instance: localStorageInstance },
    ""
  )
  const [editingCustomThemeId, setEditingCustomThemeId] = useState("")
  const [isPremiumUser, setIsPremiumUser] = useState(false)
  const [isPremiumLoaded, setIsPremiumLoaded] = useState(false)
  const [localCustomBgOptions, setLocalCustomBgOptions] =
    useState<CustomBgOptions>(DEFAULT_CUSTOM_BG_OPTIONS)
  const [localText, setLocalText] = useState("")
  const [localAccent, setLocalAccent] = useState("")
  const [localCustomThemeName, setLocalCustomThemeName] = useState("")
  const [localCustomBgColor, setLocalCustomBgColor] = useState("")
  const [isThemeLoading, setIsThemeLoading] = useState(false)
  const [draggingCustomThemeId, setDraggingCustomThemeId] = useState("")
  const suppressCustomThemeClickIdRef = useRef("")
  const canResetText = Boolean((localText || "").trim())
  const canResetAccent = Boolean((localAccent || "").trim())
  const selectedCustomTheme = customThemes.find(
    (item) => item.id === selectedCustomThemeId
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
    const auth = getAuth(app)
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      void syncPremiumStatus(user)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const onThemeLoading = (event: Event) => {
      const customEvent = event as CustomEvent<{ loading?: boolean }>
      setIsThemeLoading(customEvent.detail?.loading === true)
    }
    window.addEventListener(THEME_LOADING_EVENT, onThemeLoading)
    return () => window.removeEventListener(THEME_LOADING_EVENT, onThemeLoading)
  }, [])

  useEffect(() => {
    const onFabOpen = () => {
      void syncPremiumStatus()
      setEditingCustomThemeId("")
      setThemeTab(theme === "custom" ? "custom" : "preset")
      setView("themes")
    }
    window.addEventListener(FAB_OPEN_EVENT, onFabOpen)
    return () => window.removeEventListener(FAB_OPEN_EVENT, onFabOpen)
  }, [theme])

  const editingTheme = customThemes.find(
    (item) => item.id === editingCustomThemeId
  )

  useEffect(() => {
    if (!editingTheme) return
    setLocalText(editingTheme.text || "")
    setLocalAccent(editingTheme.accent || "")
    setCustomBg(editingTheme.bgUrl || "")
    setLocalCustomBgColor(editingTheme.bgColor || "")
    setLocalCustomBgOptions(editingTheme.bgOptions || DEFAULT_CUSTOM_BG_OPTIONS)
    setLocalCustomThemeName(editingTheme.name || "")
    setCustomEditTab("general")
  }, [editingTheme?.id])

  const updateCustomBgOption = (
    key: keyof CustomBgOptions,
    value: string | number | boolean
  ) => setLocalCustomBgOptions((prev) => ({ ...prev, [key]: value }))

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
    if (customBg) {
      if (isAnimatedBgUrl(customBg)) setCustomBg("")
    }
  }

  useEffect(() => {
    if (!isPremiumLoaded || isPremiumUser || !customThemes.length) return
    normalizeCustomThemes()
  }, [
    customBg,
    customThemes,
    editingCustomThemeId,
    isPremiumLoaded,
    isPremiumUser,
    selectedCustomTheme,
    selectedCustomThemeId
  ])

  const upsertEditingTheme = () => {
    if (!editingCustomThemeId) return
    setCustomThemes((prev) => {
      return prev.map((item) =>
        item.id === editingCustomThemeId
          ? {
            ...item,
            name: localCustomThemeName,
            text: localText,
            accent: localAccent,
            bgUrl: customBg,
            bgColor: localCustomBgColor,
            bgOptions: localCustomBgOptions
          }
          : item
      )
    })
  }

  useDebouncedEffect(upsertEditingTheme, 1, [
    editingCustomThemeId,
    localCustomThemeName,
    localText,
    localAccent,
    customBg,
    localCustomBgColor,
    localCustomBgOptions
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

  const getGoogleAccessToken = () =>
    new Promise<string>((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: "GET_GOOGLE_ACCESS_TOKEN" },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          if (!response?.success || !response?.token) {
            reject(
              new Error(response?.error || "Failed to get Google access token")
            )
            return
          }
          resolve(response.token)
        }
      )
    })

  const getSignedInUser = async () => {
    const auth = getAuth(app)
    if (auth.currentUser) return auth.currentUser

    const accessToken = await getGoogleAccessToken()
    const credential = GoogleAuthProvider.credential(null, accessToken)
    const result = await signInWithCredential(auth, credential)
    return result.user
  }

  const syncPremiumStatus = async (userArg?: User | null) => {
    try {
      const auth = getAuth(app)
      const user = userArg ?? auth.currentUser
      if (!user) {
        setIsPremiumUser(false)
        return
      }
      const tokenResult = await user.getIdTokenResult(true)
      setIsPremiumUser(tokenResult.claims.premium === true)
    } catch {
      setIsPremiumUser(false)
    } finally {
      setIsPremiumLoaded(true)
    }
  }

  const refreshPremiumStatus = async () => {
    const user = await getSignedInUser()
    const tokenResult = await user.getIdTokenResult(true)
    const premium = tokenResult.claims.premium === true

    setIsPremiumUser(premium)
    setIsPremiumLoaded(true)

    return premium
  }

  const onProClick = async () => {
    try {
      const user = await getSignedInUser()
      const idToken = await user.getIdToken()
      await openCheckout(idToken)
    } catch (e) {
      toast.error(t("error_checkoutFail"))
    }
  }

  const onExportClick = () => {
    if (theme !== "custom" || !selectedCustomTheme) return

    downloadCustomTheme(selectedCustomTheme)
    toast.success(t("success_themeExport"))
  }

  const onImportClick = async () => {
    if (customThemes.length > 0 && !(await refreshPremiumStatus())) {
      toast.error(t("pro_themePreset"))
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
    const premium = await refreshPremiumStatus()
    if (!premium && hasAnimatedBackground(imported)) {
      toast.error(t("pro_animatedImage"))
      clearFileInput(importFileRef.current)
      return
    }

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
    if (animated && !(await refreshPremiumStatus())) {
      toast.error(t("pro_animatedImage"))
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
      setCustomBg(result)
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
    upsertEditingTheme()
    setEditingCustomThemeId("")
    setView("themes")
    toast.success(t("success_themeSave"))
  }
  const resetCustomText = () => setLocalText("")
  const resetCustomAccent = () => setLocalAccent("")
  const resetCustomBgImage = () => {
    setCustomBg("")
    setLocalCustomBgOptions(DEFAULT_CUSTOM_BG_OPTIONS)
  }
  const resetCustomBgColor = () => {
    setLocalCustomBgColor("")
  }
  const onAutoFitColorsClick = async () => {
    if (!(await refreshPremiumStatus())) {
      toast.error(t("pro_autoFitColors"))
      return
    }

    if (!customBg) return

    setIsThemeLoading(true)
    try {
      await wait(2000)
      const canvas = await renderStyledImageToCanvas(customBg, localCustomBgOptions)
      const palette = await Vibrant.from(canvas.toDataURL()).getPalette()
      const isDarkMode = isCurrentPageDarkMode()
      const nextAccent = palette.Vibrant?.hex || ""
      const nextText = isDarkMode
        ? palette.LightVibrant?.hex || ""
        : palette.DarkVibrant?.hex || ""

      if (nextAccent) setLocalAccent(nextAccent)
      if (nextText) setLocalText(nextText)

      toast.success(t("success_autoFitColors"))
    } finally {
      setIsThemeLoading(false)
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
      setView("custom")
      return
    }
    setEditingCustomThemeId("")
    setSelectedCustomThemeId(customThemeItem.id)
    setTheme("custom")
    setView("themes")
  }

  const onCustomCardDragStart = (
    event: DragEvent<HTMLButtonElement>,
    customThemeItem: CustomTheme
  ) => {
    setDraggingCustomThemeId(customThemeItem.id)
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", customThemeItem.id)
  }

  const onCustomCardDragOver = (
    event: DragEvent<HTMLDivElement>,
    customThemeItem: CustomTheme
  ) => {
    if (!draggingCustomThemeId || draggingCustomThemeId === customThemeItem.id)
      return
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }

  const onCustomCardDrop = (
    event: DragEvent<HTMLDivElement>,
    customThemeItem: CustomTheme
  ) => {
    event.preventDefault()
    event.stopPropagation()

    const sourceId =
      event.dataTransfer.getData("text/plain") || draggingCustomThemeId
    const targetId = customThemeItem.id
    if (!sourceId || sourceId === targetId) return

    suppressCustomThemeClickIdRef.current = sourceId
    setCustomThemes((prev) => {
      const sourceIndex = prev.findIndex((item) => item.id === sourceId)
      const targetIndex = prev.findIndex((item) => item.id === targetId)
      if (sourceIndex < 0 || targetIndex < 0) return prev

      const nextThemes = [...prev]
      const [movedTheme] = nextThemes.splice(sourceIndex, 1)
      nextThemes.splice(targetIndex, 0, movedTheme)
      return nextThemes
    })
  }

  const onCustomCardDragEnd = () => {
    setDraggingCustomThemeId("")
  }

  const onCustomPlusClick = async () => {
    if (customThemes.length > 0 && !(await refreshPremiumStatus())) {
      toast.error(t("pro_themePreset"))
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
    if (editingCustomThemeId === customThemeId) setEditingCustomThemeId("")
    setView("themes")
    toast.success(t("success_themeDelete"))
  }

  const onDeleteCustomTheme = () => {
    deleteCustomTheme(editingCustomThemeId)
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

    if (customThemes.length > 0 && !(await refreshPremiumStatus())) {
      toast.error(t("pro_themePreset"))
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
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 2;
          padding: 4px;
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
          left: 0;
          right: 0;
          bottom: 0;
          padding: 4px;
          background-color: #0000008D;
          color: #fff;
          text-align: center;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .custom-theme-card__action {
          position: absolute;
          top: 2px;
          z-index: 3;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          border: none;
          border-radius: 999px;
          background-color: #0000004D;
          cursor: pointer;
          opacity: 0;
          transform: scale(0.9);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .custom-theme-card__duplicate {
          right: 26px;
        }
        .custom-theme-card__delete {
          right: 2px;
        }
        .custom-theme-card:hover .custom-theme-card__action {
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
        .custom-theme-card-wrap {
          position: relative;
        }
        .custom-theme-card-wrap:hover .custom-theme-card__action {
          opacity: 1;
          transform: scale(1);
        }
        .pro-button { animation: pro-gradient 20s linear infinite; }
        .footer button:hover { filter: brightness(1.1); }
        @keyframes pro-gradient {
          from { background-position: 500% 50%; }
          to { background-position: 0% 50%; }
        }
      `}</style>
      <div style={wrapperStyle}>
        <div ref={panelRootRef} style={rootStyle}>
          <div style={contentStyle}>
            {view === "themes" && (
              <>
                <h3 style={{ margin: 0, textAlign: "center" }}>
                  {t("themeSettings")}
                </h3>
                <div style={themeSectionStyle}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 8,
                      borderBottom: "2px solid #66cdaa"
                    }}>
                    <button
                      type="button"
                      onClick={() => setThemeTab("preset")}
                      style={{
                        ...controlButtonStyle,
                        padding: "8px",
                        borderRadius: "12px 12px 0 0",
                        backgroundColor:
                          themeTab === "preset" ? "#66cdaa" : "#4b5563"
                      }}>
                      {t("preset")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setThemeTab("custom")}
                      style={{
                        ...controlButtonStyle,
                        padding: "8px",
                        borderRadius: "12px 12px 0 0",
                        backgroundColor:
                          themeTab === "custom" ? "#66cdaa" : "#4b5563"
                      }}>
                      {t("custom")}
                    </button>
                  </div>
                  <div className="content-scroll" style={themeGridScrollStyle}>
                    {themeTab === "preset" && (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, 1fr)",
                          gap: 8
                        }}>
                        {THEME_LIST.map((item) => (
                          <button
                            className="preset-theme-card"
                            key={item.key}
                            onClick={() => onThemeClick(item.key)}
                            style={{
                              ...btnStyle(item.color, theme === item.key),
                              backgroundColor: "transparent"
                            }}>
                            <div
                              className="preset-theme-card__bg"
                              style={{
                                background: `linear-gradient(135deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.04) 48%, rgba(0,0,0,0.12) 100%), ${item.color}`
                              }}
                            />
                            <span
                              className="preset-theme-card__emoji"
                              aria-hidden="true">
                              {item.emoji}
                            </span>
                            <span className="preset-theme-card__label">
                              {t(item.key)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {themeTab === "custom" && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 8
                        }}>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(2, 1fr)",
                            gap: 8
                          }}>
                          {customThemes.map((item) => (
                            <div
                              key={item.id}
                              className="custom-theme-card-wrap"
                              onDragOver={(e) => onCustomCardDragOver(e, item)}
                              onDrop={(e) => onCustomCardDrop(e, item)}>
                              <button
                                type="button"
                                draggable
                                className={`custom-theme-card${draggingCustomThemeId === item.id ? " is-dragging" : ""}`}
                                onClick={() => onCustomCardClick(item)}
                                onDragStart={(e) =>
                                  onCustomCardDragStart(e, item)
                                }
                                onDragEnd={onCustomCardDragEnd}
                                style={{
                                  boxShadow:
                                    theme === "custom" &&
                                      selectedCustomThemeId === item.id
                                      ? "inset 2px 2px 5px rgba(0, 0, 0, 0.2), 0 0 0 3px #66cdaa"
                                      : "none"
                                }}>
                                <div
                                  className="custom-theme-card__bg"
                                  style={{
                                    backgroundImage: item.bgUrl
                                      ? `url(${item.bgUrl})`
                                      : "none",
                                    backgroundColor: !item.bgUrl
                                      ? item.bgColor
                                      : "transparent"
                                  }}
                                />
                                <div className="custom-theme-card__title">
                                  {item.name}
                                </div>
                              </button>
                              <button
                                type="button"
                                className="custom-theme-card__action custom-theme-card__duplicate"
                                aria-label="Duplicate"
                                draggable={false}
                                onClick={(e) =>
                                  onCustomCardDuplicateClick(e, item)
                                }>
                                <img
                                  src={chrome.runtime.getURL("assets/add.svg")}
                                  alt="duplicate icon"
                                  draggable="false"
                                />
                              </button>
                              <button
                                type="button"
                                className="custom-theme-card__action custom-theme-card__delete"
                                aria-label={t("delete")}
                                draggable={false}
                                onClick={(e) =>
                                  onCustomCardDeleteClick(e, item)
                                }>
                                <img
                                  src={chrome.runtime.getURL(
                                    "assets/cancel.svg"
                                  )}
                                  alt="cancel icon"
                                  draggable="false"
                                />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            className="preset-theme-card add-theme-card"
                            onClick={onCustomPlusClick}
                            style={{
                              ...btnStyle("#374151", false),
                              backgroundColor: "transparent",
                              cursor: "pointer"
                            }}>
                            <div
                              className="preset-theme-card__bg"
                              style={{
                                background:
                                  "linear-gradient(135deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.04) 48%, rgba(0,0,0,0.12) 100%), #374151"
                              }}
                            />
                            <span
                              className="preset-theme-card__emoji"
                              aria-hidden="true">
                              ✏️
                            </span>
                            <span className="preset-theme-card__label">
                              {t("addTheme")}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
            {view === "custom" && (
              <>
                <h3 style={{ margin: 0, textAlign: "center" }}>
                  {t("editTheme")}
                </h3>
                <div
                  style={{
                    marginTop: 20,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 8,
                    borderBottom: "2px solid #66cdaa"
                  }}>
                  <button
                    type="button"
                    onClick={() => setCustomEditTab("general")}
                    style={{
                      ...controlButtonStyle,
                      padding: "8px",
                      borderRadius: "12px 12px 0 0",
                      backgroundColor:
                        customEditTab === "general" ? "#66cdaa" : "#4b5563"
                    }}>
                    {t("general")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomEditTab("background")}
                    style={{
                      ...controlButtonStyle,
                      padding: "8px",
                      borderRadius: "12px 12px 0 0",
                      backgroundColor:
                        customEditTab === "background" ? "#66cdaa" : "#4b5563"
                    }}>
                    {t("background")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomEditTab("layout")}
                    style={{
                      ...controlButtonStyle,
                      padding: "8px",
                      borderRadius: "12px 12px 0 0",
                      backgroundColor:
                        customEditTab === "layout" ? "#66cdaa" : "#4b5563"
                    }}>
                    {t("layout")}
                  </button>
                </div>
                <div className="content-scroll" style={editSectionScrollStyle}>
                  {customEditTab === "general" && (
                    <>
                      <div style={cardStyle}>
                        <label style={rowStyle}>
                          <span style={{ padding: "4px 0px" }}>
                            {t("name")}
                          </span>
                          <input
                            type="text"
                            value={localCustomThemeName}
                            maxLength={10}
                            onChange={(e) =>
                              setLocalCustomThemeName(e.target.value)
                            }
                            style={{
                              width: 125,
                              border: "none",
                              borderRadius: 8,
                              padding: "8px 4px",
                              textAlign: "center",
                              backgroundColor: "#4b5563",
                              color: "#fff"
                            }}
                          />
                        </label>
                      </div>
                      <div style={cardStyle}>
                        <CheckboxControl
                          label={t("hideHeader")}
                          checked={localCustomBgOptions.hideHeader}
                          onChange={(c) =>
                            updateCustomBgOption("hideHeader", c)
                          }
                        />
                      </div>
                      <div style={cardStyle}>
                        <CheckboxControl
                          label={t("hideFooter")}
                          checked={localCustomBgOptions.hideFooter}
                          onChange={(c) =>
                            updateCustomBgOption("hideFooter", c)
                          }
                        />
                      </div>
                    </>
                  )}
                  {customEditTab === "background" && (
                    <>
                      <ColorSettingCard
                        label={t("backgroundColor")}
                        value={localCustomBgColor}
                        onChange={setLocalCustomBgColor}
                        onReset={resetCustomBgColor}
                        canReset={Boolean(localCustomBgColor)}
                      />
                      <div style={cardStyle}>
                        <label style={rowStyle}>
                          <span style={{ padding: "4px 0px" }}>
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
                              onClick={resetCustomBgImage}
                              disabled={!customBg}
                              style={{
                                ...controlButtonStyle,
                                ...disabledControlStyle(Boolean(customBg))
                              }}>
                              {t("reset")}
                            </button>
                          </div>
                        </label>
                      </div>
                      {customBg && (
                        <>
                          <div style={cardStyle}>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 8
                              }}>
                              <RangeControl
                                label={t("imagePositionX")}
                                min={0}
                                max={100}
                                step={1}
                                value={getPositionXPercent(
                                  localCustomBgOptions.position
                                )}
                                onChange={(v) =>
                                  updateCustomBgOption(
                                    "position",
                                    `${Number(v)}% ${getPositionYPercent(
                                      localCustomBgOptions.position
                                    )}%`
                                  )
                                }
                                onReset={() =>
                                  updateCustomBgOption(
                                    "position",
                                    `50% ${getPositionYPercent(
                                      localCustomBgOptions.position
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
                                  localCustomBgOptions.position
                                )}
                                onChange={(v) =>
                                  updateCustomBgOption(
                                    "position",
                                    `${getPositionXPercent(
                                      localCustomBgOptions.position
                                    )}% ${Number(v)}%`
                                  )
                                }
                                onReset={() =>
                                  updateCustomBgOption(
                                    "position",
                                    `${getPositionXPercent(
                                      localCustomBgOptions.position
                                    )}% 50%`
                                  )
                                }
                              />
                            </div>
                          </div>
                          <div style={cardStyle}>
                            <CheckboxControl
                              label={t("scaleX")}
                              checked={localCustomBgOptions.scaleX === -1}
                              onChange={(c) =>
                                updateCustomBgOption("scaleX", c ? -1 : 1)
                              }
                            />
                          </div>
                          <div style={cardStyle}>
                            <RangeControl
                              label={t("brightness")}
                              min={0}
                              max={5}
                              step={0.1}
                              value={localCustomBgOptions.brightness}
                              onChange={(v) =>
                                updateCustomBgOption("brightness", Number(v))
                              }
                              onReset={() =>
                                updateCustomBgOption("brightness", 1)
                              }
                            />
                          </div>
                          <div style={cardStyle}>
                            <RangeControl
                              label={t("blur")}
                              min={0}
                              max={50}
                              step={1}
                              value={localCustomBgOptions.blur}
                              onChange={(v) =>
                                updateCustomBgOption("blur", Number(v))
                              }
                              onReset={() => updateCustomBgOption("blur", 0)}
                            />
                          </div>
                          <div style={cardStyle}>
                            <CheckboxControl
                              label={t("invert")}
                              checked={localCustomBgOptions.invert === 1}
                              onChange={(c) =>
                                updateCustomBgOption("invert", c ? 1 : 0)
                              }
                            />
                          </div>
                          <div style={cardStyle}>
                            <CheckboxControl
                              label={t("grayscale")}
                              checked={localCustomBgOptions.grayscale === 1}
                              onChange={(c) =>
                                updateCustomBgOption("grayscale", c ? 1 : 0)
                              }
                            />
                          </div>
                        </>
                      )}
                    </>
                  )}
                  {customEditTab === "layout" && (
                    <>
                      {customBg && (
                        <>
                          <div style={cardStyle}>
                            <label style={rowStyle}>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 4,
                                  alignItems: "center"
                                }}>
                                <img
                                  src={chrome.runtime.getURL("assets/icon.png")}
                                  alt="app icon"
                                  draggable="false"
                                  style={{ height: 12 }}
                                />
                                <span style={{ padding: "4px 0px" }}>
                                  {t("autoFitColors")}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={onAutoFitColorsClick}
                                style={controlButtonStyle}>
                                {t("apply")}
                              </button>
                            </label>
                          </div>
                        </>
                      )}
                      <ColorSettingCard
                        label={t("text")}
                        value={localText}
                        onChange={setLocalText}
                        onReset={resetCustomText}
                        canReset={canResetText}
                      />
                      <ColorSettingCard
                        label={t("accent")}
                        value={localAccent}
                        onChange={setLocalAccent}
                        onReset={resetCustomAccent}
                        canReset={canResetAccent}
                      />
                      <div style={cardStyle}>
                        <RangeControl
                          label={t("opacity")}
                          min={0}
                          max={1}
                          step={0.1}
                          value={localCustomBgOptions.opacity}
                          onChange={(v) =>
                            updateCustomBgOption("opacity", Number(v))
                          }
                          onReset={() => updateCustomBgOption("opacity", 0.8)}
                        />
                      </div>
                      <div style={cardStyle}>
                        <RangeControl
                          label={t("glassBlur")}
                          min={0}
                          max={50}
                          step={1}
                          value={localCustomBgOptions.glassBlur}
                          onChange={(v) =>
                            updateCustomBgOption("glassBlur", Number(v))
                          }
                          onReset={() => updateCustomBgOption("glassBlur", 10)}
                        />
                      </div>
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
            {themeTab === "custom" && view !== "custom" && (
              <div style={{ ...rowStyle, gap: 8 }}>
                <FooterButton
                  onClick={onExportClick}
                  disabled={theme !== "custom"}
                  style={{
                    ...footerButtonStyle,
                    ...disabledControlStyle(theme === "custom")
                  }}
                  icon="assets/upload.svg"
                  iconAlt="export icon"
                  label={t("exportTheme")}
                />
                <FooterButton
                  onClick={onImportClick}
                  style={footerButtonStyle}
                  icon="assets/download.svg"
                  iconAlt="import icon"
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
            {view === "custom" && (
              <div style={{ ...rowStyle, gap: 8 }}>
                <FooterButton
                  onClick={onDeleteCustomTheme}
                  style={{
                    ...footerButtonStyle,
                    backgroundColor: "#d32f2f"
                  }}
                  icon="assets/delete.svg"
                  iconAlt="delete icon"
                  label={t("delete")}
                />
                <FooterButton
                  onClick={onSaveClick}
                  style={{
                    ...footerButtonStyle,
                    backgroundColor: "#1976d2"
                  }}
                  icon="assets/save.svg"
                  iconAlt="save icon"
                  label={t("save")}
                />
              </div>
            )}
            {view !== "custom" &&
              isPremiumLoaded &&
              !isPremiumUser && (
                <FooterButton
                  className="pro-button"
                  onClick={onProClick}
                  style={{
                    ...proButtonStyle,
                    display: "flex",
                    justifyContent: "center"
                  }}
                  icon="assets/gem_stone.gif"
                  iconAlt="pro icon"
                  iconGap={8}
                  label={t("upgradePro")}
                />
              )}
          </div>
        </div>
        {isThemeLoading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              color: "#fff",
              fontSize: 16,
              zIndex: 10,
              pointerEvents: "auto"
            }}>
            {t("loading")}...
          </div>
        )}
      </div>
    </>
  )
}

const btnStyle = (color: string, active: boolean) => ({
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

function Card({ children }: { children: ReactNode }) {
  return <div style={cardStyle}>{children}</div>
}

function FooterButton({
  icon,
  iconAlt,
  iconGap,
  label,
  ...buttonProps
}: {
  icon: string
  iconAlt: string
  iconGap?: number
  label: string
  className?: string
  disabled?: boolean
  onClick: () => void
  style?: CSSProperties
}) {
  return (
    <button type="button" {...buttonProps}>
      <div style={{ ...iconLabelStyle, gap: iconGap ?? iconLabelStyle.gap }}>
        <img
          src={chrome.runtime.getURL(icon)}
          alt={iconAlt}
          draggable="false"
          style={{ height: 16 }}></img>
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
        <span style={{ padding: "4px 0px" }}>{label}</span>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
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
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  disabled?: boolean
  onChange: (value: string) => void
  onReset?: () => void
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
        <span style={{ padding: "4px 0px" }}>{label}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ padding: "4px 0px" }}>{value}</span>
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

function CheckboxControl({
  label,
  checked,
  disabled = false,
  onChange
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label style={rowStyle}>
      <span style={{ padding: "4px 0px" }}>{label}</span>
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

function useDebouncedEffect(
  effect: () => void,
  delay: number,
  deps: unknown[]
) {
  useEffect(() => {
    const timer = setTimeout(effect, delay)
    return () => clearTimeout(timer)
  }, deps)
}
