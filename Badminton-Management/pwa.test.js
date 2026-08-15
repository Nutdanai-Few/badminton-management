// Tests for pwa.js — install-prompt visibility rules + pull-to-refresh gesture math.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    DISMISS_KEY, SNOOZE_MS,
    PULL_THRESHOLD, PULL_MAX, PULL_RESISTANCE,
    isStandaloneDisplay, isIOS, isIOSSafari,
    installAvailability, shouldShowBanner, shouldShowIcon,
    pullDistance, createPullTracker,
} = require('./pwa.js');

const UA = {
    iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0 Mobile/15E148 Safari/604.1',
    iphoneLine: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/14.2.0',
    ipadOS: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
};

test('constants are the documented defaults', () => {
    assert.equal(DISMISS_KEY, 'bmInstallDismissedAt');
    assert.equal(SNOOZE_MS, 7 * 24 * 60 * 60 * 1000);
    assert.equal(PULL_THRESHOLD, 70);
    assert.equal(PULL_MAX, 110);
    assert.equal(PULL_RESISTANCE, 0.5);
});

// ---- standalone detection ---------------------------------------------------

test('isStandaloneDisplay reads either signal', () => {
    assert.equal(isStandaloneDisplay(), false);
    assert.equal(isStandaloneDisplay({}), false);
    assert.equal(isStandaloneDisplay({ displayModeStandalone: true }), true);   // Chrome/Android
    assert.equal(isStandaloneDisplay({ navigatorStandalone: true }), true);     // iOS Safari
    assert.equal(isStandaloneDisplay({ displayModeStandalone: false, navigatorStandalone: false }), false);
});

// ---- platform detection -----------------------------------------------------

test('isIOS covers iPhone, and iPadOS pretending to be a Mac', () => {
    assert.equal(isIOS(UA.iphoneSafari), true);
    assert.equal(isIOS(UA.iphoneChrome), true);
    assert.equal(isIOS(UA.androidChrome), false);
    // iPadOS reports "Macintosh"; only the touch points expose it.
    assert.equal(isIOS(UA.ipadOS, 5), true);
    assert.equal(isIOS(UA.macSafari, 0), false);
    assert.equal(isIOS(undefined), false);
});

test('isIOSSafari excludes iOS browsers and in-app webviews that cannot install', () => {
    assert.equal(isIOSSafari(UA.iphoneSafari), true);
    assert.equal(isIOSSafari(UA.ipadOS, 5), true);
    assert.equal(isIOSSafari(UA.iphoneChrome), false);   // Chrome iOS: no A2HS
    assert.equal(isIOSSafari(UA.iphoneLine), false);     // in-app browser
    assert.equal(isIOSSafari(UA.androidChrome), false);  // not iOS at all
});

// ---- availability -----------------------------------------------------------

test('installAvailability prefers a real prompt, falls back to iOS instructions', () => {
    assert.equal(installAvailability({ hasPrompt: true }), 'prompt');
    assert.equal(installAvailability({ iosSafari: true }), 'ios');
    assert.equal(installAvailability({}), 'none');
    assert.equal(installAvailability(), 'none');
});

test('installAvailability goes silent once the app is installed', () => {
    assert.equal(installAvailability({ hasPrompt: true, standalone: true }), 'none');
    assert.equal(installAvailability({ hasPrompt: true, installed: true }), 'none');
    assert.equal(installAvailability({ iosSafari: true, standalone: true }), 'none');
});

// ---- banner -----------------------------------------------------------------

test('banner shows when installable and never dismissed', () => {
    assert.equal(shouldShowBanner({ availability: 'prompt', dismissedAt: null, now: 1000 }), true);
    assert.equal(shouldShowBanner({ availability: 'ios', dismissedAt: 0, now: 1000 }), true);
    assert.equal(shouldShowBanner({ availability: 'prompt', dismissedAt: 'x', now: 1000 }), true);
});

test('banner never shows when there is nothing to install', () => {
    assert.equal(shouldShowBanner({ availability: 'none', dismissedAt: null, now: 1000 }), false);
    assert.equal(shouldShowBanner(), false);
});

test('dismissing snoozes the banner for exactly SNOOZE_MS', () => {
    const at = 1_000_000;
    assert.equal(shouldShowBanner({ availability: 'prompt', dismissedAt: at, now: at }), false);
    assert.equal(shouldShowBanner({ availability: 'prompt', dismissedAt: at, now: at + SNOOZE_MS - 1 }), false);
    assert.equal(shouldShowBanner({ availability: 'prompt', dismissedAt: at, now: at + SNOOZE_MS }), true);
    assert.equal(shouldShowBanner({ availability: 'prompt', dismissedAt: at, now: at + SNOOZE_MS * 2 }), true);
});

test('a dismissal stamped in the future (clock skew) keeps the banner quiet', () => {
    assert.equal(shouldShowBanner({ availability: 'prompt', dismissedAt: 5000, now: 1000 }), false);
});

test('snooze window is overridable', () => {
    const at = 500;
    assert.equal(shouldShowBanner({ availability: 'prompt', dismissedAt: at, now: at + 100, snoozeMs: 50 }), true);
    assert.equal(shouldShowBanner({ availability: 'prompt', dismissedAt: at, now: at + 10, snoozeMs: 50 }), false);
});

