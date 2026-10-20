/* Riff's app: the library and every post in it, on one page, so the music never stops.
 *
 * riff.js loads this on the page that holds the block and hands over an api: mount() turns the
 * marked figures in a view into rows, play() starts a queue, current() is the track playing. The
 * server rendered the first view and every link in it is a real address, so this only has to make
 * the next view arrive without a page load: fetch what the server renders at that address, swap it
 * in, push the address. Back and forward do the same from history. Load more adds the next page of
 * posts in place and changes the address to the one that renders the same cards on the server.
 * Home's rows of what was played come from the player's history, so they are filled here, and Your
 * Library is fetched with a visitor's likes, which only their browser has. */

export function start( api ) {
	const app = document.querySelector( '[data-riff-app]' );
	const view = app.querySelector( '[data-riff-app-view]' );
	const rest = app.dataset.riffRest;
	const page = new URL( app.dataset.riffPage, location.href );
	const query = app.dataset.riffQuery || 'riff';
	const pageQuery = app.dataset.riffPageQuery || 'riff_page';
	// The arguments of the browse views (albums, artists, tracks, search), which the server renders.
	const browseArgs = ( app.dataset.riffBrowse || '' )
		.split( ',' )
		.filter( Boolean );
	const tracksRest = app.dataset.riffTracksRest || '';
	const nav = app.querySelector( '.riff-app-bar' );
	// The account menu is a details element, so it opens without the script; with it, it closes
	// as a menu does: on Escape, on a click outside it, and once one of its links is followed,
	// since a view arrives in place rather than with a new page.
	const account = app.querySelector( '.riff-app-account' );
	if ( account ) {
		document.addEventListener( 'click', ( e ) => {
			if (
				account.open &&
				( ! account.contains( e.target ) || e.target.closest( 'a' ) )
			) {
				account.open = false;
			}
		} );
		account.addEventListener( 'keydown', ( e ) => {
			if ( e.key === 'Escape' && account.open ) {
				e.stopPropagation();
				account.open = false;
				account.querySelector( 'summary' ).focus();
			}
		} );
	}
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

	// Your Library is drawn on the server from the listener's likes. A signed-in listener's are in
	// their account; a visitor's are in this browser, so the fetch carries them, newest first, as
	// t, a or r and an ID. The server reads them only when nobody is signed in.
	const viewKey = browseArgs[ 0 ] || 'riff_view';
	const isLibrary = ( href ) =>
		new URL( href, location.href ).searchParams.get( viewKey ) ===
		'library';
	const LETTERS = { track: 't', album: 'a', artist: 'r' };
	function fetchable( href ) {
		if ( ! isLibrary( href ) || typeof api.likes !== 'function' ) {
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
						};
					} )
			);
			rendered.get( href ).catch( () => rendered.delete( href ) );
		}
		return rendered.get( href );
	}

	// ---- Views. A quiet show redraws the view in place, as Your Library does when a like changes
	// elsewhere: no history entry, and the focus and scroll stay where they are.
	async function show( to, { push = true, quiet = false } = {} ) {
		push = push && ! quiet;
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
		// Home's rows of what was played are filled here, before the new view is painted.
		const swap = () => {
			view.innerHTML = html;
			home();
			fade( view );
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
		paintLikes();
		if ( quiet ) {
			return;
		}
		const top = app.getBoundingClientRect().top;
		if ( top < 0 ) {
			app.scrollIntoView( { block: 'start' } );
		}
		view.querySelector( 'h2' )?.focus?.();
	}

	// Covers fade in as they arrive, into room the layout already keeps for them; one that has
	// loaded already shows as it is. Without the script there is no fade, and nothing is hidden.
	function fade( root ) {
		for ( const img of root.querySelectorAll( 'img' ) ) {
			if ( img.complete ) {
				continue;
			}
			img.dataset.riffFade = '';
			const done = () => img.removeAttribute( 'data-riff-fade' );
			img.addEventListener( 'load', done, { once: true } );
			img.addEventListener( 'error', done, { once: true } );
		}
	}

	const reducedMotion = () =>
		window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;

	// Load more's link: one page further, landing on that page's first card.
	const moreAddress = ( n ) => `${ postsAddress( n ) }#riff-page-${ n }`;

	// A page of cards; the first of every page after the first is where Load more's link lands.
	const cardsOf = ( items, n ) =>
		items
			.map( ( item, i ) => card( item, i === 0 && n > 1 ? n : 0 ) )
			.join( '' );

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
			// The whole album, page by page, as the album view lists it: a box set runs past one
			// page of the route. Twenty pages is 2,000 tracks.
			const items = [];
			for ( let n = 1, pages = 1; n <= Math.min( pages, 20 ); n++ ) {
				const u = new URL( tracksRest, location.href );
				u.searchParams.set(
					'album',
					String( Number( button.dataset.riffAlbum ) )
				);
				u.searchParams.set( 'per_page', '100' );
				u.searchParams.set( 'page', String( n ) );
				const r = await fetch( u, {
					headers: { Accept: 'application/json' },
				} );
				if ( ! r.ok ) {
					throw new Error( String( r.status ) );
				}
				const data = await r.json();
				items.push(
					...( Array.isArray( data.items ) ? data.items : [] )
				);
				pages = Number( data.pages ) || 1;
			}
			if ( turn !== picking || shownAt !== showing ) {
				return;
			}
			untell();
			if ( items.length ) {
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

	// A card, from the one template the server prints in the block (Listen\Ui::card()), so a card
	// the script adds is the same markup as one the server drew. Each part is filled or removed.
	const template = app.querySelector( 'template[data-riff-card-template]' );
	function makeCard( {
		art,
		title,
		sub,
		href,
		play,
		label,
		data = {},
		id = '',
	} ) {
		const card = template.content.firstElementChild.cloneNode( true );
		card.classList.remove( 'riff-card-template' );
		for ( const [ name, value ] of Object.entries( data ) ) {
			card.setAttribute( `data-riff-${ name }`, String( value ) );
		}
		if ( id ) {
			card.id = id;
		}
		const src = art?.length ? art[ art.length - 1 ].src : '';
		const img = card.querySelector( '.riff-card-art img' );
		if ( src ) {
			img.src = src;
		} else {
			img.remove();
		}
		const button = card.querySelector( '.riff-card-play' );
		button.dataset.riffAppAction = play.action;
		for ( const [ name, value ] of Object.entries( play.data || {} ) ) {
			button.setAttribute( `data-riff-${ name }`, String( value ) );
		}
		button.setAttribute(
			'aria-label',
			fmt( s.playTrack || 'Play %s', label )
		);
		const link = card.querySelector( '.riff-card-link' );
		link.querySelector( '.riff-card-title' ).textContent = title;
		if ( href ) {
			link.href = href;
		} else {
			link.replaceWith( link.firstElementChild );
		}
		card.querySelector( '.riff-card-sub' ).textContent = sub || '';
		return card.outerHTML;
	}

	// A post in the grid, as Listen\App::card() draws one.
	const card = ( item, first = 0 ) =>
		makeCard( {
			art: item.art,
			title: item.title,
			sub: meta( item ),
			href: addressOf( item.id ),
			play: { action: 'play-card', data: { post: item.id } },
			label: item.title,
			data: { post: item.id },
			id: first ? `riff-page-${ first }` : '',
		} );

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
				item.count === 1
					? s.oneTrack || '%s track'
					: s.tracks || '%s tracks',
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
		if ( action?.dataset.riffAppAction === 'play-liked' ) {
			e.preventDefault();
			const tracks = parse( action.dataset.riffTracks );
			if ( Array.isArray( tracks ) && tracks.length ) {
				api.play( tracks, 0 );
			}
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
		if ( playlistAction( action ) ) {
			e.preventDefault();
			return;
		}
		if ( action?.dataset.riffAppAction === 'like' ) {
			likeFrom( action );
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

	// ---- Hearts on an album's or artist's page, pressed from the listener's likes through the
	// player's api, which keeps them in the account or in this browser.
	function paintLikes() {
		if ( typeof api.liked !== 'function' ) {
			return;
		}
		for ( const b of app.querySelectorAll( '[data-riff-like-kind]' ) ) {
			b.setAttribute(
				'aria-pressed',
				String(
					api.liked( b.dataset.riffLikeId, b.dataset.riffLikeKind )
				)
			);
		}
	}
	function likeFrom( button ) {
		const { riffLikeKind: kind, riffLikeId: id } = button.dataset;
		const on = ! api.liked( id, kind );
		if ( on ) {
			api.like( id, kind );
		} else {
			api.unlike( id, kind );
		}
		const name =
			app.querySelector( '.riff-album-title' )?.textContent || '';
		tell(
			fmt(
				on
					? s.savedToLibrary || '%s added to your library'
					: s.removedFromLibrary || '%s removed from your library',
				name
			)
		);
	}

	// A like changed. Your Library drawn before it is out of date, so it is drawn again next time;
	// while it shows, what was unliked leaves it at once, and the focus moves to what came next.
	function likeChanged( { change, kind, id } ) {
		paintLikes();
		for ( const key of rendered.keys() ) {
			if ( isLibrary( key ) ) {
				rendered.delete( key );
			}
		}
		const library = view.querySelector( '[data-riff-library]' );
		if ( ! library ) {
			return;
		}
		if ( change === 'unlike' ) {
			unshow( library, kind, Number( id ) );
		} else if ( ! view.contains( document.activeElement ) ) {
			const here = postOf( location.href );
			if ( here ) {
				show( here, { quiet: true } ).catch( () => {} );
			}
		}
	}
	function unshow( library, kind, id ) {
		let gone = [];
		if ( kind === 'track' ) {
			gone = [
				...library.querySelectorAll(
					'figure[data-riff-track], li[data-riff-track]'
				),
			].filter(
				( fig ) => Number( parse( fig.dataset.riffTrack )?.id ) === id
			);
			const holder = library.querySelector( '[data-riff-tracks]' );
			const tracks = holder ? parse( holder.dataset.riffTracks ) : null;
			if ( Array.isArray( tracks ) ) {
				holder.dataset.riffTracks = JSON.stringify(
					tracks.filter( ( t ) => Number( t.id ) !== id )
				);
			}
		} else {
			gone = [
				...library.querySelectorAll(
					`[data-riff-${ kind }="${ id }"]`
				),
			];
			if ( kind === 'artist' ) {
				gone.push(
					...[
						...library.querySelectorAll( '.riff-artists li' ),
					].filter(
						( li ) =>
							Number(
								new URL(
									li.querySelector( 'a' ).href
								).searchParams.get(
									browseArgs[ 2 ] || 'riff_artist'
								)
							) === id
					)
				);
			}
		}
		for ( const el of gone ) {
			const had = el.contains( document.activeElement );
			const after = el.nextElementSibling || el.previousElementSibling;
			el.remove();
			if ( had ) {
				(
					after?.querySelector( 'button, a' ) ||
					view.querySelector( 'h2' )
				)?.focus();
			}
		}
		if ( gone.length ) {
			api.mount();
		}
	}
	api.on?.( 'like', likeChanged );

	// ---- Playlists. Made, renamed and deleted from Your Library and a playlist's page; tracks moved
	// and taken out from each row's … menu, which this adds to through riff.trackMenu as any plugin
	// would. Every change goes through the player's api.
	const listAddress = ( id ) => {
		const u = new URL( page );
		u.searchParams.set( browseArgs[ 6 ] || 'riff_playlist', String( id ) );
		return u.toString();
	};
	const libraryAddress = ( filter = '' ) => {
		const u = new URL( page );
		u.searchParams.set( viewKey, 'library' );
		if ( filter ) {
			u.searchParams.set( browseArgs[ 4 ] || 'riff_filter', filter );
		}
		return u.toString();
	};
	const failed = () =>
		tell(
			s.playlistFailed || 'The playlist could not be changed. Try again.'
		);
	// The view showing, drawn again in place, then the focus put where it belongs.
	async function redraw( focus ) {
		const here = postOf( location.href );
		if ( here ) {
			await show( here, { quiet: true } ).catch( () => {} );
		}
		focus?.()?.focus();
	}
	function playlistAction( action ) {
		const kind = action?.dataset.riffAppAction;
		const id = Number( action?.dataset.riffPlaylist );
		if ( kind === 'new-playlist' ) {
			api.createPlaylist( s.newPlaylist || 'New playlist' ).then(
				( p ) => {
					const to = postOf( listAddress( p.id ) );
					if ( to ) {
						show( to ).catch( () => {} );
					}
				},
				failed
			);
			return true;
		}
		if ( kind === 'play-playlist' ) {
			api.playlist( id ).then(
				( p ) => {
					if ( p.tracks?.length ) {
						api.play( p.tracks, 0 );
					}
				},
				() => tell( s.playError || '' )
			);
			return true;
		}
		if ( kind === 'rename-playlist' ) {
			rename( action, id );
			return true;
		}
		if ( kind === 'delete-playlist' ) {
			const name =
				view.querySelector( '.riff-album-title' )?.textContent || '';
			// The browser's own confirmation, as core's list tables ask before deleting.
			// eslint-disable-next-line no-alert
			const sure = window.confirm(
				fmt( s.confirmDelete || 'Delete %s?', name )
			);
			if ( sure ) {
				api.deletePlaylist( id ).then( () => {
					const to = postOf( libraryAddress( 'playlists' ) );
					if ( to ) {
						show( to ).catch( () => {} );
					}
				}, failed );
			}
			return true;
		}
		return false;
	}

	// Renaming: the name becomes a field, Enter or Save keeps it, Escape or Cancel puts it back.
	function rename( button, id ) {
		const title = view.querySelector( '.riff-album-title' );
		if ( ! title || view.querySelector( '.riff-rename' ) ) {
			return;
		}
		const form = document.createElement( 'form' );
		form.className = 'riff-rename';
		form.innerHTML =
			`<label class="riff-app-sr" for="riff-rename">${ esc( s.playlistName || 'Playlist name' ) }</label>` +
			`<input id="riff-rename" type="text" maxlength="200" required value="${ esc( title.textContent ) }">` +
			`<button type="submit" class="riff-pill riff-pill-solid">${ esc( s.save || 'Save' ) }</button>` +
			`<button type="button" class="riff-pill" data-riff-cancel>${ esc( s.cancel || 'Cancel' ) }</button>`;
		title.hidden = true;
		title.after( form );
		const field = form.querySelector( 'input' );
		field.focus();
		field.select();
		const done = () => {
			form.remove();
			title.hidden = false;
			button.focus();
		};
		form.querySelector( '[data-riff-cancel]' ).addEventListener(
			'click',
			done
		);
		form.addEventListener( 'keydown', ( e ) => {
			if ( e.key === 'Escape' ) {
				e.preventDefault();
				e.stopPropagation();
				done();
			}
		} );
		form.addEventListener( 'submit', ( e ) => {
			e.preventDefault();
			e.stopPropagation();
			api.renamePlaylist( id, field.value ).then(
				() =>
					redraw( () =>
						view.querySelector(
							'[data-riff-app-action="rename-playlist"]'
						)
					),
				failed
			);
		} );
	}

	// A row in a playlist's page gets Move up, Move down and Remove from this playlist.
	window.wp?.hooks?.addFilter(
		'riff.trackMenu',
		'riff/listen/playlist',
		( items, track, context ) => {
			const holder = context?.element?.closest?.(
				'[data-riff-playlist]'
			);
			if ( ! holder || ! view.contains( holder ) ) {
				return items;
			}
			const id = Number( holder.dataset.riffPlaylist );
			const ids = parse( holder.dataset.riffIds ) || [];
			const places = parse( holder.dataset.riffPlaces ) || [];
			const rows = [ ...holder.querySelectorAll( '[data-riff-track]' ) ];
			const at = rows.indexOf( context.element );
			const spot = places[ at ];
			if ( spot === undefined ) {
				return items;
			}
			// Found once the view is drawn again, in the new rows, not these.
			const rowMenu = ( n ) => () =>
				view
					.querySelectorAll(
						'[data-riff-playlist] [data-riff-track]'
					)
					[ n ]?.querySelector( '.riff-more-button' );
			const move = ( to ) => () => {
				const next = [ ...ids ];
				const [ moved ] = next.splice( spot, 1 );
				next.splice( places[ to ], 0, moved );
				api.setPlaylistTracks( id, next ).then(
					() => redraw( rowMenu( to ) ),
					failed
				);
			};
			const extra = [];
			if ( at > 0 ) {
				extra.push( {
					id: 'playlist-up',
					label: s.moveUp || 'Move up',
					run: move( at - 1 ),
				} );
			}
			if ( at < rows.length - 1 ) {
				extra.push( {
					id: 'playlist-down',
					label: s.moveDown || 'Move down',
					run: move( at + 1 ),
				} );
			}
			extra.push( {
				id: 'playlist-remove',
				label: s.removeFromPlaylist || 'Remove from this playlist',
				run: () =>
					api.removeFromPlaylist( id, spot ).then( ( p ) => {
						tell(
							fmt(
								s.removedFromPlaylist || 'Removed from %s',
								p.title
							)
						);
						redraw(
							() =>
								rowMenu( Math.min( at, rows.length - 2 ) )() ||
								view.querySelector( 'h2' )
						);
					}, failed ),
			} );
			return [ ...items, ...extra ];
		}
	);

	// A change to a playlist leaves every view drawn before it out of date, its sidebar included.
	api.on?.( 'playlist', () => rendered.clear() );

	// ---- Home's rows of what was played: the posts last played from, to jump back into, and the
	// tracks themselves. The server draws a signed-in listener's from their account, and holds the
	// place of a visitor's when the player's cookie says this browser has a history; this fills
	// those in place. A row the server drew from the same history is left alone, and on the page
	// as first shown a hidden row stays hidden, so nothing appears above what is already there. A
	// view drawn here (show()) fills every row before it is painted.
	function home( first = false ) {
		const played = api.history();
		const key = played.length
			? `${ played.length }:${ played[ 0 ].id }:${
					Number( played[ 0 ].played ) || 0
				}`
			: '0';
		const fill = ( slug, cards ) => {
			const shelf = view.querySelector( `[data-riff-shelf="${ slug }"]` );
			if ( ! shelf || shelf.dataset.riffPlayed === key ) {
				return;
			}
			const held = shelf.hasAttribute( 'data-riff-skeleton' );
			if ( first && shelf.hidden ) {
				return;
			}
			shelf.removeAttribute( 'data-riff-skeleton' );
			shelf.dataset.riffPlayed = key;
			if ( ! cards ) {
				// Held for a history that is gone after all: the one case a row has to go.
				if ( held ) {
					shelf.hidden = true;
				}
				return;
			}
			const row = shelf.querySelector( '.riff-shelf-row' );
			row.innerHTML = cards;
			fade( row );
			shelf.hidden = false;
		};
		const posts = [];
		for ( const t of played ) {
			if (
				t.post?.id &&
				! posts.some( ( p ) => p.post.id === t.post.id )
			) {
				posts.push( t );
			}
		}
		fill(
			'jump',
			posts
				.slice( 0, 12 )
				.map( ( t ) =>
					makeCard( {
						art: t.art,
						title: t.post.title,
						sub: t.artist,
						href: addressOf( t.post.id ),
						play: {
							action: 'play-card',
							data: { post: Number( t.post.id ) },
						},
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
					makeCard( {
						art: t.art,
						title: t.title,
						sub: t.artist,
						href: t.post?.id ? addressOf( t.post.id ) : '',
						play: { action: 'play-history', data: { index: i } },
						label: t.title,
					} )
				)
				.join( '' )
		);
		// Your Library offers somewhere to start until there is something played to show instead.
		const offer = view.querySelector( '[data-riff-shelf="start"]' );
		if ( offer && played.length ) {
			offer.hidden = true;
		}
	}

	home( true );
	fade( app );

	// ---- The sidebar, on a wide screen in standalone mode: full, or a rail of icons. The choice is
	// this device's, so it is remembered here rather than anywhere shared.
	function sidebar( open, remember = true ) {
		app.dataset.sidebar = open ? 'full' : 'mini';
		nav?.querySelector( '.riff-app-collapse' )?.setAttribute(
			'aria-expanded',
			String( open )
		);
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
			return Array.isArray( list )
				? list.filter( ( q ) => typeof q === 'string' )
				: [];
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
				JSON.stringify(
					[
						words,
						...recentSearches().filter( ( x ) => x !== words ),
					].slice( 0, 6 )
				)
			);
		} catch {}
	};
	// A route beside /tracks: /albums or /artists, with its arguments, pretty permalinks or not.
	const catalog = ( name, params ) => {
		const u = new URL( tracksRest, location.href );
		if ( u.searchParams.has( 'rest_route' ) ) {
			u.searchParams.set(
				'rest_route',
				u.searchParams
					.get( 'rest_route' )
					.replace( /\/tracks$/, '/' + name )
			);
		} else {
			u.pathname = u.pathname.replace( /\/tracks\/?$/, '/' + name );
		}
		Object.entries( params ).forEach( ( [ k, v ] ) =>
			u.searchParams.set( k, String( v ) )
		);
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
		if (
			n.split( /[\s,.\-–]+/ ).some( ( part ) => part.startsWith( w ) )
		) {
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
		field.addEventListener( 'blur', () =>
			setTimeout( () => {
				if ( ! form.contains( document.activeElement ) ) {
					closeSuggest( field );
				}
			}, 150 )
		);
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
			draw(
				field,
				[
					{
						label: s.recentSearches || 'Recent searches',
						items: recent.map( ( words ) => ( {
							kind: 'recent',
							title: words,
							run: () => runSearch( field, words ),
						} ) ),
					},
				],
				''
			);
			return;
		}
		let answers;
		try {
			answers = await Promise.all( [
				fetch( catalog( 'tracks', { search: q, per_page: 5 } ) ).then(
					( r ) => r.json()
				),
				fetch( catalog( 'albums', { search: q } ) ).then( ( r ) =>
					r.json()
				),
				fetch( catalog( 'artists', { search: q } ) ).then( ( r ) =>
					r.json()
				),
			] );
		} catch {
			return;
		}
		if ( turn !== suggestTurn || field.value.trim() !== q ) {
			return;
		}
		const [ tracks, albums, artists ] = answers.map( ( a ) =>
			Array.isArray( a?.items ) ? a.items : []
		);
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
			kind: 'album',
			title: a.name,
			sub: a.artist || '',
			art: a.art,
			href: browseHref( browseArgs[ 1 ] || 'riff_album', a.id ),
		} ) );
		const artistItems = artists.slice( 0, 3 ).map( ( a ) => ( {
			kind: 'artist',
			title: a.name,
			sub: s.artist || 'Artist',
			href: browseHref( browseArgs[ 2 ] || 'riff_artist', a.id ),
		} ) );
		// The best match across all three; on a tie an artist, then an album, then a song.
		const top = [ ...artistItems, ...albumItems, ...songs ]
			.map( ( o ) => ( { o, n: score( o.title, q ) } ) )
			.sort( ( x, y ) => y.n - x.n )[ 0 ];
		const groups = [];
		if ( top?.n ) {
			groups.push( {
				label: s.topResult || 'Top result',
				items: [ { ...top.o, top: true } ],
			} );
		}
		const besides = ( list ) => list.filter( ( o ) => o !== top?.o );
		if ( besides( songs ).length ) {
			groups.push( {
				label: s.songs || 'Songs',
				items: besides( songs ),
			} );
		}
		if ( besides( albumItems ).length ) {
			groups.push( {
				label: s.albums || 'Albums',
				items: besides( albumItems ),
			} );
		}
		if ( besides( artistItems ).length ) {
			groups.push( {
				label: s.artists || 'Artists',
				items: besides( artistItems ),
			} );
		}
		groups.push( {
			label: '',
			items: [
				{
					kind: 'all',
					title: fmt( s.allResults || 'All results for “%s”', q ),
					run: () => runSearch( field, q ),
				},
			],
		} );
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
				el.className =
					'riff-suggest-option' +
					( o.top ? ' riff-suggest-top' : '' ) +
					` riff-suggest-${ o.kind }`;
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
								src
									? `<img src="${ esc( src ) }" alt="" decoding="async">`
									: esc(
											String( o.title || '' )
												.slice( 0, 1 )
												.toUpperCase()
										)
							}</span>` ) +
					`<span class="riff-suggest-text"><span class="riff-suggest-title">${ esc( o.title ) }</span>${
						o.sub
							? `<span class="riff-suggest-sub">${ esc( o.sub ) }</span>`
							: ''
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
		panel.setAttribute(
			'aria-label',
			s.searchSuggestions || 'Suggestions'
		);
		panel.hidden = false;
		field.setAttribute( 'aria-expanded', 'true' );
		const found = options.filter(
			( x ) => x.o.kind !== 'all' && x.o.kind !== 'recent'
		).length;
		said.textContent = q
			? fmt(
					found === 1
						? s.oneSuggestion || '%s suggestion'
						: s.suggestions || '%s suggestions',
					found
				)
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
	window.addEventListener( 'scroll', follow, {
		passive: true,
		capture: true,
	} );

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
			active =
				e.key === 'ArrowDown'
					? ( active + 1 ) % n
					: ( active - 1 + n ) % n;
			options.forEach( ( x, i ) =>
				x.el.setAttribute( 'aria-selected', String( i === active ) )
			);
			field.setAttribute(
				'aria-activedescendant',
				options[ active ].el.id
			);
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
	// A visitor who opened Your Library by its address got it drawn without their likes, which only
	// this browser has: it is drawn again with them.
	paintLikes();
	if (
		view.querySelector( '[data-riff-library="device"]' ) &&
		api.likes?.().length
	) {
		const here = postOf( location.href );
		if ( here ) {
			show( here, { quiet: true } ).catch( () => {} );
		}
	}
	// Everything is listening: what needs the script, the sidebar's toggle and the hearts, can show.
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
