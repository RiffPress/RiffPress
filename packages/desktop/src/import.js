/**
 * Import Music…: audio files from this computer into the site's Media Library, through WordPress's
 * own media route, as the listener the window is signed in as.
 *
 * WordPress reads each file's tags, length and embedded artwork on upload, and Riff files new
 * uploads into albums and artists as they arrive, so nothing here is Riff's own: the REST root is
 * found from the Link header core sends with every page, the nonce from core's rest-nonce action,
 * and each file is one POST to wp/v2/media. It runs in the main process with the window's session,
 * so the page is given nothing new. A file whose name the Media Library already has is skipped.
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );

// The audio Riff's own folder import takes (plugins/riff/src/class-import.php).
const AUDIO = /\.(mp3|m4a|flac|ogg|oga|opus|wav)$/i;
const TYPES = {
	mp3: 'audio/mpeg',
	m4a: 'audio/mp4',
	flac: 'audio/flac',
	ogg: 'audio/ogg',
	oga: 'audio/ogg',
	opus: 'audio/ogg',
	wav: 'audio/wav',
};

/**
 * Every audio file in what was chosen: files as they are, folders searched all the way down, in
 * name order so an album's tracks arrive in order.
 *
 * @param {string[]} chosen Paths from the open dialog.
 * @return {string[]} Audio files.
 */
function audioFiles( chosen ) {
	const found = [];
	const walk = ( p ) => {
		let stat;
		try {
			stat = fs.statSync( p );
		} catch {
			return;
		}
		if ( stat.isDirectory() ) {
			for ( const name of fs.readdirSync( p ).sort( natural ) ) {
				if ( ! name.startsWith( '.' ) ) {
					walk( path.join( p, name ) );
				}
			}
		} else if ( AUDIO.test( p ) ) {
			found.push( p );
		}
	};
	chosen.forEach( walk );
	return [ ...new Set( found ) ];
}

const natural = ( a, b ) =>
	a.localeCompare( b, undefined, { numeric: true, sensitivity: 'base' } );

/**
 * A route under the REST root, with a query, whichever form the root takes: /wp-json/ on a site
 * with pretty permalinks, ?rest_route=/ without.
 *
 * @param {string} root  The REST root, ending in a slash.
 * @param {string} name  The route, without a leading slash.
 * @param {Object} query Query arguments.
 * @return {string} The address.
 */
function route( root, name, query = {} ) {
	const url = root + name;
	const params = new URLSearchParams( query ).toString();
	if ( ! params ) {
		return url;
	}
	return url + ( url.includes( '?' ) ? '&' : '?' ) + params;
}

/**
 * A name reduced to its letters and digits, in lower case, without its folder or extension: how a
 * file and the name WordPress kept for it are compared, since WordPress swaps spaces and
 * punctuation for hyphens.
 *
 * @param {string} name File name or address.
 * @return {string} Its comparable form.
 */
function stem( name ) {
	return path
		.basename( decodeURIComponent( name ) )
		.replace( /\.[^.]+$/, '' )
		.toLowerCase()
		.replace( /[^a-z0-9]+/g, '' );
}

/**
 * Whether a file on this computer is one already in the Media Library: the same name as WordPress
 * keeps it, or that name with the -2 WordPress adds when it already had one, and the same size
 * where WordPress recorded it.
 *
 * @param {Object} media A media item, with its source_url and media_details.
 * @param {string} name  The file's name.
 * @param {number} size  The file's size in bytes.
 * @return {boolean} Whether it is the same file.
 */
function same( media, name, size ) {
	const url = String( media.source_url || '' );
	const kept = stem( url );
	const numbered = stem( url.replace( /-\d+(\.[^./]+)$/, '$1' ) );
	const local = stem( name );
	if ( kept !== local && numbered !== local ) {
		return false;
	}
	const recorded = Number( media.media_details?.filesize );
	return ! recorded || recorded === size;
}

