/**
 * A job's own Web Worker in the browser: one php-wasm runtime, booted for this job and thrown away
 * with the worker. The worker has no DOM and does no fetching of its own: every bridge call goes to
 * the page that made it, which holds the manifest and asks the site's REST API, which checks the
 * manifest again. The page ends the worker when the job runs past its time.
 *
 * Built into dist/ by build.js. The Asyncify build of PHP runs in every browser; the JSPI build is
 * faster where there is JSPI, and is the next thing to try (phpcompat ships both).
 */
import * as universal from '@php-wasm/universal';
import * as loader from '../node_modules/@php-wasm/web-8-3/asyncify/php_8_3.js';
import { confine, runJob } from './job.js';

const pending = new Map();
let next = 0;
const call = ( raw ) =>
	new Promise( ( resolve ) => {
		const id = next++;
		pending.set( id, resolve );
		self.postMessage( { type: 'call', id, raw } );
	} );

self.onmessage = async ( { data } ) => {
	if ( data.type === 'answer' ) {
		pending.get( data.id )?.( data.value );
		pending.delete( data.id );
		return;
	}
	if ( data.type !== 'run' ) {
		return;
	}
	const started = performance.now();
	try {
		const id = await universal.loadPHPRuntime( loader, { processId: 1, preRun: [ confine ] } );
		const php = new universal.PHP( id );
		const booted = performance.now();
		const result = await runJob( {
			php,
			universal,
			...data.job,
			call,
			spawned: ( command ) => self.postMessage( { type: 'spawned', command } ),
		} );
		self.postMessage( { type: 'done', result, bootMs: booted - started, runMs: performance.now() - booted } );
	} catch ( e ) {
		self.postMessage( { type: 'failed', error: String( e?.stack || e?.message || e ), bootMs: performance.now() - started } );
	}
};
