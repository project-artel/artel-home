export function parseBuildEnvironment(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

export function buildEnvironment(isEditor: boolean | null | undefined): string {
  return isEditor === true ? 'Editor' : isEditor === false ? 'Standalone' : 'Unknown'
}

export function buildDisplayName(build: { version: string; label?: string | null; isEditor?: boolean | null }): string {
  const label = build.label?.trim()
  const name = label ? `${build.version} · ${label}` : build.version
  return `${name} · ${buildEnvironment(build.isEditor)}`
}
