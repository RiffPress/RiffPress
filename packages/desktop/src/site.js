/**
 * The site the app connects to: what may be typed, what may load in the window, and how a site's
 * address becomes its standalone Listen page.
 *
 * Nothing here is new API on the plugin's side. The Listen page's app/ address (class-standalone.php)
 * is found with what a browser could already see: the standalone document, the web app manifest it
 * links, and core's REST routes. Kept free of Electron so node --test can run it.
 */

/**
 * fetch(), or Electron's net.fetch: an address in, a Response out.
 *
 * @typedef {(url: string) => Promise<Response>} Fetch
 */

/**
 * Whether a host is this machine: the one place plain http is allowed, for a local WordPress.
 *
 * @param {string} hostname URL hostname.
 * @return {boolean} Whether it is a loopback host.
 */
function isLoopback( hostname ) {
	return (
		hostname === 'localhost' ||
		hostname.endsWith( '.localhost' ) ||
		hostname === '[::1]' ||
		/^127(\.\d{1,3}){3}$/.test( hostname )
	);
}

/**
 * Whether an address may be the site: http(s), https unless it is this machine, no credentials.
 *
 * @param {URL} url Address.
 * @return {boolean} Whether it is allowed.
 */
function isAllowed( url ) {
	if ( url.username || url.password ) {
		return false;
	}
	if ( url.protocol === 'https:' ) {
		return true;
	}
	return url.protocol === 'http:' && isLoopback( url.hostname );
}

/**
 * What the person typed, as an address: https:// when there is no scheme (http:// for this
 * machine), and no fragment.
 *
 * @param {string} input Typed address.
 * @return {URL} The address.
 * @throws {Error} With code 'invalid' or 'insecure'.
 */
