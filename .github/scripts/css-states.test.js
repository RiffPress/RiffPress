'use strict';

/**
 * No state is shown with a change of weight. A heavier or lighter weight lays the words out again,
 * so the text and what sits beside it move, and the browser repaints: hover, the current tab, the
 * selected chip or the order in use are shown with colour, an underline or a background instead.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs' );
const path = require( 'node:path' );

const FILES = [ 'plugins/riff/assets/riff.css', 'plugins/riff/features/listen/app.css', 'plugins/riff/features/listen/standalone.css', 'plugins/riff/features/listen/desktop.css' ];
const STATE = /:hover|:focus|:active|:checked|aria-(current|selected|pressed|checked|expanded)|\.is-[a-z]|\[data-(current|active|selected)/;

function stateWeights( css ) {
	const found = [];
	const plain = css.replace( /\/\*[\s\S]*?\*\//g, '' );
	for ( const m of plain.matchAll( /([^{}]+)\{([^{}]*)\}/g ) ) {
		const selector = m[ 1 ].trim().replace( /\s+/g, ' ' );
		if ( /font-weight\s*:/.test( m[ 2 ] ) && STATE.test( selector ) ) {
			found.push( selector );
		}
	}
	return found;
}

test( 'no state in the stylesheets changes the font weight', () => {
	for ( const file of FILES ) {
		const css = fs.readFileSync( path.join( __dirname, '..', '..', file ), 'utf8' );
		assert.deepEqual( stateWeights( css ), [], `${ file }: show the state with colour, an underline or a background` );
	}
} );

test( 'the check finds a weight change on a state, and leaves a plain weight alone', () => {
	assert.deepEqual( stateWeights( 'a { font-weight: 500 }\na[aria-current="page"] { font-weight: 700 }' ), [ 'a[aria-current="page"]' ] );
} );
