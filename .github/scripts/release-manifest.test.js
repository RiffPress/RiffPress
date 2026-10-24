const assert = require( 'node:assert/strict' );
const { test } = require( 'node:test' );
const { pathOf, merged } = require( './release-manifest.js' );

const config = {
	packages: {
		'plugins/riff': { component: 'riff' },
		'plugins/riff-lyrics': { component: 'riff-lyrics' },
	},
};

test( 'a release branch keeps its own version and takes every other package\'s from main', () => {
	const main = { 'plugins/riff': '4.30.0', 'plugins/riff-lyrics': '0.2.0' };
	const branch = { 'plugins/riff': '4.31.0', 'plugins/riff-lyrics': '0.1.0' };
	assert.deepEqual( merged( main, branch, pathOf( config, 'riff' ) ), { 'plugins/riff': '4.31.0', 'plugins/riff-lyrics': '0.2.0' } );
} );

test( 'an unknown component or a missing package stops rather than writes a guess', () => {
	assert.throws( () => pathOf( config, 'nope' ), /component nope/ );
	assert.throws( () => merged( {}, {}, 'plugins/riff' ), /no plugins\/riff/ );
} );
