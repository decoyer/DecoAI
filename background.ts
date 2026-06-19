import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut
} from "firebase/auth/web-extension"

import type { User } from "firebase/auth"
import { app } from "./firebase"
import { IMAGE_SOURCE_URLS, MAX_FILE_BYTES } from "./utils"

const AUTH_SESSION_STORAGE_KEY = "auth-session"
const AUTH_SILENT_FAILURE_COOLDOWN_MS = 60_000
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_AUTH_SCOPES = ["openid", "email", "profile"]
const t = (key: string) => chrome.i18n.getMessage(key)

type ExtensionManifest = chrome.runtime.Manifest & { oauth2?: { client_id?: string } }
type PremiumStatus = "unknown" | "free" | "premium"
type AuthSessionSnapshot = {
  checkedAt: number
  displayName: string
  email: string
  premiumStatus: PremiumStatus
  uid: string
}
let silentUserVerification:
  | { uid: string; promise: Promise<User | null> }
  | null = null
let lastSilentAuthFailureAt = 0

const isHttpsUrl = (value: unknown) => {
  if (typeof value !== "string") return false
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

const isImageSource = (value: unknown) => typeof value === "string" && IMAGE_SOURCE_URLS.has(value)

const getContentLength = (response: Response) => {
  const value = Number(response.headers.get("content-length") || 0)
  return Number.isFinite(value) ? value : 0
}

const isSupportedImageResponse = (response: Response) => {
  const contentType = response.headers.get("content-type") || ""
  const contentLength = getContentLength(response)
  return (
    contentType.startsWith("image/") &&
    (!contentLength || contentLength <= MAX_FILE_BYTES)
  )
}

const getOAuthClientId = () => {
  const manifest = chrome.runtime.getManifest() as ExtensionManifest
  return manifest.oauth2?.client_id || ""
}

const getTokenFromRedirectUrl = (redirectUrl: string) => {
  const url = new URL(redirectUrl)
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""))
  const queryParams = url.searchParams
  return hashParams.get("access_token") || queryParams.get("access_token") || ""
}

const getWebAuthToken = (interactive: boolean) =>
  new Promise<string>((resolve, reject) => {
  const clientId = getOAuthClientId()

  if (!clientId) {
    reject(new Error("Missing OAuth client ID"))
    return
  }

  if (!chrome.identity.launchWebAuthFlow || !chrome.identity.getRedirectURL) {
    reject(new Error("Web auth flow unavailable"))
    return
  }

  const redirectUri = chrome.identity.getRedirectURL("oauth2")
  const authUrl = new URL(GOOGLE_AUTH_URL)

  authUrl.searchParams.set("client_id", clientId)
  authUrl.searchParams.set("redirect_uri", redirectUri)
  authUrl.searchParams.set("response_type", "token")
  authUrl.searchParams.set("scope", GOOGLE_AUTH_SCOPES.join(" "))
  authUrl.searchParams.set("prompt", interactive ? "select_account" : "none")

  chrome.identity.launchWebAuthFlow(
    {
      url: authUrl.toString(),
      interactive
    },
    (redirectUrl) => {
      if (chrome.runtime.lastError || !redirectUrl) {
        reject(new Error(chrome.runtime.lastError?.message || "Failed to complete login"))
        return
      }

      const token = getTokenFromRedirectUrl(redirectUrl)

      if (!token) {
        reject(new Error("Missing access token"))
        return
      }

      resolve(token)
    }
  )
  })

const sendWebAuthToken = (
  sendResponse: (response?: unknown) => void,
  interactive: boolean
) => {
  getWebAuthToken(interactive)
    .then((token) => sendResponse({ success: true, token }))
    .catch((error) =>
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "Failed to complete login"
      })
    )
}

const getBackgroundAuth = () => getAuth(app)

const getCurrentUser = () => {
  const auth = getBackgroundAuth()
  if (auth.currentUser) return Promise.resolve(auth.currentUser)

  return new Promise<User | null>((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe()
      resolve(user)
    })
  })
}

const getAuthSessionSnapshot = async () => {
  const result = await chrome.storage.local.get(AUTH_SESSION_STORAGE_KEY)
  const snapshot = result[AUTH_SESSION_STORAGE_KEY]

  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    typeof snapshot.displayName !== "string" ||
    typeof snapshot.uid !== "string" ||
    typeof snapshot.premiumStatus !== "string"
  ) {
    return null
  }

  return {
    checkedAt: typeof snapshot.checkedAt === "number" ? snapshot.checkedAt : 0,
    displayName: snapshot.displayName,
    email: typeof snapshot.email === "string" ? snapshot.email : "",
    premiumStatus: snapshot.premiumStatus as PremiumStatus,
    uid: snapshot.uid
  } satisfies AuthSessionSnapshot
}

