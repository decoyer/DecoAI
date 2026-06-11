import { ALLOWED_IMAGE_SOURCE_URLS, MAX_FILE_BYTES } from "./theme-utils"

const isHttpsUrl = (value: unknown) => {
  if (typeof value !== "string") return false
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

const isAllowedImageSource = (value: unknown) =>
  typeof value === "string" && ALLOWED_IMAGE_SOURCE_URLS.has(value)

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

const sendAuthToken = (
  sendResponse: (response?: unknown) => void
) => {
  chrome.identity.getAuthToken({ interactive: true }, (token) => {
    if (chrome.runtime.lastError || !token) {
      sendResponse({
        success: false,
        error: chrome.runtime.lastError?.message || "Failed to get token"
      })
      return
    }
    sendResponse({ success: true, token })
  })
}

chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
  if (message.type === "GET_GOOGLE_ACCESS_TOKEN") {
    if (!chrome.identity.getAuthToken) {
      sendResponse({ success: false, error: "Identity API unavailable" })
      return false
    }

    ; (async () => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          sendResponse({
            success: false,
            error: chrome.runtime.lastError.message
          })
          return
        }

        if (token) {
          chrome.identity.removeCachedAuthToken({ token }, () => {
            sendAuthToken(sendResponse)
          })
          return
        }

        sendAuthToken(sendResponse)
      })
    })()

    return true
  }

  if (message.type === "FETCH_IMAGE_AS_DATA_URL") {
    ; (async () => {
      if (!isAllowedImageSource(message.url)) {
        sendResponse({ success: false })
        return
      }

      const response = await fetch(message.url)

      if (!response.ok) {
        sendResponse({ success: false })
        return
      }

      const contentType = response.headers.get("content-type") || ""
      let url = response

      if (contentType.includes("application/json")) {
        const data = await response.json()
        const imageUrl = typeof data?.url === "string" ? data.url : ""

        if (!isHttpsUrl(imageUrl)) {
          sendResponse({ success: false })
          return
        }

        url = await fetch(imageUrl)

        if (!url.ok) {
          sendResponse({ success: false })
          return
        }
      }

      if (!isSupportedImageResponse(url)) {
        sendResponse({ success: false })
        return
      }

      const blob = await url.blob()
      if (blob.size > MAX_FILE_BYTES) {
        sendResponse({ success: false })
        return
      }

      const reader = new FileReader()

      reader.onloadend = () => {
        sendResponse({
          success: true,
          dataUrl: reader.result
        })
      }

      reader.readAsDataURL(blob)
    })()

    return true
  }

  if (message.type === "OPEN_CHECKOUT") {
    ; (async () => {
      try {
        if (
          typeof message.idToken !== "string" ||
          message.idToken.length < 100
        ) {
          sendResponse({ success: false, error: "Invalid token" })
          return
        }

        const response = await fetch(
          "https://decoai.cokr.workers.dev/checkout",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${message.idToken}` }
          }
        )

        if (!response.ok) {
          sendResponse({
            success: false,
            error: `Checkout request failed: ${response.status}`
          })
          return
        }

        const data = await response.json()
        const checkoutUrl =
          typeof data?.checkoutUrl === "string" ? data.checkoutUrl : ""

        if (!checkoutUrl || !isHttpsUrl(checkoutUrl)) {
          sendResponse({ success: false, error: "Checkout URL missing" })
          return
        }

        chrome.tabs.create({ url: checkoutUrl })
        sendResponse({ success: true })
      } catch (error) {
        sendResponse({
          success: false,
          error:
            error instanceof Error ? error.message : "Checkout request failed"
        })
      }
    })()

    return true
  }
})
