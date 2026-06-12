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
  switch (status) {
    case "premium":
      return "Pro"
    case "free":
      return "Free"
    default:
      return "Guest"
  }
}

function IndexPopup() {
  const [themeHidden, setThemeHidden] = useStorage<boolean>(
    THEME_HIDDEN_STORAGE_KEY,
    false
  )
  const [modelEnabled, setModelEnabled] = useStorage<ModelEnabledMap>(
    MODEL_ENABLED_STORAGE_KEY,
    DEFAULT_MODEL_ENABLED
  )
  const [authLoading, setAuthLoading] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
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
    setSigningIn(true)
    try {
      const nextAuthSession = await signInAndSaveAuthSession(true)
      setAuthSession(nextAuthSession)
      setPremiumStatus(nextAuthSession.premiumStatus)
    } finally {
      setSigningIn(false)
      setAuthLoading(false)
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
          transition: background-color 220ms ease, box-shadow 220ms ease;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
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
          transition: transform 240ms cubic-bezier(0.22, 0.61, 0.36, 1);
          will-change: transform;
        }
        .toggle-switch:checked {
          background: #66cdaa;
        }
        .toggle-switch:checked::before {
          transform: translateX(16px);
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
                <img
                  src={chrome.runtime.getURL("assets/visibility.svg")}
                  alt="visibility settings"
                  draggable="false"
                  style={{ height: 24 }}
                />
                <h3>{t("visibility")}</h3>
              </div>

              <label style={rowStyle}>
                <div style={itemLabelStyle}>
                  <img
                    src={chrome.runtime.getURL("assets/wallpaper.svg")}
                    alt="theme settings"
                    draggable="false"
                    style={{ height: 16 }}
                  />
                  <span style={{ lineHeight: 1 }}>{t("themeSettings")}</span>
                </div>
                <ToggleSwitch
                  checked={!themeHidden}
                  onChange={(checked) => setThemeHidden(!checked)}
                />
              </label>

              <div style={{ ...sectionHeaderStyle, marginTop: 16 }}>
                <img
                  src={chrome.runtime.getURL("assets/smart_toy.svg")}
                  alt="model settings"
                  draggable="false"
                  style={{ height: 24 }}
                />
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
                  <img
                    src={chrome.runtime.getURL("assets/account.svg")}
                    alt="profile info"
                    draggable="false"
                    style={{ height: 24 }}
                  />
                  <h3>{t("profile")}</h3>
                </div>
                <button
                  type="button"
                  onClick={onSignInClick}
                  disabled={authLoading || signingIn}
                  style={actionButtonStyle}
                >
                  <img
                    src={chrome.runtime.getURL("assets/key.svg")}
                    alt="google login"
                    draggable="false"
                    style={{ height: 24 }}
                  />
                </button>
              </div>

              <div style={rowStyle}>
                <div style={itemLabelStyle}>
                  <span>{t("email")}</span>
                </div>
                <span>{authLoading ? "-" : authSession?.email || "-"}</span>
              </div>

              <div style={rowStyle}>
                <div style={itemLabelStyle}>
                  <span>{t("name")}</span>
                </div>
                <span>{authLoading ? "-" : authSession?.displayName || "-"}</span>
              </div>

              <div style={{ ...sectionWrapperStyle, marginTop: 16 }}>
                <div style={sectionHeaderStyle}>
                  <img
                    src={chrome.runtime.getURL("assets/diamond.svg")}
                    alt="subscription info"
                    draggable="false"
                    style={{ height: 24 }}
                  />
                  <h3>{t("subscription")}</h3>
                </div>
                <button
                  type="button"
                  onClick={onSubscriptionClick}
                  style={actionButtonStyle}
                >
                  <img
                    src={chrome.runtime.getURL("assets/subscriptions.svg")}
                    alt={"subscription portal"}
                    draggable="false"
                    style={{ height: 24 }}
                  />
                </button>
              </div>

              <div style={rowStyle}>
                <div style={itemLabelStyle}>
                  <span>{t("status")}</span>
                </div>
                <img
                  src={chrome.runtime.getURL(
                    authSession ? "assets/verified.svg" : "assets/release_alert.svg"
                  )}
                  alt={authSession ? "verified" : "not-verified"}
                  draggable="false"
                  style={{ height: 16 }}
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
