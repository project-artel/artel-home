import type { ComponentPropsWithRef } from 'react'

export function TextInput({ className, ...props }: ComponentPropsWithRef<'input'>) {
  return <input {...props} className={className ? `field-input ${className}` : 'field-input'} />
}

export function TextArea({ className, ...props }: ComponentPropsWithRef<'textarea'>) {
  return <textarea {...props} className={className ? `field-input ${className}` : 'field-input'} />
}

export function SelectField({ className, ...props }: ComponentPropsWithRef<'select'>) {
  return <select {...props} className={className ? `field-input ${className}` : 'field-input'} />
}
