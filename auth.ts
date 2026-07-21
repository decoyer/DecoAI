export type PremiumStatus = "unknown" | "free" | "premium"

export const AUTH_SESSION_STORAGE_KEY = "auth-session"
export const AUTH_REFRESH_MS = 5 * 60 * 1000

export type AuthSessionSnapshot = {
  checkedAt: number
  displayName: string
  email: string
  premiumStatus: PremiumStatus
  uid: string
}

export const parseAuthSessionSnapshot = (value: unknown): AuthSessionSnapshot | null => {
  if (
    !value || typeof value !== "object" ||
    !("uid" in value) || typeof value.uid !== "string" ||
    !("premiumStatus" in value) || typeof value.premiumStatus !== "string"
  ) {
    return null
  }

  return {
    checkedAt: "checkedAt" in value ? Number(value.checkedAt) || 0 : 0,
    displayName: "displayName" in value ? String(value.displayName || "") : "",
    email: "email" in value ? String(value.email || "") : "",
    premiumStatus: value.premiumStatus as PremiumStatus,
    uid: value.uid
  }
}

type AuthSessionValidationOptions = {
  refreshPremiumStatus?: boolean
  verifyGoogleGrant?: boolean
}

type AuthMessageResponse<T> = T & {
  success?: boolean
  error?: string
}

const sendAuthMessage = <T>(message: Record<string, unknown>) =>
  new Promise<T>((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response?: AuthMessageResponse<T>) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }

      if (!response?.success) {
        reject(new Error(response?.error))
        return
      }

      resolve(response as T)
    })
  })

export const signInAndSaveAuthSession = async (interactive: boolean) => {
  const response = await sendAuthMessage<{ session: AuthSessionSnapshot }>({
    type: "SIGN_IN_AND_SAVE_AUTH_SESSION",
    interactive
  })

  return response.session
}

export const getVerifiedPremiumStatus = async (forceRefresh = false) => {
  const response = await sendAuthMessage<{ isPremium: boolean }>({
    type: "GET_VERIFIED_PREMIUM_STATUS",
    forceRefresh
  })

  return response.isPremium
}

export const signOutAuthSession = async () => {
  await sendAuthMessage({ type: "SIGN_OUT_AUTH_SESSION" })
}

export const getAuthSessionSnapshot = async () => {
  const result = await chrome.storage.local.get(AUTH_SESSION_STORAGE_KEY)
  const authSessionSnapshot = parseAuthSessionSnapshot(result[AUTH_SESSION_STORAGE_KEY])
  if (!authSessionSnapshot) return null

  await chrome.storage.local.set({ [AUTH_SESSION_STORAGE_KEY]: authSessionSnapshot })

  return authSessionSnapshot
}

export const getValidAuthSessionSnapshot = async ({ refreshPremiumStatus = false, verifyGoogleGrant = false }: AuthSessionValidationOptions = {}) => {
  const response = await sendAuthMessage<{ session: AuthSessionSnapshot | null }>({
    type: "VALIDATE_AUTH_SESSION",
    refreshPremiumStatus,
    verifyGoogleGrant
  })

  return response.session
}

export const getCurrentUserIdToken = async () => {
  const response = await sendAuthMessage<{ idToken: string }>({
    type: "GET_CURRENT_USER_ID_TOKEN"
  })

  return response.idToken
}
