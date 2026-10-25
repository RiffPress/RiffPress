/**
 * Install: the app offers to install itself from the second visit with the browser's prompt, stays away once dismissed, and in Safari shows how to add it to the Dock.
 * Runs in desktop Chromium and in Chromium at an iPhone's size (see playwright.config.js).
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const AxeBuilder = require( '@axe-core/playwright' ).default;
const { own } = require( '../helpers/own' );
const { AXE_TAGS, appSite } = require( '../helpers/site' );

const made = own();
let pageUrl;

test.beforeAll( async ( { requestUtils } ) => {
	( { pageUrl } = await appSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test.describe( 'Standalone', () => {
	test( 'the app offers to install itself from the second visit, with the browser\'s prompt, and stays away once dismissed', async ( {
		page,
	} ) => {
		const app = pageUrl.replace( /\/?$/, '/' ) + 'app/';
		// Headless Chromium never fires its install event, so the test stands in for it, with a
		// prompt() that counts.
		const offer = () =>
			page.evaluate( () => {
				const e = new Event( 'beforeinstallprompt' );
				e.prompt = () => ( window.prompted = ( window.prompted || 0 ) + 1 );
				e.userChoice = Promise.resolve( { outcome: 'accepted' } );
				window.dispatchEvent( e );
			} );
		const card = page.locator( '[data-riff-install]' );

		await page.goto( app );
		await page.evaluate( () => {
			localStorage.removeItem( 'riff-visits' );
			localStorage.removeItem( 'riff-install-dismissed' );
			sessionStorage.removeItem( 'riff-visit' );
		} );
		await page.reload();
		await offer();
		await expect( card, 'not on a first visit' ).toBeHidden();

		// A second visit: a new session.
		await page.evaluate( () => sessionStorage.removeItem( 'riff-visit' ) );
		await page.reload();
		await offer();
		await expect( card ).toBeVisible();
		await expect( card.locator( '.riff-app-install-title' ) ).toHaveText( /^Get the .+ app$/ );
		expect( ( await new AxeBuilder( { page } ).withTags( AXE_TAGS ).include( '[data-riff-install]' ).analyze() ).violations ).toEqual( [] );
		await card.getByRole( 'button', { name: 'Install' } ).click();
		expect( await page.evaluate( () => window.prompted ) ).toBe( 1 );

		// Offered again, then dismissed: gone, and still gone after a reload.
		await offer();
		await expect( card ).toBeVisible();
		await card.getByRole( 'button', { name: 'Not now' } ).focus();
		await page.keyboard.press( 'Enter' );
		await expect( card ).toBeHidden();
		await expect
			.poll(
				() => page.evaluate( () => {
					const el = document.activeElement;
					return !! el?.closest( '.riff-app-bar' ) && el.checkVisibility();
				} ),
				{ message: 'the focus stays in the bar the card left' }
			)
			.toBe( true );
		await page.reload();
		await offer();
		await expect( card ).toBeHidden();
		await page.evaluate( () => localStorage.removeItem( 'riff-install-dismissed' ) );
	} );

	test( 'in Safari, which has no install prompt, Install shows how to add the app to the Dock', async ( {
		browser,
		baseURL,
		isMobile,
	} ) => {
		test.skip( isMobile, 'The Mac\'s steps; a phone is told about the Home Screen.' );
		const context = await browser.newContext( {
			baseURL,
			userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
		} );
		const page = await context.newPage();
		await page.addInitScript( () => {
			localStorage.setItem( 'riff-visits', '1' );
		} );
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + 'app/' );
		const card = page.locator( '[data-riff-install]' );
		await expect( card ).toBeVisible();
		await card.getByRole( 'button', { name: 'Install' } ).focus();
		await page.keyboard.press( 'Enter' );
		await expect( card.locator( '[data-riff-install-how="mac"]' ) ).toHaveText( 'In Safari, choose File, then Add to Dock.' );
		await expect( card.getByRole( 'button', { name: 'Install' } ) ).toBeHidden();
		await expect( card.locator( '[data-riff-install-how="mac"]' ), 'the steps take the focus from the button they replace' ).toBeFocused();
		await context.close();
	} );
} );
