/* Riff: a docked player for the audio and video blocks in a post, with a Now Playing view.
 *
 * The server marks each core audio and video block with its track (data-riff-track on the figure),
 * and each item of a playlist block with its own. The player turns those blocks into rows, plays
 * them through one queue, and keeps one <audio> and one <video> element for the whole page. A track
 * with a video version plays through whichever of the two is showing, and switching hands the
 * position over.
 *
 * This file is the entry: it builds the player's state (assets/player/state.js), defines the public
 * api, window.riff, and the fuller door Riff's own features get, and runs the sections under
 * assets/player/ over that state, one per concern. Each section is a function of the state object
 * that adds its functions to it, so a section calls another through it and none has to be loaded
 * before the rest. The optional features (the filament, gestures, the lock screen, Cast, sharing,
 * the wake lock) are modules loaded when first needed. Every module is a WordPress script module
 * registered by Player::enqueue() and imported by its id, which the page's import map resolves. No
 * build step: these files are what ships. */
import { parse } from 'riff-player/helpers';
import { createPlayer } from 'riff-player/state';
import { media } from 'riff-player/media';
import { rows } from 'riff-player/rows';
import { resume } from 'riff-player/resume';
import { queue } from 'riff-player/queue';
import { playback } from 'riff-player/playback';
import { account } from 'riff-player/account';
import { paint } from 'riff-player/paint';
import { menu } from 'riff-player/menu';
import { seek } from 'riff-player/seek';
import { nowPlaying } from 'riff-player/now-playing';
import { controls } from 'riff-player/controls';
import { keyboard } from 'riff-player/keyboard';

const root = document.getElementById( 'riff' );

// A page core's speculative loading prerendered is not being looked at: nothing starts, and
// nothing is restored or announced, until it is shown.
if ( root ) {
	if ( document.prerendering ) {
		document.addEventListener( 'prerenderingchange', start, {
			once: true,
		} );
	} else {
		start();
	}
}

