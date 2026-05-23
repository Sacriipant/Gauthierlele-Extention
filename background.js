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
const SHAKE_FRAMES = [
  'icons/icon_shake1.png',
  'icons/icon_shake2.png',
  'icons/icon_shake3.png',
  'icons/icon_shake4.png',
];

function startShake() {
  if (shakeTimer) return;
  shakeTimer = setInterval(() => {
    const path = SHAKE_FRAMES[shakeFrame++ % SHAKE_FRAMES.length];
    chrome.action.setIcon({ path: { 16: path, 32: path, 48: path, 128: path } }).catch(() => {});
  }, 150);
}

function stopShake() {
  if (!shakeTimer) return;
  clearInterval(shakeTimer); shakeTimer = null; shakeFrame = 0;
  chrome.action.setIcon({ path: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' } }).catch(() => {});
}

async function updateIcon() {
  const { isLive: live } = await chrome.storage.local.get('isLive');
  if (!live) {
    stopShake();
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  startShake();
  chrome.action.setBadgeText({ text: 'LIVE' });
  chrome.action.setBadgeBackgroundColor({ color: '#eb0400' });
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
