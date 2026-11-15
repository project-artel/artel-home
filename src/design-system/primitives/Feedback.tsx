import type { ComponentPropsWithRef } from 'react'

export function PanelEmpty({ inset, ...props }: Omit<ComponentPropsWithRef<'p'>, 'className'> & { inset?: boolean }) {
  return <p {...props} className={inset ? 'panel-empty panel-empty--inset' : 'panel-empty'} />
}

type InlineErrorProps = ComponentPropsWithRef<'div'> & { inset?: boolean }

export function InlineError({ inset, className, ...props }: InlineErrorProps) {
  const classes = ['inline-error', inset && 'inline-error--inset', className]
  return <div role="alert" {...props} className={classes.filter(Boolean).join(' ')} />
}

export function PanelMessage(props: Omit<ComponentPropsWithRef<'div'>, 'className'>) {
  return <div {...props} className="panel-message" />
}

export function Notice({ tone, ...props }: Omit<ComponentPropsWithRef<'div'>, 'className'> & { tone?: 'critical' }) {
  return <div {...props} className={tone === 'critical' ? 'notice notice--critical' : 'notice'} />
}
