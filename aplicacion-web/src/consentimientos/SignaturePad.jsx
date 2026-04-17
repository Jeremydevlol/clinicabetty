import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react"

/**
 * Lienzo de firma con puntero/táctil. Expone getDataURL (PNG), clear e isEmpty.
 */
export const SignaturePad = forwardRef(function SignaturePad(
  { width = 320, height = 130, label, hint },
  ref
) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const last = useRef(null)
  const hasInk = useRef(false)

  const clear = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext("2d")
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, c.width, c.height)
    hasInk.current = false
  }, [])

  useEffect(() => {
    clear()
  }, [width, height, clear])

  const getDataURL = useCallback(() => {
    const c = canvasRef.current
    if (!c) return ""
    return c.toDataURL("image/png")
  }, [])

  const isEmpty = useCallback(() => !hasInk.current, [])

  useImperativeHandle(ref, () => ({ getDataURL, clear, isEmpty }), [getDataURL, clear, isEmpty])

  const coords = (e) => {
    const c = canvasRef.current
    if (!c) return { x: 0, y: 0 }
    const r = c.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * c.width
    const y = ((e.clientY - r.top) / r.height) * c.height
    return { x, y }
  }

  const line = (from, to) => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext("2d")
    ctx.strokeStyle = "#0f172a"
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    hasInk.current = true
  }

  const onDown = (e) => {
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* */
    }
    drawing.current = true
    last.current = coords(e)
  }

  const onMove = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const p = coords(e)
    if (last.current) line(last.current, p)
    last.current = p
  }

  const onUp = (e) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* */
    }
    drawing.current = false
    last.current = null
  }

  const w = Math.max(80, Number(width) || 320)
  const h = Math.max(60, Number(height) || 130)

  return (
    <div style={{ marginTop: 8 }}>
      {label ? (
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      ) : null}
      {hint ? (
        <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 6 }}>{hint}</div>
      ) : null}
      <canvas
        ref={canvasRef}
        width={w}
        height={h}
        style={{
          display: "block",
          width: w,
          height: h,
          border: "1px solid #cbd5e1",
          borderRadius: 6,
          touchAction: "none",
          cursor: "crosshair",
          background: "#fff",
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
    </div>
  )
})
