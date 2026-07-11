import "next-auth";
import "next-auth/jwt";

// Module augmentation so `session.accessToken` and the extra JWT fields are
// typed end to end (no `any` casts in the auth callbacks).
declare module "next-auth" {
  interface Session {
    accessToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  }
}
