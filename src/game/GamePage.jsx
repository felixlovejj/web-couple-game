import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useWebSocket } from './useWebSocket'
import Board from './Board'
import DeployPhase from './DeployPhase'
import CardHand from './CardHand'
import CombatAnimation from './CombatAnimation'
import EventOverlay from './EventOverlay'
import TreasureAnimation from './TreasureAnimation'
import FreezeAnimation from './FreezeAnimation'
import GameOverScreen from './GameOverScreen'
import InfoPanel from './InfoPanel'
import EmojiBar from './EmojiBar'
import { SoundEffects } from './useSound'

const PIECE_EMOJI = { king: '👑', general: '⚔️', assassin: '🗡️', archer: '🏹', bomb: '💣', pawn: '🐴', scout: '🔭' }
const PIECE_NAME = { king: '王', general: '将', assassin: '刺客', archer: '弓', bomb: '炸弹', pawn: '兵', scout: '侦察兵' }

function gameReducer(state, action) {
  switch (action.type) {
    case 'welcome':
    case 'state_update':
      return { ...state, ...action.state, connected: true, opponentSelected: null }
    case 'room_joined':
      return { ...state, roomId: action.roomId }
    case 'game_start':
      return { ...state, status: 'playing' }
    case 'combat_result':
      return { ...state, combatAnimation: action.combat }
    case 'card_played':
      return { ...state, lastCardPlayed: { player: action.player, cardType: action.cardType } }
    case 'card_drawn':
      return { ...state, newCard: action.card }
    case 'card_result':
      return { ...state, cardResult: { cardType: action.cardType, result: action.result } }
    case 'event_triggered':
      return { ...state, eventAnimation: action.event }
    case 'treasure_triggered':
      return { ...state, treasureAnimation: action.treasure }
    case 'trap_triggered':
      return { ...state, trapAnimation: { frozenPlayer: action.frozenPlayer } }
    case 'clear_trap':
      return { ...state, trapAnimation: null }
    case 'turn_change':
      return { ...state, myTurn: action.turn === state.myUsername, turnNumber: action.turnNumber, opponentSelected: null }
    case 'game_over':
      return { ...state, status: 'finished', winner: action.winner, gameOverReason: action.reason, stats: action.stats }
    case 'opponent_disconnect':
      return { ...state, opponentDisconnected: true, disconnectTimer: action.timer }
    case 'opponent_reconnect':
      return { ...state, opponentDisconnected: false }
    case 'emoji':
      return { ...state, receivedEmojis: [...(state.receivedEmojis || []).slice(-9), { id: Date.now(), emoji: action.emoji }] }
    case 'draw_offer':
      return { ...state, drawOffer: action.from }
    case 'draw_rejected':
      return { ...state, drawOffer: null }
    case 'error':
      return { ...state, error: action.message }
    case 'clear_error':
      return { ...state, error: null }
    case 'set_selected':
      return { ...state, selectedPiece: action.piece, legalMoves: action.moves || [] }
    case 'clear_selection':
      return { ...state, selectedPiece: null, legalMoves: [] }
    case 'opponent_selected':
      return { ...state, opponentSelected: { col: action.col, row: action.row } }
    case 'opponent_moved':
      return { ...state, opponentMove: { fromCol: action.fromCol, fromRow: action.fromRow, toCol: action.toCol, toRow: action.toRow } }
    case 'clear_opponent_move':
      return { ...state, opponentMove: null }
    case 'clear_combat':
      return { ...state, combatAnimation: null }
    case 'clear_event':
      return { ...state, eventAnimation: null }
    case 'clear_treasure':
      return { ...state, treasureAnimation: null }
    case 'scout_result':
      return { ...state, scoutResult: action.revealed }
    case 'clear_scout_result':
      return { ...state, scoutResult: null }
    case 'clear_cardResult':
      return { ...state, cardResult: null, newCard: null }
    default:
      return state
  }
}

const initialState = {
  status: 'waiting',
  board: [],
  myPieces: [],
  opponentPieces: [],
  myHand: [],
  opponentHandCount: 0,
  myUsername: '',
  opponentUsername: '',
  player1: '',
  myTurn: false,
  turnNumber: 0,
  timer: 0,
  deployed: false,
  opponentDeployed: false,
  deployPiecesLeft: [],
  selectedPiece: null,
  legalMoves: [],
  combatAnimation: null,
  eventAnimation: null,
  treasureAnimation: null,
  trapAnimation: null,
  cardResult: null,
  connected: false,
  error: null,
  myStats: { kills: 0, cardsUsed: 0, treasuresFound: 0 },
  stats: {},
  receivedEmojis: [],
  opponentSelected: null,
  opponentMove: null,
  scoutResult: null,
  roomId: null,
}

