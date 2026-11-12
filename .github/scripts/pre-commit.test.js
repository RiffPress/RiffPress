/**
 * The pre-commit hook checks what CI's docs job checks, and runs the workflow scripts' tests, so a
 * commit the hook lets through is not then red in CI for a reason the hook never looked at.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert' );
const fs = require( 'node:fs' );
const path = require( 'node:path' );

const root = path.join( __dirname, '..', '..' );
const read = ( file ) => fs.readFileSync( path.join( root, file ), 'utf8' );
const scripts = JSON.parse( read( 'package.json' ) ).scripts;

// A command as both sides write it: an npm script stands for the command it runs.
const command = ( line ) => {
	const npm = line.match( /^npm run(?: -s)? ([\w:-]+)/ );
	const run = npm ? scripts[ npm[ 1 ] ] || '' : line;
	return run.replace( /\s*(\|\||&&).*$/, '' ).replace( /\s+--test-reporter=\S+/, '' ).trim();
};

// What the hook runs: each line that starts a node script or an npm script.
const hook = new Set(
	read( '.githooks/pre-commit' )
		.split( '\n' )
		.map( ( line ) => line.trim() )
		.filter( ( line ) => /^(node |npm run )/.test( line ) )
		.map( command )
);

// The run: lines of one job in a workflow.
function runs( workflow, job ) {
	const lines = read( `.github/workflows/${ workflow }` ).split( '\n' );
	const start = lines.findIndex( ( line ) => line === `  ${ job }:` );
	assert.notStrictEqual( start, -1, `${ workflow } has a ${ job } job` );
	const out = [];
	for ( const line of lines.slice( start + 1 ) ) {
		if ( /^ {2}\S/.test( line ) ) {
			break;
		}
		const run = line.match( /^\s+(?:- )?run: (node .+)$/ );
		if ( run ) {
			out.push( command( run[ 1 ] ) );
		}
	}
	return out;
}

test( 'the hook runs every check CI\'s docs job runs', () => {
	const ci = runs( 'ci.yml', 'docs' );
	assert.ok( ci.length > 5, 'the docs job\'s checks were read' );
	assert.deepStrictEqual( ci.filter( ( run ) => ! hook.has( run ) ), [] );
} );

test( 'the hook runs the workflow scripts\' tests as their workflow does', () => {
	const tests = runs( 'workflow-scripts.yml', 'test' ).filter( ( run ) => run.startsWith( 'node --test' ) );
	assert.strictEqual( tests.length, 1 );
	assert.ok( hook.has( tests[ 0 ] ), tests[ 0 ] );
} );
