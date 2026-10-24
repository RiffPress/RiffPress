/* Riff: a docked player for the audio and video blocks in a post, with a Now Playing view.
 *
 * The server marks each core audio and video block with its track (data-riff-track on the figure),
 * and each item of a playlist block with its own.
 * This script turns those blocks into rows, plays them through one queue, and keeps one <audio> and
 * one <video> element for the whole page. A track with a video version plays through whichever of
 * the two is showing, and switching hands the position over. No build step: this file is what ships. */

const root = document.getElementById( 'riff' );

if ( root ) {
	start();
}

function start() {
	const data =
		parse( document.getElementById( 'riff-data' )?.textContent ) || {};
	// Strings are WordPress translations of this module (wp_set_script_module_translations()).
	// Core prints wp.i18n only when there are translations, so without it the strings are the
	// English they are written in.
	const __ = window.wp?.i18n?.__ || ( ( english ) => english );

	// What the seek line says: where the track is and how long it is, in words.
	const seekText = ( at, duration ) =>
		/* translators: 1: time played, 2: the track's length, both in words. */ __(
			'%1$s of %2$s',
			'riff'
		)
			.replace( '%1$s', spoken( at ) )
			.replace( '%2$s', spoken( duration ) );

	// "MP3 · 128 kbps", "FLAC · Lossless", or nothing when the file was never read. Shown on every
	// track, the way the streaming services show their tier, from what WordPress read on upload.
	// A track with a video version carries a small film mark after its title, where the eye already
	// is, instead of a pill competing with the time on the row's right edge.
	const FILM =
		'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM9.5 16.5v-9l7 4.5-7 4.5z"/></svg>';
	function videoMark( t ) {
		if ( t.type !== 'video' && ! t.video ) {
			return '';
		}
		const label = esc( __( 'Video', 'riff' ) );
		return `<span class="riff-row-video" role="img" aria-label="${ label }">${ FILM }</span>`;
	}

	// The quality line, as the streaming services print it: a lossy file is its bit rate, a lossless
	// file its bit depth and sample rate when the file says, "Lossless" when it does not.
	function quality( t ) {
		if ( ! t || ( ! t.bitrate && ! t.lossless ) ) {
			return '';
		}
		const format = ( t.format || '' ).toUpperCase();
		let rate;
		if ( ! t.lossless ) {
			rate = fmt(
				/* translators: %s: kilobits per second. */ __(
					'%s kbps',
					'riff'
				),
				t.bitrate
			);
		} else if ( t.bits && t.rate ) {
			rate = fmt(
				/* translators: 1: bits per sample, 2: sample rate in kHz. */ __(
					'%1$s-bit %2$s kHz',
					'riff'
				),
				t.bits
			).replace(
				'%2$s',
				String( t.rate / 1000 ).replace( /\.?0+$/, '' )
			);
		} else {
			rate = __( 'Lossless', 'riff' );
		}
		return format ? `${ format } · ${ rate }` : rate;
	}
	const $ = ( sel ) => root.querySelector( sel );
	const $$ = ( sel ) => [ ...root.querySelectorAll( sel ) ];
	const audio = $( '.riff-audio' );
	const video = $( '.riff-video' );
	// Data saver (Network Information API): nothing is fetched ahead of a press.
	if ( navigator.connection?.saveData ) {
		audio.preload = 'none';
		video.preload = 'none';
	}
	const np = $( '.riff-np' );
	const queueList = $( '.riff-queue-list' );
	const STATE = 'riff:state';
	// A shared link names its track: ?riff_track={id} on the post's own address.
	const SHARED = 'riff_track';
	const VOLUME = 'riff:volume';
	const reduce = () =>
		window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;

	let queue = []; // Tracks, in the order they were found.
	let order = []; // Indexes into queue, in the order they play.
	let pos = -1; // Position in order.
	let mode = 'song'; // 'song' or 'video', for tracks that have both.
	let repeat = 'off'; // 'off', 'all' or 'one'.
	let shuffle = false;
	let seeking = false;
	let backgrounded = false; // Video handed to audio because the page went to the background.
	let preloader = null;

	const track = () => queue[ order[ pos ] ];

	// ---- The extension surface. Every change of state is announced twice: through wp.hooks as a
	// riff.<name> action, and as a riff:<name> CustomEvent on #riff for pages without the WordPress
	// scripts, both with the same detail. Two filters let a plugin reshape what plays: riff.queue
	// (the tracks about to become the queue) and riff.track (each track as it is queued). The api
	// object is window.riff, handed to riff.ready; the Listen feature gets it with more, as internal. Each
	// hook is documented where it fires and each api member where it is defined; the hooks and
	// JavaScript references are generated from those docblocks. Stable within a major version.
	const hooks = window.wp?.hooks;
	function emit( name, detail = {} ) {
		hooks?.doAction( `riff.${ name }`, detail, api );
		root.dispatchEvent(
			new CustomEvent( `riff:${ name }`, { detail, bubbles: true } )
		);
	}
	const filter = ( name, value, ...args ) =>
		hooks ? hooks.applyFilters( `riff.${ name }`, value, ...args ) : value;
	// Riff's own features hear of likes and playlists, add to the track menu, fill the player's
	// areas (badges and controls) and hear the meter, here rather than through wp.hooks, so none
	// of it is a promise to other plugins yet (docs/player.md, "Areas").
	const own = {
		like: new Set(),
		playlist: new Set(),
		menu: new Set(),
		badges: new Set(),
		controls: new Set(),
		meter: new Set(),
	};
	// Riff's own badge: the playing track's format and rate, through the same area as any other.
	own.badges.add( ( list, t ) => {
		const line = quality( t );
		return line ? [ ...list, { id: 'quality', text: line } ] : list;
	} );
	const tell = ( name, detail ) => own[ name ].forEach( ( fn ) => fn( detail ) );
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
			if ( on !== null ) {
				shuffle = on;
			}
			setQueue( tracks, index );
		},
		/**
		 * Plays or pauses.
		 *
		 * @since 4.0.0
		 */
		toggle: () => toggle(),
		/**
		 * Skips to the next track.
		 *
		 * @since 4.0.0
		 */
		next: () => next(),
		/**
		 * Goes back a track, or to the start of this one.
		 *
		 * @since 4.0.0
		 */
		prev: () => prev(),
		/**
		 * Moves the current track to a time.
		 *
		 * @since 4.0.0
		 *
		 * @param {number} seconds From the start of the track.
		 */
		seek( seconds ) {
			if ( track() ) {
				el().currentTime = Math.max( 0, Number( seconds ) || 0 );
			}
		},
		/**
		 * Opens Now Playing.
		 *
		 * @since 4.0.0
		 */
		open: () => open(),
		/**
		 * Closes Now Playing.
		 *
		 * @since 4.0.0
		 */
		close: () => close(),
		/**
		 * The track playing.
		 *
		 * @since 4.0.0
		 *
		 * @return {Object|null} The track, or null.
		 */
		current: () => track() || null,
		/**
		 * The queue in play order.
		 *
		 * @since 4.0.0
		 *
		 * @return {Object[]} Tracks.
		 */
		queue: () => order.map( ( i ) => queue[ i ] ),
		/**
		 * Whether something is playing.
		 *
		 * @since 4.0.0
		 *
		 * @return {boolean} True while a track plays.
		 */
		playing: () => !! track() && ! el().paused,
		/**
		 * Shows one of the tabs beside Now Playing: `queue` for Up next, or a slug a plugin added
		 * through the `riff_now_playing_tabs` filter.
		 *
		 * @since 4.16.0
		 *
		 * @param {string} id The tab's slug.
		 */
		tab: ( id ) => pickTab( String( id ) ),
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
			root.addEventListener( `riff:${ name }`, handler );
			return () => root.removeEventListener( `riff:${ name }`, handler );
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
			own[ name ]?.add( fn );
			return () => own[ name ]?.delete( fn );
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
		playNext: ( tracks ) => insert( tracks, pos + 1, 'next' ),
		/**
		 * Adds tracks to the end of the queue, or starts them when nothing is playing.
		 *
		 * @since 4.19.0
		 *
		 * @param {Object|Object[]} tracks Tracks, in the shape `Tracks::schema()` describes.
		 */
		addToQueue: ( tracks ) => insert( tracks, order.length, 'add' ),
		/**
		 * Moves a track in the queue, by its place in the play order.
		 *
		 * @since 4.19.0
		 *
		 * @param {number} from Where it is.
		 * @param {number} to   Where it goes.
		 */
		moveInQueue: ( from, to ) => reorder( from, to ),
		/**
		 * Takes a track out of the queue, by its place in the play order. The one playing stays.
		 *
		 * @since 4.19.0
		 *
		 * @param {number} at Its place.
		 */
		removeFromQueue: ( at ) => remove( at ),
		/**
		 * Empties the queue but for the track playing.
		 *
		 * @since 4.19.0
		 */
		clearQueue: () => clear(),
		/**
		 * Reads every `figure[data-riff-track]` on the page again, after content was swapped in.
		 *
		 * @since 4.0.0
		 */
		mount: () => mount(),
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
		history: () => played(),
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
		like: ( id, kind = 'track' ) => setLike( id, kind, true ),
		/**
		 * Takes a like away.
		 *
		 * @since 4.20.0
		 *
		 * @param {number|string} id     A track's, album's or artist's ID.
		 * @param {string}        [kind] `track`, `album` or `artist`. Default `track`.
		 */
		unlike: ( id, kind = 'track' ) => setLike( id, kind, false ),
		/**
		 * Whether a track, album or artist is liked.
		 *
		 * @since 4.20.0
		 *
		 * @param {number|string} id     A track's, album's or artist's ID.
		 * @param {string}        [kind] `track`, `album` or `artist`. Default `track`.
		 * @return {boolean} True when it is liked.
		 */
		liked: ( id, kind = 'track' ) => isLiked( id, kind ),
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
			likes
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
		playlists: () => playlists.map( ( p ) => ( { ...p } ) ),
		/**
		 * One of the signed-in listener's playlists, with its tracks.
		 *
		 * @since 4.20.0
		 *
		 * @param {number} id The playlist's ID.
		 * @return {Promise<Object>} The playlist, as `riff/v1/users/me/playlists/{id}` returns it.
		 */
		playlist: ( id ) =>
			me?.rest?.playlists
				? send(
						under( me.rest.playlists, `/${ Number( id ) }` ),
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
			playlistCall( 'create', 'POST', '', {
				title: String( title || '' ),
				tracks: trackIds( tracks ),
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
			playlistCall( 'add', 'POST', `/${ Number( id ) }/tracks`, {
				tracks: trackIds( tracks ),
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
			playlistCall( 'rename', 'POST', `/${ Number( id ) }`, {
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
			playlistCall( 'reorder', 'POST', `/${ Number( id ) }`, {
				tracks: trackIds( tracks ),
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
			playlistCall(
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
			playlistCall( 'delete', 'DELETE', `/${ Number( id ) }` ),
	};
	// The tests site sets data-riff-test on the root (tests/components), and only there does the
	// whole door show, for the e2e suite to drive likes and playlists directly.
	if ( document.documentElement.hasAttribute( 'data-riff-test' ) ) {
		window.riffInternal = internal;
	}
	const isVideo = ( t = track() ) =>
		!! t && ( t.type === 'video' || ( mode === 'video' && !! t.video ) );
	// Once the analyser is wired to <audio>, a file from another origin would play silent through it,
	// so such a file plays through <video> instead, hidden. The picture still shows the cover.
	const originOf = ( src ) => {
		try {
			return new URL( src, location.href ).origin;
		} catch {
			return null;
		}
	};
	// A file from another origin can be analysed only when that origin answers CORS and the file is
	// loaded with crossorigin="anonymous"; without both, Web Audio hears silence. Each origin is
	// asked once, with a HEAD request, when its tracks first appear; until it answers yes its files
	// play as they always have, unanalysed.
	const cors = new Map();
	function askCors( src ) {
		const origin = originOf( src );
		if ( ! origin || origin === location.origin || cors.has( origin ) ) {
			return;
		}
		cors.set( origin, false );
		fetch( src, { method: 'HEAD', mode: 'cors', credentials: 'omit' } )
			.then( ( r ) => r.ok && cors.set( origin, true ) )
			.catch( () => {} );
	}
	const shared = ( src ) => {
		const origin = originOf( src );
		return origin !== location.origin && cors.get( origin ) === true;
	};
	const foreign = ( t ) =>
		originOf( t.src ) !== location.origin && ! shared( t.src );
	// Points a media element at a file, loaded for CORS when its origin shares.
	function point( m, src ) {
		const cross = shared( src ) ? 'anonymous' : null;
		if ( m.getAttribute( 'src' ) !== src || m.crossOrigin !== cross ) {
			m.crossOrigin = cross;
			m.src = src;
		}
	}
	const el = ( t = track() ) =>
		isVideo( t ) || ( analyser && t && foreign( t ) ) ? video : audio;
	const srcFor = ( t, m ) =>
		m === video && isVideo( t ) && t.video ? t.video.src : t.src;

	// ---- Rows in the post. Each block keeps its native player underneath, hidden, so a page where
	// this script fails still plays. mount() reads every marked element on the page, a block's
	// figure or a playlist's item; the app calls it again after it swaps a view in, and an element
	// already turned into a row keeps that row.
	const rows = [];
	const built = new WeakMap();
	const hearts = new WeakMap(); // A row's heart, beside its … menu.
	function mount() {
		rows.length = 0;
		document
			.querySelectorAll( 'figure[data-riff-track], li[data-riff-track]' )
			.forEach( ( fig ) => {
				const t = parse( fig.dataset.riffTrack );
				// A locked track is shown, with a lock and where to unlock it, and never queued.
				if ( t?.locked && ! built.get( fig ) ) {
					built.set( fig, buildLocked( fig, t ) );
				}
				if ( ! t || ! t.src ) {
					return;
				}
				askCors( t.src );
				let row = built.get( fig );
				if ( ! row ) {
					row = buildRow( fig, t );
					built.set( fig, row );
				}
				rows.push( { t, row } );
			} );
		paint();
	}

	function buildRow( fig, t ) {
		const native = fig.querySelector( 'audio, video' );
		if ( native ) {
			native.pause();
			native.preload = 'none';
			native.hidden = true;
		}
		const row = document.createElement( 'button' );
		row.type = 'button';
		row.className = 'riff-row';
		row.setAttribute(
			'aria-label',
			fmt(
				/* translators: %s: track title. */ __( 'Play %s', 'riff' ),
				t.title
			)
		);
		row.innerHTML = rowInner( t );
		fig.insertBefore( row, fig.firstChild );
		row.after( moreButton( t ) );
		if ( inLibrary( t ) ) {
			const heart = likeButton( t );
			hearts.set( row, heart );
			row.after( heart );
		}
		row.addEventListener( 'click', () => {
			if ( track()?.id === t.id && sameQueue() ) {
				toggle();
				return;
			}
			setQueue(
				rows.map( ( r ) => r.t ),
				rows.findIndex( ( r ) => r.row === row )
			);
			if ( t.type === 'video' ) {
				open();
			}
		} );
		return row;
	}

	// A row for a track the visitor may not play: a link to unlock it when the site names one.
	function buildLocked( fig, t ) {
		fig.querySelector( 'audio, video' )?.setAttribute( 'hidden', '' );
		const row = document.createElement( t.unlock ? 'a' : 'div' );
		row.className = 'riff-row riff-row-locked';
		if ( t.unlock ) {
			row.href = t.unlock;
		}
		row.setAttribute(
			'aria-label',
			fmt(
				t.unlock
					? /* translators: %s: track title. */ __(
							'Unlock %s',
							'riff'
						)
					: /* translators: %s: track title. */ __(
							'%s is locked',
							'riff'
						),
				t.title
			)
		);
		row.innerHTML = rowInner( t, true );
		fig.insertBefore( row, fig.firstChild );
		return row;
	}

	function rowInner( t, locked = false ) {
		return (
			rowArt( t ) +
			`<span class="riff-row-text"><span class="riff-row-title">${ esc(
				t.title
			) }${ videoMark( t ) }</span>` +
			`<span class="riff-row-sub">${ esc(
				subtitle( t )
			) }</span></span>` +
			`<span class="riff-row-time">${
				locked
					? '<svg class="riff-row-lock" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>'
					: ''
			}${ t.duration ? time( t.duration ) : '' }</span>`
		);
	}

	// The page's rows are the queue that is playing, so a row tap toggles instead of restarting.
	const sameQueue = () =>
		queue.length === rows.length &&
		rows.every( ( r, i ) => r.t.id === queue[ i ].id );

	// ---- The queue.
	function setQueue( tracks, index, { play = true, at = 0 } = {} ) {
		stopAll();
		/**
		 * Filters the tracks about to become the queue.
		 *
		 * Return a new array to add, drop or reorder tracks before any of them plays.
		 *
		 * @since 4.0.0
		 *
		 * @param {Object[]} tracks The tracks, in the shape `Tracks::schema()` describes.
		 * @param {number}   index  The position in `tracks` that will play first.
		 */
		tracks = filter( 'queue', tracks, index );
		tracks = tracks.map( ( t ) =>
			/**
			 * Filters one track as a queue is set, after `riff.queue`.
			 *
			 * @since 4.0.0
			 *
			 * @param {Object} track The track, in the shape `Tracks::schema()` describes.
			 */
			filter( 'track', t )
		);
		// A track with no file, a locked one among them, has nothing to play: it is left out, and
		// the one chosen to play first is the next that can.
		const first = tracks.findIndex( ( t, i ) => i >= index && t?.src );
		const playable = tracks.filter( ( t ) => t?.src );
		if ( ! playable.length ) {
			return;
		}
		index = first < 0 ? 0 : playable.indexOf( tracks[ first ] );
		tracks = playable;
		queue = tracks;
		order = tracks.map( ( _, i ) => i );
		pos = index;
		if ( shuffle ) {
			reshuffle();
		}
		mode = 'song';
		load( { play, at } );
	}

	// ---- Changing the queue while it plays. The play order changes; the track playing keeps its
	// place, so nothing restarts.
	function insert( tracks, at, change ) {
		const list = ( Array.isArray( tracks ) ? tracks : [ tracks ] )
			.map( ( t ) =>
				/**
				 * Filters one track as it joins the queue, the same as when a queue is set.
				 *
				 * @since 4.0.0
				 *
				 * @param {Object} track The track, in the shape `Tracks::schema()` describes.
				 */
				filter( 'track', t )
			)
			.filter( ( t ) => t?.src );
		if ( ! list.length ) {
			return;
		}
		if ( pos < 0 || ! track() ) {
			setQueue( list, 0 );
			return;
		}
		const first = queue.length;
		queue.push( ...list );
		order.splice(
			Math.max( 0, Math.min( at, order.length ) ),
			0,
			...list.map( ( _, i ) => first + i )
		);
		changed( change );
	}
	function reorder( from, to ) {
		if (
			from === to ||
			from < 0 ||
			to < 0 ||
			from >= order.length ||
			to >= order.length
		) {
			return;
		}
		const current = order[ pos ];
		const [ index ] = order.splice( from, 1 );
		order.splice( to, 0, index );
		pos = order.indexOf( current );
		changed( 'move' );
	}
	function remove( at ) {
		if ( at === pos || at < 0 || at >= order.length ) {
			return;
		}
		order.splice( at, 1 );
		if ( at < pos ) {
			pos--;
		}
		changed( 'remove' );
	}
	function clear() {
		if ( pos < 0 ) {
			return;
		}
		order = [ order[ pos ] ];
		pos = 0;
		changed( 'clear' );
	}
	function changed( change ) {
		renderQueue();
		save();
		/**
		 * Fires when the queue changes while it plays: tracks added to play next or at the end, one
		 * moved or removed, or the queue cleared.
		 *
		 * @since 4.19.0
		 *
		 * @param {Object}   detail        What changed.
		 * @param {string}   detail.change `next`, `add`, `move`, `remove` or `clear`.
		 * @param {Object[]} detail.queue  The queue in play order.
		 * @param {number}   detail.index  The playing track's place in it.
		 * @param {Object}   api           `window.riff`.
		 */
		emit( 'queue', { change, queue: api.queue(), index: pos } );
	}

	function reshuffle() {
		const current = order[ pos ];
		const rest = queue
			.map( ( _, i ) => i )
			.filter( ( i ) => i !== current );
		for ( let i = rest.length - 1; i > 0; i-- ) {
			const j = Math.floor( Math.random() * ( i + 1 ) );
			[ rest[ i ], rest[ j ] ] = [ rest[ j ], rest[ i ] ];
		}
		order = [ current, ...rest ];
		pos = 0;
	}

	function stopAll() {
		for ( const m of [ audio, video ] ) {
			m.pause();
		}
	}

	// ---- Likes and what was played. A signed-in listener's live in their account: the page hands
	// them over in data.me, and each change is sent to riff/v1/users/me/likes or /users/me/history. A visitor's stay in this browser.
	// The first page a listener opens after signing in sends what this browser kept to the account
	// and forgets it here, so a shared computer keeps nothing of theirs once they sign out.
	const HISTORY = 'riff-history';
	const LIKES = 'riff-likes';
	const KINDS = [ 'track', 'album', 'artist' ];
	const me = data.me?.rest && data.me.nonce ? data.me : null;
	const keyOf = ( kind, id ) => `${ kind }:${ Number( id ) }`;
	function cleanLikes( list ) {
		const seen = new Set();
		return ( Array.isArray( list ) ? list : [] )
			.map( ( l ) => ( {
				kind: l?.kind,
				id: Number( l?.id ),
				at: Number( l?.at ) || 0,
			} ) )
			.filter( ( l ) => {
				const key = keyOf( l.kind, l.id );
				if (
					! KINDS.includes( l.kind ) ||
					! Number.isInteger( l.id ) ||
					l.id <= 0 ||
					seen.has( key )
				) {
					return false;
				}
				seen.add( key );
				return true;
			} )
			.sort( ( a, b ) => b.at - a.at );
	}
	const deviceLikes = () =>
		cleanLikes( parse( read( localStorage, LIKES ) ) );
	let likes = me ? cleanLikes( me.likes ) : deviceLikes();
	let likeSet = new Set();
	const indexLikes = () =>
		( likeSet = new Set( likes.map( ( l ) => keyOf( l.kind, l.id ) ) ) );
	indexLikes();
	const isLiked = ( id, kind = 'track' ) => likeSet.has( keyOf( kind, id ) );
	// What can be liked, or kept in an account's history: an audio file in the Media Library, whose
	// ID is the same wherever it plays.
	const inLibrary = ( t ) =>
		!! t &&
		t.type === 'audio' &&
		! t.locked &&
		/^\d+$/.test( String( t.id ) );

	function deviceHistory() {
		const list = parse( read( localStorage, HISTORY ) );
		return Array.isArray( list ) ? list : [];
	}
	let accountHistory = null;
	if ( me ) {
		accountHistory = Array.isArray( me.history ) ? me.history : [];
	}
	function played() {
		return accountHistory || deviceHistory();
	}
	// The riff_history cookie tells the server that this browser keeps a history, so the Listen
	// page's Home can hold room for it before this script runs: 2 when a track was played from a
	// post, for Jump back in too, 1 when not. It says nothing about what was played, and is there
	// only while there is something to say. A signed-in listener's history is their account's.
	function hint() {
		const list = me ? [] : deviceHistory();
		let value = '';
		if ( list.length ) {
			value = list.some( ( t ) => t?.post?.id ) ? '2' : '1';
		}
		try {
			const now =
				( document.cookie.match( /(?:^|;\s*)riff_history=(\d)/ ) ||
					[] )[ 1 ] || '';
			if ( value === now ) {
				return;
			}
			const scope = `path=${ data.cookiePath || '/' }; SameSite=Lax${
				location.protocol === 'https:' ? '; Secure' : ''
			}`;
			document.cookie = value
				? `riff_history=${ value }; max-age=31536000; ${ scope }`
				: `riff_history=; max-age=0; ${ scope }`;
		} catch {
			// A sandboxed frame has no cookies; Home then fills its rows without held room.
		}
	}
	hint();
	function remember( t ) {
		// Without the level envelope, which can be long and only the cover drawn on the server reads.
		const { levels, ...kept } = t;
		const entry = { ...kept, played: Date.now() };
		const list = [
			entry,
			...played().filter( ( p ) => p.id !== t.id ),
		].slice( 0, 30 );
		if ( ! accountHistory ) {
			write( localStorage, HISTORY, JSON.stringify( list ) );
			hint();
			return;
		}
		accountHistory = list;
		if ( inLibrary( t ) ) {
			send(
				me.rest.history,
				'POST',
				{
					items: [
						{
							id: Number( t.id ),
							played: entry.played,
							post: Number( t.post?.id ) || 0,
						},
					],
				},
				true
			).catch( () => {} );
		}
	}

	// A request to the account's routes, with the nonce that tells WordPress the cookie is the
	// listener's. A route's address takes a path whether or not the site has pretty permalinks.
	function under( base, path ) {
		const u = new URL( base, location.href );
		if ( u.searchParams.has( 'rest_route' ) ) {
			u.searchParams.set(
				'rest_route',
				u.searchParams.get( 'rest_route' ) + path
			);
		} else {
			u.pathname = u.pathname.replace( /\/?$/, path );
		}
		return u.toString();
	}
	// One at a time: the server reads the list, changes it and writes it back, so two requests at
	// once would each write over the other's change.
	let sending = Promise.resolve();
	function send( url, method, body, keepalive = false ) {
		const run = () =>
			fetch( url, {
				method,
				credentials: 'same-origin',
				keepalive,
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
					'X-WP-Nonce': me.nonce,
				},
				body: body ? JSON.stringify( body ) : undefined,
			} ).then( ( r ) =>
				r.ok
					? r.json()
					: Promise.reject( new Error( String( r.status ) ) )
			);
		const sent = sending.then( run, run );
		sending = sent.catch( () => {} );
		return sent;
	}

	function setLike( id, kind, on ) {
		id = Number( id );
		if (
			! KINDS.includes( kind ) ||
			! Number.isInteger( id ) ||
			id <= 0 ||
			isLiked( id, kind ) === on
		) {
			return;
		}
		const flip = ( yes ) => {
			likes = yes
				? [ { kind, id, at: Date.now() }, ...likes ]
				: likes.filter( ( l ) => ! ( l.kind === kind && l.id === id ) );
			likesChanged( yes ? 'like' : 'unlike', kind, id );
		};
		flip( on );
		if ( ! me ) {
			write( localStorage, LIKES, JSON.stringify( likes ) );
			return;
		}
		const sent = on
			? send( me.rest.likes, 'POST', { items: [ { kind, id } ] } )
			: send( under( me.rest.likes, `/${ kind }/${ id }` ), 'DELETE' );
		sent.catch( () => {
			// Only this like goes back; anything changed since stays as it is.
			if ( isLiked( id, kind ) === on ) {
				flip( ! on );
			}
			toast( __( 'That could not be saved. Try again.', 'riff' ) );
		} );
	}
	function likesChanged( change, kind = null, id = null ) {
		indexLikes();
		paintHearts();
		tell( 'like', { change, kind, id } );
	}
	function toggleLike( t ) {
		const on = ! isLiked( t.id );
		setLike( t.id, 'track', on );
		toast(
			fmt(
				on
					? /* translators: %s: track title. */ __(
							'%s added to Liked songs',
							'riff'
						)
					: /* translators: %s: track title. */ __(
							'%s removed from Liked songs',
							'riff'
						),
				t.title
			)
		);
	}

	// ---- Playlists. A playlist is a post, so it belongs to an account: the page hands the
	// signed-in listener's over in data.me, and each change goes to riff/v1/users/me/playlists.
	let playlists = Array.isArray( me?.playlists ) ? me.playlists : [];
	const trackIds = ( tracks ) =>
		( Array.isArray( tracks ) ? tracks : [ tracks ] )
			.map( ( t ) => Number( t && typeof t === 'object' ? t.id : t ) )
			.filter( ( n ) => Number.isInteger( n ) && n > 0 );
	function playlistCall( change, method, path, body ) {
		if ( ! me?.rest?.playlists ) {
			return Promise.reject( new Error( 'signed out' ) );
		}
		return send( under( me.rest.playlists, path ), method, body ).then(
			( r ) => {
				const p = r.previous || r;
				const brief = { id: p.id, title: p.title, count: p.count };
				playlists =
					change === 'delete'
						? playlists.filter( ( x ) => x.id !== brief.id )
						: [
								brief,
								...playlists.filter(
									( x ) => x.id !== brief.id
								),
							];
				tell( 'playlist', { change, playlist: brief } );
				return r;
			}
		);
	}
	// The list Add to playlist opens: a new playlist named after the track, then each one.
	function playlistItems( t ) {
		const said = ( p ) =>
			toast(
				fmt(
					/* translators: %s: playlist name. */ __(
						'Added to %s',
						'riff'
					),
					p.title
				)
			);
		const failed = () =>
			toast(
				__( 'The playlist could not be changed. Try again.', 'riff' )
			);
		return [
			{
				id: 'new-playlist',
				label: __( 'New playlist', 'riff' ),
				run: () =>
					internal
						.createPlaylist( t.title, [ t ] )
						.then( said, failed ),
			},
			...playlists.map( ( p ) => ( {
				id: `playlist-${ p.id }`,
				label: p.title,
				run: () =>
					internal.addToPlaylist( p.id, [ t ] ).then( said, failed ),
			} ) ),
		];
	}

	// Signed in, with likes or plays this browser kept from before: they join the account. What
	// they add shows at once; the browser forgets its copy once the account has it.
	function join() {
		if ( ! me ) {
			return;
		}
		const device = deviceLikes();
		if ( device.length ) {
			const had = new Set( likeSet );
			likes = cleanLikes( [
				...likes,
				...device.filter( ( l ) => ! had.has( keyOf( l.kind, l.id ) ) ),
			] );
			indexLikes();
			send( me.rest.likes, 'POST', { items: device } )
				.then( () => {
					drop( localStorage, LIKES );
					likesChanged( 'sync' );
				} )
				.catch( () => {} );
		}
		const plays = deviceHistory().filter( ( t ) => t?.id !== undefined );
		if ( ! plays.length ) {
			return;
		}
		const seen = new Set();
		accountHistory = [ ...plays, ...accountHistory ]
			.sort(
				( a, b ) =>
					( Number( b.played ) || 0 ) - ( Number( a.played ) || 0 )
			)
			.filter( ( t ) => ! seen.has( t.id ) && seen.add( t.id ) )
			.slice( 0, 30 );
		const items = plays
			.filter( inLibrary )
			.slice( 0, 30 )
			.map( ( t ) => ( {
				id: Number( t.id ),
				played: Number( t.played ) || 0,
				post: Number( t.post?.id ) || 0,
			} ) );
		( items.length
			? send( me.rest.history, 'POST', { items } )
			: Promise.resolve()
		)
			.then( () => drop( localStorage, HISTORY ) )
			.catch( () => {} );
	}

	function load( { play = true, at = 0 } = {} ) {
		const t = track();
		if ( ! t ) {
			return;
		}
		const m = el( t );
		const other = m === audio ? video : audio;
		other.pause();
		point( m, srcFor( t, m ) );
		if ( at || m.currentTime ) {
			m.currentTime = at;
		}
		video.poster = t.video?.poster || largest( t.art ) || '';
		root.hidden = false;
		document.documentElement.classList.add( 'has-riff' );
		if ( play ) {
			m.play().catch( paint );
			remember( t );
		}
		metadata( t );
		paint();
		renderQueue();
		tint( largest( t.art ) || t.video?.poster );
		save();
		/**
		 * Fires when a track is loaded, before it plays.
		 *
		 * @since 4.0.0
		 *
		 * @param {Object}   detail       What changed.
		 * @param {Object}   detail.track The track now loaded.
		 * @param {number}   detail.index Its position in the play order.
		 * @param {Object[]} detail.queue The queue in play order.
		 * @param {Object}   api          `window.riff`.
		 */
		emit( 'track', { track: t, index: pos, queue: api.queue() } );
	}

	function toggle() {
		const m = el();
		if ( ! track() ) {
			return;
		}
		// A short tick under the thumb on a touch screen (Vibration API), as the phone apps do.
		if ( window.matchMedia( '(hover: none)' ).matches ) {
			navigator.vibrate?.( 8 );
		}
		if ( m.paused ) {
			m.play().catch( paint );
		} else {
			m.pause();
		}
	}

	function go( to, { play = true } = {} ) {
		if ( to < 0 || to >= order.length ) {
			return;
		}
		stopAll();
		pos = to;
		load( { play } );
	}

	function next( auto = false ) {
		if ( pos < order.length - 1 ) {
			go( pos + 1 );
		} else if ( repeat === 'all' || ! auto ) {
			go( 0, { play: repeat === 'all' || ! el().paused } );
		}
	}

	function prev() {
		const m = el();
		if ( m.currentTime > 3 || pos === 0 ) {
			m.currentTime = 0;
			return;
		}
		go( pos - 1 );
	}

	function dismiss() {
		close();
		stopAll();
		queue = [];
		order = [];
		pos = -1;
		root.hidden = true;
		document.documentElement.classList.remove( 'has-riff' );
		audio.removeAttribute( 'src' );
		video.removeAttribute( 'src' );
		audio.load();
		video.load();
		forget();
		paint();
		if ( 'mediaSession' in navigator ) {
			navigator.mediaSession.metadata = null;
		}
	}

	// ---- Song and video. The position carries across, and so does whether it was playing.
	function setMode( to ) {
		const t = track();
		if ( ! t || ! t.video || to === mode ) {
			return;
		}
		const from = el();
		const at = from.currentTime;
		const playing = ! from.paused;
		mode = to;
		from.pause();
		const m = el();
		point( m, srcFor( t, m ) );
		m.currentTime = at;
		if ( playing ) {
			m.play().catch( paint );
		}
		paint();
		save();
	}

	// A phone pauses video when the page goes to the background, and audio keeps going. So the
	// track moves to audio while hidden and back to video when the page returns.
	document.addEventListener( 'visibilitychange', () => {
		if ( ! document.hidden && ! el().paused ) {
			glide();
		}
		const t = track();
		if ( ! t || ! t.video ) {
			return;
		}
		if ( document.hidden && mode === 'video' && ! video.paused ) {
			backgrounded = true;
			setMode( 'song' );
		} else if ( ! document.hidden && backgrounded ) {
			backgrounded = false;
			setMode( 'video' );
		}
	} );

	// ---- One tab at a time. When this tab starts playing it says so on a channel; any other tab of
	// the site that is playing pauses and says why, the way streaming apps hand off between devices.
	const tabId = Math.random().toString( 36 ).slice( 2 );
	const channel =
		'BroadcastChannel' in window ? new BroadcastChannel( 'riff' ) : null;
	channel?.addEventListener( 'message', ( e ) => {
		if (
			e.data?.type === 'playing' &&
			e.data.from !== tabId &&
			! el().paused
		) {
			el().pause();
			toast( __( 'Playing in another tab', 'riff' ) );
		}
	} );
	const announce = () =>
		channel?.postMessage( { type: 'playing', from: tabId } );

	// ---- Media events. Both elements report through the same handlers; only the one in use counts.
	// While something plays the line glides on the compositor: one linear animation per moving
	// layer (the played part, the wire, its heart, the bloom and the knob), from where the time is
	// to the end of the track, at the playback rate. The page's own work cannot make it stutter and
	// nothing is written each frame; it is aimed again only when the time jumps: a seek, a pause or
	// a stall, a new rate or track, or drift past 150 ms. --riff-p is still written on timeupdate,
	// for the times, the input, and where the line rests when the animations stop.
	// How long the playing track is: the element's own reading, or the length its tags gave.
	const durationOf = ( m ) =>
		( Number.isFinite( m.duration ) && m.duration ) ||
		track()?.duration ||
		0;
	let glides = [];
	let aimed = null;
	function stopGlide() {
		for ( const a of glides ) {
			a.cancel();
		}
		glides = [];
		aimed = null;
	}
	function glide() {
		stopGlide();
		const m = el();
		const duration = durationOf( m );
		const rate = m.playbackRate || 1;
		const ms = ( ( duration - m.currentTime ) * 1000 ) / rate;
		if (
			! duration ||
			ms <= 0 ||
			m.paused ||
			// Not while it waits for data: the line would run ahead of silence.
			m.readyState < 3 ||
			seeking ||
			reduce() ||
			document.hidden ||
			typeof root.animate !== 'function'
		) {
			return;
		}
		const from = Math.min( m.currentTime / duration, 1 );
		setProgress( from );
		const timing = { duration: ms, easing: 'linear', fill: 'forwards' };
		const run = ( node, frames, extra ) => {
			try {
				glides.push( node.animate( frames, { ...timing, ...extra } ) );
			} catch {
				// A browser without pseudo-element animations keeps the line's resting place.
			}
		};
		// Each animation starts on the same frame of the document's clock, the one keepAimed() reads,
		// so a late start on a busy page is caught as drift rather than carried for the whole track.
		const now = document.timeline.currentTime;
		for ( const seeker of seekers ) {
			// The direction as the stylesheet reads it, from the dir attribute; no style flush.
			const rtl = seeker.closest( '[dir]' )?.dir === 'rtl';
			const slide = ( p ) =>
				`translateX(${ ( rtl ? 1 - p : p - 1 ) * 100 }%)`;
			const stretch = [
				{ transform: `scaleX(${ from })` },
				{ transform: 'scaleX(1)' },
			];
			for ( const layer of seeker.querySelectorAll( '.riff-line i' ) ) {
				run( layer, stretch );
			}
			const along = [
				{ transform: slide( from ) },
				{ transform: slide( 1 ) },
			];
			if ( seeker.matches( '.riff-bar-seek' ) ) {
				run( seeker.querySelector( '.riff-line' ), along, {
					pseudoElement: '::after',
				} );
			}
			const knob = seeker.querySelector( '.riff-knob' );
			if ( knob ) {
				run( knob, along );
			}
		}
		for ( const a of glides ) {
			a.startTime = now;
		}
		aimed = { from: m.currentTime, at: now, rate };
	}
	// On timeupdate: aims again when the time has strayed from where the glide has it.
	function keepAimed() {
		if ( ! aimed ) {
			return;
		}
		const expected =
			aimed.from +
			( ( document.timeline.currentTime - aimed.at ) / 1000 ) *
				aimed.rate;
		if ( Math.abs( expected - el().currentTime ) > 0.15 ) {
			glide();
		}
	}
	// Stops the glide and rests the line where the time is.
	function settle() {
		stopGlide();
		progress();
	}
	for ( const m of [ audio, video ] ) {
		const live = () => m === el();
		m.addEventListener( 'play', () => {
			if ( live() ) {
				announce();
				paint();
				/**
				 * Fires when the track starts or resumes playing.
				 *
				 * @since 4.0.0
				 *
				 * @param {Object} detail       What changed.
				 * @param {Object} detail.track The track.
				 * @param {Object} api          `window.riff`.
				 */
				emit( 'play', { track: track() } );
			}
		} );
		m.addEventListener( 'pause', () => {
			if ( live() ) {
				settle();
				paint();
				/**
				 * Fires when the track pauses.
				 *
				 * @since 4.0.0
				 *
				 * @param {Object} detail       What changed.
				 * @param {Object} detail.track The track.
				 * @param {Object} api          `window.riff`.
				 */
				emit( 'pause', { track: track() } );
			}
		} );
		m.addEventListener( 'playing', () => {
			if ( live() ) {
				root.removeAttribute( 'data-waiting' );
				paint();
				glide();
			}
		} );
		m.addEventListener( 'waiting', () => {
			if ( live() ) {
				root.dataset.waiting = '';
				settle();
			}
		} );
		m.addEventListener( 'loadedmetadata', () => live() && progress() );
		m.addEventListener( 'seeking', () => live() && settle() );
		for ( const ev of [ 'seeked', 'ratechange', 'durationchange' ] ) {
			m.addEventListener( ev, () => live() && glide() );
		}
		m.addEventListener( 'timeupdate', () => {
			if ( ! live() ) {
				return;
			}
			progress();
			keepAimed();
			position();
			if ( m.currentTime > 5 && Math.floor( m.currentTime ) % 5 === 0 ) {
				save();
			}
			if ( m.duration && m.currentTime / m.duration > 0.5 ) {
				warmNext();
			}
		} );
		m.addEventListener( 'ended', () => {
			if ( ! live() ) {
				return;
			}
			settle();
			/**
			 * Fires when a track plays to its end, before the next one loads.
			 *
			 * @since 4.0.0
			 *
			 * @param {Object} detail       What changed.
			 * @param {Object} detail.track The track that ended.
			 * @param {Object} api          `window.riff`.
			 */
			emit( 'ended', { track: track() } );
			if ( repeat === 'one' ) {
				m.currentTime = 0;
				m.play().catch( paint );
			} else {
				next( true );
			}
		} );
		m.addEventListener( 'error', () => {
			if ( ! live() || ! m.getAttribute( 'src' ) ) {
				return;
			}
			root.dataset.error = '';
			setTimeout( () => {
				root.removeAttribute( 'data-error' );
				if ( pos < order.length - 1 ) {
					next( true );
				}
			}, 1500 );
		} );
	}

	// The next track starts downloading halfway through this one, so skipping never waits.
	function warmNext() {
		const t = queue[ order[ pos + 1 ] ];
		if ( ! t || isVideo( t ) || preloader?.dataset.id === t.id ) {
			return;
		}
		preloader = document.createElement( 'audio' );
		preloader.preload = 'auto';
		preloader.dataset.id = t.id;
		point( preloader, t.src );
	}

	// ---- The filament. The played part of the bar's seek line is a wire with current in it. The
	// script keeps one number, its heat, and writes it to --riff-heat on the lines once a frame; the
	// stylesheet turns that into the opacity of each fixed-colour layer of its light, which the GPU
	// composites without painting anything again. The heat follows a
	// filament's physics: the signal's power drives it up in about 80 ms, and with the current cut
	// it cools the way a hot thing does, fast while it is bright, then slowly through a long red
	// tail. What counts as full power is whatever the track has been reaching lately, so a quiet
	// recording and a loud mix each light the whole wire. Where there is no analyser (iOS, a file
	// from another origin) the wire breathes at working temperature instead.
	const wire = $( '[data-riff-wire]' );
	const heart = $( '[data-riff-hot]' );
	const isIOS =
		/iP(hone|ad|od)/.test( navigator.userAgent ) ||
		( navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 );
	let analyser = null;
	let samples = null;
	let bins = null;
	let meterRaf = 0;
	let breath = null;
	let bars = [];
	let cooling = false;
	let lastTick = 0;
	// The wire's state outlives a restart: a view swap or a row appearing never dips it, and the
	// reference never has to relearn the track.
	let heat = 0;
	let ref = 0.08;

	// Routing audio through Web Audio on iOS breaks lock-screen and background playback, so iPhones
	// keep the breath. A file from another origin cannot be analysed either; see foreign().
	function ensureAnalyser() {
		const t = track();
		if (
			analyser ||
			isIOS ||
			! window.AudioContext ||
			! t ||
			foreign( t )
		) {
			return;
		}
		try {
			const ctx = new AudioContext();
			const src = ctx.createMediaElementSource( audio );
			analyser = ctx.createAnalyser();
			// A 1024-sample window is 20 ms at 48 kHz: long enough for a steady RMS, short enough
			// to catch a transient.
			analyser.fftSize = 1024;
			analyser.smoothingTimeConstant = 0.6;
			samples = new Float32Array( analyser.fftSize );
			bins = new Uint8Array( analyser.frequencyBinCount );
			src.connect( analyser );
			analyser.connect( ctx.destination );
			audio.addEventListener( 'play', () =>
				ctx.resume().catch( () => {} )
			);
			// Suspended while nothing plays: the graph stops pulling samples, and the filament's
			// cool-down reads silence, which is right.
			for ( const ev of [ 'pause', 'ended' ] ) {
				audio.addEventListener( ev, () =>
					ctx.suspend().catch( () => {} )
				);
			}
			ctx.resume().catch( () => {} );
		} catch {
			analyser = null;
		}
	}

	// The signal's level: RMS over the window, as a filament sees current.
	function level() {
		analyser.getFloatTimeDomainData( samples );
		let sum = 0;
		for ( let n = 0; n < samples.length; n++ ) {
			sum += samples[ n ] * samples[ n ];
		}
		return Math.sqrt( sum / samples.length );
	}

	// Three bands for the bars on the playing row: bass, the body of a voice, and the air above it.
	const BANDS = [
		[ 1, 4 ],
		[ 4, 22 ],
		[ 22, 110 ],
	];
	// Each band is read against its own recent range, the way the wire reads against its own
	// reference: bass carries the most energy in nearly any mix, so one scale for all three pins
	// the bass bar and leaves the treble low, a staircase that barely moves. The range's top
	// follows a hit at once and settles over three seconds; its floor drops at once and climbs over
	// one, so a quiet intro doesn't hold every bar at the top for long. Each bar spends its whole
	// height on the band's own swing. A bar then rises fast and falls slower,
	// as a meter does, so a hit reads as a hit.
	const bands = BANDS.map( () => ( { lo: -1, hi: 0, shown: 0 } ) );
	const ease = ( from, to, dt, tau ) =>
		from + ( to - from ) * ( 1 - Math.exp( -dt / tau ) );
	function bandLevels( dt ) {
		analyser.getByteFrequencyData( bins );
		return BANDS.map( ( [ a, b ], k ) => {
			let sum = 0;
			for ( let n = a; n < b; n++ ) {
				sum += bins[ n ];
			}
			const v = sum / ( b - a ) / 255;
			const band = bands[ k ];
			if ( band.lo < 0 ) {
				band.lo = band.hi = v;
			}
			band.hi = ease( band.hi, v, dt, v > band.hi ? 0.03 : 3 );
			band.lo = ease( band.lo, v, dt, v < band.lo ? 0.03 : 1 );
			const at = Math.min(
				1,
				Math.max(
					0,
					( v - band.lo ) / Math.max( 0.06, band.hi - band.lo )
				)
			);
			band.shown = ease(
				band.shown,
				at,
				dt,
				at > band.shown ? 0.04 : 0.2
			);
			return band.shown;
		} );
	}

	// One step of the wire's physics. drive is the current, 0 to a little over 1; dt is in seconds.
	// Heating chases the drive with a 120 ms time constant: a wire warms, it does not flash.
	// Cooling is radiation plus conduction: a heat⁴ term that empties it while it is bright, and a
	// slow linear term for the tail, so a loud passage settles in half a second and the last red
	// takes a couple of seconds.
	function advance( drive, dt ) {
		if ( drive > heat ) {
			heat += ( drive - heat ) * ( 1 - Math.exp( -dt / 0.12 ) );
		} else {
			const loss = heat / 0.8 + 2.2 * heat * heat * heat * heat;
			heat = Math.max( drive, heat - loss * dt );
		}
		heat = Math.min( 1.2, heat );
	}

	// The wire is seen, not measured: a square root lifts the quiet end into view, since speech
	// sits around a tenth of full scale and would otherwise read as unlit.
	// Written on the lines and the glow themselves, not the root: a property on the root restyles
	// every element in the player each frame, these three restyle three.
	const heated = $$( '.riff-line, .riff-np-glow' );
	function setHeat( h ) {
		const value = Math.sqrt( Math.min( 1, Math.max( 0, h ) ) ).toFixed( 3 );
		for ( const node of heated ) {
			node.style.setProperty( '--riff-heat', value );
		}
	}

	// The meter area: each frame's heat and bands go to Riff's own listeners (own.meter), the
	// wire's glow and the playing row's bars among them. levels is null while the wire cools.
	const hear = ( h, levels = null ) =>
		own.meter.forEach( ( fn ) => fn( { heat: h, levels } ) );
	own.meter.add( ( { heat: h } ) => setHeat( h ) );
	// Three bars per place the current track is shown: the row in the post and the item in Up
	// next. Each place's bars take the three bands in turn.
	own.meter.add( ( { levels } ) => {
		if ( ! levels ) {
			return;
		}
		bars.forEach( ( bar, k ) => {
			bar.style.transform = `scaleY(${ (
				0.15 +
				0.85 * levels[ k % levels.length ]
			).toFixed( 2 ) })`;
		} );
	} );

	const liveBars = () => [
		...document.querySelectorAll(
			'.riff-row[data-current] .riff-row-state i, .riff-queue-list [aria-current] .riff-row-state i'
		),
	];

	function tick( now = 0 ) {
		const dt = lastTick
			? Math.min( 0.1, ( now - lastTick ) / 1000 )
			: 0.016;
		lastTick = now;
		if ( cooling ) {
			advance( 0, dt );
			hear( heat );
			if ( heat > 0.004 ) {
				meterRaf = requestAnimationFrame( tick );
			} else {
				heat = 0;
				hear( 0 );
				meterRaf = 0;
				cooling = false;
			}
			return;
		}
		const rms = level();
		// The reference rises to a peak in about 150 ms and forgets it over six seconds: a surge
		// flashes past full for a moment, as it would, and the wire ranges itself to the material.
		ref +=
			( rms - ref ) * ( 1 - Math.exp( -dt / ( rms > ref ? 0.15 : 6 ) ) );
		advance( rms / Math.max( 0.02, ref ), dt );
		hear( heat, bandLevels( dt ) );
		meterRaf = requestAnimationFrame( tick );
	}

	// Cut the current: the loop keeps running with no drive until the wire is dark.
	function meterStop() {
		if ( ! meterRaf && ! breath ) {
			return;
		}
		breath?.cancel();
		breath = null;
		root.removeAttribute( 'data-live' );
		for ( const bar of bars ) {
			bar.style.transform = '';
		}
		bars = [];
		if ( reduce() ) {
			cancelAnimationFrame( meterRaf );
			meterRaf = 0;
			heat = 0;
			hear( 0 );
			return;
		}
		cooling = true;
		if ( ! meterRaf ) {
			lastTick = 0;
			meterRaf = requestAnimationFrame( tick );
		}
	}

	function meterStart() {
		cooling = false;
		if ( reduce() ) {
			cancelAnimationFrame( meterRaf );
			meterRaf = 0;
			hear( 0.25 );
			return;
		}
		ensureAnalyser();
		if ( ! analyser || el() !== audio || ! wire ) {
			cancelAnimationFrame( meterRaf );
			meterRaf = 0;
			heat = 0.5;
			hear( heat );
			breath = heart.animate(
				[ { opacity: 0 }, { opacity: 0.45 }, { opacity: 0 } ],
				{
					duration: 2600,
					iterations: Infinity,
					easing: 'ease-in-out',
				}
			);
			return;
		}
		root.dataset.live = '';
		bars = liveBars();
		if ( ! meterRaf ) {
			lastTick = 0;
			meterRaf = requestAnimationFrame( tick );
		}
	}

	// Called from paint(): the wire follows whatever is playing, and the bars follow the current row.
	function meterSync() {
		const t = track();
		if ( t && ! el().paused && ! document.hidden ) {
			if ( ( ! meterRaf || cooling ) && ! breath ) {
				meterStart();
			} else if ( meterRaf ) {
				bars = liveBars();
			}
		} else {
			meterStop();
		}
	}

	// ---- Painting. Every copy of a control is updated from the same state.
	function paint() {
		const t = track();
		const m = el();
		const playing = !! t && ! m.paused;
		root.dataset.playing = playing ? 'true' : 'false';
		root.dataset.mode = isVideo( t ) ? 'video' : 'song';
		for ( const b of $$( '[data-riff-action="toggle"]' ) ) {
			b.setAttribute(
				'aria-label',
				playing ? __( 'Pause', 'riff' ) : __( 'Play', 'riff' )
			);
		}
		text( 'title', t?.title || '' );
		text( 'subtitle', t ? subtitle( t ) : '' );
		text( 'artist', t ? t.artist || t.post?.title || '' : '' );
		areas( t );
		text( 'source', t?.post?.title || '' );
		for ( const img of $$( 'img[data-riff-art]' ) ) {
			const src =
				img.dataset.riffSize === 'large'
					? largest( t?.art )
					: smallest( t?.art );
			if ( src && img.getAttribute( 'src' ) !== src ) {
				img.src = src;
			}
			img.hidden = ! src;
		}
		const modes = $( '.riff-modes' );
		modes.hidden = ! t?.video;
		for ( const b of $$( '[data-riff-mode]' ) ) {
			b.setAttribute(
				'aria-checked',
				String( b.dataset.riffMode === mode )
			);
		}
		const repeatLabel = {
			off: __( 'Repeat off', 'riff' ),
			all: __( 'Repeat all', 'riff' ),
			one: __( 'Repeat one', 'riff' ),
		}[ repeat ];
		for ( const b of $$( '[data-riff-action="repeat"]' ) ) {
			b.dataset.repeat = repeat;
			b.setAttribute( 'aria-pressed', String( repeat !== 'off' ) );
			b.setAttribute( 'aria-label', repeatLabel );
		}
		for ( const b of $$( '[data-riff-action="shuffle"]' ) ) {
			b.setAttribute( 'aria-pressed', String( shuffle ) );
			b.setAttribute(
				'aria-label',
				shuffle
					? __( 'Shuffle on', 'riff' )
					: __( 'Shuffle off', 'riff' )
			);
		}
		for ( const { t: rt, row } of rows ) {
			const current = !! t && rt.id === t.id && sameQueue();
			row.toggleAttribute( 'data-current', current );
			row.dataset.playing = current && playing ? 'true' : 'false';
			row.setAttribute(
				'aria-label',
				current && playing
					? fmt(
							/* translators: %s: track title. */ __(
								'Pause %s',
								'riff'
							),
							rt.title
					  )
					: fmt(
							/* translators: %s: track title. */ __(
								'Play %s',
								'riff'
							),
							rt.title
						)
			);
		}
		for ( const li of queueList.children ) {
			const current = Number( li.dataset.pos ) === pos;
			// aria-current="" reads as false, so the playing one says true.
			if ( current ) {
				li.firstElementChild.setAttribute( 'aria-current', 'true' );
			} else {
				li.firstElementChild.removeAttribute( 'aria-current' );
			}
			li.dataset.playing = current && playing ? 'true' : 'false';
		}
		paintHearts();
		progress();
		meterSync();
		if ( 'mediaSession' in navigator ) {
			navigator.mediaSession.playbackState = t
				? playing
					? 'playing'
					: 'paused'
				: 'none';
		}
	}

	function progress() {
		const m = el();
		const duration = durationOf( m );
		const ratio = duration ? Math.min( m.currentTime / duration, 1 ) : 0;
		setBuffered( duration ? buffered( m, duration ) : 0 );
		text( 'current', time( m.currentTime ) );
		text( 'duration', time( duration ) );
		// While the line is dragged it is where the pointer put it: drawing the time playing as
		// well would swap the two back and forth.
		if ( ! seeking ) {
			setProgress( ratio );
			// A range's value is written only when it moves a step: each write lays the thumb out again.
			// Its words change once a second, and are written apart from it, so they are never
			// left behind when a key has already moved the value.
			const value = String( Math.round( ratio * 1000 ) );
			const said = seekText( m.currentTime, duration );
			for ( const input of $$( '[data-riff-seek]' ) ) {
				if ( input.value !== value ) {
					input.value = value;
				}
				if ( input.getAttribute( 'aria-valuetext' ) !== said ) {
					input.setAttribute( 'aria-valuetext', said );
				}
			}
		}
	}

	// The played fraction, on the two seek containers rather than the root, for the same reason as
	// the heat.
	const seekers = $$( '.riff-bar-seek, .riff-np-seek' );

	// How far the file has loaded past the playhead, from the element's TimeRanges, as the lighter
	// band under the played part of the line.
	function buffered( m, duration ) {
		const ranges = m.buffered;
		for ( let i = 0; i < ranges.length; i++ ) {
			if (
				ranges.start( i ) <= m.currentTime + 0.5 &&
				ranges.end( i ) >= m.currentTime
			) {
				return Math.min( ranges.end( i ) / duration, 1 );
			}
		}
		return 0;
	}
	let lastBuffered = -1;
	function setBuffered( ratio ) {
		const value = ratio.toFixed( 3 );
		if ( value === lastBuffered ) {
			return;
		}
		lastBuffered = value;
		for ( const node of seekers ) {
			node.style.setProperty( '--riff-buffered', value );
		}
	}

	function setProgress( ratio ) {
		const value = ratio.toFixed( 4 );
		for ( const node of seekers ) {
			node.style.setProperty( '--riff-p', value );
		}
	}

	// The player's areas, from Riff's own listeners (own.badges, own.controls): drawn again only
	// when what they hold changes, so a control keeps its focus while the track plays on.
	let areasKey = '';
	function areas( t = track() ) {
		const collect = ( name ) =>
			[ ...own[ name ] ].reduce( ( list, fn ) => fn( list, t ) || list, [] );
		const badges = collect( 'badges' ).filter(
			( b ) => b && b.id && b.text
		);
		const controls = collect( 'controls' ).filter(
			( c ) => c && c.id && c.label && typeof c.run === 'function'
		);
		const key = JSON.stringify( [
			badges.map( ( b ) => [ b.id, b.text, b.label ] ),
			controls.map( ( c ) => [ c.id, c.label, c.pressed ] ),
		] );
		if ( key === areasKey ) {
			return;
		}
		areasKey = key;
		for ( const area of $$( '[data-riff-area="badges"]' ) ) {
			area.replaceChildren(
				...badges.map( ( b ) => {
					const pill = document.createElement( 'span' );
					// The quality pill keeps the class its styles and tests know it by.
					pill.className = `riff-badge riff-badge-${ b.id }${
						b.id === 'quality' ? ' riff-quality' : ''
					}`;
					pill.textContent = b.text;
					if ( b.label ) {
						// The title is for a pointer; the words are for everyone else, read in
						// place of the short text.
						pill.title = b.label;
						pill.innerHTML = `<span aria-hidden="true">${ esc(
							b.text
						) }</span><span class="riff-app-sr">${ esc( b.label ) }</span>`;
					}
					return pill;
				} )
			);
		}
		for ( const area of $$( '[data-riff-area="controls"]' ) ) {
			area.replaceChildren(
				...controls.map( ( c ) => {
					const button = document.createElement( 'button' );
					button.type = 'button';
					button.className = `riff-btn riff-control riff-control-${ c.id }`;
					button.dataset.riffControl = c.id;
					button.setAttribute( 'aria-label', c.label );
					if ( 'pressed' in c ) {
						button.setAttribute( 'aria-pressed', String( !! c.pressed ) );
					}
					// An icon from Riff's own code, never from the page.
					button.innerHTML = c.icon || '';
					button.addEventListener( 'click', () => {
						c.run( track() );
						areas();
					} );
					return button;
				} )
			);
		}
	}

	// The text node is changed in place: replacing it is a childList mutation, and core's
	// comment-reply script watches the whole body for those and re-binds itself on every one.
	function text( name, value ) {
		for ( const node of $$( `[data-riff-text="${ name }"]` ) ) {
			if ( node.textContent === value ) {
				continue;
			}
			if (
				node.firstChild?.nodeType === Node.TEXT_NODE &&
				node.childNodes.length === 1
			) {
				node.firstChild.data = value;
			} else {
				node.textContent = value;
			}
		}
	}

	// ---- The track menu: … beside every row and every track in Up next. The Listen app adds a
	// playlist's own items through internal.listen( 'menu' ).
	const menu = document.createElement( 'div' );
	menu.className = 'riff-menu';
	menu.setAttribute( 'role', 'menu' );
	menu.hidden = true;
	root.append( menu );
	let menuFor = null;
	const DOTS =
		'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>';

	// ---- Hearts: in the bar, in Now Playing and on each row of a track in the Media Library. A
	// heart is a toggle button, pressed while the track is liked.
	// The heart's two icons, copied from the bar's, which the server drew (Player::hearts()). Cloned
	// as nodes, so no markup is parsed here.
	const HEARTS = [ ...( $( '[data-riff-action="like"]' )?.children || [] ) ];
	function likeButton( t ) {
		const b = document.createElement( 'button' );
		b.type = 'button';
		b.className = 'riff-like-button';
		b.setAttribute(
			'aria-label',
			fmt(
				/* translators: %s: a track, album or artist. */ __(
					'Like %s',
					'riff'
				),
				t.title
			)
		);
		b.setAttribute( 'aria-pressed', String( isLiked( t.id ) ) );
		b.append( ...HEARTS.map( ( icon ) => icon.cloneNode( true ) ) );
		b.addEventListener( 'click', ( e ) => {
			e.stopPropagation();
			toggleLike( t );
		} );
		return b;
	}
	function paintHearts() {
		const t = track();
		const can = inLibrary( t );
		for ( const b of $$( '[data-riff-action="like"]' ) ) {
			b.hidden = ! can;
			b.setAttribute( 'aria-pressed', String( can && isLiked( t.id ) ) );
		}
		for ( const { t: rt, row } of rows ) {
			hearts
				.get( row )
				?.setAttribute( 'aria-pressed', String( isLiked( rt.id ) ) );
		}
	}

	function menuItems( t, at, button ) {
		const items = [
			{
				id: 'next',
				label: __( 'Play next', 'riff' ),
				run: () => {
					internal.playNext( [ t ] );
					toast(
						fmt(
							/* translators: %s: track title. */ __(
								'%s plays next',
								'riff'
							),
							t.title
						)
					);
				},
			},
			{
				id: 'add',
				label: __( 'Add to queue', 'riff' ),
				run: () => {
					internal.addToQueue( [ t ] );
					toast(
						fmt(
							/* translators: %s: track title. */ __(
								'%s added to the queue',
								'riff'
							),
							t.title
						)
					);
				},
			},
		];
		if ( inLibrary( t ) ) {
			items.push( {
				id: 'like',
				label: isLiked( t.id )
					? __( 'Remove from Liked songs', 'riff' )
					: __( 'Add to Liked songs', 'riff' ),
				run: () => toggleLike( t ),
			} );
			if ( me ) {
				items.push( {
					id: 'playlist',
					label: __( 'Add to playlist', 'riff' ),
					run: () => openMenu( button, t, at, playlistItems( t ) ),
				} );
			} else if ( data.signIn ) {
				items.push( {
					id: 'playlist',
					label: __( 'Sign in to add to a playlist', 'riff' ),
					href: data.signIn,
				} );
			}
		}
		if ( at !== undefined ) {
			if ( at > 0 ) {
				items.push( {
					id: 'up',
					label: __( 'Move up', 'riff' ),
					run: () => moveAndFocus( at, at - 1 ),
				} );
			}
			if ( at < order.length - 1 ) {
				items.push( {
					id: 'down',
					label: __( 'Move down', 'riff' ),
					run: () => moveAndFocus( at, at + 1 ),
				} );
			}
			if ( at !== pos ) {
				items.push( {
					id: 'remove',
					label: __( 'Remove from queue', 'riff' ),
					run: () => remove( at ),
				} );
			}
		}
		if ( t.post?.url ) {
			items.push( {
				id: 'post',
				label: __( 'Go to post', 'riff' ),
				href: t.post.url,
			} );
		}
		const context =
			at === undefined
				? {
						where: 'row',
						element: button?.closest( '[data-riff-track]' ) || null,
					}
				: { where: 'queue', index: at };
		return [ ...own.menu ].reduce(
			( list, fn ) => fn( list, t, context ),
			items
		);
	}

	function openMenu( button, t, at, list = null ) {
		closeMenu( false );
		const items = ( list || menuItems( t, at, button ) || [] ).filter(
			( i ) => i && i.label && ( typeof i.run === 'function' || i.href )
		);
		menu.replaceChildren(
			...items.map( ( i ) => {
				const item = document.createElement( i.href ? 'a' : 'button' );
				if ( i.href ) {
					item.href = i.href;
				} else {
					item.type = 'button';
				}
				item.setAttribute( 'role', 'menuitem' );
				item.tabIndex = -1;
				item.textContent = i.label;
				item.addEventListener( 'click', ( e ) => {
					if ( i.run ) {
						e.preventDefault();
						closeMenu();
						i.run();
					} else {
						closeMenu( false );
					}
				} );
				return item;
			} )
		);
		// The player is hidden until something plays, and the menu would be too; before then it
		// opens from the page itself. Opened from Now Playing it goes inside the dialog, where a
		// screen reader kept to it can reach it.
		( root.hidden ? document.body : ( ! np.hidden && np ) || root ).append( menu );
		menu.hidden = false;
		const r = button.getBoundingClientRect();
		const w = menu.offsetWidth;
		const h = menu.offsetHeight;
		menu.style.left = `${ Math.max( 8, Math.min( r.right - w, window.innerWidth - w - 8 ) ) }px`;
		menu.style.top = `${ r.bottom + h + 8 > window.innerHeight ? Math.max( 8, r.top - h - 4 ) : r.bottom + 4 }px`;
		button.setAttribute( 'aria-expanded', 'true' );
		menuFor = button;
		menu.firstElementChild?.focus();
	}

	function closeMenu( refocus = true ) {
		if ( menu.hidden ) {
			return;
		}
		menu.hidden = true;
		menuFor?.setAttribute( 'aria-expanded', 'false' );
		if ( refocus && menuFor?.isConnected ) {
			menuFor.focus();
		}
		menuFor = null;
	}

	menu.addEventListener( 'keydown', ( e ) => {
		const items = [ ...menu.children ];
		const i = items.indexOf( document.activeElement );
		const to = {
			ArrowDown: ( i + 1 ) % items.length,
			ArrowUp: ( i - 1 + items.length ) % items.length,
			Home: 0,
			End: items.length - 1,
		}[ e.key ];
		if ( to !== undefined ) {
			e.preventDefault();
			items[ to ]?.focus();
		} else if ( e.key === 'Escape' ) {
			e.preventDefault();
			e.stopPropagation();
			closeMenu();
		} else if ( e.key === 'Tab' ) {
			closeMenu( false );
		}
	} );
	document.addEventListener( 'pointerdown', ( e ) => {
		if (
			! menu.hidden &&
			! menu.contains( e.target ) &&
			! menuFor?.contains( e.target )
		) {
			closeMenu( false );
		}
	} );
	window.addEventListener( 'resize', () => closeMenu( false ) );

	function moreButton( t, at ) {
		const b = document.createElement( 'button' );
		b.type = 'button';
		b.className = 'riff-more-button';
		b.setAttribute( 'aria-haspopup', 'menu' );
		b.setAttribute( 'aria-expanded', 'false' );
		b.setAttribute(
			'aria-label',
			fmt(
				/* translators: %s: track title. */ __(
					'More options for %s',
					'riff'
				),
				t.title
			)
		);
		b.innerHTML = DOTS;
		b.addEventListener( 'click', ( e ) => {
			e.stopPropagation();
			if ( menuFor === b ) {
				closeMenu();
			} else {
				openMenu( b, t, at );
			}
		} );
		return b;
	}

	// A track moved by its menu or the keyboard keeps the focus on its new place.
	function moveAndFocus( from, to ) {
		reorder( from, to );
		queueList.children[ to ]?.querySelector( 'button' )?.focus();
	}

	const clearButton = $( '[data-riff-action="clear-queue"]' );
	clearButton?.addEventListener( 'click', () => clear() );

	function renderQueue() {
		// Redrawing replaces every button, so a keyboard listener in the list, or on Clear as it
		// hides, is put back on the same place, or the nearest one left, rather than on the body.
		const focused = document.activeElement;
		const inList = queueList.contains( focused );
		const at = inList ? Number( focused.closest( 'li' )?.dataset.pos ) : -1;
		const onMore = inList && focused.classList.contains( 'riff-more-button' );
		const onClear = !! clearButton && focused === clearButton;
		queueList.textContent = '';
		if ( clearButton ) {
			clearButton.hidden = order.length < 2;
		}
		order.forEach( ( index, p ) => {
			const t = queue[ index ];
			const li = document.createElement( 'li' );
			li.dataset.pos = String( p );
			li.innerHTML =
				'<button type="button">' +
				rowArt( t ) +
				`<span class="riff-row-text"><span class="riff-row-title">${ esc(
					t.title
				) }</span>` +
				`<span class="riff-row-sub">${ esc(
					t.artist || t.post?.title || ''
				) }` +
				( t.duration
					? `<span class="riff-row-dot"> • ${ time(
							t.duration
						) }</span>`
					: '' ) +
				'</span></span>' +
				`<span class="riff-row-time">${
					t.duration ? time( t.duration ) : ''
				}</span>` +
				'</button>';
			li.firstElementChild.addEventListener( 'click', () =>
				p === pos ? toggle() : go( p )
			);
			// Alt and an arrow moves the track; dragging does too, with a mouse.
			li.firstElementChild.addEventListener( 'keydown', ( e ) => {
				if (
					e.altKey &&
					( e.key === 'ArrowUp' || e.key === 'ArrowDown' )
				) {
					e.preventDefault();
					const to = p + ( e.key === 'ArrowUp' ? -1 : 1 );
					if ( to >= 0 && to < order.length ) {
						moveAndFocus( p, to );
					}
				}
			} );
			li.draggable = true;
			li.addEventListener( 'dragstart', ( e ) => {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData( 'text/x-riff-queue', String( p ) );
				li.classList.add( 'is-dragging' );
			} );
			li.addEventListener( 'dragend', () =>
				li.classList.remove( 'is-dragging' )
			);
			li.addEventListener( 'dragover', ( e ) => {
				if ( e.dataTransfer.types.includes( 'text/x-riff-queue' ) ) {
					e.preventDefault();
				}
			} );
			li.addEventListener( 'drop', ( e ) => {
				const from = Number(
					e.dataTransfer.getData( 'text/x-riff-queue' )
				);
				if ( Number.isInteger( from ) ) {
					e.preventDefault();
					reorder( from, p );
				}
			} );
			li.append( moreButton( t, p ) );
			queueList.append( li );
		} );
		if ( at >= 0 || ( onClear && clearButton.hidden ) ) {
			const li =
				queueList.children[
					Math.min( Math.max( at, 0 ), queueList.children.length - 1 )
				];
			( onMore
				? li?.querySelector( '.riff-more-button' )
				: li?.firstElementChild
			)?.focus( { preventScroll: true } );
		}
	}

	// ---- Seeking. The range is the control; the line drawn under it is decoration.
	for ( const input of $$( '[data-riff-seek]' ) ) {
		const commit = () => {
			const m = el();
			const duration = durationOf( m );
			if ( duration ) {
				m.currentTime = ( Number( input.value ) / 1000 ) * duration;
			}
		};
		input.addEventListener( 'pointerdown', () => {
			seeking = true;
			root.dataset.seeking = '';
			stopGlide();
		} );
		input.addEventListener( 'input', () => {
			setProgress( Number( input.value ) / 1000 );
			input.setAttribute(
				'aria-valuetext',
				seekText(
					( Number( input.value ) / 1000 ) * durationOf( el() ),
					durationOf( el() )
				)
			);
			if ( ! seeking ) {
				commit();
			}
		} );
		// An arrow moves five seconds, as a video player's do, where the range's own step is a
		// thousandth of the track: a fraction of a second.
		input.addEventListener( 'keydown', ( e ) => {
			const way = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[
				e.key
			];
			const m = el();
			const duration = durationOf( m );
			if ( ! way || ! duration || e.altKey || e.ctrlKey || e.metaKey ) {
				return;
			}
			e.preventDefault();
			const mirrored =
				e.key.endsWith( 'Left' ) || e.key.endsWith( 'Right' )
					? getComputedStyle( input ).direction === 'rtl'
					: false;
			const to = Math.min(
				duration,
				Math.max( 0, m.currentTime + ( mirrored ? -way : way ) * 5 )
			);
			m.currentTime = to;
			input.value = String( Math.round( ( to / duration ) * 1000 ) );
			setProgress( to / duration );
			input.setAttribute( 'aria-valuetext', seekText( to, duration ) );
		} );
		input.addEventListener( 'change', () => {
			commit();
			seeking = false;
			root.removeAttribute( 'data-seeking' );
		} );
	}
	// A press that ends without a change (a tap on the place playing, a drag back to where it
	// began) or a touch the browser takes for a scroll lets go of the line too, and it glides on.
	for ( const ev of [ 'pointerup', 'pointercancel' ] ) {
		window.addEventListener( ev, () => {
			if ( seeking ) {
				seeking = false;
				root.removeAttribute( 'data-seeking' );
				glide();
			}
		} );
	}

	// ---- Volume, remembered on this device. Phones ignore it, so it only shows on desktop.
	const volume = $( '[data-riff-volume]' );
	const kept = read( localStorage, VOLUME );
	const stored = kept === null ? NaN : Number( kept );
	if ( Number.isFinite( stored ) && stored >= 0 && stored <= 1 ) {
		audio.volume = video.volume = stored;
		volume.value = String( Math.round( stored * 100 ) );
	}
	volume.addEventListener( 'input', () => {
		audio.volume = video.volume = Number( volume.value ) / 100;
		write( localStorage, VOLUME, String( audio.volume ) );
	} );

	// ---- Buttons.
	root.addEventListener( 'click', ( e ) => {
		const mode_ = e.target.closest( '[data-riff-mode]' );
		if ( mode_ ) {
			setMode( mode_.dataset.riffMode );
			return;
		}
		const button = e.target.closest( '[data-riff-action]' );
		if ( ! button || swiped ) {
			return;
		}
		const action = button.dataset.riffAction;
		if ( action === 'toggle' ) {
			toggle();
		} else if ( action === 'next' ) {
			next();
		} else if ( action === 'prev' ) {
			prev();
		} else if ( action === 'open' ) {
			if ( np.hidden ) {
				open();
			} else {
				close();
			}
		} else if ( action === 'close' ) {
			close();
		} else if ( action === 'queue' ) {
			sheet( { none: 'half', half: 'full', full: 'none' }[ sheetState ] );
		} else if ( action === 'share' ) {
			share();
		} else if ( action === 'repeat' ) {
			repeat = { off: 'all', all: 'one', one: 'off' }[ repeat ];
			paint();
			save();
		} else if ( action === 'shuffle' ) {
			shuffle = ! shuffle;
			const current = order[ pos ];
			if ( shuffle ) {
				reshuffle();
			} else {
				order = queue.map( ( _, i ) => i );
				pos = current;
			}
			renderQueue();
			paint();
			save();
		} else if ( action === 'cast' ) {
			cast();
		} else if ( action === 'like' ) {
			if ( inLibrary( track() ) ) {
				toggleLike( track() );
			}
		}
	} );

	// ---- Now Playing. A dialog over the page: the page goes inert, Escape and the browser's back
	// close it, and focus goes back where it was.
	let opener = null;
	function open() {
		if ( ! track() || ! np.hidden ) {
			return;
		}
		// Safari doesn't focus a button on click, so after a click the active element is the body;
		// focus then goes back to the bar's title, the control that opens Now Playing.
		opener =
			document.activeElement && document.activeElement !== document.body
				? document.activeElement
				: $( '.riff-bar-info' );
		np.hidden = false;
		root.classList.add( 'is-open' );
		syncWakeLock();
		// Everything but the dialog is inert: the rest of the page, and on a phone the player's own
		// bar and toast, which the dialog covers there and which would otherwise still take focus.
		// On a wide screen the dialog opens above the bar and the bar stays the control surface.
		const wide = window.matchMedia( '(min-width: 900px)' ).matches;
		const covered = wide ? [] : [ $( '.riff-bar' ), $( '.riff-toast' ) ];
		// Modal only where it covers the bar: a screen reader keeps to a modal dialog, and on a wide
		// screen the bar beside it is still how the music is controlled.
		np.setAttribute( 'aria-modal', String( ! wide ) );
		for ( const node of [ ...document.body.children, ...covered ] ) {
			if ( node && node !== root && ! node.inert ) {
				node.inert = true;
				node.dataset.riffInert = '';
			}
		}
		for ( const b of $$( '.riff-chevron' ) ) {
			b.setAttribute( 'aria-expanded', 'true' );
		}
		history.pushState( { ...history.state, riff: 'open' }, '' );
		requestAnimationFrame( () => {
			np.classList.add( 'is-in' );
			$( '[data-riff-action="close"]' ).focus( { preventScroll: true } );
		} );
	}

	function close( { fromHistory = false } = {} ) {
		if ( np.hidden ) {
			return;
		}
		np.classList.remove( 'is-in' );
		sheet( 'none' );
		np.style.removeProperty( 'transform' );
		root.classList.remove( 'is-open' );
		for ( const node of document.querySelectorAll( '[data-riff-inert]' ) ) {
			node.inert = false;
			node.removeAttribute( 'data-riff-inert' );
		}
		for ( const b of $$( '.riff-chevron' ) ) {
			b.setAttribute( 'aria-expanded', 'false' );
		}
		const done = () => {
			np.hidden = true;
			syncWakeLock();
		};
		if ( reduce() ) {
			done();
		} else {
			np.addEventListener( 'transitionend', done, { once: true } );
			setTimeout( done, 400 );
		}
		if ( ! fromHistory && history.state?.riff === 'open' ) {
			history.back();
		}
		if ( opener && document.contains( opener ) ) {
			opener.focus( { preventScroll: true } );
		}
	}

	window.addEventListener( 'popstate', () => {
		if ( ! np.hidden && history.state?.riff !== 'open' ) {
			close( { fromHistory: true } );
		}
	} );

	// ---- Up next on a phone: a handle peeking at the bottom, then a split view with the art above the
	// list, then the list on its own under a one-row player. Tap the handle or drag it to move.
	let sheetState = 'none';
	const peek = $( '.riff-peek' );
	function sheet( to ) {
		sheetState = to;
		np.dataset.sheet = to;
		peek.setAttribute( 'aria-expanded', String( to !== 'none' ) );
		if ( to !== 'none' ) {
			queueList
				.querySelector( '[aria-current]' )
				?.scrollIntoView( { block: 'nearest' } );
		}
	}

	// ---- Tabs beside Now Playing: Up next, and any a plugin adds through riff_now_playing_tabs.
	// Picking one shows its panel and fires riff.tab, so a plugin fills its panel when it is seen.
	// The keys follow the ARIA tabs pattern: arrows move and pick, Home and End jump.
	const tabs = $$( '.riff-tab' );
	function pickTab( id, focus = false ) {
		const tab = tabs.find( ( t ) => t.dataset.riffTab === id );
		if ( ! tab ) {
			return;
		}
		for ( const t of tabs ) {
			t.setAttribute( 'aria-selected', String( t === tab ) );
			t.tabIndex = t === tab ? 0 : -1;
		}
		for ( const panel of $$( '[data-riff-panel]' ) ) {
			panel.hidden = panel.dataset.riffPanel !== id;
		}
		if ( focus ) {
			tab.focus();
		}
		/**
		 * Fires when a tab beside Now Playing is shown, including Up next. A plugin that added a
		 * tab fills its panel here, and again on `riff.track` while its tab is showing.
		 *
		 * @since 4.16.0
		 *
		 * @param {Object}      detail       What changed.
		 * @param {string}      detail.id    The tab's slug.
		 * @param {HTMLElement} detail.panel The tab's panel, `[data-riff-panel="<slug>"]`.
		 * @param {Object|null} detail.track The track playing.
		 * @param {Object}      api          `window.riff`.
		 */
		emit( 'tab', {
			id,
			panel: $( `[data-riff-panel="${ id }"]` ),
			track: track() || null,
		} );
	}
	// In Riff's desktop app Now Playing is Tidal's: the art on its own, and a tab opens its panel
	// beside it. Pressed again while its panel is open, the tab closes it.
	function drawer( tab ) {
		if ( ! document.documentElement.classList.contains( 'riff-desktop' ) ) {
			return true;
		}
		if (
			np.dataset.riffDrawer === 'open' &&
			tab.getAttribute( 'aria-selected' ) === 'true'
		) {
			delete np.dataset.riffDrawer;
			tab.setAttribute( 'aria-expanded', 'false' );
			return false;
		}
		np.dataset.riffDrawer = 'open';
		for ( const t of tabs ) {
			t.setAttribute( 'aria-expanded', String( t === tab ) );
		}
		return true;
	}
	for ( const t of tabs ) {
		t.addEventListener( 'click', () => {
			if ( drawer( t ) ) {
				pickTab( t.dataset.riffTab );
			}
		} );
		t.addEventListener( 'keydown', ( e ) => {
			const i = tabs.indexOf( t );
			const back = document.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
			const ahead = document.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
			const to = {
				[ back ]: ( i - 1 + tabs.length ) % tabs.length,
				[ ahead ]: ( i + 1 ) % tabs.length,
				Home: 0,
				End: tabs.length - 1,
			}[ e.key ];
			if ( to !== undefined ) {
				e.preventDefault();
				pickTab( tabs[ to ].dataset.riffTab, true );
			}
		} );
	}

	// ---- Share: the system sheet where there is one, the clipboard elsewhere, the same link in
	// both. The link is the track's post with the track named, so it opens on that track.
	async function share() {
		const t = track();
		let url = location.href;
		if ( t?.post?.url ) {
			const u = new URL( t.post.url, location.href );
			if ( t.id ) {
				u.searchParams.set( SHARED, t.id );
			}
			url = u.toString();
		}
		if ( navigator.share ) {
			try {
				await navigator.share( {
					title: t?.title || document.title,
					url,
				} );
				return;
			} catch ( e ) {
				// Dismissing the sheet is not a failure. Anything else tries the clipboard.
				if ( e?.name === 'AbortError' ) {
					return;
				}
			}
		}
		try {
			await navigator.clipboard.writeText( url );
			toast( __( 'Link copied', 'riff' ) );
		} catch {
			toast( __( 'The link could not be shared.', 'riff' ) );
		}
	}

	// ---- Arriving by a shared link: the track is shown and its row focused, nothing more. What
	// was playing carries on, and nothing starts by itself. A post can hold the same file twice;
	// the link opens the first.
	function reveal() {
		const id = new URLSearchParams( location.search ).get( SHARED );
		if ( ! id ) {
			return;
		}
		const hit = rows.find( ( r ) => r.t.id === id );
		if ( ! hit ) {
			toast(
				__( 'The shared track is no longer in this post.', 'riff' )
			);
			return;
		}
		hit.row.dataset.shared = '';
		hit.row.scrollIntoView( { block: 'center' } );
		hit.row.focus( { preventScroll: true } );
	}

	const toastEl = $( '.riff-toast' );
	let toastTimer = 0;
	function toast( message ) {
		toastEl.textContent = message;
		toastEl.hidden = false;
		clearTimeout( toastTimer );
		toastTimer = setTimeout( () => ( toastEl.hidden = true ), 2500 );
	}

	// ---- The time under the pointer, above the bar's seek line on a wide screen.
	const barSeek = $( '.riff-bar-seek' );
	const tip = $( '.riff-tip' );
	barSeek.addEventListener( 'pointermove', ( e ) => {
		if ( e.pointerType !== 'mouse' ) {
			return;
		}
		const r = barSeek.getBoundingClientRect();
		const ratio = Math.min(
			Math.max( ( e.clientX - r.left ) / r.width, 0 ),
			1
		);
		const m = el();
		const duration = durationOf( m );
		tip.textContent = time( ratio * duration );
		tip.style.left = `${ ratio * 100 }%`;
		tip.hidden = ! duration;
	} );
	barSeek.addEventListener( 'pointerleave', () => ( tip.hidden = true ) );

	// ---- Gestures. Swipe the bar sideways to skip, down to stop; drag Now Playing down to close.
	let swiped = false;
	drag( $( '.riff-bar-info' ), {
		move: ( dx, dy, target ) => {
			if ( Math.abs( dx ) > Math.abs( dy ) ) {
				target.style.transform = `translateX(${ dx }px)`;
			}
		},
		end: ( dx, dy, target ) => {
			target.style.removeProperty( 'transform' );
			swiped = Math.abs( dx ) > 10 || Math.abs( dy ) > 10;
			setTimeout( () => ( swiped = false ), 0 );
			if ( Math.abs( dx ) > 60 && Math.abs( dx ) > Math.abs( dy ) ) {
				if ( dx < 0 ) {
					next();
				} else {
					prev();
				}
			} else if ( dy > 50 && dy > Math.abs( dx ) ) {
				dismiss();
			}
		},
	} );
	for ( const zone of $$( '.riff-np-head, .riff-stage' ) ) {
		drag( zone, {
			move: ( dx, dy ) => {
				if ( dy > 0 ) {
					np.style.transform = `translateY(${ dy }px)`;
				}
			},
			end: ( dx, dy, target, velocity ) => {
				np.style.removeProperty( 'transform' );
				if ( dy > 120 || velocity > 0.6 ) {
					close();
				}
			},
		} );
	}

	drag( peek, {
		move: () => {},
		end: ( dx, dy ) => {
			if ( Math.abs( dy ) > 10 ) {
				swiped = true;
				setTimeout( () => ( swiped = false ), 0 );
			}
			if ( dy < -40 ) {
				sheet( sheetState === 'none' ? 'half' : 'full' );
			} else if ( dy > 40 ) {
				sheet( sheetState === 'full' ? 'half' : 'none' );
			}
		},
	} );

	function drag( zone, { move, end } ) {
		let from = null;
		zone.addEventListener( 'pointerdown', ( e ) => {
			if (
				e.pointerType === 'mouse' ||
				e.target.closest(
					'input, [role="radio"], [data-riff-action="close"], [data-riff-action="cast"]'
				)
			) {
				return;
			}
			from = {
				x: e.clientX,
				y: e.clientY,
				at: e.timeStamp,
				id: e.pointerId,
			};
			zone.classList.add( 'is-dragging' );
		} );
		zone.addEventListener( 'pointermove', ( e ) => {
			if ( from?.id === e.pointerId ) {
				move( e.clientX - from.x, e.clientY - from.y, zone );
			}
		} );
		const finish = ( e ) => {
			if ( from?.id !== e.pointerId ) {
				return;
			}
			const dx = e.clientX - from.x;
			const dy = e.clientY - from.y;
			const velocity = dy / Math.max( e.timeStamp - from.at, 1 );
			from = null;
			zone.classList.remove( 'is-dragging' );
			end( dx, dy, zone, velocity );
		};
		zone.addEventListener( 'pointerup', finish );
		zone.addEventListener( 'pointercancel', finish );
	}

	// ---- Keyboard: Space or K plays and pauses, J and L skip ten seconds, Shift+N and Shift+P
	// change track. Nothing fires while typing, and Space leaves buttons and links alone. Escape
	// closes Now Playing from anywhere, a field included. The single-key shortcuts can be turned
	// off through the riff.shortcuts filter, which is what WCAG 2.1.4 asks of them.
	document.addEventListener( 'keydown', ( e ) => {
		if (
			! track() ||
			e.defaultPrevented ||
			e.ctrlKey ||
			e.metaKey ||
			e.altKey
		) {
			return;
		}
		if ( e.key === 'Escape' && ! np.hidden ) {
			close();
			e.preventDefault();
			return;
		}
		const target = e.target;
		if (
			target.closest?.(
				'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
			) ||
			/**
			 * Filters whether the single-key shortcuts (Space, K, J, L) act on a key press.
			 *
			 * Return `false` to turn them off, which WCAG 2.1.4 asks to be possible.
			 *
			 * @since 4.0.1
			 *
			 * @param {boolean}       enabled Whether the shortcuts act. Default true.
			 * @param {KeyboardEvent} event   The key press.
			 */
			! filter( 'shortcuts', true, e )
		) {
			return;
		}
		const m = el();
		const key = e.key.toLowerCase();
		if (
			( e.key === ' ' && ! target.closest?.( 'button, a, summary' ) ) ||
			( key === 'k' && ! e.shiftKey )
		) {
			toggle();
		} else if ( key === 'j' && ! e.shiftKey ) {
			m.currentTime = Math.max( 0, m.currentTime - 10 );
		} else if ( key === 'l' && ! e.shiftKey ) {
			m.currentTime = Math.min(
				m.duration || Infinity,
				m.currentTime + 10
			);
		} else if ( key === 'n' && e.shiftKey ) {
			next();
		} else if ( key === 'p' && e.shiftKey ) {
			prev();
		} else {
			return;
		}
		e.preventDefault();
	} );

	// ---- Lock screen, headphones, and the system's media controls.
	function metadata( t ) {
		if ( ! ( 'mediaSession' in navigator ) || ! window.MediaMetadata ) {
			return;
		}
		navigator.mediaSession.metadata = new window.MediaMetadata( {
			title: t.title,
			artist: t.artist,
			album: t.album || t.post?.title || '',
			artwork: ( t.art || [] ).map( ( a ) => ( {
				src: a.src,
				sizes: a.sizes,
			} ) ),
		} );
	}

	let lastPosition = 0;
	function position() {
		const m = el();
		if (
			! navigator.mediaSession?.setPositionState ||
			! Number.isFinite( m.duration )
		) {
			return;
		}
		const now = performance.now();
		if ( now - lastPosition < 1000 ) {
			return;
		}
		lastPosition = now;
		try {
			navigator.mediaSession.setPositionState( {
				duration: m.duration,
				playbackRate: m.playbackRate || 1,
				position: Math.min( m.currentTime, m.duration ),
			} );
		} catch {
			// A position past the duration throws; the next tick corrects it.
		}
	}

	if ( 'mediaSession' in navigator ) {
		const actions = {
			play: () => el().play().catch( paint ),
			pause: () => el().pause(),
			previoustrack: prev,
			nexttrack: () => next(),
			seekbackward: ( d ) =>
				( el().currentTime = Math.max(
					0,
					el().currentTime - ( d.seekOffset || 10 )
				) ),
			seekforward: ( d ) =>
				( el().currentTime =
					el().currentTime + ( d.seekOffset || 10 ) ),
			seekto: ( d ) => {
				if ( d.fastSeek && 'fastSeek' in el() ) {
					el().fastSeek( d.seekTime );
				} else {
					el().currentTime = d.seekTime;
				}
			},
			stop: dismiss,
		};
		for ( const [ action, handler ] of Object.entries( actions ) ) {
			try {
				navigator.mediaSession.setActionHandler( action, handler );
			} catch {
				// Not every browser knows every action.
			}
		}
	}

	// ---- AirPlay in Safari, Cast in Chrome. The buttons, in the bar on a phone and in Now Playing
	// everywhere, show only while a device is in reach.
	const castButtons = $$( '[data-riff-action="cast"]' );
	const castAvailable = ( available ) => {
		for ( const b of castButtons ) {
			b.hidden = ! available;
		}
	};
	if ( window.WebKitPlaybackTargetAvailabilityEvent ) {
		audio.addEventListener(
			'webkitplaybacktargetavailabilitychanged',
			( e ) => castAvailable( e.availability === 'available' )
		);
	} else if ( audio.remote?.watchAvailability ) {
		audio.remote.watchAvailability( castAvailable ).catch( () => {} );
	}
	function cast() {
		const m = el();
		if ( m.webkitShowPlaybackTargetPicker ) {
			m.webkitShowPlaybackTargetPicker();
		} else if ( m.remote?.prompt ) {
			m.remote.prompt().catch( () => {} );
		}
	}

	// ---- Now Playing's background takes its colour from the artwork, darkened so text stays legible.
	const tints = new Map();
	function tint( src ) {
		if ( ! src ) {
			root.style.removeProperty( '--riff-tint' );
			return;
		}
		if ( tints.has( src ) ) {
			root.style.setProperty( '--riff-tint', tints.get( src ) );
			return;
		}
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.decoding = 'async';
		img.onload = () => {
			try {
				const c = document.createElement( 'canvas' );
				c.width = c.height = 8;
				const ctx = c.getContext( '2d', { willReadFrequently: true } );
				ctx.drawImage( img, 0, 0, 8, 8 );
				const px = ctx.getImageData( 0, 0, 8, 8 ).data;
				let r = 0,
					g = 0,
					b = 0;
				for ( let i = 0; i < px.length; i += 4 ) {
					r += px[ i ];
					g += px[ i + 1 ];
					b += px[ i + 2 ];
				}
				const n = px.length / 4;
				const [ h, sat ] = hsl( r / n, g / n, b / n );
				const colour = `hsl(${ Math.round( h ) } ${ Math.round(
					Math.min( sat, 0.55 ) * 100
				) }% 22%)`;
				tints.set( src, colour );
				if (
					largest( track()?.art ) === src ||
					track()?.video?.poster === src
				) {
					root.style.setProperty( '--riff-tint', colour );
				}
			} catch {
				// An image from another origin without CORS cannot be read; the plain background stays.
			}
		};
		img.src = src;
	}

	// ---- Picking up where the listener left off. The queue and position live for the tab's
	// session. A link to another page carries the music over: the click that follows the link is
	// the gesture the new page needs to play with sound. A reload shows the same track, paused.
	function save() {
		if ( ! track() ) {
			return;
		}
		write(
			sessionStorage,
			STATE,
			JSON.stringify( {
				queue,
				order,
				pos,
				mode,
				repeat,
				shuffle,
				at: el().currentTime || 0,
				playing: ! el().paused && ! el().ended,
			} )
		);
	}
	function forget() {
		try {
			sessionStorage.removeItem( STATE );
		} catch {}
	}
	window.addEventListener( 'pagehide', save );
	// Back from the back-forward cache: the elements kept their state, the frame loop did not.
	window.addEventListener( 'pageshow', ( e ) => {
		if ( e.persisted ) {
			progress();
			glide();
		}
	} );

	// ---- Screen Wake Lock: the screen stays on while a video plays in Now Playing, and only then.
	// The lock lets go by itself when the page is hidden, so it is asked for again on return.
	let wakeLock = null;
	async function syncWakeLock() {
		const wanted =
			mode === 'video' &&
			! video.paused &&
			! np.hidden &&
			! document.hidden;
		if ( wanted && ! wakeLock && navigator.wakeLock ) {
			try {
				wakeLock = await navigator.wakeLock.request( 'screen' );
				wakeLock.addEventListener( 'release', () => {
					wakeLock = null;
				} );
			} catch {
				wakeLock = null;
			}
		} else if ( ! wanted && wakeLock ) {
			wakeLock.release().catch( () => {} );
			wakeLock = null;
		}
	}
	for ( const ev of [ 'play', 'pause', 'ended' ] ) {
		video.addEventListener( ev, syncWakeLock );
	}
	// Opening and closing Now Playing call it themselves.
	root.addEventListener( 'riff:track', syncWakeLock );
	document.addEventListener( 'visibilitychange', syncWakeLock );

	join();
	mount();

	const saved = parse( read( sessionStorage, STATE ) );
	if (
		saved &&
		Array.isArray( saved.queue ) &&
		saved.queue.length &&
		saved.queue[ saved.order?.[ saved.pos ] ]
	) {
		queue = saved.queue;
		order = saved.order;
		pos = saved.pos;
		repeat = [ 'off', 'all', 'one' ].includes( saved.repeat )
			? saved.repeat
			: 'off';
		shuffle = !! saved.shuffle;
		mode = saved.mode === 'video' ? 'video' : 'song';
		const arrival = performance.getEntriesByType( 'navigation' )[ 0 ]?.type;
		load( {
			play: !! saved.playing && arrival !== 'reload',
			at: Number( saved.at ) || 0,
		} );
	} else {
		paint();
	}
	reveal();

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
	emit( 'ready', { queue: api.queue(), track: track() || null } );

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

// ---- Helpers.

function parse( json ) {
	try {
		return json ? JSON.parse( json ) : null;
	} catch {
		return null;
	}
}

function read( store, key ) {
	try {
		return store.getItem( key );
	} catch {
		return null;
	}
}

function write( store, key, value ) {
	try {
		store.setItem( key, value );
	} catch {
		// Private mode or a full quota: the player works without remembering.
	}
}

function drop( store, key ) {
	try {
		store.removeItem( key );
	} catch {}
}

// A time in words, in the page's language, for a screen reader: "7 minutes, 33 seconds" rather
// than "7 colon 33". A browser without Intl.DurationFormat gets the clock's "7:33". The formatter
// is made on first use: the player starts before the module's last lines have run.
function spoken( seconds ) {
	spoken.words ??= durationWords( document.documentElement.lang || undefined );
	const s = Number.isFinite( seconds ) && seconds > 0 ? Math.floor( seconds ) : 0;
	if ( ! spoken.words ) {
		return time( s );
	}
	return spoken.words( {
		hours: Math.floor( s / 3600 ),
		minutes: Math.floor( ( s % 3600 ) / 60 ),
		seconds: s % 60,
	} );
}
function durationWords( lang ) {
	try {
		const words = new Intl.DurationFormat( lang, { style: 'long' } );
		// Nothing at all is said for no time; the start of a track is "0 seconds".
		const none = new Intl.DurationFormat( lang, {
			style: 'long',
			secondsDisplay: 'always',
		} ).format( { seconds: 0 } );
		return ( d ) => words.format( d ) || none;
	} catch {
		return false;
	}
}

function time( seconds ) {
	if ( ! Number.isFinite( seconds ) || seconds < 0 ) {
		return '0:00';
	}
	const s = Math.floor( seconds );
	const h = Math.floor( s / 3600 );
	const m = Math.floor( ( s % 3600 ) / 60 );
	const r = String( s % 60 ).padStart( 2, '0' );
	return h
		? `${ h }:${ String( m ).padStart( 2, '0' ) }:${ r }`
		: `${ m }:${ r }`;
}

function fmt( pattern, value ) {
	return String( pattern || '%s' ).replace( /%(1\$)?s/, value );
}

// The artist and album, or the post the track came from when the file has neither, as a video
// usually does.
function subtitle( t ) {
	return (
		[ t.artist, t.album ].filter( Boolean ).join( ' • ' ) ||
		t.post?.title ||
		''
	);
}

// A track's cover and the bars that move on it while it plays, for a row and for Up next.
function rowArt( t ) {
	const art = smallest( t.art ) || t.video?.poster || '';
	return (
		'<span class="riff-row-art">' +
		( art
			? `<img src="${ esc( art ) }" alt="" loading="lazy" decoding="async">`
			: '' ) +
		'<span class="riff-row-state" aria-hidden="true"><i></i><i></i><i></i></span></span>'
	);
}

function smallest( art ) {
	return art?.[ 0 ]?.src || '';
}

function largest( art ) {
	return art?.[ art.length - 1 ]?.src || '';
}

function esc( value ) {
	return String( value ).replace(
		/[&<>"']/g,
		( c ) =>
			( {
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#39;',
			} )[ c ]
	);
}

function hsl( r, g, b ) {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max( r, g, b );
	const min = Math.min( r, g, b );
	const l = ( max + min ) / 2;
	if ( max === min ) {
		return [ 0, 0, l ];
	}
	const d = max - min;
	const sat = l > 0.5 ? d / ( 2 - max - min ) : d / ( max + min );
	let h;
	if ( max === r ) {
		h = ( g - b ) / d + ( g < b ? 6 : 0 );
	} else if ( max === g ) {
		h = ( b - r ) / d + 2;
	} else {
		h = ( r - g ) / d + 4;
	}
	return [ h * 60, sat, l ];
}
