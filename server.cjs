const express = require('express')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const http = require('http')
const { WebSocketServer } = require('ws')

const USERS_FILE = path.join(__dirname, 'users.json')
const PORT = 8096
const PWD_SALT = 'scratch-off-v1'
const BUY_PRICE = 10

// ==================== DATA HELPERS ====================

function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')) } catch { return { users: {} } }
}
function writeUsers(data) { fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf-8') }
function hashPassword(pw) { return crypto.createHash('sha256').update(pw + PWD_SALT).digest('hex') }
function generateToken() { return crypto.randomBytes(32).toString('hex') }

function safeUserData(u) {
  return {
    balance: u.balance ?? 0, scratchCards: u.scratchCards ?? 0,
    lastSignInDate: u.lastSignInDate ?? null, nextGuaranteedPrize: u.nextGuaranteedPrize ?? null,
    guaranteedPrizes: u.guaranteedPrizes ?? {},
    inventory: u.inventory ?? { freezeShield: 0, reflectArmor: 0, doubleBet: 0 },
    battleStats: u.battleStats ?? { wins: 0, losses: 0, totalGoldEarned: 0 },
  }
}

// ==================== AUTH MIDDLEWARE ====================

function requireAuth(req, res, next) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: '未登录' })
  const token = auth.slice(7)
  const data = readUsers()
  const entry = Object.entries(data.users).find(([_, u]) => u.token === token)
  if (!entry) return res.status(401).json({ ok: false, error: '登录已过期' })
  req.username = entry[0]; req.userEntry = entry[1]; req.usersData = data; next()
}

// ==================== EXPRESS APP ====================

const app = express()
app.use(express.json())
app.use('/scratch-off', express.static(path.join(__dirname, 'dist')))
app.get('/', (req, res) => res.redirect('/scratch-off/'))
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// ==================== AUTH API ====================

app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body
  if (!username || !password) return res.status(400).json({ ok: false, error: '用户名和密码不能为空' })
  if (username.length < 1 || username.length > 20) return res.status(400).json({ ok: false, error: '用户名长度1-20个字符' })
  const data = readUsers()
  if (data.users[username]) return res.status(400).json({ ok: false, error: '用户名已存在' })
  const token = generateToken()
  data.users[username] = { password: hashPassword(password), token, balance: 0, scratchCards: 0, lastSignInDate: null, nextGuaranteedPrize: null, guaranteedPrizes: {}, inventory: { freezeShield: 0, reflectArmor: 0, doubleBet: 0 }, battleStats: { wins: 0, losses: 0, totalGoldEarned: 0 } }
  writeUsers(data)
  res.json({ ok: true, token, username, ...safeUserData(data.users[username]) })
})

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body
  if (!username || !password) return res.status(400).json({ ok: false, error: '用户名和密码不能为空' })
  const data = readUsers()
  const user = data.users[username]
  if (!user || user.password !== hashPassword(password)) return res.status(400).json({ ok: false, error: '用户名或密码错误' })
  user.token = generateToken(); writeUsers(data)
  res.json({ ok: true, token: user.token, username, ...safeUserData(user) })
})

app.post('/api/auth/logout', requireAuth, (req, res) => { req.userEntry.token = null; writeUsers(req.usersData); res.json({ ok: true }) })
app.get('/api/auth/me', requireAuth, (req, res) => { res.json({ ok: true, username: req.username, ...safeUserData(req.userEntry) }) })

// ==================== SCRATCH API ====================

app.get('/api/scratch/state', requireAuth, (req, res) => { res.json(safeUserData(req.userEntry)) })

app.post('/api/scratch/signin', requireAuth, (req, res) => {
  const today = new Date().toDateString()
  if (req.userEntry.lastSignInDate === today) return res.status(400).json({ ok: false, error: '今天已签到' })
  req.userEntry.lastSignInDate = today; req.userEntry.scratchCards += 1
  writeUsers(req.usersData); res.json({ ok: true, ...safeUserData(req.userEntry) })
})

app.post('/api/scratch/buy', requireAuth, (req, res) => {
  if (req.userEntry.balance < BUY_PRICE) return res.status(400).json({ ok: false, error: '余额不足' })
  req.userEntry.balance -= BUY_PRICE; req.userEntry.scratchCards += 1
  writeUsers(req.usersData); res.json({ ok: true, ...safeUserData(req.userEntry) })
})

app.post('/api/scratch/start', requireAuth, (req, res) => {
  if (req.userEntry.scratchCards <= 0) return res.status(400).json({ ok: false, error: '没有刮刮乐了' })
  const guaranteedPrize = req.userEntry.nextGuaranteedPrize || null
  req.userEntry.nextGuaranteedPrize = null; req.userEntry.scratchCards -= 1
  writeUsers(req.usersData); res.json({ ok: true, ...safeUserData(req.userEntry), guaranteedPrize })
})

app.post('/api/scratch/confirm', requireAuth, (req, res) => {
  const { prizeWon = 0, cardsWon = 0 } = req.body
  req.userEntry.balance += prizeWon; req.userEntry.scratchCards += cardsWon
  writeUsers(req.usersData); res.json({ ok: true, ...safeUserData(req.userEntry) })
})

app.put('/api/scratch/guarantee', requireAuth, (req, res) => {
  const { number, amount, type, value } = req.body
  req.userEntry.nextGuaranteedPrize = (number && amount) ? { number, amount, type: type || 'cash', value: value || 0 } : null
  writeUsers(req.usersData); res.json({ ok: true, nextGuaranteedPrize: req.userEntry.nextGuaranteedPrize })
})

app.get('/api/scratch/guarantee', requireAuth, (req, res) => { res.json({ nextGuaranteedPrize: req.userEntry.nextGuaranteedPrize || null }) })

// ==================== SHOP API ====================

const SHOP_ITEMS = [
  { id: 'freezeShield', name: '免冻卡', price: 20, desc: '被动：第一次被冻自动抵消' },
  { id: 'reflectArmor', name: '反甲', price: 25, desc: '被抢时反抢对方 ¥10' },
  { id: 'doubleBet', name: '双倍押注', price: 50, desc: '赢了奖金×2，输了也×2' },
]
app.get('/api/shop/items', (req, res) => { res.json({ items: SHOP_ITEMS }) })
app.get('/api/shop/inventory', requireAuth, (req, res) => { res.json({ inventory: req.userEntry.inventory || {} }) })
app.post('/api/shop/buy', requireAuth, (req, res) => {
  const { itemId } = req.body
  const item = SHOP_ITEMS.find(i => i.id === itemId)
  if (!item) return res.status(400).json({ ok: false, error: '商品不存在' })
  if (req.userEntry.balance < item.price) return res.status(400).json({ ok: false, error: '余额不足' })
  req.userEntry.balance -= item.price
  req.userEntry.inventory = req.userEntry.inventory || { freezeShield: 0, reflectArmor: 0, doubleBet: 0 }
  req.userEntry.inventory[itemId] = (req.userEntry.inventory[itemId] || 0) + 1
  writeUsers(req.usersData); res.json({ ok: true, ...safeUserData(req.userEntry) })
})

// ==================== ADMIN API ====================

app.get('/api/admin/users', (req, res) => {
  const data = readUsers()
  res.json({ users: Object.keys(data.users).map(name => ({ name, ...safeUserData(data.users[name]) })) })
})
app.get('/api/admin/user/:username', (req, res) => {
  const data = readUsers(); const user = data.users[req.params.username]
  if (!user) return res.status(404).json({ ok: false, error: '用户不存在' })
  res.json({ ok: true, username: req.params.username, ...safeUserData(user) })
})
app.put('/api/admin/user/:username', (req, res) => {
  const data = readUsers(); const user = data.users[req.params.username]
  if (!user) return res.status(404).json({ ok: false, error: '用户不存在' })
  const { balance, scratchCards, lastSignInDate } = req.body
  if (balance !== undefined) user.balance = balance
  if (scratchCards !== undefined) user.scratchCards = scratchCards
  if (lastSignInDate !== undefined) user.lastSignInDate = lastSignInDate
  writeUsers(data); res.json({ ok: true, ...safeUserData(user) })
})
app.post('/api/admin/user', (req, res) => {
  const { username, password } = req.body
  if (!username || !password) return res.status(400).json({ ok: false, error: '用户名和密码不能为空' })
  const data = readUsers()
  if (data.users[username]) return res.status(400).json({ ok: false, error: '用户已存在' })
  data.users[username] = { password: hashPassword(password), token: null, balance: 0, scratchCards: 0, lastSignInDate: null, nextGuaranteedPrize: null, guaranteedPrizes: {}, inventory: { freezeShield: 0, reflectArmor: 0, doubleBet: 0 }, battleStats: { wins: 0, losses: 0, totalGoldEarned: 0 } }
  writeUsers(data); res.json({ ok: true, username })
})

// ==================== DARK CHESS GAME CONSTANTS ====================

const COLS = 5, ROWS = 7
const PIECES = { KING: 'king', GENERAL: 'general', ASSASSIN: 'assassin', ARCHER: 'archer', BOMB: 'bomb', PAWN: 'pawn' }
const PIECE_POWER = { king: 0, general: 5, assassin: -1, archer: 3, bomb: -1, pawn: 2, scout: 1 } // assassin=-1 means special
const PIECE_MOVE_RANGE = { king: 1, general: 1, assassin: 1, archer: 1, bomb: 0, pawn: 2, scout: 1 }
const PIECE_DISTRIBUTION = ['king', 'general', 'assassin', 'archer', 'bomb', 'pawn', 'scout']

// HP system helpers
function getBaseHp(type) {
  if (type === 'king') return 2
  if (type === 'assassin' || type === 'bomb') return 1
  return Math.max(1, PIECE_POWER[type] || 1)
}
function getMaxHp(type, cursedPower, blessed) {
  return Math.max(1, getBaseHp(type) + (cursedPower || 0) + (blessed ? 3 : 0))
}

const CARDS = { SCOUT:'scout', SHIELD:'shield', SWIFT:'swift', SWAP:'swap', DISGUISE:'disguise', RAGE:'rage', FREEZE:'freeze', FORESIGHT:'foresight', COMPEL:'compel', STEAL:'steal',  TRAP_MARK:'trap_mark', PHANTOM:'phantom' }
const CARD_POOL = Object.values(CARDS)
const HAND_LIMIT = 3
const CARD_DRAW_INTERVAL = 4
const EVENT_INTERVAL = 6
const TURN_TIME = 45
const DISCONNECT_TIMEOUT = 30
const MAX_ROUNDS = 50

const EVENTS = { FOG:'fog', EARTHQUAKE:'earthquake', LIGHTNING:'lightning', RAINBOW:'rainbow', FLOOD:'flood', DIVINATION:'divination', GALE:'gale', DESTINY:'destiny' }
const EVENT_POOL = Object.values(EVENTS)

const TREASURES = { DIAMOND_ARMOR:'diamond_armor', WHETSTONE:'whetstone', MAGNET:'magnet', SHADOW:'shadow', TRAP:'trap', PORTAL:'portal', NOTHING:'nothing' }
const TREASURE_POOL = [TREASURES.DIAMOND_ARMOR, TREASURES.WHETSTONE, TREASURES.SHADOW, TREASURES.MAGNET, TREASURES.PORTAL, TREASURES.TRAP, TREASURES.NOTHING]

// ==================== MIST MODE CONSTANTS ====================

const MIST_VOLUME_CAP = 10

const MIST_PIECE_DEF = {
  horse:     { volume:1, maxCount:3, hp:2, atk:2, moveRange:2, atkType:'diagonal', name:'马' },
  general:   { volume:3, maxCount:1, hp:5, atk:5, moveRange:1, name:'将' },
  assassin:  { volume:2, maxCount:1, hp:1, atk:'★', moveRange:1, name:'刺客' },
  archer:    { volume:2, maxCount:1, hp:2, atk:3, moveRange:1, name:'弓' },
  bomb:      { volume:1, maxCount:1, hp:1, atk:'💥', moveRange:0, name:'炸弹' },
  monk:      { volume:1, maxCount:1, hp:1, atk:0, moveRange:1, name:'行者' },
  rogue:     { volume:2, maxCount:1, hp:4, atk:4, moveRange:1, name:'侠客' },
  rat:       { volume:2, maxCount:1, hp:1, atk:1, moveRange:1, name:'老鼠' },
  berserker: { volume:3, maxCount:1, hp:7, atk:1, moveRange:1, name:'狂战' },
  sage:      { volume:1, maxCount:1, hp:1, atk:1, moveRange:1, name:'国师' },
  ironguard: { volume:2, maxCount:1, hp:5, atk:2, moveRange:1, name:'铁卫' },
}

const MIST_KING_DEF = {
  diligent: { hp:3, atk:0, name:'勤勉之王', cardInterval:3 },
  cunning:  { hp:3, atk:0, name:'狡诈之王' },
  furious:  { hp:3, atk:0, name:'暴怒之王' },
  clever:   { hp:3, atk:0, name:'机巧之王', extraBomb:true },
  valiant:  { hp:3, atk:4, name:'英武之王' },
  brutal:   { hp:5, atk:5, name:'狂蛮之王', cardInterval:5 },
  coward:   { hp:2, atk:0, name:'胆小之王' },
  wise:     { hp:3, atk:0, name:'睿智之王', immune:true },
}

const ALL_MIST_PIECE_TYPES = Object.keys(MIST_PIECE_DEF)

function getMistBaseHp(type) {
  if (type === 'king') return 3 // default, overridden by king type
  const def = MIST_PIECE_DEF[type]
  return def ? def.hp : 1
}

// ==================== DARK CHESS REST API ====================

const BATTLE_STAKE = 30

function generateRoomId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

app.post('/api/darkchess/create', requireAuth, (req, res) => {
  const stake = req.body.stake || BATTLE_STAKE
  const mode = req.body.mode || 'dark_chess'
  const kingType = req.body.kingType || null
  if (req.userEntry.balance < stake) return res.status(400).json({ ok: false, error: '余额不足' })
  req.userEntry.balance -= stake; writeUsers(req.usersData)
  const roomId = generateRoomId()
  gameEngine.createRoom(roomId, req.username, stake, mode, kingType)
  res.json({ ok: true, roomId, stake, mode })
})

app.get('/api/darkchess/list', requireAuth, (req, res) => {
  try {
    const rooms = gameEngine.getWaitingRooms(req.username)
    res.json({ rooms })
  } catch (e) {
    console.error('[list] error:', e)
    res.status(500).json({ ok: false, error: '服务器错误' })
  }
})

app.get('/api/darkchess/my-games', requireAuth, (req, res) => {
  try {
    const games = gameEngine.getMyGames(req.username)
    res.json({ games })
  } catch (e) {
    console.error('[my-games] error:', e)
    res.status(500).json({ ok: false, error: '服务器错误' })
  }
})

