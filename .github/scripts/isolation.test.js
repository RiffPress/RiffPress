/**
 * The isolation check (isolation.js): every plugin keeps to its isolation.json, and each rule
 * fails the code it is meant to fail, with a message that says how to fix it.
 */
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs' );
const os = require( 'node:os' );
const path = require( 'node:path' );
const { test } = require( 'node:test' );
const { scan, check, stripPhp, hostAllowed, owner, riffSurface, manifests } = require( './isolation' );

const RIFF = riffSurface();

// A plugin of the given files, in a folder of its own.
function plugin( files ) {
	const dir = fs.mkdtempSync( path.join( os.tmpdir(), 'riff-isolation-' ) );
	for ( const [ name, code ] of Object.entries( files ) ) {
		fs.mkdirSync( path.dirname( path.join( dir, name ) ), { recursive: true } );
		fs.writeFileSync( path.join( dir, name ), code );
	}
	return dir;
}

const base = ( more = {} ) => ( {
	plugin: 'riff-demo',
	namespace: 'Demo',
	data: { options: [ 'riff_demo_' ], meta: [ '_riff_demo_' ], shared: {}, keep: {} },
	rest: { namespaces: [ 'riff-demo/v1' ], fields: [], public: {} },
	capabilities: [],
	hosts: [],
	spawn: [],
	riff: { hooks: [], functions: [], events: [], api: [] },
	scripts: [],
	modules: [],
	...more,
} );

// The problems a plugin of these files has against this manifest, beside Riff's and Sign In's.
function problems( files, manifest = base() ) {
	const all = {
		riff: { data: { options: [ 'riff_' ], meta: [ '_riff_', 'riff_' ] } },
		'riff-sign-in': { data: { options: [ 'riff_sign_in_' ], meta: [ 'riff_passkey' ] } },
		'riff-demo': manifest,
	};
	return check( 'riff-demo', scan( plugin( files ) ), all, RIFF );
}
const php = ( body ) => ( { 'src/class-demo.php': `<?php\nnamespace Riff\\Demo;\nfinal class Demo {\n${ body }\n}\n` } );

test( 'every plugin in the repository keeps to its isolation.json', () => {
	const { manifests: all, errors } = manifests();
	assert.deepEqual( errors, [] );
	const out = [];
	for ( const slug of Object.keys( all ) ) {
		out.push( ...check( slug, scan( path.join( __dirname, '..', '..', 'plugins', slug ) ), all, RIFF ) );
	}
	assert.deepEqual( out, [] );
} );

test( 'comments are not code', () => {
	assert.equal( stripPhp( "<?php // exec( 'x' );\n$a = 'b'; # c\n/* d */" ).includes( 'exec' ), false );
	assert.ok( stripPhp( "<?php $a = '// not a comment';" ).includes( '// not a comment' ) );
} );

test( 'a key outside its prefixes is refused, with how to fix it', () => {
	const [ e ] = problems( php( "public static function a() { update_option( 'demo_setting', 1 ); }" ) );
	assert.match( e, /writes the option or transient 'demo_setting'/ );
	assert.match( e, /Name it under one of them, or declare its prefix there/ );
} );

test( 'a key resolved from a class constant, and one built from a prefix, are held to the prefixes', () => {
	assert.deepEqual( problems( php( "const KEY = '_riff_demo_x';\npublic static function a( $id ) { update_post_meta( $id, self::KEY, 1 ); set_transient( 'riff_demo_' . $id, 1 ); }" ) ), [] );
	const [ e ] = problems( php( "const KEY = '_demo_x';\npublic static function a( $id ) { update_post_meta( $id, self::KEY, 1 ); }" ) );
	assert.match( e, /writes the meta key '_demo_x'/ );
} );

