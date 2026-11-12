/**
 * A sidebar view (`place: 'sidebar'`): docked in the Listen app's sidebar under a row of its own,
 * open beside whatever the listener browses, on the rail as its icon, and a panel wherever there is
 * no sidebar. No feature of Riff's own docks there, so the views are ones a script adds, with
 * window.riff.view(), as a plugin's would; tests/php/test-registry.php covers the server's rows.
 * Desktop Chromium only: the sidebar is a wide window's.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const AxeBuilder = require( '@axe-core/playwright' ).default;
const { own } = require( '../helpers/own' );
const { AXE_TAGS, appSite } = require( '../helpers/site' );
const { openView } = require( '../helpers/views' );

const made = own();
let pageUrl;
let postId;

test.beforeAll( async ( { requestUtils } ) => {
	( { pageUrl, postId } = await appSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

// The view, added as a plugin's script would, with what it is told kept on the page.
const dockTest = ( page ) =>
	page.evaluate( () => {
		window.dockSeen = [];
		document.addEventListener( 'riff:view', ( e ) => {
			if ( e.detail.id === 'dock-test' ) {
				window.dockSeen.push( e.detail.open );
			}
		} );
		window.riff.view( 'dock-test', {
			label: 'Dock test',
			place: 'sidebar',
			order: 90,
			icon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="6" fill="currentColor"/></svg>',
			render: ( el, track ) => {
				if ( ! el.querySelector( 'button' ) ) {
					el.innerHTML = '<p></p><button type="button">Inside</button>';
				}
				el.querySelector( 'p' ).textContent = `For ${ track?.title || 'nothing' }`;
			},
		} );
	} );

const appUrl = () => pageUrl.replace( /\/?$/, '/' ) + `app/?riff=${ postId }`;

test.describe( 'A view docked in the sidebar', () => {
	test.beforeEach( async ( { page, isMobile } ) => {
		test.skip( isMobile, 'The sidebar is a wide window\'s.' );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.goto( appUrl() );
		// A listener who closed About, open by default, so the side is the dock test's alone.
		await page.evaluate( () => {
			localStorage.clear();
			localStorage.setItem( 'riff:panel', '' );
		} );
		await page.reload();
		await page.locator( '[data-riff-app-action="play"]' ).click();
		await page.evaluate( () => document.querySelectorAll( 'audio, video' ).forEach( ( m ) => m.pause() ) );
		await dockTest( page );
	} );

	test( 'opens under its row, stays open as the listener browses and as a panel opens beside it, and closes from its row, its button or Escape', async ( { page } ) => {
		const row = page.locator( '.riff-app-bar [data-riff-dock-item="dock-test"]' );
		const toggle = row.locator( '[data-riff-dock-opens="dock-test"]' );
		const button = page.locator( '.riff-bar [data-riff-control="dock-test"]' );
		const region = page.locator( '[data-riff-panel="dock-test"]' );
		await expect( toggle ).toHaveAccessibleName( 'Dock test' );
		await expect( toggle ).toHaveAttribute( 'aria-expanded', 'false' );
		await expect( region ).toBeHidden();

		// Opening it moves nothing above it: the dock is at the sidebar's foot.
		const library = await page.locator( '.riff-app-bar .riff-app-library' ).boundingBox();
		await toggle.click();
		await expect( toggle ).toHaveAttribute( 'aria-expanded', 'true' );
		await expect( button ).toHaveAttribute( 'aria-pressed', 'true' );
		await expect( row.getByRole( 'region', { name: 'Dock test' } ) ).toContainText( 'For ' );
		await expect( toggle ).toBeFocused();
		expect( await page.locator( '.riff-app-bar .riff-app-library' ).boundingBox() ).toEqual( library );
		await expect( page.locator( '.riff-side' ) ).toBeHidden();
		await region.evaluate( ( el ) => ( el.dataset.mark = 'kept' ) );

		// Browsing: the sidebar is drawn again with the next view, and the view is the same one,
		// still open, never told it closed.
		await page.locator( '.riff-app-bar a.riff-app-tab[href*="albums"]' ).click();
		await expect( page.locator( '.riff-app-brand' ) ).toHaveAttribute( 'data-riff-view', 'albums' );
		await expect( row.locator( '[data-riff-panel="dock-test"]' ) ).toHaveAttribute( 'data-mark', 'kept' );
		await expect( region ).toBeVisible();

		// Up next opens beside it, a panel as ever, and Now Playing opens and closes around it.
		await page.locator( '.riff-bar [data-riff-control="queue"]' ).click();
		await expect( page.locator( '.riff-side [data-riff-panel="queue"]' ) ).toBeVisible();
		await expect( region ).toBeVisible();
		await page.locator( '.riff-bar [data-riff-control="queue"]' ).click();
		await page.locator( '.riff-bar-info' ).click();
		await expect( page.locator( '.riff-np' ) ).toBeVisible();
		await page.keyboard.press( 'Escape' );
		await expect( page.locator( '.riff-np' ) ).toBeHidden();
		await expect( region ).toBeVisible();
		expect( await page.evaluate( () => window.dockSeen.includes( false ) ) ).toBe( false );
		expect( ( await new AxeBuilder( { page } ).withTags( AXE_TAGS ).include( '.riff-dock' ).analyze() ).violations ).toEqual( [] );

		// Escape inside it closes it, back to its row.
		await region.getByRole( 'button', { name: 'Inside' } ).focus();
		await page.keyboard.press( 'Escape' );
		await expect( region ).toBeHidden();
		await expect( toggle ).toBeFocused();
		await expect( button ).toHaveAttribute( 'aria-pressed', 'false' );

		// Its button in the bar opens it there too, focus going to its row, and closes it.
		await button.click();
		await expect( region ).toBeVisible();
		await expect( toggle ).toBeFocused();
		await page.evaluate( () => window.riff.closeView( 'dock-test' ) );
		await expect( region ).toBeHidden();
		expect( await page.evaluate( () => window.dockSeen ) ).toEqual( [ true, false, true, false ] );
	} );

	test( 'open, a tall view covers none of the sidebar: every tab and the library are there to press, and the view scrolls into reach', async ( { page } ) => {
		await page.setViewportSize( { width: 1440, height: 800 } );
		await page.evaluate( () =>
			window.riff.view( 'dock-tall', {
				label: 'Dock tall',
				place: 'sidebar',
				order: 91,
				render: ( el ) => {
					el.innerHTML = '<div style="height:1200px">Tall</div><button type="button">At its foot</button>';
				},
			} )
		);
		await page.locator( '[data-riff-dock-opens="dock-tall"]' ).click();
		await expect( page.locator( '[data-riff-panel="dock-tall"]' ) ).toBeVisible();
		const bar = page.locator( '.riff-app-bar' );
		await bar.evaluate( ( el ) => ( el.scrollTop = 0 ) );
		// What is under each tab's middle and the library's title is that, not the dock.
		const covered = await bar.evaluate( ( el ) =>
			[ ...el.querySelectorAll( 'a.riff-app-tab, .riff-app-library-title' ) ]
				.filter( ( n ) => n.checkVisibility() )
				.filter( ( n ) => {
					const r = n.getBoundingClientRect();
					const top = document.elementFromPoint( r.left + r.width / 2, r.top + r.height / 2 );
					return r.bottom <= el.getBoundingClientRect().bottom && ! n.contains( top );
				} )
				.map( ( n ) => n.textContent.trim() )
		);
		expect( covered, 'nothing in the sidebar under the dock' ).toEqual( [] );
		await expect( bar.locator( 'a.riff-app-tab' ).first() ).toBeVisible();
		const foot = page.locator( '[data-riff-panel="dock-tall"]' ).getByRole( 'button', { name: 'At its foot' } );
		await foot.scrollIntoViewIfNeeded();
		await foot.click();
	} );

	test( 'opens again on the next visit, and on the rail is its icon, which opens the sidebar to it', async ( { page } ) => {
		const toggle = page.locator( '[data-riff-dock-opens="dock-test"]' );
		const region = page.locator( '[data-riff-panel="dock-test"]' );
		await toggle.click();
		await expect( region ).toBeVisible();

		await page.reload();
		await dockTest( page );
		await expect( toggle ).toHaveAttribute( 'aria-expanded', 'true' );
		await expect( region ).toBeVisible();

		// Folded to the rail, it is its icon, still open underneath; pressed, the sidebar opens to it.
		await page.locator( '.riff-app-collapse' ).click();
		await expect( page.locator( '[data-riff-app]' ) ).toHaveAttribute( 'data-sidebar', 'mini' );
		await expect( toggle ).toBeVisible();
		await expect( region ).toBeHidden();
		expect( ( await toggle.boundingBox() ).width ).toBeLessThanOrEqual( 72 );
		await toggle.click();
		await expect( page.locator( '[data-riff-app]' ) ).toHaveAttribute( 'data-sidebar', 'full' );
		await expect( toggle ).toHaveAttribute( 'aria-expanded', 'true' );
		await expect( region ).toBeVisible();

		// Closed and folded, its button in the bar opens the sidebar to it as well.
		await toggle.click();
		await page.locator( '.riff-app-collapse' ).click();
		await page.locator( '.riff-bar [data-riff-control="dock-test"]' ).click();
		await expect( page.locator( '[data-riff-app]' ) ).toHaveAttribute( 'data-sidebar', 'full' );
		await expect( region ).toBeVisible();
	} );

	test( 'without the sidebar it is a panel beside the page, and back in the dock once the window widens', async ( { page } ) => {
		const region = page.locator( '[data-riff-panel="dock-test"]' );
		await page.locator( '[data-riff-dock-opens="dock-test"]' ).click();
		await expect( region ).toBeVisible();

		await page.setViewportSize( { width: 820, height: 900 } );
		await expect( region ).toBeHidden();
		await expect( page.locator( '.riff-dock' ) ).toBeHidden();
		const button = page.locator( '.riff-bar [data-riff-control="dock-test"]' );
		await expect( button ).toHaveAttribute( 'aria-pressed', 'false' );
		// As narrow as a phone's layout, its chip in Now Playing opens it.
		await openView( page, 'dock-test' );
		await expect( page.locator( '.riff-side [data-riff-panel="dock-test"]' ) ).toBeVisible();
		await expect( page.locator( '.riff-chips [data-riff-chip="dock-test"]' ) ).toHaveAttribute( 'aria-pressed', 'true' );
		await expect( page.locator( '.riff-side-title' ) ).toHaveText( 'Dock test' );

		await page.setViewportSize( { width: 1440, height: 900 } );
		await expect( page.locator( '.riff-side [data-riff-panel="dock-test"]' ) ).toHaveCount( 0 );
		// Under Now Playing, opened on the way to its chip, until that closes.
		await page.keyboard.press( 'Escape' );
		await expect( page.locator( '.riff-np' ) ).toBeHidden();
		await expect( page.locator( '.riff-app-bar [data-riff-panel="dock-test"]' ) ).toBeVisible();
		await expect( button ).toHaveAttribute( 'aria-pressed', 'true' );
	} );
} );
