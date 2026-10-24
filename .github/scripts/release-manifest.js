#!/usr/bin/env node
/**
 * Writes .release-please-manifest.json for a release branch that main was merged into, when the two
 * changed neighbouring lines: main's manifest, which has every other package's latest release, with
 * this package's version from its release branch. Run by release-please.yml, mid-merge, with
 * PACKAGE set to the component the branch names (release-please--branches--main--components--riff).
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { execFileSync } = require( 'node:child_process' );

const ROOT = path.resolve( __dirname, '..', '..' );

/**
 * The path release-please-config.json files a component under.
 *
 * @param {Object} config    release-please-config.json.
 * @param {string} component The component, such as riff or riff-lyrics.
 * @return {string} Its path, such as plugins/riff.
 */
function pathOf( config, component ) {
	const found = Object.entries( config.packages || {} ).find( ( [ , p ] ) => p.component === component );
	if ( ! found ) {
		throw new Error( `No package in release-please-config.json is the component ${ component }` );
	}
	return found[ 0 ];
}

/**
 * Main's manifest with one package's version from its release branch.
 *
 * @param {Object} main   Main's manifest.
 * @param {Object} branch The release branch's manifest.
 * @param {string} where  The package's path.
 * @return {Object} The manifest.
 */
function merged( main, branch, where ) {
	if ( ! ( where in branch ) ) {
		throw new Error( `The release branch's manifest has no ${ where }` );
	}
	return { ...main, [ where ]: branch[ where ] };
}

if ( require.main === module ) {
	const show = ( ref ) => JSON.parse( execFileSync( 'git', [ 'show', `${ ref }:.release-please-manifest.json` ], { cwd: ROOT, encoding: 'utf8' } ) );
	const config = JSON.parse( fs.readFileSync( path.join( ROOT, 'release-please-config.json' ), 'utf8' ) );
	const where = pathOf( config, process.env.PACKAGE || '' );
	const manifest = merged( show( 'origin/main' ), show( 'HEAD' ), where );
	fs.writeFileSync( path.join( ROOT, '.release-please-manifest.json' ), JSON.stringify( manifest, null, '\t' ) + '\n' );
	console.log( `.release-please-manifest.json: main's, with ${ where } at ${ manifest[ where ] }` );
}

module.exports = { pathOf, merged };
