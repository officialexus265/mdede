import { createAuthClient } from "better-auth/react";

/**
 * Better Auth client for this React SPA (browser-side).
 *
 * Talks to this app's own Better Auth at same-origin `/api/auth/*`. Standard
 * cookie-based session — no partitioned-iframe / bearer-token handling needed
 * outside a hosted sandbox preview, so this stays a plain client.
 */
export const authClient = createAuthClient({});

/**
 * True when sign-in UI should be shown — i.e. whenever `VITE_AUTH_ENABLED` is
 * not `"false"`.
 */
export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";

/**
 * Sign out of this app's session and redirect.
 *
 * Use this (not `authClient.signOut()` directly) so callers get a consistent
 * redirect-after-success behavior in one place.
 */
export async function signOut(redirectTo = "/"): Promise<void> {
  const { error } = await authClient.signOut();
  if (error) throw new Error(error.message ?? "Sign-out failed");
  if (typeof window !== "undefined") {
    window.location.href = redirectTo;
  }
}
