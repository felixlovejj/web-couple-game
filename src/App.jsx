import * as THREE from 'three'
import JSConfetti from 'js-confetti'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import './App.css'

import BattleLobby from './game/BattleLobby'
import ErrorBoundary from './game/ErrorBoundary'
import GamePage from './game/GamePage'

const API_BASE = '/api/scratch'
const AUTH_BASE = '/api/auth'
const SHOP_BASE = '/api/shop'

// --- auth helpers ---

async function apiPost(path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = 'Bearer ' + token
  const r = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body || {}) })
  const text = await r.text()
  try { const j = JSON.parse(text); if (!r.ok) throw new Error(j.error || '请求失败'); return j }
  catch (e) { if (e.message && !e.message.includes('JSON')) throw e; throw new Error('服务器响应异常 (' + r.status + ')') }
}

async function apiGet(path, token) {
  const headers = {}
  if (token) headers['Authorization'] = 'Bearer ' + token
  const r = await fetch(path, { headers })
  const text = await r.text()
  try { const j = JSON.parse(text); if (!r.ok) throw new Error(j.error || '请求失败'); return j }
  catch (e) { if (e.message && !e.message.includes('JSON')) throw e; throw new Error('服务器响应异常 (' + r.status + ')') }
}

// --- game helpers ---

const generateNumbers = () => {
  const arr = Array.from({ length: 100 }).fill().map((_, i) => i)
  return Array.from({ length: 18 }).fill().map(() => {
    const random = Math.floor(Math.random() * arr.length)
    return arr.splice(random, 1)[0]
  })
}

const toLocalPoint = point => {
  const heightRatio = 512 / 6.656
  const widthRatio = 280 / 3.64
  return { x: point.x * widthRatio + 140, y: point.y * heightRatio + 256 }
}

const getPrizeIndex = (luckyNumber, numbers) => {
  const today = new Date().getDate()
  const result = []
  for (let i = 0; i < numbers.length; i++) {
    const num = numbers[i]
    if (num === luckyNumber && num === today) result.push({ index: i, type: 'both' })
    else if (num === luckyNumber) result.push({ index: i, type: 'lucky' })
    else if (num === today) result.push({ index: i, type: 'date' })
  }
  return result
}

const prizeValues = [5, 10, 15, 20, 25, 30, 50, 80, 100, 150, 200, 300, 500, 888]
const prizeWeights = [119, 98, 77, 63, 49, 38, 21, 13, 7, 3, 1, 1, 1, 1]
const weightedPrize = () => {
  const total = prizeWeights.reduce((s, w) => s + w, 0)
  let r = Math.random() * total
  for (let i = 0; i < prizeValues.length; i++) { r -= prizeWeights[i]; if (r <= 0) return prizeValues[i] }
  return prizeValues[prizeValues.length - 1]
}

// --- Login Page ---

function LoginPage({ onLogin }) {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async e => {
    e.preventDefault()
    if (!username || !password) { setError('请填写用户名和密码'); return }
    setError(''); setLoading(true)
    try {
      const endpoint = mode === 'login' ? AUTH_BASE + '/login' : AUTH_BASE + '/register'
      const res = await apiPost(endpoint, { username, password })
      onLogin(res.token, username)
    } catch (e) { setError(e.message || '网络错误') }
    finally { setLoading(false) }
  }

  return (
    <div className='login-page'>
      <div className='login-card'>
        <div className='login-logo'>🎫</div>
        <h1 className='login-title'>刮刮乐</h1>
        <p className='login-sub'>{mode === 'login' ? '登录继续' : '注册新账号'}</p>
        <form onSubmit={handleSubmit} className='login-form'>
          <div className='login-field'>
            <input type='text' placeholder='用户名' value={username} onChange={e => setUsername(e.target.value)} maxLength={20} autoFocus />
          </div>
          <div className='login-field'>
            <input type='password' placeholder='密码' value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          {error && <p className='login-error'>{error}</p>}
          <button className='login-btn' type='submit' disabled={loading}>{loading ? '...' : (mode === 'login' ? '登录' : '注册')}</button>
        </form>
        <p className='login-switch'>
          {mode === 'login' ? <>还没有账号？<span onClick={() => { setMode('register'); setError('') }}>去注册</span></> : <>已有账号？<span onClick={() => { setMode('login'); setError('') }}>去登录</span></>}
        </p>
      </div>
    </div>
  )
}

