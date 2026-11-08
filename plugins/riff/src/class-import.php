<?php
/**
 * Imports folders of music into the Media Library, the way an upload through it would.
 *
 * @since 4.16.0
 * @package Riff
 */

namespace Riff;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

defined( 'ABSPATH' ) || exit;

/**
 * Folder import.
 *
 * Every file goes through core's own sideload, so WordPress reads its tags, its length and its
 * embedded artwork exactly as it does for an upload. Each folder that holds audio is one album: its
 * tracks become attachments, and a post with one audio block per track publishes them. A cover
 * image in the folder becomes the album's artwork, and a video with the same name as a track
 * becomes that track's video version. Running it again skips every file it has already imported.
 *
 * A zip of an album, or of a folder of albums, is unpacked by core's unzip_file() into a folder of
 * its own and imported the same way, whether it is given to `wp riff import` or uploaded to the
 * Media Library.
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
	 * The background job that imports a zip uploaded to the Media Library, by its attachment ID.
	 *
	 * @since 5.9.0
	 */
	public const ZIP_JOB = 'riff_import_zip';

	/**
	 * How many times its own size a zip may unpack to. Music hardly compresses, so a real album
	 * unpacks to little more than it holds; a zip that unpacks to far more is built to fill a disk.
	 *
	 * @since 5.9.0
	 */
	public const ZIP_RATIO = 10;

	/**
	 * Hooks the import of a zip uploaded to the Media Library.
	 *
	 * @since 5.9.0
	 */
	public static function register(): void {
		// Before multisite's own check at 10, so a network's list of allowed files has the last word.
		add_filter( 'upload_mimes', array( self::class, 'mimes' ), 5 );
		add_action( 'add_attachment', array( self::class, 'on_upload' ) );
		add_action( self::ZIP_JOB, array( self::class, 'uploaded_zip' ) );
		add_action( 'rest_api_init', array( self::class, 'routes' ) );
	}

	/**
	 * Registers POST /riff/v1/imports.
	 *
	 * @since 6.5.0
	 */
	public static function routes(): void {
		/**
		 * POST /riff/v1/imports: imports a zip already in the Media Library, as uploading it there
		 * does: in the background, into draft album posts for its uploader to publish. For a zip
		 * uploaded somewhere that did not start the import, such as over REST by an assistant.
		 *
		 * @since 6.5.0
		 */
		register_rest_route(
			Library::REST,
			'/imports',
			array(
				array(
					'methods'             => 'POST',
					'callback'            => array( self::class, 'rest_queue' ),
					'permission_callback' => static fn( WP_REST_Request $request ) => self::may_queue( (int) $request['attachment'] ),
					'args'                => array(
						'attachment' => array(
							'description' => __( 'The zip\'s attachment ID, in the Media Library and attached to no post.', 'riff' ),
							'type'        => 'integer',
							'minimum'     => 1,
							'required'    => true,
						),
					),
				),
				'schema' => array( self::class, 'queued_schema' ),
			)
		);
	}

	/**
	 * The schema of POST /imports.
	 *
	 * @since 6.5.0
	 *
	 * @return array JSON Schema.
	 */
	public static function queued_schema(): array {
		return array(
			'$schema'    => 'http://json-schema.org/draft-04/schema#',
			'title'      => 'riff-import',
			'type'       => 'object',
			'properties' => array(
				'attachment' => array(
					'type'        => 'integer',
					'description' => __( 'The zip\'s attachment ID.', 'riff' ),
				),
				'queued'     => array(
					'type'        => 'integer',
					'description' => __( 'When the import starts, as a Unix time. Its album posts are drafts by the zip\'s uploader; the zip is attached to the first once it is done.', 'riff' ),
				),
			),
		);
	}

	/**
	 * Whether the current user may import a zip: someone who can write posts, and edit the zip.
	 *
	 * @since 6.5.0
	 *
	 * @param int $id Attachment ID.
	 * @return true|WP_Error
	 */
	public static function may_queue( int $id ) {
		if ( ! current_user_can( 'edit_posts' ) || ( $id && get_post( $id ) && ! current_user_can( 'edit_post', $id ) ) ) {
			return new WP_Error( 'rest_forbidden', __( 'Sorry, you are not allowed to import music on this site.', 'riff' ), array( 'status' => rest_authorization_required_code() ) );
		}
		return true;
	}

	/**
	 * POST /imports.
	 *
	 * @since 6.5.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_queue( WP_REST_Request $request ) {
		$id   = (int) $request['attachment'];
		$post = get_post( $id );
		if ( ! $post || 'attachment' !== $post->post_type || ! self::is_zip( $id ) ) {
			return new WP_Error( 'riff_import_zip', __( 'That is not a zip in the Media Library.', 'riff' ), array( 'status' => 400 ) );
		}
		if ( 0 !== (int) $post->post_parent ) {
			return new WP_Error( 'riff_import_zip', __( 'That zip is attached to a post: it has been imported, or is a download on that post.', 'riff' ), array( 'status' => 409 ) );
		}
		return new WP_REST_Response(
			array(
				'attachment' => $id,
				'queued'     => self::queue( $id ),
			),
			202
		);
	}

	/**
	 * Queues a zip in the Media Library to be imported in the background, once.
	 *
	 * @since 6.5.0
	 *
	 * @param int $id Attachment ID.
	 * @return int When it runs, as a Unix time.
	 */
	public static function queue( int $id ): int {
		$at = wp_next_scheduled( self::ZIP_JOB, array( $id ) );
		if ( $at ) {
			return (int) $at;
		}
		$at = time();
		wp_schedule_single_event( $at, self::ZIP_JOB, array( $id ) );
		return $at;
	}

	/**
	 * Core lists m4a as audio/mpeg and then refuses a real AAC file, which is audio/mp4, and does not
	 * list opus at all. Both are common in music libraries, so they are allowed as what they are
	 * (docs/native.md).
	 *
	 * @since 6.3.0
	 *
	 * @param array $types Allowed types, by extension.
	 * @return array
	 */
	public static function mimes( $types ): array {
		return array_merge(
			(array) $types,
			array(
				'm4a'  => 'audio/mp4',
				'opus' => 'audio/ogg',
			)
		);
	}

	/**
	 * Queues a zip uploaded to the Media Library, by someone who can write posts, to be imported.
	 *
	 * Only a zip attached to no post: one uploaded to a post, as a File block's download, is
	 * attached to that post and left as it is. The import runs in the background, given as long
	 * as it takes, since an album can take longer to add than an upload is given.
	 *
	 * @since 5.9.0
	 *
	 * @param int $id Attachment ID.
	 */
	public static function on_upload( int $id ): void {
		$post = get_post( $id );
		if ( ! $post || 0 !== (int) $post->post_parent || ! self::is_zip( $id ) || ! current_user_can( 'edit_posts' ) ) {
			return;
		}
		self::queue( $id );
	}

	/**
	 * Imports a zip uploaded to the Media Library, as the person who uploaded it, into draft album
	 * posts for them to publish. The zip stays in the Media Library, attached to its album's post,
	 * so the Media Library shows where it went; one that holds no audio stays as it was. Its
	 * albums are its own, found by the zip's attachment, so a zip uploaded again, as a new file,
	 * skips the tracks already imported and puts any new ones in a draft of their own, and never
	 * adds to a post its uploader did not make.
	 *
	 * @since 5.9.0
	 *
	 * @param int $id Attachment ID.
	 * @return array|WP_Error|null The import's report, as zip() gives it, or null when there was nothing to import.
	 */
	public static function uploaded_zip( int $id ) {
		$post = get_post( $id );
		if ( ! $post || 'attachment' !== $post->post_type || 0 !== (int) $post->post_parent || ! self::is_zip( $id ) ) {
			return null;
		}
		$author = (int) $post->post_author;
		$file   = get_attached_file( $id );
		if ( ! $author || ! user_can( $author, 'edit_posts' ) || ! $file ) {
			return null;
		}
		// The upload's own time limit would end an album part way, with no post for its tracks.
		if ( function_exists( 'set_time_limit' ) ) {
			set_time_limit( 0 ); // phpcs:ignore Squiz.PHP.DiscouragedFunctions.Discouraged -- a background import, lifted as core lifts it for an upgrade.
		}
		$previous = get_current_user_id();
		wp_set_current_user( $author );
		try {
			$result = self::zip(
				$file,
				array(
					'status' => 'draft',
					// The attachment, which no other upload can be: a path is free again once its
					// file is deleted, and another upload by the same name would find this album.
					'as'     => dirname( $file ) . '/' . $id . '/' . wp_basename( $file ),
				)
			);
		} finally {
			wp_set_current_user( $previous );
		}
		if ( ! is_wp_error( $result ) ) {
			foreach ( $result['albums'] as $album ) {
				if ( $album['post'] ) {
					wp_update_post(
						array(
							'ID'          => $id,
							'post_parent' => $album['post'],
						)
					);
					break;
				}
			}
		}
		return $result;
	}

	/**
	 * Whether an attachment is a zip.
	 *
	 * @since 6.5.0
	 *
	 * @param int $id Attachment ID.
	 * @return bool
	 */
	public static function is_zip( int $id ): bool {
		return in_array( get_post_mime_type( $id ), array( 'application/zip', 'application/x-zip-compressed', 'application/x-zip' ), true );
	}

	/**
	 * Imports a zip, unpacked by core's unzip_file() into a folder of its own, as folder() imports
	 * a folder. The folder is removed afterwards, whatever happened. What is in a zip is its
	 * maker's choice, so core keeps its paths inside the folder, folder() reads only the files it
	 * looks for, and fits() refuses a zip that would fill the disk or PHP's memory before it is
	 * unpacked. An album's post is found again by the zip's path, unless `as` names it otherwise.
	 *
	 * @since 5.9.0
	 *
	 * @param string $file A zip on the server.
	 * @param array  $args Optional. As for folder().
	 * @return array{albums: array<int, array{folder: string, post: int, imported: string[], skipped: string[], failed: array<string, string>}>}|WP_Error
	 */
	public static function zip( string $file, array $args = array() ) {
		global $wp_filesystem;
		$file = realpath( $file );
		if ( ! $file || ! is_file( $file ) || ! is_readable( $file ) ) {
			return new WP_Error( 'riff_import_zip', __( 'That zip does not exist or cannot be read.', 'riff' ) );
		}
		require_once ABSPATH . 'wp-admin/includes/file.php';
		if ( ! WP_Filesystem() || ! $wp_filesystem ) {
			return new WP_Error( 'riff_import_zip', __( 'WordPress cannot write files on this server without asking for its FTP details, so the zip cannot be unpacked.', 'riff' ) );
		}
		$fits = self::fits( $file );
		if ( is_wp_error( $fits ) ) {
			return $fits;
		}

		$to    = get_temp_dir() . 'riff-zip-' . wp_generate_password( 20, false );
		$clean = static function () use ( $to ): void {
			global $wp_filesystem;
			if ( $wp_filesystem && $wp_filesystem->is_dir( $to ) ) {
				$wp_filesystem->delete( $to, true );
			}
		};
		// Removed at the end of the request too, should it end before the import does.
		register_shutdown_function( $clean );
		// ZipArchive, which fits() measured the zip with: core's PclZip fallback inflates every
		// file into memory before anything can look at what it holds.
		add_filter( 'unzip_file_use_ziparchive', '__return_true', PHP_INT_MAX );
		try {
			// isolation: write -- a folder of its own under the temp folder, removed after the import.
			$unzipped = unzip_file( $file, $to );
			remove_filter( 'unzip_file_use_ziparchive', '__return_true', PHP_INT_MAX );
			if ( is_wp_error( $unzipped ) ) {
				return new WP_Error(
					'riff_import_zip',
					/* translators: %s: Why WordPress could not unpack the zip. */
					sprintf( __( 'The zip could not be unpacked: %s', 'riff' ), $unzipped->get_error_message() )
				);
			}
			$as = '' !== (string) ( $args['as'] ?? '' ) ? (string) $args['as'] : $file;
			return self::folder( $to, array_merge( $args, array( 'as' => $as ) ) );
		} finally {
			remove_filter( 'unzip_file_use_ziparchive', '__return_true', PHP_INT_MAX );
			$clean();
		}
	}

	/**
	 * Refuses a zip before it is unpacked when it is not one ZipArchive can read whole, when it
	 * would unpack to far more than it holds or than the disk has free, or when it holds a file
	 * larger than PHP's memory has left: core's ZipArchive path reads each file whole into memory,
	 * and a file larger than that would end the request rather than say why. The sizes are the
	 * ones the zip declares, which ZipArchive holds each file to as it unpacks it.
	 *
	 * @param string $file The zip.
	 * @return true|WP_Error
	 */
	private static function fits( string $file ) {
		if ( ! class_exists( 'ZipArchive', false ) ) {
			return new WP_Error( 'riff_import_zip', __( 'This server\'s PHP has no zip extension, so the zip cannot be unpacked safely. Unpack it and import the folder instead.', 'riff' ) );
		}
		$zip = new \ZipArchive();
		if ( true !== $zip->open( $file, \ZipArchive::CHECKCONS ) ) {
			return new WP_Error( 'riff_import_zip', __( 'That is not a zip that can be unpacked.', 'riff' ) );
		}
		$total   = 0;
		$largest = 0;
		$count   = $zip->count();
		for ( $i = 0; $i < $count; $i++ ) {
			$stat    = $zip->statIndex( $i );
			$size    = is_array( $stat ) ? (int) $stat['size'] : 0;
			$total  += $size;
			$largest = max( $largest, $size );
		}
		$zip->close();
		if ( $total > (float) filesize( $file ) * self::ZIP_RATIO ) {
			return new WP_Error( 'riff_import_zip', __( 'That zip unpacks to far more than it holds, so it was not unpacked.', 'riff' ) );
		}
		$free = function_exists( 'disk_free_space' ) ? @disk_free_space( get_temp_dir() ) : false; // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- false where the host turns it off.
		if ( $free && $total > $free ) {
			return new WP_Error( 'riff_import_zip', __( 'There is not enough disk space to unpack that zip.', 'riff' ) );
		}
		// As much as unzip_file() asks for.
		wp_raise_memory_limit( 'admin' );
		$limit = wp_convert_hr_to_bytes( (string) ini_get( 'memory_limit' ) );
		if ( $limit > 0 && $largest > $limit - memory_get_usage() ) {
			return new WP_Error(
				'riff_import_zip',
				/* translators: %s: A file size, such as 300 MB. */
				sprintf( __( 'A file in that zip is too large to unpack here (%s). Unpack it and import the folder instead.', 'riff' ), size_format( $largest ) )
			);
		}
		return true;
	}

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
	 *     @type string $as      What the folder is known by in place of its path, such as the zip it
	 *                           was unpacked from: what the report names, what an album is called
	 *                           when its tags don't say, and how its post is found again. Default
	 *                           the folder's path.
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
				'as'      => '',
			)
		);
		$as   = '' !== (string) $args['as'] ? (string) $args['as'] : $dir;

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
				$albums[] = self::album( $folder, $as . substr( $folder, strlen( $dir ) ), $args, $known );
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
	 * @param string $name  What it is known by, from folder().
	 * @param array  $args  Arguments from folder().
	 * @param array  $known Files imported before, from imported(), with each file this one adds.
	 * @return array{folder: string, post: int, imported: string[], skipped: string[], failed: array<string, string>}
	 */
	private static function album( string $dir, string $name, array $args, array &$known ): array {
		$report = array(
			'folder'   => $name,
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

		$report['post'] = self::post( $name, $ids, $cover, (string) $args['status'] );
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
		// isolation: write -- a wp_tempnam() file, which media_handle_sideload() moves into uploads.
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
			$title = sanitize_text_field( (string) preg_replace( '/^\d+\s*[-.]\s*|\s*\[[^\]]*\]$/', '', pathinfo( $path, PATHINFO_FILENAME ) ) );
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
			update_post_meta( $id, Media::VIDEO_META, $video_id );
			// A video imported before is someone's: a person importing changes only one they may
			// edit. With no one signed in, as from WP-CLI, the import is the site's own.
			if ( get_current_user_id() && ! current_user_can( 'edit_post', $video_id ) ) {
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
			return;
		}
	}

	/**
	 * The album's post: made with one audio block per track, or, when this folder was imported
	 * before, the new tracks added to the end of it.
	 *
	 * @param string $dir    What the folder is known by, from folder().
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
		$ids = self::in_track_order( $ids );
		if ( $post_id ) {
			wp_update_post(
				array(
					'ID'           => $post_id,
					'post_content' => get_post_field( 'post_content', $post_id, 'raw' ) . Library::blocks( $ids ),
				)
			);
			return $post_id;
		}
		$meta    = wp_get_attachment_metadata( $ids[0] );
		$album   = is_array( $meta ) ? trim( (string) ( $meta['album'] ?? '' ) ) : '';
		$post_id = Library::create(
			'' !== $album ? $album : ucwords( str_replace( array( '-', '_' ), ' ', sanitize_text_field( (string) preg_replace( '/\.zip$/i', '', wp_basename( $dir ) ) ) ) ),
			$ids,
			in_array( $status, array( 'publish', 'draft', 'private' ), true ) ? $status : 'publish',
			$cover
		);
		if ( is_wp_error( $post_id ) ) {
			return 0;
		}
		update_post_meta( $post_id, self::FOLDER, $dir );
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
}
