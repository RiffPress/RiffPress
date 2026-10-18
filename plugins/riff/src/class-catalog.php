<?php
/**
 * Albums and artists as taxonomies on the Media Library's audio, filled from each file's tags.
 *
 * @since 4.17.0
 * @package Riff
 */

namespace Riff;

use WP_Post;

defined( 'ABSPATH' ) || exit;

/**
 * The catalogue.
 *
 * WordPress reads a file's album and artist on upload but keeps them in serialized attachment
 * metadata, which nothing can browse or query. Two taxonomies on attachments make them queryable
 * the native way: the Media Library shows them as columns and filters, REST and WP_Query query
 * them, and nothing new is stored beside WordPress's own tables (docs/native.md). Each audio file
 * is filed under its album and artist whenever its metadata is saved, so an upload, an import and
 * an edit all keep it current; a library from before this is filed in the background.
 */
final class Catalog {

	/**
	 * The album taxonomy.
	 *
	 * @since 4.17.0
	 */
	public const ALBUM = 'riff_album';

	/**
	 * The artist taxonomy.
	 *
	 * @since 4.17.0
	 */
	public const ARTIST = 'riff_artist';

	/**
	 * Album term meta: the album's artist, which tells two albums of the same name apart.
	 *
	 * @since 4.17.0
	 */
	public const ALBUM_ARTIST = 'riff_album_artist';

	/**
	 * Attachment meta marking a file already filed, by catalogue version.
	 *
	 * @since 4.17.0
	 */
	public const FILED = '_riff_catalog';

	/**
	 * The version of how files are filed; raising it files every library again.
	 *
	 * @since 4.17.0
	 */
	public const VERSION = 1;

	/**
	 * The background job that files a library from before the catalogue.
	 *
	 * @since 4.17.0
	 */
	public const BACKFILL = 'riff_catalog_backfill';

	/**
	 * Files filed per background run.
	 *
	 * @since 4.17.0
	 */
	public const BATCH = 200;

	/**
	 * Hooks the taxonomies, the filing and the backfill.
	 *
	 * @since 4.17.0
	 */
	public static function register(): void {
		add_action( 'init', array( self::class, 'taxonomies' ) );
		add_filter( 'wp_update_attachment_metadata', array( self::class, 'on_metadata' ), 10, 2 );
		add_action( self::BACKFILL, array( self::class, 'backfill' ) );
		add_action( 'admin_init', array( self::class, 'schedule' ) );
	}

	/**
	 * Registers the two taxonomies on attachments.
	 *
	 * @since 4.17.0
	 */
	public static function taxonomies(): void {
		$shared = array(
			'public'                => false,
			'show_ui'               => true,
			'show_in_menu'          => true,
			'show_admin_column'     => true,
			'show_in_rest'          => true,
			'hierarchical'          => false,
			'query_var'             => false,
			'rewrite'               => false,
			'update_count_callback' => '_update_generic_term_count',
		);
		register_taxonomy(
			self::ALBUM,
			'attachment',
			$shared + array(
				'labels'    => array(
					'name'          => __( 'Albums', 'riff' ),
					'singular_name' => __( 'Album', 'riff' ),
					'search_items'  => __( 'Search albums', 'riff' ),
					'all_items'     => __( 'All albums', 'riff' ),
					'edit_item'     => __( 'Edit album', 'riff' ),
					'not_found'     => __( 'No albums found.', 'riff' ),
					'add_new_item'  => __( 'Add album', 'riff' ),
					'new_item_name' => __( 'New album name', 'riff' ),
					'update_item'   => __( 'Update album', 'riff' ),
					'back_to_items' => __( '&larr; Go to albums', 'riff' ),
				),
				'rest_base' => 'riff_albums',
			)
		);
		register_taxonomy(
			self::ARTIST,
			'attachment',
			$shared + array(
				'labels'    => array(
					'name'          => __( 'Artists', 'riff' ),
					'singular_name' => __( 'Artist', 'riff' ),
					'search_items'  => __( 'Search artists', 'riff' ),
					'all_items'     => __( 'All artists', 'riff' ),
					'edit_item'     => __( 'Edit artist', 'riff' ),
					'not_found'     => __( 'No artists found.', 'riff' ),
					'add_new_item'  => __( 'Add artist', 'riff' ),
					'new_item_name' => __( 'New artist name', 'riff' ),
					'update_item'   => __( 'Update artist', 'riff' ),
					'back_to_items' => __( '&larr; Go to artists', 'riff' ),
				),
				'rest_base' => 'riff_artists',
			)
		);
		register_term_meta(
			self::ALBUM,
			self::ALBUM_ARTIST,
			array(
				'type'         => 'string',
				'single'       => true,
				'show_in_rest' => true,
			)
		);
	}

	/**
	 * Files an audio attachment whenever WordPress saves its metadata, on upload, import or edit.
	 *
	 * @since 4.17.0
	 *
	 * @param mixed $data          Attachment metadata.
	 * @param int   $attachment_id Attachment ID.
	 * @return mixed The metadata, unchanged.
	 */
	public static function on_metadata( $data, $attachment_id ) {
		if ( is_array( $data ) ) {
			self::file( (int) $attachment_id, $data );
		}
		return $data;
	}