// --- Main Page ---

function MainPage({ balance, scratchCards, lastSignInDate, username, onSignIn, onBuyCard, onStartScratch, onLogout, onBattle, onShop, disabled = {} }) {
  const today = new Date().toDateString()
  const hasSignedIn = lastSignInDate === today || disabled['signin']
  const canBuy = balance >= 10
  const canScratch = scratchCards > 0

  return (
    <div className='main-page'>
      <div className='main-header'>
        <div className='main-top-bar'>
          <span className='user-badge'>👤 {username}</span>
          <button className='logout-btn' onClick={onLogout}>退出</button>
        </div>
        <h1 className='main-title'>刮刮乐</h1>
        <p className='main-subtitle'>每天都有小惊喜</p>
      </div>
      <div className='balance-card'>
        <span className='balance-label'>余额</span>
        <span className='balance-amount'>¥{balance}</span>
      </div>
      <div className='card-count-badge'>
        <span className='card-count-icon'>🎫</span>
        <span className='card-count-text'>刮刮乐 × {scratchCards} 张</span>
      </div>
      <div className='actions'>
        <button className='action-btn sign-in-btn' onClick={onSignIn} disabled={hasSignedIn}>
          <span className='btn-icon'>{hasSignedIn ? '✅' : '✨'}</span>
          <span className='btn-text'>{hasSignedIn ? '今日已签到' : '每日签到'}</span>
          <span className='btn-hint'>签到得 1 张刮刮乐</span>
        </button>
        <button className='action-btn buy-btn' onClick={onBuyCard} disabled={!canBuy}>
          <span className='btn-icon'>🛒</span>
          <span className='btn-text'>购买刮刮乐</span>
          <span className='btn-hint'>¥10 / 张{!canBuy && '（余额不足）'}</span>
        </button>
        <button className='action-btn scratch-btn' onClick={onStartScratch} disabled={!canScratch}>
          <span className='btn-icon'>🎮</span>
          <span className='btn-text'>开始刮奖</span>
          <span className='btn-hint'>{canScratch ? `剩余 ${scratchCards} 张` : '暂无刮刮乐'}</span>
        </button>
        <div className='sub-actions'>
          <button className='sub-action-btn battle-btn' onClick={onBattle}>⚔️ 暗棋迷阵</button>
          <button className='sub-action-btn' onClick={onShop}>🏪 商店</button>
        </div>
      </div>
    </div>
  )
}

// --- Scratch Page ---

