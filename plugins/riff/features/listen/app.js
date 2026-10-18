/* Riff's app: the library and every post in it, on one page, so the music never stops.
 *
 * riff.js loads this on the page that holds the block and hands over an api: mount() turns the
 * marked figures in a view into rows, play() starts a queue, current() is the track playing. The
 * server rendered the first view and every link in it is a real address, so this only has to make
 * the next view arrive without a page load: fetch what the server renders at that address, swap it
 * in, push the address. Back and forward do the same from history. Load more adds the next page of
 * posts in place and changes the address to the one that renders the same cards on the server.
 * Home's rows of what was played come from this device, so they are filled here. */

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

	// ---- Addresses. A view is the page itself (Home), the page with ?riff={id}, or a browse view:
	// ?riff_view=albums, artists, tracks or posts (with ?riff_page={n}, posts through page n),
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
	// Posts through page n, as the server renders it.
	const postsAddress = ( n = 1 ) => {
		const u = new URL( page );
		u.searchParams.set( browseArgs[ 0 ] || 'riff_view', 'posts' );
		if ( n > 1 ) {
			u.searchParams.set( pageQuery, String( n ) );
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

	// ---- Views.
	async function show( to, { push = true } = {} ) {
		const { id, pages: upto } = to;
		const turn = ++showing;
		app.setAttribute( 'aria-busy', 'true' );
		let html;
		let bar;
		try {
			// Every view, Home and a post's too, is what the server renders at its address, so it
			// is written in one place.
			( { view: html, nav: bar } = await pageView(
				to.browse ? to.href : addressOf( id, upto )
			) );
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
				sidebar( app.dataset.sidebar !== 'mini', false );
				wireSearch();
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
		home();
		const top = app.getBoundingClientRect().top;
		if ( top < 0 ) {
			app.scrollIntoView( { block: 'start' } );
		}
		view.querySelector( 'h2' )?.focus?.();
	}

	const reducedMotion = () =>
		window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;

	// Load more's link: one page further, landing on that page's first card.
	const moreAddress = ( n ) => `${ postsAddress( n ) }#riff-page-${ n }`;

	// A page of cards; the first of every page after the first is where Load more's link lands.
	const cardsOf = ( items, n ) =>
		items.map( ( item, i ) => card( item, i === 0 && n > 1 ? n : 0 ) ).join( '' );

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
			history.replaceState( history.state, '', postsAddress( next ) );
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
		if ( action?.dataset.riffAppAction === 'play-history' ) {
			e.preventDefault();
			const played = api.history();
			api.play( played, Number( action.dataset.riffIndex ) || 0 );
			return;
		}
		if ( action?.dataset.riffAppAction === 'sidebar' ) {
			sidebar( action.getAttribute( 'aria-expanded' ) !== 'true' );
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
		// The tab shows as chosen at once, whatever the network is doing.
		if ( a.closest( '.riff-app-bar' ) ) {
			for ( const tab of nav.querySelectorAll( 'a[aria-current]' ) ) {
				tab.removeAttribute( 'aria-current' );
			}
			a.setAttribute( 'aria-current', 'page' );
		}
		show( to ).catch( () => {} );
	} );

	// ---- Home's rows of what was played, from this device: the posts last played from, to jump
	// back into, and the tracks themselves. Each stays hidden while there is nothing in it.
	function home() {
		const played = api.history();
		const fill = ( slug, cards ) => {
			const shelf = view.querySelector( `[data-riff-shelf="${ slug }"]` );
			if ( ! shelf || ! cards ) {
				return;
			}
			shelf.querySelector( '.riff-shelf-row' ).innerHTML = cards;
			shelf.hidden = false;
		};
		const posts = [];
		for ( const t of played ) {
			if ( t.post?.id && ! posts.some( ( p ) => p.post.id === t.post.id ) ) {
				posts.push( t );
			}
		}
		fill(
			'jump',
			posts
				.slice( 0, 12 )
				.map( ( t ) =>
					shelfCard( {
						art: t.art,
						title: t.post.title,
						sub: t.artist,
						href: addressOf( t.post.id ),
						play: `data-riff-app-action="play-card" data-riff-post="${ Number(
							t.post.id
						) }"`,
						label: t.post.title,
					} )
				)
				.join( '' )
		);
		fill(
			'recent',
			played
				.slice( 0, 20 )
				.map( ( t, i ) =>
					shelfCard( {
						art: t.art,
						title: t.title,
						sub: t.artist,
						href: t.post?.id ? addressOf( t.post.id ) : '',
						play: `data-riff-app-action="play-history" data-riff-index="${ i }"`,
						label: t.title,
					} )
				)
				.join( '' )
		);
	}

	// A card in one of Home's rows, in the markup the server's cards use.
	function shelfCard( { art, title, sub, href, play, label } ) {
		const src = art?.length ? art[ art.length - 1 ].src : '';
		const name = href
			? `<a class="riff-card-link" href="${ esc( href ) }"><span class="riff-card-title">${ esc(
					title
			  ) }</span></a>`
			: `<span class="riff-card-title">${ esc( title ) }</span>`;
		return (
			'<div class="riff-card"><span class="riff-card-art">' +
			( src
				? `<img src="${ esc( src ) }" alt="" loading="lazy" decoding="async">`
				: '' ) +
			`<button type="button" class="riff-card-play" ${ play } aria-label="${ esc(
				fmt( s.playTrack || 'Play %s', label )
			) }"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button></span>` +
			name +
			`<span class="riff-card-sub">${ esc( sub || '' ) }</span></div>`
		);
	}
	home();

	// ---- The sidebar, on a wide screen in standalone mode: full, or a rail of icons. The choice is
	// this device's, so it is remembered here rather than anywhere shared.
	function sidebar( open, remember = true ) {
		app.dataset.sidebar = open ? 'full' : 'mini';
		nav?.querySelector( '.riff-app-collapse' )?.setAttribute( 'aria-expanded', String( open ) );
		if ( remember ) {
			try {
				localStorage.setItem( 'riff-sidebar', open ? 'full' : 'mini' );
			} catch {}
		}
	}
	try {
		if ( localStorage.getItem( 'riff-sidebar' ) === 'mini' ) {
			sidebar( false, false );
		}
	} catch {}

	// ---- Prefetch. A view is fetched as soon as it is likely to be wanted: the pointer reaches its
	// link, the link takes focus or a finger lands on it, and every tab once the page is idle. A
	// fetch is remembered for the session, so the click itself finds the view already there.
	function prefetch( href ) {
		// The view showing too: the server drew it, so going back to it needs its own fetch.
		const to = postOf( href );
		if ( ! to ) {
			return;
		}
		let ahead;
		if ( to.browse ) {
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
	const idle = window.requestIdleCallback || ( ( fn ) => setTimeout( fn, 1200 ) );
	idle( () => {
		for ( const tab of nav?.querySelectorAll( 'a[href]' ) || [] ) {
			prefetch( tab.href );
		}
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

	// ---- Search as you type: a list under the field of the best match, then songs, albums and
	// artists, from the same routes the results page reads; recent searches while it is empty. The
	// field is a combobox: arrow keys move through the list, Enter opens or plays the one chosen, or
	// with nothing chosen loads the full results page as before. Each answer is numbered, so a slow
	// one can never replace a newer one.
	const SEARCHES = 'riff-searches';
	const recentSearches = () => {
		try {
			const list = JSON.parse( localStorage.getItem( SEARCHES ) || '[]' );
			return Array.isArray( list ) ? list.filter( ( q ) => typeof q === 'string' ) : [];
		} catch {
			return [];
		}
	};
	const rememberSearch = ( q ) => {
		const words = q.trim();
		if ( ! words ) {
			return;
		}
		try {
			localStorage.setItem(
				SEARCHES,
				JSON.stringify( [ words, ...recentSearches().filter( ( x ) => x !== words ) ].slice( 0, 6 ) )
			);
		} catch {}
	};
	// A route beside /tracks: /albums or /artists, with its arguments, pretty permalinks or not.
	const catalog = ( name, params ) => {
		const u = new URL( tracksRest, location.href );
		if ( u.searchParams.has( 'rest_route' ) ) {
			u.searchParams.set( 'rest_route', u.searchParams.get( 'rest_route' ).replace( /\/tracks$/, '/' + name ) );
		} else {
			u.pathname = u.pathname.replace( /\/tracks\/?$/, '/' + name );
		}
		Object.entries( params ).forEach( ( [ k, v ] ) => u.searchParams.set( k, String( v ) ) );
		return u.toString();
	};
	const browseHref = ( key, id ) => {
		const u = new URL( page );
		u.searchParams.set( key, String( id ) );
		return u.toString();
	};
	// How well a name answers the words: the whole name, its start, a word in it, anywhere in it.
	const score = ( name, q ) => {
		const n = String( name || '' ).toLowerCase();
		const w = q.toLowerCase();
		if ( n === w ) {
			return 4;
		}
		if ( n.startsWith( w ) ) {
			return 3;
		}
		if ( n.split( /[\s,.\-–]+/ ).some( ( part ) => part.startsWith( w ) ) ) {
			return 2;
		}
		return n.includes( w ) ? 1 : 0;
	};

	const searchForm = () => nav?.querySelector( '.riff-app-search' );
	let suggestTurn = 0;
	let suggestTimer = 0;
	let options = [];
	let active = -1;
	const panel = document.createElement( 'div' );
	panel.className = 'riff-suggest';
	panel.id = 'riff-suggest';
	panel.hidden = true;
	const said = document.createElement( 'p' );
	said.className = 'riff-app-sr';
	said.setAttribute( 'role', 'status' );

	function wireSearch() {
		const form = searchForm();
		const field = form?.querySelector( 'input[type="search"]' );
		if ( ! field || field.dataset.riffSuggest ) {
			return;
		}
		field.dataset.riffSuggest = '1';
		field.setAttribute( 'role', 'combobox' );
		field.setAttribute( 'aria-autocomplete', 'list' );
		field.setAttribute( 'aria-expanded', 'false' );
		field.setAttribute( 'aria-controls', panel.id );
		field.setAttribute( 'autocomplete', 'off' );
		// On the app's root, not in the sidebar, whose own stacking would put the view over it.
		app.append( panel, said );
		field.addEventListener( 'input', () => {
			clearTimeout( suggestTimer );
			suggestTimer = setTimeout( () => suggest( field ), 100 );
		} );
		field.addEventListener( 'focus', () => suggest( field ) );
		field.addEventListener( 'keydown', ( e ) => keys( e, field ) );
		field.addEventListener( 'blur', () => setTimeout( () => {
			if ( ! form.contains( document.activeElement ) ) {
				closeSuggest( field );
			}
		}, 150 ) );
		form.addEventListener( 'submit', () => rememberSearch( field.value ) );
	}

	function closeSuggest( field ) {
		panel.hidden = true;
		panel.replaceChildren();
		options = [];
		active = -1;
		field?.setAttribute( 'aria-expanded', 'false' );
		field?.removeAttribute( 'aria-activedescendant' );
	}

	async function suggest( field ) {
		const q = field.value.trim();
		const turn = ++suggestTurn;
		if ( ! q ) {
			const recent = recentSearches();
			if ( ! recent.length ) {
				closeSuggest( field );
				return;
			}
			draw( field, [ {
				label: s.recentSearches || 'Recent searches',
				items: recent.map( ( words ) => ( { kind: 'recent', title: words, run: () => runSearch( field, words ) } ) ),
			} ], '' );
			return;
		}
		let answers;
		try {
			answers = await Promise.all( [
				fetch( catalog( 'tracks', { search: q, per_page: 5 } ) ).then( ( r ) => r.json() ),
				fetch( catalog( 'albums', { search: q } ) ).then( ( r ) => r.json() ),
				fetch( catalog( 'artists', { search: q } ) ).then( ( r ) => r.json() ),
			] );
		} catch {
			return;
		}
		if ( turn !== suggestTurn || field.value.trim() !== q ) {
			return;
		}
		const [ tracks, albums, artists ] = answers.map( ( a ) => ( Array.isArray( a?.items ) ? a.items : [] ) );
		const played = tracks.slice( 0, 4 );
		const songs = played.map( ( t, i ) => ( {
			kind: 'track',
			title: t.title,
			sub: t.artist,
			art: t.art,
			run: () => {
				rememberSearch( q );
				closeSuggest( field );
				api.play( played, i );
			},
		} ) );
		const albumItems = albums.slice( 0, 3 ).map( ( a ) => ( {
			kind: 'album', title: a.name, sub: a.artist || '', art: a.art,
			href: browseHref( browseArgs[ 1 ] || 'riff_album', a.id ),
		} ) );
		const artistItems = artists.slice( 0, 3 ).map( ( a ) => ( {
			kind: 'artist', title: a.name, sub: s.artist || 'Artist',
			href: browseHref( browseArgs[ 2 ] || 'riff_artist', a.id ),
		} ) );
		// The best match across all three; on a tie an artist, then an album, then a song.
		const top = [ ...artistItems, ...albumItems, ...songs ]
			.map( ( o ) => ( { o, n: score( o.title, q ) } ) )
			.sort( ( x, y ) => y.n - x.n )[ 0 ];
		const groups = [];
		if ( top?.n ) {
			groups.push( { label: s.topResult || 'Top result', items: [ { ...top.o, top: true } ] } );
		}
		const besides = ( list ) => list.filter( ( o ) => o !== top?.o );
		if ( besides( songs ).length ) {
			groups.push( { label: s.songs || 'Songs', items: besides( songs ) } );
		}
		if ( besides( albumItems ).length ) {
			groups.push( { label: s.albums || 'Albums', items: besides( albumItems ) } );
		}
		if ( besides( artistItems ).length ) {
			groups.push( { label: s.artists || 'Artists', items: besides( artistItems ) } );
		}
		groups.push( { label: '', items: [ { kind: 'all', title: fmt( s.allResults || 'All results for “%s”', q ), run: () => runSearch( field, q ) } ] } );
		draw( field, groups, q );
	}

	function runSearch( field, words ) {
		field.value = words;
		closeSuggest( field );
		searchForm()?.requestSubmit();
	}

	function draw( field, groups, q ) {
		panel.replaceChildren();
		options = [];
		active = -1;
		groups.forEach( ( g, gi ) => {
			const list = document.createElement( 'div' );
			list.setAttribute( 'role', g.label ? 'group' : 'presentation' );
			if ( g.label ) {
				const h = document.createElement( 'p' );
				h.className = 'riff-suggest-head';
				h.id = `riff-suggest-g${ gi }`;
				h.textContent = g.label;
				list.setAttribute( 'aria-labelledby', h.id );
				list.append( h );
			}
			g.items.forEach( ( o ) => {
				const el = document.createElement( o.href ? 'a' : 'div' );
				el.className = 'riff-suggest-option' + ( o.top ? ' riff-suggest-top' : '' ) + ` riff-suggest-${ o.kind }`;
				el.id = `riff-suggest-o${ options.length }`;
				el.setAttribute( 'role', 'option' );
				el.setAttribute( 'aria-selected', 'false' );
				el.tabIndex = -1;
				if ( o.href ) {
					el.href = o.href;
				}
				const src = o.art?.length ? o.art[ 0 ].src : '';
				el.innerHTML =
					( o.kind === 'recent' || o.kind === 'all'
						? ''
						: `<span class="riff-suggest-art${ o.kind === 'artist' ? ' riff-suggest-round' : '' }" aria-hidden="true">${
							src ? `<img src="${ esc( src ) }" alt="" decoding="async">` : esc( String( o.title || '' ).slice( 0, 1 ).toUpperCase() )
						}</span>` ) +
					`<span class="riff-suggest-text"><span class="riff-suggest-title">${ esc( o.title ) }</span>${
						o.sub ? `<span class="riff-suggest-sub">${ esc( o.sub ) }</span>` : ''
					}</span>`;
				el.addEventListener( 'mousedown', ( e ) => e.preventDefault() );
				el.addEventListener( 'click', ( e ) => {
					if ( o.run ) {
						e.preventDefault();
						o.run();
					} else {
						rememberSearch( q );
						closeSuggest( field );
					}
				} );
				options.push( { el, o } );
				list.append( el );
			} );
			panel.append( list );
		} );
		place( field );
		panel.setAttribute( 'role', 'listbox' );
		panel.setAttribute( 'aria-label', s.searchSuggestions || 'Suggestions' );
		panel.hidden = false;
		field.setAttribute( 'aria-expanded', 'true' );
		const found = options.filter( ( x ) => x.o.kind !== 'all' && x.o.kind !== 'recent' ).length;
		said.textContent = q
			? fmt( found === 1 ? s.oneSuggestion || '%s suggestion' : s.suggestions || '%s suggestions', found )
			: '';
	}

	// The list is placed against the window, under the field, so no column it sits in can clip it.
	function place( field ) {
		const r = field.getBoundingClientRect();
		const width = Math.min( 420, window.innerWidth - 32 );
		panel.style.top = `${ r.bottom + 6 }px`;
		panel.style.left = `${ Math.max( 16, Math.min( r.left, window.innerWidth - width - 16 ) ) }px`;
		panel.style.width = `${ width }px`;
	}
	const follow = () => {
		const field = searchForm()?.querySelector( 'input[type="search"]' );
		if ( field && ! panel.hidden ) {
			place( field );
		}
	};
	window.addEventListener( 'resize', follow );
	window.addEventListener( 'scroll', follow, { passive: true, capture: true } );

	function keys( e, field ) {
		if ( panel.hidden ) {
			if ( e.key === 'ArrowDown' ) {
				suggest( field );
			}
			return;
		}
		if ( e.key === 'ArrowDown' || e.key === 'ArrowUp' ) {
			e.preventDefault();
			const n = options.length;
			active = e.key === 'ArrowDown' ? ( active + 1 ) % n : ( active - 1 + n ) % n;
			options.forEach( ( x, i ) => x.el.setAttribute( 'aria-selected', String( i === active ) ) );
			field.setAttribute( 'aria-activedescendant', options[ active ].el.id );
			options[ active ].el.scrollIntoView( { block: 'nearest' } );
		} else if ( e.key === 'Enter' && active >= 0 ) {
			e.preventDefault();
			options[ active ].el.click();
		} else if ( e.key === 'Escape' ) {
			e.preventDefault();
			closeSuggest( field );
		}
	}
	wireSearch();

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
	// Everything is listening: what needs the script, the sidebar's toggle, can show.
	app.dataset.riffAppReady = '';
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
