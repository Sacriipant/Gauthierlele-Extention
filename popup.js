const FACEIT_PLAYER  = 'EXT1NCTI0N-';
const TWITCH_CHANNEL = 'gauthierlele';
const GQL            = 'https://gql.twitch.tv/gql';
const TWITCH_CID     = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
  fixAvatarFallback();
  await loadSettings();
  await loadStreamStatus();
  await loadFaceitStats();
  bindToggles();
  bindBetSettings();
  bindSessionReset();
  bindFaceitRefresh();
  await bindCollapsibles();
});

// ─── Avatar (no inline onerror) ───────────────────────────────────────────────
function fixAvatarFallback() {
  const img = $('avatar-img');
  img.addEventListener('error', () => { img.src = 'icons/icon48.png'; });
  fetch(GQL, {
    method: 'POST',
    headers: { 'Client-Id': TWITCH_CID, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ query: `query { user(login:"${TWITCH_CHANNEL}") { profileImageURL(width:70) } }` }])
  })
  .then(r => r.json())
  .then(j => { const url = j?.[0]?.data?.user?.profileImageURL; if (url) img.src = url; })
  .catch(() => {});
}

// ─── Settings ─────────────────────────────────────────────────────────────────
async function loadSettings() {
  const s = await chrome.storage.local.get([
    'autoClaimPoints','autoOpenTab','notifyOnStart','autoBet','betAmount','targetOdds'
  ]);
  $('tog-claim').checked   = s.autoClaimPoints !== false;
  $('tog-tab').checked     = !!s.autoOpenTab;
  $('tog-notif').checked   = s.notifyOnStart !== false;
  $('tog-autobet').checked = !!s.autoBet;
  $('bet-amount').value    = s.betAmount ?? 50;
  $('bet-odds').value      = s.targetOdds ?? 0;
  if (s.autoBet) $('bet-options').classList.remove('hidden');
}

function bindToggles() {
  $('tog-claim').addEventListener('change',   e => chrome.storage.local.set({ autoClaimPoints: e.target.checked }));
  $('tog-tab').addEventListener('change',     e => chrome.storage.local.set({ autoOpenTab: e.target.checked }));
  $('tog-notif').addEventListener('change',   e => chrome.storage.local.set({ notifyOnStart: e.target.checked }));
  $('tog-autobet').addEventListener('change', e => {
    chrome.storage.local.set({ autoBet: e.target.checked });
    e.target.checked ? $('bet-options').classList.remove('hidden') : $('bet-options').classList.add('hidden');
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
  btn.classList.add('saved'); btn.textContent = '✓ Ok';
  setTimeout(() => { btn.classList.remove('saved'); btn.textContent = '✓'; }, 1500);
}

// ─── Stream Status ────────────────────────────────────────────────────────────
async function loadStreamStatus() {
  const cached = await new Promise(r => chrome.runtime.sendMessage({ type: 'GET_STREAM_STATUS' }, r));
  if (cached?.isLive) { setLive(cached.streamData); return; }
  try {
    const res  = await fetch(GQL, {
      method: 'POST',
      headers: { 'Client-Id': TWITCH_CID, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ query: `query { user(login:"${TWITCH_CHANNEL}") { stream { id title viewersCount game { name } } } }` }])
    });
    const j = await res.json();
    const s = j?.[0]?.data?.user?.stream ?? null;
    s ? setLive(s) : setOffline();
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

// ─── Background fetch proxy (bypasses CORS) ───────────────────────────────────
function bgFetch(path) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'FACEIT_FETCH', path }, (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!res?.ok) return reject(new Error(res?.error ?? 'fetch failed'));
      resolve(res.data);
    });
  });
}

