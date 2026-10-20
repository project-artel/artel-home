import assert from 'node:assert/strict'
import test from 'node:test'
import { MEMBERS_ACTIONS, MEMBERS_FIELDS } from './members'
import { createOpenDeleteRunner, SETTINGS_ACTIONS, SETTINGS_FIELDS } from './settings'
import { SETUP_ACTIONS, SETUP_FIELDS } from './setup'
import { USAGE_ACTIONS, USAGE_FIELDS } from './usage'

const PAGES = [
  { page: 'members', actions: MEMBERS_ACTIONS, fields: MEMBERS_FIELDS },
  { page: 'settings', actions: SETTINGS_ACTIONS, fields: SETTINGS_FIELDS },
  { page: 'setup', actions: SETUP_ACTIONS, fields: SETUP_FIELDS },
  { page: 'usage', actions: USAGE_ACTIONS, fields: USAGE_FIELDS },
] as const

test('action ids and risks of members, settings, setup and usage', () => {
  const risk = Object.fromEntries(PAGES.flatMap(({ actions }) => actions.map((action) => [action.id, action.risk])))
  assert.deepEqual(risk, {
    'members.invite': 'approve',
    'members.removeMember': 'approve',
    'members.revokeInvitation': 'approve',
    'settings.save': 'approve',
    'settings.connectTracker': 'approve',
    'settings.disconnectTracker': 'approve',
    'settings.openDeleteProject': 'approve',
    'setup.showSdkPackageUrl': 'auto',
    'setup.showCliCommands': 'auto',
    'usage.refresh': 'auto',
  })
})

test('field names', () => {
  assert.deepEqual(MEMBERS_FIELDS.map((field) => field.name), ['members.inviteTarget', 'members.inviteRole', 'members.listed', 'members.invitations'])
  assert.deepEqual(SETTINGS_FIELDS.map((field) => field.name), ['settings.name', 'settings.genre', 'settings.description'])
})

test('every spec carries its page prefix, an object schema and required keys that exist', () => {
  for (const { page, actions, fields } of PAGES) {
    for (const field of fields) assert.ok(field.name.startsWith(`${page}.`) && field.page === page, field.name)
    for (const action of actions) {
      assert.ok(action.id.startsWith(`${page}.`) && action.page === page, action.id)
      assert.equal(action.args.type, 'object')
      for (const required of action.args.required ?? []) assert.ok(action.args.properties?.[required], `${action.id}.${required}`)
      assert.ok(action.description.length > 40, action.id)
      const line = action.summarize({ target: 'a@b.c', userId: 'u1', invitationId: 'i1' })
      assert.ok(line.length > 0 && !line.includes('\n'), action.id)
    }
  }
})

test('members.invite takes a target and an optional role limited to the project roles', () => {
  const invite = MEMBERS_ACTIONS[0]
  assert.deepEqual(invite.args.required, ['target'])
  assert.deepEqual(invite.args.properties?.role?.enum, ['OWNER', 'MEMBER'])
  assert.ok(invite.summarize({ target: 'a@b.c', role: 'OWNER' }).includes('a@b.c'))
})

test('deleting a project is only ever opened, never performed, by the agent', () => {
  const open = SETTINGS_ACTIONS.find((action) => action.id === 'settings.openDeleteProject')
  assert.ok(open)
  assert.deepEqual(open.args.properties, {})
  assert.match(open.description, /does NOT delete/)
})

test('opening the delete dialog opens it and reports nothing was deleted', async () => {
  let opened = 0
  const result = await createOpenDeleteRunner(() => {
    opened += 1
  })()
  assert.deepEqual(result, { opened: true, deleted: false })
  assert.equal(opened, 1)
})
