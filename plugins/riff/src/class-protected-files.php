<?php
/**
 * The files behind Protect: moved into the protected folder and back, and relinked.
 *
 * @since 4.33.0
 * @package Riff
 */

namespace Riff;

use WP_Error;

defined( 'ABSPATH' ) || exit;

/**
 * Where a protected file lives: the folder under uploads the web server is told to refuse, made
 * and guarded the first time it is needed; moving a file in and out of it, numbered as uploads
 * are when a name is taken; and relinking every post that named the file. The gate, who may
 * have a file and how it is served, is Protect.
 */
final class Protected_Files {

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
		if ( Protect::is( $id ) ) {
			return true;
		}
		$type = strtok( (string) get_post_mime_type( $id ), '/' );
		if ( 'audio' !== $type && 'video' !== $type ) {
			return new WP_Error( 'riff_protect_file', __( 'Only an audio or video file in the Media Library can be protected.', 'riff' ) );
		}
		$file  = (string) get_attached_file( $id, true );
		$local = self::local( $file );
		$from  = (string) wp_get_attachment_url( $id );
		$rel   = self::relative( $file );
		$to    = $local ? self::free( self::dir() . '/' . ltrim( $rel, '/' ) ) : '';
		if ( $local && ! self::move( $file, $to ) ) {
			return new WP_Error( 'riff_protect_move', __( 'The file could not be moved into the protected folder.', 'riff' ) );
		}
		$done = self::storage( $id, true );
		if ( true !== $done && ( ! $local || is_wp_error( $done ) ) ) {
			// Put back, so a file is never half protected.
			if ( $local ) {
				self::move( $to, $file );
			}
			return is_wp_error( $done ) ? $done : new WP_Error( 'riff_protect_storage', __( 'This file is kept off this server, so moving it would leave it public there. Protecting it needs the plugin that stores it to make it private.', 'riff' ) );
		}
		if ( $local ) {
			update_attached_file( $id, $to );
		}
		update_post_meta( $id, self::META, $rel );
		self::relink( $from, Protect::address( $id ) );
		return true;
	}

	/**
	 * Whether a file is on this server, in a folder the web server can be told to refuse: not in
	 * object storage through a stream wrapper, as S3 Uploads keeps uploads, and not removed after
	 * its copy there, as WP Offload Media can.
	 *
	 * @since 5.7.0
	 *
	 * @param string $file Absolute path.
	 * @return bool
	 */
	public static function local( string $file ): bool {
		return '' !== $file && ! wp_is_stream( $file ) && is_file( $file );
	}

	/**
	 * Asks the plugin that stores a file elsewhere to make it private, or public again.
	 *
	 * @param int  $id      Attachment ID.
	 * @param bool $protect Whether it is being protected.
	 * @return true|WP_Error|null Null when no plugin keeps it elsewhere.
	 */
	private static function storage( int $id, bool $protect ) {
		/**
		 * Filters whether the storage a file is kept in elsewhere was made private, when it is
		 * protected, or public again, when it isn't. A plugin that keeps uploads in object storage
		 * or on a CDN answers for its own files: true once the copy there is private (or public
		 * again), or a WP_Error to say why it couldn't be, which the Media Library shows. Without an
		 * answer, a file only on this server is moved into the protected folder, and one kept
		 * elsewhere is not protected, as moving it would leave it public there.
		 *
		 * @since 5.7.0
		 *
		 * @param true|WP_Error|null $done    Null, the default: nothing keeps it elsewhere.
		 * @param int                $id      Attachment ID.
		 * @param bool               $protect True to make it private, false to make it public again.
		 */
		$done = apply_filters( 'riff_protect_storage', null, $id, $protect );
		return true === $done || is_wp_error( $done ) ? $done : null;
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
		if ( ! Protect::is( $id ) ) {
			return true;
		}
		$file = (string) get_attached_file( $id, true );
		$rel  = (string) get_post_meta( $id, self::META, true );
		// In the protected folder on this server, or kept elsewhere by the plugin that protected it.
		$local = ! wp_is_stream( $file ) && str_starts_with( $file, self::dir() . '/' );
		$to    = $local ? self::free( trailingslashit( wp_upload_dir( null, false )['basedir'] ) . ltrim( $rel, '/' ) ) : '';
		if ( $local && ( ! is_file( $file ) || ! self::move( $file, $to ) ) ) {
			return new WP_Error( 'riff_protect_move', __( 'The file could not be moved out of the protected folder.', 'riff' ) );
		}
		$done = self::storage( $id, false );
		if ( true !== $done && ( ! $local || is_wp_error( $done ) ) ) {
			// Put back, so a file is never half public.
			if ( $local ) {
				self::move( $to, $file );
			}
			return is_wp_error( $done ) ? $done : new WP_Error( 'riff_protect_storage', __( 'This file is kept off this server. Making it public again needs the plugin that stores it.', 'riff' ) );
		}
		$from = Protect::address( $id );
		if ( $local ) {
			update_attached_file( $id, $to );
		}
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
	public static function relative( string $path ): string {
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
		return self::relink_all( array( $from => $to ) );
	}

	/**
	 * Replaces many files' addresses at once: a search through every post's content can't use an
	 * index, so many files moving together, as when Riff is uninstalled, search fifty addresses at a
	 * time rather than one, and each post is rewritten once, with every address it names.
	 *
	 * @since 5.7.0
	 *
	 * @param array<string,string> $addresses New address by old.
	 * @return int Posts changed.
	 */
	public static function relink_all( array $addresses ): int {
		global $wpdb;
		$addresses = array_filter( $addresses, static fn( $to, $from ) => '' !== (string) $from && (string) $from !== (string) $to, ARRAY_FILTER_USE_BOTH );
		$changed   = 0;
		foreach ( array_chunk( $addresses, 50, true ) as $some ) {
			$like = implode( ' OR ', array_fill( 0, count( $some ), 'post_content LIKE %s' ) );
			$args = array_map( static fn( $from ) => '%' . $wpdb->esc_like( (string) $from ) . '%', array_keys( $some ) );
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- a search no WP_Query offers, its placeholders built above.
			$ids = $wpdb->get_col( $wpdb->prepare( "SELECT ID FROM {$wpdb->posts} WHERE post_type NOT IN ( 'revision', 'attachment' ) AND ( $like )", $args ) );
			foreach ( $ids as $post_id ) {
				$content = (string) get_post_field( 'post_content', (int) $post_id, 'raw' );
				$updated = self::replace_all( $some, $content );
				if ( $updated === $content ) {
					continue;
				}
				// Straight to the row: an address changing is not an edit, so no revision and no kses.
				$wpdb->update( $wpdb->posts, array( 'post_content' => $updated ), array( 'ID' => (int) $post_id ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
				clean_post_cache( (int) $post_id );
				++$changed;
			}
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
		return self::replace_all( array( $from => $to ), $text );
	}

	/**
	 * Replaces many addresses in text in one pass, each where it is the whole address, so one
	 * file's new address is never taken for another's old one.
	 *
	 * @param array<string,string> $addresses New address by old.
	 * @param string               $text      Text.
	 * @return string
	 */
	private static function replace_all( array $addresses, string $text ): string {
		if ( ! $addresses ) {
			return $text;
		}
		// The longest first, so a shorter address is not found at the start of a longer one.
		$froms = array_map( 'strval', array_keys( $addresses ) );
		usort( $froms, static fn( $a, $b ) => strlen( $b ) <=> strlen( $a ) );
		$pattern = '/(?:' . implode( '|', array_map( static fn( $from ) => preg_quote( $from, '/' ), $froms ) ) . ')(?![0-9])/';
		return (string) preg_replace_callback( $pattern, static fn( $m ) => (string) $addresses[ $m[0] ], $text );
	}
}
