import { Icon } from "@iconify/react"
import { useStorage } from "@plasmohq/storage/hook"
import { useEffect, useState } from "react"

import {
  AUTH_SESSION_STORAGE_KEY,
  getAuthSessionSnapshot,
  signInAndSaveAuthSession,
  type AuthSessionSnapshot,
  type PremiumStatus
} from "./auth-utils"
import {
  DEFAULT_MODEL_ENABLED,
  MODEL_ENABLED_STORAGE_KEY,
  THEME_HIDDEN_STORAGE_KEY,
  WIDGET_HIDDEN_STORAGE_KEY,
  type ModelEnabledMap
} from "./theme-utils"

const t = (key: string) => chrome.i18n.getMessage(key)
type ModelKey = keyof ModelEnabledMap

const MODEL_LIST = [
  { key: "chatgpt", icon: "assets/chatgpt.ico", label: "ChatGPT" },
  { key: "gemini", icon: "assets/gemini.ico", label: "Gemini" },
  { key: "claude", icon: "assets/claude.ico", label: "Claude" },
  { key: "grok", icon: "assets/grok.ico", label: "Grok" }
] as const

type PopupTab = "settings" | "account"

const getPremiumStatusLabel = (status: PremiumStatus) => {
  return status === "premium" ? "Pro" : "Free"
}

function IndexPopup() {
  const [themeHidden, setThemeHidden] = useStorage<boolean>(
    THEME_HIDDEN_STORAGE_KEY,
    false
  )
  const [widgetHidden, setWidgetHidden] = useStorage<boolean>(
    WIDGET_HIDDEN_STORAGE_KEY,
    false
  )
  const [modelEnabled, setModelEnabled] = useStorage<ModelEnabledMap>(
    MODEL_ENABLED_STORAGE_KEY,
    DEFAULT_MODEL_ENABLED
  )
  const [isLoading, setIsLoading] = useState(false)
  const [authSession, setAuthSession] = useState<AuthSessionSnapshot | null>(
    null
  )
  const [premiumStatus, setPremiumStatus] = useState<PremiumStatus>("unknown")
  const [activeTab, setActiveTab] = useState<PopupTab>("settings")
  const version = chrome.runtime.getManifest().version
  const setModelChecked = (key: ModelKey, checked: boolean) =>
    setModelEnabled({ ...modelEnabled, [key]: checked })

  useEffect(() => {
    void loadSavedSession()
  }, [])

  useEffect(() => {
    const onAuthSessionChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
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

  const onSubscriptionClick = () => {
    window.open("https://polar.sh/kstm/portal")
  }

  return (
    <>
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
        @keyframes loading-spin {
          to { transform: rotate(360deg); }
        }
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
            {/* <img
              src={chrome.runtime.getURL("assets/logo.png")}
              alt="app logo"
              draggable="false"
              style={{ height: 24 }}
            /> */}
            <h3>DecoAI</h3>
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
            <TabButton
              active={activeTab === "account"}
              label={t("account")}
              onClick={() => setActiveTab("account")}
            />
          </div>

          {activeTab !== "account" ? (
            <>
              <div style={sectionHeaderStyle}>
                <Icon icon="lucide:eye" height={24} aria-hidden="true" />
                <h3>{t("visibility")}</h3>
              </div>

              <label style={rowStyle}>
                <div style={itemLabelStyle}>
                  <Icon icon="lucide:wallpaper" color="#66cdaa" height={16} aria-hidden="true" />
                  <span style={{ lineHeight: 1 }}>{t("themeSettings")}</span>
                </div>
                <ToggleSwitch
                  checked={!themeHidden}
                  onChange={(checked) => setThemeHidden(!checked)}
                />
              </label>

              <label style={rowStyle}>
                <div style={itemLabelStyle}>
                  <Icon icon="lucide:component" color="#66cdaa" height={16} aria-hidden="true" />
                  <span style={{ lineHeight: 1 }}>{t("widgetSettings")}</span>
                </div>
                <ToggleSwitch
                  checked={!widgetHidden}
                  onChange={(checked) => setWidgetHidden(!checked)}
                />
              </label>

              <div style={{ ...sectionHeaderStyle, marginTop: 16 }}>
                <Icon icon="lucide:bot" height={24} aria-hidden="true" />
                <h3>{t("models")}</h3>
              </div>

              {MODEL_LIST.map((site) => (
                <label key={site.key} style={rowStyle}>
                  <div style={itemLabelStyle}>
                    <img
                      src={chrome.runtime.getURL(site.icon)}
                      alt="site icon"
                      draggable="false"
                      style={{ height: 16 }}
                    />
                    <span style={{ lineHeight: 1 }}>{site.label}</span>
                  </div>
                  <ToggleSwitch
                    checked={Boolean(modelEnabled?.[site.key])}
                    onChange={(checked) => setModelChecked(site.key, checked)}
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
                  onClick={onSignInClick}
                  disabled={isLoading}
                  style={actionButtonStyle}
                >
                  <Icon icon="lucide:refresh-ccw" color="#66cdaa" height={24} aria-hidden="true" />
                </button>
              </div>

              <div style={rowStyle}>
                <div style={itemLabelStyle}>
                  <span>{t("email")}</span>
                </div>
                <span>{authSession?.email || "Guest"}</span>
              </div>

              <div style={rowStyle}>
                <div style={itemLabelStyle}>
                  <span>{t("name")}</span>
                </div>
                <span>{authSession?.displayName || "Guest"}</span>
              </div>

              <div style={{ ...sectionWrapperStyle, marginTop: 16 }}>
                <div style={sectionHeaderStyle}>
                  <Icon icon="lucide:gem" height={24} aria-hidden="true" />
                  <h3>{t("subscription")}</h3>
                </div>
                <button
                  type="button"
                  onClick={onSubscriptionClick}
                  style={actionButtonStyle}
                >
                  <Icon icon="lucide:repeat" color="#66cdaa" height={24} aria-hidden="true" />
                </button>
              </div>

              <div style={rowStyle}>
                <div style={itemLabelStyle}>
                  <span>{t("status")}</span>
                </div>
                <Icon
                  icon={`lucide:${authSession ? "circle-check-big" : "circle-alert"}`}
                  height={16}
                  color={authSession ? "#0d6efd" : "#ffc107"}
                  aria-hidden="true"
                />
              </div>

              <div style={rowStyle}>
                <div style={itemLabelStyle}>
                  <span>{t("plan")}</span>
                </div>
                <span>{getPremiumStatusLabel(premiumStatus)}</span>
              </div>
            </>
          )}
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
              icon="lucide:loader-circle"
              height={48}
              color="#66cdaa"
              aria-hidden="true"
              style={{ animation: "loading-spin 1s linear infinite" }}
            />
          </div>
        )}
      </div >
    </>
  )
}

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
        ...tabButtonStyle,
        ...(active ? activeTabButtonStyle : inactiveTabButtonStyle)
      }}>
      {label}
    </button>
  )
}

function ToggleSwitch({
  checked,
  onChange
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <input
      className="toggle-switch"
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
  )
}

const rootStyle = {
  width: 280,
  maxHeight: 600,
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
  padding: "2px 8px",
  gap: 8
} as const

const itemLabelStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8
} as const

const actionButtonStyle = {
  height: 24,
  background: 0,
  border: 0,
  cursor: "pointer"
} as const

export default IndexPopup
