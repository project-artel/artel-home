import { listedFieldDescription } from './listedOptions'
import type { ActionSpec, FieldSpec } from '../registry/types'

/*
 * Macro 라이브러리 페이지의 field 와 action 정의. 페이지의 binding(`MacroSection.tsx`)과 catalog 가
 * 같은 객체를 가리킨다.
 */

export const MACROS_BUILD_FIELD: FieldSpec = {
  name: 'macros.build',
  page: 'macros',
  description:
    'Which macros the library shows. Value is a build id (the macros the QA agent saved for that build) or "developer" (the macros developers registered over MCP, not tied to a build). Options lists every build and the developer entry. Changing it closes any open macro.',
}

export const MACROS_LISTED_FIELD: FieldSpec = {
  name: 'macros.listed',
  page: 'macros',
  description: listedFieldDescription(
    'the macros the library shows now for macros.build (label is the macro name; value is its key such as "agent:12")',
    'Use the value as macro of macros.openSource.',
  ),
}

export const MACROS_OPEN_SOURCE_ACTION: ActionSpec = {
  id: 'macros.openSource',
  page: 'macros',
  risk: 'auto',
  description:
    'Open one macro of the library that is shown now, which slides in its source code, signature and docstring on the right. Returns {key, name, origin} at once; the source itself loads on screen. Set macros.build first to pick the build or the developer macros. Blocked while the list loads or when it is empty.',
  args: {
    type: 'object',
    properties: {
      macro: {
        type: 'string',
        description: 'The macro name (or part of it, when only one macro contains it), or its key such as "agent:12" or "developer:login"; the keys are the values of macros.listed.',
      },
    },
    required: ['macro'],
  },
  summarize: (args) => `Open the source of macro ${typeof args.macro === 'string' ? args.macro : ''}`,
}

export const MACROS_FIELDS: FieldSpec[] = [MACROS_BUILD_FIELD, MACROS_LISTED_FIELD]
export const MACROS_ACTIONS: ActionSpec[] = [MACROS_OPEN_SOURCE_ACTION]
