const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const { tokenize, hookName, hookShape, docTags } = require( '../lib/php.js' );

const ids = ( src ) => tokenize( src ).filter( ( t ) => t.t === 'id' ).map( ( t ) => t.v );

test( 'comments, strings, heredocs and inline HTML hide the names inside them', () => {
	const src = [
		'<p>get_header() in HTML</p>',
		'<?php',
		'// get_option() in a line comment',
		'# update_option() in a hash comment',
		'/* delete_option() in a block comment */',
		'$a = "add_option() in a string";',
		'$b = \'wp_die() in a string\';',
		'$c = <<<EOT',
		'wp_insert_post() in a heredoc',
		'EOT;',
		'wp_cache_get( $a );',
		'?>more HTML with is_admin()<?php the_title();',
	].join( '\n' );
	assert.deepEqual( ids( src ), [ 'wp_cache_get', 'the_title' ] );
} );

test( 'a token keeps the line it starts on', () => {
	const tokens = tokenize( '<?php\n/**\n * Doc.\n */\nfoo();\n' );
	assert.equal( tokens.find( ( t ) => t.v === 'foo' ).line, 5 );
} );

test( '#[ starts an attribute, not a comment', () => {
	assert.deepEqual( ids( '<?php #[ReturnTypeWillChange] function current() {}' ), [ 'ReturnTypeWillChange', 'function', 'current' ] );
} );

test( 'hook names keep their dynamic parts as placeholders', () => {
	const name = ( src ) => {
		const tokens = tokenize( `<?php do_action( ${ src } );` );
		return hookName( tokens, 2 );
	};
	assert.equal( name( '\'init\'' ), 'init' );
	assert.equal( name( '"save_post_{$post->post_type}"' ), 'save_post_{$post->post_type}' );
	assert.equal( name( '"pre_option_$option"' ), 'pre_option_{$option}' );
	assert.equal( name( '\'rest_prepare_\' . $this->post_type, $response' ), 'rest_prepare_{$this->post_type}' );
	assert.equal( name( '$hook_name' ), null );
} );

test( 'doc tags give the first @since, and flag deprecated and private', () => {
	assert.deepEqual( docTags( '/**\n * @since 6.5.0\n * @since 6.6.0 Added $x.\n */' ), { since: '6.5.0', deprecated: false, private: false } );
	assert.deepEqual( docTags( '/** @since MU (3.0.0) */' ).since, '3.0.0' );
	assert.equal( docTags( '/** @deprecated 6.2.0 Use WP_Query. */' ).deprecated, true );
	assert.equal( docTags( '/** @access private */' ).private, true );
	assert.deepEqual( docTags( null ), { since: null, deprecated: false, private: false } );
} );

test( 'a hook name full of unclosed braces is normalized in linear time', () => {
	const braces = '{'.repeat( 50000 );
	const start = process.hrtime.bigint();
	assert.equal( hookShape( braces ), braces );
	const ms = Number( process.hrtime.bigint() - start ) / 1e6;
	assert.ok( ms < 500, `took ${ ms } ms` );
} );
