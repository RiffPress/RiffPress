'use strict';

/*
 * The demo's timed lyrics, lined up with their recordings. Each album's lyrics.json holds LRC for
 * the songs that are sung; album.js merges it into manifest.json, which the seed reads. A line is
 * timed against the recording once, by ear or by a transcription; these checks keep the timing
 * honest afterwards: the manifest carries what lyrics.json says, every line has a time, the times
 * run forward, each falls inside the track, a sung line never lands where the recording is near
 * silent (from levels.json, the envelope album.js measured), and no two lines come too close to
 * be read.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const fs = require( 'fs' );
const path = require( 'path' );

const FIXTURES = path.join( __dirname, '..', '..', 'packages', 'fixtures' );
const STAMP = /^\[(\d{2}):(\d{2}\.\d{2})\](.*)$/;

const albums = fs
	.readdirSync( FIXTURES )
	.filter( ( d ) => fs.existsSync( path.join( FIXTURES, d, 'lyrics.json' ) ) );
const json = ( album, file ) =>
	JSON.parse( fs.readFileSync( path.join( FIXTURES, album, file ), 'utf8' ) );

test( 'at least one album has timed lyrics to check', () => {
	assert.ok( albums.length > 0 );
} );

for ( const album of albums ) {
	const words = json( album, 'lyrics.json' );
	const manifest = json( album, 'manifest.json' );
	const levels = json( album, 'levels.json' );
	const source = json( album, 'source.json' );

	for ( const [ id, entry ] of Object.entries( words ) ) {
		const track = manifest.tracks.find( ( t ) => t.id === id );

		test( `${ album }/${ id }: a track of the album, and the manifest carries its words`, () => {
			assert.ok( source.tracks.some( ( t ) => t.id === id ), `${ id } is not in source.json` );
			assert.ok( track, `${ id } is not in manifest.json` );
			assert.equal( track.lyrics, entry.lyrics, 'manifest.json is behind lyrics.json; run album.js' );
			assert.equal( track.language, entry.language );
		} );

		test( `${ album }/${ id }: every line is timed, in order, inside the track`, () => {
			const rows = entry.lyrics.split( '\n' ).filter( Boolean );
			let last = -1;
			for ( const row of rows ) {
				const m = row.match( STAMP );
				assert.ok( m, `not timed: ${ row }` );
				const at = Number( m[ 1 ] ) * 60 + Number( m[ 2 ] );
				assert.ok( at > last, `out of order at ${ row }` );
				assert.ok( at < track.duration, `past the end (${ track.duration } s): ${ row }` );
				last = at;
			}
		} );

		test( `${ album }/${ id }: no sung line lands in near silence, and none crowds the next`, () => {
			const envelope = levels[ id ];
			assert.ok( envelope, `${ id } has no levels` );
			const lines = entry.lyrics
				.split( '\n' )
				.map( ( row ) => row.match( STAMP ) )
				.filter( Boolean )
				.map( ( m ) => ( { at: Number( m[ 1 ] ) * 60 + Number( m[ 2 ] ), text: m[ 3 ].trim() } ) );
			const level = ( at ) => {
				// The loudest sample within half a second either side, since the envelope is coarse.
				const per = track.duration / envelope.length;
				const from = Math.max( 0, Math.floor( ( at - 0.5 ) / per ) );
				const to = Math.min( envelope.length - 1, Math.ceil( ( at + 0.5 ) / per ) );
				return Math.max( ...envelope.slice( from, to + 1 ).split( '' ).map( Number ) );
			};
			lines.forEach( ( line, i ) => {
				if ( line.text ) {
					assert.ok( level( line.at ) >= 2, `"${ line.text }" at ${ line.at } s is in near silence` );
				}
				const next = lines[ i + 1 ];
				if ( next ) {
					assert.ok( next.at - line.at >= 0.8, `"${ line.text }" and "${ next.text }" are too close to read` );
				}
			} );
		} );
	}
}
