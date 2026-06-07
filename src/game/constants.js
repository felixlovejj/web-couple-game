// Board dimensions
export const COLS = 5 // A-E (indices 0-4)
export const ROWS = 7 // 1-7 (indices 0-6)
export const COL_LABELS = ['A', 'B', 'C', 'D', 'E']

// ==================== GAME MODES ====================

export const GAME_MODES = {
  DARK_CHESS: 'dark_chess',
  MIST: 'mist',
}

export const MODE_INFO = {
  [GAME_MODES.DARK_CHESS]: { name: '暗棋迷阵', emoji: '⚔️', desc: '经典模式：7枚棋子，暗棋博弈' },
  [GAME_MODES.MIST]: { name: '迷雾模式', emoji: '🌫️', desc: '体积限制、多样棋子、马斜攻、多种王' },
}

// ==================== DARK CHESS MODE (CLASSIC) ====================

// Piece types (dark chess)
export const PIECE_TYPES = {
  KING: 'king',
  GENERAL: 'general',
  ASSASSIN: 'assassin',
  ARCHER: 'archer',
  BOMB: 'bomb',
  PAWN: 'pawn',
}

export const PIECE_INFO = {
  [PIECE_TYPES.KING]: { name: '王', emoji: '👑', power: 0, moveRange: 1, desc: '被击杀=输。不能主动攻击敌方。' },
  [PIECE_TYPES.GENERAL]: { name: '将', emoji: '⚔️', power: 5, moveRange: 1, desc: '最高战斗力。' },
  [PIECE_TYPES.ASSASSIN]: { name: '刺客', emoji: '🗡️', power: 'special', moveRange: 1, desc: '主动攻击=必杀（炸弹除外）。被攻击=1。' },
  [PIECE_TYPES.ARCHER]: { name: '弓', emoji: '🏹', power: 3, moveRange: 1, desc: '可远程攻击1-2格直线距离。' },
  [PIECE_TYPES.BOMB]: { name: '炸弹', emoji: '💣', power: 'N/A', moveRange: 0, desc: '不可移动。被攻击=同归于尽。' },
  [PIECE_TYPES.PAWN]: { name: '兵', emoji: '🐴', power: 2, moveRange: 2, desc: '可移动1-2格直线，不能越过棋子。' },
}

// Each player gets: 1 King, 1 General, 1 Assassin, 1 Archer, 1 Bomb, 2 Pawns
export const PIECE_DISTRIBUTION = [
  PIECE_TYPES.KING,
  PIECE_TYPES.GENERAL,
  PIECE_TYPES.ASSASSIN,
  PIECE_TYPES.ARCHER,
  PIECE_TYPES.BOMB,
  PIECE_TYPES.PAWN,
  PIECE_TYPES.PAWN,
]

// ==================== MIST MODE ====================

// Mist mode total volume cap per player (excluding king)
export const MIST_VOLUME_CAP = 10

// Mist mode piece types
export const MIST_PIECE_TYPES = {
  KING: 'king',
  HORSE: 'horse',         // 马 (renamed from pawn), diagonal attack
  GENERAL: 'general',
  ASSASSIN: 'assassin',
  ARCHER: 'archer',
  BOMB: 'bomb',
  MONK: 'monk',           // 行者: stuns both self and target for 1 turn
  ROGUE: 'rogue',         // 侠客: can jump over 1 piece, -1HP when doing so
  RAT: 'rat',             // 老鼠: 2 actions/turn, poison traps
  BERSERKER: 'berserker', // 狂战: ATK = 1 + lost HP
  SAGE: 'sage',           // 国师: 3 empty-cell traps, -1ATK + reveal on step
  IRONGUARD: 'ironguard', // 铁卫: all damage received -1 (min 1)
}

