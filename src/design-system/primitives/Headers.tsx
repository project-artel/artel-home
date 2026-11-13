import type { ComponentPropsWithRef, ReactNode } from 'react'

type HeaderProps = ComponentPropsWithRef<'header'>

type PageHeaderProps = Omit<HeaderProps, 'children' | 'title'> & {
  title: ReactNode
  titleId?: string
  leading?: ReactNode
  eyebrow?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ title, titleId, leading, eyebrow, subtitle, actions, className, ...props }: PageHeaderProps) {
  return (
    <header {...props} className={className ? `page-header ${className}` : 'page-header'}>
      <div>
        {leading}
        {eyebrow !== undefined && <p className="eyebrow">{eyebrow}</p>}
        <h1 id={titleId}>{title}</h1>
        {subtitle !== undefined && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions}
    </header>
  )
}

export function PanelHeader({ split, ...props }: Omit<HeaderProps, 'className'> & { split?: boolean }) {
  return <header {...props} className={split ? 'panel-header panel-header--split' : 'panel-header'} />
}
