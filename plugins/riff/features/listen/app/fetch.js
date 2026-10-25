/* Fetching, remembered for the session so going back is instant: a post or a page of the library
 * from the REST route, and a browse view as the server rendered it at its address. And prefetch:
 * a view is fetched as soon as it is likely to be wanted. */

export function fetching( ctx ) {
	const { api, app, nav, rest } = ctx;
	const cache = new Map();

	// The route's address, with a path appended and a page set, whether the site has pretty
	// permalinks (/wp-json/riff/v1/library/12) or not (/?rest_route=/riff/v1/library/12).
	function route( path = '', pageNumber = 0 ) {
		const u = new URL( rest );
		if ( u.searchParams.has( 'rest_route' ) ) {
			u.searchParams.set(
				'rest_route',
				u.searchParams.get( 'rest_route' ) + path
			);
		} else {
			u.pathname += path;
		}
		if ( pageNumber > 1 ) {
			u.searchParams.set( 'page', String( pageNumber ) );
		}
		return u.toString();
	}

	async function get( path = '', pageNumber = 0 ) {
		const key = route( path, pageNumber );
		if ( ! cache.has( key ) ) {
			cache.set(
				key,
				// As whoever is signed in, as the views the server draws are.
				api.request( key ).then( ( r ) => {
					if ( ! r.ok ) {
						throw new Error( String( r.status ) );
					}
					return r.json();
				} )
			);
			cache.get( key ).catch( () => cache.delete( key ) );
		}
		return cache.get( key );
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

	// A browse view, as the server rendered it at its address: its view and its navigation.
	const rendered = new Map();
	function pageView( href ) {
		href = fetchable( href );
		if ( ! rendered.has( href ) ) {
			rendered.set(
				href,
				fetch( href, { headers: { Accept: 'text/html' } } )
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
						const body = doc.querySelector(
							'[data-riff-app-view]'
						);
						if ( ! body ) {
							throw new Error( 'no view' );
						}
						return {
							view: body.innerHTML,
							nav: doc.querySelector( '.riff-app-bar' )
								?.innerHTML,
							title: doc.title,
						};
					} )
			);
			rendered.get( href ).catch( () => rendered.delete( href ) );
		}
		return rendered.get( href );
	}

	// A view that was drawn is drawn again next time: Your Library after a like, every view after a
	// change to a playlist, whose sidebar lists them.
	function forget( which = null ) {
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

	// ---- Prefetch. A view is fetched as soon as it is likely to be wanted: the pointer reaches its
	// link, the link takes focus or a finger lands on it, and every tab once the page is idle. A
	// fetch is remembered for the session, so the click itself finds the view already there.
	function prefetch( href ) {
		// The view showing too: the server drew it, so going back to it needs its own fetch.
		const to = ctx.postOf( href );
		if ( ! to ) {
			return;
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
		ahead.catch( () => {} );
	}
	const warm = ( e ) => {
		const a = e.target.closest?.( 'a[href]' );
		if ( a && ! a.target && ! a.hasAttribute( 'download' ) ) {
			prefetch( a.href );
		}
	};
	app.addEventListener( 'pointerover', warm, { passive: true } );
	app.addEventListener( 'focusin', warm );
	app.addEventListener( 'touchstart', warm, { passive: true } );
	const idle =
		window.requestIdleCallback || ( ( fn ) => setTimeout( fn, 1200 ) );
	idle( () => {
		for ( const tab of nav?.querySelectorAll( 'a[href]' ) || [] ) {
			prefetch( tab.href );
		}
	} );

	return { get, pageView, forget };
}
