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

export const restoreAuthSessionSnapshot = async (interactive = false) => {
  const snapshot = await getAuthSessionSnapshot()
  const isSnapshotFresh = Boolean(snapshot?.checkedAt) && Date.now() - (snapshot?.checkedAt || 0) < AUTH_REFRESH_MS

  if (snapshot && !interactive && isSnapshotFresh) return snapshot

  try {
    return await signInAndSaveAuthSession(interactive)
  } catch {
    if (snapshot && !interactive) return snapshot
    await clearAuthSessionSnapshot()
    return null
  }
}

export const getVerifiedPremiumStatus = async (
  forceRefresh = false,
  interactiveFallback = false
) => {
  const response = await sendAuthMessage<{ isPremium: boolean }>({
    type: "GET_VERIFIED_PREMIUM_STATUS",
    forceRefresh,
    interactiveFallback
  })

  return response.isPremium
}

export const signOutAuthSession = async () => {
  await sendAuthMessage({ type: "SIGN_OUT_AUTH_SESSION" })
}

export const clearAuthSessionSnapshot = async () => {
  await sendAuthMessage({ type: "CLEAR_AUTH_SESSION_SNAPSHOT" })
}

export const clearAuthSessionAndFirebaseUser = async () => {
  await signOutAuthSession()
}

export const getAuthSessionSnapshot = async () => {
  const result = await chrome.storage.local.get(AUTH_SESSION_STORAGE_KEY)
  const snapshot = result[AUTH_SESSION_STORAGE_KEY]

  if (
    !snapshot || typeof snapshot !== "object" ||
    typeof snapshot.uid !== "string" ||
    typeof snapshot.premiumStatus !== "string"
  ) {
    return null
  }

  const authSessionSnapshot: AuthSessionSnapshot = {
    checkedAt: Number(snapshot.checkedAt) || 0,
    displayName: String(snapshot.displayName || ""),
    email: String(snapshot.email || ""),
    premiumStatus: snapshot.premiumStatus as PremiumStatus,
    uid: snapshot.uid
  }

  await chrome.storage.local.set({ [AUTH_SESSION_STORAGE_KEY]: authSessionSnapshot })

  return authSessionSnapshot
}

export const getValidAuthSessionSnapshot = async ({
  refreshPremiumStatus = false,
  verifyGoogleGrant = false
}: AuthSessionValidationOptions = {}) => {
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
