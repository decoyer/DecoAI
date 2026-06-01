chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
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