// Mist mode piece definitions: { name, emoji, volume, maxCount, hp, atk, moveRange, desc }
export const MIST_PIECE_INFO = {
  [MIST_PIECE_TYPES.HORSE]:      { name:'马',   emoji:'🐴', volume:1, maxCount:3, hp:2, atk:2, moveRange:2, desc:'可移动1-2格。只能攻击面朝敌方的斜对角两格(↗↖)，不能正面攻击', atkType:'diagonal' },
  [MIST_PIECE_TYPES.GENERAL]:    { name:'将',   emoji:'⚔️', volume:3, maxCount:1, hp:5, atk:5, moveRange:1, desc:'可靠的正面主力，无特殊技能' },
  [MIST_PIECE_TYPES.ASSASSIN]:   { name:'刺客', emoji:'🗡️', volume:2, maxCount:1, hp:1, atk:'★', moveRange:1, desc:'主动攻击=必杀(炸弹除外)，被攻击时战力=1' },
  [MIST_PIECE_TYPES.ARCHER]:     { name:'弓',   emoji:'🏹', volume:2, maxCount:1, hp:2, atk:3, moveRange:1, desc:'远程攻击直线2格。不可近战攻击相邻格' },
  [MIST_PIECE_TYPES.BOMB]:       { name:'炸弹', emoji:'💣', volume:1, maxCount:1, hp:1, atk:'💥', moveRange:0, desc:'不可移动，被攻击=同归于尽' },
  [MIST_PIECE_TYPES.MONK]:       { name:'行者', emoji:'🧘', volume:1, maxCount:1, hp:1, atk:0, moveRange:1, desc:'攻击距离2格，不造成伤害。双方下回合无法行动' },
  [MIST_PIECE_TYPES.ROGUE]:      { name:'侠客', emoji:'🥷', volume:2, maxCount:1, hp:4, atk:4, moveRange:1, desc:'移动时可越过一枚棋子(友或敌)，越过时自身-1HP' },
  [MIST_PIECE_TYPES.RAT]:        { name:'老鼠', emoji:'🐀', volume:2, maxCount:1, hp:1, atk:1, moveRange:1, desc:'每回合可行动两次。可在空格放中毒陷阱(经过者中毒3回合-1HP/回)' },
  [MIST_PIECE_TYPES.BERSERKER]:  { name:'狂战', emoji:'💢', volume:3, maxCount:1, hp:7, atk:1, moveRange:1, desc:'被动：ATK = 1 + 已损失HP。满血弱残血强' },
  [MIST_PIECE_TYPES.SAGE]:       { name:'国师', emoji:'🧙', volume:1, maxCount:1, hp:1, atk:1, moveRange:1, desc:'可在3空格布置陷阱，敌方经过-1攻+暴露位置' },
  [MIST_PIECE_TYPES.IRONGUARD]:  { name:'铁卫', emoji:'🛡️', volume:2, maxCount:1, hp:5, atk:2, moveRange:1, desc:'被动：受到的所有伤害-1(最低1)' },
}

// Mist mode king types (choose 1)
export const MIST_KING_TYPES = {
  DILIGENT: 'diligent',     // 勤勉之王
  CUNNING: 'cunning',       // 狡诈之王
  FURIOUS: 'furious',       // 暴怒之王
  CLEVER: 'clever',         // 机巧之王
  VALIANT: 'valiant',       // 英武之王
  BRUTAL: 'brutal',         // 狂蛮之王
  COWARD: 'coward',         // 胆小之王
  WISE: 'wise',             // 睿智之王
}

