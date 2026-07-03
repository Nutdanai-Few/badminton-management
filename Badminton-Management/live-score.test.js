// Tests for live-score.js — badminton 21-point game rules for the live scorer.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    WIN_SCORE, CAP_SCORE,
    clampScore, gameWinner, isGameOver, isGamePoint, canIncrement,
} = require('./live-score.js');

test('constants', () => {
    assert.equal(WIN_SCORE, 21);
    assert.equal(CAP_SCORE, 30);
});

test('clampScore floors, rounds, and caps', () => {
    assert.equal(clampScore(-5), 0);
    assert.equal(clampScore(0), 0);
    assert.equal(clampScore(15), 15);
    assert.equal(clampScore(30), 30);
    assert.equal(clampScore(45), 30);      // capped
    assert.equal(clampScore(3.6), 4);      // rounded
    assert.equal(clampScore('12'), 12);
    assert.equal(clampScore('x'), 0);
    assert.equal(clampScore(null), 0);
});

test('in-progress scores have no winner', () => {
    assert.equal(gameWinner(0, 0), null);
    assert.equal(gameWinner(10, 8), null);
    assert.equal(gameWinner(20, 19), null);   // not yet 21
    assert.equal(gameWinner(21, 20), null);    // 21 but lead is only 1
    assert.equal(gameWinner(20, 20), null);    // deuce
    assert.equal(gameWinner(25, 24), null);    // deuce continues
    assert.equal(isGameOver(15, 10), false);
});

test('plain 21 win by 2 or more', () => {
    assert.equal(gameWinner(21, 0), 'A');
    assert.equal(gameWinner(21, 19), 'A');
    assert.equal(gameWinner(19, 21), 'B');
    assert.equal(gameWinner(15, 21), 'B');
    assert.equal(isGameOver(21, 19), true);
});

test('deuce past 20-20 needs a 2-point lead', () => {
    assert.equal(gameWinner(22, 20), 'A');
    assert.equal(gameWinner(20, 22), 'B');
    assert.equal(gameWinner(24, 22), 'A');
    assert.equal(gameWinner(23, 22), null);    // only 1 ahead
    assert.equal(gameWinner(24, 23), null);
});

test('hard cap at 30 — first to 30 wins even by 1', () => {
    assert.equal(gameWinner(30, 29), 'A');
    assert.equal(gameWinner(29, 30), 'B');
    assert.equal(gameWinner(29, 29), null);    // still going
    // scores can never legally exceed 30 (clamped)
    assert.equal(gameWinner(31, 29), 'A');
});

test('isGamePoint flags the side one point from winning', () => {
    assert.deepEqual(isGamePoint(20, 15), { A: true, B: false });
    assert.deepEqual(isGamePoint(15, 20), { A: false, B: true });
    assert.deepEqual(isGamePoint(20, 20), { A: false, B: false }); // deuce: +1 → 21-20, not a win
    assert.deepEqual(isGamePoint(29, 28), { A: true, B: false });  // cap point (30 wins)
    assert.deepEqual(isGamePoint(29, 29), { A: true, B: true });   // either reaching 30 wins
    assert.deepEqual(isGamePoint(21, 19), { A: false, B: false }); // already over
});

test('canIncrement blocks once the game is decided', () => {
    assert.equal(canIncrement(10, 8), true);
    assert.equal(canIncrement(20, 20), true);
    assert.equal(canIncrement(21, 19), false);
    assert.equal(canIncrement(30, 29), false);
});
