import type { Pitch, Step } from './types'

const STEPS: Step[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

// diatonic index: C0 = 0, +7 per octave
export function pitchToDiatonic(p: Pitch): number {
  return p.octave * 7 + STEPS.indexOf(p.step)
}

export function diatonicToPitch(d: number): Pitch {
  return { step: STEPS[((d % 7) + 7) % 7], octave: Math.floor(d / 7) }
}

// steps = diatonic steps below the treble top line (F5), one per half line-gap
export function trebleStaffPitch(steps: number): Pitch {
  return diatonicToPitch(38 - steps)
}

const STEP_SEMITONES: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const ACC_SEMITONES = { sharp: 1, flat: -1, natural: 0 } as const
const CHROMA: (Pick<Pitch, 'step' | 'accidental'>)[] = [
  { step: 'C' },
  { step: 'C', accidental: 'sharp' },
  { step: 'D' },
  { step: 'D', accidental: 'sharp' },
  { step: 'E' },
  { step: 'F' },
  { step: 'F', accidental: 'sharp' },
  { step: 'G' },
  { step: 'G', accidental: 'sharp' },
  { step: 'A' },
  { step: 'A', accidental: 'sharp' },
  { step: 'B' },
]

// sharp-spelled chromatic transpose (used for note-name display under visualTranspose)
export function transposePitch(p: Pitch, semitones: number): Pitch {
  if (semitones === 0) return p
  const abs =
    p.octave * 12 + STEP_SEMITONES[p.step] + (p.accidental ? ACC_SEMITONES[p.accidental] : 0) + semitones
  const chroma = ((abs % 12) + 12) % 12
  return { ...CHROMA[chroma], octave: Math.floor(abs / 12) }
}
