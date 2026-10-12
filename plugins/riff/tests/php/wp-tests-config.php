<?php
/**
 * Database configuration for the PHPUnit suite.
 *
 * The config wp-env ships points the test suite at the same database *and* the same table prefix as
 * the site on the tests port, and the WordPress test suite starts by emptying every table it can
 * see. Left that way, running the unit tests wipes the site the E2E suite and the browser are using.
 *
 * The prefix here is the fix: the suite installs its own tables beside the site's and truncates only
 * those. Everything else is read from the container's environment so this file carries no
 * credentials of its own.
 *
 * @package Riff
 */

define( 'DB_NAME', getenv( 'WORDPRESS_DB_NAME' ) ?: 'tests-wordpress' );
define( 'DB_USER', getenv( 'WORDPRESS_DB_USER' ) ?: 'root' );
define( 'DB_PASSWORD', getenv( 'WORDPRESS_DB_PASSWORD' ) ?: 'password' );
define( 'DB_HOST', getenv( 'WORDPRESS_DB_HOST' ) ?: 'tests-mysql' );
define( 'DB_CHARSET', 'utf8' );
define( 'DB_COLLATE', '' );

/**
 * Not `wp_`. This is the whole point of the file.
 *
 * @var string
 */
$table_prefix = 'riff_phpunit_';

define( 'WP_TESTS_DOMAIN', 'example.org' );
define( 'WP_TESTS_EMAIL', 'admin@example.org' );
define( 'WP_TESTS_TITLE', 'Riff PHPUnit' );
define( 'WP_PHP_BINARY', 'php' );
define( 'WPLANG', '' );

define( 'WP_DEBUG', true );
define( 'WP_DEBUG_DISPLAY', false );

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', '/var/www/html/' );
}
