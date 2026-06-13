import { describe, expect, it } from 'vitest'
import { newScore } from './store'

describe('newScore', () => {
  it('prefills 4 placeholder whole-rest measures as input guide', () => {
    const s = newScore()
    expect(s.events).toHaveLength(4)
    for (const e of s.events) {
      expect(e.kind).toBe('rest')
      expect(e.duration).toBe(1)
      expect(e.placeholder).toBe(true)
    }
  })

  it('returns independent event objects each call', () => {
    const a = newScore()
    const b = newScore()
    delete a.events[0].placeholder
    expect(b.events[0].placeholder).toBe(true)
  })
})
