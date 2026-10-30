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
