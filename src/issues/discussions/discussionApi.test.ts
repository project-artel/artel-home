import assert from 'node:assert/strict'
import test from 'node:test'
import {
  listDiscussions,
  parseDiscussion,
  parseDiscussionDetail,
  parsePage,
  saveDiscussion,
} from './discussionApi'

const author = { id: '9007199254740993', displayName: '민서', userTag: '1001' }
const post = {
  id: '9007199254740994',
  title: '공유',
  excerpt: '본문',
  purpose: 'QUESTION',
  state: 'OPEN',
  pinned: false,
  author,
  issueCount: 2,
  commentCount: 1,
  createdAt: '2026-10-16T00:00:00Z',
  updatedAt: '2026-10-16T00:00:00Z',
  subscribed: true,
  version: 0,
}

test('문자열 ID와 상태를 보존하고 계약 밖 상태를 거부한다', () => {
  assert.equal(parseDiscussion(post).author.id, author.id)
  for (const fields of [
    { id: 1 },
    { purpose: 'BUG' },
    { state: 'RESOLVED' },
    { version: -1 },
    { pinned: 'false' },
  ]) {
    assert.throws(() => parseDiscussion({ ...post, ...fields }))
  }
})
test('상세의 권한을 추측하지 않고 잘못된 응답을 거부한다', () => {
  const detail = {
    ...post,
    body: '본문',
    issues: [],
    mentions: [author],
    decision: null,
    canEdit: false,
    canPin: false,
  }
  assert.equal(parseDiscussionDetail(detail).canEdit, false)
  assert.throws(() => parseDiscussionDetail({ ...detail, canEdit: undefined }))
  assert.throws(() =>
    parsePage(
      { items: [post], hasMore: true, nextCursor: null },
      parseDiscussion,
    ),
  )
})
test('서버 검색·구독 필터·cursor를 인코딩한다', async () => {
  const original = globalThis.fetch
  let url = ''
  globalThis.fetch = async (input) => {
    url = String(input)
    return new Response(
      JSON.stringify({ items: [post], hasMore: false, nextCursor: null }),
      { status: 200 },
    )
  }
  try {
    const result = await listDiscussions(
      '2',
      'subscribed',
      '카드 & 보상',
      '1:32',
    )
    const params = new URL(url).searchParams
    assert.equal(params.get('query'), '카드 & 보상')
    assert.equal(params.get('subscribed'), 'true')
    assert.equal(params.get('cursor'), '1:32')
    assert.equal(result.items[0].id, post.id)
  } finally {
    globalThis.fetch = original
  }
})
test('생성 재시도는 전달받은 요청 ID를 그대로 사용한다', async () => {
  const original = globalThis.fetch
  const sent: unknown[] = []
  globalThis.fetch = async (_, options) => {
    sent.push(JSON.parse(String(options?.body)))
    return new Response(
      JSON.stringify({
        ...post,
        body: '본문',
        issues: [],
        mentions: [],
        decision: null,
        canEdit: true,
        canPin: false,
      }),
      { status: 200 },
    )
  }
  try {
    const draft = {
      title: '공유',
      body: '본문',
      purpose: 'RESOLUTION' as const,
      issueIds: ['12'],
      mentionedUserIds: ['34'],
      reviewerIds: [],
      categoryIds: [],
    }
    await saveDiscussion('2', draft, 'same-request')
    await saveDiscussion('2', draft, 'same-request')
    assert.deepEqual(sent[0], { ...draft, clientRequestId: 'same-request' })
    assert.deepEqual(sent[0], sent[1])
  } finally {
    globalThis.fetch = original
  }
})
