// ─── Constants ───────────────────────────────────────────────────────────────
const FACEIT_PLAYER    = 'EXT1NCTI0N-';
const FACEIT_PUBLIC    = 'https://api.faceit.com';
const TWITCH_CHANNEL   = 'gauthierlele';
const GQL              = 'https://gql.twitch.tv/gql';
const TWITCH_CID       = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

// ─── DOM helper ──────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadStreamStatus();
  await loadFaceitStats();
  bindSettingToggles();
  bindSessionReset();
  bindFaceitRefresh();
});

// ─── Settings ─────────────────────────────────────────────────────────────────
async function loadSettings() {
  const { autoClaimPoints, autoOpenTab, notifyOnStart } = await chrome.storage.local.get([
    'autoClaimPoints', 'autoOpenTab', 'notifyOnStart',
  ]);
  $('tog-claim').checked = autoClaimPoints !== false;
  $('tog-tab').checked   = !!autoOpenTab;
  $('tog-notif').checked = notifyOnStart !== false;
}

function bindSettingToggles() {
  $('tog-claim').addEventListener('change', (e) =>
    chrome.storage.local.set({ autoClaimPoints: e.target.checked }));
  $('tog-tab').addEventListener('change', (e) =>
    chrome.storage.local.set({ autoOpenTab: e.target.checked }));
  $('tog-notif').addEventListener('change', (e) =>
    chrome.storage.local.set({ notifyOnStart: e.target.checked }));
}

// ─── Stream Status ────────────────────────────────────────────────────────────
async function loadStreamStatus() {
  const { isLive, streamData } = await chrome.storage.local.get(['isLive', 'streamData']);
  if (isLive) { setLive(streamData); return; }
  try {
    const stream = await fetchTwitchStream();
    stream ? setLive(stream) : setOffline();
  } catch { setOffline(); }
}

async function fetchTwitchStream() {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Client-Id': TWITCH_CID, 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      operationName: 'StreamMetadata',
      variables: { channelLogin: TWITCH_CHANNEL },
      extensions: { persistedQuery: { version: 1, sha256Hash: 'a647c2a13599e5991e175155f798ca7f1ecddde73f7f341f39009c14dbf59aa8' } },
    }]),
  });
  const json = await res.json();
  return json?.[0]?.data?.user?.stream ?? null;
}

function setLive(stream) {
  $('stream-status').textContent = 'LIVE';
  $('stream-status').className   = 'stream-status live';
  $('live-dot').classList.remove('hidden');
  $('watch-btn').style.display   = 'flex';
  if (stream) {
    $('stream-meta').classList.remove('hidden');
    const viewers = stream.viewersCount != null
      ? stream.viewersCount.toLocaleString('fr-FR') + ' viewers' : '— viewers';
    $('viewer-count').lastChild.textContent = ' ' + viewers;
    $('game-name').textContent = stream.game?.name ?? '—';
  }
}

function setOffline() {
  $('stream-status').textContent = 'OFFLINE';
  $('stream-status').className   = 'stream-status offline';
}

