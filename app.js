/* ============================================================
   Roblox Ultimate Profile Explorer — app.js
   ============================================================ */

"use strict";

// ─── GLOBALS ──────────────────────────────────────────────────
let currentUID = null;

// ─── DOM HELPERS ──────────────────────────────────────────────
const $ = id => document.getElementById(id);
const esc = str => String(str ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ─── LOADING ──────────────────────────────────────────────────
function showLoading(text = 'FETCHING DATA...') {
  $('loading').classList.remove('hidden');
  $('loading-text').textContent = text;
}
function hideLoading() {
  $('loading').classList.add('hidden');
}

// ─── TOAST ────────────────────────────────────────────────────
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('visible');
  setTimeout(() => t.classList.remove('visible'), 3200);
}

// ─── FORMAT NUMBER ────────────────────────────────────────────
function fmt(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

// ─── FORMAT DATE ──────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ─── FETCH HELPERS ────────────────────────────────────────────
async function GET(url) {
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function POST(url, body) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// ─── STATUS MAP ───────────────────────────────────────────────
const STATUS = {
  0: { cls: 'offline', label: 'OFFLINE' },
  1: { cls: 'online',  label: 'ONLINE'  },
  2: { cls: 'playing', label: 'IN GAME' },
  3: { cls: 'online',  label: 'IN STUDIO' }
};

// ─── KEYBOARD: search on Enter ────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  $('username-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchUser();
  });
  $('copy-uid-btn').addEventListener('click', copyUID);
});

// ─── COPY UID ─────────────────────────────────────────────────
function copyUID() {
  if (!currentUID) return;
  navigator.clipboard.writeText(String(currentUID)).catch(() => {});
  const btn = $('copy-uid-btn');
  btn.textContent = 'COPIED!';
  btn.classList.add('copied');
  setTimeout(() => { btn.textContent = 'COPY UID'; btn.classList.remove('copied'); }, 2000);
}

// ─── SEARCH ENTRY POINT ───────────────────────────────────────
async function searchUser() {
  const username = $('username-input').value.trim();
  if (!username) { toast('Enter a username first'); return; }

  showLoading('RESOLVING USERNAME → USER ID');
  $('profile-root').classList.add('hidden');

  // 1. Resolve username → userId (supports banned users with excludeBannedUsers:false)
  const res = await POST('https://users.roblox.com/v1/usernames/users', {
    usernames: [username],
    excludeBannedUsers: false   // ← banned accounts are included
  });

  if (!res?.data?.length) {
    toast('User not found — check spelling');
    hideLoading();
    return;
  }

  currentUID = res.data[0].id;
  await buildProfile(currentUID);
}

