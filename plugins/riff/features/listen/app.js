/* Riff's app: the library and every post in it, on one page, so the music never stops.
 *
 * riff.js loads this on the page that holds the block and hands over an api: mount() turns the
 * marked figures in a view into rows, play() starts a queue, current() is the track playing. The
 * server rendered the first view and every link in it is a real address, so this only has to make
 * the next view arrive without a page load: fetch what the server renders at that address, swap it
 * in, push the address. Back and forward do the same from history. Load more adds the next page of
 * posts in place and changes the address to the one that renders the same cards on the server.
 * Home's rows of what was played come from the player's history, so they are filled here, and Your
 * Library is fetched with a visitor's likes, which only their browser has.
 *
 * The work is in the modules under app/, each a function of the one context this file builds:
 * what the app is (its elements, its addresses' arguments, the translations) and what it says.
 * Each module hands its functions back onto that context, so a module calls another through it
 * (ctx.show(), ctx.home()) and none has to be loaded before the rest. The modules are WordPress
 * script modules, registered by Player::enqueue() as this one's dependencies, so the page's import
 * map names them and a site's language pack reaches each one. No build step: these files ship. */
import { parse } from 'riff-app/helpers';
import { addresses } from 'riff-app/addresses';
import { fetching } from 'riff-app/fetch';
import { cards } from 'riff-app/cards';
import { views } from 'riff-app/views';
import { hearts } from 'riff-app/hearts';
import { playlists } from 'riff-app/playlists';
import { homeRows } from 'riff-app/home';
import { sidebarPanel } from 'riff-app/sidebar';
import { installOffer } from 'riff-app/install';
import { desktopFrame } from 'riff-app/desktop';
import { search } from 'riff-app/search';
import { rack } from 'riff-app/rack';
import { togetherRow } from 'riff-app/together';

