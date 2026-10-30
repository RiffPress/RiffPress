<?php
/**
 * Imports folders of music into the Media Library, the way an upload through it would.
 *
 * @since 4.16.0
 * @package Riff
 */

namespace Riff;

use WP_Error;

defined( 'ABSPATH' ) || exit;

/**
 * Folder import.
 *
 * Every file goes through core's own sideload, so WordPress reads its tags, its length and its
 * embedded artwork exactly as it does for an upload. Each folder that holds audio is one album: its
 * tracks become attachments, and a post with one audio block per track publishes them. A cover
 * image in the folder becomes the album's artwork, and a video with the same name as a track
 * becomes that track's video version. Running it again skips every file it has already imported.
 */
final class Import {

	/**
	 * Audio files an album is made of.
	 *
	 * @since 4.16.0
	 */
	public const AUDIO = '/\.(mp3|m4a|flac|ogg|oga|opus|wav)$/i';

	/**
	 * Videos that can be a track's video version.
	 *
	 * @since 4.16.0
	 */
	public const VIDEO = '/\.(mp4|m4v|webm|mov)$/i';

	/**
	 * A folder's cover image, in the order they are looked for.
	 *
	 * @since 4.16.0
	 */
	public const COVERS = array( 'cover', 'folder', 'front', 'album' );

	/**
	 * Attachment meta holding a hash of the imported file, so a second run finds it.
	 *
	 * @since 4.16.0
	 */
	public const HASH = '_riff_import_hash';

	/**
	 * Post meta naming the folder an album post was made from, so a second run adds to it.
	 *
	 * @since 4.16.0
	 */
	public const FOLDER = '_riff_import_folder';

	/**
	 * Imports a folder, and every folder inside it that holds audio, as albums.
	 *
	 * @since 4.16.0
	 *
	 * @param string $dir  A folder on the server.
	 * @param array  $args {
	 *     Optional.
	 *
	 *     @type string $status  Status for new album posts. Default 'publish'.
	 *     @type bool   $dry_run Report what would be imported without importing it. Default false.
	 * }
	 * @return array{albums: array<int, array{folder: string, post: int, imported: string[], skipped: string[], failed: array<string, string>}>}|WP_Error
	 */
	public static function folder( string $dir, array $args = array() ) {
		$dir = realpath( $dir );
		if ( ! $dir || ! is_dir( $dir ) || ! is_readable( $dir ) ) {
			return new WP_Error( 'riff_import_folder', __( 'That folder does not exist or cannot be read.', 'riff' ) );
		}
		$args = wp_parse_args(
			$args,
			array(
				'status'  => 'publish',
				'dry_run' => false,
			)
		);

		require_once ABSPATH . 'wp-admin/includes/media.php';
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/image.php';

		// Every file imported before, by its contents, read once for the run rather than looked up
		// for each file, which grows slower with every file a library has.
		$known = self::imported();
		// Each album's terms are counted once, at the end, rather than again for every track filed.
		$counting = ! wp_defer_term_counting();
		if ( $counting ) {
			wp_defer_term_counting( true );
		}
		$albums = array();
		try {
			foreach ( self::album_folders( $dir ) as $folder ) {
				$albums[] = self::album( $folder, $args, $known );
				// What WordPress keeps in memory of each album's posts, which a run of thousands of
				// files would otherwise hold to its end.
				wp_cache_flush_runtime();
			}
		} finally {
			if ( $counting ) {
				wp_defer_term_counting( false );
			}
		}
		return array( 'albums' => $albums );
	}

