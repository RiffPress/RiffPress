'use strict';

const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );

const { hooksFrom, membersFrom, functionsFrom, propertiesFrom, routesFrom, compare } = require( './public-promise.js' );

const HOOKS = [
	'## Filters',
	'',
	'### `riff_track`',
	'',
	'| Parameter | Type | Description |',
	'| --- | --- | --- |',
	'| `$track` | `array` | The track. |',
	'| `$id` | `int` | Its ID. |',
	'',
	'## Actions',
	'',
	'### `riff_old`',
	'',
	'Deprecated.',
	'',
	'## JavaScript',
	'',
	'### JavaScript filters',
	'',
	'#### `riff.queue`',
	'',
	'| `tracks` | `Object[]` | The tracks. |',
	'| `context` | `Object` | Where. |',
	'| `context.where` | `string` | Row or queue. |',
	'',
	'### JavaScript actions',
	'',
	'#### `riff.queue`',
].join( '\n' );

const JS = [
	'## `window.riff`',
	'',
	'### `window.riff.version`',
	'',
	'### `window.riff.play( tracks, index = 0, options )`',
	'',
	'### `window.riff.speed( rate )`',
	'',
	'Deprecated. Use window.riff.rate().',
	'',
	'## Actions and filters',
].join( '\n' );

const PHP = [
	'<?php',
	'/**',
	' * Registers a control.',
	' */',
	"function riff_register_control( string $id, array $args = array( 'a', 'b' ) ): bool {",
	'	return true;',
	'}',
	'',
	'/**',
	' * Old.',
	' */',
	'function riff_old( int $id ) {',
	"	_deprecated_function( __FUNCTION__, '6.19.0', 'riff_new()' );",
	'}',
].join( '\n' );

const CSS = [
	':root {',
	'	/**',
	'	 * The accent.',
	'	 *',
	'	 * @since 4.0.0',
	'	 */',
	'	--riff-accent: #000;',
	'	/* stylelint-disable-next-line */',
	'	--riff-private: 1px;',
	'	/**',
	'	 * Old.',
	'	 *',
	'	 * @deprecated 6.19.0',
	'	 */',
	'	--riff-old: 0;',
	'}',
].join( '\n' );

const route = ( route, endpoints, extra = {} ) => ( { namespace: 'riff/v1', route, methods: endpoints.map( ( e ) => e.methods ), args: {}, endpoints, ...extra } );
const ROUTES = [
	route( '/tracks', [ { methods: 'GET', args: { page: { type: 'integer' }, search: { type: 'string' } } } ] ),
	route( '/users/(?P<user>me|\\d+)/likes', [ { methods: 'GET', args: {} }, { methods: 'POST', args: { items: { type: 'array', required: true } } } ] ),
	route( '/played', [ { methods: 'GET', args: { items: { type: 'string', required: true } } } ], { internal: true } ),
];

// A surface of one kind, by name.
const only = ( kind, entries ) => ( { [ kind ]: entries } );

test( 'reads hooks by kind and name, with their parameters and whether deprecated', () => {
	const hooks = hooksFrom( HOOKS );
	assert.deepEqual( Object.keys( hooks ), [ 'filter riff_track', 'action riff_old', 'filter riff.queue', 'action riff.queue' ] );
	assert.deepEqual( hooks[ 'filter riff_track' ].params.map( ( p ) => p.name ), [ '$track', '$id' ] );
	// A dotted row is a property of the parameter above it.
	assert.deepEqual( hooks[ 'filter riff.queue' ].params.map( ( p ) => p.name ), [ 'tracks', 'context' ] );
	assert.equal( hooks[ 'action riff_old' ].deprecated, true );
	assert.equal( hooks[ 'filter riff_track' ].deprecated, false );
} );

test( 'reads window.riff members with their parameters, a property with none', () => {
	const members = membersFrom( JS );
	assert.deepEqual( Object.keys( members ), [ 'window.riff.version', 'window.riff.play', 'window.riff.speed' ] );
	assert.deepEqual( members[ 'window.riff.play' ].params, [
		{ name: 'tracks', optional: false },
		{ name: 'index', optional: true },
		{ name: 'options', optional: false },
	] );
	assert.deepEqual( members[ 'window.riff.version' ].params, [] );
	assert.equal( members[ 'window.riff.speed' ].deprecated, true );
} );

test( 'reads functions, a default with commas in it as one parameter, and _deprecated_function()', () => {
	const fns = functionsFrom( PHP );
	assert.deepEqual( fns[ 'riff_register_control()' ].params, [
		{ name: '$id', optional: false },
		{ name: '$args', optional: true },
	] );
	assert.equal( fns[ 'riff_register_control()' ].deprecated, false );
	assert.equal( fns[ 'riff_old()' ].deprecated, true );
} );

test( 'reads only the custom properties with a docblock, and their @deprecated', () => {
	const props = propertiesFrom( CSS );
	assert.deepEqual( Object.keys( props ), [ '--riff-accent', '--riff-old' ] );
	assert.equal( props[ '--riff-old' ].deprecated, true );
	assert.equal( props[ '--riff-accent' ].deprecated, false );
} );

test( 'reads the public routes by address, each method with its own arguments, and leaves out the internal ones', () => {
	const routes = routesFrom( ROUTES );
	assert.deepEqual( Object.keys( routes ), [ '/riff/v1/tracks', '/riff/v1/users/{user}/likes' ] );
	assert.deepEqual( Object.keys( routes[ '/riff/v1/users/{user}/likes' ].methods ), [ 'GET', 'POST' ] );
	assert.deepEqual( routes[ '/riff/v1/users/{user}/likes' ].methods.POST.items, { type: '"array"', required: true } );
} );

