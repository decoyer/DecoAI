import { Icon } from "@iconify/react"
import { useEffect, useRef, useState } from "react"
import { toast, ToastContainer } from "react-toastify"

import { useStorage } from "@plasmohq/storage/hook"

import {
  AUTH_REFRESH_MS,
  AUTH_SESSION_STORAGE_KEY,
  getAuthSessionSnapshot,
  getValidAuthSessionSnapshot,
  signInAndSaveAuthSession,
  signOutAuthSession,
  type AuthSessionSnapshot,
  type PremiumStatus
} from "./auth"
import {
  createExportBlob,
  CUSTOM_THEMES_STORAGE_KEY,
  DEFAULT_MODEL_ENABLED,
  deleteImageData,
  exportCustomThemeImages,
  getBgImageIds,
  getImageDataUrl,
  importCustomThemeImages,
  isJsonFile,
  LOADING_OVERLAY_STYLE,
  MODEL_ENABLED_STORAGE_KEY,
  parseDataImportFile,
  PHOTO_WIDGET_STATE_STORAGE_KEY,
  sanitizeCustomBgUrl,
  saveImageDataUrl,
  SELECTED_CUSTOM_THEME_ID_STORAGE_KEY,
  SIDE_PANEL_STATUS_MESSAGE,
  THEME_HIDDEN_STORAGE_KEY,
  WIDGET_HIDDEN_STORAGE_KEY,
  type CustomTheme,
  type ModelEnabledMap,
  type SidePanelStatusResponse
} from "./utils"

const t = (key: string, value?: string) => chrome.i18n.getMessage(key, value)
type ModelKey = keyof ModelEnabledMap

const MODEL_LIST = [
  { key: "chatgpt", icon: "bi:openai", label: "ChatGPT" },
  { key: "gemini", icon: "vscode-icons:file-type-gemini", label: "Gemini" },
  { key: "claude", icon: "logos:claude-icon", label: "Claude" },
  { key: "grok", icon: "selfhst:grok-light", label: "Grok" }
] as const

type PopupTab = "settings" | "account"

type SidePanelApi = typeof chrome.sidePanel & { close: (options: { windowId: number }) => Promise<void> }
const sidePanelApi = chrome.sidePanel as SidePanelApi

