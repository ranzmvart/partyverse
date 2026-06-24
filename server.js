const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const yts = require('yt-search');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const MAX_MESSAGES = 80;

fs.mkdirSync(DATA_DIR, { recursive: true });

const now = () => Date.now();
const id = (prefix = 'id') => `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
const safeName = (v) => String(v || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 20);
const cleanText = (v, max = 600) => String(v || '').replace(/[<>]/g, '').trim().slice(0, max);
const token = () => crypto.randomBytes(24).toString('hex');

const SHOP_ITEMS = [
  { id: 'frame_neon', name: 'Neon Frame', type: 'frame', rarity: 'rare', price: 400 },
  { id: 'frame_void', name: 'Void Frame', type: 'frame', rarity: 'epic', price: 900 },
  { id: 'frame_royal', name: 'Royal Halo Frame', type: 'frame', rarity: 'legendary', price: 1800 },
  { id: 'badge_founder', name: 'Founder Badge', type: 'badge', rarity: 'legendary', price: 1500 },
  { id: 'badge_voice', name: 'Voice Captain', type: 'badge', rarity: 'epic', price: 900 },
  { id: 'theme_midnight', name: 'Midnight Theme', type: 'theme', rarity: 'rare', price: 500 },
  { id: 'theme_cyber', name: 'Cyber Gradient Theme', type: 'theme', rarity: 'epic', price: 1200 },
  { id: 'crate_moon', name: 'Moon Crate', type: 'crate', rarity: 'rare', price: 300 },
  { id: 'crate_legend', name: 'Legend Crate', type: 'crate', rarity: 'legendary', price: 900 }
];

const CRATE_LOOT = [
  { id: 'points_100', name: '100 Points', type: 'points', rarity: 'common', weight: 38, points: 100 },
  { id: 'points_300', name: '300 Points', type: 'points', rarity: 'rare', weight: 24, points: 300 },
  { id: 'frame_neon', name: 'Neon Frame', type: 'frame', rarity: 'rare', weight: 18 },
  { id: 'badge_voice', name: 'Voice Captain', type: 'badge', rarity: 'epic', weight: 10 },
  { id: 'theme_cyber', name: 'Cyber Gradient Theme', type: 'theme', rarity: 'epic', weight: 7 },
  { id: 'frame_royal', name: 'Royal Halo Frame', type: 'frame', rarity: 'legendary', weight: 2 },
  { id: 'badge_founder', name: 'Founder Badge', type: 'badge', rarity: 'mythic', weight: 1 }
];

function defaultDB() {
  const hubId = 'comm_hub';
  const generalId = 'chan_general';
  const voiceId = 'chan_voice';
  return {
    users: {},
    communities: {
      [hubId]: {
        id: hubId,
        name: 'Ryuu Hub',
        owner: 'ryuu',
        code: 'RYUUHUB',
        createdAt: now(),
        members: ['ryuu'],
        channels: [
          { id: generalId, name: 'general', type: 'text' },
          { id: voiceId, name: 'voice-lounge', type: 'voice' }
        ],
        music: null
      }
    },
    messages: { [generalId]: [] },
    invites: []
  };
}

let db;
function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    else db = defaultDB();
  } catch (e) {
    console.error('DB load failed, using fresh DB:', e.message);
    db = defaultDB();
  }
  ensureOwner();
  saveDB();
}
function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
function ensureOwner() {
  db.users = db.users || {};
  db.communities = db.communities || {};
  db.messages = db.messages || {};
  if (!db.users.ryuu) {
    db.users.ryuu = createUserRecord('ryuu', '291206', true);
  }
  db.users.ryuu.owner = true;
  db.users.ryuu.points = 999999999;
  db.users.ryuu.inventory = db.users.ryuu.inventory || {};
  for (const item of SHOP_ITEMS) db.users.ryuu.inventory[item.id] = Math.max(db.users.ryuu.inventory[item.id] || 0, 1);
  db.users.ryuu.equipped = db.users.ryuu.equipped || { frame: 'frame_royal', badge: 'badge_founder', theme: 'theme_cyber' };
}
function createUserRecord(username, pin, owner = false) {
  return {
    username,
    pin,
    owner,
    points: owner ? 999999999 : 1200,
    avatar: '',
    bio: '',
    inventory: {},
    equipped: { frame: '', badge: '', theme: '' },
    stats: { messages: 0, callsJoined: 0, streamsStarted: 0, screenShares: 0, cratesOpened: 0, communities: 0 },
    friends: [],
    friendRequests: [],
    tokens: [],
    createdAt: now()
  };
}
loadDB();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 4e6
});
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_, res) => res.json({ ok: true, app: 'Ryuu Connect', ts: now() }));
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const sockets = new Map(); // socket.id -> username
const userSockets = new Map(); // username -> Set(socket.id)
const voice = new Map(); // channelId -> Map(socket.id, {username, screen, muted})

function addUserSocket(username, sid) {
  if (!userSockets.has(username)) userSockets.set(username, new Set());
  userSockets.get(username).add(sid);
}
function removeUserSocket(username, sid) {
  const set = userSockets.get(username);
  if (set) {
    set.delete(sid);
    if (!set.size) userSockets.delete(username);
  }
}
function userPublic(username) {
  const u = db.users[username];
  if (!u) return null;
  return {
    username: u.username,
    owner: !!u.owner,
    points: u.owner ? '∞' : u.points,
    avatar: u.avatar || '',
    bio: u.bio || '',
    inventory: u.inventory || {},
    equipped: u.equipped || {},
    stats: u.stats || {},
    friends: u.friends || [],
    friendRequests: u.friendRequests || []
  };
}
function checkAuth(sock, tokenValue) {
  if (!tokenValue) return null;
  for (const [username, u] of Object.entries(db.users)) {
    if ((u.tokens || []).includes(tokenValue)) {
      sock.data.username = username;
      sockets.set(sock.id, username);
      addUserSocket(username, sock.id);
      sock.join(`user:${username}`);
      return username;
    }
  }
  return null;
}
function emitMe(sock) {
  const username = sock.data.username;
  if (!username) return;
  sock.emit('me', userPublic(username));
}
function getCommunityForChannel(channelId) {
  return Object.values(db.communities).find(c => c.channels.some(ch => ch.id === channelId));
}
function joinedCommunities(username) {
  return Object.values(db.communities).filter(c => (c.members || []).includes(username));
}
function communityView(c) {
  return {
    id: c.id, name: c.name, owner: c.owner, code: c.code, members: c.members || [], channels: c.channels || [], music: getMusicState(c)
  };
}
function getMusicState(c) {
  if (!c.music) return null;
  const m = { ...c.music };
  if (!m.paused) m.position = Math.max(0, Math.floor((now() - m.startedAt) / 1000));
  return m;
}
function emitCommunity(c) {
  io.to(`comm:${c.id}`).emit('community:update', communityView(c));
}
function requireUser(sock, cb) {
  if (!sock.data.username) return cb({ ok: false, error: 'Login dulu.' });
  return null;
}
function pickLoot() {
  const total = CRATE_LOOT.reduce((a, b) => a + b.weight, 0);
  let roll = Math.random() * total;
  for (const item of CRATE_LOOT) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return CRATE_LOOT[0];
}

io.on('connection', (socket) => {
  socket.emit('server:hello', { time: now() });

  socket.on('auth:restore', (data, cb = () => {}) => {
    const username = checkAuth(socket, data?.token);
    if (!username) return cb({ ok: false });
    emitMe(socket);
    cb({ ok: true, me: userPublic(username) });
  });

  socket.on('auth:register', (data, cb = () => {}) => {
    const username = safeName(data?.username);
    const pin = String(data?.pin || '').trim().slice(0, 20);
    if (username.length < 3) return cb({ ok: false, error: 'Username minimal 3 karakter.' });
    if (pin.length < 4) return cb({ ok: false, error: 'PIN minimal 4 angka/karakter.' });
    if (db.users[username]) return cb({ ok: false, error: 'Username sudah dipakai.' });
    db.users[username] = createUserRecord(username, pin, false);
    const t = token();
    db.users[username].tokens.push(t);
    saveDB();
    checkAuth(socket, t);
    cb({ ok: true, token: t, me: userPublic(username) });
  });

  socket.on('auth:login', (data, cb = () => {}) => {
    const username = safeName(data?.username);
    const pin = String(data?.pin || '').trim().slice(0, 20);
    const u = db.users[username];
    if (!u || u.pin !== pin) return cb({ ok: false, error: 'Username atau PIN salah.' });
    const t = token();
    u.tokens = [...(u.tokens || []).slice(-4), t];
    saveDB();
    checkAuth(socket, t);
    cb({ ok: true, token: t, me: userPublic(username) });
  });

  socket.on('profile:update', (data, cb = () => {}) => {
    if (requireUser(socket, cb)) return;
    const u = db.users[socket.data.username];
    if (typeof data.bio === 'string') u.bio = cleanText(data.bio, 160);
    if (typeof data.avatar === 'string' && data.avatar.startsWith('data:image/') && data.avatar.length < 900000) u.avatar = data.avatar;
    saveDB();
    emitMe(socket);
    cb({ ok: true });
  });

  socket.on('shop:list', (_, cb = () => {}) => cb({ ok: true, items: SHOP_ITEMS }));
  socket.on('shop:buy', (data, cb = () => {}) => {
    if (requireUser(socket, cb)) return;
    const u = db.users[socket.data.username];
    const item = SHOP_ITEMS.find(x => x.id === data?.itemId);
    if (!item) return cb({ ok: false, error: 'Item tidak ditemukan.' });
    if (!u.owner && u.points < item.price) return cb({ ok: false, error: 'Poin kurang.' });
    if (!u.owner) u.points -= item.price;
    u.inventory[item.id] = (u.inventory[item.id] || 0) + 1;
    saveDB();
    emitMe(socket);
    cb({ ok: true, item, me: userPublic(u.username) });
  });

  socket.on('inventory:equip', (data, cb = () => {}) => {
    if (requireUser(socket, cb)) return;
    const u = db.users[socket.data.username];
    const item = SHOP_ITEMS.find(x => x.id === data?.itemId) || CRATE_LOOT.find(x => x.id === data?.itemId);
    if (!item || !['frame', 'badge', 'theme'].includes(item.type)) return cb({ ok: false, error: 'Item ini tidak bisa dipakai.' });
    if (!u.inventory[item.id]) return cb({ ok: false, error: 'Kamu belum punya item ini.' });
    u.equipped[item.type] = item.id;
    saveDB();
    emitMe(socket);
    cb({ ok: true });
  });

  socket.on('crate:open', (data, cb = () => {}) => {
    if (requireUser(socket, cb)) return;
    const u = db.users[socket.data.username];
    const crateId = data?.crateId || 'crate_moon';
    const crate = SHOP_ITEMS.find(x => x.id === crateId && x.type === 'crate');
    if (!crate) return cb({ ok: false, error: 'Crate tidak ditemukan.' });
    if (!u.inventory[crateId]) return cb({ ok: false, error: 'Kamu belum punya crate ini.' });
    u.inventory[crateId] -= 1;
    if (u.inventory[crateId] <= 0) delete u.inventory[crateId];
    const reward = pickLoot();
    if (reward.type === 'points') u.points += reward.points;
    else u.inventory[reward.id] = (u.inventory[reward.id] || 0) + 1;
    u.stats.cratesOpened = (u.stats.cratesOpened || 0) + 1;
    saveDB();
    emitMe(socket);
    cb({ ok: true, reward });
  });

  socket.on('community:list', (_, cb = () => {}) => {
    if (requireUser(socket, cb)) return;
    cb({ ok: true, joined: joinedCommunities(socket.data.username).map(communityView), public: Object.values(db.communities).map(c => ({ id: c.id, name: c.name, members: (c.members || []).length, code: c.code })) });
  });

  socket.on('community:create', (data, cb = () => {}) => {
    if (requireUser(socket, cb)) return;
    const username = socket.data.username;
    const name = cleanText(data?.name, 32) || `${username}'s Server`;
    const cId = id('comm');
    const tId = id('text');
    const vId = id('voice');
    const code = crypto.randomBytes(3).toString('hex').toUpperCase();
    db.communities[cId] = { id: cId, name, owner: username, code, createdAt: now(), members: [username], channels: [ { id: tId, name: 'general', type: 'text' }, { id: vId, name: 'voice', type: 'voice' } ], music: null };
    db.messages[tId] = [];
    db.users[username].stats.communities = (db.users[username].stats.communities || 0) + 1;
    saveDB();
    socket.join(`comm:${cId}`);
    cb({ ok: true, community: communityView(db.communities[cId]) });
  });

  socket.on('community:join', (data, cb = () => {}) => {
    if (requireUser(socket, cb)) return;
    const code = String(data?.code || '').trim().toUpperCase();
    const c = Object.values(db.communities).find(x => x.code === code || x.id === data?.id);
    if (!c) return cb({ ok: false, error: 'Server tidak ditemukan.' });
    if (!c.members.includes(socket.data.username)) c.members.push(socket.data.username);
    saveDB();
    socket.join(`comm:${c.id}`);
    emitCommunity(c);
    cb({ ok: true, community: communityView(c) });
  });

  socket.on('community:open', (data, cb = () => {}) => {
    if (requireUser(socket, cb)) return;
    const c = db.communities[data?.communityId];
    if (!c || !c.members.includes(socket.data.username)) return cb({ ok: false, error: 'Tidak punya akses.' });
    socket.join(`comm:${c.id}`);
    cb({ ok: true, community: communityView(c), messages: Object.fromEntries((c.channels || []).filter(ch => ch.type === 'text').map(ch => [ch.id, db.messages[ch.id] || []])), music: getMusicState(c) });
  });

  socket.on('message:send', (data, cb = () => {}) => {
    if (requireUser(socket, cb)) return;
    const channelId = data?.channelId;
    const c = getCommunityForChannel(channelId);
    if (!c || !c.members.includes(socket.data.username)) return cb({ ok: false, error: 'Channel tidak valid.' });
    const ch = c.channels.find(x => x.id === channelId);
    if (!ch || ch.type !== 'text') return cb({ ok: false, error: 'Bukan text channel.' });
    const msg = { id: id('msg'), user: socket.data.username, text: cleanText(data?.text), createdAt: now() };
    if (!msg.text) return cb({ ok: false, error: 'Pesan kosong.' });
    db.messages[channelId] = db.messages[channelId] || [];
    db.messages[channelId].push(msg);
    db.messages[channelId] = db.messages[channelId].slice(-MAX_MESSAGES);
    db.users[socket.data.username].stats.messages = (db.users[socket.data.username].stats.messages || 0) + 1;
    if (!db.users[socket.data.username].owner) db.users[socket.data.username].points += 2;
    saveDB();
    io.to(`comm:${c.id}`).emit('message:new', { channelId, msg });
    emitMe(socket);
    cb({ ok: true });
  });

  socket.on('friends:search', (data, cb = () => {}) => {
    if (requireUser(socket, cb)) return;
    const q = safeName(data?.query);
    const result = Object.values(db.users).filter(u => u.username.includes(q) && u.username !== socket.data.username).slice(0, 10).map(u => ({ username: u.username, avatar: u.avatar || '', equipped: u.equipped || {} }));
    cb({ ok: true, result });
  });

  socket.on('friends:add', (data, cb = () => {}) => {
    if (requireUser(socket, cb)) return;
    const target = safeName(data?.username);
    const me = db.users[socket.data.username];
    const other = db.users[target];
    if (!other || target === me.username) return cb({ ok: false, error: 'User tidak ditemukan.' });
    if (me.friends.includes(target)) return cb({ ok: false, error: 'Sudah berteman.' });
    other.friendRequests = other.friendRequests || [];
    if (!other.friendRequests.includes(me.username)) other.friendRequests.push(me.username);
    saveDB();
    io.to(`user:${target}`).emit('notify', { type: 'friend', text: `${me.username} mengirim permintaan teman.` });
    cb({ ok: true });
  });

  socket.on('friends:accept', (data, cb = () => {}) => {
    if (requireUser(socket, cb)) return;
    const from = safeName(data?.username);
    const me = db.users[socket.data.username];
    const other = db.users[from];
    if (!other || !(me.friendRequests || []).includes(from)) return cb({ ok: false, error: 'Request tidak ditemukan.' });
    me.friendRequests = me.friendRequests.filter(x => x !== from);
    if (!me.friends.includes(from)) me.friends.push(from);
    if (!other.friends.includes(me.username)) other.friends.push(me.username);
    saveDB();
    emitMe(socket);
    io.to(`user:${from}`).emit('notify', { type: 'friend', text: `${me.username} menerima permintaan teman.` });
    cb({ ok: true });
  });

  socket.on('friends:invite', (data, cb = () => {}) => {
    if (requireUser(socket, cb)) return;
    const target = safeName(data?.username);
    const c = db.communities[data?.communityId];
    if (!c || !c.members.includes(socket.data.username)) return cb({ ok: false, error: 'Server tidak valid.' });
    if (!db.users[target]) return cb({ ok: false, error: 'Teman tidak ditemukan.' });
    io.to(`user:${target}`).emit('invite:community', { from: socket.data.username, community: { id: c.id, name: c.name, code: c.code } });
    cb({ ok: true });
  });

  socket.on('leaderboard:get', (_, cb = () => {}) => {
    const rows = Object.values(db.users).map(u => ({ username: u.username, points: u.owner ? 999999999 : u.points, avatar: u.avatar || '', stats: u.stats || {}, equipped: u.equipped || {} })).sort((a, b) => b.points - a.points).slice(0, 100);
    cb({ ok: true, rows });
  });

  socket.on('music:search', async (data, cb = () => {}) => {
    const q = cleanText(data?.query, 90);
    if (!q) return cb({ ok: false, error: 'Ketik judul lagu dulu.' });
    try {
      const result = await yts(q);
      const videos = (result.videos || []).slice(0, 10).map(v => ({ videoId: v.videoId, title: v.title, author: v.author?.name || v.author || 'YouTube', duration: v.timestamp || '', thumbnail: v.thumbnail || '' }));
      cb({ ok: true, videos });
    } catch (e) {
      cb({ ok: false, error: 'Gagal mencari lagu. Coba lagi.' });
    }
  });

  socket.on('music:room-play', (data, cb = () => {}) => {
    if (requireUser(socket, cb)) return;
    const c = db.communities[data?.communityId];
    if (!c || !c.members.includes(socket.data.username)) return cb({ ok: false, error: 'Server tidak valid.' });
    if (c.owner !== socket.data.username && !db.users[socket.data.username].owner) return cb({ ok: false, error: 'Hanya owner server yang bisa mengatur musik room.' });
    c.music = { videoId: cleanText(data.videoId, 32), title: cleanText(data.title, 120), startedAt: now(), paused: false, position: 0, host: socket.data.username };
    db.users[socket.data.username].stats.streamsStarted = (db.users[socket.data.username].stats.streamsStarted || 0) + 1;
    saveDB();
    io.to(`comm:${c.id}`).emit('music:room-state', getMusicState(c));
    cb({ ok: true });
  });
  socket.on('music:room-pause', (data, cb = () => {}) => {
    if (requireUser(socket, cb)) return;
    const c = db.communities[data?.communityId];
    if (!c || !c.music) return cb({ ok: false });
    if (c.owner !== socket.data.username && !db.users[socket.data.username].owner) return cb({ ok: false, error: 'Hanya owner server.' });
    c.music.position = Math.floor((now() - c.music.startedAt) / 1000);
    c.music.paused = true;
    saveDB();
    io.to(`comm:${c.id}`).emit('music:room-state', getMusicState(c));
    cb({ ok: true });
  });
  socket.on('music:room-resume', (data, cb = () => {}) => {
    if (requireUser(socket, cb)) return;
    const c = db.communities[data?.communityId];
    if (!c || !c.music) return cb({ ok: false });
    if (c.owner !== socket.data.username && !db.users[socket.data.username].owner) return cb({ ok: false, error: 'Hanya owner server.' });
    c.music.startedAt = now() - (c.music.position || 0) * 1000;
    c.music.paused = false;
    saveDB();
    io.to(`comm:${c.id}`).emit('music:room-state', getMusicState(c));
    cb({ ok: true });
  });
  socket.on('music:room-stop', (data, cb = () => {}) => {
    if (requireUser(socket, cb)) return;
    const c = db.communities[data?.communityId];
    if (!c) return cb({ ok: false });
    if (c.owner !== socket.data.username && !db.users[socket.data.username].owner) return cb({ ok: false, error: 'Hanya owner server.' });
    c.music = null;
    saveDB();
    io.to(`comm:${c.id}`).emit('music:room-state', null);
    cb({ ok: true });
  });

  socket.on('voice:join', (data, cb = () => {}) => {
    if (requireUser(socket, cb)) return;
    const channelId = data?.channelId;
    const c = getCommunityForChannel(channelId);
    if (!c || !c.members.includes(socket.data.username)) return cb({ ok: false, error: 'Voice channel tidak valid.' });
    if (!voice.has(channelId)) voice.set(channelId, new Map());
    const room = voice.get(channelId);
    const existing = [...room.entries()].map(([sid, v]) => ({ socketId: sid, username: v.username, screen: !!v.screen, muted: !!v.muted }));
    room.set(socket.id, { username: socket.data.username, screen: false, muted: !!data?.muted });
    socket.join(`voice:${channelId}`);
    socket.data.voiceChannel = channelId;
    db.users[socket.data.username].stats.callsJoined = (db.users[socket.data.username].stats.callsJoined || 0) + 1;
    saveDB();
    socket.emit('voice:existing-peers', { channelId, peers: existing });
    socket.to(`voice:${channelId}`).emit('voice:peer-joined', { channelId, socketId: socket.id, username: socket.data.username });
    broadcastVoice(channelId);
    emitMe(socket);
    cb({ ok: true, peers: existing });
  });

  socket.on('voice:leave', (_, cb = () => {}) => {
    leaveVoice(socket);
    cb({ ok: true });
  });

  socket.on('voice:mute', (data, cb = () => {}) => {
    const ch = socket.data.voiceChannel;
    if (!ch || !voice.has(ch)) return cb({ ok: false });
    const room = voice.get(ch);
    if (room.has(socket.id)) room.get(socket.id).muted = !!data?.muted;
    broadcastVoice(ch);
    cb({ ok: true });
  });

  socket.on('voice:signal', (data) => {
    if (!data?.to) return;
    io.to(data.to).emit('voice:signal', { from: socket.id, username: socket.data.username, signal: data.signal });
  });

  socket.on('screen:start', () => {
    const ch = socket.data.voiceChannel;
    if (!ch || !voice.has(ch)) return;
    const room = voice.get(ch);
    if (room.has(socket.id)) room.get(socket.id).screen = true;
    const u = db.users[socket.data.username];
    if (u) { u.stats.screenShares = (u.stats.screenShares || 0) + 1; saveDB(); }
    socket.to(`voice:${ch}`).emit('screen:start', { socketId: socket.id, username: socket.data.username });
    broadcastVoice(ch);
  });
  socket.on('screen:stop', () => {
    const ch = socket.data.voiceChannel;
    if (!ch || !voice.has(ch)) return;
    const room = voice.get(ch);
    if (room.has(socket.id)) room.get(socket.id).screen = false;
    socket.to(`voice:${ch}`).emit('screen:stop', { socketId: socket.id });
    broadcastVoice(ch);
  });

  socket.on('disconnect', () => {
    const username = sockets.get(socket.id);
    if (username) removeUserSocket(username, socket.id);
    sockets.delete(socket.id);
    leaveVoice(socket);
  });
});

function broadcastVoice(channelId) {
  const room = voice.get(channelId) || new Map();
  const participants = [...room.entries()].map(([socketId, v]) => ({ socketId, username: v.username, screen: !!v.screen, muted: !!v.muted, avatar: db.users[v.username]?.avatar || '' }));
  io.to(`voice:${channelId}`).emit('voice:participants', { channelId, participants });
}
function leaveVoice(socket) {
  const ch = socket.data.voiceChannel;
  if (!ch || !voice.has(ch)) return;
  const room = voice.get(ch);
  const had = room.delete(socket.id);
  socket.leave(`voice:${ch}`);
  socket.data.voiceChannel = null;
  if (had) {
    socket.to(`voice:${ch}`).emit('voice:peer-left', { socketId: socket.id });
    broadcastVoice(ch);
  }
  if (!room.size) voice.delete(ch);
}

server.listen(PORT, HOST, () => {
  console.log(`Ryuu Connect ready on http://${HOST}:${PORT}`);
  console.log(`Data path: ${DB_FILE}`);
});
