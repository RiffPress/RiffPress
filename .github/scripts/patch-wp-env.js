#!/usr/bin/env node
/**
 * Makes the installed `@wordpress/env` work with simple-git 4, which package.json's `overrides`
 * pins for its security fixes (GHSA-v5rq-49vh-5v5c, GHSA-x6jw-m9v5-85vh, GHSA-g4wm-2vf7-vfgr,
 * GHSA-858h-whjf-mvg5). simple-git 4 dropped its default export, and `@wordpress/env` 11.17 still
 * calls `require( 'simple-git' )` as a function in the two files that clone from git. This
 * rewrites that one line in each to take the named `simpleGit` export, the same change Gutenberg
 * made upstream in WordPress/gutenberg#84137.
 *
 * Runs from `postinstall`. It does nothing when `@wordpress/env` is not installed or already uses
 * the named export, and fails the install if the line it expects is gone, so a changed
 * `@wordpress/env` cannot leave `wp-env start` silently unable to clone. Delete this script, the
 * `postinstall` entry, and the simple-git override once a released `@wordpress/env` depends on
 * simple-git 4.
 *
 * Usage: node .github/scripts/patch-wp-env.js
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );

const FILES = [
	'lib/download-sources.js',
	'lib/runtime/docker/download-wp-phpunit.js',
];

const DEFAULT_IMPORT = /const SimpleGit = require\( 'simple-git' \);/;
const NAMED_IMPORT = /\{\s*simpleGit\b[^}]*\}\s*=\s*require\(\s*'simple-git'\s*\)/;

/**
 * Returns the source with the default import swapped for the named one, or null when it already
 * uses the named export. Throws when it finds neither.
 *
 * @param {string} source The file's contents.
 * @return {string|null} The patched source, or null if there is nothing to change.
 */
function patchSource( source ) {
	if ( NAMED_IMPORT.test( source ) ) {
		return null;
	}
	if ( ! DEFAULT_IMPORT.test( source ) ) {
		throw new Error( 'no simple-git import found' );
	}
	return source.replace(
		DEFAULT_IMPORT,
		"const { simpleGit: SimpleGit } = require( 'simple-git' );"
	);
}

function main() {
	let root;
	try {
		root = path.dirname(
			require.resolve( '@wordpress/env/package.json', {
				paths: [ path.resolve( __dirname, '..', '..' ) ],
			} )
		);
	} catch {
		return;
	}
	for ( const file of FILES ) {
		const full = path.join( root, file );
		let patched;
		try {
			patched = patchSource( fs.readFileSync( full, 'utf8' ) );
		} catch ( error ) {
			throw new Error(
				`patch-wp-env: ${ full }: ${ error.message }. @wordpress/env changed; ` +
					'check whether it now depends on simple-git 4 and drop this patch.'
			);
		}
		if ( patched !== null ) {
			fs.writeFileSync( full, patched );
			process.stdout.write( `patch-wp-env: ${ file } uses simple-git's named export\n` );
		}
	}
}

if ( require.main === module ) {
	main();
}

module.exports = { patchSource };
