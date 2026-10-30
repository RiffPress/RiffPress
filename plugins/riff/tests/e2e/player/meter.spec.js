/**
 * The meter and the filament: a shared file is analysed, the bars on the playing row swing with the music, the seek line lights and cools, and the glow fades before the knob.
 * Runs in desktop Chromium and in Chromium at an iPhone's size; the tests tagged `@smoke` also run in WebKit (see playwright.config.js).
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { FIXTURES, FILES, iosAgent, playerSite } = require( '../helpers/site' );

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

	test( 'a file from another origin that shares over CORS is analysed; one that does not still plays', async ( {
		page,
		requestUtils,
	}, testInfo ) => {
		test.skip( iosAgent( testInfo ), 'no analyser on iOS' );
		const body = require( 'node:fs' ).readFileSync( path.join( FIXTURES, FILES[ 1 ] ) );
		// Playwright answers CORS for any response it fulfils, so the origin that does not share
		// refuses the player's CORS check outright, as a browser would see it.
		const serve = ( cors ) => ( route ) =>
			! cors && route.request().method() === 'HEAD'
				? route.abort()
				: route.fulfill( {
						status: 200,
						contentType: 'audio/mpeg',
						headers: { 'Access-Control-Allow-Origin': '*' },
						body: route.request().method() === 'HEAD' ? '' : body,
				  } );
		await page.route( 'https://shares.riff.test/**', serve( true ) );
		await page.route( 'https://private.riff.test/**', serve( false ) );
		const block = ( src ) =>
			`<!-- wp:audio --><figure class="wp-block-audio"><audio controls src="${ src }"></audio></figure><!-- /wp:audio -->`;
		const post = await made.post( requestUtils, {
			title: 'Streamed',
			status: 'publish',
			content:
				block( 'https://shares.riff.test/underground.mp3' ) +
				block( 'https://private.riff.test/underground.mp3' ),
		} );
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.goto( post.link );
		const rows = page.locator( '.riff-row' );
		await rows.nth( 0 ).click();
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-live', '' );
		await expect
			.poll( () => page.evaluate( () => document.querySelector( '.riff-audio' ).crossOrigin ) )
			.toBe( 'anonymous' );
		// Without CORS the file plays as it always has, out of Web Audio's reach, never silenced.
		await rows.nth( 1 ).click();
		await expect
			.poll( () =>
				page.evaluate( () =>
					[ ...document.querySelectorAll( '.riff-audio, .riff-video' ) ].some(
						( m ) => m.src.includes( 'private.riff.test' ) && ! m.paused && m.currentTime > 0.5 && m.crossOrigin === null
					)
				)
			)
			.toBe( true );
	} );

	test( 'each bar on the playing row swings through its own range, not a fixed staircase', async ( {
		page,
	}, testInfo ) => {
		test.skip( iosAgent( testInfo ), 'no analyser on iOS' );
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.reload();
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-live', '' );
		// Three seconds of heights, read in the page every 100 ms, past the opening four seconds
		// where every band is still learning its range.
		const heights = await page.evaluate(
			() =>
				new Promise( ( resolve ) => {
					const seen = [ [], [], [] ];
					setTimeout( () => {
						const every = setInterval( () => {
							document
								.querySelector( '.riff-row[data-current]' )
								.querySelectorAll( '.riff-row-state i' )
								.forEach( ( b, k ) =>
									seen[ k ].push( parseFloat( b.style.transform.slice( 7 ) ) )
								);
							if ( seen[ 0 ].length === 30 ) {
								clearInterval( every );
								resolve( seen );
							}
						}, 100 );
					}, 4000 );
				} )
		);
		// One scale for all three bands pinned the bass bar near the top and kept the others in a
		// narrow band below it.
		for ( const bar of heights ) {
			expect( Math.max( ...bar ) - Math.min( ...bar ) ).toBeGreaterThan( 0.3 );
		}
	} );

	test( 'the filament lights with the music and cools when paused', async ( {
		page,
	}, testInfo ) => {
		// iOS keeps the breath: routing audio through Web Audio there breaks background playback.
		test.skip( iosAgent( testInfo ), 'no analyser on iOS' );
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.reload();
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await expect( page.locator( '#riff' ) ).toHaveAttribute(
			'data-live',
			''
		);
		await expect
			.poll( () =>
				page.evaluate( () =>
					Number(
						getComputedStyle(
							document.querySelector(
								'.riff-bar-seek .riff-line'
							)
						).getPropertyValue( '--riff-heat' )
					)
				)
			)
			.toBeGreaterThan( 0.2 );
		await page.locator( '.riff-bar [data-riff-action="toggle"]' ).click();
		await expect( page.locator( '#riff' ) ).not.toHaveAttribute(
			'data-live',
			''
		);
		await expect
			.poll(
				() =>
					page.evaluate( () =>
						Number(
							getComputedStyle(
								document.querySelector(
									'.riff-bar-seek .riff-line'
								)
							).getPropertyValue( '--riff-heat' )
						)
					),
				{ timeout: 6000 }
			)
			.toBeLessThan( 0.1 );
	} );

	test( 'in the desktop app the filament goes dark while the window is down, and the music plays on', async ( {
		page,
	}, testInfo ) => {
		test.skip( iosAgent( testInfo ), 'no analyser on iOS' );
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.reload();
		await page.locator( '.riff-row' ).nth( 0 ).click();
		const riff = page.locator( '#riff' );
		await expect( riff ).toHaveAttribute( 'data-live', '' );
		// What the desktop app's preload does when the window is minimised or hidden.
		const down = ( away ) =>
			page.evaluate( ( on ) => {
				document.documentElement.classList.toggle( 'riff-desktop-away', on );
				document.dispatchEvent( new Event( 'visibilitychange' ) );
			}, away );
		await down( true );
		await expect( riff ).not.toHaveAttribute( 'data-live', '' );
		const heat = () =>
			page.evaluate( () =>
				Number(
					getComputedStyle(
						document.querySelector( '.riff-bar-seek .riff-line' )
					).getPropertyValue( '--riff-heat' )
				)
			);
		// At once, with no cooling drawn for no one.
		expect( await heat() ).toBe( 0 );
		expect( await page.evaluate( () => window.riffInternal.playing() ) ).toBe(
			true
		);
		await down( false );
		await expect( riff ).toHaveAttribute( 'data-live', '' );
	} );

	test( 'the glow fades out before the knob instead of ending in a square edge', async ( {
		page,
	} ) => {
		await page.locator( '.riff-row' ).nth( 0 ).click();
		const glow = await page.evaluate( () => {
			const line = document.querySelector( '.riff-bar-seek .riff-line' );
			const frame = getComputedStyle( line.querySelector( '.riff-bloom' ) );
			const after = getComputedStyle( line.querySelector( '.riff-bloom' ), '::after' );
			return {
				start: frame.maskImage || frame.webkitMaskImage,
				end: after.maskImage || after.webkitMaskImage,
				shadow: getComputedStyle( line.querySelector( '.riff-hot' ) ).boxShadow,
			};
		} );
		// The bloom is faded at both ends: in from the line's start on a still frame, and out
		// before the knob on the glow that slides, so neither fade reads the position and is
		// repainted as it changes. A box-shadow on the stretched hot layer is what drew the
		// square edge.
		expect( glow.start ).toMatch( /^linear-gradient\(90deg, rgba\( *0, *0, *0, *0 *\)/ );
		expect( glow.start ).not.toContain( 'calc' );
		expect( glow.end ).toMatch( /rgba\( *0, *0, *0, *0 *\)\)$/ );
		expect( glow.end ).not.toContain( '--riff-p' );
		expect( glow.shadow ).toBe( 'none' );
		// Now Playing's seek line is plain white: no bloom tints it.
		await expect( page.locator( '.riff-np-seek .riff-bloom' ) ).toHaveCount( 0 );
	} );
} );
