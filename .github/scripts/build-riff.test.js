/**
 * Riff is built in one place, build-riff.sh: the plugin, and each extension extensions.json names
 * inside it, both as a release ships them. These hold the build to the manifest, keep Riff Sign In
 * out of it, and keep every workflow that builds Riff on the script.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert' );
const { execFileSync } = require( 'node:child_process' );
const fs = require( 'node:fs' );
const os = require( 'node:os' );
const path = require( 'node:path' );

const root = path.join( __dirname, '..', '..' );
const manifest = JSON.parse(
	fs.readFileSync( path.join( root, 'plugins/riff/extensions.json' ), 'utf8' )
);

test( 'extensions.json names plugins of the repository, and never Riff Sign In', () => {
	assert.ok( Array.isArray( manifest.extensions ) );
	for ( const name of manifest.extensions ) {
		assert.match( name, /^[a-z0-9-]+$/ );
		assert.ok( fs.existsSync( path.join( root, 'plugins', name, `${ name }.php` ) ), name );
	}
	assert.ok( ! manifest.extensions.includes( 'riff-sign-in' ), 'installed on its own' );
} );

test( 'the build carries Riff and each extension inside it, without their tests', () => {
	const dest = fs.mkdtempSync( path.join( os.tmpdir(), 'riff-build-' ) );
	try {
		execFileSync( 'bash', [ path.join( root, '.github/scripts/build-riff.sh' ), dest ] );
		const riff = path.join( dest, 'riff' );
		assert.ok( fs.existsSync( path.join( riff, 'riff.php' ) ) );
		assert.ok( fs.existsSync( path.join( riff, 'extensions.json' ) ) );
		assert.ok( ! fs.existsSync( path.join( riff, 'tests' ) ) );
		for ( const name of manifest.extensions ) {
			assert.ok( fs.existsSync( path.join( riff, 'extensions', name, `${ name }.php` ) ), name );
			assert.ok( ! fs.existsSync( path.join( riff, 'extensions', name, 'tests' ) ), `${ name } without tests` );
		}
		assert.deepStrictEqual(
			fs.readdirSync( path.join( riff, 'extensions' ) ).sort(),
			[ ...manifest.extensions ].sort(),
			'nothing the manifest does not name'
		);
	} finally {
		fs.rmSync( dest, { recursive: true, force: true } );
	}
} );

test( 'every workflow that builds Riff builds it with the script', () => {
	const dir = path.join( root, '.github/workflows' );
	for ( const file of fs.readdirSync( dir ).filter( ( f ) => f.endsWith( '.yml' ) ) ) {
		const text = fs.readFileSync( path.join( dir, file ), 'utf8' );
		assert.ok(
			! /plugins\/riff\/ build\/riff/.test( text ),
			`${ file } copies plugins/riff/ itself, without the extensions`
		);
	}
} );