test( "another plugin's key is refused, even to read", () => {
	const out = problems( php( "public static function a( $u ) { return get_user_meta( $u, 'riff_passkeys', true ); }" ) );
	assert.equal( out.length, 1 );
	assert.match( out[ 0 ], /which is riff-sign-in's/ );
} );

test( "WordPress's own keys may be read, and written only when shared says why", () => {
	assert.deepEqual( problems( php( "public static function a() { return get_option( 'date_format' ); }" ) ), [] );
	assert.equal( problems( php( "public static function a( $id ) { update_post_meta( $id, '_thumbnail_id', 2 ); }" ) ).length, 1 );
	const manifest = base();
	manifest.data.shared = { _thumbnail_id: 'the cover' };
	assert.deepEqual( problems( php( "public static function a( $id ) { update_post_meta( $id, '_thumbnail_id', 2 ); }" ), manifest ), [] );
} );

test( 'a REST namespace it does not declare is refused', () => {
	const [ e ] = problems( php( "public static function a() { register_rest_route( 'other/v1', '/x', array( 'methods' => 'GET', 'callback' => 'x', 'permission_callback' => '__return_true' ) ); }" ) );
	assert.match( e, /'other\/v1' is not in rest.namespaces/ );
} );

test( 'a route without a permission_callback is refused', () => {
	const [ e ] = problems( php( "public static function a() { register_rest_route( 'riff-demo/v1', '/x', array( 'methods' => 'GET', 'callback' => 'x' ) ); }" ) );
	assert.match( e, /has no permission_callback/ );
} );

test( 'a write anyone may make is refused, through a variable too, unless rest.public says why', () => {
	const route = "register_rest_route( 'riff-demo/v1', '/x', array( 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'x', 'permission_callback' => $open ) );";
	const code = php( `public static function a() { $open = '__return_true'; ${ route } }` );
	const [ e ] = problems( code );
	assert.match( e, /lets anyone WP_REST_Server::CREATABLE/ );
	const manifest = base();
	manifest.rest.public = { 'riff-demo/v1/x': 'signing in' };
	assert.deepEqual( problems( code, manifest ), [] );
	// Reading is fine open: the route checks what it hands out.
	assert.deepEqual( problems( php( "public static function a() { register_rest_route( 'riff-demo/v1', '/x', array( 'methods' => 'GET', 'callback' => 'x', 'permission_callback' => '__return_true' ) ); }" ) ), [] );
} );

test( 'a capability it does not declare is refused, and one it declares and never checks', () => {
	const [ e ] = problems( php( "public static function a() { return current_user_can( 'manage_options' ); }" ) );
	assert.match( e, /'manage_options', which is not in capabilities/ );
	const [ unused ] = problems( php( 'public static function a() {}' ), base( { capabilities: [ 'edit_posts' ] } ) );
	assert.match( unused, /never checks. Take it out/ );
} );

test( 'a host it does not declare is refused, in PHP and in a script', () => {
	const [ e ] = problems( php( "public static function a() { return wp_remote_get( 'https://api.example.com/x' ); }" ) );
	assert.match( e, /calls api.example.com, which is not in hosts/ );
	const [ f ] = problems( { 'assets/demo.js': "fetch( 'https://evil.example/' );" } );
	assert.match( f, /calls evil.example/ );
	assert.ok( hostAllowed( 'secure.gravatar.com', [ '*.gravatar.com' ] ) );
	assert.ok( ! hostAllowed( 'gravatar.com.evil.example', [ '*.gravatar.com' ] ) );
} );

test( 'running a program, writing a file and including a variable each need a reason on the line', () => {
	const spawn = problems( php( "public static function a() { exec( 'ls' ); }" ) );
	assert.match( spawn[ 0 ], /declares none \(spawn\)/ );
	const write = problems( php( "public static function a( $f ) { file_put_contents( $f, 'x' ); }" ) );
	assert.match( write[ 0 ], /writes to the filesystem/ );
	assert.deepEqual( problems( php( "public static function a( $f ) {\n// isolation: write -- under uploads.\nfile_put_contents( $f, 'x' ); }" ) ), [] );
	// Reading a file is not writing one.
	assert.deepEqual( problems( php( "public static function a( $f ) { return fopen( $f, 'rb' ); }" ) ), [] );
	const include = problems( php( 'public static function a( $f ) { include $f; }' ) );
	assert.match( include[ 0 ], /include of a path from a variable/ );
	assert.deepEqual( problems( php( "public static function a() { require __DIR__ . '/b.php'; }" ) ), [] );
} );

test( 'an iframe needs a sandbox', () => {
	const [ e ] = problems( php( "public static function a() { return '<iframe src=\"https://x\"></iframe>'; }" ) );
	assert.match( e, /without a sandbox attribute/ );
	assert.deepEqual( problems( php( "public static function a() { return '<iframe sandbox=\"\" src=\"/x\"></iframe>'; }" ) ), [] );
} );

test( 'an extension uses only what Riff makes public, and declares what it uses', () => {
	const internal = problems( php( 'public static function a() { return \\Riff\\Listen\\First_Run::listen_page(); }' ) );
	assert.match( internal[ 0 ], /reaches into Riff\\Listen\\First_Run/ );
	const hook = problems( php( "public static function a() { add_action( 'riff_register', 'x' ); }" ) );
	assert.match( hook[ 0 ], /'riff_register', which is not in riff.hooks/ );
	const secret = problems( php( "public static function a() { add_action( 'riff_catalog_backfill', 'x' ); }" ) );
	assert.match( secret[ 0 ], /is not public/ );
	const imported = problems( { 'assets/demo.js': "import { fmt } from 'riff-player/helpers';" } );
	assert.match( imported[ 0 ], /one of Riff's own modules/ );
	const event = problems( { 'assets/demo.js': "document.addEventListener( 'riff:track', () => {} );" } );
	assert.match( event[ 0 ], /'track', which is not in riff.events/ );
} );

test( 'a script handle is named after the plugin and declared', () => {
	const out = problems( php( "public static function a() { wp_enqueue_script( 'helper', 'x.js', array(), '1', true ); }" ) );
	assert.ok( out.some( ( e ) => /'helper' is not in scripts/.test( e ) ) );
	assert.ok( out.some( ( e ) => /doesn't start with 'riff-demo'/.test( e ) ) );
} );

test( 'the longest prefix owns a key', () => {
	const all = { riff: { data: { options: [ 'riff_' ] } }, 'riff-sign-in': { data: { options: [ 'riff_sign_in_' ] } } };
	assert.equal( owner( 'riff_sign_in_listeners', 'options', all ), 'riff-sign-in' );
	assert.equal( owner( 'riff_turntable', 'options', all ), 'riff' );
	assert.equal( owner( 'users_can_register', 'options', all ), null );
} );
