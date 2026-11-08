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
	 * The transient holding whether the protected folder was found open: '1' or '0'.
	 *
	 * @since 5.7.0
	 */
	public const OPEN = 'riff_protected_open';

	/**
	 * The cron event that asks the web server whether the protected folder is open.
	 *
	 * @since 5.7.0
	 */
	public const PROBE = 'riff_protected_probe';

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
		add_filter( 'riff_can_play', array( self::class, 'lock' ), 5, 3 );
		add_filter( 'attachment_fields_to_edit', array( self::class, 'field' ), 20, 2 );
		add_filter( 'attachment_fields_to_save', array( self::class, 'save' ), 20, 2 );
		add_filter( 'site_status_tests', array( self::class, 'tests' ) );
		add_action( self::PROBE, array( self::class, 'probe' ) );
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
		// The site's, as a network shares one salt and its sites' IDs overlap; and whether it is private,
		// so going private ends every address already handed out.
		return substr( hash_hmac( 'sha256', get_current_blog_id() . '|' . (int) Private_Site::on() . '|' . $id . '|' . $expires, wp_salt( 'auth' ) ), 0, 32 );
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
	 * The file is the one the track plays: its streaming version when it streams one. An address
	 * a riff_track filter put in its place, a service's own, say, is left as it is.
	 *
	 * @since 4.18.0
	 * @since 5.8.0 The streaming version's file, and only the file's own address.
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
		$stream = Media::stream( $id );
		$file   = $stream ? $stream : $id;
		if ( self::is( $file ) && ! empty( $track['src'] ) && wp_get_attachment_url( $file ) === $track['src'] && self::readable( $file ) && ( $file !== $id || self::songs_allow( $id ) ) ) {
			$track['src'] = self::signed( $file );
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
		if ( ! Private_Site::allowed() || ! self::readable( $id ) ) {
			return false;
		}
		$track = Tracks::from_attachment( $id, (int) get_post_field( 'post_parent', $id ) );
		return null !== $track && ! $track['locked'] && self::songs_allow( $id );
	}

	/**
	 * Whether a file that is a song's video or streaming version may go to the current visitor by
	 * the rules a plugin keeps for the song. A file that is nobody's version answers only to its own.
	 *
	 * @param int $id Attachment ID.
	 * @return bool
	 */
	private static function songs_allow( int $id ): bool {
		static $asking = array();
		$songs         = self::songs_of( $id );
		// Reading a song signs its own files, which may ask this again.
		if ( ! $songs || isset( $asking[ $id ] ) ) {
			return true;
		}
		$asking[ $id ] = true;
		$allowed       = false;
		foreach ( $songs as $song ) {
			$of = Tracks::from_attachment( $song, (int) get_post_field( 'post_parent', $song ) );
			if ( null !== $of && ! $of['locked'] ) {
				$allowed = true;
				break;
			}
		}
		unset( $asking[ $id ] );
		return $allowed;
	}

	/**
	 * Whether the current visitor may read a post that has a file: the one it was uploaded to, or
	 * for a file uploaded to none, a post that plays it or that of the song it is a version of,
	 * since picking a file from the Media Library doesn't attach it. A post counts only if its
	 * author may edit the file, so nobody opens a file by naming it in a post or playlist of their
	 * own. Someone who may edit a protected file may always have it. A file no such post has
	 * belongs to nobody else yet.
	 *
	 * @param int $id Attachment ID.
	 * @return bool
	 */
	private static function readable( int $id ): bool {
		$post = self::post_of( $id );
		if ( $post ) {
			return self::post_readable( $post );
		}
		// A file that isn't protected and was uploaded to no post is public, as core has it.
		if ( ! self::is( $id ) ) {
			return true;
		}
		if ( current_user_can( 'edit_post', $id ) ) {
			return true;
		}
		foreach ( self::songs_of( $id ) as $song ) {
			$post = self::post_of( $song );
			if ( $post ? self::post_readable( $post ) : array_filter( self::posts_playing( $song ), array( self::class, 'post_readable' ) ) ) {
				return true;
			}
		}
		return (bool) array_filter( self::posts_playing( $id ), array( self::class, 'post_readable' ) );
	}

	/**
	 * The post a file was uploaded to, if it still exists.
	 *
	 * @param int $id Attachment ID.
	 * @return WP_Post|null
	 */
	private static function post_of( int $id ): ?WP_Post {
		$parent = (int) get_post_field( 'post_parent', $id );
		$post   = $parent ? get_post( $parent ) : null;
		return $post instanceof WP_Post ? $post : null;
	}

	/**
	 * Whether the current visitor may read a post: one that is public or that they may read, and
	 * behind a password only once they have given it, as its content is. Someone who may edit the
	 * post needs no password, as in the REST API.
	 *
	 * @param WP_Post $post Post.
	 * @return bool
	 */
	private static function post_readable( WP_Post $post ): bool {
		if ( post_password_required( $post ) && ! current_user_can( 'edit_post', $post->ID ) ) {
			return false;
		}
		return is_post_publicly_viewable( $post ) || current_user_can( 'read_post', $post->ID );
	}

	/**
	 * The songs a file is the video or streaming version of.
	 *
	 * @param int $id Attachment ID.
	 * @return int[] Attachment IDs.
	 */
	private static function songs_of( int $id ): array {
		static $found = array();
		if ( isset( $found[ $id ] ) ) {
			return $found[ $id ];
		}
		$found[ $id ] = get_posts(
			array(
				'post_type'        => 'attachment',
				'post_status'      => 'inherit',
				'fields'           => 'ids',
				'numberposts'      => -1,
				'suppress_filters' => false,
				'meta_query'       => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- only for a protected file uploaded to no post.
					'relation' => 'OR',
					array(
						'key'   => Media::VIDEO_META,
						'value' => $id,
					),
					array(
						'key'   => Media::STREAM_META,
						'value' => $id,
					),
				),
			)
		);
		return $found[ $id ];
	}

	/**
	 * The posts whose track blocks name a file and whose author may edit it, once a request. A search of post content, so it is
	 * asked only for a protected file uploaded to no post, and the blocks themselves then decide,
	 * since "id":12 is also how "id":123 begins.
	 *
	 * @param int $id Attachment ID.
	 * @return WP_Post[]
	 */
	private static function posts_playing( int $id ): array {
		static $found = array();
		if ( ! isset( $found[ $id ] ) ) {
			global $wpdb;
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- a search of content, which no API offers by a block's attribute.
			$ids          = $wpdb->get_col( $wpdb->prepare( "SELECT ID FROM {$wpdb->posts} WHERE post_type NOT IN ('revision','attachment') AND post_status NOT IN ('trash','auto-draft','inherit') AND post_content LIKE %s", '%' . $wpdb->esc_like( '"id":' . $id ) . '%' ) );
			$found[ $id ] = array_values(
				array_filter(
					array_filter( array_map( 'get_post', array_map( 'intval', $ids ) ) ),
					static fn( WP_Post $post ): bool => user_can( (int) $post->post_author, 'edit_post', $id ) && in_array( $id, Blocks_Source::attachments( $post ), true )
				)
			);
		}
		return $found[ $id ];
	}

	/**
	 * Locks a protected file no post the visitor may read has: it stays listed, as a file uploaded
	 * to no post is, with no file to play rather than one that is refused.
	 *
	 * @since 6.2.0
	 *
	 * @param bool  $allowed Whether the track plays.
	 * @param array $track   Track.
	 * @param int   $id      Attachment ID, or 0.
	 * @return bool
	 */
	public static function lock( $allowed, $track, $id ) {
		unset( $track );
		return $allowed && ( ! $id || self::post_of( (int) $id ) || self::readable( (int) $id ) );
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
			// A file not yet moved on a private site, whose public address is no one's to be told.
			if ( ! Private_Site::allowed() ) {
				self::refuse( 403 );
			}
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
		 * X-Sendfile names the file's absolute path, wherever it is kept, so with RIFF_PROTECTED_PATH
		 * the web server must be allowed that folder (XSendFilePath on Apache). X-Accel-Redirect
		 * names the file's address under uploads, or, with RIFF_PROTECTED_PATH, its path inside that
		 * folder under /riff-protected/, which an internal location aliases to it; a file in neither,
		 * as one not yet moved into the folder it belongs in is, is sent from PHP instead.
		 *
		 * @since 4.18.0
		 * @since 6.5.0 With RIFF_PROTECTED_PATH, x-accel-redirect names /riff-protected/.
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
		$accel = 'x-accel-redirect' === $how ? self::accel( $file ) : '';
		if ( '' !== $accel ) {
			header( 'X-Accel-Redirect: ' . $accel );
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
	 * The address Nginx's internal location has a protected file at: under uploads, or under
	 * /riff-protected/ for a folder at RIFF_PROTECTED_PATH. Empty for a file in neither, which PHP
	 * sends instead.
	 *
	 * @since 6.5.0
	 *
	 * @param string $file Absolute path.
	 * @return string
	 */
	public static function accel( string $file ): string {
		$base = Protected_Files::base();
		if ( '' !== $base ) {
			$rel = Protected_Files::relative( $file, $base );
			return $rel !== $file ? '/riff-protected/' . $rel : '';
		}
		$rel = Protected_Files::relative( $file );
		return $rel !== $file ? (string) wp_parse_url( wp_upload_dir( null, false )['baseurl'], PHP_URL_PATH ) . '/' . $rel : '';
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
		if ( '' === $error && self::is( $post->ID ) && self::open() ) {
			$error = __( 'The web server still sends this file to anyone who has the protected folder\'s address, as Nginx ignores the rule Riff leaves for Apache. Tools > Site Health shows the rule that closes the folder.', 'riff' );
		}
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
			'helps' => self::is( $post->ID ) || Protected_Files::local( (string) get_attached_file( $post->ID, true ) )
				? __( 'Moves the file into a folder the web server refuses, and serves it through WordPress to whoever can read its post. Posts that link to it are updated.', 'riff' )
				: __( 'This file is kept off this server, so the plugin that stores it has to make it private there; without one that can, it stays public. Riff then serves it to whoever can read its post. Posts that link to it are updated.', 'riff' ),
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
		$open   = Protected_Files::folders() && self::probe();
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
		if ( $open ) {
			$result['status']      = 'recommended';
			$result['label']       = __( 'Riff\'s protected files can be loaded directly', 'riff' );
			$result['description'] = self::advice();
		}
		return $result;
	}

	/**
	 * How to close a protected folder the web server sends: keep it outside the web root, or, on
	 * Nginx, refuse it with a rule.
	 *
	 * @since 6.5.0
	 *
	 * @return string HTML.
	 */
	public static function advice(): string {
		$folder = (string) wp_parse_url( Protected_Files::url( Protected_Files::exposed() ), PHP_URL_PATH );
		return '<p>' . esc_html__( 'The web server sends files from the protected folder to anyone who has their address, so protecting a file only hides that address. Nginx, which many hosts run, ignores the rule Riff leaves there for Apache.', 'riff' ) . '</p><p>' . sprintf(
			/* translators: %s: RIFF_PROTECTED_PATH. */
			esc_html__( 'Keep protected files outside the web root: define %s in wp-config.php as a folder the web server never serves, and Riff moves them there. Or add this rule to the site\'s Nginx configuration:', 'riff' ),
			'<code>RIFF_PROTECTED_PATH</code>'
		) . '</p><p><code>location ^~ ' . esc_html( $folder ) . '/ { internal; }</code></p>';
	}

	/**
	 * Whether the web server sends files from the protected folder to anyone, by asking it for one,
	 * as Nginx does when it ignores the .htaccess Apache reads. Kept for a day, so the Media Library
	 * and the notice can say so without asking again. The folder asked about is the one files belong
	 * in, or, while they are still being moved out of one in the web root, that one. A folder
	 * outside the web root has no address to ask at, and isn't asked.
	 *
	 * @since 5.7.0
	 * @since 6.5.0 Not asked for a folder outside the web root.
	 *
	 * @return bool
	 */
	public static function probe(): bool {
		$folder = Protected_Files::exposed();
		$now    = Protected_Files::path();
		// The folder files belong in is made if it isn't yet; an old one is asked about only while it is there.
		if ( $now === $folder ) {
			$folder = Protected_Files::dir();
		}
		$url = '' !== $folder && is_dir( $folder ) ? Protected_Files::url( $folder ) : '';
		if ( '' === $url ) {
			set_transient( self::OPEN, '0', DAY_IN_SECONDS );
			return false;
		}
		$probe = $folder . '/riff-probe.txt';
		file_put_contents( $probe, 'riff' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- a probe, removed below. isolation: write -- the protected folder under uploads, or in the web root, as one outside it isn't asked.
		$response = wp_remote_get(
			$url . '/riff-probe.txt',
			array(
				'timeout'   => 3,
				/** This filter is documented in wp-includes/cron.php */
				'sslverify' => apply_filters( 'https_local_ssl_verify', false ), // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- core's own filter, applied as core applies it.
			)
		);
		wp_delete_file( $probe );
		$open = 200 === wp_remote_retrieve_response_code( $response ) && 'riff' === wp_remote_retrieve_body( $response );
		set_transient( self::OPEN, $open ? '1' : '0', DAY_IN_SECONDS );
		return $open;
	}

	/**
	 * Whether the protected folder was found open when last asked. Never asks itself, so the Media
	 * Library doesn't wait on a request: when nobody has asked for a day, asking is left to cron.
	 *
	 * @since 5.7.0
	 * @since 6.5.0 Never for a folder outside the web root, or before a file was protected.
	 *
	 * @return bool
	 */
	public static function open(): bool {
		if ( ! Protected_Files::folders() || '' === Protected_Files::exposed() ) {
			return false;
		}
		$open = get_transient( self::OPEN );
		if ( false === $open && ! wp_next_scheduled( self::PROBE ) ) {
			wp_schedule_single_event( time(), self::PROBE );
		}
		return '1' === $open;
	}
}
