/* Seeking. The range is the control; the line drawn under it is decoration. Volume, remembered on
 * this device, and the time under the pointer above the bar's seek line on a wide screen. */
import { read, write, time, fmt } from 'riff-player/helpers';

// Strings are WordPress translations of this module (wp_set_script_module_translations()).
// Core prints wp.i18n only when there are translations, so without it the strings are the
// English they are written in.
const __ = window.wp?.i18n?.__ || ( ( english ) => english );

export function seek( P ) {
	const { root, $, $$, audio, video } = P;

	for ( const input of $$( '[data-riff-seek]' ) ) {
		const commit = () => {
			const m = P.el();
			const duration = P.durationOf( m );
			if ( duration ) {
				m.currentTime = ( Number( input.value ) / 1000 ) * duration;
			}
		};
		input.addEventListener( 'pointerdown', () => {
			P.seeking = true;
			root.dataset.seeking = '';
			P.stopGlide();
		} );
		input.addEventListener( 'input', () => {
			P.setProgress( Number( input.value ) / 1000 );
			input.setAttribute(
				'aria-valuetext',
				P.seekText(
					( Number( input.value ) / 1000 ) * P.durationOf( P.el() ),
					P.durationOf( P.el() )
				)
			);
			if ( ! P.seeking ) {
				commit();
			}
		} );
		// An arrow moves five seconds, as a video player's do, where the range's own step is a
		// thousandth of the track: a fraction of a second.
		input.addEventListener( 'keydown', ( e ) => {
			const way = {
				ArrowRight: 1,
				ArrowUp: 1,
				ArrowLeft: -1,
				ArrowDown: -1,
			}[ e.key ];
			const m = P.el();
			const duration = P.durationOf( m );
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
			P.setProgress( to / duration );
			input.setAttribute( 'aria-valuetext', P.seekText( to, duration ) );
		} );
		input.addEventListener( 'change', () => {
			commit();
			P.seeking = false;
			root.removeAttribute( 'data-seeking' );
		} );
	}
	// A press that ends without a change (a tap on the place playing, a drag back to where it
	// began) or a touch the browser takes for a scroll lets go of the line too, and it glides on.
	for ( const ev of [ 'pointerup', 'pointercancel' ] ) {
		window.addEventListener( ev, () => {
			if ( P.seeking ) {
				P.seeking = false;
				root.removeAttribute( 'data-seeking' );
				P.glide();
			}
		} );
	}

	// ---- Volume, remembered on this device. Phones ignore it, so it only shows on desktop.
	const volume = $( '[data-riff-volume]' );
	const kept = read( localStorage, P.VOLUME );
	const stored = kept === null ? NaN : Number( kept );
	// Spoken as a percentage, and as Muted at nothing, rather than a bare number.
	const sayVolume = () =>
		volume.setAttribute(
			'aria-valuetext',
			Number( volume.value ) === 0
				? __( 'Muted', 'riff' )
				: fmt(
						/* translators: %s: the volume, from 1 to 100. */ __(
							'%s percent',
							'riff'
						),
						volume.value
					)
		);
	if ( Number.isFinite( stored ) && stored >= 0 && stored <= 1 ) {
		audio.volume = video.volume = stored;
		volume.value = String( Math.round( stored * 100 ) );
	}
	sayVolume();
	volume.addEventListener( 'input', () => {
		audio.volume = video.volume = Number( volume.value ) / 100;
		write( localStorage, P.VOLUME, String( audio.volume ) );
		sayVolume();
	} );

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
		const duration = P.durationOf( P.el() );
		tip.textContent = time( ratio * duration );
		tip.style.left = `${ ratio * 100 }%`;
		tip.hidden = ! duration;
	} );
	barSeek.addEventListener( 'pointerleave', () => ( tip.hidden = true ) );

	return {};
}
