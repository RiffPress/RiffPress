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
 * before the rest. The optional features (the meter, gestures, the lock screen, Cast, sharing,
 * the wake lock) are modules loaded when first needed. Every module is a WordPress script module
 * registered by Player::enqueue() and imported by its id, which the page's import map resolves. No
 * build step: these files are what ships. */
import { parse, covers } from 'riff-player/helpers';
import { createPlayer } from 'riff-player/state';
import { media } from 'riff-player/media';
import { registry } from 'riff-player/registry';
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
	// A cover that does not load shows the blank one, wherever it is drawn.
	covers();
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
		 * Opens Now Playing, on a view of it when one is named.
		 *
		 * @since 4.0.0
		 * @since 5.8.0 The view to open it on: `album`, or one a plugin registered.
		 *
		 * @param {string} [view] A screen view's id. Default the album.
		 */
		open: ( view ) => P.open( view === undefined ? undefined : String( view ) ),
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
		 * The same answer the Pause button gives. On the turntable the music starts and stops as a
		 * record does, so this is true from the press of Play, while the needle is still being
		 * cued, and false from the press of Pause, while the music winds down.
		 *
		 * @since 4.0.0
		 *
		 * @return {boolean} True while a track plays, or waits on the needle to.
		 */
		playing: () => P.playing(),
		/**
		 * Where the track is.
		 *
		 * @since 4.32.0
		 *
		 * @return {number} Seconds from the start of the track, or 0 with nothing playing.
		 */
		time: () => ( P.track() ? P.el().currentTime || 0 : 0 ),
		/**
		 * The music as Web Audio hears it, for a plugin to read: connect an AnalyserNode of your own
		 * to this one, and never to anything that changes the sound. It is null where the music
		 * doesn't pass through Web Audio, so nothing should be drawn: before the first play, on an
		 * iPhone, for a file from another origin that doesn't share over CORS, and while a video plays.
		 *
		 * @since 6.3.0
		 *
		 * @return {?AnalyserNode} The analyser, or null.
		 */
		analyser() {
			const t = P.track();
			return P.analyser && t && P.el() === P.audio && ! P.foreign( t ) ? P.analyser : null;
		},
		/**
		 * How fast the music plays, with its pitch kept where the browser can keep it
		 * (`preservesPitch`): slower to learn a part, faster to skim. Given a rate, from 0.5 to 2,
		 * it sets it, and the speed holds for every track until it is set again. On the turntable
		 * it is multiplied by the deck's own speed and pitch.
		 *
		 * @since 5.8.0
		 *
		 * @param {number} [rate] The speed to set, 1 for the music's own. Leave it out to read it.
		 * @return {number} The speed now.
		 */
		speed( rate ) {
			const r = Number( rate );
			if ( rate !== undefined && Number.isFinite( r ) && r > 0 ) {
				P.respeed( Math.min( 2, Math.max( 0.5, r ) ) );
			}
			return P.speed;
		},
		/**
		 * Plays another file in place of the track's own, for now: the same music made another way,
		 * such as its instrumental to sing over. It carries on from the same second, at the same
		 * speed, playing or paused as it was, and it is still the same track to the listener and to
		 * every script: no `riff.track` fires, and `window.riff.time()` keeps the clock. Given null it
		 * goes back to the track's own file the same way. The track's own comes back by itself when
		 * the track changes, when the player is dismissed, and when the other file can't be played.
		 * Not while a video plays: a song's file only. The file must be one the listener may have; a
		 * protected file's address is the site's own, which answers for whoever may play it.
		 *
		 * @since 6.11.0
		 *
		 * @param {?string} src The file's address, or null for the track's own.
		 * @return {boolean} Whether the track now plays from it, or from its own for null; false with nothing playing, while a video plays, or while the track waits for its addresses.
		 */
		source: ( src ) => P.source( src ),
		/**
		 * Gives a view what it does as it opens, or adds one the server didn't register. A view is
		 * opened from its button in the bar, and on a phone from its chip in Now Playing (the album,
		 * the stage, has no button: the bar itself opens it): a screen
		 * of Now Playing, which takes the whole screen above the bar, or a panel beside the page.
		 * Register a view on the server with `riff_register_view()`, so the page has it before any
		 * script; this is for what only the browser knows. Riff's own are the album (`album`,
		 * order 26; the cover, or the turntable where Now Playing is landscape), About (`about`, a
		 * panel, 36), Up next (`queue`,
		 * a panel, 40) and Together
		 * (`together`, a panel, 45); Riff Lyrics registers Lyrics (`lyrics`, 30), Riff Sing Sing
		 * (`sing`, 32) and Riff Chords Chords (`chords`, 34). A view with nothing for a track says so
		 * with `shown`: its button and chip hide while that track plays, and if it is open when the
		 * track changes to one, a screen goes back to the one the listener came from, or to what Now
		 * Playing opens to, and a panel closes.
		 *
		 * @since 5.8.0
		 * @since 6.1.0 `view.shown`.
		 * @since 6.12.0 `sidebar` for `view.place`.
		 *
		 * @param {string}                                          id            Lowercase letters, digits and dashes; a screen is `[data-riff-view="<id>"]`, a panel `[data-riff-panel="<id>"]`.
		 * @param {Object}                                          view          The view.
		 * @param {string}                                          [view.label]  Its name: its heading, its button's and its chip's. Needed for one the server didn't register.
		 * @param {string}                                          [view.icon]   Its button's icon, SVG markup from your own code, never from content.
		 * @param {number}                                          [view.order]  Where its button sits among the bar's controls, lowest first. Default 50.
		 * @param {string}                                          [view.place]  `screen`, the default; `side` for a panel; or `sidebar` to be docked in the Listen app's sidebar under a row of its own, open beside whatever the listener browses, and a panel wherever there is no sidebar.
		 * @param {(view: HTMLElement, track: Object|null) => void} [view.render] Fills it as it opens and again as the track changes while it is open. The `riff.view` action says the same.
		 * @param {(track: Object|null) => boolean}                 [view.shown]  Whether it has something for the track, so its button and chip show. Default always.
		 * @return {() => void} Takes away what this gave it, or the view this added.
		 */
		view: ( id, view ) => P.view( id, view ),
		/**
		 * Opens a view: a screen of Now Playing, a panel beside the page, or a sidebar view in the
		 * Listen app's sidebar (folded to its rail, the sidebar opens for it).
		 *
		 * @since 5.8.0
		 *
		 * @param {string} id The view's id: `album`, `queue`, or one a plugin registered.
		 */
		openView: ( id ) => P.openView( String( id ) ),
		/**
		 * Closes a view: the one named, wherever it is, or with no id the panel that is open, or
		 * else Now Playing. Views docked in the sidebar close only by name, as several may be open
		 * there beside the rest.
		 *
		 * @since 5.8.0
		 * @since 6.12.0 `id`.
		 *
		 * @param {string} [id] The view's id.
		 */
		closeView: ( id ) => P.closeView( id ),
		/**
		 * Gives a control in the player's bar what it does, or adds one the server didn't register.
		 * Register a control on the server with `riff_register_control()`, so the page has it before
		 * any script; this is for what only the browser knows. Riff's own are Like (order 10), the
		 * badges (20), Play on another device (60) and the volume (70).
		 *
		 * @since 5.8.0
		 *
		 * @param {string}                                            id                Lowercase letters, digits and dashes; it names the control in `data-riff-control`.
		 * @param {Object}                                            control           The control.
		 * @param {string|((track: Object|null) => string)}           [control.label]   What it is called, for a screen reader and a pointer's tooltip; or a function of the track. Needed for one the server didn't register.
		 * @param {string}                                            [control.icon]    Its icon, SVG markup from your own code, never from content.
		 * @param {number}                                            [control.order]   Where it sits among the others, lowest first. Default 50.
		 * @param {(track: Object|null, button: HTMLElement) => void} [control.run]     What a press does.
		 * @param {string}                                            [control.action]  One of the player's own actions instead of `run`, such as `shuffle` or `repeat`.
		 * @param {(track: Object|null) => boolean}                   [control.pressed] Whether it is pressed, for a control that turns something on and off.
		 * @param {(track: Object|null) => boolean}                   [control.shown]   Whether it shows. Default always.
		 * @param {boolean}                                           [control.wide]    Only on a wide screen; a phone's bar keeps to the track, Play and what it needs.
		 * @param {() => HTMLElement}                                 [control.element] An element of your own in place of a button, which you keep up to date.
		 * @return {() => void} Takes away what this gave it, or the control this added.
		 */
		control: ( id, control ) => P.control( id, control ),
		/**
		 * Gives a keyboard shortcut registered on the server with `riff_register_shortcut()` what
		 * it does. It follows Riff's own single-key shortcuts: it acts only while a track is
		 * loaded, never while the listener types in a field or holds Ctrl, Alt or Command (though a
		 * mark typed with AltGr counts where the browser reports AltGr, as `[` on a German
		 * keyboard), and
		 * only where those are on, for a signed-in listener who has not turned them off on their
		 * profile, unless the `riff.shortcuts` filter turns them off. A key the server didn't
		 * register does nothing, since the profile lists every key there is.
		 *
		 * @since 5.9.0
		 *
		 * @param {string}                                        id  The shortcut's id, as it was registered.
		 * @param {(track: Object, event: KeyboardEvent) => void} run What the key does, given the track loaded and the key press.
		 * @return {() => void} Takes it away again.
		 */
		shortcut: ( id, run ) => P.shortcut( id, run ),
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
		 * `fn` to return the items. The badges work as `menu` does: `badges` is called with the
		 * badges so far and the track, and returns them, each `{ id, text, label? }`. `meter` is
		 * called each frame while the music plays and the playing row is in sight, with
		 * `{ levels }`: the three bands, 0 to 1. The bar's controls
		 * are public, through `control()`.
		 *
		 * @since 4.23.0
		 * @since 4.29.0 `badges`, `controls` and `meter`.
		 * @since 5.8.0 `controls` is `window.riff.control()`.
		 *
		 * @param {string}                                 name `like`, `playlist`, `menu`, `badges` or `meter`.
		 * @param {(...args: Object[]) => (Object[]|void)} fn   The listener.
		 * @return {() => void} Stops listening.
		 */
		listen( name, fn ) {
			P.own[ name ]?.add( fn );
			return () => P.own[ name ]?.delete( fn );
		},
		/**
		 * Says which view of the Listen app is showing, for the plugins that drew one: the app
		 * calls it once its first view is up, and again after each view it brings.
		 *
		 * @since 6.4.0
		 *
		 * @param {{view: string, panel: HTMLElement}} detail The view's slug, and the element its view is drawn in.
		 */
		appView( detail ) {
			/**
			 * Fires when a view of the Listen app shows: the first as the app starts, then each one
			 * in-page navigation brings, and again when one is drawn again in place. A plugin that
			 * added a view with the `riff_app_views` filter binds its script to what it drew here,
			 * or on the `riff:app_view` event, which bubbles to `document`.
			 *
			 * @since 6.4.0
			 *
			 * @param {Object}      detail       The view.
			 * @param {string}      detail.view  Its slug: `home`, `albums`, `album`, `post` and the
			 *                                   rest of Riff's, or the plugin's own.
			 * @param {HTMLElement} detail.panel The element the view is drawn in, `[data-riff-app-view]`;
			 *                                   a plugin's is inside it, `[data-riff-app-panel="<slug>"]`.
			 * @param {Object}      api          `window.riff`.
			 */
			emit( 'app_view', { view: detail.view, panel: detail.panel } );
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
		registry,
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
	// The Together panel, opened before anything has played, loads listening together to fill it;
	// the About panel loads what fills it the first time it opens.
	P.root.addEventListener( 'riff:view', ( e ) => {
		if ( e.detail?.id === 'together' && e.detail.open && P.me?.rest?.together ) {
			P.feature( 'together' );
		}
		if ( e.detail?.id === 'about' && e.detail.open ) {
			P.feature( 'about' );
		}
	} );

	P.join();
	P.mount();
	if ( ! P.restore() ) {
		P.paint();
		// Nothing to resume, so no panel opens yet: the room kept for one is given back.
		P.claimedPanel();
	}
	P.reveal();
	// The bar is drawn in Roboto, which riff.css never swaps in late (font-display: optional).
	// On a page with something to play, or one whose links keep the music playing into another
	// that may have, it is fetched while the page is idle, so it is there when the bar shows.
	if ( document.fonts && ( P.rows.length || P.track() || data.navigation ) ) {
		( window.requestIdleCallback?.bind( window ) || setTimeout )( () =>
			document.fonts.load( '400 16px "Riff Roboto"' ).catch( () => {} )
		);
	}
	// A link followed without leaving the page (src/class-navigation.php) brings blocks to make rows of.
	if ( data.navigation ) {
		P.feature( 'navigation' );
	}

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
