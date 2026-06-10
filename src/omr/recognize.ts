import type { Clef, NoteEvent } from '../model/types'
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
  lines: number[] // center Y of the 5 lines at x = 0, top to bottom
  spacing: number
  thickness: number
  slope: number // dy/dx of the staff lines (small skew from photos/scans)
}

function projection(bin: Uint8Array, width: number, height: number, slope: number): Float64Array {
  const proj = new Float64Array(height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!bin[y * width + x]) continue
      const row = Math.round(y - slope * x)
      if (row >= 0 && row < height) proj[row]++
    }
  }
  return proj
}

function findStaff(bin: Uint8Array, width: number, height: number): StaffInfo {
  // estimate skew: the slope that makes the projection sharpest
  let slope = 0
  let proj = projection(bin, width, height, 0)
  let bestSharpness = -1
  for (let s = -0.02; s <= 0.0201; s += 0.0025) {
    const p = projection(bin, width, height, s)
    let sharpness = 0
    for (let i = 0; i < height; i++) sharpness += p[i] * p[i]
    if (sharpness > bestSharpness) {
      bestSharpness = sharpness
      slope = s
      proj = p
    }
  }

  // comb search: 5 evenly spaced rows maximizing summed projection
  const max = Math.max(...proj)
  const rowAt = (y: number) => {
    const r = Math.round(y)
    return Math.max(proj[r - 1] ?? 0, proj[r] ?? 0, proj[r + 1] ?? 0)
  }
  let best = { score: -1, y0: 0, spacing: 0 }
  for (let spacing = 5; spacing <= height / 5; spacing += 0.25) {
    for (let y0 = 0; y0 + 4 * spacing < height; y0++) {
      if (proj[y0] < max * 0.3) continue
      let score = 0
      for (let k = 0; k < 5; k++) score += rowAt(y0 + k * spacing)
      if (score > best.score) best = { score, y0, spacing }
    }
  }
  if (best.score < width * 2.5) throw new Error('Could not detect staff lines')

  // refine each line: peak row near the expected position, then a tight centroid
  // around the peak so nearby noteheads do not bias the center
  const lines: number[] = []
  for (let k = 0; k < 5; k++) {
    const guess = best.y0 + k * best.spacing
    const r = Math.max(1, Math.round(best.spacing / 3))
    const center = Math.round(guess)
    let peak = center
    for (let y = center - r; y <= center + r; y++) {
      if ((proj[y] ?? 0) > (proj[peak] ?? 0)) peak = y
    }
    let weight = 0
    let sum = 0
    for (let y = peak - 2; y <= peak + 2; y++) {
      const v = proj[y] ?? 0
      if (v < proj[peak] * 0.5) continue
      weight += v
      sum += v * y
    }
    lines.push(weight > 0 ? sum / weight : guess)
  }
  const spacing = (lines[4] - lines[0]) / 4

  let thickRows = 0
  for (let y = 0; y < height; y++) if (proj[y] > max * 0.5) thickRows++
  const thickness = Math.max(1, thickRows / 5)

  return { lines, spacing, thickness, slope }
}

function removeStaffLines(bin: Uint8Array, width: number, height: number, staff: StaffInfo) {
  const maxRun = Math.ceil(staff.thickness * 2)
  const search = Math.ceil(staff.thickness) + 1
  for (const line of staff.lines) {
    for (let x = 0; x < width; x++) {
      const guess = Math.round(line + staff.slope * x)
      // the rounded position may be off by a pixel or two; find the actual line pixel
      let yc = -1
      for (let d = 0; d <= search; d++) {
        for (const y of [guess + d, guess - d]) {
          if (y >= 0 && y < height && bin[y * width + x]) {
            yc = y
            break
          }
        }
        if (yc >= 0) break
      }
      if (yc < 0) continue
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

export function recognize(image: BitmapLike, clef: Clef = 'treble'): OmrResult {
  const { width, height } = image
  const bin = binarize(image)
  const staff = findStaff(bin, width, height)
  removeStaffLines(bin, width, height, staff)
  const filtered = filterHeadPixels(bin, width, height, staff.spacing)
  const heads = findHeads(filtered, width, height, staff.spacing)
  const events: NoteEvent[] = heads.map((h) => {
    // interpolate between the two nearest detected lines (skew-corrected space)
    const y = h.y - staff.slope * h.x
    const { lines } = staff
    let idx: number
    if (y <= lines[0]) idx = (y - lines[0]) / staff.spacing
    else if (y >= lines[4]) idx = 4 + (y - lines[4]) / staff.spacing
    else {
      let k = 0
      while (y > lines[k + 1]) k++
      idx = k + (y - lines[k]) / (lines[k + 1] - lines[k])
    }
    const steps = Math.round(idx * 2)
    return { kind: 'note', pitch: staffPitch(steps, clef), duration: 4 }
  })
  return { events, heads, staffLines: staff.lines, staffSpacing: staff.spacing }
}
