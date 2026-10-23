/**
 * Import Music…: what it picks up from a folder, the addresses it asks, and how it knows a file
 * is already in the Media Library. Run by `npm test` in this package.
 */
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs' );
const os = require( 'node:os' );
const path = require( 'node:path' );
const { test } = require( 'node:test' );
const {
	audioFiles,
	route,
	same,
	disposition,
	importMusic,
} = require( '../src/import' );

test( 'a folder is searched all the way down for audio, in track order, skipping hidden files', () => {
	const dir = fs.mkdtempSync( path.join( os.tmpdir(), 'riff-import-' ) );
	fs.mkdirSync( path.join( dir, 'Album', 'Disc 2' ), { recursive: true } );
	for ( const name of [
		'Album/10 - Ten.mp3',
		'Album/2 - Two.flac',
		'Album/cover.jpg',
		'Album/.1 - Hidden.mp3',
		'Album/Disc 2/1 - One.m4a',
		'notes.txt',
	] ) {
		fs.writeFileSync( path.join( dir, name ), '' );
	}
	assert.deepEqual(
		audioFiles( [ dir ] ).map( ( f ) => path.relative( dir, f ) ),
		[
			path.join( 'Album', '2 - Two.flac' ),
			path.join( 'Album', '10 - Ten.mp3' ),
			path.join( 'Album', 'Disc 2', '1 - One.m4a' ),
		],
	);
	// A file chosen on its own, and twice, is taken once.
	const one = path.join( dir, 'Album', '2 - Two.flac' );
	assert.deepEqual( audioFiles( [ one, one, path.join( dir, 'nowhere' ) ] ), [ one ] );
} );

test( 'routes work under either REST root', () => {
	assert.equal(
		route( 'https://a.test/wp-json/', 'wp/v2/media', { search: 'x' } ),
		'https://a.test/wp-json/wp/v2/media?search=x',
	);
	assert.equal(
		route( 'https://a.test/?rest_route=/', 'wp/v2/media', { search: 'x' } ),
		'https://a.test/?rest_route=/wp/v2/media&search=x',
	);
	assert.equal(
		route( 'https://a.test/wp-json/', 'wp/v2/media' ),
		'https://a.test/wp-json/wp/v2/media',
	);
} );

test( 'a file is known by the name WordPress kept for it, and its size', () => {
	const kept = ( url, filesize ) => ( {
		source_url: `https://a.test/wp-content/uploads/2026/10/${ url }`,
		media_details: { filesize },
	} );
	// WordPress swapped the spaces and brackets for hyphens.
	assert.ok( same( kept( '02-Underground-underground.mp3', 9 ), '02 - Underground [underground].mp3', 9 ) );
	// A name that ends in a number keeps it.
	assert.ok( same( kept( 'take-1.mp3', 9 ), 'take 1.mp3', 9 ) );
	assert.ok( ! same( kept( 'take-1.mp3', 9 ), 'take 2.mp3', 9 ) );
	// The -2 WordPress adds to a name it already had.
	assert.ok( same( kept( 'take-1-2.mp3', 9 ), 'take 1.mp3', 9 ) );
	// The same name but another file.
	assert.ok( ! same( kept( 'take-1.mp3', 9 ), 'take 1.mp3', 10 ) );
	// No size recorded: the name decides.
	assert.ok( same( kept( 'take-1.mp3' ), 'take 1.mp3', 10 ) );
} );

test( 'nothing starts without audio, a WordPress site, or a signed-in listener', async () => {
	const dir = fs.mkdtempSync( path.join( os.tmpdir(), 'riff-import-' ) );
	assert.deepEqual(
		await importMusic( {
			fetch: () => {},
			site: 'https://a.test/',
			chosen: [ dir ],
		} ),
		{ error: 'nothing' },
	);

	const song = path.join( dir, 'Song.mp3' );
	fs.writeFileSync( song, 'ID3' );
	const respond = ( { link = '', json = {}, text = '', ok = true } = {} ) => ( {
		ok,
		status: ok ? 200 : 400,
		headers: { get: ( h ) => ( h === 'link' ? link : null ) },
		json: async () => json,
		text: async () => text,
	} );
	assert.deepEqual(
		await importMusic( {
			fetch: async () => respond(),
			site: 'https://a.test/',
			chosen: [ song ],
		} ),
		{ error: 'site' },
	);

	const root = 'https://a.test/wp-json/';
	const site =
		( nonce, upload ) =>
		async ( url, init = {} ) => {
			if ( init.method === 'HEAD' ) {
				return respond( { link: `<${ root }>; rel="https://api.w.org/"` } );
			}
			if ( url === root ) {
				return respond( { json: { url: 'https://a.test' } } );
			}
			if ( url.includes( 'rest-nonce' ) ) {
				return respond( { text: nonce } );
			}
			if ( init.method === 'POST' ) {
				return upload( init );
			}
			return respond( { json: [] } );
		};
	assert.deepEqual(
		await importMusic( {
			fetch: site( '0' ),
			site: 'https://a.test/',
			chosen: [ song ],
		} ),
		{ error: 'signin' },
	);

	// Signed in: the file is sent once, with the nonce and its name.
	const sent = [];
	const result = await importMusic( {
		fetch: site( 'abc123', ( init ) => {
			sent.push( init.headers );
			return { ok: true, status: 201 };
		} ),
		site: 'https://a.test/',
		chosen: [ song ],
	} );
	assert.deepEqual( result, { imported: [ 'Song.mp3' ], skipped: [], failed: [] } );
	assert.equal( sent[ 0 ][ 'X-WP-Nonce' ], 'abc123' );
	assert.equal(
		sent[ 0 ][ 'Content-Disposition' ],
		`attachment; filename="Song.mp3"; filename*=UTF-8''Song.mp3`,
	);
	assert.equal( sent[ 0 ][ 'Content-Type' ], 'audio/mpeg' );

	// Signed in as someone who cannot upload.
	assert.equal(
		(
			await importMusic( {
				fetch: site( 'abc123', () => ( { ok: false, status: 403 } ) ),
				site: 'https://a.test/',
				chosen: [ song ],
			} )
		).error,
		'upload',
	);
} );

test( 'the quoted file name is plain ASCII for the header, and the UTF-8 one keeps it whole', () => {
	assert.equal(
		disposition( 'Señor "Live".mp3' ),
		'attachment; filename="Senor _Live_.mp3"; filename*=UTF-8\'\'Se%C3%B1or%20%22Live%22.mp3'
	);
} );
