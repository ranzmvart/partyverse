const $ = (q) => document.querySelector(q);
const $$ = (q) => [...document.querySelectorAll(q)];
const socket = io({ reconnection: true, reconnectionAttempts: Infinity, timeout: 12000 });

const state = {
  token: localStorage.getItem('ryuu_connect_token') || '',
  me: null,
  page: 'home',
  authMode: 'login',
  communities: [],
  publicCommunities: [],
  currentCommunity: null,
  currentChannel: null,
  messages: {},
  voiceChannel: null,
  localStream: null,
  screenStream: null,
  voiceMuted: false,
  peers: new Map(),
  musicMode: localStorage.getItem('ryuu_music_mode') || 'host',
  musicVolume: Number(localStorage.getItem('ryuu_music_volume') || 70),
  ytReady: false,
  ytPlayer: null,
  activeVideoId: '',
  activeTrackTitle: '',
  roomMusic: null,
  voiceLive: null,
  inVoice: false,
  watchModeHost: false,
  activeWatchId: ''
};

function toast(text, type='good') {
  const box = $('#toastBox');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = text;
  box.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
function fmtTime(ts){ return new Date(ts).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}); }
function avatar(user, cls='avatar') {
  if (user?.avatar) return `<img class="${cls} ${user.equipped?.frame || ''}" src="${user.avatar}" alt="avatar">`;
  return `<div class="${cls} ${user?.equipped?.frame || ''}">${(user?.username||'?')[0]?.toUpperCase()}</div>`;
}
function mePoints(){ return state.me?.owner ? '∞' : (state.me?.points ?? 0).toLocaleString('id-ID'); }
function setOnline(ok) { const el=$('#netStatus'); el.textContent=ok?'Online':'Connecting'; el.classList.toggle('online', ok); }

window.onYouTubeIframeAPIReady = () => { state.ytReady = true; ensurePlayer(); };
function ensurePlayer() {
  if (!state.ytReady || state.ytPlayer) return;
  state.ytPlayer = new YT.Player('ytPlayer', {
    height: '1', width: '1', videoId: '',
    playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin },
    events: { onReady: () => setVolume(state.musicVolume) }
  });
}
function setVolume(v) {
  state.musicVolume = Number(v);
  localStorage.setItem('ryuu_music_volume', state.musicVolume);
  $('#volumeSlider').value = state.musicVolume;
  $('#volumeText').textContent = `${state.musicVolume}%`;
  if (state.ytPlayer?.setVolume) state.ytPlayer.setVolume(state.musicVolume);
}
function playVideo(videoId, title, seconds=0) {
  ensurePlayer();
  state.activeVideoId = videoId;
  state.activeTrackTitle = title || 'YouTube Music';
  $('#currentTrack').textContent = state.activeTrackTitle;
  const tryPlay = () => {
    if (!state.ytPlayer?.loadVideoById) return setTimeout(tryPlay, 300);
    state.ytPlayer.loadVideoById({ videoId, startSeconds: Math.max(0, seconds|0) });
    state.ytPlayer.setVolume(state.musicVolume);
    setTimeout(()=>{ try { state.ytPlayer.playVideo(); } catch(e){} }, 200);
  };
  tryPlay();
}
function pauseMusic(){ try{ state.ytPlayer?.pauseVideo(); }catch(e){} }
function stopMusic(){ try{ state.ytPlayer?.stopVideo(); }catch(e){} $('#currentTrack').textContent='Belum ada lagu'; state.activeVideoId=''; }

function showApp() {
  $('#boot').classList.add('hidden');
  $('#app').classList.remove('hidden');
  if (!state.me) {
    showPage('auth');
    $('#rail').classList.add('hidden');
  } else {
    $('#rail').classList.remove('hidden');
    showPage(state.page === 'auth' ? 'home' : state.page);
  }
}
function showPage(page) {
  if (!state.me && page !== 'auth') page = 'auth';
  document.body.classList.toggle('in-community', page === 'community');
  state.page = page;
  $$('.page').forEach(p => p.classList.add('hidden'));
  const el = $(`#${page}Page`);
  if (el) el.classList.remove('hidden');
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  $('#topTitle').textContent = page === 'auth' ? 'Login' : page[0].toUpperCase()+page.slice(1);
  $('#topSubtitle').textContent = page === 'community' ? (state.currentCommunity?.name || 'Server') : 'PartyVerse';
  $('#rail').classList.remove('open');
  if (page === 'servers') loadServers();
  if (page === 'friends') renderFriends();
  if (page === 'profile') renderProfile();
  if (page === 'shop') loadShop();
  if (page === 'inventory') renderInventory();
  if (page === 'leaderboard') loadLeaderboard();
}

function renderMiniProfile() {
  if (!state.me) return;
  $('#miniProfile').innerHTML = `<div class="me-row">${avatar(state.me,'avatar')}<div><b>${state.me.username}</b><span>${mePoints()} pts</span>${state.me.equipped?.badge ? `<div class="badge">${state.me.equipped.badge.replace('badge_','')}</div>`:''}</div></div>`;
}
function renderProfile() {
  if (!state.me) return;
  $('#profileBig').innerHTML = `${avatar(state.me,'avatar big')}<h1>${state.me.username}</h1><p class="hint">${state.me.bio || 'Belum ada bio.'}</p><div class="grid cards3"><div class="stat-card"><b>${mePoints()}</b><span>Poin</span></div><div class="stat-card"><b>${state.me.stats?.messages||0}</b><span>Pesan</span></div><div class="stat-card"><b>${state.me.stats?.callsJoined||0}</b><span>Voice Join</span></div></div>`;
  $('#bioInput').value = state.me.bio || '';
}

