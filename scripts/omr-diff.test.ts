// Local-only tool: compares recognize() output against homr's MusicXML for the
// same sample images, to spot disagreements worth a manual look. Never fails —
// homr is a second opinion, not ground truth.
//
// Usage: uv tool install homr && homr sampleN.png  (writes sampleN.musicxml)
//        npx vitest run scripts/omr-diff.test.ts
// Skips when no .musicxml files exist (e.g. in CI).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { PNG } from 'pngjs'
import { recognize } from '../src/omr/recognize'

const samples = ['sample.png', 'sample2.png', 'sample3.png', 'sample4.png', 'sample5.png']
const pairs = samples
  .map((png) => ({ png, xml: png.replace(/\.png$/, '.musicxml') }))
  .filter(({ png, xml }) => existsSync(png) && existsSync(xml))

const typeMap: Record<string, number> = { whole: 1, half: 2, quarter: 4, eighth: 8, '16th': 16 }

function tokensFromMusicXml(xml: string): string[] {
  const tokens: string[] = []
  for (const [body] of xml.matchAll(/<note[\s>][^]*?<\/note>/g)) {
    if (/<grace[\s/>]/.test(body) || /<chord[\s/>]/.test(body)) continue
    const rest = /<rest[\s/>]/.test(body)
    const type = /<type[^>]*>([^<]+)<\/type>/.exec(body)?.[1]
    const dur = type ? (typeMap[type] ?? `?${type}`) : '?'
    const dotted = /<dot[\s/>]/.test(body) ? '.' : ''
    const tie = /<tie[^>]*type="start"/.test(body) ? '-' : ''
    if (rest) {
      tokens.push(`z${dur}${dotted}`)
    } else {
      const step = /<step>([A-G])<\/step>/.exec(body)?.[1] ?? '?'
      const octave = /<octave>(-?\d+)<\/octave>/.exec(body)?.[1] ?? '?'
      const alter = /<alter>(-?\d+)<\/alter>/.exec(body)?.[1]
      const acc = alter === '1' ? '#' : alter === '-1' ? 'b' : ''
      tokens.push(`${step}${acc}${octave}:${dur}${dotted}${tie}`)
    }
  }
  return tokens
}

function tokensFromRecognize(png: string): string[] {
  const img = PNG.sync.read(readFileSync(png))
  const r = recognize({ data: new Uint8ClampedArray(img.data), width: img.width, height: img.height })
  return r.events.map((e) => {
    const dur = `${e.duration}${e.dotted ? '.' : ''}`
    if (e.kind === 'rest') return `z${dur}`
    const p = e.pitch!
    const acc = p.accidental === 'sharp' ? '#' : p.accidental === 'flat' ? 'b' : ''
    return `${p.step}${acc}${p.octave}:${dur}${e.tie ? '-' : ''}`
  })
}

// token-level LCS diff
function diff(a: string[], b: string[]): string[] {
  const n = a.length
  const m = b.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const out: string[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push(`  [${i}] ${a[i]}`)
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push(`- [${i}] ${a[i]}`)
      i++
    } else {
      out.push(`+     ${b[j]}`)
      j++
    }
  }
  while (i < n) out.push(`- [${i}] ${a[i++]}`)
  while (j < m) out.push(`+     ${b[j++]}`)
  return out
}

it.skipIf(pairs.length === 0)('diff recognize() against homr MusicXML', () => {
  const report: string[] = []
  for (const { png, xml } of pairs) {
    let ours: string[]
    try {
      ours = tokensFromRecognize(png)
    } catch (e) {
      report.push(`\n=== ${png}: recognize() FAILED: ${e instanceof Error ? e.message : e}`)
      continue
    }
    const theirs = tokensFromMusicXml(readFileSync(xml, 'utf8'))
    const same = ours.length === theirs.length && ours.every((t, k) => t === theirs[k])
    report.push(`\n=== ${png}: ours=${ours.length} homr=${theirs.length} ${same ? 'MATCH' : 'DIFF'}`)
    if (!same) report.push(['(- ours / + homr)', ...diff(ours, theirs)].join('\n'))
  }
  // vitest hides console output of passing tests, so also write a file
  writeFileSync('omr-diff.report.txt', report.join('\n'))
  console.log(report.join('\n'))
})
