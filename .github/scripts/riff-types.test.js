/**
 * The TypeScript declarations are read from the code, and --check fails once they drift from it.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs' );
const os = require( 'node:os' );
const path = require( 'node:path' );
const { execFileSync, spawnSync } = require( 'node:child_process' );
const types = require( './riff-types.js' );

const ROOT = path.resolve( __dirname, '..', '..' );
const SCRIPT = path.join( __dirname, 'riff-types.js' );
const tmp = ( name, body ) => {
	const file = path.join( fs.mkdtempSync( path.join( os.tmpdir(), 'riff-types-' ) ), name );
	fs.writeFileSync( file, body );
	return file;
};

const track = { title: 'riff-track', type: 'object', properties: { id: { type: 'string' }, duration: { type: 'number' } } };
const ctx = ( root = {} ) => ( { root, named: new Map( [ [ 'riff-track', 'Track' ] ] ), track } );

test( 'JSON schema types become TypeScript', () => {
	assert.equal( types.tsOf( { type: 'integer' }, ctx() ), 'number' );
	assert.equal( types.tsOf( { type: [ 'string', 'null' ] }, ctx() ), 'string | null' );
	assert.equal( types.tsOf( { type: 'string', enum: [ 'name', 'added' ] }, ctx() ), '"name" | "added"' );
	assert.equal( types.tsOf( { type: 'array', items: { type: 'integer' } }, ctx() ), 'number[]' );
	assert.equal( types.tsOf( { type: 'array', items: { type: [ 'string', 'null' ] } }, ctx() ), 'Array<string | null>' );
	assert.equal( types.tsOf( { type: 'object' }, ctx() ), 'Record<string, unknown>' );
	assert.equal( types.tsOf( { oneOf: [ { type: 'string' }, { type: 'null' } ] }, ctx() ), 'string | null' );
} );

test( 'an object lists its properties, optional only where a required list leaves them out', () => {
	const all = types.tsOf( { type: 'object', properties: { a: { type: 'string', description: 'The a.' } } }, ctx() );
	assert.match( all, /\/\*\* The a\. \*\/\n\ta: string;/ );
	const some = types.tsOf( { type: 'object', required: [ 'a' ], properties: { a: { type: 'string' }, b: { type: 'number' } } }, ctx() );
	assert.match( some, /\ta: string;/ );
	assert.match( some, /\tb\?: number;/ );
} );

test( 'the track is named wherever a route repeats it, and extended where it adds to it', () => {
	assert.equal( types.tsOf( track, ctx() ), 'Track' );
	assert.equal( types.tsOf( { type: 'object', properties: { ...track.properties } }, ctx() ), 'Track' );
	assert.equal( types.tsOf( { type: [ 'object', 'null' ], properties: { ...track.properties } }, ctx() ), 'Track | null' );
	assert.match( types.tsOf( { type: 'object', properties: { ...track.properties, played: { type: 'integer' } } }, ctx() ), /^Track & \{\n\tplayed: number;\n\}$/ );
	// A different id is not the track.
	assert.doesNotMatch( types.tsOf( { type: 'object', properties: { id: { type: 'integer' }, duration: { type: 'number' } } }, ctx() ), /Track/ );
} );

test( 'a $ref to a named shape is that shape, so a block holds blocks', () => {
	const root = { properties: { blocks: { items: { title: 'riff-block', type: 'object', properties: {} } } } };
	const c = { ...ctx( root ), named: new Map( [ [ 'riff-block', 'Block' ] ] ) };
	assert.equal( types.tsOf( { type: 'array', items: { $ref: '#/properties/blocks/items' } }, c ), 'Block[]' );
	assert.equal( types.tsOf( { $ref: '#/nowhere' }, c ), 'unknown' );
} );

test( 'JSDoc types become TypeScript, a track and the api by name', () => {
	assert.equal( types.tsJs( 'Object', 'track' ), 'Track' );
	assert.equal( types.tsJs( 'Object[]', 'queue' ), 'Track[]' );
	assert.equal( types.tsJs( 'Object|null', 'track' ), 'Track | null' );
	assert.equal( types.tsJs( 'Object', 'api' ), 'RiffApi' );
	assert.equal( types.tsJs( 'Object', 'options' ), 'Record<string, unknown>' );
	assert.equal( types.tsJs( '?AnalyserNode' ), 'AnalyserNode | null' );
	assert.equal( types.tsJs( 'Object', 'x', 'Tracks, in the shape `Tracks::schema()` describes.' ), 'Track' );
	assert.equal( types.tsJs( '(view: HTMLElement, track: Object|null) => void' ), '(view: HTMLElement, track: Track | null) => void' );
	// A function in a union keeps its parentheses, or it would swallow the rest.
	assert.equal( types.tsJs( 'string|((track: Object|null) => string)' ), 'string | ((track: Track | null) => string)' );
} );

test( 'a route\'s address names its parameters', () => {
	assert.deepEqual( types.address( 'riff/v1', '/users/(?P<user>me|\\d+)/playlists/(?P<id>\\d+)' ), { path: '/riff/v1/users/{user}/playlists/{id}', names: [ 'user', 'id' ] } );
	assert.deepEqual( types.address( 'riff/v1', '/albums' ), { path: '/riff/v1/albums', names: [] } );
} );

test( 'a Listen app view is read from the array shape Views::all() documents', () => {
	const file = tmp( 'class-views.php', '<?php\n/**\n * @return array<string, array{label: string, nav: string[], render: callable|null, own: bool}>\n */\n' );
	const out = types.views( file );
	assert.match( out, /export interface AppView \{\n\tlabel: string;\n\tnav: string\[\];\n\trender: PhpCallable \| null;\n\town: boolean;\n\}/ );
	assert.throws( () => types.views( tmp( 'class-views.php', '<?php\n' ) ), /No "@return array<string, array\{\.\.\.\}>"/ );
} );

