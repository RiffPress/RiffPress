/* AirPlay in Safari, Cast in Chrome. The buttons, in the bar on a phone and in Now Playing
 * everywhere, show only while a device is in reach. Loaded on demand at start, off the player's own
 * path, since a device can be in reach before anything plays. */

export default function cast( P ) {
	const { $$, audio } = P;
	const buttons = $$( '[data-riff-action="cast"]' );
	const available = ( yes ) => {
		for ( const b of buttons ) {
			b.hidden = ! yes;
		}
	};
	if ( window.WebKitPlaybackTargetAvailabilityEvent ) {
		audio.addEventListener(
			'webkitplaybacktargetavailabilitychanged',
			( e ) => available( e.availability === 'available' )
		);
	} else if ( audio.remote?.watchAvailability ) {
		audio.remote.watchAvailability( available ).catch( () => {} );
	}
	function pick() {
		const m = P.el();
		if ( m.webkitShowPlaybackTargetPicker ) {
			m.webkitShowPlaybackTargetPicker();
		} else if ( m.remote?.prompt ) {
			m.remote.prompt().catch( () => {} );
		}
	}
	P.cast = pick;
	return { cast: pick };
}
