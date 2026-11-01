/* Home's rows of what was played: the posts last played from, to jump back into, and the tracks
 * themselves. The server draws a signed-in listener's from their account, and holds the place of a
 * visitor's when the player's cookie says this browser has a history; this fills those in place. A
 * row the server drew from the same history is left alone, and on the page as first shown a hidden
 * row stays hidden, so nothing appears above what is already there. A view drawn by show() fills
 * every row before it is painted.
 *
 * A visitor's history is what this browser kept of each track as it played. Its cards are drawn by
 * the server, at riff/v1/played, as a signed-in listener's are, so a track or a post the site has
 * since deleted, and the Listen page itself, are left out there; asked once for each history, and
 * kept. */

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

	// The rows' cards for a history, as the server draws them: { jump, recent }, or null when the
	// site could not be asked, and a row held for them is hidden. Once an answer has come it is kept,
	// so a view drawn again fills its rows at once, before it is painted.
	const drawn = new Map();
	const arrived = new Map();
	function cardsFor( played, key ) {
		if ( ! drawn.has( key ) ) {
			const items = played
				.map(
					( t ) =>
						`${ Number( t.id ) || 0 }:${ Number( t.post?.id ) || 0 }`
				)
				.join( ',' );
			drawn.set(
				key,
				api
					.request(
						routeTo( '/riff/v1/played', {
							items,
							page: ctx.page.href,
						} )
					)
					.then( ( r ) => ( r.ok ? r.json() : null ) )
					.catch( () => null )
					.then( ( cards ) => {
						if ( cards ) {
							arrived.set( key, cards );
						} else {
							// Asked again next time.
							drawn.delete( key );
						}
						return cards;
					} )
			);
		}
		return drawn.get( key );
	}

	// Which history the rows show, as the server writes it into data-riff-played.
	const keyOf = ( played ) =>
		played.length
			? `${ played.length }:${ played[ 0 ].id }:${
					Number( played[ 0 ].played ) || 0
				}`
			: '0';

	function home( first = false ) {
		const played = api.history();
		const key = keyOf( played );
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
		if ( ! played.length ) {
			fill( 'jump', '' );
			fill( 'recent', '' );
			return;
		}
		const show = ( cards ) => {
			fill( 'jump', cards.jump );
			fill( 'recent', cards.recent );
			// Your Library offers somewhere to start until there is something played to show
			// instead.
			const offer = view.querySelector( '[data-riff-shelf="start"]' );
			if ( offer && cards.recent ) {
				offer.hidden = true;
			}
		};
		if ( arrived.has( key ) ) {
			show( arrived.get( key ) );
			return;
		}
		// Rows the server drew from this same history, as it draws a signed-in listener's, need
		// nothing asked.
		const shelves = [ 'jump', 'recent' ]
			.map( ( slug ) =>
				view.querySelector( `[data-riff-shelf="${ slug }"]` )
			)
			.filter( Boolean );
		if ( shelves.every( ( s ) => s.dataset.riffPlayed === key ) ) {
			return;
		}
		cardsFor( played, key ).then( ( cards ) => {
			// Drawn into the view showing then, if it is still this history's.
			if ( keyOf( api.history() ) !== key ) {
				return;
			}
			if ( cards ) {
				show( cards );
				return;
			}
			// The site could not be asked: a row held for these cards goes rather than stay empty,
			// unmarked, so the next Home asks again.
			for ( const shelf of shelves ) {
				if ( shelf.isConnected && shelf.hasAttribute( 'data-riff-skeleton' ) ) {
					shelf.removeAttribute( 'data-riff-skeleton' );
					shelf.hidden = true;
				}
			}
		} );
	}

	return { home };
}
