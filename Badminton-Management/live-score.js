// live-score.js
// Pure, side-effect-free badminton game-rule helpers for the live court scorer.
// No DOM, no Firebase — so the rules can be unit-tested under `node --test`.
//
// Official 21-point rules encoded here (as requested by the user):
//   - First side to 21 wins, BUT must lead by 2.
//   - From 20-20 it is deuce: keep playing until one side leads by 2 (e.g. 22-24).
//   - Hard cap at 30: the first side to reach 30 wins immediately, even by 1 (30-29).
//
// Same tiny UMD wrapper as the other pure modules so the SAME file works as a
// browser <script> global (LiveScore) AND as a CommonJS module (tests).
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;        // Node (test suite)
    } else {
        root.LiveScore = api;        // Browser global
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    const WIN_SCORE = 21;   // target to win a game
    const CAP_SCORE = 30;   // hard ceiling — first to 30 wins even by 1

    // Coerce anything to a valid score integer in [0, CAP_SCORE].
    function clampScore(n) {
        const v = Math.round(Number(n));
        if (!Number.isFinite(v) || v < 0) return 0;
        return Math.min(v, CAP_SCORE);
    }

    // Who has WON the game at this score, or null if it is still in progress.
    // A wins if it reached the cap ahead, or reached 21+ with a 2-point lead.
    function gameWinner(a, b) {
        a = clampScore(a);
        b = clampScore(b);
        if ((a >= CAP_SCORE && a > b) || (a >= WIN_SCORE && a - b >= 2)) return 'A';
        if ((b >= CAP_SCORE && b > a) || (b >= WIN_SCORE && b - a >= 2)) return 'B';
        return null;
    }

    function isGameOver(a, b) {
        return gameWinner(a, b) !== null;
    }

    // Which side (if any) would win by scoring the next point — used to flash
    // "game point / match point".  Returns { A: bool, B: bool }.
    function isGamePoint(a, b) {
        a = clampScore(a);
        b = clampScore(b);
        if (isGameOver(a, b)) return { A: false, B: false };
        return {
            A: gameWinner(a + 1, b) === 'A',
            B: gameWinner(a, b + 1) === 'B',
        };
    }

    // May a point still be added to this side?  No once the game is decided (and
    // never past the cap, which is already implied by the game being over).
    function canIncrement(a, b) {
        return !isGameOver(a, b);
    }

    return {
        WIN_SCORE, CAP_SCORE,
        clampScore, gameWinner, isGameOver, isGamePoint, canIncrement,
    };
});
