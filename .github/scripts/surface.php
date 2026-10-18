<?php
/**
 * Prints, as JSON, what the plugin registers for other code to read: its REST routes with their
 * arguments and schemas, the REST field on media, the WPGraphQL types and fields, and the track
 * schema. It runs the plugin's own registration code against stand-ins for the WordPress functions
 * it calls, so the reference shows exactly what WordPress would be handed.
 *
 * Usage: php .github/scripts/surface.php
 *
 * @package Riff
 */

// phpcs:disable -- A build script with stand-ins for WordPress functions, not plugin code.

define( 'ABSPATH', __DIR__ . '/' );
define( 'RIFF_DIR', dirname( __DIR__, 2 ) . '/plugins/riff/' );

$GLOBALS['riff_surface'] = array(
	'routes'     => array(),
	'fields'     => array(),
	'gql_types'  => array(),
	'gql_fields' => array(),
);

function __( $text, $domain = null ) {
	return $text;
}
function add_action() {}
function add_filter() {}
function register_rest_route( $ns, $route, $args ) {
	$GLOBALS['riff_surface']['routes'][] = array( 'namespace' => $ns, 'route' => $route, 'args' => $args );
}
function register_rest_field( $type, $name, $args ) {
	$GLOBALS['riff_surface']['fields'][] = array( 'type' => $type, 'name' => $name, 'args' => $args );
}
function register_graphql_object_type( $name, $args ) {
	$GLOBALS['riff_surface']['gql_types'][ $name ] = $args;
}
function register_graphql_field( $type, $name, $args ) {
	$GLOBALS['riff_surface']['gql_fields'][] = array( 'type' => $type, 'name' => $name, 'args' => $args );
}

require_once RIFF_DIR . 'src/interface-source.php';
foreach ( glob( RIFF_DIR . 'src/class-*.php' ) as $file ) {
	require_once $file;
}

\Riff\Library::routes();
\Riff\Catalog_Rest::routes();
\Riff\Api::rest_field();
\Riff\Api::graphql();

$out = $GLOBALS['riff_surface'];
foreach ( $out['routes'] as &$route ) {
	$methods = array();
	$args    = array();
	foreach ( $route['args'] as $key => $endpoint ) {
		if ( is_int( $key ) ) {
			$methods[] = $endpoint['methods'];
			$args      = $endpoint['args'] ?? array();
		}
	}
	$schema = $route['args']['schema'] ?? null;
	$route  = array(
		'namespace' => $route['namespace'],
		'route'     => $route['route'],
		'methods'   => $methods,
		'args'      => $args,
		'schema'    => is_callable( $schema ) ? call_user_func( $schema ) : null,
	);
}
unset( $route );
foreach ( $out['fields'] as &$field ) {
	$field = array(
		'type'   => $field['type'],
		'name'   => $field['name'],
		'schema' => $field['args']['schema'] ?? null,
	);
}
unset( $field );
foreach ( $out['gql_fields'] as &$field ) {
	$field = array(
		'type'        => $field['type'],
		'name'        => $field['name'],
		'returns'     => $field['args']['type'],
		'description' => $field['args']['description'] ?? '',
	);
}
unset( $field );
$out['track']   = \Riff\Tracks::schema();
$out['version'] = \Riff\Tracks::SCHEMA_VERSION;

echo json_encode( $out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ), "\n";
