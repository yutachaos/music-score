import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { recognize } from './recognize'

describe('sample3.png (treble-clef melody with half, dotted-half, and whole notes)', () => {
  it('recognizes solid and hollow notes', () => {
    const png = PNG.sync.read(readFileSync('sample3.png'))
    const result = recognize({
      data: new Uint8ClampedArray(png.data),
      width: png.width,
      height: png.height,
    })
    expect(result.clef).toBe('treble')
    expect(result.events).toHaveLength(14)
    // durational sequence: q 8 q  q 8 8  q 8 8  h  h.  8 8 w
    expect(
      result.events.map(
        (e) => `${e.duration}${e.dotted ? '.' : ''}${e.tie ? '-' : ''}`,
      ),
    ).toEqual([
      '4', '8', '4',
      '4', '8', '8',
      '4', '8', '8-',
      '2', '2.',
      '8', '8-', '1',
    ])
    // measure 4 carries the sharp from F#4 to the half note
    const note9 = result.events[9]
    expect(note9.kind).toBe('note')
    expect(note9.pitch).toEqual({ step: 'F', octave: 4, accidental: 'sharp' })
  })
})
