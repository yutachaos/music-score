import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { recognize } from './recognize'

describe('sample6.png (treble+bass arpeggios in F key, natural and flat accidentals)', () => {
  it('recognizes key signature, natural signs, and chord arpeggios', () => {
    const png = PNG.sync.read(readFileSync('sample6.png'))
    const result = recognize({
      data: new Uint8ClampedArray(png.data),
      width: png.width,
      height: png.height,
    })
    expect(result.clef).toBe('treble')
    expect(result.events).toHaveLength(40)

    // all notes, all quarter or whole, no dots or ties
    expect(result.events.map((e) => `${e.duration}`)).toEqual([
      '4', '4', '4', '4', '1',
      '4', '4', '4', '4', '1',
      '4', '4', '4', '4', '1',
      '4', '4', '4', '4', '1',
      '4', '4', '4', '4', '1',
      '4', '4', '4', '4', '1',
      '4', '4', '4', '4', '1',
      '4', '4', '4', '4', '1',
    ])

    // treble staff 1: FΔ7 (F A C E F5), G7 (G B♮ D F G5)
    expect(result.events[0].pitch).toEqual({ step: 'F', octave: 4 })
    expect(result.events[4].pitch).toEqual({ step: 'F', octave: 5 })
    expect(result.events[5].pitch).toEqual({ step: 'G', octave: 4 })
    expect(result.events[6].pitch).toEqual({ step: 'B', octave: 4, accidental: 'natural' })
    expect(result.events[9].pitch).toEqual({ step: 'G', octave: 5 })

    // treble staff 2: Gm7 (G Bb D F), C7 whole C5, FΔ7 (F A C E), Gb7 whole Gb5
    expect(result.events[10].pitch).toEqual({ step: 'G', octave: 4 })
    expect(result.events[11].pitch).toEqual({ step: 'B', octave: 4, accidental: 'flat' })
    expect(result.events[14].pitch).toEqual({ step: 'C', octave: 5 })
    expect(result.events[19].pitch).toEqual({ step: 'G', octave: 5, accidental: 'flat' })

    // bass staff 1: FΔ7 (F A C E F4), G7 (G B♮ D F G4)
    expect(result.events[20].pitch).toEqual({ step: 'F', octave: 3 })
    expect(result.events[24].pitch).toEqual({ step: 'F', octave: 4 })
    expect(result.events[25].pitch).toEqual({ step: 'G', octave: 3 })
    expect(result.events[26].pitch).toEqual({ step: 'B', octave: 3, accidental: 'natural' })
    expect(result.events[29].pitch).toEqual({ step: 'G', octave: 4 })

    // bass staff 2: Gm7 (G Bb D F), C7 whole C4, FΔ7 (F A C E), Gb7 whole Gb4
    expect(result.events[30].pitch).toEqual({ step: 'G', octave: 3 })
    expect(result.events[31].pitch).toEqual({ step: 'B', octave: 3, accidental: 'flat' })
    expect(result.events[34].pitch).toEqual({ step: 'C', octave: 4 })
    expect(result.events[39].pitch).toEqual({ step: 'G', octave: 4, accidental: 'flat' })
  })
})
