<?php
/**
 * What Riff works out from the whole library and keeps between requests: the tracks a visitor may
 * not see, how many tracks the Tracks view lists, the site's Listen page.
 *
 * @since 6.12.0
 * @package Riff
 */

namespace Riff;

defined( 'ABSPATH' ) || exit;

/**
 * Keeps a value until a post or a term next changes.
 *
 * With a persistent object cache that is the object cache, under a key that holds WordPress's own
 * last-changed times for posts and terms, as core keeps its query caches. Without one the object
 * cache forgets everything when the request ends, last-changed times with it, so the value is kept
 * in a transient instead, beside a stamp of Riff's own that moves whenever WordPress moves either
 * last-changed time. A transient holds one value per name, whatever the stamp, so nothing piles up
 * in the options table.
 */
final class Cache {

	/**
	 * The option that holds the stamp, without a persistent object cache.
	 *
	 * @since 6.12.0
	 */
	public const STAMP = 'riff_changed';

	/**
	 * How long a kept value lasts at most.
	 */
	private const TTL = DAY_IN_SECONDS;

	/**
	 * Sites whose posts or terms changed during this request, by ID: true once the stamp has been
	 * moved for the first change, false while a later change still has to move it again.
	 *
	 * @var array<int, bool>
	 */
	private static array $changed = array();

	/**
	 * Hooks in.
	 *
	 * @since 6.12.0
	 */
	public static function register(): void {
		add_action( 'wp_cache_set_last_changed', array( self::class, 'changed' ), 10, 3 );
		add_action( 'shutdown', array( self::class, 'settle' ) );
	}

	/**
	 * The value kept under a name, or false when none is.
	 *
	 * @since 6.12.0
	 *
	 * @param string $name A short name, unique within Riff.
	 * @return mixed
	 */
	public static function get( string $name ) {
		// After a change in this request, only what this request worked out since, until the request
		// ends and moves the stamp: the object cache's own key holds the last-changed times.
		if ( wp_using_ext_object_cache() || isset( self::$changed[ get_current_blog_id() ] ) ) {
			return wp_cache_get( self::key( $name ), 'riff' );
		}
		$kept = get_transient( self::transient( $name ) );
		return is_array( $kept ) && ( $kept['stamp'] ?? null ) === self::stamp() && array_key_exists( 'value', $kept ) ? $kept['value'] : false;
	}

	/**
	 * Keeps a value under a name until a post or a term next changes.
	 *
	 * @since 6.12.0
	 *
	 * @param string $name  A short name, unique within Riff.
	 * @param mixed  $value Anything but false.
	 */
	public static function set( string $name, $value ): void {
		if ( wp_using_ext_object_cache() || isset( self::$changed[ get_current_blog_id() ] ) ) {
			wp_cache_set( self::key( $name ), $value, 'riff', self::TTL );
			return;
		}
		set_transient(
			self::transient( $name ),
			array(
				'stamp' => self::stamp(),
				'value' => $value,
			),
			self::TTL
		);
	}

	/**
	 * Moves the stamp when WordPress moves the last-changed time of posts or terms: at once for the
	 * first change in a request, so other requests stop reading what was kept, and once more when
	 * the request ends if anything changed after that, so nothing worked out in between is kept.
	 *
	 * @since 6.12.0
	 *
	 * @param string       $group    The cache group whose time moved.
	 * @param string       $time     The new time.
	 * @param string|false $previous The time before, false when the request had none yet: the
	 *                               first read of the time in a request sets it, which is no change.
	 */
	public static function changed( $group, $time = '', $previous = false ): void {
		unset( $time );
		if ( false === $previous || ! in_array( $group, array( 'posts', 'terms' ), true ) || wp_using_ext_object_cache() ) {
			return;
		}
		$site = get_current_blog_id();
		if ( ! isset( self::$changed[ $site ] ) ) {
			self::$changed[ $site ] = true;
			self::move();
			return;
		}
		self::$changed[ $site ] = false;
	}

	/**
	 * Moves the stamp of each site that changed again after its first move, as the request ends.
	 *
	 * @since 6.12.0
	 */
	public static function settle(): void {
		foreach ( self::$changed as $site => $moved ) {
			if ( $moved ) {
				continue;
			}
			$other = is_multisite() && get_current_blog_id() !== $site;
			if ( $other ) {
				switch_to_blog( $site );
			}
			self::move();
			if ( $other ) {
				restore_current_blog();
			}
		}
		self::$changed = array();
	}

	/**
	 * The current stamp.
	 *
	 * @return string
	 */
	private static function stamp(): string {
		return (string) get_option( self::STAMP, '' );
	}

	/**
	 * A new stamp, unlike any before it.
	 */
	private static function move(): void {
		update_option( self::STAMP, uniqid( '', true ), true );
	}

	/**
	 * The object cache key: the name and the last-changed times it depends on.
	 *
	 * @param string $name Name.
	 * @return string
	 */
	private static function key( string $name ): string {
		return $name . ':' . wp_cache_get_last_changed( 'posts' ) . ':' . wp_cache_get_last_changed( 'terms' );
	}

	/**
	 * The transient's name: short enough for any name, as the options table allows 172 characters.
	 *
	 * @param string $name Name.
	 * @return string
	 */
	private static function transient( string $name ): string {
		return 'riff_kept_' . md5( $name );
	}
}
