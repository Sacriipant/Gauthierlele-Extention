// ─── Gauthierlele Companion: Content Script ──────────────────────────────────
// Runs on https://www.twitch.tv/gauthierlele
// Watches for channel point claim buttons and auto-clicks them

let claimObserver = null;

// Selectors Twitch uses for the claim button (may vary with Twitch updates)
const CLAIM_SELECTORS = [
  'button[aria-label="Claim Bonus"]',
  '.claimable-bonus__icon',
  '[data-test-selector="community-points-claim-button"]',
  'button.claimable-bonus__icon',
  '.Layout-sc-1xcs6mc-0 button[aria-label="Claim Bonus"]',
];

function tryClaimPoints() {
  for (const sel of CLAIM_SELECTORS) {
    const btn = document.querySelector(sel);
    if (btn) {
      btn.click();
      console.log('[Gauthierlele Ext] Channel points auto-claimed!');
      return true;
    }
  }
  return false;
}

function startObserver() {
  if (claimObserver) return;

  claimObserver = new MutationObserver(() => {
    chrome.storage.local.get('autoClaimPoints', ({ autoClaimPoints }) => {
      if (autoClaimPoints !== false) {
        tryClaimPoints();
      }
    });
  });

  claimObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  console.log('[Gauthierlele Ext] Channel point observer started.');
}

function stopObserver() {
  if (claimObserver) {
    claimObserver.disconnect();
    claimObserver = null;
  }
}

// Listen for settings changes from popup
chrome.storage.onChanged.addListener((changes) => {
  if ('autoClaimPoints' in changes) {
    if (changes.autoClaimPoints.newValue) {
      startObserver();
    } else {
      stopObserver();
    }
  }
});

// Init: check setting then start
chrome.storage.local.get('autoClaimPoints', ({ autoClaimPoints }) => {
  if (autoClaimPoints !== false) {
    startObserver();
  }
});
