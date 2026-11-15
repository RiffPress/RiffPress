/**
 * The meter and the plain seek line: a shared file is analysed, the bars on the playing row swing with the music and rest out of sight, and the seek line has nothing that glows, with a knob only while pointed at, and still seeks.
 * Runs in desktop Chromium and in Chromium at an iPhone's size; the tests tagged `@smoke` also run in WebKit (see playwright.config.js).
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { FIXTURES, FILES, iosAgent, playerSite } = require( '../helpers/site' );
const { controlLayer } = require( '../helpers/turntable' );

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

	test( 'the meter rests while no bar is in sight, and reads again when one is', async ( {
		page,
	}, testInfo ) => {
		test.skip( iosAgent( testInfo ), 'no analyser on iOS' );
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.reload();
		await page.evaluate( () => {
			window.riffFrames = 0;
			window.riffInternal.listen( 'meter', () => window.riffFrames++ );
		} );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-live', '' );
		await expect.poll( () => page.evaluate( () => window.riffFrames ) ).toBeGreaterThan( 0 );
		// The playing row out of sight: how many frames the meter reads in a second and a half,
		// once the observer has had a frame to say so.
		const sight = ( shown ) =>
			page.evaluate( ( on ) => {
				document.querySelector( '.riff-row[data-current]' ).style.display = on ? '' : 'none';
			}, shown );
		const read = () =>
			page.evaluate(
				() =>
					new Promise( ( resolve ) => {
						setTimeout( () => {
							const from = window.riffFrames;
							setTimeout( () => resolve( window.riffFrames - from ), 1500 );
						}, 300 );
					} )
			);
		await sight( false );
		expect( await read() ).toBe( 0 );
		// The music plays on: only the reading rests.
		expect( await page.evaluate( () => window.riffInternal.playing() ) ).toBe( true );
		await sight( true );
		await expect.poll( read ).toBeGreaterThan( 0 );
	} );

	test( 'the seek line is plain: a track, what has loaded and the played part, with nothing that glows or breathes', async ( {
		page,
		isMobile,
	} ) => {
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.reload();
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await expect.poll( () => page.evaluate( () => document.querySelector( '.riff-audio' ).currentTime ) ).toBeGreaterThan( 0.5 );
		// One layer in each line, the played part; what has loaded is the line's ::before.
		for ( const seeker of [ '.riff-bar-seek', '.riff-np-seek' ] ) {
			await expect( page.locator( `${ seeker } .riff-line > *` ) ).toHaveCount( 1 );
		}
		await expect( page.locator( '.riff-wire, .riff-hot, .riff-bloom, .riff-np-glow, [data-riff-wire], [data-riff-hot]' ) ).toHaveCount( 0 );
		const found = await page.evaluate( () => {
			const line = document.querySelector( '.riff-bar-seek .riff-line' );
			const style = getComputedStyle( line );
			return {
				heat: style.getPropertyValue( '--riff-heat' ),
				shadow: getComputedStyle( line.firstElementChild ).boxShadow,
				// Whatever runs on the seek line moves it by transform, and ends: no light that
				// fades, flickers or breathes forever.
				animations: document
					.getAnimations()
					.filter( ( a ) => a.effect?.target?.closest?.( '.riff-bar-seek, .riff-np-seek' ) )
					.map( ( a ) => ( {
						infinite: a.effect.getTiming().iterations === Infinity,
						props: Object.keys( a.effect.getKeyframes()[ 0 ] ).filter(
							( k ) => ! [ 'offset', 'easing', 'composite', 'computedOffset' ].includes( k )
						),
					} ) ),
			};
		} );
		expect( found.heat ).toBe( '' );
		expect( found.shadow ).toBe( 'none' );
		for ( const a of found.animations ) {
			expect( a.infinite ).toBe( false );
			expect( a.props ).toEqual( [ 'transform' ] );
		}
		// The bar's knob shows only while the line is pointed at, in focus or held.
		if ( isMobile ) {
			return;
		}
		const knob = page.locator( '.riff-bar-seek .riff-knob' );
		await expect( knob ).toHaveCSS( 'opacity', '0' );
		await page.locator( '.riff-bar-seek' ).hover();
		await expect( knob ).toHaveCSS( 'opacity', '1' );
		await page.mouse.move( 0, 0 );
		await expect( knob ).toHaveCSS( 'opacity', '0' );
	} );

	test( 'the plain seek line still seeks, by a press and from the keyboard', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'a phone\'s bar line is a readout; Now Playing seeks there' );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await expect.poll( () => page.evaluate( () => document.querySelector( '.riff-audio' ).duration || 0 ) ).toBeGreaterThan( 10 );
		const fraction = () =>
			page.evaluate( () => {
				const m = document.querySelector( '.riff-audio' );
				return m.currentTime / m.duration;
			} );
		const seek = await page.locator( '.riff-bar-seek' ).boundingBox();
		await page.mouse.click( seek.x + seek.width * 0.6, seek.y + seek.height / 2 );
		await expect.poll( fraction ).toBeGreaterThan( 0.55 );
		await expect( page.locator( '.riff-bar-seek .riff-knob' ) ).toHaveCSS( 'opacity', '1' );
		// From the keyboard: in focus, the knob shows, and an arrow moves five seconds.
		await page.mouse.move( 0, 0 );
		const input = page.locator( '.riff-bar-seek .riff-seek' );
		await input.focus();
		await page.keyboard.press( 'Home' );
		await expect.poll( fraction ).toBeLessThan( 0.05 );
		await page.keyboard.press( 'ArrowRight' );
		await expect
			.poll( () => page.evaluate( () => document.querySelector( '.riff-audio' ).currentTime ) )
			.toBeGreaterThan( 4 );
		await expect( input ).toHaveAttribute( 'aria-valuetext', /seconds? of / );
	} );

	test( 'a track a reload brings back from a sharing origin is heard by the meter, and the deck\'s lamps light only once the music sounds', async ( {
		page,
		requestUtils,
	}, testInfo ) => {
		test.skip( testInfo.project.name !== 'chromium', 'The deck and its display stand on a wide stage.' );
		const body = require( 'node:fs' ).readFileSync( path.join( FIXTURES, FILES[ 1 ] ) );
		// The origin answers its CORS check late, as a far server does: after a reload, the track
		// brought back is loaded before the answer comes.
		await page.route( 'https://late.riff.test/**', async ( route ) => {
			const head = route.request().method() === 'HEAD';
			if ( head ) {
				await new Promise( ( done ) => setTimeout( done, 1500 ) );
			}
			await route.fulfill( {
				status: 200,
				contentType: 'audio/mpeg',
				headers: { 'Access-Control-Allow-Origin': '*' },
				body: head ? '' : body,
			} );
		} );
		await controlLayer( page );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		const post = await made.post( requestUtils, {
			title: 'Streamed late',
			status: 'publish',
			content: '<!-- wp:audio --><figure class="wp-block-audio"><audio controls src="https://late.riff.test/underground.mp3"></audio></figure><!-- /wp:audio -->',
		} );
		await page.goto( post.link );
		const audio = () => page.evaluate( () => ( ( m ) => ( { paused: m.paused, cross: m.crossOrigin, src: m.getAttribute( 'src' ) } ) )( document.querySelector( '.riff-audio' ) ) );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await expect.poll( async () => ( await audio() ).paused ).toBe( false );
		await page.locator( '.riff-bar [data-riff-action="toggle"]' ).click();
		await expect.poll( async () => ( await audio() ).paused ).toBe( true );

		await page.reload();
		await expect.poll( async () => ( await audio() ).src ).toContain( 'late.riff.test' );
		// Loaded again for CORS once the origin says it shares, still waiting to be played: loaded
		// without, the meter could not hear it, and the lamps stayed dark for the whole track.
		await expect.poll( audio, { timeout: 5000 } ).toEqual( expect.objectContaining( { paused: true, cross: 'anonymous' } ) );

		await page.locator( '.riff-bar-info' ).click();
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-deck', 'out' );
		const toggle = page.locator( ':is(.riff-bar:not([inert]), .riff-keys) [data-riff-action="toggle"]:visible' ).first();
		// How bright the brightest lamp is, and whether play is still waiting on the stylus.
		const lamps = () =>
			page.evaluate( () => {
				const canvas = document.querySelector( '.riff-level' );
				const { width: w, height: h } = canvas;
				const row = canvas.getContext( '2d' ).getImageData( 0, Math.round( h * 0.5 ), w, Math.max( 1, Math.round( h * 0.19 ) ) ).data;
				let most = 0;
				for ( let n = 3; n < row.length; n += 4 ) {
					most = Math.max( most, row[ n ] );
				}
				return { most, cued: 'riffCued' in document.querySelector( '#riff' ).dataset };
			} );
		const LIT = 128;
		await toggle.click();
		await expect.poll( () => page.evaluate( () => window.riff.analyser() !== null ) ).toBe( true );
		await expect.poll( async () => ( await lamps() ).most, { timeout: 5000 } ).toBeGreaterThan( LIT );

		// Stopped and started again: while the stylus is on its way down, the lamps are dark,
		// not the last moment the analyser heard before the stop.
		await toggle.click();
		await expect( page.locator( '.riff-arm' ) ).toHaveAttribute( 'data-riff-up', '' );
		await toggle.click();
		const waiting = [];
		await expect
			.poll( async () => {
				const now = await lamps();
				if ( now.cued ) {
					waiting.push( now.most );
				}
				return now.cued;
			}, { intervals: [ 50 ] } )
			.toBe( false );
		expect( waiting.length ).toBeGreaterThan( 0 );
		expect( Math.max( ...waiting ) ).toBeLessThan( LIT );
		await expect.poll( async () => ( await lamps() ).most, { timeout: 5000 } ).toBeGreaterThan( LIT );
	} );
} );
