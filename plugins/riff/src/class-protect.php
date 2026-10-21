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
	 * Attachment meta holding the file's path in uploads before it was protected.
	 *
	 * @since 4.18.0
	 */
	public const META = '_riff_protected';

	/**
	 * Option holding the protected folder's name, random per site.
	 *
	 * @since 4.18.0
	 */
	public const DIR = 'riff_protected_dir';

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
		return '' !== (string) get_post_meta( $id, self::META, true );
	}

	/**
	 * The protected folder, made and guarded the first time it is needed.
	 *
	 * @since 4.18.0
	 *
	 * @return string Absolute path, without a trailing slash.
	 */
	public static function dir(): string {
		$name = get_option( self::DIR );
		if ( ! is_string( $name ) || ! preg_match( '/^riff-protected-[a-z0-9]{20}$/', $name ) ) {
			$name = 'riff-protected-' . strtolower( wp_generate_password( 20, false ) );
			update_option( self::DIR, $name, false );
		}
		$path = trailingslashit( wp_upload_dir( null, false )['basedir'] ) . $name;
		if ( ! is_dir( $path ) ) {
			wp_mkdir_p( $path );
		}
		self::guard( $path );
		return $path;
	}

	/**
	 * Tells Apache to refuse the folder and leaves no listing. Nginx needs the rule in the readme.
	 *
	 * @param string $path Folder.
	 */
	private static function guard( string $path ): void {
		$files = array(
			'.htaccess' => "# Riff: these files are served through WordPress, to whoever may play them.\n<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n",
			'index.php' => "<?php\n// Silence is golden.\n",
		);
		foreach ( $files as $file => $contents ) {
			if ( ! file_exists( "$path/$file" ) ) {
				file_put_contents( "$path/$file", $contents ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- a two-line guard file, written once.
			}
		}
	}

	/**
	 * Moves a file into the protected folder and relinks the posts that named it.
	 *
	 * @since 4.18.0
	 *
	 * @param int $id Attachment ID.
	 * @return true|WP_Error
	 */
	public static function protect( int $id ) {
		if ( self::is( $id ) ) {
			return true;
		}
		$type = strtok( (string) get_post_mime_type( $id ), '/' );
		$file = (string) get_attached_file( $id, true );
		if ( ( 'audio' !== $type && 'video' !== $type ) || ! is_file( $file ) ) {
			return new WP_Error( 'riff_protect_file', __( 'Only an audio or video file in the Media Library can be protected.', 'riff' ) );
		}
		$from = (string) wp_get_attachment_url( $id );
		$rel  = self::relative( $file );
		$to   = self::free( self::dir() . '/' . ltrim( $rel, '/' ) );
		if ( ! self::move( $file, $to ) ) {
			return new WP_Error( 'riff_protect_move', __( 'The file could not be moved into the protected folder.', 'riff' ) );
		}
		update_attached_file( $id, $to );
		update_post_meta( $id, self::META, $rel );
		self::relink( $from, self::address( $id ) );
		return true;
	}

	/**
	 * Moves a protected file back to where it was, and relinks the posts.
	 *
	 * @since 4.18.0
	 *
	 * @param int $id Attachment ID.
	 * @return true|WP_Error
	 */
	public static function unprotect( int $id ) {
		if ( ! self::is( $id ) ) {
			return true;
		}
		$file = (string) get_attached_file( $id, true );
		$rel  = (string) get_post_meta( $id, self::META, true );
		$to   = self::free( trailingslashit( wp_upload_dir( null, false )['basedir'] ) . ltrim( $rel, '/' ) );
		if ( ! is_file( $file ) || ! self::move( $file, $to ) ) {
			return new WP_Error( 'riff_protect_move', __( 'The file could not be moved out of the protected folder.', 'riff' ) );
		}
		$from = self::address( $id );
		update_attached_file( $id, $to );
		delete_post_meta( $id, self::META );
		self::relink( $from, (string) wp_get_attachment_url( $id ) );
		return true;
	}

	/**
	 * A path under the uploads folder, as WordPress stores an attached file's; any other path as it is.
	 *
	 * @param string $path Absolute path.
	 * @return string
	 */
	private static function relative( string $path ): string {
		$base = wp_upload_dir( null, false )['basedir'] . '/';
		return str_starts_with( $path, $base ) ? substr( $path, strlen( $base ) ) : $path;
	}

	/**
	 * A path that is free, numbered the way uploads are when the name is taken.
	 *
	 * @param string $path Wanted path.
	 * @return string
	 */
	private static function free( string $path ): string {
		$dir = dirname( $path );
		return file_exists( $path ) ? $dir . '/' . wp_unique_filename( $dir, basename( $path ) ) : $path;
	}

	/**
	 * Moves a file, making its folder.
	 *
	 * @param string $from From.
	 * @param string $to   To.
	 * @return bool
	 */
	private static function move( string $from, string $to ): bool {
		wp_mkdir_p( dirname( $to ) );
		return @rename( $from, $to ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.rename_rename -- a failure is reported to the person who asked.
	}

	/**
	 * Replaces one address of a file with another in every post that names it: audio blocks,
	 * playlist tracks and links alike.
	 *
	 * @since 4.18.0
	 *
	 * @param string $from Old address.
	 * @param string $to   New address.
	 * @return int Posts changed.
	 */
	public static function relink( string $from, string $to ): int {
		global $wpdb;
		if ( '' === $from || $from === $to ) {
			return 0;
		}
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- a search no WP_Query offers, once per change.
		$ids     = $wpdb->get_col( $wpdb->prepare( "SELECT ID FROM {$wpdb->posts} WHERE post_type NOT IN ( 'revision', 'attachment' ) AND post_content LIKE %s", '%' . $wpdb->esc_like( $from ) . '%' ) );
		$changed = 0;
		foreach ( $ids as $post_id ) {
			$content = (string) get_post_field( 'post_content', (int) $post_id, 'raw' );
			$updated = self::replace( $from, $to, $content );
			if ( $updated === $content ) {
				continue;
			}
			// Straight to the row: an address changing is not an edit, so no revision and no kses.
			$wpdb->update( $wpdb->posts, array( 'post_content' => $updated ), array( 'ID' => (int) $post_id ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			clean_post_cache( (int) $post_id );
			++$changed;
		}
		return $changed;
	}

	/**
	 * Replaces an address in text where it is the whole address, so ?riff-file=12 is not found
	 * inside ?riff-file=123.
	 *
	 * @since 4.20.1
	 *
	 * @param string $from Old address.
	 * @param string $to   New address.
	 * @param string $text Text.
	 * @return string
	 */
	public static function replace( string $from, string $to, string $text ): string {
		return (string) preg_replace( '/' . preg_quote( $from, '/' ) . '(?![0-9])/', addcslashes( $to, '\\$' ), $text );
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
		self::send( $id );
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
			header( 'X-Accel-Redirect: ' . $base . '/' . self::relative( $file ) );
			exit;
		}

		if ( isset( $_SERVER['HTTP_IF_NONE_MATCH'] ) && trim( wp_unslash( $_SERVER['HTTP_IF_NONE_MATCH'] ) ) === $etag ) { // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- compared, never output.
			status_header( 304 );
			exit;
		}
		$range = self::range( isset( $_SERVER['HTTP_RANGE'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_RANGE'] ) ) : '', $size );
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
		$done = '1' === (string) $attachment['riff_protected'] ? self::protect( $id ) : self::unprotect( $id );
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
		if ( ! get_option( self::DIR ) ) {
			return $result;
		}
		$dir   = self::dir();
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