socket.on('connect', () => { setOnline(true); if (state.token) socket.emit('auth:restore', { token: state.token }, (r)=>{ if(r?.ok){ state.me=r.me; renderAll(); } }); });
socket.on('disconnect', () => setOnline(false));
socket.on('me', (me) => { state.me = me; renderAll(); });
socket.on('notify', (n) => toast(n.text || 'Notifikasi'));
socket.on('invite:community', (inv) => { toast(`${inv.from} mengundang kamu ke ${inv.community.name}`); loadServers(); });
socket.on('community:update', (c) => {
  if (state.currentCommunity?.id === c.id) {
    state.currentCommunity = c;
    state.roomMusic = c.music || state.roomMusic;
    state.voiceLive = c.voiceLive || state.voiceLive;
    ensureDefaultVoiceChannel();
    renderCommunity();
    renderMusicState();
    renderLiveScreenNotice();
    if (state.musicMode === 'host') handleHostMusic(state.roomMusic);
  }
  loadServers();
});
socket.on('community:voice-live', (live) => {
  state.voiceLive = live || null;
  renderLiveScreenNotice();
});
socket.on('message:new', ({channelId,msg}) => { state.messages[channelId] = state.messages[channelId] || []; state.messages[channelId].push(msg); if (state.currentChannel === channelId) renderMessages(); });
socket.on('music:room-state', (m) => { state.roomMusic = m; renderMusicState(); if (state.musicMode === 'host') handleHostMusic(m); });

function renderAll() { renderMiniProfile(); renderProfile(); if (state.currentCommunity) renderCommunity(); showApp(); simplifyActionLabels(); }
function simplifyActionLabels(){
  const map = { quickJoinVoiceBtn:'Voice', watchYoutubeBtn:'YouTube', quickShareScreenBtn:'Share', joinVoiceBtn:'Voice', shareScreenBtn:'Share', muteVoiceBtn: state.voiceMuted ? 'Unmute' : 'Mute', leaveVoiceBtn:'Leave' };
  for(const [id,label] of Object.entries(map)){ const el = document.getElementById(id); if(el) el.textContent = label; }
}
setTimeout(showApp, 700);

$$('[data-page]').forEach(b => b.addEventListener('click', () => showPage(b.dataset.page)));
$('#mobileMenu').onclick = () => $('#rail').classList.toggle('open');
$('#logoutBtn').onclick = () => { localStorage.removeItem('ryuu_connect_token'); location.reload(); };
$('.tabs').addEventListener('click', e => {
  const m = e.target.dataset.auth;
  if (!m) return;
  state.authMode = m;
  $$('.tabs [data-auth]').forEach(b=>b.classList.toggle('active', b.dataset.auth===m));
  $('#authSubmit').textContent = m === 'login' ? 'Masuk' : 'Daftar';
});
$('#authSubmit').onclick = () => {
  const username = $('#authUsername').value;
  const pin = $('#authPin').value;
  socket.emit(`auth:${state.authMode}`, { username, pin }, (r)=>{
    if(!r?.ok) return toast(r?.error || 'Gagal auth', 'bad');
    state.token = r.token; localStorage.setItem('ryuu_connect_token', r.token); state.me = r.me; toast('Berhasil masuk'); showPage('home'); renderAll(); loadServers();
  });
};

$('#quickCreateServer').onclick = () => showPage('servers');
$('#refreshServers').onclick = loadServers;
function loadServers() {
  socket.emit('community:list', {}, (r)=>{
    if(!r?.ok) return;
    state.communities = r.joined || [];
    state.publicCommunities = r.public || [];
    renderServers();
  });
}
function renderServers() {
  $('#serverList').innerHTML = state.communities.map(c => `<div class="item"><div class="avatar small">${c.name[0]}</div><div class="item-main"><b>${c.name}</b><span>${c.members.length} member • code ${c.code}</span></div><button class="primary sm" data-open-server="${c.id}">Open</button></div>`).join('') || '<p class="hint">Belum join server.</p>';
  $$('[data-open-server]').forEach(b => b.onclick = () => openCommunity(b.dataset.openServer));
}
$('#createServerBtn').onclick = () => socket.emit('community:create', { name: $('#serverName').value }, (r)=>{ if(!r?.ok) return toast(r.error,'bad'); toast('Server dibuat'); openCommunity(r.community.id); });
$('#joinServerBtn').onclick = () => socket.emit('community:join', { code: $('#joinCode').value }, (r)=>{ if(!r?.ok) return toast(r.error,'bad'); toast('Join server berhasil'); openCommunity(r.community.id); });

function openCommunity(id) {
  socket.emit('community:open', { communityId: id }, (r)=>{
    if(!r?.ok) return toast(r.error || 'Gagal buka server', 'bad');
    state.currentCommunity = r.community; state.messages = r.messages || {}; state.roomMusic = r.music || null; state.voiceLive = r.voiceLive || r.community.voiceLive || null;
    const firstText = r.community.channels.find(ch=>ch.type==='text');
    state.currentChannel = firstText?.id || null;
    ensureDefaultVoiceChannel();
    socket.emit('community:join', { id });
    showPage('community'); renderCommunity(); renderMusicState(); renderLiveScreenNotice(); if(state.musicMode==='host') handleHostMusic(state.roomMusic);
  });
}

