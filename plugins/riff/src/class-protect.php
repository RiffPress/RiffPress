<?php
/**
 * Protected files: an audio or video upload served through WordPress, to whoever may play it.
 *
 * @since 4.18.0
 * @package Riff
 */

namespace Riff;

use WP_Error;
use WP_Post;

defined( 'ABSPATH' ) || exit;

/**
 * Protected files.
 *
 * WordPress serves every upload as a plain file at a public address, whatever the post it belongs
 * to (core ticket #33230). A file marked Protected in the Media Library moves into a folder of its
 * own under uploads, which the web server is told to refuse, and its address becomes the site's
 * address with ?riff-file=ID. That address checks the same rules the player does, the post's
 * visibility and then riff_can_play, and sends the file with byte ranges, so seeking works.
 *
 * Tracks the visitor may play carry a signed address that works without a login cookie for a few
 * hours, for AirPlay, Cast and the lock screen. Posts that linked to the file are relinked when it
 * moves, either way.
 */
final class Protect {

	/**
	 * The query variable a protected file is served at.
	 *
	 * @since 4.18.0
	 */
	public const QUERY = 'riff-file';

	/**
	 * How long a signed address works, at least.
	 *
	 * @since 4.18.0
	 */
	public const TTL = 6 * HOUR_IN_SECONDS;

	/**
	 * Hooks the address, the field, the signing and the Site Health check.
	 *
	 * @since 4.18.0
	 */
	public static function register(): void {
		// After init, so a membership plugin's riff_can_play is in place when the file is asked for.
		add_action( 'wp_loaded', array( self::class, 'serve' ) );
		add_filter( 'wp_get_attachment_url', array( self::class, 'url' ), 99, 2 );
		add_filter( 'riff_track', array( self::class, 'sign' ), PHP_INT_MAX, 2 );
		add_filter( 'attachment_fields_to_edit', array( self::class, 'field' ), 20, 2 );
		add_filter( 'attachment_fields_to_save', array( self::class, 'save' ), 20, 2 );
		add_filter( 'site_status_tests', array( self::class, 'tests' ) );
	}

	/**
	 * Whether a file is protected.
	 *
	 * @since 4.18.0
	 *
	 * @param int $id Attachment ID.
	 * @return bool
	 */
	public static function is( int $id ): bool {
		return '' !== (string) get_post_meta( $id, Protected_Files::META, true );
	}

	/**
	 * A protected file's address, the same for everyone.
	 *
	 * @since 4.18.0
	 *
	 * @param int $id Attachment ID.
	 * @return string
	 */
	public static function address( int $id ): string {
		return add_query_arg( self::QUERY, $id, home_url( '/' ) );
	}

	/**
	 * A protected file's address with a signature, for a visitor who may play it. It works without
	 * a login until it expires, at the turn of an hour so the address stays the same for a while.
	 *
	 * @since 4.18.0
	 *
	 * @param int $id Attachment ID.
	 * @return string
	 */
	public static function signed( int $id ): string {
		$expires = (int) ( ceil( ( time() + self::TTL ) / HOUR_IN_SECONDS ) * HOUR_IN_SECONDS );
		return add_query_arg(
			array(
				'riff-expires' => $expires,
				'riff-sig'     => self::signature( $id, $expires ),
			),
			self::address( $id )
		);
	}

	/**
	 * The signature of an address.
	 *
	 * @param int $id      Attachment ID.
	 * @param int $expires When it stops working.
	 * @return string
	 */
	private static function signature( int $id, int $expires ): string {
		return substr( hash_hmac( 'sha256', $id . '|' . $expires, wp_salt( 'auth' ) ), 0, 32 );
	}

	/**
	 * Gives a protected file its address wherever WordPress names it: blocks, REST, feeds.
	 *
	 * @since 4.18.0
	 *
	 * @param string $url Address.
	 * @param int    $id  Attachment ID.
	 * @return string
	 */
	public static function url( $url, $id ) {
		return self::is( (int) $id ) ? self::address( (int) $id ) : $url;
	}

