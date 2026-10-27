/**
 * Standalone mode, at the page's app/ address: an album page tinted from its cover, a playlist post, the sidebar on a wide screen and tabs on a phone, pills, Spotify's album header, the sidebar's rail, a contrast theme, and the app on its own without the theme.
 * Runs in desktop Chromium and in Chromium at an iPhone's size (see playwright.config.js).
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const AxeBuilder = require( '@axe-core/playwright' ).default;
const { own } = require( '../helpers/own' );
const { expectTidy } = require( '../helpers/tidy' );
const { AXE_TAGS, systemColours, playing, appSite } = require( '../helpers/site' );

const made = own();
let pageUrl;
let postId;
let audioMedia;

test.beforeAll( async ( { requestUtils } ) => {
	( { pageUrl, postId, audioMedia } = await appSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test.describe( 'Standalone', () => {
	test( 'an album page is tinted from its cover, and its text keeps its contrast on the tint', async ( {
		page,
	} ) => {
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + 'app/?riff_view=albums' );
		await page
			.locator( '.riff-card[data-riff-album]', { hasText: 'Compositions' } )
			.first()
			.locator( '.riff-card-link' )
			.click();
		const header = page.locator( '.riff-album-tinted' );
		await expect( header ).toHaveAttribute( 'style', /--riff-album-tint:#[0-9a-f]{6}/ );
		// The wash's colour, resolved by the browser, against the title's and the line under it.
		const ratios = await header.evaluate( ( el ) => {
			const probe = document.createElement( 'span' );
			probe.style.background = 'var(--riff-album-wash)';
			el.append( probe );
			const rgb = ( css ) => {
				const c = document.createElement( 'canvas' ).getContext( '2d' );
				c.fillStyle = css;
				c.fillRect( 0, 0, 1, 1 );
				return [ ...c.getImageData( 0, 0, 1, 1 ).data ].slice( 0, 3 );
			};
			const lum = ( [ r, g, b ] ) =>
				[ r, g, b ]
					.map( ( v ) => v / 255 )
					.map( ( v ) => ( v <= 0.03928 ? v / 12.92 : ( ( v + 0.055 ) / 1.055 ) ** 2.4 ) )
					.reduce( ( sum, v, i ) => sum + v * [ 0.2126, 0.7152, 0.0722 ][ i ], 0 );
			const wash = lum( rgb( getComputedStyle( probe ).backgroundColor ) );
			probe.remove();
			const ratio = ( sel ) => {
				const ink = lum( rgb( getComputedStyle( el.querySelector( sel ) ).color ) );
				return ( Math.max( ink, wash ) + 0.05 ) / ( Math.min( ink, wash ) + 0.05 );
			};
			return { title: ratio( '.riff-album-title' ), meta: ratio( '.riff-album-meta' ) };
		} );
		expect( ratios.title ).toBeGreaterThanOrEqual( 4.5 );
		expect( ratios.meta, 'the quieter line too' ).toBeGreaterThanOrEqual( 4.5 );
	} );

	test( 'a playlist post opened directly shows each track once, though core\'s styles come after Riff\'s', async ( {
		page,
		requestUtils,
	} ) => {
		const items = audioMedia
			.map(
				( m ) =>
					`<!-- wp:playlist-track {"id":${ m.id },"src":"${ m.source_url }","title":"${ m.title.raw }"} /-->`
			)
			.join( '' );
		const post = await made.post( requestUtils, {
			title: 'Riff app playlist',
			status: 'publish',
			content: `<!-- wp:playlist --><figure class="wp-block-playlist"><ol class="wp-block-playlist__tracklist wp-block-playlist__tracklist-show-numbers">${ items }</ol></figure><!-- /wp:playlist -->`,
		} );
		try {
			await page.goto(
				pageUrl.replace( /\/?$/, '/' ) + 'app/?riff=' + post.id
			);
			const playlist = page.locator( '.wp-block-playlist' );
			test.skip(
				! ( await playlist.count() ),
				'The playlist block arrived in WordPress 7.1.'
			);
			await expect( page.locator( '.riff-row' ) ).toHaveCount( 2 );
			await expect(
				page.locator( '.wp-block-playlist-track__button' ).first(),
				'core\'s own track button stays out of sight'
			).toBeHidden();
			await expect(
				page.locator( '.wp-block-playlist__waveform-player' )
			).toBeHidden();
		} finally {
			await requestUtils.rest( {
				method: 'DELETE',
				path: `/wp/v2/posts/${ post.id }`,
				params: { force: true },
			} );
		}
	} );

	test( 'on a wide screen the navigation is a sidebar; on a phone Home, Search and Library are tabs along the bottom, the bar on them', async ( {
		page,
		isMobile,
	} ) => {
		const app = pageUrl.replace( /\/?$/, '/' ) + 'app/';
		await page.goto( app );
		const nav = await page.locator( '.riff-app-bar' ).boundingBox();
		const view = await page.locator( '.riff-app-view' ).boundingBox();
		const brand = page.locator( '.riff-app-brand' );
		const search = page.locator( '.riff-app-tab-search' );
		await expect( brand ).toBeVisible();
		if ( ! isMobile ) {
			expect( nav.x + nav.width, 'the column sits left of the view' ).toBeLessThanOrEqual( view.x + 1 );
			await expect( page.locator( '.riff-app-tab svg' ).first() ).toBeVisible();
			await expect( search, 'the field is in view, so Search is no tab' ).toBeHidden();
			return;
		}
		// At the top, one slim row (the site's name and Sign in) and the lists as chips.
		expect( nav.y + nav.height ).toBeLessThanOrEqual( view.y + 1 );
		expect( nav.height ).toBeLessThan( 120 );
		await expect( page.locator( '.riff-app-tab', { hasText: 'Albums' } ) ).toBeVisible();
		await expect( page.locator( '.riff-app-search' ) ).toBeHidden();
		// Along the bottom, Home, Search and Library, each a full-height target, still in the navigation.
		const height = page.viewportSize().height;
		const tabs = page.locator( '.riff-app-bar' ).locator( '.riff-app-home, .riff-app-tab-search, .riff-app-tab-library' );
		await expect( tabs ).toHaveCount( 3 );
		for ( let i = 0; i < 3; i++ ) {
			const box = await tabs.nth( i ).boundingBox();
			expect( box.height ).toBeGreaterThanOrEqual( 44 );
			expect( Math.abs( box.y + box.height - height ) ).toBeLessThanOrEqual( 1 );
		}
		await expect( page.locator( '.riff-app-home' ) ).toHaveAttribute( 'aria-current', 'page' );
		// Search opens a view of its own: the field, and the lists as tiles; the chips give way.
		await search.click();
		await expect( page ).toHaveURL( /riff_view=search/ );
		await expect( search ).toHaveAttribute( 'aria-current', 'page' );
		await expect( page.locator( '.riff-app-search input' ) ).toBeVisible();
		await expect( page.locator( '.riff-browse-tile' ) ).toHaveCount( 4 );
		await expect( page.locator( '.riff-app-tab', { hasText: 'Albums' } ) ).toBeHidden();
		// Playing, the bar sits on the tabs, and an album has no chips over it.
		await page.goto( app + `?riff=${ postId }` );
		await page.locator( '.riff-row' ).first().click();
		const bar = await page.locator( '#riff .riff-bar' ).boundingBox();
		const home = await page.locator( '.riff-app-home' ).boundingBox();
		expect( Math.abs( bar.y + bar.height - home.y ) ).toBeLessThanOrEqual( 1 );
		await expect( page.locator( '.riff-app-tab', { hasText: 'Albums' } ) ).toBeHidden();
	} );

	test( 'the app\'s buttons are pills on a phone as on a wide screen', async ( {
		page,
		isMobile,
	} ) => {
		await page.goto(
			pageUrl.replace( /\/?$/, '/' ) + `app/?riff=${ postId }`
		);
		const pills = page.locator( '.riff-app .riff-pill' );
		await expect( page.locator( '.riff-app .riff-pill:visible' ).first() ).toBeVisible();
		// Play and Shuffle under a wide header are Spotify's round buttons, not pills; the rest
		// are pills.
		const radii = await pills.evaluateAll( ( els ) =>
			els
				.filter( ( el ) => el.getClientRects().length )
				.filter( ( el ) => getComputedStyle( el ).borderRadius !== '50%' || ! el.closest( '.riff-album-actions' ) )
				.map( ( el ) => getComputedStyle( el ).borderRadius )
		);
		// On a phone, Play and Shuffle are among them.
		expect( radii.length >= ( isMobile ? 2 : 0 ) ).toBe( true );
		expect( radii.filter( ( r ) => r !== '999px' ) ).toEqual( [] );
	} );

	test( 'an album\'s header is Spotify\'s on a wide screen, with a round Play and column heads that line up, and centred on a phone', async ( {
		page,
		isMobile,
	} ) => {
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + 'app/?riff_view=albums' );
		await page.locator( '.riff-grid .riff-card a' ).first().click();
		await expect( page ).toHaveURL( /riff_album=\d+/ );
		const play = page.locator( '.riff-album-actions [data-riff-app-action="play"]' );
		const shuffle = page.locator( '.riff-album-actions [data-riff-app-action="shuffle"]' );
		await expect( play ).toHaveAccessibleName( 'Play' );
		await expect( shuffle ).toHaveAccessibleName( 'Shuffle' );
		if ( isMobile ) {
			// On a phone they stay words, and there are no column heads.
			await expect( play.locator( '.riff-pill-label' ) ).toBeVisible();
			await expect( play.locator( 'svg' ) ).toBeHidden();
			await expect( page.locator( '.riff-tracks-head' ) ).toBeHidden();
			// The cover is centred, as the apps draw an album on a phone, and the
			// header's wash reaches the screen's edges instead of standing in a box.
			const width = page.viewportSize().width;
			const art = await page.locator( '.riff-album-cover' ).boundingBox();
			expect( Math.abs( art.x + ( art.width / 2 ) - ( width / 2 ) ) ).toBeLessThanOrEqual( 2 );
			const wash = await page.locator( '.riff-album-tinted' ).evaluate( ( el ) => {
				const view = el.closest( '.riff-app-view' ).getBoundingClientRect();
				const before = getComputedStyle( el, '::before' );
				return { left: view.left + parseFloat( before.left ), right: view.right - parseFloat( before.right ) };
			} );
			expect( wash.left ).toBeLessThanOrEqual( 0 );
			expect( wash.right ).toBeGreaterThanOrEqual( width );
			await expect( page.locator( '.riff-album-tracks .riff-row-time' ).first() ).toBeHidden();
			return;
		}
		const box = await play.boundingBox();
		expect( [ Math.round( box.width ), Math.round( box.height ) ] ).toEqual( [ 56, 56 ] );
		expect( await play.evaluate( ( el ) => getComputedStyle( el ).borderRadius ) ).toBe( '50%' );
		// The actions are a row of their own, under the cover and the title.
		const cover = await page.locator( '.riff-album-cover' ).boundingBox();
		expect( box.y ).toBeGreaterThan( cover.y + cover.height );
		// The heads sit over what they name.
		const at = await page.evaluate( () => {
			const mid = ( el ) => {
				const r = el.getBoundingClientRect();
				return { left: r.left, centre: r.left + ( r.width / 2 ) };
			};
			const head = document.querySelector( '.riff-tracks-head' );
			return {
				title: mid( head.children[ 1 ] ).left,
				rowTitle: mid( document.querySelector( '.riff-album-tracks .riff-row-title' ) ).left,
				clock: mid( head.children[ 2 ] ).centre,
				time: mid( document.querySelector( '.riff-album-tracks .riff-row-time' ) ).centre,
			};
		} );
		expect( Math.abs( at.title - at.rowTitle ) ).toBeLessThanOrEqual( 2 );
		expect( Math.abs( at.clock - at.time ) ).toBeLessThanOrEqual( 4 );
		await expectTidy( page, '.riff-app', 'an album, standalone' );
		expect( ( await new AxeBuilder( { page } ).withTags( AXE_TAGS ).include( '.riff-app' ).analyze() ).violations ).toEqual( [] );
	} );

	test( 'a card in a row shows its focus ring above and below, where the row\'s scroll would clip it', async ( {
		page,
	} ) => {
		await page.goto( pageUrl );
		const play = page.locator( '.riff-shelf-row .riff-card-play' ).first();
		await play.focus();
		await page.keyboard.press( 'Tab' );
		const link = page.locator( '.riff-shelf-row .riff-card-link' ).first();
		await expect( link ).toBeFocused();
		const { ring, row } = await link.evaluate( ( el ) => {
			const card = el.closest( '.riff-card' );
			const style = getComputedStyle( card );
			const out = parseFloat( style.outlineOffset ) + parseFloat( style.outlineWidth );
			const c = card.getBoundingClientRect();
			const r = card.closest( '.riff-shelf-row' ).getBoundingClientRect();
			return {
				ring: { top: c.top - out, left: c.left - out, bottom: c.bottom + out, right: c.right + out },
				row: { top: r.top, left: r.left, bottom: r.bottom, right: r.right },
			};
		} );
		expect( ring.top ).toBeGreaterThanOrEqual( row.top );
		expect( ring.bottom ).toBeLessThanOrEqual( row.bottom );
	} );

	test( 'the sidebar collapses to a rail of icons, and stays that way across views and reloads', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'a phone has tabs, not a sidebar' );
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + 'app/' );
		const width = async () => ( await page.locator( '.riff-app-bar' ).boundingBox() ).width;
		const toggle = page.locator( '.riff-app-collapse' );
		await toggle.waitFor( { state: 'visible' } );
		expect(
			await page.evaluate( () => !! document.querySelector( '[data-riff-app-ready]' ) ),
			'the toggle is unseen until the script that runs it has loaded'
		).toBe( true );
		await expect( toggle ).toHaveAttribute( 'aria-expanded', 'true' );
		expect( await width() ).toBeGreaterThan( 200 );

		await toggle.click();
		await expect( toggle ).toHaveAttribute( 'aria-expanded', 'false' );
		expect( await width() ).toBeLessThan( 100 );
		// Spotify's frame keeps search in the strip across the top, open sidebar or not.
		await expect( page.locator( '.riff-app-search' ) ).toBeVisible();
		await expect( page.locator( '.riff-app-tab', { hasText: 'Albums' } ) ).toBeVisible();

		await page.locator( '.riff-app-tab', { hasText: 'Artists' } ).click();
		await expect( page ).toHaveURL( /riff_view=artists/ );
		await expect( toggle ).toHaveAttribute( 'aria-expanded', 'false' );
		await page.reload();
		expect( await width(), 'remembered on this device' ).toBeLessThan( 100 );

		await toggle.click();
		expect( await width() ).toBeGreaterThan( 200 );
		await page.evaluate( () => localStorage.removeItem( 'riff-sidebar' ) );
	} );

	test( 'in a contrast theme the current view and a focused account link still show', async ( {
		page,
	} ) => {
		await page.emulateMedia( { forcedColors: 'active' } );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + 'app/?riff_view=albums' );
		const current = page.locator( '.riff-app-tab[aria-current="page"]' ).locator( 'visible=true' ).first();
		const system = await systemColours( current.locator( '..' ) );
		await expect( current ).toHaveCSS( 'background-color', system.highlight );
		// The menu's links show focus with a tint and no ring, which a contrast theme drops.
		const summary = page.locator( '.riff-app-account summary' );
		await summary.focus();
		await page.keyboard.press( 'Enter' );
		await page.keyboard.press( 'Tab' );
		const link = page.locator( '.riff-app-account-menu a' ).first();
		await expect( link ).toBeFocused();
		await expect( link ).toHaveCSS( 'outline-style', 'solid' );
	} );

	test( 'app/ is the player on its own: no theme, installable, and browsing stays inside it', async ( {
		page,
		request,
	} ) => {
		const app = pageUrl.replace( /\/?$/, '/' ) + 'app/';
		await page.goto( app );
		await expect( page.locator( 'body.riff-standalone .riff-app' ) ).toBeVisible();
		await expect(
			page.locator( 'link[rel="stylesheet"][href*="/themes/"]' ),
			'none of the theme\'s styles'
		).toHaveCount( 0 );
		await expect( page.locator( '#wpadminbar' ) ).toHaveCount( 0 );

		const manifest = await page.locator( 'link[rel="manifest"]' ).getAttribute( 'href' );
		const answer = await request.get( manifest );
		expect( answer.headers()[ 'content-type' ] ).toContain( 'application/manifest+json' );
		const json = await answer.json();
		expect( json.display ).toBe( 'standalone' );
		expect( json.start_url ).toBe( app );

		await page.locator( '.riff-app-tab', { hasText: 'Albums' } ).click();
		await expect( page ).toHaveURL( /\/app\/\?riff_view=albums/ );
		await page
			.locator( '.riff-card[data-riff-album]', { hasText: 'Compositions' } )
			.first()
			.locator( '.riff-card-link' )
			.click();
		await expect( page ).toHaveURL( /\/app\/\?riff_album=\d+/ );
		await page.locator( '[data-riff-app-action="play"]' ).click();
		await expect
			.poll( async () => ( await playing( page ) ).paused )
			.toBe( false );

		// With the bar showing, the app fills the window less the bar, not a whole window with the
		// bar's height added below it, so a short view never scrolls.
		const room = await page.evaluate( () => ( {
			min: parseFloat( getComputedStyle( document.querySelector( '.riff-app' ) ).minHeight ),
			left:
				window.innerHeight -
				parseFloat( getComputedStyle( document.body, '::after' ).height ),
		} ) );
		expect( room.min ).toBeLessThanOrEqual( room.left + 1 );
	} );
} );
