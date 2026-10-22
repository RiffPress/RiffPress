/**
 * The app, end to end: a page holding the block, a post opened inside it, the music carrying on
 * while the listener moves between the library and the post.
 *
 * Runs in desktop Chromium and in Chromium at an iPhone's size (see playwright.config.js).
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( './own' );
const AxeBuilder = require( '@axe-core/playwright' ).default;
const { expectTidy } = require( './tidy' );

const FIXTURES = path.join(
	__dirname,
	'..',
	'..',
	'..',
	'..',
	'packages',
	'fixtures',
	'compositions'
);
const FILES = [
	'02 - Underground [underground].mp3',
	'03 - Trombone Detritus [detritus].mp3',
];

let pageUrl;
let postId;
let extraId;
let audioMedia;

const made = own();

test.beforeAll( async ( { requestUtils } ) => {
	const cover = await made.media( requestUtils,
		path.join( FIXTURES, 'cover.png' )
	);
	const audio = [];
	for ( const file of FILES ) {
		const media = await made.media( requestUtils,
			path.join( FIXTURES, file )
		);
		await requestUtils.rest( {
			method: 'POST',
			path: `/wp/v2/media/${ media.id }`,
			data: { featured_media: cover.id },
		} );
		audio.push( media );
	}
	audioMedia = audio;
	// Enough older posts for a second page of the library, made first so the post above is newest.
	const block = `<!-- wp:audio {"id":${ audio[ 0 ].id }} --><figure class="wp-block-audio"><audio controls src="${ audio[ 0 ].source_url }"></audio></figure><!-- /wp:audio -->`;
	for ( let i = 1; i <= 24; i++ ) {
		const extra = await made.post( requestUtils, {
			title: `Riff app extra ${ i }`,
			status: 'publish',
			content: block,
			date: new Date( Date.now() - ( 100 - i ) * 60000 ).toISOString(),
		} );
		extraId = extra.id;
	}
	const post = await made.post( requestUtils, {
		title: `Riff app e2e ${ Date.now() }`,
		status: 'publish',
		content: audio
			.map(
				( m ) =>
					`<!-- wp:audio {"id":${ m.id }} --><figure class="wp-block-audio"><audio controls src="${ m.source_url }"></audio></figure><!-- /wp:audio -->`
			)
			.join( '' ),
		featured_media: cover.id,
	} );
	postId = post.id;
	const page = await made.page( requestUtils, {
		title: 'Listen e2e',
		status: 'publish',
		content: '<!-- wp:riff/app {"align":"full"} /-->',
	} );
	pageUrl = page.link;
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

const playing = ( page ) =>
	page.evaluate( () => {
		const a = document.querySelector( '.riff-audio' );
		return { paused: a.paused, time: a.currentTime };
	} );

test.describe( 'App', () => {
	test.beforeEach( async ( { page } ) => {
		await page.goto( pageUrl );
	} );

	test( 'a server-rendered card plays from its cover, with the button beside the link', async ( {
		page,
	} ) => {
		const card = page.locator( `.riff-card[data-riff-post="${ postId }"]` );
		await expect( card.locator( '.riff-card-play' ) ).toBeAttached();
		await expect( page.locator( 'a .riff-card-play' ) ).toHaveCount( 0 );
		await card.locator( '.riff-card-play' ).click();
		await expect
			.poll( async () => ( await playing( page ) ).paused )
			.toBe( false );
		await expect( page ).toHaveURL( pageUrl );
	} );

	test( 'a cover pressed before the app has loaded still plays once it has', async ( {
		page,
	} ) => {
		// The app's script held back, as a slow site serves it.
		let release;
		const held = new Promise( ( resolve ) => ( release = resolve ) );
		await page.route( /features\/listen\/app\.js/, async ( route ) => {
			await held;
			await route.continue();
		} );
		await page.goto( pageUrl );
		await page
			.locator( `.riff-card[data-riff-post="${ postId }"] .riff-card-play` )
			.click();
		expect( ( await playing( page ) ).paused, 'nothing yet' ).toBe( true );
		release();
		await expect
			.poll( async () => ( await playing( page ) ).paused, { timeout: 15000 } )
			.toBe( false );
		await expect( page ).toHaveURL( pageUrl );
	} );

	test( 'the page lists the library and opens a post without leaving', async ( {
		page,
	} ) => {
		const card = page.locator( `.riff-card[data-riff-post="${ postId }"]` );
		await expect( card ).toContainText( '2 tracks' );
		await card.click();
		await expect( page ).toHaveURL( new RegExp( `riff=${ postId }$` ) );
		await expect( page.locator( '.riff-album-title' ) ).toContainText(
			'Riff app e2e'
		);
		await expect( page.locator( '.riff-row' ) ).toHaveCount( 2 );
		await expect(
			page.locator( '.riff-app' ),
			'the app swapped the view in rather than loading a page'
		).toHaveJSProperty( 'isConnected', true );
	} );

	test( 'the music carries on from the post to the library, Back and Forward', async ( {
		page,
	} ) => {
		await page.locator( `.riff-card[data-riff-post="${ postId }"]` ).click();
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect
			.poll( async () => ( await playing( page ) ).time )
			.toBeGreaterThan( 1 );
		const audio = await page.evaluateHandle( () =>
			document.querySelector( '.riff-audio' )
		);

		await page.locator( '.riff-app-home' ).click();
		await expect( page ).toHaveURL( pageUrl );
		await expect( page.locator( '[data-riff-shelf="added"]' ) ).toBeVisible();
		expect( ( await playing( page ) ).paused ).toBe( false );
		expect(
			await page.evaluate(
				( el ) => el === document.querySelector( '.riff-audio' ),
				audio
			),
			'the same audio element is still playing'
		).toBe( true );

		await page.goBack();
		await expect( page.locator( '.riff-row' ) ).toHaveCount( 2 );
		await expect( page.locator( '.riff-row' ).nth( 1 ) ).toHaveAttribute(
			'data-playing',
			'true'
		);
		expect( ( await playing( page ) ).paused ).toBe( false );

		await page.goForward();
		await expect( page ).toHaveURL( pageUrl );
		await expect( page.locator( '[data-riff-shelf="added"]' ) ).toBeVisible();
		expect( ( await playing( page ) ).paused ).toBe( false );
	} );

	test( 'closing Now Playing on the app page keeps the view and returns focus', async ( {
		page,
	} ) => {
		// Now Playing closes through history.back(); the app must not read that as a view change.
		await page.goto( `${ pageUrl }?riff=${ postId }` );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await expect
			.poll( async () => ( await playing( page ) ).paused )
			.toBe( false );
		const album = await page.evaluateHandle( () =>
			document.querySelector( '.riff-album' )
		);
		await page.locator( '.riff-bar-info' ).click();
		await expect( page.locator( '.riff-np' ) ).toBeVisible();
		await page.keyboard.press( 'Escape' );
		await expect( page.locator( '.riff-np' ) ).toBeHidden();
		// Focus returns once the close has settled; the view is checked after that.
		await expect( page.locator( '.riff-bar-info' ) ).toBeFocused();
		expect(
			await page.evaluate(
				( el ) => el === document.querySelector( '.riff-album' ),
				album
			),
			'the post view was not swapped for a fresh copy'
		).toBe( true );
		expect( ( await playing( page ) ).paused ).toBe( false );
	} );

	test( 'Home jumps back into what was playing, and remembers what was played after a reload', async ( {
		page,
	} ) => {
		await page.evaluate( () => localStorage.removeItem( 'riff-history' ) );
		await page.locator( `.riff-card[data-riff-post="${ postId }"] .riff-card-link` ).click();
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect
			.poll( async () => ( await playing( page ) ).time )
			.toBeGreaterThan( 0.5 );
		await page.locator( '.riff-app-home' ).click();

		const jump = page.locator( '[data-riff-shelf="jump"]' );
		await expect( jump ).toBeVisible();
		await expect( jump.locator( '.riff-card-link' ).first() ).toHaveAttribute(
			'href',
			new RegExp( `[?&]riff=${ postId }$` )
		);
		const recent = page.locator( '[data-riff-shelf="recent"]' );
		await expect( recent.locator( '.riff-card-title' ).first() ).toHaveText( 'Trombone Detritus' );

		await page.reload();
		await expect( recent.locator( '.riff-card-title' ).first() ).toHaveText( 'Trombone Detritus' );
		await jump.locator( '.riff-card-link' ).first().click();
		await expect( page ).toHaveURL( new RegExp( `riff=${ postId }$` ) );
		await expect( page.locator( '.riff-row' ) ).toHaveCount( 2 );
	} );

	test( 'Home is rows that scroll sideways, each with Show all, and passes an accessibility check', async ( {
		page,
	} ) => {
		const added = page.locator( '[data-riff-shelf="added"]' );
		await expect( added.locator( '.riff-shelf-all' ) ).toHaveAttribute( 'href', /riff_view=albums/ );
		const row = added.locator( '.riff-shelf-row' );
		await expect( row ).toHaveCSS( 'overflow-x', 'auto' );
		await expect( row ).toHaveAttribute( 'tabindex', '0' );
		await page.locator( '[data-riff-shelf="posts"] .riff-shelf-all' ).click();
		await expect( page ).toHaveURL( /riff_view=posts/ );
		await expect( page.locator( '.riff-grid .riff-card' ).first() ).toBeVisible();
		await page.locator( '.riff-app-home' ).click();
		await expect( page.locator( '[data-riff-shelf="added"]' ) ).toBeVisible();
		const results = await new AxeBuilder( { page } ).include( '.riff-app' ).analyze();
		expect( results.violations ).toEqual( [] );
	} );

	test( 'Play and Shuffle start the post from its header', async ( {
		page,
	} ) => {
		await page.goto( `${ pageUrl }?riff=${ postId }` );
		await page.locator( '[data-riff-app-action="play"]' ).click();
		await expect
			.poll( async () => ( await playing( page ) ).paused )
			.toBe( false );
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Underground'
		);
		await page.locator( '[data-riff-app-action="shuffle"]' ).click();
		await expect(
			page.locator( '.riff-bar [data-riff-action="shuffle"]' )
		).toHaveAttribute( 'aria-pressed', 'true' );
	} );
} );

test.describe( 'Browse', () => {
	test.beforeEach( async ( { page } ) => {
		await page.goto( pageUrl );
	} );

	test( 'albums, an album, search and Back, with the music carrying on throughout', async ( {
		page,
	} ) => {
		await page.locator( '.riff-app-tab', { hasText: 'Albums' } ).click();
		await expect( page ).toHaveURL( /riff_view=albums/ );
		await page
			.locator( '.riff-card[data-riff-album]', { hasText: 'Compositions' } )
			.first()
			.locator( '.riff-card-link' )
			.click();
		await expect( page ).toHaveURL( /riff_album=\d+/ );
		await expect( page.locator( '.riff-row' ).first() ).toBeVisible();
		await page.locator( '[data-riff-app-action="play"]' ).click();
		await expect
			.poll( async () => ( await playing( page ) ).paused )
			.toBe( false );

		const search = page.locator( '.riff-app-search input' );
		await search.fill( 'Trombone' );
		await search.press( 'Enter' );
		await expect( page ).toHaveURL( /riff_search=Trombone/ );
		await expect( page.locator( '.riff-app-title' ) ).toContainText( 'Trombone' );
		await expect(
			page.locator( '.riff-row', { hasText: 'Trombone Detritus' } ).first()
		).toBeVisible();
		expect( ( await playing( page ) ).paused ).toBe( false );

		await page.goBack();
		await expect( page ).toHaveURL( /riff_album=\d+/ );
		await expect( page.locator( '.riff-row' ).first() ).toBeVisible();
		expect( ( await playing( page ) ).paused ).toBe( false );
	} );

	test( 'the tabs are fetched ahead, so choosing one waits on nothing', async ( {
		page,
	} ) => {
		const tabs = page.locator( '.riff-app-tab[href*="riff_view="]' );
		await expect( tabs ).toHaveCount( 5 );
		// Once the page is idle every tab's view is fetched; this page's own resource timings show
		// when all five have arrived.
		await expect
			.poll( () =>
				page.evaluate(
					() =>
						performance
							.getEntriesByType( 'resource' )
							.filter( ( r ) => r.name.includes( 'riff_view=' ) ).length
				)
			)
			.toBeGreaterThanOrEqual( 5 );
		const asked = [];
		page.on( 'request', ( r ) => {
			if ( r.url().includes( 'riff_view=artists' ) ) {
				asked.push( r.url() );
			}
		} );
		await page.locator( '.riff-app-tab', { hasText: 'Artists' } ).click();
		await expect( page.locator( '.riff-app-tab[aria-current="page"]' ) ).toHaveText( 'Artists' );
		await expect( page.locator( '.riff-artist' ).first() ).toBeVisible();
		expect( asked, 'the view was already here' ).toEqual( [] );
	} );

	test( 'an artist page has their picture, their latest tracks and their albums', async ( {
		page,
	} ) => {
		await page.locator( '.riff-app-tab', { hasText: 'Artists' } ).click();
		await page.locator( '.riff-artists .riff-artist', { hasText: 'Airmen of Note' } ).first().click();
		await expect( page.locator( '.riff-album-kind' ) ).toHaveText( /Artist/i );
		await expect( page.locator( '.riff-album-round .riff-album-cover img' ) ).toBeVisible();
		await expect( page.locator( '.riff-app-section', { hasText: 'Latest' } ) ).toBeVisible();
		await expect( page.locator( '.riff-app-section', { hasText: 'Albums' } ) ).toBeVisible();
		await expect( page.locator( '.riff-card[data-riff-album]', { hasText: 'Compositions' } ) ).toBeVisible();
		await page.locator( '[data-riff-app-action="play"]' ).click();
		await expect
			.poll( async () => ( await playing( page ) ).paused )
			.toBe( false );
	} );

	test( 'search answers as you type, with the keyboard, and remembers what was searched', async ( {
		page,
	} ) => {
		await page.evaluate( () => localStorage.removeItem( 'riff-searches' ) );
		await expect( page.locator( '[data-riff-app-ready]' ) ).toHaveCount( 1 );
		const field = page.locator( '.riff-app-search input' );
		await expect( field ).toHaveAttribute( 'role', 'combobox' );
		await field.click();
		await field.pressSequentially( 'Compo' );
		const list = page.locator( '.riff-suggest' );
		await expect( list ).toBeVisible();
		await expect( field ).toHaveAttribute( 'aria-expanded', 'true' );
		await expect( list.locator( '.riff-suggest-top' ) ).toContainText( 'Compositions' );
		await expect( page.locator( '.riff-app-sr' ) ).toHaveText( /\d+ suggestions?/ );
		const results = await new AxeBuilder( { page } ).include( '.riff-app' ).analyze();
		expect( results.violations ).toEqual( [] );

		await field.press( 'ArrowDown' );
		await expect( field ).toHaveAttribute( 'aria-activedescendant', 'riff-suggest-o0' );
		await field.press( 'Enter' );
		await expect( page ).toHaveURL( /riff_album=\d+/ );
		await expect( page.locator( '.riff-album-title' ) ).toHaveText( 'Compositions' );

		// Escape closes the list; Enter with nothing chosen loads every result, as before.
		await field.fill( 'Under' );
		await expect( list ).toBeVisible();
		await field.press( 'Escape' );
		await expect( list ).toBeHidden();
		await expect( field ).toHaveAttribute( 'aria-expanded', 'false' );
		await field.press( 'Enter' );
		await expect( page ).toHaveURL( /riff_search=Under/ );

		await page.reload();
		await page.locator( '.riff-app-search input' ).fill( '' );
		await page.locator( '.riff-app-search input' ).focus();
		await expect( page.locator( '.riff-suggest-recent' ).first() ).toHaveText( 'Under' );
		await expect( page.locator( '.riff-suggest-recent' ).nth( 1 ) ).toHaveText( 'Compo' );
	} );

	test( 'every view passes an accessibility check', async ( { page } ) => {
		const views = [ '', 'riff_view=albums', 'riff_view=artists', 'riff_view=tracks', 'riff_view=posts', 'riff_view=library', 'riff_search=Compositions' ];
		for ( const view of views ) {
			await page.goto( pageUrl + ( view ? ( pageUrl.includes( '?' ) ? '&' : '?' ) + view : '' ) );
			await expect( page.locator( '.riff-app-view h2' ).first() ).toBeVisible();
			const results = await new AxeBuilder( { page } ).include( '.riff-app' ).analyze();
			expect( results.violations, view || 'Home' ).toEqual( [] );
		}
		// One album and one artist, reached the way a listener reaches them.
		await page.goto( pageUrl + ( pageUrl.includes( '?' ) ? '&' : '?' ) + 'riff_view=albums' );
		await page.locator( '.riff-card[data-riff-album] .riff-card-link' ).first().click();
		await expect( page.locator( '.riff-album-title' ) ).toBeVisible();
		expect( ( await new AxeBuilder( { page } ).include( '.riff-app' ).analyze() ).violations, 'an album' ).toEqual( [] );
		await page.locator( '.riff-app-tab', { hasText: 'Artists' } ).click();
		await page.locator( '.riff-artist' ).first().click();
		await expect( page.locator( '.riff-album-title' ) ).toBeVisible();
		expect( ( await new AxeBuilder( { page } ).include( '.riff-app' ).analyze() ).violations, 'an artist' ).toEqual( [] );
	} );

	test( 'every browse view reads without the script', async ( { browser } ) => {
		const context = await browser.newContext( { javaScriptEnabled: false } );
		const plain = await context.newPage();
		await plain.goto( pageUrl );
		await plain.locator( '.riff-app-tab', { hasText: 'Artists' } ).click();
		await expect( plain.locator( '.riff-artist' ).first() ).toBeVisible();
		await plain.locator( '.riff-app-search input' ).fill( 'Compositions' );
		await plain.locator( '.riff-app-search input' ).press( 'Enter' );
		await expect( plain.locator( '.riff-app-title' ) ).toContainText( 'Compositions' );
		await expect( plain.locator( 'figure[data-riff-track]' ).first() ).toBeAttached();
		await context.close();
	} );
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

	test( 'on a wide screen the navigation is a sidebar; on a phone it stays tabs', async ( {
		page,
		isMobile,
	} ) => {
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + 'app/' );
		const nav = await page.locator( '.riff-app-bar' ).boundingBox();
		const view = await page.locator( '.riff-app-view' ).boundingBox();
		const brand = page.locator( '.riff-app-brand' );
		if ( isMobile ) {
			await expect( brand ).toBeHidden();
			expect( nav.y + nav.height ).toBeLessThanOrEqual( view.y + 1 );
		} else {
			await expect( brand ).toBeVisible();
			expect( nav.x + nav.width, 'the column sits left of the view' ).toBeLessThanOrEqual( view.x + 1 );
			await expect( page.locator( '.riff-app-tab svg' ).first() ).toBeVisible();
		}
	} );

	test( 'the app\'s buttons are pills on a phone as on a wide screen', async ( {
		page,
		isMobile,
	} ) => {
		await page.goto(
			pageUrl.replace( /\/?$/, '/' ) + `app/?riff=${ postId }`
		);
		const pills = page.locator( '.riff-app .riff-pill' );
		await expect( pills.first() ).toBeVisible();
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

	test( 'an album\'s header is Spotify\'s on a wide screen: a round Play under a large title, and column heads that line up', async ( {
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
		expect( ( await new AxeBuilder( { page } ).include( '.riff-app' ).analyze() ).violations ).toEqual( [] );
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
		await expect( page.locator( '.riff-app-search' ) ).toBeHidden();
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

	test( 'the account menu opens over the view, and still closes as a menu after the view changes', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'the wide layout, where the menu is pinned over the view' );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + 'app/?riff_view=albums' );
		await expect( page.locator( '[data-riff-app-ready]' ) ).toHaveCount( 1 );
		const account = page.locator( '.riff-app-account' );
		await account.locator( 'summary' ).click();
		const signOut = account.getByRole( 'link', { name: 'Sign out' } );
		await expect( signOut ).toBeVisible();
		// The sticky sidebar stacks on its own; the menu inside it must still be on top of the view.
		const box = await signOut.boundingBox();
		expect(
			await page.evaluate(
				( { x, y } ) => !! document.elementFromPoint( x, y )?.closest( '.riff-app-account-menu' ),
				{ x: box.x + box.width / 2, y: box.y + box.height / 2 }
			),
			'Sign out is the thing under the pointer'
		).toBe( true );
		await page.keyboard.press( 'Escape' );
		await expect( account ).not.toHaveAttribute( 'open' );

		// A view arrives in place with its own bar, and the menu in it closes as the first did.
		await page.locator( '.riff-app-tab', { hasText: 'Artists' } ).click();
		await expect( page.locator( '.riff-app-tab[aria-current="page"]' ) ).toHaveText( 'Artists' );
		await page.locator( '.riff-app-account summary' ).click();
		await expect( page.locator( '.riff-app-account' ) ).toHaveAttribute( 'open', '' );
		await page.keyboard.press( 'Escape' );
		await expect( page.locator( '.riff-app-account' ) ).not.toHaveAttribute( 'open' );
		await expect( page.locator( '.riff-app-account summary' ) ).toBeFocused();
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

test.describe( 'App requests', () => {
	// A post's own route, or the library's second page, whichever permalinks the site uses.
	const postRoute = ( id ) => ( url ) =>
		new RegExp( `riff/v1/library/${ id }(?:$|[?&/])` ).test(
			decodeURIComponent( url.toString() )
		);
	const secondPage = ( url ) => {
		const u = decodeURIComponent( url.toString() );
		return /riff\/v1\/library(?:$|[?&])/.test( u ) && /[?&]page=2/.test( u );
	};

	// Something playing, and the library drawn by the app, with Load more.
	test.beforeEach( async ( { page } ) => {
		await page.goto( `${ pageUrl }?riff=${ postId }` );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect
			.poll( async () => ( await playing( page ) ).paused )
			.toBe( false );
		await page.locator( '.riff-app-tab', { hasText: 'Posts' } ).click();
		await expect( page.locator( '.riff-grid' ) ).toBeVisible();
	} );

	test( 'a cover that cannot load says so, keeps the music, and plays on a retry', async ( {
		page,
	} ) => {
		const play = page.locator(
			`.riff-card-play[data-riff-post="${ extraId }"]`
		);
		const title = page.locator( '.riff-bar .riff-title' );
		const extra = postRoute( extraId );
		await expect( title ).toHaveText( 'Trombone Detritus' );

		await page.route( extra, ( route ) => route.abort() );
		await play.click();
		await expect( page.locator( '.riff-app-status' ) ).toHaveText(
			/could not be loaded/
		);
		await expect( page.locator( '.riff-app-status' ) ).toHaveAttribute(
			'role',
			'status'
		);
		await expect( play ).not.toHaveAttribute( 'aria-busy', 'true' );
		await expect( title ).toHaveText( 'Trombone Detritus' );
		expect( ( await playing( page ) ).paused ).toBe( false );

		await page.unroute( extra );
		await play.click();
		await expect( title ).toHaveText( 'Underground' );
		await expect( page.locator( '.riff-app-status' ) ).toBeEmpty();
	} );

	test( 'a cover answered after the view changed does not replace the queue', async ( {
		page,
	} ) => {
		const extra = postRoute( extraId );
		let release;
		const held = new Promise( ( resolve ) => ( release = resolve ) );
		await page.route( extra, async ( route ) => {
			await held;
			await route.continue();
		} );
		await page
			.locator( `.riff-card-play[data-riff-post="${ extraId }"]` )
			.click();
		await page.locator( `.riff-card[data-riff-post="${ postId }"] a` ).click();
		await expect( page.locator( '.riff-album-title' ) ).toBeVisible();

		const answered = page.waitForResponse( ( r ) => extra( r.url() ) );
		release();
		await answered;
		await expect( page.locator( '.riff-album-title' ) ).toContainText(
			'Riff app e2e'
		);
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Trombone Detritus'
		);
		await expect( page.locator( '.riff-app-status' ) ).toBeEmpty();
	} );

	test( 'Load more that fails keeps the cards and the focus, and a retry adds the page once', async ( {
		page,
	} ) => {
		const more = page.getByRole( 'link', { name: 'Load more' } );
		const cards = page.locator( '.riff-grid .riff-card' );
		await expect( cards ).toHaveCount( 24 );

		await page.route( secondPage, ( route ) =>
			route.fulfill( { status: 500, body: '{}' } )
		);
		await more.focus();
		await page.keyboard.press( 'Enter' );
		await expect( page.locator( '.riff-app-status' ) ).toHaveText(
			/could not be loaded/
		);
		await expect( cards ).toHaveCount( 24 );
		await expect( more ).toBeFocused();
		await expect( more ).not.toHaveAttribute( 'aria-disabled', 'true' );

		await page.unroute( secondPage );
		await page.keyboard.press( 'Enter' );
		await expect( cards ).toHaveCount( 25 );
		await expect( more ).toHaveCount( 0 );
		await expect( page.locator( '.riff-app-status' ) ).toBeEmpty();
		const ids = await cards.evaluateAll( ( els ) =>
			els.map( ( el ) => el.dataset.riffPost )
		);
		expect( new Set( ids ).size ).toBe( 25 );
		expect( ( await playing( page ) ).paused ).toBe( false );
	} );
} );

// Every post, the view Home's New posts row leads to.
const postsUrl = () => {
	const u = new URL( pageUrl );
	u.searchParams.set( 'riff_view', 'posts' );
	return u.toString();
};

test.describe( 'App pages', () => {
	test( 'the first visit offers Load more, which adds the page in place and keeps the music', async ( {
		page,
	} ) => {
		await page.goto( postsUrl() );
		const cards = page.locator( '.riff-grid .riff-card' );
		await expect( cards ).toHaveCount( 24 );
		await page
			.locator( `.riff-card[data-riff-post="${ postId }"] .riff-card-play` )
			.click();
		await expect
			.poll( async () => ( await playing( page ) ).paused )
			.toBe( false );

		await page.getByRole( 'link', { name: 'Load more' } ).click();
		await expect( cards ).toHaveCount( 25 );
		await expect( page ).toHaveURL( /[?&]riff_page=2$/ );
		await expect( page.locator( '#riff-page-2 a' ) ).toBeFocused();
		expect( ( await playing( page ) ).paused ).toBe( false );

		// Out to a post and back: the address still asks for both pages.
		await page.locator( `.riff-card[data-riff-post="${ postId }"] a` ).click();
		await expect( page.locator( '.riff-album-title' ) ).toBeVisible();
		await page.goBack();
		await expect( cards ).toHaveCount( 25 );
		await expect(
			page.getByRole( 'link', { name: 'Load more' } )
		).toHaveCount( 0 );
		expect( ( await playing( page ) ).paused ).toBe( false );

		await page.reload();
		await expect( cards ).toHaveCount( 25 );
	} );

	test( 'without the script, Load more is a link to everything through the next page', async ( {
		browser,
	} ) => {
		const context = await browser.newContext( { javaScriptEnabled: false } );
		const page = await context.newPage();
		await page.goto( postsUrl() );
		await expect( page.locator( '.riff-grid .riff-card' ) ).toHaveCount( 24 );
		await page.getByRole( 'link', { name: 'Load more' } ).click();
		await expect( page ).toHaveURL( /[?&]riff_page=2#riff-page-2$/ );
		await expect( page.locator( '.riff-grid .riff-card' ) ).toHaveCount( 25 );
		await expect( page.locator( '#riff-page-2' ) ).toBeInViewport();
		await context.close();
	} );
} );
