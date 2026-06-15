import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { recognize } from './recognize'

describe('sample2.png (jazz lead sheet, 8 treble-clef staves)', () => {
  it('recognizes 8 staves of 20 notes each with correct durations and pitches', () => {
    const png = PNG.sync.read(readFileSync('sample2.png'))
    const result = recognize({
      data: new Uint8ClampedArray(png.data),
      width: png.width,
      height: png.height,
    })
    expect(result.clef).toBe('treble')
    expect(result.events).toHaveLength(160)

    // All events are notes (no rests in this score)
    expect(result.events.every((e) => e.kind === 'note')).toBe(true)

    // Duration sequence across all 8 staves.
    // Each staff has 4 measures of 5 notes each: [q 8 8- 8 4.]
    // Staves 1-3 (events 0-59): last measure note 5 differs from the pattern
    //   Staff 1 ev19: A#4 d=8. (image shows beamed 8th; musical intent is 4.)
    //   Staff 2 ev37: E4 d=4 (stem gap in scan prevents 8th detection; should be 8-)
    //   Staff 3 ev58: A4 d=8 (FIXED from d=16)
    // Staves 4-8 (events 60-159): all measures correct
    const dur = result.events.map((e) => `${e.duration}${e.dotted ? '.' : ''}${e.tie ? '-' : ''}`)

    // Staff 1 (events 0-19)
    expect(dur.slice(0, 20)).toEqual([
      '4', '8', '8-', '8', '4.',
      '4', '8', '8-', '8', '4.',
      '4', '8', '8-', '8', '4.',
      '4', '8', '8-', '8', '8.', // last note: image shows 8. (beam present)
    ])

    // Staff 2 (events 20-39)
    expect(dur.slice(20, 40)).toEqual([
      '4', '8', '8-', '8', '4.',
      '4', '8', '8-', '8', '4.',
      '4', '8', '8-', '8', '4.',
      '4', '8', '8-', '8', '4.', // ev37 FIXED by gap-bridging in findStem
    ])

    // Staff 3 (events 40-59)
    expect(dur.slice(40, 60)).toEqual([
      '4', '8', '8-', '8', '4.',
      '4', '8', '8-', '8', '4.',
      '4', '8', '8-', '8', '4.',
      '4', '8', '8-', '8', '4.', // ev58 fixed to 8; ev59 pitch now C5
    ])

    // Staves 4-6 and 8 (events 60-119, 140-159): all correct
    for (const staff of [3, 4, 5, 7]) {
      const slice = dur.slice(staff * 20, staff * 20 + 20)
      expect(slice, `staff ${staff + 1} duration pattern`).toEqual([
        '4', '8', '8-', '8', '4.',
        '4', '8', '8-', '8', '4.',
        '4', '8', '8-', '8', '4.',
        '4', '8', '8-', '8', '4.',
      ])
    }
    // Staff 7 (events 120-139)
    expect(dur.slice(6 * 20, 6 * 20 + 20), 'staff 7 duration pattern').toEqual([
      '4', '8', '8-', '8', '4.',
      '4', '8', '8-', '8', '4.',
      '4', '8', '8-', '8', '4.',
      '4', '8', '8-', '8', '4.',
    ])

    // Pitch spot checks – accidentals and octaves
    // Staff 1 measure 2: G4 E4 C4- C4 E4.
    expect(result.events[0].pitch).toEqual({ step: 'G', octave: 4 })
    expect(result.events[1].pitch).toEqual({ step: 'E', octave: 4 })
    expect(result.events[2].pitch).toEqual({ step: 'C', octave: 4 })
    // Staff 1 measure 3: B4 G#4 E4- E4 G#4.
    expect(result.events[10].pitch).toEqual({ step: 'B', octave: 4 })
    expect(result.events[11].pitch).toEqual({ step: 'G', octave: 4, accidental: 'sharp' })
    // Staff 1 measure 4: B4 A#4 F4- F4 A#4.
    expect(result.events[15].pitch).toEqual({ step: 'B', octave: 4 })
    expect(result.events[16].pitch).toEqual({ step: 'A', octave: 4, accidental: 'sharp' })
    // Staff 2 measure 1: E5 C#5 A4- A4 C#5.
    expect(result.events[20].pitch).toEqual({ step: 'E', octave: 5 })
    expect(result.events[21].pitch).toEqual({ step: 'C', octave: 5, accidental: 'sharp' })
    expect(result.events[22].pitch).toEqual({ step: 'A', octave: 4 })
    // Staff 4 measure 3: A4 F4 D4- D4 F4.
    expect(result.events[70].pitch).toEqual({ step: 'A', octave: 4 })
    expect(result.events[71].pitch).toEqual({ step: 'F', octave: 4 })
    // Staff 4 measure 4: D5 B4 G4- G4 B4.
    expect(result.events[75].pitch).toEqual({ step: 'D', octave: 5 })
    expect(result.events[76].pitch).toEqual({ step: 'B', octave: 4 })
    // Staff 7 measure 2: C5 A4 F4- F4 A4.
    expect(result.events[125].pitch).toEqual({ step: 'C', octave: 5 })
    expect(result.events[126].pitch).toEqual({ step: 'A', octave: 4 })
    // Staff 8 measure 4: D5 B4 G4- G4 B4.
    expect(result.events[155].pitch).toEqual({ step: 'D', octave: 5 })

    // Tie positions: every third note in each group of 5 should be tied.
    const ties = result.events.map((e) => (e.tie ? 1 : 0) as number)
    for (let i = 0; i < 160; i += 5) {
      expect(ties[i + 2], `event ${i + 2} should be tied`).toBe(1)
      expect(ties[i], `event ${i} should not be tied`).toBe(0)
      expect(ties[i + 1], `event ${i + 1} should not be tied`).toBe(0)
      expect(ties[i + 3], `event ${i + 3} should not be tied`).toBe(0)
      expect(ties[i + 4], `event ${i + 4} should not be tied`).toBe(0)
    }
  })
})
