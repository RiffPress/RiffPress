/**
 * The deck's pitch fader and the key by its zero that sends it back there. The key is offered only
 * while the fader is off its middle and the listener is at it (the pointer near it, or the
 * keyboard's focus on it), and is out of sight, of reach and of a screen reader's hearing
 * otherwise. Under a hand the fader clicks into its middle, exactly 0; the keyboard's steps go
 * where they say, and its 0 key, a double press and the key all send it back. Runs in desktop
 * Chromium on the deck's control layer (helpers/turntable.js, controlLayer()), with or without a
 * graphics card.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { openView } = require( '../helpers/views' );
const { own } = require( '../helpers/own' );
const { playerSite } = require( '../helpers/site' );
const { controlLayer } = require( '../helpers/turntable' );

const made = own();

let postUrl;

test.beforeAll( async ( { requestUtils } ) => {
	( { postUrl } = await playerSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

// The fader's box on the screen, as the page has it (Playwright's own box for a range laid on its
// side and transformed is not where the browser draws it).
const boxOf = ( fader ) =>
	fader.evaluate( ( el ) => {
		const r = el.getBoundingClientRect();
		return { x: r.x, y: r.y, width: r.width, height: r.height };
	} );

// Where on the screen the fader's cap stands at a value: the range's thumb, 3.3% of the record
// long in a range 30% of it, runs from its middle at one end to its middle at the other.
const at = async ( fader, value ) => {
	const b = await boxOf( fader );
	const thumb = ( b.height * 3.3 ) / 30;
	return [ b.x + b.width / 2, b.y + thumb / 2 + ( ( value + 8 ) / 16 ) * ( b.height - thumb ) ];
};

const set = ( fader, value ) =>
	fader.evaluate( ( el, to ) => {
		el.value = String( to );
		el.dispatchEvent( new Event( 'input', { bubbles: true } ) );
	}, value );

// Whether the key can be focused: one out of sight can't.
const focusable = ( key ) =>
	key.evaluate( ( el ) => {
		el.focus();
		const is = document.activeElement === el;
		el.blur();
		return is;
	} );

test.describe( 'The pitch fader', () => {
	test.use( { viewport: { width: 1440, height: 900 } } );

	test.beforeEach( async ( { page }, info ) => {
		test.skip( info.project.name !== 'chromium', 'The turntable stands on a wide stage.' );
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await controlLayer( page );
		await page.goto( postUrl );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await openView( page, 'album' );
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-deck', 'out' );
		// The needle down, and the hand that carried the arm and the record there done moving.
		await expect( page.locator( '.riff-arm' ) ).toHaveAttribute( 'data-riff-down', '' );
		await page.evaluate( () =>
			Promise.all(
				[ '.riff-arm-tube', '.riff-record', '.riff-keys' ].flatMap( ( q ) => document.querySelector( q ).getAnimations().map( ( a ) => a.finished.catch( () => {} ) ) )
			)
		);
		// The deck come to rest where it stands: the fader where it was a moment ago.
		let was = '';
		await expect
			.poll( async () => {
				await page.waitForTimeout( 150 );
				const now = await page.locator( '.riff-pitch-scale' ).evaluate( ( el ) => JSON.stringify( el.getBoundingClientRect() ) );
				const still = now === was;
				was = now;
				return still;
			} )
			.toBe( true );
		// Laid smaller from the record's right, as the drawn deck lays its controls where it draws
		// them: on the flat deck the fader stands below the window's foot.
		await page.locator( '.riff-keys' ).evaluate( ( el ) => {
			el.style.transformOrigin = '100% 0';
			el.style.transform = 'scale(0.5)';
		} );
	} );

	test( 'offers the key by its zero only while it is off its middle and the pointer is near it', async ( { page } ) => {
		const fader = page.locator( '[data-riff-pitch]' );
		const key = page.locator( '[data-riff-reset]' );
		const named = page.getByRole( 'button', { name: 'Pitch to 0%' } );
		const b = await boxOf( fader );
		const near = [ b.x - 12, b.y + b.height / 2 ];

		// At its middle the key is not there, the pointer near or not.
		await page.mouse.move( ...near );
		await expect( key ).toBeHidden();
		await expect( named ).toHaveCount( 0 );
		expect( await focusable( key ) ).toBe( false );

		// Off its middle, with the pointer away: still not there.
		await page.mouse.move( 5, 5 );
		await set( fader, 3 );
		await expect( key ).toBeHidden();
		expect( await focusable( key ) ).toBe( false );

		// The pointer near: there, named, and it sends the fader back to its middle.
		await page.mouse.move( ...near );
		await expect( key ).toBeVisible();
		await expect( named ).toHaveCount( 1 );
		await named.click();
		await expect( fader ).toHaveValue( '0' );
		await expect( fader ).toHaveAttribute( 'aria-valuetext', '0.0%' );
		// Back at its middle, the key goes, the pointer still on it.
		await expect( key ).toBeHidden();

		// A double press on the fader does the same.
		await set( fader, -5 );
		await page.mouse.dblclick( ...( await at( fader, -5 ) ) );
		await expect( fader ).toHaveValue( '0' );
	} );

	test( 'clicks into its middle under a hand, exactly 0, and goes anywhere else', async ( { page } ) => {
		const fader = page.locator( '[data-riff-pitch]' );
		await set( fader, 3 );
		await page.mouse.move( ...( await at( fader, 3 ) ) );
		await page.mouse.down();
		await page.mouse.move( ...( await at( fader, 0.15 ) ), { steps: 8 } );
		await page.mouse.up();
		await expect( fader ).toHaveValue( '0' );
		await expect( fader ).toHaveAttribute( 'aria-valuetext', '0.0%' );

		await page.mouse.move( ...( await at( fader, 0 ) ) );
		await page.mouse.down();
		await page.mouse.move( ...( await at( fader, -2 ) ), { steps: 8 } );
		await page.mouse.up();
		expect( Number( await fader.inputValue() ) ).toBeLessThan( -1.5 );
	} );

	test( 'from the keyboard: steps of 0.1 from its middle, its key offered while it has the focus, and 0 or the key to send it back', async ( { page } ) => {
		const fader = page.locator( '[data-riff-pitch]' );
		const key = page.locator( '[data-riff-reset]' );
		await page.mouse.move( 5, 5 );
		await fader.focus();
		// Up, toward the slot's back and its − end, as the cap goes.
		await page.keyboard.press( 'ArrowDown' );
		await expect( fader ).toHaveValue( '0.1' );
		await expect( fader ).toHaveAttribute( 'aria-valuetext', '+0.1%' );
		await expect( key ).toBeVisible();

		// Its own 0 key.
		await page.keyboard.press( '0' );
		await expect( fader ).toHaveValue( '0' );
		await expect( fader ).toHaveAttribute( 'aria-valuetext', '0.0%' );
		await expect( key ).toBeHidden();

		// The key, reached by Tab, sends it back and gives the focus back to the fader.
		await page.keyboard.press( 'ArrowUp' );
		await page.keyboard.press( 'ArrowUp' );
		await expect( fader ).toHaveAttribute( 'aria-valuetext', '-0.2%' );
		await page.keyboard.press( 'Tab' );
		await expect( key ).toBeFocused();
		await page.keyboard.press( 'Enter' );
		await expect( fader ).toHaveValue( '0' );
		await expect( fader ).toBeFocused();
		await expect( key ).toBeHidden();

		// The focus gone elsewhere and the pointer away, the key goes, off its middle or not.
		await page.keyboard.press( 'ArrowUp' );
		await expect( key ).toBeVisible();
		await page.locator( '.riff-key-start' ).focus();
		await expect( key ).toBeHidden();
	} );
} );
