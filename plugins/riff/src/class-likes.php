<?php
/**
 * Likes and what was played, for a signed-in user: kept as their user options, read and written
 * over REST.
 *
 * @since 4.20.0
 * @package Riff
 */

namespace Riff;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

defined( 'ABSPATH' ) || exit;

/**
 * A listener's likes and recently played.
 *
 * A signed-in user's likes and recently played are kept in user meta under the site's table
 * prefix, `riff_likes` and `riff_history`, so they need no table of their own, and on a multisite
 * network each site keeps its own, since a track's ID means a different file on each. Each like
 * and each play is a row of its own, so a like on one device and another on a second are two
 * inserts, and neither writes over the other. A visitor's stay in their browser;
 * the player sends them to the account the first time it loads after they sign in, and forgets
 * them on the device. A like is a track (an audio attachment), an album or an artist (a
 * `riff_album` or `riff_artist` term), by ID, with when it was liked; a play is a track by ID,
 * with when it was played.
 */
final class Likes {

	/**
	 * The user meta key, under the site's table prefix, holding a user's likes, a row each:
	 * `{ kind, id, at }`, `at` in milliseconds since the epoch. A list in one row is how Riff kept
	 * them before 6.17.0, and is still read.
	 *
	 * @since 4.20.0
	 */
	public const OPTION = 'riff_likes';

	/**
	 * The user meta key, under the site's table prefix, holding the tracks a user played, a row
	 * each: `{ id, played, post }`, the post being where it was played from.
	 *
	 * @since 4.20.0
	 */
	public const HISTORY_OPTION = 'riff_history';

	/**
	 * What can be liked.
	 *
	 * @since 4.20.0
	 */
	public const KINDS = array( 'track', 'album', 'artist' );

	/**
	 * Likes kept per user. The oldest go first.
	 *
	 * @since 4.20.0
	 */
	public const MAX = 2000;

	/**
	 * Tracks kept in recently played, the same number the player keeps on a device.
	 *
	 * @since 4.20.0
	 */
	public const HISTORY_MAX = 30;

	/**
	 * Hooks the routes, the player's data and the privacy tools.
	 *
	 * @since 4.20.0
	 */
	public static function register(): void {
		add_filter( 'wp_privacy_personal_data_exporters', array( self::class, 'exporters' ) );
		add_filter( 'wp_privacy_personal_data_erasers', array( self::class, 'erasers' ) );
		add_action( 'admin_init', array( self::class, 'privacy_policy' ) );
	}

	/**
	 * Suggests text for the site's privacy policy, under Settings > Privacy: what Riff keeps about
	 * a listener, and where.
	 *
	 * @since 4.21.0
	 */
	public static function privacy_policy(): void {
		if ( ! function_exists( 'wp_add_privacy_policy_content' ) ) {
			return;
		}
		$text = '<p>' . __( 'When you are signed in, the tracks, albums and artists you like and the tracks you recently played are saved to your account on this site, so they follow you between devices, as are the playlists you make. You can ask for them to be exported or erased like the rest of your personal data.', 'riff' ) . '</p>'
			. '<p>' . __( 'When you are not signed in, your likes, recently played tracks and the queue are kept in your own browser&#8217;s storage, and are never sent to this site.', 'riff' ) . '</p>'
			. '<p>' . __( 'While your browser keeps a listening history, the player also sets a cookie named riff_history. Its value is only 1 or 2, saying whether there is a history to show, so the Listen page can make room for it before the page appears. It holds nothing about what you played, is used only by this site, and is strictly necessary for the page to work as designed. It lasts a year, and is removed when the history is gone or you sign in.', 'riff' ) . '</p>';
		wp_add_privacy_policy_content( 'Riff', wp_kses_post( $text ) );
	}

	/**
	 * A user's likes, newest first.
	 *
	 * @since 4.20.0
	 *
	 * @param int $user_id User ID.
	 * @return array[] Likes: kind, id, at.
	 */
	public static function get( int $user_id ): array {
		return self::clean( self::stored( $user_id, self::OPTION ) );
	}

