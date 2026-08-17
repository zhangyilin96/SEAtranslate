const STEAM64_OFFSET = 76561197960265728n
const MAX_ACCOUNT_ID = 4294967295n

export function normalizeAccountId(input: string): number {
  const trimmed = input.trim()
  const profileMatch = trimmed.match(/steamcommunity\.com\/profiles\/(\d{17})/i)
  const numeric = profileMatch?.[1] ?? trimmed

  if (!/^\d+$/.test(numeric)) {
    if (/steamcommunity\.com\/id\//i.test(trimmed)) {
      throw new Error('暂不支持 Steam 自定义链接，请输入 Dota 好友 ID 或 17 位 Steam ID。')
    }
    throw new Error('请输入纯数字的 Dota 好友 ID、17 位 Steam ID，或 Steam profiles 链接。')
  }

  const value = BigInt(numeric)
  const accountId = value >= STEAM64_OFFSET ? value - STEAM64_OFFSET : value

  if (accountId <= 0n || accountId > MAX_ACCOUNT_ID) {
    throw new Error('这个 ID 不在有效范围内，请检查后重试。')
  }

  return Number(accountId)
}
