import { useStorage } from "@plasmohq/storage/hook"

import {
  DEFAULT_MODEL_ENABLED,
  FAB_HIDDEN_STORAGE_KEY,
  MODEL_ENABLED_STORAGE_KEY,
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

function IndexPopup() {
  const [fabHidden, setFabHidden] = useStorage<boolean>(
    FAB_HIDDEN_STORAGE_KEY,
    false
  )
  const [modelEnabled, setModelEnabled] = useStorage<ModelEnabledMap>(
    MODEL_ENABLED_STORAGE_KEY,
    DEFAULT_MODEL_ENABLED
  )
  const version = chrome.runtime.getManifest().version
  const setModelChecked = (key: ModelKey, checked: boolean) =>
    setModelEnabled({ ...modelEnabled, [key]: checked })

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
            <img
              src={chrome.runtime.getURL("assets/logo.png")}
              alt="app logo"
              draggable="false"
              style={{ height: 24 }}
            />
            <span>v{version}</span>
          </div>
        </div>

        <div style={contentStyle}>
          <h2 style={{ textAlign: "center" }}>{t("setting")}</h2>
          <h3 style={{ marginTop: 10 }}>{t("general")}</h3>
          <label style={{ ...rowStyle, padding: "2px 4px" }}>
            <div style={{ ...rowStyle, gap: 8 }}>
              <img
                src={chrome.runtime.getURL("assets/wallpaper.svg")}
                alt="theme select"
                draggable="false"
                style={{ height: 16 }}></img>
              <span>
                {t("selectTheme")} {t("button")}
              </span>
            </div>
            <ToggleSwitch
              checked={!fabHidden}
              onChange={(checked) => setFabHidden(!checked)}
            />
          </label>

          <h3 style={{ marginTop: 10 }}>{t("manageModel")}</h3>
          {MODEL_LIST.map((site) => (
            <label key={site.key} style={{ ...rowStyle, padding: "2px 4px" }}>
              <div style={{ ...rowStyle, gap: 8 }}>
                <img
                  src={chrome.runtime.getURL(site.icon)}
                  alt="site icon"
                  draggable="false"
                  style={{ height: 16 }}></img>
                <span>{site.label}</span>
              </div>
              <ToggleSwitch
                checked={Boolean(modelEnabled?.[site.key])}
                onChange={(checked) => setModelChecked(site.key, checked)}
              />
            </label>
          ))}
        </div>
      </div>
    </>
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
  gap: 10
} as const

const rowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center"
} as const

export default IndexPopup
