const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const path = require( 'node:path' );
const { spawnSync } = require( 'node:child_process' );

const BIN = path.join( __dirname, '..', 'bin', 'wp-api-coverage.js' );
const FIXTURE = path.join( __dirname, 'fixtures', 'sample-plugin' );
const run = ( ...args ) => spawnSync( process.execPath, [ BIN, ...args ], { encoding: 'utf8' } );

test( 'prints the text report', () => {
	const r = run( FIXTURE, '--limit', '1' );
	assert.equal( r.status, 0, r.stderr );
	assert.match( r.stdout, /^WordPress API coverage for sample-plugin/ );
} );

test( '--json prints the whole report', () => {
	const r = spawnSync( process.execPath, [ BIN, FIXTURE, '--json' ], { encoding: 'utf8', maxBuffer: 1 << 26 } );
	assert.equal( r.status, 0, r.stderr );
	const report = JSON.parse( r.stdout );
	assert.equal( report.plugin, 'sample-plugin' );
	assert.ok( Array.isArray( report.areas ) );
} );

test( 'a missing folder or a bad option is an error', () => {
	assert.equal( run( path.join( FIXTURE, 'nope' ) ).status, 2 );
	assert.equal( run( FIXTURE, '--bogus' ).status, 2 );
	assert.equal( run().status, 2 );
	assert.equal( run( '--help' ).status, 0 );
} );
