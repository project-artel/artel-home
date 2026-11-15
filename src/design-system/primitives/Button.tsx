import type { ComponentPropsWithRef } from 'react'
import { Link } from 'react-router-dom'

type ButtonStyle = {
  variant: 'primary' | 'secondary' | 'danger' | 'danger-quiet'
  size?: 'compact'
  className?: string
}

function buttonClasses({ variant, size, className }: ButtonStyle) {
  const classes = ['button', `button--${variant}`, size && `button--${size}`, className]
  return classes.filter(Boolean).join(' ')
}

export function Button({ variant, size, className, ...props }: ComponentPropsWithRef<'button'> & ButtonStyle) {
  return <button {...props} className={buttonClasses({ variant, size, className })} />
}

export function ButtonLink({ variant, size, className, ...props }: ComponentPropsWithRef<typeof Link> & ButtonStyle) {
  return <Link {...props} className={buttonClasses({ variant, size, className })} />
}
