/* The player's state, which every section reads and some change: the elements, the queue and
 * where it is, the modes, and the two doors other code comes through, the hooks and Riff's own
 * listeners. A section is a function of this one object (P) that adds its own functions to it, so a
 * section calls another through it (P.paint(), P.load()) and none has to be loaded before the rest.
 * Mutable state lives on P, never in a section's closure, so a feature loaded later sees the same
 * queue the rest does. */
import { fmt, spoken, speak } from 'riff-player/helpers';

// Strings are WordPress translations of this module (wp_set_script_module_translations()).
// Core prints wp.i18n only when there are translations, so without it the strings are the
// English they are written in.
const __ = window.wp?.i18n?.__ || ( ( english ) => english );

// A track with a video version carries a small film mark after its title, where the eye already
// is, instead of a pill competing with the time on the row's right edge.
const FILM =
	'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 15L15 12L10 9V15Z" fill="currentColor" stroke="none"/><path d="M4.75 6C4.75 5.30964 5.30964 4.75 6 4.75H18C18.6904 4.75 19.25 5.30964 19.25 6V18C19.25 18.6904 18.6904 19.25 18 19.25H6C5.30964 19.25 4.75 18.6904 4.75 18V6Z"/></svg>';

export function createPlayer( root, data ) {
	const $ = ( sel ) => root.querySelector( sel );
	const $$ = ( sel ) => [ ...root.querySelectorAll( sel ) ];
	const audio = $( '.riff-audio' );
	const video = $( '.riff-video' );
	// Data saver (Network Information API): nothing is fetched ahead of a press.
	if ( navigator.connection?.saveData ) {
		audio.preload = 'none';
		video.preload = 'none';
	}

	const P = {
		root,
		data,
		$,
		$$,
		audio,
		video,
		np: $( '.riff-np' ),
		queueList: $( '.riff-queue-list' ),
		STATE: 'riff:state',
		QUEUE: 'riff:queue',
		// A shared link names its track: ?riff_track={id} on the post's own address.
		SHARED: 'riff_track',
		VOLUME: 'riff:volume',
		CAPTIONS: 'riff:captions',
		reduce: () =>
			window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches,
		// Whether the page is out of sight, so nothing is drawn for no one.
		away: () => document.hidden,

		queue: [], // Tracks, in the order they were found.
		order: [], // Indexes into queue, in the order they play.
		pos: -1, // Position in order.
		more: null, // Where the rest of a long list is: { url, page, pages }.
		mode: 'song', // 'song' or 'video', for tracks that have both.
		repeat: 'off', // 'off', 'all' or 'one'.
		shuffle: false,
		speed: 1, // The listener's own speed, its pitch kept (window.riff.speed()).
		seeking: false,
		backgrounded: false, // Video handed to audio because the page went to the background.
		preloader: null,
		swiped: false, // A swipe on the bar just ended, so the click it also fires is not a press.
		announcing: null, // The track loaded to play, said to be playing once its sound starts.
		failed: new Set(), // Tracks that could not be played, by id, marked in the list.
		failures: 0, // Tracks that failed one after another; the player stops skipping at three.
		renewing: false, // A track's signed address is being asked for again, before it loads.

		track: () => P.queue[ P.order[ P.pos ] ],
		// The signed-in listener: their nonce and routes, from the page, or null for a visitor.
		me: data.me?.rest && data.me.nonce ? data.me : null,
	};

	// The one answer to "is it playing", which the controls, window.riff.playing(), the saved
	// state and Listen Together all give. Where the record is seen the music starts and stops as
	// a turntable's does (now-playing.js): 'cued' is play pressed and the music waiting on the
	// needle, 'stopping' is stop pressed and the music winding down. Each counts as what was
	// asked for, so the button and a script agree while the needle is cued. The sections that
	// answer the parts (el, held, stopping) are added to P after this, so each is read when asked.
	P.status = () => {
		if ( ! P.track() ) {
			return 'none';
		}
		if ( P.held?.() ) {
			return 'cued';
		}
		if ( P.el().paused ) {
			return 'paused';
		}
		return P.stopping?.() ? 'stopping' : 'playing';
	};
	P.playing = () => {
		const status = P.status();
		return status === 'playing' || status === 'cued';
	};

	// What the seek line says: where the track is and how long it is, in words.
	P.seekText = ( at, duration ) =>
		/* translators: 1: time played, 2: the track's length, both in words. */ __(
			'%1$s of %2$s',
			'riff'
		)
			.replace( '%1$s', spoken( at ) )
			.replace( '%2$s', spoken( duration ) );

	P.videoMark = ( t ) => {
		if ( t.type !== 'video' && ! t.video ) {
			return '';
		}
		const label = __( 'Video', 'riff' );
		return `<span class="riff-row-video" role="img" aria-label="${ label }">${ FILM }</span>`;
	};

	// The quality line, as the streaming services print it: a lossy file is its bit rate, a lossless
	// file its bit depth and sample rate when the file says, "Lossless" when it does not.
	P.quality = ( t ) => {
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
				t.bits,
				String( t.rate / 1000 ).replace( /\.?0+$/, '' )
			);
		} else {
			rate = __( 'Lossless', 'riff' );
		}
		return format ? `${ format } · ${ rate }` : rate;
	};

	// The quality's tier, for the badge's colour: a lossy file, a lossless
	// one at CD quality, and one past it, more than 16 bits or 48 kHz.
	P.tier = ( t ) => {
		if ( ! t?.lossless ) {
			return 'lossy';
		}
		return t.bits > 16 || t.rate > 48000 ? 'hires' : 'lossless';
	};

	// What a screen reader hears a track called: its title, and its artist when it has one.
	P.named = ( t ) =>
		t.artist
			? fmt(
					/* translators: 1: track title, 2: artist. */ __(
						'%1$s by %2$s',
						'riff'
					),
					t.title,
					t.artist
				)
			: t.title;
	P.nowPlaying = ( t ) =>
		fmt(
			/* translators: %s: the track, as its title and artist. */ __(
				'Now playing %s',
				'riff'
			),
			P.named( t )
		);

	// ---- The extension surface. Every change of state is announced twice: through wp.hooks as a
	// riff.<name> action, and as a riff:<name> CustomEvent on #riff for pages without the WordPress
	// scripts, both with the same detail. Two filters let a plugin reshape what plays: riff.queue
	// (the tracks about to become the queue) and riff.track (each track as it is queued). The api
	// object is window.riff, handed to riff.ready; the Listen feature gets it with more, as internal.
	// Each hook is documented where it fires and each api member where it is defined; the hooks and
	// JavaScript references are generated from those docblocks. Stable within a major version.
	const hooks = window.wp?.hooks;
	P.emit = ( name, detail = {} ) => {
		hooks?.doAction( `riff.${ name }`, detail, P.api );
		root.dispatchEvent(
			new CustomEvent( `riff:${ name }`, { detail, bubbles: true } )
		);
	};
	P.filter = ( name, value, ...args ) =>
		hooks ? hooks.applyFilters( `riff.${ name }`, value, ...args ) : value;
	// Riff's own features hear of likes and playlists, add to the track menu, fill the badges and
	// hear the meter, here rather than through wp.hooks, so none of it is a promise to other
	// plugins yet (docs/player.md, "Areas"). The bar's controls are public: window.riff.control().
	P.own = {
		like: new Set(),
		playlist: new Set(),
		menu: new Set(),
		badges: new Set(),
		meter: new Set(),
		// A listener's own press of play, pause, skip, seek or speed, through a control, a key, the
		// lock screen, the seek line, a row, the turntable or a script, as against what the player
		// does on its own: told before the press acts. Listen Together stops following on one.
		press: new Set(),
		// Asked before the music starts (true) or stops (false): one that answers true makes the
		// change itself, as Listen Together does for a host someone follows, when it is due.
		hold: new Set(),
	};
	// Riff's own badge: the playing track's format and rate, through the same area as any other. It
	// describes the song's file, so it is left out while a song plays as its video version; a video
	// of its own, a video block's, is described by its own file.
	P.own.badges.add( ( list, t ) => {
		const line = P.mode === 'video' && t?.video ? '' : P.quality( t );
		return line ? [ ...list, { id: 'quality', text: line } ] : list;
	} );
	P.tell = ( name, detail ) =>
		P.own[ name ].forEach( ( fn ) => fn( detail ) );
	P.press = ( kind ) => P.tell( 'press', kind );
	P.holds = ( m, start ) => [ ...P.own.hold ].some( ( fn ) => fn( m, start ) );

	// A notice: shown in the player, and said through WordPress's live regions. The player is
	// hidden until something plays, and its toast is inert while Now Playing covers it on a phone.
	const toastEl = $( '.riff-toast' );
	let toastTimer = 0;
	P.toast = ( message ) => {
		speak( message );
		toastEl.textContent = message;
		toastEl.hidden = false;
		clearTimeout( toastTimer );
		toastTimer = setTimeout( () => ( toastEl.hidden = true ), 2500 );
	};

	// The optional features (the meter, gestures, the lock screen, Cast, sharing, the wake lock)
	// are modules loaded when first needed, each registered as a dynamic dependency of the player so
	// the import map names it. A module that cannot load leaves the player without that feature.
	const features = new Map();
	P.feature = ( name ) => {
		if ( ! features.has( name ) ) {
			features.set(
				name,
				import( `riff-player/${ name }` )
					.then( ( m ) => m.default( P ) )
					.catch( () => null )
			);
		}
		return features.get( name );
	};

	return P;
}
