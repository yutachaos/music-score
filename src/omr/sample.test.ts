import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { recognize } from './recognize'

describe('sample.png (bass-clef rhythm staff)', () => {
  it('detects an even staff and all 16 noteheads as C3', () => {
    const png = PNG.sync.read(readFileSync('sample.png'))
    const result = recognize(
      { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height },
      'bass',
    )
    const gaps = result.staffLines.slice(1).map((y, i) => y - result.staffLines[i])
    for (const gap of gaps) {
      expect(gap).toBeGreaterThan(result.staffSpacing - 2)
      expect(gap).toBeLessThan(result.staffSpacing + 2)
    }
    expect(result.events).toHaveLength(16)
    for (const e of result.events) {
      expect(e.pitch).toEqual({ step: 'C', octave: 3 })
    }
  })
})