test( 'the same surface keeps the promise, and new names are free', () => {
	const base = { hooks: hooksFrom( HOOKS ), members: membersFrom( JS ), functions: functionsFrom( PHP ), properties: propertiesFrom( CSS ), routes: routesFrom( ROUTES ) };
	assert.deepEqual( compare( base, base ), [] );
	const more = { ...base, properties: { ...base.properties, '--riff-new': { kind: 'property', name: '--riff-new', deprecated: false } } };
	assert.deepEqual( compare( base, more ), [] );
} );

test( 'a name that goes without a deprecation breaks the promise', () => {
	const base = only( 'properties', propertiesFrom( CSS ) );
	const head = only( 'properties', { '--riff-old': base.properties[ '--riff-old' ] } );
	assert.match( compare( base, head ).join( '\n' ), /--riff-accent is gone without a deprecation/ );
} );

test( 'a deprecated name goes only in the next major version, with its note', () => {
	const base = only( 'hooks', hooksFrom( HOOKS ) );
	const head = only( 'hooks', { ...base.hooks } );
	delete head.hooks[ 'action riff_old' ];
	assert.match( compare( base, head, { baseMajor: 6, headMajor: 6, notes: '`riff_old`' } ).join(), /is gone in 6\.x/ );
	assert.match( compare( base, head, { baseMajor: 6, headMajor: 7 } ).join(), /The action riff_old is gone with no note/ );
	assert.deepEqual( compare( base, head, { baseMajor: 6, headMajor: 7, notes: '- `riff_old`, since 6.19.0.' } ), [] );
} );

test( 'a hook or a member that loses a parameter breaks the promise; one that gains one does not', () => {
	const base = only( 'members', membersFrom( JS ) );
	const fewer = only( 'members', membersFrom( JS.replace( 'index = 0, options', 'index = 0' ) ) );
	assert.match( compare( base, fewer ).join(), /window\.riff\.play took \( tracks, index, options \), now takes \( tracks, index \), without a deprecation/ );
	const gained = only( 'members', membersFrom( JS.replace( 'speed( rate )', 'speed( rate, when )' ) ) );
	assert.deepEqual( compare( base, gained ), [] );

	const hooks = only( 'hooks', hooksFrom( HOOKS ) );
	const lost = only( 'hooks', hooksFrom( HOOKS.replace( '| `$id` | `int` | Its ID. |\n', '' ) ) );
	assert.match( compare( hooks, lost ).join(), /The filter riff_track took \( \$track, \$id \), now takes \( \$track \)/ );
} );

test( 'a function that asks for a parameter more breaks the promise', () => {
	const base = only( 'functions', functionsFrom( PHP ) );
	const head = only( 'functions', functionsFrom( PHP.replace( 'string $id, array $args', 'string $id, int $user, array $args' ) ) );
	assert.match( compare( base, head ).join(), /riff_register_control\(\) now needs \$user/ );
	const optional = only( 'functions', functionsFrom( PHP.replace( "array( 'a', 'b' ) )", "array( 'a', 'b' ), int $user = 0 )" ) ) );
	assert.deepEqual( compare( base, optional ), [] );
} );

test( 'a route keeps its methods, its arguments\' types and what it needs', () => {
	const base = only( 'routes', routesFrom( ROUTES ) );
	const head = ( change ) => only( 'routes', routesFrom( change( structuredClone( ROUTES ) ) ) );
	const gone = head( ( r ) => {
		r[ 1 ].endpoints.pop();
		return r;
	} );
	assert.match( compare( base, gone ).join(), /\/riff\/v1\/users\/\{user\}\/likes no longer answers POST/ );
	const retyped = head( ( r ) => {
		r[ 0 ].endpoints[ 0 ].args.page.type = 'string';
		return r;
	} );
	assert.match( compare( base, retyped ).join(), /takes page on GET as "string", not "integer"/ );
	const needs = head( ( r ) => {
		r[ 0 ].endpoints[ 0 ].args.search.required = true;
		return r;
	} );
	assert.match( compare( base, needs ).join(), /\/riff\/v1\/tracks now needs search on GET/ );
	// A method added beside the others asks nothing of them.
	const added = head( ( r ) => {
		r[ 0 ].endpoints.push( { methods: 'POST', args: { title: { type: 'string', required: true } } } );
		return r;
	} );
	assert.deepEqual( compare( base, added ), [] );
	// A public route made internal has gone from the public surface.
	const hidden = head( ( r ) => {
		r[ 0 ].internal = true;
		return r;
	} );
	assert.match( compare( base, hidden ).join(), /\/riff\/v1\/tracks is gone without a deprecation/ );
} );

test( 'a change of shape needs a deprecation and a note; a new deprecation needs its note', () => {
	const base = only( 'routes', routesFrom( ROUTES ) );
	const changed = structuredClone( ROUTES );
	changed[ 0 ].endpoints[ 0 ].args.page.type = 'string';
	assert.match( compare( base, only( 'routes', routesFrom( changed ) ) ).join(), /without a deprecation/ );
	changed[ 0 ].deprecated = '6.19.0';
	assert.match( compare( base, only( 'routes', routesFrom( changed ) ) ).join(), /with no note in docs\/deprecations\.md/ );
	assert.deepEqual( compare( base, only( 'routes', routesFrom( changed ) ), { notes: '`/riff/v1/tracks`' } ), [] );

	const props = only( 'properties', propertiesFrom( CSS ) );
	const deprecated = only( 'properties', propertiesFrom( CSS.replace( ' * @since 4.0.0', ' * @since 4.0.0\n\t * @deprecated 6.19.0' ) ) );
	assert.match( compare( props, deprecated ).join(), /--riff-accent is deprecated with no note/ );
	assert.deepEqual( compare( props, deprecated, { notes: '`--riff-accent`' } ), [] );
} );
