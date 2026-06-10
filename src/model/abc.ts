import type { NoteEvent, Pitch, Score, Step } from './types'
import { transposePitch } from './pitch'

export type NoteNameStyle = 'off' | 'doremi' | 'cde'

export interface AbcOptions {
  noteNames?: NoteNameStyle
  // semitones applied to displayed note names (matches abcjs visualTranspose)
  nameTranspose?: number
}

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

// 32nd-note units per measure, e.g. "4/4" -> 32
export function measureUnits(timeSig: string): number {
  const [num, den] = timeSig.split('/').map(Number)
  return num * (32 / den)
}

function eventUnits(ev: NoteEvent): number {
  return (32 / ev.duration) * (ev.dotted ? 1.5 : 1)
}

function eventToAbc(ev: NoteEvent, opts: AbcOptions): string {
  const units = eventUnits(ev)
  if (ev.kind === 'rest') return `z${units}`
  const style = opts.noteNames ?? 'off'
  const annotation =
    style === 'off'
      ? ''
      : `"^${noteName(transposePitch(ev.pitch!, opts.nameTranspose ?? 0), style)}"`
  return `${annotation}${abcPitch(ev.pitch!)}${units}`
}

export interface AbcResult {
  abc: string
  // char range of each event in `abc`, parallel to score.events
  eventRanges: { start: number; end: number }[]
}

const MEASURES_PER_LINE = 4

export function scoreToAbcWithRanges(score: Score, opts: AbcOptions = {}): AbcResult {
  const perMeasure = measureUnits(score.timeSig)
  const parts: string[] = []
  const seps: string[] = [] // separator after each part
  const eventPartIndex: number[] = []
  let filled = 0
  let measures = 0
  for (const ev of score.events) {
    eventPartIndex.push(parts.length)
    parts.push(eventToAbc(ev, opts))
    seps.push(' ')
    filled += eventUnits(ev)
    if (filled >= perMeasure) {
      measures++
      parts.push('|')
      seps.push(measures % MEASURES_PER_LINE === 0 ? '\n' : ' ')
      filled = 0
    }
  }
  if (parts.length === 0) {
    parts.push('x8')
    seps.push(' ')
  }
  if (parts.at(-1) === '|') parts[parts.length - 1] = '|]'
  else {
    parts.push('|]')
    seps.push(' ')
  }

  const header = [
    'X:1',
    `T:${score.title}`,
    `M:${score.timeSig}`,
    'L:1/32',
    `Q:1/4=${score.tempo}`,
    `K:${score.keySig}${score.clef === 'bass' ? ' clef=bass' : ''}`,
  ].join('\n')

  const partOffsets: number[] = []
  let body = ''
  for (let i = 0; i < parts.length; i++) {
    partOffsets.push(header.length + 1 + body.length)
    body += parts[i]
    if (i < parts.length - 1) body += seps[i]
  }
  const eventRanges = eventPartIndex.map((pi) => ({
    start: partOffsets[pi],
    end: partOffsets[pi] + parts[pi].length,
  }))
  return { abc: `${header}\n${body}`, eventRanges }
}

export function scoreToAbc(score: Score, opts: AbcOptions = {}): string {
  return scoreToAbcWithRanges(score, opts).abc
}
