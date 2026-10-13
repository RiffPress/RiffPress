/* eslint-disable no-console -- a command-line script; it talks. */
/* Fixture audio for the demo set: Compositions by the Airmen of Note.

   The United States Air Force publishes the album as public-domain music. Wikimedia Commons marks
   the composition, performance, and recording of every source used here as a U.S. Government work.
   This script downloads Commons' copies, re-encodes the whole of each recording at a size the demo
   can carry (the player is meant to be seen playing full songs, and a full album is also the
   honest performance test) and retains the source and rights evidence in manifest.json.

   Run: node packages/fixtures/jazz.js (needs ffmpeg, ffprobe and a network connection). */
const fs = require( 'fs' );
const os = require( 'os' );
const path = require( 'path' );
const { execFileSync } = require( 'child_process' );

// RIFF_JAZZ_OUT writes the album somewhere else, for a build that must not touch the checkout.
const ROOT = process.env.RIFF_JAZZ_OUT
	? path.resolve( process.env.RIFF_JAZZ_OUT )
	: __dirname;
const ALBUM = 'Compositions';
const PERFORMER = 'Airmen of Note, United States Air Force Band';
const SOURCE = 'https://www.music.af.mil/Multimedia/Music/Public-Domain-Music/';
const LICENSE =
	'https://commons.wikimedia.org/wiki/Template:PD-USGov-Military-Air_Force';
const TRACKS = [
	[ 'intensities', 'Intensities in Ten Cities', 'Alan Baylock', 'd/d3' ],
	[ 'underground', 'Underground', 'Tyler Kuebler', '8/88' ],
	[ 'detritus', 'Trombone Detritus', 'Ben Patterson', '7/79' ],
	[ 'new-day', "It's a Brand New Day", 'Steve Erickson', 'd/df' ],
	[ 'stole-back', 'Stole Back My Soul', 'Alan Baylock', '8/85' ],
	[ 'sunk-in-dars', 'Sunk in Dars', 'Tyler Kuebler', '5/5a' ],
	[ 'little-dreamer', 'Little Dreamer, Big Dreams', 'Ben Patterson', 'a/ad' ],
	[ 'convergence', 'Convergence', 'Jeff Martin', 'e/e9' ],
	[ 'hickory', 'Hickory and Twine', 'Alan Baylock', 'b/bb' ],
	[ 'everyday', 'Everyday Adventures', 'Ben Patterson', '1/11' ],
];

const sh = ( cmd, args ) =>
	execFileSync( cmd, args, {
		stdio: [ 'ignore', 'pipe', 'inherit' ],
		maxBuffer: 1 << 28,
	} );

const commonsName = ( title ) =>
	`${ title } - Airmen of Note - United States Air Force Band.mp3`;
const commonsPage = ( title ) =>
	`https://commons.wikimedia.org/wiki/File:${ encodeURIComponent(
		commonsName( title ).replaceAll( ' ', '_' )
	) }`;
const commonsFile = ( title, bucket ) =>
	`https://upload.wikimedia.org/wikipedia/commons/${ bucket }/${ encodeURIComponent(
		commonsName( title ).replaceAll( ' ', '_' )
	) }`;

/* Same envelope the plugin measures on import, so the waveform is right without a second pass. */
function levels( file ) {
	const pcm = sh( 'ffmpeg', [
		'-v',
		'error',
		'-i',
		file,
		'-ac',
		'1',
		'-ar',
		'1000',
		'-f',
		'u8',
		'-',
	] );
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
	return values
		.map( ( value ) =>
			Math.min( 9, Math.round( 9 * Math.sqrt( value / peak ) ) )
		)
		.join( '' );
}

const configuredCache = process.env.RIFF_JAZZ_CACHE;
const tmp = configuredCache
	? path.resolve( configuredCache )
	: fs.mkdtempSync( path.join( os.tmpdir(), 'riff-jazz-' ) );
fs.mkdirSync( tmp, { recursive: true } );
const dir = path.join( ROOT, 'compositions' );
fs.mkdirSync( dir, { recursive: true } );
for ( const file of fs.readdirSync( dir ) ) {
	if ( /\.(mp3|json)$/.test( file ) ) {
		fs.unlinkSync( path.join( dir, file ) );
	}
}

const tracks = [];
const envelopes = {};
TRACKS.forEach( ( [ id, title, composer, bucket ], index ) => {
	const number = String( index + 1 ).padStart( 2, '0' );
	const source = path.join( tmp, `${ number }.mp3` );
	// No comma in a file name: raw.githubusercontent.com will not serve one, and the demo fetches from there.
	const file = `${ number } - ${ title.replaceAll( ',', '' ) } [${ id }].mp3`;
	const output = path.join( dir, file );

	console.log( `${ number }  Downloading ${ title }` );
	if ( ! fs.existsSync( source ) ) {
		sh( 'curl', [
			'-fLsS',
			'--retry',
			'5',
			'--retry-all-errors',
			'--retry-delay',
			'5',
			'--user-agent',
			'Riff fixture builder/1.0',
			commonsFile( title, bucket ),
			'-o',
			source,
		] );
	}
	sh( 'ffmpeg', [
		'-v',
		'error',
		'-y',
		'-i',
		source,
		'-af',
		'loudnorm=I=-18:TP=-1.5:LRA=11',
		'-ar',
		'44100',
		'-b:a',
		'128k',
		'-id3v2_version',
		'3',
		'-metadata',
		`title=${ title }`,
		'-metadata',
		`artist=${ PERFORMER }`,
		'-metadata',
		`composer=${ composer }`,
		'-metadata',
		`album=${ ALBUM }`,
		'-metadata',
		'copyright=Public domain — U.S. Government work',
		output,
	] );

	const duration = Math.round(
		parseFloat(
			sh( 'ffprobe', [
				'-v',
				'error',
				'-show_entries',
				'format=duration',
				'-of',
				'csv=p=0',
				output,
			] ).toString()
		)
	);
	envelopes[ id ] = levels( output );
	tracks.push( {
		index: index + 1,
		id,
		title,
		file,
		duration,
		url: commonsPage( title ),
		uploader: PERFORMER,
		uploader_url: SOURCE,
		composer,
		license: 'Public domain — U.S. Government work',
		license_url: LICENSE,
	} );
} );

const write = ( file, data, pretty ) =>
	fs.writeFileSync(
		file,
		( pretty
			? JSON.stringify( data, null, '\t' )
			: JSON.stringify( data ) ) + '\n'
	);
write(
	path.join( dir, 'manifest.json' ),
	{
		name: ALBUM,
		slug: 'compositions',
		order: -1,
		palette: 'congo',
		playlist_url: SOURCE,
		curator: PERFORMER,
		curator_url: SOURCE,
		license: 'Public domain — U.S. Government work',
		license_url: LICENSE,
		tracks,
	},
	true
);
write( path.join( dir, 'levels.json' ), envelopes );
if ( ! configuredCache ) {
	fs.rmSync( tmp, { recursive: true, force: true } );
}
console.log(
	`\n${ tracks.length } tracks into ${ path.relative( process.cwd(), dir ) }`
);
