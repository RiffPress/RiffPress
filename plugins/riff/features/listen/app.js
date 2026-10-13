/* Riff's app: the library and every post in it, on one page, so the music never stops.
 *
 * riff.js loads this on the page that holds the block and hands over an api: mount() turns the
 * marked figures in a view into rows, play() starts a queue, current() is the track playing. The
 * server rendered the first view and every link in it is a real address, so this only has to make
 * the next view arrive without a page load: fetch it from the REST route, swap it in, push the
 * address. Back and forward do the same from history. */

export function start( api ) {
	const app = document.querySelector( '[data-riff-app]' );
	const view = app.querySelector( '[data-riff-app-view]' );
	const rest = app.dataset.riffRest;
	const page = new URL( app.dataset.riffPage, location.href );
	const query = app.dataset.riffQuery || 'riff';
	const s = api.strings || {};
	const cache = new Map();
	let showing = 0; // A counter, so a slow fetch cannot paint over a newer view.

	// ---- Addresses. A view is the page itself (the library) or the page with ?riff={id}.
	const postOf = ( url ) => {
		const u = new URL( url, location.href );
		if ( u.origin !== page.origin || u.pathname !== page.pathname ) {
			return null;
		}
		// The same page, with only the app's own argument allowed to differ: on a site without
		// pretty permalinks every post link is /?p=N on this very path and must stay a real link.
		const others = new URLSearchParams( u.search );
		others.delete( query );
		others.sort();
		const own = new URLSearchParams( page.search );
		own.sort();
		if ( others.toString() !== own.toString() ) {
			return null;
		}
		const id = Number( u.searchParams.get( query ) );
		return { id: Number.isInteger( id ) && id > 0 ? id : 0 };
	};
	let shown = postOf( location.href )?.id ?? 0;
	const addressOf = ( id ) => {
		const u = new URL( page );
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

	// ---- Views.
	async function show( id, { push = true } = {} ) {
		const turn = ++showing;
		app.setAttribute( 'aria-busy', 'true' );
		let html;
		try {
			html = id ? await postView( id ) : await libraryView();
		} catch {
			// The route is gone or the network is: let the address load as a page.
			if ( turn === showing ) {
				location.assign( addressOf( id ) );
			}
			return;
		}
		if ( turn !== showing ) {
			return;
		}
		// The browser animates the swap where it can; the page's own colours do the rest.
		const swap = () => {
			view.innerHTML = html;
		};
		if ( document.startViewTransition && ! reducedMotion() ) {
			await document.startViewTransition( swap ).updateCallbackDone;
		} else {
			swap();
		}
		shown = id;
		if ( push ) {
			// The rest of the state stays: WordPress's Interactivity runtime reloads the page on any
			// history entry that lost its session id, which would end the music on Back.
			history.pushState(
				{ ...history.state, riffApp: id },
				'',
				addressOf( id )
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

	async function libraryView() {
		const { items, pages } = await get( '' );
		if ( ! items.length ) {
			return `<p class="riff-app-empty">${ esc( s.appEmpty || '' ) }</p>`;
		}
		return (
			continueListening() +
			`<h2 class="riff-app-title" tabindex="-1">${ esc(
				s.library || 'Library'
			) }</h2><div class="riff-grid" data-riff-page="1" data-riff-pages="${ pages || 1 }">` +
			items.map( card ).join( '' ) +
			'</div>' +
			( pages > 1
				? `<p class="riff-app-more"><button type="button" class="riff-pill" data-riff-app-action="more">${ esc(
						s.more || 'Load more'
				  ) }</button></p>`
				: '' )
		);
	}

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

	async function loadMore( button ) {
		const grid = app.querySelector( '.riff-grid' );
		if ( ! grid ) {
			return;
		}
		const next = Number( grid.dataset.riffPage ) + 1;
		button.disabled = true;
		try {
			const { items, pages } = await get( '', next );
			grid.insertAdjacentHTML( 'beforeend', items.map( card ).join( '' ) );
			grid.dataset.riffPage = String( next );
			if ( next >= ( pages || 1 ) ) {
				button.closest( '.riff-app-more' )?.remove();
			}
		} finally {
			button.disabled = false;
		}
	}

	// Play straight from a cover, without opening the post.
	async function playCard( id ) {
		const post = await get( '/' + id );
		if ( Array.isArray( post.tracks ) && post.tracks.length ) {
			api.play( post.tracks, 0 );
		}
	}

	function card( item ) {
		const art = item.art?.length ? item.art[ item.art.length - 1 ].src : '';
		return (
			`<a class="riff-card" href="${ esc( addressOf( item.id ) ) }" data-riff-post="${ item.id }">` +
			`<span class="riff-card-art"><button type="button" class="riff-card-play" data-riff-app-action="play-card" data-riff-post="${ item.id }" aria-label="${ esc(
				fmt( s.playTrack || 'Play %s', item.title )
			) }"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>${
				art
					? `<img src="${ esc(
							art
					  ) }" alt="" loading="lazy" decoding="async">`
					: ''
			}</span>` +
			`<span class="riff-card-title">${ esc( item.title ) }</span>` +
			`<span class="riff-card-sub">${ esc( meta( item ) ) }</span></a>`
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

	// "Artist · 10 tracks · 7 min", the way the server writes it.
	function meta( item ) {
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
			playCard( Number( action.dataset.riffPost ) ).catch( () => {} );
			return;
		}
		if ( action?.dataset.riffAppAction === 'more' ) {
			loadMore( action ).catch( () => {} );
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
		show( to.id ).catch( () => {} );
	} );

	window.addEventListener( 'popstate', () => {
		const to = postOf( location.href );
		// Now Playing closes through history.back() on the same address; that is not a view change.
		if ( to && to.id !== shown ) {
			show( to.id, { push: false } ).catch( () => {} );
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
