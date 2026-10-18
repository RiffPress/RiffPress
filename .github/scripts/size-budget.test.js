'use strict';

const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const { overBudget, table } = require( './size-budget.js' );

const budget = { tracks: 5000, cases: { tracks: { queries: 12, ms: 300 }, albums: { queries: 16, ms: 300 } } };
const ok = { database: 'test', tracks: 5000, cases: { tracks: { ms: 40, queries: 9, status: 200 }, albums: { ms: 120, queries: 13, status: 200 } } };

test( 'within budget passes', () => {
	assert.deepEqual( overBudget( ok, budget ), [] );
	assert.match( table( ok, budget ), /\| albums \| 120 ms \| 300 ms \| 13 \| 16 \|/ );
} );

test( 'too many queries, too slow, an error, a missing request, or a small catalogue fail', () => {
	const bad = {
		database: 'test',
		tracks: 50,
		cases: { tracks: { ms: 900, queries: 60, status: 500 } },
	};
	assert.deepEqual( overBudget( bad, budget ), [
		'measured 50 tracks, the budget is for 5000',
		'tracks: answered 500',
		'tracks: 60 queries, budget 12',
		'tracks: 900 ms, ceiling 300',
		'albums: not measured',
	] );
} );
