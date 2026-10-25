/* Hearts on an album's or artist's page, pressed from the listener's likes through the player's
 * api, which keeps them in the account or in this browser. */
import { fmt, parse } from 'riff-app/helpers';

export function hearts( ctx ) {
	const { api, app, view, browseArgs, __, tell } = ctx;

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
					? /* translators: %s: an album or artist. */ __(
							'%s added to your library',
							'riff'
						)
					: /* translators: %s: an album or artist. */ __(
							'%s removed from your library',
							'riff'
						),
				name
			)
		);
	}

	// A like changed. Your Library drawn before it is out of date, so it is drawn again next time;
	// while it shows, what was unliked leaves it at once, and the focus moves to what came next.
	function likeChanged( { change, kind, id } ) {
		paintLikes();
		ctx.forget( ctx.isLibrary );
		const library = view.querySelector( '[data-riff-library]' );
		if ( ! library ) {
			return;
		}
		if ( change === 'unlike' ) {
			unshow( library, kind, Number( id ) );
		} else if ( ! view.contains( document.activeElement ) ) {
			const here = ctx.postOf( location.href );
			if ( here ) {
				ctx.show( here, { quiet: true } ).catch( () => {} );
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
	api.listen?.( 'like', likeChanged );

	return { paintLikes, likeFrom };
}
