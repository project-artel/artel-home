import assert from 'node:assert/strict'
import test from 'node:test'
import type { ProjectInvitation, ProjectMember } from '../memberTypes'
import { requireInvitation, requireInviteRole, requireInviteTarget, requireMember } from './membersAgent'

const member = { userId: 'u1', displayName: 'A' } as ProjectMember
const invitation = { id: 'i1' } as ProjectInvitation

test('requireMember finds a member by userId and throws for an unknown one', () => {
  assert.equal(requireMember([member], 'u1'), member)
  assert.throws(() => requireMember([member], 'u2'), /No member with userId "u2"/)
})

test('requireInvitation finds a pending invitation and throws for an unknown one', () => {
  assert.equal(requireInvitation([invitation], 'i1'), invitation)
  assert.throws(() => requireInvitation([invitation], 'x'), /No pending invitation/)
})

test('requireInviteRole defaults to MEMBER and rejects an unknown role', () => {
  assert.equal(requireInviteRole(undefined), 'MEMBER')
  assert.equal(requireInviteRole('OWNER'), 'OWNER')
  assert.throws(() => requireInviteRole('ADMIN'), /OWNER, MEMBER/)
})

test('requireInviteTarget trims and rejects blank or non-string input', () => {
  assert.equal(requireInviteTarget('  a@b.c '), 'a@b.c')
  assert.throws(() => requireInviteTarget('   '), /non-empty/)
  assert.throws(() => requireInviteTarget(3), /non-empty/)
})