	/**
	 * Adds likes to a user's. One that names nothing on this site is left out; one already liked
	 * keeps its place.
	 *
	 * @since 4.20.0
	 *
	 * @param int   $user_id User ID.
	 * @param array $items   Likes: kind, id, and at when known.
	 * @return array[] The user's likes after.
	 */
	public static function add( int $user_id, array $items ): array {
		$now   = self::now();
		$likes = self::get( $user_id );
		$added = false;
		$have  = array();
		foreach ( $likes as $like ) {
			$have[ $like['kind'] . ':' . $like['id'] ] = true;
		}
		foreach ( $items as $item ) {
			$kind = is_array( $item ) ? (string) ( $item['kind'] ?? '' ) : '';
			$id   = is_array( $item ) ? (int) ( $item['id'] ?? 0 ) : 0;
			$key  = $kind . ':' . $id;
			if ( isset( $have[ $key ] ) || ! self::exists( $kind, $id ) ) {
				continue;
			}
			$at = (int) ( $item['at'] ?? 0 );
			add_user_meta(
				$user_id,
				self::key( self::OPTION ),
				array(
					'kind' => $kind,
					'id'   => $id,
					'at'   => $at > 0 && $at <= $now ? $at : $now,
				)
			);
			$added        = true;
			$have[ $key ] = true;
		}
		return $added ? self::tidy( $user_id, self::OPTION ) : $likes;
	}

	/**
	 * Takes one like away.
	 *
	 * @since 4.20.0
	 *
	 * @param int    $user_id User ID.
	 * @param string $kind    track, album or artist.
	 * @param int    $id      ID.
	 * @return array[] The user's likes after.
	 */
	public static function remove( int $user_id, string $kind, int $id ): array {
		return self::tidy( $user_id, self::OPTION, static fn( $like ) => ! ( $like['kind'] === $kind && $like['id'] === $id ) );
	}

	/**
	 * What a user played, newest first, by track ID.
	 *
	 * @since 4.20.0
	 *
	 * @param int $user_id User ID.
	 * @return array[] Plays: id, played, and the post it was played from.
	 */
	public static function history( int $user_id ): array {
		return self::clean_history( self::stored( $user_id, self::HISTORY_OPTION ) );
	}

	/**
	 * Adds plays to a user's history. A track played again moves to the front.
	 *
	 * @since 4.20.0
	 *
	 * @param int   $user_id User ID.
	 * @param array $items   Plays: id, and played and post when known.
	 * @return array[] The user's history after.
	 */
	public static function played( int $user_id, array $items ): array {
		$now   = self::now();
		$added = false;
		foreach ( $items as $item ) {
			$id = is_array( $item ) ? (int) ( $item['id'] ?? 0 ) : 0;
			if ( ! self::exists( 'track', $id ) ) {
				continue;
			}
			$at = (int) ( $item['played'] ?? 0 );
			add_user_meta(
				$user_id,
				self::key( self::HISTORY_OPTION ),
				array(
					'id'     => $id,
					'played' => $at > 0 && $at <= $now ? $at : $now,
					'post'   => max( 0, (int) ( $item['post'] ?? 0 ) ),
				)
			);
			$added = true;
			/**
			 * Fires once for each play a listener's player reports, as it adds the play to their
			 * history: when a track starts. A host counts plays here, per pass.
			 *
			 * @since 6.17.0
			 *
			 * @param int   $track_id Attachment ID.
			 * @param int   $user_id  User ID.
			 * @param array $context  {
			 *     @type string $pass The pass the report carries, or empty.
			 *     @type string $via  Where it was reported: rest.
			 *     @type int    $post The post it played from, or 0.
			 * }
			 */
			do_action(
				'riff_played',
				$id,
				$user_id,
				array(
					'pass' => Rights::pass(),
					'via'  => Rights::via(),
					'post' => (int) ( $item['post'] ?? 0 ),
				)
			);
		}
		return $added ? self::tidy( $user_id, self::HISTORY_OPTION ) : self::history( $user_id );
	}

	/**
	 * A user's history as tracks, in the shape the player keeps, each with `played`. A track the
	 * user can no longer see, such as one whose post went private, is left out.
	 *
	 * @since 4.20.0
	 *
	 * @param int $user_id User ID.
	 * @return array[] Tracks.
	 */
	public static function history_tracks( int $user_id ): array {
		$plays = self::history( $user_id );
		if ( ! $plays ) {
			return array();
		}
		$tracks = array();
		foreach ( Tracks::readable( $plays ) as $i => $track ) {
			if ( $track ) {
				$track['played'] = (int) $plays[ $i ]['played'];
				$tracks[]        = $track;
			}
		}
		return $tracks;
	}

	/**
	 * The user meta key for one of the two lists on this site.
	 *
	 * @param string $option OPTION or HISTORY_OPTION.
	 * @return string
	 */
	private static function key( string $option ): string {
		global $wpdb;
		return $wpdb->get_blog_prefix() . $option;
	}

