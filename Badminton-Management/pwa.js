// pwa.js
// Pure, side-effect-free logic for "install this as an app" + pull-to-refresh.
// No DOM, no browser APIs — everything the browser knows (display mode, user
// agent, saved dismiss timestamp, touch coordinates) is passed IN, so the rules
// can be unit-tested under `node --test`.  All the wiring lives in script.js.
//
// Same tiny UMD wrapper as the other pure modules so the SAME file works as a
// browser <script> global (PWA) AND as a CommonJS module (tests).
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;        // Node (test suite)
    } else {
        root.PWA = api;              // Browser global
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    // localStorage key holding the timestamp of the last banner dismissal.
    const DISMISS_KEY = 'bmInstallDismissedAt';

    // How long a dismissal keeps the banner quiet.  The header icon stays put
    // the whole time — dismissing hides the *banner*, not the ability to install.
    const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days

    // ---- Install availability ------------------------------------------------

    // Is the page already running as an installed app?  Chrome/Android answers
    // through the display-mode media query, iOS Safari through navigator.standalone.
    function isStandaloneDisplay({ displayModeStandalone = false, navigatorStandalone = false } = {}) {
        return Boolean(displayModeStandalone || navigatorStandalone);
    }

    // iOS (incl. iPadOS, which lies and reports "Macintosh" — the touch-point
    // count is what gives it away).
    function isIOS(ua, maxTouchPoints = 0) {
        const s = String(ua || '');
        if (/iPhone|iPad|iPod/i.test(s)) return true;
        return /Macintosh/i.test(s) && Number(maxTouchPoints) > 1;
    }

    // iOS can only install from Safari's own share sheet.  Chrome/Firefox/Edge on
    // iOS are Safari under the hood but have no "Add to Home Screen", and in-app
    // browsers (Line, Facebook) have none either — telling those users to install
    // would just be wrong, so they get nothing.
    function isIOSSafari(ua, maxTouchPoints = 0) {
        if (!isIOS(ua, maxTouchPoints)) return false;
        const s = String(ua || '');
        if (/CriOS|FxiOS|EdgiOS|OPiOS|Line\/|FBAN|FBAV|Instagram/i.test(s)) return false;
        return /Safari/i.test(s);
    }

    // What kind of install can we offer right now?
    //   'prompt' — we hold a beforeinstallprompt event, one tap does it
    //   'ios'    — no event exists on iOS; we can only show instructions
    //   'none'   — already installed, or the browser can't install this
    function installAvailability({ hasPrompt = false, standalone = false, iosSafari = false, installed = false } = {}) {
        if (standalone || installed) return 'none';
        if (hasPrompt) return 'prompt';
        if (iosSafari) return 'ios';
        return 'none';
    }

    // The banner is the loud, one-time-ish invitation: only when an install is
    // actually possible and the user hasn't waved it away recently.
    function shouldShowBanner({ availability = 'none', dismissedAt = null, now = 0, snoozeMs = SNOOZE_MS } = {}) {
        if (availability === 'none') return false;
        const at = Number(dismissedAt);
        if (!Number.isFinite(at) || at <= 0) return true;      // never dismissed
        if (at > Number(now)) return false;                    // clock skew — stay quiet
        return Number(now) - at >= snoozeMs;
    }

    // The header icon is the quiet, always-available fallback: it shows exactly
    // when an install is possible but the banner is not on screen, so dismissing
    // the banner never takes the ability to install away.
    function shouldShowIcon({ availability = 'none', bannerVisible = false } = {}) {
        if (availability === 'none') return false;
        return !bannerVisible;
    }

    // ---- Pull to refresh -----------------------------------------------------

    const PULL_THRESHOLD = 70;    // px of *indicator* travel needed to trigger
    const PULL_MAX = 110;         // indicator never travels further than this
    const PULL_RESISTANCE = 0.5;  // finger moves 2px → indicator moves 1px

    // Rubber-band the raw finger travel into indicator travel.
    function pullDistance(rawDelta, resistance = PULL_RESISTANCE, max = PULL_MAX) {
        const d = Number(rawDelta);
        if (!Number.isFinite(d) || d <= 0) return 0;
        return Math.min(d * resistance, max);
    }

    // A tiny state machine for one pull gesture.  Feed it touch Y positions; it
    // tells you how far to draw the indicator and whether to refresh on release.
    //
    //   const t = createPullTracker();
    //   t.start(y, { atTop: true });
    //   t.move(y) -> { active, distance, ready }
    //   t.end()   -> { refresh, distance }
    function createPullTracker({
        threshold = PULL_THRESHOLD,
        max = PULL_MAX,
        resistance = PULL_RESISTANCE,
    } = {}) {
        let tracking = false;     // finger is down at the top of the page
        let active = false;       // the pull has actually begun (moved downward)
        let startY = 0;
        let distance = 0;

        function reset() {
            tracking = false;
            active = false;
            startY = 0;
            distance = 0;
        }

        return {
            // Begin only when the page is scrolled to the very top — otherwise the
            // gesture belongs to the scroller, not to us.
            start(y, { atTop = false, enabled = true } = {}) {
                reset();
                if (!atTop || !enabled) return false;
                tracking = true;
                startY = Number(y) || 0;
                return true;
            },

            move(y) {
                if (!tracking) return { active: false, distance: 0, ready: false };
                const raw = (Number(y) || 0) - startY;
                if (raw <= 0) {
                    // Pulled back up past the origin: cancel, and let the browser
                    // scroll normally again.
                    active = false;
                    distance = 0;
                    return { active: false, distance: 0, ready: false };
                }
                active = true;
                distance = pullDistance(raw, resistance, max);
                return { active: true, distance, ready: distance >= threshold };
            },

            end() {
                const refresh = active && distance >= threshold;
                const last = distance;
                reset();
                return { refresh, distance: last };
            },

            cancel() {
                reset();
                return { refresh: false, distance: 0 };
            },

            get active() { return active; },
            get distance() { return distance; },
            get threshold() { return threshold; },
        };
    }

    return {
        DISMISS_KEY, SNOOZE_MS,
        PULL_THRESHOLD, PULL_MAX, PULL_RESISTANCE,
        isStandaloneDisplay, isIOS, isIOSSafari,
        installAvailability, shouldShowBanner, shouldShowIcon,
        pullDistance, createPullTracker,
    };
});
