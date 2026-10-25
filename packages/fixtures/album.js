/* eslint-disable no-console -- a command-line script; it talks. */
/* An album for the demo, from Wikimedia Commons.

   Every album under packages/fixtures/ has a source.json naming its recordings on Commons, each in
   the public domain in the United States: a Government work, or a recording published before 1926.
   A track names its own artist when the album has several. This script downloads them, re-encodes each
   whole recording at a size the demo can carry, measures its length and its level envelope, and
   writes manifest.json and levels.json beside the source. The audio itself is written to --out,
   never to the repository: the Pages deploy builds it from the same source and publishes it with
   the site, and the seed points the demo's posts at it.

   Run: node packages/fixtures/album.js <slug> [--out <dir>] (needs ffmpeg, ffprobe, curl, network).
   RIFF_JAZZ_CACHE keeps the downloads between runs. */
const fs = require( 'fs' );
const os = require( 'os' );
const path = require( 'path' );
const { execFileSync } = require( 'child_process' );

const args = process.argv.slice( 2 );
const slug = args.find( ( a ) => ! a.startsWith( '--' ) );
const outIndex = args.indexOf( '--out' );
if ( ! slug ) {
	console.error( 'Usage: node packages/fixtures/album.js <slug> [--out <dir>]' );
	process.exit( 1 );
}
const dir = path.join( __dirname, slug );
const source = JSON.parse( fs.readFileSync( path.join( dir, 'source.json' ), 'utf8' ) );
// The words of the songs that have them, by track id, with the language they are sung in: texts in
// the public domain, kept out of source.json so that changing a word does not download and encode
// every album again (the Pages cache is keyed on source.json).
const words = fs.existsSync( path.join( dir, 'lyrics.json' ) )
	? JSON.parse( fs.readFileSync( path.join( dir, 'lyrics.json' ), 'utf8' ) )
	: {};
const out = outIndex >= 0 ? path.resolve( args[ outIndex + 1 ] ) : path.join( os.tmpdir(), 'riff-album-' + slug );
fs.mkdirSync( out, { recursive: true } );

const sh = ( cmd, a ) =>
	execFileSync( cmd, a, { stdio: [ 'ignore', 'pipe', 'inherit' ], maxBuffer: 1 << 28 } );

/* The level envelope: a digit 0 to 9 per hundred samples at 1 kHz, the same measure the plugin
   would store as riff_levels, so the drawn cover's groove follows the music. */
function levels( file ) {
	const pcm = sh( 'ffmpeg', [ '-v', 'error', '-i', file, '-ac', '1', '-ar', '1000', '-f', 'u8', '-' ] );
	const n = Math.floor( pcm.length / 100 );
	const values = [];
	let peak = 1;
	for ( let k = 0; k < n; k++ ) {
		let sum = 0;
		for ( let j = 0; j < 100; j++ ) {
			sum += Math.abs( pcm[ k * 100 + j ] - 128 );
		}
		values[ k ] = sum / 100;
		peak = Math.max( peak, values[ k ] );
	}
	// At most 240 samples per track: enough for a groove, small enough for a manifest.
	const step = Math.max( 1, Math.ceil( values.length / 240 ) );
	const kept = [];
	for ( let k = 0; k < values.length; k += step ) {
		kept.push( values[ k ] );
	}
	return kept.map( ( v ) => Math.min( 9, Math.round( 9 * Math.sqrt( v / peak ) ) ) ).join( '' );
}

const cache = process.env.RIFF_JAZZ_CACHE ? path.resolve( process.env.RIFF_JAZZ_CACHE, slug ) : fs.mkdtempSync( path.join( os.tmpdir(), 'riff-album-src-' ) );
fs.mkdirSync( cache, { recursive: true } );

const tracks = [];
const envelopes = {};
source.tracks.forEach( ( track, index ) => {
	const number = String( index + 1 ).padStart( 2, '0' );
	const src = path.join( cache, `${ number }.mp3` );
	// No comma in a file name: raw.githubusercontent.com will not serve one.
	const file = `${ number } - ${ track.title.replaceAll( ',', '' ) } [${ track.id }].mp3`;
	const output = path.join( out, file );

	console.log( `${ number }  ${ track.title }` );
	if ( ! fs.existsSync( src ) ) {
		sh( 'curl', [ '-fLsS', '--retry', '5', '--retry-all-errors', '--retry-delay', '5', '--user-agent', 'Riff fixture builder/1.0 (https://riffpress.com)', track.source, '-o', src ] );
	}
	sh( 'ffmpeg', [
		'-v', 'error', '-y', '-i', src,
		// No embedded picture: the cover is drawn, and WordPress would otherwise make the picture
		// the file's own image.
		'-vn',
		'-af', 'loudnorm=I=-18:TP=-1.5:LRA=11',
		'-ar', '44100', '-b:a', '128k', '-id3v2_version', '3',
		'-metadata', `title=${ track.title }`,
		'-metadata', `artist=${ track.artist || source.artist }`,
		'-metadata', `album=${ source.name }`,
		'-metadata', `copyright=${ source.license }`,
		output,
	] );
	const duration = Math.round( parseFloat( sh( 'ffprobe', [ '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', output ] ).toString() ) );
	envelopes[ track.id ] = levels( output );
	tracks.push( {
		index: index + 1,
		id: track.id,
		title: track.title,
		...( track.artist ? { artist: track.artist } : {} ),
		file,
		duration,
		bitrate: 128,
		url: track.page,
		uploader: source.artist,
		uploader_url: source.collection,
		license: source.license,
		license_url: source.license_url,
		...words[ track.id ],
	} );
} );

const write = ( file, data, pretty ) =>
	fs.writeFileSync( file, ( pretty ? JSON.stringify( data, null, '\t' ) : JSON.stringify( data ) ) + '\n' );
write(
	path.join( dir, 'manifest.json' ),
	{
		name: source.name,
		slug: source.slug,
		// Streamed from the published demo set, not uploaded: the seed points the post at the site.
		remote: true,
		category: source.ensemble,
		curator: source.artist,
		curator_url: source.collection,
		license: source.license,
		license_url: source.license_url,
		tracks,
	},
	true
);
write( path.join( dir, 'levels.json' ), envelopes );
console.log( `\n${ tracks.length } tracks into ${ path.relative( process.cwd(), out ) }` );
