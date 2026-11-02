/**
 * A view opened as a listener opens it: from its button in the bar, and on a phone, whose bar keeps
 * to the track, Play and the album's button, from its chip in Now Playing.
 */
const { expect } = require( '@wordpress/e2e-test-utils-playwright' );

/**
 * Opens a view, Now Playing first where its chip is the way in. One that is open stays open, as
 * pressing its button again would close it.
 *
 * @param {import('@playwright/test').Page} page Page.
 * @param {string}                          id   The view's id: `album`, `turntable`, `lyrics`, or `queue` for Up next.
 * @return {Promise<import('@playwright/test').Locator>} The view: Now Playing for the album and the turntable, else its region.
 */
async function openView( page, id ) {
	const stage = id === 'album' || id === 'turntable';
	const view = stage
		? page.locator( '.riff-np' )
		: page.locator( `.riff-np [data-riff-view="${ id }"], .riff-side [data-riff-panel="${ id }"]` );
	const button = page.locator( `.riff-bar [data-riff-control="${ id }"]` );
	if ( ( await button.getAttribute( 'aria-pressed' ) ) !== 'true' ) {
		if ( await button.isVisible() ) {
			await button.click();
		} else {
			if ( await page.locator( '.riff-np' ).isHidden() ) {
				await page.locator( '.riff-bar [data-riff-control="album"]' ).click();
			}
			await page.locator( `.riff-chips [data-riff-chip="${ id }"]` ).click();
		}
	}
	await expect( view ).toBeVisible();
	if ( stage ) {
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-view', id );
	}
	return view;
}

module.exports = { openView };
