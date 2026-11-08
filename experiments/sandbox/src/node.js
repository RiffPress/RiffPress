/**
 * The Node host: runs one event of an untrusted extension in a thread of its own, behind the
 * bridge. This is the sidecar shape, after LexBunker's desktop runtime: a process beside the site
 * that the site hands jobs to (docs/isolation.md, "Where it runs").
 */
import { Worker } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBridge } from './bridge.js';

const HERE = path.dirname( fileURLToPath( import.meta.url ) );
export const STUBS = fs.readFileSync( path.join( HERE, 'stubs.php' ), 'utf8' );

/**
 * An extension's files, read from its folder: its PHP, by path under the folder.
 *
 * @param {string} dir
 * @return {Object<string, string>}
 */
export function readExtension( dir ) {
	const out = {};
	const walk = ( at ) => {
		for ( const d of fs.readdirSync( at, { withFileTypes: true } ) ) {
			const full = path.join( at, d.name );
			if ( d.isDirectory() ) {
				walk( full );
			} else if ( d.name.endsWith( '.php' ) ) {
				out[ path.relative( dir, full ) ] = fs.readFileSync( full, 'utf8' );
			}
		}
	};
	walk( dir );
	return out;
}

/**
 * Runs one event.
 *
 * @param {Object}                 options
 * @param {Object}                 options.manifest The extension's isolation.json.
 * @param {Object<string, string>} options.files    Its PHP.
 * @param {string}                 options.main     Its main file.
 * @param {string}                 options.event    The action to fire.
 * @param {Array}                  [options.args]   Its arguments.
 * @param {import('./bridge.js').Site} options.site What the bridge's calls reach.
 * @param {number}                 [options.timeout] Milliseconds before the thread is ended; the manifest's sandbox.time, or 2000.
 * @return {Promise<Object>} The output, every call and whether it was allowed, programs PHP asked for, timings, and `timedOut`.
 */
export function runInNode( { manifest, files, main, event, args = [], site, timeout } ) {
	if ( ! ( manifest.sandbox?.events || [] ).includes( event ) ) {
		return Promise.reject( new Error( `${ manifest.plugin } does not declare sandbox.events "${ event }"` ) );
	}
	const bridge = createBridge( { manifest, site } );
	const limit = timeout ?? manifest.sandbox?.time ?? 2000;
	const spawned = [];
	const started = performance.now();
	return new Promise( ( resolve, reject ) => {
		const worker = new Worker( path.join( HERE, 'node-worker.js' ), {
			workerData: { stubs: STUBS, files, main, manifest, event, args },
			resourceLimits: { maxOldGenerationSizeMb: 256 },
		} );
		const finish = ( out ) => {
			clearTimeout( timer );
			worker.terminate();
			resolve( { ...out, calls: bridge.calls, log: bridge.log, spawned, totalMs: performance.now() - started } );
		};
		const timer = setTimeout( () => finish( { timedOut: true, text: '', errors: '' } ), limit );
		worker.on( 'message', async ( m ) => {
			if ( m.type === 'call' ) {
				worker.postMessage( { type: 'answer', id: m.id, value: await bridge.handle( m.raw ) } );
			} else if ( m.type === 'spawned' ) {
				spawned.push( m.command );
			} else if ( m.type === 'done' ) {
				finish( { timedOut: false, ...m.result, bootMs: m.bootMs, runMs: m.runMs } );
			} else if ( m.type === 'failed' ) {
				finish( { timedOut: false, text: '', errors: m.error, failed: true, bootMs: m.bootMs } );
			}
		} );
		worker.on( 'error', ( e ) => {
			clearTimeout( timer );
			reject( e );
		} );
	} );
}
