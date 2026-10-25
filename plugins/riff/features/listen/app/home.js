/* Home's rows of what was played: the posts last played from, to jump back into, and the tracks
 * themselves. The server draws a signed-in listener's from their account, and holds the place of a
 * visitor's when the player's cookie says this browser has a history; this fills those in place. A
 * row the server drew from the same history is left alone, and on the page as first shown a hidden
 * row stays hidden, so nothing appears above what is already there. A view drawn by show() fills
 * every row before it is painted. */

export function homeRows( ctx ) {
	const { api, view } = ctx;

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
