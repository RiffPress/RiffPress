/**
 * Adding music from the Listen app, for someone who may upload: chosen or dropped, sent through
 * WordPress's own media route, and what the library already has is skipped.
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { appSite } = require( '../helpers/site' );

const made = own();
const TONE = fs.readFileSync(
	path.join( __dirname, '../../../../../packages/fixtures/test/tone.mp3' )
);
let pageUrl;
const uploads = [];

test.beforeAll( async ( { requestUtils } ) => {
	( { pageUrl } = await appSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	for ( const id of uploads ) {
		await requestUtils
			.rest( {
				method: 'DELETE',
				path: `/wp/v2/media/${ id }`,
				params: { force: true },
			} )
			.catch( () => {} );
	}
	await made.cleanUp( requestUtils );
} );

const named = async ( requestUtils, name ) => {
	const found = await requestUtils.rest( {
		path: '/wp/v2/media',
		params: { search: name, media_type: 'audio' },
	} );
	found.forEach(
		( media ) => uploads.includes( media.id ) || uploads.push( media.id )
	);
	return found;
};

test.describe( 'Adding music', () => {
	test.beforeEach( async ( { page } ) => {
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + 'app/' );
	} );

	test( 'a chosen file goes to the Media Library, and is skipped the second time', async ( {
		page,
		requestUtils,
	} ) => {
		const status = page.locator( '.riff-app-status' );
		const file = {
			name: 'Chosen Song ñ.mp3',
			mimeType: 'audio/mpeg',
			buffer: TONE,
		};
		const picker = page.locator( 'input[data-riff-add-music]' );
		await picker.setInputFiles( file );
		await expect( status ).toHaveText( '1 track added.', {
			timeout: 20000,
		} );
		expect( await named( requestUtils, 'Chosen Song' ) ).toHaveLength( 1 );

		await picker.setInputFiles( file );
		await expect( status ).toHaveText( '1 was already here.', {
			timeout: 20000,
		} );
		expect( await named( requestUtils, 'Chosen Song' ) ).toHaveLength( 1 );

		// A name the server's headers or a URL would trip on, and the same again, which a search for
		// its title would miss.
		const awkward = {
			name: "100% Love; Live (Don't Stop).mp3",
			mimeType: 'audio/mpeg',
			buffer: TONE,
		};
		await picker.setInputFiles( awkward );
		await expect( status ).toHaveText( '1 track added.', {
			timeout: 20000,
		} );
		await picker.setInputFiles( awkward );
		await expect( status ).toHaveText( '1 was already here.', {
			timeout: 20000,
		} );
		uploads.push(
			...(
				await requestUtils.rest( {
					path: '/wp/v2/media',
					params: {
						media_type: 'audio',
						search: 'Love',
						per_page: 100,
					},
				} )
			).map( ( media ) => media.id )
		);

		// What isn't music is left alone, and says so.
		await picker.setInputFiles( {
			name: 'notes.txt',
			mimeType: 'text/plain',
			buffer: Buffer.from( 'hi' ),
		} );
		await expect( status ).toContainText( 'There is no music in that.' );
	} );

	test( 'the account menu offers it, and pressing it opens the file chooser rather than the admin', async ( {
		page,
	} ) => {
		await page.locator( '.riff-app-account summary' ).first().click();
		const chooser = page.waitForEvent( 'filechooser' );
		await page.getByRole( 'link', { name: 'Add music' } ).first().click();
		expect( ( await chooser ).isMultiple() ).toBe( true );
		await expect( page ).toHaveURL( /\/app\/?/ );
	} );

	test( 'files carried over the window show where they will land, and a drop adds them', async ( {
		page,
		requestUtils,
	} ) => {
		const overlay = page.locator( '.riff-app-drop' );
		await expect( overlay ).toBeHidden();
		const carried = await page.evaluateHandle(
			( bytes ) => {
				const transfer = new DataTransfer();
				transfer.items.add(
					new File( [ new Uint8Array( bytes ) ], 'Dropped Song.mp3', {
						type: 'audio/mpeg',
					} )
				);
				return transfer;
			},
			[ ...TONE ]
		);
		await page.dispatchEvent( 'body', 'dragenter', {
			dataTransfer: carried,
		} );
		await expect( overlay ).toBeVisible();
		await page.dispatchEvent( 'body', 'dragleave', {
			dataTransfer: carried,
		} );
		await expect( overlay ).toBeHidden();
		await page.dispatchEvent( 'body', 'dragenter', {
			dataTransfer: carried,
		} );
		await page.dispatchEvent( 'body', 'drop', { dataTransfer: carried } );
		await expect( overlay ).toBeHidden();
		await expect( page.locator( '.riff-app-status' ) ).toHaveText(
			'1 track added.',
			{ timeout: 20000 }
		);
		expect( await named( requestUtils, 'Dropped Song' ) ).toHaveLength( 1 );
	} );
} );

test.describe( 'A visitor', () => {
	test.use( { storageState: { cookies: [], origins: [] } } );

	test( 'has none of it', async ( { page } ) => {
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + 'app/' );
		await expect( page.locator( '[data-riff-app]' ) ).toBeVisible();
		await expect( page.locator( '[data-riff-app]' ) ).not.toHaveAttribute(
			'data-riff-media'
		);
		await expect(
			page.locator( 'input[data-riff-add-music], .riff-app-drop' )
		).toHaveCount( 0 );
		const map = await page
			.locator( 'script[type="importmap"]' )
			.first()
			.textContent();
		expect( map ).not.toContain( 'riff-app/import' );
	} );
} );
