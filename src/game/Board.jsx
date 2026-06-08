import { PIECE_INFO } from './constants'

const COL_LABELS = ['A', 'B', 'C', 'D', 'E']

const PIECE_EMOJI = {
  king: '👑', general: '⚔️', assassin: '🗡️', archer: '🏹', bomb: '💣', pawn: '🐴', scout: '🔭', unknown: '❓',
  // Mist mode pieces
  horse: '🐴', monk: '🧘', rogue: '🥷', rat: '🐀', berserker: '💢', sage: '🧙', ironguard: '🛡️',
}

const PIECE_NAME = {
  king: '王', general: '将', assassin: '刺客', archer: '弓', bomb: '炸弹', pawn: '兵', scout: '侦察兵', unknown: '?',
  // Mist mode
  horse: '马', monk: '行者', rogue: '侠客', rat: '老鼠', berserker: '狂战', sage: '国师', ironguard: '铁卫',
}

export default function Board({ state, selectedPiece, legalMoves, onCellClick, myUsername, highlightedCells }) {
  if (!state || !state.board) return <div className='dc-board-empty'>等待棋盘...</div>

  const { board, myPieces, cracks, waterRows, treasures, opponentSelected, opponentMove, myTraps, myPhantoms } = state

  // Display rows from bottom (row 0 = player's deploy zone) to top (row 6 = enemy zone)
  const displayRows = []
  for (let r = 0; r < 7; r++) {
    const row = []
    for (let c = 0; c < 5; c++) {
      row.push(board[c]?.[r] || null)
    }
    displayRows.push(row)
  }

  const isMyPiece = (cell) => cell && cell.owner === myUsername
  const isEnemyPiece = (cell) => cell && cell.owner !== myUsername
  const isCrack = (c, r) => cracks?.some(cr => cr.col === c && cr.row === r)
  const isWater = (r) => waterRows?.includes(r)
  const isSelected = (c, r) => selectedPiece && selectedPiece.col === c && selectedPiece.row === r
  const isOpponentSelected = (c, r) => opponentSelected && opponentSelected.col === c && opponentSelected.row === r
  const isOpponentMoveFrom = (c, r) => opponentMove && opponentMove.fromCol === c && opponentMove.fromRow === r
  const isOpponentMoveTo = (c, r) => opponentMove && opponentMove.toCol === c && opponentMove.toRow === r
  const isLegalMove = (c, r) => legalMoves?.some(m => m.col === c && m.row === r)
  const isAttack = (c, r) => legalMoves?.some(m => m.col === c && m.row === r && m.isAttack)
  const isRemoteAttack = (c, r) => legalMoves?.some(m => m.col === c && m.row === r && m.isRemote)
  const isHorseAttack = (c, r) => legalMoves?.some(m => m.col === c && m.row === r && m.isHorseAttack)
  const isMonkStun = (c, r) => legalMoves?.some(m => m.col === c && m.row === r && m.isMonkStun)
  const isRogueJump = (c, r) => legalMoves?.some(m => m.col === c && m.row === r && m.isRogueJump)
  const isHighlighted = (c, r) => highlightedCells?.some(h => h.col === c && h.row === r)
  const hasMyTrap = (c, r) => myTraps?.some(t => t.col === c && t.row === r)
  const hasMyPhantom = (c, r) => myPhantoms?.some(p => p.col === c && p.row === r)

  const getPieceStatusIcons = (cell) => {
    if (!cell || !cell.revealed) return null
    const icons = []
    if (cell.shielded) icons.push('🛡️')
    if (cell.enraged) icons.push('🔥')
    if (cell.blessed) icons.push('🌈')
    return icons.length > 0 ? <span className='dc-piece-status'>{icons.join('')}</span> : null
  }

  return (
    <div className='dc-board'>
      {/* Column labels */}
      <div className='dc-board-header'>
        <div className='dc-board-corner' />
        {COL_LABELS.map(label => (
          <div key={label} className='dc-col-label'>{label}</div>
        ))}
      </div>

      {/* Board rows: row 6 at top (opponent), row 0 at bottom (mine) */}
      {[0, 1, 2, 3, 4, 5, 6].map(r => (
        <div key={r} className='dc-board-row'>
          <div className='dc-row-label'>{r + 1}</div>
          {Array.from({ length: 5 }, (_, c) => {
            const cell = board[c]?.[r]
            const crack = isCrack(c, r)
            const water = isWater(r)
            const selected = isSelected(c, r)
            const legal = isLegalMove(c, r)
            const atk = isAttack(c, r)
            const remote = isRemoteAttack(c, r)
            const my = isMyPiece(cell)
            const enemy = isEnemyPiece(cell)
            const oppSelected = isOpponentSelected(c, r)
            const oppMoveFrom = isOpponentMoveFrom(c, r)
            const oppMoveTo = isOpponentMoveTo(c, r)
            const myTrapHere = hasMyTrap(c, r)
            const myPhantomHere = hasMyPhantom(c, r)
            const isPhantomCell = cell?.phantom

            let cls = 'dc-cell'
            if (crack) cls += ' dc-crack'
            else if (water) cls += ' dc-water'
            if (selected) cls += ' dc-selected'
            if (oppSelected) cls += ' dc-opponent-selected'
            if (oppMoveFrom) cls += ' dc-opponent-move-from'
            if (oppMoveTo) cls += ' dc-opponent-move-to'
            if (legal && !atk) cls += ' dc-legal-move'
            if (atk) cls += ' dc-legal-attack'
            if (remote) cls += ' dc-legal-remote'
            if (isHorseAttack(c, r)) cls += ' dc-horse-attack'
            if (isMonkStun(c, r)) cls += ' dc-monk-stun'
            if (isRogueJump(c, r)) cls += ' dc-rogue-jump'
            if (my) cls += ' dc-my-piece'
            if (enemy) cls += ' dc-enemy-piece'
            if (isHighlighted(c, r)) cls += ' dc-cell-highlight'

            return (
              <div
                key={c}
                className={cls}
                onClick={() => onCellClick(c, r)}
              >
                {crack ? (
                  <span className='dc-crack-icon'>🪨</span>
                ) : isPhantomCell ? (
                  <div className='dc-piece-wrap'>
                    <span className='dc-piece dc-revealed' style={{ opacity: 0.6 }}>👻</span>
                    <span className='dc-piece-power'>幻影</span>
                  </div>
                ) : myTrapHere ? (
                  <div className='dc-piece-wrap'>
                    <span className='dc-trap-marker'>🧊</span>
                  </div>
                ) : cell ? (
                  <div className='dc-piece-wrap'>
                    <span className={`dc-piece ${cell.revealed ? 'dc-revealed' : 'dc-hidden'}`}>
                      {PIECE_EMOJI[cell.type] || '❓'}
                    </span>
                    {cell.revealed && cell.type !== 'unknown' && (
                      <span className='dc-piece-power'>
                        {cell.atk != null ? `⚔${cell.atk}` : getPower(cell)}
                      </span>
                    )}
                    {cell.revealed && cell.hp != null && cell.maxHp != null && (
                      <div className='dc-hp-hearts'>
                        {Array.from({ length: cell.maxHp }, (_, i) => (
                          <span key={i} className={`dc-heart ${i < cell.hp ? 'dc-heart-filled' : 'dc-heart-empty'}`}>♥</span>
                        ))}
                      </div>
                    )}
                    {getPieceStatusIcons(cell)}
                  </div>
                ) : null}
              </div>
            )
          })}
          <div className='dc-row-label'>{r + 1}</div>
        </div>
      ))}

      {/* Column labels bottom */}
      <div className='dc-board-header'>
        <div className='dc-board-corner' />
        {COL_LABELS.map(label => (
          <div key={label} className='dc-col-label'>{label}</div>
        ))}
      </div>
    </div>
  )
}

function getPower(cell) {
  if (!cell.revealed) return ''
  switch (cell.type) {
    case 'king': return '0'
    case 'general': return '5'
    case 'assassin': return '★'
    case 'archer': return '3'
    case 'bomb': return '💥'
    case 'pawn': return '2'
    default: return ''
  }
}
