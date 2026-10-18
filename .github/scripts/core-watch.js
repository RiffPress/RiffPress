#!/usr/bin/env node
/**
 * Opens one issue a day listing the commits to WordPress core and Gutenberg that touched the media
 * code Riff relies on, so a change is looked at before it reaches a release, whether or not a test
 * breaks. Nothing is opened on a day with no such commits.
 *
 * Usage: node .github/scripts/core-watch.js [--since=<ISO date>] [--dry-run]
 * Defaults to the last 24 hours. Needs GH_TOKEN; opening the issue also needs GITHUB_REPOSITORY.
 */
const { execFileSync } = require( 'node:child_process' );

const LABEL = 'core-watch';

/**
 * What Riff reads from WordPress, by repository: uploads and their metadata, the ID3 reader, the
 * attachments REST controller, and the audio, video and playlist blocks.
 */
const WATCH = {
	'WordPress/wordpress-develop': [
		'src/wp-includes/media.php',
		'src/wp-admin/includes/media.php',
		'src/wp-admin/includes/image.php',
		'src/wp-includes/ID3',
		'src/wp-includes/rest-api/endpoints/class-wp-rest-attachments-controller.php',
		'src/wp-includes/blocks/playlist.php',
		'src/wp-includes/blocks/playlist-track.php',
	],
	'WordPress/gutenberg': [
		'packages/block-library/src/audio',
		'packages/block-library/src/video',
		'packages/block-library/src/playlist',
		'packages/block-library/src/playlist-track',
		'packages/media-utils',
	],
};

/**
 * Commits by repository, each listed once with every watched path it touched.
 *
 * @param {Array<{repo: string, path: string, commits: Array}>} found What each path query returned.
 * @return {Map<string, Array<{sha: string, message: string, url: string, paths: string[]}>>} By repository.
 */
function summarize( found ) {
	const byRepo = new Map();
	for ( const { repo, path, commits } of found ) {
		if ( ! byRepo.has( repo ) ) {
			byRepo.set( repo, new Map() );
		}
		const seen = byRepo.get( repo );
		for ( const c of commits ) {
			if ( ! seen.has( c.sha ) ) {
				seen.set( c.sha, {
					sha: c.sha,
					message: String( c.commit?.message || '' ).split( '\n' )[ 0 ],
					url: c.html_url,
					paths: [],
				} );
			}
			seen.get( c.sha ).paths.push( path );
		}
	}
	const out = new Map();
	for ( const [ repo, seen ] of byRepo ) {
		if ( seen.size ) {
			out.set( repo, [ ...seen.values() ] );
		}
	}
	return out;
}

/**
 * The issue body.
 *
 * @param {Map}    summary From summarize().
 * @param {string} since   ISO date the window starts.
 * @return {string} Markdown.
 */
function issueBody( summary, since ) {
	const lines = [ `Commits since ${ since } that touch media code Riff relies on. For each, check whether Riff needs to change, whether it can drop something it fills in for core (\`docs/native.md\`), or whether core needs a ticket. Close this when they're all looked at.`, '' ];
	for ( const [ repo, commits ] of summary ) {
		lines.push( `## ${ repo }`, '' );
		for ( const c of commits ) {
			lines.push( `- [ ] [\`${ c.sha.slice( 0, 7 ) }\`](${ c.url }) ${ c.message.replace( /([\\[\]])/g, '\\$1' ) } (${ c.paths.map( ( p ) => `\`${ p }\`` ).join( ', ' ) })` );
		}
		lines.push( '' );
	}
	return lines.join( '\n' );
}

function gh( args, input ) {
	return execFileSync( 'gh', args, { encoding: 'utf8', input } );
}

function main( argv ) {
	const dry = argv.includes( '--dry-run' );
	const sinceArg = argv.find( ( a ) => a.startsWith( '--since=' ) );
	const since = sinceArg ? new Date( sinceArg.slice( 8 ) ).toISOString() : new Date( Date.now() - 864e5 ).toISOString();
	const found = [];
	for ( const [ repo, paths ] of Object.entries( WATCH ) ) {
		for ( const p of paths ) {
			const commits = JSON.parse( gh( [ 'api', '-X', 'GET', `repos/${ repo }/commits`, '-f', `path=${ p }`, '-f', `since=${ since }`, '-f', 'per_page=100' ] ) );
			found.push( { repo, path: p, commits } );
		}
	}
	const summary = summarize( found );
	const total = [ ...summary.values() ].reduce( ( n, list ) => n + list.length, 0 );
	process.stdout.write( `core-watch: ${ total } commits since ${ since }\n` );
	if ( ! total ) {
		return;
	}
	const body = issueBody( summary, since );
	if ( dry ) {
		process.stdout.write( body + '\n' );
		return;
	}
	gh( [ 'label', 'create', LABEL, '--color', '0E8A16', '--description', 'Core and Gutenberg media changes to look at', '--force' ] );
	gh( [ 'issue', 'create', '--title', `Core media changes since ${ since.slice( 0, 10 ) }`, '--label', LABEL, '--body-file', '-' ], body );
}

if ( require.main === module ) {
	main( process.argv.slice( 2 ) );
}

module.exports = { WATCH, summarize, issueBody };
