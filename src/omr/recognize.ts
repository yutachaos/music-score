import type { NoteEvent } from '../model/types'
import { staffPitch } from '../model/pitch'

export interface BitmapLike {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface OmrResult {
  events: NoteEvent[]
  heads: { x: number; y: number }[]
  staffLines: number[]
  staffSpacing: number
}

function binarize(image: BitmapLike): Uint8Array {
  const { data, width, height } = image
  const gray = new Uint8Array(width * height)
  const hist = new Array<number>(256).fill(0)
  for (let i = 0; i < width * height; i++) {
    const g = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2])
    gray[i] = g
    hist[g]++
  }
  // Otsu threshold
  const total = width * height
  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * hist[t]
  let sumB = 0
  let wB = 0
  let best = 0
  let threshold = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) ** 2
    if (between > best) {
      best = between
      threshold = t
    }
  }
  const bin = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) bin[i] = gray[i] <= threshold ? 1 : 0
  return bin
}

interface StaffInfo {
  lines: number[] // center Y of the 5 lines, top to bottom
  spacing: number
  thickness: number
}

function findStaff(bin: Uint8Array, width: number, height: number): StaffInfo {
  const proj = new Array<number>(height).fill(0)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) proj[y] += bin[y * width + x]
  }
  const max = Math.max(...proj)
  const isLine = proj.map((v) => v > max * 0.5)
  const groups: { center: number; size: number }[] = []
  let start = -1
  for (let y = 0; y <= height; y++) {
    if (y < height && isLine[y]) {
      if (start < 0) start = y
    } else if (start >= 0) {
      groups.push({ center: (start + y - 1) / 2, size: y - start })
      start = -1
    }
  }
  if (groups.length < 5) throw new Error('Could not detect staff lines')
  const lines = groups.slice(0, 5).map((g) => g.center)
  const spacing = (lines[4] - lines[0]) / 4
  const thickness = groups.slice(0, 5).reduce((a, g) => a + g.size, 0) / 5
  return { lines, spacing, thickness }
}

function removeStaffLines(bin: Uint8Array, width: number, height: number, staff: StaffInfo) {
  const maxRun = Math.ceil(staff.thickness * 2)
  for (const line of staff.lines) {
    const yc = Math.round(line)
    for (let x = 0; x < width; x++) {
      if (!bin[yc * width + x]) continue
      let top = yc
      while (top > 0 && bin[(top - 1) * width + x]) top--
      let bottom = yc
      while (bottom < height - 1 && bin[(bottom + 1) * width + x]) bottom++
      if (bottom - top + 1 <= maxRun) {
        for (let y = top; y <= bottom; y++) bin[y * width + x] = 0
      }
    }
  }
}

// keep only pixels whose horizontal/vertical black runs look notehead-sized,
// which strips stems, barlines, and beams
function filterHeadPixels(bin: Uint8Array, width: number, height: number, s: number): Uint8Array {
  const minRun = 0.6 * s
  const maxH = 2.5 * s
  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!bin[y * width + x]) continue
      let l = x
      while (l > 0 && bin[y * width + l - 1]) l--
      let r = x
      while (r < width - 1 && bin[y * width + r + 1]) r++
      const hr = r - l + 1
      if (hr < minRun || hr > maxH) continue
      let t = y
      while (t > 0 && bin[(t - 1) * width + x]) t--
      let b = y
      while (b < height - 1 && bin[(b + 1) * width + x]) b++
      const vr = b - t + 1
      if (vr < minRun || vr > maxH) continue
      out[y * width + x] = 1
    }
  }
  return out
}

function findHeads(filtered: Uint8Array, width: number, height: number, s: number) {
  const visited = new Uint8Array(width * height)
  const heads: { x: number; y: number }[] = []
  for (let i = 0; i < width * height; i++) {
    if (!filtered[i] || visited[i]) continue
    const stack = [i]
    visited[i] = 1
    let area = 0
    let sumX = 0
    let sumY = 0
    let minX = width
    let maxX = 0
    let minY = height
    let maxY = 0
    while (stack.length > 0) {
      const p = stack.pop()!
      const x = p % width
      const y = (p / width) | 0
      area++
      sumX += x
      sumY += y
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
      for (const q of [p - 1, p + 1, p - width, p + width]) {
        if (q < 0 || q >= width * height || visited[q] || !filtered[q]) continue
        if ((q === p - 1 || q === p + 1) && ((q / width) | 0) !== y) continue
        visited[q] = 1
        stack.push(q)
      }
    }
    const w = maxX - minX + 1
    const h = maxY - minY + 1
    if (area >= 0.3 * s * s && w >= 0.5 * s && w <= 2 * s && h >= 0.5 * s && h <= 2 * s) {
      heads.push({ x: sumX / area, y: sumY / area })
    }
  }
  return heads.sort((a, b) => a.x - b.x)
}

export function recognize(image: BitmapLike): OmrResult {
  const { width, height } = image
  const bin = binarize(image)
  const staff = findStaff(bin, width, height)
  removeStaffLines(bin, width, height, staff)
  const filtered = filterHeadPixels(bin, width, height, staff.spacing)
  const heads = findHeads(filtered, width, height, staff.spacing)
  const events: NoteEvent[] = heads.map((h) => {
    const steps = Math.round((h.y - staff.lines[0]) / (staff.spacing / 2))
    return { kind: 'note', pitch: staffPitch(steps), duration: 4 }
  })
  return { events, heads, staffLines: staff.lines, staffSpacing: staff.spacing }
}
