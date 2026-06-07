import { useCallback, useEffect, useRef } from 'react'

const EMOJIS = ['🤔', '😎', '😱', '😤', '😢', '❤️', '💩']
const MAX_PARTICLES = 100

let nextId = 1

export default function EmojiBar({ onSendEmoji, receivedEmoji, disabled }) {
  const canvasRef = useRef(null)
  const particlesRef = useRef([])
  const holdTimersRef = useRef({})
  const lastReceivedIdRef = useRef(0)
  const rectsRef = useRef({})

  // Physics + render loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    function resize() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    let running = true

    function tick() {
      if (!running) return
      const now = Date.now()
      const parts = particlesRef.current
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]
        const age = now - p.born
        if (age > 3000) { parts.splice(i, 1); continue }

        // Physics
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.06

        // Bounce off edges
        if (p.x < 0) { p.x = 0; p.vx *= -0.85 }
        if (p.x > canvas.width) { p.x = canvas.width; p.vx *= -0.85 }
        if (p.y < 0) { p.y = 0; p.vy *= -0.85 }
        if (p.y > canvas.height) { p.y = canvas.height; p.vy *= -0.85 }

        // Friction
        p.vx *= 0.99
        p.vy *= 0.99

        // Render
        const opacity = age < 500 ? 1 : Math.max(0, 1 - (age - 500) / 2500)
        ctx.globalAlpha = opacity
        ctx.font = '32px serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(p.emoji, p.x, p.y)
      }

      ctx.globalAlpha = 1
      requestAnimationFrame(tick)
    }

    requestAnimationFrame(tick)

    return () => {
      running = false
      window.removeEventListener('resize', resize)
    }
  }, [])

  // Handle received emojis
  useEffect(() => {
    if (!receivedEmoji || receivedEmoji.length === 0 || disabled) return
    const last = receivedEmoji[receivedEmoji.length - 1]
    if (last && last.id !== lastReceivedIdRef.current) {
      lastReceivedIdRef.current = last.id
      spawn(last.emoji, true)
    }
  }, [receivedEmoji, disabled])

  const spawn = useCallback((emoji, fromOpponent) => {
    const parts = particlesRef.current
    if (parts.length >= MAX_PARTICLES) parts.splice(0, parts.length - MAX_PARTICLES + 10)

    const canvas = canvasRef.current
    const cw = canvas?.width || window.innerWidth
    const ch = canvas?.height || window.innerHeight

    let x, y, vx, vy
    if (fromOpponent) {
      // Received from opponent: fall from top
      x = cw * 0.2 + Math.random() * cw * 0.6
      // Fall from screen top center at ~45° angle
      x = cw * 0.2 + Math.random() * cw * 0.6
      y = -30
      vx = (Math.random() - 0.5) * 6
      vy = 3 + Math.random() * 4
    } else {
      // Self-emitted: from bottom buttons, shoot upward
      const rect = rectsRef.current[emoji]
      if (rect) {
        x = rect.x + rect.width / 2
        y = rect.y
      } else {
        x = cw / 2
        y = ch - 80
      }
      const angle = (Math.random() - 0.5) * Math.PI * 0.8 - Math.PI / 2
      const speed = 9 + Math.random() * 8
      vx = Math.cos(angle) * speed
      vy = Math.sin(angle) * speed
    }

    parts.push({ id: nextId++, emoji, x, y, vx, vy, born: Date.now() })
  }, [])

  const handlePointerDown = useCallback((emoji, e) => {
    // Store button rect for spawn positioning
    const rect = e.currentTarget.getBoundingClientRect()
    rectsRef.current[emoji] = rect

    // Send via WS + spawn local particle
    onSendEmoji(emoji)
    spawn(emoji)

    // Long press rapid fire
    holdTimersRef.current[emoji] = setInterval(() => {
      onSendEmoji(emoji)
      spawn(emoji)
    }, 100)
  }, [onSendEmoji, spawn])

  const handlePointerUp = useCallback((emoji) => {
    if (holdTimersRef.current[emoji]) {
      clearInterval(holdTimersRef.current[emoji])
      delete holdTimersRef.current[emoji]
    }
  }, [])

  // Cleanup hold timers and particles on unmount or when disabled
  useEffect(() => {
    if (disabled) {
      Object.values(holdTimersRef.current).forEach(clearInterval)
      holdTimersRef.current = {}
      particlesRef.current = []
      return
    }
  }, [disabled])

  // Cleanup hold timers on unmount
  useEffect(() => {
    const timers = holdTimersRef.current
    return () => { Object.values(timers).forEach(clearInterval) }
  }, [])

  return (
    <div className='dc-emoji-bar'>
      <canvas ref={canvasRef} className='dc-emoji-canvas' />
      {EMOJIS.map(emoji => (
        <button
          key={emoji}
          className='dc-emoji-btn'
          onPointerDown={(e) => handlePointerDown(emoji, e)}
          onPointerUp={() => handlePointerUp(emoji)}
          onPointerLeave={() => handlePointerUp(emoji)}
          onContextMenu={(e) => e.preventDefault()}
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}
