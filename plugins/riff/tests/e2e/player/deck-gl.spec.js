/**
 * Where the browser can draw in WebGL2, the deck is the one WebGL draws at every size the turntable
 * shows at: a laptop's window as much as a large screen, with its keys along the front, and a phone
 * on its side, with them beside the arm, seen from the one chair at every size. Skipped where no
 * graphics card draws WebGL2 for the test browser, as for headless Chromium without a GPU, where
 * Now Playing is the cover alone (reality.spec.js) and deck-sizes.spec.js measures the deck drawn
 * without its pixels. Run it with a GPU (headed, or with --use-angle=metal) to see it.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { playerSite } = require( '../helpers/site' );
const { flat, onScreen } = require( '../helpers/turntable' );

const made = own();
let postUrl;

test.beforeAll( async ( { requestUtils } ) => {
	( { postUrl } = await playerSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

// As deck-gl.js asks: WebGL2 from a graphics card, not drawn in software.
const card = ( page ) =>
	page.evaluate( () => {
		const gl = document.createElement( 'canvas' ).getContext( 'webgl2', { failIfMajorPerformanceCaveat: true } );
		const names = gl?.getExtension( 'WEBGL_debug_renderer_info' );
		return !! gl && ! ( names && /swiftshader|llvmpipe|software|basic render/i.test( gl.getParameter( names.UNMASKED_RENDERER_WEBGL ) ) );
	} );

// The eye (deck-gl.js), across the desk in its chair once the deck is laid there.
const eye = ( page ) => page.locator( '.riff-deck-gl' );

// Opens the album's Now Playing with the record out, on a graphics card, or skips.
async function opened( page, info ) {
	test.skip( info.project.name !== 'chromium', 'Measured in desktop Chromium.' );
	await page.goto( postUrl );
	test.skip( ! ( await card( page ) ), 'No graphics card draws WebGL2 in this browser.' );
	await page.emulateMedia( { reducedMotion: 'no-preference' } );
	await page.locator( '.riff-row' ).nth( 0 ).click();
	await page.locator( '.riff-bar-info' ).click();
	await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-deck', 'out' );
	await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-gl', '' );
}

// Whether the keys are along the front of the plinth, under the record, or beside the arm.
// Measured on the page's flat deck, without the transform deck-gl.js lays the keys where they are drawn with.
const front = ( page ) =>
	page.evaluate( () => {
		const panel = document.querySelector( '.riff-keys' );
		const laid = panel.style.transform;
		panel.style.transform = 'none';
		const along = document.querySelector( '.riff-keys button' ).getBoundingClientRect().top > document.querySelector( '.riff-stage > .riff-record' ).getBoundingClientRect().bottom;
		panel.style.transform = laid;
		return along;
	} );

// The middle of a part of the page's deck on the screen, as deck-gl.js has laid it.
const centre = ( page, selector ) =>
	page.locator( selector ).evaluate( ( el ) => {
		const b = el.getBoundingClientRect();
		return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
	} );

// A point on the arm's grip, near its headshell, on the screen: where it is on the page's flat
// deck, carried through the transform deck-gl.js laid the arm's mount with.
const gripAt = ( page ) =>
	page.evaluate( () => {
		const mount = document.querySelector( '.riff-mount' );
		const path = document.querySelector( '.riff-arm-grip' );
		const laid = mount.style.transform;
		mount.style.transform = 'none';
		const box = mount.getBoundingClientRect();
		const p = path.getPointAtLength( path.getTotalLength() * 0.85 );
		const onDeck = new DOMPoint( p.x, p.y ).matrixTransform( path.getScreenCTM() );
		mount.style.transform = laid;
		const q = new DOMMatrix( laid || 'none' ).transformPoint( new DOMPoint( onDeck.x - box.left, onDeck.y - box.top, 0, 1 ) );
		return { x: box.left + q.x / q.w, y: box.top + q.y / q.w };
	} );

// How many of the canvas's pixels on a key of the page's deck, as laid, and just above it, are a
// lit lamp's warm light.
const lamplit = ( page, selector ) =>
	page.evaluate( ( part ) => {
		const canvas = document.querySelector( '.riff-deck-gl' );
		const b = canvas.getBoundingClientRect();
		// The key's box, and the plinth just above it, where its lamp is.
		const key = document.querySelector( part ).getBoundingClientRect();
		const s = { left: key.left, top: key.top - key.height * 0.6, width: key.width, height: key.height * 1.6 };
		const k = canvas.width / b.width;
		const copy = document.createElement( 'canvas' );
		copy.width = canvas.width;
		copy.height = canvas.height;
		const g = copy.getContext( '2d' );
		g.drawImage( canvas, 0, 0 );
		const d = g.getImageData( Math.round( ( s.left - b.left ) * k ), Math.round( ( s.top - b.top ) * k ), Math.max( 1, Math.round( s.width * k ) ), Math.max( 1, Math.round( s.height * k ) ) ).data;
		let n = 0;
		for ( let i = 0; i < d.length; i += 4 ) {
			n += d[ i ] > 150 && d[ i ] >= d[ i + 1 ] && d[ i ] - d[ i + 2 ] > 60 ? 1 : 0;
		}
		return n;
	}, selector );

// A press where a part is drawn, by a finger or a mouse.
async function press( page, selector, touch ) {
	const { x, y } = await centre( page, selector );
	if ( touch ) {
		await page.touchscreen.tap( x, y );
	} else {
		await page.mouse.click( x, y );
	}
}

// A drag from one point of the screen to another, by a finger (as the browser's own touch events) or a mouse.
async function drag( page, from, to, touch ) {
	const steps = 10;
	if ( touch ) {
		const cdp = await page.context().newCDPSession( page );
		const at = ( t ) => [ { x: from[ 0 ] + ( to[ 0 ] - from[ 0 ] ) * t, y: from[ 1 ] + ( to[ 1 ] - from[ 1 ] ) * t } ];
		await cdp.send( 'Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at( 0 ) } );
		for ( let i = 1; i <= steps; i++ ) {
			await cdp.send( 'Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at( i / steps ) } );
		}
		await cdp.send( 'Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] } );
		await cdp.detach();
		return;
	}
	await page.mouse.move( ...from );
	await page.mouse.down();
	await page.mouse.move( ...to, { steps } );
	await page.mouse.up();
}

// Every control of the deck works where it is drawn, by a finger or a mouse, and is reached by the
// keyboard with its focus ring there: each key, its lamp showing what it says, the pitch fader and its
// readout, the arm lifted by its grip, carried to a groove and set down, the grooves themselves under
// a mouse, and the display drawing what is playing.
async function everyControl( page, at, touch ) {
	const audio = () => page.evaluate( () => ( { paused: document.querySelector( '.riff-audio' ).paused, src: document.querySelector( '.riff-audio' ).currentSrc } ) );
	const shuffle = page.locator( '.riff-key-shuffle' );
	const repeat = page.locator( '.riff-key-repeat' );

	// Shuffle and repeat, and their lamps.
	const shuffled = await shuffle.getAttribute( 'aria-pressed' );
	await press( page, '.riff-key-shuffle', touch );
	await expect( shuffle, `${ at }: shuffle pressed where drawn` ).not.toHaveAttribute( 'aria-pressed', shuffled );
	if ( shuffled === 'false' ) {
		await expect.poll( () => lamplit( page, '.riff-key-shuffle' ), `${ at }: shuffle's lamp lit on it` ).toBeGreaterThan( 0 );
	}
	await press( page, '.riff-key-shuffle', touch );
	await expect( shuffle ).toHaveAttribute( 'aria-pressed', shuffled );
	await expect( repeat ).toHaveAttribute( 'data-repeat', 'off' );
	await press( page, '.riff-key-repeat', touch );
	await expect( repeat, `${ at }: repeat pressed where drawn` ).not.toHaveAttribute( 'data-repeat', 'off' );
	await expect.poll( () => lamplit( page, '.riff-key-repeat' ), `${ at }: repeat's lamp lit on it` ).toBeGreaterThan( 0 );
	for ( let i = 0; i < 3 && ( await repeat.getAttribute( 'data-repeat' ) ) !== 'off'; i++ ) {
		await press( page, '.riff-key-repeat', touch );
	}
	await expect( repeat ).toHaveAttribute( 'data-repeat', 'off' );

	// The speeds.
	await press( page, '.riff-key-45', touch );
	await expect( page.locator( '.riff-key-45' ), `${ at }: 45 pressed where drawn` ).toHaveAttribute( 'aria-checked', 'true' );
	await press( page, '.riff-key-33', touch );
	await expect( page.locator( '.riff-key-33' ), `${ at }: 33 pressed where drawn` ).toHaveAttribute( 'aria-checked', 'true' );

	// The track after and before.
	const first = ( await audio() ).src;
	await press( page, '.riff-key-next', touch );
	await expect.poll( async () => ( await audio() ).src, `${ at }: next pressed where drawn` ).not.toBe( first );
	await press( page, '.riff-key-prev', touch );
	await expect.poll( async () => ( await audio() ).src, `${ at }: previous pressed where drawn` ).toBe( first );

	// Start and stop, and start's lamp.
	await expect.poll( async () => ( await audio() ).paused ).toBe( false );
	await expect.poll( () => lamplit( page, '.riff-key-start' ), `${ at }: start's lamp lit on it` ).toBeGreaterThan( 0 );
	await press( page, '.riff-key-start', touch );
	await expect.poll( async () => ( await audio() ).paused, `${ at }: stopped where drawn` ).toBe( true );
	await press( page, '.riff-key-start', touch );
	await expect.poll( async () => ( await audio() ).paused, `${ at }: started where drawn` ).toBe( false );

	// The pitch fader, along its drawn slot, and its readout.
	const fader = page.locator( '[data-riff-pitch]' );
	const slot = await fader.evaluate( ( el ) => {
		const b = el.getBoundingClientRect();
		return b.height > b.width ? [ b.left + b.width / 2, b.top + b.height / 2, 0, -b.height * 0.3 ] : [ b.left + b.width / 2, b.top + b.height / 2, b.width * 0.3, 0 ];
	} );
	await drag( page, [ slot[ 0 ], slot[ 1 ] ], [ slot[ 0 ] + slot[ 2 ], slot[ 1 ] + slot[ 3 ] ], touch );
	await expect.poll( () => fader.inputValue(), `${ at }: the pitch fader moved where drawn` ).not.toBe( '0' );
	await expect( page.locator( '.riff-pitch output' ), `${ at }: its readout` ).not.toHaveText( '0.0' );
	await fader.evaluate( ( el ) => {
		el.value = '0';
		el.dispatchEvent( new Event( 'input', { bubbles: true } ) );
	} );

	// The arm: lifted by its grip, carried to a groove and set down there.
	const arm = page.locator( '.riff-arm' );
	const max = await arm.getAttribute( 'aria-valuemax' );
	const grip = await gripAt( page );
	const record = await page.locator( '.riff-record' ).boundingBox();
	const [ [ dx, dy ] ] = await onScreen( page, [ [ record.x + record.width * 0.5, record.y + record.height * 0.7 ] ] );
	await drag( page, [ grip.x, grip.y ], [ dx, dy ], touch );
	await expect( arm, `${ at }: the arm set down near the label` ).toHaveAttribute( 'aria-valuenow', max );

	// The grooves under a mouse: the band and the moment said, and a press puts the needle there.
	if ( ! touch ) {
		const cue = await flat( page, () => {
			const b = document.querySelector( '.riff-cue' ).getBoundingClientRect();
			return [ b.x + b.width / 2, b.y + b.height / 2, b.width / 2 ];
		} );
		const [ [ gx, gy ] ] = await onScreen( page, [ [ cue[ 0 ] - 0.93 * cue[ 2 ], cue[ 1 ] ] ], 'record' );
		await page.mouse.move( gx, gy + 1 );
		await page.mouse.move( gx, gy );
		await expect( page.locator( '.riff-cue-tip' ), `${ at }: the groove said where drawn` ).toBeVisible();
		await page.mouse.click( gx, gy );
		await expect( arm, `${ at }: the needle put down in the first band` ).toHaveAttribute( 'aria-valuenow', '1' );
		await page.mouse.move( 0, 0 );
	}

	// The display, in its drawn window, drawing the time as it goes.
	const shown = () => page.locator( '.riff-level' ).evaluate( ( el ) => el.toDataURL() );
	const before = await shown();
	await expect.poll( shown, `${ at }: the display drawing what plays` ).not.toBe( before );

	// The keyboard: each control focused shows its ring on its drawn part, and works from there.
	await page.keyboard.press( 'Shift' );
	for ( const part of [ '.riff-key-shuffle', '.riff-key-start', '[data-riff-pitch]', '.riff-arm' ] ) {
		await page.locator( part ).focus();
		const ring = await page.locator( part ).evaluate( ( el ) => {
			const b = el.getBoundingClientRect();
			// The arm, long and turned, is hit by its grip (above), not at its box's middle.
			const hit = el.matches( '.riff-arm' ) || el === document.elementFromPoint( b.left + b.width / 2, b.top + b.height / 2 )?.closest( 'button, input' );
			// The arm's ring is drawn round its tube (riff.css).
			const ringed = el.matches( '.riff-arm' ) ? el.querySelector( '.riff-arm-tube' ) : el;
			return { visible: el.matches( ':focus-visible' ) && getComputedStyle( ringed ).outlineStyle !== 'none', hit };
		} );
		expect( ring, `${ at }: ${ part } focused where drawn` ).toEqual( { visible: true, hit: true } );
	}
	const now = await shuffle.getAttribute( 'aria-pressed' );
	await shuffle.focus();
	await page.keyboard.press( 'Space' );
	await expect( shuffle, `${ at }: shuffle from the keyboard` ).not.toHaveAttribute( 'aria-pressed', now );
	await page.keyboard.press( 'Space' );
	await page.locator( '.riff-arm' ).focus();
	await page.keyboard.press( 'Home' );
	await expect( arm, `${ at }: the arm from the keyboard` ).toHaveAttribute( 'aria-valuenow', '1' );
	await page.locator( '.riff-arm' ).blur();
}

const sizes = ( title, list, touch ) =>
	test.describe( title, () => {
		test.use( { viewport: list[ 0 ].size, isMobile: touch, hasTouch: touch } );

		test( 'the deck is the one WebGL draws', async ( { page }, info ) => {
			test.skip( info.project.name !== 'chromium', 'Measured in desktop Chromium.' );
			await page.goto( postUrl );
			test.skip( ! ( await card( page ) ), 'No graphics card draws WebGL2 in this browser.' );
			await page.emulateMedia( { reducedMotion: 'no-preference' } );
			await page.locator( '.riff-row' ).nth( 0 ).click();
			await page.locator( '.riff-bar-info' ).click();
			const root = page.locator( '#riff' );
			for ( const { size, keys } of list ) {
				const at = `${ size.width }×${ size.height }`;
				await page.setViewportSize( size );
				await expect( root, at ).toHaveAttribute( 'data-riff-deck', 'out' );
				await expect( root, `${ at }: drawn in WebGL` ).toHaveAttribute( 'data-riff-gl', '' );
				await expect( page.locator( '.riff-deck-gl' ), `${ at }: the canvas shown` ).toBeVisible();
				await expect.poll( () => front( page ), `${ at }: the keys ${ keys }` ).toBe( keys === 'along the front' );
				// From the chair, the whole plinth inside the stage: its sides and its foot clear of the
				// stage's edges (the sleeve above may be cropped by the top).
				await expect( eye( page ), `${ at }: back in the chair` ).toHaveAttribute( 'data-riff-camera', 'across' );
				const fits = await page.evaluate( () => {
					const [ left, , right, bottom ] = document.querySelector( '.riff-deck-gl' ).dataset.riffDeckBox.split( ' ' ).map( Number );
					const stage = document.querySelector( '.riff-stage' ).getBoundingClientRect();
					return { left: left - stage.left, right: stage.right - right, bottom: stage.bottom - bottom };
				} );
				for ( const [ side, clear ] of Object.entries( fits ) ) {
					expect( clear, `${ at }: the plinth's ${ side } inside the stage` ).toBeGreaterThanOrEqual( 8 );
				}
				// The page's keys lie on the drawn ones: start's lamp, lit while the music plays, is drawn
				// inside the page's start key, and a press there is that key's.
				await expect( root, `${ at }: playing` ).toHaveAttribute( 'data-playing', 'true' );
				await expect.poll( () => lamplit( page, '.riff-key-start' ), `${ at }: start's lamp drawn on the page's start key` ).toBeGreaterThan( 0 );
				for ( const key of [ '.riff-key-start', '.riff-key-shuffle', '.riff-key-next' ] ) {
					const { x, y } = await centre( page, key );
					expect( await page.evaluate( ( [ k, px, py ] ) => !! document.elementFromPoint( px, py )?.closest( k ), [ key, x, y ] ), `${ at }: ${ key } under its drawn place` ).toBe( true );
				}
				// And the arm's grip, where its tube is drawn.
				const grip = await gripAt( page );
				expect( await page.evaluate( ( [ px, py ] ) => !! document.elementFromPoint( px, py )?.closest( '.riff-arm' ), [ grip.x, grip.y ] ), `${ at }: the grip under the drawn arm` ).toBe( true );
				await expect( eye( page ), `${ at }: still in the chair` ).toHaveAttribute( 'data-riff-camera', 'across' );
				await everyControl( page, at, touch );
				await expect( eye( page ), `${ at }: still in the chair, every control used` ).toHaveAttribute( 'data-riff-camera', 'across' );
			}
		} );
	} );

// The owner's windows: a wide, short laptop window, and a large screen.
sizes(
	'With a mouse',
	[
		{ size: { width: 1000, height: 540 }, keys: 'along the front' },
		{ size: { width: 2000, height: 1070 }, keys: 'along the front' },
		{ size: { width: 1280, height: 720 }, keys: 'along the front' },
		{ size: { width: 800, height: 420 }, keys: 'beside the arm' },
	],
	false
);
sizes( 'On a touch screen on its side', [ { size: { width: 844, height: 390 }, keys: 'beside the arm' } ], true );

test.describe( 'The eye, with a mouse', () => {
	test.use( { viewport: { width: 1280, height: 720 } } );

	test( 'stays in the chair while the deck is used, and the arm is taken where it is drawn', async ( { page }, info ) => {
		await opened( page, info );
		await expect( eye( page ), 'at rest, back in the chair' ).toHaveAttribute( 'data-riff-camera', 'across' );
		const grip = await gripAt( page );
		await page.mouse.move( grip.x, grip.y, { steps: 4 } );
		await page.mouse.down();
		await page.mouse.move( grip.x - 40, grip.y + 20, { steps: 6 } );
		await expect( page.locator( '.riff-arm' ), 'taken by its drawn grip' ).toHaveAttribute( 'data-riff-held', '' );
		await expect( eye( page ), 'not moved by the hand' ).toHaveAttribute( 'data-riff-camera', 'across' );
		await page.mouse.up();
		await page.keyboard.press( 'Shift' );
		await page.locator( '.riff-arm' ).focus();
		await page.waitForTimeout( 300 );
		await expect( eye( page ), 'not moved by the keyboard' ).toHaveAttribute( 'data-riff-camera', 'across' );
	} );
} );

test.describe( 'A key', () => {
	test.use( { viewport: { width: 1440, height: 900 } } );

	test( 'goes down where it is pressed, its legend with it, and comes back', async ( { page }, info ) => {
		await opened( page, info );
		await expect( eye( page ) ).toHaveAttribute( 'data-riff-camera', 'across' );
		const key = page.locator( '.riff-key-33' );
		// Marks on the cap at its left edge, its middle and its right edge, which move as its legend does.
		await key.evaluate( ( el ) => {
			for ( const [ name, x ] of [ [ 'l', '8%' ], [ 'm', '50%' ], [ 'r', '92%' ] ] ) {
				const mark = document.createElement( 'i' );
				mark.dataset.mark = name;
				mark.style.cssText = `position:absolute;left:${ x };top:50%;width:1px;height:1px`;
				el.append( mark );
			}
		} );
		const marks = () => key.evaluate( ( el ) => Object.fromEntries( [ ...el.querySelectorAll( '[data-mark]' ) ].map( ( m ) => [ m.dataset.mark, m.getBoundingClientRect().top ] ) ) );
		const rest = await marks();
		for ( const [ side, other ] of [ [ 'r', 'l' ], [ 'l', 'r' ] ] ) {
			const at = await key.locator( `[data-mark="${ side }"]` ).evaluate( ( m ) => [ m.getBoundingClientRect().left, m.getBoundingClientRect().top ] );
			await page.mouse.move( ...at );
			await page.mouse.down();
			await page.waitForTimeout( 250 );
			const down = await marks();
			expect( down.m - rest.m, 'the legend down with the cap' ).toBeGreaterThan( 0.3 );
			expect( down[ side ] - rest[ side ], `pressed at its ${ side } edge, that edge lower than the other` ).toBeGreaterThan( down[ other ] - rest[ other ] + 0.2 );
			await page.mouse.up();
			await expect.poll( async () => Math.abs( ( await marks() ).m - rest.m ), 'back at rest' ).toBeLessThan( 0.15 );
		}
	} );
} );

test.describe( 'The eye, under a finger', () => {
	test.use( { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } );

	test( 'stays in the chair, and a tap on a drawn key is that key\'s', async ( { page }, info ) => {
		await opened( page, info );
		await expect( eye( page ), 'at rest, back in the chair' ).toHaveAttribute( 'data-riff-camera', 'across' );
		const shuffle = page.locator( '.riff-key-shuffle' );
		const was = await shuffle.getAttribute( 'aria-pressed' );
		const { x, y } = await centre( page, '.riff-key-shuffle' );
		await page.touchscreen.tap( x, y );
		await expect( shuffle, 'pressed where it is drawn' ).not.toHaveAttribute( 'aria-pressed', was );
		await expect( eye( page ), 'not moved by the finger' ).toHaveAttribute( 'data-riff-camera', 'across' );
	} );
} );
