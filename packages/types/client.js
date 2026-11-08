/**
 * A small typed client for Riff's REST routes. The types are in client.d.ts and index.d.ts, which
 * are generated from the routes' own registration code, so a route's name, its parameters and
 * what it answers are checked where you call it.
 *
 *     import { createClient } from '@riffpress/riff-types/client';
 *     const riff = createClient( { root: 'https://example.com/wp-json/' } );
 *     const { items } = await riff.request( 'GET /riff/v1/albums', { search: 'blue' } );
 *
 * In a page WordPress prints, the root and the nonce come from wpApiSettings when the page loads
 * wp-api-fetch's settings, so a signed-in listener's own routes work with no options at all.
 */

/**
 * What a route refused, with WordPress's own code and status.
 */
export class RiffError extends Error {
	/**
	 * @param {string} message        What WordPress said.
	 * @param {Object} details        What else WordPress said.
	 * @param {string} details.code   Its error code.
	 * @param {number} details.status The HTTP status.
	 * @param {*}      details.data   The whole answer.
	 */
	constructor( message, { code = '', status = 0, data = null } = {} ) {
		super( message );
		this.name = 'RiffError';
		this.code = code;
		this.status = status;
		this.data = data;
	}
}

/**
 * An address's query string, as WordPress reads one: an array as `key[]=` once for each item.
 *
 * @param {Object} params Parameters.
 * @return {string} The query, without its `?`.
 */
function query( params ) {
	const q = new URLSearchParams();
	for ( const [ k, v ] of Object.entries( params ) ) {
		if ( v === undefined || v === null ) {
			continue;
		}
		if ( Array.isArray( v ) ) {
			v.forEach( ( item ) => q.append( `${ k }[]`, String( item ) ) );
		} else {
			q.append( k, typeof v === 'boolean' ? ( v ? '1' : '0' ) : String( v ) );
		}
	}
	return q.toString();
}

/**
 * A client for one site.
 *
 * @param {Object}   options         Options.
 * @param {string}   options.root    The REST API's root: `https://example.com/wp-json/`, or `https://example.com/?rest_route=/` on a site without pretty permalinks.
 * @param {string}   options.nonce   A `wp_rest` nonce, for a signed-in listener in the browser.
 * @param {Function} options.fetch   The fetch to use; the global one by default.
 * @param {Object}   options.headers Headers to send with every request, such as an application password's Authorization.
 * @return {Object} The client.
 */
export function createClient( options = {} ) {
	const settings = globalThis.wpApiSettings || {};
	const root = options.root || settings.root || '/wp-json/';
	const nonce = options.nonce || settings.nonce || '';
	const send = options.fetch || globalThis.fetch;
	const shared = options.headers || {};

	/**
	 * Calls a route.
	 *
	 * @param {string} route  `METHOD /namespace/address`, as the Routes type names it.
	 * @param {Object} params What the route takes, the parameters in its address included.
	 * @param {Object} init   More for fetch, such as a signal.
	 * @return {Promise<*>} What the route answers.
	 */
	async function request( route, params = {}, init = {} ) {
		const [ method, template ] = String( route ).split( ' ' );
		if ( ! method || ! template ) {
			throw new TypeError( `"${ route }" is not "METHOD /namespace/address"` );
		}
		const rest = { ...params };
		const address = template.replace( /\{(\w+)\}/g, ( _, name ) => {
			if ( rest[ name ] === undefined || rest[ name ] === null || rest[ name ] === '' ) {
				throw new TypeError( `${ route } needs ${ name }` );
			}
			const value = encodeURIComponent( String( rest[ name ] ) );
			delete rest[ name ];
			return value;
		} );
		const inQuery = method === 'GET' || method === 'DELETE';
		let url = ( root.endsWith( '/' ) ? root : `${ root }/` ) + address.replace( /^\//, '' );
		const q = inQuery ? query( rest ) : '';
		if ( q ) {
			url += ( url.includes( '?' ) ? '&' : '?' ) + q;
		}
		const headers = {
			Accept: 'application/json',
			...( nonce ? { 'X-WP-Nonce': nonce } : {} ),
			...( inQuery ? {} : { 'Content-Type': 'application/json' } ),
			...shared,
			...( init.headers || {} ),
		};
		const response = await send( url, {
			credentials: 'same-origin',
			...init,
			method,
			headers,
			body: inQuery ? undefined : JSON.stringify( rest ),
		} );
		const text = await response.text();
		let data = null;
		try {
			data = text ? JSON.parse( text ) : null;
		} catch {
			data = null;
		}
		if ( ! response.ok ) {
			throw new RiffError( data?.message || response.statusText || `${ route } failed`, { code: data?.code || '', status: response.status, data } );
		}
		return data;
	}

	return { root, request };
}
