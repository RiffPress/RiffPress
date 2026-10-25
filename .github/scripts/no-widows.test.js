'use strict';

const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const { widowless } = require( './no-widows.js' );

test( 'joins the last two words of a paragraph, a heading and a list item', () => {
	assert.equal( widowless( '<p>Riff plays your music.</p>' ), '<p>Riff plays your&#160;music.</p>' );
	assert.equal( widowless( '<h2 id="a">From the Media Library to the lock screen</h2>' ), '<h2 id="a">From the Media Library to the lock&#160;screen</h2>' );
	assert.equal( widowless( '<li>Queue, likes and playlists</li>' ), '<li>Queue, likes and&#160;playlists</li>' );
} );

test( 'works through inline markup, and joins at the last space outside a tag', () => {
	assert.equal( widowless( '<p>Read the <a href="x">developer reference</a> first.</p>' ), '<p>Read the <a href="x">developer reference</a>&#160;first.</p>' );
	assert.equal( widowless( '<p>Then add <a href="/add">your music</a></p>' ), '<p>Then add <a href="/add">your&#160;music</a></p>' );
} );

test( 'leaves short blocks, code and preformatted text alone', () => {
	assert.equal( widowless( '<p>Two words</p>' ), '<p>Two words</p>' );
	assert.equal( widowless( '<li><code>riff_track filter here</code></li>' ), '<li><code>riff_track filter here</code></li>' );
	assert.equal( widowless( '<pre>a b c d</pre>' ), '<pre>a b c d</pre>' );
} );
