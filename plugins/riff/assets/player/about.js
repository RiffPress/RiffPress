/* About: the panel beside the page about the track playing (Riff\About), filled here through the
 * riff:view event, as a plugin fills a section of its own. Its sections are drawn by the server,
 * hidden, in the order the riff_about_sections filter gives; this fills Riff's two. `track` is the
 * cover, the title, and the artist and the album, each a link to its page in the Listen app.
 * `credits` is what the file's own tags say about who made it, as WordPress read them on upload and
 * the media route hands them back in media_details; the album and artist the file is filed under
 * come with them, from the same answer. Nothing is fetched from anywhere else, and a tag the file
 * lacks is left out, so a track with none shows no credits at all. Loaded the first time the panel
 * opens. */
import { fmt, largest } from 'riff-player/helpers';

// Strings are WordPress translations of this module (wp_set_script_module_translations()).
// Core prints wp.i18n only when there are translations, so without it the strings are the
// English they are written in.
const __ = window.wp?.i18n?.__ || ( ( english ) => english );

const VIEW = 'about';

export default function about( P ) {
	const { root } = P;
	const data = P.data.about || {};
	const panel = () => root.querySelector( `[data-riff-panel="${ VIEW }"]` );
	const part = ( id ) =>
		panel()?.querySelector( `[data-riff-about="${ id }"]` );
	const cache = new Map();
	let turn = 0; // So a slow answer for an earlier track cannot fill the panel for this one.

	// The tags, in the order they are read out, each under the names the formats give it: getID3's
	// for an MP3's ID3 frames, and a FLAC, Ogg or M4A file's own, as Media::tags() keeps them.
	const CREDITS = [
		[ __( 'Composer', 'riff' ), [ 'composer' ] ],
		[ __( 'Lyricist', 'riff' ), [ 'lyricist' ] ],
		[ __( 'Conductor', 'riff' ), [ 'conductor' ] ],
		[ __( 'Album artist', 'riff' ), [ 'band' ] ],
		[ __( 'Genre', 'riff' ), [ 'genre' ] ],
		[ __( 'Year', 'riff' ), [ 'year' ] ],
		[ __( 'Label', 'riff' ), [ 'publisher', 'label', 'organization' ] ],
		[ __( 'Disc', 'riff' ), [ 'part_of_a_set' ] ],
		[ __( 'Track', 'riff' ), [ 'track_number' ] ],
		[ __( 'Copyright', 'riff' ), [ 'copyright_message', 'copyright' ] ],
	];

	// What the media route has on a Media Library file: its tags, and the album and artist terms it
	// is filed under. Null for a file outside the library, or one this listener may not read.
	function details( t ) {
		const id = Number( t?.id );
		if ( ! data.media || ! Number.isInteger( id ) || id <= 0 ) {
			return Promise.resolve( null );
		}
		if ( ! cache.has( id ) ) {
			const url = new URL( String( id ), data.media );
			// media_details is built only when asked for by that name; the terms come embedded,
			// which needs the links asked for too.
			url.searchParams.set( '_fields', 'media_details,_links,_embedded' );
			url.searchParams.set( '_embed', 'wp:term' );
			const asked = P.internal
				.request( url )
				.then( ( r ) => ( r.ok ? r.json() : null ) )
				.then( ( answer ) => {
					const terms = (
						answer?._embedded?.[ 'wp:term' ] || []
					).flat();
					return {
						tags: answer?.media_details || {},
						albums: terms.filter(
							( term ) => term?.taxonomy === 'riff_album'
						),
						artists: terms.filter(
							( term ) => term?.taxonomy === 'riff_artist'
						),
					};
				} )
				.catch( () => null );
			asked.then( ( found ) => found || cache.delete( id ) );
			cache.set( id, asked );
		}
		return cache.get( id );
	}

	// Where an album's or an artist's page is: the Listen app on this page, or the site's Listen page.
	function page( kind, terms, name ) {
		const app = document.querySelector( '[data-riff-app]' );
		const base = app?.dataset.riffPage || data.listen;
		const key = data[ kind ];
		const wanted = String( name || '' )
			.trim()
			.toLowerCase();
		const term = wanted
			? ( terms || [] ).find(
					( one ) =>
						String( one?.name || '' )
							.trim()
							.toLowerCase() === wanted
				)
			: null;
		if ( ! base || ! key || ! Number.isInteger( Number( term?.id ) ) ) {
			return '';
		}
		const url = new URL( base, location.href );
		url.searchParams.set( key, String( term.id ) );
		return url.toString();
	}

	// A name, as a link to its page where it has one.
	function named( text, href, className ) {
		const el = document.createElement( href ? 'a' : 'span' );
		el.className = className;
		el.textContent = text;
		if ( href ) {
			el.href = href;
		}
		return el;
	}

	// "3/12", as a tag writes a track or a disc of a set, read as "3 of 12".
	function position( value ) {
		const [ one, of ] = String( value )
			.split( '/' )
			.map( ( n ) => n.trim() );
		return of
			? fmt(
					/* translators: 1: A track's or a disc's number, 2: How many there are. */
					__( '%1$s of %2$s', 'riff' ),
					one,
					of
				)
			: one;
	}

	function fillTrack( t, found ) {
		const into = part( 'track' );
		const body = into?.querySelector( '.riff-about-body' );
		if ( ! body ) {
			return;
		}
		body.replaceChildren();
		if ( ! t ) {
			into.hidden = true;
			return;
		}
		const art = largest( t.art ) || t.video?.poster || '';
		if ( art ) {
			// The title beside it says what it is.
			const img = document.createElement( 'img' );
			img.className = 'riff-about-cover';
			img.alt = '';
			img.decoding = 'async';
			img.src = art;
			body.append( img );
		}
		const title = document.createElement( 'h3' );
		title.className = 'riff-about-title';
		title.textContent = t.title || '';
		if ( t.lang && t.lang !== document.documentElement.lang ) {
			title.lang = t.lang;
		}
		body.append( title );
		if ( t.artist ) {
			body.append(
				named(
					t.artist,
					page( 'artist', found?.artists, t.artist ),
					'riff-about-artist'
				)
			);
		}
		if ( t.album ) {
			body.append(
				named(
					t.album,
					page( 'album', found?.albums, t.album ),
					'riff-about-album'
				)
			);
		}
		into.hidden = false;
	}

	function fillCredits( t, found ) {
		const into = part( 'credits' );
		const body = into?.querySelector( '.riff-about-body' );
		if ( ! body ) {
			return;
		}
		body.replaceChildren();
		// The year and the disc are on every track; the rest only in the file's tags.
		const tags = {
			...( t?.year ? { year: String( t.year ) } : {} ),
			...( t?.disc ? { part_of_a_set: String( t.disc ) } : {} ),
			...( found?.tags || {} ),
		};
		const list = document.createElement( 'dl' );
		list.className = 'riff-about-credits';
		for ( const [ label, keys ] of CREDITS ) {
			const key = keys.find(
				( k ) =>
					typeof tags[ k ] === 'string' ||
					typeof tags[ k ] === 'number'
			);
			let value = key ? String( tags[ key ] ).trim() : '';
			if ( key === 'part_of_a_set' || key === 'track_number' ) {
				value = position( value );
			}
			// The album's artist, said only where it is not the track's own.
			if (
				! value ||
				( key === 'band' &&
					value.toLowerCase() ===
						String( t?.artist || '' )
							.trim()
							.toLowerCase() )
			) {
				continue;
			}
			const row = document.createElement( 'div' );
			const term = document.createElement( 'dt' );
			term.textContent = label;
			const definition = document.createElement( 'dd' );
			definition.append(
				key === 'band'
					? named(
							value,
							page( 'artist', found?.artists, value ),
							'riff-about-link'
						)
					: document.createTextNode( value )
			);
			row.append( term, definition );
			list.append( row );
		}
		if ( list.childElementCount ) {
			body.append( list );
		}
		into.hidden = ! list.childElementCount;
	}

	async function fill() {
		const t = P.track() || null;
		const mine = ++turn;
		// What the track itself says, at once; the links and the credits once the file's tags come.
		fillTrack( t, null );
		fillCredits( t, null );
		const found = t ? await details( t ) : null;
		if ( mine !== turn || ! found ) {
			return;
		}
		fillTrack( t, found );
		fillCredits( t, found );
	}

	// Opened, and again as the track changes while it is open.
	root.addEventListener( 'riff:view', ( e ) => {
		if ( e.detail?.id === VIEW && e.detail.open ) {
			fill();
		}
	} );
	// Opened before this loaded.
	if ( P.panelOpen === VIEW ) {
		fill();
	}

	// A link goes to its page: Now Playing closes, so the page shows, and a panel covering the
	// screen closes with it; beside the page it stays. On a Listen page the app opens the page in
	// place, as it does its own links. Closing Now Playing goes back past its own entry in the
	// history, so the link is followed once that is done, or the page it opens would be undone.
	panel()?.addEventListener( 'click', ( e ) => {
		const link = e.target.closest?.( 'a[href]' );
		if (
			! link ||
			e.button !== 0 ||
			e.metaKey ||
			e.ctrlKey ||
			e.shiftKey ||
			e.altKey
		) {
			return;
		}
		const side = P.side;
		const covering =
			side &&
			getComputedStyle( side )
				.getPropertyValue( '--riff-side-place' )
				.trim() !== 'beside';
		if ( covering ) {
			P.hidePanel?.( { quiet: true } );
		}
		// Open, and not already sliding away from a press a moment ago.
		if ( ! root.classList.contains( 'is-open' ) ) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		let gone = false;
		const go = () => {
			if ( ! gone ) {
				gone = true;
				link.click();
			}
		};
		if ( history.state?.riff === 'open' ) {
			window.addEventListener( 'popstate', () => setTimeout( go ), {
				once: true,
			} );
			setTimeout( go, 500 );
		} else {
			setTimeout( go );
		}
		P.close();
	} );

	return {};
}
