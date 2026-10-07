import type { AuthProviders } from './passwordAuthApi'

export type OAuthProviderDefinition = {
  id: 'github'
  label: string
  loginPath: string
}

export const oauthProviders: readonly OAuthProviderDefinition[] = [
  {
    id: 'github',
    label: 'GitHub',
    loginPath: '/oauth2/authorization/github',
  },
]

/**
 * The OAuth buttons the server can actually complete. GitHub is registered only
 * when both of its environment variables are set, and a click without them
 * answers 404, so the button follows the server's report.
 */
export function enabledOAuthProviders(providers: AuthProviders | null): readonly OAuthProviderDefinition[] {
  if (providers === null) return []
  return oauthProviders.filter((provider) => providers[provider.id])
}
