import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { recognize } from './recognize'

describe('sample4.png (bass-clef rhythm staff with beam bands and fingering circles)', () => {
  it('recognizes notes and in-beam 16th rests', () => {
    const png = PNG.sync.read(readFileSync('sample4.png'))
    const result = recognize({
      data: new Uint8ClampedArray(png.data),
      width: png.width,
      height: png.height,
    })
    expect(result.clef).toBe('bass')
    const notes = result.events.filter((e) => e.kind === 'note')
    expect(notes).toHaveLength(11)
    for (const e of notes) {
      expect(e.pitch).toEqual({ step: 'C', octave: 3 })
    }
    expect(
      result.events.map(
        (e) => `${e.kind === 'rest' ? 'z' : ''}${e.duration}${e.dotted ? '.' : ''}${e.tie ? '-' : ''}`,
      ),
    ).toEqual([
      '16', '8', '16', '16', '8', '16', '16', 'z16', '16', '16', 'z16', '16', '8',
    ])
  })
})
