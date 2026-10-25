/* Addresses. A view is the page itself (Home), the page with ?riff={id}, or a browse view:
 * ?riff_view=albums, artists, tracks or posts (with ?riff_page={n}, posts through page n),
 * ?riff_album={id}, ?riff_artist={id}, ?riff_search={words}. */

export function addresses( ctx ) {
	const { page, query, pageQuery, browseArgs } = ctx;

	const postOf = ( url ) => {
		const u = new URL( url, location.href );
		if ( u.origin !== page.origin || u.pathname !== page.pathname ) {
			return null;
		}
		// The same page, with only the app's own arguments allowed to differ: on a site without
		// pretty permalinks every post link is /?p=N on this very path and must stay a real link.
		const others = new URLSearchParams( u.search );
		others.delete( query );
		others.delete( pageQuery );
		browseArgs.forEach( ( key ) => others.delete( key ) );
		// A shared track's name, which riff.js reads on arrival.
		others.delete( 'riff_track' );
		others.sort();
		const own = new URLSearchParams( page.search );
		own.sort();
		if ( others.toString() !== own.toString() ) {
			return null;
		}
		const id = Number( u.searchParams.get( query ) );
		const pages = Number( u.searchParams.get( pageQuery ) );
		u.hash = '';
		return {
			id: Number.isInteger( id ) && id > 0 ? id : 0,
			pages: Number.isInteger( pages ) && pages > 1 ? pages : 1,
			browse: browseArgs.some( ( key ) => u.searchParams.get( key ) ),
			href: u.toString(),
		};
	};
	// Which view an address is, to tell a real change from Now Playing's own history entry.
	const keyOf = ( to ) => ( to.browse ? to.href : String( to.id ) );
	const addressOf = ( id, pages = 1 ) => {
		const u = new URL( page );
		if ( ! id && pages > 1 ) {
			u.searchParams.set( pageQuery, String( pages ) );
		}
		if ( id ) {
			u.searchParams.set( query, String( id ) );
		}
		return u.toString();
	};
	// Posts through page n, as the server renders it.
	const postsAddress = ( n = 1 ) => {
		const u = new URL( page );
		u.searchParams.set( browseArgs[ 0 ] || 'riff_view', 'posts' );
		if ( n > 1 ) {
			u.searchParams.set( pageQuery, String( n ) );
		}
		return u.toString();
	};
	const viewKey = browseArgs[ 0 ] || 'riff_view';
	const isLibrary = ( href ) =>
		new URL( href, location.href ).searchParams.get( viewKey ) ===
		'library';
	const listAddress = ( id ) => {
		const u = new URL( page );
		u.searchParams.set( browseArgs[ 6 ] || 'riff_playlist', String( id ) );
		return u.toString();
	};
	const libraryAddress = ( filter = '' ) => {
		const u = new URL( page );
		u.searchParams.set( viewKey, 'library' );
		if ( filter ) {
			u.searchParams.set( browseArgs[ 4 ] || 'riff_filter', filter );
		}
		return u.toString();
	};
	const browseHref = ( key, id ) => {
		const u = new URL( page );
		u.searchParams.set( key, String( id ) );
		return u.toString();
	};

	return {
		postOf,
		keyOf,
		addressOf,
		postsAddress,
		isLibrary,
		listAddress,
		libraryAddress,
		browseHref,
	};
}
