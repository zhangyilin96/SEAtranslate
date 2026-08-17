import { describe, expect, it } from 'vitest'
import { analyzePlayer } from './analysis'
import { demoMatches, demoProfile } from './demo'

describe('analyzePlayer', () => {
  it('creates explainable metrics and leaves initiation unavailable', () => {
    const result = analyzePlayer(86745912, demoProfile, demoMatches)
    expect(result.validMatchCount).toBe(36)
    expect(result.metrics).toHaveLength(6)
    expect(result.metrics.find((metric) => metric.key === 'initiation')).toMatchObject({
      score: null,
      confidence: 'unavailable',
    })
    expect(result.metrics.filter((metric) => metric.score !== null).every((metric) => metric.score! >= 0 && metric.score! <= 100)).toBe(true)
  })

  it('calculates wins from player side and match result', () => {
    const result = analyzePlayer(86745912, demoProfile, demoMatches.slice(0, 2))
    expect(result.record.wins + result.record.losses).toBe(2)
  })

  it('rejects matches too short to be meaningful', () => {
    const shortMatches = [{ ...demoMatches[0], duration: 120 }]
    expect(() => analyzePlayer(86745912, demoProfile, shortMatches)).toThrow('没有时长足够')
  })
})