// ─── Faceit Public API ────────────────────────────────────────────────────────
async function publicGet(path) {
  const res = await fetch(`${FACEIT_PUBLIC}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadFaceitStats() {
  $('faceit-loading').classList.remove('hidden');
  $('faceit-stats').classList.add('hidden');
  $('faceit-error').classList.add('hidden');

  try {
    // 1. Player info (elo, player_id)
    const player = await publicGet(`/users/v1/nicknames/${FACEIT_PLAYER}`);
    const payload = player.payload ?? player;
    const playerId = payload.id ?? payload.player_id ?? payload.guid;
    const games    = payload.games ?? {};
    const cs2      = games.cs2 ?? games.csgo ?? {};
    const elo      = cs2.faceit_elo ?? cs2.elo ?? null;

    if (elo != null) await chrome.storage.local.set({ faceitElo: elo });

    // 2. Lifetime stats
    let avgKills = null, kd = null, winRate = null;
    try {
      const game = cs2.game_player_id ? 'cs2' : 'csgo';
      const stats = await publicGet(`/stats/v1/stats/users/${playerId}/games/${game}`);
      const lt    = stats.lifetime ?? stats;
      avgKills = lt['Average Kills'] ?? lt['avgKills'] ?? null;
      kd       = lt['Average K/D Ratio'] ?? lt['kdRatio'] ?? lt['kd'] ?? null;
      winRate  = lt['Win Rate %'] ?? lt['winRate'] ?? null;
    } catch { /* stats optional */ }

    // 3. Match history (last 5) for streak
    let matches = [];
    try {
      const hist = await publicGet(
        `/match/v2/match?userId=${playerId}&game=cs2&limit=5&offset=0`
      );
      matches = hist.payload ?? hist.items ?? hist ?? [];
    } catch { /* optional */ }

    // 4. Active match room
    let activeMatch = null;
    try {
      const active = await publicGet(
        `/match/v2/match?userId=${playerId}&game=cs2&state=ongoing&limit=1`
      );
      const list = active.payload ?? active.items ?? [];
      if (list.length > 0) activeMatch = list[0];
    } catch { /* optional */ }

    // ── Render ──────────────────────────────────────────────────────────────
    $('faceit-loading').classList.add('hidden');
    $('faceit-stats').classList.remove('hidden');

    $('stat-elo').textContent       = elo != null ? Number(elo).toLocaleString() : '—';
    $('stat-avg-kills').textContent = avgKills != null ? parseFloat(avgKills).toFixed(1) : '—';
    $('stat-kd').textContent        = kd != null ? parseFloat(kd).toFixed(2) : '—';
    $('stat-winrate').textContent   = winRate != null ? winRate + '%' : '—';

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

    renderStreak(matches, playerId);

  } catch (err) {
    console.error('[Popup] Faceit error:', err);
    $('faceit-loading').classList.add('hidden');
    $('faceit-error').classList.remove('hidden');
  }
}

// ─── Session ELO ─────────────────────────────────────────────────────────────
function dateKey() { return new Date().toISOString().split('T')[0]; }

async function renderSessionEloFromStorage(currentElo) {
  if (currentElo == null) {
    $('session-elo').textContent = '—';
    $('session-elo').className   = 'session-value neutral';
    return;
  }
  const today = dateKey();
  let { sessionStartElo, sessionDate } = await chrome.storage.local.get(['sessionStartElo', 'sessionDate']);
  if (sessionDate !== today) {
    sessionStartElo = currentElo;
    await chrome.storage.local.set({ sessionStartElo: currentElo, sessionDate: today });
  }
  renderSessionElo(sessionStartElo, currentElo);
}

function renderSessionElo(startElo, currentElo) {
  const el   = $('session-elo');
  const diff = currentElo - startElo;
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
  const container = $('streak-boxes');
  container.innerHTML = '';

  const items = Array.isArray(matches) ? matches.slice(0, 5) : [];

  items.forEach((match) => {
    const item   = document.createElement('span');
    let   result = 'none';
    try {
      const winner = match.results?.winner ?? match.winner ?? null;
      // Find which team the player is on
      const t1 = match.teams?.faction1?.roster ?? [];
      const t2 = match.teams?.faction2?.roster ?? [];
      let team = null;
      if (t1.some((p) => (p.player_id ?? p.id) === playerId)) team = 'faction1';
      else if (t2.some((p) => (p.player_id ?? p.id) === playerId)) team = 'faction2';
      if (team && winner) result = winner === team ? 'win' : 'loss';
    } catch { /* ignore */ }

    if (result === 'win')       { item.className = 'streak-item win';  item.textContent = 'W'; item.title = 'Victoire'; }
    else if (result === 'loss') { item.className = 'streak-item loss'; item.textContent = 'L'; item.title = 'Défaite'; }
    else                        { item.className = 'streak-item none'; item.textContent = '?'; }
    container.appendChild(item);
  });

  // Fill empty slots
  while (container.children.length < 5) {
    const item = document.createElement('span');
    item.className   = 'streak-item none';
    item.textContent = '—';
    container.appendChild(item);
  }
}
