/* Keyboard: Space or K plays and pauses, J and L skip ten seconds, Shift+N and Shift+P change
 * track. Nothing fires while typing, and Space leaves buttons and links alone. Escape closes Now
 * Playing from anywhere, a field included. The single-key shortcuts act only for a signed-in
 * listener who has not turned them off on their profile, and a site can turn them off through the
 * riff.shortcuts filter, which is what WCAG 2.1.4 asks of them; the Shift ones act for everyone. */

export function keyboard( P ) {
	const { np, filter } = P;

	document.addEventListener( 'keydown', ( e ) => {
		if (
			! P.track() ||
			e.defaultPrevented ||
			e.ctrlKey ||
			e.metaKey ||
			e.altKey
		) {
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
			np.getAttribute( 'aria-modal' ) === 'true'
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
		const m = P.el();
		const key = e.key.toLowerCase();
		if ( ! P.shortcutsOn && ! e.shiftKey ) {
			return;
		}
		if (
			( e.key === ' ' && ! target.closest?.( 'button, a, summary' ) ) ||
			( key === 'k' && ! e.shiftKey )
		) {
			P.toggle();
		} else if ( key === 'j' && ! e.shiftKey ) {
			m.currentTime = Math.max( 0, m.currentTime - 10 );
		} else if ( key === 'l' && ! e.shiftKey ) {
			m.currentTime = Math.min(
				m.duration || Infinity,
				m.currentTime + 10
			);
		} else if ( key === 'n' && e.shiftKey ) {
			P.next();
		} else if ( key === 'p' && e.shiftKey ) {
			P.prev();
		} else {
			return;
		}
		e.preventDefault();
	} );

	return {};
}
