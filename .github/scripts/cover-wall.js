#!/usr/bin/env node
/* eslint-disable no-console -- a build script that says what it wrote, as og-images.js does. */
/**
 * The covers on the landing page's wall, as small pictures: each SVG cover-wall.php drew in
 * site/covers/wall/ becomes a 480px AVIF beside it, and the SVG is removed. Each SVG carries its
 * own fonts, so twenty of them would weigh most of a megabyte; the AVIFs are a fraction of that.
 * AVIFs need avifenc (libavif) on the PATH.
 *
 * Run: npx wp-env run cli wp eval-file wp-content/riff/.github/scripts/cover-wall.php
 *      node .github/scripts/cover-wall.js
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { execFileSync } = require( 'node:child_process' );

const DIR = path.resolve( __dirname, '..', '..', 'site', 'covers', 'wall' );
const SIZE = 480;

async function main() {
	const { chromium } = require( '@playwright/test' );
	const svgs = fs.readdirSync( DIR ).filter( ( f ) => f.endsWith( '.svg' ) );
	if ( ! svgs.length ) {
		throw new Error( 'No SVGs in site/covers/wall: run cover-wall.php first.' );
	}
	const browser = await chromium.launch();
	const page = await browser.newPage( { viewport: { width: SIZE, height: SIZE } } );
	try {
		for ( const svg of svgs ) {
			const name = svg.replace( /\.svg$/, '' );
			const png = path.join( DIR, `${ name }.png` );
			await page.setContent( `<style>html,body{margin:0}img{display:block;width:${ SIZE }px;height:${ SIZE }px}</style><img src="data:image/svg+xml;base64,${ fs.readFileSync( path.join( DIR, svg ) ).toString( 'base64' ) }">` );
			await page.locator( 'img' ).evaluate( ( img ) => img.decode() );
			await page.screenshot( { path: png } );
			execFileSync( 'avifenc', [ '-q', '60', '-s', '4', '-j', 'all', png, path.join( DIR, `${ name }.avif` ) ], { stdio: 'ignore' } );
			fs.rmSync( png );
			fs.rmSync( path.join( DIR, svg ) );
			console.log( `wrote site/covers/wall/${ name }.avif` );
		}
	} finally {
		await browser.close();
	}
}

if ( require.main === module ) {
	main().catch( ( e ) => {
		console.error( e.message || e );
		process.exitCode = 1;
	} );
}
