import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Auth.js (NextAuth v5) config.
 *
 * The Google provider requests the read-only Gmail scope up front, plus
 * `access_type: offline` + `prompt: consent` so Google returns a refresh
 * token. The `jwt`/`session` callbacks carry the Gmail access token through
 * to the session so server code (e.g. the /api/threads route in M2) can call
 * the Gmail API on the user's behalf.
 */
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
    // Runs on sign-in (when `account` is present) and on every session read.
    // On sign-in, copy the tokens Google returned onto the JWT.
    jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }
      return token;
    },
    // Expose the Gmail access token to server code that reads the session.
    session({ session, token }) {
      session.accessToken = token.accessToken;
      return session;
    },
  },
});
