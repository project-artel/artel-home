export type OAuthProviderDefinition = {
  id: string
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