function isCommunityOwner(){
  return !!(state.currentCommunity && state.me && (state.currentCommunity.owner === state.me.username || state.me.owner));
}
function openModal({ title, desc, fields, submitText, onSubmit }){
  const bg = $('#modalBackdrop');
  $('#modalTitle').textContent = title;
  $('#modalDesc').textContent = desc || '';
  $('#modalFields').innerHTML = fields;
  $('#modalSubmitBtn').textContent = submitText || 'Simpan';
  $('#modalSubmitBtn').onclick = onSubmit;
  bg.classList.remove('hidden');
  const first = $('#modalFields input, #modalFields select');
  setTimeout(()=>first?.focus?.(),50);
}
function closeModal(){ $('#modalBackdrop')?.classList.add('hidden'); }
$('#modalCloseBtn') && ($('#modalCloseBtn').onclick = closeModal);
$('#modalBackdrop') && ($('#modalBackdrop').onclick = (e)=>{ if(e.target.id==='modalBackdrop') closeModal(); });
function categoryOptions(type=''){
  const cats = state.currentCommunity?.categories || [];
  return cats.filter(c => !type || c.type === type).map(c=>`<option value="${c.id}">${escapeHtml(c.name)} • ${c.type}</option>`).join('');
}
function openCreateCategory(defaultType='text'){
  if(!isCommunityOwner()) return toast('Hanya owner server yang bisa membuat kategori','bad');
  openModal({
    title: 'Buat Kategori',
    desc: 'Pisahkan ruang chat dan voice agar server lebih rapi.',
    fields: `<label>Nama kategori</label><input id="modalCategoryName" placeholder="Contoh: Lobby, Gaming, Music" /><label>Tipe</label><select id="modalCategoryType"><option value="text" ${defaultType==='text'?'selected':''}>Text / Chat</option><option value="voice" ${defaultType==='voice'?'selected':''}>Voice / Stage</option></select>`,
    submitText: 'Buat Kategori',
    onSubmit: ()=>{
      socket.emit('community:category-create',{communityId: state.currentCommunity.id, name: $('#modalCategoryName').value, type: $('#modalCategoryType').value},(r)=>{
        if(!r?.ok) return toast(r.error,'bad');
        state.currentCommunity = r.community;
        closeModal(); renderCommunity(); toast('Kategori dibuat');
      });
    }
  });
}
function openCreateChannel(categoryId=''){
  if(!isCommunityOwner()) return toast('Hanya owner server yang bisa membuat ruang','bad');
  const cat = (state.currentCommunity?.categories||[]).find(c=>c.id===categoryId);
  const options = (state.currentCommunity?.categories||[]).map(c=>`<option value="${c.id}" ${c.id===categoryId?'selected':''}>${escapeHtml(c.name)} • ${c.type}</option>`).join('');
  openModal({
    title: 'Buat Ruang Baru',
    desc: 'Ruang text untuk chat. Ruang voice untuk ngobrol, musik, nonton YouTube, dan share screen.',
    fields: `<label>Nama ruang</label><input id="modalChannelName" placeholder="contoh: ngobrol, musik, mabar" /><label>Kategori</label><select id="modalChannelCategory">${options}</select>`,
    submitText: 'Buat Ruang',
    onSubmit: ()=>{
      socket.emit('community:channel-create',{communityId: state.currentCommunity.id, name: $('#modalChannelName').value, categoryId: $('#modalChannelCategory').value, type: cat?.type || 'text'},(r)=>{
        if(!r?.ok) return toast(r.error,'bad');
        state.currentCommunity = r.community;
        if(r.channel.type==='text') state.currentChannel = r.channel.id;
        if(r.channel.type==='voice') state.voiceChannel = r.channel.id;
        closeModal(); renderCommunity(); renderMessages(); toast('Ruang dibuat');
      });
    }
  });
}

