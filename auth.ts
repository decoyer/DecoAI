import {
  getAuth,
  GoogleAuthProvider,
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
  googleAccessToken: string
  idToken: string
  premiumStatus: PremiumStatus
  uid: string
}

type GoogleAccessTokenResponse = {
  success?: boolean
  token?: string
  error?: string
}

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
  user: User | null
): Promise<PremiumStatus> => {
  if (!user) return "unknown"

  const tokenResult = await user.getIdTokenResult(true)
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
  premiumStatus: PremiumStatus,
  googleAccessToken: string
) => {
  const idToken = await user.getIdToken(true)
  const snapshot: AuthSessionSnapshot = {
    checkedAt: Date.now(),
    displayName: user.displayName || "",
    email: user.email || "",
    googleAccessToken,
    idToken,
    premiumStatus,
    uid: user.uid
  }

  await chrome.storage.local.set({ [AUTH_SESSION_STORAGE_KEY]: snapshot })
  return snapshot
}

export const signInAndSaveAuthSession = async (interactive: boolean) => {
  const googleAccessToken = await requestGoogleAccessToken(interactive)
  const user = await signInWithGoogleAccessToken(googleAccessToken)
  const premiumStatus = await getPremiumStatusForUser(user)

  return saveAuthSessionSnapshot(user, premiumStatus, googleAccessToken)
}

export const clearAuthSessionSnapshot = async () => await chrome.storage.local.remove(AUTH_SESSION_STORAGE_KEY)

export const getAuthSessionSnapshot = async () => {
  const result = await chrome.storage.local.get(AUTH_SESSION_STORAGE_KEY)
  const snapshot = result[AUTH_SESSION_STORAGE_KEY]

  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    typeof snapshot.displayName !== "string" ||
    typeof snapshot.googleAccessToken !== "string" ||
    typeof snapshot.idToken !== "string" ||
    typeof snapshot.uid !== "string" ||
    typeof snapshot.premiumStatus !== "string"
  ) {
    return null
  }

  return snapshot as AuthSessionSnapshot
}

export const isGoogleAccessTokenValid = (accessToken: string) =>
  new Promise<boolean>((resolve) => {
    chrome.runtime.sendMessage(
      { type: "VALIDATE_GOOGLE_ACCESS_TOKEN", accessToken },
      (response?: { success?: boolean; valid?: boolean }) => {
        if (chrome.runtime.lastError || !response?.success) {
          resolve(false)
          return
        }

        resolve(response.valid === true)
      }
    )
  })

export const getValidAuthSessionSnapshot = async () => {
  const snapshot = await getAuthSessionSnapshot()
  if (!snapshot) return null

  const valid = await isGoogleAccessTokenValid(snapshot.googleAccessToken)
  if (!valid) {
    await clearAuthSessionSnapshot()
    return null
  }

  return snapshot
}
