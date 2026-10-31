<?php
/**
 * Playlists people make: private posts holding core's Playlist block, owned by their user.
 *
 * @since 4.20.0
 * @package Riff
 */

namespace Riff;

use WP_Error;
use WP_Post;
use WP_REST_Request;
use WP_REST_Response;

defined( 'ABSPATH' ) || exit;

/**
 * A listener's playlists.
 *
 * A playlist is a post of the riff_playlist type, private, with its listener as its author, and its
 * tracks as the playlist-track blocks of one core Playlist block (WordPress 7.1) in its content. So
 * it lives in wp_posts with no table of its own, opens in the block editor for someone who can edit
 * it, and its tracks are read the way Riff reads any Playlist block. The routes under
 * riff/v1/users/me/playlists make, change and delete them, for the signed-in user, or for a user ID
 * by someone who may edit that user.
 */
final class Playlists {

	/**
	 * The post type.
	 *
	 * @since 4.20.0
	 */
	public const TYPE = 'riff_playlist';

	/**
	 * Tracks a playlist holds at most.
	 *
	 * @since 4.20.0
	 */
	public const MAX_TRACKS = 500;

	/**
	 * Playlists exported or erased per request of the privacy tools.
	 *
	 * @since 4.23.0
	 */
	private const PRIVACY_PAGE = 50;

	/**
	 * How many of a playlist's first tracks are loaded at once for its mosaic: enough for four
	 * covers when several tracks share one.
	 */
	private const COVER_TRACKS = 16;

	/**
	 * Hooks the post type, the routes and the privacy tools.
	 *
	 * @since 4.20.0
	 */
	public static function register(): void {
		add_action( 'init', array( self::class, 'post_type' ) );
		add_filter( 'wp_privacy_personal_data_exporters', array( self::class, 'exporters' ) );
		add_filter( 'wp_privacy_personal_data_erasers', array( self::class, 'erasers' ) );
	}

	/**
	 * Adds the playlists to Tools > Export Personal Data.
	 *
	 * @since 4.23.0
	 *
	 * @param array $exporters Exporters.
	 * @return array
	 */
	public static function exporters( $exporters ) {
		$exporters                   = (array) $exporters;
		$exporters['riff-playlists'] = array(
			'exporter_friendly_name' => __( 'Riff playlists', 'riff' ),
			'callback'               => array( self::class, 'export' ),
		);
		return $exporters;
	}

	/**
	 * Adds the playlists to Tools > Erase Personal Data, the one place a listener's playlists are
	 * deleted: uninstalling Riff keeps them, so installing it again brings them back.
	 *
	 * @since 4.23.0
	 *
	 * @param array $erasers Erasers.
	 * @return array
	 */
	public static function erasers( $erasers ) {
		$erasers                   = (array) $erasers;
		$erasers['riff-playlists'] = array(
			'eraser_friendly_name' => __( 'Riff playlists', 'riff' ),
			'callback'             => array( self::class, 'erase' ),
		);
		return $erasers;
	}

	/**
	 * A user's playlists for their personal data export, a page at a time: each playlist's name
	 * and its tracks in order. A track they can no longer see is named by its ID, as a like is.
	 *
	 * @since 4.23.0
	 *
	 * @param string $email The user's email.
	 * @param int    $page  The page, from 1.
	 * @return array
	 */
	public static function export( $email, $page = 1 ): array {
		$user  = get_user_by( 'email', (string) $email );
		$posts = $user ? self::owned_by( $user->ID, (int) $page ) : array();
		$items = array();
		foreach ( $posts as $post ) {
			$tracks = array();
			foreach ( self::ids( $post ) as $id ) {
				$title    = Catalog_Rest::visible( $id, $user->ID ) ? get_the_title( $id ) : '';
				$tracks[] = '' !== $title ? $title : '#' . $id;
			}
			$items[] = array(
				'group_id'    => 'riff-playlists',
				'group_label' => __( 'Riff playlists', 'riff' ),
				'item_id'     => 'riff-playlist-' . (int) $post->ID,
				'data'        => array(
					array(
						'name'  => __( 'Name', 'riff' ),
						'value' => (string) $post->post_title,
					),
					array(
						'name'  => __( 'Tracks', 'riff' ),
						'value' => implode( "\n", $tracks ),
					),
				),
			);
		}
		return array(
			'data' => $items,
			'done' => count( $posts ) < self::PRIVACY_PAGE,
		);
	}