function ensureDefaultVoiceChannel(){
  if(!state.currentCommunity) return;
  if(!state.voiceChannel || !state.currentCommunity.channels.some(ch=>ch.id===state.voiceChannel && ch.type==='voice')){
    const vc = state.currentCommunity.channels.find(ch=>ch.type==='voice');
    if(vc) state.voiceChannel = vc.id;
  }
}
function renderLiveScreenNotice(){
  const notice = $('#activeScreenNotice');
  if(!notice) return;
  const liveChannels = state.voiceLive?.channels || state.currentCommunity?.voiceLive?.channels || [];
  const screenPeople = liveChannels.flatMap(ch => (ch.screenShares||[]).map(p => ({...p, channelId: ch.channelId, channelName: ch.channelName})));
  if(!screenPeople.length){ notice.classList.add('hidden'); return; }
  if(!state.voiceChannel) state.voiceChannel = screenPeople[0].channelId;
  $('#liveScreenNames').textContent = screenPeople.map(p=>`${p.username} (${p.channelName || 'voice'})`).join(', ');
  $('#watchScreenBtn').onclick = () => { state.voiceChannel = screenPeople[0].channelId; joinVoice(); };
  notice.classList.remove('hidden');
}
function renderCommunity() {
  const c = state.currentCommunity; if(!c) return;
  ensureDefaultVoiceChannel();
  $('#communityName').textContent = c.name; $('#communityCode').textContent = c.code;
  const cats = (c.categories && c.categories.length ? c.categories : [
    { id:'default_text', name:'Text Channels', type:'text' },
    { id:'default_voice', name:'Voice Channels', type:'voice' }
  ]);
  const canManage = isCommunityOwner();
  $('#categoryList').innerHTML = cats.map(cat=>{
    const channels = c.channels.filter(ch => (ch.categoryId || (ch.type==='voice'?'default_voice':'default_text')) === cat.id || (!ch.categoryId && ch.type === cat.type));
    const channelHtml = channels.map(ch=>{
      const active = ch.type === 'text' ? state.currentChannel === ch.id : state.voiceChannel === ch.id;
      const isVoice = ch.type === 'voice';
      const live = (state.voiceLive?.channels||[]).find(v=>v.channelId===ch.id);
      const liveText = live?.screenShares?.length ? 'Live' : (live?.participants?.length ? `${live.participants.length}` : '');
      return `<button class="channel ${active?'active':''} ${isVoice?'voice-channel':''}" data-${isVoice?'voice':'channel'}="${ch.id}"><span class="chan-icon">${isVoice?'◖':'#'}</span><span class="chan-name">${escapeHtml(ch.name)}</span>${liveText?`<span class="live-dot">${liveText}</span>`:'<span>›</span>'}</button>`;
    }).join('') || `<p class="hint tiny">Belum ada ruang ${cat.type === 'voice' ? 'voice' : 'chat'}.</p>`;
    return `<div class="category-group"><div class="category-head"><span>${escapeHtml(cat.name)}</span>${canManage?`<button class="cat-plus" data-new-channel="${cat.id}">＋</button>`:''}</div>${channelHtml}</div>`;
  }).join('');
  $('#openCreateCategoryBtn').style.display = canManage ? '' : 'none';
  $('#openCreateChannelBtn').style.display = canManage ? '' : 'none';
  $$('[data-channel]').forEach(b=>b.onclick=()=>{state.currentChannel=b.dataset.channel; $('.server-sidebar')?.classList.remove('mobile-open'); renderCommunity(); renderMessages();});
  $$('[data-voice]').forEach(b=>b.onclick=()=>{state.voiceChannel=b.dataset.voice; $('.server-sidebar')?.classList.remove('mobile-open'); joinVoice(); renderCommunity();});
  $$('[data-new-channel]').forEach(b=>b.onclick=(e)=>{e.stopPropagation(); openCreateChannel(b.dataset.newChannel);});
  renderMobileChannelStrip();
  renderLiveScreenNotice();
  const ch = c.channels.find(x=>x.id===state.currentChannel) || c.channels.find(x=>x.type==='text');
  const vch = c.channels.find(x=>x.id===state.voiceChannel);
  if(ch && !state.currentChannel) state.currentChannel = ch.id;
  $('#channelTitle').textContent = ch ? `# ${ch.name}` : (vch ? `◖ ${vch.name}` : '# general');
  $('#channelType').textContent = ch ? 'Text Channel' : 'Voice Stage';
  $('#voiceStagePanel').classList.toggle('hidden', !state.voiceChannel);
  $('#memberList').innerHTML = c.members.map(u=>`<div class="item"><div class="avatar small">${u[0].toUpperCase()}</div><div class="item-main"><b>${escapeHtml(u)}</b><span>${u===c.owner?'Owner':'Member'}</span></div></div>`).join('');
  renderMessages();
}

function renderMobileChannelStrip(){
  const strip = $('#mobileChannelStrip');
  const c = state.currentCommunity;
  if(!strip || !c) return;
  const textChannels = c.channels.filter(ch=>ch.type==='text');
  const voiceChannels = c.channels.filter(ch=>ch.type==='voice');
  const chips = [];
  for(const ch of textChannels){
    chips.push(`<button class="mobile-chip ${state.currentChannel===ch.id?'active':''}" data-mobile-channel="${ch.id}"># ${escapeHtml(ch.name)}</button>`);
  }
  for(const ch of voiceChannels){
    const live = (state.voiceLive?.channels||[]).find(v=>v.channelId===ch.id);
    const suffix = live?.screenShares?.length ? ' • Live' : (live?.participants?.length ? ` • ${live.participants.length}` : '');
    chips.push(`<button class="mobile-chip ${state.voiceChannel===ch.id?'active':''}" data-mobile-voice="${ch.id}">◖ ${escapeHtml(ch.name)}${suffix}</button>`);
  }
  strip.innerHTML = chips.join('');
  $$('[data-mobile-channel]').forEach(b=>b.onclick=()=>{ state.currentChannel=b.dataset.mobileChannel; renderCommunity(); renderMessages(); });
  $$('[data-mobile-voice]').forEach(b=>b.onclick=()=>{ state.voiceChannel=b.dataset.mobileVoice; joinVoice(); renderCommunity(); });
}

function renderMessages() {
  const box = $('#chatMessages'); const list = state.messages[state.currentChannel] || [];
  box.innerHTML = list.map(m=>`<div class="msg"><div class="avatar small">${m.user[0].toUpperCase()}</div><div><b>${m.user}</b> <span class="time">${fmtTime(m.createdAt)}</span><div>${m.text}</div></div></div>`).join('') || '<p class="hint">Belum ada pesan.</p>';
  box.scrollTop = box.scrollHeight;
}
$('#chatForm').onsubmit = (e) => { e.preventDefault(); const text=$('#chatInput').value; if(!text.trim()) return; socket.emit('message:send',{channelId:state.currentChannel,text},(r)=>{ if(!r?.ok) toast(r.error,'bad'); else $('#chatInput').value=''; }); };
$('#copyCodeBtn').onclick = () => { navigator.clipboard?.writeText(state.currentCommunity?.code || ''); toast('Code disalin'); };
$('#leaveCommunityView').onclick = () => showPage('servers');
$('#openCreateCategoryBtn').onclick = () => openCreateCategory('text');
$('#openCreateChannelBtn').onclick = () => openCreateChannel();
$('#quickJoinVoiceBtn').onclick = joinVoice;
$('#quickShareScreenBtn').onclick = startScreenShare;
$('#mobileChannelsToggle').onclick = () => $('.server-sidebar')?.classList.toggle('mobile-open');
$('#watchYoutubeBtn').onclick = openWatchDock;
$('#stageMusicBtn').onclick = () => $('#musicWidget').classList.add('open');
$('#watchYoutubeStageBtn').onclick = openWatchDock;
$('#stageScreenBtn').onclick = startScreenShare;

