import { it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { recognize } from './recognize'

it('ev70-79 staff4 with boundary check', () => {
  const png = PNG.sync.read(readFileSync('sample2.png'))
  const r = recognize({ data: new Uint8ClampedArray(png.data), width: png.width, height: png.height })
  // staff4 lines: indices 15-19
  const lines = r.staffLines.slice(15, 20)
  const ef4 = lines[3] + 0.75*(lines[4]-lines[3])  // E4/F4 boundary
  console.log('staff4 lines:', lines.map(l=>l.toFixed(2)).join(' '))
  console.log(`E4/F4 boundary y=${ef4.toFixed(2)}`)
  for (const i of [70,71,72,73,74]) {
    const h = r.heads[i]
    const e = r.events[i]
    const p = e.kind === 'note' ? `${e.pitch!.step}${e.pitch!.accidental==='sharp'?'#':''}${e.pitch!.octave}` : 'rest'
    const dist = h.y - ef4
    console.log(`ev${i}: x=${h.x.toFixed(0)} y=${h.y.toFixed(2)} pitch=${p} dist_from_EF4_boundary=${dist.toFixed(2)}`)
  }
})
