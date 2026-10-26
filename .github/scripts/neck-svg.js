#!/usr/bin/env node
/* eslint-disable no-console -- a build script that says what it wrote, as og-images.js does. */
/**
 * The neck in the site's margin, as site/neck.svg: a rosewood fingerboard at life size, 150px across
 * (a neck is about 43mm at the nut) on a 25.5-inch scale. Its 22 frets stand where a guitar's do, each
 * 2^(1/12) closer to the next, with pearl dots inlaid at the 3rd, 5th, 7th, 9th, 15th, 17th, 19th and 21st
 * and two at the 12th. It is the neck alone: a body at life size is wider than any margin, so past the
 * last fret the board runs on a little and neck.css fades it into the page. The strings are not in
 * it: neck.css draws them still, and neck.js plays them; this writes the drawing's measures into
 * neck.css so both place them alike. The page scales the whole of it with the neck's width, so on a
 * narrower screen it is a smaller neck, not a shorter one.
 *
 * Run: node .github/scripts/neck-svg.js
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );

const OUT = path.resolve( __dirname, '..', '..', 'site', 'neck.svg' );
const W = 150;
const NUT = 8;
const SCALE = 2449;
const FRETS = 22;

// Where fret n stands, from the top of the drawing.
const fret = ( n ) => NUT + SCALE * ( 1 - 2 ** ( -n / 12 ) );
// The board runs on past the last fret, into the fade.
const H = fret( FRETS ) + 220;
const n1 = ( v ) => Number( v.toFixed( 1 ) );

const parts = [];
// The board: rosewood, dark enough to read against the paper, its grain along the neck, darker at
// its rounded edges.
parts.push( `<rect width="${ W }" height="${ n1( H ) }" fill="#3a2419"/>` );
parts.push( `<rect width="${ W }" height="${ n1( H ) }" filter="url(#grain)" opacity=".9"/>` );
parts.push( `<rect width="${ W }" height="${ n1( H ) }" fill="url(#round)"/>` );
// The inlays, midway between their frets.
for ( const n of [ 3, 5, 7, 9, 15, 17, 19, 21 ] ) {
	parts.push( `<circle cx="${ W / 2 }" cy="${ n1( ( fret( n - 1 ) + fret( n ) ) / 2 ) }" r="9" fill="url(#dot)"/>` );
}
const twelve = n1( ( fret( 11 ) + fret( 12 ) ) / 2 );
parts.push( `<circle cx="${ W * 0.3 }" cy="${ twelve }" r="9" fill="url(#dot)"/><circle cx="${ W * 0.7 }" cy="${ twelve }" r="9" fill="url(#dot)"/>` );
// The frets: rounded nickel wire, lit along its top, with its shadow on the board below.
for ( let n = 1; n <= FRETS; n++ ) {
	const y = n1( fret( n ) );
	parts.push( `<rect y="${ n1( y + 3 ) }" width="${ W }" height="3" fill="#000" opacity=".35"/><rect y="${ y }" width="${ W }" height="5" fill="url(#wire)"/>` );
}
// The binding: cream, down both edges.
parts.push( `<rect width="4" height="${ n1( H ) }" fill="#efe3cc"/><rect x="${ W - 4 }" width="4" height="${ n1( H ) }" fill="#efe3cc"/>` );
// The nut: bone.
parts.push( `<rect width="${ W }" height="${ NUT }" fill="url(#bone)"/><rect y="${ NUT }" width="${ W }" height="3" fill="#000" opacity=".35"/>` );

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ W } ${ n1( H ) }" width="${ W }" height="${ n1( H ) }">
<defs>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.6 0.006" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 0.1 0 0 0 0 0.05 0 0 0 0 0.02 0 0 0 0.55 0"/></filter>
<linearGradient id="round" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset=".14" stop-color="#503720" stop-opacity="0"/><stop offset=".86" stop-color="#503720" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>
<linearGradient id="wire" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#cfd0cc"/><stop offset="1" stop-color="#7d7f7a"/></linearGradient>
<linearGradient id="bone" y2="1"><stop offset="0" stop-color="#f8f3e9"/><stop offset="1" stop-color="#e0d4bf"/></linearGradient>
<radialGradient id="dot" cx=".4" cy=".35"><stop offset="0" stop-color="#fffaf0"/><stop offset=".7" stop-color="#e9e0cf"/><stop offset="1" stop-color="#c8bba3"/></radialGradient>
</defs>
${ parts.join( '\n' ) }
</svg>
`;

fs.writeFileSync( OUT, svg );
// neck.css sizes the neck's box to the drawing, and neck.js reads where the frets are from it; keep
// them in step, or the drawing letterboxes and the fingers miss their frets.
const css = path.join( path.dirname( OUT ), 'neck.css' );
const measures = `--svg-w: ${ W };\n\t\t--svg-h: ${ n1( H ) };\n\t\t--svg-nut: ${ NUT };\n\t\t--svg-scale: ${ SCALE };\n\t\t--svg-fade: ${ n1( fret( FRETS ) + 20 ) };`;
const before = fs.readFileSync( css, 'utf8' );
const after = before.replace( /--svg-w: [\d.]+;\n\t\t--svg-h: [\d.]+;\n\t\t--svg-nut: [\d.]+;\n\t\t--svg-scale: [\d.]+;\n\t\t--svg-fade: [\d.]+;/, measures );
if ( after === before && ! before.includes( measures ) ) {
	throw new Error( 'neck.css has no --svg-* measures to update.' );
}
fs.writeFileSync( css, after );
console.log( `wrote site/neck.svg (${ W }×${ n1( H ) }) and its measures in neck.css` );
