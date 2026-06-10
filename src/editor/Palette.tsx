import type { Accidental, Clef, Duration } from '../model/types'

const DURATIONS: { value: Duration; label: string }[] = [
  { value: 1, label: '𝅝' },
  { value: 2, label: '𝅗𝅥' },
  { value: 4, label: '♩' },
  { value: 8, label: '♪' },
  { value: 16, label: '𝅘𝅥𝅯' },
]

const ACCIDENTALS: { value: Accidental | ''; label: string }[] = [
  { value: '', label: 'なし' },
  { value: 'sharp', label: '♯' },
  { value: 'flat', label: '♭' },
  { value: 'natural', label: '♮' },
]

const KEYS = ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb', 'Ab']
const TIMES = ['4/4', '3/4', '2/4', '6/8']

export interface PaletteProps {
  duration: Duration
  onDuration: (d: Duration) => void
  dotted: boolean
  onDotted: (d: boolean) => void
  accidental: Accidental | ''
  onAccidental: (a: Accidental | '') => void
  clef: Clef
  onClef: (c: Clef) => void
  keySig: string
  onKeySig: (k: string) => void
  timeSig: string
  onTimeSig: (t: string) => void
  onInsertRest: () => void
}

export function Palette(p: PaletteProps) {
  return (
    <div className="palette">
      <span className="palette-group" role="group" aria-label="音価">
        {DURATIONS.map((d) => (
          <button
            key={d.value}
            className={p.duration === d.value ? 'active' : ''}
            onClick={() => p.onDuration(d.value)}
            title={`1/${d.value}`}
          >
            {d.label}
          </button>
        ))}
        <button
          className={p.dotted ? 'active' : ''}
          onClick={() => p.onDotted(!p.dotted)}
          title="付点"
        >
          付点
        </button>
      </span>
      <span className="palette-group" role="group" aria-label="臨時記号">
        {ACCIDENTALS.map((a) => (
          <button
            key={a.value}
            className={p.accidental === a.value ? 'active' : ''}
            onClick={() => p.onAccidental(a.value)}
          >
            {a.label}
          </button>
        ))}
      </span>
      <button onClick={p.onInsertRest}>休符挿入</button>
      <label>
        音部記号
        <select value={p.clef} onChange={(e) => p.onClef(e.target.value as Clef)}>
          <option value="treble">ト音記号</option>
          <option value="bass">ヘ音記号</option>
        </select>
      </label>
      <label>
        調号
        <select value={p.keySig} onChange={(e) => p.onKeySig(e.target.value)}>
          {KEYS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <label>
        拍子
        <select value={p.timeSig} onChange={(e) => p.onTimeSig(e.target.value)}>
          {TIMES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
    </div>
  )
}