export const MIST_KING_INFO = {
  [MIST_KING_TYPES.DILIGENT]: { name:'勤勉之王', emoji:'👑', hp:3, atk:0, volume:0, desc:'抽牌间隔缩短为每3回合(原4回合)' },
  [MIST_KING_TYPES.CUNNING]:  { name:'狡诈之王', emoji:'👑', hp:3, atk:0, volume:0, desc:'选定一名己方棋子，被侦查时显示为"王"' },
  [MIST_KING_TYPES.FURIOUS]:  { name:'暴怒之王', emoji:'👑', hp:3, atk:0, volume:0, desc:'限一次主动技：自身暴露，己方全体-1HP+1ATK' },
  [MIST_KING_TYPES.CLEVER]:   { name:'机巧之王', emoji:'👑', hp:3, atk:0, volume:0, desc:'可多带一枚炸弹(总容积+1)。炸弹可移动1格+主动引爆(炸相邻8格)' },
  [MIST_KING_TYPES.VALIANT]:  { name:'英武之王', emoji:'👑', hp:3, atk:4, volume:0, desc:'可指定一名己方棋子+2ATK' },
  [MIST_KING_TYPES.BRUTAL]:   { name:'狂蛮之王', emoji:'👑', hp:5, atk:5, volume:0, desc:'抽牌间隔延长为每5回合。可主动攻击' },
  [MIST_KING_TYPES.COWARD]:   { name:'胆小之王', emoji:'👑', hp:2, atk:0, volume:0, desc:'被敌方侦查时显示为"老鼠"' },
  [MIST_KING_TYPES.WISE]:     { name:'睿智之王', emoji:'👑', hp:3, atk:0, volume:0, desc:'免疫一切技能牌和陷阱(冰冻/定向/偷取/中毒/眩晕)' },
}

// Mist mode king token (sent to client as piece type)
export const MIST_KING_TOKEN = 'king'

// Helper: get mist piece info by type
export function getMistPieceInfo(type) {
  if (type === 'king') return null // king handled separately
  return MIST_PIECE_INFO[type] || null
}

// Card types
export const CARD_TYPES = {
  SCOUT: 'scout',
  SHIELD: 'shield',
  SWIFT: 'swift',
  SWAP: 'swap',
  DISGUISE: 'disguise',
  RAGE: 'rage',
  FREEZE: 'freeze',
  FORESIGHT: 'foresight',
  COMPEL: 'compel',
  STEAL: 'steal',
  TRAP_MARK: 'trap_mark',
  PHANTOM: 'phantom',
}

export const CARD_INFO = {
  [CARD_TYPES.SCOUT]: { name: '侦察', emoji: '🔍', desc: '查看对方一枚未揭示棋子的真实身份', color: '#3498db', type: 'info' },
  [CARD_TYPES.SHIELD]: { name: '护盾', emoji: '🛡️', desc: '己方一枚棋子获得护盾，下次战斗抵消击杀', color: '#2980b9', type: 'defense' },
  [CARD_TYPES.SWIFT]: { name: '疾风', emoji: '⚡', desc: '本回合可额外移动一枚棋子', color: '#f39c12', type: 'action' },
  [CARD_TYPES.SWAP]: { name: '换位', emoji: '🌀', desc: '交换己方两枚棋子的位置', color: '#9b59b6', type: 'manipulate' },
  [CARD_TYPES.DISGUISE]: { name: '伪装', emoji: '🎭', desc: '如果该棋子原来是揭开状态，使己方某个棋子变为未揭开状态', color: '#8e44ad', type: 'info' },
  [CARD_TYPES.RAGE]: { name: '狂暴', emoji: '🔥', desc: '己方一枚棋子下次战斗力+3', color: '#e74c3c', type: 'combat' },
  [CARD_TYPES.FREEZE]: { name: '冰冻', emoji: '❄️', desc: '对方一枚棋子下回合不能移动', color: '#1abc9c', type: 'control' },
  [CARD_TYPES.FORESIGHT]: { name: '全视', emoji: '👁️', desc: '查看对方当前手牌内容', color: '#34495e', type: 'info' },
  [CARD_TYPES.COMPEL]: { name: '定向', emoji: '🎯', desc: '对方下回合必须移动指定棋子', color: '#e67e22', type: 'control' },
  [CARD_TYPES.STEAL]: { name: '偷取', emoji: '🃏', desc: '随机偷取对方一张手牌', color: '#c0392b', type: 'interfere' },
  [CARD_TYPES.TRAP_MARK]: { name: '冰冻标记', emoji: '🧊', desc: '在空格放陷阱，敌方踩中冰冻1回合', color: '#00bcd4', type: 'control' },
  [CARD_TYPES.PHANTOM]: { name: '幻影', emoji: '👻', desc: '在空格放幻影迷惑对手', color: '#ab47bc', type: 'manipulate' },
}

// Full card pool: 1 of each type (12 total)
export const CARD_POOL = Object.values(CARD_TYPES)

