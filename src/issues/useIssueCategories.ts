import { useCallback, useEffect, useState } from 'react'
import { listIssueCategories } from './issueCategoryApi'
import type { IssueCategory } from './issueTypes'

/** 프로젝트의 카테고리 목록. 관리 창에서 바꾸면 [reload] 로 다시 읽는다. */
export function useIssueCategories(projectId: string) {
  const [categories, setCategories] = useState<IssueCategory[]>([])
  const [token, setToken] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    listIssueCategories(projectId, controller.signal)
      .then(setCategories)
      .catch(() => undefined)
    return () => controller.abort()
  }, [projectId, token])
  const reload = useCallback(() => setToken((value) => value + 1), [])
  return { categories, reload }
}
