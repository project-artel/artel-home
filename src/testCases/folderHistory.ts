/*
 * 폴더 작업의 Undo/Redo(ARTEL-1024).
 *
 * 시나리오 편집기(`useStepEditor`)는 화면 안의 사본을 되돌리고 저장을 다시 한다. 폴더 작업은 바로 서버에
 * 쓰이므로 여기서는 작업마다 "되돌리는 요청" 을 함께 기억한다. 단축키와 버튼(↶ ↷)은 같은 모양이다.
 *
 * ## 다시 만든 폴더의 id
 *
 * 폴더 만들기를 Undo 하면 폴더가 지워지고, Redo 하면 **새 id 로** 다시 생긴다. 지운 폴더를 Undo 로 되살릴 때도
 * 같다. 뒤에 쌓인 작업은 옛 id 를 들고 있으므로, 새 id 를 옛 id 의 별칭으로 적어 두고 작업이 실행될 때마다
 * [HistoryContext.resolve] 로 지금의 id 를 찾는다.
 */

export type HistoryContext = {
  /** 처음 기록된 폴더 id 를 지금의 id 로. 다시 만들어진 적 없으면 그대로다. */
  resolve: (folderId: string) => string
  /** [originalId] 폴더가 [currentId] 로 다시 만들어졌다. */
  alias: (originalId: string, currentId: string) => void
}

export type FolderCommand = {
  /** 안내 문구에 쓰는 이름. 예: "폴더 만들기" */
  label: string
  run: (context: HistoryContext) => Promise<void>
  undo: (context: HistoryContext) => Promise<void>
  /** 없으면 [run] 을 다시 부른다. */
  redo?: (context: HistoryContext) => Promise<void>
}

/** 시나리오 편집기의 `UNDO_WINDOW` 와 같다. */
export const HISTORY_LIMIT = 30

export type HistoryState = {
  canUndo: boolean
  canRedo: boolean
  /** 요청이 도는 중. 그동안 다른 작업과 Undo/Redo 는 기다리지 않고 거절된다. */
  busy: boolean
}

/**
 * 작업 기록. 작업은 한 번에 하나씩 돈다 — 두 작업이 겹치면 Undo 가 무엇을 되돌리는지 정할 수 없다.
 * 실패한 작업은 기록하지 않는다. Undo · Redo 가 실패하면 그 작업은 제자리에 남고 오류를 던진다.
 */
export class FolderHistory {
  private past: FolderCommand[] = []
  private future: FolderCommand[] = []
  private readonly aliases = new Map<string, string>()
  private running = false
  private readonly onChange: (state: HistoryState) => void

  constructor(onChange: (state: HistoryState) => void = () => {}) {
    this.onChange = onChange
  }

  readonly context: HistoryContext = {
    resolve: (folderId) => {
      let current = folderId
      const seen = new Set<string>()
      while (this.aliases.has(current) && !seen.has(current)) {
        seen.add(current)
        current = this.aliases.get(current) as string
      }
      return current
    },
    alias: (originalId, currentId) => {
      if (originalId !== currentId) this.aliases.set(originalId, currentId)
    },
  }

  get state(): HistoryState {
    return { canUndo: this.past.length > 0, canRedo: this.future.length > 0, busy: this.running }
  }

  /** 작업을 실행하고 기록한다. 기록하면 Redo 꼬리는 버린다. */
  async execute(command: FolderCommand): Promise<boolean> {
    return this.guard(async () => {
      await command.run(this.context)
      this.past.push(command)
      if (this.past.length > HISTORY_LIMIT) this.past.shift()
      this.future = []
    })
  }

  async undo(): Promise<FolderCommand | null> {
    const command = this.past.at(-1)
    if (command === undefined) return null
    const done = await this.guard(async () => {
      await command.undo(this.context)
      this.past.pop()
      this.future.push(command)
    })
    return done ? command : null
  }

  async redo(): Promise<FolderCommand | null> {
    const command = this.future.at(-1)
    if (command === undefined) return null
    const done = await this.guard(async () => {
      await (command.redo ?? command.run)(this.context)
      this.future.pop()
      this.past.push(command)
    })
    return done ? command : null
  }

  clear() {
    this.past = []
    this.future = []
    this.aliases.clear()
    this.onChange(this.state)
  }

  private async guard(work: () => Promise<void>): Promise<boolean> {
    if (this.running) return false
    this.running = true
    this.onChange(this.state)
    try {
      await work()
      return true
    } finally {
      this.running = false
      this.onChange(this.state)
    }
  }
}
