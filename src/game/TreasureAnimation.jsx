import { useEffect, useState } from 'react'

const TREASURE_INFO = {
  diamond_armor: { name: '钻石铠甲', emoji: '💎', desc: '获得1次护盾' },
  whetstone: { name: '磨刀石', emoji: '🗡️', desc: '下次攻击战斗力+3' },
  magnet: { name: '磁铁', emoji: '🧲', desc: '随机移动到相邻空格' },
  shadow: { name: '暗影', emoji: '🌑', desc: '已揭示棋子变为未揭示' },
  trap: { name: '陷阱', emoji: '💀', desc: '战斗力永久-1' },
  portal: { name: '传送门', emoji: '🌀', desc: '传送到随机空格' },
  nothing: { name: '无事发生', emoji: '✨', desc: '什么都没有发生' },
}

export default function TreasureAnimation({ treasure, onComplete }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!treasure) return
    setVisible(true)
    const t = setTimeout(() => { setVisible(false); onComplete?.() }, 3000)
    return () => clearTimeout(t)
  }, [treasure])

  if (!treasure || !visible) return null

  const info = TREASURE_INFO[treasure.type] || { name: '未知', emoji: '❓', desc: '' }

  return (
    <div className='dc-treasure-overlay'>
      <div className='dc-treasure-card'>
        <div className='dc-treasure-emoji'>{info.emoji}</div>
        <h3 className='dc-treasure-name'>{info.name}</h3>
        <p className='dc-treasure-desc'>{info.desc}</p>
      </div>
    </div>
  )
}
