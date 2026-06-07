import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const CARD_INFO = {
  scout: { name: '侦察', emoji: '🔍', desc: '查看对方一枚未揭示棋子', color: '#3498db', longDesc: '选择对方一枚未揭示的棋子，查看其真实身份。' },
  shield: { name: '护盾', emoji: '🛡️', desc: '己方棋子获得护盾', color: '#2980b9', longDesc: '为己方一枚棋子附加护盾，可抵消下一次攻击。' },
  swift: { name: '疾风', emoji: '⚡', desc: '本回合额外移动一枚棋子', color: '#f39c12', longDesc: '本回合可以额外移动一枚棋子，共可操作两枚。' },
  swap: { name: '换位', emoji: '🌀', desc: '交换己方两枚棋子位置', color: '#9b59b6', longDesc: '选择己方两枚棋子，交换它们在棋盘上的位置。' },
  disguise: { name: '伪装', emoji: '🎭', desc: '己方已揭示棋子变回未揭示', color: '#8e44ad', longDesc: '如果该棋子原来是揭开状态，使己方某个棋子变为未揭开状态，对手将看到❓。' },
  rage: { name: '狂暴', emoji: '🔥', desc: '己方棋子下次战斗力+3', color: '#e74c3c', longDesc: '己方一枚棋子进入狂暴状态，下次战斗攻击力+3。' },
  freeze: { name: '冰冻', emoji: '❄️', desc: '对方棋子下回合不能移动', color: '#1abc9c', longDesc: '冰冻对方一枚棋子，其下回合无法移动或攻击。' },
  foresight: { name: '全视', emoji: '👁️', desc: '查看对方手牌', color: '#34495e', longDesc: '查看对方所有手牌，制定针对性策略。' },
  compel: { name: '定向', emoji: '🎯', desc: '强制对方移动指定棋子', color: '#e67e22', longDesc: '强制对方移动指定的一枚棋子到随机合法位置。' },
  steal: { name: '偷取', emoji: '🃏', desc: '偷取对方一张手牌', color: '#c0392b', longDesc: '从对方手牌中随机偷取一张加入自己手牌。' },
  trap_mark: { name: '冰冻标记', emoji: '🧊', desc: '在空格放陷阱冰冻敌方', color: '#00bcd4', longDesc: '在空白格放置隐形陷阱。对方棋子移动到该格时会被冰冻1回合，无法行动。8回合后自动消失。' },
  phantom: { name: '幻影', emoji: '👻', desc: '在空格放幻影迷惑对手', color: '#ab47bc', longDesc: '在空白格放置幻影。对方看到该位置有未揭示的己方棋子。幻影被触碰或3回合后消失。' },
}

const HOLD_MS = 300

