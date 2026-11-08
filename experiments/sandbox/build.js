/**
 * Builds the browser host into dist/: the page's module (web.js), the worker (web-worker.js), and
 * PHP's WebAssembly beside the worker's chunk, where it looks for it. `npm run build`.
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname( fileURLToPath( import.meta.url ) );
const OUT = path.join( HERE, 'dist' );
fs.rmSync( OUT, { recursive: true, force: true } );
await build( {
	entryPoints: { web: 'src/web.js', 'web-worker': 'src/web-worker.js' },
	absWorkingDir: HERE,
	outdir: OUT,
	bundle: true,
	format: 'esm',
	splitting: true,
	platform: 'browser',
	target: 'es2022',
	loader: { '.php': 'text' },
	// The Node-only paths of @php-wasm/universal, never reached in a worker.
	external: [ 'node:*', 'fs', 'path', 'crypto', 'os', 'url', 'worker_threads', 'child_process', 'net', 'stream', 'events' ],
	logLevel: 'warning',
} );
const wasm = path.join( HERE, 'node_modules', '@php-wasm', 'web-8-3', 'asyncify', '8_3_33', 'php_8_3.wasm' );
fs.mkdirSync( path.join( OUT, '8_3_33' ) );
fs.copyFileSync( wasm, path.join( OUT, '8_3_33', 'php_8_3.wasm' ) );
console.log( `dist/: ${ fs.readdirSync( OUT ).join( ', ' ) }` );
