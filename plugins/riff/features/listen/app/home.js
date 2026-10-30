/* Home's rows of what was played: the posts last played from, to jump back into, and the tracks
 * themselves. The server draws a signed-in listener's from their account, and holds the place of a
 * visitor's when the player's cookie says this browser has a history; this fills those in place. A
 * row the server drew from the same history is left alone, and on the page as first shown a hidden
 * row stays hidden, so nothing appears above what is already there. A view drawn by show() fills
 * every row before it is painted.
 *
 * A visitor's history is what this browser kept of each track as it played, so it can name a post
 * or a file the site has since deleted; such a card would show a broken cover and open nothing.
 * Once per page, the tracks and the posts it names are asked of the site, and what is gone is left
 * out. A signed-in listener's comes from the account, which the server already checks. */

export function homeRows( ctx ) {
	const { api, view } = ctx;

	// The REST root, from the tracks route the app is given (pretty permalinks or ?rest_route=).
	const routeTo = ( path, params ) => {
		const u = new URL( ctx.tracksRest );
		if ( u.searchParams.has( 'rest_route' ) ) {
			u.searchParams.set( 'rest_route', path );
		} else {
			u.pathname = u.pathname.replace( /riff\/v1\/tracks\/?$/, path.slice( 1 ) );
		}
		for ( const [ key, value ] of Object.entries( params ) ) {
			u.searchParams.set( key, value );
		}
		return u.toString();
	};
	const ids = ( r ) =>
		r.ok ? r.json() : Promise.reject( new Error( String( r.status ) ) );

	// What of the history still exists: { tracks, posts } as sets of IDs, or null when the site could
	// not be asked, in which case nothing is left out.
	let still;
	function check() {
		if ( still === undefined ) {
			const played = api.history();
			const trackIds = [ ...new Set( played.map( ( t ) => Number( t.id ) ).filter( Boolean ) ) ];
			const postIds = [ ...new Set( played.map( ( t ) => Number( t.post?.id ) ).filter( Boolean ) ) ];
			still =
				! ctx.tracksRest || ! trackIds.length
					? Promise.resolve( null )
					: Promise.all( [
							api
								.request( routeTo( '/riff/v1/tracks', { include: trackIds.join( ',' ), per_page: '100' } ) )
								.then( ids )
								.then( ( d ) => new Set( ( d.items || [] ).map( ( t ) => Number( t.id ) ) ) ),
							postIds.length
								? api
										.request( routeTo( '/wp/v2/search', { include: postIds.join( ',' ), per_page: '100', _fields: 'id' } ) )
										.then( ids )
										.then( ( d ) => new Set( d.map( ( p ) => Number( p.id ) ) ) )
								: Promise.resolve( new Set() ),
						] )
							.then( ( [ tracks, posts ] ) => ( { tracks, posts } ) )
							.catch( () => null );
		}
		return still;
	}
	let known = null; // The answer, once it has come.

	function home( first = false ) {
		if ( known === null && still === undefined ) {
			check().then( ( answer ) => {
				known = answer || false;
				// Drawn again with what is gone left out; until then a held row stays held.
				home( first );
			} );
			if ( first ) {
				return;
			}
		}
		// A Listen page is not where a track plays from, though older plays may name this one.
		const isPage = ( p ) => {
			const u = new URL( p.url || '', location.href );
			return (
				u.origin === ctx.page.origin && u.pathname === ctx.page.pathname
			);
		};
		const played = api
			.history()
			.filter( ( t ) => ! known || known.tracks.has( Number( t.id ) ) )
			.map( ( t ) =>
				t.post?.id &&
				( isPage( t.post ) ||
					( known && ! known.posts.has( Number( t.post.id ) ) ) )
					? { ...t, post: null }
					: t
			);
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
			ctx.fade( row );
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
					ctx.makeCard( {
						art: t.art,
						title: t.post.title,
						sub: t.artist,
						href: ctx.addressOf( t.post.id ),
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
					ctx.makeCard( {
						art: t.art,
						title: t.title,
						sub: t.artist,
						href: t.post?.id ? ctx.addressOf( t.post.id ) : '',
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

	return { home };
}
