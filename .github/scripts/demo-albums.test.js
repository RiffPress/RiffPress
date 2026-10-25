'use strict';

/*
 * The demo's streamed albums travel as one albums.json, so adding an album never touches
 * blueprint.json; and a pull request's preview publishes only the audio of albums it built, after
 * checking every name in what the pull request made.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs' );
const os = require( 'node:os' );
const path = require( 'node:path' );
const { bundle, stage } = require( './demo-albums.js' );

const ROOT = path.join( __dirname, '..', '..' );
const tmp = () => fs.mkdtempSync( path.join( os.tmpdir(), 'riff-albums-' ) );
const BASE = 'https://example.test/preview/abc/demo/';

test( 'the bundle has every streamed album in the fixtures, and no uploaded one', () => {
	const albums = bundle( path.join( ROOT, 'packages/fixtures' ) );
	const streamed = fs.readdirSync( path.join( ROOT, 'packages/fixtures' ) ).filter( ( slug ) => {
		const m = path.join( ROOT, 'packages/fixtures', slug, 'manifest.json' );
		return fs.existsSync( m ) && JSON.parse( fs.readFileSync( m, 'utf8' ) ).remote;
	} );
	assert.deepEqual( Object.keys( albums ).sort(), streamed.sort() );
	assert.ok( ! ( 'compositions' in albums ), 'Compositions is uploaded with the demo, not streamed' );
	for ( const album of Object.values( albums ) ) {
		assert.ok( album.manifest.tracks.length, 'each album carries its manifest' );
		assert.equal( album.built, undefined );
	}
} );

test( 'blueprint.json names no album, so adding one never touches it', () => {
	const blueprint = fs.readFileSync( path.join( ROOT, 'blueprint.json' ), 'utf8' );
	for ( const slug of Object.keys( bundle( path.join( ROOT, 'packages/fixtures' ) ) ) ) {
		assert.ok( ! blueprint.includes( slug ), `blueprint.json names ${ slug }` );
	}
	assert.match( blueprint, /"url": "demo\/albums\.json"/ );
	assert.match( blueprint, /riff_seed_albums\(/ );
} );

function built( albums, tracks = {} ) {
	const from = tmp();
	fs.writeFileSync( path.join( from, 'albums.json' ), JSON.stringify( albums ) );
	for ( const [ file, body ] of Object.entries( tracks ) ) {
		fs.mkdirSync( path.dirname( path.join( from, file ) ), { recursive: true } );
		fs.writeFileSync( path.join( from, file ), body );
	}
	return from;
}

test( 'a built album is copied and pointed at its copy; the rest keep playing from the site', () => {
	const from = built(
		{
			new: { manifest: { tracks: [ { file: 'one.mp3' } ] }, built: true },
			old: { manifest: { tracks: [ { file: 'two.mp3' } ] }, base: 'https://elsewhere.test/' },
		},
		{ 'new/one.mp3': 'mp3', 'old/two.mp3': 'not published' }
	);
	const to = tmp();
	assert.deepEqual( stage( from, to, BASE ), [ 'new' ] );
	const out = JSON.parse( fs.readFileSync( path.join( to, 'albums.json' ), 'utf8' ) );
	assert.equal( out.new.base, `${ BASE }new/` );
	assert.equal( out.new.built, undefined );
	assert.equal( out.old.base, undefined, 'an album that was not built cannot name where its audio comes from' );
	assert.ok( fs.existsSync( path.join( to, 'new/one.mp3' ) ) );
	assert.ok( ! fs.existsSync( path.join( to, 'old' ) ) );
} );

test( 'nothing the pull request names can reach outside its album, or be a link', () => {
	const to = tmp();
	assert.throws( () => stage( built( { '../x': { manifest: { tracks: [] } } } ), to, BASE ), /Not an album slug/ );
	assert.throws( () => stage( built( { a: { manifest: { tracks: [ { file: '../../etc.mp3' } ] }, built: true } } ), to, BASE ), /Not a track file name/ );
	assert.throws( () => stage( built( { a: { manifest: { tracks: [ { file: 'run.sh' } ] }, built: true } } ), to, BASE ), /Not a track file name/ );
	const from = built( { a: { manifest: { tracks: [ { file: 'one.mp3' } ] }, built: true } } );
	fs.mkdirSync( path.join( from, 'a' ) );
	fs.symlinkSync( '/etc/hosts', path.join( from, 'a/one.mp3' ) );
	assert.throws( () => stage( from, to, BASE ), /Not a plain track/ );
	assert.throws( () => stage( built( {} ), to, 'http://example.test/' ), /https/ );
} );
