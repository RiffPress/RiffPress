<?php
/**
 * Just enough of WP-CLI for the suite to run `wp riff` commands and read what they print. PHPUnit
 * does not load WP-CLI; when it is loaded, the real one is used and this file defines nothing.
 *
 * @package Riff
 */

// phpcs:disable Generic.Files.OneObjectStructurePerFile.MultipleFound, Universal.Namespaces.OneDeclarationPerFile.MultipleFound, Universal.Namespaces.DisallowCurlyBraceSyntax.Forbidden, Universal.Namespaces.DisallowDeclarationWithoutName.Forbidden, Universal.Files.SeparateFunctionsFromOO.Mixed, WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedClassFound -- a stand-in for WP-CLI's own global class and namespace.

namespace {
	if ( ! class_exists( 'WP_CLI' ) ) {
		/**
		 * Records each line a command prints; error() throws, as the real one exits.
		 */
		class WP_CLI {

			/**
			 * Printed lines, as [ kind, message ].
			 *
			 * @var array<int, array{0: string, 1: string}>
			 */
			public static array $lines = array();

			public static function add_command( string $name, $handler ): void {}

			public static function log( string $message ): void {
				self::$lines[] = array( 'log', $message );
			}

			public static function warning( string $message ): void {
				self::$lines[] = array( 'warning', $message );
			}

			public static function success( string $message ): void {
				self::$lines[] = array( 'success', $message );
			}

			public static function error( string $message ): void {
				self::$lines[] = array( 'error', $message );
				throw new RuntimeException( $message ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- test output only.
			}
		}
	}
}

namespace WP_CLI\Utils {
	if ( ! function_exists( 'WP_CLI\Utils\get_flag_value' ) ) {
		/**
		 * A flag's value, or the default.
		 *
		 * @param array  $assoc_args Named arguments.
		 * @param string $flag       Flag.
		 * @param mixed  $fallback   Default.
		 * @return mixed
		 */
		function get_flag_value( array $assoc_args, string $flag, $fallback = null ) {
			return $assoc_args[ $flag ] ?? $fallback;
		}
	}
}
