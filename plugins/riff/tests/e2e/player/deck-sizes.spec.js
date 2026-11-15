/**
 * The deck is one object at every size it shows at: its keys, its display and its pitch fader on
 * its plinth, the plinth and the arm inside the stage, nothing over anything else, and each control
 * large enough to press: under a finger at least 44 by 44 CSS pixels (WCAG 2.5.5), under a mouse at
 * least 24 by 24 (WCAG 2.5.8), so a window keeps the keys along the front of the deck. Upright, the
 * album is the cover. A screen no taller than a phone is a touch screen here, as a phone on its side
 * is; the rest have a mouse. The deck is drawn from one low chair at every size (deck-gl.js), so
 * each key reaches past its drawn cap, invisibly, as far as it must to be pressed: the size is
 * measured on that reach, on the screen as it is laid, and no two reaches meet. The composition is
 * measured on the page's flat deck, with the transforms that lay its arm and keys where they are
 * drawn lifted. Runs in desktop Chromium, the deck drawn without its pixels where no graphics card
 * draws it (helpers/turntable.js, drawnWithoutPixels()).
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { playerSite } = require( '../helpers/site' );
const { drawnWithoutPixels } = require( '../helpers/turntable' );

const made = own();
let postUrl;

test.beforeAll( async ( { requestUtils } ) => {
	( { postUrl } = await playerSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

// The deck, as laid out: every box the checks below need, in CSS pixels.
const measure = ( page ) =>
	page.evaluate( () => {
		const controlsOf = () => [ ...document.querySelectorAll( '.riff-np :is(button, input, [role="slider"]):not(.riff-arm, .riff-sleeve, .riff-np-head *)' ) ];
		const shown = ( el ) => el.checkVisibility( { visibilityProperty: true } ) && el.getBoundingClientRect().width > 0;
		// What a finger or a mouse presses of each: a key's reach (.riff-hit), or the control itself.
		const reachOf = ( el ) => el.querySelector( ':scope > .riff-hit' ) || el;
		// Each control's size on the screen, as it is laid where it is drawn, by its reach.
		const pressable = controlsOf()
			.filter( shown )
			.map( ( el ) => {
				const r = reachOf( el ).getBoundingClientRect();
				return { w: r.width, h: r.height, name: el.getAttribute( 'aria-label' ) || el.className };
			} );
		// Whether any two reaches meet, as the browser finds what is under a point: every 2px over
		// the deck's keys, the controls whose reach is there.
		const owner = ( el ) => el.closest( '.riff-keys button' ) || ( el.matches( '.riff-keys input' ) ? el : null );
		const reaches = controlsOf().filter( ( el ) => shown( el ) && el.closest( '.riff-keys' ) );
		const rects = reaches.map( ( el ) => reachOf( el ).getBoundingClientRect() );
		const meeting = new Set();
		if ( rects.length ) {
			const x0 = Math.max( 0, Math.min( ...rects.map( ( r ) => r.left ) ) );
			const y0 = Math.max( 0, Math.min( ...rects.map( ( r ) => r.top ) ) );
			const x1 = Math.min( innerWidth, Math.max( ...rects.map( ( r ) => r.right ) ) );
			const y1 = Math.min( innerHeight, Math.max( ...rects.map( ( r ) => r.bottom ) ) );
			for ( let x = x0; x < x1; x += 2 ) {
				for ( let y = y0; y < y1; y += 2 ) {
					const under = [ ...new Set( document.elementsFromPoint( x, y ).map( owner ).filter( Boolean ) ) ];
					if ( under.length > 1 ) {
						meeting.add( under.map( ( el ) => el.getAttribute( 'aria-label' ) ).sort().join( ' and ' ) );
					}
				}
			}
		}
		// The rest on the page's flat deck, each control its own box, not its reach.
		const laidParts = [ ...document.querySelectorAll( '.riff-mount, .riff-cue, .riff-keys' ) ];
		const laid = laidParts.map( ( part ) => part.style.transform );
		laidParts.forEach( ( part ) => ( part.style.transform = 'none' ) );
		const reached = reaches.map( ( el ) => [ el.style.getPropertyValue( '--riff-hit-x' ), el.style.getPropertyValue( '--riff-hit-y' ) ] );
		reaches.forEach( ( el ) => {
			el.style.removeProperty( '--riff-hit-x' );
			el.style.removeProperty( '--riff-hit-y' );
		} );
		const box = ( el ) => {
			const r = el.getBoundingClientRect();
			return { x: r.x, y: r.y, w: r.width, h: r.height, name: el.getAttribute( 'aria-label' ) || el.className };
		};
		const plinth = document.querySelector( '.riff-plinth' );
		const p = plinth.getBoundingClientRect();
		const [ top, right, bottom, left ] = getComputedStyle( plinth )
			.getPropertyValue( '--riff-plinth-edge' )
			.trim()
			.split( /\s+/ )
			.map( ( share ) => parseFloat( share ) / 100 );
		const stage = document.querySelector( '.riff-stage' );
		const measured = {
			pressable,
			meeting: [ ...meeting ],
			board: 'riffGl' in document.querySelector( '#riff' ).dataset,
			plinth: { x: p.x + left * p.width, y: p.y + top * p.height, w: p.width * ( 1 - left - right ), h: p.height * ( 1 - top - bottom ) },
			stage: box( stage ),
			record: box( document.querySelector( '.riff-stage > .riff-record' ) ),
			arm: [ '.riff-arm', '.riff-arm-base', '.riff-arm-tube' ].map( ( q ) => box( document.querySelector( q ) ) ),
			controls: controlsOf().filter( shown ).map( box ),
			display: [ ...document.querySelectorAll( '.riff-keys .riff-level' ) ].filter( shown ).map( box ),
			names: [ ...document.querySelectorAll( '.riff-np :is(button, input):not(.riff-sleeve)' ) ].filter( shown ).map( ( el ) => el.getAttribute( 'aria-label' ) ),
		};
		laidParts.forEach( ( part, i ) => ( part.style.transform = laid[ i ] ) );
		reaches.forEach( ( el, i ) => {
			el.style.setProperty( '--riff-hit-x', reached[ i ][ 0 ] );
			el.style.setProperty( '--riff-hit-y', reached[ i ][ 1 ] );
		} );
		return measured;
	} );

const inside = ( a, b ) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;
const meet = ( a, b ) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

// What the deck has to hold, in every arrangement.
const NAMES = [ 'Play', 'Pause', '33⅓ revolutions per minute', '45 revolutions per minute', 'Previous', 'Next', 'Shuffle', 'Repeat', 'Pitch' ];

async function deck( page ) {
	await drawnWithoutPixels( page );
	await page.emulateMedia( { reducedMotion: 'no-preference' } );
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).nth( 0 ).click();
	await page.locator( '.riff-bar-info' ).click();
	await expect( page.locator( '.riff-np' ) ).toBeVisible();
}

async function settled( page ) {
	await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-deck', 'out' );
	// Drawn, and laid where the eye sees it.
	await page.waitForFunction( () => 'riffGl' in document.querySelector( '#riff' ).dataset && document.querySelector( '.riff-deck-gl' )?.dataset.riffCamera === 'across' );
	// Still: the record, the arm and the keys where they were a moment ago.
	const where = () =>
		page.evaluate( () =>
			[ '.riff-stage > .riff-record', '.riff-arm', '.riff-keys button' ]
				.map( ( q ) => Object.values( document.querySelector( q ).getBoundingClientRect().toJSON() ).map( Math.round ).join() )
				.join( ' ' )
		);
	let last = '';
	await expect
		.poll( async () => {
			const now = await where();
			const same = now === last;
			last = now;
			return same;
		}, { intervals: [ 300 ] } )
		.toBe( true );
}

function check( size, m, floor ) {
	const at = `${ size.width }×${ size.height }`;
	expect.soft( m.board, `${ at }: the deck is drawn` ).toBe( true );
	for ( const part of m.arm ) {
		expect.soft( inside( part, m.stage ), `${ at }: the arm (${ part.name }) inside the stage` ).toBe( true );
	}
	expect( inside( m.plinth, m.stage ), `${ at }: the plinth inside the stage` ).toBe( true );
	for ( const name of NAMES.filter( ( n ) => ! [ 'Play', 'Pause' ].includes( n ) ) ) {
		expect.soft( m.names.filter( ( n ) => n?.startsWith( name ) ).length, `${ at }: ${ name } is on the deck` ).toBeGreaterThan( 0 );
	}
	const all = [ ...m.controls, ...m.display ];
	for ( const c of all ) {
		expect.soft( inside( c, m.plinth ), `${ at }: ${ c.name } on the plinth` ).toBe( true );
		expect.soft( meet( c, m.record ), `${ at }: ${ c.name } clear of the platter` ).toBe( false );
	}
	for ( const c of m.pressable ) {
		expect.soft( Math.min( c.w, c.h ), `${ at }: ${ c.name } at least ${ floor }px` ).toBeGreaterThanOrEqual( floor - 0.5 );
	}
	expect.soft( m.meeting, `${ at }: no two keys' reaches meet` ).toEqual( [] );
	for ( const [ i, a ] of all.entries() ) {
		for ( const b of all.slice( i + 1 ) ) {
			expect.soft( meet( a, b ), `${ at }: ${ a.name } and ${ b.name } apart` ).toBe( false );
		}
	}
}

const sizes = ( title, list, touch ) =>
	test.describe( title, () => {
		test.use( { viewport: list[ 0 ], isMobile: touch, hasTouch: touch } );

		test.beforeEach( async ( {}, info ) => {
			test.skip( info.project.name !== 'chromium', 'Measured in desktop Chromium.' );
		} );

		test( 'the deck keeps its composition at each size', async ( { page } ) => {
			await deck( page );
			for ( const size of list ) {
				await page.setViewportSize( size );
				await settled( page );
				const m = await measure( page );
				check( size, m, touch ? 44 : 24 );
			}
		} );
	} );

sizes( 'On a touch screen on its side', [ { width: 844, height: 390 }, { width: 932, height: 430 }, { width: 667, height: 375 } ], true );
sizes( 'With a mouse', [ { width: 800, height: 420 }, { width: 1000, height: 540 }, { width: 1024, height: 600 }, { width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 } ], false );

test.describe( 'Upright', () => {
	test.use( { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } );

	test( 'a phone held upright has the cover, at 390×844 and 430×932', async ( { page }, info ) => {
		test.skip( info.project.name !== 'chromium', 'Measured in desktop Chromium.' );
		await deck( page );
		for ( const size of [ { width: 390, height: 844 }, { width: 430, height: 932 } ] ) {
			await page.setViewportSize( size );
			await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-turntable', 'off' );
			await expect( page.locator( '.riff-stage > .riff-cover' ) ).toBeVisible();
			await expect( page.locator( '.riff-keys' ) ).toBeHidden();
		}
	} );
} );

test.describe( 'The keys\' legends', () => {
	test.use( { viewport: { width: 1280, height: 720 } } );

	// Each key's legend as it is laid on its cap: how many glyphs show, and how far the middle of
	// what shows is from the middle of the key, in CSS pixels.
	const legends = ( page ) =>
		page.evaluate( () =>
			[ ...document.querySelectorAll( '.riff-keys button' ) ].map( ( key ) => {
				const shows = [ ...key.childNodes ].filter( ( n ) => ( n.nodeType === Node.TEXT_NODE ? n.textContent.trim() : n.nodeType === Node.ELEMENT_NODE && ! n.matches( '.riff-hit' ) && getComputedStyle( n ).display !== 'none' ) );
				const range = document.createRange();
				range.setStartBefore( shows[ 0 ] );
				range.setEndAfter( shows[ shows.length - 1 ] );
				const [ g, k ] = [ range.getBoundingClientRect(), key.getBoundingClientRect() ];
				return { name: key.getAttribute( 'aria-label' ), glyphs: shows.length, off: Math.hypot( g.left + g.width / 2 - k.left - k.width / 2, g.top + g.height / 2 - k.top - k.height / 2 ) };
			} )
		);

	test( 'each is one glyph in the middle of its key, repeat in each of its states, at each arrangement', async ( { page }, info ) => {
		test.skip( info.project.name !== 'chromium', 'Measured in desktop Chromium.' );
		await deck( page );
		for ( const size of [ { width: 1280, height: 720 }, { width: 844, height: 390 } ] ) {
			await page.setViewportSize( size );
			await settled( page );
			for ( const state of [ 'off', 'all', 'one' ] ) {
				await expect( page.locator( '.riff-key-repeat' ) ).toHaveAttribute( 'data-repeat', state );
				for ( const { name, glyphs, off } of await legends( page ) ) {
					expect.soft( glyphs, `${ size.width }×${ size.height }, repeat ${ state }: ${ name } shows one legend` ).toBe( 1 );
					expect.soft( off, `${ size.width }×${ size.height }, repeat ${ state }: ${ name }'s legend in its middle` ).toBeLessThan( 2 );
				}
				await page.locator( '.riff-key-repeat' ).focus();
				await page.keyboard.press( 'Enter' );
			}
		}
	} );
} );
