<?php
/**
 * `wp riff protected`: the protected folder from the command line.
 *
 * @since 6.5.0
 * @package Riff
 */

namespace Riff;

use WP_CLI;

defined( 'ABSPATH' ) || exit;

/**
 * Manages where Riff keeps protected files.
 */
final class Protected_Cli {

	/**
	 * Moves protected files into the folder Riff keeps them in now.
	 *
	 * When RIFF_PROTECTED_PATH or the riff_protected_path filter changes, Riff moves the files
	 * already protected to the new folder in the background, a batch at a time. This moves them all
	 * now, and says which could not be moved and why. A file stays protected wherever it is while
	 * it waits, and a move cut short is finished the next time.
	 *
	 * ## OPTIONS
	 *
	 * [--batch=<count>]
	 * : How many files to move between saving how far it has got.
	 * ---
	 * default: 25
	 * ---
	 *
	 * ## EXAMPLES
	 *
	 *     wp riff protected move
	 *
	 * @since 6.5.0
	 *
	 * @param string[]             $args       Positional arguments.
	 * @param array<string, mixed> $assoc_args Named arguments.
	 */
	public function move( array $args, array $assoc_args ): void {
		unset( $args );
		$refusal = Protected_Files::refusal();
		if ( null !== $refusal ) {
			WP_CLI::warning(
				sprintf(
					'web' === $refusal
						? '%s is inside the web root, so protected files are kept under uploads instead.'
						: '%s is not an absolute path, so protected files are kept under uploads instead.',
					Protected_Files::configured()
				)
			);
		}
		if ( ! Protected_Files::pending() ) {
			WP_CLI::success( sprintf( 'Protected files are already in %s.', Protected_Files::path() ) );
			return;
		}
		$batch = max( 1, (int) WP_CLI\Utils\get_flag_value( $assoc_args, 'batch', Protected_Files::BATCH ) );
		// From the start, as someone asked now, whatever a pass in the background left.
		delete_option( Protected_Files::MOVE );
		$moved  = 0;
		$failed = 0;
		do {
			$done = Protected_Files::migrate( $batch );
			if ( $done['busy'] ) {
				WP_CLI::error( 'Another pass is moving protected files now. Try again once it has finished.' );
			}
			$moved += $done['moved'];
			foreach ( $done['errors'] as $message ) {
				WP_CLI::warning( $message );
				++$failed;
			}
		} while ( $done['left'] );
		$to = Protected_Files::path();
		if ( $failed ) {
			WP_CLI::error( sprintf( 'Moved %1$d protected files to %2$s; %3$d could not be moved, and stay protected where they are.', $moved, $to, $failed ) );
		}
		WP_CLI::success( sprintf( 'Moved %1$d protected files to %2$s.', $moved, $to ) );
	}
}
