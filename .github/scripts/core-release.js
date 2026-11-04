#!/usr/bin/env node
/**
 * Opens one issue when WordPress ships a major release Riff isn't tested up to yet, with the
 * release-day checklist from CONTRIBUTING.md, so Riff ships the same day. The current release comes
 * from api.wordpress.org; what Riff is tested up to comes from plugins/riff/readme.txt. An issue is
 * opened once per major, whether or not an earlier one was closed.
 *
 * Usage: node .github/scripts/core-release.js [--dry-run]
 * Needs GH_TOKEN and GITHUB_REPOSITORY to open the issue.
 */
const { execFileSync } = require( 'node:child_process' );
const { readFileSync } = require( 'node:fs' );
const path = require( 'node:path' );

const LABEL = 'core-release';
const README = path.join( __dirname, '../../plugins/riff/readme.txt' );

/**
 * The major version (7.2) of a WordPress version string (7.2, 7.2.1), or null.
 *
 * @param {string} version A version string.
 * @return {string|null} Its first two parts.
 */
function major( version ) {
	const m = /^(\d+)\.(\d+)/.exec( String( version || '' ) );
	return m ? `${ m[ 1 ] }.${ m[ 2 ] }` : null;
}

/**
 * Whether major a is newer than major b.
 *
 * @param {string} a A major version.
 * @param {string} b A major version.
 * @return {boolean} True when a comes after b.
 */
function newer( a, b ) {
	const [ a1, a2 ] = a.split( '.' ).map( Number );
	const [ b1, b2 ] = b.split( '.' ).map( Number );
	return a1 > b1 || ( a1 === b1 && a2 > b2 );
}

/**
 * The Tested up to line of a readme.txt.
 *
 * @param {string} readme The readme's contents.
 * @return {string|null} Its major version.
 */
function testedUpTo( readme ) {
	const m = /^Tested up to:\s*([\d.]+)/m.exec( readme );
	return m ? major( m[ 1 ] ) : null;
}

function title( version ) {
	return `WordPress ${ version } is out: ship Riff on it today`;
}

function issueBody( version ) {
	return [
		`WordPress ${ version } shipped, and Riff is tested up to an earlier major. Riff ships today, tested against it (the release-day steps in \`.github/CONTRIBUTING.md\`).`,
		'',
		`- [ ] Point \`.wp-env.json\` and \`plugin-check.yml\` at \`WordPress/WordPress#${ version }\` instead of the pre-release zip, and merge that once the suite passes on it.`,
		`- [ ] Riff has an open release pull request. If it doesn't, merge a change to \`plugins/riff/\` that releases, or one with a \`Release-As:\` footer.`,
		`- [ ] Every \`readme.txt\` in that pull request says \`Tested up to: ${ version }\` (the release workflow writes it from api.wordpress.org on its next run).`,
		`- [ ] Merge the release pull request today.`,
		`- [ ] If it's a minor or major release, give it a codename: someone who played with ${ version }'s namesake, from wordpress.org's release post, with a source.`,
		'',
		'Close this once Riff is out.',
	].join( '\n' );
}

function gh( args, input ) {
	return execFileSync( 'gh', args, { encoding: 'utf8', input } );
}

async function main( argv ) {
	const dry = argv.includes( '--dry-run' );
	const res = await fetch( 'https://api.wordpress.org/core/version-check/1.7/' );
	if ( ! res.ok ) {
		throw new Error( `api.wordpress.org answered ${ res.status }` );
	}
	const current = major( ( await res.json() ).offers?.[ 0 ]?.current );
	const tested = testedUpTo( readFileSync( README, 'utf8' ) );
	if ( ! current || ! tested ) {
		throw new Error( `Could not read the current release (${ current }) or Tested up to (${ tested })` );
	}
	process.stdout.write( `core-release: WordPress ${ current }, Riff tested up to ${ tested }\n` );
	if ( ! newer( current, tested ) ) {
		return;
	}
	const want = title( current );
	if ( dry ) {
		process.stdout.write( `${ want }\n\n${ issueBody( current ) }\n` );
		return;
	}
	gh( [ 'label', 'create', LABEL, '--color', '1D76DB', '--description', 'A WordPress major release Riff ships on', '--force' ] );
	const existing = JSON.parse( gh( [ 'issue', 'list', '--label', LABEL, '--state', 'all', '--limit', '100', '--json', 'title' ] ) );
	if ( existing.some( ( i ) => i.title === want ) ) {
		process.stdout.write( 'core-release: already filed\n' );
		return;
	}
	gh( [ 'issue', 'create', '--title', want, '--label', LABEL, '--body-file', '-' ], issueBody( current ) );
}

if ( require.main === module ) {
	main( process.argv.slice( 2 ) ).catch( ( e ) => {
		process.stderr.write( `${ e.message }\n` );
		process.exit( 1 );
	} );
}

module.exports = { major, newer, testedUpTo, title, issueBody };
