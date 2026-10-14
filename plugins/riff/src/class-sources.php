<?php
/**
 * Where tracks come from: the registry of sources.
 *
 * @package Riff
 * @since 4.0.0
 */

namespace Riff;

use WP_Post;

defined( 'ABSPATH' ) || exit;

/**
 * The registry.
 *
 * @since 4.0.0
 */
final class Sources {

	/**
	 * Registered sources, by id.
	 *
	 * @var Source[]
	 */
	private static array $sources = array();

	/**
	 * Registers a source. The core blocks source registers itself at boot; a plugin registers
	 * its own on `init`.
	 *
	 * @since 4.0.0
	 *
	 * @param Source $source Source.
	 */
	public static function register( Source $source ): void {
		self::$sources[ $source->id() ] = $source;
	}

	/**
	 * Removes a source.
	 *
	 * @since 4.0.0
	 *
	 * @param string $id Source id.
	 */
	public static function unregister( string $id ): void {
		unset( self::$sources[ $id ] );
	}

	/**
	 * Every registered source, after the `riff_sources` filter.
	 *
	 * @since 4.0.0
	 *
	 * @return Source[]
	 */
	public static function all(): array {
		/**
		 * Filters the sources tracks are read from, keyed by id.
		 *
		 * @since 4.0.0
		 *
		 * @param Source[] $sources Sources.
		 */
		$sources = apply_filters( 'riff_sources', self::$sources );
		return array_filter( (array) $sources, static fn( $s ) => $s instanceof Source );
	}

	/**
	 * The first source that claims the post.
	 *
	 * @since 4.0.0
	 *
	 * @param WP_Post $post Post.
	 * @return Source|null
	 */
	public static function for_post( WP_Post $post ): ?Source {
		foreach ( self::all() as $source ) {
			if ( $source->supports( $post ) ) {
				return $source;
			}
		}
		return null;
	}
}
