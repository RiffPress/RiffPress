/**
 * The deck is one object at every size it shows at: its keys, its display and its pitch fader on
 * its plinth, the plinth and the arm inside the stage, nothing over anything else, and each control
 * at least 44 by 44 CSS pixels (WCAG 2.5.5). Upright, the album is the cover. A screen no taller
 * than a phone is a touch screen here, as a phone on its side is; the rest have a mouse. Measured
 * from boxes, so it holds wherever the deck is drawn. Runs in desktop Chromium.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { playerSite } = require( '../helpers/site' );

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
		const box = ( el ) => {
			const r = el.getBoundingClientRect();
			return { x: r.x, y: r.y, w: r.width, h: r.height, name: el.getAttribute( 'aria-label' ) || el.className };
		};
		const shown = ( el ) => el.checkVisibility( { visibilityProperty: true } ) && el.getBoundingClientRect().width > 0;
		const plinth = document.querySelector( '.riff-plinth' );
		const p = plinth.getBoundingClientRect();
		const [ top, right, bottom, left ] = getComputedStyle( plinth )
			.getPropertyValue( '--riff-plinth-edge' )
			.trim()
			.split( /\s+/ )
			.map( ( share ) => parseFloat( share ) / 100 );
		const stage = document.querySelector( '.riff-stage' );
		return {
			board: getComputedStyle( plinth, '::before' ).display !== 'none',
			plinth: { x: p.x + left * p.width, y: p.y + top * p.height, w: p.width * ( 1 - left - right ), h: p.height * ( 1 - top - bottom ) },
			stage: box( stage ),
			record: box( document.querySelector( '.riff-stage > .riff-record' ) ),
			arm: [ '.riff-arm', '.riff-arm-base', '.riff-arm-tube' ].map( ( q ) => box( document.querySelector( q ) ) ),
			controls: [ ...document.querySelectorAll( '.riff-np :is(button, input, [role="slider"]):not(.riff-arm, .riff-sleeve, .riff-np-head *)' ) ]
				.filter( shown )
				.map( box ),
			display: [ ...document.querySelectorAll( '.riff-keys .riff-level' ) ].filter( shown ).map( box ),
			names: [ ...document.querySelectorAll( '.riff-np :is(button, input):not(.riff-sleeve)' ) ].filter( shown ).map( ( el ) => el.getAttribute( 'aria-label' ) ),
		};
	} );

const inside = ( a, b ) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;
const meet = ( a, b ) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

// What the deck has to hold, in every arrangement.
const NAMES = [ 'Play', 'Pause', '33⅓ revolutions per minute', '45 revolutions per minute', 'Previous', 'Next', 'Shuffle', 'Repeat', 'Pitch' ];

async function deck( page ) {
	await page.emulateMedia( { reducedMotion: 'no-preference' } );
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).nth( 0 ).click();
	await page.locator( '.riff-bar-info' ).click();
	await expect( page.locator( '.riff-np' ) ).toBeVisible();
}

async function settled( page ) {
	await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-deck', 'out' );
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

function check( size, m ) {
	const at = `${ size.width }×${ size.height }`;
	expect.soft( m.board, `${ at }: the plinth's board is drawn` ).toBe( true );
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
	for ( const c of m.controls ) {
		expect.soft( Math.min( c.w, c.h ), `${ at }: ${ c.name } at least 44px` ).toBeGreaterThanOrEqual( 43.5 );
	}
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
				check( size, m );
			}
		} );
	} );

sizes( 'On a touch screen on its side', [ { width: 844, height: 390 }, { width: 932, height: 430 }, { width: 667, height: 375 } ], true );
sizes( 'With a mouse', [ { width: 1024, height: 600 }, { width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 } ], false );

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
