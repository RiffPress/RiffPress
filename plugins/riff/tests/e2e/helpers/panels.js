/**
 * A panel opened as a listener opens it: from its button in the bar on a wide screen, and from its
 * chip in Now Playing on a phone, whose bar keeps to the track and Play.
 */
const { expect } = require( '@wordpress/e2e-test-utils-playwright' );

/**
 * Opens a panel, Now Playing first where its chip is the way in.
 *
 * @param {import('@playwright/test').Page} page Page.
 * @param {string}                          id   The panel's id: `queue` for Up next.
 * @return {Promise<import('@playwright/test').Locator>} The panel.
 */
async function openPanel( page, id ) {
	const button = page.locator( `[data-riff-control="${ id }"]` );
	if ( await button.isVisible() ) {
		await button.click();
	} else {
		if ( await page.locator( '.riff-np' ).isHidden() ) {
			await page.locator( '.riff-bar-info' ).click();
		}
		await page.locator( `[data-riff-chip="${ id }"]` ).click();
	}
	const panel = page.locator( `[data-riff-panel="${ id }"]` );
	await expect( panel ).toBeVisible();
	return panel;
}

module.exports = { openPanel };
