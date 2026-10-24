/**
 * Block Bindings on the front end: a Heading and an Image bound to riff/track show the post's
 * first track's title and cover, with no Riff block on the page.
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( './own' );

const FIXTURES = path.join( __dirname, '..', '..', '..', '..', 'packages', 'fixtures', 'compositions' );
const made = own();
let postUrl;

test.beforeAll( async ( { requestUtils } ) => {
	const media = await made.media( requestUtils, path.join( FIXTURES, '02 - Underground [underground].mp3' ) );
	const bound = ( block, bindings, inner ) =>
		`<!-- wp:${ block } ${ JSON.stringify( { metadata: { bindings } } ) } -->${ inner }<!-- /wp:${ block } -->`;
	const source = ( key ) => ( { source: 'riff/track', args: { key } } );
	const post = await made.post( requestUtils, {
		title: `Bindings e2e ${ Date.now() }`,
		status: 'publish',
		content:
			bound( 'heading', { content: source( 'title' ) }, '<h2 class="wp-block-heading"></h2>' ) +
			bound( 'paragraph', { content: source( 'quality' ) }, '<p></p>' ) +
			bound( 'image', { url: source( 'cover' ), alt: source( 'artist' ) }, '<figure class="wp-block-image"><img src="" alt=""/></figure>' ) +
			`<!-- wp:audio {"id":${ media.id }} --><figure class="wp-block-audio"><audio controls src="${ media.source_url }"></audio></figure><!-- /wp:audio -->`,
	} );
	postUrl = post.link;
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test( 'a bound heading, paragraph and image show the track', async ( { page } ) => {
	await page.goto( postUrl );
	const content = page.locator( '.entry-content, .wp-block-post-content' ).first();
	await expect( content.locator( 'h2.wp-block-heading' ) ).toHaveText( 'Underground' );
	await expect( content.locator( 'p' ).first() ).toHaveText( 'MP3 · 128 kbps' );
	const img = content.locator( '.wp-block-image img' );
	await expect( img ).toHaveAttribute( 'alt', 'Airmen of Note, United States Air Force Band' );
	await expect( img ).toHaveAttribute( 'src', /riff-art=/ );
	// The cover is a real image the browser could draw.
	await expect.poll( () => img.evaluate( ( el ) => el.naturalWidth ) ).toBeGreaterThan( 0 );
} );
