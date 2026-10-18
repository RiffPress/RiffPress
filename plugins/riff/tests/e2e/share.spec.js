/**
 * A link to one track: Share names the track on its post's address, and arriving by that link shows
 * the track without playing it or touching what is already playing.
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

let postUrl;
let postId;
let otherUrl;
let listenUrl;

const block = ( m, withId = true ) =>
	`<!-- wp:audio ${
		withId ? `{"id":${ m.id }} ` : ''
	}--><figure class="wp-block-audio"><audio controls src="${
		m.source_url
	}"></audio></figure><!-- /wp:audio -->`;

const made = own();

test.beforeAll( async ( { requestUtils } ) => {
	const media = [];
	for ( const file of [
		'02 - Underground [underground].mp3',
		'03 - Trombone Detritus [detritus].mp3',
		'04 - It\'s a Brand New Day [new-day].mp3',
	] ) {
		media.push(
			await made.media( requestUtils, path.join( FIXTURES, file ) )
		);
	}
	// An attachment, a bare address, and the first file again.
	const post = await made.post( requestUtils, {
		title: `Riff share e2e ${ Date.now() }`,
		status: 'publish',
		content: block( media[ 0 ] ) + block( media[ 1 ], false ) + block( media[ 0 ] ),
	} );
	postUrl = post.link;
	postId = post.id;
	const other = await made.post( requestUtils, {
		title: 'Riff share elsewhere',
		status: 'publish',
		content: block( media[ 2 ] ),
	} );
	otherUrl = other.link;
	const listen = await made.page( requestUtils, {
		title: 'Listen share e2e',
		status: 'publish',
		content: '<!-- wp:riff/app {"align":"full"} /-->',
	} );
	listenUrl = listen.link;
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

// The track IDs of the post's rows, in order.
const ids = ( page ) =>
	page.evaluate( () =>
		[ ...document.querySelectorAll( 'figure[data-riff-track]' ) ].map(
			( f ) => JSON.parse( f.dataset.riffTrack ).id
		)
	);

const playing = ( page ) =>
	page.evaluate( () => ! document.querySelector( '.riff-audio' ).paused );

const withTrack = ( url, id ) => {
	const u = new URL( url );
	u.searchParams.set( 'riff_track', id );
	return u.toString();
};

test.describe( 'Sharing a track', () => {
	// Share is one of the chips under Now Playing's controls, which show at phone width.
	test.use( { viewport: { width: 390, height: 844 } } );

	test.beforeEach( async ( { page } ) => {
		// The clipboard, without the system sheet, so the link can be read back.
		await page.addInitScript( () => {
			delete Navigator.prototype.share;
			window.copied = [];
			navigator.clipboard.writeText = async ( text ) => {
				window.copied.push( text );
			};
		} );
	} );

	test( 'Share copies the post with the track named, for an attachment and an address', async ( {
		page,
	} ) => {
		await page.goto( postUrl );
		const [ first, second ] = await ids( page );
		expect( second ).toMatch( /^url:/ );

		for ( const [ i, id ] of [
			[ 0, first ],
			[ 1, second ],
		] ) {
			await page.locator( '.riff-row' ).nth( i ).click();
			await page.locator( '.riff-bar-info' ).click();
			await page
				.locator( '.riff-np [data-riff-action="share"]' )
				.click();
			await expect( page.locator( '.riff-toast' ) ).toHaveText(
				'Link copied'
			);
			const link = await page.evaluate( () => window.copied.at( -1 ) );
			expect( new URL( link ).searchParams.get( 'riff_track' ) ).toBe(
				id
			);
			expect( link.split( '?' )[ 0 ] ).toBe( postUrl.split( '?' )[ 0 ] );
			await page.keyboard.press( 'Escape' );
		}
	} );

	test( 'a dismissed share sheet says nothing; a failed copy says so', async ( {
		page,
	} ) => {
		await page.addInitScript( () => {
			Navigator.prototype.share = () =>
				Promise.reject(
					new DOMException( 'dismissed', 'AbortError' )
				);
		} );
		await page.goto( postUrl );
		await page.locator( '.riff-row' ).first().click();
		await page.locator( '.riff-bar-info' ).click();
		await page.locator( '.riff-np [data-riff-action="share"]' ).click();
		await expect( page.locator( '.riff-toast' ) ).toBeHidden();
		expect( await page.evaluate( () => window.copied.length ) ).toBe( 0 );

		await page.evaluate( () => {
			Navigator.prototype.share = undefined;
			navigator.clipboard.writeText = () =>
				Promise.reject( new Error( 'denied' ) );
		} );
		await page.locator( '.riff-np [data-riff-action="share"]' ).click();
		await expect( page.locator( '.riff-toast' ) ).toHaveText(
			'The link could not be shared.'
		);
	} );
} );

test.describe( 'Arriving by a shared link', () => {
	test( 'the track is shown and focused, and nothing plays', async ( {
		page,
	} ) => {
		await page.goto( postUrl );
		const [ , second ] = await ids( page );
		await page.goto( withTrack( postUrl, second ) );
		const row = page.locator( '.riff-row' ).nth( 1 );
		await expect( row ).toHaveAttribute( 'data-shared', '' );
		await expect( row ).toBeFocused();
		await expect( row ).toBeInViewport();
		expect( await playing( page ) ).toBe( false );

		await page.reload();
		await expect( page.locator( '.riff-row' ).nth( 1 ) ).toBeFocused();
	} );

	test( 'the same file twice opens on the first', async ( { page } ) => {
		await page.goto( postUrl );
		const [ first ] = await ids( page );
		await page.goto( withTrack( postUrl, first ) );
		await expect( page.locator( '.riff-row[data-shared]' ) ).toHaveCount( 1 );
		await expect( page.locator( '.riff-row' ).first() ).toHaveAttribute(
			'data-shared',
			''
		);
	} );

	test( 'what is already playing carries on', async ( { page } ) => {
		await page.goto( postUrl );
		const [ , second ] = await ids( page );
		await page.goto( otherUrl );
		await page.locator( '.riff-row' ).first().click();
		await expect.poll( () => playing( page ) ).toBe( true );
		const title = page.locator( '.riff-bar .riff-title' );
		const before = await title.textContent();

		// Followed as a link, the way a listener would, so the browser lets the music resume.
		await page.evaluate( ( href ) => {
			const a = document.createElement( 'a' );
			a.href = href;
			a.textContent = 'shared';
			a.id = 'shared-link';
			document.body.prepend( a );
		}, withTrack( postUrl, second ) );
		await page.locator( '#shared-link' ).click();
		await expect( page.locator( '.riff-row' ).nth( 1 ) ).toBeFocused();
		await expect( title ).toHaveText( before );
		await expect.poll( () => playing( page ) ).toBe( true );
		await expect( page.locator( '.riff-row[data-current]' ) ).toHaveCount(
			0
		);
	} );

	test( 'a track that is gone leaves the post as it was, with a notice', async ( {
		page,
	} ) => {
		await page.goto( withTrack( postUrl, 'url:0000' ) );
		await expect( page.locator( '.riff-toast' ) ).toHaveText(
			'The shared track is no longer in this post.'
		);
		await expect( page.locator( '.riff-row' ) ).toHaveCount( 3 );
		await expect( page.locator( '.riff-row[data-shared]' ) ).toHaveCount( 0 );
	} );

	test( 'Listen opens the post on the same track and keeps working', async ( {
		page,
	} ) => {
		await page.goto( postUrl );
		const [ , second ] = await ids( page );
		const u = new URL( listenUrl );
		u.searchParams.set( 'riff', String( postId ) );
		u.searchParams.set( 'riff_track', second );
		await page.goto( u.toString() );
		await expect( page.locator( '.riff-row' ).nth( 1 ) ).toBeFocused();

		await page.locator( '.riff-app-home' ).click();
		await expect( page.locator( '[data-riff-shelf="added"]' ) ).toBeVisible();
		await expect( page ).toHaveURL( listenUrl );
	} );
} );
