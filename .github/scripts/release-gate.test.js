/**
 * The release pull request merges itself only from a green main, after the full suite ran on it
 * (release-gate.js).
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert' );
const { decide, unsynced, BRANCH, LABEL } = require( './release-gate.js' );

const REPO = 'RiffPress/RiffPress';
let id = 0;
const run = ( name, conclusion = 'success', status = 'completed' ) => ( { id: ++id, name, status, conclusion } );
const green = () => [
	run( 'CI status' ),
	run( 'phpunit / WordPress test suite (PHP 8.5, latest, single site)' ),
	run( 'e2e / Playwright (1/4)' ),
	run( 'plugin-check / Plugin Check (riff)' ),
	run( 'Analyze (javascript-typescript)' ),
];
const pull = ( extra = {} ) => ( {
	number: 7,
	draft: false,
	head: { ref: BRANCH, sha: 'abc', repo: { full_name: REPO } },
	base: { ref: 'main' },
	labels: [ { name: LABEL } ],
	...extra,
} );
const input = ( extra = {} ) => ( {
	killSwitch: '',
	repo: REPO,
	pulls: [ pull() ],
	behindBy: 0,
	prRuns: green(),
	mainRuns: [ run( 'CI status' ), run( 'Analyze (actions)' ) ],
	unsynced: [],
	...extra,
} );

test( 'a green release pull request on a green main merges', () => {
	assert.deepStrictEqual( { ...decide( input() ), reasons: undefined }, { action: 'merge', number: 7, head: 'abc', reasons: undefined } );
} );

test( 'the kill switch stops it, whatever the checks say', () => {
	assert.strictEqual( decide( input( { killSwitch: 'false' } ) ).action, 'off' );
	assert.strictEqual( decide( input( { killSwitch: ' FALSE ' } ) ).action, 'off' );
	assert.strictEqual( decide( input( { killSwitch: 'true' } ) ).action, 'merge' );
} );

test( 'a red main blocks it, even when the release pull request is green', () => {
	const decision = decide( input( { mainRuns: [ run( 'CI status', 'failure' ) ] } ) );
	assert.strictEqual( decision.action, 'block' );
	assert.match( decision.reasons.join( '\n' ), /CI status is failure on main/ );
} );

test( 'a red job inside the release pull request blocks it', () => {
	const decision = decide( input( { prRuns: [ ...green(), run( 'e2e / Playwright (2/4)', 'timed_out' ) ] } ) );
	assert.strictEqual( decision.action, 'block' );
} );

test( 'a re-run that passed replaces the run that failed', () => {
	const failed = run( 'e2e / Playwright (1/4)', 'failure' );
	assert.strictEqual( decide( input( { prRuns: [ failed, ...green() ] } ) ).action, 'merge' );
} );

test( 'a trivially green release pull request, with the full suite skipped, blocks', () => {
	const prRuns = [ run( 'CI status' ), run( 'phpunit / WordPress test suite', 'skipped' ), run( 'e2e / Playwright', 'skipped' ), run( 'plugin-check / Plugin Check', 'skipped' ) ];
	const decision = decide( input( { prRuns } ) );
	assert.strictEqual( decision.action, 'block' );
	assert.match( decision.reasons.join( '\n' ), /phpunit \/ did not run/ );
	assert.strictEqual( decide( input( { prRuns: [ run( 'CI status' ) ] } ) ).action, 'block' );
} );

test( 'anything still running, cancelled or missing waits', () => {
	assert.strictEqual( decide( input( { mainRuns: [ run( 'CI status', null, 'in_progress' ) ] } ) ).action, 'wait' );
	assert.strictEqual( decide( input( { mainRuns: [] } ) ).action, 'wait' );
	assert.strictEqual( decide( input( { prRuns: [] } ) ).action, 'wait', 'CI held for approval has not reported yet' );
	assert.strictEqual( decide( input( { mainRuns: [ run( 'CI status', 'cancelled' ) ] } ) ).action, 'wait' );
	assert.strictEqual( decide( input( { prRuns: [ ...green(), run( 'Analyze (python)', null, 'queued' ) ] } ) ).action, 'wait' );
} );

test( 'checks outside the gate, like this workflow or a site deploy, do not hold it', () => {
	const mainRuns = [ run( 'CI status' ), run( 'deploy', 'failure' ), run( 'gate-and-merge', null, 'in_progress' ) ];
	assert.strictEqual( decide( input( { mainRuns } ) ).action, 'merge' );
} );

test( 'a release pull request behind main waits for sync-versions', () => {
	assert.strictEqual( decide( input( { behindBy: 2 } ) ).action, 'wait' );
} );

test( 'only release-please\'s own pull request, from this repository, labelled, qualifies', () => {
	assert.strictEqual( decide( input( { pulls: [] } ) ).action, 'wait' );
	assert.strictEqual( decide( input( { pulls: [ pull( { draft: true } ) ] } ) ).action, 'wait' );
	assert.strictEqual( decide( input( { pulls: [ pull( { labels: [] } ) ] } ) ).action, 'wait' );
	const fork = pull( { head: { ref: BRANCH, sha: 'abc', repo: { full_name: 'someone/RiffPress' } } } );
	assert.strictEqual( decide( input( { pulls: [ fork ] } ) ).action, 'wait' );
	assert.strictEqual( decide( input( { pulls: [ pull( { base: { ref: 'other' } } ) ] } ) ).action, 'wait' );
} );

// A release pull request that moves Riff to 6.17.6 and Riff Sign In nowhere.
const config = {
	packages: {
		'plugins/riff': { component: 'riff' },
		'plugins/riff-sign-in': { component: 'riff-sign-in' },
		'packages/wp-api-coverage': { component: 'wp-api-coverage' },
	},
};
const mainManifest = { 'plugins/riff': '6.17.5', 'plugins/riff-sign-in': '0.9.0', 'packages/wp-api-coverage': '0.3.0' };
const headManifest = { ...mainManifest, 'plugins/riff': '6.17.6' };
const plugin = ( define, version ) => `<?php\n/**\n * Plugin Name: X\n * Version: ${ version }\n */\ndefine( '${ define }', '${ version }' );\n`;
const readme = ( version ) => `=== X ===\nStable tag: ${ version }\n`;
const tree = ( files ) => ( file ) => ( file in files ? files[ file ] : null );
const synced = {
	'plugins/riff/riff.php': plugin( 'RIFF_VERSION', '6.17.6' ),
	'plugins/riff/readme.txt': readme( '6.17.6' ),
	// Left at its old version: this pull request does not release it.
	'plugins/riff-sign-in/riff-sign-in.php': plugin( 'RIFF_SIGN_IN_VERSION', '0.8.0' ),
	'plugins/riff-sign-in/readme.txt': readme( '0.8.0' ),
};

test( 'a head whose moving packages say their new version is synced', () => {
	assert.deepStrictEqual( unsynced( { config, headManifest, mainManifest, read: tree( synced ) } ), [] );
} );

test( 'release-please\'s own commit alone, before sync-versions, is not synced, and waits', () => {
	const found = unsynced( {
		config,
		headManifest,
		mainManifest,
		read: tree( { ...synced, 'plugins/riff/riff.php': plugin( 'RIFF_VERSION', '6.17.5' ), 'plugins/riff/readme.txt': readme( '6.17.5' ) } ),
	} );
	assert.deepStrictEqual( found, [
		'riff is 6.17.6 in the manifest, but the header says Version: 6.17.5',
		'riff is 6.17.6 in the manifest, but RIFF_VERSION is 6.17.5',
		'riff is 6.17.6 in the manifest, but readme.txt says Stable tag: 6.17.5',
	] );
	const decision = decide( input( { unsynced: found } ) );
	assert.strictEqual( decision.action, 'wait' );
	assert.match( decision.reasons.join( '\n' ), /not synced at abc/ );
	assert.match( decision.reasons.join( '\n' ), /RIFF_VERSION is 6\.17\.5/ );
} );

test( 'it waits on an unsynced head even when it is not a draft and every check is green', () => {
	assert.strictEqual( decide( input( { pulls: [ pull( { draft: false } ) ], unsynced: [ 'riff is 6.17.6 in the manifest, but x' ] } ) ).action, 'wait' );
} );

test( 'a file it cannot read at the head is not synced', () => {
	const files = { ...synced };
	delete files[ 'plugins/riff/readme.txt' ];
	assert.deepStrictEqual( unsynced( { config, headManifest, mainManifest, read: tree( files ) } ), [
		'riff is 6.17.6 in the manifest, but its readme.txt could not be read',
	] );
} );

test( 'a package without a plugin is synced by its package.json', () => {
	const moved = { ...headManifest, 'packages/wp-api-coverage': '0.4.0' };
	const stale = { ...synced, 'packages/wp-api-coverage/package.json': '{ "version": "0.3.0" }' };
	assert.deepStrictEqual( unsynced( { config, headManifest: moved, mainManifest, read: tree( stale ) } ), [
		'wp-api-coverage is 0.4.0 in the manifest, but its package.json says 0.3.0',
	] );
	const fresh = { ...synced, 'packages/wp-api-coverage/package.json': '{ "version": "0.4.0" }' };
	assert.deepStrictEqual( unsynced( { config, headManifest: moved, mainManifest, read: tree( fresh ) } ), [] );
} );

test( 'a decision without the head\'s version strings read waits', () => {
	assert.strictEqual( decide( input( { unsynced: undefined } ) ).action, 'wait' );
} );
