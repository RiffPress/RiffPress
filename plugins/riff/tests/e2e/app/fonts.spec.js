/**
 * The fonts Riff ships: each draws the Latin a title is written in, rather than leaving it to the
 * browser's fallback, and the face drawn before one arrives takes the font's own room.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

const PLUGIN = '/wp-content/plugins/riff/';

test.describe( 'Fonts', () => {
	test( 'each bundled font draws Basic Latin, the covers’ embedded copies too', async ( { page } ) => {
		await page.goto( '/' );
		const drawn = await page.evaluate(
			async ( files ) => {
				// No space: a Latin Extended file carries one, and its width alone would differ.
				const text = 'Hamburgefonstiv0123456789';
				const ctx = document.createElement( 'canvas' ).getContext( '2d' );
				const width = ( family ) => {
					ctx.font = `48px ${ family }`;
					return ctx.measureText( text ).width;
				};
				const out = {};
				for ( const [ i, url ] of files.entries() ) {
					const face = new FontFace( `Probe ${ i }`, `url(${ url })` );
					await face.load();
					document.fonts.add( face );
					// A face without the glyphs leaves every letter to monospace, at monospace's width.
					out[ url ] = width( `"Probe ${ i }", monospace` ) !== width( 'monospace' );
				}
				return out;
			},
			[
				PLUGIN + 'assets/fonts/roboto/roboto.woff2',
				PLUGIN + 'assets/fonts/inter/inter.woff2',
				PLUGIN + 'assets/fonts/eb-garamond/eb-garamond.woff2',
				PLUGIN + 'features/listen/fonts/inter.woff2',
				PLUGIN + 'features/listen/fonts/garamond.woff2',
			]
		);
		for ( const [ url, ok ] of Object.entries( drawn ) ) {
			expect( ok, url ).toBe( true );
		}
	} );

	test( 'the face drawn before a font arrives takes the font’s room', async ( { page } ) => {
		await page.goto( '/' );
		const sizes = await page.evaluate(
			async ( sheets ) => {
				for ( const href of sheets ) {
					const link = Object.assign( document.createElement( 'link' ), {
						rel: 'stylesheet',
						href,
					} );
					const loaded = new Promise( ( resolve ) => link.addEventListener( 'load', resolve ) );
					document.head.append( link );
					await loaded;
				}
				const box = ( family ) => {
					const p = document.createElement( 'p' );
					p.style.cssText = `position:absolute;margin:0;white-space:nowrap;font:400 40px/normal ${ family }`;
					p.textContent = 'The quick brown fox jumps over the lazy dog, Riff 2026';
					document.body.append( p );
					const { width, height } = p.getBoundingClientRect();
					p.remove();
					return { width, height };
				};
				const out = {};
				for ( const family of [ 'Riff Roboto', 'Riff Inter', 'Riff Garamond' ] ) {
					await document.fonts.load( `400 40px "${ family }"`, 'The' );
					out[ family ] = {
						font: box( `"${ family }"` ),
						fallback: box( `"${ family } Fallback"` ),
					};
				}
				return out;
			},
			[ PLUGIN + 'assets/riff.css', PLUGIN + 'features/listen/app.css' ]
		);
		for ( const [ family, { font, fallback } ] of Object.entries( sizes ) ) {
			// Matched by the average letter's width, so a line runs within a few percent.
			expect( Math.abs( fallback.width / font.width - 1 ), family ).toBeLessThan( 0.05 );
			// And by the ascent and descent, so a line is the same height.
			expect( Math.abs( fallback.height - font.height ), family ).toBeLessThanOrEqual( 1 );
		}
	} );
} );
