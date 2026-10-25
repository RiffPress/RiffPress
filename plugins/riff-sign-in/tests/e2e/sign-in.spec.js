/**
 * Riff Sign In, end to end: a visitor presses Sign in on the Listen page, types the code the tests
 * site kept for them, is offered a passkey and saves it with Chromium's virtual authenticator, is
 * signed out, and signs in again with the passkey. The music keeps playing through the sheet, and
 * carries on when the page comes back signed in. Runs in desktop Chromium and at an iPhone's size;
 * the code path also runs in WebKit, which has no virtual authenticator.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../../../riff/tests/e2e/helpers/own' );
const { appSite } = require( '../../../riff/tests/e2e/helpers/site' );

const made = own();
let pageUrl;
const EMAIL = `listener-${ Date.now() }@example.com`;

test.beforeAll( async ( { requestUtils } ) => {
	( { pageUrl } = await appSite( made, requestUtils ) );
	await requestUtils.rest( { method: 'POST', path: '/riff-test/v1/registration', data: { open: true } } );
} );

test.afterAll( async ( { requestUtils } ) => {
	await requestUtils.rest( { method: 'POST', path: '/riff-test/v1/registration', data: { open: false } } );
	const users = await requestUtils.rest( { path: '/wp/v2/users', params: { search: EMAIL, context: 'edit' } } );
	for ( const user of users ) {
		await requestUtils.rest( { method: 'DELETE', path: `/wp/v2/users/${ user.id }`, params: { force: true, reassign: 1 } } );
	}
	await made.cleanUp( requestUtils );
} );

// The sheet is for visitors: every test here is one.
test.use( { storageState: { cookies: [], origins: [] } } );

const lastCode = async ( requestUtils ) => ( await requestUtils.rest( { path: '/riff-test/v1/sign-in-code' } ) ).code;

test( 'a visitor signs in with a code from the sheet, and the music keeps playing', async ( { page, requestUtils }, testInfo ) => {
	await page.goto( pageUrl );
	await page.locator( '.riff-card-play' ).first().click();
	await expect.poll( () => page.evaluate( () => window.riff.playing() ) ).toBe( true );
	await page.locator( '.riff-app-signin' ).click();
	// The sheet's name is its heading, which changes with each step; the element is the constant.
	const sheet = page.locator( 'dialog.riff-signin' );
	await expect( sheet ).toBeVisible();
	await expect( sheet ).toHaveAccessibleName( 'Sign in' );
	expect( await page.evaluate( () => window.riff.playing() ) ).toBe( true );

	await sheet.getByLabel( 'Email' ).fill( EMAIL );
	await sheet.getByRole( 'button', { name: 'Continue' } ).click();
	await expect( sheet ).toContainText( `A code is on its way to ${ EMAIL }` );
	const code = await lastCode( requestUtils );
	expect( code ).toMatch( /^\d{6}$/ );
	const field = sheet.getByLabel( 'Code' );
	await expect( field ).toHaveAttribute( 'autocomplete', 'one-time-code' );
	await field.fill( '000000' === code ? '111111' : '000000' );
	await sheet.getByRole( 'button', { name: 'Sign in' } ).click();
	await expect( sheet.getByRole( 'alert' ) ).toContainText( 'did not match' );
	await sheet.getByLabel( 'Code' ).fill( code );
	await sheet.getByRole( 'button', { name: 'Sign in' } ).click();

	// Chromium offers a passkey; WebKit and a browser without one are signed in at once.
	const hasPasskeys = testInfo.project.name !== 'webkit';
	if ( hasPasskeys ) {
		await expect( sheet ).toContainText( 'Save a passkey' );
		await sheet.getByRole( 'button', { name: 'Not now' } ).click();
	}
	await expect( page.locator( '.riff-app-account' ) ).toBeVisible();
	await expect.poll( () => page.evaluate( () => window.riff.playing() ) ).toBe( true );
	const cookies = await page.context().cookies();
	expect( cookies.some( ( c ) => c.name.startsWith( 'wordpress_logged_in_' ) ) ).toBe( true );
} );

test( 'a passkey is saved after a code and signs in on its own', async ( { page, requestUtils, browserName }, testInfo ) => {
	test.skip( browserName !== 'chromium', 'the virtual authenticator is Chromium\'s' );
	const cdp = await page.context().newCDPSession( page );
	await cdp.send( 'WebAuthn.enable' );
	const { authenticatorId } = await cdp.send( 'WebAuthn.addVirtualAuthenticator', {
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
	const { credentials } = await cdp.send( 'WebAuthn.getCredentials', { authenticatorId } );
	expect( credentials ).toHaveLength( 1 );
	expect( credentials[ 0 ].isResidentCredential ).toBe( true );

	// Signed out, the passkey alone signs in: no email, no code.
	await page.context().clearCookies();
	await page.goto( pageUrl );
	await page.locator( '.riff-app-signin' ).click();
	await sheet.getByRole( 'button', { name: 'Sign in with a passkey' } ).click();
	await expect( page.locator( '.riff-app-account' ) ).toBeVisible();
	const { credentials: used } = await cdp.send( 'WebAuthn.getCredentials', { authenticatorId } );
	expect( used[ 0 ].signCount ).toBeGreaterThan( credentials[ 0 ].signCount );
	testInfo.annotations.push( { type: 'passkey', description: 'resident credential made and used' } );
} );

// The tokens are set on #riff, and the sheet sits outside it. It once took nothing from them, so
// its colours fell back to nothing everywhere, and in the Listen app's own document, where no
// theme sets a font, the text fell back to the browser's serif.
test( 'the sheet is drawn in the player\'s tokens in the installed app', async ( { page } ) => {
	await page.goto( pageUrl.replace( /\/?$/, '/' ) + 'app/' );
	await page.locator( '.riff-app-signin' ).click();
	const sheet = page.locator( 'dialog.riff-signin' );
	await expect( sheet ).toBeVisible();
	const looks = await sheet.evaluate( ( dialog ) => {
		// What the player's surface and text resolve to, from an element inside the player.
		const probe = document.createElement( 'span' );
		probe.style.cssText = 'background:var(--riff-surface);color:var(--riff-fg)';
		document.getElementById( 'riff' ).append( probe );
		const player = getComputedStyle( probe );
		const wanted = { background: player.backgroundColor, color: player.color };
		probe.remove();
		const drawn = getComputedStyle( dialog );
		const field = getComputedStyle( dialog.querySelector( 'input' ) );
		const main = getComputedStyle( dialog.querySelector( 'button.riff-signin-main' ) );
		return {
			wanted,
			background: drawn.backgroundColor,
			color: drawn.color,
			font: drawn.fontFamily,
			field: { width: field.borderTopWidth, style: field.borderTopStyle, colour: field.borderTopColor },
			main: main.backgroundColor,
		};
	} );
	expect( looks.background ).toBe( looks.wanted.background );
	expect( looks.color ).toBe( looks.wanted.color );
	expect( looks.font ).toContain( 'Roboto' );
	expect( looks.field ).toMatchObject( { width: '1px', style: 'solid' } );
	expect( looks.field.colour ).not.toBe( 'rgba(0, 0, 0, 0)' );
	expect( looks.main ).not.toBe( 'rgba(0, 0, 0, 0)' );
	await sheet.getByRole( 'button', { name: 'Close' } ).click();
	await expect( sheet ).toBeHidden();
} );