// ─── MAIN PROFILE BUILDER ─────────────────────────────────────
async function buildProfile(uid) {
  showLoading('LOADING ALL PROFILE DATA...');

  // ── Fetch everything in parallel ──────────────────────────
  const [
    profile,
    presenceRes,
    avatarThumb,
    headshotThumb,
    bustThumb,
    friendsData,
    followersCount,
    followingCount,
    groupsData,
    badgesData,
    accessoriesData,
    createdGamesData,
    favGamesData,
    inventoryData
  ] = await Promise.all([
    GET(`https://users.roblox.com/v1/users/${uid}`),
    POST('https://presence.roblox.com/v1/presence/users', { userIds: [uid] }),
    GET(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${uid}&size=420x420&format=Png`),
    GET(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${uid}&size=150x150&format=Png`),
    GET(`https://thumbnails.roblox.com/v1/users/avatar-bust?userIds=${uid}&size=150x150&format=Png`),
    GET(`https://friends.roblox.com/v1/users/${uid}/friends?userSort=Alphabetical`),
    GET(`https://friends.roblox.com/v1/users/${uid}/followers/count`),
    GET(`https://friends.roblox.com/v1/users/${uid}/followings/count`),
    GET(`https://groups.roblox.com/v1/users/${uid}/groups/roles`),
    GET(`https://badges.roblox.com/v1/users/${uid}/badges?limit=50&sortOrder=Desc`),
    GET(`https://avatar.roblox.com/v1/users/${uid}/currently-wearing`),
    GET(`https://games.roblox.com/v1/games/list?model.userId=${uid}&model.isPlayable=true&model.limit=25`),
    GET(`https://games.roblox.com/v2/users/${uid}/favorite/games?pageSize=25&sortOrder=Asc`),
    GET(`https://inventory.roblox.com/v1/users/${uid}/items/Asset/8?limit=50&sortOrder=Desc`)
  ]);

  // ── HERO: basic info ────────────────────────────────────────
  const displayName = profile?.displayName || profile?.name || '—';
  const username    = profile?.name || '—';
  const isBanned    = profile?.isBanned || false;

  $('display-name').textContent = displayName;
  $('at-username').textContent  = '@' + username;
  $('desc-box').textContent     = profile?.description || '';

  // Banned banner
  const banner = $('banned-banner');
  isBanned ? banner.classList.remove('hidden') : banner.classList.add('hidden');

  // Meta chips
  $('meta-chips').innerHTML = `
    <div class="chip">🆔 UID: <b>${uid}</b></div>
    <div class="chip">📅 Joined: <b>${fmtDate(profile?.created)}</b></div>
    ${isBanned ? '<div class="chip" style="border-color:var(--pink);color:var(--pink)">⛔ BANNED</div>' : ''}
  `;

  // ── Avatar thumbnails ───────────────────────────────────────
  const avatarUrl   = avatarThumb?.data?.[0]?.imageUrl   || '';
  const headshotUrl = headshotThumb?.data?.[0]?.imageUrl || '';
  const bustUrl     = bustThumb?.data?.[0]?.imageUrl     || '';

  const heroAvatar = $('hero-avatar');
  heroAvatar.src = avatarUrl || 'https://placehold.co/420x420/0f0f1e/444?text=?';
  heroAvatar.onerror = () => { heroAvatar.src = 'https://placehold.co/420x420/0f0f1e/444?text=?'; };

  // Mini busts
  let bustHTML = '';
  if (headshotUrl) bustHTML += `<div class="bust-wrap"><img class="bust-img" src="${headshotUrl}" width="58" height="58" alt="head"><span class="bust-lbl">HEAD</span></div>`;
  if (bustUrl)     bustHTML += `<div class="bust-wrap"><img class="bust-img" src="${bustUrl}" width="58" height="88" alt="bust"><span class="bust-lbl">BUST</span></div>`;
  $('bust-row').innerHTML = bustHTML;

  // ── Presence / Status ───────────────────────────────────────
  const presence = presenceRes?.userPresences?.[0];
  const pType    = presence?.userPresenceType ?? 0;
  const st       = STATUS[pType] || STATUS[0];

  $('status-dot').className   = 'status-dot ' + st.cls;
  $('status-label').className = 'status-label ' + st.cls;
  $('status-label').textContent = st.label;

  const playingEl = $('playing-game');
  if (pType === 2 && presence?.lastLocation) {
    playingEl.textContent = '🕹️ ' + presence.lastLocation;
    playingEl.classList.remove('hidden');
  } else {
    playingEl.classList.add('hidden');
  }

  // ── STATS ───────────────────────────────────────────────────
  const friends       = friendsData?.data || [];
  const groups        = groupsData?.data  || [];
  const badges        = badgesData?.data  || [];
  const createdGames  = createdGamesData?.data || [];
  const favGames      = favGamesData?.data     || [];
  const inventory     = inventoryData?.data    || [];
  const accessories   = accessoriesData?.assetIds || [];

  $('s-friends').textContent   = fmt(friends.length);
  $('s-followers').textContent = fmt(followersCount?.count ?? 0);
  $('s-following').textContent = fmt(followingCount?.count ?? 0);
  $('s-groups').textContent    = fmt(groups.length);
  $('s-badges').textContent    = fmt(badges.length);
  $('s-games').textContent     = fmt(createdGames.length);

  // ── RENDER SECTIONS ─────────────────────────────────────────
  await renderFriends(friends);
  renderGroups(groups);
  renderBadges(badges);
  await renderAccessories(accessories);
  await renderGames('list-games-c', 'c-games-c', createdGames);
  await renderGames('list-games-f', 'c-games-f', favGames);
  renderInventory(inventory);

  // ── Show profile ────────────────────────────────────────────
  hideLoading();
  $('profile-root').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── FRIENDS ─────────────────────────────────────────────────
async function renderFriends(friends) {
  $('c-friends').textContent = friends.length;
  if (!friends.length) return;

  const ids    = friends.slice(0, 50).map(f => f.id);
  const idsStr = ids.join(',');

  const [thumbsRes, presRes] = await Promise.all([
    GET(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${idsStr}&size=100x100&format=Png`),
    POST('https://presence.roblox.com/v1/presence/users', { userIds: ids })
  ]);

  const thumbMap = {};
  (thumbsRes?.data || []).forEach(t => { thumbMap[t.targetId] = t.imageUrl; });

  const presMap = {};
  (presRes?.userPresences || []).forEach(p => { presMap[p.userId] = p.userPresenceType ?? 0; });

  $('list-friends').innerHTML = friends.slice(0, 50).map(f => {
    const img   = thumbMap[f.id] || 'https://placehold.co/42x42/13132a/444?text=?';
    const pType = presMap[f.id] ?? 0;
    const st    = STATUS[pType] || STATUS[0];
    return `
      <div class="friend-item">
        <img class="friend-thumb" src="${img}" alt="${esc(f.name)}"
             onerror="this.src='https://placehold.co/42x42/13132a/444?text=?'">
        <div class="friend-meta">
          <div class="friend-name">${esc(f.displayName || f.name)}</div>
          <div class="friend-status">
            <span class="status-dot ${st.cls}" style="width:8px;height:8px;border:none"></span>
            <span class="status-label ${st.cls}" style="font-size:0.65rem">${st.label}</span>
          </div>
        </div>
        <button class="view-btn" onclick="quickSearch('${esc(f.name)}')">VIEW</button>
      </div>`;
  }).join('');
}

// ─── GROUPS ──────────────────────────────────────────────────
function renderGroups(groups) {
  $('c-groups').textContent = groups.length;
  if (!groups.length) return;

  $('list-groups').innerHTML = groups.map(g => {
    const grp  = g.group;
    const role = g.role?.name || '—';
    return `
      <div class="group-item">
        <div class="group-icon">
          <img src="https://www.roblox.com/asset-thumbnail/image?assetId=${grp.id}&width=150&height=150&format=png"
               onerror="this.parentElement.innerHTML='🏰'" alt="icon">
        </div>
        <div style="min-width:0;flex:1">
          <div class="group-name">${esc(grp.name)}</div>
          <div class="group-role">${esc(role)}</div>
        </div>
        <span class="group-members">${fmt(grp.memberCount)} members</span>
      </div>`;
  }).join('');
}

// ─── BADGES ──────────────────────────────────────────────────
function renderBadges(badges) {
  $('c-badges').textContent = badges.length;
  if (!badges.length) return;

  $('list-badges').innerHTML = `<div class="badges-grid">${
    badges.map(b => {
      const img = b.displayIconImageId
        ? `https://www.roblox.com/asset-thumbnail/image?assetId=${b.displayIconImageId}&width=150&height=150&format=png`
        : 'https://placehold.co/48x48/13132a/444?text=B';
      return `
        <div class="badge-item" title="${esc(b.displayName)}">
          <img class="badge-img" src="${img}" alt="${esc(b.displayName)}"
               onerror="this.src='https://placehold.co/48x48/13132a/444?text=B'">
          <span class="badge-name">${esc(b.displayName)}</span>
        </div>`;
    }).join('')
  }</div>`;
}

// ─── ACCESSORIES ─────────────────────────────────────────────
async function renderAccessories(ids) {
  $('c-acc').textContent = ids.length;
  if (!ids.length) return;

  const details = await Promise.all(
    ids.slice(0, 20).map(id => GET(`https://economy.roblox.com/v2/assets/${id}/details`))
  );

  $('list-acc').innerHTML = ids.slice(0, 20).map((id, i) => {
    const name = details[i]?.Name || `Asset #${id}`;
    const img  = `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`;
    return `
      <div class="acc-item">
        <img class="acc-img" src="${img}" alt="${esc(name)}"
             onerror="this.src='https://placehold.co/48x48/13132a/444?text=?'">
        <div style="min-width:0">
          <div class="acc-name">${esc(name)}</div>
          <div class="acc-id">ID: ${id}</div>
        </div>
      </div>`;
  }).join('');
}

// ─── GAMES (created / favorites) ─────────────────────────────
async function renderGames(listId, countId, games) {
  $(countId).textContent = games.length;
  if (!games.length) return;

  const uids = games.slice(0, 25).map(g => g.universeId || g.id).filter(Boolean);
  let thumbMap = {};

  if (uids.length) {
    const res = await GET(
      `https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${uids.join(',')}&countPerUniverse=1&defaults=true&size=480x270&format=Png`
    );
    (res?.data || []).forEach(t => {
      if (t.thumbnails?.[0]) thumbMap[t.universeId] = t.thumbnails[0].imageUrl;
    });
  }

  $(listId).innerHTML = games.slice(0, 25).map(g => {
    const uid2  = g.universeId || g.id;
    const name  = g.name || g.placeId || '—';
    const thumb = thumbMap[uid2] || 'https://placehold.co/60x42/13132a/444?text=?';
    const info  = [
      g.visits != null ? fmt(g.visits) + ' visits' : '',
      g.created ? fmtDate(g.created) : ''
    ].filter(Boolean).join(' · ');

    return `
      <div class="game-item">
        <img class="game-thumb" src="${thumb}" alt="${esc(name)}"
             onerror="this.src='https://placehold.co/60x42/13132a/444?text=?'">
        <div style="min-width:0">
          <div class="game-name">${esc(name)}</div>
          ${info ? `<div class="game-info">${info}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ─── INVENTORY ────────────────────────────────────────────────
function renderInventory(items) {
  $('c-inv').textContent = items.length;
  if (!items.length) return;

  $('list-inv').innerHTML = `<div class="inv-grid">${
    items.slice(0, 48).map(item => {
      const id   = item.assetId || item.id || '';
      const name = item.name || `Item #${id}`;
      const img  = id ? `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png` : '';
      return `
        <div class="inv-item" title="${esc(name)}">
          <img class="inv-img" src="${img}" alt="${esc(name)}"
               onerror="this.src='https://placehold.co/52x52/13132a/444?text=?'">
          <span class="inv-name">${esc(name)}</span>
        </div>`;
    }).join('')
  }</div>`;
}

// ─── QUICK SEARCH (from friend VIEW button) ───────────────────
function quickSearch(username) {
  $('username-input').value = username;
  searchUser();
}