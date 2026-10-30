/* Views. The server rendered the first view and every link in it is a real address, so a view
 * change only has to make the next one arrive without a page load: fetch what the server renders at
 * that address, swap it in, push the address. A quiet show redraws the view in place, as Your
 * Library does when a like changes elsewhere: no history entry, and the focus and scroll stay where
 * they are. Load more adds the next page of posts in place, and a cover's Play starts a post or an
 * album without opening it. */
import { fmt } from 'riff-app/helpers';

export function views( ctx ) {
	const {
		api,
		app,
		view,
		nav,
		tracksRest,
		__,
		_n,
		tell,
		untell,
		speak,
		playError,
	} = ctx;
	ctx.showing = 0; // A counter, so a slow fetch cannot paint over a newer view.
	ctx.picking = 0; // The same for a cover's Play, so an older press cannot replace the queue.

	const reducedMotion = () =>
		window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;

	async function show( to, { push = true, quiet = false } = {} ) {
		push = push && ! quiet;
		const { id, pages: upto } = to;
		const turn = ++ctx.showing;
		app.setAttribute( 'aria-busy', 'true' );
		let html;
		let bar;
		let title;
		try {
			// Every view, Home and a post's too, is what the server renders at its address, so it
			// is written in one place.
			( {
				view: html,
				nav: bar,
				title,
			} = await ctx.pageView(
				to.browse ? to.href : ctx.addressOf( id, upto )
			) );
		} catch {
			// The route is gone or the network is: let the address load as a page.
			if ( turn === ctx.showing ) {
				location.assign(
					to.browse ? to.href : ctx.addressOf( id, upto )
				);
			}
			return;
		}
		if ( turn !== ctx.showing ) {
			return;
		}
		// The browser animates the swap where it can; the page's own colours do the rest.
		// Home's rows of what was played are filled here, before the new view is painted.
		const swap = () => {
			view.innerHTML = html;
			// An album's cover, carried from the card pressed to the head of its page.
			ctx.rackLand();
			// Its title too, which a screen reader says, and the tab and the history list show.
			if ( title ) {
				document.title = title;
			}
			ctx.home();
			ctx.together();
			ctx.rackUp();
			ctx.fade( view );
			if ( bar !== undefined && nav ) {
				nav.innerHTML = bar;
				ctx.sidebar( app.dataset.sidebar !== 'mini', false );
				ctx.wireSearch();
				ctx.libraryShow( ctx.shelfKind );
				ctx.installShow();
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
		ctx.shown = ctx.keyOf( to );
		if ( push ) {
			// The rest of the state stays: WordPress's Interactivity runtime reloads the page on any
			// history entry that lost its session id, which would end the music on Back.
			history.pushState(
				{ ...history.state, riffApp: id },
				'',
				to.browse ? to.href : ctx.addressOf( id, upto )
			);
		}
		app.removeAttribute( 'aria-busy' );
		api.mount();
		ctx.paintLikes();
		if ( quiet ) {
			return;
		}
		const top = app.getBoundingClientRect().top;
		if ( top < 0 ) {
			app.scrollIntoView( { block: 'start' } );
		}
		view.querySelector( 'h2' )?.focus?.();
	}

	// The view showing, drawn again in place, then the focus put where it belongs.
	async function redraw( focus ) {
		const here = ctx.postOf( location.href );
		if ( here ) {
			await show( here, { quiet: true } ).catch( () => {} );
		}
		focus?.()?.focus();
	}

	// Load more's link: one page further, landing on that page's first card.
	const moreAddress = ( n ) => `${ ctx.postsAddress( n ) }#riff-page-${ n }`;

	// The next page of the library, after the cards already there. The button is marked busy
	// rather than disabled, so it keeps focus; the page only advances once one has arrived.
	async function loadMore( button ) {
		const grid = app.querySelector( '.riff-grid' );
		if ( ! grid || button.getAttribute( 'aria-disabled' ) === 'true' ) {
			return;
		}
		const turn = ctx.showing;
		const next = Number( grid.dataset.riffPage ) + 1;
		button.setAttribute( 'aria-disabled', 'true' );
		try {
			const { items, pages } = await ctx.get( '', next );
			if ( turn !== ctx.showing || ! grid.isConnected ) {
				return;
			}
			grid.insertAdjacentHTML( 'beforeend', ctx.cardsOf( items, next ) );
			grid.dataset.riffPage = String( next );
			untell();
			speak(
				fmt(
					/* translators: %s: how many posts were added. */ _n(
						'%s more post',
						'%s more posts',
						items.length,
						'riff'
					),
					items.length
				)
			);
			// The address that renders these same cards, so a reload or a shared link shows them.
			history.replaceState( history.state, '', ctx.postsAddress( next ) );
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
			if ( turn === ctx.showing ) {
				tell(
					__(
						'More posts could not be loaded. Press Load more to try again.',
						'riff'
					)
				);
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
		const turn = ++ctx.picking;
		const shownAt = ctx.showing;
		button.setAttribute( 'aria-busy', 'true' );
		try {
			const post = await ctx.get(
				'/' + Number( button.dataset.riffPost )
			);
			if ( turn !== ctx.picking || shownAt !== ctx.showing ) {
				return;
			}
			untell();
			if ( Array.isArray( post.tracks ) && post.tracks.length ) {
				api.play( post.tracks, 0 );
			}
		} catch {
			if ( turn === ctx.picking && shownAt === ctx.showing ) {
				tell( playError() );
			}
		} finally {
			button.removeAttribute( 'aria-busy' );
		}
	}

	// Play an album from its cover, from the tracks route, in album order: its first page, and the
	// rest as the queue nears its end.
	function playAlbum( button ) {
		if ( ! tracksRest ) {
			return;
		}
		const u = new URL( tracksRest, location.href );
		u.searchParams.set( 'album', String( Number( button.dataset.riffAlbum ) ) );
		playAll( button, { url: u.toString() }, false );
	}

	// Play or shuffle the whole of a list one page of which is showing, from its first page: that
	// plays as soon as it arrives, and the player asks for each next one as the queue nears its
	// end. Shuffled, the route deals the whole list in one order, which its pages follow.
	async function playAll( button, more, shuffle ) {
		if ( button.getAttribute( 'aria-busy' ) === 'true' || ! more?.url ) {
			return;
		}
		const turn = ++ctx.picking;
		const shownAt = ctx.showing;
		button.setAttribute( 'aria-busy', 'true' );
		try {
			const u = new URL( more.url, location.href );
			u.searchParams.set( 'per_page', '100' );
			if ( shuffle ) {
				u.searchParams.set( 'orderby', 'random' );
				u.searchParams.set(
					'seed',
					String( Math.floor( Math.random() * 2147483647 ) )
				);
			}
			u.searchParams.set( 'page', '1' );
			const r = await api.request( u );
			if ( ! r.ok ) {
				throw new Error( String( r.status ) );
			}
			const data = await r.json();
			if ( turn !== ctx.picking || shownAt !== ctx.showing ) {
				return;
			}
			untell();
			u.searchParams.delete( 'page' );
			if ( Array.isArray( data.items ) && data.items.length ) {
				api.playMore(
					data.items,
					0,
					{
						url: u.toString(),
						page: 1,
						pages: Number( data.pages ) || 1,
					},
					{ shuffle }
				);
			}
		} catch {
			if ( turn === ctx.picking && shownAt === ctx.showing ) {
				tell( playError() );
			}
		} finally {
			button.removeAttribute( 'aria-busy' );
		}
	}

	return { show, redraw, loadMore, playCard, playAlbum, playAll };
}
