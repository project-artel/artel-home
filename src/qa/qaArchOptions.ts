import { apiFetch } from '../auth/authApi'
import { asRecord, readJson } from '../projects/projectApi'
import type { QaArchAxis } from './qaArch'

export function parseQaArchOptions(body: unknown): QaArchAxis[] {
  const options = asRecord(body)?.options
  if (!Array.isArray(options)) throw new Error('Invalid QA option list')

  const keys = new Set<string>()
  const codes = new Set<string>()
  return options.map((raw): QaArchAxis => {
    const option = asRecord(raw)
    const description = asRecord(option?.description)
    if (!option || typeof option.key !== 'string' || !/^[a-z][a-z0-9_]*$/.test(option.key) ||
        option.key === 'label' || option.key === 'engine' || Object.hasOwn(Object.prototype, option.key) ||
        keys.has(option.key) || typeof option.labelCode !== 'string' || !/^[a-z]+$/.test(option.labelCode) ||
        codes.has(option.labelCode) || typeof description?.en !== 'string' || typeof description.ko !== 'string' ||
        !Array.isArray(option.engines) || !option.engines.every((engine) => typeof engine === 'string')) {
      throw new Error('Invalid QA option metadata')
    }
    keys.add(option.key)
    codes.add(option.labelCode)
    const base = {
      key: option.key, labelCode: option.labelCode, engines: option.engines as string[],
      description: { ko: description.ko, en: description.en },
    }
    switch (option.kind) {
      case 'toggle': return { ...base, kind: 'toggle' }
      case 'number':
        if (typeof option.min === 'number' && Number.isSafeInteger(option.min) &&
            typeof option.max === 'number' && Number.isSafeInteger(option.max) && option.min <= option.max) {
          return { ...base, kind: 'number', min: option.min, max: option.max }
        }
        break
      case 'choice': {
        const { values, visionOnlyValues, unavailableWhen } = option
        if (Array.isArray(values) && values.length && values.every((value) => typeof value === 'string' && value) &&
            (visionOnlyValues == null || (Array.isArray(visionOnlyValues) && visionOnlyValues.every((value) => values.includes(value))))) {
          if (unavailableWhen != null && !Array.isArray(unavailableWhen)) break
          const rules = unavailableWhen?.map((item: unknown) => {
            const rule = asRecord(item)
            if (!rule || typeof rule.key !== 'string' || !Array.isArray(rule.values) ||
                !rule.values.every((value) => values.includes(value)) ||
                !(typeof rule.equals === 'boolean' || typeof rule.equals === 'string' || typeof rule.equals === 'number')) {
              throw new Error('Invalid QA option dependency: ' + option.key)
            }
            return { key: rule.key, equals: rule.equals, values: rule.values as string[] }
          })
          return { ...base, kind: 'choice', values, visionOnlyValues: visionOnlyValues ?? undefined, unavailableWhen: rules }
        }
      }
    }
    throw new Error('Invalid QA option: ' + option.key)
  })
}

export async function listQaArchOptions(signal: AbortSignal): Promise<QaArchAxis[]> {
  const response = await apiFetch('/api/qa-arch-options', { signal })
  return parseQaArchOptions(await readJson(response))
}
