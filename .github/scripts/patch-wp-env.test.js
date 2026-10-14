'use strict';

const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );

const { patchSource } = require( './patch-wp-env.js' );

const PUBLISHED = [
	"const AdmZip = require( 'adm-zip' );",
	"const SimpleGit = require( 'simple-git' );",
	"const { rimraf } = require( 'rimraf' );",
	'',
	'const git = SimpleGit( { progress: progressHandler } );',
].join( '\n' );

test( 'swaps the default import for the named export and keeps the call sites', () => {
	const patched = patchSource( PUBLISHED );
	assert.match(
		patched,
		/const \{ simpleGit: SimpleGit \} = require\( 'simple-git' \);/
	);
	assert.match( patched, /const git = SimpleGit\( \{ progress/ );
	assert.equal(
		patched.split( '\n' ).length,
		PUBLISHED.split( '\n' ).length
	);
} );

test( 'leaves an already patched file alone', () => {
	assert.equal( patchSource( patchSource( PUBLISHED ) ), null );
} );

test( 'leaves the upstream fix alone (WordPress/gutenberg#84137)', () => {
	assert.equal(
		patchSource(
			"const { simpleGit } = require( 'simple-git' );\nconst git = simpleGit( {} );"
		),
		null
	);
} );

test( 'fails when the import it expects is gone', () => {
	assert.throws(
		() => patchSource( "import simpleGit from 'simple-git';" ),
		/no simple-git import found/
	);
} );
