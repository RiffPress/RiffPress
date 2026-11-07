/**
 * Riff Meters: a VU meter and a spectrum under the turntable, where the music can be measured, in the
 * place Riff keeps there. Runs in desktop Chromium and in Chromium at an iPhone's size.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../../../riff/tests/e2e/helpers/own' );
const { openView } = require( '../../../riff/tests/e2e/helpers/views' );
const {
	iosAgent,
	playerSite,
} = require( '../../../riff/tests/e2e/helpers/site' );

const made = own();
let postUrl;

test.beforeAll( async ( { requestUtils } ) => {
	( { postUrl } = await playerSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test.describe( 'Turntable meters', () => {
	// The needle's angle, from its transform, and each band's bar height.
	const read = ( page ) =>
		page.evaluate( () => {
			const needle = document.querySelector( '.riff-vu-needle' );
			const turned = /rotate\((-?[\d.]+)deg\)/.exec(
				needle?.style.transform || ''
			);
			return {
				angle: turned ? Number( turned[ 1 ] ) : null,
				bars: [
					...document.querySelectorAll( '.riff-spectrum i' ),
				].map(
					( bar ) => parseFloat( bar.style.transform.slice( 7 ) ) || 0
				),
			};
		} );

	test( 'on the turntable the needle swings with the music and the spectrum shows where the file stops, and both rest when it pauses', async ( {
		page,
	}, testInfo ) => {
		test.skip( iosAgent( testInfo ), 'no analyser on iOS' );
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		// Upright, the album is the cover on its own, with no meters.
		await page.setViewportSize( { width: 700, height: 900 } );
		await page.goto( postUrl );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		const root = page.locator( '#riff' );
		await expect( root ).toHaveAttribute( 'data-live', '' );
		await openView( page, 'album' );
		await expect( page.locator( '.riff-meters' ) ).toBeHidden();
		// Wide, it is the turntable, with its meters.
		await page.setViewportSize( { width: 1280, height: 800 } );
		const meters = page.locator( '.riff-meters' );
		await expect( meters ).toBeVisible();
		await expect( page.locator( '.riff-spectrum i' ) ).toHaveCount( 31 );
		// Off its peg at -45°, and the spectrum up from the floor.
		await expect
			.poll( async () => ( await read( page ) ).angle )
			.toBeGreaterThan( -40 );
		await expect
			.poll( async () => Math.max( ...( await read( page ) ).bars ) )
			.toBeGreaterThan( 0.3 );
		// Past a few Slow seconds, an MP3's top band, at 20 kHz above where its encoder stops,
		// is lower than the band at 1 kHz.
		await expect
			.poll(
				async () => {
					const { bars } = await read( page );
					return bars[ 17 ] - bars[ 30 ];
				},
				{ timeout: 8000 }
			)
			.toBeGreaterThan( 0.1 );
		// Paused, the needle falls back to its peg and the bars come down.
		await page.locator( '.riff-bar [data-riff-action="toggle"]' ).click();
		await expect
			.poll( async () => ( await read( page ) ).angle, { timeout: 3000 } )
			.toBeLessThan( -44 );
		await expect
			.poll( async () => Math.max( ...( await read( page ) ).bars ), {
				timeout: 3000,
			} )
			.toBe( 0 );
		// The meters stay in place while paused, so the deck keeps its size.
		await expect( meters ).toBeVisible();
	} );

	test( "with nothing to measure there is no meter lying idle, as for a file another site doesn't share", async ( {
		page,
	}, testInfo ) => {
		test.skip( iosAgent( testInfo ), 'no analyser on iOS' );
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.setViewportSize( { width: 1280, height: 800 } );
		await page.goto( postUrl );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await openView( page, 'album' );
		const meters = page.locator( '.riff-meters' );
		await expect( meters ).toBeVisible();
		const stage = page.locator( '.riff-stage' );
		const before = ( await stage.boundingBox() ).height;
		// The turntable stays, the same size: the meters keep their place, unseen.
		await page.evaluate( () => {
			window.riff.analyser = () => null;
			document.dispatchEvent( new CustomEvent( 'riff:track' ) );
		} );
		await expect( meters ).toBeHidden();
		await expect( page.locator( '.riff-turntable-extras' ) ).toBeVisible();
		// To the pixel: the first reading can land a fraction off as Now Playing settles.
		expect( ( await stage.boundingBox() ).height ).toBeCloseTo( before, 0 );
		await expect( page.locator( '#riff' ) ).toHaveAttribute(
			'data-riff-deck',
			'out'
		);
	} );

	test( 'with less motion asked for there are no meters', async ( {
		page,
	}, testInfo ) => {
		test.skip( iosAgent( testInfo ), 'no analyser on iOS' );
		await page.emulateMedia( { reducedMotion: 'reduce' } );
		await page.setViewportSize( { width: 1280, height: 800 } );
		await page.goto( postUrl );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await openView( page, 'album' );
		await expect( page.locator( '.riff-meters' ) ).toBeHidden();
	} );

	test( 'a site that turns the turntable off has no meters', async ( {
		page,
		context,
		baseURL,
	}, testInfo ) => {
		test.skip( iosAgent( testInfo ), 'no analyser on iOS' );
		await context.addCookies( [
			{ name: 'riff_test_no_turntable', value: '1', url: baseURL },
		] );
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.setViewportSize( { width: 1280, height: 800 } );
		await page.goto( postUrl );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await openView( page, 'album' );
		await expect( page.locator( '#riff' ) ).toHaveAttribute(
			'data-live',
			''
		);
		await expect( page.locator( '.riff-meters' ) ).toBeHidden();
	} );

	test( 'on an iPhone, where the music does not pass through Web Audio, nothing is drawn', async ( {
		page,
	}, testInfo ) => {
		test.skip(
			! iosAgent( testInfo ),
			'Only an iPhone keeps the music out of Web Audio.'
		);
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		// On its side, where the album is the turntable.
		await page.setViewportSize( { width: 844, height: 390 } );
		await page.goto( postUrl );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await openView( page, 'album' );
		await expect( page.locator( '#riff' ) ).toHaveAttribute(
			'data-riff-deck',
			'out'
		);
		await expect( page.locator( '.riff-meters' ) ).toBeHidden();
	} );
} );
