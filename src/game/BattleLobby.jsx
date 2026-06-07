import { useCallback, useEffect, useState } from 'react'

const API_BASE = '/api/darkchess'

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

const TUTORIAL_PAGES = [
  {
    title: '🎯 游戏目标',
    content: '暗棋迷阵是一款双人回合制策略棋类游戏。每方控制7枚棋子，在5×7的棋盘上对战。\n\n杀死对方的王（👑）即可获胜！此外，当对方所有棋子无法移动，或对方超时未操作时，也会判负。若50回合未分胜负则为平局。',
  },
  {
    title: '♟️ 棋子介绍',
    content: '王 👑 (0/0) — 被击杀则输，不能主动攻击\n将 ⚔️ (5/5) — 强力主战棋子\n刺客 🗡️ (★/1) — 攻击无视护盾，必杀非王棋子\n弓 🏹 (3/3) — 可远程攻击2格\n炸弹 💣 (💥/💥) — 攻击与被攻击都会同归于尽\n兵 🐴 (2/2) — 可移动2步\n侦察兵 🔭 (1/1) — 可消耗一步侦查直线3格内的一个敌方棋子',
  },
  {
    title: '⚔️ 战斗系统',
    content: '当棋子移动到敌方棋子位置时触发战斗。战斗判定按以下顺序进行：\n① 撤退卡拦截（可取消本次战斗）\n② 护盾抵消攻击\n③ 炸弹：攻击或被攻击都会触发同归于尽\n④ 刺客：攻击无视护盾，**必杀**非王棋子（仅受到护盾抵消）\n⑤ 战力比较：攻>防则击杀，攻≤防则无事发生\n\n攻击力和防御力会受到状态效果影响（狂暴+3攻、祝福+3攻+3防、诅咒-1等），以棋子下方显示的 x/x 为准。',
  },
  {
    title: '🃏 密令卡系统',
    content: '每4回合获得一张随机密令卡。卡牌在游戏底部的手牌区显示。\n\n用法：点击手牌选中，再点击棋盘上的目标棋子即可使用（部分卡牌无需选目标直接生效）。\n\n💡 长按卡牌可查看详细说明！\n\n提示：密令卡包含侦察、护盾、疾风、换位、伪装、狂暴、冰冻、全视、定向、偷取、冰冻标记、幻影等12种，合理运用可以扭转战局。',
  },
  {
    title: '🗺️ 棋盘与地形',
    content: '棋盘为5列(A-E)×7行(1-7)的网格。\n\n行1-2为己方部署区，行6-7为对方部署区。\n\n棋盘上可能出现两种地形：\n🪨 碎石 — 不可通行\n🌊 河流 — 棋子在河中防御力-1（会在状态栏显示）',
  },
  {
    title: '🎲 战场事件与宝物',
    content: '每6回合触发一个随机战场事件，影响全局：如诅咒（所有棋子攻防-1）、祝福（随机棋子+3/+3）、地鸣（随机位置出现碎石）、落雷（随机棋子消灭）等。\n\n宝物会在棋盘中央区域随机生成2个。走到宝物格子上即可拾取，获得特殊能力：如斩杀、回春、传送、隐身、禁魔、狂战、圣盾。',
  },
  {
    title: '🎮 操作说明',
    content: '① 部署阶段：选择棋子，点击棋盘上的格子放置，部署完成后点击"确认部署"（也可随机部署）\n② 移动阶段：点击己方棋子查看可移动位置（蓝色=移动，红色=攻击），再点击目标位置执行\n③ 使用密令卡：点击底部手牌选择卡牌，再点击棋盘目标；部分卡牌无需选目标\n④ 侦查：选中侦察兵后，点击"侦查"按钮可查看直线3格内的一个敌方棋子\n⑤ 回合倒计时45秒，超时系统将自动为您移动最小兵种',
  },
]

const MODE_OPTIONS = [
  { key: 'dark_chess', name: '暗棋迷阵', emoji: '⚔️', desc: '经典模式：7枚棋子，暗棋博弈' },
  { key: 'mist', name: '迷雾模式', emoji: '🌫️', desc: '体积限制、多样棋子、多种王' },
]