	/**
	 * Signs a protected track's file, and its video's, for the visitor the track is written for.
	 * A track the visitor may not play loses its file after this, in riff_can_play.
	 *
	 * @since 4.18.0
	 *
	 * @param array $track Track.
	 * @param int   $id    Attachment ID, or 0.
	 * @return array
	 */
	public static function sign( $track, $id ) {
		$id = (int) $id;
		if ( ! is_array( $track ) || ! $id ) {
			return $track;
		}
		// Only for a visitor who may read the file's post: the signature skips that check.
		if ( self::is( $id ) && ! empty( $track['src'] ) && self::readable( $id ) ) {
			$track['src'] = self::signed( $id );
		}
		$video = (int) get_post_meta( $id, Media::VIDEO_META, true );
		if ( $video && self::is( $video ) && ! empty( $track['video']['src'] ) && self::readable( $video ) ) {
			$track['video']['src'] = self::signed( $video );
		}
		return $track;
	}

	/**
	 * Whether the current visitor may have a file: its post is one they can read, and
	 * riff_can_play does not refuse it.
	 *
	 * @since 4.18.0
	 *
	 * @param int $id Attachment ID.
	 * @return bool
	 */
	public static function can( int $id ): bool {
		if ( ! self::readable( $id ) ) {
			return false;
		}
		$track = Tracks::from_attachment( $id, (int) get_post_field( 'post_parent', $id ) );
		return null !== $track && ! $track['locked'];
	}

	/**
	 * Whether the current visitor may read the post a file was uploaded to: one that is public or
	 * that they may read, and behind a password only once they have given it, as its content is.
	 * Someone who may edit the post needs no password, as in the REST API. A file uploaded to no
	 * post may be read.
	 *
	 * @param int $id Attachment ID.
	 * @return bool
	 */
	private static function readable( int $id ): bool {
		$parent = (int) get_post_field( 'post_parent', $id );
		$post   = $parent ? get_post( $parent ) : null;
		if ( ! $post instanceof WP_Post ) {
			return true;
		}
		if ( post_password_required( $post ) && ! current_user_can( 'edit_post', $parent ) ) {
			return false;
		}
		return is_post_publicly_viewable( $post ) || current_user_can( 'read_post', $parent );
	}

	/**
	 * Whether a request's signature is good for a file.
	 *
	 * @since 4.18.0
	 *
	 * @param int    $id        Attachment ID.
	 * @param int    $expires   Expiry from the address.
	 * @param string $signature Signature from the address.
	 * @return bool
	 */
	public static function valid( int $id, int $expires, string $signature ): bool {
		return $expires >= time() && hash_equals( self::signature( $id, $expires ), $signature );
	}

	/**
	 * Serves ?riff-file=ID.
	 *
	 * @since 4.18.0
	 */
	public static function serve(): void {
		// phpcs:disable WordPress.Security.NonceVerification.Recommended -- a file request, checked by signature or by the visitor's rights.
		if ( ! isset( $_GET[ self::QUERY ] ) ) {
			return;
		}
		$id = absint( $_GET[ self::QUERY ] );
		if ( ! self::is( $id ) ) {
			$url = self::moved( $id );
			if ( '' !== $url ) {
				wp_safe_redirect( $url, 302 );
				exit;
			}
			self::refuse( 404 );
		}
		$expires   = isset( $_GET['riff-expires'] ) ? absint( $_GET['riff-expires'] ) : 0;
		$signature = isset( $_GET['riff-sig'] ) ? sanitize_key( wp_unslash( $_GET['riff-sig'] ) ) : '';
		// phpcs:enable
		if ( ! self::valid( $id, $expires, $signature ) && ! self::can( $id ) ) {
			self::refuse( 403 );
		}
		$to = self::elsewhere( $id );
		if ( '' !== $to ) {
			// For this visitor and this once: never kept by a cache along the way.
			nocache_headers();
			wp_redirect( $to, 302, 'Riff' ); // phpcs:ignore WordPress.Security.SafeRedirect.wp_redirect_wp_redirect -- a CDN's or storage's own host, given by a plugin, never by the request.
			exit;
		}
		self::send( $id );
	}

	/**
	 * Where a protected file is sent from instead of WordPress, when a CDN or storage plugin signs
	 * an address for it: the visitor has been checked by now, and is sent on to an address that
	 * works for a while, which the CDN checks and serves from its edge with byte ranges, so no PHP
	 * worker holds the file while it plays. Empty when no plugin does.
	 *
	 * @since 5.7.0
	 *
	 * @param int $id Attachment ID.
	 * @return string
	 */
	public static function elsewhere( int $id ): string {
		/**
		 * Filters the address a protected file is sent from instead of WordPress: a signed address
		 * on a CDN or in object storage, such as a CloudFront or S3 presigned URL or a Bunny or
		 * Cloudflare token, that stops working at $expires. Riff has checked that the visitor may
		 * have the file before it asks, and sends them on with a 302 nothing caches. Empty, the
		 * default, sends the file as riff_protected_send says.
		 *
		 * @since 5.7.0
		 *
		 * @param string $url     Signed address, or empty.
		 * @param int    $id      Attachment ID.
		 * @param int    $expires When the address should stop working, as a Unix time: an hour on.
		 */
		$url = (string) apply_filters( 'riff_protected_url', '', $id, time() + HOUR_IN_SECONDS );
		return in_array( wp_parse_url( $url, PHP_URL_SCHEME ), array( 'https', 'http' ), true ) ? $url : '';
	}

