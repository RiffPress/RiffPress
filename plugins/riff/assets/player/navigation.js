/* Following a link without leaving the page (src/class-navigation.php). Core's link handler
 * sends the link to the Interactivity API's router, which swaps the template for the next page's
 * and leaves the player, outside it, playing. Each page it brings in has blocks of its own, made
 * rows here as they are on a page that loads; a track carries on, and the queue stays the one
 * playing until a row of the new page is pressed. Loaded only where the server turned it on. */

// What the server says of the page showing (Navigation::page()).
const served = () =>
	JSON.parse(
		document.querySelector( '[data-riff-page]' )?.dataset.riffPage || 'null'
	);

// A canonical or short address in the head, as the page showing has it.
function setLink( rel, href ) {
	let link = document.head.querySelector( `link[rel="${ rel }"]` );
	if ( ! href ) {
		link?.remove();
		return;
	}
	if ( ! link ) {
		link = document.createElement( 'link' );
		link.rel = rel;
		document.head.append( link );
	}
	link.href = href;
}

// The admin bar's link to edit the page, or its template, as the page showing has it. A page with
// none, such as an archive, has no link; a later page that has one puts it back at the bar's end.
function setBarNode( id, html ) {
	const node = document.getElementById( `wp-admin-bar-${ id }` );
	if ( ! html ) {
		node?.remove();
	} else if ( node ) {
		node.outerHTML = html;
	} else {
		document
			.getElementById( 'wp-admin-bar-root-default' )
			?.insertAdjacentHTML( 'beforeend', html );
	}
}

export default async function navigation( P ) {
	const [ { watch }, { state } ] = await Promise.all( [
		import( '@wordpress/interactivity' ),
		import( '@wordpress/interactivity-router' ),
	] );
	let shown = state.url;
	let page = served();
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
			const next = served();
			if ( next ) {
				// Only what changed between the two pages: a class a script took off or put on, such
				// as core's customize-support, stays as the script left it.
				const classes = ( { body } ) =>
					body.split( /\s+/ ).filter( Boolean );
				const was = page ? classes( page ) : [];
				const is = classes( next );
				document.body.classList.remove(
					...was.filter( ( name ) => ! is.includes( name ) )
				);
				document.body.classList.add(
					...is.filter( ( name ) => ! was.includes( name ) )
				);
				setLink( 'canonical', next.canonical );
				setLink( 'shortlink', next.shortlink );
				setBarNode( 'edit', next.bar.edit );
				setBarNode( 'site-editor', next.bar[ 'site-editor' ] );
				page = next;
			}
			// Signing in from the track menu comes back to the page showing.
			if ( P.data.signIn ) {
				const login = new URL( P.data.signIn );
				login.searchParams.set( 'redirect_to', location.href );
				P.data.signIn = login.href;
			}
			P.mount();
			P.reveal();
		} );
	} );
}
