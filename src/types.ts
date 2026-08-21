export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  DOCUMENTS: R2Bucket;
  JWT_SECRET: string;
  JWT_ISSUER: string;
}
