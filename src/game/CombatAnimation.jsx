import { useEffect, useState } from 'react'

const PIECE_EMOJI = {
  king: '👑', general: '⚔️', assassin: '🗡️', archer: '🏹', bomb: '💣', pawn: '🐴', scout: '🔭', unknown: '❓',
  horse: '🐴', monk: '🧘', rogue: '🥷', rat: '🐀', berserker: '💢', sage: '🧙', ironguard: '🛡️',
}

const PIECE_NAME = {
  king: '王', general: '将', assassin: '刺客', archer: '弓', bomb: '炸弹', pawn: '兵', scout: '侦察兵', unknown: '?',
  horse: '马', monk: '行者', rogue: '侠客', rat: '老鼠', berserker: '狂战', sage: '国师', ironguard: '铁卫',
}

export default function CombatAnimation({ combat, onComplete, gameMode }) {
  const [phase, setPhase] = useState('flipping')
  const [showDeathFx, setShowDeathFx] = useState(false)

  useEffect(() => {
    if (!combat) return
    setPhase('flipping')
    setShowDeathFx(false)

    const t1 = setTimeout(() => setPhase('reveal'), 600)
    const t2 = setTimeout(() => setPhase('result'), 1200)

    const defDies = combat.result === 'mutual_death' || combat.result === 'attacker_win' ||
      combat.result === 'assassin_kill' || combat.result === 'king_killed'
    const t3 = setTimeout(() => {
      if (defDies) setShowDeathFx(true)
      setPhase('done')
      onComplete?.()
    }, 2200)

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [combat])

  if (!combat || phase === 'done') return null

  const attacker = combat.attacker
  const defender = combat.defender
  const result = combat.result
  const isMist = gameMode === 'mist'

  const resultText = {
    attacker_win: '⚔️ 命中！',
    defender_win: '🛡️ 被反击！',
    mutual_death: '💀 同归于尽！',
    assassin_kill: '🗡️ 必杀！',
    shield_block: '🛡️ 被格挡！',
    king_killed: '👑 王陨落！',
    both_survive: '⚔️ 命中',
    monk_stun: '💫 眩晕！',
  }

  return (
    <div className='dc-combat-overlay' onClick={() => { setPhase('done'); onComplete?.() }}>
      <div className='dc-combat-box'>
        {phase === 'flipping' ? (
          <div className='dc-combat-piece dc-flip'>
            <div className='dc-combat-piece-back'>🎴</div>
          </div>
        ) : (
          <div className='dc-combat-piece dc-flipped'>
            <div className='dc-combat-piece-front'>
              <span className='dc-combat-emoji'>{PIECE_EMOJI[attacker?.type] || '❓'}</span>
              <span className='dc-combat-name'>{PIECE_NAME[attacker?.type] || '?'}</span>
            </div>
          </div>
        )}

        {phase === 'result' && !isMist && (
          <div className='dc-combat-result'>
            <div className='dc-result-text'>{resultText[result] || result}</div>
          </div>
        )}

        {phase === 'result' && isMist && showDeathFx && defender && (
          <div className='dc-combat-result' style={{ opacity: 0.5 }}>
            <div className='dc-result-text' style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }}>
              {PIECE_EMOJI[defender.type] || '❓'} 已消灭
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
