import { describe, expect, it } from 'vitest'
import { measureUnits, scoreToAbc } from './abc'
import type { Score } from './types'

function score(partial: Partial<Score>): Score {
  return {
    id: 's1',
    title: 'Test',
    clef: 'treble',
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
  it('converts time signatures to 32nd units', () => {
    expect(measureUnits('4/4')).toBe(32)
    expect(measureUnits('3/4')).toBe(24)
    expect(measureUnits('6/8')).toBe(24)
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
    expect(body(abc)).toBe('C8 D4E2 z16 |]')
  })

  it('beams flagged notes within a beat', () => {
    const eighth = (step: 'C' | 'D' | 'E' | 'F') =>
      ({ kind: 'note', pitch: { step, octave: 4 }, duration: 8 }) as const
    const abc = scoreToAbc(score({ events: [eighth('C'), eighth('D'), eighth('E'), eighth('F')] }))
    expect(body(abc)).toBe('C4D4 E4F4 |]')
  })

  it('does not beam across rests or quarter notes', () => {
    const abc = scoreToAbc(
      score({
        events: [
          { kind: 'note', pitch: { step: 'C', octave: 4 }, duration: 8 },
          { kind: 'rest', duration: 8 },
          { kind: 'note', pitch: { step: 'D', octave: 4 }, duration: 8 },
          { kind: 'note', pitch: { step: 'E', octave: 4 }, duration: 4 },
        ],
      }),
    )
    expect(body(abc)).toBe('C4 z4 D4 E8 |]')
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
    expect(body(abc)).toBe('C8 D8 | E8 |]')
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
    expect(body(abc)).toBe("^F8 _B,8 c8 d'8 |]")
  })

  it('adds note-name annotations', () => {
    const events: Score['events'] = [
      { kind: 'note', pitch: { step: 'C', octave: 4 }, duration: 4 },
      { kind: 'note', pitch: { step: 'F', octave: 4, accidental: 'sharp' }, duration: 4 },
    ]
    expect(body(scoreToAbc(score({ events }), { noteNames: 'doremi' }))).toBe(
      '"^Do"C8 "^Fa♯"^F8 |]',
    )
    expect(body(scoreToAbc(score({ events }), { noteNames: 'cde' }))).toBe(
      '"^C"C8 "^F♯"^F8 |]',
    )
  })

  it('renders an empty score with a placeholder measure', () => {
    expect(body(scoreToAbc(score({})))).toBe('x8 |]')
  })

  it('renders dotted durations', () => {
    const abc = scoreToAbc(
      score({
        events: [
          { kind: 'note', pitch: { step: 'C', octave: 4 }, duration: 4, dotted: true },
          { kind: 'note', pitch: { step: 'D', octave: 4 }, duration: 8 },
          { kind: 'rest', duration: 16, dotted: true },
        ],
      }),
    )
    expect(body(abc)).toBe('C12 D4 z3 |]')
  })

  it('breaks the line every 4 measures', () => {
    const whole = { kind: 'note', pitch: { step: 'C', octave: 4 }, duration: 1 } as const
    const abc = scoreToAbc(score({ events: Array(5).fill(whole) }))
    expect(abc).toContain('C32 | C32 | C32 | C32 |\nC32 |]')
  })

  it('renders bass clef in the key line', () => {
    expect(scoreToAbc(score({ clef: 'bass' }))).toContain('K:C clef=bass')
    expect(scoreToAbc(score({}))).toContain('K:C\n')
  })

  it('renders explicit ties', () => {
    const abc = scoreToAbc(
      score({
        events: [
          { kind: 'note', pitch: { step: 'C', octave: 4 }, duration: 4, tie: true },
          { kind: 'note', pitch: { step: 'C', octave: 4 }, duration: 4 },
        ],
      }),
    )
    expect(body(abc)).toBe('C8- C8 |]')
  })

  it('splits notes across barlines with ties', () => {
    const abc = scoreToAbc(
      score({
        timeSig: '2/4',
        events: [
          { kind: 'note', pitch: { step: 'C', octave: 4 }, duration: 4 },
          { kind: 'note', pitch: { step: 'D', octave: 4 }, duration: 2 },
          { kind: 'rest', duration: 4 },
        ],
      }),
    )
    expect(body(abc)).toBe('C8 D8- | D8 z8 |]')
  })
})
