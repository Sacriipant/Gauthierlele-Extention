// ─── Constants ───────────────────────────────────────────────────────────────
const FACEIT_PLAYER  = 'EXT1NCTI0N-';
const TWITCH_CHANNEL = 'gauthierlele';
const GQL            = 'https://gql.twitch.tv/gql';
const TWITCH_CID     = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

const $ = (id) => document.getElementById(id);

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  fixAvatarFallback();
  await loadSettings();
  await loadStreamStatus();
  await loadFaceitStats();
  bindToggles();
  bindBetSettings();
  bindSessionReset();
  bindFaceitRefresh();
});

// ─── Fix avatar fallback (no inline onerror) ──────────────────────────────────
function fixAvatarFallback() {
  const img = $('avatar-img');
  img.addEventListener('error', () => { img.src = 'icons/icon48.png'; });
  // Try to load the real Twitch avatar via GQL (no onerror needed if this works)
  loadTwitchAvatar();
}

async function loadTwitchAvatar() {
  try {
    const res = await fetch(GQL, {
      method: 'POST',
      headers: { 'Client-Id': TWITCH_CID, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        query: `query { user(login:"${TWITCH_CHANNEL}") { profileImageURL(width:70) } }`
      }])
    });
    const json = await res.json();
    const url  = json?.[0]?.data?.user?.profileImageURL;
    if (url) $('avatar-img').src = url;
  } catch { /* keep fallback */ }
}

// ─── Settings ─────────────────────────────────────────────────────────────────
async function loadSettings() {
  const s = await chrome.storage.local.get([
    'autoClaimPoints','autoOpenTab','notifyOnStart','autoBet','betAmount','targetOdds'
  ]);
  $('tog-claim').checked  = s.autoClaimPoints !== false;
  $('tog-tab').checked    = !!s.autoOpenTab;
  $('tog-notif').checked  = s.notifyOnStart !== false;
  $('tog-autobet').checked = !!s.autoBet;
  $('bet-amount').value   = s.betAmount ?? 50;
  $('bet-odds').value     = s.targetOdds ?? 0;

  if (s.autoBet) $('bet-options').classList.remove('hidden');
}

function bindToggles() {
  $('tog-claim').addEventListener('change', e =>
    chrome.storage.local.set({ autoClaimPoints: e.target.checked }));
  $('tog-tab').addEventListener('change', e =>
    chrome.storage.local.set({ autoOpenTab: e.target.checked }));
  $('tog-notif').addEventListener('change', e =>
    chrome.storage.local.set({ notifyOnStart: e.target.checked }));
  $('tog-autobet').addEventListener('change', e => {
    chrome.storage.local.set({ autoBet: e.target.checked });
    e.target.checked
      ? $('bet-options').classList.remove('hidden')
      : $('bet-options').classList.add('hidden');
  });
}

// ─── Bet Settings ─────────────────────────────────────────────────────────────
function bindBetSettings() {
  $('bet-amount-save').addEventListener('click', () => {
    const v = Math.max(10, parseInt($('bet-amount').value) || 50);
    $('bet-amount').value = v;
    chrome.storage.local.set({ betAmount: v });
    flashSaved($('bet-amount-save'));
  });
  $('bet-odds-save').addEventListener('click', () => {
    const v = Math.max(0, parseFloat($('bet-odds').value) || 0);
    $('bet-odds').value = v;
    chrome.storage.local.set({ targetOdds: v });
    flashSaved($('bet-odds-save'));
  });
}

function flashSaved(btn) {
  btn.classList.add('saved');
  btn.textContent = '✓ Ok';
  setTimeout(() => { btn.classList.remove('saved'); btn.textContent = '✓'; }, 1500);
}

