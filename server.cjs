const express = require('express')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const USERS_FILE = path.join(__dirname, 'users.json')
const PORT = 8096
const PWD_SALT = 'scratch-off-v1'
const BUY_PRICE = 10

// --- data helpers ---

function readUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'))
  } catch {
    return { users: {} }
  }
}

function writeUsers(data) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + PWD_SALT).digest('hex')
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex')
}

// Migrate old data.json → users.json on first run
function migrateOldData() {
  const dataPath = path.join(__dirname, 'data.json')
  if (fs.existsSync(dataPath) && !fs.existsSync(USERS_FILE)) {
    try {
      const old = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
      writeUsers({
        users: {
          admin: {
            password: hashPassword('admin'),
            token: null,
            balance: old.balance || 0,
            scratchCards: old.scratchCards || 0,
            lastSignInDate: old.lastSignInDate || null,
            nextGuaranteedPrize: old.nextGuaranteedPrize || null,
            guaranteedPrizes: old.guaranteedPrizes || {},
          }
        }
      })
      fs.renameSync(dataPath, dataPath + '.bak')
      console.log('[migrate] data.json → users.json (user: admin, password: admin)')
    } catch (e) {
      console.error('[migrate] failed:', e.message)
    }
  }
}

// user data (strip sensitive fields)
function safeUserData(u) {
  return {
    balance: u.balance ?? 0,
    scratchCards: u.scratchCards ?? 0,
    lastSignInDate: u.lastSignInDate ?? null,
    nextGuaranteedPrize: u.nextGuaranteedPrize ?? null,
    guaranteedPrizes: u.guaranteedPrizes ?? {},
  }
}

// --- auth middleware ---

function requireAuth(req, res, next) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: '未登录' })
  }
  const token = auth.slice(7)
  const data = readUsers()
  const entry = Object.entries(data.users).find(([_, u]) => u.token === token)
  if (!entry) {
    return res.status(401).json({ ok: false, error: '登录已过期' })
  }
  req.username = entry[0]
  req.userEntry = entry[1]   // reference to the user object (mutable)
  req.usersData = data        // reference to the full data (for saving)
  next()
}

// --- app ---

const app = express()
app.use(express.json())

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// ------- Auth API -------

app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: '用户名和密码不能为空' })
  }
  if (username.length < 1 || username.length > 20) {
    return res.status(400).json({ ok: false, error: '用户名长度1-20个字符' })
  }
  if (password.length < 1) {
    return res.status(400).json({ ok: false, error: '密码不能为空' })
  }
  const data = readUsers()
  if (data.users[username]) {
    return res.status(400).json({ ok: false, error: '用户名已存在' })
  }
  const token = generateToken()
  data.users[username] = {
    password: hashPassword(password),
    token,
    balance: 0,
    scratchCards: 0,
    lastSignInDate: null,
    nextGuaranteedPrize: null,
    guaranteedPrizes: {},
  }
  writeUsers(data)
  res.json({ ok: true, token, username, ...safeUserData(data.users[username]) })
})

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: '用户名和密码不能为空' })
  }
  const data = readUsers()
  const user = data.users[username]
  if (!user || user.password !== hashPassword(password)) {
    return res.status(400).json({ ok: false, error: '用户名或密码错误' })
  }
  // regenerate token each login
  user.token = generateToken()
  writeUsers(data)
  res.json({ ok: true, token: user.token, username, ...safeUserData(user) })
})

app.post('/api/auth/logout', requireAuth, (req, res) => {
  req.userEntry.token = null
  writeUsers(req.usersData)
  res.json({ ok: true })
})

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ ok: true, username: req.username, ...safeUserData(req.userEntry) })
})

// ------- Scratch API (all require auth) -------

app.get('/api/scratch/state', requireAuth, (req, res) => {
  res.json(safeUserData(req.userEntry))
})

app.post('/api/scratch/signin', requireAuth, (req, res) => {
  const today = new Date().toDateString()
  if (req.userEntry.lastSignInDate === today) {
    return res.status(400).json({ ok: false, error: '今天已签到' })
  }
  req.userEntry.lastSignInDate = today
  req.userEntry.scratchCards += 1
  writeUsers(req.usersData)
  res.json({ ok: true, ...safeUserData(req.userEntry) })
})