function start() {
	const data =
		parse( document.getElementById( 'riff-data' )?.textContent ) || {};
	const P = createPlayer( root, data );
	const { emit } = P;

	// The api object is window.riff, handed to riff.ready; the Listen feature gets it with more,
	// as internal. Each member is documented where it is defined, and the JavaScript reference is
	// generated from those docblocks. Stable within a major version.
	const api = {
		/**
		 * The version of this api: 1.
		 *
		 * @since 4.0.0
		 *
		 * @type {number}
		 */
		version: 1,
		/**
		 * Makes `tracks` the queue and plays the one at `index`.
		 *
		 * The tracks go through the `riff.queue` and `riff.track` filters first.
		 *
		 * @since 4.0.0
		 *
		 * @param {Object[]} tracks            Tracks, in the shape `Tracks::schema()` describes.
		 * @param {number}   [index=0]         The one to play first.
		 * @param {Object}   [options]         Options.
		 * @param {boolean}  [options.shuffle] `true` or `false` sets shuffle before playing.
		 */
		play( tracks, index = 0, { shuffle: on = null } = {} ) {
			P.press( 'play' );
			if ( on !== null ) {
				P.shuffle = on;
			}
			P.setQueue( tracks, index );
		},
		/**
		 * Plays or pauses.
		 *
		 * @since 4.0.0
		 */
		toggle: () => ( P.press( 'toggle' ), P.toggle() ),
		/**
		 * Skips to the next track.
		 *
		 * @since 4.0.0
		 */
		next: () => ( P.press( 'next' ), P.next() ),
		/**
		 * Goes back a track, or to the start of this one.
		 *
		 * @since 4.0.0
		 */
		prev: () => ( P.press( 'prev' ), P.prev() ),
		/**
		 * Moves the current track to a time.
		 *
		 * @since 4.0.0
		 *
		 * @param {number} seconds From the start of the track.
		 */
		seek( seconds ) {
			if ( P.track() ) {
				P.press( 'seek' );
				P.el().currentTime = Math.max( 0, Number( seconds ) || 0 );
			}
		},
		/**
		 * Opens Now Playing.
		 *
		 * @since 4.0.0
		 */
		open: () => P.open(),
		/**
		 * Closes Now Playing.
		 *
		 * @since 4.0.0
		 */
		close: () => P.close(),
		/**
		 * The track playing.
		 *
		 * @since 4.0.0
		 *
		 * @return {Object|null} The track, or null.
		 */
		current: () => P.track() || null,
		/**
		 * The queue in play order.
		 *
		 * @since 4.0.0
		 *
		 * @return {Object[]} Tracks.
		 */
		queue: () => P.order.map( ( i ) => P.queue[ i ] ),
		/**
		 * Whether something is playing.
		 *
		 * @since 4.0.0
		 *
		 * @return {boolean} True while a track plays.
		 */
		playing: () => !! P.track() && ! P.el().paused,
		/**
		 * Where the track is.
		 *
		 * @since 4.32.0
		 *
		 * @return {number} Seconds from the start of the track, or 0 with nothing playing.
		 */
		time: () => ( P.track() ? P.el().currentTime || 0 : 0 ),
		/**
		 * Shows one of the tabs beside Now Playing: `queue` for Up next, or a slug a plugin added
		 * through the `riff_now_playing_tabs` filter.
		 *
		 * @since 4.16.0
		 *
		 * @param {string} id The tab's slug.
		 */
		tab: ( id ) => P.pickTab( String( id ) ),
		/**
		 * Listens to one of the player's actions, without `wp-hooks`.
		 *
		 * @since 4.0.0
		 *
		 * @param {string}                                name The action without its prefix: `track`, `play`, `pause` and the rest.
		 * @param {(detail: Object, api: Object) => void} fn   Called with the detail and the api.
		 * @return {() => void} Stops listening.
		 */
		on( name, fn ) {
			const handler = ( e ) => fn( e.detail, api );
			P.root.addEventListener( `riff:${ name }`, handler );
			return () =>
				P.root.removeEventListener( `riff:${ name }`, handler );
		},
	};
	window.riff = api;
	// The rest of the player's door, for Riff's own features (the Listen app gets it when it loads)
	// and its tests: the queue's editing, history, likes and playlists. Not window.riff, so not a
	// promise to other plugins; the public api above is what they get.
	const internal = {
		...api,
		/**
		 * Calls `fn` on a change: `like` with `{ change, kind, id }`, `playlist` with
		 * `{ change, playlist }`, or `menu` with a track menu's items, track and context, for
		 * `fn` to return the items. The player's areas work as `menu` does: `badges` is called
		 * with the badges so far and the track, and returns them, each `{ id, text, label? }`;
		 * `controls` likewise, each `{ id, label, icon?, pressed?, run( track ) }`. `meter` is
		 * called each frame while the music plays, with `{ heat, levels }`: the wire's heat, 0 to
		 * a little over 1, and the three bands, 0 to 1, or null while it cools.
		 *
		 * @since 4.23.0
		 * @since 4.29.0 `badges`, `controls` and `meter`.
		 *
		 * @param {string}                                 name `like`, `playlist`, `menu`, `badges`, `controls` or `meter`.
		 * @param {(...args: Object[]) => (Object[]|void)} fn   The listener.
		 * @return {() => void} Stops listening.
		 */
		listen( name, fn ) {
			P.own[ name ]?.add( fn );
			return () => P.own[ name ]?.delete( fn );
		},
		/**
		 * A GET to one of Riff's routes as whoever is signed in: with the account's nonce, or
		 * WordPress answers as it would a visitor, whatever the cookie says.
		 *
		 * @since 4.30.0
		 *
		 * @param {string|URL} url The route.
		 * @return {Promise<Response>} The response.
		 */
		request( url ) {
			return fetch( url, {
				credentials: 'same-origin',
				headers: {
					Accept: 'application/json',
					...( P.me ? { 'X-WP-Nonce': P.me.nonce } : {} ),
				},
			} );
		},
		/**
		 * Puts tracks right after the one playing, or starts them when nothing is.
		 *
		 * Each track goes through the `riff.track` filter first; one without a file is left out.
		 *
		 * @since 4.19.0
		 *
		 * @param {Object|Object[]} tracks Tracks, in the shape `Tracks::schema()` describes.
		 */
		playNext: ( tracks ) => P.insert( tracks, P.pos + 1, 'next' ),
		/**
		 * Plays someone else's queue in its order from a point in one of its tracks, to listen
		 * along with them.
		 *
		 * @since 5.7.0
		 *
		 * @param {Object[]} tracks Tracks, in the shape `Tracks::schema()` describes.
		 * @param {number}   index  The one to play.
		 * @param {number}   at     Where in it, in seconds.
		 */
		playFrom( tracks, index, at ) {
			P.press( 'play' );
			P.shuffle = false;
			P.setQueue( tracks, index, { at: Math.max( 0, Number( at ) || 0 ) } );
		},
		/**
		 * Plays the first page of a long list, and the pages after it as the queue nears its end:
		 * each from `more.url`, a route that answers `{ items, pages }`, with its `page` set.
		 *
		 * @since 5.7.0
		 *
		 * @param {Object[]} tracks            The first page, in the shape `Tracks::schema()` describes.
		 * @param {number}   index             The one to play first.
		 * @param {Object}   more              Where the rest is.
		 * @param {string}   more.url          The route, without `page`.
		 * @param {number}   more.page         The page `tracks` is.
		 * @param {number}   more.pages        How many pages there are.
		 * @param {Object}   [options]         Options.
		 * @param {boolean}  [options.shuffle] `true` or `false` sets shuffle before playing.
		 */
		playMore( tracks, index, more, { shuffle: on = null } = {} ) {
			P.press( 'play' );
			if ( on !== null ) {
				P.shuffle = on;
			}
			P.setQueue( tracks, index, { more } );
		},
		/**
		 * Follows another listener: plays what they play, where they are in it, and keeps with them
		 * through their plays, pauses, skips and seeks, until a press of the listener's own.
		 *
		 * @since 5.8.0
		 *
		 * @param {number} user   Their user ID.
		 * @param {string} [name] Their name, for the bar.
		 * @return {Promise<boolean>} Whether there was anything of theirs to follow.
		 */
		follow: ( user, name = '' ) =>
			P.feature( 'together' ).then( ( m ) =>
				m?.follow ? m.follow( user, name ) : false
			),
		/**
		 * Adds tracks to the end of the queue, or starts them when nothing is playing.
		 *
		 * @since 4.19.0
		 *
		 * @param {Object|Object[]} tracks Tracks, in the shape `Tracks::schema()` describes.
		 */
		addToQueue: ( tracks ) => P.insert( tracks, P.order.length, 'add' ),
		/**
		 * Moves a track in the queue, by its place in the play order.
		 *
		 * @since 4.19.0
		 *
		 * @param {number} from Where it is.
		 * @param {number} to   Where it goes.
		 */
		moveInQueue: ( from, to ) => P.reorder( from, to ),
		/**
		 * Takes a track out of the queue, by its place in the play order. The one playing stays.
		 *
		 * @since 4.19.0
		 *
		 * @param {number} at Its place.
		 */
		removeFromQueue: ( at ) => P.remove( at ),
		/**
		 * Empties the queue but for the track playing.
		 *
		 * @since 4.19.0
		 */
		clearQueue: () => P.clear(),
		/**
		 * Reads every `figure[data-riff-track]` on the page again, after content was swapped in.
		 *
		 * @since 4.0.0
		 */
		mount: () => P.mount(),
		/**
		 * The tracks played, most recent first, each once: what Home's Recently played and Jump back
		 * in are drawn from. At most 30. A signed-in listener's come from their account; a visitor's
		 * are kept in the browser.
		 *
		 * @since 4.18.0
		 * @since 4.20.0 A signed-in listener's come from their account.
		 *
		 * @return {Object[]} Tracks, in the shape `Tracks::schema()` describes, each with `played`,
		 *                    when it was, in milliseconds since the epoch.
		 */
		history: () => P.played(),
		/**
		 * Likes a track, an album or an artist. A signed-in listener's likes are saved to their
		 * account; a visitor's are kept in the browser, and join their account when they sign in.
		 *
		 * Only a track in the Media Library can be liked, since its ID is the same on every page.
		 *
		 * @since 4.20.0
		 *
		 * @param {number|string} id     A track's ID (its audio attachment's), or an album's or artist's term ID.
		 * @param {string}        [kind] `track`, `album` or `artist`. Default `track`.
		 */
		like: ( id, kind = 'track' ) => P.setLike( id, kind, true ),
		/**
		 * Takes a like away.
		 *
		 * @since 4.20.0
		 *
		 * @param {number|string} id     A track's, album's or artist's ID.
		 * @param {string}        [kind] `track`, `album` or `artist`. Default `track`.
		 */
		unlike: ( id, kind = 'track' ) => P.setLike( id, kind, false ),
		/**
		 * Whether a track, album or artist is liked.
		 *
		 * @since 4.20.0
		 *
		 * @param {number|string} id     A track's, album's or artist's ID.
		 * @param {string}        [kind] `track`, `album` or `artist`. Default `track`.
		 * @return {boolean} True when it is liked.
		 */
		liked: ( id, kind = 'track' ) => P.isLiked( id, kind ),
		/**
		 * Every like, newest first.
		 *
		 * @since 4.20.0
		 *
		 * @param {string} [kind] Only `track`, `album` or `artist` likes. Default all.
		 * @return {Object[]} Likes, each `{ kind, id, at }`, with `at` when it was liked in
		 *                    milliseconds since the epoch.
		 */
		likes: ( kind ) =>
			P.likes
				.filter( ( l ) => ! kind || l.kind === kind )
				.map( ( l ) => ( { ...l } ) ),
		/**
		 * The signed-in listener's playlists, the most recently changed first. Empty for a visitor:
		 * a playlist is a post, so it needs an account.
		 *
		 * @since 4.20.0
		 *
		 * @return {Object[]} Playlists, each `{ id, title, count }`.
		 */
		playlists: () => P.playlists.map( ( p ) => ( { ...p } ) ),
		/**
		 * One of the signed-in listener's playlists, with its tracks.
		 *
		 * @since 4.20.0
		 *
		 * @param {number} id The playlist's ID.
		 * @return {Promise<Object>} The playlist, as `riff/v1/users/me/playlists/{id}` returns it.
		 */
		playlist: ( id ) =>
			P.me?.rest?.playlists
				? P.send(
						P.under( P.me.rest.playlists, `/${ Number( id ) }` ),
						'GET'
					)
				: Promise.reject( new Error( 'signed out' ) ),
		/**
		 * Makes a playlist, empty or with tracks.
		 *
		 * @since 4.20.0
		 *
		 * @param {string}               title    Its name.
		 * @param {Array<number|Object>} [tracks] Tracks, or their IDs, in order.
		 * @return {Promise<Object>} The playlist, as `riff/v1/users/me/playlists/{id}` returns it.
		 */
		createPlaylist: ( title, tracks = [] ) =>
			P.playlistCall( 'create', 'POST', '', {
				title: String( title || '' ),
				tracks: P.trackIds( tracks ),
			} ),
		/**
		 * Adds tracks to the end of a playlist.
		 *
		 * @since 4.20.0
		 *
		 * @param {number}                      id     The playlist's ID.
		 * @param {Array<number|Object>|Object} tracks Tracks, or their IDs.
		 * @return {Promise<Object>} The playlist.
		 */
		addToPlaylist: ( id, tracks ) =>
			P.playlistCall( 'add', 'POST', `/${ Number( id ) }/tracks`, {
				tracks: P.trackIds( tracks ),
			} ),
		/**
		 * Renames a playlist.
		 *
		 * @since 4.20.0
		 *
		 * @param {number} id    The playlist's ID.
		 * @param {string} title Its new name.
		 * @return {Promise<Object>} The playlist.
		 */
		renamePlaylist: ( id, title ) =>
			P.playlistCall( 'rename', 'POST', `/${ Number( id ) }`, {
				title: String( title || '' ),
			} ),
		/**
		 * Sets a playlist's tracks, in a new order or with some left out.
		 *
		 * @since 4.20.0
		 *
		 * @param {number}               id     The playlist's ID.
		 * @param {Array<number|Object>} tracks Every track, or its ID, in the new order.
		 * @return {Promise<Object>} The playlist.
		 */
		setPlaylistTracks: ( id, tracks ) =>
			P.playlistCall( 'reorder', 'POST', `/${ Number( id ) }`, {
				tracks: P.trackIds( tracks ),
			} ),
		/**
		 * Takes the track at a place out of a playlist.
		 *
		 * @since 4.20.0
		 *
		 * @param {number} id    The playlist's ID.
		 * @param {number} index The track's place, from 0.
		 * @return {Promise<Object>} The playlist.
		 */
		removeFromPlaylist: ( id, index ) =>
			P.playlistCall(
				'remove',
				'DELETE',
				`/${ Number( id ) }/tracks/${ Number( index ) }`
			),
		/**
		 * Deletes a playlist. It goes to the trash, where someone who can edit it may restore it.
		 *
		 * @since 4.20.0
		 *
		 * @param {number} id The playlist's ID.
		 * @return {Promise<Object>} `{ deleted, previous }`.
		 */
		deletePlaylist: ( id ) =>
			P.playlistCall( 'delete', 'DELETE', `/${ Number( id ) }` ),
	};
	// The tests site sets data-riff-test on the root (tests/components), and only there does the
	// whole door show, for the e2e suite to drive likes and playlists directly.
	if ( document.documentElement.hasAttribute( 'data-riff-test' ) ) {
		window.riffInternal = internal;
	}
	P.api = api;
	P.internal = internal;

	// The sections, each adding its functions to the state. Nothing runs against the page until
	// every one is in place.
	for ( const section of [
		media,
		rows,
		resume,
		queue,
		playback,
		account,
		paint,
		menu,
		seek,
		nowPlaying,
		controls,
		keyboard,
	] ) {
		Object.assign( P, section( P ) );
	}
	// A device in reach shows the Cast button before anything plays; the gestures wait for the bar.
	P.feature( 'cast' );
	P.root.addEventListener( 'riff:track', () => P.feature( 'gestures' ), {
		once: true,
	} );

	P.join();
	P.mount();
	if ( ! P.restore() ) {
		P.paint();
	}
	P.reveal();

	/**
	 * Fires once the player is set up, its state restored and `window.riff` available.
	 *
	 * @since 4.0.0
	 *
	 * @param {Object}      detail       The player's state.
	 * @param {Object[]}    detail.queue The queue in play order.
	 * @param {Object|null} detail.track The track loaded, or null.
	 * @param {Object}      api          `window.riff`.
	 */
	emit( 'ready', { queue: api.queue(), track: P.track() || null } );

	// ---- The app, on the page that holds it. Loaded only there, and handed internal.
	if ( document.querySelector( '[data-riff-app]' ) && data.assets?.app ) {
		// Until the module has started, a press on one of the app's own buttons (a cover's Play,
		// Load more) has nothing to answer it; on a slow site that can be a few seconds. The last
		// press is held, and made again once the app is listening.
		let held = null;
		const hold = ( e ) => {
			const button = e.target.closest?.(
				'[data-riff-app] [data-riff-app-action]'
			);
			if ( button ) {
				held = button;
				e.preventDefault();
			}
		};
		document.addEventListener( 'click', hold, true );
		import( data.assets.app )
			.then( ( m ) => {
				document.removeEventListener( 'click', hold, true );
				m.start( internal );
				if ( held?.isConnected ) {
					held.click();
				}
			} )
			.catch( () => {
				// Without the module the links are real links; the page still works.
				document.removeEventListener( 'click', hold, true );
				const link = held?.closest( 'a[href]' );
				if ( link ) {
					location.assign( link.href );
				}
			} );
	}
}