	/**
	 * Where the address of a file that was protected and no longer is sends the visitor: the file's
	 * own address, for an audio or video file they may have. Empty otherwise, so the address tells
	 * nobody where a file on an unpublished post lives.
	 *
	 * @since 4.20.1
	 *
	 * @param int $id Attachment ID.
	 * @return string
	 */
	public static function moved( int $id ): string {
		if ( ! $id || ! in_array( strtok( (string) get_post_mime_type( $id ), '/' ), array( 'audio', 'video' ), true ) || ! self::can( $id ) ) {
			return '';
		}
		return (string) wp_get_attachment_url( $id );
	}

	/**
	 * Ends the request with a status and nothing else.
	 *
	 * @param int $status HTTP status.
	 */
	private static function refuse( int $status ): never {
		status_header( $status );
		nocache_headers();
		exit;
	}

	/**
	 * The byte range a Range header asks for, as RFC 9110 has it: one range, or none.
	 *
	 * @since 4.18.0
	 *
	 * @param string $header Range header, or empty.
	 * @param int    $size   File size.
	 * @return array{0:int,1:int}|null|false The first and last byte; null for the whole file; false when the range cannot be met.
	 */
	public static function range( string $header, int $size ) {
		if ( '' === $header ) {
			return null;
		}
		if ( ! preg_match( '/^bytes=(\d*)-(\d*)$/', trim( $header ), $m ) || ( '' === $m[1] && '' === $m[2] ) ) {
			// Several ranges, or a unit other than bytes: the whole file, which the RFC allows.
			return null;
		}
		if ( '' === $m[1] ) {
			$length = min( (int) $m[2], $size );
			return $length > 0 ? array( $size - $length, $size - 1 ) : false;
		}
		$first = (int) $m[1];
		$last  = '' === $m[2] ? $size - 1 : min( (int) $m[2], $size - 1 );
		return $first < $size && $first <= $last ? array( $first, $last ) : false;
	}

	/**
	 * Whether the copy a request already has is the file as it is, so a 304 says so, as RFC 9110
	 * has it: by If-None-Match when it is sent, and by If-Modified-Since only when it isn't.
	 *
	 * @since 5.7.0
	 *
	 * @param string $none_match If-None-Match header, or empty.
	 * @param string $since      If-Modified-Since header, or empty.
	 * @param string $etag       The file's entity tag, quoted.
	 * @param int    $time       When the file last changed.
	 * @return bool
	 */
	public static function current( string $none_match, string $since, string $etag, int $time ): bool {
		if ( '' !== trim( $none_match ) ) {
			if ( '*' === trim( $none_match ) ) {
				return true;
			}
			// Compared weakly, as the RFC asks of If-None-Match.
			$tags = array_map( static fn( $tag ) => preg_replace( '#^W/#', '', trim( $tag ) ), explode( ',', $none_match ) );
			return in_array( preg_replace( '#^W/#', '', $etag ), $tags, true );
		}
		$when = '' !== trim( $since ) ? strtotime( $since ) : false;
		return false !== $when && $time <= $when;
	}

	/**
	 * Whether a Range may be met, given If-Range: always without one; with an entity tag, only the
	 * file's own, compared strongly, so a weak one never is; with a date, only exactly when the file
	 * last changed.
	 *
	 * @since 5.7.0
	 *
	 * @param string $if_range If-Range header, or empty.
	 * @param string $etag     The file's entity tag, quoted.
	 * @param int    $time     When the file last changed.
	 * @return bool
	 */
	public static function ranged( string $if_range, string $etag, int $time ): bool {
		$if_range = trim( $if_range );
		if ( '' === $if_range ) {
			return true;
		}
		if ( str_starts_with( $if_range, '"' ) || str_starts_with( $if_range, 'W/' ) ) {
			return $if_range === $etag;
		}
		$when = strtotime( $if_range );
		return false !== $when && $when === $time;
	}

