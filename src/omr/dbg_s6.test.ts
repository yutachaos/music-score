import { it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { recognize } from './recognize'

it('dump sample6', () => {
  const png = PNG.sync.read(readFileSync('sample6.png'))
  const r = recognize({ data: new Uint8ClampedArray(png.data), width: png.width, height: png.height })
  const out = [`staves=${r.staffLines.length / 5} clef=${r.clef} events=${r.events.length} spacing=${r.staffSpacing.toFixed(2)}`]
  for (let i = 0; i < r.events.length; i++) {
    const e = r.events[i]
    const p = e.kind === 'note' ? e.pitch! : null
    out.push(`${i} ${e.kind} ${p ? p.step + (p.accidental ? (p.accidental === 'sharp' ? '#' : 'b') : '') + p.octave : ''} d=${e.duration}${e.dotted ? '.' : ''}${e.tie ? ' tie' : ''} x=${r.heads[i].x.toFixed(0)} y=${r.heads[i].y.toFixed(0)}`)
  }
  writeFileSync('/tmp/sample6_result.txt', out.join('\n'))
  console.log(out.join('\n'))
})