// Debug: manual deploy via REST
app.post('/api/darkchess/deploy', requireAuth, (req, res) => {
  try {
    const { roomId, pieceType, col, row } = req.body
    const room = gameEngine.rooms[roomId]
    if (!room) return res.status(404).json({ ok: false, error: '房间不存在' })
    console.log(`[REST deploy] ${req.username} -> ${pieceType} at (${col},${row}) room=${roomId}`)
    const result = gameEngine.deployPiece(room, req.username, pieceType, col, row)
    if (!result.ok) return res.status(400).json(result)
    sendStateToRoom(room)
    res.json({ ok: true, deployPiecesLeft: room.pieces[req.username].filter(p => !p.placed).map(p => p.type) })
  } catch (e) {
    console.error('[REST deploy] error:', e)
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/darkchess/confirm-deploy', requireAuth, (req, res) => {
  try {
    const { roomId } = req.body
    const room = gameEngine.rooms[roomId]
    if (!room) return res.status(404).json({ ok: false, error: '房间不存在' })
    console.log(`[REST confirm-deploy] ${req.username} room=${roomId}`)
    const result = gameEngine.confirmDeploy(room, req.username)
    if (!result.ok) return res.status(400).json(result)
    if (result.gameStarted) broadcastToRoom(room, { type: 'game_start' })
    sendStateToRoom(room)
    res.json({ ok: true })
  } catch (e) {
    console.error('[REST confirm-deploy] error:', e)
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/darkchess/random-deploy', requireAuth, (req, res) => {
  try {
    const { roomId } = req.body
    const room = gameEngine.rooms[roomId]
    if (!room) return res.status(404).json({ ok: false, error: '房间不存在' })
    console.log(`[REST random-deploy] ${req.username} room=${roomId}`)
    const result = gameEngine.randomDeploy(room, req.username)
    if (!result.ok) return res.status(400).json(result)
    sendStateToRoom(room)
    res.json({ ok: true })
  } catch (e) {
    console.error('[REST random-deploy] error:', e)
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/darkchess/join/:id', requireAuth, (req, res) => {
  try {
    const room = gameEngine.rooms[req.params.id]
    if (!room) return res.status(404).json({ ok: false, error: '房间不存在' })
    if (room.status !== 'waiting') return res.status(400).json({ ok: false, error: '房间已开始' })
    if (room.player1 === req.username) return res.status(400).json({ ok: false, error: '不能加入自己的房间' })
    if (req.userEntry.balance < (room.stake || 30)) return res.status(400).json({ ok: false, error: '余额不足' })

    req.userEntry.balance -= (room.stake || 30)
    writeUsers(req.usersData)

    const kingType = req.body.kingType || null
    const result = gameEngine.joinRoom(req.params.id, req.username, kingType)
    if (!result) return res.status(400).json({ ok: false, error: '无法加入房间' })

    // Notify creator via WebSocket
    sendToPlayer(room.player1, { type: 'room_joined', roomId: room.id, opponent: req.username })
    sendStateToRoom(room)

    res.json({ ok: true, roomId: room.id })
  } catch (e) {
    console.error('[join] error:', e)
    res.status(500).json({ ok: false, error: '服务器错误' })
  }
})

app.post('/api/darkchess/forfeit', requireAuth, (req, res) => {
  const { roomId } = req.body
  const room = gameEngine.rooms[roomId]
  if (!room) return res.status(404).json({ ok: false, error: '房间不存在' })
  if (room.status !== 'playing' && room.status !== 'deploying') return res.status(400).json({ ok: false, error: '游戏未在进行中' })
  if (room.player1 !== req.username && room.player2 !== req.username) return res.status(403).json({ ok: false, error: '你不是该房间的玩家' })
  const winner = room.player1 === req.username ? room.player2 : room.player1
  gameEngine.endGame(room, winner, 'forfeit')
  res.json({ ok: true, winner })
})

// ==================== DARK CHESS GAME ENGINE ====================

class GameRoom {
  constructor(roomId, player1, stake, mode, kingType) {
    this.id = roomId
    this.status = 'waiting'
    this.player1 = player1
    this.player2 = null
    this.stake = stake
    this.mode = mode || 'dark_chess'
    this.kingTypes = { [player1]: kingType || null }
    this.createdAt = Date.now()

    this.board = Array.from({ length: COLS }, () => Array(ROWS).fill(null))

    // Pieces per player
    if (this.mode === 'mist') {
      this.pieces = { [player1]: [] }
      const kd = kingType ? MIST_KING_DEF[kingType] : null
      this.pieces[player1].push({
        type: 'king', subType: kingType || 'diligent', owner: player1,
        col: -1, row: -1, alive: true, revealed: false,
        shielded: false, enraged: false, cursedPower: 0, blessed: false, blessedTurn: 0, placed: false,
        hp: kd ? kd.hp : 3,
      })
    } else {
      this.pieces = { [player1]: PIECE_DISTRIBUTION.map(type => ({
        type, owner: player1, col: -1, row: -1, alive: true, revealed: false,
        shielded: false, enraged: false, cursedPower: 0, blessed: false, blessedTurn: 0, placed: false,
        hp: getBaseHp(type)
      })) }
    }

    this.deployed = { [player1]: false }
    this.turn = null
    this.turnNumber = 0
    this.turnStartAt = 0
    this.turnTimer = null
    this.firstPlayer = null
    this.lastLoser = null

    // Cards
    this.cardPool = []
    this.hands = { [player1]: [] }
    this.drawnCards = { [player1]: 0 }

    // Treasures: { col, row, type, triggered }
    this.treasures = []

    // Events
    this.usedEvents = []
    this.activeEffects = {} // { flood: bool, galeNextTurn: bool }

    // Combat log
    this.combatLog = []

    // Disconnection
    this.disconnected = { [player1]: null }
    this.disconnectTimers = { [player1]: null }

    // Pending actions
    this.retreatPending = null // { attacker, defender, attackerPos, defenderPos, timeout }
    this.compelledPiece = null // { player, col, row } - forced piece to move
    this.frozenPiece = null   // { player, col, row } - frozen piece
    // moved to room level
    this.swiftActive = false
    this.swiftUsed = false
    this.galeActive = false
    this.galePlayersUsed = []

    // Trap marks and phantoms
    this.trapMarks = [] // { col, row, placedBy, turnPlaced }
    this.phantoms = []  // { col, row, placedBy, turnPlaced, opponentTurnsLeft }

    // Draw agreement
    this.drawOfferedBy = null

    // Stats
    this.stats = { [player1]: { kills: 0, cardsUsed: 0, treasuresFound: 0 } }

    // Mist mode specific
    if (this.mode === 'mist') {
      this.kingAbilitiesUsed = { [player1]: {} }
      this.sageTraps = []
      this.ratPoisonTraps = []
      this.stunned = {}
      this.poisoned = {}
      this.valiantBuffed = {}
      this.ratActionsUsed = {}
      this.monkAttackedThisTurn = null
    }
  }
}

class GameEngine {
  constructor() { this.rooms = {} }

  createRoom(roomId, player1, stake, mode, kingType) {
    this.rooms[roomId] = new GameRoom(roomId, player1, stake, mode, kingType)
  }

  getWaitingRooms(username) {
    return Object.values(this.rooms)
      .filter(r => r.status === 'waiting' && r.player1 !== username)
      .map(r => ({ id: r.id, player1: r.player1, stake: r.stake, createdAt: r.createdAt, mode: r.mode || 'dark_chess' }))
  }

  getMyGames(username) {
    return Object.values(this.rooms)
      .filter(r => (r.player1 === username || r.player2 === username) && r.status !== 'finished')
      .map(r => ({ id: r.id, opponent: r.player1 === username ? r.player2 : r.player1, status: r.status, turnNumber: r.turnNumber, stake: r.stake }))
  }

  joinRoom(roomId, player2, kingType) {
    const room = this.rooms[roomId]
    if (!room || room.status !== 'waiting') return null
    room.player2 = player2
    room.status = 'deploying'
    if (room.mode === 'mist') room.kingTypes[player2] = kingType || null

    // Initialize player2 data
    if (room.mode === 'mist') {
      room.pieces[player2] = []
      const kd = kingType ? MIST_KING_DEF[kingType] : null
      room.pieces[player2].push({
        type: 'king', subType: kingType || 'diligent', owner: player2,
        col: -1, row: -1, alive: true, revealed: false,
        shielded: false, enraged: false, cursedPower: 0, blessed: false, blessedTurn: 0, placed: false,
        hp: kd ? kd.hp : 3,
      })
    } else {
      room.pieces[player2] = PIECE_DISTRIBUTION.map(type => ({
        type, owner: player2, col: -1, row: -1, alive: true, revealed: false,
        shielded: false, enraged: false, cursedPower: 0, blessed: false, blessedTurn: 0, placed: false,
        hp: getBaseHp(type)
      }))
    }
    room.deployed[player2] = false
    room.hands[player2] = []
    room.drawnCards[player2] = 0
    room.disconnected[player2] = null
    room.disconnectTimers[player2] = null
    room.stats[player2] = { kills: 0, cardsUsed: 0, treasuresFound: 0 }

    // Mist mode player2 init
    if (room.mode === 'mist') {
      room.kingAbilitiesUsed[player2] = {}
    }

    // Initialize card pool (shuffled)
    room.cardPool = this.shuffle([...CARD_POOL])

    // Place treasures in neutral zone (2 random empty cells in rows 2-4)
    const neutralCells = []
    for (let c = 0; c < COLS; c++) for (let r = 2; r <= 4; r++) neutralCells.push([c, r])
    this.shuffle(neutralCells)
    const treasurePool = this.shuffle([...TREASURE_POOL])
    for (let i = 0; i < 2 && i < neutralCells.length; i++) {
      room.treasures.push({ col: neutralCells[i][0], row: neutralCells[i][1], type: treasurePool[i], triggered: false })
    }

    return room
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]] }
    return arr
  }

  deployPiece(room, player, pieceType, col, row) {
    if (room.status !== 'deploying') return { ok: false, error: '不在部署阶段' }
    if (room.deployed[player]) return { ok: false, error: '你已确认部署' }

    const isP1 = player === room.player1
    const internalRow = isP1 ? row : (6 - row)
    const validDisplayRows = [5, 6]
    if (col < 0 || col >= COLS || !validDisplayRows.includes(row)) return { ok: false, error: '无效的部署位置' }
    if (room.board[col][internalRow]) return { ok: false, error: '该位置已有棋子' }

    const playerPieces = room.pieces[player]

    if (room.mode === 'mist') {
      // Volume validation
      const placedPieces = playerPieces.filter(p => p.placed && p.type !== 'king')
      const currentVolume = placedPieces.reduce((sum, p) => {
        const def = MIST_PIECE_DEF[p.type]
        return sum + (def ? def.volume : 0)
      }, 0)
      // King is allowed even if not in MIST_PIECE_DEF
      if (pieceType === 'king') {
        const hasKing = playerPieces.some(p => p.type === 'king' && p.placed)
        if (hasKing) return { ok: false, error: '王最多部署1个' }
      } else {
        const pieceDef = MIST_PIECE_DEF[pieceType]
        if (!pieceDef) return { ok: false, error: '无效棋子类型' }
        const newVolume = currentVolume + pieceDef.volume
        const extraVolume = 0 // (room.kingTypes[player] === 'clever' && pieceType === 'bomb' && placedPieces.filter(p => p.type === 'bomb').length >= 1) ? 1 : 0
        const volCap = MIST_VOLUME_CAP + (room.kingTypes[player] === 'clever' ? 1 : 0)
        
        if (newVolume > volCap) return { ok: false, error: `超出体积上限！当前${currentVolume}/${volCap}，${pieceDef.name}体积${pieceDef.volume}` }

        // Max count validation
        const placedCount = placedPieces.filter(p => p.type === pieceType).length
        
        // Extra bomb for clever king logic
        let maxCount = pieceDef.maxCount
        if (room.kingTypes[player] === 'clever' && pieceType === 'bomb') maxCount = 2
        
        if (placedCount >= maxCount) return { ok: false, error: `${pieceDef.name}最多部署${maxCount}个` }
      }

      const piece = playerPieces.find(p => p.type === pieceType && !p.placed)
      if (!piece) {
        // For mist mode, dynamically add the piece if player hasn't placed max yet
        const def = MIST_PIECE_DEF[pieceType]
        const newPiece = {
          type: pieceType, owner: player, col: -1, row: -1, alive: true, revealed: false,
          shielded: false, enraged: false, cursedPower: 0, blessed: false, blessedTurn: 0, placed: false,
          hp: def.hp,
        }
        playerPieces.push(newPiece)
        newPiece.col = col; newPiece.row = internalRow; newPiece.placed = true
        room.board[col][internalRow] = { owner: player, type: pieceType }
        return { ok: true }
      }

      piece.col = col; piece.row = internalRow; piece.placed = true
      room.board[col][internalRow] = { owner: player, type: pieceType }
      console.log(`[deploy] ${player}: placed ${pieceType} at display(${col},${row}) internal(${col},${internalRow})`)
      return { ok: true }
    }

    // Dark chess mode
    const remaining = PIECE_DISTRIBUTION.filter(t => playerPieces.some(p => p.type === t && !p.placed))
    console.log(`[deploy] ${player}: pieceType=${pieceType}, remaining=[${remaining}]`)
    if (!remaining.includes(pieceType)) return { ok: false, error: '没有该类型棋子可部署' }

    const piece = playerPieces.find(p => p.type === pieceType && !p.placed)
    if (!piece) return { ok: false, error: '没有该类型棋子可部署' }

    piece.col = col; piece.row = internalRow; piece.placed = true
    room.board[col][internalRow] = { owner: player, type: pieceType }
    console.log(`[deploy] ${player}: placed ${pieceType} at display(${col},${row}) internal(${col},${internalRow})`)
    return { ok: true }
  }

  undeployPiece(room, player, col, row) {
    if (room.status !== 'deploying') return { ok: false, error: '不在部署阶段' }
    if (room.deployed[player]) return { ok: false, error: '你已确认部署' }

    const isP1 = player === room.player1
    const internalRow = isP1 ? row : (6 - row)
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return { ok: false, error: '无效的位置' }

    const cell = room.board[col][internalRow]
    if (!cell || cell.owner !== player) return { ok: false, error: '该位置没有你的棋子' }

    const piece = room.pieces[player].find(p => p.col === col && p.row === internalRow && p.placed)
    if (!piece) return { ok: false, error: '找不到该棋子' }

    piece.placed = false; piece.col = -1; piece.row = -1
    room.board[col][internalRow] = null
    console.log(`[undeploy] ${player}: removed ${piece.type} at display(${col},${row})`)
    return { ok: true }
  }

  randomDeploy(room, player) {
    if (room.status !== 'deploying' || room.deployed[player]) return { ok: false, error: '无法随机部署' }

    const isP1 = player === room.player1
    const deployRows = [5, 6]
    const positions = []
    for (let c = 0; c < COLS; c++) for (const r of deployRows) positions.push([c, r])
    this.shuffle(positions)

    // Clear existing deployments
    for (const p of room.pieces[player]) {
      if (p.placed) { room.board[p.col][p.row] = null; p.placed = false; p.col = -1; p.row = -1 }
    }

    if (room.mode === 'mist') {
      // For mist mode, randomly select pieces up to volume cap
      const king = room.pieces[player].find(p => p.type === 'king')
      if (king) {
        const pos = positions.shift()
        const internalR = isP1 ? pos[1] : (6 - pos[1])
        king.col = pos[0]; king.row = internalR; king.placed = true
        room.board[pos[0]][internalR] = { owner: player, type: 'king' }
      }
      // Pick random non-king pieces within volume cap
      const volCap = MIST_VOLUME_CAP + (room.kingTypes[player] === 'clever' ? 1 : 0)
      let usedVol = 0
      const availableTypes = Object.keys(MIST_PIECE_DEF)
      this.shuffle(availableTypes)
      for (const type of availableTypes) {
        const def = MIST_PIECE_DEF[type]
        if (usedVol + def.volume > volCap) continue
        let count = 0
        const maxC = def.maxCount
        for (let i = 0; i < maxC && usedVol + def.volume <= volCap && positions.length > 0; i++) {
          const pos = positions.shift()
          const internalR = isP1 ? pos[1] : (6 - pos[1])
          // Add piece dynamically
          const newPiece = {
            type, owner: player, col: pos[0], row: internalR, alive: true, revealed: false,
            shielded: false, enraged: false, cursedPower: 0, blessed: false, blessedTurn: 0, placed: true,
            hp: def.hp,
          }
          room.pieces[player].push(newPiece)
          room.board[pos[0]][internalR] = { owner: player, type }
          usedVol += def.volume
          count++
        }
      }
    } else {
      // Place all pieces for dark chess
      for (let i = 0; i < PIECE_DISTRIBUTION.length; i++) {
        const piece = room.pieces[player][i]
        const [c, r] = positions[i]
        const internalR = isP1 ? r : (6 - r)
        piece.col = c; piece.row = internalR; piece.placed = true
        room.board[c][internalR] = { owner: player, type: piece.type }
      }
    }
    return { ok: true }
  }

  confirmDeploy(room, player) {
    if (room.status !== 'deploying' || room.deployed[player]) return { ok: false, error: '无法确认' }

    if (room.mode === 'mist') {
      const placedPieces = room.pieces[player].filter(p => p.placed)
      const placedKing = placedPieces.find(p => p.type === 'king')
      if (!placedKing) return { ok: false, error: '请先部署王' }
      const nonKingPlaced = placedPieces.filter(p => p.type !== 'king')

      // Calculate total volume
      let totalVol = 0
      for (const p of nonKingPlaced) {
        const def = MIST_PIECE_DEF[p.type]
        if (def) totalVol += def.volume
      }
      if (totalVol < 4) return { ok: false, error: `至少部署4体积的士兵棋子（当前${totalVol}）` }
      const volCap = MIST_VOLUME_CAP + (room.kingTypes[player] === 'clever' ? 1 : 0)
      if (totalVol > volCap) return { ok: false, error: `超出体积上限 ${totalVol}/${volCap}` }
    } else {
      const placedCount = room.pieces[player].filter(p => p.placed).length
      if (placedCount < PIECE_DISTRIBUTION.length) return { ok: false, error: `请先部署所有${PIECE_DISTRIBUTION.length}枚棋子` }
    }

    room.deployed[player] = true

    // If both deployed, start playing
    if (room.deployed[room.player1] && room.deployed[room.player2]) {
      room.status = 'playing'
      room.firstPlayer = room.lastLoser || (Math.random() < 0.5 ? room.player1 : room.player2)
      room.turn = room.firstPlayer
      room.turnNumber = 1
      room.turnStartAt = Date.now()
      this.startTurnTimer(room)
    }
    return { ok: true, gameStarted: room.status === 'playing' }
  }

  startTurnTimer(room) {
    if (room.turnTimer) clearTimeout(room.turnTimer)
    room.turnStartAt = Date.now()
    room.turnTimer = setTimeout(() => this.handleTimeout(room), TURN_TIME * 1000 + 2000) // 2s grace
  }

  handleTimeout(room) {
    if (room.status !== 'playing' || !room.turn) return
    const player = room.turn
    // Auto-move first piece that can move
    const pieces = room.pieces[player].filter(p => p.alive && p.placed)
    let autoMoved = false
    for (const piece of pieces) {
      const moves = this.getLegalMoves(room, player, piece.col, piece.row)
      if (moves.length > 0) {
        // Pick the first legal move (non-attack preferred, then attack)
        const nonAttack = moves.find(m => !m.isAttack)
        const move = nonAttack || moves[0]
        if (move.isRemote) {
          this.executeRemoteAttack(room, player, piece.col, piece.row, move.col, move.row)
        } else {
          this.executeMove(room, player, piece.col, piece.row, move.col, move.row)
        }
        autoMoved = true
        break
      }
    }
    // End turn regardless
    const turnResult = this.endTurn(room)
    if (turnResult) {
      broadcastToRoom(room, { type: 'turn_change', turn: turnResult.turn, turnNumber: turnResult.turnNumber })
      if (turnResult.event) broadcastToRoom(room, { type: 'event_triggered', event: turnResult.event })
      if (turnResult.drawnCards) {
        for (const [p, card] of Object.entries(turnResult.drawnCards)) {
          sendToPlayer(p, { type: 'card_drawn', card })
        }
      }
    } else if (room.status === 'finished') {
      const winner = room.lastLoser === room.player1 ? room.player2 : room.player1
      broadcastToRoom(room, { type: 'game_over', winner, reason: 'king_killed', stats: room.stats })
    }
    sendStateToRoom(room)
  }

  getLegalMoves(room, player, col, row) {
    const piece = room.board[col][row]
    if (!piece || piece.owner !== player) return []
    const type = piece.type

    if (type === 'bomb') {
      // Mist mode clever king bomb can move 1 (empty cells only, no attack)
      if (room.mode === 'mist' && room.kingTypes[player] === 'clever') {
        return this.getBasicMoves(room, player, col, row, 1, false)
      }
      return []
    }

    const moves = []

    if (room.mode === 'mist') {
      const def = MIST_PIECE_DEF[type]
      const range = def ? def.moveRange : 1

      if (type === 'horse') {
        // Horse: move 1-2 straight, but only attack diagonal cells facing enemy
        const isP1 = player === room.player1
        const forward = isP1 ? -1 : 1
        // Add straight moves (no attack)
        const straightMoves = this.getBasicMoves(room, player, col, row, range, false)
        for (const m of straightMoves) {
          if (!m.isAttack) moves.push(m)
        }
        // Add diagonal attack cells: (col-1, row+forward) and (col+1, row+forward)
        for (const dc of [-1, 1]) {
          const nc = col + dc
          const nr = row + forward
          if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue
          if (room.activeEffects.cracks && room.activeEffects.cracks.some(c => c[0] === nc && c[1] === nr)) continue
          const target = room.board[nc][nr]
          if (target && target.owner !== player) {
            moves.push({ col: nc, row: nr, isAttack: true, isHorseAttack: true })
          }
        }
        return moves
      }

      if (type === 'monk') {
        // Monk: move 1, attack range 2 (stun, no damage)
        const basic = this.getBasicMoves(room, player, col, row, 1, false)
        for (const m of basic) moves.push(m)
        // Add range-2 attack
        const monkDirs = [[0,1],[0,-1],[1,0],[-1,0]]
        for (const [dc, dr] of monkDirs) {
          const nc = col + dc * 2
          const nr = row + dr * 2
          if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue
          if (room.activeEffects.cracks && room.activeEffects.cracks.some(c => c[0] === nc && c[1] === nr)) continue
          // Check path is clear
          const mc = col + dc, mr = row + dr
          if (room.board[mc]?.[mr]) continue
          const target = room.board[nc][nr]
          if (target && target.owner !== player) {
            moves.push({ col: nc, row: nr, isAttack: true, isRemote: true, isMonkStun: true })
          }
        }
        return moves
      }

      if (type === 'rogue') {
        // Rogue: move 1, can jump over 1 piece. When jumping, -1HP.
        const dirs = [[0,1],[0,-1],[1,0],[-1,0]]
        for (const [dc, dr] of dirs) {
          // Normal move 1
          const nc = col + dc, nr = row + dr
          if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS) {
            if (!(room.activeEffects.cracks && room.activeEffects.cracks.some(c => c[0] === nc && c[1] === nr))) {
              const target = room.board[nc][nr]
              if (!target) {
                moves.push({ col: nc, row: nr, isAttack: false })
              } else if (target.owner !== player) {
                moves.push({ col: nc, row: nr, isAttack: true })
              }
            }
          }
          // Jump over: move 2, midpoint must have a piece
          const nc2 = col + dc * 2, nr2 = row + dr * 2
          const mc = col + dc, mr = row + dr
          if (nc2 >= 0 && nc2 < COLS && nr2 >= 0 && nr2 < ROWS) {
            if (room.board[mc] && room.board[mc][mr]) {
              if (!(room.activeEffects.cracks && room.activeEffects.cracks.some(c => c[0] === nc2 && c[1] === nr2))) {
                const target2 = room.board[nc2][nr2]
                if (!target2) {
                  moves.push({ col: nc2, row: nr2, isAttack: false, isRogueJump: true })
                } else if (target2.owner !== player) {
                  moves.push({ col: nc2, row: nr2, isAttack: true, isRogueJump: true })
                }
              }
            }
          }
        }
        return moves
      }

      if (type === 'archer') {
        // Archer: move 1 (no melee attack), remote attack only
        const basic = this.getBasicMoves(room, player, col, row, 1, false)
        for (const m of basic) {
          if (!m.isAttack) moves.push(m)
        }
        // Remote attacks at distance 2
        const archDirs = [[0,1],[0,-1],[1,0],[-1,0]]
        for (const [dc, dr] of archDirs) {
          const nc = col + dc * 2, nr = row + dr * 2
          if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue
          if (room.activeEffects.cracks && room.activeEffects.cracks.some(c => c[0] === nc && c[1] === nr)) continue
          const target = room.board[nc][nr]
          if (target && target.owner !== player) {
            moves.push({ col: nc, row: nr, isAttack: true, isRemote: true })
          }
        }
        return moves
      }

      // Standard pieces (general, assassin, rat, berserker, sage, ironguard)
      // King can attack in mist mode if ATK > 0
      const kingCanAttack = type === 'king' && this.getMistKingAtk(room, player) > 0
      if (type === 'king' && !kingCanAttack) {
        return this.getBasicMoves(room, player, col, row, range, false)
      }
      return this.getBasicMoves(room, player, col, row, range, type !== 'king' || kingCanAttack)
    }

    // Dark chess mode
    const range = PIECE_MOVE_RANGE[type]
    const dirs = [[0,1],[0,-1],[1,0],[-1,0]]

    for (const [dc, dr] of dirs) {
      for (let step = 1; step <= range; step++) {
        const nc = col + dc * step
        const nr = row + dr * step
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) break
        if (room.activeEffects.cracks && room.activeEffects.cracks.some(c => c[0] === nc && c[1] === nr)) break
        const target = room.board[nc][nr]
        if (target) {
          if (target.owner === player) break
          if (type !== 'king' && (type !== 'pawn' || step === 1)) {
            moves.push({ col: nc, row: nr, isAttack: true })
          }
          break
        }
        moves.push({ col: nc, row: nr, isAttack: false })
        if (type === 'pawn' && step === 1) {
          const midC = col + dc, midR = row + dr
          if (room.board[midC]?.[midR]) break
        }
      }
    }

    // Archer remote attacks for dark chess
    if (type === 'archer') {
      for (const [dc, dr] of dirs) {
        const nc = col + dc * 2, nr = row + dr * 2
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue
        if (room.activeEffects.cracks && room.activeEffects.cracks.some(c => c[0] === nc && c[1] === nr)) continue
        const target = room.board[nc][nr]
        if (target && target.owner !== player) {
          moves.push({ col: nc, row: nr, isAttack: true, isRemote: true })
        }
      }
    }

    return moves
  }

  // Helper: basic straight-line moves for a piece
  getBasicMoves(room, player, col, row, range, canAttack) {
    const moves = []
    const dirs = [[0,1],[0,-1],[1,0],[-1,0]]
    for (const [dc, dr] of dirs) {
      for (let step = 1; step <= range; step++) {
        const nc = col + dc * step, nr = row + dr * step
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) break
        if (room.activeEffects.cracks && room.activeEffects.cracks.some(c => c[0] === nc && c[1] === nr)) break
        const target = room.board[nc][nr]
        if (target) {
          if (target.owner === player) break
          if (canAttack) moves.push({ col: nc, row: nr, isAttack: true })
          break
        }
        moves.push({ col: nc, row: nr, isAttack: false })
      }
    }
    return moves
  }

  // Helper: which direction is "forward" for a player
  playerForward(player) {
    // Player 1 (rows 5-6 deploy) moves toward row 0 (up/negative row)
    // Player 2 (rows 0-1 deploy) moves toward row 6 (down/positive row)
    // Internal: P1 deploy rows 5-6, forward = -1; P2 deploy rows 0-1, forward = +1
    // But we don't have room ref here. We need room context.
    return null // This needs room context - handled inline
  }

  // Helper: get king ATK in mist mode
  getMistKingAtk(room, player) {
    const kt = room.kingTypes[player]
    if (!kt) return 0
    const kd = MIST_KING_DEF[kt]
    return kd ? kd.atk : 0
  }

  getRandomLegalMove(room, player) {
    const allMoves = []
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const piece = room.board[c][r]
        if (piece && piece.owner === player) {
          const moves = this.getLegalMoves(room, player, c, r)
          for (const m of moves) allMoves.push({ from: { col: c, row: r }, to: m, remote: m.isRemote || false })
        }
      }
    }
    if (allMoves.length === 0) return null
    return allMoves[Math.floor(Math.random() * allMoves.length)]
  }

  executeMove(room, player, fromCol, fromRow, toCol, toRow, moveFlags) {
    const piece = room.board[fromCol][fromRow]
    if (!piece || piece.owner !== player) return { ok: false, error: '无效的移动' }

    // Mist mode: check if piece is stunned
    if (room.mode === 'mist' && room.stunned) {
      const stunnedUntil = room.stunned[this.pieceKey(player, fromCol, fromRow)]
      if (stunnedUntil && room.turnNumber < stunnedUntil) {
        return { ok: false, error: '该棋子被眩晕，无法行动' }
      }
    }

    // Check if target is a phantom
    if (room.phantoms) {
      const phIdx = room.phantoms.findIndex(p => p.col === toCol && p.row === toRow)
      if (phIdx !== -1) {
        room.phantoms.splice(phIdx, 1)
        room.board[toCol][toRow] = piece
        room.board[fromCol][fromRow] = null
        const pp = this.findPiece(room, player, piece.type, fromCol, fromRow)
        if (pp) { pp.col = toCol; pp.row = toRow }
        return { ok: true, moved: true, combat: { result: 'phantom' } }
      }
    }

    const target = room.board[toCol][toRow]
    if (target && target.owner === player) return { ok: false, error: '不能移动到己方棋子位置' }

    // King attack validation
    if (piece.type === 'king' && target) {
      if (room.mode === 'mist') {
        const kingAtk = this.getMistKingAtk(room, player)
        if (kingAtk <= 0) return { ok: false, error: '该王不能主动攻击' }
      } else {
        return { ok: false, error: '王不能主动攻击' }
      }
    }

    // Handle rogue jump HP cost
    const flags = moveFlags || {}
    if (flags.isRogueJump) {
      const pp = this.findPiece(room, player, piece.type, fromCol, fromRow)
      if (pp) { pp.hp = Math.max(1, pp.hp - 1) }
    }

    let combatResult = null
    if (target) {
      combatResult = this.resolveCombat(room, player, fromCol, fromRow, toCol, toRow, false, flags)
    } else {
      // Simple move
      room.board[toCol][toRow] = piece
      room.board[fromCol][fromRow] = null
      const p = this.findPiece(room, player, piece.type, fromCol, fromRow)
      if (p) { p.col = toCol; p.row = toRow }

      // Check traps at destination
      combatResult = this.checkTrapsOnMove(room, player, toCol, toRow, combatResult)

      // Check treasure
      const treasure = this.checkTreasure(room, player, toCol, toRow)
      if (treasure) combatResult = { ...(combatResult || {}), treasure, treasureType: treasure.type }
    }

    return { ok: true, moved: true, combat: combatResult }
  }

  // Check all traps when moving to a cell
  checkTrapsOnMove(room, player, col, row, existingResult) {
    let result = existingResult
    // Card trap marks
    if (room.trapMarks) {
      const trapIdx = room.trapMarks.findIndex(t => t.col === col && t.row === row)
      if (trapIdx !== -1) {
        const trap = room.trapMarks[trapIdx]
        room.trapMarks.splice(trapIdx, 1)
        if (trap.placedBy !== player) {
          // Check if king is wise (immune)
          if (!(room.mode === 'mist' && room.kingTypes[player] === 'wise')) {
            this.frozenPiece = { player, col, row }
            room.trapFreezeThisTurn = true
          }
        }
        result = { ...(result || {}), trapTriggered: true }
      }
    }
    // Sage traps
    if (room.mode === 'mist' && room.sageTraps) {
      const sageIdx = room.sageTraps.findIndex(t => t.col === col && t.row === row)
      if (sageIdx !== -1) {
        const strap = room.sageTraps[sageIdx]
        if (strap.placedBy !== player) {
          if (!(room.kingTypes[player] === 'wise')) {
            const pp = this.findPieceAt(room, player, col, row)
            if (pp) {
              pp.cursedPower = (pp.cursedPower || 0) - 1
              pp.revealed = true
            }
          }
        }
        room.sageTraps.splice(sageIdx, 1)
        result = { ...(result || {}), sageTrapTriggered: true }
      }
    }
    // Rat poison traps
    if (room.mode === 'mist' && room.ratPoisonTraps) {
      const poiIdx = room.ratPoisonTraps.findIndex(t => t.col === col && t.row === row)
      if (poiIdx !== -1) {
        const ptrap = room.ratPoisonTraps[poiIdx]
        if (ptrap.placedBy !== player) {
          if (!(room.kingTypes[player] === 'wise')) {
            const pKey = this.pieceKey(player, col, row)
            room.poisoned[pKey] = 3 // 3 turns of poison
          }
        }
        room.ratPoisonTraps.splice(poiIdx, 1)
        result = { ...(result || {}), poisonTriggered: true }
      }
    }
    return result
  }

  // Find piece at position by player
  findPieceAt(room, player, col, row) {
    return room.pieces[player].find(p => p.col === col && p.row === row && p.alive)
  }

  // Unique key for a piece
  pieceKey(player, col, row) {
    return `${player}:${col},${row}`
  }

  executeRemoteAttack(room, player, fromCol, fromRow, toCol, toRow, flags) {
    const piece = room.board[fromCol][fromRow]
    const isMonk = room.mode === 'mist' && piece && piece.type === 'monk'
    if (!piece || piece.owner !== player || (!isMonk && piece.type !== 'archer')) return { ok: false, error: '无效的远程攻击' }

    // Check if target is a phantom
    if (room.phantoms) {
      const phIdx = room.phantoms.findIndex(p => p.col === toCol && p.row === toRow)
      if (phIdx !== -1) {
        room.phantoms.splice(phIdx, 1)
        return { ok: true, moved: false, combat: { result: 'phantom' } }
      }
    }

    const target = room.board[toCol][toRow]
    if (!target || target.owner === player) return { ok: false, error: '无效的攻击目标' }

    // Validate path
    const dc = Math.sign(toCol - fromCol)
    const dr = Math.sign(toRow - fromRow)
    const dist = Math.abs(toCol - fromCol) + Math.abs(toRow - fromRow)
    if (dist !== 2) return { ok: false, error: '只能攻击距离2的直线目标' }
    if (dc !== 0 && dr !== 0) return { ok: false, error: '只能直线攻击' }

    // Check path clear
    for (let step = 1; step < dist; step++) {
      const pc = fromCol + dc * step, pr = fromRow + dr * step
      if (room.board[pc]?.[pr]) return { ok: false, error: '路径被阻挡' }
    }
    const moveFlags = { isMonkStun: isMonk && (flags?.isMonkStun) }
    const combatResult = this.resolveCombat(room, player, fromCol, fromRow, toCol, toRow, true, moveFlags)
    return { ok: true, moved: false, combat: combatResult }
  }

  resolveCombat(room, attackerPlayer, aCol, aRow, dCol, dRow, isRemote, moveFlags) {
    const attackerPiece = room.board[aCol][aRow]
    const defenderPiece = room.board[dCol][dRow]
    if (!attackerPiece || !defenderPiece) return { result: 'error' }

    const attackerType = attackerPiece.type
    const defenderType = defenderPiece.type
    const defenderPlayer = defenderPiece.owner
    const flags = moveFlags || {}

    // Step 1: Check shield
    const defPieceObj = this.findPiece(room, defenderPlayer, defenderType, dCol, dRow)
    if (defPieceObj?.shielded) {
      defPieceObj.shielded = false
      defenderPiece.shielded = false
      this.revealPiece(room, attackerPlayer, aCol, aRow)
      this.revealPiece(room, defenderPlayer, dCol, dRow)
      return { result: 'shield_block', attacker: { type: attackerType, owner: attackerPlayer }, defender: { type: defenderType, owner: defenderPlayer }, log: `${this.pieceName(defenderType, room)}的护盾抵消了攻击` }
    }

    // Step 2: Check bomb (defender is bomb = mutual death; attacker is bomb = error)
    if (defenderType === 'bomb') {
      this.revealPiece(room, defenderPlayer, dCol, dRow)
      this.removePiece(room, attackerPlayer, attackerType, aCol, aRow)
      this.removePiece(room, defenderPlayer, defenderType, dCol, dRow)
      return { result: 'mutual_death', attacker: { type: attackerType, owner: attackerPlayer }, defender: { type: defenderType, owner: defenderPlayer }, log: '炸弹同归于尽！', isBomb: true }
    }
    if (attackerType === 'bomb') return { result: 'error' }

    // Step 3: Check assassin
    if (attackerType === 'assassin') {
      this.revealPiece(room, defenderPlayer, dCol, dRow)
      this.removePiece(room, defenderPlayer, defenderType, dCol, dRow)
      room.stats[attackerPlayer].kills++
      if (defenderType === 'king') return { result: 'king_killed', attacker: { type: attackerType, owner: attackerPlayer }, defender: { type: defenderType, owner: defenderPlayer }, log: '刺客一击必杀！王已陨落！', kingKilled: true }
      return { result: 'assassin_kill', attacker: { type: attackerType, owner: attackerPlayer }, defender: { type: defenderType, owner: defenderPlayer }, log: '刺客必杀！' }
    }

    // Step 4: Mist mode - Monk stun attack (only vs non-bomb, non-shielded)
    if (flags.isMonkStun) {
      this.revealPiece(room, attackerPlayer, aCol, aRow)
      this.revealPiece(room, defenderPlayer, dCol, dRow)
      room.stunned = room.stunned || {}
      room.stunned[this.pieceKey(attackerPlayer, aCol, aRow)] = room.turnNumber + 2
      room.stunned[this.pieceKey(defenderPlayer, dCol, dRow)] = room.turnNumber + 2
      return {
        result: 'monk_stun', attacker: { type: attackerType, owner: attackerPlayer },
        defender: { type: defenderType, owner: defenderPlayer },
        log: `行者与${this.pieceName(defenderType, room)}双双眩晕！下回合无法行动`,
        monkStun: true
      }
    }

    // Step 5: HP-based combat
    let atkPower = this.getCombatPower(room, attackerPlayer, attackerType, aCol, aRow)
    let defPower = this.getCombatPower(room, defenderPlayer, defenderType, dCol, dRow)

    // Reveal logic: in mist mode, only survivors are revealed; dead pieces stay hidden
    const isMist = room.mode === 'mist'

    this.revealPiece(room, attackerPlayer, aCol, aRow)
    this.revealPiece(room, defenderPlayer, dCol, dRow)

    const atkPiece = this.findPiece(room, attackerPlayer, attackerType, aCol, aRow)
    const defPiece = this.findPiece(room, defenderPlayer, defenderType, dCol, dRow)
    const atkHpBefore = atkPiece ? atkPiece.hp : 999
    const defHpBefore = defPiece ? defPiece.hp : 999

    // Ironguard damage reduction
    let actualAtkDmg = atkPower
    let actualDefDmg = defPower
    if (isMist) {
      if (defenderType === 'ironguard') actualAtkDmg = Math.max(1, atkPower - 1)
      if (attackerType === 'ironguard') actualDefDmg = Math.max(1, defPower - 1)
    }

    // Apply damage
    if (defPiece) defPiece.hp -= actualAtkDmg
    if (defPower >= atkPower && atkPiece) atkPiece.hp -= actualDefDmg
    const defDied = defPiece ? defPiece.hp <= 0 : true
    const atkDied = atkPiece ? atkPiece.hp <= 0 : false

    const atkHpAfter = atkDied ? 0 : Math.max(0, atkPiece?.hp || 0)
    const defHpAfter = defDied ? 0 : Math.max(0, defPiece?.hp || 0)

    // Remove dead pieces
    if (defDied) {
      this.removePiece(room, defenderPlayer, defenderType, dCol, dRow)
      room.stats[attackerPlayer].kills++
      if (isMist && defPiece) defPiece.revealed = false
    }
    if (atkDied) {
      this.removePiece(room, attackerPlayer, attackerType, aCol, aRow)
      room.stats[defenderPlayer].kills++
      if (isMist && atkPiece) atkPiece.revealed = false
    }

    // Clear enraged (one-time use)
    if (atkPiece) { atkPiece.enraged = false; if (room.board[aCol]?.[aRow]) room.board[aCol][aRow].enraged = false }
    if (defPiece) { defPiece.enraged = false; if (room.board[dCol]?.[dRow]) room.board[dCol][dRow].enraged = false }

    const pn = (t) => this.pieceName(t, room)

    if (defDied && defenderType === 'king') {
      return { result: 'king_killed', attacker: { type: attackerType, owner: attackerPlayer }, defender: { type: defenderType, owner: defenderPlayer }, atkPower, defPower, atkHpBefore, defHpBefore, atkHpAfter, defHpAfter, log: `${pn(attackerType)}(${atkPower})击杀了${pn(defenderType)}！`, kingKilled: true }
    }
    if (defDied && atkDied) {
      return { result: 'mutual_death', attacker: { type: attackerType, owner: attackerPlayer }, defender: { type: defenderType, owner: defenderPlayer }, atkPower, defPower, atkHpBefore, defHpBefore, atkHpAfter, defHpAfter, log: `${pn(attackerType)}(${atkPower})与${pn(defenderType)}(${defPower})同归于尽！` }
    }
    if (defDied) {
      return { result: 'attacker_win', attacker: { type: attackerType, owner: attackerPlayer }, defender: { type: defenderType, owner: defenderPlayer }, atkPower, defPower, atkHpBefore, defHpBefore, atkHpAfter, defHpAfter, log: `${pn(attackerType)}(${atkPower})击败了${pn(defenderType)}，剩余${atkHpAfter}HP` }
    }
    if (atkDied) {
      return { result: 'defender_win', attacker: { type: attackerType, owner: attackerPlayer }, defender: { type: defenderType, owner: defenderPlayer }, atkPower, defPower, atkHpBefore, defHpBefore, atkHpAfter, defHpAfter, log: `${pn(defenderType)}(${defPower})反击击杀了${pn(attackerType)}！` }
    }
    return { result: 'both_survive', attacker: { type: attackerType, owner: attackerPlayer }, defender: { type: defenderType, owner: defenderPlayer }, atkPower, defPower, atkHpBefore, defHpBefore, atkHpAfter, defHpAfter, log: `${pn(attackerType)}(${atkPower})⇄${pn(defenderType)}(${defPower})，均存活` }
  }

  getCombatPower(room, player, type, col, row) {
    if (type === 'assassin') return 1
    if (type === 'bomb') return -1

    // Mist mode: look up power from MIST_PIECE_DEF
    if (room.mode === 'mist') {
      if (type === 'king') return this.getMistKingAtk(room, player)
      const def = MIST_PIECE_DEF[type]
      let power = def ? (def.atk === '★' ? 1 : def.atk) : 0
      const pieceObj = this.findPiece(room, player, type, col, row)
      if (pieceObj) {
        power += (pieceObj.cursedPower || 0)
        if (pieceObj.enraged) power += 3
        if (pieceObj.blessed) power += 3
        // Berserker scaling: ATK = 1 + lost HP + all modifiers
        if (type === 'berserker') {
          const maxHp = def.hp
          const lostHp = maxHp - (pieceObj.hp || maxHp)
          power = 1 + lostHp + (pieceObj.cursedPower || 0)
          if (pieceObj.enraged) power += 3
          if (pieceObj.blessed) power += 3
        }
        // Valiant king buff
        if (room.valiantBuffed && room.valiantBuffed[player]) {
          const vb = room.valiantBuffed[player]
          if (vb.targetCol === col && vb.targetRow === row) power += 2
        }
      }
      return Math.max(type === 'monk' ? 0 : 1, power)
    }

    // Dark chess mode
    let power = PIECE_POWER[type] || 0
    const pieceObj = this.findPiece(room, player, type, col, row)
    if (pieceObj) {
      power += (pieceObj.cursedPower || 0)
      if (pieceObj.enraged) power += 3
      if (pieceObj.blessed) power += 3
    }
    return Math.max(1, power)
  }

  pieceName(type, room) {
    if (room && room.mode === 'mist') {
      const names = { king:'👑王', horse:'🐴马', general:'⚔️将', assassin:'🗡️刺客', archer:'🏹弓', bomb:'💣炸弹', monk:'🧘行者', rogue:'🥷侠客', rat:'🐀老鼠', berserker:'💢狂战', sage:'🧙国师', ironguard:'🛡️铁卫' }
      return names[type] || type
    }
    const names = { king:'👑王', general:'⚔️将', assassin:'🗡️刺客', archer:'🏹弓', bomb:'💣炸弹', pawn:'🐴兵', scout:'🔭侦察兵' }
    return names[type] || type
  }

  removePiece(room, player, type, col, row) {
    room.board[col][row] = null
    const piece = this.findPiece(room, player, type, col, row)
    if (piece) piece.alive = false
  }

  findPiece(room, player, type, col, row) {
    return room.pieces[player].find(p => p.type === type && p.col === col && p.row === row && p.alive)
  }

  revealPiece(room, player, col, row) {
    // Find piece by position (type unknown)
    const pieces = room.pieces[player]
    for (const p of pieces) {
      if (p.col === col && p.row === row && p.alive) {
        p.revealed = true
        return p
      }
    }
    return null
  }

  checkTreasure(room, player, col, row) {
    const treasure = room.treasures.find(t => t.col === col && t.row === row && !t.triggered)
    if (!treasure) return null
    treasure.triggered = true
    room.stats[player].treasuresFound++

    const piece = room.board[col][row]
    if (!piece) return { type: treasure.type }

    // Find the piece object (piece objects store state flags)
    const pieceObj = this.findPiece(room, player, piece.type, col, row)

    switch (treasure.type) {
      case TREASURES.DIAMOND_ARMOR:
        piece.shielded = true
        if (pieceObj) pieceObj.shielded = true
        break
      case TREASURES.WHETSTONE:
        piece.enraged = true
        if (pieceObj) pieceObj.enraged = true
        break
      case TREASURES.MAGNET: {
        const emptyNeighbors = this.getEmptyNeighbors(room, col, row)
        if (emptyNeighbors.length > 0) {
          const [nc, nr] = emptyNeighbors[Math.floor(Math.random() * emptyNeighbors.length)]
          room.board[nc][nr] = piece
          room.board[col][row] = null
          piece.col = nc; piece.row = nr
          if (pieceObj) { pieceObj.col = nc; pieceObj.row = nr }
        }
        break
      }
      case TREASURES.SHADOW:
        if (pieceObj) pieceObj.revealed = false
        break
      case TREASURES.TRAP:
        if (pieceObj) {
          pieceObj.cursedPower = (pieceObj.cursedPower || 0) - 1
          if (getBaseHp(pieceObj.type) + pieceObj.cursedPower < 1) pieceObj.cursedPower = 1 - getBaseHp(pieceObj.type)
          const newMax = getMaxHp(pieceObj.type, pieceObj.cursedPower, !!pieceObj.blessed)
          if (pieceObj.hp > newMax) pieceObj.hp = newMax
        }
        break
      case TREASURES.PORTAL: {
        const empties = this.getAllEmptyCells(room)
        if (empties.length > 0) {
          const [nc, nr] = empties[Math.floor(Math.random() * empties.length)]
          room.board[nc][nr] = piece
          room.board[col][row] = null
          piece.col = nc; piece.row = nr
          if (pieceObj) { pieceObj.col = nc; pieceObj.row = nr }
        }
        break
      }
      case TREASURES.NOTHING:
        break
    }
    return { type: treasure.type }
  }

  getEmptyNeighbors(room, col, row) {
    const result = []
    for (const [dc, dr] of [[0,1],[0,-1],[1,0],[-1,0]]) {
      const nc = col + dc, nr = row + dr
      if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS && !room.board[nc][nr]) {
        if (!(room.activeEffects.cracks && room.activeEffects.cracks.some(c => c[0] === nc && c[1] === nr))) {
          result.push([nc, nr])
        }
      }
    }
    return result
  }

  getAllEmptyCells(room) {
    const result = []
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
      if (!room.board[c][r] && !(room.activeEffects.cracks && room.activeEffects.cracks.some(cr => cr[0] === c && cr[1] === r))) {
        result.push([c, r])
      }
    }
    return result
  }

  // ==================== CARD SYSTEM ====================

  drawCardsForTurn(room) {
    if (room.turnNumber === 0) return null

    const results = {}
    for (const player of [room.player1, room.player2]) {
      // Determine card draw interval for this player
      let interval = CARD_DRAW_INTERVAL
      if (room.mode === 'mist') {
        const kt = room.kingTypes[player]
        if (kt && MIST_KING_DEF[kt]?.cardInterval) interval = MIST_KING_DEF[kt].cardInterval
      }
      if (room.turnNumber % interval !== 0) continue

      if (room.cardPool.length === 0) { room.cardPool = this.shuffle([...CARD_POOL]) }
      if (room.hands[player].length >= HAND_LIMIT) continue
      const card = room.cardPool.pop()
      room.hands[player].push(card)
      results[player] = card
    }
    return Object.keys(results).length > 0 ? results : null
  }

  playCard(room, player, cardType, targets) {
    if (room.status !== 'playing' || room.turn !== player) return { ok: false, error: '不是你的回合' }
    const hand = room.hands[player]
    const cardIdx = hand.indexOf(cardType)
    if (cardIdx === -1) return { ok: false, error: '你没有这张卡' }

    const opponent = player === room.player1 ? room.player2 : room.player1
    room.stats[player].cardsUsed++

    switch (cardType) {
      case CARDS.SCOUT: {
        const { targetCol, targetRow } = targets
        const scCell = room.board[targetCol]?.[targetRow]
        if (!scCell || scCell.owner !== opponent) return { ok: false, error: '无效目标' }
        const scPiece = this.findPiece(room, opponent, scCell.type, targetCol, targetRow)
        if (scPiece) scPiece.revealed = true
        hand.splice(cardIdx, 1)
        return { ok: true, card: cardType, result: { revealedType: scCell.type, col: targetCol, row: targetRow }, private: true }
      }
      case CARDS.SHIELD: {
        const { targetCol, targetRow } = targets
        const cell = room.board[targetCol]?.[targetRow]
        if (!cell || cell.owner !== player) return { ok: false, error: '无效目标' }
        const sPiece = this.findPiece(room, player, cell.type, targetCol, targetRow)
        if (sPiece) sPiece.shielded = true
        hand.splice(cardIdx, 1)
        return { ok: true, card: cardType, result: { col: targetCol, row: targetRow } }
      }
      case CARDS.SWIFT: {
        room.swiftActive = true
        room.swiftUsed = false
        hand.splice(cardIdx, 1)
        return { ok: true, card: cardType, result: {} }
      }
      case CARDS.SWAP: {
        const { piece1Col, piece1Row, piece2Col, piece2Row } = targets
        const p1 = room.board[piece1Col]?.[piece1Row]
        const p2 = room.board[piece2Col]?.[piece2Row]
        if (!p1 || !p2 || p1.owner !== player || p2.owner !== player) return { ok: false, error: '无效目标' }
        // Swap on board
        room.board[piece1Col][piece1Row] = p2
        room.board[piece2Col][piece2Row] = p1
        // Update piece positions
        const piece1 = this.findPiece(room, player, p1.type, piece1Col, piece1Row)
        const piece2 = this.findPiece(room, player, p2.type, piece2Col, piece2Row)
        if (piece1) { piece1.col = piece2Col; piece1.row = piece2Row }
        if (piece2) { piece2.col = piece1Col; piece2.row = piece1Row }
        hand.splice(cardIdx, 1)
        return { ok: true, card: cardType, result: {} }
      }
      case CARDS.DISGUISE: {
        const { targetCol, targetRow } = targets
        const dCell = room.board[targetCol]?.[targetRow]
        if (!dCell || dCell.owner !== player) return { ok: false, error: '无效目标' }
        const dPiece = this.findPiece(room, player, dCell.type, targetCol, targetRow)
        if (dPiece) dPiece.revealed = false
        hand.splice(cardIdx, 1)
        return { ok: true, card: cardType, result: { col: targetCol, row: targetRow } }
      }
      case CARDS.RAGE: {
        const { targetCol, targetRow } = targets
        const rCell = room.board[targetCol]?.[targetRow]
        if (!rCell || rCell.owner !== player) return { ok: false, error: '无效目标' }
        if (rCell.type === 'assassin' || rCell.type === 'bomb') return { ok: false, error: '该棋子无法使用狂暴' }
        const rPiece = this.findPiece(room, player, rCell.type, targetCol, targetRow)
        if (rPiece) rPiece.enraged = true
        hand.splice(cardIdx, 1)
        return { ok: true, card: cardType, result: { col: targetCol, row: targetRow } }
      }
      case CARDS.FREEZE: {
        const { targetCol, targetRow } = targets
        const piece = room.board[targetCol]?.[targetRow]
        if (!piece || piece.owner !== opponent) return { ok: false, error: '无效目标' }
        this.frozenPiece = { player: opponent, col: targetCol, row: targetRow }
        hand.splice(cardIdx, 1)
        return { ok: true, card: cardType, result: { col: targetCol, row: targetRow } }
      }
      case CARDS.FORESIGHT: {
        hand.splice(cardIdx, 1)
        return { ok: true, card: cardType, result: { hand: room.hands[opponent] }, private: true }
      }
      case CARDS.COMPEL: {
        const { targetCol, targetRow } = targets
        const piece = room.board[targetCol]?.[targetRow]
        if (!piece || piece.owner !== opponent) return { ok: false, error: '无效目标' }
        if (piece.type === 'bomb') return { ok: false, error: '不能强制炸弹移动' }
        this.compelledPiece = { player: opponent, col: targetCol, row: targetRow }
        hand.splice(cardIdx, 1)
        return { ok: true, card: cardType, result: { col: targetCol, row: targetRow } }
      }
      case CARDS.STEAL: {
        hand.splice(cardIdx, 1)
        const oppHand = room.hands[opponent]
        if (oppHand.length === 0) return { ok: true, card: cardType, result: { stolen: null } }
        const stealIdx = Math.floor(Math.random() * oppHand.length)
        const stolen = oppHand.splice(stealIdx, 1)[0]
        hand.push(stolen)
        // Auto-discard extra card if over limit
        if (hand.length > HAND_LIMIT) hand.splice(0, 1)
        return { ok: true, card: cardType, result: { stolen } }
      }
      case CARDS.TRAP_MARK: {
        const { targetCol, targetRow } = targets
        if (room.board[targetCol]?.[targetRow]) return { ok: false, error: '该位置已有棋子' }
        if (!room.trapMarks) room.trapMarks = []
        room.trapMarks.push({ col: targetCol, row: targetRow, placedBy: player, turnPlaced: room.turnNumber })
        hand.splice(cardIdx, 1)
        return { ok: true, card: cardType, result: { col: targetCol, row: targetRow }, private: true }
      }
      case CARDS.PHANTOM: {
        const { targetCol, targetRow } = targets
        if (room.board[targetCol]?.[targetRow]) return { ok: false, error: '该位置已有棋子' }
        if (!room.phantoms) room.phantoms = []
        room.phantoms.push({ col: targetCol, row: targetRow, placedBy: player, turnPlaced: room.turnNumber, opponentTurnsLeft: 3 })
        hand.splice(cardIdx, 1)
        return { ok: true, card: cardType, result: { col: targetCol, row: targetRow }, private: true }
      }
      default:
        return { ok: false, error: '未知的卡牌类型' }
    }
  }

  discardCard(room, player, cardIndex) {
    const hand = room.hands[player]
    if (cardIndex < 0 || cardIndex >= hand.length) return { ok: false, error: '无效的卡牌' }
    hand.splice(cardIndex, 1)
    return { ok: true }
  }

  // ==================== BATTLEFIELD EVENTS ====================

  triggerEvent(room) {
    if (room.turnNumber % EVENT_INTERVAL !== 0 || room.turnNumber === 0) return null
    let available = EVENT_POOL.filter(e => !room.usedEvents.includes(e))
    if (available.length === 0) { room.usedEvents = []; available = [...EVENT_POOL] }
    const event = available[Math.floor(Math.random() * available.length)]
    room.usedEvents.push(event)

    switch (event) {
      case EVENTS.FOG: {
        for (let c = 0; c < COLS; c++) for (let r = 2; r <= 4; r++) {
          const piece = room.board[c][r]
          if (piece) {
            const owner = piece.owner
            const pieceObj = this.findPiece(room, owner, piece.type, c, r)
            if (pieceObj) pieceObj.revealed = false
          }
        }
        return { type: event, name: '浓雾降临', desc: '中立区所有已揭示棋子重新变为未揭示' }
      }
      case EVENTS.EARTHQUAKE: {
        const emptyNeutral = []
        for (let c = 0; c < COLS; c++) for (let r = 2; r <= 4; r++) {
          if (!room.board[c][r] && !(room.activeEffects.cracks && room.activeEffects.cracks.some(cr => cr[0] === c && cr[1] === r))) {
            emptyNeutral.push([c, r])
          }
        }
        if (emptyNeutral.length === 0) return { type: event, name: '地震', desc: '没有空格可变为裂缝' }
        const [ec, er] = emptyNeutral[Math.floor(Math.random() * emptyNeutral.length)]
        if (!room.activeEffects.cracks) room.activeEffects.cracks = []
        room.activeEffects.cracks.push([ec, er])
        return { type: event, name: '地震', desc: `${String.fromCharCode(65 + ec)}${er + 1}变为裂缝`, crackPos: [ec, er] }
      }
      case EVENTS.LIGHTNING: {
        const revealed = []
        for (const p of [room.player1, room.player2]) {
          for (const piece of room.pieces[p]) {
            if (piece.alive && piece.revealed && piece.type !== 'king' && piece.type !== 'bomb') {
              revealed.push(piece)
            }
          }
        }
        if (revealed.length === 0) return { type: event, name: '雷击', desc: '没有可被雷击的棋子' }
        const target = revealed[Math.floor(Math.random() * revealed.length)]
        target.cursedPower = (target.cursedPower || 0) - 1
        if (getBaseHp(target.type) + target.cursedPower < 1) target.cursedPower = 1 - getBaseHp(target.type)
        const newMax = getMaxHp(target.type, target.cursedPower, !!target.blessed)
        if (target.hp > newMax) target.hp = newMax
        return { type: event, name: '雷击', desc: `${this.pieceName(target.type, room)}被雷击，战斗力永久-1`, target: { col: target.col, row: target.row, owner: target.owner } }
      }
      case EVENTS.RAINBOW: {
        const result = {}
        for (const p of [room.player1, room.player2]) {
          const unrevealed = room.pieces[p].filter(pc => pc.alive && !pc.revealed)
          if (unrevealed.length > 0) {
            const target = unrevealed[Math.floor(Math.random() * unrevealed.length)]
            target.blessed = true
            target.blessedTurn = room.turnNumber
            target.hp += 3
            result[p] = { col: target.col, row: target.row }
          }
        }
        return { type: event, name: '彩虹祝福', desc: '双方各1枚未揭示棋子获得祝福', targets: result }
      }
      case EVENTS.FLOOD: {
        room.activeEffects.flood = true
        return { type: event, name: '洪水', desc: '第3行和第5行变为水域（防守时战斗力-1）', waterRows: [2, 4] }
      }
      case EVENTS.DIVINATION: {
        const result = {}
        for (const p of [room.player1, room.player2]) {
          const opponent = p === room.player1 ? room.player2 : room.player1
          const unrevealed = room.pieces[opponent].filter(pc => pc.alive && !pc.revealed)
          if (unrevealed.length > 0) {
            const target = unrevealed[Math.floor(Math.random() * unrevealed.length)]
            result[p] = { col: target.col, row: target.row, type: target.type, owner: opponent }
          }
        }
        return { type: event, name: '占卜', desc: '双方各看到对方1枚未揭示棋子', reveals: result, private: true }
      }
      case EVENTS.GALE: {
        room.galeActive = true
        room.galePlayersUsed = []
        return { type: event, name: '疾风突袭', desc: '本回合双方都可移动2枚棋子' }
      }
      case EVENTS.DESTINY: {
        const p1Pieces = room.pieces[room.player1].filter(p => p.alive && p.type !== 'bomb' && p.type !== 'king')
        const p2Pieces = room.pieces[room.player2].filter(p => p.alive && p.type !== 'bomb' && p.type !== 'king')
        if (p1Pieces.length === 0 || p2Pieces.length === 0) return { type: event, name: '命运之轮', desc: '无法触发（一方只剩炸弹）' }
        const p1 = p1Pieces[Math.floor(Math.random() * p1Pieces.length)]
        const p2 = p2Pieces[Math.floor(Math.random() * p2Pieces.length)]
        const tmp = { col: p1.col, row: p1.row }
        room.board[p1.col][p1.row] = { owner: room.player2, type: p2.type }
        room.board[p2.col][p2.row] = { owner: room.player1, type: p1.type }
        p1.col = p2.col; p1.row = p2.row
        p2.col = tmp.col; p2.row = tmp.row
        return { type: event, name: '命运之轮', desc: '双方各1枚棋子交换位置', swap: { p1: { col: p1.col, row: p1.row }, p2: { col: p2.col, row: p2.row } } }
      }
    }
    return null
  }

  // ==================== SCOUT ACTION ====================

  executeScout(room, player, col, row) {
    if (room.status !== 'playing' || room.turn !== player) return { ok: false, error: '不是你的回合' }
    const cell = room.board[col]?.[row]
    if (!cell || cell.owner !== player) return { ok: false, error: '无效的棋子' }
    if (cell.type !== 'scout') return { ok: false, error: '只有侦察兵可以侦查' }

    const SCOUT_RANGE = 3
    const directions = [[0,1],[0,-1],[1,0],[-1,0]]
    const revealedPieces = []

    for (const [dc, dr] of directions) {
      for (let step = 1; step <= SCOUT_RANGE; step++) {
        const nc = col + dc * step
        const nr = row + dr * step
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) break

        const target = room.board[nc][nr]
        if (target) {
          if (target.owner !== player) {
            const pieceObj = this.findPiece(room, target.owner, target.type, nc, nr)
            if (pieceObj && !pieceObj.revealed) {
              pieceObj.revealed = true
              revealedPieces.push({ col: nc, row: nr, type: target.type })
            }
          }
          break
        }
      }
    }

    return { ok: true, revealed: revealedPieces }
  }

  // ==================== TURN MANAGEMENT ====================

  endTurn(room) {
    if (room.turnTimer) clearTimeout(room.turnTimer)

    const prevPlayer = room.turn

    // Clear expired effects
    if (this.compelledPiece && this.compelledPiece.player === prevPlayer) this.compelledPiece = null
    if (room.trapFreezeThisTurn) {
      room.trapFreezeThisTurn = false
    } else if (this.frozenPiece && this.frozenPiece.player === prevPlayer) {
      this.frozenPiece = null
    }
    room.swiftActive = false
    room.swiftUsed = false

    // Mist mode: reset rat actions used
    if (room.mode === 'mist' && room.ratActionsUsed) {
      room.ratActionsUsed[prevPlayer] = 0
    }

    // Mist mode: clear monk attacked flag
    if (room.mode === 'mist') {
      room.monkAttackedThisTurn = null
    }

    // Check win condition
    const winResult = this.checkWinCondition(room)
    if (winResult) {
      this.endGame(room, winResult.winner, winResult.reason)
      return
    }

    // Switch turns
    room.turn = room.turn === room.player1 ? room.player2 : room.player1
    room.turnNumber++

    // Mist mode: apply poison damage at start of player's turn
    if (room.mode === 'mist' && room.poisoned) {
      const curPlayer = room.turn
      for (const [key, turns] of Object.entries(room.poisoned)) {
        if (turns > 0 && key.startsWith(curPlayer + ':')) {
          room.poisoned[key] = turns - 1
          // Apply 1 HP damage
          const [, posStr] = key.split(':')
          const [colStr, rowStr] = posStr.split(',')
          const col = parseInt(colStr)
          const row = parseInt(rowStr)
          if (!isNaN(col) && !isNaN(row)) {
            // Find piece at position
            const piece = room.pieces[curPlayer].find(p => p.col === col && p.row === row && p.alive)
            if (piece) {
              piece.hp = Math.max(1, piece.hp - 1)
              if (piece.hp <= 0) {
                this.removePiece(room, curPlayer, piece.type, col, row)
              }
            }
          }
        }
      }
      // Clean up expired poison
      for (const [key, turns] of Object.entries(room.poisoned)) {
        if (turns <= 0) delete room.poisoned[key]
      }
    }

    // Mist mode: decrement stun counters
    if (room.mode === 'mist' && room.stunned) {
      for (const [key, turns] of Object.entries(room.stunned)) {
        if (turns <= room.turnNumber) delete room.stunned[key]
      }
    }

    // Trigger event check
    const eventResult = this.triggerEvent(room)

    // Draw cards check
    const drawnCards = this.drawCardsForTurn(room)

    // Clear flood on event trigger
    if (eventResult && eventResult.type !== EVENTS.FLOOD) {
      room.activeEffects.flood = false
    }

    // Expire traps after 8 turns
    if (room.trapMarks) {
      room.trapMarks = room.trapMarks.filter(t => room.turnNumber - t.turnPlaced < 8)
    }

    // Expire phantoms
    if (room.phantoms) {
      for (const phantom of room.phantoms) {
        const previousPlayer = room.turn === room.player1 ? room.player2 : room.player1
        if (phantom.placedBy !== previousPlayer) {
          phantom.opponentTurnsLeft--
        }
      }
      room.phantoms = room.phantoms.filter(p => p.opponentTurnsLeft > 0)
    }

    // Expire blessing after 3 rounds
    for (const p of [room.player1, room.player2]) {
      for (const piece of room.pieces[p]) {
        if (piece.blessed && piece.blessedTurn > 0 && room.turnNumber - piece.blessedTurn >= 6) {
          piece.blessed = false
          piece.blessedTurn = 0
          const newMax = getMaxHp(piece.type, piece.cursedPower || 0, false)
          if (piece.hp > newMax) piece.hp = newMax
        }
      }
    }

    this.startTurnTimer(room)

    return { turn: room.turn, turnNumber: room.turnNumber, event: eventResult, drawnCards }
  }

  checkWinCondition(room) {
    const p1Pieces = room.pieces[room.player1].filter(p => p.alive)
    const p2Pieces = room.pieces[room.player2].filter(p => p.alive)

    // Check if king is dead
    if (!p1Pieces.some(p => p.type === 'king')) return { winner: room.player2, reason: 'king_killed' }
    if (!p2Pieces.some(p => p.type === 'king')) return { winner: room.player1, reason: 'king_killed' }

    // Check if a player has no legal moves (only king + bombs left, king trapped)
    for (const player of [room.player1, room.player2]) {
      const movable = room.pieces[player].filter(p => p.alive && p.type !== 'bomb' && p.type !== 'king')
      if (movable.length === 0) {
        // Only king and bombs left - check if king has legal moves
        const king = room.pieces[player].find(p => p.alive && p.type === 'king')
        if (king) {
          const kingMoves = this.getLegalMoves(room, player, king.col, king.row)
          if (kingMoves.length === 0) {
            const opponent = player === room.player1 ? room.player2 : room.player1
            return { winner: opponent, reason: 'no_moves' }
          }
        }
      }
    }

    return null
  }

  endGame(room, winner, reason) {
    if (room.turnTimer) clearTimeout(room.turnTimer)
    room.status = 'finished'
    room.lastLoser = winner === room.player1 ? room.player2 : room.player1

    // Refund stake to winner
    const users = readUsers()
    const wd = users.users[winner]
    if (wd) {
      wd.balance = (wd.balance || 0) + room.stake * 2
      wd.battleStats = wd.battleStats || { wins: 0, losses: 0, totalGoldEarned: 0 }
      wd.battleStats.wins++
      wd.battleStats.totalGoldEarned += room.stake * 2
    }
    const loser = winner === room.player1 ? room.player2 : room.player1
    const ld = users.users[loser]
    if (ld) {
      ld.battleStats = ld.battleStats || { wins: 0, losses: 0, totalGoldEarned: 0 }
      ld.battleStats.losses++
    }
    writeUsers(users)

    return { winner, reason, stats: room.stats }
  }

  // ==================== DISCONNECT/RECONNECT ====================

  handleDisconnect(room, player) {
    room.disconnected[player] = Date.now()
    room.disconnectTimers[player] = setTimeout(() => {
      if (room.disconnected[player]) {
        const opponent = player === room.player1 ? room.player2 : room.player1
        this.endGame(room, opponent, 'disconnect')
      }
    }, DISCONNECT_TIMEOUT * 1000)
  }

  handleReconnect(room, player) {
    if (room.disconnectTimers[player]) clearTimeout(room.disconnectTimers[player])
    room.disconnected[player] = null
    room.disconnectTimers[player] = null
  }

  // ==================== KING ABILITIES (MIST MODE) ====================

  useKingAbility(room, player, abilityType, targets) {
    if (room.mode !== 'mist') return { ok: false, error: '仅迷雾模式可用' }
    const kt = room.kingTypes[player]
    if (!kt) return { ok: false, error: '无王类型' }

    room.kingAbilitiesUsed = room.kingAbilitiesUsed || {}
    room.kingAbilitiesUsed[player] = room.kingAbilitiesUsed[player] || {}

    switch (abilityType) {
      case 'furious_rage': {
        // 暴怒之王: one-time, reveal self, all own pieces -1HP +1ATK
        if (room.kingAbilitiesUsed[player].furious) return { ok: false, error: '已使用过暴怒技能' }
        room.kingAbilitiesUsed[player].furious = true
        const king = room.pieces[player].find(p => p.alive && p.type === 'king')
        if (king) king.revealed = true
        for (const piece of room.pieces[player]) {
          if (piece.alive && piece.placed) {
            piece.hp = Math.max(1, piece.hp - 1)
            piece.cursedPower = (piece.cursedPower || 0) + 1
          }
        }
        return { ok: true, result: { log: '暴怒之王发动！己方全体-1HP+1ATK' } }
      }

      case 'clever_detonate': {
        // 机巧之王: detonate a bomb (kills all adjacent 8 cells)
        if (!targets || targets.targetCol === undefined) return { ok: false, error: '请选择要引爆的炸弹' }
        const { targetCol, targetRow } = targets
        const cell = room.board[targetCol]?.[targetRow]
        if (!cell || cell.owner !== player || cell.type !== 'bomb') return { ok: false, error: '只能引爆己方炸弹' }
        // Remove bomb and all adjacent pieces
        room.board[targetCol][targetRow] = null
        const bp = this.findPiece(room, player, 'bomb', targetCol, targetRow)
        if (bp) bp.alive = false
        const killed = []
        for (let dc = -1; dc <= 1; dc++) {
          for (let dr = -1; dr <= 1; dr++) {
            if (dc === 0 && dr === 0) continue
            const nc = targetCol + dc, nr = targetRow + dr
            if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue
            const adj = room.board[nc][nr]
            if (adj) {
              if (adj.type === 'king') {
                this.removePiece(room, adj.owner, adj.type, nc, nr)
                killed.push({ type: adj.type, owner: adj.owner, kingKilled: true })
              } else {
                this.removePiece(room, adj.owner, adj.type, nc, nr)
                killed.push({ type: adj.type, owner: adj.owner })
              }
              room.stats[player].kills++
            }
          }
        }
        return { ok: true, result: { log: `炸弹引爆！消灭了${killed.length}枚棋子`, killed, kingKilled: killed.some(k => k.kingKilled) } }
      }

      case 'valiant_buff': {
        // 英武之王: target an own piece for +2ATK
        if (!targets || targets.targetCol === undefined) return { ok: false, error: '请选择目标棋子' }
        const { targetCol, targetRow } = targets
        const tcell = room.board[targetCol]?.[targetRow]
        if (!tcell || tcell.owner !== player) return { ok: false, error: '只能选择己方棋子' }
        room.valiantBuffed = room.valiantBuffed || {}
        room.valiantBuffed[player] = { targetCol, targetRow }
        return { ok: true, result: { log: `英武之王赐福！${this.pieceName(tcell.type, room)}+2ATK` } }
      }

      case 'cunning_decoy': {
        // 狡诈之王: make an own piece appear as "king" when scouted
        if (!targets || targets.targetCol === undefined) return { ok: false, error: '请选择目标棋子' }
        const { targetCol, targetRow } = targets
        const tcell = room.board[targetCol]?.[targetRow]
        if (!tcell || tcell.owner !== player) return { ok: false, error: '只能选择己方棋子' }
        // Store decoy info on the piece
        const pp = this.findPieceAt(room, player, targetCol, targetRow)
        if (pp) pp.cunningDecoy = true
        return { ok: true, result: { log: `狡诈之王设下诱饵！该棋子被侦查时将显示为"王"`, col: targetCol, row: targetRow }, private: true }
      }

      default:
        return { ok: false, error: '未知的王技能' }
    }
  }

  // ==================== EXTRA MOVE HELPERS ====================

  canExtraMove(room, player) {
    // Swift card extra move
    if (room.swiftActive && !room.swiftUsed && room.turn === player) return 'swift'
    return null
  }

  canExtraMoveGale(room, player) {
    return room.galeActive && !room.galePlayersUsed.includes(player)
  }

  useExtraMove(room, player, type) {
    if (type === 'swift') {
      room.swiftUsed = true
    } else if (type === 'gale') {
      room.galePlayersUsed.push(player)
      if (room.galePlayersUsed.length >= 2) {
        room.galeActive = false
      }
    }
  }

    // ==================== STATE FOR PLAYER ====================

  getStateForPlayer(room, player) {
    if (!room) return null

    // Helper to compute effective atk and HP
    const pieceStats = (pieceObj, type) => {
      if (type === 'bomb') return { atk: '💥', hp: '💥' }
      if (type === 'assassin') return { atk: '★', hp: Math.max(0, pieceObj?.hp ?? 1) }
      let atk = PIECE_POWER[type] || 0
      atk += pieceObj?.cursedPower || 0
      if (pieceObj?.enraged) atk += 3
      if (pieceObj?.blessed) atk += 3
      const maxHp = getMaxHp(type, pieceObj?.cursedPower || 0, !!pieceObj?.blessed)
      return { atk: Math.max(0, atk), hp: Math.max(0, pieceObj?.hp ?? maxHp) }
    }

    const opponent = player === room.player1 ? room.player2 : room.player1
    const isP1 = player === room.player1

    // Build board from player's perspective (always show own deploy zone at bottom)
    // Server stores: row 0-1 = P2 zone, row 5-6 = P1 zone
    // If player is P1: display as-is (row 6 at bottom visually)
    // If player is P2: flip rows (row 0 at bottom visually)
    const board = Array.from({ length: COLS }, () => Array(ROWS).fill(null))
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const cell = room.board[c][r]
        if (!cell) continue
        const displayRow = isP1 ? r : (6 - r)
        const isOwn = cell.owner === player
        const pieceObj = this.findPiece(room, cell.owner, cell.type, c, r)
        const isRevealed = pieceObj ? pieceObj.revealed : false

        if (isOwn || isRevealed) {
          const stats = pieceStats(pieceObj, cell.type)
          const currHp = pieceObj?.hp ?? getBaseHp(cell.type)
          const mxHp = getMaxHp(cell.type, pieceObj?.cursedPower || 0, !!pieceObj?.blessed)
          board[c][displayRow] = {
            type: cell.type,
            owner: cell.owner,
            revealed: true,
            shielded: pieceObj?.shielded || false,
            enraged: pieceObj?.enraged || false,
            blessed: pieceObj?.blessed || false,
            cursedPower: pieceObj?.cursedPower || 0,
            atk: stats.atk,
            hp: Math.max(0, currHp),
            maxHp: mxHp,
          }
        } else {
          board[c][displayRow] = { type: 'unknown', owner: cell.owner, revealed: false }
        }
      }
    }

    // Treasures (only show triggered ones)
    const treasures = room.treasures
      .filter(t => t.triggered)
      .map(t => ({ col: t.col, row: isP1 ? t.row : (6 - t.row), type: t.type }))

    // Add phantoms to board for the opponent (shown as unrevealed enemy pieces)
    if (room.phantoms) {
      for (const phantom of room.phantoms) {
        const dpCol = phantom.col
        const dpRow = isP1 ? phantom.row : (6 - phantom.row)
        if (board[dpCol][dpRow]) continue // don't overwrite real pieces
        if (phantom.placedBy === player) {
          // Placer sees phantom as special marker
          board[dpCol][dpRow] = { type: 'phantom', owner: player, revealed: true, phantom: true }
        } else {
          // Opponent sees it as unrevealed enemy piece
          board[dpCol][dpRow] = { type: 'unknown', owner: phantom.placedBy, revealed: false }
        }
      }
    }

    // Cracks
    const cracks = (room.activeEffects.cracks || []).map(([c, r]) => ({ col: c, row: isP1 ? r : (6 - r) }))

    // Flood water rows (from player's perspective)
    const waterRows = room.activeEffects.flood ? (isP1 ? [2, 4] : [2, 4]) : []

    // Pieces info
    const myPieces = (room.pieces[player] || [])
      .filter(p => p.alive)
      .map(p => ({ type: p.type, col: p.col, row: isP1 ? p.row : (6 - p.row), revealed: p.revealed, shielded: p.shielded, enraged: p.enraged, blessed: p.blessed, hp: p.hp }))

    const opponentPieces = (room.pieces[opponent] || [])
      .filter(p => p.alive)
      .map(p => ({
        type: p.revealed ? p.type : 'unknown',
        col: p.col, row: isP1 ? p.row : (6 - p.row),
        revealed: p.revealed,
      }))

    // Legal moves for selected piece (if any)
    // This is computed client-side based on board state

    return {
      roomId: room.id,
      status: room.status,
      myUsername: player,
      player1: room.player1,
      opponentUsername: opponent || '',
      myTurn: room.turn === player,
      turnNumber: room.turnNumber,
      timer: room.status === 'playing' ? Math.max(0, TURN_TIME - Math.floor((Date.now() - room.turnStartAt) / 1000)) : 0,
      board,
      myPieces,
      opponentPieces,
      myHand: room.hands[player] || [],
      opponentHandCount: opponent ? (room.hands[opponent]?.length || 0) : 0,
      deployed: room.deployed[player] || false,
      opponentDeployed: opponent ? room.deployed[opponent] || false : false,
      deployPiecesLeft: (room.pieces[player] || [])
        .filter(p => !p.placed)
        .map(p => p.type),
      treasures,
      cracks,
      waterRows,
      activeEffects: {
        flood: room.activeEffects.flood || false,
        galeNextTurn: room.activeEffects.galeNextTurn || false,
        compelledPiece: this.compelledPiece?.player === player ? { col: this.compelledPiece.col, row: isP1 ? this.compelledPiece.row : (6 - this.compelledPiece.row) } : null,
        frozenPiece: this.frozenPiece?.player === player ? { col: this.frozenPiece.col, row: isP1 ? this.frozenPiece.row : (6 - this.frozenPiece.row) } : null,
      },
      swiftActive: room.swiftActive && room.turn === player,
      galeExtra: room.galeActive && !room.galePlayersUsed.includes(player),
      combatLog: room.combatLog.slice(-10),
      stats: room.stats,
      stake: room.stake,
      winner: room.status === 'finished' ? room.winner : null,
      gameOverReason: room.status === 'finished' ? room.gameOverReason : null,
      drawOfferedBy: room.drawOfferedBy,
      myTraps: (room.trapMarks || [])
        .filter(t => t.placedBy === player)
        .map(t => ({ col: t.col, row: isP1 ? t.row : (6 - t.row) })),
      myPhantoms: (room.phantoms || [])
        .filter(p => p.placedBy === player)
        .map(p => ({ col: p.col, row: isP1 ? p.row : (6 - p.row), turnsLeft: p.opponentTurnsLeft })),
      // Mist mode fields
      gameMode: room.mode || 'dark_chess',
      kingType: room.mode === 'mist' ? (room.kingTypes[player] || null) : null,
      mistState: room.mode === 'mist' ? {
        myVolumeUsed: (room.pieces[player] || []).filter(p => p.placed && p.type !== 'king').reduce((s, p) => s + (MIST_PIECE_DEF[p.type]?.volume || 0), 0),
        volumeCap: MIST_VOLUME_CAP + (room.kingTypes[player] === 'clever' ? 1 : 0),
        myKingType: room.kingTypes[player] || null,
        deployPieceDefs: Object.fromEntries(Object.entries(MIST_PIECE_DEF).map(([k, v]) => [k, { volume: v.volume, maxCount: v.maxCount, name: v.name, atk: v.atk, hp: v.hp, moveRange: v.moveRange, atkType: v.atkType, desc: '' }])),
        kingDefs: MIST_KING_DEF,
        stunnedPieces: room.stunned ? Object.keys(room.stunned).filter(k => k.startsWith(player + ':')).map(k => k.split(':')[1]) : [],
        poisonedPieces: room.poisoned ? Object.keys(room.poisoned).filter(k => k.startsWith(player + ':')).map(k => k.split(':')[1]) : [],
        sageTraps: (room.sageTraps || []).filter(t => t.placedBy === player).map(t => ({ col: t.col, row: isP1 ? t.row : (6 - t.row) })),
        ratPoisonTraps: (room.ratPoisonTraps || []).filter(t => t.placedBy === player).map(t => ({ col: t.col, row: isP1 ? t.row : (6 - t.row) })),
        ratActionsUsed: room.ratActionsUsed?.[player] || 0,
        furiousUsed: room.kingAbilitiesUsed?.[player]?.furious || false,
        valiantTarget: room.valiantBuffed?.[player] || null,
      } : null,
      // Opponent frozen/compelled info (always visible to opponent too)
      opponentFrozen: (room.mode === 'mist' && this.frozenPiece?.player === player) ? { col: this.frozenPiece.col, row: isP1 ? this.frozenPiece.row : (6 - this.frozenPiece.row) } : null,
      opponentCompelled: (room.mode === 'mist' && this.compelledPiece?.player === player) ? { col: this.compelledPiece.col, row: isP1 ? this.compelledPiece.row : (6 - this.compelledPiece.row) } : null,
    }
  }
}

