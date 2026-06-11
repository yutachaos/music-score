import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { recognize } from './recognize'

describe('sample.png (bass-clef rhythm staff)', () => {
  it('recognizes notes, rests, dots, and the tie', () => {
    const png = PNG.sync.read(readFileSync('sample.png'))
    const result = recognize({
      data: new Uint8ClampedArray(png.data),
      width: png.width,
      height: png.height,
    })
    expect(result.clef).toBe('bass')
    const gaps = result.staffLines.slice(1).map((y, i) => y - result.staffLines[i])
    for (const gap of gaps) {
      expect(gap).toBeGreaterThan(result.staffSpacing - 2)
      expect(gap).toBeLessThan(result.staffSpacing + 2)
    }
    const notes = result.events.filter((e) => e.kind === 'note')
    expect(notes).toHaveLength(16)
    for (const e of notes) {
      expect(e.pitch).toEqual({ step: 'C', octave: 3 })
    }
    expect(
      result.events.map(
        (e) => `${e.kind === 'rest' ? 'z' : ''}${e.duration}${e.dotted ? '.' : ''}${e.tie ? '-' : ''}`,
      ),
    ).toEqual([
      '16', '16', '16', '16', 'z8.', '16-', '8', '8', 'z8', '16', '16',
      '16', '16', 'z8', 'z16', '8.', '8', 'z8', '16', '8', '16',
    ])
  })
})
