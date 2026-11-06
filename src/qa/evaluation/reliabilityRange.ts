const dayMilliseconds = 86400000

export function reliabilityDate(days: number, now = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(now + days * dayMilliseconds))
  const value = (type: string) => parts.find(part => part.type === type)!.value
  return `${value('year')}-${value('month')}-${value('day')}`
}

export function reliabilityRange(from: string, to: string) {
  return { from: new Date(`${from}T00:00:00+09:00`).toISOString(),
    to: new Date(Date.parse(`${to}T00:00:00+09:00`) + dayMilliseconds).toISOString() }
}
