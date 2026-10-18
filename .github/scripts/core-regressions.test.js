'use strict';

const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );

const { testId, playwrightResults, junitResults, plan, issueBody } = require( './core-regressions.js' );

const report = ( tests ) => ( {
	suites: [
		{
			title: 'player.spec.js',
			file: 'player.spec.js',
			specs: [],
			suites: [
				{
					title: 'Player',
					specs: tests.map( ( [ title, status, message ] ) => ( {
						title,
						file: 'player.spec.js',
						tests: [
							{
								projectName: 'chromium',
								status,
								results: [ { error: message ? { message: `\u001b[31mError:\u001b[39m ${ message }\n    at line 3` } : undefined } ],
							},
						],
					} ) ),
				},
			],
		},
	],
} );

const junit = ( cases ) =>
	`<?xml version="1.0"?><testsuites><testsuite name="all">${ cases
		.map( ( [ name, failure ] ) =>
			failure
				? `<testcase name="${ name }" class="Test_Riff_Media"><failure type="x">Failed asserting that &quot;a&quot; is &lt;b&gt;.\nmore</failure></testcase>`
				: `<testcase name="${ name }" class="Test_Riff_Media"/>`
		)
		.join( '' ) }</testsuite></testsuites>`;

const suite = ( tests, core ) => ( { tests, core } );

test( 'reads a Playwright report: names, failures, first message line without colours, skips left out', () => {
	const results = playwrightResults(
		report( [
			[ 'plays', 'expected' ],
			[ 'seeks', 'unexpected', 'expect(locator).toBeVisible() failed' ],
			[ 'casts', 'skipped' ],
		] )
	);
	assert.equal( results.size, 2 );
	const seeks = results.get( testId( 'e2e › player.spec.js › Player › seeks [chromium]' ) );
	assert.equal( seeks.failed, true );
	assert.equal( seeks.message, 'Error: expect(locator).toBeVisible() failed' );
	assert.equal( results.get( testId( 'e2e › player.spec.js › Player › plays [chromium]' ) ).failed, false );
} );

test( 'a flaky test, which passed on retry, is not a failure', () => {
	const results = playwrightResults( report( [ [ 'plays', 'flaky', 'timed out' ] ] ) );
	assert.equal( [ ...results.values() ][ 0 ].failed, false );
} );

test( 'reads JUnit: failures with decoded messages, passes, skips left out', () => {
	const xml = junit( [ [ 'test_a', true ], [ 'test_b', false ] ] ).replace( '</testsuite>', '<testcase name="test_c" class="Test_Riff_Media"><skipped/></testcase></testsuite>' );
	const results = junitResults( xml );
	assert.equal( results.size, 2 );
	const a = results.get( testId( 'phpunit › Test_Riff_Media::test_a' ) );
	assert.equal( a.failed, true );
	assert.equal( a.message, 'Failed asserting that "a" is <b>.' );
	assert.equal( results.get( testId( 'phpunit › Test_Riff_Media::test_b' ) ).failed, false );
} );

test( 'a test failing on trunk and passing on the release opens an issue', () => {
	const trunk = suite( junitResults( junit( [ [ 'test_a', true ] ] ) ), '7.2-alpha-61000' );
	const release = suite( junitResults( junit( [ [ 'test_a', false ] ] ) ), '7.1' );
	const actions = plan( trunk, release, [] );
	assert.equal( actions.create.length, 1 );
	assert.equal( actions.comment.length + actions.close.length, 0 );
	const body = issueBody( actions.create[ 0 ].id, actions.create[ 0 ].test, { trunkCore: '7.2-alpha-61000', releaseCore: '7.1', runUrl: 'https://example.test/run' } );
	assert.match( body, /Trunk: 7\.2-alpha-61000, failing/ );
	assert.match( body, new RegExp( `<!-- riff-core-regression: ${ actions.create[ 0 ].id } -->` ) );
} );

test( 'a test failing on the release too is Riff\'s own failure and opens nothing', () => {
	const failing = junitResults( junit( [ [ 'test_a', true ] ] ) );
	assert.deepEqual( plan( suite( failing ), suite( failing ), [] ), { create: [], comment: [], close: [] } );
} );

test( 'a test that did not run on the release opens nothing', () => {
	const trunk = suite( junitResults( junit( [ [ 'test_new', true ] ] ) ) );
	const release = suite( junitResults( junit( [ [ 'test_a', false ] ] ) ) );
	assert.equal( plan( trunk, release, [] ).create.length, 0 );
} );

test( 'a regression with an open issue gets a comment, not a second issue', () => {
	const trunk = suite( junitResults( junit( [ [ 'test_a', true ] ] ) ) );
	const release = suite( junitResults( junit( [ [ 'test_a', false ] ] ) ) );
	const id = testId( 'phpunit › Test_Riff_Media::test_a' );
	const actions = plan( trunk, release, [ { number: 41, body: `...\n<!-- riff-core-regression: ${ id } -->` } ] );
	assert.deepEqual( actions.comment.map( ( a ) => a.number ), [ 41 ] );
	assert.equal( actions.create.length, 0 );
} );

test( 'an open issue closes once its test passes on trunk, and others are left alone', () => {
	const trunk = suite( junitResults( junit( [ [ 'test_a', false ] ] ) ) );
	const release = suite( junitResults( junit( [ [ 'test_a', false ] ] ) ) );
	const id = testId( 'phpunit › Test_Riff_Media::test_a' );
	const actions = plan( trunk, release, [
		{ number: 41, body: `<!-- riff-core-regression: ${ id } -->` },
		{ number: 42, body: '<!-- riff-core-regression: 000000000000 -->' },
		{ number: 43, body: 'filed by hand' },
	] );
	assert.deepEqual( actions.close.map( ( a ) => a.number ), [ 41 ] );
} );
