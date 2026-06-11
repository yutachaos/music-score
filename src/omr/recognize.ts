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

interface Head {
  x: number
  y: number
  minX: number
  maxX: number
  minY: number
  maxY: number
}

function findHeads(filtered: Uint8Array, width: number, height: number, s: number): Head[] {
  const visited = new Uint8Array(width * height)
  const heads: Head[] = []
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
      heads.push({ x: sumX / area, y: sumY / area, minX, maxX, minY, maxY })
    }
  }
  return heads.sort((a, b) => a.x - b.x)
}

// longest vertical black run in a column that overlaps the head's rows
function runThroughHead(bin: Uint8Array, width: number, height: number, x: number, head: Head) {
  let yc = -1
  for (let y = head.minY; y <= head.maxY; y++) {
    if (bin[y * width + x]) {
      yc = y
      break
    }
  }
  if (yc < 0) return null
  let top = yc
  while (top > 0 && bin[(top - 1) * width + x]) top--
  let bottom = yc
  while (bottom < height - 1 && bin[(bottom + 1) * width + x]) bottom++
  return { top, bottom, length: bottom - top + 1 }
}

// stem: a tall vertical run adjacent to the head
function findStem(bin: Uint8Array, width: number, height: number, s: number, head: Head) {
  let stem: { x: number; tip: number } | null = null
  let longest = 2.2 * s
  const x0 = Math.max(0, head.minX - 2)
  const x1 = Math.min(width - 1, head.maxX + 2)
  for (let x = x0; x <= x1; x++) {
    const run = runThroughHead(bin, width, height, x, head)
    if (!run || run.length <= longest) continue
    longest = run.length
    const tip = head.y - run.top > run.bottom - head.y ? run.top : run.bottom
    stem = { x, tip }
  }
  return stem
}

// beams/flags: thick horizontal bands crossing columns beside the stem tip
function countBeams(
  bin: Uint8Array,
  width: number,
  height: number,
  s: number,
  head: Head,
  stem: { x: number; tip: number },
): number {
  const dir = stem.tip < head.y ? 1 : -1 // scan from tip toward the head
  const scanLen = Math.min(2.5 * s, Math.abs(head.y - stem.tip) - 0.8 * s)
  let beams = 0
  for (const dx of [-0.7 * s, 0.7 * s]) {
    const x = Math.round(stem.x + dx)
    if (x < 0 || x >= width) continue
    let count = 0
    let runLen = 0
    for (let i = 0; i <= scanLen; i++) {
      const y = stem.tip + dir * i
      if (y < 0 || y >= height) break
      if (bin[y * width + x]) runLen++
      else {
        // flags cross near-vertically, so allow taller runs than a beam
        if (runLen >= 0.15 * s && runLen <= 1.3 * s) count++
        runLen = 0
      }
    }
    if (runLen >= 0.15 * s && runLen <= 1.3 * s) count++
    beams = Math.max(beams, count)
  }
  return beams
}

// augmentation dot: a small isolated blob right of the head
function hasDot(bin: Uint8Array, width: number, height: number, s: number, head: Head): boolean {
  let dotted = false
  const dx0 = Math.min(width - 1, head.maxX + Math.round(0.2 * s))
  const dx1 = Math.min(width - 1, head.maxX + Math.round(1.1 * s))
  const dy0 = Math.max(0, Math.round(head.y - 0.8 * s))
  const dy1 = Math.min(height - 1, Math.round(head.y + 0.8 * s))
  const seen = new Set<number>()
  for (let y = dy0; y <= dy1 && !dotted; y++) {
    for (let x = dx0; x <= dx1 && !dotted; x++) {
      const start = y * width + x
      if (!bin[start] || seen.has(start)) continue
      const stack = [start]
      seen.add(start)
      let area = 0
      let minX = width
      let maxX = 0
      let minY = height
      let maxY = 0
      let escapes = false
      while (stack.length > 0) {
        const p = stack.pop()!
        const px = p % width
        const py = (p / width) | 0
        if (px < dx0 || px > dx1 || py < dy0 || py > dy1) {
          escapes = true
          continue
        }
        area++
        minX = Math.min(minX, px)
        maxX = Math.max(maxX, px)
        minY = Math.min(minY, py)
        maxY = Math.max(maxY, py)
        for (const q of [p - 1, p + 1, p - width, p + width]) {
          if (q < 0 || q >= width * height || seen.has(q) || !bin[q]) continue
          seen.add(q)
          stack.push(q)
        }
      }
      const w = maxX - minX + 1
      const h = maxY - minY + 1
      if (!escapes && area >= 0.04 * s * s && w <= 0.7 * s && h <= 0.7 * s) dotted = true
    }
  }
  return dotted
}

