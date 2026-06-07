import { useEffect, useState } from 'react'

const PIECE_EMOJI = { king: '👑', general: '⚔️', assassin: '🗡️', archer: '🏹', bomb: '💣', pawn: '🐴', scout: '🔭' }
const PIECE_NAME = { king: '王', general: '将', assassin: '刺客', archer: '弓', bomb: '炸弹', pawn: '兵', scout: '侦察兵' }

export default function CombatAnimation({ combat, onComplete }) {
  const [phase, setPhase] = useState('flipping') // flipping|reveal|result|done

  useEffect(() => {
    if (!combat) return
    setPhase('flipping')
    const t1 = setTimeout(() => setPhase('reveal'), 800)
    const t2 = setTimeout(() => setPhase('result'), 1600)
    const t3 = setTimeout(() => { setPhase('done'); onComplete?.() }, 3500)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [combat])

  if (!combat || phase === 'done') return null

  const attacker = combat.attacker
  const defender = combat.defender
  const result = combat.result

  const resultText = {
    attacker_win: '⚔️ 攻击方胜!',
    defender_win: '🛡️ 防守方胜!',
    mutual_death: '💀 同归于尽!',
    assassin_kill: '🗡️ 刺客必杀!',
    shield_block: '🛡️ 护盾抵挡!',
    king_killed: '👑 王被击杀! GAME OVER!',
    both_survive: '⚔️ 双方均存活',
  }

  const resultClass = {
    attacker_win: 'dc-result-win',
    defender_win: 'dc-result-lose',
    mutual_death: 'dc-result-mutual',
    assassin_kill: 'dc-result-assassin',
    shield_block: 'dc-result-shield',
    king_killed: 'dc-result-gameover',
    both_survive: 'dc-result-mutual',
  }

  return (
    <div className='dc-combat-overlay'>
      <div className='dc-combat-box'>
        <div className='dc-combat-pieces'>
          {/* Attacker */}
          <div className={`dc-combat-piece ${phase === 'flipping' ? 'dc-flip' : 'dc-flipped'}`}>
            <div className='dc-combat-piece-front'>
              <span className='dc-combat-emoji'>{PIECE_EMOJI[attacker?.type] || '❓'}</span>
              <span className='dc-combat-name'>{PIECE_NAME[attacker?.type] || '?'}</span>
            </div>
            <div className='dc-combat-piece-back'>❓</div>
          </div>

          <span className='dc-combat-vs'>VS</span>

          {/* Defender */}
          <div className={`dc-combat-piece ${phase === 'flipping' ? 'dc-flip' : 'dc-flipped'}`}>
            <div className='dc-combat-piece-front'>
              <span className='dc-combat-emoji'>{PIECE_EMOJI[defender?.type] || '❓'}</span>
              <span className='dc-combat-name'>{PIECE_NAME[defender?.type] || '?'}</span>
            </div>
            <div className='dc-combat-piece-back'>❓</div>
          </div>
        </div>

        {phase === 'result' && (
          <div className={`dc-combat-result ${resultClass[result] || ''}`}>
            <div className='dc-result-text'>{resultText[result] || result}</div>
            {combat.atkPower != null && (
              <div className='dc-result-powers'>
                {combat.atkPower} vs {combat.defPower}
              </div>
            )}
            {combat.atkHpBefore != null && (
              <div className='dc-result-hp'>
                攻击方: {combat.atkHpBefore}→{combat.atkHpAfter} HP
                | 防守方: {combat.defHpBefore}→{combat.defHpAfter} HP
              </div>
            )}
            {combat.log && <div className='dc-result-log'>{combat.log}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