	/**
	 * Files one audio attachment under its album and artist, from its tags.
	 *
	 * @since 4.17.0
	 *
	 * @param int        $attachment_id Attachment ID.
	 * @param array|null $meta          Its metadata, when the caller has it; read otherwise.
	 */
	public static function file( int $attachment_id, ?array $meta = null ): void {
		$post = get_post( $attachment_id );
		if ( ! $post instanceof WP_Post || 'attachment' !== $post->post_type || ! str_starts_with( (string) $post->post_mime_type, 'audio/' ) ) {
			return;
		}
		$meta   = $meta ?? wp_get_attachment_metadata( $attachment_id );
		$meta   = is_array( $meta ) ? $meta : array();
		$artist = self::tag( $meta, 'artist' );
		$album  = self::tag( $meta, 'album' );
		// The album's own artist when the file names one (the band tag), else the track's.
		$by = self::tag( $meta, 'band' );
		$by = '' !== $by ? $by : $artist;

		wp_set_object_terms( $attachment_id, '' !== $artist ? array( $artist ) : array(), self::ARTIST );
		$album_term = 0;
		if ( '' !== $album ) {
			$album_term = self::album_term( $album, $by );
		}
		wp_set_object_terms( $attachment_id, $album_term ? array( $album_term ) : array(), self::ALBUM );
		update_post_meta( $attachment_id, self::FILED, self::VERSION );
	}

	/**
	 * One tag from attachment metadata, trimmed.
	 *
	 * @param array  $meta Metadata.
	 * @param string $key  Tag.
	 * @return string
	 */
	private static function tag( array $meta, string $key ): string {
		$value = $meta[ $key ] ?? '';
		return is_scalar( $value ) ? trim( (string) $value ) : '';
	}

	/**
	 * The term for an album by an artist, made when it does not exist yet. Two albums with the same
	 * name by different artists are different terms.
	 *
	 * @param string $album  Album name.
	 * @param string $artist The album's artist, or empty.
	 * @return int Term ID, or 0.
	 */
	private static function album_term( string $album, string $artist ): int {
		$slug  = sanitize_title( '' !== $artist ? $album . '-' . $artist : $album );
		$found = get_term_by( 'slug', $slug, self::ALBUM );
		if ( $found ) {
			$term_id = (int) $found->term_id;
		} else {
			$made = wp_insert_term( $album, self::ALBUM, array( 'slug' => $slug ) );
			if ( is_wp_error( $made ) ) {
				$existing = $made->get_error_data( 'term_exists' );
				$term_id  = is_numeric( $existing ) ? (int) $existing : 0;
			} else {
				$term_id = (int) $made['term_id'];
			}
		}
		// The artist is noted however the term came about, so an album first made some other way
		// still says whose it is.
		if ( $term_id && '' !== $artist && '' === (string) get_term_meta( $term_id, self::ALBUM_ARTIST, true ) ) {
			update_term_meta( $term_id, self::ALBUM_ARTIST, $artist );
		}
		return $term_id;
	}

	/**
	 * Schedules the background filing while any audio is not filed at this version.
	 *
	 * @since 4.17.0
	 */
	public static function schedule(): void {
		if ( (int) get_option( self::BACKFILL ) < self::VERSION && ! wp_next_scheduled( self::BACKFILL ) ) {
			wp_schedule_single_event( time(), self::BACKFILL );
		}
	}

	/**
	 * Files a batch of audio not yet filed at this version, and runs again until none are left.
	 *
	 * @since 4.17.0
	 *
	 * @param int $limit How many to file; the batch size by default.
	 * @return int How many were filed.
	 */
	public static function backfill( int $limit = self::BATCH ): int {
		$ids = get_posts(
			array(
				'post_type'        => 'attachment',
				'post_mime_type'   => 'audio',
				'post_status'      => 'any',
				'fields'           => 'ids',
				'posts_per_page'   => $limit,
				'no_found_rows'    => true,
				'orderby'          => 'ID',
				'order'            => 'ASC',
				'suppress_filters' => true,
				// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- a background job over files not filed yet.
				'meta_query'       => array(
					'relation' => 'OR',
					array(
						'key'     => self::FILED,
						'compare' => 'NOT EXISTS',
					),
					array(
						'key'     => self::FILED,
						'value'   => self::VERSION,
						'compare' => '<',
						'type'    => 'NUMERIC',
					),
				),
			)
		);
		foreach ( $ids as $id ) {
			self::file( (int) $id );
		}
		if ( count( $ids ) < $limit ) {
			update_option( self::BACKFILL, self::VERSION, false );
		} elseif ( ! wp_next_scheduled( self::BACKFILL ) ) {
			wp_schedule_single_event( time() + 30, self::BACKFILL );
		}
		return count( $ids );
	}
}
