declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    IGDB_CLIENT_ID?: string;
    IGDB_CLIENT_SECRET?: string;
  }
}
