import type { JsonSchema } from './types'

/**
 * `JsonSchema` 의 작은 부분집합(type, required, properties, enum, items)으로 값을 검사한다.
 * 맞으면 null, 틀리면 어디가 왜 틀렸는지 한 줄로 돌려준다. 모르는 property 는 막지 않는다.
 */
export function validateAgainstSchema(value: unknown, schema: JsonSchema, path = 'args'): string | null {
  if (schema.type !== undefined) {
    const typeError = checkType(value, schema.type, path)
    if (typeError !== null) return typeError
  }
  if (schema.enum !== undefined && !schema.enum.some((allowed) => allowed === value)) {
    return `${path} must be one of ${schema.enum.map((allowed) => JSON.stringify(allowed)).join(', ')}`
  }
  if (isPlainObject(value)) {
    for (const key of schema.required ?? []) {
      if (value[key] === undefined) return `${path}.${key} is required`
    }
    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
      if (value[key] === undefined) continue
      const childError = validateAgainstSchema(value[key], childSchema, `${path}.${key}`)
      if (childError !== null) return childError
    }
  }
  if (Array.isArray(value) && schema.items !== undefined) {
    for (let index = 0; index < value.length; index += 1) {
      const itemError = validateAgainstSchema(value[index], schema.items, `${path}[${index}]`)
      if (itemError !== null) return itemError
    }
  }
  return null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function checkType(value: unknown, type: NonNullable<JsonSchema['type']>, path: string): string | null {
  const valid =
    type === 'object'
      ? isPlainObject(value)
      : type === 'array'
        ? Array.isArray(value)
        : type === 'integer'
          ? Number.isInteger(value)
          : type === 'number'
            ? typeof value === 'number' && Number.isFinite(value)
            : typeof value === type
  return valid ? null : `${path} must be of type ${type}`
}
