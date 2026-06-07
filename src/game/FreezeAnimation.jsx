import { useEffect, useState } from 'react'

export default function FreezeAnimation({ trap, onComplete }) {
  const [phase, setPhase] = useState('hidden')

  useEffect(() => {
    if (!trap) return
    setPhase('freezing')
    const t = setTimeout(() => { setPhase('done'); onComplete?.() }, 2000)
    return () => clearTimeout(t)
  }, [trap])

  if (!trap || phase === 'done') return null

  return (
    <div className='dc-freeze-overlay'>
      <div className={'dc-freeze-card'}>
        <div className='dc-freeze-icon'>🧊</div>
        <div className='dc-freeze-title'>冰冻陷阱触发！</div>
        <div className='dc-freeze-desc'>该棋子下回合无法行动</div>
        <div className='dc-freeze-spikes'>
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className='dc-ice-spike' style={{ '--i': i, '--angle': i * 30 }} />
          ))}
        </div>
      </div>
    </div>
  )
}
