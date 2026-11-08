/**
 * The sandbox's costs in Node: a job end to end (a thread, a fresh PHP, the event), its boot, and
 * one bridge call. `npm run bench`; the numbers in docs/isolation.md came from here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readExtension, runInNode } from './src/node.js';

const HERE = path.dirname( fileURLToPath( import.meta.url ) );
const SAMPLE = path.join( HERE, 'sample', 'riff-sample' );
const manifest = JSON.parse( fs.readFileSync( path.join( SAMPLE, 'isolation.json' ), 'utf8' ) );
const site = {
	track: async ( id ) => ( { id, title: 'So What' } ),
	getMeta: async () => '',
	setMeta: async () => true,
	fetch: async () => ( { status: 200, body: '["modal"]' } ),
	registerView: async () => true,
};
const median = ( xs ) => xs.sort( ( a, b ) => a - b )[ Math.floor( xs.length / 2 ) ];

const jobs = [];
for ( let i = 0; i < 15; i++ ) {
	jobs.push( await runInNode( { manifest, files: readExtension( SAMPLE ), main: 'riff-sample.php', event: 'riff_sandbox_uploaded', args: [ 7 ], site } ) );
}
const calls = await runInNode( {
	manifest,
	files: { 'many.php': "<?php add_action( 'riff_sandbox_uploaded', static function ( int $id ): void { for ( $i = 0; $i < 500; $i++ ) { get_post_meta( $id, '_riff_sample_x', true ); } } );" },
	main: 'many.php',
	event: 'riff_sandbox_uploaded',
	args: [ 7 ],
	site,
	timeout: 20000,
} );
const out = {
	node: process.version,
	jobMs: median( jobs.map( ( j ) => j.totalMs ) ),
	bootMs: median( jobs.map( ( j ) => j.bootMs ) ),
	runMs: median( jobs.map( ( j ) => j.runMs ) ),
	callMs: calls.runMs / 500,
	firstJobMs: jobs[ 0 ].totalMs,
};
console.log( JSON.stringify( out, null, '\t' ) );
