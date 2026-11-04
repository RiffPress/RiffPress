'use strict';

const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );

const { major, newer, testedUpTo, title, issueBody } = require( './core-release.js' );

test( 'a maintenance release is the same major', () => {
	assert.equal( major( '7.1.4' ), '7.1' );
	assert.equal( major( '7.2' ), '7.2' );
	assert.equal( major( '' ), null );
	assert.equal( newer( '7.1', '7.1' ), false );
} );

test( 'majors compare by number, not as text', () => {
	assert.equal( newer( '7.2', '7.1' ), true );
	assert.equal( newer( '7.10', '7.9' ), true );
	assert.equal( newer( '8.0', '7.9' ), true );
	assert.equal( newer( '7.1', '7.2' ), false );
} );

test( 'Tested up to is read from the readme', () => {
	assert.equal( testedUpTo( '=== Riff ===\nRequires at least: 7.1\nTested up to: 7.1\nStable tag: 6.1.0\n' ), '7.1' );
	assert.equal( testedUpTo( 'no header' ), null );
} );

test( 'the issue names the version in its title and checklist', () => {
	assert.equal( title( '7.2' ), 'WordPress 7.2 is out: ship Riff on it today' );
	const body = issueBody( '7.2' );
	assert.ok( body.includes( 'WordPress/WordPress#7.2' ) );
	assert.ok( body.includes( 'Tested up to: 7.2' ) );
} );
