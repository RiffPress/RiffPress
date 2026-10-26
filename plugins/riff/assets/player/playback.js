/* Playing: loading a track into whichever element it plays through, play and pause, next and
 * previous, the song and video switch, the hand-off to audio while a phone has the page in the
 * background, one tab at a time, and dismissing the player. */
import { largest } from 'riff-player/helpers';

// Strings are WordPress translations of this module (wp_set_script_module_translations()).
// Core prints wp.i18n only when there are translations, so without it the strings are the
// English they are written in.
const __ = window.wp?.i18n?.__ || ( ( english ) => english );

export function playback( P ) {
	const { root, audio, video, api, emit } = P;

	function load( { play = true, at = 0 } = {} ) {
		const t = P.track();
		if ( ! t ) {
			return;
		}
		const m = P.el( t );
		const other = m === audio ? video : audio;
		other.pause();
		P.point( m, P.srcFor( t, m ) );
		// The video's captions, as <track> elements the browser draws when the Captions switch is on.
		for ( const old of video.querySelectorAll( 'track' ) ) {
			old.remove();
		}
		for ( const c of t.video?.captions || [] ) {
			const track = document.createElement( 'track' );
			track.kind = c.kind || 'captions';
			track.src = c.src;
			track.srclang = c.srclang || '';
			track.label = c.label || '';
			video.append( track );
		}
		if ( at || m.currentTime ) {
			m.currentTime = at;
		}
		video.poster = t.video?.poster || largest( t.art ) || '';
		root.hidden = false;
		document.documentElement.classList.add( 'has-riff' );
		if ( play ) {
			P.remember( t );
			// Said when the sound starts (media.js), so a track that never starts is not called playing.
			P.announcing = t.id;
		}
		// The lock screen, the filament and the wake lock are modules of their own, loaded when the
		// first track does and told about this one once they are.
		P.feature( 'session' );
		P.feature( 'filament' );
		P.feature( 'wake-lock' );
		P.metadata?.( t );
		// Before the new artwork is painted, so a new album's record can leave as the old one.
		P.groove( t );
		// After the groove, so a new album's record comes in before the music starts.
		if ( play ) {
			P.turn( m );
		}
		P.paint();
		P.renderQueue();
		P.tint( largest( t.art ) || t.video?.poster );
		P.save();
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
		emit( 'track', { track: t, index: P.pos, queue: api.queue() } );
	}

	function toggle() {
		const m = P.el();
		if ( ! P.track() ) {
			return;
		}
		// A short tick under the thumb on a touch screen (Vibration API), as the phone apps do.
		if ( window.matchMedia( '(hover: none)' ).matches ) {
			navigator.vibrate?.( 8 );
		}
		// Started and stopped as a turntable is where the record is seen (now-playing.js): pressed
		// again while it waits on the needle or winds down, it changes its mind.
		if ( P.held() ) {
			P.halt( m );
		} else if ( m.paused || P.stopping() ) {
			P.turn( m );
		} else {
			P.halt( m );
		}
	}

	function go( to, { play = true } = {} ) {
		if ( to < 0 || to >= P.order.length ) {
			return;
		}
		P.stopAll();
		P.pos = to;
		load( { play } );
	}

	function next( auto = false ) {
		if ( P.pos < P.order.length - 1 ) {
			go( P.pos + 1 );
		} else if ( P.repeat === 'all' || ! auto ) {
			go( 0, { play: P.repeat === 'all' || ! P.el().paused } );
		}
	}

	function prev() {
		const m = P.el();
		if ( m.currentTime > 3 || P.pos === 0 ) {
			m.currentTime = 0;
			return;
		}
		go( P.pos - 1 );
	}

	function dismiss() {
		P.close();
		P.stopAll();
		P.queue = [];
		P.order = [];
		P.pos = -1;
		root.hidden = true;
		// The record back in its sleeve, for the next album's turn.
		P.deck( false );
		document.documentElement.classList.remove( 'has-riff' );
		audio.removeAttribute( 'src' );
		video.removeAttribute( 'src' );
		audio.load();
		video.load();
		P.forget();
		P.paint();
		if ( 'mediaSession' in navigator ) {
			navigator.mediaSession.metadata = null;
		}
	}

	// ---- Song and video. The position carries across, and so does whether it was playing.
	function setMode( to ) {
		const t = P.track();
		if ( ! t || ! t.video || to === P.mode ) {
			return;
		}
		const from = P.el();
		const at = from.currentTime;
		const playing = ! from.paused;
		P.mode = to;
		from.pause();
		const m = P.el();
		P.point( m, P.srcFor( t, m ) );
		m.currentTime = at;
		if ( playing ) {
			m.play().catch( P.paint );
		}
		P.paint();
		P.save();
	}

	// A phone pauses video when the page goes to the background, and audio keeps going. So the
	// track moves to audio while hidden and back to video when the page returns.
	document.addEventListener( 'visibilitychange', () => {
		if ( ! document.hidden && ! P.el().paused ) {
			P.glide();
		}
		const t = P.track();
		if ( ! t || ! t.video ) {
			return;
		}
		if ( document.hidden && P.mode === 'video' && ! video.paused ) {
			P.backgrounded = true;
			setMode( 'song' );
		} else if ( ! document.hidden && P.backgrounded ) {
			P.backgrounded = false;
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
			! P.el().paused
		) {
			P.el().pause();
			P.toast( __( 'Playing in another tab', 'riff' ) );
		}
	} );
	const announce = () =>
		channel?.postMessage( { type: 'playing', from: tabId } );

	return { load, toggle, go, next, prev, dismiss, setMode, announce };
}
