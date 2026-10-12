declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    IGDB_CLIENT_ID?: string;
    STEAM_API_KEY?: string;
    XBOX_CLIENT_ID?: string;
    XBOX_CLIENT_SECRET?: string;
    XBOX_TOKEN_KEY?: string;
    RESEND_API_KEY?: string;
    AUTH_EMAIL_FROM?: string;
    AUTH_PUBLIC_URL?: string;
    AUTH_EMAIL_MODE?: string;
    IGDB_CLIENT_SECRET?: string;
  }
}
