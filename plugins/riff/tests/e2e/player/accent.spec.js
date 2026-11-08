/**
 * The accent from the music: the player takes its accent from the cover of the track playing,
 * muted and light enough to read on its dark surfaces, and falls back to the site's accent for a
 * cover with no colour to give. A bright cover and a near-black one, drawn here as solid squares.
 * Desktop Chromium.
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const zlib = require( 'node:zlib' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { FIXTURES, FILES } = require( '../helpers/site' );

const made = own();
let postUrl;

// A PNG of one colour, 16 by 16.
function square( file, [ r, g, b ] ) {
	const crc = ( buf ) => {
		let c = ~0;
		for ( const byte of buf ) {
			c ^= byte;
			for ( let k = 0; k < 8; k++ ) {
				c = c & 1 ? ( c >>> 1 ) ^ 0xedb88320 : c >>> 1;
			}
		}
		return ~c >>> 0;
	};
	const chunk = ( type, data ) => {
		const body = Buffer.concat( [ Buffer.from( type ), data ] );
		const out = Buffer.alloc( 12 + data.length );
		out.writeUInt32BE( data.length, 0 );
		body.copy( out, 4 );
		out.writeUInt32BE( crc( body ), 8 + data.length );
		return out;
	};
	const size = 16;
	const head = Buffer.alloc( 13 );
	head.writeUInt32BE( size, 0 );
	head.writeUInt32BE( size, 4 );
	head[ 8 ] = 8;
	head[ 9 ] = 2;
	const row = Buffer.concat( [ Buffer.from( [ 0 ] ), Buffer.from( Array( size ).fill( [ r, g, b ] ).flat() ) ] );
	const png = Buffer.concat( [
		Buffer.from( [ 137, 80, 78, 71, 13, 10, 26, 10 ] ),
		chunk( 'IHDR', head ),
		chunk( 'IDAT', zlib.deflateSync( Buffer.concat( Array( size ).fill( row ) ) ) ),
		chunk( 'IEND', Buffer.alloc( 0 ) ),
	] );
	fs.writeFileSync( file, png );
	return file;
}

// WCAG's contrast between two colours given as rgb() strings.
const contrast = ( a, b ) => {
	const lum = ( css ) => {
		const [ r, g, bl ] = css.match( /[\d.]+/g ).slice( 0, 3 ).map( ( v ) => {
			v /= 255;
			return v <= 0.04045 ? v / 12.92 : ( ( v + 0.055 ) / 1.055 ) ** 2.4;
		} );
		return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
	};
	const [ hi, lo ] = [ lum( a ), lum( b ) ].sort( ( x, y ) => y - x );
	return ( hi + 0.05 ) / ( lo + 0.05 );
};

test.beforeAll( async ( { requestUtils }, testInfo ) => {
	const dir = testInfo.outputPath();
	fs.mkdirSync( dir, { recursive: true } );
	const bright = await made.media( requestUtils, square( path.join( dir, 'bright.png' ), [ 255, 92, 0 ] ) );
	const dark = await made.media( requestUtils, square( path.join( dir, 'dark.png' ), [ 8, 8, 10 ] ) );
	const audio = [];
	for ( const [ i, file ] of FILES.slice( 0, 2 ).entries() ) {
		const media = await made.media( requestUtils, path.join( FIXTURES, file ) );
		await requestUtils.rest( {
			method: 'POST',
			path: `/wp/v2/media/${ media.id }`,
			data: { featured_media: [ bright, dark ][ i ].id },
		} );
		audio.push( media );
	}
	const post = await made.post( requestUtils, {
		title: `Riff accent e2e ${ Date.now() }`,
		status: 'publish',
		content: audio
			.map( ( m ) => `<!-- wp:audio {"id":${ m.id }} --><figure class="wp-block-audio"><audio controls src="${ m.source_url }"></audio></figure><!-- /wp:audio -->` )
			.join( '' ),
	} );
	postUrl = post.link;
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

// The accent as the seek bar's played part draws it, and the surfaces it must read on.
const colours = ( page ) =>
	page.evaluate( () => {
		const root = document.getElementById( 'riff' );
		const of = ( css ) => {
			const probe = document.createElement( 'i' );
			probe.style.color = css;
			root.append( probe );
			const value = getComputedStyle( probe ).color;
			probe.remove();
			return value;
		};
		return {
			set: root.style.getPropertyValue( '--riff-cover-accent' ),
			line: getComputedStyle( document.querySelector( '.riff-bar .riff-line i' ) ).backgroundColor,
			accent: of( 'var(--riff-accent)' ),
			surface: of( 'var(--riff-surface)' ),
			bg: of( 'var(--riff-bg)' ),
		};
	} );

// The suite runs with reduced motion asked for (WordPress's Playwright config), under which the
// accent changes at once.
test.describe( 'The accent from the cover', () => {
	test( 'a bright cover gives a muted accent that reads on the player, and a near-black one gives the site\'s', async ( {
		page,
	} ) => {
		await page.goto( postUrl );
		await page.locator( '.riff-row' ).first().click();
		await expect.poll( async () => ( await colours( page ) ).set ).not.toBe( '' );
		const bright = await colours( page );
		// The cover's orange: red leads, then green, with little blue, and none of it at full.
		const [ r, g, b ] = bright.line.match( /\d+/g ).map( Number );
		expect( r ).toBeGreaterThan( g );
		expect( g ).toBeGreaterThan( b );
		expect( r ).toBeLessThan( 255 );
		expect( bright.line ).not.toBe( bright.accent );
		// Under reduced motion the bar has it at once.
		expect( bright.line.match( /\d+/g ) ).toEqual( bright.set.match( /\d+/g ) );
		expect( contrast( bright.line, bright.surface ) ).toBeGreaterThanOrEqual( 4.5 );
		expect( contrast( bright.line, bright.bg ) ).toBeGreaterThanOrEqual( 4.5 );

		// The near-black cover has no colour to give: the site's accent.
		await page.evaluate( () => window.riff.next() );
		await expect.poll( async () => ( await colours( page ) ).set ).toBe( '' );
		const dark = await colours( page );
		expect( dark.line ).toBe( dark.accent );

		// And back.
		await page.evaluate( () => window.riff.prev() );
		await expect.poll( async () => ( await colours( page ) ).line ).toBe( bright.line );
	} );
} );

test( 'without reduced motion, the accent fades from one track\'s to the next', async ( { page } ) => {
	await page.emulateMedia( { reducedMotion: 'no-preference' } );
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).first().click();
	await expect.poll( async () => ( await colours( page ) ).set ).not.toBe( '' );
	const line = page.locator( '.riff-bar .riff-line i' ).first();
	await expect( line ).toHaveCSS( 'transition-duration', '0.6s' );
} );

test( 'the Listen app\'s own document keeps no colour of its own: Liked songs and the Browse tiles take the accent', async ( {
	page,
	requestUtils,
} ) => {
	const listen = await made.page( requestUtils, {
		title: `Riff accent app e2e ${ Date.now() }`,
		status: 'publish',
		content: '<!-- wp:riff/app {"align":"full"} /-->',
	} );
	await page.setViewportSize( { width: 1440, height: 900 } );
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).first().click();
	await expect.poll( async () => ( await colours( page ) ).set ).not.toBe( '' );
	const accent = ( await colours( page ) ).set.match( /\d+/g );
	await page.goto( listen.link.replace( /\/?$/, '/' ) + 'app/?riff_view=search' );
	await expect( page.locator( '[data-riff-app-ready]' ) ).toHaveCount( 1 );
	// The queue carries over; once its track is loaded again, so is the accent.
	await page.evaluate( () => window.riff.play( window.riff.queue(), 0 ) );
	const onBody = () => page.evaluate( () => document.body.style.getPropertyValue( '--riff-cover-accent' ) );
	await expect.poll( onBody ).not.toBe( '' );
	expect( ( await onBody() ).match( /\d+/g ) ).toEqual( accent );

	const heart = page.locator( '.riff-app-item-heart' ).first();
	await expect( heart ).toBeVisible();
	expect( ( await heart.evaluate( ( el ) => getComputedStyle( el ).backgroundColor ) ).match( /\d+/g ) ).toEqual( accent );
	await expect( heart ).toHaveCSS( 'color', 'rgb(255, 255, 255)' );
	await expect( page.locator( '.riff-browse-tile' ).first() ).toHaveCSS( 'color', 'rgb(255, 255, 255)' );

	// Nothing in the app is drawn in a violet, a hue from 250° to 310° with real saturation, but
	// the covers, which are the music's own colours.
	const violets = await page.evaluate( () => {
		const hue = ( css ) => {
			const m = css.match( /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/ );
			if ( ! m || m[ 4 ] === '0' ) {
				return null;
			}
			const [ r, g, b ] = m.slice( 1, 4 ).map( ( v ) => v / 255 );
			const max = Math.max( r, g, b );
			const d = max - Math.min( r, g, b );
			if ( d < 0.2 ) {
				return null;
			}
			let h;
			if ( max === r ) {
				h = ( g - b ) / d + ( g < b ? 6 : 0 );
			} else if ( max === g ) {
				h = ( b - r ) / d + 2;
			} else {
				h = ( r - g ) / d + 4;
			}
			return h * 60;
		};
		const found = [];
		for ( const el of document.querySelectorAll( '.riff-app *' ) ) {
			if ( el.closest( 'img, .riff-app-item-art:not(:has(.riff-app-item-heart)), .riff-card-art:not(.riff-card-liked .riff-card-art), .riff-album-art' ) ) {
				continue;
			}
			const s = getComputedStyle( el );
			for ( const value of [ s.color, s.backgroundColor, ...( s.backgroundImage.match( /rgba?\([^)]+\)/g ) || [] ) ] ) {
				const h = hue( value );
				if ( h !== null && h >= 250 && h <= 310 ) {
					found.push( `${ el.className } ${ value }` );
				}
			}
		}
		return found;
	} );
	expect( violets ).toEqual( [] );
} );
