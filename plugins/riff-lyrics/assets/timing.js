/* The timing Riff Lyrics, Riff Chords and Riff Sing share: a time read as LRC, ChordPro and WebVTT
 * write it, timed lyrics read as Riff Lyrics shows them, and the song followed as the player plays
 * it. A lyric line and a chord are marked by the same rule, a moment before their time; Riff Sing's
 * lane reads where the song is and hears riff:time through it, and marks its syllables at their own
 * time, or, where the track has timed lyrics too, the words as Riff Lyrics times them. LRC and
 * WebVTT are read here, as two of the plugins read them; ChordPro's and UltraStar's grammar stay
 * with the plugin that reads each.
 *
 * The extensions' own, not Riff's API. This file is Riff Lyrics'; Riff Chords and Riff Sing each
 * carry a copy, which .github/scripts/timing.test.js keeps the same. Each plugin loads its own copy
 * just before its scripts, and they read window.riffTiming as they load, so a copy another plugin
 * loads later doesn't change theirs. Node's tests run it with a window of their own as globalThis,
 * and read riffTiming from that. */
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

	// A line's timestamps, [mm:ss.xx] or [mm:ss], one or more at its start, as LRC writes them;
	// LRC's tag lines ([ar:...], [ti:...]) are not lyrics.
	const STAMPS = /^\s*((?:\[\d{1,3}:\d{1,2}(?:\.\d{1,3})?\]\s*)+)(.*)$/;
	const EACH = /\[(\d{1,3}:\d{1,2}(?:\.\d{1,3})?)\]/g;
	const TAG = /^\s*\[[a-z]+:[^\]]*\]\s*$/i;
	// [offset:+250]: milliseconds the whole file is early by, so every line is shown that much sooner.
	const OFFSET = /^\s*\[offset:\s*([+-]?\d+)\s*\]\s*$/im;
	// Enhanced LRC's word times inside a line: <mm:ss.xx>word.
	const WORD = /<(\d{1,3}:\d{1,2}(?:\.\d{1,3})?)>/g;
	// A WebVTT cue's timing line: [hh:]mm:ss.ttt --> [hh:]mm:ss.ttt, then any settings.
	const CUE = /^\s*((?:\d+:)?\d{1,2}:\d{2}\.\d{3})\s+-->\s+((?:\d+:)?\d{1,2}:\d{2}\.\d{3})/;

	// A line's words with their times, when Enhanced LRC gives them, and the line's text without them.
	function words( text, offset ) {
		const marks = [ ...text.matchAll( WORD ) ];
		if ( ! marks.length ) {
			return { text, words: null };
		}
		const out = [];
		marks.forEach( ( m, i ) => {
			const end = marks[ i + 1 ]?.index ?? text.length;
			const word = text.slice( m.index + m[ 0 ].length, end );
			if ( word.trim() ) {
				out.push( { time: seconds( m[ 1 ] ) - offset, text: word } );
			}
		} );
		const lead = text.slice( 0, marks[ 0 ].index );
		if ( lead.trim() ) {
			out.unshift( { time: null, text: lead } );
		}
		return { text: text.replace( WORD, '' ).replace( /\s+/g, ' ' ).trim(), words: out };
	}

	// WebVTT: each cue is a line, at the time it starts; a pause of two seconds or more is a gap.
	function vtt( text ) {
		const out = [];
		const blocks = text.replace( /\r/g, '' ).split( /\n\s*\n/ );
		let end = 0;
		for ( const block of blocks ) {
			const rows = block.split( '\n' );
			const i = rows.findIndex( ( row ) => CUE.test( row ) );
			if ( i < 0 ) {
				continue;
			}
			const [ , from, to ] = rows[ i ].match( CUE );
			const said = rows
				.slice( i + 1 )
				.join( ' ' )
				.replace( /[<>]/g, '' )
				.trim();
			const time = seconds( from );
			out.push( { time, text: said, gap: out.length > 0 && time - end >= 2, words: null } );
			end = seconds( to );
		}
		return out.length ? out.map( ( line, n ) => ( { ...line, i: n } ) ) : null;
	}

	/**
	 * Timed lyrics, as Riff Lyrics shows them: LRC, with its [offset:] tag and Enhanced LRC's
	 * <mm:ss.xx> word times, or WebVTT. A blank line is a gap before the next; a line without a time
	 * among timed ones is shown with the one before it; a chorus line carrying every time it is sung
	 * is a line for each, in the order they are heard.
	 *
	 * @param {string} text The lyrics, as the track's Lyrics field has them.
	 * @return {Array<{time: number, text: string, words: Array<{time: number|null, text: string}>|null, gap: boolean, i: number}>|null}
	 *         The lines in time order, or null when none has a time.
	 */
	function lyrics( text ) {
		// Trimmed, as a file's own tag can start with a blank line before WEBVTT.
		text = String( text ?? '' ).trim();
		if ( /^\uFEFF?WEBVTT/.test( text ) ) {
			return vtt( text );
		}
		const out = [];
		let synced = false;
		let gap = false;
		let last = 0;
		const offset = Number( text.match( OFFSET )?.[ 1 ] || 0 ) / 1000;
		for ( const raw of text.split( /\r?\n/ ) ) {
			if ( TAG.test( raw ) ) {
				continue;
			}
			if ( ! raw.trim() ) {
				gap = out.length > 0;
				continue;
			}
			const m = raw.match( STAMPS );
			if ( ! m ) {
				out.push( { time: last, ...words( raw.trim(), offset ), gap } );
			} else {
				synced = true;
				for ( const s of m[ 1 ].matchAll( EACH ) ) {
					last = Math.max( 0, seconds( s[ 1 ] ) - offset );
					out.push( { time: last, ...words( m[ 2 ].trim(), offset ), gap } );
				}
			}
			gap = false;
		}
		if ( ! synced ) {
			return null;
		}
		return out.map( ( line, i ) => ( { ...line, i } ) ).sort( ( a, b ) => a.time - b.time || a.i - b.i );
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

	scope.riffTiming = { seconds, stamp, due, at, lyrics, now, listen, scrolling, centre };
} )( globalThis );
