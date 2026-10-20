#!/usr/bin/env node
/**
 * The changelog in each plugin's readme.txt, from the CHANGELOG.md release-please writes for it.
 *
 * readme.txt's changelog is what WordPress.org shows, and it was written by hand, so it fell behind
 * the releases. This writes it from the same entries as the GitHub releases: the latest releases,
 * each line the merged pull request's title as a sentence, features as they are, fixes after
 * "Fixed:", performance after "Faster:". scripts/sync-versions.sh runs it on a release pull request,
 * after release-please has added the new version's entry.
 *
 * --check fails when a readme.txt's changelog is not what CHANGELOG.md says.
 *
 * Usage: node .github/scripts/readme-changelog.js [--check] [riff|riff-lyrics ...]
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );

const ROOT = path.resolve( __dirname, '..', '..' );
const PLUGINS = [ 'riff', 'riff-lyrics' ];
// How many releases the readme keeps; the rest are on GitHub.
const KEEP = 5;
const FOOTER =
	'Every release, with the full list of changes, is on [GitHub](https://github.com/RiffPress/RiffPress/releases).';
const SECTIONS = {
	Features: ( line ) => sentence( line ),
	'Bug Fixes': ( line ) => `Fixed: ${ end( line ) }`,
	'Performance Improvements': ( line ) => `Faster: ${ end( line ) }`,
};

// A line ends with a full stop.
function end( line ) {
	return /[.!?]$/.test( line ) ? line : `${ line }.`;
}

// A line starts with a capital and ends with a full stop.
function sentence( line ) {
	return end( line.charAt( 0 ).toUpperCase() + line.slice( 1 ) );
}

/**
 * The releases in a CHANGELOG.md, newest first: each its version and its readme lines.
 *
 * @param {string} markdown CHANGELOG.md.
 * @return {{version: string, lines: string[]}[]} Releases.
 */
function releases( markdown ) {
	const out = [];
	let release = null;
	let section = null;
	for ( const raw of markdown.split( '\n' ) ) {
		const heading = raw.match( /^##\s+\[?(\d[^\]\s]*)\]?/ );
		if ( heading ) {
			release = { version: heading[ 1 ], lines: [] };
			out.push( release );
			section = null;
			continue;
		}
		const sub = raw.match( /^###\s+(.+?)\s*$/ );
		if ( sub ) {
			section = SECTIONS[ sub[ 1 ] ] || null;
			continue;
		}
		const item = raw.match( /^\*\s+(.+)$/ );
		if ( release && section && item ) {
			// The pull request and commit links release-please adds, and a scope it bolds.
			const text = item[ 1 ]
				.replace( /\s*\(\[#\d+\]\([^)]*\)\)/g, '' )
				.replace( /\s*\(\[[0-9a-f]{7,40}\]\([^)]*\)\)/g, '' )
				.replace( /^\*\*[^*]+:\*\*\s*/, '' )
				.trim();
			if ( text ) {
				release.lines.push( section( text ) );
			}
		}
	}
	return out.filter( ( r ) => r.lines.length );
}

/**
 * A readme.txt with its changelog written from the releases.
 *
 * @param {string} readme   readme.txt.
 * @param {Array}  versions Releases, newest first.
 * @return {string} readme.txt.
 */
function withChangelog( readme, versions ) {
	const at = readme.indexOf( '== Changelog ==' );
	if ( at < 0 ) {
		throw new Error( 'no == Changelog == section' );
	}
	const rest = readme.slice( at + '== Changelog =='.length );
	const next = rest.search( /\n== [^=]/ );
	const after = next < 0 ? '' : rest.slice( next );
	const entries = versions
		.slice( 0, KEEP )
		.map( ( r ) => `= ${ r.version } =\n${ r.lines.map( ( l ) => `* ${ l }` ).join( '\n' ) }` )
		.join( '\n\n' );
	return `${ readme.slice( 0, at ) }== Changelog ==\n\n${ entries }\n\n${ FOOTER }\n${ after }`;
}

function main( argv ) {
	const check = argv.includes( '--check' );
	const which = argv.filter( ( a ) => ! a.startsWith( '--' ) );
	let stale = 0;
	for ( const slug of which.length ? which : PLUGINS ) {
		if ( ! PLUGINS.includes( slug ) ) {
			throw new Error( `unknown plugin ${ slug }` );
		}
		const dir = path.join( ROOT, 'plugins', slug );
		const changelog = path.join( dir, 'CHANGELOG.md' );
		const file = path.join( dir, 'readme.txt' );
		if ( ! fs.existsSync( changelog ) ) {
			continue; // Not released yet: the readme keeps what was written for its first release.
		}
		const readme = fs.readFileSync( file, 'utf8' );
		const next = withChangelog( readme, releases( fs.readFileSync( changelog, 'utf8' ) ) );
		if ( next === readme ) {
			console.log( `${ slug }: readme.txt changelog is current` );
		} else if ( check ) {
			console.error( `${ slug }: readme.txt changelog is not what CHANGELOG.md says; run node .github/scripts/readme-changelog.js` );
			stale++;
		} else {
			fs.writeFileSync( file, next );
			console.log( `${ slug }: wrote readme.txt changelog` );
		}
	}
	return stale ? 1 : 0;
}

if ( require.main === module ) {
	process.exitCode = main( process.argv.slice( 2 ) );
}

module.exports = { releases, withChangelog };
