'use strict';

const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const fs = require( 'fs' );
const os = require( 'os' );
const path = require( 'path' );
const { execFileSync, spawnSync } = require( 'child_process' );

const SCRIPT = path.join( __dirname, 'site-preview.js' );
const SHA = 'a'.repeat( 40 );

const site = ( files ) => {
	const dir = fs.mkdtempSync( path.join( os.tmpdir(), 'site-preview-' ) );
	for ( const [ name, text ] of Object.entries( files ) ) {
		fs.mkdirSync( path.dirname( path.join( dir, name ) ), { recursive: true } );
		fs.writeFileSync( path.join( dir, name ), text );
	}
	return dir;
};

test( 'fills every placeholder with the preview\'s own, so the demo opens its blueprint', () => {
	const dir = site( {
		'index.html': '<a href="https://playground.wordpress.net/?blueprint-url={{pages_url}}blueprint.json">Riff {{version}}</a>',
		'download/index.html': '<p>{{stable}}</p>\n<p class="fine stable">older</p>\n<p>{{commit}}</p>',
	} );
	execFileSync( 'node', [ SCRIPT, dir, 'https://pr-9.riffpress.pages.dev/', '5.2.0', '4.32.1', SHA ] );
	const index = fs.readFileSync( path.join( dir, 'index.html' ), 'utf8' );
	assert.match( index, /blueprint-url=https:\/\/pr-9\.riffpress\.pages\.dev\/blueprint\.json/ );
	assert.match( index, /Riff 5\.2\.0/ );
	const download = fs.readFileSync( path.join( dir, 'download/index.html' ), 'utf8' );
	assert.match( download, /4\.32\.1/ );
	assert.match( download, /class="fine stable"/ );
	assert.match( download, new RegExp( SHA ) );
} );

test( 'drops the older-release line when the stable release is this one, as the live site does', () => {
	const dir = site( { 'download/index.html': '<p>a</p>\n<p class="fine stable">{{stable}}</p>\n<p>b</p>' } );
	execFileSync( 'node', [ SCRIPT, dir, 'https://pr-9.riffpress.pages.dev/', '5.2.0', '5.2.0', SHA ] );
	assert.equal( fs.readFileSync( path.join( dir, 'download/index.html' ), 'utf8' ), '<p>a</p>\n<p>b</p>' );
} );

test( 'asks not to be indexed', () => {
	const dir = site( { 'index.html': '', 'robots.txt': 'Sitemap: {{pages_url}}sitemap.xml' } );
	execFileSync( 'node', [ SCRIPT, dir, 'https://pr-9.riffpress.pages.dev/', '5.2.0', '5.2.0', SHA ] );
	assert.equal( fs.readFileSync( path.join( dir, 'robots.txt' ), 'utf8' ), 'User-agent: *\nDisallow: /\n' );
	assert.match( fs.readFileSync( path.join( dir, '_headers' ), 'utf8' ), /X-Robots-Tag: noindex/ );
} );

test( 'refuses a link, a bad address or a placeholder it does not know', () => {
	const linked = site( { 'index.html': '' } );
	fs.symlinkSync( '/etc/hosts', path.join( linked, 'hosts.html' ) );
	assert.notEqual( spawnSync( 'node', [ SCRIPT, linked, 'https://pr-9.riffpress.pages.dev/', '5.2.0', '5.2.0', SHA ] ).status, 0 );
	assert.notEqual( spawnSync( 'node', [ SCRIPT, site( {} ), 'http://evil/', '5.2.0', '5.2.0', SHA ] ).status, 0 );
	const unknown = site( { 'index.html': '{{secret}}' } );
	assert.notEqual( spawnSync( 'node', [ SCRIPT, unknown, 'https://pr-9.riffpress.pages.dev/', '5.2.0', '5.2.0', SHA ] ).status, 0 );
} );
