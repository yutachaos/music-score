import { describe, expect, it } from 'vitest'
import { diatonicToPitch, pitchToDiatonic, trebleStaffPitch } from './pitch'

describe('diatonic conversion', () => {
  it('round-trips pitches', () => {
    expect(diatonicToPitch(pitchToDiatonic({ step: 'C', octave: 4 }))).toEqual({
      step: 'C',
      octave: 4,
    })
    expect(diatonicToPitch(pitchToDiatonic({ step: 'B', octave: 3 }))).toEqual({
      step: 'B',
      octave: 3,
    })
  })
})

describe('trebleStaffPitch', () => {
  it('maps staff positions to pitches', () => {
    expect(trebleStaffPitch(0)).toEqual({ step: 'F', octave: 5 }) // top line
    expect(trebleStaffPitch(8)).toEqual({ step: 'E', octave: 4 }) // bottom line
    expect(trebleStaffPitch(10)).toEqual({ step: 'C', octave: 4 }) // 1st ledger below
    expect(trebleStaffPitch(-2)).toEqual({ step: 'A', octave: 5 }) // above staff
  })
})
