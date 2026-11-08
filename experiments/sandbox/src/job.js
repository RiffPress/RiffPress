/**
 * One job: a fresh PHP, the stubs, the extension's files, one event, and nothing else. Shared by
 * the Node host (node.js) and the browser's Web Worker (web-worker.js); each loads php-wasm its own
 * way and hands the runtime here.
 *
 * What the PHP can reach is decided before it starts:
 *
 * - No network: php-wasm's WebSocket relay, PHP's only way to a socket, is shut before PHP
 *   starts, and every socket PHP opens is closed at once (confine()). A fetch goes through the
 *   bridge, to a declared host, made by the host.
 * - No programs: the functions that run one are disabled, and the spawn handler, which php-wasm
 *   calls for mail() and anything else that reaches popen(), refuses.
 * - No files of anyone's: PHP's filesystem is memory holding the stubs, the extension and /tmp.
 *   Nothing of the site's, nor the machine's, is mounted.
 * - No settings of its own: ini_set() and set_time_limit() are disabled, memory_limit is the
 *   manifest's, and the whole instance is thrown away after the job.
 */

// The functions disabled for every job. PHP 8 unregisters a disabled function, so calling one is
// "Call to undefined function", which is what an extension sees.
export const DISABLED = [
	'exec',
	'shell_exec',
	'system',
	'passthru',
	'proc_open',
	'popen',
	'pcntl_exec',
	'proc_nice',
	'putenv',
	'dl',
	'ini_set',
	'ini_alter',
	'ini_restore',
	'set_time_limit',
	'ignore_user_abort',
	'fsockopen',
	'pfsockopen',
	'stream_socket_client',
	'stream_socket_server',
	'socket_create',
	'curl_init',
	'curl_exec',
	'mail',
];

/**
 * A WebSocket that opens and closes at once, the way php-wasm's relay answers a host it can't
 * reach: PHP's connect fails at once rather than waiting out a timeout. (LexBunker's outbound.js.)
 */
class RefusedSocket {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSING = 2;
	static CLOSED = 3;
	CONNECTING = 0;
	OPEN = 1;
	CLOSING = 2;
	CLOSED = 3;
	constructor() {
		this.binaryType = 'arraybuffer';
		this.readyState = 0;
		this.listeners = {};
		setTimeout( () => {
			this.readyState = 3;
			this.emit( 'close' );
		}, 0 );
	}
	on( event, fn ) {
		( this.listeners[ event ] ||= [] ).push( fn );
	}
	addEventListener( event, fn ) {
		this.on( event, fn );
	}
	removeEventListener( event, fn ) {
		this.listeners[ event ] = ( this.listeners[ event ] || [] ).filter( ( f ) => f !== fn );
	}
	emit( event, ...args ) {
		for ( const fn of this.listeners[ event ] || [] ) {
			fn( ...args );
		}
		this[ `on${ event }` ]?.( ...args );
	}
	send() {}
	close() {
		this.readyState = 3;
	}
	setSocketOpt() {}
}

/**
 * A preRun step for the runtime: before PHP starts, shuts php-wasm's relay and points PHP's
 * sockets at RefusedSocket.
 *
 * @param {Object} runtime The Emscripten module.
 */
export function confine( runtime ) {
	const relay = runtime.outboundNetworkProxyServer;
	if ( relay ) {
		relay.close();
		relay.closeAllConnections?.();
		runtime.outboundNetworkProxyServer = undefined;
	}
	runtime.websocket = runtime.websocket || {};
	runtime.websocket.url = () => 'refused:';
	runtime.websocket.decorator = () => RefusedSocket;
}

/**
 * A process that has already failed, for the spawn handler to hand back: php-wasm reads it as a
 * program that could not be found.
 *
 * @param {string} command
 * @return {Object}
 */
function refusedProcess( command ) {
	const handlers = {};
	const stream = () => {
		const s = { on: ( e, fn ) => ( ( s[ e ] ||= [] ).push( fn ), s ), write() {}, end() {} };
		return s;
	};
	const child = {
		pid: 0,
		stdin: stream(),
		stdout: stream(),
		stderr: stream(),
		kill: () => true,
		on( event, fn ) {
			( handlers[ event ] ||= [] ).push( fn );
			return child;
		},
	};
	setTimeout( () => {
		for ( const fn of child.stderr.data || [] ) {
			fn( new TextEncoder().encode( `${ command }: refused by the sandbox\n` ) );
		}
		for ( const name of [ 'end', 'close' ] ) {
			for ( const fn of [ ...( child.stdout[ name ] || [] ), ...( child.stderr[ name ] || [] ) ] ) {
				fn();
			}
		}
		for ( const name of [ 'spawn', 'exit', 'close' ] ) {
			for ( const fn of handlers[ name ] || [] ) {
				fn( name === 'spawn' ? undefined : 127, null );
			}
		}
	}, 0 );
	return child;
}

// A PHP single-quoted string, in which only \ and ' mean anything.
const quote = ( s ) => `'${ String( s ).replace( /\\/g, '\\\\' ).replace( /'/g, "\\'" ) }'`;

/**
 * Runs one event in a PHP instance that has had nothing else run in it.
 *
 * @param {Object}                          options
 * @param {Object}                          options.php      A PHP from @php-wasm/universal, its runtime confined.
 * @param {Object}                          options.universal @php-wasm/universal, for setPhpIniEntries.
 * @param {string}                          options.stubs    stubs.php.
 * @param {Object<string, string>}          options.files    The extension's files, by path under its folder.
 * @param {string}                          options.main     Its main file.
 * @param {Object}                          options.manifest Its isolation.json.
 * @param {string}                          options.event    The action to fire.
 * @param {Array}                           options.args     Its arguments.
 * @param {(raw: string) => Promise<string>} options.call    Where a bridge call goes.
 * @param {(command: string) => void}       options.spawned  Told of each program PHP asked to run.
 * @return {Promise<{text: string, errors: string, exitCode: number}>}
 */
export async function runJob( { php, universal, stubs, files, main, manifest, event, args, call, spawned } ) {
	await universal.setPhpIniEntries( php, {
		disable_functions: DISABLED.join( ',' ),
		memory_limit: manifest.sandbox?.memory || '64M',
		max_execution_time: '0',
		allow_url_fopen: '0',
		allow_url_include: '0',
		display_errors: '1',
		error_reporting: String( 32767 ),
	} );
	php.setSpawnHandler( ( command, argv = [] ) => {
		spawned( [ command, ...argv ].join( ' ' ) );
		return refusedProcess( command );
	} );
	php.onMessage( ( raw ) => call( String( raw ) ) );
	php.mkdir( '/riff' );
	php.writeFile( '/riff/stubs.php', stubs );
	for ( const [ name, code ] of Object.entries( files ) ) {
		const to = `/extension/${ name }`;
		php.mkdir( to.slice( 0, to.lastIndexOf( '/' ) ) );
		php.writeFile( to, code );
	}
	const result = await php.run( {
		code: `<?php
require '/riff/stubs.php';
require ${ quote( `/extension/${ main }` ) };
do_action( ${ quote( event ) }, ...json_decode( ${ quote( JSON.stringify( args ) ) }, true ) );
`,
	} );
	return { text: result.text, errors: result.errors, exitCode: result.exitCode };
}
