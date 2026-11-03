/* The timing Riff Lyrics, Riff Chords and Riff Sing share: a time read as LRC, ChordPro and WebVTT
 * write it, and the song followed as the player plays it, so a line, a chord and a syllable are
 * marked at the same moment and one can take its timing from another. Each format's own grammar
 * stays with the plugin that reads it.
 *
 * The extensions' own, not Riff's API. This file is Riff Lyrics'; Riff Chords and Riff Sing each
 * carry a copy, which .github/scripts/timing.test.js keeps the same. Each plugin loads its own copy
 * just before its scripts, and they read window.riffTiming as they load, so a copy another plugin
 * loads later doesn't change theirs. Node's tests require it and read the same object from
 * globalThis. */
( ( scope ) => {
	// A time in brackets, as LRC writes it and ChordPro borrows: mm:ss or mm:ss.xx.
	const STAMP = /^\d{1,3}:\d{1,2}(?:\.\d{1,3})?$/;
	// How early a line or chord is marked: the player says where it is a few times a second, so a
	// time is taken as come a moment before it.
	const LEAD = 0.05;
	// The listener scrolling the view by hand holds the following off for this long.
	const HANDS = 4000;

	/**
	 * A time in seconds: [hh:]mm:ss with any fraction, as LRC, ChordPro and WebVTT write it.
	 *
	 * @param {string} time Such as 01:05.32 or 00:01:05.320.
	 * @return {number} Seconds.
	 */
	const seconds = ( time ) =>
		String( time )
			.split( ':' )
			.reduce( ( total, part ) => total * 60 + Number( part ), 0 );

	/**
	 * A time in brackets as seconds, or null when it is not one, such as a chord's name.
	 *
	 * @param {string} text What is inside the brackets, such as 01:05.32.
	 * @return {number|null} Seconds, or null.
	 */
	const stamp = ( text ) => ( STAMP.test( text ) ? seconds( text ) : null );

	/**
	 * Whether a time has come.
	 *
	 * @param {number} when The time of a line, chord or word.
	 * @param {number} time Where the song is.
	 * @return {boolean} True once it has.
	 */
	const due = ( when, time ) => when <= time + LEAD;

	/**
	 * The last of some things in time order whose time has come.
	 *
	 * @param {Array<{time: number}>} items In time order.
	 * @param {number}                time  Where the song is.
	 * @return {number} Its index, or -1 before the first.
	 */
	function at( items, time ) {
		let i = -1;
		while ( i + 1 < items.length && due( items[ i + 1 ].time, time ) ) {
			i++;
		}
		return i;
	}

	// Until the player starts, window.riff is the #riff element, by its id.
	const player = () => ( typeof window.riff?.time === 'function' ? window.riff : null );

	/**
	 * Where the song is: window.riff.time(), or 0 until the player starts.
	 *
	 * @return {number} Seconds.
	 */
	const now = () => player()?.time() ?? 0;

	/**
	 * Calls back each time the player says where the song is (its riff:time event).
	 *
	 * @param {(time: number, detail: Object) => void} run Given the time in seconds, then the event's detail.
	 */
	function listen( run ) {
		document.addEventListener( 'riff:time', ( e ) => run( Number( e.detail?.time ) || 0, e.detail || {} ) );
	}

	/**
	 * Watches for the listener scrolling a view by hand, with a wheel or a finger, which the
	 * following gives way to for a few seconds.
	 *
	 * @param {(target: EventTarget) => boolean} on Given what was scrolled, whether it is the view.
	 * @return {() => boolean} Whether the listener has just scrolled it.
	 */
	function scrolling( on ) {
		let last = 0;
		for ( const ev of [ 'wheel', 'touchmove' ] ) {
			document.addEventListener(
				ev,
				( e ) => {
					if ( on( e.target ) ) {
						last = Date.now();
					}
				},
				{ passive: true }
			);
		}
		return () => Date.now() - last <= HANDS;
	}

	/**
	 * Scrolls a line to the middle of the box it scrolls in, smoothly unless motion is reduced.
	 *
	 * @param {Element}      el    The line.
	 * @param {Element|null} [box] The box; by default, the nearest one around the line that scrolls.
	 */
	function centre( el, box = scroller( el ) ) {
		if ( ! box || box.scrollHeight <= box.clientHeight ) {
			return;
		}
		const line = el.getBoundingClientRect();
		const view = box.getBoundingClientRect();
		box.scrollTo( {
			top: box.scrollTop + ( line.top - view.top ) - ( view.height - line.height ) / 2,
			behavior: matchMedia( '(prefers-reduced-motion: reduce)' ).matches ? 'auto' : 'smooth',
		} );
	}

	function scroller( el ) {
		let box = el.parentElement;
		while (
			box &&
			! (
				box.scrollHeight > box.clientHeight &&
				/auto|scroll/.test( getComputedStyle( box ).overflowY )
			)
		) {
			box = box.parentElement;
		}
		return box;
	}

	scope.riffTiming = { seconds, stamp, due, at, now, listen, scrolling, centre };
} )( globalThis );
