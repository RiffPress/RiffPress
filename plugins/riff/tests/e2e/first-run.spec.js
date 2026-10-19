/**
 * First run, end to end: activate Riff, create the Listen page from the notice, add the first album,
 * and play it on the new page.
 *
 * The pre-commit hook runs this against the maintainer's own tests site, so it must leave that site
 * as it found it, pass or fail. beforeAll records what it is about to change: whether Riff and Riff
 * Lyrics are active (Lyrics requires Riff, so it has to be off for Riff to be deactivated), and the
 * status of every Listen page already there, which go to draft so the notice offers a new one.
 * restore() puts each of those back and deletes only what the test made; it runs after each test,
 * failed or not, and again after all of them, and is safe to run twice.
 *
 * "No music yet" is the riff_test_no_music cookie, which the tests-only components plugin reads to
 * hide the site's music from that browser, so nobody's media is touched.
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
const RIFF = 'riff/riff';
const LYRICS = 'riff-lyrics/riff-lyrics';
const NO_MUSIC = 'riff_test_no_music';

const made = own();
// What the site looked like before: plugin statuses by id, and Listen pages by id with their status.
const before = { plugins: {}, listen: new Map() };

const isListenPage = ( page ) =>
	page.content.raw.includes( '<!-- wp:riff/app' ) ||
	'listen' === page.template;

const listenPages = async ( requestUtils ) =>
	(
		await requestUtils.rest( {
			path: '/wp/v2/pages',
			params: {
				per_page: 100,
				status: 'publish,future,draft,pending,private',
				context: 'edit',
			},
		} )
	).filter( isListenPage );

const pluginStatus = ( requestUtils, plugin ) =>
	requestUtils
		.rest( { path: `/wp/v2/plugins/${ plugin }` } )
		.then( ( p ) => p.status )
		.catch( () => null );

const setPlugin = ( requestUtils, plugin, status ) =>
	requestUtils.rest( {
		method: 'PUT',
		path: `/wp/v2/plugins/${ plugin }`,
		data: { status },
	} );

/**
 * Puts the site back the way beforeAll found it. Each step runs even if an earlier one throws.
 *
 * @param {Object} requestUtils The REST helper.
 */
async function restore( requestUtils ) {
	const steps = [
		// Riff first: the REST routes below are core's, but Lyrics can't be activated without it.
		async () => {
			if (
				before.plugins[ RIFF ] === 'active' &&
				( await pluginStatus( requestUtils, RIFF ) ) !== 'active'
			) {
				await setPlugin( requestUtils, RIFF, 'active' );
			}
		},
		async () => {
			if (
				before.plugins[ LYRICS ] === 'active' &&
				( await pluginStatus( requestUtils, LYRICS ) ) !== 'active'
			) {
				await setPlugin( requestUtils, LYRICS, 'active' );
			}
		},
		// A Listen page that wasn't there before is the one the button made.
		async () => {
			for ( const page of await listenPages( requestUtils ) ) {
				if ( ! before.listen.has( page.id ) ) {
					await requestUtils.rest( {
						method: 'DELETE',
						path: `/wp/v2/pages/${ page.id }`,
						params: { force: true },
					} );
				}
			}
		},
		async () => {
			for ( const [ id, status ] of before.listen ) {
				await requestUtils.rest( {
					method: 'POST',
					path: `/wp/v2/pages/${ id }`,
					data: { status },
				} );
			}
		},
		() => made.cleanUp( requestUtils ),
	];
	const errors = [];
	for ( const step of steps ) {
		await step().catch( ( error ) => errors.push( error ) );
	}
	if ( errors.length ) {
		throw errors[ 0 ];
	}
}

test.describe( 'First run', () => {
	test.beforeAll( async ( { requestUtils } ) => {
		for ( const plugin of [ RIFF, LYRICS ] ) {
			before.plugins[ plugin ] = await pluginStatus( requestUtils, plugin );
		}
		for ( const page of await listenPages( requestUtils ) ) {
			before.listen.set( page.id, page.status );
		}
		// Published Listen pages go to draft, so the site has none a visitor can reach.
		for ( const [ id, status ] of before.listen ) {
			if ( status === 'publish' ) {
				await requestUtils.rest( {
					method: 'POST',
					path: `/wp/v2/pages/${ id }`,
					data: { status: 'draft' },
				} );
			}
		}
		if ( before.plugins[ LYRICS ] === 'active' ) {
			await setPlugin( requestUtils, LYRICS, 'inactive' );
		}
	} );

	test.afterEach( async ( { requestUtils } ) => {
		await restore( requestUtils );
	} );

	test.afterAll( async ( { requestUtils } ) => {
		await restore( requestUtils );
	} );

	test( 'from activation to a playing album', async ( {
		page,
		admin,
		requestUtils,
		baseURL,
	} ) => {
		await page
			.context()
			.addCookies( [ { name: NO_MUSIC, value: '1', url: baseURL } ] );

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

		const listen = ( await listenPages( requestUtils ) ).find(
			( p ) => p.status === 'publish'
		);
		expect( listen, 'the button made a Listen page' ).toBeTruthy();

		// With no music yet the notice points at the page and the first album, and so does the page.
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
		await page.context().clearCookies( { name: NO_MUSIC } );

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