// Battlefield event types
export const EVENT_TYPES = {
  FOG: 'fog',
  EARTHQUAKE: 'earthquake',
  LIGHTNING: 'lightning',
  RAINBOW: 'rainbow',
  FLOOD: 'flood',
  DIVINATION: 'divination',
  GALE: 'gale',
  DESTINY: 'destiny',
}

export const EVENT_INFO = {
  [EVENT_TYPES.FOG]: { name: '浓雾降临', emoji: '🌫️', desc: '中立区所有已揭示棋子重新变为未揭示' },
  [EVENT_TYPES.EARTHQUAKE]: { name: '地震', emoji: '🌋', desc: '随机1个中立区空格变为裂缝（不可通行）' },
  [EVENT_TYPES.LIGHTNING]: { name: '雷击', emoji: '⚡', desc: '随机1枚已揭示棋子战斗力永久-1' },
  [EVENT_TYPES.RAINBOW]: { name: '彩虹祝福', emoji: '🌈', desc: '双方各1枚未揭示棋子获得祝福（下次战斗+3）' },
  [EVENT_TYPES.FLOOD]: { name: '洪水', emoji: '🌊', desc: '第3行和第5行变为水域（防守时-1）' },
  [EVENT_TYPES.DIVINATION]: { name: '占卜', emoji: '🔮', desc: '双方各看到对方1枚未揭示棋子' },
  [EVENT_TYPES.GALE]: { name: '疾风突袭', emoji: '🏃', desc: '下一回合双方都可移动2枚棋子' },
  [EVENT_TYPES.DESTINY]: { name: '命运之轮', emoji: '💫', desc: '随机交换双方各1枚棋子的位置' },
}

// Treasure types
export const TREASURE_TYPES = {
  DIAMOND_ARMOR: 'diamond_armor',
  WHETSTONE: 'whetstone',
  MAGNET: 'magnet',
  SHADOW: 'shadow',
  TRAP: 'trap',
  PORTAL: 'portal',
  NOTHING: 'nothing',
}

export const TREASURE_INFO = {
  [TREASURE_TYPES.DIAMOND_ARMOR]: { name: '钻石铠甲', emoji: '💎', desc: '获得1次护盾', type: 'good' },
  [TREASURE_TYPES.WHETSTONE]: { name: '磨刀石', emoji: '🗡️', desc: '下次攻击战斗力+3', type: 'good' },
  [TREASURE_TYPES.MAGNET]: { name: '磁铁', emoji: '🧲', desc: '随机移动到相邻空格', type: 'random' },
  [TREASURE_TYPES.SHADOW]: { name: '暗影', emoji: '🌑', desc: '已揭示棋子变为未揭示', type: 'good' },
  [TREASURE_TYPES.TRAP]: { name: '陷阱', emoji: '💀', desc: '战斗力永久-1', type: 'bad' },
  [TREASURE_TYPES.PORTAL]: { name: '传送门', emoji: '🌀', desc: '传送到随机空格', type: 'random' },
  [TREASURE_TYPES.NOTHING]: { name: '无事发生', emoji: '✨', desc: '什么都没有发生', type: 'neutral' },
}

// Treasure probability pool: 3 good + 2 random + 1 bad + 1 neutral = 7, pick 2
export const TREASURE_POOL = [
  TREASURE_TYPES.DIAMOND_ARMOR,
  TREASURE_TYPES.WHETSTONE,
  TREASURE_TYPES.SHADOW,
  TREASURE_TYPES.MAGNET,
  TREASURE_TYPES.PORTAL,
  TREASURE_TYPES.TRAP,
  TREASURE_TYPES.NOTHING,
]

// Game settings
export const TURN_TIME = 45 // seconds
export const DISCONNECT_TIMEOUT = 30 // seconds
export const CARD_DRAW_INTERVAL = 4 // every N turns
export const EVENT_INTERVAL = 6 // every N turns
export const MAX_ROUNDS = 50
export const HAND_LIMIT = 3
export const INITIAL_CARD_COUNT = 0 // no cards at start, first draw at turn 4
