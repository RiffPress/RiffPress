/**
 * A view opened as a listener opens it: the album, Now Playing's own, from the bar itself; any other
 * from its button in the bar, and on a phone, whose bar keeps to the track and Play, from its chip
 * in Now Playing.
 */
const { expect } = require( '@wordpress/e2e-test-utils-playwright' );

/**
 * Opens a view, Now Playing first where its chip is the way in. One that is open stays open, as
 * pressing its button again would close it.
 *
 * @param {import('@playwright/test').Page} page Page.
 * @param {string}                          id   The view's id: `album`, `lyrics`, or `queue` for Up next.
 * @return {Promise<import('@playwright/test').Locator>} The view: Now Playing for the album, else its region.
 */
async function openView( page, id ) {
	const stage = id === 'album';
	const view = stage
		? page.locator( '.riff-np' )
		: page.locator( `.riff-np [data-riff-view="${ id }"], .riff-side [data-riff-panel="${ id }"]` );
	const root = page.locator( '#riff' );
	const open = async () =>
		( await root.getAttribute( 'class' ) ).split( ' ' ).includes( 'is-open' ) &&
		( await root.getAttribute( 'data-riff-showing' ) ) === id;
	if ( stage ) {
		if ( ! ( await open() ) ) {
			await page.locator( '.riff-bar-info' ).click();
		}
	} else {
		const button = page.locator( `.riff-bar [data-riff-control="${ id }"]` );
		if ( ( await button.getAttribute( 'aria-pressed' ) ) !== 'true' ) {
			if ( await button.isVisible() ) {
				await button.click();
			} else {
				if ( await page.locator( '.riff-np' ).isHidden() ) {
					await page.locator( '.riff-bar-info' ).click();
				}
				await page.locator( `.riff-chips [data-riff-chip="${ id }"]` ).click();
			}
		}
	}
	await expect( view ).toBeVisible();
	if ( stage ) {
		await expect( root ).toHaveAttribute( 'data-riff-showing', id );
	}
	return view;
}

module.exports = { openView };