	/**
	 * Deletes a user's playlists for Tools > Erase Personal Data, a page at a time, trash and all.
	 *
	 * @since 4.23.0
	 *
	 * @param string $email The user's email.
	 * @param int    $page  The page, from 1; each page deletes what it found, so the next is the first again.
	 * @return array
	 */
	public static function erase( $email, $page = 1 ): array {
		unset( $page );
		$user  = get_user_by( 'email', (string) $email );
		$posts = $user ? self::owned_by( $user->ID, 1 ) : array();
		foreach ( $posts as $post ) {
			wp_delete_post( $post->ID, true );
		}
		return array(
			'items_removed'  => (bool) $posts,
			'items_retained' => false,
			'messages'       => array(),
			'done'           => count( $posts ) < self::PRIVACY_PAGE,
		);
	}

	/**
	 * One page of a user's playlists in any status, the trash included, oldest first.
	 *
	 * @param int $user_id User ID.
	 * @param int $page    The page, from 1.
	 * @return WP_Post[]
	 */
	private static function owned_by( int $user_id, int $page ): array {
		return get_posts(
			array(
				'post_type'      => self::TYPE,
				'post_status'    => array( 'private', 'publish', 'draft', 'pending', 'future', 'trash' ),
				'author'         => $user_id,
				'posts_per_page' => self::PRIVACY_PAGE,
				'paged'          => max( 1, $page ),
				'orderby'        => 'ID',
				'order'          => 'ASC',
			)
		);
	}

	/**
	 * Registers riff_playlist: private by default, in the editor for whoever may edit posts, out
	 * of the site's archives, feeds and search.
	 *
	 * @since 4.20.0
	 */
	public static function post_type(): void {
		register_post_type(
			self::TYPE,
			array(
				'labels'              => array(
					'name'          => __( 'Playlists', 'riff' ),
					'singular_name' => __( 'Playlist', 'riff' ),
					'add_new_item'  => __( 'Add playlist', 'riff' ),
					'edit_item'     => __( 'Edit playlist', 'riff' ),
					'all_items'     => __( 'Playlists', 'riff' ),
				),
				'description'         => __( 'Playlists listeners make in the Listen block.', 'riff' ),
				'public'              => false,
				'show_ui'             => true,
				'show_in_menu'        => 'upload.php',
				'show_in_rest'        => true,
				'exclude_from_search' => true,
				'has_archive'         => false,
				'rewrite'             => false,
				'query_var'           => false,
				'menu_icon'           => 'dashicons-playlist-audio',
				'supports'            => array( 'title', 'editor', 'author' ),
				'capability_type'     => 'post',
				'map_meta_cap'        => true,
				'template'            => array( array( 'core/playlist' ) ),
			)
		);
	}

	/**
	 * Makes a playlist for a user.
	 *
	 * @since 4.20.0
	 *
	 * @param int    $user_id User ID.
	 * @param string $title   Its name.
	 * @param int[]  $tracks  Track IDs, in order.
	 * @return int|WP_Error The playlist's post ID.
	 */
	public static function create( int $user_id, string $title, array $tracks = array() ) {
		$id = wp_insert_post(
			array(
				'post_type'    => self::TYPE,
				'post_status'  => 'private',
				'post_author'  => $user_id,
				'post_title'   => self::title( $title ),
				'post_content' => self::content( self::valid( $tracks ) ),
			),
			true
		);
		return is_wp_error( $id ) ? $id : (int) $id;
	}

