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
