// ════════════════════════════════════════════════════════════════════════════
//  Gauthierlele Stream Companion — Content Script
//  Runs on all https://www.twitch.tv/* pages
// ════════════════════════════════════════════════════════════════════════════

const EXT_ID = chrome.runtime.id;

// ────────────────────────────────────────────────────────────────────────────
//  MODULE 1 — Auto-Claim Channel Points
// ────────────────────────────────────────────────────────────────────────────
const CLAIM_SELECTORS = [
  'button[aria-label="Claim Bonus"]',
  '.claimable-bonus__icon',
  '[data-test-selector="community-points-claim-button"]',
  'button.claimable-bonus__icon',
];

let claimObserver = null;

function tryClaim() {
  for (const sel of CLAIM_SELECTORS) {
    const btn = document.querySelector(sel);
    if (btn) { btn.click(); console.log('[GExt] Points claimed!'); return; }
  }
}

function startClaimObserver() {
  if (claimObserver) return;
  claimObserver = new MutationObserver(() => {
    chrome.storage.local.get('autoClaimPoints', ({ autoClaimPoints }) => {
      if (autoClaimPoints !== false) tryClaim();
    });
  });
  claimObserver.observe(document.body, { childList: true, subtree: true });
}

function stopClaimObserver() {
  claimObserver?.disconnect(); claimObserver = null;
}

chrome.storage.onChanged.addListener(({ autoClaimPoints }) => {
  if (!autoClaimPoints) return;
  autoClaimPoints.newValue ? startClaimObserver() : stopClaimObserver();
});

chrome.storage.local.get('autoClaimPoints', ({ autoClaimPoints }) => {
  if (autoClaimPoints !== false) startClaimObserver();
});


// ────────────────────────────────────────────────────────────────────────────
//  MODULE 2 — Auto-Bet on Predictions
// ────────────────────────────────────────────────────────────────────────────
/*
  Logic:
  - Watches for a Twitch prediction panel to appear in the DOM
  - Parses the two outcome buttons (title + current total points / multiplier)
  - Picks "long odds" = the option with the LOWER total points (higher payout)
  - Optionally filters by minimum target multiplier (e.g. only bet if ≥ 2.0x)
  - Schedules the bet 10 seconds before the prediction closes
  - Clicks the outcome, fills the amount input, confirms
*/

let activePrediction = null;
let betScheduled     = false;
let betObserver      = null;

// Selectors — Twitch uses generated class names so we target stable attributes
const P_SEL = {
  // The top-level predictions wrapper (multiple possible class names)
  panel:   '[data-test-selector="predictions-list"], .predictions-list__container, [class*="PredictionLayout"]',
  // Each clickable outcome button
  outcome: '[data-test-selector^="prediction-checkout-option"], button[class*="prediction"][class*="outcome"], [class*="PredictionCheckout"] button',
  // Timer text elements
  timer:   '[data-test-selector="predictions-timer"], [class*="predictions"][class*="timer"], [class*="PredictionTimer"]',
  // Points input
  input:   '[data-test-selector="prediction-checkout-point-input"], input[class*="prediction"]',
  // Confirm / vote button
  confirm: '[data-test-selector="prediction-checkout-confirm"], button[class*="prediction"][class*="confirm"], [class*="PredictionCheckout"] button[type="submit"]',
};

function parseMultiplier(el) {
  // Look for text like "×2.30" or "2.3x" inside the element
  const text = el?.innerText ?? '';
  const m = text.match(/[×x]([\d.]+)|([\d.]+)[×x]/i);
  if (m) return parseFloat(m[1] || m[2]);
  // Fallback: look for ratio like "1 / 2.3"
  const r = text.match(/([\d.]+)\s*\/\s*([\d.]+)/);
  if (r) return parseFloat(r[2]);
  return null;
}

function parseTotalPoints(el) {
  // Look for numbers like "12,345" or "12 345" in the element text
  const text = el?.innerText ?? '';
  const m = text.match(/([\d,\s]+)\s*(pts?|points?)/i);
  if (m) return parseInt(m[1].replace(/[,\s]/g, ''), 10);
  return null;
}

function parseTimerSeconds(el) {
  if (!el) return null;
  const text = el.innerText.trim();
  // "1:30", "0:45", "10s", "45"
  const ms = text.match(/^(\d+):(\d{2})$/);
  if (ms) return parseInt(ms[1]) * 60 + parseInt(ms[2]);
  const ss = text.match(/^(\d+)\s*s/i);
  if (ss) return parseInt(ss[1]);
  const nn = text.match(/^(\d+)$/);
  if (nn) return parseInt(nn[1]);
  return null;
}

async function tryBet(outcomeEl) {
  const { betAmount = 50 } = await chrome.storage.local.get('betAmount');

  // 1. Click the outcome
  outcomeEl.click();
  await sleep(600);

  // 2. Fill the points input
  const input = document.querySelector(P_SEL.input);
  if (input) {
    input.focus();
    // Use React synthetic event trick
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeSetter.call(input, String(betAmount));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(300);
  }

  // 3. Click confirm
  const confirm = document.querySelector(P_SEL.confirm);
  if (confirm && !confirm.disabled) {
    confirm.click();
    console.log(`[GExt] Auto-bet ${betAmount} pts placed!`);
  }

  activePrediction = null;
  betScheduled     = false;
}

