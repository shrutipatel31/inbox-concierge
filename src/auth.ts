import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import Google from "next-auth/providers/google";

/**
 * Auth.js (NextAuth v5) config.
 *
 * The Google provider requests the read-only Gmail scope up front, plus
 * `access_type: offline` + `prompt: consent` so Google returns a refresh
 * token. The `jwt`/`session` callbacks carry the Gmail access token through
 * to the session so server code (e.g. the /api/threads route) can call the
 * Gmail API, and refresh it silently when it expires.
 */

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
// Refresh a bit early to avoid racing the exact expiry moment.
const EXPIRY_SKEW_MS = 60_000;

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

/** Exchange the stored refresh token for a fresh access token. */
async function refreshAccessToken(token: JWT): Promise<JWT> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!token.refreshToken || !clientId || !clientSecret) {
    return { ...token, error: "RefreshFailed" };
  }
  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });
    if (!res.ok) throw new Error(`token refresh failed: ${res.status}`);
    const data = (await res.json()) as GoogleTokenResponse;
    return {
      ...token,
      accessToken: data.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
      // Google usually omits a new refresh token; keep the existing one.
      refreshToken: data.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshFailed" };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/gmail.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, account }) {
      // Initial sign-in: persist the tokens Google returned.
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        return token;
      }
      // Access token still valid → use as-is (expiresAt is seconds since epoch).
      if (token.expiresAt && Date.now() < token.expiresAt * 1000 - EXPIRY_SKEW_MS) {
        return token;
      }
      // Expired → refresh silently.
      return refreshAccessToken(token);
    },
    // Expose the Gmail access token (and any refresh error) to server code.
    session({ session, token }) {
      session.accessToken = token.accessToken;
      session.error = token.error;
      return session;
    },
  },
});