export default function GamePage({ token, username, roomId, onBack }) {
  const [state, dispatch] = useReducer(gameReducer, { ...initialState, myUsername: username, roomId })
  const { send, connected } = useWebSocket(token, roomId, dispatch)

  const [selectedDeployPiece, setSelectedDeployPiece] = useState(null)
  const [selectedCardIndex, setSelectedCardIndex] = useState(null)
  const [pendingRetreat, setPendingRetreat] = useState(null)
  const [cardTarget, setCardTarget] = useState(null)
  const [newCardIndex, setNewCardIndex] = useState(null)
  const isMistMode = state.gameMode === 'mist'

  // Auto-clear scout result after 3s
  useEffect(() => {
    if (!state.scoutResult) return
    const t = setTimeout(() => dispatch({ type: 'clear_scout_result' }), 3000)
    return () => clearTimeout(t)
  }, [state.scoutResult])

  useEffect(() => {
    if (!state.trapAnimation) return
    const t = setTimeout(() => dispatch({ type: 'clear_trap' }), 2000)
    return () => clearTimeout(t)
  }, [state.trapAnimation])

  // Sound effects
  useEffect(() => { if (state.combatAnimation) SoundEffects.combat() }, [state.combatAnimation])
  useEffect(() => { if (state.eventAnimation) SoundEffects.event() }, [state.eventAnimation])
  useEffect(() => { if (state.treasureAnimation) SoundEffects.treasure() }, [state.treasureAnimation])
  useEffect(() => { if (state.trapAnimation) SoundEffects.freeze() }, [state.trapAnimation])
  useEffect(() => {
    if (state.status === 'finished' && state.winner === username) SoundEffects.victory()
    else if (state.status === 'finished' && state.winner) SoundEffects.defeat()
  }, [state.status])
  useEffect(() => {
    if (state.cardResult) SoundEffects.cardPlay()
  }, [state.cardResult])
  useEffect(() => {
    if (state.newCard && state.myHand) {
      SoundEffects.cardDraw()
      // Card will be added at the end of hand when state_update arrives
      setNewCardIndex(state.myHand.length)
      const t = setTimeout(() => setNewCardIndex(null), 1500)
      return () => clearTimeout(t)
    }
  }, [state.newCard])

  // Auto-clear error toasts after 5s
  useEffect(() => {
    if (!state.error) return
    const t = setTimeout(() => dispatch({ type: 'clear_error' }), 5000)
    return () => clearTimeout(t)
  }, [state.error])

  // Prevent text selection and long-press copy
  useEffect(() => {
    const prevent = (e) => e.preventDefault()
    document.addEventListener('selectstart', prevent)
    document.addEventListener('copy', prevent)
    return () => {
      document.removeEventListener('selectstart', prevent)
      document.removeEventListener('copy', prevent)
    }
  }, [])

  // Auto-clear opponent move animation after 600ms
  useEffect(() => {
    if (!state.opponentMove) return
    const t = setTimeout(() => dispatch({ type: 'clear_opponent_move' }), 600)
    return () => clearTimeout(t)
  }, [state.opponentMove])

  // Handle card results (scout/foresight) — non-blocking toasts
  useEffect(() => {
    if (state.cardResult) {
      const { cardType, result } = state.cardResult
      if (cardType === 'scout' && result) {
        dispatch({ type: 'error', message: `侦察: ${result.col}${result.row + 1} → ${PIECE_EMOJI[result.revealedType] || '?'} ${PIECE_NAME[result.revealedType] || result.revealedType}` })
      }
      if (cardType === 'foresight' && result) {
        const CARD_NAMES = { scout:'侦察', shield:'护盾', swift:'疾风', swap:'换位', disguise:'伪装', rage:'狂暴', freeze:'冰冻', foresight:'全视', compel:'定向', steal:'偷取' }
        const cards = result.hand?.map(c => CARD_NAMES[c] || c).join(', ') || '无'
        dispatch({ type: 'error', message: `对方手牌: ${cards}` })
      }
      dispatch({ type: 'clear_cardResult' })
    }
  }, [state.cardResult])

  // Card play handler (defined before handleCellClick so it's not stale in handleCellClick)
  const handlePlayCard = useCallback((cardType, targets) => {
    send({ type: 'play_card', cardType, targets })
    setSelectedCardIndex(null)
    setCardTarget(null)
    dispatch({ type: 'clear_selection' })
  }, [send])

  // Board click handler
  // Convert display coords to internal coords (server uses internal coords)
  const toInternal = useCallback((col, row) => {
    // Server flips board for P2: displayRow = isP1 ? internalRow : (6 - internalRow)
    // Reverse: internalRow = isP1 ? displayRow : (6 - displayRow)
    const isP1 = state.player1 === state.myUsername
    return { col, row: isP1 ? row : (6 - row) }
  }, [state.player1, state.myUsername])

  const handleCellClick = useCallback((col, row) => {
    if (state.status === 'deploying' && !state.deployed) {
      if (selectedDeployPiece) {
        send({ type: 'deploy', pieceType: selectedDeployPiece, col, row })
        setSelectedDeployPiece(null)
      }
      return
    }

    if (state.status !== 'playing' || !state.myTurn) return

    const cell = state.board[col]?.[row]

    // Card targeting mode
    if (selectedCardIndex != null) {
      const cardType = state.myHand[selectedCardIndex]
      if (!cardType) return

      // Multi-target cards (swap)
      if (cardType === 'swap') {
        if (cell && cell.owner === username) {
          const from = toInternal(col, row)
          if (!cardTarget || cardTarget.step === 1) {
            setCardTarget({ cardType: 'swap', step: 2, target1: { col: from.col, row: from.row } })
          } else if (cardTarget.step === 2) {
            const t1 = cardTarget.target1
            handlePlayCard('swap', { piece1Col: t1.col, piece1Row: t1.row, piece2Col: from.col, piece2Row: from.row })
            setCardTarget(null)
          }
        }
        return
      }

      // Single-target cards (require a piece on the cell)
      if (cardType && cell) {
        const from = toInternal(col, row)
        handlePlayCard(cardType, { targetCol: from.col, targetRow: from.row })
      }
      // Empty-target cards (trap_mark, phantom — click any cell including empty)
      if (cardType && !cell && (cardType === 'trap_mark' || cardType === 'phantom')) {
        const from = toInternal(col, row)
        handlePlayCard(cardType, { targetCol: from.col, targetRow: from.row })
      }
      return
    }

    // If we have a selected piece and click a legal move
    if (state.selectedPiece) {
      const move = state.legalMoves.find(m => m.col === col && m.row === row)
      if (move) {
        // Send display coordinates with move flags for mist mode
        const msg = {
          fromCol: state.selectedPiece.col,
          fromRow: state.selectedPiece.row,
          toCol: col,
          toRow: row,
        }
        if (move.isRemote) {
          msg.type = 'remote_attack'
        } else {
          msg.type = 'move_piece'
        }
        // Pass mist mode flags
        if (move.isRogueJump) msg.isRogueJump = true
        if (move.isMonkStun) msg.isMonkStun = true
        if (move.isHorseAttack) msg.isHorseAttack = true
        send(msg)
        dispatch({ type: 'clear_selection' })
        setSelectedCardIndex(null)
        return
      }
    }

    // Select own piece
    if (cell && cell.owner === username) {
      const moves = computeLegalMoves(state, col, row)
      SoundEffects.select()
      dispatch({ type: 'set_selected', piece: { col, row, type: cell.type }, moves })
      // Notify opponent about piece selection
      send({ type: 'piece_selected', col, row })
    } else {
      dispatch({ type: 'clear_selection' })
    }
  }, [state, username, send, selectedDeployPiece, selectedCardIndex, cardTarget, handlePlayCard, toInternal])

  // Deploy handlers - WS only, send display coords (server converts to internal)
  const handleDeploy = useCallback((pieceType, col, row) => {
    if (pieceType === 'undeploy') {
      send({ type: 'undeploy', col, row })
    } else {
      SoundEffects.deploy()
      send({ type: 'deploy', pieceType, col, row })
    }
    setSelectedDeployPiece(null)
  }, [send])

  const handleRandomDeploy = useCallback(() => {
    send({ type: 'random_deploy' })
    setSelectedDeployPiece(null)
  }, [send])

  const handleConfirmDeploy = useCallback(() => {
    send({ type: 'confirm_deploy' })
  }, [send])

  // Card selection handler
  const handleSelectCard = useCallback((index) => {
    if (!state.myTurn) return
    // Toggle off if same card clicked again
    if (selectedCardIndex === index) {
      setSelectedCardIndex(null)
      setCardTarget(null)
      return
    }
    const cardType = state.myHand[index]
    if (!cardType) return

    // Cards that don't need a target play immediately
    const noTargetCards = ['swift', 'foresight', 'steal']
    if (noTargetCards.includes(cardType)) {
      handlePlayCard(cardType, {})
      return
    }

    // Multi-target cards (swap needs 2 own pieces)
    if (cardType === 'swap') {
      setSelectedCardIndex(index)
      setCardTarget({ cardType, step: 1, target1: null })
      dispatch({ type: 'clear_selection' })
      return
    }

    // Empty-target cards (trap_mark, phantom — click empty cell)
    const emptyTargetCards = ['trap_mark', 'phantom']
    if (emptyTargetCards.includes(cardType)) {
      setSelectedCardIndex(index)
      setCardTarget(null)
      dispatch({ type: 'clear_selection' })
      return
    }

    // Single-target cards — click a board cell to target
    setSelectedCardIndex(index)
    setCardTarget(null)
    dispatch({ type: 'clear_selection' })
  }, [state.myTurn, state.myHand, handlePlayCard, selectedCardIndex])

  // Scout action handler
  const handleScout = useCallback((col, row) => {
    send({ type: 'scout_action', col, row })
    dispatch({ type: 'clear_selection' })
  }, [send])

  // Emoji handler
  const handleSendEmoji = useCallback((emoji) => {
    send({ type: 'emoji', emoji })
  }, [send])

  // Stable callbacks for animation completion (prevent re-triggering)
  const clearCombat = useCallback(() => dispatch({ type: 'clear_combat' }), [])
  const clearEvent = useCallback(() => dispatch({ type: 'clear_event' }), [])
  const clearTreasure = useCallback(() => dispatch({ type: 'clear_treasure' }), [])
  const clearTrap = useCallback(() => dispatch({ type: 'clear_trap' }), [])

  // Forfeit handler
  const handleForfeit = useCallback(() => {
    if (confirm('确定认输？')) {
      send({ type: 'forfeit' })
    }
  }, [send])

  // Compute highlighted cells when a card is selected for targeting
  const highlightedCells = useMemo(() => {
    if (selectedCardIndex == null || !state.myHand[selectedCardIndex]) return []
    const cardType = state.myHand[selectedCardIndex]
    const cells = []

    for (let c = 0; c < 5; c++) {
      for (let r = 0; r < 7; r++) {
        const cell = state.board[c]?.[r]
        if (!cell) continue

        switch (cardType) {
          case 'shield':
          case 'rage':
          case 'swap':
            if (cell.owner === username) cells.push({ col: c, row: r })
            break
          case 'disguise':
            if (cell.owner === username && cell.revealed) cells.push({ col: c, row: r })
            break
          case 'freeze':
          case 'compel':
            if (cell.owner !== username) cells.push({ col: c, row: r })
            break
          case 'scout':
            if (cell.owner !== username && !cell.revealed) cells.push({ col: c, row: r })
            break
        }
      }
    }
    // For cards targeting empty cells (trap_mark, phantom)
    if (cardType === 'trap_mark' || cardType === 'phantom') {
      for (let c = 0; c < 5; c++) {
        for (let r = 0; r < 7; r++) {
          if (!state.board[c]?.[r]) cells.push({ col: c, row: r })
        }
      }
    }
    return cells
  }, [selectedCardIndex, state.myHand, state.board, username, cardTarget])

  return (
    <div className='dc-game-page'>
      {/* Top bar */}
      <div className='dc-game-topbar'>
        <button className='dc-top-btn' onClick={onBack}>← 退出</button>
        <div className='dc-game-players'>
          <span className='dc-player-me'>{username}</span>
          <span className='dc-vs'>VS</span>
          <span className='dc-player-opp'>{state.opponentUsername || '等待对手...'}</span>
        </div>
        {state.status === 'playing' && (
          <button className='dc-top-btn dc-forfeit-btn' onClick={handleForfeit}>🏳️</button>
        )}
      </div>

      {/* Info panel */}
      <InfoPanel state={state} myUsername={username} />

      {/* Main game area */}
      <div className='dc-game-main'>
        {/* Board */}
        <Board
          state={state}
          selectedPiece={state.selectedPiece}
          legalMoves={state.legalMoves}
          onCellClick={handleCellClick}
          myUsername={username}
          highlightedCells={highlightedCells}
        />

        {/* End turn button (mist mode, bottom right of board) */}
        {isMistMode && state.status === 'playing' && state.myTurn && (
          <div className='dc-end-turn-row'>
            <button className='dc-end-turn-btn' onClick={() => {
              dispatch({ type: 'clear_selection' })
              setSelectedCardIndex(null)
              send({ type: 'end_turn' })
            }}>
              ⏭️ 结束本轮
            </button>
          </div>
        )}

        {/* Scout button - shown when own piece is selected */}
        {state.selectedPiece && !selectedCardIndex && state.status === 'playing' && state.myTurn && state.selectedPiece.type === 'scout' && (
          <div className='dc-scout-row'>
            <button className='dc-scout-btn' onClick={() => {
              const from = toInternal(state.selectedPiece.col, state.selectedPiece.row)
              handleScout(from.col, from.row)
            }}>
              🔍 侦查（消耗一步）
            </button>
          </div>
        )}

        {/* Card target mode indicator */}
        {selectedCardIndex != null && state.status === 'playing' && (
          <div className='dc-card-target-hint'>
            {cardTarget?.cardType === 'swap'
              ? (cardTarget.step === 1 ? '点击第一枚己方棋子' : '点击第二枚己方棋子')
              : '点击棋盘上目标位置以使用密令卡'}
          </div>
        )}

        {/* Deploy phase overlay */}
        {state.status === 'deploying' && !state.deployed && (
          <DeployPhase
            state={state}
            selectedDeployPiece={selectedDeployPiece}
            onSelectPiece={setSelectedDeployPiece}
            onDeploy={handleDeploy}
            onRandomDeploy={handleRandomDeploy}
            onConfirmDeploy={handleConfirmDeploy}
            myUsername={username}
          />
        )}

        {/* Waiting for deploy */}
        {state.status === 'deploying' && state.deployed && !state.opponentDeployed && (
          <div className='dc-waiting-overlay'>
            <div className='dc-waiting-spinner' />
            <p>等待对方部署完成...</p>
          </div>
        )}
      </div>

      {/* Card hand */}
      {state.status === 'playing' && (
        <CardHand
          hand={state.myHand}
          myTurn={state.myTurn}
          onPlayCard={handlePlayCard}
          selectedCard={selectedCardIndex}
          onSelectCard={handleSelectCard}
          newCardIndex={newCardIndex}
        />
      )}

      {/* Emoji bar */}
      {state.status === 'playing' && (
        <EmojiBar
          onSendEmoji={handleSendEmoji}
          receivedEmoji={state.receivedEmojis}
        />
      )}

      {/* Combat animation */}
      <CombatAnimation
        combat={state.combatAnimation}
        onComplete={clearCombat}
      />

      {/* Event overlay */}
      <EventOverlay
        event={state.eventAnimation}
        onComplete={clearEvent}
      />

      {/* Treasure animation */}
      <TreasureAnimation
        treasure={state.treasureAnimation}
        onComplete={clearTreasure}
      />

      {/* Trap freeze animation */}
      <FreezeAnimation
        trap={state.trapAnimation}
        onComplete={clearTrap}
      />

      {/* Game over */}
      <GameOverScreen
        state={state}
        myUsername={username}
        onBack={onBack}
      />

      {/* Error toast */}
      {state.error && (
        <div className='dc-error-toast' onClick={() => dispatch({ type: 'clear_error' })}>
          {state.error}
        </div>
      )}

      {/* Freeze notification - show always when frozen */}
      {state.opponentFrozen && (
        <div className='dc-freeze-notice'>
          ❄️ 棋子 {String.fromCharCode(65 + state.opponentFrozen.col)}{state.opponentFrozen.row + 1} 被冰冻{state.myTurn ? '，本回合无法移动' : '（下回合无法移动）'}
        </div>
      )}

      {/* Compel notification - show always when compelled */}
      {state.opponentCompelled && (
        <div className='dc-compel-notice'>
          🎯 被定向！{state.myTurn ? '必须移动' : '下回合必须移动'} {String.fromCharCode(65 + state.opponentCompelled.col)}{state.opponentCompelled.row + 1}
        </div>
      )}

      {/* Mist status indicator */}
      {isMistMode && state.myTurn && state.mistState && (
        <div className='dc-mist-status'>
          {state.mistState.stunnedPieces?.length > 0 && (
            <span>💫 眩晕: {state.mistState.stunnedPieces.length}枚</span>
          )}
          {state.mistState.poisonedPieces?.length > 0 && (
            <span>☠️ 中毒: {state.mistState.poisonedPieces.length}枚</span>
          )}
        </div>
      )}

      {/* Scout result toast */}
      {state.scoutResult && (
        <div className='dc-scout-result'>
          🔍 侦查发现 {state.scoutResult.length} 枚敌方棋子:
          {state.scoutResult.map((r, i) => (
            <span key={i}> {String.fromCharCode(65 + r.col)}{r.row + 1}({PIECE_EMOJI[r.type] || '?'})</span>
          ))}
        </div>
      )}

      {/* Connection status */}
      {!connected && (
        <div className='dc-connecting'>
          <div className='dc-connecting-spinner' />
          连接中...
        </div>
      )}

      {/* Draw offer */}
      {state.drawOffer && state.drawOffer !== username && (
        <div className='dc-draw-overlay'>
          <div className='dc-draw-card'>
            <p>对方提议和棋</p>
            <div className='dc-draw-actions'>
              <button className='dc-btn dc-btn-primary' onClick={() => send({ type: 'draw_accept' })}>同意</button>
              <button className='dc-btn dc-btn-secondary' onClick={() => send({ type: 'draw_reject' })}>拒绝</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Client-side legal move computation (mirrors server logic)
function computeLegalMoves(state, col, row) {
  const cell = state.board[col]?.[row]
  if (!cell || cell.owner !== state.myUsername) return []
  const type = cell.type
  if (type === 'bomb' && (!state.gameMode || state.gameMode !== 'mist' || !state.kingType || state.kingType !== 'clever')) return []
  if (type === 'unknown') return []

  const moves = []
  const isMist = state.gameMode === 'mist'
  const directions = [[0,1],[0,-1],[1,0],[-1,0]]

  // Mist mode: horse diagonal attack
  if (isMist && type === 'horse') {
    const range = 2
    const isP1 = state.player1 === state.myUsername
    const forward = isP1 ? -1 : 1
    // Straight moves (no attack)
    for (const [dc, dr] of directions) {
      for (let step = 1; step <= range; step++) {
        const nc = col + dc * step, nr = row + dr * step
        if (nc < 0 || nc >= 5 || nr < 0 || nr >= 7) break
        if (state.cracks?.some(c => c.col === nc && c.row === nr)) break
        const target = state.board[nc]?.[nr]
        if (target) break // horse can't melee attack
        moves.push({ col: nc, row: nr, isAttack: false })
      }
    }
    // Diagonal attacks
    for (const dc of [-1, 1]) {
      const nc = col + dc, nr = row + forward
      if (nc < 0 || nc >= 5 || nr < 0 || nr >= 7) continue
      if (state.cracks?.some(c => c.col === nc && c.row === nr)) continue
      const target = state.board[nc]?.[nr]
      if (target && target.owner !== state.myUsername) {
        moves.push({ col: nc, row: nr, isAttack: true, isHorseAttack: true })
      }
    }
    return moves
  }

  // Mist mode: monk (range-2 stun attack)
  if (isMist && type === 'monk') {
    for (const [dc, dr] of directions) {
      const nc = col + dc, nr = row + dr
      if (nc >= 0 && nc < 5 && nr >= 0 && nr < 7) {
        if (!state.cracks?.some(c => c.col === nc && c.row === nr)) {
          const target = state.board[nc]?.[nr]
          if (!target) moves.push({ col: nc, row: nr, isAttack: false })
        }
      }
      // Range-2 attack
      const nc2 = col + dc * 2, nr2 = row + dr * 2
      if (nc2 >= 0 && nc2 < 5 && nr2 >= 0 && nr2 < 7) {
        if (!state.cracks?.some(c => c.col === nc2 && c.row === nr2)) {
          const mc = col + dc, mr = row + dr
          if (!state.board[mc]?.[mr]) {
            const target2 = state.board[nc2]?.[nr2]
            if (target2 && target2.owner !== state.myUsername) {
              moves.push({ col: nc2, row: nr2, isAttack: true, isRemote: true, isMonkStun: true })
            }
          }
        }
      }
    }
    return moves
  }

  // Mist mode: rogue (can jump over 1 piece)
  if (isMist && type === 'rogue') {
    for (const [dc, dr] of directions) {
      const nc = col + dc, nr = row + dr
      if (nc >= 0 && nc < 5 && nr >= 0 && nr < 7) {
        if (!state.cracks?.some(c => c.col === nc && c.row === nr)) {
          const target = state.board[nc]?.[nr]
          if (!target) moves.push({ col: nc, row: nr, isAttack: false })
          else if (target.owner !== state.myUsername) moves.push({ col: nc, row: nr, isAttack: true })
        }
      }
      // Jump over
      const nc2 = col + dc * 2, nr2 = row + dr * 2
      const mc = col + dc, mr = row + dr
      if (nc2 >= 0 && nc2 < 5 && nr2 >= 0 && nr2 < 7 && state.board[mc]?.[mr]) {
        if (!state.cracks?.some(c => c.col === nc2 && c.row === nr2)) {
          const target2 = state.board[nc2]?.[nr2]
          if (!target2) moves.push({ col: nc2, row: nr2, isAttack: false, isRogueJump: true })
          else if (target2.owner !== state.myUsername) moves.push({ col: nc2, row: nr2, isAttack: true, isRogueJump: true })
        }
      }
    }
    return moves
  }

  // Mist mode: archer (no melee)
  if (isMist && type === 'archer') {
    for (const [dc, dr] of directions) {
      const nc = col + dc, nr = row + dr
      if (nc >= 0 && nc < 5 && nr >= 0 && nr < 7) {
        if (!state.cracks?.some(c => c.col === nc && c.row === nr)) {
          const target = state.board[nc]?.[nr]
          if (!target) moves.push({ col: nc, row: nr, isAttack: false })
        }
      }
    }
    for (const [dc, dr] of directions) {
      const nc = col + dc * 2, nr = row + dr * 2
      if (nc < 0 || nc >= 5 || nr < 0 || nr >= 7) continue
      if (state.cracks?.some(c => c.col === nc && c.row === nr)) continue
      const target = state.board[nc]?.[nr]
      if (target && target.owner !== state.myUsername) {
        moves.push({ col: nc, row: nr, isAttack: true, isRemote: true })
      }
    }
    return moves
  }

  // Standard/dark chess movement
  const range = (isMist && type === 'horse') ? 2 : (type === 'pawn' ? 2 : 1)
  const kingCanAttack = isMist && type === 'king'

  for (const [dc, dr] of directions) {
    for (let step = 1; step <= range; step++) {
      const nc = col + dc * step
      const nr = row + dr * step
      if (nc < 0 || nc >= 5 || nr < 0 || nr >= 7) break
      if (state.cracks?.some(c => c.col === nc && c.row === nr)) break
      const target = state.board[nc]?.[nr]
      if (target) {
        if (target.owner === state.myUsername) break
        const canAtk = (type !== 'king' || kingCanAttack) && (type !== 'pawn' || step === 1)
        if (canAtk) moves.push({ col: nc, row: nr, isAttack: true })
        break
      }
      moves.push({ col: nc, row: nr, isAttack: false })
      if ((type === 'pawn' || (isMist && type === 'horse')) && step === 1) {
        const midC = col + dc, midR = row + dr
        if (state.board[midC]?.[midR]) break
      }
    }
  }

  // Archer remote (dark chess mode only - mist handled above)
  if (!isMist && type === 'archer') {
    for (const [dc, dr] of directions) {
      const nc = col + dc * 2, nr = row + dr * 2
      if (nc < 0 || nc >= 5 || nr < 0 || nr >= 7) continue
      if (state.cracks?.some(c => c.col === nc && c.row === nr)) continue
      const target = state.board[nc]?.[nr]
      if (target && target.owner !== state.myUsername) {
        moves.push({ col: nc, row: nr, isAttack: true, isRemote: true })
      }
    }
  }

  return moves
}