interface Hole {
  area: number
  sumX: number
  sumY: number
  minX: number
  maxX: number
  minY: number
  maxY: number
}

// hollow heads (half/whole notes): white holes enclosed by black. Run on the
// image BEFORE staff-line removal (removal eats the thin ring strokes); a staff
// line crossing the head splits the hole in two, so nearby holes are merged.
function findHollowHeads(bin: Uint8Array, width: number, height: number, s: number): Head[] {
  const visited = new Uint8Array(width * height)
  const holes: Hole[] = []
  const maxArea = 3 * s * s
  for (let i = 0; i < width * height; i++) {
    if (bin[i] || visited[i]) continue
    const stack = [i]
    visited[i] = 1
    let area = 0
    let sumX = 0
    let sumY = 0
    let minX = width
    let maxX = 0
    let minY = height
    let maxY = 0
    let open = false
    while (stack.length > 0) {
      const p = stack.pop()!
      const x = p % width
      const y = (p / width) | 0
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) open = true
      area++
      sumX += x
      sumY += y
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
      if (area > maxArea) open = true
      for (const q of [p - 1, p + 1, p - width, p + width]) {
        if (q < 0 || q >= width * height || visited[q] || bin[q]) continue
        if ((q === p - 1 || q === p + 1) && ((q / width) | 0) !== y) continue
        visited[q] = 1
        stack.push(q)
      }
    }
    if (open) continue
    const w = maxX - minX + 1
    const h = maxY - minY + 1
    if (area >= 0.05 * s * s && w >= 0.4 * s && w <= 1.6 * s && h >= 0.15 * s && h <= 1.1 * s) {
      holes.push({ area, sumX, sumY, minX, maxX, minY, maxY })
    }
  }

  // merge hole halves split by a staff line
  for (let i = 0; i < holes.length; i++) {
    for (let j = i + 1; j < holes.length; j++) {
      const a = holes[i]
      const b = holes[j]
      const dxCenter = Math.abs(a.sumX / a.area - b.sumX / b.area)
      const gap = Math.max(a.minY, b.minY) - Math.min(a.maxY, b.maxY)
      if (dxCenter < 0.5 * s && gap >= 0 && gap <= 0.3 * s) {
        holes[i] = {
          area: a.area + b.area,
          sumX: a.sumX + b.sumX,
          sumY: a.sumY + b.sumY,
          minX: Math.min(a.minX, b.minX),
          maxX: Math.max(a.maxX, b.maxX),
          minY: Math.min(a.minY, b.minY),
          maxY: Math.max(a.maxY, b.maxY),
        }
        holes.splice(j, 1)
        j = i // recheck against the merged hole
      }
    }
  }

  const heads: Head[] = []
  const pad = Math.round(0.25 * s)
  for (const hole of holes) {
    const w = hole.maxX - hole.minX + 1
    const h = hole.maxY - hole.minY + 1
    // notehead holes are wide and flat; pockets between key-signature flats,
    // digit holes, and clef curls are smaller or taller
    if (hole.area < 0.3 * s * s || w < 0.7 * s || h < 0.35 * s || h > 0.75 * s || w < h) continue
    // elliptical hole: rectangular white cells between stems/beams/lines fill their bbox
    const fill = hole.area / (w * h)
    if (fill > 0.88) continue
    // thin ring: walk outward from the hole on 8 rays; thick glyph bodies (clef etc.) fail
    const cx = hole.sumX / hole.area
    const cy = hole.sumY / hole.area
    const thin: boolean[] = []
    for (let a = 0; a < 8; a++) {
      const dx = Math.cos((a * Math.PI) / 4)
      const dy = Math.sin((a * Math.PI) / 4)
      let run = 0
      let started = false
      for (let t = 0; t < 2.5 * s; t++) {
        const x = Math.round(cx + dx * t)
        const y = Math.round(cy + dy * t)
        if (x < 0 || x >= width || y < 0 || y >= height) break
        if (bin[y * width + x]) {
          started = true
          run++
        } else if (started) break
      }
      thin.push(started && run <= 0.45 * s)
    }
    // horizontal rays must be thin: pockets between beamed noteheads are
    // bounded left/right by solid heads, a real ring is thin all around
    if (!thin[0] || !thin[4]) continue
    if (thin.filter(Boolean).length < 7) continue
    heads.push({
      x: cx,
      y: cy,
      minX: Math.max(0, hole.minX - pad),
      maxX: Math.min(width - 1, hole.maxX + pad),
      minY: Math.max(0, hole.minY - pad),
      maxY: Math.min(height - 1, hole.maxY + pad),
    })
  }
  return heads
}