	/**
	 * Every file imported before, as its hash and the attachment it became.
	 *
	 * @return array<string, int>
	 */
	private static function imported(): array {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- once a run, every hash at once.
		$rows  = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT m.meta_value, m.post_id FROM {$wpdb->postmeta} m INNER JOIN {$wpdb->posts} p ON p.ID = m.post_id WHERE m.meta_key = %s AND p.post_type = 'attachment' AND p.post_status NOT IN ( 'trash', 'auto-draft' )",
				self::HASH
			)
		);
		$known = array();
		foreach ( (array) $rows as $row ) {
			if ( '' !== (string) $row->meta_value ) {
				$known[ (string) $row->meta_value ] = (int) $row->post_id;
			}
		}
		return $known;
	}

	/**
	 * The folder and every folder under it that holds at least one audio file, in name order.
	 *
	 * @param string $dir Folder.
	 * @return string[]
	 */
	private static function album_folders( string $dir ): array {
		$found = array();
		$files = scandir( $dir );
		$files = is_array( $files ) ? $files : array();
		if ( preg_grep( self::AUDIO, $files ) ) {
			$found[] = $dir;
		}
		foreach ( $files as $name ) {
			if ( '.' !== $name[0] && is_dir( $dir . '/' . $name ) ) {
				$found = array_merge( $found, self::album_folders( $dir . '/' . $name ) );
			}
		}
		return $found;
	}

	/**
	 * Imports one album folder.
	 *
	 * @param string $dir   Folder.
	 * @param array  $args  Arguments from folder().
	 * @param array  $known Files imported before, from imported(), with each file this one adds.
	 * @return array{folder: string, post: int, imported: string[], skipped: string[], failed: array<string, string>}
	 */
	private static function album( string $dir, array $args, array &$known ): array {
		$report = array(
			'folder'   => $dir,
			'post'     => 0,
			'imported' => array(),
			'skipped'  => array(),
			'failed'   => array(),
		);
		$files  = scandir( $dir );
		$files  = is_array( $files ) ? array_values( array_filter( $files, static fn( $f ) => is_file( $dir . '/' . $f ) ) ) : array();
		$audio  = array_values( preg_grep( self::AUDIO, $files ) );
		$video  = array_values( preg_grep( self::VIDEO, $files ) );
		sort( $audio );

		if ( $args['dry_run'] ) {
			foreach ( $audio as $file ) {
				$report[ self::existing( self::hash( $dir . '/' . $file ), $known ) ? 'skipped' : 'imported' ][] = $file;
			}
			return $report;
		}

		// Core lists m4a as audio/mpeg and then refuses a real AAC file, which is audio/mp4, and
		// does not list opus at all. Both are common in music libraries, so for the length of an
		// import they are allowed as what they are (docs/native.md).
		$mimes = static fn( array $types ): array => array_merge(
			$types,
			array(
				'm4a'  => 'audio/mp4',
				'opus' => 'audio/ogg',
			)
		);
		add_filter( 'upload_mimes', $mimes );

		$cover = self::cover( $dir, $files, $known );
		$ids   = array();
		foreach ( $audio as $file ) {
			$path = $dir . '/' . $file;
			$hash = self::hash( $path );
			if ( self::existing( $hash, $known ) ) {
				$report['skipped'][] = $file;
				continue;
			}
			$id = self::sideload( $path, $hash, $known );
			if ( is_wp_error( $id ) ) {
				$report['failed'][ $file ] = $id->get_error_message();
				continue;
			}
			self::title_from_tags( $id, $path );
			if ( $cover && ! has_post_thumbnail( $id ) ) {
				set_post_thumbnail( $id, $cover );
			}
			self::pair_video( $id, $dir, $file, $video, $cover, $known );
			$ids[]                = $id;
			$report['imported'][] = $file;
		}
		remove_filter( 'upload_mimes', $mimes );

		$report['post'] = self::post( $dir, $ids, $cover, (string) $args['status'] );
		return $report;
	}

	/**
	 * A file's contents as a hash, read once for each file, or empty when it can't be read.
	 *
	 * @param string $path File.
	 * @return string
	 */
	private static function hash( string $path ): string {
		return (string) sha1_file( $path );
	}

	/**
	 * The attachment already imported from a file with these contents, if any.
	 *
	 * @param string $hash  The file's hash, from hash().
	 * @param array  $known Files imported before, from imported().
	 * @return int Attachment ID, or 0.
	 */
	private static function existing( string $hash, array $known ): int {
		return '' !== $hash ? (int) ( $known[ $hash ] ?? 0 ) : 0;
	}

	/**
	 * Adds a file to the Media Library through core's sideload, from a copy so the original stays,
	 * and to the files imported before, so the same file later in the run is found.
	 *
	 * @param string $path  File.
	 * @param string $hash  Its hash, from hash().
	 * @param array  $known Files imported before, from imported().
	 * @return int|WP_Error Attachment ID.
	 */
	private static function sideload( string $path, string $hash, array &$known ) {
		$tmp = wp_tempnam( basename( $path ) );
		if ( ! $tmp || ! copy( $path, $tmp ) ) {
			return new WP_Error( 'riff_import_copy', __( 'The file could not be copied for upload.', 'riff' ) );
		}
		$id = media_handle_sideload(
			array(
				'name'     => basename( $path ),
				'tmp_name' => $tmp,
			),
			0
		);
		if ( is_wp_error( $id ) ) {
			wp_delete_file( $tmp );
			return $id;
		}
		if ( '' !== $hash ) {
			update_post_meta( (int) $id, self::HASH, $hash );
			$known[ $hash ] = (int) $id;
		}
		return (int) $id;
	}

	/**
	 * Titles a track from its tags, as an upload through the Media Library is; a sideload names it
	 * after the file. The tags as the sideload read them into the attachment's metadata, not read
	 * from the file again. Without a title tag, "03 - Title [id].mp3" becomes "Title".
	 *
	 * @param int    $id   Attachment ID.
	 * @param string $path File.
	 */
	private static function title_from_tags( int $id, string $path ): void {
		$tags  = wp_get_attachment_metadata( $id );
		$title = is_array( $tags ) ? trim( (string) ( $tags['title'] ?? '' ) ) : '';
		if ( '' === $title ) {
			$title = (string) preg_replace( '/^\d+\s*[-.]\s*|\s*\[[^\]]*\]$/', '', pathinfo( $path, PATHINFO_FILENAME ) );
		}
		wp_update_post(
			array(
				'ID'         => $id,
				'post_title' => trim( $title ),
			)
		);
	}

	/**
	 * The folder's cover image, imported once, or 0.
	 *
	 * @param string   $dir   Folder.
	 * @param string[] $files Its files.
	 * @param array    $known Files imported before, from imported().
	 * @return int Attachment ID, or 0.
	 */
	private static function cover( string $dir, array $files, array &$known ): int {
		foreach ( self::COVERS as $stem ) {
			foreach ( $files as $file ) {
				if ( preg_match( '/^' . $stem . '\.(jpe?g|png|webp)$/i', $file ) ) {
					$path = $dir . '/' . $file;
					$hash = self::hash( $path );
					$id   = self::existing( $hash, $known );
					if ( ! $id ) {
						$id = self::sideload( $path, $hash, $known );
					}
					return is_wp_error( $id ) ? 0 : (int) $id;
				}
			}
		}
		return 0;
	}

	/**
	 * Makes a video with the same name as the track its video version.
	 *
	 * @param int      $id    Track attachment ID.
	 * @param string   $dir   Folder.
	 * @param string   $file  Track file name.
	 * @param string[] $video Video file names in the folder.
	 * @param int      $cover Cover attachment ID, or 0.
	 * @param array    $known Files imported before, from imported().
	 */
	private static function pair_video( int $id, string $dir, string $file, array $video, int $cover, array &$known ): void {
		$stem = pathinfo( $file, PATHINFO_FILENAME );
		foreach ( $video as $clip ) {
			if ( pathinfo( $clip, PATHINFO_FILENAME ) !== $stem ) {
				continue;
			}
			$path     = $dir . '/' . $clip;
			$hash     = self::hash( $path );
			$video_id = self::existing( $hash, $known );
			if ( ! $video_id ) {
				$video_id = self::sideload( $path, $hash, $known );
			}
			if ( is_wp_error( $video_id ) || ! $video_id ) {
				return;
			}
			wp_update_post(
				array(
					'ID'         => $video_id,
					'post_title' => get_the_title( $id ),
				)
			);
			if ( $cover && ! has_post_thumbnail( $video_id ) ) {
				set_post_thumbnail( $video_id, $cover );
			}
			update_post_meta( $id, Media::VIDEO_META, $video_id );
			return;
		}
	}

	/**
	 * The album's post: made with one audio block per track, or, when this folder was imported
	 * before, the new tracks added to the end of it.
	 *
	 * @param string $dir    Folder.
	 * @param int[]  $ids    Tracks imported this time, in order.
	 * @param int    $cover  Cover attachment ID, or 0.
	 * @param string $status Status for a new post.
	 * @return int Post ID, or 0 when there was nothing to publish.
	 */
	private static function post( string $dir, array $ids, int $cover, string $status ): int {
		$found   = get_posts(
			array(
				'post_type'      => 'post',
				'post_status'    => 'any',
				'fields'         => 'ids',
				'posts_per_page' => 1,
				'no_found_rows'  => true,
				// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- one lookup per album, only while importing.
				'meta_query'     => array(
					array(
						'key'   => self::FOLDER,
						'value' => $dir,
					),
				),
			)
		);
		$post_id = $found ? (int) $found[0] : 0;
		if ( ! $ids ) {
			return $post_id;
		}
		$ids    = self::in_track_order( $ids );
		$blocks = implode( '', array_map( array( self::class, 'block' ), $ids ) );
		if ( $post_id ) {
			wp_update_post(
				array(
					'ID'           => $post_id,
					'post_content' => get_post_field( 'post_content', $post_id, 'raw' ) . $blocks,
				)
			);
			return $post_id;
		}
		$meta    = wp_get_attachment_metadata( $ids[0] );
		$album   = is_array( $meta ) ? trim( (string) ( $meta['album'] ?? '' ) ) : '';
		$post_id = wp_insert_post(
			array(
				'post_title'   => '' !== $album ? $album : ucwords( str_replace( array( '-', '_' ), ' ', basename( $dir ) ) ),
				'post_status'  => in_array( $status, array( 'publish', 'draft', 'private' ), true ) ? $status : 'publish',
				'post_content' => $blocks,
			),
			true
		);
		if ( is_wp_error( $post_id ) ) {
			return 0;
		}
		update_post_meta( $post_id, self::FOLDER, $dir );
		$art = $cover ? $cover : (int) get_post_thumbnail_id( $ids[0] );
		if ( $art ) {
			set_post_thumbnail( $post_id, $art );
		}
		foreach ( $ids as $id ) {
			wp_update_post(
				array(
					'ID'          => $id,
					'post_parent' => $post_id,
				)
			);
		}
		return $post_id;
	}

	/**
	 * Tracks in the order the album plays: by track number when the tags have one, then by file.
	 *
	 * @param int[] $ids Attachment IDs, in file order.
	 * @return int[]
	 */
	private static function in_track_order( array $ids ): array {
		$number = static function ( int $id ): int {
			$meta = wp_get_attachment_metadata( $id );
			return is_array( $meta ) && isset( $meta['track_number'] ) ? (int) $meta['track_number'] : PHP_INT_MAX;
		};
		$order  = array_flip( $ids );
		usort( $ids, static fn( $a, $b ) => array( $number( $a ), $order[ $a ] ) <=> array( $number( $b ), $order[ $b ] ) );
		return $ids;
	}

	/**
	 * A core audio block for a track, as the editor saves it.
	 *
	 * @param int $id Attachment ID.
	 * @return string
	 */
	private static function block( int $id ): string {
		return sprintf(
			'<!-- wp:audio {"id":%1$d} --><figure class="wp-block-audio"><audio controls src="%2$s"></audio></figure><!-- /wp:audio -->',
			$id,
			esc_url( (string) wp_get_attachment_url( $id ) )
		);
	}
}
