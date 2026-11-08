/**
 * The example renderer draws a post with an album as email-safe HTML: tables and inline styles,
 * the album as a cover and a track list, nothing a mail client would refuse or run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderEmail, safe, length } from '../examples/email.js';

const track = ( n, extra = {} ) => ( {
	id: String( 100 + n ),
	src: `https://example.com/wp-content/uploads/${ n }.mp3`,
	type: 'audio',
	title: `Song ${ n }`,
	artist: 'The Band',
	album: 'Night Music',
	year: 1959,
	disc: 1,
	duration: 125 + n,
	lang: '',
	format: 'mp3',
	bitrate: 320,
	lossless: false,
	bits: 0,
	rate: 44100,
	levels: '',
	art: [ { src: 'https://example.com/cover-150.jpg', sizes: '150x150', alt: 'Night Music by The Band' }, { src: 'https://example.com/cover-600.jpg', sizes: '600x600', alt: 'Night Music by The Band' } ],
	captions: [],
	video: null,
	post: { id: 42, title: 'Night Music', url: 'https://example.com/night-music/' },
	locked: false,
	unlock: '',
	...extra,
} );

const block = ( blockName, extra = {} ) => ( { blockName, attrs: {}, innerBlocks: [], innerHTML: '', innerContent: [], ...extra } );

const post = {
	id: 42,
	type: 'post',
	title: 'Night Music & more',
	url: 'https://example.com/night-music/',
	modified: '2026-11-01T10:00:00+00:00',
	blocks: [
		block( 'core/paragraph', { innerHTML: '<p class="x" onclick="steal()">Recorded <strong>live</strong>, <a href="javascript:alert(1)">bad</a> and <a href="https://example.com/notes/">notes</a>.</p>', innerContent: [ '<p class="x" onclick="steal()">Recorded <strong>live</strong>, <a href="javascript:alert(1)">bad</a> and <a href="https://example.com/notes/">notes</a>.</p>' ] } ),
		block( 'core/playlist', {
			innerHTML: '<figure class="wp-block-playlist"></figure>',
			innerContent: [ '<figure class="wp-block-playlist">', null, null, null, '</figure>' ],
			innerBlocks: [
				block( 'core/playlist-track', { attrs: { id: 101 }, track: track( 1 ) } ),
				block( 'core/playlist-track', { attrs: { id: 102 }, track: track( 2, { locked: true, src: '', unlock: 'https://example.com/join/' } ) } ),
				block( 'core/playlist-track', { attrs: { id: 103 }, track: null } ),
			],
		} ),
		block( 'core/group', {
			innerHTML: '<div class="wp-block-group"></div>',
			innerContent: [ '<div class="wp-block-group">', null, '<script>alert(1)</script>', null, '</div>' ],
			innerBlocks: [
				block( 'core/heading', { innerHTML: '<h2 class="wp-block-heading">Liner notes</h2>', innerContent: [ '<h2 class="wp-block-heading">Liner notes</h2>' ] } ),
				block( 'core/image', { innerHTML: '<figure class="wp-block-image"><img src="https://example.com/band.jpg" alt="The band" width="600" class="wp-image-9"/><figcaption>On stage</figcaption></figure>', innerContent: [ '<figure class="wp-block-image"><img src="https://example.com/band.jpg" alt="The band" width="600" class="wp-image-9"/><figcaption>On stage</figcaption></figure>' ] } ),
			],
		} ),
		block( 'core/audio', { attrs: { id: 104 }, innerHTML: '<figure class="wp-block-audio"><audio controls src="https://example.com/4.mp3"></audio></figure>', innerContent: [ '<figure class="wp-block-audio"><audio controls src="https://example.com/4.mp3"></audio></figure>' ], track: track( 4, { album: 'Encore' } ) } ),
		block( 'core/audio', { attrs: { id: 105 }, innerHTML: '<figure class="wp-block-audio"><audio controls src="https://example.com/5.mp3"></audio></figure>', innerContent: [ '<figure class="wp-block-audio"><audio controls src="https://example.com/5.mp3"></audio></figure>' ], track: track( 5, { album: 'Encore' } ) } ),
	],
};

test( 'draws the album as a cover, its name and artist, and its tracks with their lengths', () => {
	const html = renderEmail( post );
	assert.match( html, /<img src="https:\/\/example\.com\/cover-600\.jpg" width="120" height="120" alt="Night Music by The Band"/ );
	assert.match( html, />Night Music<\/div>/ );
	assert.match( html, />The Band<\/div>/ );
	assert.match( html, /2 tracks · 4:13/ );
	// Each title opens the track on the site, as the player shares it.
	assert.match( html, /<a href="https:\/\/example\.com\/night-music\/\?riff_track=101"[^>]*>Song 1<\/a>/ );
	assert.match( html, />2:06</ );
	// A locked track links to where it is unlocked, and has no file.
	assert.match( html, /<a href="https:\/\/example\.com\/join\/"[^>]*>Song 2<\/a><div[^>]*>Unlock to listen<\/div>/ );
	assert.doesNotMatch( html, /\.mp3/ );
} );

test( 'audio blocks side by side are one album', () => {
	const html = renderEmail( post );
	assert.match( html, />Encore<\/div>/ );
	assert.match( html, />Song 4<\/a>[\s\S]*>Song 5<\/a>/ );
	assert.equal( ( html.match( />Encore<\/div>/g ) || [] ).length, 1 );
} );

test( 'keeps the post\'s text and images in order, inside a group too, and nothing a mail client would run', () => {
	const html = renderEmail( post );
	assert.ok( html.indexOf( 'Recorded' ) < html.indexOf( 'Song 1' ) );
	assert.ok( html.indexOf( 'Song 1' ) < html.indexOf( 'Liner notes' ) );
	assert.ok( html.indexOf( 'Liner notes' ) < html.indexOf( 'band.jpg' ) );
	assert.match( html, /<h2 style="[^"]+">Liner notes<\/h2>/ );
	assert.match( html, /<img src="https:\/\/example\.com\/band\.jpg" alt="The band" width="600" style="[^"]+" \/>/ );
	assert.match( html, /<a href="https:\/\/example\.com\/notes\/" style="[^"]+">notes<\/a>/ );
	assert.match( html, /<title>Night Music &amp; more<\/title>/ );
	for ( const bad of [ /<script/i, /onclick/i, /javascript:/i, /<audio/i, /class=/, /<div class/ ] ) {
		assert.doesNotMatch( html, bad );
	}
} );

test( 'safe() keeps a short list of tags and attributes, and escapes a stray bracket', () => {
	assert.equal( safe( '<p>a <b>b</b> <span style="x">c</span></p>' ), '<p style="margin:0 0 16px;line-height:1.6;">a <b>b</b> c</p>' );
	assert.equal( safe( '<a href="https://x.test/?a=1&amp;b=2" title="t">x</a>' ), '<a href="https://x.test/?a=1&amp;b=2" style="color:#1c1c1c;text-decoration:underline;">x</a>' );
	assert.equal( safe( '<img src="data:image/png;base64,AAA" alt="x">' ), '<img alt="x" style="display:block;max-width:100%;height:auto;border:0;" />' );
	assert.equal( safe( '1 < 2 <iframe src="https://x.test"></iframe>' ), '1 &lt; 2 ' );
	assert.equal( safe( '<!-- wp:paragraph -->' ), '' );
} );

test( 'safe() lets no script through markup built to survive a pass, and decodes an attribute once', () => {
	for ( const html of [
		'<scr<script></script>ipt>alert(1)</script>',
		'<<script>script>alert(1)<</script>/script>',
		'<!-<!-- -->- <script>alert(1)</script> -->',
		'<!-- never closed <script>alert(1)</script>',
		'<script>alert(1)',
		'<svg><script>alert(1)</script></svg><p>after</p>',
	] ) {
		const out = safe( html );
		assert.doesNotMatch( out, /<script|<svg/i, html );
		assert.doesNotMatch( out, /<[a-z]+[^>]*on\w+=/i, html );
	}
	assert.equal( safe( '<svg><script>x</script></svg><p>after</p>' ), '<p style="margin:0 0 16px;line-height:1.6;">after</p>' );
	// &amp;quot; is the text &quot;, never a quote that could end the attribute.
	assert.equal( safe( '<a href="https://x.test/?q=&amp;quot;">x</a>' ), '<a href="https://x.test/?q=&amp;quot;" style="color:#1c1c1c;text-decoration:underline;">x</a>' );
} );

test( 'safe() takes time in proportion to the markup, however it repeats', () => {
	for ( const piece of [ '<!--', '<script>', '<', '<a ', '<p>' ] ) {
		const html = piece.repeat( 50000 );
		const started = performance.now();
		safe( html );
		assert.ok( performance.now() - started < 1000, `${ piece } × 50,000` );
	}
} );

test( 'a length is m:ss, or nothing when unknown', () => {
	assert.equal( length( 125.4 ), '2:05' );
	assert.equal( length( 0 ), '' );
} );
