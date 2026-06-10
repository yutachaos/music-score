import { useRef, useState } from 'react'
import type { NoteEvent } from '../model/types'
import { recognize, type OmrResult } from './recognize'

const MAX_WIDTH = 1200

export function OmrPage({ onImport }: { onImport: (events: NoteEvent[]) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [result, setResult] = useState<OmrResult | null>(null)
  const [error, setError] = useState('')

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
      try {
        const r = recognize(ctx.getImageData(0, 0, canvas.width, canvas.height))
        setResult(r)
        setError('')
        ctx.strokeStyle = 'rgba(0, 120, 255, 0.7)'
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
    img.src = URL.createObjectURL(file)
  }

  return (
    <details className="omr">
      <summary>写真から読み取り（実験的）</summary>
      <p className="hint">
        きれいに印刷された単旋律・ト音記号の譜面のみ対応。音価はすべて四分音符として読み取るので、取込後にエディタで修正してください。
      </p>
      <label className="file-button">
        画像を選択
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
          {result.events.length} 個の音符を検出{' '}
          <button onClick={() => onImport(result.events)}>新しい楽譜として取込</button>
        </p>
      )}
      <canvas ref={canvasRef} className="omr-canvas" />
    </details>
  )
}
