/* Keyboard: Space or K plays and pauses, J and L skip ten seconds, Shift+N and Shift+P change
 * track. Nothing fires while typing, and Space leaves buttons and links alone. Escape closes Now
 * Playing from anywhere, a field included. The single-key shortcuts act only for a signed-in
 * listener who has not turned them off on their profile, and a site can turn them off through the
 * riff.shortcuts filter, which is what WCAG 2.1.4 asks of them; the Shift ones act for everyone.
 * A plugin's keys (riff_register_shortcut(), window.riff.shortcut()) are single-key shortcuts too. */

export function keyboard( P ) {
	const { np, filter } = P;
	// A plugin's keys, registered on the server (riff_register_shortcut()) so the profile lists
	// them, by key; window.riff.shortcut() gives each what it does, by id.
	const keys = new Map(
		Object.entries( P.data.keys || {} ).map( ( [ id, key ] ) => [
			String( key ),
			id,
		] )
	);
	const runs = new Map();

	function shortcut( id, run ) {
		id = String( id );
		if ( typeof run !== 'function' ) {
			return () => {};
		}
		runs.set( id, run );
		return () => {
			if ( runs.get( id ) === run ) {
				runs.delete( id );
			}
		};
	}

	// The plugin's shortcut a key press is for: a letter without Shift or any other key held,
	// whatever its case, or another character as it was typed.
	function pluginKey( e ) {
		const key = e.key.toLowerCase();
		if (
			[ ...key ].length !== 1 ||
			( key !== e.key.toUpperCase() &&
				( e.shiftKey ||
					e.altKey ||
					e.ctrlKey ||
					e.getModifierState?.( 'AltGraph' ) ) )
		) {
			return null;
		}
		return runs.get( keys.get( key ) ) || null;
	}

	document.addEventListener( 'keydown', ( e ) => {
		// AltGr types the marks on many keyboards, [ and ] as AltGr+8 and 9 on a German one, and
		// Windows reports it as Ctrl and Alt. Where the browser says AltGr made the character, the
		// press can only be a plugin's mark. Alt and Option alone stay the browser's and the
		// system's: which character a key types without them is the layout's, and a page can't
		// know it.
		const typed =
			! e.metaKey &&
			[ ...e.key ].length === 1 &&
			!! e.getModifierState?.( 'AltGraph' );
		const chord = e.ctrlKey || e.metaKey || e.altKey;
		if ( ! P.track() || e.defaultPrevented || ( chord && ! typed ) ) {
			return;
		}
		if ( e.key === 'Escape' && ! np.hidden ) {
			P.close();
			e.preventDefault();
			return;
		}
		// Where Now Playing is modal (it covers the bar), Tab stays inside it: without this the
		// last control hands focus to the browser's own chrome before coming round.
		if (
			e.key === 'Tab' &&
			! np.hidden &&
			np.getAttribute( 'aria-modal' ) === 'true' &&
			! P.side?.contains( document.activeElement )
		) {
			const inside = [
				...np.querySelectorAll(
					'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
				),
			].filter(
				( node ) =>
					! node.disabled &&
					node.checkVisibility?.() !== false &&
					node.offsetParent !== null
			);
			if ( inside.length ) {
				const first = inside[ 0 ];
				const last = inside[ inside.length - 1 ];
				if ( e.shiftKey && document.activeElement === first ) {
					last.focus();
					e.preventDefault();
				} else if ( ! e.shiftKey && document.activeElement === last ) {
					first.focus();
					e.preventDefault();
				}
			}
		}
		const target = e.target;
		if (
			target.closest?.(
				'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
			) ||
			/**
			 * Filters whether the single-key shortcuts (Space, K, J, L and plugins' keys) act on a key press.
			 *
			 * Return `false` to turn them off, which WCAG 2.1.4 asks to be possible. It turns off
			 * the keys plugins register with `riff_register_shortcut()` too.
			 *
			 * @since 4.0.1
			 * @since 5.9.0 Plugins' keys too.
			 *
			 * @param {boolean}       enabled Whether the shortcuts act. Default true.
			 * @param {KeyboardEvent} event   The key press.
			 */
			! filter( 'shortcuts', true, e )
		) {
			return;
		}
		const m = P.el();
		const key = e.key.toLowerCase();
		if ( ! P.shortcutsOn && ! e.shiftKey ) {
			return;
		}
		// A plugin's key is a single-key shortcut, Shift or not, so it is off where Riff's are.
		const run = P.shortcutsOn && pluginKey( e );
		if ( chord && ! run ) {
			return;
		}
		if ( run ) {
			run( P.track(), e );
		} else if (
			( e.key === ' ' && ! target.closest?.( 'button, a, summary' ) ) ||
			( key === 'k' && ! e.shiftKey )
		) {
			P.press( 'toggle' );
			P.toggle();
		} else if ( key === 'j' && ! e.shiftKey ) {
			P.press( 'seek' );
			m.currentTime = Math.max( 0, m.currentTime - 10 );
		} else if ( key === 'l' && ! e.shiftKey ) {
			P.press( 'seek' );
			m.currentTime = Math.min(
				m.duration || Infinity,
				m.currentTime + 10
			);
		} else if ( key === 'n' && e.shiftKey ) {
			P.press( 'next' );
			P.next();
		} else if ( key === 'p' && e.shiftKey ) {
			P.press( 'prev' );
			P.prev();
		} else {
			return;
		}
		e.preventDefault();
	} );

	return { shortcut };
}
