// ─── Constants ──────────────────────────────────────────────────────────────
const CHANNEL = 'gauthierlele';
const TWITCH_URL = `https://www.twitch.tv/${CHANNEL}`;
const GQL_ENDPOINT = 'https://gql.twitch.tv/gql';
const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

// ─── State ───────────────────────────────────────────────────────────────────
let isLive = false;
let shakeTimer = null;
let shakeFrame = 0;

// ─── Twitch Stream Check ─────────────────────────────────────────────────────
async function fetchStreamStatus() {
  try {
    const res = await fetch(GQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Client-Id': TWITCH_CLIENT_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        {
          operationName: 'StreamMetadata',
          variables: { channelLogin: CHANNEL },
          extensions: {
            persistedQuery: {
              version: 1,
              sha256Hash: 'a647c2a13599e5991e175155f798ca7f1ecddde73f7f341f39009c14dbf59aa8',
            },
          },
        },
      ]),
    });

    const json = await res.json();
    const stream = json?.[0]?.data?.user?.stream ?? null;

    await chrome.storage.local.set({
      isLive: !!stream,
      streamData: stream,
      lastCheck: Date.now(),
    });

    return stream;
  } catch (err) {
    console.error('[BG] Stream fetch error:', err);
    return null;
  }
}

// ─── Stream went live handler ─────────────────────────────────────────────────
async function onStreamStart(stream) {
  const { autoOpenTab, notifyOnStart } = await chrome.storage.local.get([
    'autoOpenTab',
    'notifyOnStart',
  ]);

  if (autoOpenTab) {
    const existing = await chrome.tabs.query({ url: `*://www.twitch.tv/${CHANNEL}*` });
    if (existing.length === 0) {
      chrome.tabs.create({ url: TWITCH_URL });
    }
  }

  if (notifyOnStart !== false) {
    chrome.notifications.create('stream-live', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: '🔴 Gauthierlele est LIVE !',
      message: stream?.game?.name
        ? `${stream.game.name} · ${stream.viewersCount ?? 0} viewers`
        : 'Le stream vient de démarrer !',
      priority: 2,
    });
  }
}

// ─── Icon shake (when live but no tab open) ───────────────────────────────────
function drawShakeIcon(offsetX, offsetY) {
  const size = 32;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const pad = 2;
  const r = 5;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.roundRect(pad + offsetX + 1, pad + offsetY + 1, size - pad * 2, size - pad * 2, r);
  ctx.fill();

  // Purple background
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#a970ff');
  grad.addColorStop(1, '#7c2fe8');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(pad + offsetX, pad + offsetY, size - pad * 2, size - pad * 2, r);
  ctx.fill();

  // "G" letter
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('G', size / 2 + offsetX, size / 2 + offsetY);

  return ctx.getImageData(0, 0, size, size);
}

function startShake() {
  if (shakeTimer) return;
  const offsets = [
    [3, -1], [-3, 1], [2, -2], [-2, 2], [1, -1], [-1, 1],
  ];
  shakeTimer = setInterval(() => {
    const [ox, oy] = offsets[shakeFrame % offsets.length];
    shakeFrame++;
    const imageData = drawShakeIcon(ox, oy);
    chrome.action.setIcon({ imageData: { 32: imageData } }).catch(() => {});
  }, 150);
}

function stopShake() {
  if (shakeTimer) {
    clearInterval(shakeTimer);
    shakeTimer = null;
    shakeFrame = 0;
  }
  chrome.action.setIcon({
    path: {
      16: 'icons/icon16.png',
      32: 'icons/icon32.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
  }).catch(() => {});
}

async function updateIconAndBadge() {
  const { isLive: stored } = await chrome.storage.local.get('isLive');

  if (!stored) {
    stopShake();
    chrome.action.setBadgeText({ text: '' });
    return;
  }

  const tabs = await chrome.tabs.query({ url: `*://www.twitch.tv/${CHANNEL}*` });
  const hasTab = tabs.length > 0;

  if (!hasTab) {
    // Stream live, no tab → SHAKE
    startShake();
    chrome.action.setBadgeText({ text: 'LIVE' });
    chrome.action.setBadgeBackgroundColor({ color: '#eb0400' });
  } else {
    // Stream live, tab open → calm badge
    stopShake();
    chrome.action.setBadgeText({ text: '▶' });
    chrome.action.setBadgeBackgroundColor({ color: '#9147ff' });
  }
}

// ─── Alarm: poll every minute ─────────────────────────────────────────────────
chrome.alarms.create('poll', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'poll') return;
  const prevLive = isLive;
  const stream = await fetchStreamStatus();
  isLive = !!stream;

  if (!prevLive && isLive) await onStreamStart(stream);
  await updateIconAndBadge();
});

// ─── Tab events → re-check icon state ────────────────────────────────────────
chrome.tabs.onUpdated.addListener(() => updateIconAndBadge());
chrome.tabs.onRemoved.addListener(() => updateIconAndBadge());

// ─── Startup ──────────────────────────────────────────────────────────────────
(async () => {
  // Set defaults if not set
  const stored = await chrome.storage.local.get([
    'autoClaimPoints',
    'autoOpenTab',
    'notifyOnStart',
  ]);
  if (stored.autoClaimPoints === undefined)
    await chrome.storage.local.set({ autoClaimPoints: true });
  if (stored.autoOpenTab === undefined)
    await chrome.storage.local.set({ autoOpenTab: false });
  if (stored.notifyOnStart === undefined)
    await chrome.storage.local.set({ notifyOnStart: true });

  const stream = await fetchStreamStatus();
  isLive = !!stream;
  await updateIconAndBadge();
})();