const getCurrentWindowId = async () => (await chrome.windows.getCurrent()).id
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const parseStoredValue = <T,>(value: unknown): T | undefined => {
  if (typeof value !== "string") return value as T | undefined
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

const clearFileInput = (input: HTMLInputElement | null) => {
  if (input) input.value = ""
}

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

const getExportableCustomThemes = async (themesValue: unknown) => {
  const themes = parseStoredValue<unknown[]>(themesValue)
  if (!Array.isArray(themes)) return []

  return Promise.all(themes.filter(isRecord).map((theme) => exportCustomThemeImages(theme as CustomTheme)))
}

const getPortableImageData = async (localData: Record<string, unknown>) => {
  const images: Record<string, string> = {}

  for (const [key, value] of Object.entries(localData)) {
    if (!key.startsWith(`${PHOTO_WIDGET_STATE_STORAGE_KEY}:`)) continue

    const photoState = parseStoredValue<Record<string, unknown>>(value)
    if (!isRecord(photoState)) continue

    const imageIds = getBgImageIds({
      imageId: typeof photoState.imageId === "string" ? photoState.imageId : "",
      originalImageId: typeof photoState.originalImageId === "string" ? photoState.originalImageId : ""
    })
    for (const imageId of imageIds) {
      if (!imageId || images[imageId]) continue
      const dataUrl = await getImageDataUrl(imageId).catch(() => "")
      if (dataUrl) images[imageId] = dataUrl
    }
  }

  return images
}

const saveImportedImages = async (images: Record<string, string>, importedImageIds: string[]) => {
  const imageIdMap: Record<string, string> = {}

  for (const [sourceId, sourceDataUrl] of Object.entries(images)) {
    const dataUrl = sanitizeCustomBgUrl(sourceDataUrl)
    if (!sourceId || !dataUrl) continue

    const imageId = await saveImageDataUrl(dataUrl)
    importedImageIds.push(imageId)
    imageIdMap[sourceId] = imageId
  }

  return imageIdMap
}

const replacePhotoImageIds = (localData: Record<string, unknown>, imageIdMap: Record<string, string>) => {
  const nextLocalData = { ...localData }

  for (const [key, value] of Object.entries(nextLocalData)) {
    if (!key.startsWith(`${PHOTO_WIDGET_STATE_STORAGE_KEY}:`)) continue

    const photoState = parseStoredValue<Record<string, unknown>>(value)
    if (!isRecord(photoState)) continue

    const mappedState = { ...photoState }
    let changed = false
    for (const imageKey of ["imageId", "originalImageId"] as const) {
      const value = photoState[imageKey]
      const imageId = typeof value === "string" ? value : ""
      if (imageIdMap[imageId]) {
        mappedState[imageKey] = imageIdMap[imageId]
        changed = true
      }
    }
    if (changed) nextLocalData[key] = JSON.stringify(mappedState)
  }

  return nextLocalData
}

function IndexPopup() {
  const [themeHidden, setThemeHidden] = useStorage<boolean>(THEME_HIDDEN_STORAGE_KEY, false)
  const [widgetHidden, setWidgetHidden] = useStorage<boolean>(WIDGET_HIDDEN_STORAGE_KEY, false)
  const [modelEnabled, setModelEnabled] = useStorage<ModelEnabledMap>(MODEL_ENABLED_STORAGE_KEY, DEFAULT_MODEL_ENABLED)
  const [isLoading, setIsLoading] = useState(false)
  const [authSession, setAuthSession] = useState<AuthSessionSnapshot | null>(null)
  const [premiumStatus, setPremiumStatus] = useState<PremiumStatus>("unknown")
  const [activeTab, setActiveTab] = useState<PopupTab>("settings")
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false)
  const restoreFileRef = useRef<HTMLInputElement>(null)
  const version = chrome.runtime.getManifest().version
  const updateModelEnabled = (key: ModelKey, checked: boolean) => setModelEnabled({ ...modelEnabled, [key]: checked })

  useEffect(() => {
    void loadSavedSession()
    void syncSidePanelState()

    const intervalId = window.setInterval(() => {
      void refreshSavedSession()
    }, AUTH_REFRESH_MS)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    const onAuthSessionChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== "local") return
      if (!changes[AUTH_SESSION_STORAGE_KEY]) return

      void loadSavedSession()
    }

    chrome.storage.onChanged.addListener(onAuthSessionChanged)
    return () => chrome.storage.onChanged.removeListener(onAuthSessionChanged)
  }, [])

  const loadSavedSession = async () => {
    const snapshot = await getAuthSessionSnapshot()
    setAuthSession(snapshot)
    setPremiumStatus(snapshot?.premiumStatus || "unknown")
  }

  const refreshSavedSession = async () => {
    let snapshot: AuthSessionSnapshot | null = null
    try {
      snapshot = await getValidAuthSessionSnapshot({
        refreshPremiumStatus: true,
        verifyGoogleGrant: true
      })
    } catch {
      snapshot = null
    }
    setAuthSession(snapshot)
    setPremiumStatus(snapshot?.premiumStatus || "unknown")
  }

  const onSignInClick = async () => {
    setIsLoading(true)
    try {
      const nextAuthSession = await signInAndSaveAuthSession(true)
      setAuthSession(nextAuthSession)
      setPremiumStatus(nextAuthSession.premiumStatus)
    } finally {
      setIsLoading(false)
    }
  }

  const onSignOutClick = async () => {
    setIsLoading(true)
    try {
      await signOutAuthSession()
      setAuthSession(null)
      setPremiumStatus("unknown")
    } finally {
      setIsLoading(false)
    }
  }

  const onSubscriptionClick = () => window.open("https://polar.sh/kstm/portal")

  const syncSidePanelState = async () => {
    const windowId = await getCurrentWindowId()
    if (windowId == null) return

    try {
      const response = (await chrome.runtime.sendMessage({
        type: SIDE_PANEL_STATUS_MESSAGE,
        windowId
      })) as SidePanelStatusResponse | undefined
      setIsSidePanelOpen(Boolean(response?.open))
    } catch {
      setIsSidePanelOpen(false)
    }
  }

  const onSidePanelToggle = async (open: boolean) => {
    const windowId = await getCurrentWindowId()
    if (windowId == null) return

    if (open) {
      await chrome.sidePanel.open({ windowId })
      setIsSidePanelOpen(true)
      return
    }

    await sidePanelApi.close({ windowId })
    setIsSidePanelOpen(false)
  }

  const onBackupClick = async () => {
    setIsLoading(true)

    try {
      const [syncData, localData] = await Promise.all([chrome.storage.sync.get(), chrome.storage.local.get()])
      const localBackup = { ...localData }
      delete localBackup[AUTH_SESSION_STORAGE_KEY]

      const customThemes = await getExportableCustomThemes(localBackup[CUSTOM_THEMES_STORAGE_KEY])
      const images = await getPortableImageData(localBackup)
      const blob = createExportBlob({
        type: "data",
        sync: syncData,
        local: localBackup,
        images,
        customThemes
      })

      downloadBlob(blob, `decoai-data-${Date.now()}.json`)
      toast.success(t("success_backup"))
    } catch {
      toast.error(t("error_backup"))
    } finally {
      setIsLoading(false)
    }
  }

  const onRestoreClick = () => restoreFileRef.current?.click()

  const replaceStorageData = async (nextSyncData: Record<string, unknown>, nextLocalData: Record<string, unknown>) => {
    const [currentSyncData, currentLocalData] = await Promise.all([
      chrome.storage.sync.get(),
      chrome.storage.local.get()
    ])
    const syncKeys = Object.keys(currentSyncData).filter((key) => !(key in nextSyncData))
    const localKeys = Object.keys(currentLocalData).filter(
      (key) => key !== AUTH_SESSION_STORAGE_KEY && !(key in nextLocalData)
    )

    if (Object.keys(nextSyncData).length) await chrome.storage.sync.set(nextSyncData)
    if (Object.keys(nextLocalData).length) await chrome.storage.local.set(nextLocalData)
    if (syncKeys.length) await chrome.storage.sync.remove(syncKeys)
    if (localKeys.length) await chrome.storage.local.remove(localKeys)
  }

  const onRestoreFile = async (file?: File) => {
    if (!file) {
      toast.error(t("error_fileRequired"))
      return
    }
    if (!isJsonFile(file)) {
      toast.error(t("error_fileInvalid", "JSON"))
      clearFileInput(restoreFileRef.current)
      return
    }

    const importedImageIds: string[] = []
    setIsLoading(true)

    try {
      const dataFile = parseDataImportFile(await file.text(), (index) => `${t("custom")} ${index + 1}`)
      if (!dataFile) {
        toast.error(t("error_fileInvalid", "JSON"))
        return
      }

      const imageIdMap = await saveImportedImages(dataFile.images, importedImageIds)
      const importedThemeData = await importCustomThemeImages(dataFile.customThemes)
      const importedThemes = importedThemeData.themes
      importedImageIds.push(...importedThemeData.imageIds)
      const nextLocalData = replacePhotoImageIds(dataFile.local, imageIdMap)
      delete nextLocalData[AUTH_SESSION_STORAGE_KEY]

      nextLocalData[CUSTOM_THEMES_STORAGE_KEY] = JSON.stringify(importedThemes)

      const selectedSourceThemeId = parseStoredValue<string>(dataFile.local[SELECTED_CUSTOM_THEME_ID_STORAGE_KEY]) || ""
      const selectedThemeIndex = dataFile.sourceThemeIds.findIndex((id) => id === selectedSourceThemeId)

      if (importedThemes.length && selectedThemeIndex >= 0) {
        nextLocalData[SELECTED_CUSTOM_THEME_ID_STORAGE_KEY] = JSON.stringify(importedThemes[selectedThemeIndex].id)
      } else if (importedThemes.length) {
        nextLocalData[SELECTED_CUSTOM_THEME_ID_STORAGE_KEY] = JSON.stringify(importedThemes[0].id)
      } else {
        nextLocalData[SELECTED_CUSTOM_THEME_ID_STORAGE_KEY] = JSON.stringify("")
      }

      await replaceStorageData(dataFile.sync, nextLocalData)
      toast.success(t("success_restore"))
    } catch {
      importedImageIds.forEach((imageId) => void deleteImageData(imageId))
      toast.error(t("error_restore"))
    } finally {
      clearFileInput(restoreFileRef.current)
      setIsLoading(false)
    }
  }

  return (
    <>
      <link rel="stylesheet" href={chrome.runtime.getURL("assets/ReactToastify.css")} />
      <style>{`
        * { margin: 0; box-sizing: border-box; }
        .toggle-switch {
          width: 40px;
          height: 24px;
          border-radius: 999px;
          border: 0;
          outline: 0;
          appearance: none;
          -webkit-appearance: none;
          cursor: pointer;
          position: relative;
          background: #6b7280;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .toggle-switch::before {
          content: "";
          position: absolute;
          top: 2px;
          left: 2px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.06);
          transform: translateX(0);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .toggle-switch:checked {
          background: #66cdaa;
        }
        .toggle-switch:checked::before {
          transform: translateX(16px);
        }
        .data button:hover { filter: brightness(1.1); }
      `}</style>
      <div style={rootStyle}>
        <div style={headerStyle}>
          <div
            style={{
              display: "flex",
              alignItems: "end",
              justifyContent: "space-between"
            }}>
            <img
              src={chrome.runtime.getURL("assets/icon.png")}
              alt="app icon"
              draggable="false"
              style={{ height: 24 }}
            />
            <h2>DecoAI</h2>
            <span style={{ lineHeight: 1 }}>v{version}</span>
          </div>
        </div>

        <div style={contentStyle}>
          <div style={tabGridStyle}>
            <TabButton
              active={activeTab === "settings"}
              label={t("setting")}
              onClick={() => setActiveTab("settings")}
            />
            <TabButton active={activeTab === "account"} label={t("account")} onClick={() => setActiveTab("account")} />
          </div>

          {activeTab !== "account" ? (
            <>
              <div style={sectionHeaderStyle}>
                <Icon icon="lucide:eye" height={24} aria-hidden="true" />
                <h3>{t("visibility")}</h3>
              </div>

              <div style={rowStyle}>
                <div style={itemLabelStyle}>
                  <Icon icon="lucide:panel-right-open" color="#66cdaa" height={16} aria-hidden="true" />
                  <span style={{ lineHeight: 1 }}>{t("sidebar")}</span>
                </div>
                <ToggleSwitch checked={isSidePanelOpen} onChange={onSidePanelToggle} />
              </div>

              <label style={rowStyle}>
                <div style={itemLabelStyle}>
                  <Icon icon="lucide:wallpaper" color="#66cdaa" height={16} aria-hidden="true" />
                  <span style={{ lineHeight: 1 }}>
                    {t("theme")} {t("setting")}
                  </span>
                </div>
                <ToggleSwitch checked={!themeHidden} onChange={(checked) => setThemeHidden(!checked)} />
              </label>

              <label style={rowStyle}>
                <div style={itemLabelStyle}>
                  <Icon icon="lucide:component" color="#66cdaa" height={16} aria-hidden="true" />
                  <span style={{ lineHeight: 1 }}>
                    {t("widget")} {t("setting")}
                  </span>
                </div>
                <ToggleSwitch checked={!widgetHidden} onChange={(checked) => setWidgetHidden(!checked)} />
              </label>

              <div style={{ ...sectionHeaderStyle, marginTop: 16 }}>
                <Icon icon="lucide:bot" height={24} aria-hidden="true" />
                <h3>{t("models")}</h3>
              </div>

              {MODEL_LIST.map((site) => (
                <label key={site.key} style={rowStyle}>
                  <div style={itemLabelStyle}>
                    <Icon icon={site.icon} height={16} aria-hidden="true" />
                    <span style={{ lineHeight: 1 }}>{site.label}</span>
                  </div>
                  <ToggleSwitch
                    checked={Boolean(modelEnabled?.[site.key])}
                    onChange={(checked) => updateModelEnabled(site.key, checked)}
                  />
                </label>
              ))}
            </>
          ) : (
            <>
              <div style={sectionWrapperStyle}>
                <div style={sectionHeaderStyle}>
                  <Icon icon="lucide:circle-user-round" height={24} aria-hidden="true" />
                  <h3>{t("profile")}</h3>
                </div>
                <button
                  type="button"
                  onClick={authSession ? onSignOutClick : onSignInClick}
                  disabled={isLoading}
                  style={actionButtonStyle}>
                  <Icon
                    icon={`lucide:${authSession ? "log-out" : "log-in"}`}
                    color="#66cdaa"
                    height={24}
                    aria-hidden="true"
                  />
                </button>
              </div>

              <div style={rowStyle}>
                <span>{t("email")}</span>
                <span>{authSession?.email || "Guest"}</span>
              </div>

              <div style={rowStyle}>
                <span>{t("name")}</span>
                <span>{authSession?.displayName || "Guest"}</span>
              </div>

              <div style={{ ...sectionWrapperStyle, marginTop: 16 }}>
                <div style={sectionHeaderStyle}>
                  <Icon icon="lucide:gem" height={24} aria-hidden="true" />
                  <h3>{t("subscription")}</h3>
                </div>
                <button type="button" onClick={onSubscriptionClick} style={actionButtonStyle}>
                  <Icon icon="lucide:inbox" color="#66cdaa" height={24} aria-hidden="true" />
                </button>
              </div>

              <div style={rowStyle}>
                <span>{t("status")}</span>
                <Icon
                  icon={`lucide:${authSession ? "circle-check-big" : "circle-question-mark"}`}
                  height={16}
                  color={authSession ? "#0d6efd" : "#ffc107"}
                  aria-hidden="true"
                />
              </div>

              <div style={rowStyle}>
                <span>{t("plan")}</span>
                <span>{premiumStatus === "premium" ? "Pro" : "Free"}</span>
              </div>

              <div style={{ ...sectionWrapperStyle, marginTop: 16 }}>
                <div style={sectionHeaderStyle}>
                  <Icon icon="lucide:database" height={24} aria-hidden="true" />
                  <h3>{t("data")}</h3>
                </div>
              </div>

              <div className="data" style={{ ...rowStyle, marginTop: 8 }}>
                <button type="button" onClick={onRestoreClick} style={controlButtonStyle}>
                  <div style={{ ...itemLabelStyle, gap: 4 }}>
                    <Icon icon="lucide-hard-drive-download" height={16} aria-hidden="true" />
                    <span>{t("restore")}</span>
                  </div>
                </button>
                <button type="button" onClick={onBackupClick} style={controlButtonStyle}>
                  <div style={{ ...itemLabelStyle, gap: 4 }}>
                    <Icon icon="lucide-hard-drive-upload" height={16} aria-hidden="true" />
                    <span>{t("backup")}</span>
                  </div>
                </button>
                <input
                  ref={restoreFileRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => onRestoreFile(e.target.files?.[0])}
                  style={{ display: "none" }}
                />
              </div>
            </>
          )}
        </div>
        {isLoading && (
          <div style={LOADING_OVERLAY_STYLE}>
            <Icon icon="line-md:loading-twotone-loop" height={48} color="#66cdaa" aria-hidden="true" />
          </div>
        )}
        <ToastContainer
          theme="colored"
          position="top-center"
          autoClose={2000}
          hideProgressBar
          closeOnClick
          pauseOnFocusLoss={false}
          newestOnTop
          limit={1}
        />
      </div>
    </>
  )
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...tabButtonStyle,
        ...(active ? activeTabButtonStyle : inactiveTabButtonStyle)
      }}>
      {label}
    </button>
  )
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <input className="toggle-switch" type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
  )
}

