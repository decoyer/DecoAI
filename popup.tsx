import { useStorage } from "@plasmohq/storage/hook"
import { getAuth, GoogleAuthProvider, signInWithCredential } from "firebase/auth"
import { useEffect, useState } from "react"

import { app } from "./firebase"

const t = (key: string) => chrome.i18n.getMessage(key)
const FAB_HIDDEN_STORAGE_KEY = "fab-hidden"

type ModelEnabledMap = {
  chatgpt: boolean
  gemini: boolean
  claude: boolean
  grok: boolean
}

const DEFAULT_MODEL_ENABLED: ModelEnabledMap = {
  chatgpt: true,
  gemini: true,
  claude: true,
  grok: true
}

const MODEL_LIST = [
  { key: "chatgpt", label: "ChatGPT" },
  { key: "gemini", label: "Gemini" },
  { key: "claude", label: "Claude" },
  { key: "grok", label: "Grok" }
] as const

function IndexPopup() {
  const [fabHidden, setFabHidden] = useStorage<boolean>(FAB_HIDDEN_STORAGE_KEY, false)
  const [modelEnabled, setModelEnabled] = useStorage<ModelEnabledMap>("model-enabled-map", DEFAULT_MODEL_ENABLED)
  const [isPremiumUser, setIsPremiumUser] = useState(false)

  useEffect(() => {
    syncPremiumStatus()
  }, [])

  const openCheckout = async (idToken: string) => {
    const res = await fetch("https://kasutamu.cokr.workers.dev/checkout", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` }
    })
    const data = JSON.parse(await res.text()) as { checkoutUrl: string }
    chrome.tabs.create({ url: data.checkoutUrl })
  }

  const getGoogleAccessToken = () =>
    new Promise<string>((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (token) chrome.identity.removeCachedAuthToken({ token }, requestNewToken)
        else requestNewToken()
      })

      function requestNewToken() {
        chrome.identity.getAuthToken({ interactive: true }, (newToken) => resolve(newToken))
      }
    })

  const syncPremiumStatus = async () => {
    try {
      const auth = getAuth(app)
      const user = auth.currentUser
      if (!user) return setIsPremiumUser(false)
      const tokenResult = await user.getIdTokenResult(true)
      setIsPremiumUser(tokenResult.claims.premium === true)
    } catch {
      setIsPremiumUser(false)
    }
  }

  const checkPremium = async () => {
    if (isPremiumUser) return true

    const auth = getAuth(app)
    let user = auth.currentUser
    if (!user) {
      const accessToken = await getGoogleAccessToken()
      const credential = GoogleAuthProvider.credential(null, accessToken)
      const result = await signInWithCredential(auth, credential)
      user = result.user
    }

    const tokenResult = await user.getIdTokenResult(true)
    const isPremium = tokenResult.claims.premium === true
    setIsPremiumUser(isPremium)

    if (!isPremium) {
      const idToken = await user.getIdToken()
      await openCheckout(idToken)
    }
    return isPremium
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
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src={chrome.runtime.getURL("assets/icon.png")} alt="app icon" style={{ height: 24 }} />
            <img src={chrome.runtime.getURL("assets/logo.png")} alt="app logo" style={{ height: 24 }} />
          </div>
        </div>

        <div style={contentStyle}>
          <h2 style={{ textAlign: "center" }}>{t("setting")}</h2>
          <h3 style={{ marginTop: 10 }}>{t("general")}</h3>
          <label style={rowStyle}>
            <span>{t("appName")} {t("button")}</span>
            <input className="toggle-switch" type="checkbox" checked={!fabHidden} onChange={(e) => setFabHidden(!e.target.checked)} />
          </label>

          <h3 style={{ marginTop: 10 }}>{t("applyModel")}</h3>
          {MODEL_LIST.map((site) => (
            <label key={site.key} style={rowStyle}>
              <span>{site.label}</span>
              <input
                className="toggle-switch"
                type="checkbox"
                checked={Boolean(modelEnabled?.[site.key as keyof ModelEnabledMap])}
                onChange={(e) => setModelEnabled({ ...modelEnabled, [site.key]: e.target.checked })}
              />
            </label>
          ))}

          {!isPremiumUser && (
            <button type="button" onClick={checkPremium} style={proButtonStyle}>
              {"💎 "}{t("upgradePro")}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

const rootStyle = {
  width: 280,
  maxHeight: 600,
  display: "flex",
  flexDirection: "column",
  backgroundColor: "#333",
  color: "#fff",
  fontFamily: "sans-serif"
} as const

const headerStyle = {
  padding: 8,
  backgroundColor: "#66cdaa"
} as const

const contentStyle = {
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 10
} as const

const rowStyle = {
  padding: "2px 8px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center"
} as const

const proButtonStyle = {
  marginTop: 12,
  border: "none",
  borderRadius: 12,
  padding: 8,
  cursor: "pointer",
  color: "#fff",
  background: "linear-gradient(90deg, #8b5cf6, #ec4899)"
} as const

export default IndexPopup