// ─── Stream Status ────────────────────────────────────────────────────────────
async function loadStreamStatus() {
  // Ask background for cached status first
  const cached = await new Promise(res =>
    chrome.runtime.sendMessage({ type: 'GET_STREAM_STATUS' }, res)
  );
  if (cached?.isLive) { setLive(cached.streamData); return; }

  // Fresh fetch
  try {
    const res  = await fetch(GQL, {
      method: 'POST',
      headers: { 'Client-Id': TWITCH_CID, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        query: `query { user(login:"${TWITCH_CHANNEL}") { stream { id title viewersCount game { name } } } }`
      }])
    });
    const json   = await res.json();
    const stream = json?.[0]?.data?.user?.stream ?? null;
    stream ? setLive(stream) : setOffline();
  } catch { setOffline(); }
}

function setLive(stream) {
  $('stream-status').textContent = 'LIVE';
  $('stream-status').className   = 'stream-status live';
  $('live-dot').classList.remove('hidden');
  $('watch-btn').style.display   = 'flex';
  if (stream) {
    $('stream-meta').classList.remove('hidden');
    $('viewer-count').querySelector('span').textContent =
      stream.viewersCount != null ? stream.viewersCount.toLocaleString('fr-FR') + ' viewers' : '— viewers';
    $('game-name').textContent = stream.game?.name ?? '—';
  }
}

function setOffline() {
  $('stream-status').textContent = 'OFFLINE';
  $('stream-status').className   = 'stream-status offline';
}

// ─── Faceit (via background to bypass CORS) ───────────────────────────────────
function bgFetch(path) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'FACEIT_FETCH', path }, (res) => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
      if (!res || !res.ok) return reject(new Error(res?.error ?? 'fetch failed'));
      resolve(res.data);
    });
  });
}

async function loadFaceitStats() {
  $('faceit-loading').classList.remove('hidden');
  $('faceit-stats').classList.add('hidden');
  $('faceit-error').classList.add('hidden');

  try {
    // 1. Player info
    const player  = await bgFetch(`/users/v1/nicknames/${FACEIT_PLAYER}`);
    const payload = player.payload ?? player;
    const pid     = payload.id ?? payload.player_id ?? payload.guid;
    const games   = payload.games ?? {};
    const cs      = games.cs2 ?? games.csgo ?? {};
    const elo     = cs.faceit_elo ?? cs.elo ?? null;

    if (elo != null) await chrome.storage.local.set({ faceitElo: elo });

    // 2. Lifetime stats
    let avgKills = null, kd = null, winRate = null;
    try {
      const game  = 'cs2';
      const stats = await bgFetch(`/stats/v1/stats/users/${pid}/games/${game}`);
      const lt    = stats.lifetime ?? stats;
      avgKills = lt['Average Kills']    ?? lt['avgKills']   ?? null;
      kd       = lt['Average K/D Ratio']?? lt['kdRatio']   ?? null;
      winRate  = lt['Win Rate %']       ?? lt['winRate']   ?? null;
    } catch { /* optional */ }

    // 3. Match history
    let matches = [];
    try {
      const hist = await bgFetch(`/match/v2/match?userId=${pid}&game=cs2&limit=5`);
      matches = hist.payload ?? hist.items ?? [];
    } catch { /* optional */ }

    // 4. Active match
    let activeMatch = null;
    try {
      const active = await bgFetch(`/match/v2/match?userId=${pid}&game=cs2&state=ongoing&limit=1`);
      const list   = active.payload ?? active.items ?? [];
      if (list.length) activeMatch = list[0];
    } catch { /* optional */ }

    // ── Render ────────────────────────────────────────────────────────────
    $('faceit-loading').classList.add('hidden');
    $('faceit-stats').classList.remove('hidden');

    $('stat-elo').textContent       = elo       != null ? Number(elo).toLocaleString()        : '—';
    $('stat-avg-kills').textContent = avgKills  != null ? parseFloat(avgKills).toFixed(1)     : '—';
    $('stat-kd').textContent        = kd        != null ? parseFloat(kd).toFixed(2)           : '—';
    $('stat-winrate').textContent   = winRate   != null ? winRate + '%'                       : '—';

    await renderSessionEloFromStorage(elo);

    if (activeMatch) {
      $('match-room-row').classList.remove('hidden');
      const mid  = activeMatch.id ?? activeMatch.matchId ?? activeMatch.match_id ?? '';
      const link = $('match-room-link');
      link.textContent = mid ? '#' + mid.slice(-6) : 'En cours';
      link.href = `https://www.faceit.com/en/cs2/room/${mid}`;
    } else {
      $('match-room-row').classList.add('hidden');
    }

    renderStreak(matches, pid);

  } catch (err) {
    console.error('[Popup] Faceit error:', err);
    $('faceit-loading').classList.add('hidden');
    $('faceit-error').classList.remove('hidden');
  }
}

