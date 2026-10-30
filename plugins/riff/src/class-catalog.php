<?php
/**
 * Albums and artists as taxonomies on the Media Library's audio, filled from each file's tags.
 *
 * @since 4.16.0
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
	 * @since 4.16.0
	 */
	public const ALBUM = 'riff_album';

	/**
	 * The artist taxonomy.
	 *
	 * @since 4.16.0
	 */
	public const ARTIST = 'riff_artist';

	/**
	 * Album term meta: the album's artist, which tells two albums of the same name apart.
	 *
	 * @since 4.16.0
	 */
	public const ALBUM_ARTIST = 'riff_album_artist';

	/**
	 * Term meta on an artist: the image in the Media Library that heads their page.
	 *
	 * @since 4.19.0
	 */
	public const ARTIST_IMAGE = 'riff_artist_image';

	/**
	 * Attachment meta marking a file already filed, by catalogue version.
	 *
	 * @since 4.16.0
	 */
	public const FILED = '_riff_catalog';

	/**
	 * The version of how files are filed; raising it files every library again.
	 *
	 * @since 4.16.0
	 */
	public const VERSION = 2;

	/**
	 * The background job that files a library from before the catalogue.
	 *
	 * @since 4.16.0
	 */
	public const BACKFILL = 'riff_catalog_backfill';

	/**
	 * The option holding how far the backfill has walked the library, by ID, and at which version,
	 * so each batch starts where the last stopped rather than looking again at what it filed.
	 *
	 * @since 5.7.0
	 */
	public const BACKFILL_FROM = 'riff_catalog_backfill_from';

	/**
	 * Files filed per background run.
	 *
	 * @since 4.16.0
	 */
	public const BATCH = 200;

	/**
	 * Hooks the taxonomies, the filing and the backfill.
	 *
	 * @since 4.16.0
	 */
	public static function register(): void {
		add_action( 'init', array( self::class, 'taxonomies' ) );
		add_filter( 'wp_update_attachment_metadata', array( self::class, 'on_metadata' ), 10, 2 );
		add_action( self::BACKFILL, array( self::class, 'backfill' ) );
		add_action( 'admin_init', array( self::class, 'schedule' ) );
		add_filter( 'rest_pre_dispatch', array( self::class, 'guard_rest' ), 10, 3 );
	}

	/**
	 * Keeps WordPress's own term routes for the two taxonomies to people who can upload files.
	 *
	 * Core lists every term of a taxonomy in REST to anyone, and an album or artist name can be
	 * private: a file on a draft still has its tags. The Media Library and the block editor reach
	 * the terms through these routes as someone who can upload; everyone else reads albums and
	 * artists through riff/v1, which shows only what is published.
	 *
	 * @since 4.16.0
	 *
	 * @param mixed            $result  A response already decided, or null.
	 * @param \WP_REST_Server  $server  Server.
	 * @param \WP_REST_Request $request Request.
	 * @return mixed
	 */
	public static function guard_rest( $result, $server, $request ) {
		unset( $server );
		if ( null === $result && preg_match( '#^/wp/v2/riff_(albums|artists)(/|$)#', (string) $request->get_route() ) && ! current_user_can( 'upload_files' ) ) {
			return new \WP_Error( 'rest_forbidden', __( 'Albums and artists are listed through riff/v1.', 'riff' ), array( 'status' => rest_authorization_required_code() ) );
		}
		return $result;
	}

	/**
	 * Registers the two taxonomies on attachments.
	 *
	 * @since 4.16.0
	 */
	public static function taxonomies(): void {
		$shared = array(
			'public'                => false,
			'show_ui'               => true,
			'show_in_menu'          => true,
			'show_admin_column'     => true,
			'show_in_rest'          => true,
			'hierarchical'          => false,
			// No box on a track's edit screen: core's tag box splits names on commas, and saves
			// after the Metadata box, so "Blues Queens, 1920-1925" would become two albums. The
			// Metadata box's Artist and Album file the track instead.
			'meta_box_cb'           => false,
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
			self::ARTIST,
			self::ARTIST_IMAGE,
			array(
				'type'              => 'integer',
				'single'            => true,
				'show_in_rest'      => true,
				'sanitize_callback' => 'absint',
				'auth_callback'     => static fn() => current_user_can( 'upload_files' ),
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
	 * @since 4.16.0
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
	 * @since 4.16.0
	 *
	 * @param int        $attachment_id Attachment ID.
	 * @param array|null $meta          Its metadata, when the caller has it; read otherwise.
	 */
	public static function file( int $attachment_id, ?array $meta = null ): void {
		$post = get_post( $attachment_id );
		if ( ! $post instanceof WP_Post || 'attachment' !== $post->post_type || ! str_starts_with( (string) $post->post_mime_type, 'audio/' ) ) {
			return;
		}
		$meta = $meta ?? wp_get_attachment_metadata( $attachment_id );
		$meta = is_array( $meta ) ? $meta : array();
		// Another song's streaming version is the same music, not a track of its own.
		if ( Media::streamed( $attachment_id ) ) {
			$meta = array();
		}
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
	 * One tag from attachment metadata, trimmed, as a term name WordPress keeps whole.
	 *
	 * A term's name goes through core's `pre_term_name` filters, which strip anything that looks
	 * like a markup tag, so an artist tagged `AC/DC & <Friends>` would be filed as `AC/DC &`. The
	 * angle brackets are handed over as entities instead, the way core stores an ampersand, and
	 * the name decodes back to the whole tag wherever it is read.
	 *
	 * @param array  $meta Metadata.
	 * @param string $key  Tag.
	 * @return string
	 */
	private static function tag( array $meta, string $key ): string {
		$value = $meta[ $key ] ?? '';
		return is_scalar( $value ) ? str_replace( array( '<', '>' ), array( '&lt;', '&gt;' ), trim( (string) $value ) ) : '';
	}

	/**
	 * A slug from a name that may hold entities: `sanitize_title()` strips what looks like a tag and
	 * drops everything from a bare ampersand to the next semicolon, so `<Untitled> & Other Songs`
	 * would come out as `other-songs`. The brackets and ampersands become spaces first; a name
	 * without them gets the slug it always had.
	 *
	 * @param string $name Name, as `tag()` returns it.
	 * @return string
	 */
	private static function slug( string $name ): string {
		return sanitize_title( str_replace( array( '<', '>', '&' ), ' ', self::name( $name ) ) );
	}

	/**
	 * A term's name as text: the tag it was filed from, with core's entities decoded, so it reads
	 * the same as the artist and album on the track rows.
	 *
	 * @since 4.32.0
	 *
	 * @param string $name Term name as stored.
	 * @return string
	 */
	public static function name( string $name ): string {
		return html_entity_decode( $name, ENT_QUOTES, 'UTF-8' );
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
		$slug  = self::slug( '' !== $artist ? $album . '-' . $artist : $album );
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
	 * @since 4.16.0
	 */
	public static function schedule(): void {
		if ( ! self::filed() && ! wp_next_scheduled( self::BACKFILL ) ) {
			wp_schedule_single_event( time(), self::BACKFILL );
		}
	}

	/**
	 * Files the next batch of audio, by ID from where the last batch stopped, skipping what is
	 * already filed at this version, and runs again until it reaches the end of the library.
	 *
	 * @since 4.16.0
	 * @since 5.7.0 From where the last batch stopped, rather than looking for what is not filed.
	 *
	 * @param int $limit How many files to look at; the batch size by default.
	 * @return int How many were filed.
	 */
	public static function backfill( int $limit = self::BATCH ): int {
		global $wpdb;
		$from  = get_option( self::BACKFILL_FROM );
		$after = is_array( $from ) && self::VERSION === (int) ( $from['version'] ?? 0 ) ? (int) ( $from['after'] ?? 0 ) : 0;
		// By the primary key, so a batch costs the same at the end of a large library as at the
		// start; a query for what is not filed yet would read past everything filed before it.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- a background job, walking the library by ID.
		$ids = array_map( 'intval', (array) $wpdb->get_col( $wpdb->prepare( "SELECT ID FROM {$wpdb->posts} WHERE post_type = 'attachment' AND post_mime_type LIKE %s AND post_status NOT IN ( 'trash', 'auto-draft' ) AND ID > %d ORDER BY ID ASC LIMIT %d", 'audio/%', $after, $limit ) ) );
		// The batch's posts and metadata at once, and its albums and artists counted once, at the end.
		_prime_post_caches( $ids, false, false );
		update_meta_cache( 'post', $ids );
		$counting = ! wp_defer_term_counting();
		if ( $counting ) {
			wp_defer_term_counting( true );
		}
		$filed = 0;
		try {
			foreach ( $ids as $id ) {
				if ( (int) get_post_meta( $id, self::FILED, true ) < self::VERSION ) {
					self::file( $id );
					++$filed;
				}
			}
		} finally {
			if ( $counting ) {
				wp_defer_term_counting( false );
			}
		}
		if ( count( $ids ) < $limit ) {
			update_option( self::BACKFILL, self::VERSION, false );
			delete_option( self::BACKFILL_FROM );
		} else {
			update_option(
				self::BACKFILL_FROM,
				array(
					'version' => self::VERSION,
					'after'   => (int) end( $ids ),
				),
				false
			);
			if ( ! wp_next_scheduled( self::BACKFILL ) ) {
				wp_schedule_single_event( time() + 30, self::BACKFILL );
			}
		}
		return $filed;
	}

	/**
	 * Whether the library is filed at this version.
	 *
	 * @since 5.7.0
	 *
	 * @return bool
	 */
	public static function filed(): bool {
		return (int) get_option( self::BACKFILL ) >= self::VERSION;
	}
}
