/* The two media elements. Which one a track plays through, where its file comes from and whether
 * that origin shares it over CORS, and the events both report through the same handlers. While
 * something plays the seek line glides on the compositor: one linear animation per moving layer
 * (the played part, the wire, its heart, the bloom and the knob), from where the time is to the end
 * of the track, at the playback rate. The page's own work cannot make it stutter and nothing is
 * written each frame; it is aimed again only when the time jumps: a seek, a pause or a stall, a new
 * rate or track, or drift past 150 ms. --riff-p is still written on timeupdate, for the times, the
 * input, and where the line rests when the animations stop. */
import { speak, fmt } from 'riff-player/helpers';

// Strings are WordPress translations of this module (wp_set_script_module_translations()).
// Core prints wp.i18n only when there are translations, so without it the strings are the
// English they are written in.
const __ = window.wp?.i18n?.__ || ( ( english ) => english );

export function media( P ) {
	const { root, audio, video, emit } = P;

	const isVideo = ( t = P.track() ) =>
		!! t && ( t.type === 'video' || ( P.mode === 'video' && !! t.video ) );
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
	// The analyser, when the filament has made one, is wired to <audio>: see foreign(). The track
	// playing stays on the element that holds its file, whatever an origin answers about CORS after
	// it was loaded: otherwise a yes arriving mid-track would send Play and Pause to the other one.
	const el = ( t = P.track() ) => {
		if ( isVideo( t ) ) {
			return video;
		}
		if ( t && t === P.track() ) {
			const holds = ( m ) => m.getAttribute( 'src' ) === t.src;
			if ( holds( video ) && ! holds( audio ) ) {
				return video;
			}
			if ( holds( audio ) && ! holds( video ) ) {
				return audio;
			}
		}
		return P.analyser && t && foreign( t ) ? video : audio;
	};
	const srcFor = ( t, m ) =>
		m === video && isVideo( t ) && t.video ? t.video.src : t.src;

	// How long the playing track is: the element's own reading, or the length its tags gave.
	const durationOf = ( m ) =>
		( Number.isFinite( m.duration ) && m.duration ) ||
		P.track()?.duration ||
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
			P.seeking ||
			P.reduce() ||
			P.away() ||
			typeof root.animate !== 'function'
		) {
			return;
		}
		const from = Math.min( m.currentTime / duration, 1 );
		P.setProgress( from );
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
		for ( const seeker of P.seekers ) {
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
				run( seeker.querySelector( '.riff-bloom' ), along, {
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
		P.progress();
	}
	for ( const m of [ audio, video ] ) {
		const live = () => m === el();
		m.addEventListener( 'play', () => {
			if ( live() ) {
				P.announce();
				P.paint();
				/**
				 * Fires when the track starts or resumes playing.
				 *
				 * @since 4.0.0
				 *
				 * @param {Object} detail       What changed.
				 * @param {Object} detail.track The track.
				 * @param {Object} api          `window.riff`.
				 */
				emit( 'play', { track: P.track() } );
			}
		} );
		m.addEventListener( 'pause', () => {
			if ( live() ) {
				settle();
				P.paint();
				/**
				 * Fires when the track pauses.
				 *
				 * @since 4.0.0
				 *
				 * @param {Object} detail       What changed.
				 * @param {Object} detail.track The track.
				 * @param {Object} api          `window.riff`.
				 */
				emit( 'pause', { track: P.track() } );
			}
		} );
		m.addEventListener( 'playing', () => {
			if ( live() ) {
				const t = P.track();
				if ( t && P.announcing === t.id ) {
					P.announcing = null;
					speak( P.nowPlaying( t ) );
				}
				P.failures = 0;
				P.failed.delete( t?.id );
				root.removeAttribute( 'data-waiting' );
				P.paint();
				glide();
			}
		} );
		m.addEventListener( 'waiting', () => {
			if ( live() ) {
				root.dataset.waiting = '';
				settle();
			}
		} );
		m.addEventListener( 'loadedmetadata', () => live() && P.progress() );
		m.addEventListener( 'seeking', () => live() && settle() );
		// Not at every step of a turntable's start or stop: once, at the speed it settles on.
		for ( const ev of [ 'seeked', 'ratechange', 'durationchange' ] ) {
			m.addEventListener( ev, () => live() && ! P.ramping && glide() );
		}
		// Where the track is, for a script that follows it: synced lyrics, a visualiser.
		const sayTime = () => {
			/**
			 * Fires as the track plays, a few times a second, and again after a seek.
			 *
			 * @since 4.32.0
			 *
			 * @param {Object} detail          Where the track is.
			 * @param {Object} detail.track    The track.
			 * @param {number} detail.time     Seconds from its start.
			 * @param {number} detail.duration Its length in seconds, or 0 until known.
			 * @param {Object} api             `window.riff`.
			 */
			emit( 'time', {
				track: P.track(),
				time: m.currentTime,
				duration: Number.isFinite( m.duration ) ? m.duration : 0,
			} );
		};
		m.addEventListener( 'seeked', () => live() && sayTime() );
		m.addEventListener( 'timeupdate', () => {
			if ( ! live() ) {
				return;
			}
			P.progress();
			keepAimed();
			P.position?.();
			sayTime();
			if ( m.currentTime > 5 && Math.floor( m.currentTime ) % 5 === 0 ) {
				P.save();
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
			emit( 'ended', { track: P.track() } );
			if ( P.repeat === 'one' ) {
				m.currentTime = 0;
				m.play().catch( P.paint );
			} else {
				P.next( true );
			}
		} );
		m.addEventListener( 'error', () => {
			if ( ! live() || ! m.getAttribute( 'src' ) ) {
				return;
			}
			// Said, and marked in the list, then the next track is tried. Three in a row and the
			// rest are probably missing too, so the player stops rather than reading out the album.
			const t = P.track();
			P.announcing = null;
			P.failed.add( t?.id );
			P.failures++;
			root.dataset.error = '';
			P.paint();
			if ( P.failures >= 3 ) {
				P.failures = 0;
				speak( __( 'These tracks couldn’t be played.', 'riff' ) );
				setTimeout( () => root.removeAttribute( 'data-error' ), 1500 );
				return;
			}
			speak(
				fmt(
					/* translators: %s: track title. */ __(
						'Couldn’t play %s.',
						'riff'
					),
					t?.title
				)
			);
			setTimeout( () => {
				root.removeAttribute( 'data-error' );
				if ( P.pos < P.order.length - 1 ) {
					P.next( true );
				}
			}, 1500 );
		} );
	}

	// The next track starts downloading halfway through this one, so skipping never waits.
	function warmNext() {
		const t = P.queue[ P.order[ P.pos + 1 ] ];
		if ( ! t || isVideo( t ) || P.preloader?.dataset.id === t.id ) {
			return;
		}
		P.preloader = document.createElement( 'audio' );
		P.preloader.preload = 'auto';
		P.preloader.dataset.id = t.id;
		point( P.preloader, t.src );
	}

	// Back from the back-forward cache: the elements kept their state, the frame loop did not.
	window.addEventListener( 'pageshow', ( e ) => {
		if ( e.persisted ) {
			P.progress();
			glide();
		}
	} );

	return {
		isVideo,
		askCors,
		foreign,
		point,
		el,
		srcFor,
		durationOf,
		stopGlide,
		glide,
		settle,
	};
}
