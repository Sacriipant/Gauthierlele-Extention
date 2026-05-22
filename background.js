// ─── Constants ───────────────────────────────────────────────────────────────
const CHANNEL     = 'gauthierlele';
const TWITCH_URL  = `https://www.twitch.tv/${CHANNEL}`;
const GQL         = 'https://gql.twitch.tv/gql';
const TWITCH_CID  = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const FACEIT_PUB  = 'https://api.faceit.com';

let isLive     = false;
let shakeTimer = null;
let shakeFrame = 0;

// ─── Message Handler (used by popup to bypass CORS) ──────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'FACEIT_FETCH') {
    fetch(`${FACEIT_PUB}${msg.path}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // keep channel open for async
  }

  if (msg.type === 'GET_STREAM_STATUS') {
    chrome.storage.local.get(['isLive', 'streamData'], (d) => sendResponse(d));
    return true;
  }
});

// ─── Twitch GQL ───────────────────────────────────────────────────────────────
async function fetchStream() {
  try {
    const res = await fetch(GQL, {
      method: 'POST',
      headers: { 'Client-Id': TWITCH_CID, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        query: `query { user(login:"${CHANNEL}") { stream { id title viewersCount game { name } } } }`
      }])
    });
    const json = await res.json();
    const stream = json?.[0]?.data?.user?.stream ?? null;
    await chrome.storage.local.set({ isLive: !!stream, streamData: stream, lastCheck: Date.now() });
    return stream;
  } catch (e) {
    console.error('[BG] stream fetch:', e);
    return null;
  }
}

// ─── Stream Start Handler ─────────────────────────────────────────────────────
async function onStreamStart(stream) {
  const { autoOpenTab, notifyOnStart } = await chrome.storage.local.get(['autoOpenTab', 'notifyOnStart']);
  if (autoOpenTab) {
    const tabs = await chrome.tabs.query({ url: `*://www.twitch.tv/${CHANNEL}*` });
    if (!tabs.length) chrome.tabs.create({ url: TWITCH_URL });
  }
  if (notifyOnStart !== false) {
    chrome.notifications.create('live', {
      type: 'basic', iconUrl: 'icons/icon128.png',
      title: '🔴 Gauthierlele est LIVE !',
      message: stream?.game?.name ? `${stream.game.name} · ${stream.viewersCount ?? 0} viewers` : 'Le stream démarre !',
      priority: 2,
    });
  }
}

// ─── Icon Shake ───────────────────────────────────────────────────────────────
function drawIcon(ox, oy) {
  const s = 32, canvas = new OffscreenCanvas(s, s), ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.roundRect(3+ox, 3+oy, 26, 26, 5); ctx.fill();
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, '#a970ff'); g.addColorStop(1, '#7c2fe8');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.roundRect(2+ox, 2+oy, 26, 26, 5); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('G', s/2+ox, s/2+oy);
  return ctx.getImageData(0, 0, s, s);
}

const OFFSETS = [[3,-1],[-3,1],[2,-2],[-2,2],[3,0],[-3,0]];

function startShake() {
  if (shakeTimer) return;
  shakeTimer = setInterval(() => {
    const [ox, oy] = OFFSETS[shakeFrame++ % OFFSETS.length];
    chrome.action.setIcon({ imageData: { 32: drawIcon(ox, oy) } }).catch(() => {});
  }, 150);
}

function stopShake() {
  if (!shakeTimer) return;
  clearInterval(shakeTimer); shakeTimer = null; shakeFrame = 0;
  chrome.action.setIcon({ path: { 16:'icons/icon16.png', 32:'icons/icon32.png', 48:'icons/icon48.png', 128:'icons/icon128.png' } }).catch(() => {});
}

async function updateIcon() {
  const { isLive: live } = await chrome.storage.local.get('isLive');
  if (!live) { stopShake(); chrome.action.setBadgeText({ text: '' }); return; }
  const tabs = await chrome.tabs.query({ url: `*://www.twitch.tv/${CHANNEL}*` });
  if (!tabs.length) {
    startShake();
    chrome.action.setBadgeText({ text: 'LIVE' });
    chrome.action.setBadgeBackgroundColor({ color: '#eb0400' });
  } else {
    stopShake();
    chrome.action.setBadgeText({ text: '▶' });
    chrome.action.setBadgeBackgroundColor({ color: '#9147ff' });
  }
}

// ─── Polling Alarm ────────────────────────────────────────────────────────────
chrome.alarms.create('poll', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'poll') return;
  const prev = isLive;
  const stream = await fetchStream();
  isLive = !!stream;
  if (!prev && isLive) await onStreamStart(stream);
  await updateIcon();
});

chrome.tabs.onUpdated.addListener(() => updateIcon());
chrome.tabs.onRemoved.addListener(() => updateIcon());

// ─── Startup ──────────────────────────────────────────────────────────────────
(async () => {
  const s = await chrome.storage.local.get(['autoClaimPoints','autoOpenTab','notifyOnStart','autoBet','betAmount','targetOdds']);
  if (s.autoClaimPoints  === undefined) await chrome.storage.local.set({ autoClaimPoints: true });
  if (s.autoOpenTab      === undefined) await chrome.storage.local.set({ autoOpenTab: false });
  if (s.notifyOnStart    === undefined) await chrome.storage.local.set({ notifyOnStart: true });
  if (s.autoBet          === undefined) await chrome.storage.local.set({ autoBet: false });
  if (s.betAmount        === undefined) await chrome.storage.local.set({ betAmount: 50 });
  if (s.targetOdds       === undefined) await chrome.storage.local.set({ targetOdds: 0 });
  const stream = await fetchStream();
  isLive = !!stream;
  await updateIcon();
})();