// ─── Faceit Stats ─────────────────────────────────────────────────────────────
async function loadFaceitStats() {
  $('faceit-loading').classList.remove('hidden');
  $('faceit-stats').classList.add('hidden');
  $('faceit-error').classList.add('hidden');

  let pid = null;

  // STEP 1 — Player info + ELO (required, if this fails show error)
  try {
    const player  = await bgFetch(`/users/v1/nicknames/${FACEIT_PLAYER}`);
    const payload = player.payload ?? player;
    pid           = payload.id ?? payload.player_id ?? payload.guid;
    const cs      = (payload.games ?? {}).cs2 ?? (payload.games ?? {}).csgo ?? {};
    const elo     = cs.faceit_elo ?? cs.elo ?? null;

    $('stat-elo').textContent = elo != null ? Number(elo).toLocaleString() : '—';
    if (elo != null) {
      await chrome.storage.local.set({ faceitElo: elo });
      await renderSessionEloFromStorage(elo);
    }
  } catch (err) {
    console.error('[Popup] Player fetch failed:', err);
    $('faceit-loading').classList.add('hidden');
    $('faceit-error').classList.remove('hidden');
    return;
  }

  // Show the stats panel now — remaining steps fill it in
  $('faceit-loading').classList.add('hidden');
  $('faceit-stats').classList.remove('hidden');

// STEP 2 — Lifetime stats (avg kills, K/D, winrate)
  bgFetch(`/stats/v1/stats/users/${pid}/games/cs2`)
    .then(stats => {
      // 1. Essayer d'atteindre le segment "competitions" 5v5 (le plus précis pour l'affichage)
      const segmentsArray = stats?.segments ?? [];
      const compSegment = segmentsArray.find(s => s._id?.segmentId === 'competitions');
      
      // On récupère le premier sous-segment disponible (identifiant unique de la compétition)
      let targetStats = null;
      if (compSegment && compSegment.segments) {
        const firstKey = Object.keys(compSegment.segments)[0];
        targetStats = compSegment.segments[firstKey];
      }

      // 2. Si le segment 5v5 n'est pas trouvé, fallback sur le "lifetime" global
      if (!targetStats) {
        targetStats = stats?.lifetime ?? {};
      }

      // Extraction directe des clés Faceit correspondantes
      const avgKills = targetStats.k1; // Clé pour la moyenne de Kills
      const kd       = targetStats.k5; // Clé pour le K/D Ratio
      const winRate  = targetStats.k6; // Clé pour le Win Rate (%)

      // Injection et formatage dans le DOM
      $('stat-avg-kills').textContent = avgKills != null ? parseFloat(avgKills).toFixed(1) : '—';
      $('stat-kd').textContent        = kd       != null ? parseFloat(kd).toFixed(2)       : '—';
      $('stat-winrate').textContent   = winRate  != null ? Math.round(parseFloat(winRate)) + '%' : '—';
    })
    .catch(e => {
      console.warn('[Popup] Lifetime stats unavailable:', e.message);
      $('stat-avg-kills').textContent = '—';
      $('stat-kd').textContent = '—';
      $('stat-winrate').textContent = '—';
    });
  // STEP 3 — Last 5 game results for streak — independent
  // Use the "time stats" endpoint which returns one object per match WITH a Result field
  bgFetch(`/stats/v1/stats/time/users/${pid}/games/cs2?page=0&size=5`)
    .then(data => {
      const games = Array.isArray(data) ? data : (data.payload ?? data.items ?? []);
      renderStreak(games);
    })
    .catch(() => {
      // Fallback: match history v2
      bgFetch(`/match/v2/match?userId=${pid}&game=cs2&limit=5`)
        .then(data => {
          const matches = data.payload ?? data.items ?? [];
          renderStreakFromMatches(matches, pid);
        })
        .catch(e => console.warn('[Popup] Streak unavailable:', e.message));
    });

  // STEP 4 — Active match room — independent
  bgFetch(`/match/v2/match?userId=${pid}&game=cs2&state=ongoing&limit=1`)
    .then(data => {
      const list = data.payload ?? data.items ?? [];
      if (!list.length) return;
      const m   = list[0];
      const mid = m.id ?? m.matchId ?? m.match_id ?? '';
      $('match-room-row').classList.remove('hidden');
      $('match-room-link').textContent = mid ? '#' + mid.slice(-6) : 'En cours';
      $('match-room-link').href = `https://www.faceit.com/en/cs2/room/${mid}`;
    })
    .catch(() => {}); // silently ignore — no active match is normal
}

