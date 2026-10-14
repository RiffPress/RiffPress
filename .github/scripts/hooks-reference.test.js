/**
 * The hooks reference reads docblocks the way the plugin writes them.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs' );
const os = require( 'node:os' );
const path = require( 'node:path' );
const { hooksIn, parse, render, collect, pages, problems, site } = require( './hooks-reference.js' );

const tmp = ( body ) => {
	const file = path.join( fs.mkdtempSync( path.join( os.tmpdir(), 'riff-hooks-' ) ), 'class-x.php' );
	fs.writeFileSync( file, body );
	return file;
};

test( 'finds a documented filter with its since and parameters', () => {
	const file = tmp( `<?php
		/**
		 * Filters a track before the player reads it.
		 *
		 * @since 0.1.0
		 *
		 * @param array $track Track.
		 * @param int   $post_id Post ID.
		 */
		return (array) apply_filters( 'riff_track', $track, $post_id );
` );
	const [ hook ] = hooksIn( file );
	assert.equal( hook.name, 'riff_track' );
	assert.equal( hook.type, 'filter' );
	assert.equal( hook.since, '0.1.0' );
	assert.equal( hook.summary, 'Filters a track before the player reads it.' );
	assert.deepEqual( hook.params.map( ( p ) => p.name ), [ '$track', '$post_id' ] );
	assert.equal( hook.documented, true );
} );

test( 'an action without a docblock is still listed, marked undocumented', () => {
	const file = tmp( `<?php
		do_action( 'riff_before_player' );
` );
	const [ hook ] = hooksIn( file );
	assert.equal( hook.type, 'action' );
	assert.equal( hook.documented, false );
	assert.equal( hook.since, '' );
} );

test( 'a deprecated hook is flagged', () => {
	const file = tmp( `<?php
		/**
		 * Filters nothing now.
		 *
		 * @since 0.1.0
		 */
		apply_filters_deprecated( 'riff_old', array( 1 ), '0.2.0', 'riff_new' );
` );
	assert.equal( hooksIn( file )[ 0 ].deprecated, true );
} );

test( 'parse reads a summary that spans lines', () => {
	const parsed = parse( `/**
	 * Filters the data handed to the player script: strings, and the addresses of scripts a
	 * feature wants loaded.
	 *
	 * @since 0.1.0
	 *
	 * @param array $data Data.
	 */` );
	assert.equal( parsed.summary, 'Filters the data handed to the player script: strings, and the addresses of scripts a feature wants loaded.' );
} );

test( 'render sorts by name within filters and actions and writes a table per hook', () => {
	const md = render( [
		{ name: 'riff_b', type: 'filter', file: 'x.php', line: 2, summary: 'B.', since: '0.1.0', params: [ { type: 'array', name: '$b', description: 'B.' } ], documented: true },
		{ name: 'riff_a', type: 'filter', file: 'x.php', line: 1, summary: 'A.', since: '0.1.0', params: [], documented: true },
		{ name: 'riff_do', type: 'action', file: 'x.php', line: 3, summary: 'Fires.', since: '0.2.0', params: [], documented: true },
	] );
	assert.ok( md.indexOf( '### `riff_a`' ) < md.indexOf( '### `riff_b`' ) );
	assert.ok( md.indexOf( '## Filters' ) < md.indexOf( '## Actions' ) );
	assert.match( md, /\| `\$b` \| `array` \| B\. \|/ );
	assert.match( md, /Since 0\.2\.0\. Fires in `x\.php`\./ );
	assert.doesNotMatch( md, /at line/, 'line numbers drift with every edit and would make the doc stale' );
} );

const tmpJs = ( body ) => {
	const file = path.join( fs.mkdtempSync( path.join( os.tmpdir(), 'riff-hooks-' ) ), 'riff.js' );
	fs.writeFileSync( file, body );
	return file;
};

test( 'finds the player\'s JavaScript actions and filters under riff.<name>', () => {
	const file = tmpJs( `
		/**
		 * Fires when a track is loaded.
		 *
		 * @since 4.0.0
		 *
		 * @param {Object} detail       What changed.
		 * @param {Object} detail.track The track.
		 * @param {Object} api          The api.
		 */
		emit( 'track', { track: t } );
		const kept = list.filter( ( t ) => t.id );
		tracks = tracks.map( ( t ) =>
			/**
			 * Filters one track.
			 *
			 * @since 4.0.0
			 *
			 * @param {Object} track The track.
			 */
			filter( 'track', t )
		);
` );
	const [ action, filter ] = hooksIn( file );
	assert.equal( action.name, 'riff.track' );
	assert.equal( action.type, 'action' );
	assert.equal( action.lang, 'js' );
	assert.equal( action.arity, 2, 'an action hands its callback the detail and the api' );
	assert.deepEqual( action.params.map( ( p ) => [ p.name, p.property ] ), [ [ 'detail', false ], [ 'detail.track', true ], [ 'api', false ] ] );
	assert.equal( filter.type, 'filter' );
	assert.equal( filter.arity, 1 );
	assert.equal( filter.summary, 'Filters one track.' );
	assert.equal( hooksIn( file ).length, 2, 'Array.prototype.filter is not a hook' );
} );

test( 'counts the arguments a PHP hook passes, through nested calls and strings', () => {
	const file = tmp( `<?php
		/**
		 * Filters a thing.
		 *
		 * @since 1.0.0
		 *
		 * @param array $a A.
		 * @param int   $b B.
		 */
		$x = apply_filters( 'riff_x', array( 1, 2 ), max( $b, 3 ) );
