import { useRef, useImperativeHandle, forwardRef, useEffect } from "react"

/**
 * Lienzo táctil para firma. Expone getDataURL(), clear(), isEmpty().
 */
export const SignaturePad = forwardRef(function SignaturePad({ width = 320, height = 140, label, hint }, ref) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const hasInk = useRef(false)
  const last = useRef(null)

  const pos = e => {
    const c = canvasRef.current
    if (!c) return null
    const r = c.getBoundingClientRect()
    const t = e.touches?.[0]
    const clientX = t ? t.clientX : e.clientX
    const clientY = t ? t.clientY : e.clientY
    const scaleX = c.width / r.width
    const scaleY = c.height / r.height
    return { x: (clientX - r.left) * scaleX, y: (clientY - r.top) * scaleY }
  }

  const start = e => {
    e.preventDefault()
    drawing.current = true
    const p = pos(e)
    if (p) last.current = p
  }

  const move = e => {
    if (!drawing.current) return
    e.preventDefault()
    const c = canvasRef.current
    const p = pos(e)
    if (!c || !p || !last.current) return
    const ctx = c.getContext("2d")
    ctx.strokeStyle = "#0f172a"
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    hasInk.current = true
    last.current = p
  }

  const end = e => {
    e.preventDefault()
    drawing.current = false
    last.current = null
  }

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext("2d")
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, c.width, c.height)
  }, [width, height])

  useImperativeHandle(ref, () => ({
    getDataURL: () => canvasRef.current?.toDataURL("image/png") || "",
    clear: () => {
      const c = canvasRef.current
      if (!c) return
      const ctx = c.getContext("2d")
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, c.width, c.height)
      hasInk.current = false
    },
    isEmpty: () => !hasInk.current,
  }))

  return (
    <div style={{ marginTop: 8 }}>
      {label && (
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      )}
      {hint && (
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>{hint}</div>
      )}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
        style={{
          width: "100%",
          maxWidth: width,
          height: "auto",
          touchAction: "none",
          border: "1px solid #cbd5e1",
          borderRadius: 8,
          background: "#fff",
          cursor: "crosshair",
        }}
      />
    </div>
  )
})
