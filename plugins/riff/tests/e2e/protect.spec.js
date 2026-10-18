/**
 * Protected files: the Media Library box moves a file behind ?riff-file=ID, which plays and seeks
 * for whoever may play it and refuses everyone else.
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( './own' );

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

const made = own();
let open;
let hidden;
let openPost;

const block = ( media ) =>
	`<!-- wp:audio {"id":${ media.id }} --><figure class="wp-block-audio"><audio controls src="${ media.source_url }"></audio></figure><!-- /wp:audio -->`;

test.beforeAll( async ( { requestUtils } ) => {
	open = await made.media(
		requestUtils,
		path.join( FIXTURES, '02 - Underground [underground].mp3' )
	);
	hidden = await made.media(
		requestUtils,
		path.join( FIXTURES, '03 - Trombone Detritus [detritus].mp3' )
	);
	openPost = await made.post( requestUtils, {
		title: 'Protected, and published',
		status: 'publish',
		content: block( open ),
	} );
	const privatePost = await made.post( requestUtils, {
		title: 'Protected, and private',
		status: 'private',
		content: block( hidden ),
	} );
	for ( const [ media, post ] of [
		[ open, openPost ],
		[ hidden, privatePost ],
	] ) {
		await requestUtils.rest( {
			method: 'POST',
			path: `/wp/v2/media/${ media.id }`,
			data: { post: post.id },
		} );
	}
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

/**
 * Ticks Protected on a file's edit screen and saves.
 *
 * @param {Object} admin The admin fixture.
 * @param {Object} page  The page.
 * @param {Object} media The attachment.
 */
async function protect( admin, page, media ) {
	await admin.visitAdminPage( 'post.php', `post=${ media.id }&action=edit` );
	await page.locator( `#attachments-${ media.id }-riff_protected` ).check();
	await page.locator( '#publish' ).click();
	await expect( page.locator( '#message' ) ).toBeVisible();
}

test( 'a protected file plays and seeks through WordPress, and its post links to the new address', { tag: '@smoke' }, async ( {
	admin,
	page,
	requestUtils,
	request,
} ) => {
	await protect( admin, page, open );
	const media = await requestUtils.rest( {
		path: `/wp/v2/media/${ open.id }`,
	} );
	expect( media.source_url ).toContain( `riff-file=${ open.id }` );
	expect(
		( await request.get( open.source_url ) ).status(),
		'the old address no longer serves the file'
	).not.toBe( 200 );

	await page.goto( openPost.link );
	await expect( page.locator( '.wp-block-audio audio' ) ).toHaveAttribute(
		'src',
		new RegExp( `riff-file=${ open.id }` )
	);
	const ranged = page.waitForResponse(
		( r ) => r.url().includes( 'riff-file=' ) && r.status() === 206
	);
	await page.locator( '.riff-row' ).first().click();
	await ranged;
	await expect
		.poll( () => page.evaluate( () => window.riff.playing() ), {
			timeout: 15000,
		} )
		.toBe( true );
	await page.evaluate( () => window.riff.seek( 120 ) );
	await expect
		.poll( () =>
			page.evaluate( () => document.querySelector( '.riff-audio' ).currentTime )
		)
		.toBeGreaterThanOrEqual( 120 );

	const part = await request.get( media.source_url, {
		headers: { Range: 'bytes=100-199' },
	} );
	expect( part.status() ).toBe( 206 );
	expect( part.headers()[ 'content-range' ] ).toMatch( /^bytes 100-199\/\d+$/ );
	expect( ( await part.body() ).length ).toBe( 100 );
} );

test( 'a private post\'s protected file is refused to a visitor, and a signed address lets the player through', async ( {
	admin,
	page,
	requestUtils,
	playwright,
	baseURL,
} ) => {
	await protect( admin, page, hidden );
	const media = await requestUtils.rest( {
		path: `/wp/v2/media/${ hidden.id }`,
		params: { context: 'edit' },
	} );
	// No cookies: the suite's own requests are signed in.
	const visitor = await playwright.request.newContext( {
		baseURL,
		storageState: { cookies: [], origins: [] },
	} );

	expect( ( await visitor.get( media.source_url ) ).status() ).toBe( 403 );

	const signed = media.riff_track.src;
	expect( signed ).toContain( 'riff-sig=' );
	const answer = await visitor.get( signed, {
		headers: { Range: 'bytes=0-9' },
	} );
	expect( answer.status() ).toBe( 206 );
	expect(
		( await visitor.get( signed.replace( /riff-sig=[^&]+/, 'riff-sig=0' ) ) ).status(),
		'a forged signature'
	).toBe( 403 );
	await visitor.dispose();
} );