const rootStyle = {
  width: 300,
  display: "flex",
  flexDirection: "column",
  backgroundColor: "#333",
  color: "#fff",
  fontFamily: "sans-serif",
  userSelect: "none",
  WebkitUserSelect: "none"
} as const

const headerStyle = {
  padding: "8px 16px",
  backgroundColor: "#66cdaa",
  color: "#333"
} as const

const contentStyle = {
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 8
} as const

const tabGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  borderBottom: "2px solid #66cdaa",
  gap: 8,
  marginBottom: 10
} as const

const tabButtonStyle = {
  border: 0,
  borderRadius: "12px 12px 0 0",
  padding: 8,
  cursor: "pointer"
} as const

const activeTabButtonStyle = {
  backgroundColor: "#66cdaa",
  color: "#fff"
} as const

const inactiveTabButtonStyle = {
  backgroundColor: "#4b5563",
  color: "#fff"
} as const

const sectionWrapperStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8
} as const

const sectionHeaderStyle = {
  display: "flex",
  justifyContent: "flex-start",
  alignItems: "center",
  gap: 8
} as const

const rowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "4px 8px",
  gap: 8
} as const

const itemLabelStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8
} as const

const actionButtonStyle = {
  width: 24,
  height: 24,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  background: 0,
  border: 0,
  cursor: "pointer"
} as const

const controlButtonStyle = {
  flex: 1,
  padding: 8,
  backgroundColor: "#4b5563",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  whiteSpace: "nowrap",
  cursor: "pointer"
} as const

export default IndexPopup
