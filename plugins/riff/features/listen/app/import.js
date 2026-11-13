/* Adding music from the app, for someone who may upload: files chosen, or files and folders dropped
 * on the window, each sent to WordPress's own media route as whoever is signed in. WordPress reads
 * each file's tags, length and artwork, and Riff files new uploads under their album and artist, so
 * nothing here is Riff's own but the asking. Folders are walked all the way down, and names sorted
 * as people read them, so an album's tracks arrive in order. A file the Media Library already has is
 * skipped. Loaded only for someone who may upload (Player::enqueue()). */

// The name the player goes by (riff_brand), from the data the player's page carries.
function brand() {
	try {
		return (
			JSON.parse(
				document.getElementById( 'riff-data' )?.textContent || '{}'
			).brand?.name || 'Riff'
		);
	} catch {
		return 'Riff';
	}
}

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
const natural = new Intl.Collator( undefined, {
	numeric: true,
	sensitivity: 'base',
} );

// A name in letters and digits only, without its extension: how a file and the name WordPress kept
// for it compare, since WordPress swaps spaces and punctuation for hyphens. A name of none of those,
// as one in another script, is one WordPress keeps as unnamed-file.
const stem = ( name ) =>
	name
		.replace( /\.[^.]+$/, '' )
		.toLowerCase()
		.replace( /[^a-z0-9]+/g, '' ) || 'unnamedfile';

// The names a media item may answer to: as WordPress kept it, or without the -2 it adds to a name it
// already had.
function namesOf( url ) {
	let name = url.split( '/' ).pop();
	try {
		name = decodeURIComponent( name );
	} catch {
		// Left as it is: it is compared, never shown.
	}
	return [ stem( name ), stem( name.replace( /-\d+(\.[^.]+)$/, '$1' ) ) ];
}

// Everything under a dropped folder, in the order a folder lists it, skipping what is hidden.
async function walk( entry ) {
	if ( entry.isFile ) {
		return new Promise( ( done ) =>
			entry.file(
				( file ) => done( [ file ] ),
				() => done( [] )
			)
		);
	}
	const reader = entry.createReader();
	const entries = [];
	// A folder hands over its entries a batch at a time, until a batch is empty.
	let batch;
	do {
		batch = await new Promise( ( done ) =>
			reader.readEntries( done, () => done( [] ) )
		);
		entries.push( ...batch );
	} while ( batch.length );
	const found = [];
	for ( const child of entries.sort( ( a, b ) =>
		natural.compare( a.name, b.name )
	) ) {
		if ( ! child.name.startsWith( '.' ) ) {
			found.push( ...( await walk( child ) ) );
		}
	}
	return found;
}

