/**
 * Adapter configuration.
 *
 * Loaded from environment variables.
 * The adapter needs a Magento 2 base URL and either:
 *   - An integration access token (recommended for server-to-server), or
 *   - OAuth 1.0a credentials (consumer key/secret + access token/secret)
 */

export interface AdapterConfig {
  baseUrl: string;
  apiVersion: string;
  authMethod: "token" | "oauth";
  accessToken?: string;
  oauthConsumerKey?: string;
  oauthConsumerSecret?: string;
  oauthAccessToken?: string;
  oauthAccessTokenSecret?: string;
  timeout: number;
  storeViewCode: string;
  storeCurrency: string;
  vendorNamespace: string;
}

export function loadConfig(): AdapterConfig {
  const baseUrl = requireEnv("M2_BASE_URL");
  const authMethod = (process.env.M2_AUTH_METHOD || "token") as "token" | "oauth";

  const config: AdapterConfig = {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiVersion: process.env.M2_API_VERSION || "V1",
    authMethod,
    timeout: parseInt(process.env.M2_TIMEOUT || "30000", 10),
    storeViewCode: process.env.M2_STORE_VIEW || "default",
    storeCurrency: process.env.M2_STORE_CURRENCY || "USD",
    vendorNamespace: process.env.ONX_VENDOR_NAMESPACE || "m2",
  };

  if (authMethod === "token") {
    config.accessToken = requireEnv("M2_ACCESS_TOKEN");
  } else {
    config.oauthConsumerKey = requireEnv("M2_OAUTH_CONSUMER_KEY");
    config.oauthConsumerSecret = requireEnv("M2_OAUTH_CONSUMER_SECRET");
    config.oauthAccessToken = requireEnv("M2_OAUTH_ACCESS_TOKEN");
    config.oauthAccessTokenSecret = requireEnv("M2_OAUTH_ACCESS_TOKEN_SECRET");
  }

  return config;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. See .env.example for required configuration.`
    );
  }
  return value;
}
