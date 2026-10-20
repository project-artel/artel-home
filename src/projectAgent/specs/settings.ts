import type { ActionSpec, FieldSpec } from '../registry/types'

/*
 * 프로젝트 설정 페이지의 field 와 action 정의. field 는 편집 폼의 칸이다. 칸을 쓰면 폼이 열리지만
 * 저장은 settings.save 가 따로 한다.
 */

export const SETTINGS_NAME_FIELD: FieldSpec = {
  name: 'settings.name',
  page: 'settings',
  description: 'Project name in the edit form. Opens the form if it is closed. Not saved until settings.save runs.',
}

export const SETTINGS_GENRE_FIELD: FieldSpec = {
  name: 'settings.genre',
  page: 'settings',
  description: 'Project genre in the edit form; options lists the genres. Opens the form if it is closed. Not saved until settings.save runs.',
}

export const SETTINGS_DESCRIPTION_FIELD: FieldSpec = {
  name: 'settings.description',
  page: 'settings',
  description: 'Project description in the edit form (empty string clears it). Opens the form if it is closed. Not saved until settings.save runs.',
}

export const SETTINGS_SAVE_ACTION: ActionSpec = {
  id: 'settings.save',
  page: 'settings',
  risk: 'approve',
  description:
    'Save the edit form (name, genre, description) to the project, as the Save changes button does. Set the fields first. Returns the saved {name, genre, description}. Blocked when nothing changed or the name is empty.',
  args: { type: 'object', properties: {} },
  summarize: () => 'Save the project settings',
}

export const SETTINGS_CONNECT_TRACKER_ACTION: ActionSpec = {
  id: 'settings.connectTracker',
  page: 'settings',
  risk: 'approve',
  description:
    'Start connecting the issue tracker (GitHub): sends the browser to GitHub authorization, where the user picks the account and repository themselves. Returns {redirecting: true}; the page leaves. Owner only; blocked when a tracker is already connected.',
  args: { type: 'object', properties: {} },
  summarize: () => 'Connect the issue tracker (opens GitHub authorization)',
}

export const SETTINGS_DISCONNECT_TRACKER_ACTION: ActionSpec = {
  id: 'settings.disconnectTracker',
  page: 'settings',
  risk: 'approve',
  description:
    'Disconnect the project from its linked issue tracker repository. Exported issues stay where they are; automatic export stops. Owner only; blocked when no repository is linked.',
  args: { type: 'object', properties: {} },
  summarize: () => 'Disconnect the issue tracker',
}

export const SETTINGS_OPEN_DELETE_ACTION: ActionSpec = {
  id: 'settings.openDeleteProject',
  page: 'settings',
  risk: 'approve',
  description:
    'Open the "Delete project" confirmation dialog. It does NOT delete anything: the user must press the final delete button themselves, and you cannot. Tell the user the dialog is open. Owner only.',
  args: { type: 'object', properties: {} },
  summarize: () => 'Open the delete project confirmation',
}

export const SETTINGS_FIELDS: FieldSpec[] = [SETTINGS_NAME_FIELD, SETTINGS_GENRE_FIELD, SETTINGS_DESCRIPTION_FIELD]
export const SETTINGS_ACTIONS: ActionSpec[] = [
  SETTINGS_SAVE_ACTION,
  SETTINGS_CONNECT_TRACKER_ACTION,
  SETTINGS_DISCONNECT_TRACKER_ACTION,
  SETTINGS_OPEN_DELETE_ACTION,
]
