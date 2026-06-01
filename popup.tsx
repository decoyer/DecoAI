import { Storage } from "@plasmohq/storage"
import { useStorage } from "@plasmohq/storage/hook"
import { getAuth, GoogleAuthProvider, signInWithCredential } from "firebase/auth"
import { useEffect, useRef, useState } from "react"

import { app } from "./firebase"

const t = (key: string) => chrome.i18n.getMessage(key)

const localStorageInstance = new Storage({ area: "local" })

const MODEL_LIST = [
  { key: "chatgpt", ico: "assets/chatgpt.ico", label: "ChatGPT", url: "https://chatgpt.com/", color: "#eee" },
  { key: "gemini", ico: "assets/gemini.ico", label: "Gemini", url: "https://gemini.google.com/", color: "#eee" },
  { key: "claude", ico: "assets/claude.ico", label: "Claude", url: "https://claude.ai/", color: "#eee" },
  { key: "grok", ico: "assets/grok.ico", label: "Grok", url: "https://grok.com/", color: "#eee" },
]

const THEME_LIST = [
  { key: "random", color: "#ddd", textColor: "#000" },
  { key: "nasa", color: "#0b3d91", textColor: "#fc3d21" },
  { key: "neon", color: "#bf00ff", textColor: "#00f0ff" },
  { key: "pink", color: "#ff3cac", textColor: "#e0b8ff" },
  { key: "vintage", color: "#400000", textColor: "#b8860b" },
  { key: "fractal", color: "#ffe169", textColor: "#000" },
  { key: "terminal", color: "#000", textColor: "#33ff33" },
  { key: "default", color: "#666", textColor: "#fff" }
]

type ViewType = "themes" | "custom"
type ThemeTabType = "preset" | "custom"
type CustomTheme = {
  id: string
  name: string
  text: string
  accent: string
  bgUrl: string
  bgOptions: CustomBgOptions
}

type CustomBgOptions = {
  scaleX: number
  invert: number
  grayscale: number
  blur: number
  brightness: number
  position: string
}

type ModelEnabledMap = {
  chatgpt: boolean
  gemini: boolean
  claude: boolean
  grok: boolean
}

const DEFAULT_CUSTOM_BG_OPTIONS: CustomBgOptions = {
  scaleX: 1,
  invert: 0,
  grayscale: 0,
  blur: 0,
  brightness: 1,
  position: "center center"
}

const DEFAULT_MODEL_ENABLED: ModelEnabledMap = {
  chatgpt: true,
  gemini: true,
  claude: false,
  grok: false,
}

const DEBOUNCE_MS = 100
const isAiUrl = (url: string) => MODEL_LIST.some((site) => url.startsWith(site.url))

const rootStyle = {
  width: 250,
  maxHeight: 500,
  display: "flex",
  flexDirection: "column",
  fontFamily: "sans-serif",
  backgroundColor: "#333",
  color: "#fff",
  overflow: "hidden"
} as const

const headerStyle = {
  padding: 8,
  backgroundColor: "#66cdaa"
} as const

const contentScrollStyle = {
  overflowY: "auto",
  overflowX: "hidden",
  padding: 20
} as const

const sectionStyle = {
  marginTop: 20,
  display: "flex",
  flexDirection: "column",
  gap: 8
} as const

const cardStyle = {
  backgroundColor: "#3f3f46",
  border: "1px solid #52525b",
  borderRadius: "8px",
  padding: 10
} as const

const rowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center"
} as const

const colorInputStyle = {
  width: 45,
  height: 25,
  backgroundColor: "#3f3f46",
  border: "none",
  borderRadius: "12px",
  padding: 0,
  cursor: "pointer",
  overflow: "hidden"
} as const

const controlButtonStyle = {
  paddingTop: 4,
  paddingBottom: 4,
  backgroundColor: "#4b5563",
  border: "none",
  borderRadius: 12,
  cursor: "pointer",
  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
  color: "#fff",
  fontSize: 12
} as const

const proButtonStyle = {
  ...controlButtonStyle,
  width: "100%",
  marginTop: 20,
  padding: 8,
  background: "linear-gradient(90deg, #8b5cf6, #ec4899)"
} as const

