/**
 * A job's own thread in Node: one php-wasm runtime, booted for this job alone and thrown away with
 * the thread. Every bridge call goes to the parent, which holds the manifest and the site; the
 * parent ends the thread when the job runs past its time.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { loadNodeRuntime } from '@php-wasm/node';
import * as universal from '@php-wasm/universal';
import { confine, runJob } from './job.js';

const pending = new Map();
let next = 0;
parentPort.on( 'message', ( m ) => {
	if ( m?.type === 'answer' ) {
		// Only a call this thread made and is still waiting on, as in web-worker.js.
		const resolve = Number.isInteger( m.id ) ? pending.get( m.id ) : undefined;
		if ( typeof resolve === 'function' ) {
			pending.delete( m.id );
			resolve( m.value );
		}
	}
} );
const call = ( raw ) =>
	new Promise( ( resolve ) => {
		const id = next++;
		pending.set( id, resolve );
		parentPort.postMessage( { type: 'call', id, raw } );
	} );

const started = performance.now();
const runtime = await loadNodeRuntime( '8.3', {
	emscriptenOptions: { processId: 1, preRun: [ confine ] },
} );
const php = new universal.PHP( runtime );
const booted = performance.now();
try {
	const result = await runJob( {
		php,
		universal,
		...workerData,
		call,
		spawned: ( command ) => parentPort.postMessage( { type: 'spawned', command } ),
	} );
	parentPort.postMessage( { type: 'done', result, bootMs: booted - started, runMs: performance.now() - booted } );
} catch ( e ) {
	parentPort.postMessage( { type: 'failed', error: String( e?.message || e ), bootMs: booted - started } );
}
php.exit?.();
