/**
 * The demo's albums as a crate of records. The row of covers in "Try it in your browser" is the
 * page's own content and stays as it is for anyone without WebGL, with reduced motion, or saving
 * data. Where none of that applies, and once the row scrolls into view, this loads three.js and
 * stands the same covers in a crate: moving the pointer across it, or scrolling past, flips
 * through them the way you dig through a crate in a record shop, the ones in front tipping
 * towards you. It is decoration over the row: hidden from assistive technology, no focus, no keys.
 */
const shelf = document.querySelector( '#try .shelf' );
const reduced = window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
const saving = navigator.connection?.saveData;

if ( shelf && ! reduced && ! saving && 'IntersectionObserver' in window ) {
	// The crate is taller than the row: hold its height from the start, so nothing below moves
	// when it arrives; if it does not, the row comes back.
	const section = shelf.closest( 'section' );
	section.classList.add( 'crate-pending' );
	const giveUp = () => section.classList.remove( 'crate-pending' );
	const seen = new IntersectionObserver(
		( entries ) => {
			if ( entries.some( ( e ) => e.isIntersecting ) ) {
				seen.disconnect();
				import( './crate-scene.js' )
					.then( ( m ) => m.default( shelf ) )
					.then(
						() =>
							section.classList.contains( 'has-crate' ) ||
							giveUp()
					)
					.catch( giveUp );
			}
		},
		{ rootMargin: '800px' }
	);
	seen.observe( shelf );
}