export function start( api ) {
	const app = document.querySelector( '[data-riff-app]' );
	// Strings are WordPress translations of this module (wp_set_script_module_translations()).
	// Core prints wp.i18n only when there are translations, so without it the strings are the
	// English they are written in.
	const __ = window.wp?.i18n?.__ || ( ( english ) => english );
	const _n =
		window.wp?.i18n?._n ||
		( ( one, many, count ) => ( count === 1 ? one : many ) );

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

	const ctx = {
		api,
		app,
		view: app.querySelector( '[data-riff-app-view]' ),
		nav: app.querySelector( '.riff-app-bar' ),
		rest: app.dataset.riffRest,
		page: new URL( app.dataset.riffPage, location.href ),
		query: app.dataset.riffQuery || 'riff',
		pageQuery: app.dataset.riffPageQuery || 'riff_page',
		// The arguments of the browse views (albums, artists, tracks, search), which the server renders.
		browseArgs: ( app.dataset.riffBrowse || '' )
			.split( ',' )
			.filter( Boolean ),
		tracksRest: app.dataset.riffTracksRest || '',
		desktop: document.documentElement.classList.contains( 'riff-desktop' ),
		__,
		_n,
		tell,
		untell,
		// Said to a screen reader only, through WordPress's live regions, where the change is
		// already plain to see: new cards, a new name, a new view.
		speak: ( message ) => window.wp?.a11y?.speak?.( message ),
		// Said when a post or a page of posts could not be fetched, from several places.
		playError: () =>
			__(
				'That post could not be loaded. Press Play to try again.',
				'riff'
			),
	};
	const { view, nav } = ctx;

	// The account menu is a details element, so it opens without the script; with it, it closes
	// as a menu does: on Escape, on a click outside it, and once one of its links is followed,
	// since a view arrives in place rather than with a new page. Looked up at each event: every
	// view brings its own bar, and the menu with it.
	document.addEventListener( 'click', ( e ) => {
		const account = app.querySelector( '.riff-app-account[open]' );
		if (
			account &&
			( ! account.contains( e.target ) || e.target.closest( 'a' ) )
		) {
			account.open = false;
		}
	} );
	app.addEventListener( 'keydown', ( e ) => {
		const account = e.target.closest?.( '.riff-app-account[open]' );
		if ( e.key === 'Escape' && account ) {
			e.stopPropagation();
			account.open = false;
			account.querySelector( 'summary' ).focus();
		}
	} );

	// The modules, in the order the first view needs them: each adds its functions to the context.
	for ( const module of [
		addresses,
		fetching,
		cards,
		views,
		hearts,
		playlists,
		homeRows,
		sidebarPanel,
		installOffer,
		search,
		rack,
		togetherRow,
	] ) {
		Object.assign( ctx, module( ctx ) );
	}
	ctx.shown = ctx.keyOf( ctx.postOf( location.href ) || { id: 0 } );

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
			ctx.playCard( action );
			return;
		}
		if ( action?.dataset.riffAppAction === 'play-album' ) {
			e.preventDefault();
			ctx.playAlbum( action );
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
		if ( action?.dataset.riffAppAction === 'listen-along' ) {
			e.preventDefault();
			ctx.listenAlong( action );
			return;
		}
		if ( action?.dataset.riffAppAction === 'play-history' ) {
			e.preventDefault();
			const played = api.history();
			api.play( played, Number( action.dataset.riffIndex ) || 0 );
			return;
		}
		if ( action?.dataset.riffAppAction?.startsWith( 'install' ) ) {
			ctx.install( action );
			return;
		}
		// The sidebar library's chips filter its rows in place; pressed again, all of them show.
		const chip = e.target.closest( '[data-riff-library-show]' );
		if ( chip ) {
			e.preventDefault();
			const kind = chip.dataset.riffLibraryShow;
			ctx.libraryShow( kind === ctx.shelfKind ? '' : kind );
			return;
		}
		if ( action?.dataset.riffAppAction === 'sidebar' ) {
			ctx.sidebar( action.getAttribute( 'aria-expanded' ) !== 'true' );
			return;
		}
		if ( action?.dataset.riffAppAction === 'back' ) {
			history.back();
			return;
		}
		if ( action?.dataset.riffAppAction === 'forward' ) {
			history.forward();
			return;
		}
		if ( action?.dataset.riffAppAction === 'more' ) {
			e.preventDefault();
			ctx.loadMore( action );
			return;
		}
		if ( ctx.playlistAction( action ) ) {
			e.preventDefault();
			return;
		}
		if ( action?.dataset.riffAppAction === 'like' ) {
			ctx.likeFrom( action );
			return;
		}
		if ( action ) {
			const shuffle = action.dataset.riffAppAction === 'shuffle';
			// A playlist plays whole, from its route, whichever page of it is showing.
			const list = app.querySelector( '.riff-playlist-tracks' );
			if ( list ) {
				ctx.playPlaylist( Number( list.dataset.riffPlaylist ), shuffle );
				return;
			}
			const holder = app.querySelector(
				'[data-riff-more], [data-riff-tracks]'
			);
			// One page of a longer list plays the whole of it, from the route that drew it.
			if ( holder?.dataset.riffMore ) {
				ctx.playAll( action, parse( holder.dataset.riffMore ), shuffle );
				return;
			}
			const tracks = holder ? parse( holder.dataset.riffTracks ) : null;
			if ( Array.isArray( tracks ) && tracks.length ) {
				api.play( tracks, 0, { shuffle } );
			}
			return;
		}
		const a = e.target.closest( 'a[href]' );
		if ( ! a || a.target || a.hasAttribute( 'download' ) ) {
			return;
		}
		const to = ctx.postOf( a.href );
		if ( ! to ) {
			return;
		}
		e.preventDefault();
		// The tab shows as chosen at once, whatever the network is doing.
		// The account menu's links are in the bar too, but are not tabs.
		if (
			a.closest( '.riff-app-bar' ) &&
			! a.closest( '.riff-app-account' )
		) {
			for ( const tab of nav.querySelectorAll( 'a[aria-current]' ) ) {
				tab.removeAttribute( 'aria-current' );
			}
			a.setAttribute( 'aria-current', 'page' );
		}
		ctx.show( to ).catch( () => {} );
	} );

	ctx.home( true );
	ctx.together();
	ctx.rackUp();
	ctx.fade( app );
	if ( ctx.desktop ) {
		Object.assign( ctx, desktopFrame( ctx ) );
	}
	try {
		if ( localStorage.getItem( 'riff-sidebar' ) === 'mini' ) {
			ctx.sidebar( false, false );
		}
	} catch {}

	window.addEventListener( 'popstate', () => {
		const to = ctx.postOf( location.href );
		// Now Playing closes through history.back() on the same address; that is not a view change.
		if ( to && ctx.keyOf( to ) !== ctx.shown ) {
			ctx.show( to, { push: false } ).catch( () => {} );
		}
	} );
	history.replaceState(
		{ ...history.state, riffApp: ctx.postOf( location.href )?.id || 0 },
		''
	);
	// A visitor who opened Your Library by its address got it drawn without their likes, which only
	// this browser has: it is drawn again with them.
	ctx.paintLikes();
	if (
		view.querySelector( '[data-riff-library="device"]' ) &&
		api.likes?.().length
	) {
		const here = ctx.postOf( location.href );
		if ( here ) {
			ctx.show( here, { quiet: true } ).catch( () => {} );
		}
	}
	// Everything is listening: what needs the script, the sidebar's toggle and the hearts, can show.
	app.dataset.riffAppReady = '';
}