const gameEngine = new GameEngine()

// ==================== WEBSOCKET SERVER ====================

const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

// Map username -> { ws, roomId }
const connections = new Map()

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost')
  const token = url.searchParams.get('token')
  const roomId = url.searchParams.get('roomId')
  console.log(`[ws] connection attempt: token=${token?.slice(0,10)}... roomId=${roomId}`)

  if (!token) { console.log('[ws] rejected: no token'); ws.close(4001, 'No token'); return }

  // Validate token
  const data = readUsers()
  const entry = Object.entries(data.users).find(([_, u]) => u.token === token)
  if (!entry) { console.log('[ws] rejected: invalid token'); ws.close(4002, 'Invalid token'); return }
  const username = entry[0]
  console.log(`[ws] connected: ${username}, roomId=${roomId}`)

  // Store connection
  connections.set(username, { ws, roomId: roomId || null })

  // ALWAYS register message/close handlers FIRST, before any code that might crash,
  // so the WS connection remains functional even if the welcome fails
  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw) } catch { return }
    handleMessage(username, msg, ws)
  })

  ws.on('close', () => {
    connections.delete(username)
    // Handle disconnect for active games
    if (roomId && gameEngine.rooms[roomId]) {
      const room = gameEngine.rooms[roomId]
      if (room.status === 'playing' || room.status === 'deploying') {
        gameEngine.handleDisconnect(room, username)
        const opponent = username === room.player1 ? room.player2 : room.player1
        sendToPlayer(opponent, { type: 'opponent_disconnect', timer: DISCONNECT_TIMEOUT })
      }
    }
  })

  // Handle reconnect (after handlers are registered, so crash won't break WS)
  if (roomId && gameEngine.rooms[roomId]) {
    const room = gameEngine.rooms[roomId]
    if (room.player1 === username || room.player2 === username) {
      gameEngine.handleReconnect(room, username)
      try {
        ws.send(JSON.stringify({ type: 'welcome', state: gameEngine.getStateForPlayer(room, username), yourSide: username }))
      } catch (e) {
        console.error('[ws] welcome failed:', e.message)
      }
      const opponent = username === room.player1 ? room.player2 : room.player1
      if (opponent) sendToPlayer(opponent, { type: 'opponent_reconnect' })
    }
  }
})

