'use strict';

// The demo's streamed albums, as one file: albums.json, every album's manifest and levels by slug.
// The blueprint fetches that one file and the seed makes a post of each album in it, so adding an
// album to packages/fixtures/ never means editing blueprint.json, and a pull request's preview shows
// the albums the pull request has, not the ones main's blueprint happens to list.
//
// The audio is not in it. Pages publishes every album's audio under demo/<slug>/ and the seed points
// at it there. A pull request's preview builds only the albums it adds or changes, marked `built`;
// the publisher, which trusts nothing the pull request made, copies just those albums' tracks to the
// preview branch and points the albums at them, and every other album keeps playing from the site.

const fs = require( 'fs' );
const path = require( 'path' );

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// A track's file name as album.js writes it: no folders, no dot files, an mp3.
const TRACK = /^[^/\\]+\.mp3$/;
const MAX_BUNDLE_BYTES = 5 * 1024 * 1024;
const MAX_TRACK_BYTES = 40 * 1024 * 1024;

const read = ( file ) => JSON.parse( fs.readFileSync( file, 'utf8' ) );

/**
 * Every streamed album under a fixtures folder, by slug.
 *
 * @param {string}   fixtures Folder of album folders.
 * @param {string[]} [built]  Slugs whose audio this build made, to be published beside the bundle.
 * @return {Object} The bundle.
 */
function bundle( fixtures, built = [] ) {
	const out = {};
	for ( const slug of fs.readdirSync( fixtures ).sort() ) {
		const manifest = path.join( fixtures, slug, 'manifest.json' );
		if ( ! SLUG.test( slug ) || ! fs.existsSync( manifest ) ) {
			continue;
		}
		const album = read( manifest );
		if ( ! album.remote ) {
			continue;
		}
		const levels = path.join( fixtures, slug, 'levels.json' );
		out[ slug ] = {
			manifest: album,
			levels: fs.existsSync( levels ) ? read( levels ) : {},
			...( built.includes( slug ) ? { built: true } : {} ),
		};
	}
	return out;
}

/**
 * Copy a pull request's bundle and the audio it built into the folder the preview publishes, and
 * point each built album at its copy. Nothing it names is trusted: slugs and file names are checked,
 * only an album's own tracks are copied, each a plain file of a sane size, and an album that was not
 * built cannot name where its audio comes from.
 *
 * @param {string} from Folder the pull request built: albums.json, and <slug>/<track>.mp3.
 * @param {string} to   Folder to publish.
 * @param {string} base Where `to` will be served, ending in a slash.
 * @return {string[]} The built albums.
 */
function stage( from, to, base ) {
	if ( ! /^https:\/\/[^/]+\/(.*\/)?$/.test( base ) ) {
		throw new Error( `Base must be an https URL ending in a slash: ${ base }` );
	}
	const file = path.join( from, 'albums.json' );
	const stat = fs.lstatSync( file );
	if ( ! stat.isFile() || stat.size > MAX_BUNDLE_BYTES ) {
		throw new Error( 'albums.json is not a plain file of a sane size' );
	}
	const albums = read( file );
	const built = [];
	for ( const [ slug, album ] of Object.entries( albums ) ) {
		if ( ! SLUG.test( slug ) ) {
			throw new Error( `Not an album slug: ${ slug }` );
		}
		delete album.base;
		if ( ! album.built ) {
			continue;
		}
		delete album.built;
		fs.mkdirSync( path.join( to, slug ), { recursive: true } );
		for ( const track of album.manifest.tracks || [] ) {
			const name = String( track.file || '' );
			if ( ! TRACK.test( name ) || name.startsWith( '.' ) ) {
				throw new Error( `Not a track file name: ${ slug }/${ name }` );
			}
			const source = path.join( from, slug, name );
			const s = fs.lstatSync( source );
			if ( ! s.isFile() || s.size > MAX_TRACK_BYTES ) {
				throw new Error( `Not a plain track of a sane size: ${ slug }/${ name }` );
			}
			fs.copyFileSync( source, path.join( to, slug, name ) );
		}
		album.base = new URL( `${ slug }/`, base ).href;
		built.push( slug );
	}
	fs.mkdirSync( to, { recursive: true } );
	fs.writeFileSync( path.join( to, 'albums.json' ), JSON.stringify( albums ) );
	return built;
}

module.exports = { bundle, stage };

if ( require.main === module ) {
	const [ command, ...args ] = process.argv.slice( 2 );
	switch ( command ) {
		// bundle <fixtures> <out.json> [built-slug ...]
		case 'bundle':
			fs.writeFileSync( args[ 1 ], JSON.stringify( bundle( args[ 0 ], args.slice( 2 ) ) ) );
			break;
		// stage <from> <to> <base>
		case 'stage':
			for ( const slug of stage( args[ 0 ], args[ 1 ], args[ 2 ] ) ) {
				process.stdout.write( `${ slug }\n` );
			}
			break;
		default:
			process.stderr.write( 'usage: demo-albums.js bundle|stage ...\n' );
			process.exitCode = 2;
	}
}
