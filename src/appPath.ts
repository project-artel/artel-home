export function appPath(path: string): string {
  return `${import.meta.env.BASE_URL ?? '/'}${path.replace(/^\/+/, '')}`
}

export const appBasename = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '') || '/'
