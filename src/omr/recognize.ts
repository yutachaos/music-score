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
  clef: Clef
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

function refineSlope(bin: Uint8Array, width: number, height: number, initSlope: number): number {
  let best = initSlope
  let bestSharpness = -1
  for (let s = initSlope - 0.003; s <= initSlope + 0.0031; s += 0.0005) {
    const p = projection(bin, width, height, s)
    let sharpness = 0
    for (let i = 0; i < height; i++) sharpness += p[i] * p[i]
    if (sharpness > bestSharpness) {
      bestSharpness = sharpness
      best = s
    }
  }
  return best
}

function findStaves(bin: Uint8Array, width: number, height: number): StaffInfo[] {
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

  // line candidates: maximal runs of strong rows, reduced to their centroid
  const max = Math.max(...proj)
  const thresh = Math.max(0.4 * max, 0.25 * width)
  const centers: number[] = []
  const runLengths: number[] = []
  const peaks: number[] = []
  let runStart = -1
  for (let y = 0; y <= height; y++) {
    const on = y < height && proj[y] >= thresh
    if (on && runStart < 0) runStart = y
    else if (!on && runStart >= 0) {
      // tight centroid around the peak row, so smeared edges do not bias the center
      let peak = runStart
      let strong = 0
      for (let r = runStart; r < y; r++) {
        if (proj[r] > proj[peak]) peak = r
        if (proj[r] > 0.5 * max) strong++
      }
      let weight = 0
      let sum = 0
      for (let r = peak - 2; r <= peak + 2; r++) {
        const v = proj[r] ?? 0
        if (v < proj[peak] * 0.5) continue
        weight += v
        sum += v * r
      }
      centers.push(sum / weight)
      runLengths.push(strong)
      peaks.push(proj[peak])
      runStart = -1
    }
  }

  // group candidates into staves: 5 evenly spaced lines. Beam bands and
  // notehead rows also project strongly (rhythm staves align them at one
  // height), so spurious candidates may sit between real lines; chains may
  // skip candidates, and competing chains are ranked by projection strength
  // (real lines project far stronger than beam/head bands).
  const chains: { idx: number[]; score: number }[] = []
  for (let i = 0; i < centers.length; i++) {
    for (let j = i + 1; j < centers.length; j++) {
      const spacing = centers[j] - centers[i]
      if (spacing < 5 || spacing > height / 5) continue
      const tol = Math.max(1.5, 0.2 * spacing)
      const idx = [i, j]
      while (idx.length < 5) {
        const want = centers[idx[idx.length - 1]] + spacing
        let bestK = -1
        for (let k = idx[idx.length - 1] + 1; k < centers.length; k++) {
          if (
            Math.abs(centers[k] - want) <= tol &&
            (bestK < 0 || Math.abs(centers[k] - want) < Math.abs(centers[bestK] - want))
          )
            bestK = k
        }
        if (bestK < 0) break
        idx.push(bestK)
      }
      if (idx.length === 5)
        chains.push({ idx, score: idx.reduce((a, k) => a + peaks[k], 0) })
    }
  }
  chains.sort((a, b) => b.score - a.score)
  const used = new Set<number>()
  const staves: StaffInfo[] = []
  for (const { idx } of chains) {
    if (idx.some((k) => used.has(k))) continue
    for (const k of idx) used.add(k)
    const lines = idx.map((k) => centers[k])
    const thickness = Math.max(1, idx.reduce((a, k) => a + runLengths[k], 0) / 5)
    staves.push({ lines, spacing: (lines[4] - lines[0]) / 4, thickness, slope })
  }
  staves.sort((a, b) => a.lines[0] - b.lines[0])
  if (staves.length === 0) throw new Error('Could not detect staff lines')
  return staves
}

function removeStaffLines(bin: Uint8Array, width: number, height: number, staff: StaffInfo) {
  // tighter than thickness*2: a beam fused with the line can produce a
  // vertical run roughly thickness*2 tall, and erasing it would destroy
  // the beam. thickness*1.6 still covers a staff line plus typical
  // anti-alias padding.
  const maxRun = Math.ceil(staff.thickness * 1.6)
  // pages warp: lines drift a few pixels from the linear skew model
  const search = Math.ceil(staff.thickness) + 4
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
    // w <= 1.5h: noteheads are mildly wide ellipses; tie-arc tops are far wider
    if (area >= 0.45 * s * s && w >= 0.65 * s && w <= 2 * s && h >= 0.6 * s && h <= 2 * s && w <= 1.5 * h) {
      heads.push({ x: sumX / area, y: sumY / area, minX, maxX, minY, maxY })
    }
  }
  return heads.sort((a, b) => a.x - b.x)
}

