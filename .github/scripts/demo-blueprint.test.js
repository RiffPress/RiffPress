'use strict';

const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const fs = require( 'fs' );
const os = require( 'os' );
const path = require( 'path' );

const {
	urls,
	isAbsolute,
	resolve,
	demoFiles,
	stage,
	check,
} = require( './demo-blueprint.js' );

const ROOT = path.join( __dirname, '..', '..' );
const read = ( file ) => fs.readFileSync( path.join( ROOT, file ), 'utf8' );
const source = () => JSON.parse( read( 'blueprint.json' ) );

const blueprint = ( ...names ) => ( {
	steps: [
		{
			step: 'installPlugin',
			pluginData: { resource: 'url', url: 'riff.zip' },
		},
		...names.map( ( name ) => ( {
			step: 'writeFile',
			path: `/wordpress/wp-content/riff-demo/compositions/${ name }`,
			data: {
				resource: 'url',
				url: `demo/${ encodeURIComponent( name ) }`,
			},
		} ) ),
	],
} );

const scratch = () =>
	fs.mkdtempSync( path.join( os.tmpdir(), 'demo-blueprint-' ) );

// ---------------------------------------------------------------------------
// Resolving against where it was published
// ---------------------------------------------------------------------------

test( 'resolves every reference against the base, keeping the encoding', () => {
	const out = resolve(
		blueprint( '01 - Sonnets 1–10 [son01].mp3' ),
		'https://example.github.io/riffpress/',
		'abc1234'
	);
	assert.deepEqual( urls( out ), [
		'https://example.github.io/riffpress/riff.zip?v=abc1234',
		'https://example.github.io/riffpress/demo/01%20-%20Sonnets%201%E2%80%9310%20%5Bson01%5D.mp3?v=abc1234',
	] );
} );

test( 'leaves the source blueprint untouched', () => {
	const input = blueprint( 'manifest.json' );
	resolve( input, 'https://example.github.io/riffpress/' );
	assert.deepEqual( urls( input ), [ 'riff.zip', 'demo/manifest.json' ] );
} );

test( 'refuses a source blueprint that names a host', () => {
	const input = blueprint();
	input.steps[ 0 ].pluginData.url = 'https://josephfus.co/callboard/riff.zip';
	assert.throws(
		() => resolve( input, 'https://example.github.io/riffpress/' ),
		/names a host/
	);
} );

test( 'refuses an http base, which Playground cannot fetch from', () => {
	assert.throws(
		() => resolve( blueprint(), 'http://example.github.io/riffpress/' ),
		/https/
	);
	assert.throws(
		() => resolve( blueprint(), 'https://example.github.io/riffpress' ),
		/slash/
	);
} );

// ---------------------------------------------------------------------------
// Staging untrusted demo files
// ---------------------------------------------------------------------------

test( 'copies the files the blueprint names and nothing else', () => {
	const from = scratch();
	const to = path.join( scratch(), 'demo' );
	fs.writeFileSync( path.join( from, 'manifest.json' ), '{}' );
	fs.writeFileSync( path.join( from, 'extra.php' ), '<?php' );
	assert.deepEqual( stage( blueprint( 'manifest.json' ), from, to ), [
		'manifest.json',
	] );
	assert.deepEqual( fs.readdirSync( to ), [ 'manifest.json' ] );
} );

test( 'refuses a symlink, which would publish whatever it points at', () => {
	const from = scratch();
	fs.symlinkSync( '/etc/hosts', path.join( from, 'manifest.json' ) );
	assert.throws(
		() => stage( blueprint( 'manifest.json' ), from, scratch() ),
		/Not a regular file/
	);
} );

test( 'refuses a missing file, an oversized one, and a name with a path in it', () => {
	const from = scratch();
	assert.throws(
		() => stage( blueprint( 'levels.json' ), from, scratch() ),
		/Missing/
	);

	fs.writeFileSync( path.join( from, 'big.mp3' ), '' );
	fs.truncateSync( path.join( from, 'big.mp3' ), 11 * 1024 * 1024 );
	assert.throws(
		() => stage( blueprint( 'big.mp3' ), from, scratch() ),
		/Larger/
	);

	assert.throws(
		() => stage( blueprint( '../secret.json' ), from, scratch() ),
		/plain file name/
	);
} );

