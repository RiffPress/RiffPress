/**
 * What ships says what its tag says, and every package's release ends published with its zip
 * (release-check.js).
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert' );
const { execFileSync } = require( 'node:child_process' );
const fs = require( 'node:fs' );
const os = require( 'node:os' );
const path = require( 'node:path' );
const { packages, parseTag, versionProblems, releaseProblems, supersededDrafts } = require( './release-check.js' );

const root = path.join( __dirname, '..', '..' );
const config = JSON.parse( fs.readFileSync( path.join( root, 'release-please-config.json' ), 'utf8' ) );
const main = ( version, define = version ) =>
	`<?php\n/**\n * Plugin Name: Riff Lyrics\n * Version: ${ version }\n */\n\ndefine( 'RIFF_LYRICS_VERSION', '${ define }' );\n`;
const readme = ( version ) => `=== Riff Lyrics ===\nStable tag: ${ version }\n`;

test( 'a tag names its component and version', () => {
	assert.deepStrictEqual( parseTag( 'riff-sign-in-v0.6.0' ), { component: 'riff-sign-in', version: '0.6.0' } );
	assert.deepStrictEqual( parseTag( 'riff-v6.11.0' ), { component: 'riff', version: '6.11.0' } );
	assert.strictEqual( parseTag( 'v6.11.0' ), null );
	assert.strictEqual( parseTag( 'riff-v6.11.0; rm -rf /' ), null );
} );

test( 'every plugin in release-please-config.json ships a zip, and a release job for it exists', () => {
	const workflow = fs.readFileSync( path.join( root, '.github/workflows/release-please.yml' ), 'utf8' );
	for ( const pkg of packages( config ).filter( ( p ) => p.zip ) ) {
		assert.ok( workflow.includes( `release-check.js zip "$TAG_NAME" build/${ pkg.zip }` ), `${ pkg.component } is checked and released` );
	}
	assert.strictEqual( packages( config ).find( ( p ) => p.component === 'wp-api-coverage' ).zip, null );
} );

test( 'matching version strings pass', () => {
	assert.deepStrictEqual( versionProblems( '1.9.0', main( '1.9.0' ), readme( '1.9.0' ) ), [] );
} );

test( 'a header, define or Stable tag that disagrees with the tag fails', () => {
	assert.deepStrictEqual( versionProblems( '1.9.1', main( '1.9.0' ), readme( '1.9.1' ) ), [
		'the header says Version: 1.9.0',
		'RIFF_LYRICS_VERSION is 1.9.0',
	] );
	assert.deepStrictEqual( versionProblems( '1.9.0', main( '1.9.0', '1.8.0' ), readme( '1.9.0' ) ), [ 'RIFF_LYRICS_VERSION is 1.8.0' ] );
	assert.deepStrictEqual( versionProblems( '1.9.0', main( '1.9.0' ), readme( '1.8.0' ) ), [ 'readme.txt says Stable tag: 1.8.0' ] );
	assert.strictEqual( versionProblems( '1.9.0', '', '' ).length, 2, 'a zip without the files fails' );
} );

test( 'the plugins in the repository agree with the manifest', () => {
	assert.doesNotThrow( () => execFileSync( 'node', [ path.join( __dirname, 'release-check.js' ), 'tree' ], { stdio: 'pipe' } ) );
	const manifest = JSON.parse( fs.readFileSync( path.join( root, '.release-please-manifest.json' ), 'utf8' ) );
	for ( const pkg of packages( config ).filter( ( p ) => p.zip ) ) {
		const dir = path.join( root, pkg.folder );
		const found = versionProblems(
			manifest[ pkg.folder ],
			fs.readFileSync( path.join( dir, `${ pkg.component }.php` ), 'utf8' ),
			fs.readFileSync( path.join( dir, 'readme.txt' ), 'utf8' )
		);
		assert.deepStrictEqual( found, [], pkg.component );
	}
} );

test( 'the check reads the zip itself', () => {
	const dir = fs.mkdtempSync( path.join( os.tmpdir(), 'release-check-' ) );
	fs.mkdirSync( path.join( dir, 'riff-lyrics' ) );
	fs.writeFileSync( path.join( dir, 'riff-lyrics', 'riff-lyrics.php' ), main( '1.9.0' ) );
	fs.writeFileSync( path.join( dir, 'riff-lyrics', 'readme.txt' ), readme( '1.9.0' ) );
	execFileSync( 'zip', [ '-qr', 'riff-lyrics.zip', 'riff-lyrics' ], { cwd: dir } );
	const script = path.join( __dirname, 'release-check.js' );
	const zip = path.join( dir, 'riff-lyrics.zip' );
	assert.doesNotThrow( () => execFileSync( 'node', [ script, 'zip', 'riff-lyrics-v1.9.0', zip ], { stdio: 'pipe' } ) );
	assert.throws( () => execFileSync( 'node', [ script, 'zip', 'riff-lyrics-v1.9.1', zip ], { stdio: 'pipe' } ) );
	assert.throws( () => execFileSync( 'node', [ script, 'zip', 'riff-lyrics-v1.9.0', path.join( dir, 'none.zip' ) ], { stdio: 'pipe' } ) );
	fs.rmSync( dir, { recursive: true, force: true } );
} );

test( 'a draft, or a release without its zip, is named; others are left alone', () => {
	const pkgs = packages( config );
	const releases = [
		{ tag_name: 'riff-v6.11.0', draft: false, assets: [ { name: 'riff.zip' } ] },
		{ tag_name: 'riff-chimera-v0.2.0', draft: true, assets: [ { name: 'riff-chimera.zip' } ] },
		{ tag_name: 'riff-sing-v0.8.0', draft: false, assets: [] },
		{ tag_name: 'wp-api-coverage-v0.1.0', draft: false, assets: [] },
		{ tag_name: 'riff-desktop-v0.1.0', draft: true, assets: [] },
	];
	const found = releaseProblems( releases, pkgs );
	assert.strictEqual( found.length, 2 );
	assert.match( found[ 0 ], /^riff-chimera-v0\.2\.0 is still a draft: / );
	assert.match( found[ 1 ], /^riff-sing-v0\.8\.0 is published without riff-sing\.zip: / );
} );

test( 'a draft says how it came about and both ways out', () => {
	const [ found ] = releaseProblems( [ { tag_name: 'riff-v6.12.0', draft: true, assets: [] } ], packages( config ) );
	assert.match( found, /did not finish/ );
	assert.match( found, /"is not 6\.12\.0"/, 'names the message an unsynced tag fails with' );
	assert.match( found, /gh release delete riff-v6\.12\.0 --cleanup-tag --yes/ );
	assert.match( found, /re-run the failed job/ );
} );

test( 'a draft a newer published release superseded is only warned about, with the delete command', () => {
	const pkgs = packages( config );
	const releases = [
		{ tag_name: 'riff-v6.17.1', draft: true, assets: [] },
		{ tag_name: 'riff-v6.9.0', draft: true, assets: [] },
		{ tag_name: 'riff-v6.17.2', draft: false, assets: [ { name: 'riff.zip' } ] },
		{ tag_name: 'riff-v6.17.3', draft: true, assets: [] },
		{ tag_name: 'riff-lyrics-v1.9.1', draft: true, assets: [] },
	];
	const found = releaseProblems( releases, pkgs );
	assert.strictEqual( found.length, 2, 'the newest draft, and a draft with nothing published after it, still fail' );
	assert.match( found[ 0 ], /^riff-v6\.17\.3 is still a draft: / );
	assert.match( found[ 1 ], /^riff-lyrics-v1\.9\.1 is still a draft: / );
	const litter = supersededDrafts( releases, pkgs );
	assert.strictEqual( litter.length, 2, '6.9.0 is older than 6.17.2 by number, not by string' );
	assert.match( litter[ 0 ], /^riff-v6\.17\.1 is a draft that riff-v6\.17\.2 has superseded: .*gh release delete riff-v6\.17\.1 --cleanup-tag --yes/ );
	assert.match( litter[ 1 ], /^riff-v6\.9\.0 / );
} );

/*
 * The release train's interlock: a release pull request is a draft, which GitHub will not merge,
 * from the moment release-please may rebuild it until sync-versions has checked the synced commit.
 * These hold the workflow to that order, since nothing else would notice a step moved.
 */
const workflow = fs.readFileSync( path.join( root, '.github/workflows/release-please.yml' ), 'utf8' );
const job = ( name ) => {
	const start = workflow.indexOf( `\n  ${ name }:\n` );
	assert.ok( start >= 0, `${ name } job exists` );
	const next = workflow.slice( start + 1 ).search( /\n  [a-z-]+:\n/ );
	return workflow.slice( start, next < 0 ? undefined : start + 1 + next );
};

test( 'release-please opens its pull request as a draft', () => {
	assert.strictEqual( config[ 'draft-pull-request' ], true );
} );

test( 'the open release pull request is made a draft before release-please can rebuild it', () => {
	const steps = job( 'release-please' );
	const hold = steps.indexOf( 'gh pr ready "$NUMBER" --undo' );
	const action = steps.indexOf( 'uses: googleapis/release-please-action@' );
	assert.ok( hold > 0 && action > 0 && hold < action, 'the draft step runs first' );
	assert.match( steps.slice( 0, action ), /exit 1/, 'and a failure stops the job before release-please runs' );
} );

test( 'only sync-versions marks it ready, after checking the commit it pushed is synced', () => {
	const steps = job( 'sync-versions' );
	const push = steps.indexOf( 'git push' );
	const tree = steps.indexOf( 'release-check.js tree' );
	const changelog = steps.indexOf( 'readme-changelog.js --check' );
	const same = steps.indexOf( '"$REMOTE_SHA" != "$HEAD_SHA"' );
	const ready = steps.search( /gh pr ready "\$NUMBER"\n/ );
	assert.ok( push > 0 && push < tree && tree < changelog && changelog < same && same < ready, 'push, check, compare, ready' );
	assert.strictEqual( workflow.match( /gh pr ready "\$NUMBER"\n/g ).length, 1, 'nothing else marks it ready' );
	assert.match( steps, /pull-requests: write/ );
} );

test( 'sync-versions passes quietly when the release branch is gone', () => {
	const steps = job( 'sync-versions' );
	const check = steps.indexOf( 'Check the release branch still exists' );
	assert.ok( check > 0 && check < steps.indexOf( 'actions/checkout@' ) );
	const after = steps.slice( check ).split( '\n      - ' ).slice( 1 );
	for ( const step of after ) {
		assert.match( step, /if: steps\.branch\.outputs\.exists == 'true'/, step.split( '\n' )[ 0 ] );
	}
} );

test( 'CI runs the full suite on the release pull request while it is a draft', () => {
	const ci = fs.readFileSync( path.join( root, '.github/workflows/ci.yml' ), 'utf8' );
	assert.match( ci, /heavy: .*! github\.event\.pull_request\.draft \|\| github\.head_ref == 'release-please--branches--main'/ );
} );
