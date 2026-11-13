/* About: the panel beside the page about the track playing (Riff\About), filled here through the
 * riff:view event, as a plugin fills a section of its own. Its sections are drawn by the server,
 * hidden, in the order the riff_about_sections filter gives; this fills Riff's two. `track` is the
 * cover, the title, and the artist and the album, each a link to its page in the Listen app.
 * `credits` is what the file's own tags say about who made it, as WordPress read them on upload and
 * the media route hands them back in media_details; the albums and artists the file is filed under
 * come from the same answer by ID, named through riff/v1. The file's caption, where it has one, is
 * its credit line, as an archive's recording is given its source and licence there (Riff\Archives).
 * Nothing is fetched from anywhere else, and a tag the file lacks is left out, so a track with none
 * shows no credits at all. Over the cover, where the deck can show, a button offers it: Now Playing
 * opened to the turntable, full screen where the browser can do that. Loaded the first time the
 * panel opens. */
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

	// A caption as the media route renders it, as text: it is read, never put on the page as markup.
	const plain = ( html ) =>
		html
			? (
					new DOMParser().parseFromString(
						String( html ),
						'text/html'
					).body.textContent || ''
				).trim()
			: '';

	// What the media route has on a Media Library file: its tags, and the IDs of the albums and
	// artists it is filed under, named through Riff's own routes, since WordPress's term routes for
	// them are closed (Catalog_REST). Null for a file outside the library, or one this listener may
	// not read.
	const known = ( route, ids ) => {
		if ( ! data.catalog || ! ids.length ) {
			return Promise.resolve( [] );
		}
		const url = new URL( route, data.catalog );
		for ( const id of ids ) {
			url.searchParams.append( 'include[]', String( id ) );
		}
		return P.internal
			.request( url )
			.then( ( r ) => ( r.ok ? r.json() : null ) )
			.then( ( d ) => ( Array.isArray( d?.items ) ? d.items : [] ) )
			.catch( () => [] );
	};
	const ids = ( list ) =>
		( Array.isArray( list ) ? list : [] )
			.map( Number )
			.filter( ( n ) => Number.isInteger( n ) && n > 0 );
	function details( t ) {
		const id = Number( t?.id );
		if ( ! data.media || ! Number.isInteger( id ) || id <= 0 ) {
			return Promise.resolve( null );
		}
		if ( ! cache.has( id ) ) {
			const url = new URL( String( id ), data.media );
			// media_details is built only when asked for by that name.
			url.searchParams.set(
				'_fields',
				'media_details,caption,riff_albums,riff_artists'
			);
			const asked = P.internal
				.request( url )
				.then( ( r ) => ( r.ok ? r.json() : null ) )
				.then( ( answer ) =>
					answer
						? Promise.all( [
								known( 'albums', ids( answer.riff_albums ) ),
								known( 'artists', ids( answer.riff_artists ) ),
						  ] ).then( ( [ albums, artists ] ) => ( {
								tags: answer.media_details || {},
								credit: plain( answer.caption?.rendered ),
								albums,
								artists,
						  } ) )
						: null
				)
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
		// The cover and the deck's button stay where they are as the rest is drawn again, so the
		// focus on the button (handed back as Now Playing closes) is never lost to a redraw.
		let frame = body.querySelector( ':scope > .riff-about-art' );
		if ( ! frame ) {
			frame = document.createElement( 'div' );
			frame.className = 'riff-about-art';
			frame.append( offer() );
		}
		for ( const node of [ ...body.children ] ) {
			if ( node !== frame ) {
				node.remove();
			}
		}
		if ( ! t ) {
			into.hidden = true;
			return;
		}
		const art = largest( t.art ) || t.video?.poster || '';
		let img = frame.querySelector( '.riff-about-cover' );
		if ( art && ! img ) {
			// The title beside it says what it is.
			img = document.createElement( 'img' );
			img.className = 'riff-about-cover';
			img.alt = '';
			img.decoding = 'async';
			frame.prepend( img );
		}
		if ( art && img.getAttribute( 'src' ) !== art ) {
			img.src = art;
		} else if ( ! art ) {
			img?.remove();
		}
		if ( ! frame.isConnected ) {
			body.append( frame );
		}
		placeOffer();
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

	// ---- The deck, offered. Where Now Playing's album is the turntable (now-playing.js, roomy()):
	// a site that has it on, a listener who hasn't asked for less motion, a song rather than a
	// video, a window wider than tall, and WebGL2, which draws the deck as it is meant to be seen.
	// Nothing is loaded for it here: the deck is set up as Now Playing opens, as it always is.
	const deckable = () =>
		P.data.turntable !== false &&
		! P.reduce() &&
		! P.isVideo?.() &&
		'WebGL2RenderingContext' in window &&
		window.innerWidth > window.innerHeight;
	// Full screen only where the browser lets a page ask (not an iPhone), and only from the press.
	const whole = () =>
		!! document.fullscreenEnabled && !! document.documentElement.requestFullscreen;
	let asked = false; // Whether the page is full screen because this button asked.

	function offer() {
		const button = document.createElement( 'button' );
		button.type = 'button';
		button.className = 'riff-about-deck';
		const icon = panel()
			?.querySelector( '.riff-about-deck-icon' )
			?.content.cloneNode( true );
		if ( icon ) {
			button.append( icon );
		}
		const label = document.createElement( 'span' );
		label.textContent = whole()
			? __( 'Open the deck full screen', 'riff' )
			: __( 'Open the deck', 'riff' );
		button.append( label );
		button.addEventListener( 'click', () => {
			if ( whole() && ! document.fullscreenElement ) {
				document.documentElement
					.requestFullscreen( { navigationUI: 'hide' } )
					.then( () => ( asked = true ) )
					.catch( () => {} );
			}
			P.open( 'album' );
		} );
		return button;
	}

	// Shown where the deck is, and following the window and the listener's motion setting.
	function placeOffer() {
		const button = panel()?.querySelector( '.riff-about-deck' );
		if ( button ) {
			button.hidden = ! deckable();
		}
	}
	window.addEventListener( 'resize', placeOffer );
	window
		.matchMedia( '(prefers-reduced-motion: reduce)' )
		.addEventListener?.( 'change', placeOffer );

	// Leaving Now Playing leaves the full screen it asked for; Escape leaves only the full screen.
	root.addEventListener( 'riff:view', ( e ) => {
		if ( e.detail?.id === 'album' && ! e.detail.open && asked ) {
			asked = false;
			if ( document.fullscreenElement ) {
				document.exitFullscreen().catch( () => {} );
			}
		}
	} );
	document.addEventListener( 'fullscreenchange', () => {
		if ( ! document.fullscreenElement ) {
			asked = false;
		}
	} );

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
		// Last, the file's credit line, whoever it credits.
		if ( found?.credit ) {
			const row = document.createElement( 'div' );
			const term = document.createElement( 'dt' );
			term.textContent = __( 'Credit', 'riff' );
			const definition = document.createElement( 'dd' );
			definition.textContent = found.credit;
			row.append( term, definition );
			list.append( row );
		}
		rights( list, t?.rights );
		if ( list.childElementCount ) {
			body.append( list );
		}
		into.hidden = ! list.childElementCount;
	}

	// The rights the artist set, after the credits: "℗ 2024 Holder" and the licence, linked to
	// its deed. Nothing while they set none.
	function rights( list, r ) {
		if ( ! r?.holder ) {
			return;
		}
		const row = ( label, value ) => {
			const div = document.createElement( 'div' );
			const term = document.createElement( 'dt' );
			term.textContent = label;
			const definition = document.createElement( 'dd' );
			definition.append( value );
			div.append( term, definition );
			list.append( div );
		};
		row(
			__( 'Rights', 'riff' ),
			document.createTextNode(
				[ '℗', r.year || '', r.holder ].filter( Boolean ).join( ' ' )
			)
		);
		if ( r.license_label ) {
			let value = document.createTextNode( r.license_label );
			if ( r.license_url ) {
				value = document.createElement( 'a' );
				value.href = r.license_url;
				value.rel = 'license';
				value.className = 'riff-about-link';
				value.textContent = r.license_label;
			}
			row( __( 'Licence', 'riff' ), value );
		}
		if ( r.isrc ) {
			row( 'ISRC', document.createTextNode( r.isrc ) );
		}
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