// ---- header icon ------------------------------------------------------------

test('icon takes over exactly when the banner is not on screen', () => {
    // Banner up → icon would be redundant.
    assert.equal(shouldShowIcon({ availability: 'prompt', bannerVisible: true }), false);
    // Banner dismissed but still installable → the icon is the way back in.
    assert.equal(shouldShowIcon({ availability: 'prompt', bannerVisible: false }), true);
    assert.equal(shouldShowIcon({ availability: 'ios', bannerVisible: false }), true);
    // Installed / not installable → nothing at all.
    assert.equal(shouldShowIcon({ availability: 'none', bannerVisible: false }), false);
    assert.equal(shouldShowIcon(), false);
});

test('regression: dismissing the banner must not remove the way to install', () => {
    const availability = installAvailability({ hasPrompt: true });
    const dismissedAt = 10_000;
    const now = dismissedAt + 1000;
    const bannerVisible = shouldShowBanner({ availability, dismissedAt, now });
    assert.equal(bannerVisible, false);
    assert.equal(shouldShowIcon({ availability, bannerVisible }), true);
});

// ---- pull distance ----------------------------------------------------------

test('pullDistance applies resistance and clamps at max', () => {
    assert.equal(pullDistance(0), 0);
    assert.equal(pullDistance(-40), 0);        // upward drag is not a pull
    assert.equal(pullDistance(40), 20);        // 0.5 resistance
    assert.equal(pullDistance(1000), PULL_MAX);
    assert.equal(pullDistance(100, 1, 60), 60);
    assert.equal(pullDistance('x'), 0);
});

// ---- pull tracker -----------------------------------------------------------

test('tracker refuses to start unless the page is at the top', () => {
    const t = createPullTracker();
    assert.equal(t.start(100, { atTop: false }), false);
    assert.deepEqual(t.move(300), { active: false, distance: 0, ready: false });
    assert.deepEqual(t.end(), { refresh: false, distance: 0 });
});

test('tracker refuses to start when disabled (modal/live scorer open)', () => {
    const t = createPullTracker();
    assert.equal(t.start(100, { atTop: true, enabled: false }), false);
    assert.equal(t.move(400).active, false);
});

test('a short pull moves the indicator but does not refresh', () => {
    const t = createPullTracker();
    assert.equal(t.start(100, { atTop: true }), true);
    const m = t.move(180);                     // 80px finger → 40px indicator
    assert.deepEqual(m, { active: true, distance: 40, ready: false });
    assert.deepEqual(t.end(), { refresh: false, distance: 40 });
});

test('a pull past the threshold refreshes on release', () => {
    const t = createPullTracker();
    t.start(100, { atTop: true });
    t.move(180);
    const m = t.move(260);                     // 160px finger → 80px indicator
    assert.equal(m.distance, 80);
    assert.equal(m.ready, true);
    assert.equal(t.end().refresh, true);
});

test('exactly at the threshold counts as ready', () => {
    const t = createPullTracker();
    t.start(0, { atTop: true });
    const m = t.move(PULL_THRESHOLD / PULL_RESISTANCE);
    assert.equal(m.distance, PULL_THRESHOLD);
    assert.equal(m.ready, true);
    assert.equal(t.end().refresh, true);
});

test('indicator travel is clamped at max no matter how far the finger goes', () => {
    const t = createPullTracker();
    t.start(0, { atTop: true });
    assert.equal(t.move(10_000).distance, PULL_MAX);
    assert.equal(t.distance, PULL_MAX);
});

test('dragging back above the start cancels the pull', () => {
    const t = createPullTracker();
    t.start(200, { atTop: true });
    assert.equal(t.move(400).ready, true);     // 200 finger → 100 indicator
    const back = t.move(190);                  // finger went above where it began
    assert.deepEqual(back, { active: false, distance: 0, ready: false });
    assert.equal(t.end().refresh, false);
});

test('cancel (e.g. a second finger) aborts without refreshing', () => {
    const t = createPullTracker();
    t.start(0, { atTop: true });
    t.move(400);
    assert.deepEqual(t.cancel(), { refresh: false, distance: 0 });
    assert.equal(t.active, false);
    assert.equal(t.end().refresh, false);
});

test('a new gesture starts clean after a completed one', () => {
    const t = createPullTracker();
    t.start(0, { atTop: true });
    t.move(400);
    assert.equal(t.end().refresh, true);
    t.start(0, { atTop: true });
    assert.equal(t.distance, 0);
    assert.equal(t.move(20).ready, false);     // 20 finger → 10 indicator
    assert.equal(t.end().refresh, false);
});

test('custom threshold/resistance are honoured', () => {
    const t = createPullTracker({ threshold: 30, resistance: 1, max: 200 });
    t.start(0, { atTop: true });
    assert.deepEqual(t.move(29), { active: true, distance: 29, ready: false });
    assert.deepEqual(t.move(31), { active: true, distance: 31, ready: true });
    assert.equal(t.threshold, 30);
    assert.equal(t.end().refresh, true);
});
