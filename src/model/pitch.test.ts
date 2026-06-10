import { describe, expect, it } from 'vitest'
import { diatonicToPitch, pitchToDiatonic, transposePitch, staffPitch } from './pitch'

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

describe('transposePitch', () => {
  it('transposes chromatically with sharp spelling', () => {
    expect(transposePitch({ step: 'C', octave: 4 }, 2)).toEqual({ step: 'D', octave: 4 })
    expect(transposePitch({ step: 'C', octave: 4 }, 1)).toEqual({
      step: 'C',
      octave: 4,
      accidental: 'sharp',
    })
    expect(transposePitch({ step: 'B', octave: 4 }, 1)).toEqual({ step: 'C', octave: 5 })
    expect(transposePitch({ step: 'C', octave: 4 }, -1)).toEqual({ step: 'B', octave: 3 })
  })

  it('preserves spelling at zero', () => {
    expect(transposePitch({ step: 'B', octave: 4, accidental: 'flat' }, 0)).toEqual({
      step: 'B',
      octave: 4,
      accidental: 'flat',
    })
  })
})

describe('staffPitch', () => {
  it('maps staff positions to pitches', () => {
    expect(staffPitch(0)).toEqual({ step: 'F', octave: 5 }) // top line
    expect(staffPitch(8)).toEqual({ step: 'E', octave: 4 }) // bottom line
    expect(staffPitch(10)).toEqual({ step: 'C', octave: 4 }) // 1st ledger below
    expect(staffPitch(-2)).toEqual({ step: 'A', octave: 5 }) // above staff
  })

  it('maps bass clef positions', () => {
    expect(staffPitch(0, 'bass')).toEqual({ step: 'A', octave: 3 }) // top line
    expect(staffPitch(8, 'bass')).toEqual({ step: 'G', octave: 2 }) // bottom line
    expect(staffPitch(-2, 'bass')).toEqual({ step: 'C', octave: 4 }) // middle C above
  })
})