// longest vertical black run in a column that overlaps the head's rows.
// Scanned stems are ~2px wide and jog sideways by a pixel, so a run continues
// through ink in the adjacent columns too.
function runThroughHead(bin: Uint8Array, width: number, height: number, x: number, head: Head) {
  const on = (y: number) =>
    bin[y * width + x] ||
    (x > 0 && bin[y * width + x - 1]) ||
    (x < width - 1 && bin[y * width + x + 1])
  let yc = -1
  for (let y = head.minY; y <= head.maxY; y++) {
    if (on(y)) {
      yc = y
      break
    }
  }
  if (yc < 0) return null
  let top = yc
  while (top > 0 && on(top - 1)) top--
  let bottom = yc
  while (bottom < height - 1 && on(bottom + 1)) bottom++
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
    if (!run) continue
    // staff-line removal can leave a 1-2 px gap splitting the stem; bridge it
    // by looking for ink just above the run top and merging the two portions
    const on = (y: number) =>
      bin[y * width + x] ||
      (x > 0 && bin[y * width + x - 1]) ||
      (x < width - 1 && bin[y * width + x + 1])
    let extTop = run.top
    for (let gap = 1; gap <= 2 && extTop > gap; gap++) {
      if (!on(extTop - gap) && on(extTop - gap - 1)) {
        let t = extTop - gap - 1
        while (t > 0 && on(t - 1)) t--
        extTop = t
        break
      }
    }
    const len = run.bottom - extTop + 1
    if (len <= longest) continue
    longest = len
    const tip = head.y - extTop > run.bottom - head.y ? extTop : run.bottom
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
  staff?: StaffInfo,
): number {
  const dir = stem.tip < head.y ? 1 : -1 // scan from tip toward the head
  const scanLen = Math.min(2.5 * s, Math.abs(head.y - stem.tip) - 0.8 * s)
  const minBand = Math.max(2, 0.1 * s)
  // when scanning the pre-removal bitmap, ignore pixels lying on a staff line
  const onLine = (x: number, y: number): boolean => {
    if (!staff) return false
    const t = Math.max(1, Math.ceil(staff.thickness / 2))
    for (const line of staff.lines) {
      if (Math.abs(y - (line + staff.slope * x)) <= t) return true
    }
    return false
  }

  function scanColumn(x: number, mode: 'beam' | 'flag'): number {
    if (x < 0 || x >= width) return 0
    let count = 0
    let runLen = 0
    // flags are chunky; staff-line leftovers are only a couple of pixels tall
    const minRun = mode === 'flag' ? 0.3 * s : minBand
    const closeBand = (endY: number) => {
      // beams are thin bars; staff-line residuals fused with noteheads can be much taller.
      // flags extend further; keep the looser bound for flag mode only.
      const maxRun = mode === 'beam' ? 0.8 * s : 1.3 * s
      if (runLen < minRun || runLen > maxRun) {
        runLen = 0
        return
      }
      if (mode === 'beam') {
        count++
        runLen = 0
        return
      }
      // flag-sized on some row: excludes staff-line leftovers (long) and
      // specks (short). Thin diagonal flag strokes are narrow at mid-run, so
      // every row of the run is checked, not just the middle one.
      let ok = false
      for (let i = 1; i <= runLen && !ok; i++) {
        const ym = endY - dir * i
        let l = x
        while (l > 0 && bin[ym * width + l - 1]) l--
        let r = x
        while (r < width - 1 && bin[ym * width + r + 1]) r++
        const hr = r - l + 1
        if (hr >= 0.3 * s && hr < 1.5 * s) ok = true
      }
      if (ok) count++
      runLen = 0
    }
    for (let i = 0; i <= scanLen; i++) {
      const y = stem.tip + dir * i
      if (y < 0 || y >= height) break
      // staff lines fuse with beams; treating line pixels as separators makes
      // a 16th beam that sits across the line read as two beams instead of
      // one fat band
      const on = bin[y * width + x] && !onLine(x, y)
      if (on) runLen++
      else closeBand(y)
    }
    closeBand(stem.tip + dir * Math.round(scanLen + 1))
    return count
  }

  let beams = 0
  for (const dx of [-0.7 * s, 0.7 * s]) {
    beams = Math.max(beams, scanColumn(Math.round(stem.x + dx), 'beam'))
  }
  // flags only extend to the right of the stem and hug it closely
  for (const dx of [0.4 * s, 0.55 * s]) {
    beams = Math.max(beams, scanColumn(Math.round(stem.x + dx), 'flag'))
  }
  return beams
}

