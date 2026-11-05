/* Following a link without leaving the page (src/class-navigation.php, a spike). Core's link handler
 * sends the link to the Interactivity API's router, which swaps the template for the next page's
 * and leaves the player, outside it, playing. Each page it brings in has blocks of its own, made
 * rows here as they are on a page that loads; a track carries on, and the queue stays the one
 * playing until a row of the new page is pressed. Loaded only where the server turned it on. */

export default async function navigation( P ) {
	const [ { watch }, { state } ] = await Promise.all( [
		import( '@wordpress/interactivity' ),
		import( '@wordpress/interactivity-router' ),
	] );
	let shown = state.url;
	// Back and forward are the browser's to scroll; a link opens the next page at its top, as a
	// page that loads does, which the router leaves where the link was.
	let traversing = false;
	window.addEventListener( 'popstate', () => ( traversing = true ), true );
	watch( () => {
		const url = state.url;
		if ( url === shown ) {
			return;
		}
		shown = url;
		const top = ! traversing && ! new URL( url, location.href ).hash;
		traversing = false;
		// The router renders the new region in the same batch that sets the address, so the new
		// blocks are in the document by the next frame.
		requestAnimationFrame( () => {
			if ( top ) {
				window.scrollTo( 0, 0 );
			}
			P.mount();
			P.reveal();
		} );
	} );
}
