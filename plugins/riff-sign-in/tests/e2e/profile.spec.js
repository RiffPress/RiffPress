/**
 * Riff Sign In, the profile: a listener who saved a passkey takes it away under Passkeys on their
 * profile. Remove sends focus on, to the next key's Remove or to the heading when it was the last,
 * and says so through the live region; a removal that fails says why beside the button, which keeps
 * focus. Chromium only: the passkey comes from its virtual authenticator.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../../../riff/tests/e2e/helpers/own' );
const { appSite } = require( '../../../riff/tests/e2e/helpers/site' );

const made = own();
let pageUrl;
const EMAIL = `profile-${ Date.now() }@example.com`;

test.beforeAll( async ( { requestUtils } ) => {
	( { pageUrl } = await appSite( made, requestUtils ) );
	// Registration stays closed; the route also clears the code counters, so a spec run on its own
	// over and over inside a quarter of an hour is not turned away.
	await requestUtils.rest( { method: 'POST', path: '/riff-test/v1/registration', data: { open: false } } );
	// An account of their own, so the code signs them in with registration as the site has it.
	await requestUtils.rest( {
		method: 'POST',
		path: '/wp/v2/users',
		data: { username: EMAIL.split( '@' )[ 0 ], email: EMAIL, password: `pw-${ Date.now() }-Riff!`, roles: [ 'subscriber' ] },
	} );
} );

test.afterAll( async ( { requestUtils } ) => {
	const users = await requestUtils.rest( { path: '/wp/v2/users', params: { search: EMAIL, context: 'edit' } } );
	for ( const user of users ) {
		await requestUtils.rest( { method: 'DELETE', path: `/wp/v2/users/${ user.id }`, params: { force: true, reassign: 1 } } );
	}
	await made.cleanUp( requestUtils );
} );

// The listener signs in from the sheet, so the test starts as a visitor.
test.use( { storageState: { cookies: [], origins: [] } } );

const lastCode = async ( requestUtils ) => ( await requestUtils.rest( { path: '/riff-test/v1/sign-in-code' } ) ).code;

test( 'removing a passkey moves focus on and says so; a failure says why and keeps it', async ( { page, requestUtils, browserName } ) => {
	test.skip( browserName !== 'chromium', 'the virtual authenticator is Chromium\'s' );
	const cdp = await page.context().newCDPSession( page );
	await cdp.send( 'WebAuthn.enable' );
	await cdp.send( 'WebAuthn.addVirtualAuthenticator', {
		options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
	} );

	await page.goto( pageUrl );
	await page.locator( '.riff-app-signin' ).click();
	const sheet = page.locator( 'dialog.riff-signin' );
	await sheet.getByLabel( 'Email' ).fill( EMAIL );
	await sheet.getByRole( 'button', { name: 'Continue' } ).click();
	await expect( sheet ).toContainText( `A code is on its way to ${ EMAIL }` );
	await sheet.getByLabel( 'Code' ).fill( await lastCode( requestUtils ) );
	await sheet.getByRole( 'button', { name: 'Sign in' } ).click();
	await sheet.getByRole( 'button', { name: 'Save a passkey' } ).click();
	await expect( page.locator( '.riff-app-account' ) ).toBeVisible();

	await page.goto( new URL( '/wp-admin/profile.php', pageUrl ).href );
	const heading = page.getByRole( 'heading', { name: 'Passkeys' } );
	const list = page.locator( '.riff-signin-passkeys' );
	await expect( list.locator( 'li' ) ).toHaveCount( 1 );
	// The sheet offers one passkey per account, so the second row is the first's copy with an id
	// the site has never seen: enough for the script's focus order, and for a removal the route
	// turns down.
	await list.locator( 'li' ).first().evaluate( ( li ) => {
		const copy = li.cloneNode( true );
		copy.querySelector( '[data-riff-signin-delete]' ).dataset.riffSigninDelete = 'missing';
		li.after( copy );
	} );
	const removes = list.getByRole( 'button', { name: 'Remove' } );
	await expect( removes ).toHaveCount( 2 );

	// The first goes through the route; focus lands on the next key's Remove.
	await removes.first().focus();
	await page.keyboard.press( 'Enter' );
	await expect( list.locator( 'li' ) ).toHaveCount( 1 );
	await expect( removes.first() ).toBeFocused();
	await expect( page.locator( '#a11y-speak-polite' ) ).toContainText( 'Passkey removed' );

	// The copy's id is unknown to the site, so the route says so; the button says it and keeps focus.
	await page.keyboard.press( 'Enter' );
	const alert = list.getByRole( 'alert' );
	await expect( alert ).toHaveText( 'There is no such passkey.' );
	await expect( removes.first() ).toBeEnabled();
	await expect( removes.first() ).toBeFocused();

	// Let through, the last key's removal leaves focus on the heading, the page reads as it does
	// with no keys, and the note from the failed try is gone.
	await page.locator( '#a11y-speak-polite' ).evaluate( ( region ) => ( region.textContent = '' ) );
	await page.route( /riff-sign-in\/v1\/passkeys\/missing/, ( route ) => route.fulfill( { status: 200, contentType: 'application/json', body: '{}' } ) );
	await page.keyboard.press( 'Enter' );
	await expect( list ).toHaveCount( 0 );
	await expect( heading ).toBeFocused();
	await expect( page.getByText( 'No passkeys yet' ) ).toBeVisible();
	await expect( page.getByRole( 'alert' ) ).toHaveCount( 0 );
	await expect( page.locator( '#a11y-speak-polite' ) ).toContainText( 'Passkey removed' );
} );
