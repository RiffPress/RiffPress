/**
 * The WCAG 2.2 criteria a docked player trips on, each as a check: target size (2.5.8), focus not
 * obscured by the bar (2.4.11), audio control (1.4.2), a modal that keeps Tab inside it, and the
 * bar's two Now Playing buttons told apart. Runs in desktop Chromium and at an iPhone's size.
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );

const { FIXTURES } = require( '../helpers/site' );
const made = own();
let postUrl;

test.beforeAll( async ( { requestUtils } ) => {
	const tracks = [];
	for ( const file of [ '02 - Underground [underground].mp3', '03 - Trombone Detritus [detritus].mp3' ] ) {
		tracks.push( await made.media( requestUtils, path.join( FIXTURES, file ) ) );
	}
	const block = ( m ) =>
		`<!-- wp:audio {"id":${ m.id }} --><figure class="wp-block-audio"><audio controls src="${ m.source_url }"></audio></figure><!-- /wp:audio -->`;
	// A long post: paragraphs with links through it, the tracks at the end, so the bar has
	// something to cover and the last link sits where the bar is.
	const paragraphs = Array.from( { length: 30 }, ( _, i ) =>
		`<!-- wp:paragraph --><p>Paragraph ${ i + 1 } of the liner notes, with <a href="#note-${ i + 1 }">a note</a> in it.</p><!-- /wp:paragraph -->`
	).join( '' );
	postUrl = (
		await made.post( requestUtils, {
			title: `Riff WCAG e2e ${ Date.now() }`,
			status: 'publish',
			content: paragraphs + tracks.map( block ).join( '' ) + '<!-- wp:paragraph --><p>The <a href="#last">last link</a> on the page.</p><!-- /wp:paragraph -->',
		} )
	).link;
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

// Every control a pointer can reach inside the player, with its box.
const targets = ( page, within ) =>
	page.evaluate( ( sel ) => {
		const out = [];
		for ( const el of document.querySelectorAll( `${ sel } button, ${ sel } a[href], ${ sel } input, ${ sel } [role="menuitem"], ${ sel } [role="tab"]` ) ) {
			if ( el.checkVisibility?.() === false || el.closest( '[hidden], [inert]' ) ) {
				continue;
			}
			const r = el.getBoundingClientRect();
			if ( ! r.width || ! r.height ) {
				continue;
			}
			out.push( {
				name: ( el.getAttribute( 'aria-label' ) || el.textContent.trim().replace( /\s+/g, ' ' ) ).slice( 0, 40 ),
				tag: el.tagName.toLowerCase(),
				type: el.getAttribute( 'type' ) || '',
				w: Math.round( r.width ),
				h: Math.round( r.height ),
			} );
		}
		return out;
	}, within );

test( 'every control in the bar and Now Playing is at least 24 by 24 pixels (2.5.8)', async ( { page, isMobile } ) => {
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).nth( 0 ).click();
	await page.locator( '.riff-bar-info' ).click();
	await expect( page.locator( '.riff-np' ) ).toBeVisible();
	if ( isMobile ) {
		await page.locator( '.riff-peek' ).click();
	}
	// A native range is its own control: its thumb is the target, laid out by the browser.
	const small = ( await targets( page, '#riff' ) ).filter( ( t ) => t.type !== 'range' && ( t.w < 24 || t.h < 24 ) );
	expect( small, 'controls under 24px' ).toEqual( [] );
	// The rows of a post and their menus too.
	const rows = ( await targets( page, '.wp-block-audio' ) ).filter( ( t ) => t.w < 24 || t.h < 24 );
	expect( rows, 'row controls under 24px' ).toEqual( [] );
} );

test( 'the bar never covers what has focus (2.4.11)', async ( { page } ) => {
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).nth( 0 ).click();
	await page.evaluate( () => document.querySelectorAll( 'audio, video' ).forEach( ( m ) => m.pause() ) );
	await expect( page.locator( '.riff-bar' ) ).toBeVisible();
	// Tab from the top of the post to the last link on the page; each stop must be clear of the bar.
	await page.locator( 'body' ).click( { position: { x: 5, y: 5 } } );
	const covered = [];
	for ( let i = 0; i < 80; i++ ) {
		await page.keyboard.press( 'Tab' );
		const hit = await page.evaluate( () => {
			const a = document.activeElement;
			if ( ! a || a === document.body || a.closest( '#riff' ) ) {
				return null;
			}
			const r = a.getBoundingClientRect();
			const bar = document.querySelector( '.riff-bar' ).getBoundingClientRect();
			const overlaps = r.bottom > bar.top && r.top < bar.bottom && r.right > bar.left && r.left < bar.right;
			return { done: a.getAttribute( 'href' ) === '#last', overlaps, name: a.textContent.trim().slice( 0, 30 ) };
		} );
		if ( hit?.overlaps ) {
			covered.push( hit.name );
		}
		if ( hit?.done ) {
			break;
		}
	}
	expect( covered, 'focused elements under the bar' ).toEqual( [] );
} );

test( 'nothing plays until the listener presses Play, a reload included (1.4.2)', async ( { page } ) => {
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).nth( 0 ).click();
	await expect.poll( () => page.evaluate( () => window.riff.playing() ) ).toBe( true );
	await page.reload();
	await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText( 'Underground' );
	await page.waitForTimeout( 500 );
	expect( await page.evaluate( () => window.riff.playing() ) ).toBe( false );
} );

test( 'Now Playing is opened by one button named for the track; the chevron beside it is not heard', async ( { page } ) => {
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).nth( 0 ).click();
	await expect( page.locator( '.riff-bar-info' ) ).toHaveAttribute( 'aria-label', /^Now Playing: Underground by Airmen of Note/ );
	await expect( page.locator( '.riff-bar .riff-chevron' ) ).toHaveAttribute( 'aria-hidden', 'true' );
	await expect( page.locator( '.riff-bar .riff-chevron' ) ).toHaveAttribute( 'tabindex', '-1' );
} );

test( 'a modal Now Playing keeps Tab inside it', async ( { page, isMobile } ) => {
	test.skip( ! isMobile, 'Now Playing is modal only where it covers the bar' );
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).nth( 0 ).click();
	await page.locator( '.riff-bar-info' ).click();
	const np = page.locator( '.riff-np' );
	await expect( np ).toHaveAttribute( 'aria-modal', 'true' );
	await expect( page.locator( '[data-riff-action="close"]' ) ).toBeFocused();
	// Shift+Tab from the first control lands on the last, inside the dialog, not in the browser.
	await page.keyboard.press( 'Shift+Tab' );
	const where = await page.evaluate( () => document.activeElement?.closest( '.riff-np' ) ? document.activeElement.getAttribute( 'aria-label' ) || document.activeElement.textContent.trim() : 'outside' );
	expect( where ).not.toBe( 'outside' );
	await page.keyboard.press( 'Tab' );
	await expect( page.locator( '[data-riff-action="close"]' ) ).toBeFocused();
} );

test( 'Up next tells a screen reader where each track sits in the list', async ( {
	page,
} ) => {
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).nth( 0 ).click();
	const items = page.locator( '#riff-queue-list > li' );
	await expect( items ).toHaveCount( 2 );
	await expect( items.nth( 0 ) ).toHaveAttribute( 'aria-posinset', '1' );
	await expect( items.nth( 1 ) ).toHaveAttribute( 'aria-posinset', '2' );
	await expect( items.nth( 1 ) ).toHaveAttribute( 'aria-setsize', '2' );
} );

test( 'every dragging movement has a single-pointer alternative (2.5.7)', async ( {
	page,
	isMobile,
} ) => {
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).nth( 0 ).click();
	// Swiping the bar sideways skips: Next and Previous, in the bar on a wide screen and in Now
	// Playing on a phone. Dragging Now Playing down closes it: Close, where it is a sheet; a wide
	// screen's panel closes from the bar's caret and Escape. Swiping the bar down stops the
	// player, on a phone: Stop, beside Share under the controls. A wide screen has no such swipe,
	// and no Stop.
	await page.locator( '.riff-bar-info' ).click();
	for ( const action of [ 'next', 'prev', isMobile ? 'close' : 'toggle' ] ) {
		await expect(
			page.locator( `#riff [data-riff-action="${ action }"]:visible` ).first()
		).toBeVisible();
	}
	if ( ! isMobile ) {
		await expect( page.locator( '#riff [data-riff-action="dismiss"]:visible' ) ).toHaveCount( 0 );
		return;
	}
	for ( const action of [ 'dismiss' ] ) {
		await expect(
			page.locator( `#riff [data-riff-action="${ action }"]:visible` ).first()
		).toBeVisible();
	}
	// Stop says so in words, and is named by them (2.5.3): a square alone reads as a checkbox.
	const stop = page.locator( '#riff [data-riff-action="dismiss"]' );
	await expect( stop ).toHaveText( 'Stop' );
	await expect( stop ).toHaveAccessibleName( 'Stop' );
	await stop.click();
	await expect( page.locator( '#riff' ) ).toBeHidden();
	expect(
		await page.evaluate( () =>
			document.documentElement.classList.contains( 'has-riff' )
		)
	).toBe( false );
} );

test( 'what the track says reaches the player: captions, the language of a title, and what the cover shows', async ( {
	page,
} ) => {
	await page.goto( postUrl );
	// A track as the server would send it with those fields filled, through the player's own API.
	await page.evaluate( () => {
		const t = JSON.parse(
			document.querySelector( 'figure[data-riff-track]' ).dataset
				.riffTrack
		);
		t.lang = 'fr';
		t.art = ( t.art || [] ).map( ( a ) => ( {
			...a,
			alt: 'Cover of Compositions by Airmen of Note',
		} ) );
		t.video = {
			src: t.src,
			poster: '',
			captions: [
				{
					src: 'data:text/vtt,WEBVTT%0A%0A00:00.000%20--%3E%2000:05.000%0AUnderground',
					label: 'English',
					srclang: 'en',
					kind: 'captions',
				},
			],
		};
		window.riff.play( [ t ] );
	} );
	await expect(
		page.locator( '#riff-queue-list .riff-row-title' ).first()
	).toHaveAttribute( 'lang', 'fr' );
	await expect( page.locator( '.riff-cover' ) ).toHaveAttribute(
		'alt',
		'Cover of Compositions by Airmen of Note'
	);
	await expect( page.locator( '.riff-video track' ) ).toHaveAttribute(
		'srclang',
		'en'
	);
	// The Captions switch sits with the Song or Video switch at the top of Now Playing: hidden
	// in song mode, shown in video mode, off until pressed, and kept once it is.
	await page.locator( '.riff-bar-info' ).click();
	const captions = page.locator( '[data-riff-action="captions"]' );
	await expect( captions ).toBeHidden();
	await page.locator( '[data-riff-mode="video"]' ).click();
	await expect( captions ).toBeVisible();
	await expect( captions ).toHaveAttribute( 'aria-pressed', 'false' );
	await captions.click();
	await expect( captions ).toHaveAttribute( 'aria-pressed', 'true' );
	await expect
		.poll( () =>
			page.evaluate(
				() =>
					document.querySelector( '.riff-video' ).textTracks[ 0 ].mode
			)
		)
		.toBe( 'showing' );
	expect(
		await page.evaluate( () => localStorage.getItem( 'riff:captions' ) )
	).toBe( 'on' );
} );
