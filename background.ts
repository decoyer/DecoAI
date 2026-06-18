import { IMAGE_SOURCE_URLS, MAX_FILE_BYTES } from "./utils"

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_AUTH_SCOPES = ["openid", "email", "profile"]
const t = (key: string) => chrome.i18n.getMessage(key)

type ExtensionManifest = chrome.runtime.Manifest & { oauth2?: { client_id?: string } }

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

const sendWebAuthToken = (
  sendResponse: (response?: unknown) => void,
  interactive: boolean
) => {
  const clientId = getOAuthClientId()

  if (!clientId) {
    sendResponse({ success: false, error: "Missing OAuth client ID" })
    return
  }

  if (!chrome.identity.launchWebAuthFlow || !chrome.identity.getRedirectURL) {
    sendResponse({ success: false, error: "Web auth flow unavailable" })
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
        sendResponse({
          success: false,
          error: chrome.runtime.lastError?.message || "Failed to complete login"
        })
        return
      }

      const token = getTokenFromRedirectUrl(redirectUrl)

      if (!token) {
        sendResponse({ success: false, error: "Missing access token" })
        return
      }

      sendResponse({ success: true, token })
    }
  )
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
      message: t("alert_TimerExpired")
    })

    return true
  }
})