	/**
	 * Every like or play stored, the newest row first, a list kept whole in one row (as before
	 * 6.17.0) opened up in its place.
	 *
	 * @param int    $user_id User ID.
	 * @param string $option  OPTION or HISTORY_OPTION.
	 * @return array[]
	 */
	private static function stored( int $user_id, string $option ): array {
		$items = array();
		foreach ( array_reverse( get_user_meta( $user_id, self::key( $option ), false ) ) as $row ) {
			if ( is_array( $row ) && array_is_list( $row ) ) {
				array_push( $items, ...$row );
			} else {
				$items[] = $row;
			}
		}
		return $items;
	}

	/**
	 * Brings one list's rows to what it should hold, from what is stored now: each like or track
	 * once, the newest kept, no more than the most kept, less any `$drop` turns away. Only rows read
	 * here are deleted, so a row another request added meanwhile stays, and what is kept is never
	 * written again, so nothing a second request did is written over.
	 *
	 * @param int           $user_id User ID.
	 * @param string        $option  OPTION or HISTORY_OPTION.
	 * @param callable|null $drop    Given an item, false to take it away.
	 * @return array[] The list after.
	 */
	private static function tidy( int $user_id, string $option, ?callable $drop = null ): array {
		$key = self::key( $option );
		wp_cache_delete( $user_id, 'user_meta' );
		$rows = get_user_meta( $user_id, $key, false );
		$list = self::HISTORY_OPTION === $option ? self::history( $user_id ) : self::get( $user_id );
		if ( $drop ) {
			$list = array_values( array_filter( $list, $drop ) );
		}
		$want = array();
		foreach ( $list as $item ) {
			$want[ maybe_serialize( $item ) ] = $item;
		}
		$count = array_count_values( array_map( 'maybe_serialize', $rows ) );
		foreach ( $rows as $row ) {
			$id = maybe_serialize( $row );
			if ( ! isset( $count[ $id ] ) ) {
				continue;
			}
			if ( isset( $want[ $id ] ) && 1 === $count[ $id ] ) {
				unset( $want[ $id ] );
			} else {
				delete_user_meta( $user_id, $key, $row );
			}
			unset( $count[ $id ] );
		}
		// What was kept in a list of its own, or twice, comes back as one row.
		foreach ( array_reverse( $want ) as $item ) {
			add_user_meta( $user_id, $key, $item );
		}
		return $list;
	}

	/**
	 * Whether a like or a play names something on this site: an audio attachment for a track, a
	 * term for an album or artist.
	 *
	 * @param string $kind track, album or artist.
	 * @param int    $id   ID.
	 * @return bool
	 */
	private static function exists( string $kind, int $id ): bool {
		if ( $id <= 0 ) {
			return false;
		}
		if ( 'track' === $kind ) {
			return 'attachment' === get_post_type( $id ) && str_starts_with( (string) get_post_mime_type( $id ), 'audio/' );
		}
		$taxonomy = array(
			'album'  => Catalog::ALBUM,
			'artist' => Catalog::ARTIST,
		)[ $kind ] ?? '';
		return '' !== $taxonomy && null !== term_exists( $id, $taxonomy );
	}

	/**
	 * Likes as stored: well formed, each once, newest first, no more than MAX.
	 *
	 * @param mixed $likes What was stored.
	 * @return array[]
	 */
	private static function clean( $likes ): array {
		$out  = array();
		$seen = array();
		foreach ( is_array( $likes ) ? $likes : array() as $like ) {
			if ( ! is_array( $like ) || ! in_array( $like['kind'] ?? '', self::KINDS, true ) || (int) ( $like['id'] ?? 0 ) <= 0 ) {
				continue;
			}
			$key = $like['kind'] . ':' . (int) $like['id'];
			if ( isset( $seen[ $key ] ) ) {
				continue;
			}
			$seen[ $key ] = true;
			$out[]        = array(
				'kind' => (string) $like['kind'],
				'id'   => (int) $like['id'],
				'at'   => max( 0, (int) ( $like['at'] ?? 0 ) ),
			);
		}
		usort( $out, static fn( $a, $b ) => $b['at'] <=> $a['at'] );
		return array_slice( $out, 0, self::MAX );
	}