function ScratchPage({ remainingCards, onBack, onNewCard, guaranteedPrize }) {
  const container = useRef()
  const lastRAF = useRef(null)
  const isDown = useRef(false)
  const pointer = useRef(new THREE.Vector2())
  const intersectPoints = useRef([])
  const luckyNumber = useRef(Math.floor(Math.random() * 100))
  const numbers = useRef(generateNumbers())
  const prizeIndex = useRef(getPrizeIndex(luckyNumber.current, numbers.current))
  const initialPrizeIndices = useRef([...prizeIndex.current])
  const guaranteedPosRef = useRef(-1)
  const guaranteedDataRef = useRef(null)
  const scratchCheckCounter = useRef(0)
  const cardPrizes = useRef(Array.from({ length: 18 }, () => weightedPrize()))
  const guaranteedSetupDone = useRef(false)

  if (guaranteedPrize && !guaranteedSetupDone.current) {
    const pos = Math.floor(Math.random() * 18)
    guaranteedPosRef.current = pos; guaranteedDataRef.current = guaranteedPrize; guaranteedSetupDone.current = true
    if (!prizeIndex.current.some(p => p.index === pos)) {
      prizeIndex.current.push({ index: pos, type: 'guaranteed' })
      initialPrizeIndices.current.push({ index: pos, type: 'guaranteed' })
    }
  } else if (!guaranteedPrize) { guaranteedPosRef.current = -1; guaranteedDataRef.current = null; guaranteedSetupDone.current = false }

  const [result, setResult] = useState(null)
  const [canConfirm, setCanConfirm] = useState(false)

  const scene = useMemo(() => new THREE.Scene(), [])
  const camera = useMemo(() => new THREE.PerspectiveCamera(75, window.innerWidth / (window.innerHeight * 0.8), 0.1, 1000), [])
  const renderer = useMemo(() => new THREE.WebGLRenderer({ antialias: true }), [])
  const ambientLight = useMemo(() => new THREE.AmbientLight(0x000000), [])
  const directionalLight = useMemo(() => new THREE.DirectionalLight(0xffffff, 2.4), [])
  const image = useMemo(() => { const img = new Image(280, 512); img.src = 'textures/bg.png'; return img }, [])
  const canvas0 = useMemo(() => { const c = document.createElement('canvas'); c.width = 280; c.height = 512; return c }, [])
  const canvas1 = useMemo(() => { const c = document.createElement('canvas'); c.width = 280; c.height = 512; return c }, [])
  const combineCanvas = useMemo(() => { const c = document.createElement('canvas'); c.width = 280; c.height = 512; return c }, [])
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42 }), [])
  const geometry = useMemo(() => new THREE.PlaneGeometry(3.64, 6.656), [])

  const getScratchPercent = useCallback(() => {
    const ctx = canvas1.getContext('2d')
    const imageData = ctx.getImageData(20, 287, 240, 151)
    const pixels = imageData.data
    let transparent = 0
    for (let i = 3; i < pixels.length; i += 4) { if (pixels[i] === 0) transparent++ }
    return transparent / (240 * 151)
  }, [canvas1])

  const draw = useCallback(() => {
    const ctx1 = canvas1.getContext('2d')
    const combineCtx = combineCanvas.getContext('2d')
    const len = intersectPoints.current.length
    intersectPoints.current.slice(Math.max(0, len - 10), len).forEach(p => {
      const point = toLocalPoint(p)
      ctx1.save(); ctx1.globalCompositeOperation = 'destination-out'
      ctx1.beginPath(); ctx1.arc(point.x, point.y, 12, 0, Math.PI * 2); ctx1.fill(); ctx1.restore()
      const index = prizeIndex.current.findIndex(i => {
        const x = 34 + Math.trunc(i.index % 6) * 38; const y = 312 + Math.trunc(i.index / 6) * 48
        if (point.x >= x - 20 && point.x <= x + 20 && point.y >= y - 20 && point.y <= y + 20) {
          const jsConfetti = new JSConfetti(); jsConfetti.addConfetti({ confettiRadius: 4, confettiNumber: 256 }); return true
        }
      })
      if (index !== -1) prizeIndex.current.splice(index, 1)
    })
    combineCtx.drawImage(canvas0, 0, 0); combineCtx.drawImage(canvas1, 0, 0)
    material.map = new THREE.CanvasTexture(combineCanvas); material.needsUpdate = true
    scratchCheckCounter.current++
    if (scratchCheckCounter.current % 5 === 0 && getScratchPercent() >= 0.8) setCanConfirm(true)
  }, [canvas0, canvas1, combineCanvas, material, getScratchPercent])

  const fitText = (ctx, text, cellX, cellY, maxWidth, maxSize, color) => {
    let size = maxSize; ctx.font = `bold ${size}px sans`
    while (ctx.measureText(text).width > maxWidth && size > 7) { size--; ctx.font = `bold ${size}px sans` }
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(text, cellX + 19, cellY); ctx.textAlign = 'start'
  }

  const card = useMemo(() => {
    const ctx0 = canvas0.getContext('2d'); const ctx1 = canvas1.getContext('2d'); const combineCtx = combineCanvas.getContext('2d')
    image.onload = () => {
      ctx0.globalCompositeOperation = 'source-over'; ctx0.drawImage(image, 0, 0, 280, 512)
      ctx1.fillStyle = '#ccc'; ctx1.beginPath(); ctx1.arc(227.5, 238, 28, 0, 2 * Math.PI, false); ctx1.fill()
      ctx1.beginPath(); ctx1.roundRect(20, 287.5, 240, 150, 4); ctx1.fill()
      const today = new Date().getDate()
      ctx0.fillStyle = 'white'; ctx0.font = '36px sans'; ctx0.fillText(today.toString().padStart(2, '0'), 31, 252)
      ctx0.fillStyle = 'white'; ctx0.font = '36px sans'; ctx0.fillText(luckyNumber.current.toString().padStart(2, '0'), 206, 252)
      numbers.current.forEach((num, i) => {
        const x = 34 + Math.trunc(i % 6) * 38; const y = 312 + Math.trunc(i / 6) * 48
        const isWinner = (num === luckyNumber.current || num === today)
        const isGuaranteedPos = i === guaranteedPosRef.current; const gp = guaranteedDataRef.current
        if (isGuaranteedPos && gp) { const cellWidth = 38; fitText(ctx0, gp.number, x, y, cellWidth, 20, '#ffcc16'); fitText(ctx0, gp.amount, x, y + 18, cellWidth, 14, '#ffcc16') }
        else {
          ctx0.fillStyle = isWinner ? '#ffcc16' : 'white'; ctx0.font = '16px sans'; ctx0.fillText(num.toString().padStart(2, '0'), x, y)
          const amountText = `￥${cardPrizes.current[i]}`; ctx0.fillStyle = isWinner ? '#ffcc16' : 'white'; ctx0.font = '12px sans'; ctx0.fillText(amountText, x - ctx0.measureText(amountText).width / 4, y + 16)
        }
      })
      combineCtx.drawImage(canvas0, 0, 0); combineCtx.drawImage(canvas1, 0, 0)
      material.map = new THREE.CanvasTexture(combineCanvas); material.needsUpdate = true
    }
    const card = new THREE.Mesh(geometry, material); card.name = 'card'; return card
  }, [geometry, material, draw])

  const [mouse, setMouse] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const initRenderer = () => {
      camera.aspect = window.innerWidth / (window.innerHeight * 0.8); camera.updateProjectionMatrix()
      renderer.setPixelRatio(window.devicePixelRatio); renderer.setSize(window.innerWidth, (window.innerHeight * 0.8)); renderer.setClearColor(0, 0)
      if (container.current.children.length === 0) container.current.appendChild(renderer.domElement)
    }
    initRenderer(); window.addEventListener('resize', initRenderer)
    return () => { window.removeEventListener('resize', initRenderer); renderer.dispose() }
  }, [renderer, camera])

  useEffect(() => {
    scene.add(card); scene.add(ambientLight); directionalLight.position.set(-0.5, 1.2, 2); scene.add(directionalLight); camera.position.z = 5
  }, [scene, camera, ambientLight, card, directionalLight])

  useEffect(() => {
    const animate = () => {
      lastRAF.current = requestAnimationFrame(animate)
      const targetRotationX = (Math.PI / 16) * Math.max(-1, Math.min(1, mouse.x))
      const targetRotationY = (Math.PI / 36) * Math.max(-1, Math.min(1, mouse.y))
      card.rotation.x += (targetRotationY - card.rotation.x) * 0.1; card.rotation.y += (targetRotationX - card.rotation.y) * 0.04
      const vector = new THREE.Vector3(pointer.current.x, pointer.current.y, 0.5).unproject(camera)
      const raycaster = new THREE.Raycaster(camera.position, vector.sub(camera.position).normalize())
      const intersects = raycaster.intersectObjects(scene.children)
      if (intersects.length > 0 && isDown.current) {
        const hit = intersects.find(({ object }) => object.name === 'card')
        if (hit) { card.updateMatrixWorld(true); intersectPoints.current.push(card.worldToLocal(hit.point.clone())); draw() }
      }
      renderer.render(scene, camera)
    }
    animate()
    return () => { if (lastRAF.current !== null) cancelAnimationFrame(lastRAF.current) }
  }, [scene, camera, mouse, material, card, draw])

  useEffect(() => {
    const el = container.current; if (!el) return
    const canvasRect = () => renderer.domElement.getBoundingClientRect()
    const mouseHandler = event => { const r = canvasRect(); setMouse({ x: ((event.clientX - r.left) / r.width) * 2 - 1, y: ((event.clientY - r.top) / r.height) * 2 - 1 }) }
    const touchHandler = event => { event.preventDefault(); const r = canvasRect(); setMouse({ x: ((event.changedTouches[0].clientX - r.left) / r.width) * 2 - 1, y: ((event.changedTouches[0].clientY - r.top) / r.height) * 2 - 1 }) }
    const endHandler = () => setMouse({ x: 0, y: 0 })
    el.addEventListener('mousemove', mouseHandler); el.addEventListener('mouseup', endHandler); el.addEventListener('mouseleave', endHandler)
    el.addEventListener('touchmove', touchHandler, { passive: false }); el.addEventListener('touchend', endHandler); el.addEventListener('touchcancel', endHandler)
    return () => { el.removeEventListener('mousemove', mouseHandler); el.removeEventListener('mouseup', endHandler); el.removeEventListener('mouseleave', endHandler); el.removeEventListener('touchmove', touchHandler); el.removeEventListener('touchend', endHandler); el.removeEventListener('touchcancel', endHandler) }
  }, [])

  useEffect(() => {
    const el = container.current; if (!el) return
    const getNDC = (clientX, clientY) => { const rect = renderer.domElement.getBoundingClientRect(); return { x: ((clientX - rect.left) / rect.width) * 2 - 1, y: ((clientY - rect.top) / rect.height) * 2 - 1 } }
    const mouseMoveHandler = event => { const ndc = getNDC(event.clientX, event.clientY); pointer.current.x = ndc.x; pointer.current.y = ndc.y }
    const mouseDownHandler = event => { isDown.current = true; mouseMoveHandler(event) }
    const mouseUpHandler = event => { isDown.current = false; mouseMoveHandler(event) }
    const touchMoveHandler = event => { event.preventDefault(); const ndc = getNDC(event.changedTouches[0].clientX, event.changedTouches[0].clientY); pointer.current.x = ndc.x; pointer.current.y = ndc.y }
    const touchStartHandler = event => { event.preventDefault(); isDown.current = true; touchMoveHandler(event) }
    const touchEndHandler = event => { isDown.current = false; touchMoveHandler(event) }
    el.addEventListener('mousedown', mouseDownHandler); el.addEventListener('mousemove', mouseMoveHandler); el.addEventListener('mouseup', mouseUpHandler); el.addEventListener('mouseleave', mouseUpHandler)
    el.addEventListener('touchstart', touchStartHandler, { passive: false }); el.addEventListener('touchmove', touchMoveHandler, { passive: false }); el.addEventListener('touchend', touchEndHandler); el.addEventListener('touchcancel', touchEndHandler)
    return () => { el.removeEventListener('mousedown', mouseDownHandler); el.removeEventListener('mousemove', mouseMoveHandler); el.removeEventListener('mouseup', mouseUpHandler); el.removeEventListener('mouseleave', mouseUpHandler); el.removeEventListener('touchstart', touchStartHandler); el.removeEventListener('touchmove', touchMoveHandler); el.removeEventListener('touchend', touchEndHandler); el.removeEventListener('touchcancel', touchEndHandler) }
  }, [])

  const handleConfirm = useCallback(() => {
    const stillWinning = new Set(prizeIndex.current.map(p => p.index))
    const revealed = initialPrizeIndices.current.filter(i => !stillWinning.has(i.index))
    let prizeWon = 0, cardsWon = 0, hasLucky = false, hasDate = false
    revealed.forEach(i => {
      if (i.type === 'lucky' || i.type === 'both') hasLucky = true
      if (i.type === 'date' || i.type === 'both') hasDate = true
      if (i.index === guaranteedPosRef.current && guaranteedDataRef.current) { const gp = guaranteedDataRef.current; if (gp.type === 'card') cardsWon += gp.value; else prizeWon += gp.value }
      else prizeWon += cardPrizes.current[i.index]
    })
    if (hasLucky && hasDate && prizeWon > 0) prizeWon *= 2
    setResult({ prizeWon, cardsWon, revealed: revealed.map(r => r.index) })
  }, [])

  const handleNewCard = useCallback(() => { onNewCard(result?.prizeWon || 0, result?.cardsWon || 0) }, [result, onNewCard])
  const handleBack = useCallback(() => { onBack(result?.prizeWon || 0, result?.cardsWon || 0) }, [result, onBack])

  return (
    <div className='scratch-page'>
      <div className='scratch-top-bar'>
        <button className='top-bar-btn' onClick={handleBack}>← 返回</button>
        {!result && (
          <button className='top-bar-btn confirm-btn' onClick={handleConfirm} disabled={!canConfirm} style={canConfirm ? {} : { opacity: 0.5 }}>
            确认结果{!canConfirm && '（刮开至少80%）'}
          </button>
        )}
      </div>
      <div className='container' ref={container} />
      {result && (
        <div className='result-overlay'>
          <div className='result-card'>
            {(result.prizeWon > 0 || result.cardsWon > 0) ? (
              <>
                <div className='result-emoji'>🎉</div>
                <p className='result-title'>恭喜中奖！</p>
                {result.prizeWon > 0 && <p className='result-amount'>¥{result.prizeWon}</p>}
                {result.cardsWon > 0 && <p className='result-sub' style={{fontSize: 16, fontWeight: 700, color: '#c0392b', margin: '8px 0'}}>刮刮乐 +{result.cardsWon} 张</p>}
                <p className='result-sub'>揭开了 {result.revealed.length} 个中奖号码</p>
              </>
            ) : (
              <>
                <div className='result-emoji'>😅</div>
                <p className='result-title'>未中奖</p>
                <p className='result-sub'>下次好运！</p>
              </>
            )}
            <div className='result-actions'>
              {remainingCards > 0 && <button className='result-btn primary' onClick={handleNewCard}>再来一张（剩 {remainingCards} 张）</button>}
              <button className='result-btn' onClick={handleBack}>返回主页</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Shop Page ---

function ShopPage({ token, username, onBack }) {
  const [items, setItems] = useState([])
  const [inventory, setInventory] = useState({})
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [buyLoading, setBuyLoading] = useState({})

  const loadData = useCallback(async () => {
    try {
      const [itemsRes, invRes, stateRes] = await Promise.all([apiGet(SHOP_BASE + '/items', token), apiGet(SHOP_BASE + '/inventory', token), apiGet(AUTH_BASE + '/me', token)])
      setItems(itemsRes.items || []); setInventory(invRes.inventory || {}); setBalance(stateRes.balance || 0)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [token])
  useEffect(() => { loadData() }, [loadData])

  const handleBuy = async (itemId) => {
    setBuyLoading(prev => ({ ...prev, [itemId]: true }))
    try { const res = await apiPost(SHOP_BASE + '/buy', { itemId }, token); setBalance(res.balance); setInventory(res.inventory || {}) }
    catch (e) { setError(e.message) } finally { setBuyLoading(prev => ({ ...prev, [itemId]: false })) }
  }

  if (loading) return <div className='shop-page'><div className='loading-screen'><div className='loading-spinner' /></div></div>

  return (
    <div className='shop-page'>
      <div className='shop-header'>
        <button className='top-bar-btn' onClick={onBack}>← 返回</button>
        <h1 className='shop-title'>🏪 商店</h1>
        <div className='shop-balance'>¥{balance}</div>
      </div>
      {error && <p className='shop-error'>{error}</p>}
      <div className='shop-items'>
        {items.map(item => {
          const count = inventory[item.id] || 0; const canBuy = balance >= item.price
          return (
            <div key={item.id} className='shop-item'>
              <div className='shop-item-info'>
                <div className='shop-item-name'>{item.name}</div>
                <div className='shop-item-desc'>{item.desc}</div>
                <div className='shop-item-price'>¥{item.price}</div>
              </div>
              <div className='shop-item-actions'>
                {count > 0 && <span className='shop-item-count'>×{count}</span>}
                <button className='btn-small btn-primary' onClick={() => handleBuy(item.id)} disabled={!canBuy || buyLoading[item.id]}>{buyLoading[item.id] ? '...' : '购买'}</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- App (Root) ---

function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [page, setPage] = useState('main')
  const [scratchKey, setScratchKey] = useState(0)
  const [gameRoomId, setGameRoomId] = useState(null)
  const [state, setState] = useState({ balance: 0, scratchCards: 0, lastSignInDate: null })
  const [loading, setLoading] = useState(true)
  const [activeOps, setActiveOps] = useState({})
  const [guaranteedPrize, setGuaranteedPrize] = useState(null)

  useEffect(() => {
    const savedToken = localStorage.getItem('token')
    const savedUser = localStorage.getItem('username')
    if (savedToken && savedUser) {
      apiGet(AUTH_BASE + '/me', savedToken).then(data => {
        if (data.ok) { setUser({ username: data.username, token: savedToken }); setState({ balance: data.balance, scratchCards: data.scratchCards, lastSignInDate: data.lastSignInDate }) }
        else { localStorage.removeItem('token'); localStorage.removeItem('username') }
        setAuthLoading(false)
      }).catch(() => { setAuthLoading(false) })
    } else { setAuthLoading(false) }
  }, [])

  useEffect(() => {
    if (!user) return
    apiGet(API_BASE + '/state', user.token).then(data => { setState(data); setLoading(false) }).catch(() => setLoading(false))
  }, [user])

  const token = user?.token

  const handleLogin = (t, username) => { localStorage.setItem('token', t); localStorage.setItem('username', username); setUser({ username, token: t }) }
  const handleLogout = async () => { if (token) { try { await apiPost(AUTH_BASE + '/logout', {}, token) } catch {} }; localStorage.removeItem('token'); localStorage.removeItem('username'); setUser(null) }

  const withOp = (name, fn) => async () => {
    if (activeOps[name] || !token) return; setActiveOps(prev => ({ ...prev, [name]: true })); try { await fn() } finally { setActiveOps(prev => ({ ...prev, [name]: false })) }
  }

  const handleSignIn = withOp('signin', async () => { const res = await apiPost(API_BASE + '/signin', {}, token); setState(prev => ({ ...prev, scratchCards: res.scratchCards, balance: res.balance, lastSignInDate: res.lastSignInDate })) })
  const handleBuyCard = withOp('buy', async () => { const res = await apiPost(API_BASE + '/buy', {}, token); setState(prev => ({ ...prev, balance: res.balance, scratchCards: res.scratchCards })) })
  const handleStartScratch = withOp('start', async () => { const res = await apiPost(API_BASE + '/start', {}, token); setState(prev => ({ ...prev, scratchCards: res.scratchCards })); setGuaranteedPrize(res.guaranteedPrize || null); setScratchKey(k => k + 1); setPage('scratch') })

  const handleScratchBack = async (prizeWon, cardsWon) => { const res = await apiPost(API_BASE + '/confirm', { prizeWon, cardsWon }, token); setState(prev => ({ ...prev, balance: res.balance, scratchCards: res.scratchCards })); setPage('main') }
  const handleScratchNewCard = async (prizeWon, cardsWon) => { const res = await apiPost(API_BASE + '/confirm', { prizeWon, cardsWon }, token); const res2 = await apiPost(API_BASE + '/start', {}, token); setState(prev => ({ ...prev, balance: res.balance, scratchCards: res2.scratchCards })); setGuaranteedPrize(res2.guaranteedPrize || null); setScratchKey(k => k + 1) }

  const handleBattle = () => { setPage('lobby') }
  const handleShop = () => { setPage('shop') }
  const handleEnterGame = (id) => { setGameRoomId(id); setPage('game') }
  const handleGameBack = async () => { if (token) { try { const data = await apiGet(AUTH_BASE + '/me', token); setState(prev => ({ ...prev, balance: data.balance })) } catch {} }; setPage('main') }
  const handleShopBack = async () => { if (token) { try { const data = await apiGet(AUTH_BASE + '/me', token); setState(prev => ({ ...prev, balance: data.balance })) } catch {} }; setPage('main') }

  // Scroll to top on page change
  useEffect(() => { window.scrollTo(0, 0) }, [page])

  if (authLoading) return <div className='loading-screen'><div className='loading-spinner' /></div>
  if (!user) return <LoginPage onLogin={handleLogin} />
  if (loading) return <div className='loading-screen'><div className='loading-spinner' /></div>

  if (page === 'scratch') return <ScratchPage key={scratchKey} remainingCards={state.scratchCards} onBack={handleScratchBack} onNewCard={handleScratchNewCard} guaranteedPrize={guaranteedPrize} />
  if (page === 'lobby') return <BattleLobby token={token} username={user.username} onBack={() => setPage('main')} onEnterGame={handleEnterGame} />
  if (page === 'game') return <ErrorBoundary><GamePage token={token} username={user.username} roomId={gameRoomId} onBack={handleGameBack} /></ErrorBoundary>
  if (page === 'shop') return <ShopPage token={token} username={user.username} onBack={handleShopBack} />

  return (
    <MainPage
      balance={state.balance} scratchCards={state.scratchCards} lastSignInDate={state.lastSignInDate}
      username={user.username} onSignIn={handleSignIn} onBuyCard={handleBuyCard} onStartScratch={handleStartScratch}
      onLogout={handleLogout} onBattle={handleBattle} onShop={handleShop} disabled={activeOps}
    />
  )
}

export default App
