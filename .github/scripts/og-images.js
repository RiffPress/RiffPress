#!/usr/bin/env node
/**
 * The share cards: the 1200×630 picture a link to each page of the site shows on social sites
 * and in chat. One per main page, as the site is drawn: the RiffPress mark, the page's title in EB
 * Garamond, one line under it in Inter, on the app's #121212 with the ff and its rings of sound
 * cropped into the corner. Pages below a section (the developer reference, the web platform pages) use their
 * section's card; site-shell.js picks it from the page's address.
 *
 * Rendered with Playwright's Chromium from the site's own fonts and artwork, and committed as
 * site/og/<slug>.png. Run after changing a card or the brand: npm run docs:og
 */
const fs = require( 'node:fs' );
const os = require( 'node:os' );
const path = require( 'node:path' );
const { pathToFileURL } = require( 'node:url' );

const ROOT = path.resolve( __dirname, '..', '..' );
const SITE = path.join( ROOT, 'site' );
const OUT = path.join( SITE, 'og' );

const CARDS = [
	{ slug: 'home', title: 'Own every note', line: 'A music player for WordPress. Publish from the Media Library; your listeners get a streaming player.' },
	{ slug: 'add-music', title: 'Add your music', line: 'How an album goes onto a site you own, with Riff, starting from nothing.' },
	{ slug: 'download', title: 'Get Riff', line: 'The music player for WordPress, as a zip for the Plugins screen.' },
	{ slug: 'built', title: 'How Riff is built', line: 'What it runs on, how every change is tested, and what RiffPress commits to.' },
	{ slug: 'developers', title: 'Developers', line: 'How to extend Riff, and what it is built on.' },
	{ slug: 'web', title: 'Built on the open web', line: 'Every browser API and CSS feature the Riff player uses, and why.' },
];

const esc = ( s ) => String( s ).replace( /&/g, '&amp;' ).replace( /</g, '&lt;' );
const file = ( p ) => pathToFileURL( path.join( SITE, p ) ).href;

function html( card ) {
	return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Inter; font-weight: 400 700; src: url(${ file( 'fonts/inter.woff2' ) }) format("woff2"); }
@font-face { font-family: "EB Garamond"; font-weight: 400 700; src: url(${ file( 'fonts/eb-garamond.woff2' ) }) format("woff2"); }
html, body { margin: 0; }
body { width: 1200px; height: 630px; overflow: hidden; position: relative; background: #121212; color: #fff; font-family: Inter, sans-serif; }
.mark { position: absolute; left: 80px; top: 72px; display: flex; align-items: center; gap: 16px; font-size: 30px; font-weight: 600; letter-spacing: -0.01em; }
.mark img { width: 52px; height: 52px; }
h1 { position: absolute; left: 80px; top: 230px; width: 720px; margin: 0; font-family: "EB Garamond", serif; font-weight: 400; font-size: 92px; line-height: 1.05; letter-spacing: -0.01em; text-wrap: balance; }
p { position: absolute; left: 80px; bottom: 80px; width: 640px; margin: 0; font-size: 28px; line-height: 1.45; color: #979aa1; text-wrap: pretty; }
</style></head><body>
<div class="mark"><img src="${ file( 'brand/wordmark-ink.svg' ) }" alt="Riff"></div>
<h1>${ esc( card.title ) }</h1>
<p>${ esc( card.line ) }</p>
</body></html>`;
}

async function main() {
	const { chromium } = require( '@playwright/test' );
	fs.mkdirSync( OUT, { recursive: true } );
	const tmp = fs.mkdtempSync( path.join( os.tmpdir(), 'riff-og-' ) );
	const browser = await chromium.launch();
	const page = await browser.newPage( { viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 } );
	for ( const card of CARDS ) {
		const at = path.join( tmp, `${ card.slug }.html` );
		fs.writeFileSync( at, html( card ) );
		await page.goto( pathToFileURL( at ).href );
		await page.evaluate( () => document.fonts.ready );
		await page.screenshot( { path: path.join( OUT, `${ card.slug }.png` ) } );
		console.log( `wrote site/og/${ card.slug }.png` );
	}
	await browser.close();
	fs.rmSync( tmp, { recursive: true, force: true } );
}

if ( require.main === module ) {
	main().catch( ( e ) => {
		console.error( e );
		process.exitCode = 1;
	} );
}

module.exports = { CARDS };