	/**
	 * A user's playlists, the most recently changed first, each as summary() has it.
	 *
	 * @since 4.20.0
	 *
	 * @param int $user_id User ID.
	 * @return array[]
	 */
	public static function all( int $user_id ): array {
		if ( $user_id <= 0 ) {
			return array();
		}
		$posts = get_posts(
			array(
				'post_type'        => self::TYPE,
				'post_status'      => array( 'private', 'publish', 'draft' ),
				'author'           => $user_id,
				'posts_per_page'   => 100,
				'orderby'          => array(
					'modified' => 'DESC',
					'ID'       => 'DESC',
				),
				'suppress_filters' => false,
			)
		);
		// Every playlist's first tracks at once, rather than each playlist's in turn.
		$first = array();
		foreach ( $posts as $post ) {
			$first = array_merge( $first, self::first( self::ids( $post ) ) );
		}
		Tracks::prime( $first );
		return array_map( array( self::class, 'summary' ), $posts );
	}

	/**
	 * A playlist in brief: ID, name, how many tracks, and up to four covers for its mosaic.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_Post $post The playlist.
	 * @return array
	 */
	public static function summary( WP_Post $post ): array {
		$ids = self::ids( $post );
		Tracks::prime( self::first( $ids ) );
		$covers = array();
		foreach ( array_unique( $ids ) as $track ) {
			// Covers come from the tracks the requester can see, as the tracks themselves do.
			if ( ! Catalog_Rest::visible( $track ) ) {
				continue;
			}
			$art = Tracks::from_attachment( $track, (int) get_post_field( 'post_parent', $track ) )['art'] ?? array();
			$src = $art ? (string) end( $art )['src'] : '';
			if ( '' !== $src && ! in_array( $src, $covers, true ) ) {
				$covers[] = $src;
			}
			if ( count( $covers ) >= 4 ) {
				break;
			}
		}
		return array(
			'id'       => (int) $post->ID,
			// Its own name; get_the_title() would put "Private:" before it.
			'title'    => (string) $post->post_title,
			'count'    => count( $ids ),
			'covers'   => $covers,
			'modified' => (string) get_post_modified_time( 'c', true, $post ),
		);
	}

	/**
	 * The first of a playlist's tracks, the ones its mosaic is likely to come from.
	 *
	 * @param int[] $ids The playlist's track IDs.
	 * @return int[]
	 */
	private static function first( array $ids ): array {
		return array_slice( array_values( array_unique( $ids ) ), 0, self::COVER_TRACKS );
	}

	/**
	 * A playlist with its tracks, in the track shape, in its order. A track the requester can no
	 * longer see is left out of `tracks` but kept in `ids`, so the playlist's places stay true.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_Post $post The playlist.
	 * @return array
	 */
	public static function detail( WP_Post $post ): array {
		$ids   = self::ids( $post );
		$found = array();
		if ( $ids ) {
			$request = new WP_REST_Request( 'GET', '/' . Library::REST . '/tracks' );
			$request->set_query_params(
				array(
					'include'  => array_values( array_unique( $ids ) ),
					'per_page' => 100,
				)
			);
			foreach ( array_chunk( array_values( array_unique( $ids ) ), 100 ) as $chunk ) {
				$request->set_param( 'include', $chunk );
				$response = rest_do_request( $request );
				foreach ( $response->is_error() ? array() : (array) $response->get_data()['items'] as $track ) {
					$found[ (int) $track['id'] ] = $track;
				}
			}
		}
		$tracks = array();
		foreach ( $ids as $index => $id ) {
			if ( isset( $found[ $id ] ) ) {
				$tracks[] = $found[ $id ] + array( 'index' => $index );
			}
		}
		return self::summary( $post ) + array(
			'ids'    => $ids,
			'tracks' => $tracks,
		);
	}

	/**
	 * A playlist's track IDs, in order, from its Playlist block.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_Post|null $post The playlist.
	 * @return int[]
	 */
	public static function ids( ?WP_Post $post ): array {
		if ( ! $post ) {
			return array();
		}
		foreach ( parse_blocks( $post->post_content ) as $block ) {
			if ( 'core/playlist' === ( $block['blockName'] ?? '' ) ) {
				return array_map( static fn( $track ) => (int) $track['attrs']['id'], Blocks_Source::playlist_tracks( $block ) );
			}
		}
		return array();
	}

