import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  signInWithCredential,
  type User
} from "firebase/auth"

import { app } from "./firebase"

export type PremiumStatus = "unknown" | "free" | "premium"

export const AUTH_SESSION_STORAGE_KEY = "auth-session"

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

type GoogleAccessTokenResponse = {
  success?: boolean
  token?: string
  error?: string
}

const GOOGLE_GRANT_CHECK_MS = 5 * 60 * 1000
let verifiedGoogleGrant: { checkedAt: number; uid: string } | null = null

export const requestGoogleAccessToken = (interactive: boolean) =>
  new Promise<string>((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "GET_GOOGLE_ACCESS_TOKEN", interactive },
      (response?: GoogleAccessTokenResponse) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }

        if (!response?.success || !response.token) {
          reject(new Error(response?.error || "Failed to get Google access token"))
          return
        }

        resolve(response.token)
      }
    )
  })

export const getPremiumStatusForUser = async (
  user: User | null,
  forceRefresh = false
): Promise<PremiumStatus> => {
  if (!user) return "unknown"

  const tokenResult = await user.getIdTokenResult(forceRefresh)
  return tokenResult.claims.premium === true ? "premium" : "free"
}

export const signInWithGoogleAccessToken = async (accessToken: string) => {
  const auth = getAuth(app)
  const credential = GoogleAuthProvider.credential(null, accessToken)
  const result = await signInWithCredential(auth, credential)
  return result.user
}

export const saveAuthSessionSnapshot = async (
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

export const signInAndSaveAuthSession = async (interactive: boolean) => {
  const googleAccessToken = await requestGoogleAccessToken(interactive)
  const user = await signInWithGoogleAccessToken(googleAccessToken)
  const premiumStatus = await getPremiumStatusForUser(user, true)

  return saveAuthSessionSnapshot(user, premiumStatus)
}

export const clearAuthSessionSnapshot = async () => {
  await chrome.storage.local.remove(AUTH_SESSION_STORAGE_KEY)
  await signOut(getAuth(app))
}

export const getAuthSessionSnapshot = async () => {
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

  const authSessionSnapshot: AuthSessionSnapshot = {
    checkedAt: typeof snapshot.checkedAt === "number" ? snapshot.checkedAt : 0,
    displayName: snapshot.displayName,
    email: typeof snapshot.email === "string" ? snapshot.email : "",
    premiumStatus: snapshot.premiumStatus as PremiumStatus,
    uid: snapshot.uid
  }

  if (
    typeof snapshot.googleAccessToken === "string" ||
    typeof snapshot.idToken === "string"
  ) {
    await chrome.storage.local.set({ [AUTH_SESSION_STORAGE_KEY]: authSessionSnapshot })
  }

  return authSessionSnapshot
}

const getCurrentUser = () => {
  const auth = getAuth(app)
  if (auth.currentUser) return Promise.resolve(auth.currentUser)

  return new Promise<User | null>((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe()
      resolve(user)
    })
  })
}

const verifyGoogleGrantForUser = async (expectedUid: string) => {
  if (
    verifiedGoogleGrant?.uid === expectedUid &&
    Date.now() - verifiedGoogleGrant.checkedAt < GOOGLE_GRANT_CHECK_MS
  ) {
    return getCurrentUser()
  }

  try {
    const googleAccessToken = await requestGoogleAccessToken(false)
    const user = await signInWithGoogleAccessToken(googleAccessToken)
    if (user.uid !== expectedUid) return null

    verifiedGoogleGrant = { checkedAt: Date.now(), uid: expectedUid }
    return user
  } catch {
    return null
  }
}

export const getValidAuthSessionSnapshot = async ({
  refreshPremiumStatus = false,
  verifyGoogleGrant = false
}: AuthSessionValidationOptions = {}) => {
  const snapshot = await getAuthSessionSnapshot()
  if (!snapshot) return null

  let user = await getCurrentUser()
  if (!user || user.uid !== snapshot.uid) {
    await clearAuthSessionSnapshot()
    return null
  }

  if (verifyGoogleGrant) {
    user = await verifyGoogleGrantForUser(snapshot.uid)
    if (!user) {
      await clearAuthSessionSnapshot()
      return null
    }
  }

  const premiumStatus = await getPremiumStatusForUser(user, refreshPremiumStatus)
  if (premiumStatus !== snapshot.premiumStatus) {
    return saveAuthSessionSnapshot(user, premiumStatus)
  }

  return snapshot
}

export const getCurrentUserIdToken = async () => {
  const user = await getCurrentUser()
  if (!user) return ""

  return user.getIdToken(true)
}
