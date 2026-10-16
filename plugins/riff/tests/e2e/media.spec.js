/**
 * The Artwork and Video version pickers, on the attachment edit screen and in the Media Library's
 * own window.
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

let audio;
let video;
let cover;

test.beforeAll( async ( { requestUtils } ) => {
	audio = await requestUtils.uploadMedia(
		path.join( FIXTURES, '02 - Underground [underground].mp3' )
	);
	video = await requestUtils.uploadMedia(
		path.join( FIXTURES, '01 - Intensities in Ten Cities [intensities].webm' )
	);
	cover = await requestUtils.uploadMedia(
		path.join( FIXTURES, 'cover.png' )
	);
} );

test.afterAll( async ( { requestUtils } ) => {
	await requestUtils.deleteAllMedia();
} );

/**
 * Picks an attachment in the frame a picker opened.
 *
 * @param {import('@playwright/test').Page} page   The page.
 * @param {Object}                          media  The attachment to pick.
 * @param {string}                          button The frame's select button.
 */
async function pick( page, media, button ) {
	const frame = page.locator( '.media-modal' ).last();
	// WordPress opens on Upload files until the library has loaded once.
	await frame.getByRole( 'tab', { name: 'Media Library' } ).click();
	await frame.locator( `li.attachment[data-id="${ media.id }"]` ).click();
	await frame.getByRole( 'button', { name: button } ).click();
}

test( 'the edit screen picks a video, keeps it through a bad address, and removes it', async ( {
	admin,
	page,
	requestUtils,
} ) => {
	await admin.visitAdminPage( 'post.php', `post=${ audio.id }&action=edit` );
	// Artwork is the featured image, which this screen sets in its own box.
	await expect( page.locator( '.compat-field-riff_art' ) ).toHaveCount( 0 );

	await page.getByRole( 'button', { name: 'Choose video' } ).click();
	await pick( page, video, 'Use as video version' );
	await expect( page.locator( '.compat-field-riff_video' ) ).toContainText(
		video.title.raw
	);
	await page.getByRole( 'button', { name: 'Update' } ).click();
	await expect(
		page.getByRole( 'button', { name: 'Replace video' } )
	).toBeVisible();
	await expect( page.getByLabel( 'Video version' ) ).toHaveValue(
		video.source_url
	);

	await page.getByLabel( 'Video version' ).fill( 'https://example.com/x.mp4' );
	await page.getByRole( 'button', { name: 'Update' } ).click();
	await expect( page.getByRole( 'alert' ) ).toContainText(
		'not a video in the Media Library'
	);
	await expect( page.getByLabel( 'Video version' ) ).toHaveValue(
		video.source_url
	);
	await expect( page.getByLabel( 'Video version' ) ).toHaveAttribute(
		'aria-invalid',
		'true'
	);

	await page.getByRole( 'button', { name: 'Remove video version' } ).click();
	await expect(
		page.getByRole( 'button', { name: 'Choose video' } )
	).toBeFocused();
	await page.getByRole( 'button', { name: 'Update' } ).click();
	await expect(
		page.getByRole( 'button', { name: 'Choose video' } )
	).toBeVisible();

	const saved = await requestUtils.rest( {
		path: `/wp/v2/media/${ audio.id }`,
		params: { context: 'edit' },
	} );
	expect( saved.meta._riff_video ).toBe( 0 );
} );

test( 'the Media Library window saves each change and shows what the server kept', async ( {
	admin,
	page,
	requestUtils,
} ) => {
	await requestUtils.rest( {
		method: 'POST',
		path: `/wp/v2/media/${ audio.id }`,
		data: { featured_media: 0, meta: { _riff_video: 0 } },
	} );
	await admin.visitAdminPage( 'upload.php', `item=${ audio.id }` );
	const details = page.locator( '.media-modal' ).first();
	const saved = () =>
		page.waitForResponse(
			( r ) =>
				r.url().includes( 'admin-ajax.php' ) &&
				( r.request().postData() || '' ).includes(
					'save-attachment-compat'
				)
		);

	let save = saved();
	await details.getByRole( 'button', { name: 'Choose artwork' } ).click();
	await pick( page, cover, 'Use as artwork' );
	await save;
	await expect(
		details.getByRole( 'button', { name: 'Replace artwork' } )
	).toBeVisible();

	save = saved();
	await details.getByLabel( 'Video version' ).fill( 'nonsense' );
	await details.getByLabel( 'Video version' ).press( 'Tab' );
	await save;
	await expect( details.getByRole( 'alert' ) ).toContainText(
		'not a video in the Media Library'
	);
	await expect( details.getByLabel( 'Video version' ) ).toHaveValue( '' );

	save = saved();
	await details.getByRole( 'button', { name: 'Remove artwork' } ).click();
	await save;
	await expect(
		details.getByRole( 'button', { name: 'Choose artwork' } )
	).toBeFocused();

	const media = await requestUtils.rest( {
		path: `/wp/v2/media/${ audio.id }`,
		params: { context: 'edit' },
	} );
	expect( media.featured_media ).toBe( 0 );
	expect( media.meta._riff_video ).toBe( 0 );
} );