app.post('/api/scratch/buy', requireAuth, (req, res) => {
  if (req.userEntry.balance < BUY_PRICE) {
    return res.status(400).json({ ok: false, error: '余额不足' })
  }
  req.userEntry.balance -= BUY_PRICE
  req.userEntry.scratchCards += 1
  writeUsers(req.usersData)
  res.json({ ok: true, ...safeUserData(req.userEntry) })
})

app.post('/api/scratch/start', requireAuth, (req, res) => {
  if (req.userEntry.scratchCards <= 0) {
    return res.status(400).json({ ok: false, error: '没有刮刮乐了' })
  }
  const guaranteedPrize = req.userEntry.nextGuaranteedPrize || null
  req.userEntry.nextGuaranteedPrize = null
  req.userEntry.scratchCards -= 1
  writeUsers(req.usersData)
  res.json({ ok: true, ...safeUserData(req.userEntry), guaranteedPrize })
})

app.post('/api/scratch/confirm', requireAuth, (req, res) => {
  const prizeWon = req.body.prizeWon || 0
  const cardsWon = req.body.cardsWon || 0
  req.userEntry.balance += prizeWon
  req.userEntry.scratchCards += cardsWon
  writeUsers(req.usersData)
  res.json({ ok: true, ...safeUserData(req.userEntry) })
})

app.put('/api/scratch/guarantee', requireAuth, (req, res) => {
  const { number, amount, type, value } = req.body
  if (number && amount) {
    req.userEntry.nextGuaranteedPrize = { number, amount, type: type || 'cash', value: value || 0 }
  } else {
    req.userEntry.nextGuaranteedPrize = null
  }
  writeUsers(req.usersData)
  res.json({ ok: true, nextGuaranteedPrize: req.userEntry.nextGuaranteedPrize })
})

app.get('/api/scratch/guarantee', requireAuth, (req, res) => {
  res.json({ nextGuaranteedPrize: req.userEntry.nextGuaranteedPrize || null })
})

// ------- Admin API (no auth, local admin page) -------

app.get('/api/admin/users', (req, res) => {
  const data = readUsers()
  const users = Object.keys(data.users).map(name => {
    const u = data.users[name]
    return { name, ...safeUserData(u) }
  })
  res.json({ users })
})

app.get('/api/admin/user/:username', (req, res) => {
  const data = readUsers()
  const user = data.users[req.params.username]
  if (!user) return res.status(404).json({ ok: false, error: '用户不存在' })
  res.json({ ok: true, username: req.params.username, ...safeUserData(user) })
})

app.put('/api/admin/user/:username', (req, res) => {
  const data = readUsers()
  const user = data.users[req.params.username]
  if (!user) return res.status(404).json({ ok: false, error: '用户不存在' })
  const { balance, scratchCards, lastSignInDate } = req.body
  if (balance !== undefined) user.balance = balance
  if (scratchCards !== undefined) user.scratchCards = scratchCards
  if (lastSignInDate !== undefined) user.lastSignInDate = lastSignInDate
  writeUsers(data)
  res.json({ ok: true, ...safeUserData(user) })
})

app.post('/api/admin/user', (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: '用户名和密码不能为空' })
  }
  const data = readUsers()
  if (data.users[username]) {
    return res.status(400).json({ ok: false, error: '用户已存在' })
  }
  data.users[username] = {
    password: hashPassword(password),
    token: null,
    balance: 0,
    scratchCards: 0,
    lastSignInDate: null,
    nextGuaranteedPrize: null,
    guaranteedPrizes: {},
  }
  writeUsers(data)
  res.json({ ok: true, username })
})

// ------- Admin Page -------