test( 'the declarations carry every route, the track, window.riff, the hooks, the events and the views', () => {
	const out = types.render( types.collect() );
	for ( const want of [
		'export interface Track {',
		'"GET /riff/v1/albums": {',
		'"GET /riff/v1/posts/{id}/blocks": {',
		'"DELETE /riff/v1/users/{user}/playlists/{id}/tracks/{index}": {',
		'export type Album = AlbumsResponse[\'items\'][number];',
		'export type Playlist = PlaylistResponse;',
		'export interface Block {',
		'innerBlocks: Block[];',
		'track?: Track | null;',
		'export interface RiffApi {',
		'play(tracks: Track[], index?: number, options?: {',
		'on<K extends keyof RiffEventDetails>(name: K, fn: (detail: RiffEventDetails[K], api: RiffApi) => void): () => void;',
		'"riff.play": (detail: {',
		'"riff.queue": (tracks: Track[], index: number) => Track[];',
		'[ K in keyof RiffEventDetails as `riff:${ K }` ]: CustomEvent<RiffEventDetails[ K ]>;',
		'export interface AppView {',
		'riff_track: Track | null;',
	] ) {
		assert.ok( out.includes( want ), want );
	}
	// Each route is in the map once per method.
	const keys = [ ...out.matchAll( /^\t"([A-Z]+ \/[^"]+)": \{$/gm ) ].map( ( m ) => m[ 1 ] );
	assert.equal( new Set( keys ).size, keys.length );
} );

test( 'the committed declarations are what the code generates', () => {
	assert.equal( types.drift( types.render( types.collect() ) ), null, 'run npm run types' );
} );

test( 'the drift check names a stale file and a missing one', () => {
	const expected = 'export interface Track {}\n';
	assert.equal( types.drift( expected, tmp( 'index.d.ts', expected ) ), null );
	assert.match( types.drift( expected, tmp( 'index.d.ts', 'export interface Track { id: string }\n' ) ), /is out of date: run npm run types/ );
	assert.match( types.drift( expected, path.join( os.tmpdir(), 'riff-types-none', 'index.d.ts' ) ), /is missing/ );
} );

test( '--check exits non-zero once the file drifts, and zero once it is written again', () => {
	const before = fs.readFileSync( types.OUT, 'utf8' );
	try {
		fs.writeFileSync( types.OUT, before.replace( 'export interface Track {', 'export interface Track {\n\tstale: true;' ) );
		const stale = spawnSync( process.execPath, [ SCRIPT, '--check' ], { encoding: 'utf8' } );
		assert.equal( stale.status, 1 );
		assert.match( stale.stderr, /packages\/types\/index\.d\.ts is out of date/ );
	} finally {
		fs.writeFileSync( types.OUT, before );
	}
	assert.match( execFileSync( process.execPath, [ SCRIPT, '--check' ], { encoding: 'utf8' } ), /is current/ );
} );

// TypeScript is a dev dependency of packages/types. The workflow that runs these tests installs
// nothing, so there this one is skipped; the lint job, which installs, compiles them.
const tsc = ( () => {
	try {
		return require.resolve( 'typescript/bin/tsc', { paths: [ path.join( ROOT, 'packages', 'types' ), ROOT ] } );
	} catch {
		return null;
	}
} )();

test( 'the declarations compile, and refuse what the routes and hooks refuse', { skip: ! tsc && 'typescript is not installed' }, () => {
	const run = spawnSync( process.execPath, [ tsc, '-p', path.join( ROOT, 'packages', 'types', 'tsconfig.json' ) ], { encoding: 'utf8' } );
	assert.equal( run.status, 0, run.stdout + run.stderr );
} );
