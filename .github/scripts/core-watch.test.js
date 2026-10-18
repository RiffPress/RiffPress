'use strict';

const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );

const { WATCH, summarize, issueBody } = require( './core-watch.js' );

const commit = ( sha, message ) => ( { sha, html_url: `https://github.com/x/commit/${ sha }`, commit: { message } } );

test( 'watches the media code Riff reads, in both repositories', () => {
	assert.ok( WATCH[ 'WordPress/wordpress-develop' ].includes( 'src/wp-includes/media.php' ) );
	assert.ok( WATCH[ 'WordPress/gutenberg' ].includes( 'packages/block-library/src/audio' ) );
} );

test( 'a commit that touches several watched paths is listed once, with each path', () => {
	const summary = summarize( [
		{ repo: 'WordPress/gutenberg', path: 'packages/block-library/src/audio', commits: [ commit( 'aaaaaaa1', 'Audio: fix\n\nbody' ) ] },
		{ repo: 'WordPress/gutenberg', path: 'packages/block-library/src/video', commits: [ commit( 'aaaaaaa1', 'Audio: fix' ), commit( 'bbbbbbb2', 'Video: [x] thing \\ end' ) ] },
		{ repo: 'WordPress/wordpress-develop', path: 'src/wp-includes/media.php', commits: [] },
	] );
	assert.deepEqual( [ ...summary.keys() ], [ 'WordPress/gutenberg' ], 'a repository with nothing new is left out' );
	const list = summary.get( 'WordPress/gutenberg' );
	assert.equal( list.length, 2 );
	assert.equal( list[ 0 ].message, 'Audio: fix' );
	assert.deepEqual( list[ 0 ].paths, [ 'packages/block-library/src/audio', 'packages/block-library/src/video' ] );

	const body = issueBody( summary, '2026-10-17T00:00:00.000Z' );
	assert.match( body, /- \[ \] \[`aaaaaaa`\]\(https:\/\/github\.com\/x\/commit\/aaaaaaa1\) Audio: fix/ );
	assert.ok( body.includes( 'Video: \\[x\\] thing \\\\ end' ), 'brackets and backslashes in a message cannot break the checklist' );
} );

test( 'nothing new means nothing to report', () => {
	assert.equal( summarize( [ { repo: 'WordPress/gutenberg', path: 'packages/media-utils', commits: [] } ] ).size, 0 );
} );
