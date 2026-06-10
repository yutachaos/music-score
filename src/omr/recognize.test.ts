import { describe, expect, it } from 'vitest'
import { recognize, type BitmapLike } from './recognize'

const S = 10 // staff line spacing
const TOP = 40 // top line Y

function makeImage(width: number, height: number): BitmapLike {
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  return { data, width, height }
}

function setBlack(img: BitmapLike, x: number, y: number) {
  const i = (y * img.width + x) * 4
  img.data[i] = img.data[i + 1] = img.data[i + 2] = 0
}

function drawStaff(img: BitmapLike) {
  for (let line = 0; line < 5; line++) {
    const y = TOP + line * S
    for (let x = 10; x < img.width - 10; x++) setBlack(img, x, y)
  }
}

function drawHead(img: BitmapLike, cx: number, cy: number) {
  const rx = 0.7 * S
  const ry = 0.5 * S
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) setBlack(img, x, y)
    }
  }
}

function drawStem(img: BitmapLike, x: number, yTop: number, yBottom: number) {
  for (let y = yTop; y <= yBottom; y++) {
    setBlack(img, x, y)
    setBlack(img, x + 1, y)
  }
}

describe('recognize', () => {
  it('detects staff lines and notehead pitches', () => {
    const img = makeImage(300, 140)
    drawStaff(img)
    drawHead(img, 60, TOP + 4 * S) // bottom line -> E4
    drawHead(img, 120, TOP + 2.5 * S) // 3rd space from top -> A4
    drawHead(img, 180, TOP) // top line -> F5
    const result = recognize(img)
    expect(result.staffLines.map(Math.round)).toEqual([40, 50, 60, 70, 80])
    expect(result.events.map((e) => e.pitch)).toEqual([
      { step: 'E', octave: 4 },
      { step: 'A', octave: 4 },
      { step: 'F', octave: 5 },
    ])
    expect(result.events.every((e) => e.duration === 4)).toBe(true)
  })

  it('ignores stems', () => {
    const img = makeImage(200, 140)
    drawStaff(img)
    drawHead(img, 80, TOP + 3 * S) // G4
    drawStem(img, 87, TOP, TOP + 3 * S)
    const result = recognize(img)
    expect(result.events).toHaveLength(1)
    expect(result.events[0].pitch).toEqual({ step: 'G', octave: 4 })
  })

  it('throws when no staff is present', () => {
    const img = makeImage(100, 100)
    expect(() => recognize(img)).toThrow()
  })
})
