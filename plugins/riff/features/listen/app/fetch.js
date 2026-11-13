/* Fetching, remembered for the session so going back is instant: a post or a page of the library
 * from the REST route, and a browse view as the server rendered it at its address. And prefetch:
 * a view is fetched as soon as it is likely to be wanted. */

import { passHeader, route as routed } from 'riff-app/helpers';

// How many answers, and how many views, are remembered: the ones wanted last, so a long session
// keeps what going back needs and lets the rest go.
const KEEP = 30;
// How long the pointer rests on a link before its view is fetched: long enough that a pointer
// crossing a grid on its way somewhere fetches nothing.
const INTENT = 80;

// What make() gives for key, remembered in map: from there when it was asked for before, and moved
// to the end, as the one wanted last; the first is let go once there are more than KEEP. A fetch
// that fails is forgotten, so the next ask tries again.
function remember( map, key, make ) {
	if ( map.has( key ) ) {
		const kept = map.get( key );
		map.delete( key );
		map.set( key, kept );
		return kept;
	}
	const made = make();
	map.set( key, made );
	made.catch( () => map.get( key ) === made && map.delete( key ) );
	if ( map.size > KEEP ) {
		map.delete( map.keys().next().value );
	}
	return made;
}

export function fetching( ctx ) {
	const { api, app, rest } = ctx;
	const cache = new Map();

	// The route's address, with a path appended and a page set.
	function route( path = '', pageNumber = 0 ) {
		const u = routed( rest, path );
		if ( pageNumber > 1 ) {
			u.searchParams.set( 'page', String( pageNumber ) );
		}
		return u.toString();
	}

	async function get( path = '', pageNumber = 0 ) {
		const key = route( path, pageNumber );
		return remember( cache, key, () =>
			// As whoever is signed in, as the views the server draws are.
			api.request( key ).then( ( r ) => {
				if ( ! r.ok ) {
					throw new Error( String( r.status ) );
				}
				return r.json();
			} )
		);
	}

	// Your Library is drawn on the server from the listener's likes. A signed-in listener's are in
	// their account; a visitor's are in this browser, so the fetch carries them, newest first, as
	// t, a or r and an ID. The server reads them only when nobody is signed in.
	const LETTERS = { track: 't', album: 'a', artist: 'r' };
	function fetchable( href ) {
		if ( ! ctx.isLibrary( href ) || typeof api.likes !== 'function' ) {
			return href;
		}
		const u = new URL( href, location.href );
		const liked = api
			.likes()
			.slice( 0, 400 )
			.map( ( l ) => LETTERS[ l.kind ] + l.id )
			.join( ',' );
		if ( liked ) {
			u.searchParams.set( 'riff_liked', liked );
		}
		return u.toString();
	}

	// A browse view, as the server rendered it at its address: its view and its navigation. Asked
	// for with riff_part=view, so the server sends those and the title without the page around
	// them (App::part()); a server without it sends the whole page, which reads the same.
	const rendered = new Map();
	function pageView( href ) {
		href = fetchable( href );
		const part = new URL( href, location.href );
		part.searchParams.set( 'riff_part', 'view' );
		return remember( rendered, href, () =>
			fetch( part, {
				headers: { Accept: 'text/html', ...passHeader() },
			} )
				.then( ( r ) => {
					if ( ! r.ok ) {
						throw new Error( String( r.status ) );
					}
					return r.text();
				} )
				.then( ( text ) => {
					const doc = new DOMParser().parseFromString(
						text,
						'text/html'
					);
					const body = doc.querySelector( '[data-riff-app-view]' );
					if ( ! body ) {
						throw new Error( 'no view' );
					}
					return {
						view: body.innerHTML,
						nav: doc.querySelector( '.riff-app-bar' )?.innerHTML,
						title: doc.title,
					};
				} )
		);
	}

	// A view that was drawn is drawn again next time: Your Library after a like, every view after a
	// change to a playlist, whose sidebar lists them. The REST answers are all fetched again, as any
	// of them may hold what changed; which names views' addresses, not the route's.
	function forget( which = null ) {
		cache.clear();
		if ( ! which ) {
			rendered.clear();
			return;
		}
		for ( const key of rendered.keys() ) {
			if ( which( key ) ) {
				rendered.delete( key );
			}
		}
	}

	// ---- Prefetch. A view is fetched as soon as it is likely to be wanted: the pointer rests on its
	// link, the link takes focus or a finger lands on it. A fetch is remembered, so the click itself
	// finds the view already there. Nothing is fetched only because the page is idle: each view is
	// drawn on the server for whoever asks, so every tab fetched on every load would cost the
	// server a view for each one the listener never opens.
	function prefetch( href ) {
		// The view showing too: the server drew it, so going back to it needs its own fetch.
		const to = ctx.postOf( href );
		if ( ! to ) {
			return Promise.resolve();
		}
		let ahead;
		if ( to.browse ) {
			// pageView() adds a visitor's likes to Your Library's address.
			ahead = pageView( to.href );
		} else if ( to.id ) {
			ahead = get( '/' + to.id );
		} else {
			ahead = get( '' );
		}
		return ahead.catch( () => {} );
	}
	const link = ( e ) => {
		const a = e.target.closest?.( 'a[href]' );
		return a && ! a.target && ! a.hasAttribute( 'download' ) ? a : null;
	};
	const warm = ( e ) => {
		const a = link( e );
		if ( a ) {
			prefetch( a.href );
		}
	};
	// The pointer, once it rests on a link; a focus or a finger, at once.
	let aimed = null;
	let aiming = 0;
	app.addEventListener(
		'pointerover',
		( e ) => {
			const a = link( e );
			if ( ! a || a === aimed ) {
				return;
			}
			clearTimeout( aiming );
			aimed = a;
			aiming = setTimeout( () => prefetch( a.href ), INTENT );
		},
		{ passive: true }
	);
	app.addEventListener(
		'pointerout',
		( e ) => {
			if ( aimed && ! aimed.contains( e.relatedTarget ) ) {
				clearTimeout( aiming );
				aimed = null;
			}
		},
		{ passive: true }
	);
	app.addEventListener( 'focusin', warm );
	app.addEventListener( 'touchstart', warm, { passive: true } );

	return { get, pageView, forget };
}
