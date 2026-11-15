import type { ComponentPropsWithRef } from 'react'

type BadgeProps = Omit<ComponentPropsWithRef<'span'>, 'className'> & {
  tone?: 'success' | 'warning' | 'critical' | 'current' | 'offline'
}

export function Badge({ tone, ...props }: BadgeProps) {
  return <span {...props} className={tone ? `badge badge--${tone}` : 'badge'} />
}