function IndexPopup() {
  const [aiSite, setAiSite] = useState(false)
  const [theme, setTheme] = useStorage("selected-theme", "default")
  const [view, setView] = useState<ViewType>("themes")
  const [themeTab, setThemeTab] = useState<ThemeTabType>("preset")

  const bgUploadRef = useRef<HTMLInputElement>(null)
  const [customBg, setCustomBg] = useState("")
  const [customThemes, setCustomThemes] = useStorage<CustomTheme[]>({
    key: "custom-themes",
    instance: localStorageInstance
  }, [])
  const [selectedCustomThemeId, setSelectedCustomThemeId] = useStorage({
    key: "selected-custom-theme-id",
    instance: localStorageInstance
  }, "")
  const [editingCustomThemeId, setEditingCustomThemeId] = useState("")

  const [customText, setCustomText] = useStorage("custom-text-color", "")
  const [customAccent, setCustomAccent] = useStorage("custom-text-accent", "")
  const [customBgOptions, setCustomBgOptions] = useStorage<CustomBgOptions>("custom-bg-options", DEFAULT_CUSTOM_BG_OPTIONS)
  const [modelEnabled, setModelEnabled] = useStorage<ModelEnabledMap>("model-enabled-map", DEFAULT_MODEL_ENABLED)
  const [isPremiumUser, setIsPremiumUser] = useState(false)

  const [localCustomBgOptions, setLocalCustomBgOptions] = useState<CustomBgOptions>(DEFAULT_CUSTOM_BG_OPTIONS)
  const [localText, setLocalText] = useState("")
  const [localAccent, setLocalAccent] = useState("")
  const [localCustomThemeName, setLocalCustomThemeName] = useState("")

  const canResetText = Boolean((localText || "").trim())
  const canResetAccent = Boolean((localAccent || "").trim())

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs?.[0]?.url || ""
      setAiSite(!isAiUrl(url))
    })
  }, [])

  useEffect(() => {
    if (!customThemes.length && selectedCustomThemeId) setSelectedCustomThemeId("")
    if (selectedCustomThemeId && !customThemes.some((item) => item.id === selectedCustomThemeId)) setSelectedCustomThemeId("")
  }, [customThemes, selectedCustomThemeId, setSelectedCustomThemeId])

  useEffect(() => {
    setThemeTab(theme === "custom" ? "custom" : "preset")
  }, [theme])

  useEffect(() => {
    syncPremiumStatus()
  }, [])

  const createCustomTheme = () => ({
    id: crypto.randomUUID(),
    name: `${t("custom")} ${customThemes.length + 1}`,
    text: "",
    accent: "",
    bgUrl: "",
    bgOptions: { ...DEFAULT_CUSTOM_BG_OPTIONS }
  })

  const editingTheme = customThemes.find((item) => item.id === editingCustomThemeId)

  useEffect(() => {
    if (!editingTheme) return
    setLocalText(editingTheme.text || "")
    setLocalAccent(editingTheme.accent || "")
    setCustomBg(editingTheme.bgUrl || "")
    setLocalCustomBgOptions(editingTheme.bgOptions || DEFAULT_CUSTOM_BG_OPTIONS)
    setLocalCustomThemeName(editingTheme.name || "")
  }, [editingTheme?.id])

  const moveToSite = (url: string) => chrome.tabs.create({ url })

  const updateCustomBgOption = (key: keyof CustomBgOptions, value: string | number) => {
    setLocalCustomBgOptions((prev) => ({ ...prev, [key]: value }))
  }

  const syncThemeToLegacyStorage = (themeData: CustomTheme) => {
    setCustomText(themeData.text || "")
    setCustomAccent(themeData.accent || "")
    setCustomBgOptions(themeData.bgOptions || DEFAULT_CUSTOM_BG_OPTIONS)
    chrome.storage.local.set({ "custom-bg-image": themeData.bgUrl || "" })
  }

  const upsertEditingTheme = () => {
    if (!editingCustomThemeId) return

    setCustomThemes((prev) => {
      const nextThemes = prev.map((item) =>
        item.id === editingCustomThemeId
          ? {
            ...item,
            name: localCustomThemeName,
            text: localText,
            accent: localAccent,
            bgUrl: customBg,
            bgOptions: localCustomBgOptions
          }
          : item
      )
      const updated = nextThemes.find((item) => item.id === editingCustomThemeId)
      if (updated && theme === "custom" && selectedCustomThemeId === updated.id) {
        syncThemeToLegacyStorage(updated)
      }
      return nextThemes
    })
  }

  useDebouncedEffect(upsertEditingTheme, DEBOUNCE_MS, [
    editingCustomThemeId,
    localCustomThemeName,
    localText,
    localAccent,
    customBg,
    localCustomBgOptions
  ])

  const isAnimatedImage = async (file: File) => {
    const buffer = await file.slice(0, 64 * 1024).arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const text = new TextDecoder("latin1").decode(bytes)

    // GIF 검사
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
      return text.includes("NETSCAPE2.0")
    }

    // PNG 검사
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return text.includes("acTL")
    }

    // WebP 검사
    if (text.includes("WEBP")) {
      return text.includes("ANIM")
    }

    // AVIF 검사
    if (text.includes("ftypavif") || text.includes("ftypavis")) {
      return text.includes("avis") || text.includes("msf1") || text.includes("aseq")
    }

    return false
  }

  const openCheckout = async (idToken: string) => {
    const res = await fetch("https://kasutamu.cokr.workers.dev/checkout", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    })

    const text = await res.text()
    const data = JSON.parse(text) as { checkoutUrl: string }

    chrome.tabs.create({ url: data.checkoutUrl })
  }

  const getGoogleAccessToken = () =>
    new Promise<string>((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (token) {
          chrome.identity.removeCachedAuthToken({ token }, requestNewToken)
        } else {
          requestNewToken()
        }
      })

      function requestNewToken() {
        chrome.identity.getAuthToken({ interactive: true }, (newToken) => {
          resolve(newToken)
        })
      }
    })

  const syncPremiumStatus = async () => {
    try {
      const auth = getAuth(app)
      const user = auth.currentUser
      if (!user) {
        setIsPremiumUser(false)
        return
      }

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

  const onUploadCustomBg = async (file?: File) => {
    if (!file) return

    const animated = await isAnimatedImage(file)

    if (animated) {
      const canUsePremiumFeature = isPremiumUser || await checkPremium()
      if (!canUsePremiumFeature) {
        if (bgUploadRef.current) bgUploadRef.current.value = ""
        return
      }
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      setCustomBg(result)
      if (theme === "custom" && editingCustomThemeId === selectedCustomThemeId) {
        chrome.storage.local.set({ "custom-bg-image": result })
      }
      if (bgUploadRef.current) bgUploadRef.current.value = ""
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
  }

  const resetCustomText = () => {
    setLocalText("")
  }

  const resetCustomAccent = () => {
    setLocalAccent("")
  }

  const resetCustomBg = () => {
    setCustomBg("")
    setLocalCustomBgOptions(DEFAULT_CUSTOM_BG_OPTIONS)
  }

  const onCustomCardClick = (customThemeItem: CustomTheme) => {
    const isSelected = theme === "custom" && selectedCustomThemeId === customThemeItem.id

    if (isSelected) {
      setEditingCustomThemeId(customThemeItem.id)
      setView("custom")
      return
    }

    setEditingCustomThemeId("")

    setSelectedCustomThemeId(customThemeItem.id)
    setTheme("custom")

    syncThemeToLegacyStorage(customThemeItem)
    setCustomBg(customThemeItem.bgUrl || "")

    setView("themes")
  }

  const onCustomPlusClick = async () => {
    if (customThemes.length > 0) {
      const canUsePremiumFeature = isPremiumUser || await checkPremium()
      if (!canUsePremiumFeature) return
    }

    const created = createCustomTheme()
    setCustomThemes((prev) => [...prev, created])
  }

  const onDeleteCustomTheme = () => {
    if (!editingCustomThemeId) return

    const deletingSelected = selectedCustomThemeId === editingCustomThemeId && theme === "custom"
    const nextThemes = customThemes.filter((item) => item.id !== editingCustomThemeId)
    setCustomThemes(nextThemes)

    if (deletingSelected) {
      setSelectedCustomThemeId("")
      setTheme("default")
      setCustomText("")
      setCustomAccent("")
      setCustomBgOptions(DEFAULT_CUSTOM_BG_OPTIONS)
      chrome.storage.local.remove("custom-bg-image")
    }

    setEditingCustomThemeId("")
    setView("themes")
  }

  return (
    <>
      <style>{`
        * { margin: 0; box-sizing: border-box; }
        .content-scroll {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .content-scroll::-webkit-scrollbar {
          display: none;
        }
        input.color-picker::-webkit-color-swatch-wrapper { padding: 0; }
        input.color-picker::-webkit-color-swatch { border: none; border-radius: 6px; }
      `}</style>

      <div style={rootStyle}>
        <div style={headerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src={chrome.runtime.getURL("assets/icon.png")} alt="app icon" style={{ height: 24 }} />
            <img src={chrome.runtime.getURL("assets/logo.png")} alt="app logo" style={{ height: 24 }} />
          </div>
        </div>

        <div className="content-scroll" style={contentScrollStyle}>
          {aiSite && (
            <>
              <h2 style={{ margin: 0, textAlign: "center" }}>{t("selectModel")}</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", marginTop: 20, gap: 8 }}>
                {MODEL_LIST.map((site) => (
                  <button
                    key={site.key}
                    onClick={() => moveToSite(site.url)}
                    style={{ ...btnStyle(site.color, false) }}>
                    <img src={chrome.runtime.getURL(site.ico)} alt={`${site.label} icon`} style={{ width: 24, height: 24 }} />
                    <h3 style={fontStyle("#000")}>{site.label}</h3>
                  </button>
                ))}
              </div>
            </>
          )}

          {!aiSite && view === "themes" && (
            <>
              <h2 style={{ margin: 0, textAlign: "center" }}>{t("selectTheme")}</h2>
              <div style={{ marginTop: 20 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10, borderBottom: "2px solid #66cdaa" }}>
                  <button
                    type="button"
                    onClick={() => setThemeTab("preset")}
                    style={{
                      ...controlButtonStyle,
                      padding: "8px",
                      borderRadius: "12px 12px 0 0",
                      backgroundColor: themeTab === "preset" ? "#66cdaa" : "#4b5563"
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
                      backgroundColor: themeTab === "custom" ? "#66cdaa" : "#4b5563"
                    }}>
                    {t("custom")}
                  </button>
                </div>

                {themeTab === "preset" && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                    {THEME_LIST.map((item) => (
                      <button
                        key={item.key}
                        onClick={() => onThemeClick(item.key)}
                        style={{ ...btnStyle(item.color, theme === item.key) }}>
                        <h3 style={fontStyle(item.textColor)}>{t(item.key)}</h3>
                      </button>
                    ))}
                  </div>
                )}

                {themeTab === "custom" && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                    {customThemes.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onCustomCardClick(item)}
                        style={{ ...btnStyle(item.text, theme === "custom" && selectedCustomThemeId === item.id) }}>
                        <h3 style={fontStyle(item.accent)}>{item.name}</h3>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={onCustomPlusClick}
                      style={{ ...btnStyle("#374151", false), border: "2px dashed #4b5563", cursor: "pointer" }}>
                      <h3 style={fontStyle("#fff")}>{`✏️\n${t("addTheme")}`}</h3>
                    </button>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 20 }}>
                <h2 style={{ textAlign: "center", marginBottom: 20 }}>{t("applyTheme")}</h2>
                {MODEL_LIST.map((site) => (
                  <div key={site.key} style={{ marginTop: 8 }}>
                    <CheckboxControl
                      label={site.label}
                      checked={Boolean(modelEnabled?.[site.key as keyof ModelEnabledMap])}
                      onChange={(checked) => setModelEnabled({ ...modelEnabled, [site.key]: checked })}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {!aiSite && view === "custom" && (
            <>
              <h2 style={{ margin: 0, textAlign: "center" }}>{t("editTheme")}</h2>
              <div style={sectionStyle}>
                <div style={cardStyle}>
                  <label style={rowStyle}>
                    <span>{t("name")}</span>
                    <input
                      type="text"
                      value={localCustomThemeName}
                      maxLength={10}
                      onChange={(e) => setLocalCustomThemeName(e.target.value)}
                      style={{ width: 120, border: "none", borderRadius: 12, padding: 4, textAlign: "center", backgroundColor: "#4b5563", color: "#fff" }}
                    />
                  </label>
                </div>
                <div style={cardStyle}>
                  <label style={rowStyle}>
                    <span>{t("text")}</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="color" value={localText} onChange={(e) => setLocalText(e.target.value)} className="color-picker" style={colorInputStyle} />
                      <button
                        type="button"
                        onClick={resetCustomText}
                        disabled={!canResetText}
                        style={{ ...controlButtonStyle, opacity: canResetText ? 1 : 0.5, cursor: canResetText ? "pointer" : "not-allowed" }}>
                        {t("reset")}
                      </button>
                    </div>
                  </label>
                </div>
                <div style={cardStyle}>
                  <label style={rowStyle}>
                    <span>{t("accent")}</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="color" value={localAccent} onChange={(e) => setLocalAccent(e.target.value)} className="color-picker" style={colorInputStyle} />
                      <button
                        type="button"
                        onClick={resetCustomAccent}
                        disabled={!canResetAccent}
                        style={{ ...controlButtonStyle, opacity: canResetAccent ? 1 : 0.5, cursor: canResetAccent ? "pointer" : "not-allowed" }}>
                        {t("reset")}
                      </button>
                    </div>
                  </label>
                </div>
                <div style={cardStyle}>
                  <label style={rowStyle}>
                    <span>{t("background")}</span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input ref={bgUploadRef} type="file" accept="image/*" onChange={(e) => onUploadCustomBg(e.target.files?.[0])} style={{ display: "none" }} />
                      <button type="button" onClick={() => bgUploadRef.current?.click()} style={controlButtonStyle}>{t("upload")}</button>
                      <button
                        type="button"
                        onClick={resetCustomBg}
                        disabled={!customBg}
                        style={{ ...controlButtonStyle, opacity: customBg ? 1 : 0.5, cursor: customBg ? "pointer" : "not-allowed" }}>
                        {t("reset")}
                      </button>
                    </div>
                  </label>
                </div>
                <div style={cardStyle}>
                  <label style={rowStyle}>
                    <span>{t("imagePosition")}</span>
                    <select
                      value={localCustomBgOptions.position}
                      onChange={(e) => updateCustomBgOption("position", e.target.value)}
                      disabled={!customBg}
                      style={{
                        border: "none",
                        borderRadius: "12px",
                        padding: 4,
                        backgroundColor: "#4b5563",
                        color: "#fff",
                        fontSize: 12,
                        cursor: customBg ? "pointer" : "not-allowed",
                        opacity: customBg ? 1 : 0.5
                      }}>
                      <option value="center top">{t("Top")}</option>
                      <option value="center center">{t("Center")}</option>
                      <option value="center bottom">{t("Bottom")}</option>
                    </select>
                  </label>
                </div>
                <div style={cardStyle}>
                  <RangeControl
                    label={t("brightness")}
                    min={0}
                    max={5}
                    step={0.1}
                    value={localCustomBgOptions.brightness}
                    disabled={!customBg}
                    onChange={(v) => updateCustomBgOption("brightness", Number(v))}
                    onReset={() => updateCustomBgOption("brightness", 1)}
                  />
                </div>
                <div style={cardStyle}>
                  <RangeControl
                    label={t("blur")}
                    min={0}
                    max={50}
                    step={1}
                    value={localCustomBgOptions.blur}
                    disabled={!customBg}
                    onChange={(v) => updateCustomBgOption("blur", Number(v))}
                    onReset={() => updateCustomBgOption("blur", 0)}
                  />
                </div>
                <div style={cardStyle}>
                  <CheckboxControl label={t("scaleX")} checked={localCustomBgOptions.scaleX === -1} disabled={!customBg} onChange={(c) => updateCustomBgOption("scaleX", c ? -1 : 1)} />
                </div>
                <div style={cardStyle}>
                  <CheckboxControl label={t("invert")} checked={localCustomBgOptions.invert === 1} disabled={!customBg} onChange={(c) => updateCustomBgOption("invert", c ? 1 : 0)} />
                </div>
                <div style={cardStyle}>
                  <CheckboxControl label={t("grayscale")} checked={localCustomBgOptions.grayscale === 1} disabled={!customBg} onChange={(c) => updateCustomBgOption("grayscale", c ? 1 : 0)} />
                </div>
                <div style={{ ...rowStyle, marginTop: 20, gap: 8 }}>
                  <button
                    type="button"
                    onClick={onDeleteCustomTheme}
                    style={{ ...controlButtonStyle, flex: 1, padding: "10px", backgroundColor: "#d32f2f" }}>
                    {t("delete")}
                  </button>
                  <button
                    type="button"
                    onClick={onSaveClick}
                    style={{ ...controlButtonStyle, flex: 1, padding: "10px", backgroundColor: "#1976d2" }}>
                    {t("save")}
                  </button>
                </div>
              </div>
            </>
          )}

          {!isPremiumUser && (
            <button type="button" onClick={checkPremium} style={proButtonStyle}>
              💎 {t("upgradePro")}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

const btnStyle = (color: string, active: boolean) => ({
  flex: 1,
  height: 100,
  backgroundColor: color,
  border: "none",
  borderRadius: "12px",
  cursor: "pointer",
  boxShadow: active ? "inset 2px 2px 5px rgba(0, 0, 0, 0.2), 0 0 0 3px #66cdaa" : "none",
  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
})

const fontStyle = (color: string) => ({
  color,
  whiteSpace: "pre-line" as const
})

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
    <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{label}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "#d1d5db" }}>{value}</span>
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              disabled={disabled}
              style={{ ...controlButtonStyle, paddingLeft: 8, paddingRight: 8, opacity: disabled ? 0.5 : 1 }}>
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
        style={{ accentColor: "#66cdaa", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}
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
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        style={{ width: 20, height: 20, margin: 0, accentColor: "#66cdaa", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
}

function useDebouncedEffect(effect: () => void, delay: number, deps: unknown[]) {
  useEffect(() => {
    const timer = setTimeout(effect, delay)
    return () => clearTimeout(timer)
  }, deps)
}

export default IndexPopup
