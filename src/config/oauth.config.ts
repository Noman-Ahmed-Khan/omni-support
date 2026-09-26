import { z } from 'zod';

/** Google sign-in is optional: without these values the Google routes fail closed. */
const oauthConfigSchema = z.object({
  google: z.object({
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    callbackUrl: z.string().url().optional(),
  }),
});

export type OAuthConfig = z.infer<typeof oauthConfigSchema>;

let _oauthConfig: OAuthConfig | null = null;

export function getOAuthConfig(): OAuthConfig {
  if (!_oauthConfig) {
    _oauthConfig = oauthConfigSchema.parse({
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID || undefined,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || undefined,
        callbackUrl: process.env.GOOGLE_CALLBACK_URL || undefined,
      },
    });
  }
  return _oauthConfig;
}

/** @internal For testing — resets the singleton so tests can override env vars. */
export function _resetOAuthConfig(): void {
  _oauthConfig = null;
}
