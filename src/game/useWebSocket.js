import { useCallback, useEffect, useRef, useState } from 'react'

export function useWebSocket(token, roomId, dispatch) {
  const wsRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const reconnectTimer = useRef(null)
  const pingTimer = useRef(null)
  const reconnectDelay = useRef(1000)
  const sendRef = useRef(null)

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= 1) return

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    let url = `${proto}//${host}/ws?token=${token}`
    if (roomId) url += `&roomId=${roomId}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      reconnectDelay.current = 1000
      pingTimer.current = setInterval(() => {
        if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' }))
      }, 15000)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        dispatch(msg)
      } catch {}
    }

    ws.onclose = () => {
      setConnected(false)
      if (pingTimer.current) clearInterval(pingTimer.current)
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000)
        connect()
      }, reconnectDelay.current)
    }

    ws.onerror = () => {}
  }, [token, roomId, dispatch])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (pingTimer.current) clearInterval(pingTimer.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [connect])

  // Use ref-based send that always reads the latest wsRef
  const send = useCallback((msg) => {
    const ws = wsRef.current
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(msg))
      return true
    }
    return false
  }, [])

  return { send, connected }
}
