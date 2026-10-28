/** 서버가 발급한 프로젝트별 TC 번호를 표시하며 큰 숫자도 문자열로 보존한다. */
export function formatTestCaseId(caseNumber: string | number): string {
  const value = String(caseNumber)
  return `TC-${/^\d+$/.test(value) ? value.padStart(3, '0') : value}`
}