	/**
	 * History as stored: well formed, each track once at its latest play, no more than HISTORY_MAX.
	 *
	 * @param mixed $stored What was stored.
	 * @return array[]
	 */
	private static function clean_history( $stored ): array {
		$out    = array();
		$seen   = array();
		$stored = array_values( array_filter( is_array( $stored ) ? $stored : array(), 'is_array' ) );
		// The latest play of each track counts.
		usort( $stored, static fn( $a, $b ) => (int) ( $b['played'] ?? 0 ) <=> (int) ( $a['played'] ?? 0 ) );
		foreach ( $stored as $play ) {
			$id = is_array( $play ) ? (int) ( $play['id'] ?? 0 ) : 0;
			if ( $id <= 0 || isset( $seen[ $id ] ) ) {
				continue;
			}
			$seen[ $id ] = true;
			$out[]       = array(
				'id'     => $id,
				'played' => max( 0, (int) ( $play['played'] ?? 0 ) ),
				'post'   => max( 0, (int) ( $play['post'] ?? 0 ) ),
			);
		}
		return array_slice( $out, 0, self::HISTORY_MAX );
	}

	/**
	 * Now, in milliseconds since the epoch, as the browser counts.
	 *
	 * @return int
	 */
	private static function now(): int {
		return (int) floor( microtime( true ) * 1000 );
	}

	/**
	 * Adds Riff's exporter to Tools > Export Personal Data.
	 *
	 * @since 4.20.0
	 *
	 * @param array $exporters Exporters.
	 * @return array
	 */
	public static function exporters( $exporters ) {
		$exporters         = (array) $exporters;
		$exporters['riff'] = array(
			'exporter_friendly_name' => __( 'Riff likes and listening', 'riff' ),
			'callback'               => array( self::class, 'export' ),
		);
		return $exporters;
	}

	/**
	 * Adds Riff's eraser to Tools > Erase Personal Data.
	 *
	 * @since 4.20.0
	 *
	 * @param array $erasers Erasers.
	 * @return array
	 */
	public static function erasers( $erasers ) {
		$erasers         = (array) $erasers;
		$erasers['riff'] = array(
			'eraser_friendly_name' => __( 'Riff likes and listening', 'riff' ),
			'callback'             => array( self::class, 'erase' ),
		);
		return $erasers;
	}

	/**
	 * A user's likes and recently played, for their personal data export.
	 *
	 * @since 4.20.0
	 *
	 * @param string $email The user's email address.
	 * @return array
	 */
	public static function export( $email ): array {
		$user = get_user_by( 'email', (string) $email );
		$data = array();
		if ( $user ) {
			foreach ( self::get( $user->ID ) as $like ) {
				$data[] = array(
					'name'  => array(
						'track'  => __( 'Liked song', 'riff' ),
						'album'  => __( 'Liked album', 'riff' ),
						'artist' => __( 'Liked artist', 'riff' ),
					)[ $like['kind'] ],
					'value' => self::name( $like['kind'], $like['id'], $user->ID ),
				);
			}
			foreach ( self::history( $user->ID ) as $play ) {
				$data[] = array(
					'name'  => __( 'Played', 'riff' ),
					'value' => self::name( 'track', $play['id'], $user->ID ) . ' (' . wp_date( 'Y-m-d H:i', (int) floor( $play['played'] / 1000 ) ) . ')',
				);
			}
		}
		return array(
			'data' => $data ? array(
				array(
					'group_id'    => 'riff',
					'group_label' => __( 'Riff', 'riff' ),
					'item_id'     => 'riff-' . (int) $user->ID,
					'data'        => $data,
				),
			) : array(),
			'done' => true,
		);
	}

	/**
	 * Erases a user's likes and recently played.
	 *
	 * @since 4.20.0
	 *
	 * @param string $email The user's email address.
	 * @return array
	 */
	public static function erase( $email ): array {
		$user    = get_user_by( 'email', (string) $email );
		$removed = false;
		if ( $user ) {
			$removed = ( self::get( $user->ID ) || self::history( $user->ID ) );
			// Every row of each, as deleting a user option takes them all.
			delete_user_option( $user->ID, self::OPTION );
			delete_user_option( $user->ID, self::HISTORY_OPTION );
		}
		return array(
			'items_removed'  => $removed,
			'items_retained' => false,
			'messages'       => array(),
			'done'           => true,
		);
	}

	/**
	 * A like's name for the export: a track's title, an album's or artist's name, or its ID once
	 * it is gone. A track the user cannot see, by the rule GET /tracks follows, is named by its ID
	 * too, since the export is sent to them.
	 *
	 * @param string $kind    track, album or artist.
	 * @param int    $id      ID.
	 * @param int    $user_id Whose export it is.
	 * @return string
	 */
	private static function name( string $kind, int $id, int $user_id ): string {
		if ( 'track' === $kind ) {
			$title = Catalog_Rest::visible( $id, $user_id ) ? get_the_title( $id ) : '';
			return '' !== $title ? $title : '#' . $id;
		}
		$term = get_term( $id );
		return $term instanceof \WP_Term ? $term->name : '#' . $id;
	}
}