	/**
	 * Sets a playlist's tracks, in order.
	 *
	 * @since 4.20.0
	 *
	 * @param int   $id     The playlist's post ID.
	 * @param int[] $tracks Track IDs.
	 */
	public static function set_tracks( int $id, array $tracks ): void {
		self::save( $id, array( 'post_content' => self::content( self::valid( $tracks, self::ids( get_post( $id ) ) ) ) ) );
	}

	/**
	 * Whether a playlist is a user's.
	 *
	 * @since 4.33.0 Public, for the routes.
	 *
	 * @param int $id      Post ID.
	 * @param int $user_id User ID.
	 * @return bool
	 */
	public static function owned( int $id, int $user_id ): bool {
		$post = get_post( $id );
		return $post instanceof WP_Post && self::TYPE === $post->post_type && 'trash' !== $post->post_status && (int) $post->post_author === $user_id && $user_id > 0;
	}

	/**
	 * Renames a playlist.
	 *
	 * @since 4.33.0
	 *
	 * @param int    $id    The playlist's post ID.
	 * @param string $title Its new name.
	 */
	public static function rename( int $id, string $title ): void {
		self::save( $id, array( 'post_title' => self::title( $title ) ) );
	}

	/**
	 * Updates a playlist's post without changing who wrote it.
	 *
	 * @param int   $id     Post ID.
	 * @param array $fields Fields.
	 */
	private static function save( int $id, array $fields ): void {
		wp_update_post( wp_slash( array( 'ID' => $id ) + $fields ) );
	}

	/**
	 * The Playlist block holding these tracks, as the editor saves it.
	 *
	 * @param int[] $tracks Track IDs.
	 * @return string
	 */
	private static function content( array $tracks ): string {
		$inner = array();
		foreach ( $tracks as $track ) {
			$inner[] = array(
				'blockName'    => 'core/playlist-track',
				'attrs'        => array(
					'id'    => $track,
					'src'   => (string) wp_get_attachment_url( $track ),
					'title' => get_the_title( $track ),
				),
				'innerBlocks'  => array(),
				'innerHTML'    => '',
				'innerContent' => array(),
			);
		}
		return serialize_block(
			array(
				'blockName'    => 'core/playlist',
				'attrs'        => array(),
				'innerBlocks'  => $inner,
				'innerHTML'    => '<figure class="wp-block-playlist"><ol class="wp-block-playlist__tracklist"></ol></figure>',
				'innerContent' => array_merge(
					array( '<figure class="wp-block-playlist"><ol class="wp-block-playlist__tracklist">' ),
					array_fill( 0, count( $inner ), null ),
					array( '</ol></figure>' )
				),
			)
		);
	}

	/**
	 * Track IDs that name audio in the Media Library, no more than MAX_TRACKS. A track joins only
	 * if the requester can see it, since the block keeps its title and address, and the playlist's
	 * own post is one its author can read; a track already in the playlist keeps its place.
	 *
	 * @param array $tracks IDs.
	 * @param int[] $kept   IDs already in the playlist.
	 * @return int[]
	 */
	private static function valid( array $tracks, array $kept = array() ): array {
		$ok = array();
		// Each track's file and post in a few queries, not a few for each.
		Tracks::prime( array_map( 'intval', array_slice( $tracks, 0, self::MAX_TRACKS ) ) );
		foreach ( $tracks as $track ) {
			$track = (int) $track;
			if ( $track > 0 && 'attachment' === get_post_type( $track ) && str_starts_with( (string) get_post_mime_type( $track ), 'audio/' ) && ( in_array( $track, $kept, true ) || Catalog_Rest::visible( $track ) ) ) {
				$ok[] = $track;
			}
		}
		return array_slice( $ok, 0, self::MAX_TRACKS );
	}

	/**
	 * A playlist's name: plain text, never empty.
	 *
	 * @param string $title Name given.
	 * @return string
	 */
	private static function title( string $title ): string {
		$title = trim( sanitize_text_field( $title ) );
		return '' !== $title ? mb_substr( $title, 0, 200 ) : __( 'New playlist', 'riff' );
	}
}
