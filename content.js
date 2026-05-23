// ════════════════════════════════════════════════════════════════════════════
//  Gauthierlele Stream Companion — Content Script
//  Runs on all https://www.twitch.tv/* pages
// ════════════════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────────────────────
//  MODULE 1 — Auto-Claim Channel Points
// ────────────────────────────────────────────────────────────────────────────
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

let betScheduled = false;
let betObserver  = null;

const P_SEL = {
  panel:   '[data-test-selector="predictions-list"], .predictions-list__container, [class*="PredictionLayout"]',
  outcome: '[data-test-selector^="prediction-checkout-option"], button[class*="prediction"][class*="outcome"], [class*="PredictionCheckout"] button',
  timer:   '[data-test-selector="predictions-timer"], [class*="predictions"][class*="timer"], [class*="PredictionTimer"]',
  input:   '[data-test-selector="prediction-checkout-point-input"], input[class*="prediction"]',
  confirm: '[data-test-selector="prediction-checkout-confirm"], button[class*="prediction"][class*="confirm"], [class*="PredictionCheckout"] button[type="submit"]',
};

function parseMultiplier(el) {
  const text = el?.innerText ?? '';
  const m = text.match(/[×x]([\d.]+)|([\d.]+)[×x]/i);
  if (m) return parseFloat(m[1] || m[2]);
  const r = text.match(/([\d.]+)\s*\/\s*([\d.]+)/);
  if (r) return parseFloat(r[2]);
  return null;
}

function parseTotalPoints(el) {
  const text = el?.innerText ?? '';
  const m = text.match(/([\d,\s]+)\s*(pts?|points?)/i);
  if (m) return parseInt(m[1].replace(/[,\s]/g, ''), 10);
  return null;
}

function parseTimerSeconds(el) {
  if (!el) return null;
  const text = el.innerText.trim();
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

  outcomeEl.click();
  await sleep(600);

  const input = document.querySelector(P_SEL.input);
  if (input) {
    input.focus();
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeSetter.call(input, String(betAmount));
    input.dispatchEvent(new Event('input',  { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(300);
  }

  const confirm = document.querySelector(P_SEL.confirm);
  if (confirm && !confirm.disabled) {
    confirm.click();
    console.log(`[GExt] Auto-bet ${betAmount} pts placed!`);
  }

  betScheduled = false;
}

function scheduleBet(outcomeEl, secondsLeft) {
  if (betScheduled) return;
  betScheduled = true;
  const delay = Math.max(0, (secondsLeft - 10) * 1000);
  console.log(`[GExt] Bet scheduled in ${Math.round(delay / 1000)}s on:`, outcomeEl?.innerText?.slice(0, 40));
  setTimeout(() => tryBet(outcomeEl), delay);
}

function scanForPrediction() {
  const panel = document.querySelector(P_SEL.panel);
  if (!panel) return;

  const outcomes = [...panel.querySelectorAll(P_SEL.outcome)];
  if (outcomes.length < 2) return;

  const parsed = outcomes.map(el => ({
    el,
    multiplier: parseMultiplier(el),
    total:      parseTotalPoints(el),
  }));

  // Pick long odds: lowest total points, or highest multiplier as fallback
  let best = parsed[0];
  for (const o of parsed) {
    if (o.total != null && best.total != null) {
      if (o.total < best.total) best = o;
    } else if (o.multiplier != null && best.multiplier != null) {
      if (o.multiplier > best.multiplier) best = o;
    }
  }

  chrome.storage.local.get(['targetOdds', 'betAmount'], ({ targetOdds = 0 }) => {
    if (targetOdds > 0 && best.multiplier != null && best.multiplier < targetOdds) {
      console.log(`[GExt] Skipping bet: odds ${best.multiplier}x < target ${targetOdds}x`);
      return;
    }
    const secondsLeft = parseTimerSeconds(panel.querySelector(P_SEL.timer)) ?? 120;
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
  betObserver?.disconnect();
  betObserver  = null;
  betScheduled = false;
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
  Appends a local Faceit lvl20 badge to every chat message.
  Purely cosmetic — only visible to the extension user.
*/

const BADGE_URL   = chrome.runtime.getURL('icons/badge_f20.png');
const BADGE_CLASS = 'gext-badge-f20';

const CHAT_SEL = {
  container: '.chat-scrollable-area__message-container, [data-test-selector="chat-scrollable-area__message-container"]',
  line:      '.chat-line__message, [data-test-selector="chat-line-message-body"]',
  badgeWrap: '.chat-badges, [class*="ChatBadgeList"]',
};

function injectBadge(lineEl) {
  if (!lineEl || lineEl.querySelector('.' + BADGE_CLASS)) return;

  let wrap = lineEl.querySelector(CHAT_SEL.badgeWrap);
  if (!wrap) {
    const username = lineEl.querySelector('[class*="username"], [data-a-user]');
    if (!username) return;
    wrap = document.createElement('span');
    wrap.style.cssText = 'display:inline-flex;align-items:center;margin-right:3px;';
    username.parentNode?.insertBefore(wrap, username);
  }

  const img         = document.createElement('img');
  img.src           = BADGE_URL;
  img.className     = BADGE_CLASS;
  img.title         = 'Faceit Level 20 · Extension Gauthierlele';
  img.style.cssText = 'width:18px;height:18px;vertical-align:middle;margin:0 2px;border-radius:50%;cursor:default;flex-shrink:0;';
  wrap.appendChild(img);
}

function injectAllBadges() {
  document.querySelectorAll(CHAT_SEL.line).forEach(injectBadge);
}

let badgeObserver = null;

function startBadgeObserver() {
  if (badgeObserver) return;
  injectAllBadges();

  badgeObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.matches?.(CHAT_SEL.line)) injectBadge(node);
        else node.querySelectorAll?.(CHAT_SEL.line).forEach(injectBadge);
      });
    }
  });

  const container = document.querySelector(CHAT_SEL.container);
  if (container) {
    badgeObserver.observe(container, { childList: true, subtree: true });
  } else {
    setTimeout(startBadgeObserver, 2000);
  }
}

const waitForChat = setInterval(() => {
  if (document.querySelector(CHAT_SEL.container) || document.querySelector('.chat-room')) {
    clearInterval(waitForChat);
    startBadgeObserver();
  }
}, 1500);


// ────────────────────────────────────────────────────────────────────────────
//  Utility
// ────────────────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
