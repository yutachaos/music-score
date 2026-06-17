import { useRef, useState } from 'react'
import type { Clef, NoteEvent, Score } from '../model/types'
import { recognize, type OmrResult } from './recognize'

// recognize at native resolution (downscaling blurs flags/beams and breaks
// duration detection); the canvas is shrunk for display via CSS only
const MAX_WIDTH = 4000

export function OmrPage({ onImport }: { onImport: (events: NoteEvent[], clef: Clef, keySig: Score['keySig'], staffEventCounts: number[]) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<ImageData | null>(null)
  const [result, setResult] = useState<OmrResult | null>(null)
  const [error, setError] = useState('')

  function run(image: ImageData) {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    ctx.putImageData(image, 0, 0)
    try {
      const r = recognize(image)
      setResult(r)
      setError('')
      ctx.strokeStyle = 'rgba(0, 120, 255, 0.7)'
      ctx.lineWidth = 1
      for (const y of r.staffLines) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(canvas.width, y)
        ctx.stroke()
      }
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)'
      ctx.lineWidth = 2
      for (const h of r.heads) {
        ctx.beginPath()
        ctx.arc(h.x, h.y, r.staffSpacing * 0.8, 0, Math.PI * 2)
        ctx.stroke()
      }
    } catch (e) {
      setResult(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function handleFile(file: File) {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(img.src)
      const canvas = canvasRef.current!
      const scale = Math.min(1, MAX_WIDTH / img.width)
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      imageRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height)
      run(imageRef.current)
    }
    img.src = URL.createObjectURL(file)
  }

  return (
    <details className="omr">
      <summary>Photo recognition (experimental)</summary>
      <p className="hint">
        Works only with cleanly printed, monophonic scores. Durations (whole–16th, dots) and rests
        are estimated from the glyph shapes — review the result in the editor after importing.
      </p>
      <label className="file-button">
        Choose image
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ''
          }}
        />
      </label>
      {error && <p className="omr-error">{error}</p>}
      {result && (
        <p>
          Detected {result.events.length} notes and rests ({result.clef} clef){' '}
          <button onClick={() => onImport(result.events, result.clef, result.keySig, result.staffEventCounts)}>Import as new score</button>
        </p>
      )}
      <canvas ref={canvasRef} className="omr-canvas" />
    </details>
  )
}
