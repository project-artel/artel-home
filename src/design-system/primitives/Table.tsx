import type { ComponentPropsWithRef } from 'react'

export function DataTable({ className, ...props }: ComponentPropsWithRef<'table'>) {
  return <table {...props} className={className ? `table ${className}` : 'table'} />
}

export function TableScroll({ tall, ...props }: Omit<ComponentPropsWithRef<'div'>, 'className'> & { tall?: boolean }) {
  return <div {...props} className={tall ? 'table-scroll table-scroll--tall' : 'table-scroll'} />
}
