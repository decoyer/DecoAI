import { Storage } from "@plasmohq/storage"
import { useStorage } from "@plasmohq/storage/hook"
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithCredential, type User } from "firebase/auth"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { app } from "./firebase"

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

type ViewType = "themes" | "custom"
type ThemeTabType = "preset" | "custom"
type CustomTheme = { id: string; name: string; text: string; accent: string; bgUrl: string; bgColor: string; bgOptions: CustomBgOptions }
type CustomBgOptions = { scaleX: number; invert: number; grayscale: number; blur: number; brightness: number; position: string }

const DEFAULT_CUSTOM_BG_OPTIONS: CustomBgOptions = { scaleX: 1, invert: 0, grayscale: 0, blur: 0, brightness: 1, position: "center center" }
const THEME_LOADING_EVENT = "kasutamu:theme-loading"
const FAB_OPEN_EVENT = "kasutamu:fab-open"
const DEBOUNCE_MS = 100
const CUSTOM_THEME_LEGACY_STORAGE_KEYS = ["custom-bg-image", "custom-bg-color", "custom-text-color", "custom-text-accent", "custom-bg-options"]

const wrapperStyle = { position: "relative", width: 250, height: 500 } as const
const rootStyle = { width: 250, height: 500, display: "flex", flexDirection: "column", fontFamily: "sans-serif", color: "#fff", overflow: "hidden" } as const
const contentStyle = { flex: 1, minHeight: 0, overflow: "hidden", padding: "20px 20px 0", display: "flex", flexDirection: "column" } as const
const themeSectionStyle = { marginTop: 20, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 } as const
const themeGridScrollStyle = { flex: 1, minHeight: 0, padding: "10px 5px", overflow: "auto" } as const
const sectionStyle = { padding: "20px 0 10px", display: "flex", flexDirection: "column", gap: 8 } as const
const editSectionScrollStyle = { ...sectionStyle, flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" } as const
const cardStyle = {
  backgroundColor: "#3f3f46",
  border: "1px solid transparent",
  borderRadius: "8px",
  padding: 10,
  backdropFilter: "blur(12px) saturate(140%)",
  WebkitBackdropFilter: "blur(12px) saturate(140%)",
  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
} as const
const rowStyle = { display: "flex", justifyContent: "space-between", alignItems: "center" } as const
const colorInputStyle = { width: 45, height: 25, border: "none", borderRadius: "12px", padding: 0, cursor: "pointer", overflow: "hidden" } as const
const controlButtonStyle = {
  paddingTop: 4,
  paddingBottom: 4,
  backgroundColor: "#4b5563",
  color: "#fff",
  border: "1px solid transparent",
  borderRadius: 12,
  cursor: "pointer",
  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
  backdropFilter: "blur(12px) saturate(140%)",
  WebkitBackdropFilter: "blur(12px) saturate(140%)"
} as const
const proButtonStyle = {
  ...controlButtonStyle,
  width: "100%",
  border: "none",
  padding: 8,
  color: "#fff",
  background: "linear-gradient(90deg, #F472B6, #C084FC, #60A5FA, #C084FC, #F472B6)",
  backgroundSize: "500% 100%"
} as const

export function FabPanelApp() {
  const [theme, setTheme] = useStorage("selected-theme", "default")
  const [view, setView] = useState<ViewType>("themes")
  const [themeTab, setThemeTab] = useState<ThemeTabType>("preset")
  const bgUploadRef = useRef<HTMLInputElement>(null)
  const [customBg, setCustomBg] = useState("")
  const [customThemes, setCustomThemes] = useStorage<CustomTheme[]>({ key: "custom-themes", instance: localStorageInstance }, [])
  const [selectedCustomThemeId, setSelectedCustomThemeId] = useStorage({ key: "selected-custom-theme-id", instance: localStorageInstance }, "")
  const [editingCustomThemeId, setEditingCustomThemeId] = useState("")
  const [isPremiumUser, setIsPremiumUser] = useState(false)
  const [isPremiumLoaded, setIsPremiumLoaded] = useState(false)
  const [localCustomBgOptions, setLocalCustomBgOptions] = useState<CustomBgOptions>(DEFAULT_CUSTOM_BG_OPTIONS)
  const [localText, setLocalText] = useState("")
  const [localAccent, setLocalAccent] = useState("")
  const [localCustomThemeName, setLocalCustomThemeName] = useState("")
  const [localCustomBgColor, setLocalCustomBgColor] = useState("")
  const [isThemeLoading, setIsThemeLoading] = useState(false)
  const canResetText = Boolean((localText || "").trim())
  const canResetAccent = Boolean((localAccent || "").trim())

  useEffect(() => {
    if (!customThemes.length && selectedCustomThemeId) setSelectedCustomThemeId("")
    if (selectedCustomThemeId && !customThemes.some((item) => item.id === selectedCustomThemeId)) setSelectedCustomThemeId("")
  }, [customThemes, selectedCustomThemeId, setSelectedCustomThemeId])

  useEffect(() => {
    setThemeTab(theme === "custom" ? "custom" : "preset")
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
      setEditingCustomThemeId("")
      setView("themes")
    }
    window.addEventListener(FAB_OPEN_EVENT, onFabOpen)
    return () => window.removeEventListener(FAB_OPEN_EVENT, onFabOpen)
  }, [])

  const createCustomTheme = () => ({ id: crypto.randomUUID(), name: `${t("custom")} ${customThemes.length + 1}`, text: "", accent: "", bgUrl: "", bgColor: "", bgOptions: { ...DEFAULT_CUSTOM_BG_OPTIONS } })
  const editingTheme = customThemes.find((item) => item.id === editingCustomThemeId)

  useEffect(() => {
    if (!editingTheme) return
    setLocalText(editingTheme.text || "")
    setLocalAccent(editingTheme.accent || "")
    setCustomBg(editingTheme.bgUrl || "")
    setLocalCustomBgColor(editingTheme.bgColor || "")
    setLocalCustomBgOptions(editingTheme.bgOptions || DEFAULT_CUSTOM_BG_OPTIONS)
    setLocalCustomThemeName(editingTheme.name || "")
  }, [editingTheme?.id])

  const updateCustomBgOption = (key: keyof CustomBgOptions, value: string | number) => setLocalCustomBgOptions((prev) => ({ ...prev, [key]: value }))

  const syncThemeToLegacyStorage = async (themeData: CustomTheme) => {
    const nextText = themeData.text || ""
    const nextAccent = themeData.accent || ""
    const nextBgOptions = themeData.bgOptions || DEFAULT_CUSTOM_BG_OPTIONS
    const nextBgUrl = themeData.bgUrl || ""
    const nextBgColor = themeData.bgColor || ""

    setCustomBg(nextBgUrl)
    setLocalCustomBgColor(nextBgColor)

    await chrome.storage.local.set({
      "custom-bg-image": nextBgUrl,
      "custom-bg-color": nextBgColor,
      "custom-text-color": nextText,
      "custom-text-accent": nextAccent,
      "custom-bg-options": nextBgOptions
    })
  }

  const upsertEditingTheme = () => {
    if (!editingCustomThemeId) return
    setCustomThemes((prev) => {
      const nextThemes = prev.map((item) => item.id === editingCustomThemeId ? { ...item, name: localCustomThemeName, text: localText, accent: localAccent, bgUrl: customBg, bgColor: localCustomBgColor, bgOptions: localCustomBgOptions } : item)
      const updated = nextThemes.find((item) => item.id === editingCustomThemeId)
      if (updated && theme === "custom" && selectedCustomThemeId === updated.id) void syncThemeToLegacyStorage(updated)
      return nextThemes
    })
  }

  useDebouncedEffect(upsertEditingTheme, DEBOUNCE_MS, [editingCustomThemeId, localCustomThemeName, localText, localAccent, customBg, localCustomBgColor, localCustomBgOptions])

  const isAnimatedImage = async (file: File) => {
    const buffer = await file.slice(0, 64 * 1024).arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const text = new TextDecoder("latin1").decode(bytes)
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return text.includes("NETSCAPE2.0")
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return text.includes("acTL")
    if (text.includes("WEBP")) return text.includes("ANIM")
    if (text.includes("ftypavif") || text.includes("ftypavis")) return text.includes("avis") || text.includes("msf1") || text.includes("aseq")
    return false
  }

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

  const getGoogleAccessToken = () =>
    new Promise<string>((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "GET_GOOGLE_ACCESS_TOKEN" }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        if (!response?.success || !response?.token) {
          reject(new Error(response?.error || "Failed to get Google access token"))
          return
        }
        resolve(response.token)
      })
    })

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

  const checkPremium = async () => {
    try {
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
    } catch (error) {
      console.error("Premium check failed:", error)
      return false
    }
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
      if (theme === "custom" && editingCustomThemeId === selectedCustomThemeId) chrome.storage.local.set({ "custom-bg-image": result })
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
  const resetCustomText = () => setLocalText("")
  const resetCustomAccent = () => setLocalAccent("")
  const resetCustomBgImage = () => {
    setCustomBg("")
    setLocalCustomBgOptions(DEFAULT_CUSTOM_BG_OPTIONS)
  }
  const resetCustomBgColor = () => {
    setLocalCustomBgColor("")
  }

  const onCustomCardClick = async (customThemeItem: CustomTheme) => {
    const isSelected = theme === "custom" && selectedCustomThemeId === customThemeItem.id
    if (isSelected) {
      setEditingCustomThemeId(customThemeItem.id)
      setView("custom")
      return
    }
    setEditingCustomThemeId("")
    setSelectedCustomThemeId(customThemeItem.id)
    setTheme("custom")
    await syncThemeToLegacyStorage(customThemeItem)
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
      chrome.storage.local.remove(CUSTOM_THEME_LEGACY_STORAGE_KEYS)
    }
    setEditingCustomThemeId("")
    setView("themes")
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
          font-size: 12px;
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
          backdrop-filter: blur(12px) saturate(140%);
          isolation: isolate;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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
          font-size: 12px;
          background-color: #0000008D;
          color: #fff;
          text-align: center;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .custom-theme-card:hover .custom-theme-card__bg { transform: scale(1.1); }
        .custom-theme-card:hover .custom-theme-card__title { background-color: #0000004D; }
        .pro-button { animation: pro-gradient 20s linear infinite; }
        .footer button:hover { filter: brightness(1.1); }
        @keyframes pro-gradient {
          from { background-position: 500% 50%; }
          to { background-position: 0% 50%; }
        }
      `}</style>
      <div style={wrapperStyle}>
        <div style={rootStyle}>
          <div style={contentStyle}>
            {view === "themes" && (
              <>
                <h3 style={{ margin: 0, textAlign: "center" }}>{t("selectTheme")}</h3>
                <div style={themeSectionStyle}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, borderBottom: "2px solid #66cdaa" }}>
                    <button type="button" onClick={() => setThemeTab("preset")} style={{ ...controlButtonStyle, padding: "8px", borderRadius: "12px 12px 0 0", backgroundColor: themeTab === "preset" ? "#66cdaa" : "#4b5563" }}>{t("preset")}</button>
                    <button type="button" onClick={() => setThemeTab("custom")} style={{ ...controlButtonStyle, padding: "8px", borderRadius: "12px 12px 0 0", backgroundColor: themeTab === "custom" ? "#66cdaa" : "#4b5563" }}>{t("custom")}</button>
                  </div>
                  <div className="content-scroll" style={themeGridScrollStyle}>
                    {themeTab === "preset" && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                        {THEME_LIST.map((item) => (
                          <button className="preset-theme-card" key={item.key} onClick={() => onThemeClick(item.key)} style={{ ...btnStyle(item.color, theme === item.key), backgroundColor: "transparent" }}>
                            <div
                              className="preset-theme-card__bg"
                              style={{ background: `linear-gradient(135deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.04) 48%, rgba(0,0,0,0.12) 100%), ${item.color}` }}
                            />
                            <span className="preset-theme-card__emoji" aria-hidden="true">{item.emoji}</span>
                            <span className="preset-theme-card__label">{t(item.key)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {themeTab === "custom" && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                        {customThemes.map((item) => (
                          <button key={item.id} type="button" className="custom-theme-card" onClick={() => onCustomCardClick(item)} style={{ boxShadow: theme === "custom" && selectedCustomThemeId === item.id ? "inset 2px 2px 5px rgba(0, 0, 0, 0.2), 0 0 0 3px #66cdaa" : "none" }}>
                            <div
                              className="custom-theme-card__bg"
                              style={{
                                backgroundImage: item.bgUrl ? `url(${item.bgUrl})` : "none",
                                backgroundColor: !item.bgUrl ? item.bgColor : "transparent"
                              }}
                            />
                            <div className="custom-theme-card__title">{item.name}</div>
                          </button>
                        ))}
                        <button
                          type="button"
                          className="preset-theme-card add-theme-card"
                          onClick={onCustomPlusClick}
                          style={{ ...btnStyle("#374151", false), backgroundColor: "transparent", cursor: "pointer" }}>
                          <div
                            className="preset-theme-card__bg"
                            style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.04) 48%, rgba(0,0,0,0.12) 100%), #374151" }}
                          />
                          <span className="preset-theme-card__emoji" aria-hidden="true">✏️</span>
                          <span className="preset-theme-card__label">{t("addTheme")}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
            {view === "custom" && (
              <>
                <h3 style={{ margin: 0, textAlign: "center" }}>{t("editTheme")}</h3>
                <div className="content-scroll" style={editSectionScrollStyle}>
                  <div style={cardStyle}>
                    <label style={rowStyle}>
                      <span>{t("name")}</span>
                      <input type="text" value={localCustomThemeName} maxLength={10} onChange={(e) => setLocalCustomThemeName(e.target.value)} style={{ width: 120, border: "none", borderRadius: 12, padding: 4, textAlign: "center", backgroundColor: "#4b5563", color: "#fff" }} />
                    </label>
                  </div>
                  <ColorSettingCard label={t("text")} value={localText} onChange={setLocalText} onReset={resetCustomText} canReset={canResetText} />
                  <ColorSettingCard label={t("accent")} value={localAccent} onChange={setLocalAccent} onReset={resetCustomAccent} canReset={canResetAccent} />
                  <ColorSettingCard label={t("backgroundColor")} value={localCustomBgColor} onChange={setLocalCustomBgColor} onReset={resetCustomBgColor} canReset={Boolean(localCustomBgColor)} />
                  <div style={cardStyle}>
                    <label style={rowStyle}>
                      <span>{t("backgroundImage")}</span>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input ref={bgUploadRef} type="file" accept="image/*" onChange={(e) => onUploadCustomBg(e.target.files?.[0])} style={{ display: "none" }} />
                        <button type="button" onClick={() => bgUploadRef.current?.click()} style={controlButtonStyle}>{t("upload")}</button>
                        <button type="button" onClick={resetCustomBgImage} disabled={!customBg} style={{ ...controlButtonStyle, opacity: customBg ? 1 : 0.5, cursor: customBg ? "pointer" : "not-allowed" }}>{t("reset")}</button>
                      </div>
                    </label>
                  </div>
                  {customBg && (
                    <>
                      <div style={cardStyle}>
                        <label style={rowStyle}>
                          <span>{t("imagePosition")}</span>
                          <select value={localCustomBgOptions.position} onChange={(e) => updateCustomBgOption("position", e.target.value)} disabled={!customBg} style={{ border: "none", borderRadius: "12px", padding: 4, backgroundColor: "#4b5563", color: "#fff", cursor: customBg ? "pointer" : "not-allowed", opacity: customBg ? 1 : 0.5 }}>
                            <option value="center top">{t("Top")}</option>
                            <option value="center center">{t("Center")}</option>
                            <option value="center bottom">{t("Bottom")}</option>
                          </select>
                        </label>
                      </div>
                      <div style={cardStyle}>
                        <CheckboxControl label={t("scaleX")} checked={localCustomBgOptions.scaleX === -1} disabled={!customBg} onChange={(c) => updateCustomBgOption("scaleX", c ? -1 : 1)} />
                      </div>
                      <div style={cardStyle}>
                        <RangeControl label={t("brightness")} min={0} max={5} step={0.1} value={localCustomBgOptions.brightness} disabled={!customBg} onChange={(v) => updateCustomBgOption("brightness", Number(v))} onReset={() => updateCustomBgOption("brightness", 1)} />
                      </div>
                      <div style={cardStyle}>
                        <RangeControl label={t("blur")} min={0} max={50} step={1} value={localCustomBgOptions.blur} disabled={!customBg} onChange={(v) => updateCustomBgOption("blur", Number(v))} onReset={() => updateCustomBgOption("blur", 0)} />
                      </div>
                      <div style={cardStyle}>
                        <CheckboxControl label={t("invert")} checked={localCustomBgOptions.invert === 1} disabled={!customBg} onChange={(c) => updateCustomBgOption("invert", c ? 1 : 0)} />
                      </div>
                      <div style={cardStyle}>
                        <CheckboxControl label={t("grayscale")} checked={localCustomBgOptions.grayscale === 1} disabled={!customBg} onChange={(c) => updateCustomBgOption("grayscale", c ? 1 : 0)} />
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="footer" style={{ padding: "10px 20px" }}>
            {view === "custom" && (
              <div style={{ ...rowStyle, gap: 8 }}>
                <button type="button" onClick={onDeleteCustomTheme} style={{ ...controlButtonStyle, flex: 1, border: "none", padding: 8, backgroundColor: "#d32f2f", color: "#fff" }}>{t("delete")}</button>
                <button type="button" onClick={onSaveClick} style={{ ...controlButtonStyle, flex: 1, border: "none", padding: 8, backgroundColor: "#1976d2", color: "#fff" }}>{t("save")}</button>
              </div>
            )}
            {view !== "custom" && isPremiumLoaded && !isPremiumUser && (
              <button type="button" className="pro-button" onClick={checkPremium} style={{ ...proButtonStyle }}><span>💎 {t("upgradePro")}</span></button>
            )}
          </div>
        </div>
        {isThemeLoading && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0, 0, 0, 0.42)", color: "#fff", fontSize: 14, fontWeight: 700, zIndex: 10, pointerEvents: "none" }}>
            {t("loading")}...
          </div>
        )}
      </div>
    </>
  )
}

const btnStyle = (color: string, active: boolean) => ({ height: 100, backgroundColor: color, border: "none", borderRadius: "12px", cursor: "pointer", boxShadow: active ? "inset 2px 2px 5px rgba(0, 0, 0, 0.2), 0 0 0 3px #66cdaa" : "none", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)" })

function Card({ children }: { children: ReactNode }) {
  return <div style={cardStyle}>{children}</div>
}

function ColorSettingCard({ label, value, onChange, onReset, canReset }: { label: string; value: string; onChange: (value: string) => void; onReset: () => void; canReset: boolean }) {
  return (
    <Card>
      <label style={rowStyle}>
        <span>{label}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="color-picker" style={colorInputStyle} />
          <button type="button" onClick={onReset} disabled={!canReset} style={{ ...controlButtonStyle, opacity: canReset ? 1 : 0.5, cursor: canReset ? "pointer" : "not-allowed" }}>{t("reset")}</button>
        </div>
      </label>
    </Card>
  )
}

function RangeControl({ label, min, max, step, value, disabled = false, onChange, onReset }: { label: string; min: number; max: number; step: number; value: number; disabled?: boolean; onChange: (value: string) => void; onReset?: () => void }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{label}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "#d1d5db" }}>{value}</span>
          {onReset && <button type="button" onClick={onReset} disabled={disabled} style={{ ...controlButtonStyle, paddingLeft: 8, paddingRight: 8, opacity: disabled ? 0.5 : 1 }}>{t("reset")}</button>}
        </div>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} style={{ accentColor: "#66cdaa", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function CheckboxControl({ label, checked, disabled = false, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label style={rowStyle}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} disabled={disabled} style={{ width: 20, height: 20, margin: 0, accentColor: "#66cdaa", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

function useDebouncedEffect(effect: () => void, delay: number, deps: unknown[]) {
  useEffect(() => {
    const timer = setTimeout(effect, delay)
    return () => clearTimeout(timer)
  }, deps)
}
