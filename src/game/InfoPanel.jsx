import { useEffect, useState } from 'react'

export default function InfoPanel({ state, myUsername }) {
  const [timer, setTimer] = useState(state?.timer || 0)

  useEffect(() => {
    setTimer(state?.timer || 0)
  }, [state?.timer, state?.turnNumber])

  useEffect(() => {
    if (timer <= 0 || !state?.myTurn) return
    const interval = setInterval(() => {
      setTimer(prev => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [timer, state?.myTurn])

  if (!state) return null

  const myPieces = state.myPieces || []
  const opponentPieces = state.opponentPieces || []
  const myAlive = myPieces.length
  const oppAlive = opponentPieces.length
  const myRevealed = myPieces.filter(p => p.revealed).length
  const oppRevealed = opponentPieces.filter(p => p.revealed).length

  const nextEvent = state.turnNumber > 0 ? (EVENT_INTERVAL - (state.turnNumber % EVENT_INTERVAL)) : EVENT_INTERVAL
  const nextCard = state.turnNumber > 0 ? (CARD_DRAW_INTERVAL - (state.turnNumber % CARD_DRAW_INTERVAL)) : CARD_DRAW_INTERVAL

  return (
    <div className='dc-info-panel'>
      <div className='dc-info-row'>
        <span className='dc-info-label'>回合</span>
        <span className='dc-info-value'>{state.turnNumber || 0}</span>
      </div>

      <div className='dc-info-row'>
        <span className='dc-info-label'>当前</span>
        <span className={`dc-info-value ${state.myTurn ? 'dc-info-myturn' : ''}`}>
          {state.myTurn ? '你的回合' : '对方回合'}
        </span>
      </div>

      <div className='dc-info-row dc-timer-row'>
        <span className='dc-info-label'>倒计时</span>
        <span className={`dc-info-value dc-timer ${state.myTurn && timer <= 10 ? 'dc-timer-low' : ''}`}>
          {state.myTurn ? `${timer}s` : '-'}
        </span>
      </div>

      <div className='dc-info-divider' />

      <div className='dc-info-row'>
        <span className='dc-info-label'>己方棋子</span>
        <span className='dc-info-value'>{myAlive}/7</span>
      </div>
      <div className='dc-info-row'>
        <span className='dc-info-label'>对方棋子</span>
        <span className='dc-info-value'>{oppAlive}/7</span>
      </div>

      <div className='dc-info-divider' />

      <div className='dc-info-row'>
        <span className='dc-info-label'>下次事件</span>
        <span className='dc-info-value'>{nextEvent}回合</span>
      </div>
      <div className='dc-info-row'>
        <span className='dc-info-label'>下次抽卡</span>
        <span className='dc-info-value'>{nextCard}回合</span>
      </div>

      <div className='dc-info-row'>
        <span className='dc-info-label'>手牌</span>
        <span className='dc-info-value'>你{state.myHand?.length || 0} / 对方{state.opponentHandCount || 0}</span>
      </div>

      {state.activeEffects?.flood && (
        <div className='dc-info-effect'>🌊 洪水中</div>
      )}
      {state.activeEffects?.galeNextTurn && (
        <div className='dc-info-effect'>🏃 疾风下回合</div>
      )}
    </div>
  )
}

const EVENT_INTERVAL = 6
const CARD_DRAW_INTERVAL = 4
