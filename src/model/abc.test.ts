import { describe, expect, it } from 'vitest'
import { measureUnits, scoreToAbc } from './abc'
import type { Score } from './types'

function score(partial: Partial<Score>): Score {
  return {
    id: 's1',
    title: 'Test',
    keySig: 'C',
    timeSig: '4/4',
    tempo: 120,
    events: [],
    ...partial,
  }
}

function body(abc: string): string {
  return abc.split('\n').at(-1)!
}

describe('measureUnits', () => {
  it('converts time signatures to 16th units', () => {
    expect(measureUnits('4/4')).toBe(16)
    expect(measureUnits('3/4')).toBe(12)
    expect(measureUnits('6/8')).toBe(12)
  })
})

describe('scoreToAbc', () => {
  it('renders header fields', () => {
    const abc = scoreToAbc(score({ title: 'Song', keySig: 'G', timeSig: '3/4', tempo: 90 }))
    expect(abc).toContain('T:Song')
    expect(abc).toContain('M:3/4')
    expect(abc).toContain('K:G')
    expect(abc).toContain('Q:1/4=90')
  })

  it('maps durations to 16th-note multiples', () => {
    const abc = scoreToAbc(
      score({
        events: [
          { kind: 'note', pitch: { step: 'C', octave: 4 }, duration: 4 },
          { kind: 'note', pitch: { step: 'D', octave: 4 }, duration: 8 },
          { kind: 'note', pitch: { step: 'E', octave: 4 }, duration: 16 },
          { kind: 'rest', duration: 2 },
        ],
      }),
    )
    expect(body(abc)).toBe('C4 D2 E1 z8 |]')
  })

  it('inserts barlines per time signature', () => {
    const abc = scoreToAbc(
      score({
        timeSig: '2/4',
        events: [
          { kind: 'note', pitch: { step: 'C', octave: 4 }, duration: 4 },
          { kind: 'note', pitch: { step: 'D', octave: 4 }, duration: 4 },
          { kind: 'note', pitch: { step: 'E', octave: 4 }, duration: 4 },
        ],
      }),
    )
    expect(body(abc)).toBe('C4 D4 | E4 |]')
  })

  it('renders accidentals and octaves', () => {
    const abc = scoreToAbc(
      score({
        events: [
          { kind: 'note', pitch: { step: 'F', octave: 4, accidental: 'sharp' }, duration: 4 },
          { kind: 'note', pitch: { step: 'B', octave: 3, accidental: 'flat' }, duration: 4 },
          { kind: 'note', pitch: { step: 'C', octave: 5 }, duration: 4 },
          { kind: 'note', pitch: { step: 'D', octave: 6 }, duration: 4 },
        ],
      }),
    )
    expect(body(abc)).toBe("^F4 _B,4 c4 d'4 |]")
  })

  it('adds note-name annotations', () => {
    const events: Score['events'] = [
      { kind: 'note', pitch: { step: 'C', octave: 4 }, duration: 4 },
      { kind: 'note', pitch: { step: 'F', octave: 4, accidental: 'sharp' }, duration: 4 },
    ]
    expect(body(scoreToAbc(score({ events }), { noteNames: 'doremi' }))).toBe(
      '"^ド"C4 "^ファ♯"^F4 |]',
    )
    expect(body(scoreToAbc(score({ events }), { noteNames: 'cde' }))).toBe(
      '"^C"C4 "^F♯"^F4 |]',
    )
  })

  it('renders an empty score with a placeholder measure', () => {
    expect(body(scoreToAbc(score({})))).toBe('x4 |]')
  })
})