function scheduleBet(outcomeEl, secondsLeft) {
  if (betScheduled) return;
  betScheduled = true;
  const delay = Math.max(0, (secondsLeft - 10) * 1000);
  console.log(`[GExt] Bet scheduled in ${Math.round(delay/1000)}s on:`, outcomeEl?.innerText?.slice(0,40));
  setTimeout(() => tryBet(outcomeEl), delay);
}

function scanForPrediction() {
  const panel = document.querySelector(P_SEL.panel);
  if (!panel) return;

  const outcomes = [...panel.querySelectorAll(P_SEL.outcome)];
  if (outcomes.length < 2) return;

  // Parse multipliers / totals for each outcome
  const parsed = outcomes.map(el => ({
    el,
    multiplier: parseMultiplier(el),
    total: parseTotalPoints(el),
  }));

  // Pick long odds: lowest total (or highest multiplier if totals unavailable)
  let best = parsed[0];
  for (const o of parsed) {
    if (o.total != null && best.total != null) {
      if (o.total < best.total) best = o;
    } else if (o.multiplier != null && best.multiplier != null) {
      if (o.multiplier > best.multiplier) best = o;
    }
  }

  // Check target odds filter
  chrome.storage.local.get(['targetOdds', 'betAmount'], async ({ targetOdds = 0 }) => {
    if (targetOdds > 0 && best.multiplier != null && best.multiplier < targetOdds) {
      console.log(`[GExt] Skipping bet: odds ${best.multiplier}x < target ${targetOdds}x`);
      return;
    }

    // Parse timer
    const timerEl    = panel.querySelector(P_SEL.timer);
    const secondsLeft = parseTimerSeconds(timerEl) ?? 120; // default assume 2min
    scheduleBet(best.el, secondsLeft);
  });
}

function startBetObserver() {
  if (betObserver) return;
  betObserver = new MutationObserver(() => {
    chrome.storage.local.get('autoBet', ({ autoBet }) => {
      if (autoBet && !betScheduled) scanForPrediction();
    });
  });
  betObserver.observe(document.body, { childList: true, subtree: true });
}

function stopBetObserver() {
  betObserver?.disconnect(); betObserver = null;
  betScheduled = false; activePrediction = null;
}

chrome.storage.onChanged.addListener(({ autoBet }) => {
  if (!autoBet) return;
  autoBet.newValue ? startBetObserver() : stopBetObserver();
});

chrome.storage.local.get('autoBet', ({ autoBet }) => {
  if (autoBet) startBetObserver();
});


// ────────────────────────────────────────────────────────────────────────────
//  MODULE 3 — Faceit Level 20 Badge Injection in Chat
// ────────────────────────────────────────────────────────────────────────────
/*
  For every chat message visible, append a local Faceit lvl20 badge.
  This is PURELY LOCAL — other users never see it.
  Works by watching for new chat lines via MutationObserver.
*/

const BADGE_URL   = chrome.runtime.getURL('icons/badge_f20.png');
const BADGE_CLASS = 'gext-badge-f20'; // our marker to avoid duplicates

const CHAT_SELECTORS = {
  container: '.chat-scrollable-area__message-container, [data-test-selector="chat-scrollable-area__message-container"]',
  line:      '.chat-line__message, [data-test-selector="chat-line-message-body"]',
  badges:    '.chat-badge, [class*="InjectLayout"] img[alt]',
  badgeWrap: '.chat-badges, [class*="ChatBadgeList"]',
};

function injectBadge(lineEl) {
  if (!lineEl) return;
  if (lineEl.querySelector('.' + BADGE_CLASS)) return; // already injected

  // Find the badge container
  let wrap = lineEl.querySelector(CHAT_SELECTORS.badgeWrap);
  if (!wrap) {
    // Create one before the username
    const username = lineEl.querySelector('[class*="username"], [data-a-user]');
    if (!username) return;
    wrap = document.createElement('span');
    wrap.style.cssText = 'display:inline-flex;align-items:center;margin-right:3px;';
    username.parentNode?.insertBefore(wrap, username);
  }

  const img       = document.createElement('img');
  img.src         = BADGE_URL;
  img.className   = BADGE_CLASS;
  img.title       = 'Faceit Level 20 · Extension Gauthierlele';
  img.style.cssText = `
    width:18px;height:18px;
    vertical-align:middle;
    margin:0 2px;
    border-radius:50%;
    cursor:default;
    flex-shrink:0;
  `;
  wrap.appendChild(img);
}

function injectAllBadges() {
  document.querySelectorAll(CHAT_SELECTORS.line).forEach(injectBadge);
}

let badgeObserver = null;

function startBadgeObserver() {
  if (badgeObserver) return;
  // Initial pass
  injectAllBadges();

  badgeObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.matches?.(CHAT_SELECTORS.line)) injectBadge(node);
        else node.querySelectorAll?.(CHAT_SELECTORS.line).forEach(injectBadge);
      });
    }
  });

  const container = document.querySelector(CHAT_SELECTORS.container);
  if (container) {
    badgeObserver.observe(container, { childList: true, subtree: true });
  } else {
    // Retry once DOM is ready
    setTimeout(startBadgeObserver, 2000);
  }
}

// Always start badge observer (not toggleable per spec)
// Wait for chat to load
const waitForChat = setInterval(() => {
  if (document.querySelector(CHAT_SELECTORS.container) ||
      document.querySelector('.chat-room')) {
    clearInterval(waitForChat);
    startBadgeObserver();
  }
}, 1500);


// ────────────────────────────────────────────────────────────────────────────
//  Utility
// ────────────────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