// ─── Session ELO ─────────────────────────────────────────────────────────────
function dateKey() { return new Date().toISOString().split('T')[0]; }

async function renderSessionEloFromStorage(elo) {
  if (elo == null) { $('session-elo').textContent = '—'; return; }
  const today = dateKey();
  let { sessionStartElo, sessionDate } = await chrome.storage.local.get(['sessionStartElo','sessionDate']);
  if (sessionDate !== today) {
    sessionStartElo = elo;
    await chrome.storage.local.set({ sessionStartElo: elo, sessionDate: today });
  }
  renderSessionElo(sessionStartElo, elo);
}

function renderSessionElo(start, current) {
  const el   = $('session-elo');
  const diff = current - start;
  if (diff > 0)      { el.textContent = `+${diff} ▲`; el.className = 'session-value positive'; }
  else if (diff < 0) { el.textContent = `${diff} ▼`;  el.className = 'session-value negative'; }
  else               { el.textContent = `±0`;          el.className = 'session-value neutral';  }
}

function bindSessionReset() {
  $('session-reset').addEventListener('click', async () => {
    const { faceitElo } = await chrome.storage.local.get('faceitElo');
    if (faceitElo != null) {
      await chrome.storage.local.set({ sessionStartElo: faceitElo, sessionDate: dateKey() });
      renderSessionElo(faceitElo, faceitElo);
    }
  });
}

function bindFaceitRefresh() {
  $('faceit-refresh').addEventListener('click', async () => {
    $('faceit-refresh').classList.add('spinning');
    await loadFaceitStats();
    setTimeout(() => $('faceit-refresh').classList.remove('spinning'), 600);
  });
}

// ─── Streak ───────────────────────────────────────────────────────────────────
function renderStreak(matches, playerId) {
  const c = $('streak-boxes');
  c.innerHTML = '';
  const items = Array.isArray(matches) ? matches.slice(0, 5) : [];

  items.forEach((match) => {
    const el   = document.createElement('span');
    let result = 'none';
    try {
      const winner = match.results?.winner ?? match.winner ?? null;
      const t1     = match.teams?.faction1?.roster ?? [];
      const t2     = match.teams?.faction2?.roster ?? [];
      let   team   = null;
      if      (t1.some(p => (p.player_id ?? p.id) === playerId)) team = 'faction1';
      else if (t2.some(p => (p.player_id ?? p.id) === playerId)) team = 'faction2';
      if (team && winner) result = winner === team ? 'win' : 'loss';
    } catch { /* ignore */ }

    if (result === 'win')       { el.className = 'streak-item win';  el.textContent = 'W'; el.title = 'Victoire'; }
    else if (result === 'loss') { el.className = 'streak-item loss'; el.textContent = 'L'; el.title = 'Défaite'; }
    else                        { el.className = 'streak-item none'; el.textContent = '?'; }
    c.appendChild(el);
  });

  while (c.children.length < 5) {
    const el = document.createElement('span');
    el.className = 'streak-item none'; el.textContent = '—';
    c.appendChild(el);
  }
}
