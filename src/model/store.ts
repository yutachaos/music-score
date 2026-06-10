import type { Score } from './types'

const KEY = 'music-score.scores'

export function loadScores(): Score[] {
  const raw = localStorage.getItem(KEY)
  if (!raw) return []
  // scores saved before clef support lack the field
  return (JSON.parse(raw) as { scores: Score[] }).scores.map((s) => ({
    ...s,
    clef: s.clef ?? 'treble',
  }))
}

export function saveScores(scores: Score[]) {
  localStorage.setItem(KEY, JSON.stringify({ scores }))
}

export function newScore(): Score {
  return {
    id: crypto.randomUUID(),
    title: '新しい楽譜',
    clef: 'treble',
    keySig: 'C',
    timeSig: '4/4',
    tempo: 100,
    events: [],
  }
}

export function download(name: string, content: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}
