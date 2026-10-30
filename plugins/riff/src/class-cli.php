<?php
/**
 * WP-CLI commands.
 *
 * @since 4.16.0
 * @package Riff
 */

namespace Riff;

use WP_CLI;

defined( 'ABSPATH' ) || exit;

/**
 * Manages Riff's music from the command line.
 */
final class Cli {

	/**
	 * Registers `wp riff` when WP-CLI is running.
	 *
	 * @since 4.16.0
	 */
	public static function register(): void {
		if ( defined( 'WP_CLI' ) && WP_CLI ) {
			WP_CLI::add_command( 'riff', self::class );
		}
	}

	/**
	 * Files every audio file in the Media Library under its album and artist, from its tags.
	 *
	 * New uploads and imports are filed as they arrive, and a library from before Riff 4.16.0 is
	 * filed in the background; this does the whole library now.
	 *
	 * ## EXAMPLES
	 *
	 *     wp riff catalog
	 *
	 * @since 4.16.0
	 *
	 * @param string[]             $args       Positional arguments.
	 * @param array<string, mixed> $assoc_args Named arguments.
	 */
	public function catalog( array $args, array $assoc_args ): void {
		unset( $args, $assoc_args );
		$total = 0;
		// From the start, so a file whose filing was lost is found wherever it is.
		delete_option( Catalog::BACKFILL );
		delete_option( Catalog::BACKFILL_FROM );
		do {
			$total += Catalog::backfill();
		} while ( ! Catalog::filed() );
		WP_CLI::success( sprintf( 'Filed %d audio files under their albums and artists.', $total ) );
	}

	/**
	 * Makes streaming versions of songs with ffmpeg.
	 *
	 * Each version is an MP3 without the file's tags, uploaded to the Media Library beside its song
	 * and set as the song's Streaming version: the player streams it, and the song stays the file
	 * it is. It goes to the same post as the song, so the same listeners may play it, and is
	 * protected when the song is. Without IDs, every song that has no version yet and is lossless,
	 * or of a bit rate well above the version's. Needs ffmpeg on the server.
	 *
	 * ## OPTIONS
	 *
	 * [<id>...]
	 * : Audio files to make versions of, by attachment ID, whatever their bit rate.
	 *
	 * [--bitrate=<kbps>]
	 * : The versions' bit rate.
	 * ---
	 * default: 192
	 * ---
	 *
	 * [--dry-run]
	 * : List the songs that would get a version, without making any.
	 *
	 * ## EXAMPLES
	 *
	 *     wp riff transcode
	 *     wp riff transcode 412 418 --bitrate=256
	 *
	 * @since 5.8.0
	 *
	 * @param string[]             $args       Positional arguments.
	 * @param array<string, mixed> $assoc_args Named arguments.
	 */
	public function transcode( array $args, array $assoc_args ): void {
		$dry  = (bool) WP_CLI\Utils\get_flag_value( $assoc_args, 'dry-run', false );
		$kbps = max( 32, (int) ( $assoc_args['bitrate'] ?? Transcode::BITRATE ) );
		if ( ! $dry && '' === Transcode::ffmpeg() ) {
			WP_CLI::error( 'ffmpeg is not installed on this server, so no streaming version can be made here.' );
		}
		$ids = array_map( 'intval', $args );
		if ( ! $ids ) {
			$ids = array_filter(
				self::songs(),
				static fn( int $id ): bool => ! Media::stream( $id ) && ! Media::streamed( $id ) && Transcode::worth( $id, $kbps )
			);
		}
		$made   = 0;
		$failed = 0;
		foreach ( $ids as $id ) {
			$title = get_the_title( $id );
			if ( $dry ) {
				WP_CLI::log( sprintf( '%d: %s', $id, $title ) );
				continue;
			}
			$version = Transcode::make( $id, $kbps );
			if ( is_wp_error( $version ) ) {
				++$failed;
				WP_CLI::warning( sprintf( '%d: %s: %s', $id, $title, $version->get_error_message() ) );
				continue;
			}
			++$made;
			WP_CLI::log( sprintf( '%d: %s -> %d', $id, $title, $version ) );
		}
		if ( $dry ) {
			WP_CLI::success( sprintf( 'Dry run. %d songs would get a streaming version.', count( $ids ) ) );
		} elseif ( $failed ) {
			WP_CLI::warning( sprintf( '%d streaming versions made, %d failed.', $made, $failed ) );
		} else {
			WP_CLI::success( sprintf( '%d streaming versions made.', $made ) );
		}
	}

