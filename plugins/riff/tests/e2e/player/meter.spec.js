/**
 * The meter and the filament: a shared file is analysed, the bars on the playing row swing with the music, the seek line lights and cools, and the glow fades before the knob.
 * The turntable's VU meter and spectrum read the music where Web Audio hears it, only where the album is the turntable, and never on an iPhone or with less motion asked for.
 * Runs in desktop Chromium and in Chromium at an iPhone's size; the tests tagged `@smoke` also run in WebKit (see playwright.config.js).
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { openView } = require( '../helpers/views' );
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

	test( 'the filament rests while nothing it lights is in sight, and lights again when something is', async ( {
		page,
	}, testInfo ) => {
		test.skip( iosAgent( testInfo ), 'no analyser on iOS' );
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.reload();
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-live', '' );
		// The bar and the playing row out of sight, Now Playing closed: nothing the wire lights is
		// seen. What the loop writes to the bar's line, read for a second and a half once the
		// observer has had a frame to say so.
		const sight = ( shown ) =>
			page.evaluate( ( on ) => {
				for ( const node of document.querySelectorAll( '.riff-bar, .riff-row[data-current]' ) ) {
					node.style.display = on ? '' : 'none';
				}
			}, shown );
		const written = () =>
			page.evaluate(
				() =>
					new Promise( ( resolve ) => {
						const line = document.querySelector( '.riff-bar-seek .riff-line' );
						const seen = new Set();
						setTimeout( () => {
							const every = setInterval(
								() => seen.add( line.style.getPropertyValue( '--riff-heat' ) ),
								50
							);
							setTimeout( () => {
								clearInterval( every );
								resolve( seen.size );
							}, 1500 );
						}, 300 );
					} )
			);
		await sight( false );
		expect( await written() ).toBe( 1 );
		// The music plays on: only the drawing rests.
		expect( await page.evaluate( () => window.riffInternal.playing() ) ).toBe( true );
		await sight( true );
		await expect.poll( written ).toBeGreaterThan( 1 );
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

test.describe( 'Turntable meters', () => {
	// The needle's angle, from its transform, and each band's bar height.
	const read = ( page ) =>
		page.evaluate( () => {
			const needle = document.querySelector( '.riff-vu-needle' );
			const turned = /rotate\((-?[\d.]+)deg\)/.exec( needle?.style.transform || '' );
			return {
				angle: turned ? Number( turned[ 1 ] ) : null,
				bars: [ ...document.querySelectorAll( '.riff-spectrum i' ) ].map(
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
		await expect( root ).not.toHaveAttribute( 'data-riff-meters', '' );
		await expect( page.locator( '.riff-meters' ) ).toBeHidden();
		// Wide, it is the turntable, with its meters.
		await page.setViewportSize( { width: 1280, height: 800 } );
		await expect( root ).toHaveAttribute( 'data-riff-meters', '' );
		const meters = page.locator( '.riff-meters' );
		await expect( meters ).toBeVisible();
		await expect( meters ).toHaveAttribute( 'data-riff-heard', '' );
		await expect( page.locator( '.riff-spectrum i' ) ).toHaveCount( 31 );
		// Off its peg at -45°, and the spectrum up from the floor.
		await expect.poll( async () => ( await read( page ) ).angle ).toBeGreaterThan( -40 );
		await expect.poll( async () => Math.max( ...( await read( page ) ).bars ) ).toBeGreaterThan( 0.3 );
		// Past a few Slow seconds, an MP3's top band, at 20 kHz above where its encoder stops,
		// is lower than the band at 1 kHz.
		await expect
			.poll( async () => {
				const { bars } = await read( page );
				return bars[ 17 ] - bars[ 30 ];
			}, { timeout: 8000 } )
			.toBeGreaterThan( 0.1 );
		// Paused, the needle falls back to its peg and the bars come down.
		await page.locator( '.riff-bar [data-riff-action="toggle"]' ).click();
		await expect.poll( async () => ( await read( page ) ).angle, { timeout: 3000 } ).toBeLessThan( -44 );
		await expect.poll( async () => Math.max( ...( await read( page ) ).bars ), { timeout: 3000 } ).toBe( 0 );
		// The meters stay in place while paused, so the deck keeps its size.
		await expect( root ).toHaveAttribute( 'data-riff-meters', '' );
	} );

	test( 'with less motion asked for there are no meters', async ( { page }, testInfo ) => {
		test.skip( iosAgent( testInfo ), 'no analyser on iOS' );
		await page.emulateMedia( { reducedMotion: 'reduce' } );
		await page.setViewportSize( { width: 1280, height: 800 } );
		await page.goto( postUrl );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await openView( page, 'album' );
		await expect( page.locator( '#riff' ) ).not.toHaveAttribute( 'data-riff-meters', '' );
		await expect( page.locator( '.riff-meters' ) ).toBeHidden();
	} );

	test( 'a site that turns the turntable off has no meters', async ( { page, context, baseURL }, testInfo ) => {
		test.skip( iosAgent( testInfo ), 'no analyser on iOS' );
		await context.addCookies( [ { name: 'riff_test_no_turntable', value: '1', url: baseURL } ] );
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.setViewportSize( { width: 1280, height: 800 } );
		await page.goto( postUrl );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await openView( page, 'album' );
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-live', '' );
		await expect( page.locator( '#riff' ) ).not.toHaveAttribute( 'data-riff-meters', '' );
		await expect( page.locator( '.riff-meters' ) ).toBeHidden();
	} );

	test( 'on an iPhone, where the music does not pass through Web Audio, nothing is drawn', async ( {
		page,
	}, testInfo ) => {
		test.skip( ! iosAgent( testInfo ), 'Only an iPhone keeps the music out of Web Audio.' );
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		// On its side, where the album is the turntable.
		await page.setViewportSize( { width: 844, height: 390 } );
		await page.goto( postUrl );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await openView( page, 'album' );
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-deck', 'out' );
		await expect( page.locator( '#riff' ) ).not.toHaveAttribute( 'data-riff-meters', '' );
		await expect( page.locator( '.riff-meters' ) ).toBeHidden();
		await expect( page.locator( '.riff-meters > *' ) ).toHaveCount( 0 );
	} );
} );
