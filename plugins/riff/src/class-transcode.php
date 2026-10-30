<?php
/**
 * Streaming versions made on the server: an MP3 of a song, where ffmpeg is installed, uploaded to
 * the Media Library beside it and set as the version the player streams.
 *
 * @since 5.8.0
 * @package Riff
 */

namespace Riff;

use WP_Error;

defined( 'ABSPATH' ) || exit;

/**
 * Streaming versions made with ffmpeg, from `wp riff transcode`.
 *
 * A lossless file is five times the size of the MP3 a listener on a phone can tell from it, and
 * the streaming services send that MP3, or its like, and keep the original. WordPress keeps one
 * file per upload and has no transcoder, so Riff asks ffmpeg, only from the command line, only
 * where the server has it, and puts what it makes through the Media Library as an upload.
 */
final class Transcode {

	/**
	 * A version's bit rate, in kbps, unless the command says otherwise: an MP3 most listeners can't
	 * tell from the original, at about a fifth of a CD's size.
	 *
	 * @since 5.8.0
	 */
	public const BITRATE = 192;

	/**
	 * The path to ffmpeg on this server, or empty when it has none.
	 *
	 * @since 5.8.0
	 *
	 * @return string
	 */
	public static function ffmpeg(): string {
		static $path = null;
		if ( null === $path ) {
			// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.system_calls_exec -- WP-CLI only, a fixed command.
			$found = function_exists( 'exec' ) ? trim( (string) exec( 'command -v ffmpeg 2>/dev/null' ) ) : '';
			$path  = '' !== $found && is_executable( $found ) ? $found : '';
		}
		return $path;
	}

	/**
	 * Whether a song is worth a version: lossless, or sent at a bit rate well above a version's.
	 * One whose bit rate WordPress didn't read is given the benefit of the doubt.
	 *
	 * @since 5.8.0
	 *
	 * @param int $id   Audio attachment ID.
	 * @param int $kbps The version's bit rate.
	 * @return bool
	 */
	public static function worth( int $id, int $kbps ): bool {
		$meta = wp_get_attachment_metadata( $id );
		$meta = is_array( $meta ) ? $meta : array();
		if ( ! empty( $meta['lossless'] ) ) {
			return true;
		}
		$rate = (float) ( $meta['bitrate'] ?? 0 ) / 1000;
		return $rate <= 0 || $rate > $kbps * 1.25;
	}

	/**
	 * Makes a song's streaming version and sets it: an MP3 without the file's tags, so it is never
	 * filed as a track of its own, uploaded to the same post as the song so the same people may
	 * play it, and protected when the song is.
	 *
	 * @since 5.8.0
	 *
	 * @param int $id   Audio attachment ID.
	 * @param int $kbps Bit rate.
	 * @return int|WP_Error The version's attachment ID.
	 */
	public static function make( int $id, int $kbps = self::BITRATE ) {
		$ffmpeg = self::ffmpeg();
		if ( '' === $ffmpeg ) {
			return new WP_Error( 'riff_transcode_ffmpeg', __( 'ffmpeg is not installed on this server, so no streaming version can be made here.', 'riff' ) );
		}
		$source = (string) get_attached_file( $id );
		if ( ! str_starts_with( (string) get_post_mime_type( $id ), 'audio/' ) || ! is_file( $source ) ) {
			return new WP_Error( 'riff_transcode_file', __( 'There is no audio file to make a version of.', 'riff' ) );
		}
		require_once ABSPATH . 'wp-admin/includes/media.php';
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/image.php';

		$name = pathinfo( $source, PATHINFO_FILENAME ) . '-stream.mp3';
		$tmp  = wp_tempnam( $name );
		$out  = array();
		$code = 1;
		// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.system_calls_exec -- WP-CLI only, every argument escaped.
		exec( sprintf( '%s -nostdin -hide_banner -loglevel error -y -i %s -vn -map_metadata -1 -codec:a libmp3lame -b:a %dk -f mp3 %s 2>&1', escapeshellarg( $ffmpeg ), escapeshellarg( $source ), max( 32, $kbps ), escapeshellarg( $tmp ) ), $out, $code );
		if ( 0 !== $code || ! filesize( $tmp ) ) {
			wp_delete_file( $tmp );
			$said = trim( implode( "\n", $out ) );
			return new WP_Error( 'riff_transcode_ffmpeg', '' !== $said ? $said : __( 'ffmpeg could not read the file.', 'riff' ) );
		}
		$version = media_handle_sideload(
			array(
				'name'     => $name,
				'tmp_name' => $tmp,
			),
			(int) get_post_field( 'post_parent', $id ),
			null,
			array( 'post_title' => get_the_title( $id ) )
		);
		if ( is_wp_error( $version ) ) {
			wp_delete_file( $tmp );
			return $version;
		}
		$version = (int) $version;
		if ( Protect::is( $id ) ) {
			$done = Protected_Files::protect( $version );
			if ( is_wp_error( $done ) ) {
				wp_delete_attachment( $version, true );
				return $done;
			}
		}
		Media::link_stream( $id, $version );
		return $version;
	}
}