	/**
	 * Measures songs' levels with ffmpeg: their loudness over time, which a drawn cover puts in its
	 * groove. Kept in each file's metadata, as the demo albums' are. Without IDs, every song not
	 * measured yet. Needs ffmpeg on the server.
	 *
	 * ## OPTIONS
	 *
	 * [<id>...]
	 * : Audio files to measure, by attachment ID, measured or not.
	 *
	 * [--force]
	 * : Measure every song again, not only those without levels.
	 *
	 * ## EXAMPLES
	 *
	 *     wp riff levels
	 *     wp riff levels 412 418
	 *
	 * @since 5.8.0
	 *
	 * @param string[]             $args       Positional arguments.
	 * @param array<string, mixed> $assoc_args Named arguments.
	 */
	public function levels( array $args, array $assoc_args ): void {
		if ( '' === Transcode::ffmpeg() ) {
			WP_CLI::error( 'ffmpeg is not installed on this server, so no levels can be measured here.' );
		}
		$force = (bool) WP_CLI\Utils\get_flag_value( $assoc_args, 'force', false );
		$ids   = array_map( 'intval', $args );
		if ( ! $ids ) {
			$ids = array_filter(
				self::songs(),
				static function ( int $id ) use ( $force ): bool {
					$meta = wp_get_attachment_metadata( $id );
					return ! Media::streamed( $id ) && ( $force || empty( $meta['riff_levels'] ) );
				}
			);
		}
		$done   = 0;
		$failed = 0;
		foreach ( $ids as $id ) {
			$levels = Transcode::measure( $id );
			if ( is_wp_error( $levels ) ) {
				++$failed;
				WP_CLI::warning( sprintf( '%d: %s: %s', $id, get_the_title( $id ), $levels->get_error_message() ) );
				continue;
			}
			++$done;
		}
		if ( $failed ) {
			WP_CLI::warning( sprintf( '%d songs measured, %d failed.', $done, $failed ) );
		} else {
			WP_CLI::success( sprintf( '%d songs measured.', $done ) );
		}
	}

	/**
	 * Every audio file in the Media Library, oldest first, by ID alone.
	 *
	 * @return int[]
	 */
	private static function songs(): array {
		return array_map(
			'intval',
			get_posts(
				array(
					'post_type'              => 'attachment',
					'post_mime_type'         => 'audio',
					'post_status'            => 'inherit',
					'posts_per_page'         => -1,
					'fields'                 => 'ids',
					'orderby'                => 'ID',
					'order'                  => 'ASC',
					'no_found_rows'          => true,
					'update_post_meta_cache' => false,
					'update_post_term_cache' => false,
				)
			)
		);
	}

	/**
	 * Imports a folder of music into the Media Library.
	 *
	 * Each folder that holds audio, the one given and any inside it, becomes an album: its files are
	 * added to the Media Library the way an upload is, so WordPress reads their tags and artwork,
	 * and a post with one audio block per track publishes them. A cover, folder or front image in
	 * the folder becomes the album's artwork, and a video named like a track becomes its video
	 * version. Running it again skips what it has already imported and adds new tracks to the
	 * album's post.
	 *
	 * ## OPTIONS
	 *
	 * <folder>
	 * : The folder on the server to import.
	 *
	 * [--status=<status>]
	 * : Status for new album posts.
	 * ---
	 * default: publish
	 * options:
	 *   - publish
	 *   - draft
	 *   - private
	 * ---
	 *
	 * [--dry-run]
	 * : List what would be imported and skipped, without importing anything.
	 *
	 * ## EXAMPLES
	 *
	 *     wp riff import ~/Music/Floating\ Points
	 *     wp riff import /srv/music --status=draft
	 *
	 * @since 4.16.0
	 *
	 * @param string[]             $args       Positional arguments.
	 * @param array<string, mixed> $assoc_args Named arguments.
	 */
	public function import( array $args, array $assoc_args ): void {
		$dry    = (bool) WP_CLI\Utils\get_flag_value( $assoc_args, 'dry-run', false );
		$result = Import::folder(
			(string) $args[0],
			array(
				'status'  => (string) ( $assoc_args['status'] ?? 'publish' ),
				'dry_run' => $dry,
			)
		);
		if ( is_wp_error( $result ) ) {
			WP_CLI::error( $result->get_error_message() );
		}
		$counts = array(
			'imported' => 0,
			'skipped'  => 0,
			'failed'   => 0,
		);
		foreach ( $result['albums'] as $album ) {
			$counts['imported'] += count( $album['imported'] );
			$counts['skipped']  += count( $album['skipped'] );
			$counts['failed']   += count( $album['failed'] );
			$where               = $album['post'] ? get_permalink( $album['post'] ) : $album['folder'];
			WP_CLI::log( sprintf( '%s: %d imported, %d skipped, %d failed', $where, count( $album['imported'] ), count( $album['skipped'] ), count( $album['failed'] ) ) );
			foreach ( $album['failed'] as $file => $message ) {
				WP_CLI::warning( "$file: $message" );
			}
		}
		if ( ! $result['albums'] ) {
			WP_CLI::warning( 'No audio found in that folder.' );
			return;
		}
		$summary = sprintf( '%d albums: %d tracks imported, %d skipped, %d failed.', count( $result['albums'] ), $counts['imported'], $counts['skipped'], $counts['failed'] );
		if ( $dry ) {
			WP_CLI::success( 'Dry run. ' . $summary );
		} elseif ( $counts['failed'] ) {
			WP_CLI::warning( $summary );
		} else {
			WP_CLI::success( $summary );
		}
	}
}