export function importing( { app, tell, show, postOf, __, _n } ) {
	const { riffMedia: route, riffNonce: nonce } = app.dataset;
	const headers = { 'X-WP-Nonce': nonce };
	let busy = false;

	const address = ( query ) =>
		route +
		( route.includes( '?' ) ? '&' : '?' ) +
		new URLSearchParams( query );
	// What the Media Library has, read once a batch: a search can't find a file by its name, since the
	// title it searches is the file's tags. Each name with the sizes recorded for it.
	const library = async () => {
		const known = new Map();
		for ( let page = 1, pages = 1; page <= pages; page++ ) {
			const response = await fetch(
				address( {
					media_type: 'audio',
					per_page: 100,
					page,
					_fields: 'source_url,media_details',
				} ),
				{ headers, credentials: 'same-origin' }
			);
			if ( ! response.ok ) {
				break;
			}
			pages = Number( response.headers.get( 'X-WP-TotalPages' ) ) || 1;
			for ( const media of await response.json() ) {
				for ( const name of namesOf(
					String( media.source_url || '' )
				) ) {
					known.set( name, [
						...( known.get( name ) || [] ),
						media.media_details?.filesize,
					] );
				}
			}
		}
		return known;
	};
	// The same name, and the same size where WordPress recorded one.
	const has = ( known, file ) =>
		( known.get( stem( file.name ) ) || [] ).some(
			( size ) => ! size || size === file.size
		);
	const send = ( file ) => {
		const ascii = file.name.replace( /[^\x20-\x7e]|["\\;]/g, '_' );
		return fetch( route, {
			method: 'POST',
			credentials: 'same-origin',
			headers: {
				...headers,
				'Content-Type':
					TYPES[ file.name.split( '.' ).pop().toLowerCase() ],
				'Content-Disposition': `attachment; filename="${ ascii }"; filename*=UTF-8''${ encodeURIComponent( file.name ) }`,
			},
			body: file,
		} );
	};

	// Why the site refused a file, in its own words: the message of WordPress's REST error, said as
	// text, since core's messages carry markup and entities. Nothing where the answer isn't one.
	const reason = async ( response ) => {
		const body = await response.json().catch( () => null );
		const message = typeof body?.message === 'string' ? body.message : '';
		return new DOMParser()
			.parseFromString( message, 'text/html' )
			.body.textContent.replace( /\s+/g, ' ' )
			.trim();
	};

	// Files chosen while others are going wait their turn, so nothing dropped is lost.
	const queue = [];
	async function add( chosen ) {
		const files = chosen.filter( ( file ) => AUDIO.test( file.name ) );
		if ( ! files.length ) {
			tell(
				/* translators: %s: the player's name, Riff unless the host names it otherwise. */
				__(
					'There is no music in that. %s takes MP3, M4A, FLAC, Ogg, Opus and WAV.',
					'riff'
				).replace( '%s', () => brand() )
			);
			return;
		}
		queue.push( ...files );
		if ( busy ) {
			return;
		}
		busy = true;
		const counts = { added: 0, had: 0 };
		// What failed, by the server's reason, so files refused alike are one line.
		const failed = new Map();
		const refuse = ( name, why ) =>
			failed.set( why, [ ...( failed.get( why ) || [] ), name ] );
		let known = new Map();
		try {
			known = await library();
		} catch {
			// With nothing to compare against, a file is sent, and the server keeps both.
		}
		for ( let k = 0; k < queue.length; k++ ) {
			const file = queue[ k ];
			tell(
				/* translators: 1: Which file of them is being added. 2: How many files there are. */
				__( 'Adding %1$d of %2$d…', 'riff' )
					.replace( '%1$d', k + 1 )
					.replace( '%2$d', queue.length ),
				true
			);
			try {
				if ( has( known, file ) ) {
					counts.had++;
					continue;
				}
				const response = await send( file );
				if ( response.ok ) {
					counts.added++;
					continue;
				}
				const why = await reason( response );
				refuse( file.name, why );
				// Signed out, or no longer allowed: the rest would go the same way.
				if ( response.status === 401 || response.status === 403 ) {
					queue
						.slice( k + 1 )
						.forEach( ( { name } ) => refuse( name, why ) );
					break;
				}
			} catch {
				refuse( file.name, '' );
			}
		}
		queue.length = 0;
		busy = false;
		const said = [];
		if ( counts.added ) {
			said.push(
				/* translators: %d: How many tracks were added. */
				_n(
					'%d track added.',
					'%d tracks added.',
					counts.added,
					'riff'
				).replace( '%d', counts.added )
			);
		}
		if ( counts.had ) {
			said.push(
				/* translators: %d: How many tracks were already there. */
				_n(
					'%d was already here.',
					'%d were already here.',
					counts.had,
					'riff'
				).replace( '%d', counts.had )
			);
		}
		for ( const [ why, names ] of failed ) {
			let which = names.join( ', ' );
			if ( names.length > 3 ) {
				/* translators: 1: The names of three files, separated by commas. 2: How many more there are. */
				which = __( '%1$s and %2$d more', 'riff' )
					.replace( '%1$s', () => names.slice( 0, 3 ).join( ', ' ) )
					.replace( '%2$d', names.length - 3 );
			}
			if ( why ) {
				said.push(
					/* translators: 1: The names of the files. 2: Why the site refused them, in its own words. */
					__( 'Could not add %1$s: %2$s', 'riff' ).replace(
						/%([12])\$s/g,
						( _, n ) => ( n === '1' ? which : why )
					)
				);
			} else {
				said.push(
					/* translators: %s: The names of the files, separated by commas. */
					__( 'Could not add %s.', 'riff' ).replace(
						'%s',
						() => which
					)
				);
			}
		}
		// What failed stays until the next thing is said, as the only word of it.
		tell( said.join( ' ' ), failed.size > 0 );
		const here = postOf( location.href );
		if ( counts.added && here ) {
			show( here, { quiet: true } ).catch( () => {} );
		}
	}

	// Choosing: the Add music link wherever it is drawn, in the account menu or an empty library. It
	// stays a real link to the Media Library, for a page this module never reached.
	const picker = document.createElement( 'input' );
	picker.type = 'file';
	picker.multiple = true;
	picker.hidden = true;
	picker.accept = '.mp3,.m4a,.flac,.ogg,.oga,.opus,.wav,audio/*';
	picker.dataset.riffAddMusic = '';
	picker.addEventListener( 'change', () => {
		const files = [ ...picker.files ].sort( ( a, b ) =>
			natural.compare( a.name, b.name )
		);
		picker.value = '';
		add( files );
	} );
	app.append( picker );
	app.addEventListener( 'click', ( event ) => {
		if ( event.target.closest?.( 'a[href$="media-new.php"]' ) ) {
			event.preventDefault();
			picker.click();
		}
	} );

	// Dropping, anywhere on the window. Only files say so: a dragged cover or word does not.
	const overlay = document.createElement( 'div' );
	overlay.className = 'riff-app-drop';
	overlay.hidden = true;
	overlay.textContent = __( 'Drop to add to your library', 'riff' );
	app.append( overlay );
	const carriesFiles = ( event ) =>
		event.dataTransfer?.types?.includes( 'Files' );
	// Entering a child leaves its parent, so the overlay goes only when as many leaves as enters.
	let depth = 0;
	window.addEventListener( 'dragenter', ( event ) => {
		if ( carriesFiles( event ) ) {
			depth++;
			overlay.hidden = false;
		}
	} );
	window.addEventListener( 'dragleave', ( event ) => {
		if ( carriesFiles( event ) && --depth <= 0 ) {
			depth = 0;
			overlay.hidden = true;
		}
	} );
	window.addEventListener( 'dragover', ( event ) => {
		if ( carriesFiles( event ) ) {
			event.preventDefault();
		}
	} );
	window.addEventListener( 'drop', async ( event ) => {
		if ( ! carriesFiles( event ) ) {
			return;
		}
		event.preventDefault();
		depth = 0;
		overlay.hidden = true;
		// Read at once: the drop's items are gone after its event.
		const items = [ ...event.dataTransfer.items ].map(
			( item ) => item.webkitGetAsEntry?.() || item.getAsFile()
		);
		const files = [];
		for ( const item of items ) {
			if ( item instanceof File ) {
				files.push( item );
			} else if ( item ) {
				files.push( ...( await walk( item ) ) );
			}
		}
		add( files );
	} );
}