// Friends
$('#friendSearchBtn').onclick = () => socket.emit('friends:search',{query:$('#friendQuery').value},(r)=>{ $('#friendSearchResult').innerHTML=(r.result||[]).map(u=>`<div class="item">${avatar(u,'avatar small')}<div class="item-main"><b>${u.username}</b><span>Player</span></div><button class="primary sm" data-addfriend="${u.username}">Add</button></div>`).join('')||'<p class="hint">Tidak ada hasil.</p>'; $$('[data-addfriend]').forEach(b=>b.onclick=()=>socket.emit('friends:add',{username:b.dataset.addfriend},(x)=>{toast(x.ok?'Request dikirim':x.error,x.ok?'good':'bad')})); });
function renderFriends(){ if(!state.me) return; $('#friendList').innerHTML=(state.me.friends||[]).map(f=>`<div class="item"><div class="avatar small">${f[0].toUpperCase()}</div><div class="item-main"><b>${f}</b><span>Friend</span></div>${state.currentCommunity?`<button class="ghost sm" data-invite="${f}">Invite</button>`:''}</div>`).join('')||'<p class="hint">Belum ada teman.</p>'; $('#friendRequests').innerHTML=(state.me.friendRequests||[]).map(f=>`<div class="item"><div class="item-main"><b>${f}</b><span>Request</span></div><button class="primary sm" data-accept="${f}">Accept</button></div>`).join('')||'<p class="hint">Tidak ada request.</p>'; $$('[data-accept]').forEach(b=>b.onclick=()=>socket.emit('friends:accept',{username:b.dataset.accept},(r)=>toast(r.ok?'Diterima':r.error,r.ok?'good':'bad'))); $$('[data-invite]').forEach(b=>b.onclick=()=>socket.emit('friends:invite',{username:b.dataset.invite,communityId:state.currentCommunity.id},(r)=>toast(r.ok?'Invite dikirim':r.error,r.ok?'good':'bad'))); }

// Shop/inventory/crate
let shopItems=[];
function loadShop(){ socket.emit('shop:list',{},(r)=>{ shopItems=r.items||[]; $('#shopGrid').innerHTML=shopItems.map(item=>`<div class="shop-card"><span class="rarity ${item.rarity}">${item.rarity}</span><h3>${item.name}</h3><p class="hint">${item.type}</p><b>${item.price} pts</b><button class="primary full" data-buy="${item.id}">Beli</button></div>`).join(''); $$('[data-buy]').forEach(b=>b.onclick=()=>socket.emit('shop:buy',{itemId:b.dataset.buy},(x)=>{ if(!x.ok)return toast(x.error,'bad'); toast(`${x.item.name} masuk inventory`); })); }); }
function renderInventory(){ const inv=state.me?.inventory||{}; const ids=Object.keys(inv); $('#inventoryGrid').innerHTML=ids.map(itemId=>{const item=shopItems.find(x=>x.id===itemId)||{id:itemId,name:itemId,type:'item',rarity:'common'}; return `<div class="shop-card"><span class="rarity ${item.rarity}">${item.rarity||'item'}</span><h3>${item.name}</h3><p class="hint">Stok: ${inv[itemId]}</p>${['frame','badge','theme'].includes(item.type)?`<button class="primary full" data-equip="${itemId}">Equip</button>`:''}${item.type==='crate'?`<button class="ghost full" data-opencrate="${itemId}">Open Crate</button>`:''}</div>`}).join('')||'<p class="hint">Inventory kosong.</p>'; $$('[data-equip]').forEach(b=>b.onclick=()=>socket.emit('inventory:equip',{itemId:b.dataset.equip},(r)=>toast(r.ok?'Item dipakai':r.error,r.ok?'good':'bad'))); $$('[data-opencrate]').forEach(b=>b.onclick=()=>openCrate(b.dataset.opencrate)); }
function openCrate(crateId){ showPage('crates'); const box=$('.case-box'); box.classList.remove('spin'); void box.offsetWidth; box.classList.add('spin'); $('#crateReward').textContent='Membuka crate...'; socket.emit('crate:open',{crateId},(r)=>{ setTimeout(()=>{ if(!r.ok){$('#crateReward').textContent=r.error; return toast(r.error,'bad')} $('#crateReward').innerHTML=`Dapat: <span class="rarity ${r.reward.rarity}">${r.reward.name}</span>`; toast(`${r.reward.name} masuk inventory`); },1700); }); }
function loadLeaderboard(){ socket.emit('leaderboard:get',{},(r)=>{ $('#leaderboardList').innerHTML=(r.rows||[]).map((u,i)=>`<div class="item">${avatar(u,'avatar small')}<div class="item-main"><b>#${i+1} ${u.username}</b><span>${u.points.toLocaleString('id-ID')} pts • ${u.stats.messages||0} pesan</span></div></div>`).join(''); }); }
$('#avatarInput').onchange = (e)=>{ const f=e.target.files?.[0]; if(!f)return; const rd=new FileReader(); rd.onload=()=>{ state._avatarData=rd.result; toast('Foto siap disimpan'); }; rd.readAsDataURL(f); };
$('#saveProfileBtn').onclick = ()=>socket.emit('profile:update',{avatar:state._avatarData,bio:$('#bioInput').value},(r)=>toast(r.ok?'Profil disimpan':r.error,r.ok?'good':'bad'));