	/**
	 * Sends a file: through the web server when the site says it can, from PHP otherwise.
	 *
	 * @param int $id Attachment ID.
	 */
	private static function send( int $id ): void {
		$file = (string) get_attached_file( $id );
		if ( ! is_readable( $file ) ) {
			self::refuse( 404 );
		}
		$size = (int) filesize( $file );
		$time = (int) filemtime( $file );
		$etag = '"' . md5( $id . '|' . $size . '|' . $time ) . '"';
		header( 'Content-Type: ' . ( get_post_mime_type( $id ) ? get_post_mime_type( $id ) : 'application/octet-stream' ) );
		header( 'Accept-Ranges: bytes' );
		header( 'Cache-Control: private, max-age=' . HOUR_IN_SECONDS );
		header( 'ETag: ' . $etag );
		header( 'Last-Modified: ' . gmdate( 'D, d M Y H:i:s', $time ) . ' GMT' );
		header( 'X-Content-Type-Options: nosniff' );
		header( 'Content-Disposition: inline; filename="' . rawurlencode( basename( $file ) ) . '"' );

		/**
		 * Filters how a protected file is handed over: 'php' sends it from PHP; 'x-sendfile' asks
		 * Apache's mod_xsendfile or LiteSpeed to send it; 'x-accel-redirect' asks Nginx, which then
		 * needs an internal location for the protected folder (see the readme).
		 *
		 * @since 4.18.0
		 *
		 * @param string $how  'php', 'x-sendfile' or 'x-accel-redirect'. Default 'php'.
		 * @param string $file Absolute path.
		 * @param int    $id   Attachment ID.
		 */
		$how = (string) apply_filters( 'riff_protected_send', 'php', $file, $id );
		if ( 'x-sendfile' === $how ) {
			header( 'X-Sendfile: ' . $file );
			exit;
		}
		if ( 'x-accel-redirect' === $how ) {
			$base = (string) wp_parse_url( wp_upload_dir( null, false )['baseurl'], PHP_URL_PATH );
			header( 'X-Accel-Redirect: ' . $base . '/' . Protected_Files::relative( $file ) );
			exit;
		}

		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- request headers, compared, never output.
		$header = static fn( string $name ): string => isset( $_SERVER[ $name ] ) ? trim( (string) wp_unslash( $_SERVER[ $name ] ) ) : '';
		if ( self::current( $header( 'HTTP_IF_NONE_MATCH' ), $header( 'HTTP_IF_MODIFIED_SINCE' ), $etag, $time ) ) {
			status_header( 304 );
			exit;
		}
		// A range of a file that changed since the player last had it would splice two files: the
		// whole file instead.
		$range = self::range( self::ranged( $header( 'HTTP_IF_RANGE' ), $etag, $time ) ? sanitize_text_field( $header( 'HTTP_RANGE' ) ) : '', $size );
		if ( false === $range ) {
			status_header( 416 );
			header( 'Content-Range: bytes */' . $size );
			exit;
		}
		list( $first, $last ) = $range ?? array( 0, $size - 1 );
		$length               = $last - $first + 1;
		status_header( null === $range ? 200 : 206 );
		if ( null !== $range ) {
			header( "Content-Range: bytes $first-$last/$size" );
		}
		header( 'Content-Length: ' . $length );
		if ( 'HEAD' === ( $_SERVER['REQUEST_METHOD'] ?? 'GET' ) ) { // phpcs:ignore WordPress.Security.ValidatedSanitizedInput -- compared only.
			exit;
		}
		while ( ob_get_level() ) {
			ob_end_clean();
		}
		$handle = fopen( $file, 'rb' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen -- streamed in pieces, not read whole.
		fseek( $handle, $first );
		while ( $length > 0 && ! connection_aborted() ) {
			$piece = (string) fread( $handle, (int) min( MB_IN_BYTES, $length ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
			if ( '' === $piece ) {
				break;
			}
			echo $piece; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- the file's bytes.
			flush();
			$length -= strlen( $piece );
		}
		fclose( $handle ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
		exit;
	}

	/**
	 * The Protected box on an audio or video file in the Media Library.
	 *
	 * @since 4.18.0
	 *
	 * @param array   $fields Fields.
	 * @param WP_Post $post   Attachment.
	 * @return array
	 */
	public static function field( $fields, $post ) {
		if ( ! $post instanceof WP_Post || ! in_array( strtok( (string) $post->post_mime_type, '/' ), array( 'audio', 'video' ), true ) ) {
			return $fields;
		}
		$error = (string) get_transient( 'riff_protect_error_' . $post->ID );
		delete_transient( 'riff_protect_error_' . $post->ID );
		$fields['riff_protected'] = array(
			'label' => __( 'Protected', 'riff' ),
			'input' => 'html',
			'html'  => sprintf(
				'<input type="hidden" name="attachments[%1$d][riff_protected]" value="0"><label><input type="checkbox" name="attachments[%1$d][riff_protected]" id="attachments-%1$d-riff_protected" value="1"%2$s> %3$s</label>%4$s',
				(int) $post->ID,
				checked( self::is( $post->ID ), true, false ),
				esc_html__( 'Only listeners who may play it can load the file', 'riff' ),
				'' !== $error ? '<p class="riff-pick-error" role="alert">' . esc_html( $error ) . '</p>' : ''
			),
			'helps' => __( 'Moves the file into a folder the web server refuses, and serves it through WordPress to whoever can read its post. Posts that link to it are updated.', 'riff' ),
		);
		return $fields;
	}

	/**
	 * Saves the Protected box.
	 *
	 * @since 4.18.0
	 *
	 * @param array $post       Attachment data.
	 * @param array $attachment Submitted fields.
	 * @return array
	 */
	public static function save( $post, $attachment ) {
		$id = (int) ( $post['ID'] ?? 0 );
		if ( ! $id || ! isset( $attachment['riff_protected'] ) || ! current_user_can( 'edit_post', $id ) ) {
			return $post;
		}
		$done = '1' === (string) $attachment['riff_protected'] ? Protected_Files::protect( $id ) : Protected_Files::unprotect( $id );
		if ( is_wp_error( $done ) ) {
			set_transient( 'riff_protect_error_' . $id, $done->get_error_message(), MINUTE_IN_SECONDS );
		}
		return $post;
	}

	/**
	 * Adds the Site Health check.
	 *
	 * @since 4.18.0
	 *
	 * @param array $tests Tests.
	 * @return array
	 */
	public static function tests( $tests ) {
		$tests['direct']['riff_protected_files'] = array(
			'label' => __( 'Riff\'s protected files', 'riff' ),
			'test'  => array( self::class, 'health' ),
		);
		return $tests;
	}

	/**
	 * Whether the web server refuses the protected folder, by asking it for a file there.
	 *
	 * @since 4.18.0
	 *
	 * @return array Site Health result.
	 */
	public static function health(): array {
		$result = array(
			'label'       => __( 'Riff\'s protected files can only be loaded through WordPress', 'riff' ),
			'status'      => 'good',
			'badge'       => array(
				'label' => __( 'Security', 'riff' ),
				'color' => 'blue',
			),
			'description' => '<p>' . esc_html__( 'The web server refuses the protected folder, so a protected file is only served to listeners who may play it.', 'riff' ) . '</p>',
			'test'        => 'riff_protected_files',
		);
		if ( ! get_option( Protected_Files::DIR ) ) {
			return $result;
		}
		$dir   = Protected_Files::dir();
		$probe = $dir . '/riff-probe.txt';
		file_put_contents( $probe, 'riff' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- a probe, removed below.
		$url      = trailingslashit( wp_upload_dir( null, false )['baseurl'] ) . basename( $dir ) . '/riff-probe.txt';
		$response = wp_remote_get(
			$url,
			array(
				'timeout'   => 5,
				/** This filter is documented in wp-includes/cron.php */
				'sslverify' => apply_filters( 'https_local_ssl_verify', false ), // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- core's own filter, applied as core applies it.
			)
		);
		wp_delete_file( $probe );
		if ( 200 === wp_remote_retrieve_response_code( $response ) && 'riff' === wp_remote_retrieve_body( $response ) ) {
			$result['status']      = 'recommended';
			$result['label']       = __( 'Riff\'s protected files can be loaded directly', 'riff' );
			$result['description'] = '<p>' . esc_html__( 'The web server sends files from the protected folder to anyone who has their address, so protecting a file only hides that address. On Nginx, add a rule that refuses the folder:', 'riff' ) . '</p><p><code>location ^~ ' . esc_html( dirname( (string) wp_parse_url( $url, PHP_URL_PATH ) ) ) . '/ { internal; }</code></p>';
		}
		return $result;
	}
}
