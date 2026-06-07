const PIECE_EMOJI = { king:'👑', general:'⚔️', assassin:'🗡️', archer:'🏹', bomb:'💣', pawn:'🐴', scout:'🔭', horse:'🐴', monk:'🧘', rogue:'🥷', rat:'🐀', berserker:'💢', sage:'🧙', ironguard:'🛡️' }
const PIECE_NAME = { king:'王', general:'将', assassin:'刺客', archer:'弓', bomb:'炸弹', pawn:'兵', scout:'侦察兵', horse:'马', monk:'行者', rogue:'侠客', rat:'老鼠', berserker:'狂战', sage:'国师', ironguard:'铁卫' }

export default function DeployPhase({ state, selectedDeployPiece, onSelectPiece, onDeploy, onRandomDeploy, onConfirmDeploy, myUsername }) {
  if (!state) return null

  const { board, deployed, opponentDeployed, player1, gameMode } = state
  const deployPiecesLeft = state.deployPiecesLeft || []
  const isMist = gameMode === 'mist'
  const isP1 = player1 === myUsername
  const deployRows = [5, 6]

  // Mist mode: calculate volume usage
  const mistState = state.mistState
  const volumeUsed = mistState?.myVolumeUsed || 0
  const volumeCap = mistState?.volumeCap || 10
  const pieceDefs = mistState?.deployPieceDefs || {}
  const kingType = mistState?.myKingType

  // Mist mode: count placed pieces by type
  const getPlacedCount = (type) => {
    if (!isMist) return 0
    let count = 0
    for (let r of deployRows) {
      for (let c = 0; c < 5; c++) {
        const cell = board[c]?.[r]
        if (cell && cell.owner === myUsername && cell.type === type) count++
      }
    }
    return count
  }

  const handleCellClick = (col, row) => {
    if (deployed) return
    const cell = board[col]?.[row]
    if (!selectedDeployPiece) {
      if (cell && cell.owner === myUsername) {
        onDeploy('undeploy', col, row)
      }
      return
    }
    onDeploy(selectedDeployPiece, col, row)
  }

  // Piece types for tray
  const trayPieces = isMist
    ? Object.keys(pieceDefs)
    : ['king', 'general', 'assassin', 'archer', 'bomb', 'pawn', 'scout']

  return (
    <div className='dc-deploy' onClick={e => e.stopPropagation()}>
      <div className='dc-deploy-header'>
        <h2>{isMist ? '🌫️ 部署阶段 - 迷雾模式' : '⚔️ 部署阶段'}</h2>
        {isMist && kingType && (
          <p style={{ fontSize: 12, color: '#f39c12', margin: '2px 0' }}>
            👑 {kingType === 'diligent' ? '勤勉之王' : kingType === 'cunning' ? '狡诈之王' : kingType === 'furious' ? '暴怒之王' : kingType === 'clever' ? '机巧之王' : kingType === 'valiant' ? '英武之王' : kingType === 'brutal' ? '狂蛮之王' : kingType === 'coward' ? '胆小之王' : kingType === 'wise' ? '睿智之王' : kingType}
          </p>
        )}
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '4px 0 0' }}>
          {selectedDeployPiece ? `已选择: ${PIECE_EMOJI[selectedDeployPiece] || '?'} ${PIECE_NAME[selectedDeployPiece] || selectedDeployPiece}，点击空格放置` : '点击下方棋子选择，然后点击空格放置'}
        </p>
        {isMist && (
          <div className='dc-volume-bar' style={{ marginTop: 8 }}>
            <div className='dc-volume-label'>体积: {volumeUsed}/{volumeCap}</div>
            <div className='dc-volume-track'>
              <div className='dc-volume-fill' style={{ width: `${Math.min(100, (volumeUsed / volumeCap) * 100)}%`, background: volumeUsed > volumeCap ? '#e74c3c' : volumeUsed === volumeCap ? '#27ae60' : '#3498db' }} />
            </div>
          </div>
        )}
        <div className='dc-deploy-status' style={{ marginTop: 8 }}>
          对方: {opponentDeployed ? '✅ 已就绪' : '⏳ 部署中...'}
        </div>
      </div>

      {/* Deploy zone grid */}
      <div className='dc-deploy-zone'>
        {deployRows.map(r => (
          <div key={r} className='dc-deploy-row'>
            {Array.from({ length: 5 }, (_, c) => {
              const cell = board[c]?.[r]
              const isEmpty = !cell
              const canPlace = isEmpty && selectedDeployPiece && !deployed
              return (
                <div
                  key={c}
                  className={`dc-deploy-cell ${cell ? 'dc-has-piece' : ''} ${canPlace ? 'dc-can-place' : ''} ${deployed ? 'dc-locked' : ''}`}
                  style={{ cursor: canPlace ? 'pointer' : 'default' }}
                  onClick={() => handleCellClick(c, r)}
                >
                  {cell ? (
                    <span className='dc-deploy-piece'>{PIECE_EMOJI[cell.type] || '?'}</span>
                  ) : canPlace ? (
                    <span className='dc-place-hint'>+</span>
                  ) : (
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)' }}>{String.fromCharCode(65 + c)}{r + 1}</span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Piece tray */}
      {!deployed && (
        <div className='dc-deploy-tray'>
          <div className='dc-tray-label'>
            {isMist
              ? `待部署棋子 (体积 ${volumeUsed}/${volumeCap})`
              : `待部署棋子 (${deployPiecesLeft.length}/${isMist ? '?' : '7'})`
            }
          </div>
          <div className='dc-tray-pieces'>
            {trayPieces.map((type, i) => {
              if (isMist && type === 'king') return null // King already placed
              const def = pieceDefs[type]
              const placedCount = getPlacedCount(type)
              const maxCount = def?.maxCount || 1
              const volume = def?.volume || 0
              const canPlaceMore = placedCount < maxCount && (!def || volumeUsed + volume <= volumeCap)

              const isUsed = !isMist
                ? !deployPiecesLeft.includes(type)
                : (placedCount >= maxCount)

              return (
                <button
                  key={`${type}-${i}`}
                  className={`dc-tray-piece ${selectedDeployPiece === type ? 'dc-selected' : ''} ${isUsed && isMist ? 'dc-used' : ''}`}
                  style={{ cursor: canPlaceMore || (!isMist && deployPiecesLeft.includes(type)) ? 'pointer' : 'not-allowed', opacity: isUsed && isMist ? 0.3 : 1 }}
                  onClick={() => {
                    if (isMist) {
                      if (canPlaceMore) onSelectPiece(type)
                    } else if (deployPiecesLeft.includes(type)) {
                      onSelectPiece(type)
                    }
                  }}
                >
                  <span className='dc-tray-emoji'>{PIECE_EMOJI[type] || '?'}</span>
                  <span className='dc-tray-name'>{PIECE_NAME[type] || type}</span>
                  {isMist && def && (
                    <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)' }}>
                      体{volume} | {placedCount}/{maxCount}
                    </span>
                  )}
                  {!isMist && (type === 'pawn' || type === 'scout') && (
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>
                      {deployPiecesLeft.filter(t => t === type).length}/{type === 'pawn' ? 2 : 1}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className='dc-deploy-actions'>
        {!deployed && (
          <>
            <button className='dc-btn dc-btn-secondary' onClick={onRandomDeploy}>
              🎲 随机部署
            </button>
            <button
              className='dc-btn dc-btn-primary'
              onClick={onConfirmDeploy}
              disabled={isMist ? (volumeUsed > volumeCap) : (deployPiecesLeft.length > 0)}
              style={{ opacity: (isMist ? (volumeUsed > volumeCap) : (deployPiecesLeft.length > 0)) ? 0.4 : 1 }}
            >
              ✅ 确认部署 {isMist ? `(体积${volumeUsed}/${volumeCap})` : deployPiecesLeft.length > 0 ? `(${7 - deployPiecesLeft.length}/7)` : ''}
            </button>
          </>
        )}
        {deployed && (
          <div className='dc-deploy-waiting'>
            <div className='dc-waiting-spinner' />
            等待对方部署完成...
          </div>
        )}
      </div>
    </div>
  )
}
