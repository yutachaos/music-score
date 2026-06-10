import type { NoteEvent, Pitch, Score, Step } from './types'

export type NoteNameStyle = 'off' | 'doremi' | 'cde'

const DOREMI: Record<Step, string> = {
  C: 'ド',
  D: 'レ',
  E: 'ミ',
  F: 'ファ',
  G: 'ソ',
  A: 'ラ',
  B: 'シ',
}

const ACC_PREFIX = { sharp: '^', flat: '_', natural: '=' } as const
const ACC_LABEL = { sharp: '♯', flat: '♭', natural: '' } as const

function abcPitch(p: Pitch): string {
  const acc = p.accidental ? ACC_PREFIX[p.accidental] : ''
  const letter =
    p.octave >= 5
      ? p.step.toLowerCase() + "'".repeat(p.octave - 5)
      : p.step + ','.repeat(4 - p.octave)
  return acc + letter
}

function noteName(p: Pitch, style: NoteNameStyle): string {
  const base = style === 'doremi' ? DOREMI[p.step] : p.step
  return base + (p.accidental ? ACC_LABEL[p.accidental] : '')
}

// 16th-note units per measure, e.g. "4/4" -> 16
export function measureUnits(timeSig: string): number {
  const [num, den] = timeSig.split('/').map(Number)
  return num * (16 / den)
}

function eventToAbc(ev: NoteEvent, style: NoteNameStyle): string {
  const units = 16 / ev.duration
  if (ev.kind === 'rest') return `z${units}`
  const annotation = style === 'off' ? '' : `"^${noteName(ev.pitch!, style)}"`
  return `${annotation}${abcPitch(ev.pitch!)}${units}`
}

export interface AbcResult {
  abc: string
  // char range of each event in `abc`, parallel to score.events
  eventRanges: { start: number; end: number }[]
}

export function scoreToAbcWithRanges(
  score: Score,
  opts: { noteNames?: NoteNameStyle } = {},
): AbcResult {
  const style = opts.noteNames ?? 'off'
  const perMeasure = measureUnits(score.timeSig)
  const parts: string[] = []
  const eventPartIndex: number[] = []
  let filled = 0
  for (const ev of score.events) {
    eventPartIndex.push(parts.length)
    parts.push(eventToAbc(ev, style))
    filled += 16 / ev.duration
    if (filled >= perMeasure) {
      parts.push('|')
      filled = 0
    }
  }
  if (parts.length === 0) parts.push('x4')
  if (parts.at(-1) === '|') parts[parts.length - 1] = '|]'
  else parts.push('|]')

  const header = [
    'X:1',
    `T:${score.title}`,
    `M:${score.timeSig}`,
    'L:1/16',
    `Q:1/4=${score.tempo}`,
    `K:${score.keySig}`,
  ].join('\n')

  const partOffsets: number[] = []
  let pos = header.length + 1
  for (const part of parts) {
    partOffsets.push(pos)
    pos += part.length + 1
  }
  const eventRanges = eventPartIndex.map((pi) => ({
    start: partOffsets[pi],
    end: partOffsets[pi] + parts[pi].length,
  }))
  return { abc: `${header}\n${parts.join(' ')}`, eventRanges }
}

export function scoreToAbc(
  score: Score,
  opts: { noteNames?: NoteNameStyle } = {},
): string {
  return scoreToAbcWithRanges(score, opts).abc
}