// Music UI
$('#musicFab').onclick = () => $('#musicWidget').classList.add('open');
$('#musicClose').onclick = () => $('#musicWidget').classList.remove('open');
$('#volumeSlider').oninput = (e)=>setVolume(e.target.value);
setVolume(state.musicVolume);
function setMusicMode(mode){ state.musicMode=mode; localStorage.setItem('ryuu_music_mode',mode); $('#listenHostBtn').classList.toggle('active',mode==='host'); $('#selfStreamBtn').classList.toggle('active',mode==='self'); if(mode==='host') handleHostMusic(state.roomMusic); }
$('#listenHostBtn').onclick=()=>setMusicMode('host'); $('#selfStreamBtn').onclick=()=>setMusicMode('self');
$('#musicSearchBtn').onclick = () => { const query=$('#musicSearch').value; socket.emit('music:search',{query},(r)=>{ if(!r.ok)return toast(r.error,'bad'); renderMusicResults(r.videos||[]); }); };
function renderMusicResults(videos){ $('#musicResults').innerHTML=videos.map(v=>`<div class="music-item"><img src="${v.thumbnail||''}" onerror="this.style.display='none'"><div class="item-main"><b>${v.title}</b><span>${v.author} • ${v.duration}</span></div><button class="ghost sm" data-play-self="${v.videoId}" data-title="${escapeHtml(v.title)}">Play</button>${state.currentCommunity?`<button class="primary sm" data-play-room="${v.videoId}" data-title="${escapeHtml(v.title)}">Room</button>`:''}</div>`).join(''); $$('[data-play-self]').forEach(b=>b.onclick=()=>{setMusicMode('self'); playVideo(b.dataset.playSelf,b.dataset.title,0);}); $$('[data-play-room]').forEach(b=>b.onclick=()=>{ if(!state.currentCommunity)return; socket.emit('music:room-play',{communityId:state.currentCommunity.id,videoId:b.dataset.playRoom,title:b.dataset.title},(r)=>{ if(!r.ok)return toast(r.error,'bad'); setMusicMode('host'); toast('Musik room diputar'); }); }); }
function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function renderMusicState(){ $('#musicHint').textContent = state.currentCommunity ? (state.musicMode==='host'?'Mode: dengar host / voice stage. Volume tetap milik kamu sendiri.':'Mode: streaming sendiri, tidak ikut musik host.') : 'Belum masuk server: semua user bebas play sendiri.'; if(state.roomMusic) $('#currentTrack').textContent = state.roomMusic.title || 'Room music'; }
function handleHostMusic(m){ renderMusicState(); if(!m){ stopMusic(); return;} if(state.musicMode!=='host') return; const watchOpen = !$('#watchDock')?.classList.contains('hidden') && state.watchModeHost; if(watchOpen && state.activeWatchId !== m.videoId){ setWatchFrame(m.videoId,m.title,m.position||0,true); } if(m.paused){ if(state.activeVideoId!==m.videoId) playVideo(m.videoId,m.title,m.position||0); setTimeout(pauseMusic,300); } else { const currentTime = state.ytPlayer?.getCurrentTime ? state.ytPlayer.getCurrentTime() : 0; const drift = Math.abs((currentTime||0) - (m.position||0)); if(state.activeVideoId !== m.videoId || drift > 4) playVideo(m.videoId,m.title,m.position||0); }}
$('#roomPauseBtn').onclick=()=> state.currentCommunity && socket.emit('music:room-pause',{communityId:state.currentCommunity.id},(r)=>toast(r.ok?'Room paused':r.error,r.ok?'good':'bad'));
$('#roomStopBtn').onclick=()=> state.currentCommunity && socket.emit('music:room-stop',{communityId:state.currentCommunity.id},(r)=>toast(r.ok?'Room stopped':r.error,r.ok?'good':'bad'));


