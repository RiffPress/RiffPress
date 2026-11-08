/**
 * The bridge: the only way an extension's PHP reaches the site. Each call PHP makes through
 * post_message_to_js() arrives here as JSON, `{ op, args }`, and is checked against the
 * extension's isolation.json before the site is asked. It runs the same in Node and in a browser:
 * what changes is the `site` it is given, an object that does the real work (in a browser, over
 * the site's REST API, which checks the manifest again).
 *
 * The ops are the whole API an extension has:
 *
 * - `track` ( id ): a track, if the manifest's sandbox.reads has "track".
 * - `meta.get` ( id, key ), `meta.set` ( id, key, value ): post meta under data.meta's prefixes.
 * - `http.get` ( url ): a GET to a host in hosts, made by the host, never by PHP.
 * - `view` ( id, args ): a view of Now Playing, if the manifest's riff.functions has
 *   riff_register_view.
 * - `log` ( message ): a line in the job's log.
 */

/**
 * @typedef {Object} Site
 * @property {(id: number) => Promise<Object|null>}                       track
 * @property {(id: number, key: string) => Promise<string>}               getMeta
 * @property {(id: number, key: string, value: string) => Promise<boolean>} setMeta
 * @property {(url: string) => Promise<{status: number, body: string}>}   fetch
 * @property {(id: string, args: Object) => Promise<boolean>}             registerView
 */

/**
 * Whether a host is one the manifest names: exactly, or under a `*.` wildcard.
 *
 * @param {string}   host
 * @param {string[]} hosts
 * @return {boolean}
 */
export function hostAllowed( host, hosts ) {
	host = String( host ).toLowerCase();
	return hosts.some( ( h ) =>
		h.startsWith( '*.' ) ? host === h.slice( 2 ) || host.endsWith( h.slice( 1 ) ) : host === h
	);
}

/**
 * Whether the manifest lets an extension make this call, and why not when it doesn't. The same
 * function the site's REST route runs (riff-sandbox.php ports it), so the browser's answer and the
 * site's agree.
 *
 * @param {Object} manifest
 * @param {string} op
 * @param {Array}  args
 * @return {string|null} Why it is refused, or null.
 */
export function refusal( manifest, op, args = [] ) {
	const reads = manifest.sandbox?.reads || [];
	const prefixes = manifest.data?.meta || [];
	switch ( op ) {
		case 'track':
			return reads.includes( 'track' ) ? null : 'it does not declare sandbox.reads "track"';
		case 'meta.get':
		case 'meta.set': {
			const key = String( args[ 1 ] ?? '' );
			return prefixes.some( ( p ) => key.startsWith( p ) )
				? null
				: `the meta key '${ key }' is not under data.meta ${ JSON.stringify( prefixes ) }`;
		}
		case 'http.get': {
			let url;
			try {
				url = new URL( String( args[ 0 ] ) );
			} catch {
				return 'not a URL';
			}
			if ( url.protocol !== 'https:' ) {
				return 'only https';
			}
			return hostAllowed( url.hostname, manifest.hosts || [] )
				? null
				: `${ url.hostname } is not in hosts ${ JSON.stringify( manifest.hosts || [] ) }`;
		}
		case 'view':
			return ( manifest.riff?.functions || [] ).includes( 'riff_register_view' )
				? null
				: 'it does not declare riff.functions "riff_register_view"';
		case 'log':
			return null;
		default:
			return `there is no ${ op }`;
	}
}

/**
 * A bridge for one job.
 *
 * @param {Object} options
 * @param {Object} options.manifest The extension's isolation.json.
 * @param {Site}   options.site     What does the work.
 * @return {{ handle: (raw: string) => Promise<string>, calls: Object[], log: string[] }}
 */
export function createBridge( { manifest, site } ) {
	const calls = [];
	const log = [];
	async function answer( op, args ) {
		switch ( op ) {
			case 'track':
				return site.track( Number( args[ 0 ] ) );
			case 'meta.get':
				return site.getMeta( Number( args[ 0 ] ), String( args[ 1 ] ) );
			case 'meta.set':
				return site.setMeta( Number( args[ 0 ] ), String( args[ 1 ] ), String( args[ 2 ] ?? '' ) );
			case 'http.get':
				return site.fetch( String( args[ 0 ] ) );
			case 'view':
				return site.registerView( String( args[ 0 ] ), Object( args[ 1 ] ) );
			case 'log':
				log.push( String( args[ 0 ] ) );
				return true;
		}
		return null;
	}
	return {
		calls,
		log,
		async handle( raw ) {
			const started = performance.now();
			let message;
			try {
				message = JSON.parse( raw );
			} catch {
				return JSON.stringify( { ok: false, error: 'not JSON' } );
			}
			const op = String( message?.op ?? '' );
			const args = Array.isArray( message?.args ) ? message.args : [];
			const why = refusal( manifest, op, args );
			const call = { op, args, ok: ! why, why };
			calls.push( call );
			if ( why ) {
				call.ms = performance.now() - started;
				return JSON.stringify( { ok: false, error: `refused: ${ why }` } );
			}
			try {
				const value = await answer( op, args );
				call.ms = performance.now() - started;
				return JSON.stringify( { ok: true, value } );
			} catch ( e ) {
				call.ok = false;
				call.why = String( e?.message || e );
				return JSON.stringify( { ok: false, error: call.why } );
			}
		},
	};
}