app.get('/admin/scratch', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="cache-control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="pragma" content="no-cache">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>刮刮乐 - 管理</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #f5f5f5;
    display: flex; flex-direction: column; align-items: center;
    min-height: 100vh; padding: 20px; gap: 20px;
  }
  .card {
    background: white; border-radius: 20px; padding: 32px;
    width: 100%; max-width: 440px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08);
  }
  h1 { font-size: 24px; color: #c0392b; margin-bottom: 20px; text-align: center; }
  h2 { font-size: 18px; color: #555; margin-bottom: 16px; text-align: center; }
  .field { margin-bottom: 16px; }
  .field label { display: block; font-size: 14px; color: #666; margin-bottom: 6px; }
  .field input, .field select {
    width: 100%; padding: 12px 16px; border: 2px solid #e0e0e0;
    border-radius: 12px; font-size: 18px; font-weight: 600; font-family: inherit;
    transition: border-color 0.2s;
  }
  .field input:focus, .field select:focus { outline: none; border-color: #ff6b6b; }
  .btn {
    width: 100%; padding: 14px; border: none; border-radius: 14px;
    font-size: 16px; font-weight: 700; cursor: pointer; margin-bottom: 10px;
    background: linear-gradient(135deg, #ff6b6b, #ee5a24);
    color: white; transition: opacity 0.2s; font-family: inherit;
  }
  .btn:hover { opacity: 0.9; }
  .btn-secondary { background: linear-gradient(135deg, #ffeaa7, #fdcb6e); color: #6b4c00; }
  .btn-danger { background: linear-gradient(135deg, #e74c3c, #c0392b); }
  .btn-small {
    padding: 8px 16px; font-size: 13px; border: none; border-radius: 8px;
    cursor: pointer; font-family: inherit; font-weight: 600;
    background: #eee; color: #555; transition: background 0.2s;
  }
  .btn-small:hover { background: #ddd; }
  .status { font-size: 13px; color: #27ae60; text-align: center; margin-top: 8px; }
  .error { color: #c0392b; }
  .user-list { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; justify-content: center; }
  .user-chip {
    padding: 8px 18px; border-radius: 100px; border: 2px solid #e0e0e0;
    cursor: pointer; font-size: 14px; font-weight: 600; font-family: inherit;
    background: white; color: #555; transition: all 0.2s;
  }
  .user-chip:hover { border-color: #ff6b6b; color: #c0392b; }
  .user-chip.active { border-color: #ff6b6b; background: #fff5f5; color: #c0392b; }
  .create-row { display: flex; gap: 8px; margin-bottom: 16px; }
  .create-row input { flex: 1; padding: 10px 14px; border: 2px solid #e0e0e0;
    border-radius: 10px; font-size: 14px; font-family: inherit; }
  .create-row input:focus { outline: none; border-color: #ff6b6b; }
  .create-row .btn-small { flex-shrink: 0; }
  .inline-group { display: flex; gap: 8px; }
  .inline-group button {
    flex: 1; padding: 12px; border: none; border-radius: 12px; font-size: 14px;
    font-weight: 600; cursor: pointer; font-family: inherit;
    background: #eee; color: #555;
  }
  .inline-group button.active { background: #ff6b6b; color: white; }
  .prize-preview {
    background: #fffbe6; border: 2px solid #ffcc16; border-radius: 12px;
    padding: 12px 16px; margin: 16px 0; text-align: center;
  }
  .prize-preview .num { color: #ffcc16; font-size: 20px; font-weight: 800; }
  .prize-preview .amt { color: #ffcc16; font-size: 16px; font-weight: 700; margin-top: 4px; }
  .prize-preview .hint { color: #999; font-size: 12px; margin-top: 4px; }
  .section-divider { border: none; border-top: 1px solid #eee; margin: 24px 0; }
  .loading { text-align: center; color: #999; padding: 20px; }
  .empty { text-align: center; color: #ccc; padding: 20px; font-size: 14px; }
</style>
</head>
<body>

<div class="card">
  <h1>🎫 刮刮乐管理</h1>

  <div class="refresh" style="text-align:right;margin-bottom:12px;">
    <a onclick="loadUsers()" style="color:#999;font-size:13px;cursor:pointer;">🔄 刷新</a>
  </div>

  <h2>创建用户</h2>
  <div class="create-row">
    <input type="text" id="newName" placeholder="用户名" maxlength="20">
    <input type="password" id="newPwd" placeholder="密码">
    <button class="btn-small" onclick="createUser()">创建</button>
  </div>
  <div id="createStatus" class="status" style="margin-bottom:16px;"></div>

  <h2>选择用户</h2>
  <div id="userList" class="user-list">
    <div class="loading">加载中...</div>
  </div>
</div>

<div class="card" id="editCard" style="display:none;">
  <h2 id="editTitle">编辑用户</h2>
  <div class="field">
    <label>余额 (¥)</label>
    <input type="number" id="balance" min="0" step="1">
  </div>
  <div class="field">
    <label>刮刮乐张数</label>
    <input type="number" id="scratchCards" min="0" step="1">
  </div>
  <div class="field">
    <label>上次签到日期</label>
    <input type="text" id="lastSignInDate" placeholder="例如: Mon May 27 2026">
  </div>
  <button class="btn" onclick="saveUser()">💾 保存</button>
  <button class="btn btn-secondary" onclick="resetSignIn()">🔄 重置签到（可再签到一次）</button>
  <div id="editStatus" class="status"></div>

  <hr class="section-divider">

  <h2 style="font-size:16px;">🏆 下次必中奖品</h2>
  <p style="font-size:13px;color:#999;text-align:center;margin:-12px 0 16px;">设置后下次刮卡时自动生效，中奖后失效</p>
  <div class="field">
    <label>号码文字</label>
    <input type="text" id="gpNumber" placeholder="🎁" maxlength="10">
  </div>
  <div class="field">
    <label>金额文字</label>
    <input type="text" id="gpAmount" placeholder="¥200" maxlength="12">
  </div>
  <div class="field">
    <label>奖品类型</label>
    <select id="gpType" onchange="updateValueLabel()">
      <option value="cash">现金</option>
      <option value="card">刮刮乐</option>
    </select>
  </div>
  <div class="field">
    <label id="gpValueLabel">现金金额 (¥)</label>
    <input type="number" id="gpValue" min="1" step="1" value="88">
  </div>
  <div id="prizePreview" class="prize-preview">
    <div class="num">🎁</div>
    <div class="amt">¥88</div>
    <div class="hint">↑ 预览</div>
  </div>
  <button class="btn" onclick="saveGuarantee()">💾 保存必中</button>
  <button class="btn btn-danger" onclick="clearGuarantee()">🗑️ 清除</button>
  <div id="gpStatus" class="status"></div>
</div>

<script>
var currentUser = null

async function loadUsers() {
  document.getElementById('userList').innerHTML = '<div class="loading">加载中...</div>'
  try {
    var r = await fetch('/api/admin/users')
    if (!r.ok) throw new Error('HTTP ' + r.status)
    var data = await r.json()
    var html = ''
    data.users.forEach(function(u) {
      var active = currentUser === u.name ? 'active' : ''
      html += '<button class="user-chip ' + active + '" data-name="' + u.name.replace(/"/g, '&quot;') + '">' + u.name + '</button>'
    })
    if (!html) html = '<div class="empty">暂无用户</div>'
    document.getElementById('userList').innerHTML = html
  } catch (e) {
    document.getElementById('userList').innerHTML = '<div class="error" style="text-align:center;padding:12px;">❌ 加载失败: ' + e.message + '</div>'
  }
}

// Event delegation for user chips
document.addEventListener('click', function(e) {
  var chip = e.target.closest('.user-chip')
  if (chip) selectUser(chip.dataset.name)
})

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
  loadGuarantee()
  loadUsers() // refresh chip styles
}

async function saveUser() {
  if (!currentUser) return
  var balance = parseInt(document.getElementById('balance').value) || 0
  var scratchCards = parseInt(document.getElementById('scratchCards').value) || 0
  var lastSignInDate = document.getElementById('lastSignInDate').value || null
  var r = await fetch('/api/admin/user/' + currentUser, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ balance, scratchCards, lastSignInDate })
  })
  var result = await r.json()
  var el = document.getElementById('editStatus')
  if (result.ok) { el.textContent = '✅ 保存成功'; el.className = 'status' }
  else { el.textContent = '❌ ' + (result.error || '失败'); el.className = 'status error' }
}

async function resetSignIn() {
  if (!currentUser) return
  var r = await fetch('/api/admin/user/' + currentUser, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lastSignInDate: null })
  })
  var result = await r.json()
  var el = document.getElementById('editStatus')
  if (result.ok) {
    document.getElementById('lastSignInDate').value = ''
    el.textContent = '✅ 签到已重置'; el.className = 'status'
  } else { el.textContent = '❌ ' + (result.error || '失败'); el.className = 'status error' }
}

async function createUser() {
  var name = document.getElementById('newName').value.trim()
  var pwd = document.getElementById('newPwd').value
  if (!name || !pwd) { document.getElementById('createStatus').textContent = '❌ 请填写用户名和密码'; document.getElementById('createStatus').className = 'status error'; return }
  var r = await fetch('/api/admin/user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: name, password: pwd })
  })
  var result = await r.json()
  var el = document.getElementById('createStatus')
  if (result.ok) {
    el.textContent = '✅ 用户 ' + name + ' 已创建'; el.className = 'status'
    document.getElementById('newName').value = ''
    document.getElementById('newPwd').value = ''
    loadUsers()
  } else { el.textContent = '❌ ' + (result.error || '失败'); el.className = 'status error' }
}

// --- guaranteed prize ---

async function loadGuarantee() {
  if (!currentUser) return
  var r = await fetch('/api/admin/user/' + currentUser)
  var data = await r.json()
  var gp = data.nextGuaranteedPrize
  if (gp) {
    document.getElementById('gpNumber').value = gp.number
    document.getElementById('gpAmount').value = gp.amount
    document.getElementById('gpType').value = gp.type
    document.getElementById('gpValue').value = gp.value
  } else {
    document.getElementById('gpNumber').value = ''
    document.getElementById('gpAmount').value = ''
    document.getElementById('gpType').value = 'cash'
    document.getElementById('gpValue').value = ''
  }
  updatePreview()
}

function updatePreview() {
  var num = document.getElementById('gpNumber').value || '🎁'
  var amt = document.getElementById('gpAmount').value || '¥??'
  document.querySelector('#prizePreview .num').textContent = num
  document.querySelector('#prizePreview .amt').textContent = amt
}

function updateValueLabel() {
  var type = document.getElementById('gpType').value
  document.getElementById('gpValueLabel').textContent = type === 'cash' ? '现金金额 (¥)' : '刮刮乐数量'
}

async function saveGuarantee() {
  if (!currentUser) return
  var number = document.getElementById('gpNumber').value.trim()
  var amount = document.getElementById('gpAmount').value.trim()
  var type = document.getElementById('gpType').value
  var value = parseInt(document.getElementById('gpValue').value) || 0
  if (!number || !amount) {
    document.getElementById('gpStatus').textContent = '❌ 请填写号码文字和金额文字'
    document.getElementById('gpStatus').className = 'status error'
    return
  }
  var r = await fetch('/api/scratch/guarantee', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAdminToken() },
    body: JSON.stringify({ number, amount, type, value })
  })
  var result = await r.json()
  var el = document.getElementById('gpStatus')
  if (result.ok) { el.textContent = '✅ 已保存'; el.className = 'status' }
  else { el.textContent = '❌ ' + (result.error || '失败'); el.className = 'status error' }
}

async function clearGuarantee() {
  if (!currentUser) return
  var r = await fetch('/api/scratch/guarantee', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAdminToken() },
    body: JSON.stringify({})
  })
  var result = await r.json()
  var el = document.getElementById('gpStatus')
  if (result.ok) {
    document.getElementById('gpNumber').value = ''
    document.getElementById('gpAmount').value = ''
    document.getElementById('gpType').value = 'cash'
    document.getElementById('gpValue').value = ''
    updatePreview()
    el.textContent = '✅ 已清除'; el.className = 'status'
  } else { el.textContent = '❌ ' + (result.error || '失败'); el.className = 'status error' }
}

// For guaranteed prize admin, we need a token. Use a simple approach:
// try to login as the selected user, or use a stored admin token.
var adminToken = localStorage.getItem('adminToken') || ''
function getAdminToken() { return adminToken }

// On load, try to login as admin so guaranteed prize admin works
async function initAdminAuth() {
  if (!adminToken) {
    try {
      var r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin' })
      })
      var data = await r.json()
      if (data.ok) {
        adminToken = data.token
        localStorage.setItem('adminToken', adminToken)
      }
    } catch (e) {
      console.log('admin auth init skipped:', e.message)
    }
  }
}

document.getElementById('gpNumber').addEventListener('input', updatePreview)
document.getElementById('gpAmount').addEventListener('input', updatePreview)
initAdminAuth()
loadUsers()
</script>
</body>
</html>`)
})

// migrate on startup
migrateOldData()

app.listen(PORT, () => {
  console.log(`Scratch-off server running on http://0.0.0.0:${PORT}`)
})
