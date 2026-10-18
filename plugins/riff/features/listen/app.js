/* Riff's app: the library and every post in it, on one page, so the music never stops.
 *
 * riff.js loads this on the page that holds the block and hands over an api: mount() turns the
 * marked figures in a view into rows, play() starts a queue, current() is the track playing. The
 * server rendered the first view and every link in it is a real address, so this only has to make
 * the next view arrive without a page load: fetch it from the REST route, swap it in, push the
 * address. Back and forward do the same from history. Load more adds the next page of the library
 * in place and changes the address to the one that renders the same cards on the server. */

export function start( api ) {
	const app = document.querySelector( '[data-riff-app]' );
	const view = app.querySelector( '[data-riff-app-view]' );
	const rest = app.dataset.riffRest;
	const page = new URL( app.dataset.riffPage, location.href );
	const query = app.dataset.riffQuery || 'riff';
	const pageQuery = app.dataset.riffPageQuery || 'riff_page';
	// The arguments of the browse views (albums, artists, tracks, search), which the server renders.
	const browseArgs = ( app.dataset.riffBrowse || '' ).split( ',' ).filter( Boolean );
	const tracksRest = app.dataset.riffTracksRest || '';
	const nav = app.querySelector( '.riff-app-bar' );
	const s = api.strings || {};
	const cache = new Map();
	let showing = 0; // A counter, so a slow fetch cannot paint over a newer view.
	let picking = 0; // The same for a cover's Play, so an older press cannot replace the queue.

	// ---- What went wrong, said where the player's own notices appear. The region is in the page
	// before anything is said in it, so a screen reader announces each message.
	const status = document.createElement( 'p' );
	status.className = 'riff-app-status';
	status.setAttribute( 'role', 'status' );
	app.append( status );
	let statusTimer = 0;
	function tell( message ) {
		status.textContent = message;
		clearTimeout( statusTimer );
		statusTimer = setTimeout( () => ( status.textContent = '' ), 6000 );
	}
	function untell() {
		clearTimeout( statusTimer );
		status.textContent = '';
	}

	// ---- Addresses. A view is the page itself (the library), the page with ?riff_page={n} (the
	// library through page n), the page with ?riff={id}, or a browse view: ?riff_view=albums,
	// ?riff_album={id}, ?riff_artist={id}, ?riff_search={words}.
	const postOf = ( url ) => {
		const u = new URL( url, location.href );
		if ( u.origin !== page.origin || u.pathname !== page.pathname ) {
			return null;
		}
		// The same page, with only the app's own arguments allowed to differ: on a site without
		// pretty permalinks every post link is /?p=N on this very path and must stay a real link.
		const others = new URLSearchParams( u.search );
		others.delete( query );
		others.delete( pageQuery );
		browseArgs.forEach( ( key ) => others.delete( key ) );
		// A shared track's name, which riff.js reads on arrival.
		others.delete( 'riff_track' );
		others.sort();
		const own = new URLSearchParams( page.search );
		own.sort();
		if ( others.toString() !== own.toString() ) {
			return null;
		}
		const id = Number( u.searchParams.get( query ) );
		const pages = Number( u.searchParams.get( pageQuery ) );
		u.hash = '';
		return {
			id: Number.isInteger( id ) && id > 0 ? id : 0,
			pages: Number.isInteger( pages ) && pages > 1 ? pages : 1,
			browse: browseArgs.some( ( key ) => u.searchParams.get( key ) ),
			href: u.toString(),
		};
	};
	// Which view an address is, to tell a real change from Now Playing's own history entry.
	const keyOf = ( to ) => ( to.browse ? to.href : String( to.id ) );
	let shown = keyOf( postOf( location.href ) || { id: 0 } );
	const addressOf = ( id, pages = 1 ) => {
		const u = new URL( page );
		if ( ! id && pages > 1 ) {
			u.searchParams.set( pageQuery, String( pages ) );
		}
		if ( id ) {
			u.searchParams.set( query, String( id ) );
		}
		return u.toString();
	};

	// ---- Fetching, remembered for the session so going back is instant.
	// The route's address, with a path appended and a page set, whether the site has pretty
	// permalinks (/wp-json/riff/v1/library/12) or not (/?rest_route=/riff/v1/library/12).
	function route( path = '', pageNumber = 0 ) {
		const u = new URL( rest );
		if ( u.searchParams.has( 'rest_route' ) ) {
			u.searchParams.set( 'rest_route', u.searchParams.get( 'rest_route' ) + path );
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
				fetch( key, {
					headers: { Accept: 'application/json' },
				} ).then( ( r ) => {
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

	// A browse view, as the server rendered it at its address: its view and its navigation.
	const rendered = new Map();
	function pageView( href ) {
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
						const doc = new DOMParser().parseFromString( text, 'text/html' );
						const body = doc.querySelector( '[data-riff-app-view]' );
						if ( ! body ) {
							throw new Error( 'no view' );
						}
						return {
							view: body.innerHTML,
							nav: doc.querySelector( '.riff-app-bar' )?.innerHTML,
						};
					} )
			);
			rendered.get( href ).catch( () => rendered.delete( href ) );
		}
		return rendered.get( href );
	}

	// The navigation's current link, for the views the script draws itself.
	function markNav( to ) {
		for ( const a of nav?.querySelectorAll( 'a[aria-current]' ) || [] ) {
			a.removeAttribute( 'aria-current' );
		}
		if ( ! to.id ) {
			nav?.querySelector( '.riff-app-home' )?.setAttribute( 'aria-current', 'page' );
		}
		const field = nav?.querySelector( 'input[type="search"]' );
		if ( field ) {
			field.value = '';
		}
	}

	// ---- Views.
	async function show( to, { push = true } = {} ) {
		const { id, pages: upto } = to;
		const turn = ++showing;
		app.setAttribute( 'aria-busy', 'true' );
		let html;
		let bar;
		try {
			if ( to.browse ) {
				( { view: html, nav: bar } = await pageView( to.href ) );
			} else {
				html = id ? await postView( id ) : await libraryView( upto );
			}
		} catch {
			// The route is gone or the network is: let the address load as a page.
			if ( turn === showing ) {
				location.assign( to.browse ? to.href : addressOf( id, upto ) );
			}
			return;
		}
		if ( turn !== showing ) {
			return;
		}
		// The browser animates the swap where it can; the page's own colours do the rest.
		const swap = () => {
			view.innerHTML = html;
			if ( bar !== undefined && nav ) {
				nav.innerHTML = bar;
			} else if ( ! to.browse ) {
				markNav( to );
			}
		};
		if ( document.startViewTransition && ! reducedMotion() ) {
			const transition = document.startViewTransition( swap );
			// A newer view skips this one's animation; that is not an error.
			transition.ready.catch( () => {} );
			transition.finished.catch( () => {} );
			await transition.updateCallbackDone;
		} else {
			swap();
		}
		shown = keyOf( to );
		if ( push ) {
			// The rest of the state stays: WordPress's Interactivity runtime reloads the page on any
			// history entry that lost its session id, which would end the music on Back.
			history.pushState(
				{ ...history.state, riffApp: id },
				'',
				to.browse ? to.href : addressOf( id, upto )
			);
		}
		app.removeAttribute( 'aria-busy' );
		api.mount();
		const top = app.getBoundingClientRect().top;
		if ( top < 0 ) {
			app.scrollIntoView( { block: 'start' } );
		}
		view.querySelector( 'h2' )?.focus?.();
	}

	const reducedMotion = () =>
		window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;

	// The library through page `upto`, as Listen\App::library_view() renders it.
	async function libraryView( upto = 1 ) {
		const first = await get( '' );
		if ( ! first.items.length ) {
			return `<p class="riff-app-empty">${ esc( s.appEmpty || '' ) }</p>`;
		}
		const pages = first.pages || 1;
		const last = Math.min( upto, pages );
		const later = await Promise.all(
			Array.from( { length: last - 1 }, ( _, i ) => get( '', i + 2 ) )
		);
		const cards = [ first, ...later ]
			.map( ( p, i ) => cardsOf( p.items, i + 1 ) )
			.join( '' );
		return (
			continueListening() +
			`<h2 class="riff-app-title" tabindex="-1">${ esc(
				s.library || 'Library'
			) }</h2><div class="riff-grid" data-riff-page="${ last }" data-riff-pages="${ pages }">` +
			cards +
			'</div>' +
			( last < pages
				? `<p class="riff-app-more"><a class="riff-pill" href="${ esc(
						moreAddress( last + 1 )
				  ) }" data-riff-app-action="more">${ esc(
						s.more || 'Load more'
				  ) }</a></p>`
				: '' )
		);
	}

	// Load more's link: one page further, landing on that page's first card.
	const moreAddress = ( n ) => `${ addressOf( 0, n ) }#riff-page-${ n }`;

	// A page of cards; the first of every page after the first is where Load more's link lands.
	const cardsOf = ( items, n ) =>
		items.map( ( item, i ) => card( item, i === 0 && n > 1 ? n : 0 ) ).join( '' );

	// What is playing now, at the top of the library, with a way back to its post.
	function continueListening() {
		const t = api.current();
		if ( ! t || ! t.post ) {
			return '';
		}
		const art = t.art?.length ? t.art[ 0 ].src : '';
		const href = t.post.id ? addressOf( t.post.id ) : t.post.url;
		return (
			'<aside class="riff-now">' +
			`<span class="riff-now-art">${
				art ? `<img src="${ esc( art ) }" alt="" decoding="async">` : ''
			}</span>` +
			`<span class="riff-now-text"><span class="riff-now-label">${ esc(
				s.nowPlaying || 'Now playing'
			) }</span><span class="riff-now-title">${ esc( t.title ) }</span><span class="riff-now-sub">${ esc(
				t.artist || t.post.title
			) }</span></span>` +
			`<a class="riff-pill" href="${ esc( href ) }">${ esc( s.open || 'Open' ) }</a>` +
			'</aside>'
		);
	}

	// The next page of the library, after the cards already there. The button is marked busy
	// rather than disabled, so it keeps focus; the page only advances once one has arrived.
	async function loadMore( button ) {
		const grid = app.querySelector( '.riff-grid' );
		if ( ! grid || button.getAttribute( 'aria-disabled' ) === 'true' ) {
			return;
		}
		const turn = showing;
		const next = Number( grid.dataset.riffPage ) + 1;
		button.setAttribute( 'aria-disabled', 'true' );
		try {
			const { items, pages } = await get( '', next );
			if ( turn !== showing || ! grid.isConnected ) {
				return;
			}
			grid.insertAdjacentHTML( 'beforeend', cardsOf( items, next ) );
			grid.dataset.riffPage = String( next );
			untell();
			// The address that renders these same cards, so a reload or a shared link shows them.
			history.replaceState( history.state, '', addressOf( 0, next ) );
			if ( next >= ( pages || 1 ) ) {
				// The button goes, so focus moves to the first of the cards it brought.
				button.closest( '.riff-app-more' )?.remove();
				document
					.getElementById( `riff-page-${ next }` )
					?.querySelector( 'a' )
					?.focus();
			} else {
				button.href = moreAddress( next + 1 );
			}
		} catch {
			if ( turn === showing ) {
				tell( s.moreError || '' );
			}
		} finally {
			button.removeAttribute( 'aria-disabled' );
		}
	}

	// Play straight from a cover, without opening the post. What was playing carries on until the
	// post's tracks have arrived, and carries on if they do not.
	async function playCard( button ) {
		if ( button.getAttribute( 'aria-busy' ) === 'true' ) {
			return;
		}
		const turn = ++picking;
		const shownAt = showing;
		button.setAttribute( 'aria-busy', 'true' );
		try {
			const post = await get( '/' + Number( button.dataset.riffPost ) );
			if ( turn !== picking || shownAt !== showing ) {
				return;
			}
			untell();
			if ( Array.isArray( post.tracks ) && post.tracks.length ) {
				api.play( post.tracks, 0 );
			}
		} catch {
			if ( turn === picking && shownAt === showing ) {
				tell( s.playError || '' );
			}
		} finally {
			button.removeAttribute( 'aria-busy' );
		}
	}

	// Play an album from its cover, from the tracks route, in album order.
	async function playAlbum( button ) {
		if ( button.getAttribute( 'aria-busy' ) === 'true' || ! tracksRest ) {
			return;
		}
		const turn = ++picking;
		const shownAt = showing;
		button.setAttribute( 'aria-busy', 'true' );
		try {
			const u = new URL( tracksRest, location.href );
			u.searchParams.set( 'album', String( Number( button.dataset.riffAlbum ) ) );
			u.searchParams.set( 'per_page', '100' );
			const r = await fetch( u, { headers: { Accept: 'application/json' } } );
			if ( ! r.ok ) {
				throw new Error( String( r.status ) );
			}
			const { items } = await r.json();
			if ( turn !== picking || shownAt !== showing ) {
				return;
			}
			untell();
			if ( Array.isArray( items ) && items.length ) {
				api.play( items, 0 );
			}
		} catch {
			if ( turn === picking && shownAt === showing ) {
				tell( s.playError || '' );
			}
		} finally {
			button.removeAttribute( 'aria-busy' );
		}
	}

	function card( item, first = 0 ) {
		const art = item.art?.length ? item.art[ item.art.length - 1 ].src : '';
		// The same markup the server writes in Listen\App::card().
		return (
			`<div class="riff-card"${
				first ? ` id="riff-page-${ first }"` : ''
			} data-riff-post="${ item.id }">` +
			`<span class="riff-card-art">${
				art
					? `<img src="${ esc(
							art
					  ) }" alt="" loading="lazy" decoding="async">`
					: ''
			}<button type="button" class="riff-card-play" data-riff-app-action="play-card" data-riff-post="${ item.id }" aria-label="${ esc(
				fmt( s.playTrack || 'Play %s', item.title )
			) }"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button></span>` +
			`<a class="riff-card-link" href="${ esc( addressOf( item.id ) ) }"><span class="riff-card-title">${ esc( item.title ) }</span></a>` +
			`<span class="riff-card-sub">${ esc( meta( item ) ) }</span></div>`
		);
	}

	async function postView( id ) {
		const post = await get( '/' + id );
		return (
			'<header class="riff-album">' +
			`<div class="riff-album-text"><h2 class="riff-album-title" tabindex="-1">${ esc(
				post.title
			) }</h2>` +
			`<p class="riff-album-meta">${ esc( meta( post ) ) }</p></div>` +
			`<p class="riff-album-actions"><button type="button" class="riff-pill riff-pill-solid" data-riff-app-action="play">${ esc(
				s.play || 'Play'
			) }</button>` +
			`<button type="button" class="riff-pill" data-riff-app-action="shuffle">${ esc(
				s.shuffle || 'Shuffle'
			) }</button></p></header>` +
			`<div class="riff-album-tracks" data-riff-tracks="${ esc(
				JSON.stringify( post.tracks )
			) }">${ post.html }</div>`
		);
	}

	// "Artist · 10 tracks · 7 min". The server writes it into the item, with the language's own
	// plural forms; the rest is for a source that does not.
	function meta( item ) {
		if ( typeof item.meta === 'string' ) {
			return item.meta;
		}
		const parts = [];
		if ( item.artist ) {
			parts.push( item.artist );
		}
		parts.push(
			fmt(
				item.count === 1 ? s.oneTrack || '%s track' : s.tracks || '%s tracks',
				item.count
			)
		);
		const minutes = Math.round( ( item.duration || 0 ) / 60 );
		if ( minutes ) {
			parts.push( fmt( s.minutes || '%s min', minutes ) );
		}
		return parts.join( ' · ' );
	}

	// ---- Clicks. A link into the app is followed here; anything else is left to the browser.
	app.addEventListener( 'click', ( e ) => {
		if (
			e.defaultPrevented ||
			e.button !== 0 ||
			e.metaKey ||
			e.ctrlKey ||
			e.shiftKey ||
			e.altKey
		) {
			return;
		}
		const action = e.target.closest( '[data-riff-app-action]' );
		if ( action?.dataset.riffAppAction === 'play-card' ) {
			e.preventDefault();
			playCard( action );
			return;
		}
		if ( action?.dataset.riffAppAction === 'play-album' ) {
			e.preventDefault();
			playAlbum( action );
			return;
		}
		if ( action?.dataset.riffAppAction === 'more' ) {
			e.preventDefault();
			loadMore( action );
			return;
		}
		if ( action ) {
			const holder = app.querySelector( '[data-riff-tracks]' );
			const tracks = holder ? parse( holder.dataset.riffTracks ) : null;
			if ( Array.isArray( tracks ) && tracks.length ) {
				api.play( tracks, 0, {
					shuffle: action.dataset.riffAppAction === 'shuffle',
				} );
			}
			return;
		}
		const a = e.target.closest( 'a[href]' );
		if ( ! a || a.target || a.hasAttribute( 'download' ) ) {
			return;
		}
		const to = postOf( a.href );
		if ( ! to ) {
			return;
		}
		e.preventDefault();
		show( to ).catch( () => {} );
	} );

	// Search: the form works as a plain GET without the script; with it, the results swap in.
	app.addEventListener( 'submit', ( e ) => {
		const form = e.target.closest( '.riff-app-search' );
		if ( ! form ) {
			return;
		}
		const u = new URL( form.action, location.href );
		new FormData( form ).forEach( ( value, key ) =>
			u.searchParams.set( key, String( value ) )
		);
		const to = postOf( u.toString() );
		if ( to?.browse ) {
			e.preventDefault();
			show( to ).catch( () => {} );
		}
	} );

	window.addEventListener( 'popstate', () => {
		const to = postOf( location.href );
		// Now Playing closes through history.back() on the same address; that is not a view change.
		if ( to && keyOf( to ) !== shown ) {
			show( to, { push: false } ).catch( () => {} );
		}
	} );
	history.replaceState(
		{ ...history.state, riffApp: postOf( location.href )?.id || 0 },
		''
	);
}

// ---- Helpers.

function esc( s ) {
	return String( s )
		.replace( /&/g, '&amp;' )
		.replace( /</g, '&lt;' )
		.replace( />/g, '&gt;' )
		.replace( /"/g, '&quot;' );
}

function fmt( pattern, value ) {
	return String( pattern ).replace( '%s', String( value ) );
}

function parse( json ) {
	try {
		return json ? JSON.parse( json ) : null;
	} catch {
		return null;
	}
}
