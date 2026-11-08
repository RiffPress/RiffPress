/**
 * The browser host, on a page of the site: runs one event of an untrusted extension in a Web
 * Worker of its own, behind the same bridge as Node's, with a `site` that is the site's REST API.
 * The site checks every call against the manifest again (riff-sandbox.php), so a call this page
 * would let through, or one sent without this page at all, is still refused there.
 *
 * The shape is phpcompat's: the site hands the browser work (POST /batch), the browser does it in
 * PHP compiled to WebAssembly, and posts what it found back (POST /results), where the site checks
 * it before keeping it, keyed by the extension's files and the input, so unchanged work isn't done
 * twice.
 */
import { createBridge } from './bridge.js';
import stubs from './stubs.php';

/**
 * The site, through its REST API, as the bridge's `site`.
 *
 * @param {Object} options
 * @param {string} options.root   The REST root, ending in a slash.
 * @param {string} options.nonce  A wp_rest nonce.
 * @param {string} options.plugin The extension's slug.
 * @return {import('./bridge.js').Site}
 */
export function restSite( { root, nonce, plugin } ) {
	const call = async ( op, args ) => {
		const response = await fetch( `${ root }riff-sandbox/v1/call`, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce },
			body: JSON.stringify( { plugin, op, args } ),
		} );
		const body = await response.json();
		if ( ! response.ok ) {
			throw new Error( body?.message || `the site refused (${ response.status })` );
		}
		return body.value;
	};
	return {
		track: ( id ) => call( 'track', [ id ] ),
		getMeta: ( id, key ) => call( 'meta.get', [ id, key ] ),
		setMeta: ( id, key, value ) => call( 'meta.set', [ id, key, value ] ),
		fetch: ( url ) => call( 'http.get', [ url ] ),
		registerView: ( id, args ) => call( 'view', [ id, args ] ),
	};
}

/**
 * Runs one event in a Web Worker.
 *
 * @param {Object}                 options
 * @param {string|URL}             options.worker   dist/web-worker.js.
 * @param {Object}                 options.manifest The extension's isolation.json.
 * @param {Object<string, string>} options.files    Its PHP.
 * @param {string}                 options.main     Its main file.
 * @param {string}                 options.event    The action to fire.
 * @param {Array}                  [options.args]
 * @param {import('./bridge.js').Site} options.site
 * @param {number}                 [options.timeout]
 * @return {Promise<Object>}
 */
export function runInBrowser( { worker: url, manifest, files, main, event, args = [], site, timeout } ) {
	if ( ! ( manifest.sandbox?.events || [] ).includes( event ) ) {
		return Promise.reject( new Error( `${ manifest.plugin } does not declare sandbox.events "${ event }"` ) );
	}
	const bridge = createBridge( { manifest, site } );
	const limit = timeout ?? manifest.sandbox?.time ?? 2000;
	const spawned = [];
	const started = performance.now();
	return new Promise( ( resolve ) => {
		const worker = new Worker( url, { type: 'module' } );
		const finish = ( out ) => {
			clearTimeout( timer );
			worker.terminate();
			resolve( { ...out, calls: bridge.calls, log: bridge.log, spawned, totalMs: performance.now() - started } );
		};
		// The worker's PHP is booted on the job's clock too: a first job pays for the download.
		const timer = setTimeout( () => finish( { timedOut: true, text: '', errors: '' } ), limit );
		worker.onmessage = async ( { data } ) => {
			if ( data.type === 'call' ) {
				worker.postMessage( { type: 'answer', id: data.id, value: await bridge.handle( data.raw ) } );
			} else if ( data.type === 'spawned' ) {
				spawned.push( data.command );
			} else if ( data.type === 'done' ) {
				finish( { timedOut: false, ...data.result, bootMs: data.bootMs, runMs: data.runMs } );
			} else if ( data.type === 'failed' ) {
				finish( { timedOut: false, text: '', errors: data.error, failed: true, bootMs: data.bootMs } );
			}
		};
		worker.onerror = ( e ) => finish( { timedOut: false, text: '', errors: String( e.message ), failed: true } );
		worker.postMessage( { type: 'run', job: { stubs, files, main, manifest, event, args } } );
	} );
}