// total area of black components touching the head's box, capped. A hollow head
// is thin arcs plus maybe a stem; clef glyphs connected to a candidate hole are
// far bigger.
function blobAreaAround(
  bin: Uint8Array,
  width: number,
  height: number,
  head: Head,
  cap: number,
): number {
  const visited = new Set<number>()
  let total = 0
  for (let y = head.minY; y <= head.maxY; y++) {
    for (let x = head.minX; x <= head.maxX; x++) {
      const start = y * width + x
      if (!bin[start] || visited.has(start)) continue
      const stack = [start]
      visited.add(start)
      while (stack.length > 0) {
        const p = stack.pop()!
        total++
        if (total > cap) return total
        for (const q of [p - 1, p + 1, p - width, p + width]) {
          if (q < 0 || q >= width * height || visited.has(q) || !bin[q]) continue
          stack.push(q)
          visited.add(q)
        }
      }
    }
  }
  return total
}

// rests: isolated glyphs in the middle band of the staff that belong to no note.
// Classified by size; rectangle rests by which line they touch.
function findRests(
  bin: Uint8Array,
  width: number,
  height: number,
  staff: StaffInfo,
  heads: Head[],
): { head: Head; duration: NoteEvent['duration'] }[] {
  const s = staff.spacing
  const visited = new Uint8Array(width * height)
  const rests: { head: Head; duration: NoteEvent['duration'] }[] = []
  const yTop = Math.max(0, Math.round(staff.lines[0] - s))
  const yBottom = Math.min(height - 1, Math.round(staff.lines[4] + s))
  for (let yy = yTop; yy <= yBottom; yy++) {
    for (let xx = 0; xx < width; xx++) {
      const start = yy * width + xx
      if (!bin[start] || visited[start]) continue
      const stack = [start]
      visited[start] = 1
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
          if (q < 0 || q >= width * height || visited[q] || !bin[q]) continue
          if ((q === p - 1 || q === p + 1) && ((q / width) | 0) !== y) continue
          visited[q] = 1
          stack.push(q)
        }
      }
      const w = maxX - minX + 1
      const h = maxY - minY + 1
      const cx = sumX / area
      const cy = sumY / area
      // skip anything touching a notehead (stems/beams connect to heads)
      const margin = 0.3 * s
      const touchesHead = heads.some(
        (hd) =>
          minX <= hd.maxX + margin &&
          maxX >= hd.minX - margin &&
          minY <= hd.maxY + margin &&
          maxY >= hd.minY - margin,
      )
      if (touchesHead) continue
      const yCorr = cy - staff.slope * cx
      const middle = (staff.lines[1] + staff.lines[3]) / 2
      const head: Head = { x: cx, y: cy, minX, maxX, minY, maxY }
      // isolated glyph: clef/ornament fragments have more ink nearby
      const pad = Math.round(0.6 * s)
      let windowBlack = 0
      for (let by = Math.max(0, minY - pad); by <= Math.min(height - 1, maxY + pad); by++) {
        for (let bx = Math.max(0, minX - pad); bx <= Math.min(width - 1, maxX + pad); bx++) {
          windowBlack += bin[by * width + bx]
        }
      }
      const isolated = windowBlack <= area * 1.35
      // squiggle rests (quarter/eighth/16th) hang around the middle of the staff
      if (
        isolated &&
        w >= 0.35 * s &&
        w <= 1.0 * s &&
        h >= 0.8 * s &&
        h <= 3.2 * s &&
        Math.abs(yCorr - middle) <= 1.2 * s &&
        area >= 0.25 * s * s
      ) {
        let duration: NoteEvent['duration'] = 8
        if (h > 2.2 * s) {
          // count the "balls" along the glyph: 16th rests have two, quarter rests none
          let bands = 0
          let bandRows = 0
          for (let y = minY; y <= maxY; y++) {
            let rowWidth = 0
            for (let x = minX; x <= maxX; x++) rowWidth += bin[y * width + x]
            if (rowWidth >= 0.42 * s) bandRows++
            else {
              if (bandRows >= 0.2 * s) bands++
              bandRows = 0
            }
          }
          if (bandRows >= 0.2 * s) bands++
          duration = bands >= 2 ? 16 : 4
        }
        rests.push({ head, duration })
      } else if (
        isolated &&
        // rectangle rests: half sits on the middle line, whole hangs from the line above
        w >= 0.8 * s &&
        w <= 1.6 * s &&
        h >= 0.2 * s &&
        h <= 0.55 * s &&
        area / (w * h) >= 0.8
      ) {
        const topCorr = minY - staff.slope * cx
        const bottomCorr = maxY - staff.slope * cx
        const half = Math.abs(bottomCorr - staff.lines[2]) <= 0.3 * s
        const whole = Math.abs(topCorr - staff.lines[1]) <= 0.3 * s
        if (half || whole) rests.push({ head, duration: half ? 2 : 1 })
      }
    }
  }
  return rests
}