function normalize( input ) {
	let text = String( input || '' ).trim();
	if ( ! text ) {
		throw codeError( 'invalid' );
	}
	if ( ! /^[a-z][a-z0-9+.-]*:\/\//i.test( text ) ) {
		const host = text.split( /[/:?#]/ )[ 0 ];
		text = ( isLoopback( host ) ? 'http://' : 'https://' ) + text;
	}
	let url;
	try {
		url = new URL( text );
	} catch {
		throw codeError( 'invalid' );
	}
	if ( ! /^https?:$/.test( url.protocol ) || ! url.hostname ) {
		throw codeError( 'invalid' );
	}
	if ( ! isAllowed( url ) ) {
		throw codeError( 'insecure' );
	}
	url.hash = '';
	return url;
}

/**
 * Whether an address loads inside the window: only the connected site's own origin does. Anything
 * else opens in the default browser.
 *
 * @param {string} address Address being opened.
 * @param {string} site    The connected site's standalone address.
 * @return {boolean} Whether it stays in the window.
 */
function inWindow( address, site ) {
	try {
		return new URL( address ).origin === new URL( site ).origin;
	} catch {
		return false;
	}
}

/**
 * Whether an address may be handed to the default browser: web and mail links only, never a
 * file:, a custom scheme, or anything else the OS might run.
 *
 * @param {string} address Address.
 * @return {boolean} Whether it may open outside.
 */
function isExternal( address ) {
	try {
		return [ 'https:', 'http:', 'mailto:' ].includes(
			new URL( address ).protocol
		);
	} catch {
		return false;
	}
}

/**
 * Addresses that would be a Listen page's standalone document, for an address that may be one.
 *
 * Standalone::url() adds app/ to the page's address with pretty permalinks and riff_app=1 without
 * them. An address already there is tried as it is.
 *
 * @param {URL} url Address.
 * @return {string[]} Addresses to try, in order.
 */
function candidates( url ) {
	if (
		/\/app\/?$/.test( url.pathname ) ||
		url.searchParams.has( 'riff_app' )
	) {
		return [ url.href ];
	}
	const pretty = new URL( url.href );
	pretty.search = '';
	pretty.pathname = pretty.pathname.replace( /\/?$/, '/' ) + 'app/';
	const plain = new URL( url.href );
	plain.searchParams.set( 'riff_app', '1' );
	return [ pretty.href, plain.href ];
}

/**
 * The standalone address a response shows, when it is Riff's standalone document: the manifest's
 * start_url, which is the address with any view parameters stripped.
 *
 * The manifest also says where the site really lives. Electron's net.fetch follows redirects but
 * leaves Response.url empty (and hangs with redirect: 'manual'), so a site that moves example.com
 * to www.example.com is known by the absolute addresses WordPress prints, not by the redirect.
 *
 * @param {Fetch}  fetch   fetch().
 * @param {string} address Address to try.
 * @return {Promise<string|null>} The standalone address, or null.
 */
async function standalone( fetch, address ) {
	const response = await fetch( address ).catch( () => null );
	if ( ! response || ! response.ok ) {
		return null;
	}
	const base = new URL( response.url || address );
	const html = await response.text();
	if ( ! /<body[^>]*class="[^"]*\briff-standalone\b/.test( html ) ) {
		return null;
	}
	const link = html.match(
		/<link[^>]+rel="manifest"[^>]+href="([^"]+)"|<link[^>]+href="([^"]+)"[^>]+rel="manifest"/
	);
	if ( link ) {
		const href = new URL( decode( link[ 1 ] || link[ 2 ] ), base );
		const manifest = await fetch( href.href )
			.then( ( r ) => ( r.ok ? r.json() : null ) )
			.catch( () => null );
		if ( manifest && manifest.start_url ) {
			const start = new URL( manifest.start_url, href );
			if ( ! isAllowed( start ) ) {
				return null;
			}
			// A start_url on an origin the page didn't link its manifest from is not believed.
			if ( start.origin === href.origin ) {
				return start.href;
			}
		}
	}
	return isAllowed( base ) ? base.href : null;
}

/**
 * The REST API's root, as the site announces it in a Link header or a <link> in its head. A site
 * without pretty permalinks announces ?rest_route=/.
 *
 * @param {Response} response The site's response.
 * @param {string}   html     Its body.
 * @param {string}   address  The address asked for, when the response doesn't carry its own.
 * @return {string|null} The root, or null.
 */
function restRoot( response, html, address ) {
	const header = response.headers.get( 'link' ) || '';
	const fromHeader = header.match(
		/<([^>]+)>;\s*rel="https:\/\/api\.w\.org\/"/
	);
	const fromHtml = html.match(
		/<link[^>]+rel=['"]https:\/\/api\.w\.org\/['"][^>]+href=['"]([^'"]+)['"]/
	);
	const root =
		( fromHeader && fromHeader[ 1 ] ) || ( fromHtml && fromHtml[ 1 ] );
	return root
		? new URL( decode( root ), response.url || address ).href
		: null;
}

/**
 * A REST route's address under a root, either form.
 *
 * @param {string} root   REST root.
 * @param {string} route  Route, without the leading slash.
 * @param {Object} params Query parameters.
 * @return {string} Address.
 */
function restUrl( root, route, params ) {
	const url = new URL( root );
	if ( url.searchParams.has( 'rest_route' ) ) {
		url.searchParams.set( 'rest_route', '/' + route );
	} else {
		url.pathname = url.pathname.replace( /\/?$/, '/' ) + route;
	}
	for ( const [ key, value ] of Object.entries( params ) ) {
		url.searchParams.set( key, value );
	}
	return url.href;
}

/**
 * The site's Listen pages through core's public pages route, oldest first, as
 * First_Run::listen_page() orders them: pages whose content holds the Riff block (a search for the
 * block's comment), and pages using the Listen template.
 *
 * @param {Fetch}  fetch fetch().
 * @param {string} root  REST root.
 * @return {Promise<string[]>} Page addresses.
 */
async function listenPages( fetch, root ) {
	const get = ( params ) =>
		fetch(
			restUrl( root, 'wp/v2/pages', {
				_fields: 'id,link,template',
				orderby: 'id',
				order: 'asc',
				...params,
			} )
		)
			.then( ( r ) => ( r.ok ? r.json() : [] ) )
			.catch( () => [] );
	const [ block, all ] = await Promise.all( [
		get( { search: 'wp:riff/app', per_page: '10' } ),
		get( { per_page: '100' } ),
	] );
	const pages = new Map();
	for ( const page of Array.isArray( block ) ? block : [] ) {
		pages.set( page.id, page );
	}
	for ( const page of Array.isArray( all ) ? all : [] ) {
		if ( page.template === 'listen' ) {
			pages.set( page.id, page );
		}
	}
	return [ ...pages.values() ]
		.sort( ( a, b ) => a.id - b.id )
		.map( ( page ) => page.link )
		.filter( Boolean );
}

/**
 * The standalone Listen page for whatever the person typed: the Listen page's address (what they
 * see in their browser), its app/ address, or the site's own address.
 *
 * @param {string} input Typed address.
 * @param {Fetch}  fetch fetch(), Electron's net.fetch in the app.
 * @return {Promise<string>} The standalone address.
 * @throws {Error} With code 'invalid', 'insecure', 'unreachable' or 'not-riff'.
 */
async function discover( input, fetch ) {
	const url = normalize( input );
	for ( const address of candidates( url ) ) {
		const found = await standalone( fetch, address );
		if ( found ) {
			return found;
		}
	}
	const response = await fetch( url.href ).catch( () => null );
	if ( ! response ) {
		throw codeError( 'unreachable' );
	}
	const root = restRoot(
		response,
		await response.text().catch( () => '' ),
		url.href
	);
	if ( root ) {
		for ( const link of await listenPages( fetch, root ) ) {
			for ( const address of candidates( new URL( link ) ) ) {
				const found = await standalone( fetch, address );
				if ( found ) {
					return found;
				}
			}
		}
	}
	throw codeError( 'not-riff' );
}

/**
 * The few entities WordPress's esc_url() leaves in an attribute.
 *
 * @param {string} text Attribute value.
 * @return {string} Decoded.
 */
function decode( text ) {
	return text.replace( /&#0?38;|&amp;/g, '&' ).replace( /&#0?39;/g, "'" );
}

function codeError( code ) {
	const error = new Error( code );
	error.code = code;
	return error;
}

module.exports = {
	isLoopback,
	isAllowed,
	normalize,
	inWindow,
	isExternal,
	candidates,
	restUrl,
	discover,
};
