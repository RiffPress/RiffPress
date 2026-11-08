/**
 * The client sends each route as WordPress reads it: the address filled in, the rest in the query
 * for GET and DELETE and as JSON otherwise, and a refusal thrown with WordPress's own code.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, RiffError } from '../client.js';

/**
 * A fetch that records what it was asked and answers with `body`.
 *
 * @param {Object} body   The answer.
 * @param {number} status Its status.
 * @return {Object} `{ calls, fetch }`.
 */
function fake( body = {}, status = 200 ) {
	const calls = [];
	const fetch = async ( url, init ) => {
		calls.push( { url, ...init } );
		return { ok: status < 400, status, statusText: 'Status', text: async () => JSON.stringify( body ) };
	};
	return { calls, fetch };
}

test( 'fills the address and puts the rest in the query, arrays as WordPress reads them', async () => {
	const f = fake( { items: [] } );
	const riff = createClient( { root: 'https://example.com/wp-json/', fetch: f.fetch } );
	await riff.request( 'GET /riff/v1/tracks', { search: 'blue note', include: [ 3, 4 ], page: 2 } );
	assert.equal( f.calls[ 0 ].url, 'https://example.com/wp-json/riff/v1/tracks?search=blue+note&include%5B%5D=3&include%5B%5D=4&page=2' );
	assert.equal( f.calls[ 0 ].method, 'GET' );
	assert.equal( f.calls[ 0 ].body, undefined );

	await riff.request( 'GET /riff/v1/posts/{id}/blocks', { id: 42 } );
	assert.equal( f.calls[ 1 ].url, 'https://example.com/wp-json/riff/v1/posts/42/blocks' );
} );

test( 'sends JSON for a POST, with the nonce', async () => {
	const f = fake( { id: 7 } );
	const riff = createClient( { root: 'https://example.com/wp-json', nonce: 'abc', fetch: f.fetch } );
	const answer = await riff.request( 'POST /riff/v1/users/{user}/playlists', { user: 'me', title: 'Night', tracks: [ 1, 2 ] } );
	assert.deepEqual( answer, { id: 7 } );
	assert.equal( f.calls[ 0 ].url, 'https://example.com/wp-json/riff/v1/users/me/playlists' );
	assert.equal( f.calls[ 0 ].method, 'POST' );
	assert.deepEqual( JSON.parse( f.calls[ 0 ].body ), { title: 'Night', tracks: [ 1, 2 ] } );
	assert.equal( f.calls[ 0 ].headers[ 'X-WP-Nonce' ], 'abc' );
	assert.equal( f.calls[ 0 ].headers[ 'Content-Type' ], 'application/json' );
} );

test( 'works on a site without pretty permalinks', async () => {
	const f = fake( {} );
	const riff = createClient( { root: 'https://example.com/?rest_route=/', fetch: f.fetch } );
	await riff.request( 'GET /riff/v1/albums', { search: 'x' } );
	assert.equal( f.calls[ 0 ].url, 'https://example.com/?rest_route=/riff/v1/albums&search=x' );
} );

test( 'escapes what goes in the address, and refuses an address with a part missing', async () => {
	const f = fake( {} );
	const riff = createClient( { root: '/wp-json/', fetch: f.fetch } );
	await riff.request( 'GET /riff/v1/users/{user}/likes', { user: '../x' } );
	assert.equal( f.calls[ 0 ].url, '/wp-json/riff/v1/users/..%2Fx/likes' );
	await assert.rejects( riff.request( 'GET /riff/v1/posts/{id}/blocks', {} ), /needs id/ );
	await assert.rejects( riff.request( 'nonsense' ), TypeError );
} );

test( 'throws a refusal with WordPress\'s code and status', async () => {
	const f = fake( { code: 'riff_post_blocks_off', message: 'This site does not share its posts\' blocks.', data: { status: 401 } }, 401 );
	const riff = createClient( { root: '/wp-json/', fetch: f.fetch } );
	await assert.rejects( riff.request( 'GET /riff/v1/posts/{id}/blocks', { id: 1 } ), ( e ) => {
		assert.ok( e instanceof RiffError );
		assert.equal( e.code, 'riff_post_blocks_off' );
		assert.equal( e.status, 401 );
		assert.match( e.message, /does not share/ );
		return true;
	} );
} );

test( 'takes the root and the nonce from wpApiSettings in a WordPress page', async () => {
	const f = fake( {} );
	globalThis.wpApiSettings = { root: 'https://site.test/wp-json/', nonce: 'n1' };
	try {
		const riff = createClient( { fetch: f.fetch } );
		assert.equal( riff.root, 'https://site.test/wp-json/' );
		await riff.request( 'GET /riff/v1/library' );
		assert.equal( f.calls[ 0 ].headers[ 'X-WP-Nonce' ], 'n1' );
	} finally {
		delete globalThis.wpApiSettings;
	}
} );