// ---------------------------------------------------------------------------
// Checking what was published
// ---------------------------------------------------------------------------

const answer = ( status, cors = true ) => ( {
	status,
	headers: new Headers( cors ? { 'access-control-allow-origin': '*' } : {} ),
} );

test( 'reports a 404 and a missing CORS header, and passes a good answer', async () => {
	const responses = {
		'https://a/ok': answer( 200 ),
		'https://a/gone': answer( 404 ),
		'https://a/private': answer( 200, false ),
	};
	const failures = await check(
		Object.keys( responses ),
		{},
		async ( url ) => responses[ url ]
	);
	assert.deepEqual( failures, [
		'404 https://a/gone',
		'no access-control-allow-origin https://a/private',
	] );
} );

test( 'retries a deploy that has not reached the edge yet', async () => {
	let calls = 0;
	const failures = await check(
		[ 'https://a/zip' ],
		{ tries: 3, wait: 1 },
		async () => answer( ++calls < 3 ? 404 : 200 )
	);
	assert.deepEqual( failures, [] );
	assert.equal( calls, 3 );
} );

// ---------------------------------------------------------------------------
// The repository itself
// ---------------------------------------------------------------------------

test( 'blueprint.json names no host, so moving the site cannot break the demo', () => {
	const found = urls( source() ).filter( isAbsolute );
	assert.deepEqual(
		found,
		[],
		'resolve these against the published folder instead'
	);
} );

test( 'blueprint.json installs exactly one plugin, the zip beside it', () => {
	const installs = source().steps.filter(
		( s ) => s.step === 'installPlugin'
	);
	assert.equal( installs.length, 1 );
	assert.equal( installs[ 0 ].pluginData.url, 'riff.zip' );
} );

test( 'every demo file blueprint.json fetches exists in the fixture set', () => {
	const names = demoFiles( source() );
	assert.ok(
		names.includes( 'seed.php' ),
		'the demo has no seed script to run'
	);
	const where = ( name ) =>
		name === 'seed.php'
			? path.join( ROOT, 'packages/fixtures', name )
			: path.join( ROOT, 'packages/fixtures/compositions', name );
	const missing = names.filter(
		( name ) => ! fs.existsSync( where( name ) )
	);
	assert.deepEqual( missing, [] );
} );

test( 'no workflow, blueprint, or landing page hardcodes the old Pages address', () => {
	const files = [
		'blueprint.json',
		'site/index.html',
		...fs
			.readdirSync( path.join( ROOT, '.github/workflows' ) )
			.map( ( name ) => `.github/workflows/${ name }` ),
	];
	const hits = files.filter( ( file ) =>
		read( file ).includes( 'josephfus.co/callboard' )
	);
	assert.deepEqual( hits, [] );
} );

test( 'the landing page takes its own address from the Pages build', () => {
	const html = read( 'site/index.html' );
	assert.match( html, /<link rel="canonical" href="\{\{pages_url\}\}">/ );
	assert.match(
		html,
		/property="og:image" content="\{\{pages_url\}\}og\.png"/
	);
	assert.match( html, /blueprint-url=\{\{pages_url\}\}blueprint\.json/ );
} );

test( 'every human-facing link names the same landing page', () => {
	const landing = [
		[ 'README.md', /href="(https:\/\/[^"]+)">Landing page/ ],
		[ 'plugins/riff/riff.php', /Plugin URI: (\S+)/ ],
		[ 'composer.json', /"homepage": "([^"]+)"/ ],
		[ 'package.json', /"homepage": "([^"]+)"/ ],
	].map( ( [ file, pattern ] ) => {
		const match = read( file ).match( pattern );
		assert.ok( match, `${ file } no longer carries the landing page link` );
		return `${ file }: ${ match[ 1 ] }`;
	} );
	const addresses = new Set(
		landing.map( ( line ) => line.split( ': ' )[ 1 ] )
	);
	assert.equal(
		addresses.size,
		1,
		`one address, in every place:\n${ landing.join( '\n' ) }`
	);
} );
