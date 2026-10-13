/**
 * The app, end to end: a page holding the block, a post opened inside it, the music carrying on
 * while the listener moves between the library and the post.
 *
 * Runs on desktop and on an iPhone viewport (see playwright.config.js).
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

const FIXTURES = path.join(
	__dirname,
	'..',
	'..',
	'..',
	'..',
	'packages',
	'fixtures',
	'compositions'
);
const FILES = [
	'02 - Underground [underground].mp3',
	'03 - Trombone Detritus [detritus].mp3',
];

let pageUrl;
let postId;

test.beforeAll( async ( { requestUtils } ) => {
	const cover = await requestUtils.uploadMedia(
		path.join( FIXTURES, 'cover.png' )
	);
	const audio = [];
	for ( const file of FILES ) {
		const media = await requestUtils.uploadMedia(
			path.join( FIXTURES, file )
		);
		await requestUtils.rest( {
			method: 'POST',
			path: `/wp/v2/media/${ media.id }`,
			data: { featured_media: cover.id },
		} );
		audio.push( media );
	}
	const post = await requestUtils.createPost( {
		title: `Riff app e2e ${ Date.now() }`,
		status: 'publish',
		content: audio
			.map(
				( m ) =>
					`<!-- wp:audio {"id":${ m.id }} --><figure class="wp-block-audio"><audio controls src="${ m.source_url }"></audio></figure><!-- /wp:audio -->`
			)
			.join( '' ),
		featured_media: cover.id,
	} );
	postId = post.id;
	const page = await requestUtils.createPage( {
		title: 'Listen e2e',
		status: 'publish',
		content: '<!-- wp:riff/app {"align":"full"} /-->',
	} );
	pageUrl = page.link;
} );

test.afterAll( async ( { requestUtils } ) => {
	await requestUtils.deleteAllPages();
	await requestUtils.deleteAllPosts();
	await requestUtils.deleteAllMedia();
} );

const playing = ( page ) =>
	page.evaluate( () => {
		const a = document.querySelector( '.riff-audio' );
		return { paused: a.paused, time: a.currentTime };
	} );

test.describe( 'App', () => {
	test.beforeEach( async ( { page } ) => {
		await page.goto( pageUrl );
	} );

	test( 'the page lists the library and opens a post without leaving', async ( {
		page,
	} ) => {
		const card = page.locator( `.riff-card[data-riff-post="${ postId }"]` );
		await expect( card ).toContainText( '2 tracks' );
		await card.click();
		await expect( page ).toHaveURL( new RegExp( `riff=${ postId }$` ) );
		await expect( page.locator( '.riff-album-title' ) ).toContainText(
			'Riff app e2e'
		);
		await expect( page.locator( '.riff-row' ) ).toHaveCount( 2 );
		await expect(
			page.locator( '.riff-app' ),
			'the app swapped the view in rather than loading a page'
		).toHaveJSProperty( 'isConnected', true );
	} );

	test( 'the music carries on from the post to the library and back', async ( {
		page,
	} ) => {
		await page.locator( `.riff-card[data-riff-post="${ postId }"]` ).click();
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect
			.poll( async () => ( await playing( page ) ).time )
			.toBeGreaterThan( 1 );
		const audio = await page.evaluateHandle( () =>
			document.querySelector( '.riff-audio' )
		);

		await page.locator( '.riff-app-home' ).click();
		await expect( page ).toHaveURL( pageUrl );
		await expect( page.locator( '.riff-grid' ) ).toBeVisible();
		expect( ( await playing( page ) ).paused ).toBe( false );
		expect(
			await page.evaluate(
				( el ) => el === document.querySelector( '.riff-audio' ),
				audio
			),
			'the same audio element is still playing'
		).toBe( true );

		await page.goBack();
		await expect( page.locator( '.riff-row' ) ).toHaveCount( 2 );
		await expect( page.locator( '.riff-row' ).nth( 1 ) ).toHaveAttribute(
			'data-playing',
			'true'
		);
		expect( ( await playing( page ) ).paused ).toBe( false );
	} );

	test( 'Play and Shuffle start the post from its header', async ( {
		page,
	} ) => {
		await page.goto( `${ pageUrl }?riff=${ postId }` );
		await page.locator( '[data-riff-app-action="play"]' ).click();
		await expect
			.poll( async () => ( await playing( page ) ).paused )
			.toBe( false );
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Underground'
		);
		await page.locator( '[data-riff-app-action="shuffle"]' ).click();
		await expect(
			page.locator( '.riff-bar [data-riff-action="shuffle"]' )
		).toHaveAttribute( 'aria-pressed', 'true' );
	} );
} );
