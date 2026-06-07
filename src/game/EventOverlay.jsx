import { useEffect, useState } from 'react'

const EVENT_DISPLAY = {
  fog: { emoji: '🌫️', label: '浓雾笼罩', particle: 'fog' },
  earthquake: { emoji: '🌋', label: '地震', particle: 'quake' },
  lightning: { emoji: '⚡', label: '雷击', particle: 'bolt' },
  rainbow: { emoji: '🌈', label: '彩虹祝福', particle: 'rainbow' },
  flood: { emoji: '🌊', label: '洪水', particle: 'flood' },
  divination: { emoji: '🔮', label: '占卜', particle: 'divine' },
  gale: { emoji: '🏃', label: '疾风突袭', particle: 'gale' },
  destiny: { emoji: '💫', label: '命运之轮', particle: 'destiny' },
}

export default function EventOverlay({ event, onComplete }) {
  const [phase, setPhase] = useState('enter')

  useEffect(() => {
    if (!event) return
    setPhase('enter')
    const t1 = setTimeout(() => setPhase('show'), 400)
    const t2 = setTimeout(() => setPhase('exit'), 3000)
    const t3 = setTimeout(() => { setPhase('done'); onComplete?.() }, 3500)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [event, onComplete])

  if (!event || phase === 'done') return null

  const info = EVENT_DISPLAY[event.type] || { emoji: '❓', label: event.name, particle: '' }

  return (
    <div className={`dc-event-overlay dc-event-${event.type} dc-event-phase-${phase}`}>
      {/* Per-event background effects */}
      {event.type === 'fog' && (
        <div className='dc-event-bg-fog'>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className='dc-fog-particle' style={{ '--i': i, '--delay': i * 1.2 + 's', '--x': Math.random() * 100 + '%' }} />
          ))}
        </div>
      )}
      {event.type === 'earthquake' && (
        <div className='dc-event-bg-quake'>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className='dc-quake-crack' style={{ '--i': i, '--rot': (Math.random() - 0.5) * 60 + 'deg', '--len': (30 + Math.random() * 50) + '%' }} />
          ))}
        </div>
      )}
      {event.type === 'lightning' && (
        <div className='dc-event-bg-lightning'>
          <div className='dc-lightning-flash' />
          <div className='dc-lightning-bolt'>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className='dc-bolt-segment' style={{ '--i': i, '--x': (Math.random() - 0.5) * 40 + 'px', '--y': i * 20 + '%' }} />
            ))}
          </div>
        </div>
      )}
      {event.type === 'rainbow' && (
        <div className='dc-event-bg-rainbow'>
          <div className='dc-rainbow-arc' />
          <div className='dc-rainbow-arc dc-rainbow-arc-2' />
        </div>
      )}
      {event.type === 'flood' && (
        <div className='dc-event-bg-flood'>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className='dc-flood-wave' style={{ '--i': i, '--delay': i * 0.3 + 's' }} />
          ))}
        </div>
      )}
      {event.type === 'divination' && (
        <div className='dc-event-bg-divine'>
          <div className='dc-divine-eye'>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className='dc-divine-ray' style={{ '--i': i, '--angle': i * 45 + 'deg' }} />
            ))}
            <span className='dc-divine-pupil'>👁️</span>
          </div>
        </div>
      )}
      {event.type === 'gale' && (
        <div className='dc-event-bg-gale'>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className='dc-gale-streak' style={{ '--i': i, '--delay': i * 0.15 + 's', '--top': Math.random() * 100 + '%', '--speed': (0.4 + Math.random() * 0.6) + 's' }} />
          ))}
        </div>
      )}
      {event.type === 'destiny' && (
        <div className='dc-event-bg-destiny'>
          <div className='dc-destiny-portal'>
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className='dc-destiny-ring' style={{ '--i': i, '--angle': i * 30 + 'deg', '--delay': i * 0.1 + 's' }} />
            ))}
          </div>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className='dc-destiny-particle' style={{ '--i': i, '--angle': Math.random() * 360 + 'deg', '--dist': (50 + Math.random() * 100) + 'px' }} />
          ))}
        </div>
      )}

      {/* Event info card */}
      <div className='dc-event-card'>
        <div className='dc-event-emoji'>{info.emoji}</div>
        <h2 className='dc-event-name'>{event.name || info.label}</h2>
        <p className='dc-event-desc'>{event.desc}</p>
      </div>
    </div>
  )
}