function sendToPlayer(player, msg) {
  const conn = connections.get(player)
  if (conn && conn.ws.readyState === 1) {
    conn.ws.send(JSON.stringify(msg))
  }
}

function broadcastToRoom(room, msg) {
  sendToPlayer(room.player1, msg)
  if (room.player2) sendToPlayer(room.player2, msg)
}

function sendStateToRoom(room) {
  try {
    if (room.player1) sendToPlayer(room.player1, { type: 'state_update', state: gameEngine.getStateForPlayer(room, room.player1) })
    if (room.player2) sendToPlayer(room.player2, { type: 'state_update', state: gameEngine.getStateForPlayer(room, room.player2) })
  } catch (e) { console.error('[sendStateToRoom] error:', e.message) }
}

function handleMessage(username, msg, ws) {
  console.log(`[msg] ${username}: ${msg.type}`)
  switch (msg.type) {
    case 'join_room': {
      const { roomId } = msg
      const room = gameEngine.joinRoom(roomId, username)
      if (!room) { ws.send(JSON.stringify({ type: 'error', message: '无法加入房间' })); return }
      // Notify both players
      broadcastToRoom(room, { type: 'room_joined', roomId: room.id, opponent: username })
      sendStateToRoom(room)
      break
    }

    case 'deploy': {
      const roomId = connections.get(username)?.roomId
      const room = gameEngine.rooms[roomId]
      console.log(`[deploy_handler] ${username} roomId=${roomId} room_exists=${!!room}`)
      if (!room) { ws.send(JSON.stringify({ type: 'error', message: '房间不存在' })); return }
      console.log(`[deploy_handler] ${username} places ${msg.pieceType} at (${msg.col},${msg.row}) in room ${room.id}`)
      const result = gameEngine.deployPiece(room, username, msg.pieceType, msg.col, msg.row)
      if (!result.ok) { console.log(`[deploy] failed: ${result.error}`); ws.send(JSON.stringify({ type: 'error', message: result.error })); return }
      sendStateToRoom(room)
      break
    }

    case 'undeploy': {
      const roomUndeploy = connections.get(username)?.roomId
      const roomUd = gameEngine.rooms[roomUndeploy]
      if (!roomUd) { ws.send(JSON.stringify({ type: 'error', message: '房间不存在' })); return }
      const resultUd = gameEngine.undeployPiece(roomUd, username, msg.col, msg.row)
      if (!resultUd.ok) { ws.send(JSON.stringify({ type: 'error', message: resultUd.error })); return }
      sendStateToRoom(roomUd)
      break
    }

    case 'random_deploy': {
      const roomId = connections.get(username)?.roomId
      const room = gameEngine.rooms[roomId]
      if (!room) { ws.send(JSON.stringify({ type: 'error', message: '房间不存在' })); return }
      const result = gameEngine.randomDeploy(room, username)
      if (!result.ok) { ws.send(JSON.stringify({ type: 'error', message: result.error })); return }
      sendStateToRoom(room)
      break
    }

    case 'confirm_deploy': {
      const roomId = connections.get(username)?.roomId
      const room = gameEngine.rooms[roomId]
      if (!room) { ws.send(JSON.stringify({ type: 'error', message: '房间不存在' })); return }
      const result = gameEngine.confirmDeploy(room, username)
      if (!result.ok) { ws.send(JSON.stringify({ type: 'error', message: result.error })); return }
      if (result.gameStarted) {
        broadcastToRoom(room, { type: 'game_start' })
      }
      sendStateToRoom(room)
      break
    }

    case 'play_card': {
      const roomId = connections.get(username)?.roomId
      const room = gameEngine.rooms[roomId]
      if (!room) { ws.send(JSON.stringify({ type: 'error', message: '房间不存在' })); return }
      const result = gameEngine.playCard(room, username, msg.cardType, msg.targets || {})
      if (!result.ok) { ws.send(JSON.stringify({ type: 'error', message: result.error })); return }
      // Notify opponent about card played (except private results)
      if (!result.private) {
        const opponent = username === room.player1 ? room.player2 : room.player1
        sendToPlayer(opponent, { type: 'card_played', player: username, cardType: msg.cardType })
      }
      // Send private result to player
      ws.send(JSON.stringify({ type: 'card_result', cardType: msg.cardType, result: result.result }))
      sendStateToRoom(room)
      break
    }

    case 'discard_card': {
      const roomId = connections.get(username)?.roomId
      const room = gameEngine.rooms[roomId]
      if (!room) return
      gameEngine.discardCard(room, username, msg.cardIndex)
      sendStateToRoom(room)
      break
    }

    case 'scout_action': {
      const roomId = connections.get(username)?.roomId
      const room = gameEngine.rooms[roomId]
      if (!room || room.status !== 'playing' || room.turn !== username) {
        ws.send(JSON.stringify({ type: 'error', message: '不是你的回合' }))
        return
      }
      const scoutResult = gameEngine.executeScout(room, username, msg.col, msg.row)
      if (!scoutResult.ok) { ws.send(JSON.stringify({ type: 'error', message: scoutResult.error })); return }

      // Convert scout result coords to display coords
      const isP1 = username === room.player1
      const displayRevealed = scoutResult.revealed.map(r => ({
        col: r.col,
        row: isP1 ? r.row : (6 - r.row),
        type: r.type
      }))
      // Send private result to scout player only
      ws.send(JSON.stringify({ type: 'scout_result', revealed: displayRevealed }))
      sendStateToRoom(room)

      // End turn (or handle extra move)
      const extraType = gameEngine.canExtraMove(room, username)
      if (extraType) {
        gameEngine.useExtraMove(room, username, extraType)
        sendStateToRoom(room)
      } else if (gameEngine.canExtraMoveGale(room, username)) {
        gameEngine.useExtraMove(room, username, 'gale')
        sendStateToRoom(room)
      } else {
        const turnResult = gameEngine.endTurn(room)
        if (turnResult) {
          broadcastToRoom(room, { type: 'turn_change', turn: turnResult.turn, turnNumber: turnResult.turnNumber })
          if (turnResult.event) broadcastToRoom(room, { type: 'event_triggered', event: turnResult.event })
          if (turnResult.drawnCards) {
            for (const [player, card] of Object.entries(turnResult.drawnCards)) {
              sendToPlayer(player, { type: 'card_drawn', card })
            }
          }
        }
        sendStateToRoom(room)
      }
      break
    }

    case 'piece_selected': {
      const roomId = connections.get(username)?.roomId
      const room = gameEngine.rooms[roomId]
      if (!room || room.status !== 'playing') return
      const opp = username === room.player1 ? room.player2 : room.player1
      // Flip row: sender's display → internal → receiver's display
      sendToPlayer(opp, { type: 'opponent_selected', col: msg.col, row: ROWS - 1 - msg.row })
      break
    }

    case 'move_piece': {
      const roomId = connections.get(username)?.roomId
      const room = gameEngine.rooms[roomId]
      if (!room || room.status !== 'playing' || room.turn !== username) {
        ws.send(JSON.stringify({ type: 'error', message: '不是你的回合' }))
        return
      }

      // Convert display coords to internal (client sends display coords)
      const isP1 = username === room.player1
      const mfRow = isP1 ? msg.fromRow : (ROWS - 1 - msg.fromRow)
      const mtRow = isP1 ? msg.toRow : (ROWS - 1 - msg.toRow)

      // Broadcast opponent's move animation (flip display coords for opponent)
      const moveOpponent = username === room.player1 ? room.player2 : room.player1
      sendToPlayer(moveOpponent, { type: 'opponent_moved', fromCol: msg.fromCol, fromRow: ROWS - 1 - msg.fromRow, toCol: msg.toCol, toRow: ROWS - 1 - msg.toRow })
      // Check if compelled (internal coords)
      if (gameEngine.compelledPiece && gameEngine.compelledPiece.player === username) {
        if (msg.fromCol !== gameEngine.compelledPiece.col || mfRow !== gameEngine.compelledPiece.row) {
          ws.send(JSON.stringify({ type: 'error', message: '你被强制移动指定棋子' }))
          return
        }
      }
      // Check if frozen (internal coords)
      if (gameEngine.frozenPiece && gameEngine.frozenPiece.player === username) {
        if (msg.fromCol === gameEngine.frozenPiece.col && mfRow === gameEngine.frozenPiece.row) {
          ws.send(JSON.stringify({ type: 'error', message: '该棋子被冰冻' }))
          return
        }
      }

      const moveFlags = {}
      if (msg.isRogueJump) moveFlags.isRogueJump = true
      if (msg.isMonkStun) moveFlags.isMonkStun = true
      if (msg.isHorseAttack) moveFlags.isHorseAttack = true
      const result = gameEngine.executeMove(room, username, msg.fromCol, mfRow, msg.toCol, mtRow, moveFlags)
      if (!result.ok) { ws.send(JSON.stringify({ type: 'error', message: result.error })); return }

      // Suppress combat_result for phantom/trap/treasure (silent effects)
      const silentCombat = result.combat?.result === 'phantom' || result.combat?.trapTriggered

      if (result.combat) {
        if (result.combat.treasureType) {
          broadcastToRoom(room, { type: 'treasure_triggered', treasure: { type: result.combat.treasureType } })
        } else if (result.combat.trapTriggered) {
          broadcastToRoom(room, { type: 'trap_triggered', frozenPlayer: room.turn })
        } else if (!silentCombat) {
          broadcastToRoom(room, { type: 'combat_result', combat: result.combat })
        }
      }

      // Check win
      const winCheck = gameEngine.checkWinCondition(room)
      if (winCheck) {
        gameEngine.endGame(room, winCheck.winner, winCheck.reason)
        broadcastToRoom(room, { type: 'game_over', winner: winCheck.winner, reason: winCheck.reason, stats: room.stats })
        sendStateToRoom(room)
        return
      }

      // End turn (or handle extra move)
      const extraType = gameEngine.canExtraMove(room, username)
      if (extraType) {
        gameEngine.useExtraMove(room, username, extraType)
        sendStateToRoom(room)
      } else if (gameEngine.canExtraMoveGale(room, username)) {
        gameEngine.useExtraMove(room, username, 'gale')
        sendStateToRoom(room)
      } else {
        const turnResult = gameEngine.endTurn(room)
        if (turnResult) {
          broadcastToRoom(room, { type: 'turn_change', turn: turnResult.turn, turnNumber: turnResult.turnNumber })
          if (turnResult.event) {
            broadcastToRoom(room, { type: 'event_triggered', event: turnResult.event })
          }
          if (turnResult.drawnCards) {
            for (const [player, card] of Object.entries(turnResult.drawnCards)) {
              sendToPlayer(player, { type: 'card_drawn', card })
            }
          }
        }
        sendStateToRoom(room)
      }
      break
    }

    case 'remote_attack': {
      const roomId = connections.get(username)?.roomId
      const room = gameEngine.rooms[roomId]
      if (!room || room.status !== 'playing' || room.turn !== username) {
        ws.send(JSON.stringify({ type: 'error', message: '不是你的回合' }))
        return
      }
      // Convert display coords to internal
      const isP1 = username === room.player1
      const mfRow = isP1 ? msg.fromRow : (ROWS - 1 - msg.fromRow)
      const mtRow = isP1 ? msg.toRow : (ROWS - 1 - msg.toRow)
      // Broadcast opponent's move animation (flip for opponent)
      const remoteOpponent = username === room.player1 ? room.player2 : room.player1
      sendToPlayer(remoteOpponent, { type: 'opponent_moved', fromCol: msg.fromCol, fromRow: ROWS - 1 - msg.fromRow, toCol: msg.toCol, toRow: ROWS - 1 - msg.toRow })
      const raFlags = {}
      if (msg.isMonkStun) raFlags.isMonkStun = true
      const result = gameEngine.executeRemoteAttack(room, username, msg.fromCol, mfRow, msg.toCol, mtRow, raFlags)
      if (!result.ok) { ws.send(JSON.stringify({ type: 'error', message: result.error })); return }

      if (result.combat) {
        if (result.combat.treasureType) {
          broadcastToRoom(room, { type: 'treasure_triggered', treasure: { type: result.combat.treasureType } })
        } else if (result.combat.result !== 'phantom' && !result.combat.trapTriggered) {
          broadcastToRoom(room, { type: 'combat_result', combat: result.combat })
        }
      }

      const winCheck = gameEngine.checkWinCondition(room)
      if (winCheck) {
        gameEngine.endGame(room, winCheck.winner, winCheck.reason)
        broadcastToRoom(room, { type: 'game_over', winner: winCheck.winner, reason: winCheck.reason, stats: room.stats })
        sendStateToRoom(room)
        return
      }

      const extraType = gameEngine.canExtraMove(room, username)
      if (extraType) {
        gameEngine.useExtraMove(room, username, extraType)
        sendStateToRoom(room)
      } else if (gameEngine.canExtraMoveGale(room, username)) {
        gameEngine.useExtraMove(room, username, 'gale')
        sendStateToRoom(room)
      } else {
        const turnResult = gameEngine.endTurn(room)
        if (turnResult) {
          broadcastToRoom(room, { type: 'turn_change', turn: turnResult.turn, turnNumber: turnResult.turnNumber })
          if (turnResult.event) broadcastToRoom(room, { type: 'event_triggered', event: turnResult.event })
          if (turnResult.drawnCards) {
            for (const [player, card] of Object.entries(turnResult.drawnCards)) {
              sendToPlayer(player, { type: 'card_drawn', card })
            }
          }
        }
        sendStateToRoom(room)
      }
      break
    }

    case 'forfeit': {
      const roomId = connections.get(username)?.roomId
      const room = gameEngine.rooms[roomId]
      if (!room) return
      const winner = username === room.player1 ? room.player2 : room.player1
      gameEngine.endGame(room, winner, 'forfeit')
      broadcastToRoom(room, { type: 'game_over', winner, reason: 'forfeit', stats: room.stats })
      sendStateToRoom(room)
      break
    }

    case 'draw_offer': {
      const roomId = connections.get(username)?.roomId
      const room = gameEngine.rooms[roomId]
      if (!room || room.status !== 'playing') return
      room.drawOfferedBy = username
      const opponent = username === room.player1 ? room.player2 : room.player1
      sendToPlayer(opponent, { type: 'draw_offer', from: username })
      break
    }

    case 'draw_accept': {
      const roomId = connections.get(username)?.roomId
      const room = gameEngine.rooms[roomId]
      if (!room || room.status !== 'playing' || !room.drawOfferedBy) return
      gameEngine.endGame(room, null, 'draw')
      broadcastToRoom(room, { type: 'game_over', winner: null, reason: 'draw', stats: room.stats })
      sendStateToRoom(room)
      break
    }

    case 'draw_reject': {
      const roomId = connections.get(username)?.roomId
      const room = gameEngine.rooms[roomId]
      if (!room) return
      room.drawOfferedBy = null
      const opponent = username === room.player1 ? room.player2 : room.player1
      sendToPlayer(opponent, { type: 'draw_rejected' })
      break
    }

    case 'end_turn': {
      const roomId = connections.get(username)?.roomId
      const room = gameEngine.rooms[roomId]
      if (!room || room.status !== 'playing' || room.turn !== username) {
        ws.send(JSON.stringify({ type: 'error', message: '不是你的回合' }))
        return
      }
      console.log(`[end_turn] ${username} ends turn early`)
      const turnResult = gameEngine.endTurn(room)
      if (turnResult) {
        broadcastToRoom(room, { type: 'turn_change', turn: turnResult.turn, turnNumber: turnResult.turnNumber })
        if (turnResult.event) broadcastToRoom(room, { type: 'event_triggered', event: turnResult.event })
        if (turnResult.drawnCards) {
          for (const [player, card] of Object.entries(turnResult.drawnCards)) {
            sendToPlayer(player, { type: 'card_drawn', card })
          }
        }
      }
      sendStateToRoom(room)
      break
    }

    case 'king_ability': {
      const roomId = connections.get(username)?.roomId
      const room = gameEngine.rooms[roomId]
      if (!room || room.status !== 'playing' || room.turn !== username || room.mode !== 'mist') {
        ws.send(JSON.stringify({ type: 'error', message: '无法使用王技能' }))
        return
      }
      const result = gameEngine.useKingAbility(room, username, msg.abilityType, msg.targets || {})
      if (!result.ok) { ws.send(JSON.stringify({ type: 'error', message: result.error })); return }
      if (result.private) {
        ws.send(JSON.stringify({ type: 'king_ability_result', result: result.result }))
      }
      sendStateToRoom(room)
      break
    }

    case 'emoji': {
      const roomId = connections.get(username)?.roomId
      const room = gameEngine.rooms[roomId]
      if (!room || room.status !== 'playing') return
      const opponent = username === room.player1 ? room.player2 : room.player1
      sendToPlayer(opponent, { type: 'emoji', from: username, emoji: msg.emoji })
      break
    }

    case 'ping': {
      ws.send(JSON.stringify({ type: 'pong' }))
      break
    }
  }
}