const KING_OPTIONS = [
  { key: 'diligent', name: '勤勉之王', emoji: '👑', desc: '抽牌每3回合' },
  { key: 'cunning', name: '狡诈之王', emoji: '👑', desc: '棋子伪装为王' },
  { key: 'furious', name: '暴怒之王', emoji: '👑', desc: '全体-1HP+1ATK' },
  { key: 'clever', name: '机巧之王', emoji: '👑', desc: '+1炸弹可引爆' },
  { key: 'valiant', name: '英武之王', emoji: '👑', desc: '棋子+2ATK' },
  { key: 'brutal', name: '狂蛮之王', emoji: '👑', desc: '5血5攻可攻击' },
  { key: 'coward', name: '胆小之王', emoji: '👑', desc: '侦查显示老鼠' },
  { key: 'wise', name: '睿智之王', emoji: '👑', desc: '免疫技能牌陷阱' },
]

export default function BattleLobby({ token, username, onBack, onEnterGame }) {
  const [rooms, setRooms] = useState([])
  const [myGames, setMyGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [joinLoading, setJoinLoading] = useState({})
  const [showTutorial, setShowTutorial] = useState(false)
  const [tutorialPage, setTutorialPage] = useState(0)
  const [selectedMode, setSelectedMode] = useState('dark_chess')
  const [selectedKing, setSelectedKing] = useState('diligent')
  const [showCreateOptions, setShowCreateOptions] = useState(false) // eslint-disable-line no-unused-vars

  const loadData = useCallback(async () => {
    try {
      const [listRes, myRes] = await Promise.all([
        apiGet(API_BASE + '/list', token),
        apiGet(API_BASE + '/my-games', token),
      ])
      setRooms(listRes.rooms || [])
      setMyGames(myRes.games || [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { loadData() }, [loadData])

  const handleCreate = async () => {
    setError('')
    try {
      const body = { stake: 30, mode: selectedMode }
      if (selectedMode === 'mist') body.kingType = selectedKing
      const res = await apiPost(API_BASE + '/create', body, token)
      onEnterGame(res.roomId)
    } catch (e) { setError(e.message) }
  }

  const handleJoin = async (roomId, mode) => {
    setError('')
    setJoinLoading(prev => ({ ...prev, [roomId]: true }))
    try {
      const body = {}
      if (mode === 'mist') body.kingType = selectedKing
      await apiPost(API_BASE + '/join/' + roomId, body, token)
      onEnterGame(roomId)
    } catch (e) { setError(e.message); setJoinLoading(prev => ({ ...prev, [roomId]: false })) }
  }

  return (
    <div className='dc-lobby'>
      <div className='dc-lobby-header'>
        <button className='dc-top-btn' onClick={onBack}>← 返回</button>
        <h1 className='dc-lobby-title'>暗棋迷阵</h1>
        <button className='dc-top-btn' onClick={loadData}>🔄</button>
      </div>

      {error && <p className='dc-error'>{error}</p>}

      <div className='dc-lobby-section'>
        {/* Mode selection */}
        <div className='dc-mode-select'>
          <label className='dc-mode-label'>选择模式</label>
          <div className='dc-mode-options'>
            {MODE_OPTIONS.map(m => (
              <button
                key={m.key}
                className={`dc-mode-btn ${selectedMode === m.key ? 'dc-mode-active' : ''}`}
                onClick={() => setSelectedMode(m.key)}
              >
                <span>{m.emoji}</span>
                <span>{m.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* King type selection (only for mist mode) */}
        {selectedMode === 'mist' && (
          <div className='dc-king-select'>
            <label className='dc-mode-label'>选择王的类型</label>
            <div className='dc-king-options'>
              {KING_OPTIONS.map(k => (
                <button
                  key={k.key}
                  className={`dc-king-btn ${selectedKing === k.key ? 'dc-king-active' : ''}`}
                  onClick={() => setSelectedKing(k.key)}
                  title={k.desc}
                >
                  <span>{k.emoji}</span>
                  <span>{k.name}</span>
                  <span style={{ fontSize: 10, opacity: 0.6 }}>{k.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <button className='dc-create-btn' onClick={handleCreate} disabled={loading}>
          🎮 创建房间（¥30入场费）
          {selectedMode === 'mist' ? ` - 迷雾模式 · ${KING_OPTIONS.find(k => k.key === selectedKing)?.name || ''}` : ''}
        </button>
        <button className='dc-tutorial-btn' onClick={() => { setShowTutorial(true); setTutorialPage(0) }}>
          📖 游戏教程
        </button>
      </div>

      {myGames.length > 0 && (
        <div className='dc-lobby-section'>
          <h2 className='dc-section-title'>我的对局</h2>
          {myGames.map(g => (
            <div key={g.id} className='dc-game-row'>
              <div className='dc-game-info'>
                <span className='dc-game-opponent'>
                  {g.opponent ? `vs ${g.opponent}` : '等待对手...'}
                </span>
                <span className={`dc-game-status ${g.status}`}>
                  {g.status === 'waiting' ? '等待中' : g.status === 'deploying' ? '部署中' : g.status === 'playing' ? '进行中' : ''}
                </span>
                {g.turnNumber > 0 && <span className='dc-game-turn'>回合 {g.turnNumber}</span>}
              </div>
              <button className='dc-btn-small dc-btn-primary' onClick={() => onEnterGame(g.id)}>
                {g.status === 'waiting' ? '等待中' : '进入'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className='dc-lobby-section'>
        <h2 className='dc-section-title'>可加入的房间</h2>
        {loading ? (
          <div className='dc-loading'>加载中...</div>
        ) : rooms.length === 0 ? (
          <div className='dc-empty'>暂无可用房间</div>
        ) : (
          rooms.map(r => (
            <div key={r.id} className='dc-game-row'>
              <div className='dc-game-info'>
                <span className='dc-game-opponent'>{r.player1}</span>
                <span className='dc-game-stake'>¥{r.stake}</span>
                {r.mode === 'mist' && <span className='dc-game-mode-tag'>🌫️迷雾</span>}
              </div>
              {r.mode === 'mist' && !selectedKing && (
                <div style={{ fontSize: 11, color: '#e67e22' }}>请选择王</div>
              )}
              <button
                className='dc-btn-small dc-btn-primary'
                onClick={() => handleJoin(r.id, r.mode)}
                disabled={joinLoading[r.id]}
              >
                {joinLoading[r.id] ? '加入中...' : '加入'}
              </button>
            </div>
          ))
        )}
      </div>

      {/* Tutorial overlay */}
      {showTutorial && (
        <div className='dc-tutorial-overlay' onClick={() => setShowTutorial(false)}>
          <div className='dc-tutorial-modal' onClick={(e) => e.stopPropagation()}>
            <div className='dc-tutorial-header'>
              <h2 className='dc-tutorial-title'>{TUTORIAL_PAGES[tutorialPage].title}</h2>
              <button className='dc-top-btn' onClick={() => setShowTutorial(false)}>✕</button>
            </div>
            <div className='dc-tutorial-content'>
              {TUTORIAL_PAGES[tutorialPage].content.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
            <div className='dc-tutorial-footer'>
              <span className='dc-tutorial-dots'>
                {TUTORIAL_PAGES.map((_, i) => (
                  <span key={i} className={`dc-tutorial-dot ${i === tutorialPage ? 'dc-tutorial-dot-active' : ''}`} />
                ))}
              </span>
              <div className='dc-tutorial-nav'>
                {tutorialPage > 0 && (
                  <button className='dc-btn-small' onClick={() => setTutorialPage(p => p - 1)}>← 上一页</button>
                )}
                {tutorialPage < TUTORIAL_PAGES.length - 1 ? (
                  <button className='dc-btn-small dc-btn-primary' onClick={() => setTutorialPage(p => p + 1)}>下一页 →</button>
                ) : (
                  <button className='dc-btn-small dc-btn-primary' onClick={() => setShowTutorial(false)}>开始游戏</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