` );
	const [ hook ] = hooksIn( file );
	assert.equal( hook.arity, 2 );
	assert.deepEqual( problems( [ hook ] ), [] );
} );

test( 'the check refuses a hook without a docblock, without @since, or with the wrong @param count', () => {
	const file = tmp( `<?php
		do_action( 'riff_bare' );
		/**
		 * Fires without a version.
		 */
		do_action( 'riff_unversioned' );
		/**
		 * Filters with too few parameters.
		 *
		 * @since 1.0.0
		 *
		 * @param string $a A.
		 */
		apply_filters( 'riff_short', $a, $b );
` );
	const found = problems( hooksIn( file ) );
	assert.equal( found.length, 3 );
	assert.match( found[ 0 ], /riff_bare .* has no docblock/ );
	assert.match( found[ 1 ], /riff_unversioned .* has no @since/ );
	assert.match( found[ 2 ], /riff_short .* passes 2 arguments but documents 1 @param/ );
} );

test( 'parse splits the summary from the description and reads every @since into the changelog', () => {
	const parsed = parse( `/**
	 * Filters the accent.
	 *
	 * A theme sets it first.
	 *
	 * @since 0.2.0
	 * @since 4.3.0 Reads theme.json.
	 *
	 * @param string $accent A CSS colour, or an empty string
	 *                       for the default.
	 */` );
	assert.equal( parsed.summary, 'Filters the accent.' );
	assert.equal( parsed.description, 'A theme sets it first.' );
	assert.deepEqual( parsed.changelog, [ { version: '0.2.0', description: 'Introduced.' }, { version: '4.3.0', description: 'Reads theme.json.' } ] );
	assert.equal( parsed.params[ 0 ].description, 'A CSS colour, or an empty string for the default.' );
} );

test( 'every hook in the plugin is documented well enough for the reference', () => {
	const hooks = collect();
	assert.ok( hooks.some( ( h ) => h.lang === 'php' ) && hooks.some( ( h ) => h.lang === 'js' ) );
	assert.deepEqual( problems( hooks ), [] );
} );

test( 'each hook gets a code-reference page with its signature, source at the published commit, and changelog', () => {
	const hooks = collect();
	const out = site( hooks );
	const pageFor = ( slug ) => [ ...out ].find( ( [ file ] ) => file.endsWith( path.join( 'hooks', slug, 'index.html' ) ) )?.[ 1 ];
	const accent = pageFor( 'riff_accent' );
	assert.match( accent, /<span class="hook-func">apply_filters<\/span>\( 'riff_accent', <nobr><span class="arg-type">string<\/span> <span class="arg-name">\$accent<\/span><\/nobr> \)/ );
	assert.match( accent, /blob\/\{\{commit\}\}\/plugins\/riff\/src\/class-player\.php#L\d+-L\d+">View on GitHub/ );
	assert.match( accent, /<span class="n" aria-hidden="true">\d+<\/span>\$accent = \(string\) apply_filters/, 'the source quotes the line, numbered as in the file' );
	assert.match( accent, />Player::root_style\(\)<\/a><code>plugins\/riff\/src\/class-player\.php<\/code><\/td><td>The inline style/, 'used by names the caller with its own summary' );
	assert.match( accent, /<td>0\.2\.0<\/td><td>Introduced\.<\/td>/ );
	assert.match( accent, /<a href="#parameters">Parameters<\/a>/, 'in this article lists the sections' );
	// riff.track is both an action and a filter, so each gets its own page.
	assert.ok( pageFor( 'riff.track-action' ) && pageFor( 'riff.track-filter' ) );
	assert.match( pageFor( 'riff.track-action' ), /riff:track<\/code> event on <code>#riff/ );
	assert.equal( out.size, pages( hooks ).length + 1, 'an index and a page per hook' );
} );

test( 'a hook cannot borrow the docblock of the hook above it', () => {
	const file = tmpJs( `
	/**
	 * Fires once.
	 *
	 * @since 4.0.0
	 *
	 * @param {Object} detail State.
	 * @param {Object} api    The api.
	 */
	emit( 'ready', {} );
	emit( 'after', {} );
	/**
	 * Fires twice.
	 *
	 * @since 4.0.0
	 *
	 * @param {Object} detail State.
	 * @param {Object} api    The api.
	 */
	emit( 'first', {} ); emit( 'second', {} );
` );
	const hooks = hooksIn( file );
	assert.deepEqual( hooks.map( ( h ) => [ h.name, h.documented ] ), [ [ 'riff.ready', true ], [ 'riff.after', false ], [ 'riff.first', true ], [ 'riff.second', false ] ] );
} );

test( 'a Markdown table cell escapes backslashes as well as pipes', () => {
	const { cell } = require( './hooks-reference.js' );
	assert.equal( cell( 'Object|null' ), 'Object\\|null' );
	assert.equal( cell( 'ends in \\' ), 'ends in \\\\', 'a trailing backslash must not escape the cell\'s closing pipe' );
	assert.equal( cell( 'Riff\\Source' ), 'Riff\\\\Source' );
} );
