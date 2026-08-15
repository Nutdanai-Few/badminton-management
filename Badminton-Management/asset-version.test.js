// Tests for the cache-busting invariant.
//
// Regression guard for a real deploy failure: GitHub Pages serves every file with
// `cache-control: max-age=600` and no filename hashing, so after a deploy a phone
// paired the freshly-revalidated index.html with a stale style.css and script.js
// out of its own HTTP cache.  The result was a giant unstyled pull-to-refresh
// arrow shoved into the page flow and no install button at all — the new markup
// running against the old CSS/JS.
//
// The fix is a ?v= token on every local asset URL.  These tests fail if a token is
// missing, if the tokens drift apart, or if sw.js precaches URLs the page never
// asks for — any of which would let the bug come back.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const html = read('index.html');
const sw = read('sw.js');

// Every local <script src> and <link rel=stylesheet href> in index.html.
function localAssetUrls(markup) {
    const urls = [];
    const re = /<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g;
    let m;
    while ((m = re.exec(markup)) !== null) {
        const url = m[1];
        if (/^https?:|^\/\//.test(url)) continue;               // CDN
        if (/\.(js|css)(\?|$)/.test(url)) urls.push(url);
        else if (/\.webmanifest(\?|$)/.test(url)) urls.push(url);
    }
    return urls;
}

const assets = localAssetUrls(html);

test('index.html actually loads local scripts and the stylesheet', () => {
    assert.ok(assets.length >= 9, `expected the full module list, got ${assets.length}`);
    for (const f of ['style.css', 'script.js', 'pwa.js', 'schedule.js', 'sync-guard.js']) {
        assert.ok(assets.some(u => u.startsWith(f)), `${f} is not referenced by index.html`);
    }
});

test('every local .js/.css asset carries a ?v= cache-busting token', () => {
    for (const url of assets) {
        if (url.endsWith('.webmanifest')) continue;   // never mixed with stale code
        assert.match(url, /\?v=[A-Za-z0-9._-]+$/, `${url} has no ?v= token`);
    }
});

test('all assets share one version token, so no file can lag behind', () => {
    const tokens = new Set(
        assets.filter(u => u.includes('?v='))
            .map(u => u.split('?v=')[1])
    );
    assert.equal(tokens.size, 1, `mixed version tokens: ${[...tokens].join(', ')}`);
});

test('sw.js precaches exactly the versioned URLs the page requests', () => {
    for (const url of assets) {
        if (url.endsWith('.webmanifest')) continue;
        assert.ok(
            sw.includes(`'./${url}'`),
            `sw.js SHELL is missing './${url}' — the worker would precache a URL nobody requests`
        );
    }
});

test('sw.js never serves same-origin files straight from the HTTP cache', () => {
    // The stale-asset bug came from the browser cache answering a plain fetch().
    assert.match(sw, /cache:\s*'no-cache'/, "networkFirst must revalidate with the server");
});

test('the pull-to-refresh indicator starts hidden in the markup', () => {
    // With a stale stylesheet this element used to render as a full-width arrow in
    // the page flow; `hidden` keeps it invisible until script.js reveals it.
    assert.match(html, /id="ptr-indicator"[^>]*\shidden/, '#ptr-indicator must start hidden');
    assert.match(read('style.css'), /\.ptr-indicator\[hidden\]\s*\{\s*display:\s*none/,
        '.ptr-indicator sets display:grid, so it needs an explicit [hidden] rule');
    assert.match(read('script.js'), /ptrIndicator\.hidden = false/,
        'script.js must reveal the indicator when a pull starts');
});

test('the install banner also starts hidden', () => {
    assert.match(html, /id="install-banner"[^>]*\shidden/, '#install-banner must start hidden');
    assert.match(html, /id="install-icon-btn"[^>]*\shidden/, '#install-icon-btn must start hidden');
});
