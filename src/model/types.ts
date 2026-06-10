export type Step = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'

export type Accidental = 'sharp' | 'flat' | 'natural'

export interface Pitch {
  step: Step
  octave: number
  accidental?: Accidental
}

export type Duration = 1 | 2 | 4 | 8 | 16

export interface NoteEvent {
  kind: 'note' | 'rest'
  pitch?: Pitch
  duration: Duration
  dotted?: boolean
}

export type Clef = 'treble' | 'bass'

export interface Score {
  id: string
  title: string
  clef: Clef
  keySig: string
  timeSig: string
  tempo: number
  events: NoteEvent[]
}
