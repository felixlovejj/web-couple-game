export default function GameOverScreen({ state, myUsername, onBack, onRematch }) {
  if (!state || state.status !== 'finished') return null

  const winner = state.winner
  const isWinner = winner === myUsername
  const reason = state.gameOverReason

  const reasonText = {
    king_killed: '击杀了对方的王',
    no_moves: '对方无合法移动',
    forfeit: '对方认输',
    disconnect: '对方断线超时',
    max_rounds: '达到最大回合数',
    draw: '双方同意和棋',
  }

  return (
    <div className='dc-gameover-overlay'>
      <div className='dc-gameover-card'>
        {winner === null ? (
          <>
            <div className='dc-gameover-emoji'>🤝</div>
            <h2 className='dc-gameover-title'>平局</h2>
          </>
        ) : isWinner ? (
          <>
            <div className='dc-gameover-emoji'>🏆</div>
            <h2 className='dc-gameover-title'>恭喜获胜！</h2>
            <p className='dc-gameover-amount'>+¥{(state.stake || 30) * 2}</p>
          </>
        ) : (
          <>
            <div className='dc-gameover-emoji'>😢</div>
            <h2 className='dc-gameover-title'>惜败</h2>
          </>
        )}

        <p className='dc-gameover-reason'>{reasonText[reason] || reason}</p>

        {state.stats && (
          <div className='dc-gameover-stats'>
            <div className='dc-stat-row'>
              <span>回合数</span>
              <span>{state.turnNumber}</span>
            </div>
            <div className='dc-stat-row'>
              <span>击杀数</span>
              <span>{state.stats[myUsername]?.kills || 0}</span>
            </div>
            <div className='dc-stat-row'>
              <span>使用密令卡</span>
              <span>{state.stats[myUsername]?.cardsUsed || 0}</span>
            </div>
            <div className='dc-stat-row'>
              <span>触发宝物</span>
              <span>{state.stats[myUsername]?.treasuresFound || 0}</span>
            </div>
          </div>
        )}

        <div className='dc-gameover-actions'>
          <button className='dc-btn dc-btn-primary' onClick={onBack}>返回大厅</button>
        </div>
      </div>
    </div>
  )
}