// augmentation dot: a small isolated blob right of the head
function hasDot(bin: Uint8Array, width: number, height: number, s: number, head: Head): boolean {
  return dotInWindow(
    bin,
    width,
    height,
    s,
    head.maxX + 0.2 * s,
    head.maxX + 1.1 * s,
    head.y - 0.8 * s,
    head.y + 0.8 * s,
  )
}

// rest dots sit beside the upper ball of the glyph, often above the tail sweep
function restDot(bin: Uint8Array, width: number, height: number, s: number, head: Head): boolean {
  return dotInWindow(
    bin,
    width,
    height,
    s,
    head.x + 0.3 * s,
    head.x + 1.4 * s,
    head.minY,
    head.minY + 0.9 * s,
  )
}

function dotInWindow(
  bin: Uint8Array,
  width: number,
  height: number,
  s: number,
  wx0: number,
  wx1: number,
  wy0: number,
  wy1: number,
): boolean {
  let dotted = false
  const dx0 = Math.min(width - 1, Math.round(wx0))
  const dx1 = Math.min(width - 1, Math.round(wx1))
  const dy0 = Math.max(0, Math.round(wy0))
  const dy1 = Math.min(height - 1, Math.round(wy1))
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
      // round blob: staff-line leftovers and flag-tip flakes are smaller/flatter
      if (!escapes && area >= 0.07 * s * s && w <= 0.7 * s && h <= 0.7 * s && h >= 0.18 * s && w <= 2.5 * h)
        dotted = true
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
    // digit holes, and clef curls are smaller or taller. Blurry/small images
    // have fewer pixels; the thin-ring check below handles false positives.
    // Whole notes sitting on a staff line can have h > w after the line
    // erases part of the ring, so w < h is not checked here.
    if (hole.area < 0.15 * s * s || w < 0.55 * s || h < 0.3 * s || h > 0.85 * s) continue
    // elliptical hole: rectangular white cells between stems/beams/lines fill their bbox.
    // True notehead holes are oval (fill ≤ 0.82); tie-arc pockets are nearly rectangular.
    const fill = hole.area / (w * h)
    if (fill > 0.82) continue
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
      // blurry/small images have thicker ink; 0.75*s accepts up to ~10px rings
      thin.push(started && run <= 0.75 * s)
    }
    // pockets between beamed noteheads have many surrounding black pixels;
    // blobAreaAround (applied later) rejects them. Require 6/8 thin rays so
    // that whole notes with thick horizontal runs on two sides still pass.
    if (thin.filter(Boolean).length < 6) continue
    heads.push({
      x: cx,
      y: cy,
      minX: Math.max(0, hole.minX - pad),
      maxX: Math.min(width - 1, hole.maxX + pad),
      minY: Math.max(0, hole.minY - pad),
      maxY: Math.min(height - 1, hole.maxY + pad),
    })
  }
  // keep only the largest hole within each s-radius cluster (small holes adjacent
  // to the real ring can pass the checks and would cause duplicate events)
  for (let i = 0; i < heads.length; i++) {
    for (let j = i + 1; j < heads.length; j++) {
      if (Math.abs(heads[i].x - heads[j].x) < s && Math.abs(heads[i].y - heads[j].y) < s) {
        const ai = (heads[i].maxX - heads[i].minX) * (heads[i].maxY - heads[i].minY)
        const aj = (heads[j].maxX - heads[j].minX) * (heads[j].maxY - heads[j].minY)
        if (ai >= aj) heads.splice(j--, 1)
        else { heads.splice(i--, 1); break }
      }
    }
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
  interface RComp {
    area: number
    sumX: number
    sumY: number
    minX: number
    maxX: number
    minY: number
    maxY: number
  }
  const comps: RComp[] = []
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
      comps.push({ area, sumX, sumY, minX, maxX, minY, maxY })
    }
  }

  // rejoin glyph fragments split by staff-line removal (a rest crossing a
  // line loses its connecting stroke there). Only small fragments merge, and
  // only while the union stays rest-sized, so chains cannot creep across
  // line leftovers into stems or beams.
  for (let i = 0; i < comps.length; i++) {
    for (let j = i + 1; j < comps.length; j++) {
      const a = comps[i]
      const b = comps[j]
      if (a.area > 2.5 * s * s || b.area > 2.5 * s * s) continue
      const xGap = Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX)
      const yGap = Math.max(a.minY, b.minY) - Math.min(a.maxY, b.maxY)
      const mw = Math.max(a.maxX, b.maxX) - Math.min(a.minX, b.minX) + 1
      const mh = Math.max(a.maxY, b.maxY) - Math.min(a.minY, b.minY) + 1
      if (mw > 1.8 * s || mh > 3.4 * s) continue
      if (xGap <= 0.1 * s && yGap <= 0.35 * s) {
        comps[i] = {
          area: a.area + b.area,
          sumX: a.sumX + b.sumX,
          sumY: a.sumY + b.sumY,
          minX: Math.min(a.minX, b.minX),
          maxX: Math.max(a.maxX, b.maxX),
          minY: Math.min(a.minY, b.minY),
          maxY: Math.max(a.maxY, b.maxY),
        }
        comps.splice(j, 1)
        j = i // recheck against the merged comp
      }
    }
  }

  for (const { area, sumX, sumY, minX, maxX, minY, maxY } of comps) {
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
      ;(globalThis as { __restDbg?: object[] }).__restDbg?.push({
        minX, maxX, minY, maxY, w, h, area, isolated, windowBlack,
        offMiddle: Math.abs(yCorr - middle),
        tallGroups: tallColumnGroups(bin, width, height, s, minX, maxX, minY, maxY),
      })
      // squiggle rests (quarter/eighth/16th) hang around the middle of the staff;
      // accidentals (two long vertical strokes) land here too, so exclude them
      if (
        isolated &&
        w >= 0.35 * s &&
        // up to 1.6 s: 16th-rest balls can stack diagonally, widening the glyph
        w <= 1.6 * s &&
        h >= 0.8 * s &&
        h <= 3.2 * s &&
        Math.abs(yCorr - middle) <= 1.2 * s &&
        area >= 0.25 * s * s &&
        tallColumnGroups(bin, width, height, s, minX, maxX, minY, maxY) < 2
      ) {
        // count the "balls" along the glyph: eighth rests have one, 16th two,
        // quarter rests are tall zigzags
        let balls = 0
        let bandRows = 0
        let firstBand = -1
        for (let y = minY; y <= maxY; y++) {
          let rowWidth = 0
          for (let x = minX; x <= maxX; x++) rowWidth += bin[y * width + x]
          if (rowWidth >= 0.42 * s) {
            bandRows++
            if (firstBand < 0) firstBand = y
          } else {
            if (bandRows >= 0.2 * s) balls++
            bandRows = 0
          }
        }
        if (bandRows >= 0.2 * s) balls++
        // 8th/16th rests lead with a ball right at the top; a tall glyph whose
        // first thick band sits well below the top is a quarter-rest zigzag,
        // even when its bulges read as two balls
        const quarter = h > 2.4 * s && (firstBand < 0 || firstBand - minY > 0.35 * s)
        const duration: NoteEvent['duration'] = quarter ? 4 : balls >= 2 ? 16 : h > 2.4 * s ? 4 : 8
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
  return rests
}

// groups of adjacent columns whose vertical black run is stroke-length: a sharp
// or natural sign has two, which neither rests nor noteheads have
function tallColumnGroups(
  bin: Uint8Array,
  width: number,
  height: number,
  s: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): number {
  let groups = 0
  let inGroup = false
  for (let x = Math.max(0, x0); x <= Math.min(width - 1, x1); x++) {
    let run = 0
    let longest = 0
    for (let y = Math.max(0, y0); y <= Math.min(height - 1, y1); y++) {
      run = bin[y * width + x] ? run + 1 : 0
      longest = Math.max(longest, run)
    }
    const tall = longest >= 1.5 * s
    if (tall && !inGroup) groups++
    inGroup = tall
  }
  return groups
}

interface Lead {
  clef: Clef | null
  endX: number // glyphs left of this are clef/time-signature/key-signature, not notes
  // the clef glyph's own box: head candidates inside it are clef parts, not notes
  clefBox: { minX: number; maxX: number } | null
}

// the clef is the leftmost large glyph on the staff: a treble clef extends far
// above and below the staff (~7 spacings tall), a bass clef fits inside (~3).
// Time/key-signature glyphs hug the clef inside the staff band; endX marks
// where this lead region stops so its glyphs are not read as notes.
function detectLead(bin: Uint8Array, width: number, height: number, staff: StaffInfo): Lead {
  const s = staff.spacing
  const visited = new Uint8Array(width * height)
  interface Comp {
    minX: number
    maxX: number
    minY: number
    maxY: number
    area: number
  }
  const comps: Comp[] = []
  for (let yy = 0; yy < height; yy++) {
    for (let xx = 0; xx < width; xx++) {
      const start = yy * width + xx
      if (!bin[start] || visited[start]) continue
      const stack = [start]
      visited[start] = 1
      let area = 0
      let minX = width
      let maxX = 0
      let minY = height
      let maxY = 0
      while (stack.length > 0) {
        const p = stack.pop()!
        const x = p % width
        const y = (p / width) | 0
        area++
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
      comps.push({ minX, maxX, minY, maxY, area })
    }
  }

  let clefComp: Comp | null = null
  for (const c of comps) {
    const w = c.maxX - c.minX + 1
    const h = c.maxY - c.minY + 1
    const cx = (c.minX + c.maxX) / 2
    const cyCorr = (c.minY + c.maxY) / 2 - staff.slope * cx
    if (cyCorr < staff.lines[0] - 3 * s || cyCorr > staff.lines[4] + 3 * s) continue
    if (c.area < 2.5 * s * s || h < 2.2 * s || w < 1.4 * s || w > 4 * s) continue
    if (!clefComp || c.minX < clefComp.minX) clefComp = c
  }
  const clefH = clefComp ? clefComp.maxY - clefComp.minY + 1 : 0
  if (!clefComp || clefH <= 5 * s) {
    // not a tall treble clef. A bass clef is identified by its structure:
    // two dots right of the body, straddling the F line (2nd line from top).
    // Note groups and stray blobs never carry that dot pair, and begin-repeat
    // dots straddle the middle line instead, so neither false-positives here.
    // This also catches clefs that staff-line removal shredded so badly that
    // no single component passes the size checks above.
    const isDot = (c: Comp) =>
      c.maxX - c.minX + 1 <= 0.8 * s &&
      c.maxY - c.minY + 1 <= 0.8 * s &&
      c.area >= 0.03 * s * s
    const cy = (c: Comp) => (c.minY + c.maxY) / 2 - (staff.slope * (c.minX + c.maxX)) / 2
    const tol = 0.15 * s
    for (const upper of comps) {
      if (!isDot(upper)) continue
      const uy = cy(upper)
      if (uy <= staff.lines[0] - tol || uy >= staff.lines[1] + tol) continue
      for (const lower of comps) {
        if (lower === upper || !isDot(lower)) continue
        const ly = cy(lower)
        if (ly <= staff.lines[1] - tol || ly >= staff.lines[2] + tol) continue
        if (ly - uy < 0.5 * s) continue
        if (Math.abs((upper.minX + upper.maxX) / 2 - (lower.minX + lower.maxX) / 2) > 0.5 * s)
          continue
        const dotMinX = Math.min(upper.minX, lower.minX)
        const dotMaxX = Math.max(upper.maxX, lower.maxX)
        // the clef body sits immediately left of the dots
        for (const body of comps) {
          const bh = body.maxY - body.minY + 1
          if (bh < 2 * s || body.area < 0.8 * s * s) continue
          const gap = dotMinX - body.maxX
          if (gap < -0.2 * s || gap > 1.2 * s) continue
          // mask the whole clef region: shredding may have split off curls
          // further left than the body fragment found here
          return {
            clef: 'bass',
            endX: 0,
            clefBox: { minX: Math.min(body.minX, dotMinX - 2.8 * s), maxX: dotMaxX },
          }
        }
      }
    }
    // low-res scans fuse the dots into the body: fall back to "compact
    // leftmost glyph means bass", but mask nothing by it -- such a glyph is
    // too easily a note group, and masking would swallow real notes
    if (clefComp) return { clef: 'bass', endX: 0, clefBox: null }
    return { clef: null, endX: 0, clefBox: null }
  }

  // time-signature glyphs (digits, common-time C) hug the clef and sit fully
  // inside the staff; notes do not qualify because their stems poke outside.
  // Staff-line removal splits these glyphs, so merge vertical fragments first.
  const zone = comps.filter((c) => c.minX > clefComp.maxX - s && c.minX < clefComp.maxX + 8 * s)
  for (let i = 0; i < zone.length; i++) {
    for (let j = i + 1; j < zone.length; j++) {
      const a = zone[i]
      const b = zone[j]
      const gap = Math.max(a.minY, b.minY) - Math.min(a.maxY, b.maxY)
      if (Math.abs((a.minX + a.maxX) / 2 - (b.minX + b.maxX) / 2) < 0.6 * s && gap <= 0.5 * s) {
        zone[i] = {
          minX: Math.min(a.minX, b.minX),
          maxX: Math.max(a.maxX, b.maxX),
          minY: Math.min(a.minY, b.minY),
          maxY: Math.max(a.maxY, b.maxY),
          area: a.area + b.area,
        }
        zone.splice(j, 1)
        j = i
      }
    }
  }
  let endX = clefComp.maxX
  for (const c of zone.sort((a, b) => a.minX - b.minX)) {
    if (c.minX > endX + 2 * s) break
    const w = c.maxX - c.minX + 1
    const h = c.maxY - c.minY + 1
    const cx = (c.minX + c.maxX) / 2
    if (c.minY - staff.slope * cx < staff.lines[0] - 0.3 * s) continue
    if (c.maxY - staff.slope * cx > staff.lines[4] + 0.3 * s) continue
    if (h < 1.2 * s || w > 2.2 * s) continue
    endX = Math.max(endX, c.maxX)
  }
  return { clef: 'treble', endX, clefBox: clefComp }
}

export function recognize(image: BitmapLike, clef?: Clef): OmrResult {
  const { width, height } = image
  const bin = binarize(image)
  const staves = findStaves(bin, width, height)

  const events: NoteEvent[] = []
  const heads: { x: number; y: number }[] = []
  let usedClef: Clef | undefined = clef
  for (const staff of staves) {
    // recognize each staff on its own horizontal band so systems do not interfere
    const pad = Math.round(4.5 * staff.spacing)
    const y0 = Math.max(0, Math.round(staff.lines[0]) - pad)
    const y1 = Math.min(height, Math.round(staff.lines[4]) + pad)
    const local = { ...staff, lines: staff.lines.map((l) => l - y0) }
    const r = recognizeStaff(bin.slice(y0 * width, y1 * width), width, y1 - y0, local, usedClef)
    usedClef = usedClef ?? r.clef
    ;(globalThis as { __headDbg?: object[] }).__headDbg?.push(
      ...r.heads.map((h, i) => ({ ...h, y: h.y + y0, minY: h.minY + y0, maxY: h.maxY + y0, ev: r.events[i] })),
    )
    events.push(...r.events)
    heads.push(...r.heads.map((h) => ({ x: h.x, y: h.y + y0 })))
  }
  return {
    events,
    heads,
    staffLines: staves.flatMap((st) => st.lines),
    staffSpacing: staves[0].spacing,
    clef: usedClef ?? 'treble',
  }
}

function recognizeStaff(
  bin: Uint8Array,
  width: number,
  height: number,
  staff: StaffInfo,
  clef: Clef | undefined,
): { events: NoteEvent[]; heads: Head[]; clef: Clef } {
  const s = staff.spacing
  const hollowHeads = findHollowHeads(bin, width, height, s)
  const binOrig = bin.slice()
  const pitchSlope = refineSlope(binOrig, width, height, staff.slope)
  removeStaffLines(bin, width, height, staff)
  const lead = detectLead(bin, width, height, staff)
  ;(globalThis as { __leadDbg?: object[] }).__leadDbg?.push(lead)
  const usedClef = clef ?? lead.clef ?? 'treble'
  const filtered = filterHeadPixels(bin, width, height, s)
  const hollowCap = 3.5 * s * s
  // only read heads near the staff and right of the clef/signature region
  const nearStaff = ({ head }: { head: Head }) => {
    if (head.minX <= lead.endX) return false
    if (lead.clefBox && head.x >= lead.clefBox.minX && head.x <= lead.clefBox.maxX) return false
    const yCorr = head.y - staff.slope * head.x
    return yCorr >= staff.lines[0] - 3.5 * s && yCorr <= staff.lines[4] + 3.5 * s
  }
  const validHollow = hollowHeads
    .filter((head) => blobAreaAround(bin, width, height, head, hollowCap) <= hollowCap)
    .map((head) => ({ head, hollow: true }))
    .filter(nearStaff)
  const all = [
    // drop filled heads that overlap a confirmed hollow head: the hollow ring
    // and the filled blob occupy the same pixels; keeping both causes duplicate events
    ...findHeads(filtered, width, height, s)
      .map((head) => ({ head, hollow: false }))
      .filter(
        (f) =>
          nearStaff(f) &&
          !validHollow.some(
            (h) => Math.abs(h.head.x - f.head.x) < 0.7 * s && Math.abs(h.head.y - f.head.y) < 0.7 * s,
          ),
      ),
    ...validHollow,
  ].sort((a, b) => a.head.x - b.head.x)

  const noteEvents: { x: number; head: Head; event: NoteEvent }[] = all.map(({ head, hollow }) => {
    // interpolate between the two nearest detected lines (skew-corrected space)
    const y = head.y - pitchSlope * head.x
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

    // staff line removal can split a stem that crosses a line, so the post-removal
    // run may be too short. Fall back to the pre-removal bitmap if the tip is too
    // close to the head to reveal the beam above/below the staff.
    let stem = findStem(bin, width, height, s, head)
    if (!stem || Math.abs(head.y - stem.tip) < 2.0 * s) {
      stem = findStem(binOrig, width, height, s, head) ?? stem
    }
    let duration: NoteEvent['duration']
    if (hollow) duration = stem ? 2 : 1
    else if (stem) {
      const beams = countBeams(bin, width, height, s, head, stem)
      duration = beams >= 2 ? 16 : beams === 1 ? 8 : 4
    } else duration = 4
    const dotted = hasDot(bin, width, height, s, head)
    // a sharp/natural sign (two long vertical strokes) right before the head
    const sharp =
      tallColumnGroups(
        bin,
        width,
        height,
        s,
        Math.round(head.minX - 1.5 * s),
        Math.round(head.minX - 0.3 * s),
        Math.round(head.y - 1.6 * s),
        Math.round(head.y + 1.6 * s),
      ) >= 2
    const pitch = staffPitch(steps, usedClef)

    return {
      x: head.x,
      head,
      event: {
        kind: 'note' as const,
        pitch: sharp ? { ...pitch, accidental: 'sharp' as const } : pitch,
        duration,
        ...(dotted && { dotted }),
      },
    }
  })

  const restEvents = findRests(bin, width, height, staff, all.map((a) => a.head))
    .filter(({ head }) => nearStaff({ head }))
    .map(
    ({ head, duration }) => ({
      x: head.x,
      head,
      event: {
        kind: 'rest' as const,
        duration,
        ...(restDot(bin, width, height, s, head) && { dotted: true }),
      },
    }),
  )

  const merged = [...noteEvents, ...restEvents].sort((a, b) => a.x - b.x)

  // accidental persistence: when a note carries an accidental (sharp/flat/
  // natural), later notes of the same step+octave keep it within the same
  // measure. We approximate measures by clearing the carry whenever the gap
  // between notes is large (likely a barline). The cap is wide because
  // mid-measure note spacing varies a lot in scanned scores.
  const carry = new Map<string, NonNullable<typeof noteEvents[number]['event']['pitch']>['accidental']>()
  let lastX = -Infinity
  for (const m of merged) {
    if (m.event.kind !== 'note') continue
    const p = m.event.pitch!
    const key = `${p.step}${p.octave}`
    if (m.x - lastX > 8 * s) carry.clear()
    if (p.accidental) carry.set(key, p.accidental)
    else if (carry.has(key)) {
      m.event = { ...m.event, pitch: { ...p, accidental: carry.get(key)! } }
    }
    lastX = m.x
  }

  // ties: a thin arc between two consecutive same-pitch notes
  for (let i = 0; i < merged.length - 1; i++) {
    const a = merged[i]
    const b = merged[i + 1]
    if (a.event.kind !== 'note' || b.event.kind !== 'note') continue
    const pa = a.event.pitch!
    const pb = b.event.pitch!
    if (pa.step !== pb.step || pa.octave !== pb.octave || pa.accidental !== pb.accidental) continue
    if (arcBetween(binOrig, width, height, staff, a.head, b.head)) a.event.tie = true
  }

  return {
    events: merged.map((m) => m.event),
    heads: merged.map((m) => m.head),
    clef: usedClef,
  }
}

// thin curved stroke spanning most columns between two heads, just above or
// below them. Runs on the pre-removal image; hits on staff-line rows are
// ignored instead.
function arcBetween(
  bin: Uint8Array,
  width: number,
  height: number,
  staff: StaffInfo,
  a: Head,
  b: Head,
): boolean {
  const s = staff.spacing
  const x0 = Math.max(0, Math.round(a.x + 0.5 * s))
  const x1 = Math.min(width - 1, Math.round(b.x - 0.5 * s))
  if (x1 - x0 < 0.8 * s) return false
  const bands: [number, number][] = [
    [Math.max(a.maxY, b.maxY) + 1, Math.max(a.maxY, b.maxY) + Math.round(1.8 * s)],
    [Math.min(a.minY, b.minY) - Math.round(1.8 * s), Math.min(a.minY, b.minY) - 1],
  ]
  for (const [bandTop, bandBottom] of bands) {
    // record hit y per column; arc strokes form a smooth curve while stem
    // tips and stray noise scatter, so a long contiguous run of similar y's
    // is the real arc signature
    const hitY: number[] = new Array(x1 - x0 + 1).fill(-1)
    for (let x = x0; x <= x1; x++) {
      for (let y = Math.max(0, bandTop); y <= Math.min(height - 1, bandBottom); y++) {
        if (!bin[y * width + x]) continue
        let top = y
        while (top > 0 && bin[(top - 1) * width + x]) top--
        let bottom = y
        while (bottom < height - 1 && bin[(bottom + 1) * width + x]) bottom++
        // peel staff-line-wide rows off the top so an arc fused with a line
        // is still recognized as the arc stroke beneath
        while (top <= bottom) {
          let l = x
          while (l > 0 && bin[top * width + l - 1]) l--
          let r = x
          while (r < width - 1 && bin[top * width + r + 1]) r++
          if (r - l + 1 < 1.5 * s) break
          top++
        }
        if (top > bottom) { y = bottom; continue }
        if (top >= bandTop && bottom - top + 1 <= 0.7 * s) {
          hitY[x - x0] = top
          break
        }
        y = bottom
      }
    }
    const valid = hitY.map((y, i) => ({ y, i })).filter((p) => p.y >= 0)
    if (valid.length / hitY.length < 0.4) continue
    // arcs are U-shaped: hit y in the middle of the scan reaches further from
    // the staff than at the edges. Beams and other flat noise have y
    // ~constant across the scan and fail this test.
    const w = hitY.length
    const edgeRange = Math.max(2, Math.round(0.15 * w))
    const edge = valid.filter((p) => p.i < edgeRange || p.i >= w - edgeRange).map((p) => p.y)
    const mid = valid.filter((p) => p.i >= w / 3 && p.i < (2 * w) / 3).map((p) => p.y)
    if (edge.length < 2 || mid.length < 1) continue
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
    const curvature = Math.abs(avg(mid) - avg(edge))
    // arcs are gentle curves a few pixels deep. Beam debris produces a
    // larger, jagged spread that exceeds the typical arc depth.
    const yMin = Math.min(...valid.map((p) => p.y))
    const yMax = Math.max(...valid.map((p) => p.y))
    // upper band expects mid y < edge y (arc peak further from note); lower expects mid y > edge y.
    // when direction is correct, allow a looser spread to tolerate staff-line interference.
    const signedC = avg(mid) - avg(edge)
    const dirOk = bandTop > a.maxY ? signedC > 0 : signedC < 0
    if (yMax - yMin > (dirOk ? 1.5 : 1.0) * s) continue
    if (curvature >= 0.10 * s) return true
  }
  return false
}