// ==================== ADMIN PAGE ====================

app.get('/admin/scratch', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="cache-control" content="no-cache, no-store, must-revalidate">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>刮刮乐 - 管理</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; display: flex; flex-direction: column; align-items: center; min-height: 100vh; padding: 20px; gap: 20px; }
  .card { background: white; border-radius: 20px; padding: 32px; width: 100%; max-width: 440px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  h1 { font-size: 24px; color: #c0392b; margin-bottom: 20px; text-align: center; }
  h2 { font-size: 18px; color: #555; margin-bottom: 16px; text-align: center; }
  .field { margin-bottom: 16px; }
  .field label { display: block; font-size: 14px; color: #666; margin-bottom: 6px; }
  .field input, .field select { width: 100%; padding: 12px 16px; border: 2px solid #e0e0e0; border-radius: 12px; font-size: 18px; font-weight: 600; font-family: inherit; transition: border-color 0.2s; }
  .field input:focus, .field select:focus { outline: none; border-color: #ff6b6b; }
  .btn { width: 100%; padding: 14px; border: none; border-radius: 14px; font-size: 16px; font-weight: 700; cursor: pointer; margin-bottom: 10px; background: linear-gradient(135deg, #ff6b6b, #ee5a24); color: white; transition: opacity 0.2s; font-family: inherit; }
  .btn:hover { opacity: 0.9; }
  .btn-secondary { background: linear-gradient(135deg, #ffeaa7, #fdcb6e); color: #6b4c00; }
  .btn-danger { background: linear-gradient(135deg, #e74c3c, #c0392b); }
  .btn-small { padding: 8px 16px; font-size: 13px; border: none; border-radius: 8px; cursor: pointer; font-family: inherit; font-weight: 600; background: #eee; color: #555; transition: background 0.2s; }
  .btn-small:hover { background: #ddd; }
  .status { font-size: 13px; color: #27ae60; text-align: center; margin-top: 8px; }
  .error { color: #c0392b; }
  .user-list { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; justify-content: center; }
  .user-chip { padding: 8px 18px; border-radius: 100px; border: 2px solid #e0e0e0; cursor: pointer; font-size: 14px; font-weight: 600; font-family: inherit; background: white; color: #555; transition: all 0.2s; }
  .user-chip:hover { border-color: #ff6b6b; color: #c0392b; }
  .user-chip.active { border-color: #ff6b6b; background: #fff5f5; color: #c0392b; }
  .create-row { display: flex; gap: 8px; margin-bottom: 16px; }
  .create-row input { flex: 1; padding: 10px 14px; border: 2px solid #e0e0e0; border-radius: 10px; font-size: 14px; font-family: inherit; }
  .create-row input:focus { outline: none; border-color: #ff6b6b; }
  .create-row .btn-small { flex-shrink: 0; }
  .section-divider { border: none; border-top: 1px solid #eee; margin: 24px 0; }
  .loading { text-align: center; color: #999; padding: 20px; }
  .empty { text-align: center; color: #ccc; padding: 20px; font-size: 14px; }
</style>
</head>
<body>
<div class="card">
  <h1>🎫 刮刮乐管理</h1>
  <div style="text-align:right;margin-bottom:12px;"><a onclick="loadUsers()" style="color:#999;font-size:13px;cursor:pointer;">🔄 刷新</a></div>
  <h2>创建用户</h2>
  <div class="create-row">
    <input type="text" id="newName" placeholder="用户名" maxlength="20">
    <input type="password" id="newPwd" placeholder="密码">
    <button class="btn-small" onclick="createUser()">创建</button>
  </div>
  <div id="createStatus" class="status" style="margin-bottom:16px;"></div>
  <h2>选择用户</h2>
  <div id="userList" class="user-list"><div class="loading">加载中...</div></div>
</div>
<div class="card" id="editCard" style="display:none;">
  <h2 id="editTitle">编辑用户</h2>
  <div class="field"><label>余额 (¥)</label><input type="number" id="balance" min="0" step="1"></div>
  <div class="field"><label>刮刮乐张数</label><input type="number" id="scratchCards" min="0" step="1"></div>
  <div class="field"><label>上次签到日期</label><input type="text" id="lastSignInDate" placeholder="例如: Mon May 27 2026"></div>
  <button class="btn" onclick="saveUser()">💾 保存</button>
  <button class="btn btn-secondary" onclick="resetSignIn()">🔄 重置签到</button>
  <div id="editStatus" class="status"></div>
</div>
<script>
var currentUser = null
async function loadUsers() {
  document.getElementById('userList').innerHTML = '<div class="loading">加载中...</div>'
  try {
    var r = await fetch('/api/admin/users')
    var data = await r.json()
    var html = ''
    data.users.forEach(function(u) {
      html += '<button class="user-chip ' + (currentUser === u.name ? 'active' : '') + '" data-name="' + u.name.replace(/"/g, '&quot;') + '">' + u.name + '</button>'
    })
    if (!html) html = '<div class="empty">暂无用户</div>'
    document.getElementById('userList').innerHTML = html
  } catch (e) {
    document.getElementById('userList').innerHTML = '<div class="error" style="text-align:center;padding:12px;">❌ ' + e.message + '</div>'
  }
}
document.addEventListener('click', function(e) { var chip = e.target.closest('.user-chip'); if (chip) selectUser(chip.dataset.name) })
async function selectUser(name) {
  currentUser = name
  var r = await fetch('/api/admin/user/' + name)
  var data = await r.json()
  if (!data.ok) return
  document.getElementById('editTitle').textContent = '👤 ' + name
  document.getElementById('balance').value = data.balance
  document.getElementById('scratchCards').value = data.scratchCards
  document.getElementById('lastSignInDate').value = data.lastSignInDate || ''
  document.getElementById('editCard').style.display = ''
  document.getElementById('editStatus').textContent = ''
  loadUsers()
}
async function saveUser() {
  if (!currentUser) return
  var r = await fetch('/api/admin/user/' + currentUser, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ balance: parseInt(document.getElementById('balance').value) || 0, scratchCards: parseInt(document.getElementById('scratchCards').value) || 0, lastSignInDate: document.getElementById('lastSignInDate').value || null }) })
  var result = await r.json()
  var el = document.getElementById('editStatus')
  if (result.ok) { el.textContent = '✅ 保存成功'; el.className = 'status' } else { el.textContent = '❌ ' + (result.error || '失败'); el.className = 'status error' }
}
async function resetSignIn() {
  if (!currentUser) return
  var r = await fetch('/api/admin/user/' + currentUser, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lastSignInDate: null }) })
  var result = await r.json()
  var el = document.getElementById('editStatus')
  if (result.ok) { document.getElementById('lastSignInDate').value = ''; el.textContent = '✅ 签到已重置'; el.className = 'status' } else { el.textContent = '❌ ' + (result.error || '失败'); el.className = 'status error' }
}
async function createUser() {
  var name = document.getElementById('newName').value.trim()
  var pwd = document.getElementById('newPwd').value
  if (!name || !pwd) { document.getElementById('createStatus').textContent = '❌ 请填写用户名和密码'; document.getElementById('createStatus').className = 'status error'; return }
  var r = await fetch('/api/admin/user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name, password: pwd }) })
  var result = await r.json()
  var el = document.getElementById('createStatus')
  if (result.ok) { el.textContent = '✅ 用户 ' + name + ' 已创建'; el.className = 'status'; document.getElementById('newName').value = ''; document.getElementById('newPwd').value = ''; loadUsers() } else { el.textContent = '❌ ' + (result.error || '失败'); el.className = 'status error' }
}
loadUsers()
</script>
</body>
</html>`)
})

// ==================== STARTUP ====================

// Migrate old data
function migrateOldData() {
  const dataPath = path.join(__dirname, 'data.json')
  if (fs.existsSync(dataPath) && !fs.existsSync(USERS_FILE)) {
    try {
      const old = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
      writeUsers({ users: { admin: { password: hashPassword('admin'), token: null, balance: old.balance || 0, scratchCards: old.scratchCards || 0, lastSignInDate: old.lastSignInDate || null, nextGuaranteedPrize: old.nextGuaranteedPrize || null, guaranteedPrizes: old.guaranteedPrizes || {}, inventory: { freezeShield: 0, reflectArmor: 0, doubleBet: 0 }, battleStats: { wins: 0, losses: 0, totalGoldEarned: 0 } } } })
      fs.renameSync(dataPath, dataPath + '.bak')
    } catch {}
  }
}
migrateOldData()

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err.message, err.stack)
})
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason)
})

server.listen(PORT, () => {
  console.log(`Dark Chess server running on http://0.0.0.0:${PORT}`)
})
