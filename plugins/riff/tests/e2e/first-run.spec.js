/**
 * First run, end to end: activate Riff, create the Listen page from the notice, add the first album,
 * and play it on the new page.
 *
 * The tests site is shared with the other specs and with people, so this one makes it look fresh
 * and puts it back: Listen pages that already exist go to draft while it runs, and Riff Lyrics,
 * which requires Riff and so keeps it from being deactivated, is switched off and on again.
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
const FILES = [
	'02 - Underground [underground].mp3',
	'03 - Trombone Detritus [detritus].mp3',
];
const LYRICS = 'riff-lyrics/riff-lyrics';

const made = own();
let drafted = [];
let created = 0;
let lyricsWasActive = false;

const isListenPage = ( page ) =>
	page.content.raw.includes( '<!-- wp:riff/app' ) ||
	'listen' === page.template;

test.describe( 'First run', () => {
	test.beforeAll( async ( { requestUtils } ) => {
		const pages = await requestUtils.rest( {
			path: '/wp/v2/pages',
			params: { per_page: 100, status: 'publish', context: 'edit' },
		} );
		drafted = pages.filter( isListenPage ).map( ( p ) => p.id );
		for ( const id of drafted ) {
			await requestUtils.rest( {
				method: 'POST',
				path: `/wp/v2/pages/${ id }`,
				data: { status: 'draft' },
			} );
		}
		const lyrics = await requestUtils
			.rest( { path: `/wp/v2/plugins/${ LYRICS }` } )
			.catch( () => null );
		lyricsWasActive = lyrics?.status === 'active';
		if ( lyricsWasActive ) {
			await requestUtils.rest( {
				method: 'PUT',
				path: `/wp/v2/plugins/${ LYRICS }`,
				data: { status: 'inactive' },
			} );
		}
	} );

	test.afterAll( async ( { requestUtils } ) => {
		if ( created ) {
			await requestUtils
				.rest( {
					method: 'DELETE',
					path: `/wp/v2/pages/${ created }`,
					params: { force: true },
				} )
				.catch( () => {} );
		}
		await made.cleanUp( requestUtils );
		for ( const id of drafted ) {
			await requestUtils.rest( {
				method: 'POST',
				path: `/wp/v2/pages/${ id }`,
				data: { status: 'publish' },
			} );
		}
		if ( lyricsWasActive ) {
			await requestUtils.rest( {
				method: 'PUT',
				path: `/wp/v2/plugins/${ LYRICS }`,
				data: { status: 'active' },
			} );
		}
	} );

	test( 'from activation to a playing album', async ( {
		page,
		admin,
		requestUtils,
	} ) => {
		const audio = await requestUtils.rest( {
			path: '/wp/v2/media',
			params: { media_type: 'audio', per_page: 1 },
		} );
		// A first run is a site with no music; a tests site seeded with some has nothing to show here.
		test.skip( audio.length > 0, 'the site already has music' );

		// Activation, from the Plugins screen.
		await admin.visitAdminPage( 'plugins.php' );
		const row = () => page.locator( 'tr[data-plugin="riff/riff.php"]' );
		await row().locator( '.deactivate a' ).click();
		await row().locator( '.activate a' ).click();
		await expect( row().locator( '.deactivate a' ) ).toBeVisible();

		// The notice offers the page, and the first album.
		const notice = page.locator( '.notice.riff-first-run' );
		await expect( notice ).toBeVisible();
		await expect( notice ).toHaveClass( /is-dismissible/ );
		await expect(
			notice.getByRole( 'link', { name: 'Add your first album' } )
		).toHaveAttribute( 'href', /media-new\.php/ );
		await notice
			.getByRole( 'link', { name: 'Create Listen page' } )
			.click();
		await expect( page ).toHaveURL( /plugins\.php/ );

		const pages = await requestUtils.rest( {
			path: '/wp/v2/pages',
			params: { per_page: 100, status: 'publish', context: 'edit' },
		} );
		const listen = pages.find( isListenPage );
		expect( listen, 'the button made a Listen page' ).toBeTruthy();
		created = listen.id;

		// With no music yet the notice now points at the page and the first album, and so does the page.
		await expect( notice ).toContainText( 'Add your first album' );
		await expect(
			notice.getByRole( 'link', { name: listen.title.raw } )
		).toHaveAttribute( 'href', listen.link );
		await page.goto( listen.link );
		await expect(
			page.locator( '.riff-app-empty' ).getByRole( 'link', {
				name: 'Add your first album',
			} )
		).toBeVisible();

		// The first album: what the Media Library's uploader does, file by file.
		for ( const file of FILES ) {
			await made.media( requestUtils, path.join( FIXTURES, file ) );
		}

		// Both done: the notice is gone.
		await admin.visitAdminPage( 'index.php' );
		await expect( page.locator( '.notice.riff-first-run' ) ).toHaveCount(
			0
		);

		// The album plays on the new page.
		await page.goto( listen.link );
		await page
			.locator( '.riff-card[data-riff-album]', {
				hasText: 'Compositions',
			} )
			.first()
			.locator( '.riff-card-link' )
			.click();
		await expect( page.locator( '.riff-row' ).first() ).toBeVisible();
		await page.locator( '[data-riff-app-action="play"]' ).click();
		await expect
			.poll( () =>
				page.evaluate(
					() => document.querySelector( '.riff-audio' ).paused
				)
			)
			.toBe( false );
	} );
} );
