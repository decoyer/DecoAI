chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
  if (message.type === "GET_GOOGLE_ACCESS_TOKEN") {
    const identityApi = chrome.identity
    if (!identityApi?.getAuthToken) {
      sendResponse({ success: false, error: "Identity API unavailable" })
      return false
    }

    ;(async () => {
      identityApi.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message })
          return
        }

        if (token) {
          identityApi.removeCachedAuthToken({ token }, () => {
            identityApi.getAuthToken({ interactive: true }, (newToken) => {
              if (chrome.runtime.lastError || !newToken) {
                sendResponse({ success: false, error: chrome.runtime.lastError?.message || "Failed to get token" })
                return
              }
              sendResponse({ success: true, token: newToken })
            })
          })
          return
        }

        identityApi.getAuthToken({ interactive: true }, (newToken) => {
          if (chrome.runtime.lastError || !newToken) {
            sendResponse({ success: false, error: chrome.runtime.lastError?.message || "Failed to get token" })
            return
          }
          sendResponse({ success: true, token: newToken })
        })
      })
    })()

    return true
  }

  if (message.type === "FETCH_IMAGE_AS_DATA_URL") {
    ; (async () => {
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

        if (!imageUrl) {
          sendResponse({ success: false })
          return
        }

        url = await fetch(imageUrl)

        if (!url.ok) {
          sendResponse({ success: false })
          return
        }
      }

      const blob = await url.blob()
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
})