const getPremiumStatusForUser = async (
  user: User | null,
  forceRefresh = false
): Promise<PremiumStatus> => {
  if (!user) return "unknown"

  const tokenResult = await user.getIdTokenResult(forceRefresh)
  return tokenResult.claims.premium === true ? "premium" : "free"
}

const saveAuthSessionSnapshot = async (
  user: User,
  premiumStatus: PremiumStatus
) => {
  const snapshot: AuthSessionSnapshot = {
    checkedAt: Date.now(),
    displayName: user.displayName || "",
    email: user.email || "",
    premiumStatus,
    uid: user.uid
  }

  await chrome.storage.local.set({ [AUTH_SESSION_STORAGE_KEY]: snapshot })
  return snapshot
}

const signInWithGoogleAccessToken = async (accessToken: string) => {
  const credential = GoogleAuthProvider.credential(null, accessToken)
  const result = await signInWithCredential(getBackgroundAuth(), credential)
  return result.user
}

const signInAndSaveAuthSession = async (interactive: boolean) => {
  const googleAccessToken = await getWebAuthToken(interactive)
  const user = await signInWithGoogleAccessToken(googleAccessToken)
  const premiumStatus = await getPremiumStatusForUser(user, true)
  return saveAuthSessionSnapshot(user, premiumStatus)
}

const signOutAuthSession = async () => {
  await chrome.storage.local.remove(AUTH_SESSION_STORAGE_KEY)
  await signOut(getBackgroundAuth())
}

const verifySnapshotUserSilently = async (snapshot: AuthSessionSnapshot) => {
  if (Date.now() - lastSilentAuthFailureAt < AUTH_SILENT_FAILURE_COOLDOWN_MS) {
    return null
  }

  if (silentUserVerification?.uid === snapshot.uid) {
    return silentUserVerification.promise
  }

  silentUserVerification = {
    uid: snapshot.uid,
    promise: (async () => {
      try {
        const googleAccessToken = await getWebAuthToken(false)
        const user = await signInWithGoogleAccessToken(googleAccessToken)
        if (user.uid !== snapshot.uid) {
          await signOutAuthSession()
          return null
        }

        return user
      } catch {
        lastSilentAuthFailureAt = Date.now()
        return null
      } finally {
        silentUserVerification = null
      }
    })()
  }

  return silentUserVerification.promise
}

const getVerifiedUserForSnapshot = async (
  snapshot: AuthSessionSnapshot,
  verifyGoogleGrant: boolean
) => {
  const currentUser = await getCurrentUser()
  if (currentUser?.uid === snapshot.uid) return currentUser
  if (!verifyGoogleGrant) return null

  return verifySnapshotUserSilently(snapshot)
}

const validateAuthSession = async (
  refreshPremiumStatus = false,
  verifyGoogleGrant = false
) => {
  const snapshot = await getAuthSessionSnapshot()
  if (!snapshot) return null

  const user = await getVerifiedUserForSnapshot(snapshot, verifyGoogleGrant)
  if (!user) {
    if (verifyGoogleGrant) await signOutAuthSession()
    return verifyGoogleGrant ? null : snapshot
  }

  const premiumStatus = await getPremiumStatusForUser(user, refreshPremiumStatus)
  if (premiumStatus !== snapshot.premiumStatus || refreshPremiumStatus) {
    return saveAuthSessionSnapshot(user, premiumStatus)
  }

  return snapshot
}

const getVerifiedPremiumStatus = async (
  forceRefresh = false,
  _interactiveFallback = false
) => {
  const snapshot = await getAuthSessionSnapshot()
  if (!snapshot) return false

  const user = await getVerifiedUserForSnapshot(snapshot, true)
  if (!user) {
    await signOutAuthSession()
    return false
  }

  const premiumStatus = await getPremiumStatusForUser(user, forceRefresh)
  await saveAuthSessionSnapshot(user, premiumStatus)
  return premiumStatus === "premium"
}

const getCurrentUserIdToken = async () => {
  const snapshot = await getAuthSessionSnapshot()
  let user = await getCurrentUser()

  if (snapshot && user?.uid !== snapshot.uid) {
    user = await verifySnapshotUserSilently(snapshot)
  }

  if (!user && snapshot) {
    user = await verifySnapshotUserSilently(snapshot)
  }

  return user ? user.getIdToken(true) : ""
}

