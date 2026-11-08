#!/usr/bin/env node
/**
 * Once a local site is up, starts Mailpit (where the site's mail goes) and opens both in the
 * browser: the site, and http://localhost:8025 for the codes and links it sends. Nothing opens
 * in CI or when RIFF_NO_OPEN is set.
 *
 * Usage: node scripts/open-local.js [site address]   (default http://localhost:8888)
 */
const { execFileSync, spawn } = require( 'node:child_process' );

const site = process.argv[ 2 ] || 'http://localhost:8888';
const MAIL = 'http://localhost:8025';

try {
	execFileSync( 'npm', [ 'run', '--silent', 'mail' ], { stdio: 'inherit' } );
} catch {
	console.error( 'Mailpit did not start; is Docker running?' );
}

if ( process.env.CI || process.env.RIFF_NO_OPEN ) {
	console.log( `site ${ site }, mail ${ MAIL }` );
	process.exit( 0 );
}

const opener = { darwin: 'open', win32: 'explorer' }[ process.platform ] || 'xdg-open';
for ( const url of [ site, MAIL ] ) {
	spawn( opener, [ url ], { stdio: 'ignore', detached: true } ).unref();
}
console.log( `Opened ${ site } and ${ MAIL }.` );