/**
 * The upload's Content-Disposition. WordPress reads the quoted filename and will not take the
 * UTF-8 form alone; a header cannot carry other than ASCII, so the quoted one is an ASCII stand-in
 * and the UTF-8 one keeps the name as it is.
 *
 * @param {string} name File name.
 * @return {string} The header.
 */
function disposition( name ) {
	const ascii = name
		.normalize( 'NFKD' )
		.replace( /[\u0300-\u036f]/g, '' )
		.replace( /[^\x20-\x7e]|["\\]/g, '_' );
	return `attachment; filename="${ ascii }"; filename*=UTF-8''${ encodeURIComponent(
		name
	) }`;
}

/**
 * The site's REST root, from the Link header WordPress sends with its pages.
 *
 * @param {typeof fetch} fetch The window session's fetch.
 * @param {string}       site  The site's address.
 * @return {Promise<string|null>} The root, or null when the site does not say.
 */
async function restRoot( fetch, site ) {
	const response = await fetch( site, { method: 'HEAD' } );
	const link = response.headers.get( 'link' ) || '';
	const match = link.match( /<([^>]+)>;\s*rel="https:\/\/api\.w\.org\/"/ );
	return match ? match[ 1 ] : null;
}

/**
 * Imports what was chosen.
 *
 * @param {Object}                 options
 * @param {typeof fetch}           options.fetch    The window session's fetch, which carries its login.
 * @param {string}                 options.site     The site's address.
 * @param {string[]}               options.chosen   Paths from the open dialog.
 * @param {(done: number) => void} options.progress Called with the share done, 0 to 1.
 * @return {Promise<Object>} { imported, skipped, failed } file names, or { error } when nothing
 *                           could start: `nothing` (no audio), `site` (not a WordPress site),
 *                           `signin` (not signed in) or `upload` (not allowed to upload).
 */
async function importMusic( { fetch, site, chosen, progress = () => {} } ) {
	const files = audioFiles( chosen );
	if ( ! files.length ) {
		return { error: 'nothing' };
	}
	const root = await restRoot( fetch, site ).catch( () => null );
	if ( ! root ) {
		return { error: 'site' };
	}
	const index = await fetch( root ).then( ( r ) => r.json() );
	const nonce = (
		await fetch(
			`${ String( index.url ).replace(
				/\/$/,
				'',
			) }/wp-admin/admin-ajax.php?action=rest-nonce`,
		).then( ( r ) => ( r.ok ? r.text() : '0' ) )
	).trim();
	if ( ! nonce || nonce === '0' ) {
		return { error: 'signin' };
	}
	const headers = { 'X-WP-Nonce': nonce };

	const result = { imported: [], skipped: [], failed: [] };
	for ( const [ i, file ] of files.entries() ) {
		const name = path.basename( file );
		progress( i / files.length );
		const have = await fetch(
			route( root, 'wp/v2/media', {
				search: path.basename( file, path.extname( file ) ),
				media_type: 'audio',
				per_page: 100,
				_fields: 'source_url,media_details',
			} ),
			{ headers },
		)
			.then( ( r ) => ( r.ok ? r.json() : [] ) )
			.catch( () => [] );
		const size = fs.statSync( file ).size;
		if ( have.some( ( m ) => same( m, name, size ) ) ) {
			result.skipped.push( name );
			continue;
		}
		const response = await fetch( route( root, 'wp/v2/media' ), {
			method: 'POST',
			headers: {
				...headers,
				'Content-Type':
					TYPES[ path.extname( file ).slice( 1 ).toLowerCase() ] ||
					'application/octet-stream',
				'Content-Disposition': disposition( name ),
			},
			body: fs.readFileSync( file ),
		} ).catch( () => null );
		// Signed in, but not as someone who can upload: stop, with what got in so far.
		if ( response?.status === 401 || response?.status === 403 ) {
			return { error: 'upload', ...result };
		}
		( response?.ok ? result.imported : result.failed ).push( name );
	}
	progress( 1 );
	return result;
}

module.exports = {
	importMusic,
	audioFiles,
	route,
	same,
	disposition,
	AUDIO,
};
