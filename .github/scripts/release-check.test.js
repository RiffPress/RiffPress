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
const { packages, parseTag, versionProblems, releaseProblems } = require( './release-check.js' );

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
	assert.deepStrictEqual( releaseProblems( releases, pkgs ), [
		'riff-chimera-v0.2.0 is still a draft',
		'riff-sing-v0.8.0 is published without riff-sing.zip',
	] );
} );