// YouTube watch party / video stage
function openWatchDock(){
  $('#watchDock')?.classList.remove('hidden');
  $('#screenDock')?.classList.add('hidden');
  if(state.roomMusic && state.musicMode === 'host' && state.roomMusic.videoId){
    setWatchFrame(state.roomMusic.videoId, state.roomMusic.title || 'Room video', state.roomMusic.position || 0, true);
  }
}
$('#closeWatchDock').onclick = ()=> $('#watchDock').classList.add('hidden');
$('#watchSearchBtn').onclick = () => {
  const query = $('#watchSearch').value || $('#musicSearch').value;
  socket.emit('music:search',{query},(r)=>{
    if(!r?.ok) return toast(r?.error || 'Gagal cari video','bad');
    renderWatchResults(r.videos || []);
  });
};
function renderWatchResults(videos){
  $('#watchResults').innerHTML = videos.map(v=>`<div class="watch-item"><img src="${v.thumbnail||''}" onerror="this.style.display='none'"><div><b>${escapeHtml(v.title)}</b><span>${escapeHtml(v.author)} • ${escapeHtml(v.duration)}</span></div><button class="ghost sm" data-watch-self="${v.videoId}" data-title="${escapeHtml(v.title)}">Play</button>${state.currentCommunity?`<button class="primary sm" data-watch-room="${v.videoId}" data-title="${escapeHtml(v.title)}">Room</button>`:''}</div>`).join('') || '<p class="hint">Tidak ada hasil.</p>';
  $$('[data-watch-self]').forEach(b=>b.onclick=()=>{ state.watchModeHost=false; setMusicMode('self'); setWatchFrame(b.dataset.watchSelf,b.dataset.title,0,false); });
  $$('[data-watch-room]').forEach(b=>b.onclick=()=>{
    if(!state.currentCommunity) return;
    socket.emit('music:room-play',{communityId:state.currentCommunity.id,videoId:b.dataset.watchRoom,title:b.dataset.title},(r)=>{
      if(!r?.ok) return toast(r?.error || 'Gagal play ke room','bad');
      setMusicMode('host'); state.watchModeHost=true; setWatchFrame(b.dataset.watchRoom,b.dataset.title,0,true); toast('Video room diputar');
    });
  });
}
function setWatchFrame(videoId,title='',seconds=0,host=false){
  state.activeWatchId = videoId;
  state.watchModeHost = !!host;
  $('#watchDock').classList.remove('hidden');
  $('#watchTitle').textContent = title || (host ? 'Room video' : 'YouTube video');
  const start = Math.max(0, Number(seconds)||0);
  const src = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&playsinline=1&rel=0&modestbranding=1&start=${Math.floor(start)}`;
  $('#watchFrame').innerHTML = `<iframe allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen src="${src}"></iframe>`;
}

// Voice + screen share
const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] };
$('#joinVoiceBtn').onclick = joinVoice;
$('#leaveVoiceBtn').onclick = leaveVoice;
$('#muteVoiceBtn').onclick = toggleMute;
$('#shareScreenBtn').onclick = startScreenShare;
$('#watchScreenBtn').onclick = () => joinVoice();
async function getMic(){
  if(state.localStream) return state.localStream;
  state.localStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false
  });
  state.localStream.getAudioTracks().forEach(t => t.enabled = !state.voiceMuted);
  updateMuteUI();
  return state.localStream;
}
async function joinVoice(){
  ensureDefaultVoiceChannel();
  if(!state.voiceChannel) { toast('Tidak ada voice channel','bad'); return { ok:false }; }
  try{
    await getMic();
    return await new Promise((resolve)=>{
      socket.emit('voice:join',{channelId:state.voiceChannel, muted: state.voiceMuted},(r)=>{
        if(!r?.ok){ toast(r.error || 'Gagal join voice','bad'); return resolve({ ok:false }); }
        state.inVoice = true;
        toast('Join voice');
        updateMuteUI();
        renderCommunity();
        resolve({ ok:true });
      });
    });
  }catch(e){ toast('Microphone ditolak/browser butuh HTTPS','bad'); return { ok:false }; }
}
function leaveVoice(){
  socket.emit('voice:leave');
  state.inVoice = false;
  for(const pc of state.peers.values()) pc.close();
  state.peers.clear();
  state.localStream?.getTracks().forEach(t=>t.stop()); state.localStream=null;
  state.screenStream?.getTracks().forEach(t=>t.stop()); state.screenStream=null;
  document.querySelectorAll('audio[id^="audio_"]').forEach(el=>el.remove());
  document.querySelectorAll('video[id^="screen_"]').forEach(el=>el.remove());
  $('#screenDock').classList.add('hidden');
  $('#voiceState').innerHTML='<p>Keluar dari voice.</p>';
  updateMuteUI();
  renderCommunity();
}
function updateMuteUI(){
  const btn = $('#muteVoiceBtn');
  if(!btn) return;
  btn.textContent = state.voiceMuted ? 'Unmute' : 'Mute';
  btn.classList.toggle('danger', state.voiceMuted);
  const quick = document.getElementById('muteVoiceBtn');
}

function toggleMute(){
  state.voiceMuted = !state.voiceMuted;
  state.localStream?.getAudioTracks().forEach(t => t.enabled = !state.voiceMuted);
  socket.emit('voice:mute', { muted: state.voiceMuted });
  updateMuteUI();
  toast(state.voiceMuted ? 'Mic dimute' : 'Mic aktif');
}
function createPeer(socketId, initiator){
  const pc = new RTCPeerConnection(rtcConfig);
  state.peers.set(socketId, pc);
  state.localStream?.getTracks().forEach(t=>pc.addTrack(t,state.localStream));
  state.screenStream?.getTracks().forEach(t=>pc.addTrack(t,state.screenStream));
  pc.onicecandidate = e=>{ if(e.candidate) socket.emit('voice:signal',{to:socketId,signal:{candidate:e.candidate}}); };
  pc.ontrack = e=>{ const [stream]=e.streams; if(e.track.kind==='audio') attachAudio(socketId, stream); if(e.track.kind==='video') attachScreen(socketId, stream); };
  pc.onnegotiationneeded = async()=>{
    try{
      if(!initiator || pc.signalingState !== 'stable') return;
      const offer=await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('voice:signal',{to:socketId,signal:{sdp:pc.localDescription}});
    }catch(e){}
  };
  return pc;
}
function attachAudio(id, stream){
  const audioId = `audio_${id}_${stream.id}`.replace(/[^a-zA-Z0-9_-]/g,'_');
  let a=document.getElementById(audioId);
  if(!a){ a=document.createElement('audio'); a.id=audioId; a.autoplay=true; a.playsInline=true; document.body.appendChild(a); }
  a.srcObject=stream;
  a.play?.().catch(()=>{});
}
function attachScreen(id, stream){
  const dock = $('#screenDock');
  dock.classList.remove('hidden');
  dock.classList.add('active-screen');
  document.body.classList.add('screen-live-mode');
  let v=document.getElementById('screen_'+id);
  if(!v){
    v=document.createElement('video');
    v.id='screen_'+id;
    v.autoplay=true;
    v.playsInline=true;
    v.controls=true;
    v.className='screen-video';
    $('#remoteScreens').appendChild(v);
  }
  v.srcObject=stream;
  v.play?.().catch(()=>{});
  setTimeout(()=>dock.scrollIntoView({behavior:'smooth', block:'start'}), 120);
}
socket.on('voice:existing-peers', async ({peers})=>{
  await getMic().catch(()=>null);
  if((peers||[]).some(p=>p.screen)) { $('#screenDock').classList.remove('hidden'); }
  peers.forEach(p=>{ if(!state.peers.has(p.socketId)) createPeer(p.socketId,true); });
});
socket.on('voice:peer-joined', async ({socketId})=>{ await getMic().catch(()=>null); if(!state.peers.has(socketId)) createPeer(socketId,false); });
socket.on('voice:signal', async ({from, signal})=>{ let pc=state.peers.get(from); if(!pc) pc=createPeer(from,false); if(signal.sdp){ await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp)); if(signal.sdp.type==='offer'){ const ans=await pc.createAnswer(); await pc.setLocalDescription(ans); socket.emit('voice:signal',{to:from,signal:{sdp:pc.localDescription}}); } } else if(signal.candidate){ try{ await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)); }catch(e){} } });
socket.on('voice:peer-left', ({socketId})=>{ state.peers.get(socketId)?.close(); state.peers.delete(socketId); document.querySelectorAll(`[id^="audio_${socketId}_"]`).forEach(el=>el.remove()); document.getElementById('screen_'+socketId)?.remove(); if(!$('#remoteScreens')?.children.length){ $('#screenDock').classList.add('hidden'); document.body.classList.remove('screen-live-mode'); } });
socket.on('voice:participants', ({participants})=>{
  state.inVoice = (participants||[]).some(p=>p.username===state.me?.username);
  $('#voiceState').innerHTML=(participants||[]).map(p=>`<div class="voice-person"><b>${p.username}${p.username===state.me?.username?' (Kamu)':''}</b>${p.muted?'<span class="tag muted-tag">Muted</span>':''}${p.screen?'<span class="tag">Share screen</span>':''}</div>`).join('')||'<p>Belum ada di voice.</p>';
  renderCommunity();
});
socket.on('screen:start', ({socketId, username})=>{
  $('#screenDock').classList.remove('hidden');
  toast(`${username || 'Seseorang'} mulai share screen`);
});
socket.on('screen:stop', ({socketId})=>{
  document.getElementById('screen_'+socketId)?.remove();
  if(!$('#remoteScreens')?.children.length){ $('#screenDock').classList.add('hidden'); document.body.classList.remove('screen-live-mode'); }
});
async function renegotiateAll(){
  for(const [to, pc] of state.peers.entries()){
    try{
      if(pc.signalingState !== 'stable') continue;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('voice:signal',{to,signal:{sdp:pc.localDescription}});
    }catch(e){}
  }
}
async function getMobileShareFallback(){
  // Fallback untuk HP/browser yang tidak membuka picker screen-share.
  // Ini bukan screen capture asli; ini mode kamera agar user HP tetap bisa menampilkan sesuatu ke voice room.
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: true
  });
  stream._partyverseFallback = 'camera';
  return stream;
}
async function captureScreenOrFallback(){
  const opts = {
    video: { frameRate: 30, displaySurface: 'browser' },
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false, systemAudio: 'include' }
  };
  if(navigator.mediaDevices?.getDisplayMedia){
    try { return await navigator.mediaDevices.getDisplayMedia(opts); } catch(err){ throw err; }
  }
  if(navigator.mediaDevices?.getUserMedia){
    toast('Share screen asli tidak tersedia di browser HP ini. Mode kamera HP aktif sebagai fallback.', 'bad');
    return await getMobileShareFallback();
  }
  throw new Error('media_not_supported');
}
async function startScreenShare(){
  try{
    if(!state.inVoice || !state.localStream){ const joined = await joinVoice(); if(!joined?.ok) return; }
    state.screenStream = await captureScreenOrFallback();
    const videoTrack = state.screenStream.getVideoTracks()[0];
    if(videoTrack) videoTrack.onended = stopScreenShare;
    attachScreen('local', state.screenStream);
    for(const pc of state.peers.values()){
      state.screenStream.getTracks().forEach(t=>pc.addTrack(t,state.screenStream));
    }
    await renegotiateAll();
    socket.emit('screen:start');
    toast(state.screenStream._partyverseFallback ? 'Mode share kamera HP aktif' : (state.screenStream.getAudioTracks().length ? 'Share screen + audio aktif' : 'Screen share aktif. Pilih tab/window dengan opsi audio untuk berbagi suara.'));
  }catch(e){ toast('Share gagal. Browser HP kadang memblokir screen share; coba Chrome Android HTTPS atau gunakan laptop.','bad'); }
}
function stopScreenShare(){
  if(!state.screenStream)return;
  state.screenStream.getTracks().forEach(t=>t.stop());
  state.screenStream=null;
  document.getElementById('screen_local')?.remove();
  if(!$('#remoteScreens')?.children.length){ $('#screenDock').classList.add('hidden'); document.body.classList.remove('screen-live-mode'); }
  socket.emit('screen:stop');
}
$('#closeScreenDock').onclick=()=>{ $('#screenDock').classList.add('hidden'); document.body.classList.remove('screen-live-mode'); };

// Initial restore
if(state.token){ socket.emit('auth:restore',{token:state.token},(r)=>{ if(r?.ok){ state.me=r.me; loadShop(); loadServers(); renderAll(); } else showApp(); }); } else showApp();
loadShop();
