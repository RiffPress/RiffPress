/* eslint-disable no-console -- a command-line script; it talks. */
/* The streamed albums' audio, built on this machine: `npm run albums [slug ...]`, every streamed
   album when no slug is given. Each album's tracks go to packages/fixtures/<slug>/audio/, which git
   ignores, and `npm run seed` then plays them from this checkout instead of from riffpress.com, so
   a new or changed album can be heard before it is published. Needs ffmpeg, ffprobe and curl;
   downloads are kept in ~/.cache/riff-albums/src, as the deploy keeps them. */
const fs = require( 'fs' );
const os = require( 'os' );
const path = require( 'path' );
const { execFileSync } = require( 'child_process' );

const named = process.argv.slice( 2 );
const slugs = named.length
	? named
	: fs.readdirSync( __dirname ).filter( ( slug ) => {
		const manifest = path.join( __dirname, slug, 'manifest.json' );
		return fs.existsSync( manifest ) && JSON.parse( fs.readFileSync( manifest, 'utf8' ) ).remote;
	} );
const cache = process.env.RIFF_JAZZ_CACHE || path.join( os.homedir(), '.cache', 'riff-albums', 'src' );
for ( const slug of slugs ) {
	console.log( `\n${ slug }` );
	execFileSync( process.execPath, [ path.join( __dirname, 'album.js' ), slug, '--out', path.join( __dirname, slug, 'audio' ) ], {
		stdio: 'inherit',
		env: { ...process.env, RIFF_JAZZ_CACHE: cache },
	} );
}
console.log( `\n${ slugs.length } albums built. Run npm run seed to play them from this checkout.` );
