/**
 * A control is pressed, not read: a double-click on a player button selects none of its label,
 * while a row's track, which is there to be read, still selects as the page's text does.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { playerSite } = require( '../helpers/site' );

const made = own();
let postUrl;

test.beforeAll( async ( { requestUtils } ) => {
	( { postUrl } = await playerSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test( 'a double-click on a player button selects nothing @smoke', async ( {
	page,
} ) => {
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).first().click();
	await expect
		.poll( () => page.evaluate( () => window.riff.playing() ) )
		.toBe( true );
	const play = page.locator( '#riff .riff-bar .riff-play' );
	await page.evaluate( () =>
		document.defaultView.getSelection().removeAllRanges()
	);
	await play.dblclick();
	expect(
		await page.evaluate( () =>
			document.defaultView.getSelection().toString()
		)
	).toBe( '' );
	const select = ( el ) => {
		const style = getComputedStyle( el );
		return style.userSelect || style.webkitUserSelect;
	};
	expect( await play.evaluate( select ) ).toBe( 'none' );
	// A row's track is the page's text, and selects as it does.
	expect(
		await page.locator( '.riff-row' ).first().evaluate( select )
	).not.toBe( 'none' );
} );