const handleAuthMessage = async (message: any) => {
  switch (message.type) {
    case "SIGN_IN_AND_SAVE_AUTH_SESSION":
      return {
        success: true,
        session: await signInAndSaveAuthSession(message.interactive !== false)
      }
    case "VALIDATE_AUTH_SESSION":
      return {
        success: true,
        session: await validateAuthSession(
          message.refreshPremiumStatus === true,
          message.verifyGoogleGrant === true
        )
      }
    case "GET_VERIFIED_PREMIUM_STATUS":
      return {
        success: true,
        isPremium: await getVerifiedPremiumStatus(
          message.forceRefresh === true,
          message.interactiveFallback === true
        )
      }
    case "GET_CURRENT_USER_ID_TOKEN":
      return { success: true, idToken: await getCurrentUserIdToken() }
    case "SIGN_OUT_AUTH_SESSION":
      await signOutAuthSession()
      return { success: true }
    case "CLEAR_AUTH_SESSION_SNAPSHOT":
      await chrome.storage.local.remove(AUTH_SESSION_STORAGE_KEY)
      return { success: true }
    default:
      return null
  }
}

const fetchImageAsDataUrl = async (
  imageSourceUrl: string,
  sendResponse: (response?: unknown) => void
) => {
  if (!isImageSource(imageSourceUrl)) {
    sendResponse({ success: false })
    return
  }

  const response = await fetch(imageSourceUrl)

  if (!response.ok) {
    sendResponse({ success: false })
    return
  }

  const contentType = response.headers.get("content-type") || ""
  let imageResponse = response

  if (contentType.includes("application/json")) {
    const data = await response.json()
    const resolvedImageUrl = typeof data?.url === "string" ? data.url : ""

    if (!isHttpsUrl(resolvedImageUrl)) {
      sendResponse({ success: false })
      return
    }

    imageResponse = await fetch(resolvedImageUrl)

    if (!imageResponse.ok) {
      sendResponse({ success: false })
      return
    }
  }

  if (!isSupportedImageResponse(imageResponse)) {
    sendResponse({ success: false })
    return
  }

  const blob = await imageResponse.blob()
  if (blob.size > MAX_FILE_BYTES) {
    sendResponse({ success: false })
    return
  }

  const reader = new FileReader()
  reader.onloadend = () => sendResponse({ success: true, dataUrl: reader.result })
  reader.readAsDataURL(blob)
}

const openCheckout = async (
  idToken: unknown,
  sendResponse: (response?: unknown) => void
) => {
  try {
    if (typeof idToken !== "string" || idToken.length < 100) {
      sendResponse({ success: false, error: "Invalid token" })
      return
    }

    const response = await fetch("https://decoai.cokr.workers.dev/checkout", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` }
    })

    if (!response.ok) {
      sendResponse({
        success: false,
        error: `Checkout request failed: ${response.status}`
      })
      return
    }

    const data = await response.json()
    const checkoutUrl = typeof data?.checkoutUrl === "string" ? data.checkoutUrl : ""

    if (!checkoutUrl || !isHttpsUrl(checkoutUrl)) {
      sendResponse({ success: false, error: "Checkout URL missing" })
      return
    }

    chrome.tabs.create({ url: checkoutUrl })
    sendResponse({ success: true })
  } catch (error) {
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : "Checkout request failed"
    })
  }
}

chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
  if (message.type === "GET_GOOGLE_ACCESS_TOKEN") {
    sendWebAuthToken(sendResponse, message.interactive !== false)
    return true
  }

  if (
    message.type === "SIGN_IN_AND_SAVE_AUTH_SESSION" ||
    message.type === "VALIDATE_AUTH_SESSION" ||
    message.type === "GET_VERIFIED_PREMIUM_STATUS" ||
    message.type === "GET_CURRENT_USER_ID_TOKEN" ||
    message.type === "SIGN_OUT_AUTH_SESSION" ||
    message.type === "CLEAR_AUTH_SESSION_SNAPSHOT"
  ) {
    void handleAuthMessage(message)
      .then((response) => sendResponse(response || { success: false }))
      .catch((error) =>
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : "Auth request failed"
        })
      )
    return true
  }

  if (message.type === "FETCH_IMAGE_AS_DATA_URL") {
    void fetchImageAsDataUrl(message.url, sendResponse)
    return true
  }

  if (message.type === "OPEN_CHECKOUT") {
    void openCheckout(message.idToken, sendResponse)
    return true
  }

  if (message.type === "TIMER_EXPIRED") {
    chrome.notifications.create(`timer-expired:${message.widgetId}:${Date.now()}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("assets/icon.png"),
      title: "DecoAI",
      message: t("alert_timerExpired")
    })

    return true
  }
})