// Try multiple key names in an object, return first match
function pick(obj, keys) {
  for (const k of keys) if (obj?.[k] != null) return obj[k];
  return null;
}

// ─── Collapsible Sections (Accordéons) ────────────────────────────────────────
async function bindCollapsibles() {
  const headers = document.querySelectorAll('.collapsible-header');

  for (const header of headers) {
    const card = header.closest('.collapsible-card');
    const cardId = card.id;

    // 1. Restaurer l'état sauvegardé (si l'utilisateur l'avait fermé avant)
    if (cardId) {
      const stored = await chrome.storage.local.get(cardId);
      if (stored[cardId] === 'collapsed') {
        card.classList.add('collapsed');
      }
    }

    // 2. Écouter les clics
    header.addEventListener('click', () => {
      card.classList.toggle('collapsed');
      
      // 3. Sauvegarder le nouvel état
      if (cardId) {
        const isCollapsed = card.classList.contains('collapsed') ? 'collapsed' : 'open';
        chrome.storage.local.set({ [cardId]: isCollapsed });
      }
    });
  }
}

// Render streak from time-based stats (each entry has a "Result" field: "1"=win, "0"=loss)
function renderStreak(games) {
  const c = $('streak-boxes');
  c.innerHTML = '';
  
  // Ensure we are working with an array from the API response
  const matches = Array.isArray(games) ? games : (games.payload ?? games.items ?? []);

  matches.slice(0, 5).forEach(g => {
    const el = document.createElement('span');
    
    // In this API schema, 'i10' is a string ("1" for Win, "0" for Loss)
    const isWin = g.i10 === '1' || g.i10 === 1;
    const isLoss = g.i10 === '0' || g.i10 === 0;
    
    if (isWin) { 
      el.className = 'streak-item win';  
      el.textContent = 'W'; 
      el.title = `Victoire (${g.i1 ?? 'CS2'})`; 
    }
    else if (isLoss) { 
      el.className = 'streak-item loss'; 
      el.textContent = 'L'; 
      el.title = `Défaite (${g.i1 ?? 'CS2'})`; 
    }
    else { 
      el.className = 'streak-item none'; 
      el.textContent = '?'; 
    }
    c.appendChild(el);
  });

  // Pad out with empty slots if the player has fewer than 5 games total
  while (c.children.length < 5) {
    const el = document.createElement('span');
    el.className = 'streak-item none'; 
    el.textContent = '—';
    c.appendChild(el);
  }
}

// Fallback: render streak from match history (needs team membership parsing)
function renderStreakFromMatches(matches, playerId) {
  // Simply redirect to your main, fixed render function since the data
  // format matches what your backend proxy is returning!
  renderStreak(matches);
}

// ─── Session ELO ─────────────────────────────────────────────────────────────
function dateKey() { return new Date().toISOString().split('T')[0]; }

async function renderSessionEloFromStorage(elo) {
  if (elo == null) return;
  const today = dateKey();
  let { sessionStartElo, sessionDate } = await chrome.storage.local.get(['sessionStartElo','sessionDate']);
  if (sessionDate !== today) {
    sessionStartElo = elo;
    await chrome.storage.local.set({ sessionStartElo: elo, sessionDate: today });
  }
  renderSessionElo(sessionStartElo, elo);
}

function renderSessionElo(start, current) {
  const el = $('session-elo'), diff = current - start;
  if (diff > 0)      { el.textContent = `+${diff} ▲`; el.className = 'session-value positive'; }
  else if (diff < 0) { el.textContent = `${diff} ▼`;  el.className = 'session-value negative'; }
  else               { el.textContent = `±0`;          el.className = 'session-value neutral'; }
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