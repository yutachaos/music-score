import type { Accidental, Clef, Duration } from '../model/types'

// inline SVG note icons: Unicode music glyphs render as tofu on some systems
function NoteIcon({ duration }: { duration: Duration }) {
  const filled = duration >= 4
  const stem = duration >= 2
  const flags = duration === 8 ? 1 : duration === 16 ? 2 : 0
  return (
    <svg width="16" height="22" viewBox="0 0 16 22" aria-hidden="true">
      <ellipse
        cx="6"
        cy="17.5"
        rx="4.4"
        ry="3.1"
        transform="rotate(-20 6 17.5)"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.4"
      />
      {stem && <line x1="10.3" y1="17" x2="10.3" y2="2" stroke="currentColor" strokeWidth="1.4" />}
      {flags >= 1 && (
        <path d="M10.3 2 C 14 4.5, 15 8, 13 11.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      )}
      {flags >= 2 && (
        <path d="M10.3 6 C 14 8.5, 15 12, 13 15.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      )}
    </svg>
  )
}

const DURATIONS: { value: Duration; name: string }[] = [
  { value: 1, name: 'Whole note' },
  { value: 2, name: 'Half note' },
  { value: 4, name: 'Quarter note' },
  { value: 8, name: 'Eighth note' },
  { value: 16, name: '16th note' },
]

const ACCIDENTALS: { value: Accidental | ''; label: string }[] = [
  { value: '', label: 'None' },
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
  tieActive: boolean
  onToggleTie: () => void
}

export function Palette(p: PaletteProps) {
  return (
    <div className="palette">
      <span className="palette-group" role="group" aria-label="Duration">
        {DURATIONS.map((d) => (
          <button
            key={d.value}
            className={`note-button ${p.duration === d.value ? 'active' : ''}`}
            onClick={() => p.onDuration(d.value)}
            title={d.name}
            aria-label={d.name}
          >
            <NoteIcon duration={d.value} />
          </button>
        ))}
        <button
          className={p.dotted ? 'active' : ''}
          onClick={() => p.onDotted(!p.dotted)}
          title="Dotted"
        >
          Dot
        </button>
      </span>
      <span className="palette-group" role="group" aria-label="Accidental">
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
      <button onClick={p.onInsertRest}>Insert rest</button>
      <button
        className={p.tieActive ? 'active' : ''}
        onClick={p.onToggleTie}
        title="Tie the selected note to the next note"
      >
        Tie
      </button>
      <label>
        Clef
        <select value={p.clef} onChange={(e) => p.onClef(e.target.value as Clef)}>
          <option value="treble">Treble</option>
          <option value="bass">Bass</option>
        </select>
      </label>
      <label>
        Key
        <select value={p.keySig} onChange={(e) => p.onKeySig(e.target.value)}>
          {KEYS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <label>
        Time
        <select value={p.timeSig} onChange={(e) => p.onTimeSig(e.target.value)}>
          {TIMES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
    </div>
  )
}