export function recognize(image: BitmapLike, clef: Clef = 'treble'): OmrResult {
  const { width, height } = image
  const bin = binarize(image)
  const staff = findStaff(bin, width, height)
  const s = staff.spacing
  const hollowHeads = findHollowHeads(bin, width, height, s)
  removeStaffLines(bin, width, height, staff)
  const filtered = filterHeadPixels(bin, width, height, s)
  const hollowCap = 3.5 * s * s
  // only read heads near the detected staff (multi-staff pages: nearest staff only)
  const nearStaff = ({ head }: { head: Head }) => {
    const yCorr = head.y - staff.slope * head.x
    return yCorr >= staff.lines[0] - 3.5 * s && yCorr <= staff.lines[4] + 3.5 * s
  }
  const all = [
    ...findHeads(filtered, width, height, s).map((head) => ({ head, hollow: false })),
    ...hollowHeads
      .filter((head) => blobAreaAround(bin, width, height, head, hollowCap) <= hollowCap)
      .map((head) => ({ head, hollow: true })),
  ]
    .filter(nearStaff)
    .sort((a, b) => a.head.x - b.head.x)

  const noteEvents: { x: number; head: Head; event: NoteEvent }[] = all.map(({ head, hollow }) => {
    // interpolate between the two nearest detected lines (skew-corrected space)
    const y = head.y - staff.slope * head.x
    const { lines } = staff
    let idx: number
    if (y <= lines[0]) idx = (y - lines[0]) / s
    else if (y >= lines[4]) idx = 4 + (y - lines[4]) / s
    else {
      let k = 0
      while (y > lines[k + 1]) k++
      idx = k + (y - lines[k]) / (lines[k + 1] - lines[k])
    }
    const steps = Math.round(idx * 2)

    const stem = findStem(bin, width, height, s, head)
    let duration: NoteEvent['duration']
    if (hollow) duration = stem ? 2 : 1
    else if (stem) {
      const beams = countBeams(bin, width, height, s, head, stem)
      duration = beams >= 2 ? 16 : beams === 1 ? 8 : 4
    } else duration = 4
    const dotted = hasDot(bin, width, height, s, head)

    return {
      x: head.x,
      head,
      event: {
        kind: 'note' as const,
        pitch: staffPitch(steps, clef),
        duration,
        ...(dotted && { dotted }),
      },
    }
  })

  const restEvents = findRests(bin, width, height, staff, all.map((a) => a.head)).map(
    ({ head, duration }) => ({
      x: head.x,
      head,
      event: {
        kind: 'rest' as const,
        duration,
        ...(hasDot(bin, width, height, s, head) && { dotted: true }),
      },
    }),
  )

  const merged = [...noteEvents, ...restEvents].sort((a, b) => a.x - b.x)
  return {
    events: merged.map((m) => m.event),
    heads: merged.map((m) => m.head),
    staffLines: staff.lines,
    staffSpacing: s,
  }
}
