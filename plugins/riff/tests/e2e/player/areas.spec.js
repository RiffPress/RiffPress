/**
 * The player's areas: the quality pill in the bar and Now Playing (small print between the times on a phone), lossless shown as bit depth and rate, Riff's own features adding badges and hearing the meter, a script adding a control to the bar, and the volume in a slot of its own.
 * Runs in desktop Chromium and in Chromium at an iPhone's size; the tests tagged `@smoke` also run in WebKit (see playwright.config.js).
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { openView } = require( '../helpers/views' );
const { own } = require( '../helpers/own' );
const { FIXTURES, iosAgent, playerSite } = require( '../helpers/site' );

const made = own();
let postUrl;

test.beforeAll( async ( { requestUtils } ) => {
	( { postUrl } = await playerSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test.describe( 'Player', () => {
	test.beforeEach( async ( { page } ) => {
		await page.goto( postUrl );
	} );

	test( 'the playing track shows its format and bit rate in the bar and Now Playing', async ( {
		page,
	} ) => {
		// In the bar and Now Playing only: in a list it is noise.
		const row = page.locator( '.riff-row' ).nth( 1 );
		await expect( row.locator( '.riff-quality' ) ).toHaveCount( 0 );
		await row.click();
		await expect(
			page.locator( '.riff-bar-end .riff-quality' )
		).toHaveText( /^MP3 · \d+ kbps$/ );
		await openView( page, 'album' );
		await expect(
			page.locator( '.riff-np-quality .riff-quality' )
		).toHaveText( /^MP3 · \d+ kbps$/ );
	} );

	test( 'on a phone the quality is small print between the seek line\'s times, not a capsule under the title', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( ! isMobile, 'a wide screen shows the capsule in the bar alone' );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await openView( page, 'album' );
		await expect( page.locator( '.riff-np-tier .riff-quality' ) ).toBeVisible();
		await expect( page.locator( '.riff-np-tier .riff-quality' ) ).toHaveText( /^MP3 · \d+ kbps$/ );
		await expect( page.locator( '.riff-np-quality' ) ).toBeHidden();
	} );

	test( 'Riff\'s own features add badges to the player\'s areas, and hear the meter', async ( {
		page,
	}, testInfo ) => {
		// The meter reads the music only where motion is wanted.
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.reload();
		await page.evaluate( () => {
			window.riffHeard = 0;
			window.riffInternal.listen( 'badges', ( list, t ) => [ ...list, { id: 'e2e', text: t ? 'Live' : '', label: 'Recorded live' } ] );
			window.riffInternal.listen( 'meter', ( { levels } ) => levels.length === 3 && window.riffHeard++ );
		} );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		// An iPhone keeps the music off Web Audio, so there is nothing to hear there.
		if ( ! iosAgent( testInfo ) ) {
			await expect.poll( () => page.evaluate( () => window.riffHeard ) ).toBeGreaterThan( 0 );
		}
		// Paused, so the short track can't end and empty the queue under the test.
		await page.evaluate( () => document.querySelectorAll( 'audio, video' ).forEach( ( m ) => m.pause() ) );
		const end = page.locator( '.riff-bar-end' );
		// After Riff's own quality pill, in the order the listeners were added.
		await expect( end.locator( '[data-riff-area="badges"] > *' ) ).toHaveText( [ /^MP3 · /, /^Live/ ] );
		// A badge's label is read in place of its short text, not only shown to a pointer.
		await expect( end.locator( '.riff-badge-e2e [aria-hidden="true"]' ) ).toHaveText( 'Live' );
		await expect( end.locator( '.riff-badge-e2e .riff-app-sr' ) ).toHaveText( 'Recorded live' );
	} );

	test( 'a script adds a control to the bar, in its order among Riff\'s own, and it follows the track', async ( {
		page,
		isMobile,
	} ) => {
		await page.evaluate( () => {
			window.riffPinned = null;
			window.riffUnpin = window.riff.control( 'e2e-pin', {
				label: ( t ) => ( t ? `Pin ${ t.title }` : 'Pin' ),
				icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"/></svg>',
				order: 65,
				pressed: ( t ) => !! t && window.riffPinned === t.title,
				run: ( t ) => ( window.riffPinned = window.riffPinned === t.title ? null : t.title ),
			} );
			// A control that asks to stay off a phone's bar.
			window.riff.control( 'e2e-wide', { label: 'Wide only', icon: '', wide: true, run: () => {} } );
			// Not a usable control: no name, so nothing is added.
			window.riff.control( 'e2e-bad', { run: () => {} } );
		} );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await page.evaluate( () => document.querySelectorAll( 'audio, video' ).forEach( ( m ) => m.pause() ) );
		const title = await page.evaluate( () => window.riff.current().title );
		const pin = page.locator( '[data-riff-control="e2e-pin"]' );
		await expect( pin ).toHaveCount( 1 );
		await expect( pin ).toHaveAttribute( 'aria-label', `Pin ${ title }` );
		await expect( page.locator( '[data-riff-control="e2e-bad"]' ) ).toHaveCount( 0 );
		// Between Play on another device (60) and the volume (70), as its order says.
		const order = await page.locator( '[data-riff-controls] > [data-riff-control]' ).evaluateAll( ( els ) => els.map( ( el ) => el.dataset.riffControl ) );
		expect( order.indexOf( 'e2e-pin' ) ).toBe( order.indexOf( 'cast' ) + 1 );
		expect( order.indexOf( 'e2e-pin' ) ).toBe( order.indexOf( 'volume' ) - 1 );
		await expect( pin ).toHaveAttribute( 'aria-pressed', 'false' );
		await pin.click();
		await expect( pin ).toHaveAttribute( 'aria-pressed', 'true' );
		expect( await page.evaluate( () => window.riffPinned ) ).toBe( title );
		await expect( page.locator( '[data-riff-control="e2e-wide"]' ) ).toBeVisible( { visible: ! isMobile } );
		// Taken away, it leaves the bar.
		await page.evaluate( () => window.riffUnpin() );
		await expect( pin ).toHaveCount( 0 );
	} );

	test( 'a control registered on the server is in the page before any script, and its script gives it its press by its id', async ( {
		page,
		context,
		baseURL,
	} ) => {
		// What riff_register_control() does on the riff_register action (tests/components).
		await context.addCookies( [ { name: 'riff_test_control', value: '1', url: baseURL } ] );
		const response = await page.reload();
		const html = await response.text();
		expect( html ).toMatch( /data-riff-control="e2e-server" data-riff-order="66" aria-label="Server control"/ );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await page.evaluate( () => {
			window.riffPressed = 0;
			window.riff.control( 'e2e-server', {
				pressed: () => window.riffPressed > 0,
				run: () => window.riffPressed++,
			} );
		} );
		const control = page.locator( '[data-riff-control="e2e-server"]' );
		await expect( control ).toHaveCount( 1 );
		// Between Play on another device (60) and the volume (70), where the server drew it.
		const order = await page.locator( '[data-riff-controls] > [data-riff-control]' ).evaluateAll( ( els ) => els.map( ( el ) => el.dataset.riffControl ) );
		expect( order.indexOf( 'e2e-server' ) ).toBe( order.indexOf( 'cast' ) + 1 );
		await control.click();
		expect( await page.evaluate( () => window.riffPressed ) ).toBe( 1 );
		await expect( control ).toHaveAttribute( 'aria-pressed', 'true' );
	} );

	test( 'a lossless track shows its bit depth and sample rate instead of a bit rate', async ( {
		page,
		requestUtils,
	} ) => {
		const flac = await made.media( requestUtils,
			path.join( FIXTURES, '..', 'test', 'tone-24-96.flac' )
		);
		const post = await made.post( requestUtils, {
			title: `Riff e2e lossless ${ Date.now() }`,
			status: 'publish',
			content: `<!-- wp:audio {"id":${ flac.id }} --><figure class="wp-block-audio"><audio controls src="${ flac.source_url }"></audio></figure><!-- /wp:audio -->`,
		} );
		await page.goto( post.link );
		await page.locator( '.riff-row' ).first().click();
		await expect( page.locator( '.riff-bar' ) ).toBeVisible();
		await expect(
			page.locator( '.riff-np-quality .riff-quality' )
		).toHaveText( 'FLAC · 24-bit 96 kHz' );
	} );

	test( 'the transport stays in the middle of the bar from track to track, however wide the bar\'s end is for each', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'a phone\'s bar has Play alone at its end, not a transport in the middle' );
		// Wide enough that the end's controls, a signed-in listener's among them, fit their share
		// for both tracks; narrower, the end keeps room for them and the track's column gives way.
		await page.setViewportSize( { width: 1920, height: 900 } );
		// A badge for the second track alone, as a longer quality pill would be ("VORBIS · 86 kbps"
		// after "MP3 · 128 kbps"): the end of the bar holds more for one track than the other.
		await page.evaluate( () => {
			const second = document.querySelectorAll( '.riff-row .riff-row-title' )[ 1 ].textContent.trim();
			window.riffInternal.listen( 'badges', ( list, t ) => [ ...list, {
				id: 'e2e-wide',
				text: t && t.title === second ? 'Remastered' : '',
				label: 'Remastered',
			} ] );
		} );
		const badge = page.locator( '.riff-bar-end .riff-badge-e2e-wide' );
		const at = async ( n, shown ) => {
			await page.locator( '.riff-row' ).nth( n ).click();
			// Paused, so the short track can't end and move on under the test.
			await page.evaluate( () => document.querySelectorAll( 'audio, video' ).forEach( ( m ) => m.pause() ) );
			await expect( badge ).toBeVisible( { visible: shown } );
			return page.evaluate( () => {
				const box = ( s ) => document.querySelector( s ).getBoundingClientRect();
				return { transport: box( '.riff-bar-transport' ).x, start: box( '.riff-bar-info' ).width, end: box( '.riff-bar-end' ).width };
			} );
		};
		const first = await at( 0, false );
		const second = await at( 1, true );
		expect( second.transport ).toBe( first.transport );
		// The track and the end share the bar alike either side of it.
		expect( first.start ).toBe( first.end );
		expect( second.start ).toBe( second.end );
	} );

	test( 'the volume has a slot of its own in the bar: using it covers and moves none of the controls beside it', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'a phone has no volume in the bar' );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await page.evaluate( () => document.querySelectorAll( 'audio, video' ).forEach( ( m ) => m.pause() ) );
		const volume = page.locator( '.riff-bar .riff-volume' );
		const slider = volume.locator( '[data-riff-volume]' );
		const mute = volume.locator( '[data-riff-mute]' );
		// At rest the slider is already there, short, in the row: nothing opens later.
		await expect( slider ).toBeVisible();
		const rest = await slider.boundingBox();
		expect( rest.width ).toBeGreaterThanOrEqual( 96 );
		expect( rest.width ).toBeLessThanOrEqual( 120 );
		// Where every other control at the bar's end is (the heart, the quality pill, the views'
		// buttons such as the lyrics), and whether anything lies on top at each one's middle.
		const others = () =>
			page.evaluate( () =>
				[ ...document.querySelectorAll( '.riff-bar-end [data-riff-controls] > *, .riff-bar-end [data-riff-area="badges"] > *' ) ]
					.filter( ( el ) => ! el.matches( '.riff-volume' ) && el.getClientRects().length )
					.map( ( el ) => {
						const r = el.getBoundingClientRect();
						const top = document.elementFromPoint( r.x + r.width / 2, r.y + r.height / 2 );
						return { box: [ r.x, r.y, r.width, r.height ].map( Math.round ).join( ',' ), covered: ! el.contains( top ) };
					} )
			);
		const before = await others();
		expect( before.length ).toBeGreaterThan( 0 );
		expect( before.every( ( o ) => ! o.covered ) ).toBe( true );
		// Pointed at, dragged and set from the keyboard: nothing beside it moves or is covered.
		await slider.hover();
		expect( await others() ).toEqual( before );
		await page.mouse.move( rest.x + rest.width * 0.8, rest.y + rest.height / 2 );
		await page.mouse.down();
		await expect( slider ).toHaveAttribute( 'data-held', '' );
		await page.mouse.move( rest.x + rest.width * 0.3, rest.y + rest.height / 2, { steps: 5 } );
		expect( await others() ).toEqual( before );
		await page.mouse.up();
		await expect( slider ).not.toHaveAttribute( 'data-held', '' );
		expect( Number( await slider.inputValue() ) ).toBeLessThan( 50 );
		await page.mouse.move( 0, 0 );
		expect( await others() ).toEqual( before );
		expect( await slider.boundingBox() ).toEqual( rest );
		// The keyboard as before: an arrow steps one, spoken as a percentage, and remembered.
		await slider.focus();
		const value = Number( await slider.inputValue() );
		await page.keyboard.press( 'ArrowLeft' );
		await expect( slider ).toHaveValue( String( value - 1 ) );
		await expect( slider ).toHaveAttribute( 'aria-valuetext', `${ value - 1 } percent` );
		expect( Number( await page.evaluate( () => localStorage.getItem( 'riff:volume' ) ) ) ).toBeCloseTo( ( value - 1 ) / 100, 5 );
		expect( await others() ).toEqual( before );
		// The icon mutes and unmutes, keeping the level to come back to.
		await mute.click();
		await expect( mute ).toHaveAttribute( 'aria-pressed', 'true' );
		expect( await page.evaluate( () => document.querySelector( '.riff-audio' ).muted ) ).toBe( true );
		await expect( slider ).toHaveValue( String( value - 1 ) );
		await mute.click();
		await expect( mute ).toHaveAttribute( 'aria-pressed', 'false' );
		expect( await page.evaluate( () => document.querySelector( '.riff-audio' ).muted ) ).toBe( false );
		expect( await others() ).toEqual( before );
	} );
} );
