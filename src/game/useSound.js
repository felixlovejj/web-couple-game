// Procedural sound effects using Web Audio API
let audioCtx = null

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  return audioCtx
}

function playTone(freq, duration, type = 'sine', volume = 0.15) {
  try {
    const ctx = getCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, ctx.currentTime)
    gain.gain.setValueAtTime(volume, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + duration)
  } catch { /* silent fail */ }
}

function playNoise(duration, volume = 0.05) {
  try {
    const ctx = getCtx()
    const bufferSize = ctx.sampleRate * duration
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2)
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(volume, ctx.currentTime)
    source.connect(gain)
    gain.connect(ctx.destination)
    source.start()
  } catch { /* silent fail */ }
}

export const SoundEffects = {
  // Soft click for selection
  select() { playTone(660, 0.06, 'sine', 0.06) },

  // Soft whoosh for movement
  move() { playTone(380, 0.06, 'triangle', 0.07); setTimeout(() => playTone(520, 0.08, 'triangle', 0.05), 40) },

  // Impact clash for combat
  combat() {
    playNoise(0.1, 0.1)
    playTone(220, 0.08, 'square', 0.1)
    setTimeout(() => playTone(180, 0.15, 'sawtooth', 0.07), 50)
    setTimeout(() => playTone(160, 0.1, 'triangle', 0.06), 120)
  },

  // Magical ascend for card play
  cardPlay() {
    playTone(500, 0.08, 'sine', 0.08)
    setTimeout(() => playTone(630, 0.08, 'triangle', 0.08), 60)
    setTimeout(() => playTone(780, 0.12, 'sine', 0.1), 120)
    setTimeout(() => playTone(900, 0.2, 'sine', 0.06), 190)
  },

  // Bright ding for card draw
  cardDraw() {
    playTone(880, 0.06, 'sine', 0.07)
    setTimeout(() => playTone(1100, 0.08, 'triangle', 0.08), 60)
    setTimeout(() => playTone(1320, 0.15, 'sine', 0.06), 130)
  },

  // Dramatic event
  event() {
    playTone(280, 0.15, 'sine', 0.08)
    setTimeout(() => playTone(350, 0.15, 'triangle', 0.09), 120)
    setTimeout(() => playTone(440, 0.15, 'triangle', 0.08), 240)
    setTimeout(() => playTone(550, 0.25, 'sine', 0.08), 360)
  },

  // Triumphant victory
  victory() {
    const notes = [523, 659, 784, 1047]
    notes.forEach((n, i) => {
      setTimeout(() => playTone(n, 0.35, 'sine', 0.13), i * 180)
    })
    setTimeout(() => playTone(1319, 0.5, 'sine', 0.1), 800)
  },

  // Somber defeat
  defeat() {
    const notes = [400, 340, 280, 200]
    notes.forEach((n, i) => {
      setTimeout(() => playTone(n, 0.35, 'triangle', 0.09), i * 250)
    })
  },

  // Freeze / trap
  freeze() {
    playTone(1200, 0.08, 'sine', 0.08)
    setTimeout(() => playTone(800, 0.12, 'triangle', 0.07), 80)
    setTimeout(() => playTone(600, 0.15, 'sine', 0.1), 160)
  },

  // Sparkly treasure
  treasure() {
    playTone(660, 0.08, 'sine', 0.08)
    setTimeout(() => playTone(880, 0.08, 'triangle', 0.09), 80)
    setTimeout(() => playTone(1100, 0.08, 'sine', 0.1), 160)
    setTimeout(() => playTone(1320, 0.12, 'triangle', 0.1), 240)
    setTimeout(() => playTone(1540, 0.25, 'sine', 0.08), 320)
  },

  // Solid thud for deploy
  deploy() { playTone(260, 0.08, 'triangle', 0.07) },
}