export default function CardHand({ hand, myTurn, onSelectCard, selectedCard, newCardIndex }) {
  const [popupData, setPopupData] = useState(null) // { index, phase:'card'|'center', rect } or null
  const holdTimer = useRef(null)
  const popupShowing = useRef(false) // sync flag for event handlers
  const wasLongPress = useRef(false) // true when hold timer fires, checked in click

  // Two-phase animation: first render at card pos (no transition), then center (with transition)
  useLayoutEffect(() => {
    if (!popupData || popupData.phase !== 'card') return
    const raf = requestAnimationFrame(() => {
      setPopupData(prev => prev ? { ...prev, phase: 'center' } : null)
    })
    return () => cancelAnimationFrame(raf)
  }, [popupData])

  // Keep ref in sync
  useEffect(() => {
    popupShowing.current = popupData != null
  }, [popupData])

  const dismiss = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
    if (popupData) {
      setPopupData(null)
    }
  }, [popupData])

  const handlePointerDown = useCallback((e, index) => {
    const cardEl = e.currentTarget
    const rect = cardEl.getBoundingClientRect()
    wasLongPress.current = false

    holdTimer.current = setTimeout(() => {
      holdTimer.current = null
      wasLongPress.current = true
      setPopupData({ index, phase: 'card', rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } })
    }, HOLD_MS)
  }, [])

  const handlePointerUp = useCallback(() => {
    if (holdTimer.current) {
      // Timer hadn't fired yet — quick tap, clear it and let click through
      clearTimeout(holdTimer.current)
      holdTimer.current = null
      return
    }
    // Popup was showing — hide it and consume the click
    setPopupData(null)
  }, [])

  const handleClick = useCallback((index) => {
    // If popup is showing or was a long press, don't select — only quick taps select
    if (popupData || wasLongPress.current) {
      wasLongPress.current = false
      return
    }
    if (myTurn) onSelectCard(index)
  }, [myTurn, onSelectCard, popupData])

  // Global pointerup to catch releases outside the card
  useEffect(() => {
    const onGlobalUp = () => {
      if (popupShowing.current) {
        setPopupData(null)
      }
      if (holdTimer.current) {
        clearTimeout(holdTimer.current)
        holdTimer.current = null
      }
    }
    window.addEventListener('pointerup', onGlobalUp)
    window.addEventListener('pointercancel', onGlobalUp)
    return () => {
      window.removeEventListener('pointerup', onGlobalUp)
      window.removeEventListener('pointercancel', onGlobalUp)
    }
  }, [])

  if (!hand || hand.length === 0) return null

  // Compute popup position style
  let popupStyle = null
  let popupInfo = null
  if (popupData) {
    popupInfo = CARD_INFO[hand[popupData.index]]
    const r = popupData.rect
    const cardCx = r.left + r.width / 2
    const cardCy = r.top + r.height / 2
    const screenCx = window.innerWidth / 2
    const screenCy = window.innerHeight / 2

    const dx = cardCx - screenCx
    const dy = cardCy - screenCy

    if (popupData.phase === 'card') {
      // Initial position: at card, small, no transition
      popupStyle = {
        left: screenCx + 'px',
        top: screenCy + 'px',
        transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(0.15)`,
        opacity: '0',
        transition: 'none',
        clipPath: 'inset(0% 30% 60% 30%)',
      }
    } else {
      // Animate to center with transition
      popupStyle = {
        left: screenCx + 'px',
        top: screenCy + 'px',
        transform: 'translate(-50%, -50%) scale(1)',
        opacity: '1',
        transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        clipPath: 'inset(0% 0% 0% 0%)',
      }
    }
  }

  return (
    <div className='dc-card-hand'>
      <div className='dc-card-hand-label'>密令卡 ({hand.length})</div>
      <div className='dc-card-list'>
        {hand.map((cardType, index) => {
          const info = CARD_INFO[cardType]
          if (!info) return null
          return (
            <div key={`${cardType}-${index}`} className={`dc-card-wrap ${newCardIndex === index ? 'dc-new-card' : ''}`}>
              <div
                className={`dc-card ${selectedCard === index ? 'dc-card-selected' : ''} ${!myTurn ? 'dc-card-disabled' : ''}`}
                style={{ borderColor: info.color }}
                onClick={() => handleClick(index)}
                onPointerDown={(e) => handlePointerDown(e, index)}
                onPointerUp={handlePointerUp}
                onPointerLeave={() => { if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null } }}
                onContextMenu={(e) => e.preventDefault()}
              >
                <span className='dc-card-emoji'>{info.emoji}</span>
                <span className='dc-card-name' style={{ color: info.color }}>{info.name}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Popup */}
      {popupData && popupInfo && (
        <>
          <div className='dc-card-popup-overlay' />
          <div className='dc-card-popup-macos' style={{ ...popupStyle, borderColor: popupInfo.color }}>
            <div className='dc-card-popup-header'>
              <span className='dc-card-popup-emoji'>{popupInfo.emoji}</span>
              <span className='dc-card-popup-name' style={{ color: popupInfo.color }}>{popupInfo.name}</span>
            </div>
            <div className='dc-card-popup-desc'>{popupInfo.longDesc || popupInfo.desc}</div>
            <div className='dc-card-popup-hint'>松开即关闭</div>
          </div>
        </>
      )}
    </div>
  )
}
