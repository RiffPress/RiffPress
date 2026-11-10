<?php
/**
 * The files behind Protect: moved into the protected folder and back, and relinked.
 *
 * @since 4.33.0
 * @package Riff
 */

namespace Riff;

use FilesystemIterator;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use WP_Error;
use WP_Site;

defined( 'ABSPATH' ) || exit;

/**
 * Where a protected file lives: a folder of its own, under uploads where the web server is told
 * to refuse it, or outside the web root where a host names a path with RIFF_PROTECTED_PATH or the
 * riff_protected_path filter, made and guarded the first time it is needed; moving a file in and
 * out of it, numbered as uploads are when a name is taken, and on to a new folder when the path
 * changes; and relinking every post that named the file. The gate, who may have a file and how it
 * is served, is Protect.
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
	 * Option holding the folders protected files may be in: the one they are kept in now, last, and
	 * any they are still to be moved out of.
	 *
	 * @since 6.5.0
	 */
	public const FOLDERS = 'riff_protected_folders';

	/**
	 * Option holding how far the move to a new folder has got.
	 *
	 * @since 6.5.0
	 */
	public const MOVE = 'riff_protected_move_state';

	/**
	 * Option held while a pass of the move runs, so cron and WP-CLI never move the same file at once.
	 *
	 * @since 6.5.0
	 */
	public const LOCK = 'riff_protected_move_lock';

	/**
	 * Attachment meta holding where a file is being moved to, until it is there, so a move cut
	 * short is finished rather than lost.
	 *
	 * @since 6.5.0
	 */
	public const MOVING = '_riff_protected_moving';

	/**
	 * The cron event that moves protected files to a new folder, a batch at a time.
	 *
	 * @since 6.5.0
	 */
	public const JOB = 'riff_protected_move';

	/**
	 * How many files a pass of the move takes.
	 *
	 * @since 6.5.0
	 */
	public const BATCH = 25;

	/**
	 * The protected folder, made and guarded the first time it is needed.
	 *
	 * @since 4.18.0
	 * @since 6.5.0 Under RIFF_PROTECTED_PATH, or the riff_protected_path filter's path, when one is set.
	 *
	 * @return string Absolute path, without a trailing slash.
	 */
	public static function dir(): string {
		$path = self::path();
		if ( ! is_dir( $path ) ) {
			// isolation: write -- the protected folder: under uploads, or under RIFF_PROTECTED_PATH, outside the web root.
			wp_mkdir_p( $path );
		}
		if ( is_dir( $path ) ) {
			self::guard( $path );
			self::remember( $path );
		}
		return $path;
	}

	/**
	 * Where the protected folder is, without making it: the site's folder under the path a host
	 * set, or under uploads.
	 *
	 * @since 6.5.0
	 *
	 * @return string Absolute path, without a trailing slash.
	 */
	public static function path(): string {
		$base = self::base();
		if ( '' === $base ) {
			return self::uploads() . '/' . self::name();
		}
		// A network's sites share the path, and each keeps a folder of its own in it.
		return $base . '/' . ( is_multisite() ? (string) get_current_blog_id() : self::name() );
	}

	/**
	 * The path a host set for protected files, when Riff can use it: empty for uploads.
	 *
	 * @since 6.5.0
	 *
	 * @return string Absolute path, without a trailing slash, or empty.
	 */
	public static function base(): string {
		$base = self::configured();
		return '' !== $base && null === self::unfit( $base ) ? $base : '';
	}

	/**
	 * The path a host set for protected files, used or not.
	 *
	 * @since 6.5.0
	 *
	 * @return string Absolute path, without a trailing slash, or empty when none is set.
	 */
	public static function configured(): string {
		$base = defined( 'RIFF_PROTECTED_PATH' ) ? (string) constant( 'RIFF_PROTECTED_PATH' ) : '';

		/**
		 * Filters the folder protected files are kept in, so the web server never has them to
		 * send: an absolute path outside the web root, which Riff makes when it is first needed,
		 * keeping each site's files in a folder of its own inside it (the site's ID on a network).
		 * Empty, the default, keeps them in a folder under uploads, which Apache is told to refuse
		 * and Nginx needs a rule for.
		 *
		 * A path inside ABSPATH, wp-content, uploads, or the folder that holds both WordPress and wp-content, is refused with a notice,
		 * and the files stay under uploads; WP Engine's _wpeprivate folder at the site's root, which
		 * WP Engine never serves, is the one exception. When the path changes, Riff moves the files
		 * already protected to the new folder in the background, or at once with
		 * `wp riff protected move`. Defaults to the RIFF_PROTECTED_PATH constant.
		 *
		 * @since 6.5.0
		 *
		 * @param string $path Absolute path, or empty for the folder under uploads.
		 */
		$base = trim( (string) apply_filters( 'riff_protected_path', $base ) );
		return '' === $base ? '' : untrailingslashit( wp_normalize_path( $base ) );
	}

	/**
	 * Why the path a host set is not used, or null when it is, or none is set.
	 *
	 * @since 6.5.0
	 *
	 * @return string|null 'relative' for a path that is not absolute, 'web' for one inside the web root.
	 */
	public static function refusal(): ?string {
		$base = self::configured();
		return '' === $base ? null : self::unfit( $base );
	}

	/**
	 * Why a path can't hold protected files, or null when it can.
	 *
	 * @param string $base Normalized path.
	 * @return string|null
	 */
	private static function unfit( string $base ): ?string {
		if ( wp_is_stream( $base ) || ! path_is_absolute( $base ) || preg_match( '#(^|/)\.\.?(/|$)#', $base ) ) {
			return 'relative';
		}
		$roots = array_map( static fn( $root ) => untrailingslashit( wp_normalize_path( (string) $root ) ), array( ABSPATH, WP_CONTENT_DIR, (string) wp_upload_dir( null, false )['basedir'] ) );
		// The folder holding both WordPress and wp-content, the web root where they are apart (as
		// Bedrock's web/ holds wp/ and app/). Read from the install, never the request, so the web
		// and WP-CLI agree.
		$roots[] = self::common( $roots[0], $roots[1] );
		$roots   = array_filter( $roots );
		// WP Engine refuses every request for _wpeprivate at the site's root: outside the web, though under ABSPATH.
		$private = array( untrailingslashit( wp_normalize_path( ABSPATH ) ) . '/_wpeprivate' );
		// As written, and with any link in it followed, so a link into the web root is found too.
		foreach ( array( false, true ) as $real ) {
			$path = $real ? self::real( $base ) : $base;
			$in   = static fn( array $folders ): bool => (bool) array_filter( $folders, static fn( $folder ) => self::within( $path, $real ? self::real( $folder ) : $folder ) );
			if ( ! $in( $private ) && $in( $roots ) ) {
				return 'web';
			}
		}
		return null;
	}

	/**
	 * The deepest folder two paths share, or empty when it is the filesystem's root.
	 *
	 * @param string $a Path.
	 * @param string $b Path.
	 * @return string
	 */
	private static function common( string $a, string $b ): string {
		$a    = explode( '/', $a );
		$b    = explode( '/', $b );
		$same = array();
		foreach ( $a as $i => $part ) {
			if ( ! isset( $b[ $i ] ) || $b[ $i ] !== $part ) {
				break;
			}
			$same[] = $part;
		}
		return implode( '/', $same );
	}

	/**
	 * Whether a path is a folder or inside it.
	 *
	 * @param string $path   Path.
	 * @param string $folder Folder, without a trailing slash.
	 * @return bool
	 */
	private static function within( string $path, string $folder ): bool {
		return '' !== $folder && ( $path === $folder || str_starts_with( $path, $folder . '/' ) );
	}

	/**
	 * A path with the links in the part of it that exists followed.
	 *
	 * @param string $path Absolute path.
	 * @return string
	 */
	private static function real( string $path ): string {
		$rest = '';
		while ( ! file_exists( $path ) && dirname( $path ) !== $path ) {
			$rest = '/' . basename( $path ) . $rest;
			$path = dirname( $path );
		}
		$real = realpath( $path );
		return untrailingslashit( false === $real ? $path : wp_normalize_path( $real ) ) . $rest;
	}

	/**
	 * The uploads folder, without a trailing slash.
	 *
	 * @return string
	 */
	private static function uploads(): string {
		return untrailingslashit( (string) wp_upload_dir( null, false )['basedir'] );
	}

	/**
	 * The site's protected folder's name, made the first time it is asked for.
	 *
	 * @return string
	 */
	private static function name(): string {
		$name = get_option( self::DIR );
		if ( ! is_string( $name ) || ! preg_match( '/^riff-protected-[a-z0-9]{20}$/', $name ) ) {
			$name = 'riff-protected-' . strtolower( wp_generate_password( 20, false ) );
			update_option( self::DIR, $name, false );
		}
		return $name;
	}

	/**
	 * The folders protected files may be in: the one they are kept in now, last, and any a move
	 * has not yet emptied. None until a file was first protected.
	 *
	 * @since 6.5.0
	 *
	 * @return string[] Absolute paths, without trailing slashes.
	 */
	public static function folders(): array {
		$known = get_option( self::FOLDERS );
		$known = is_array( $known ) ? array_values( array_filter( array_map( 'strval', $known ) ) ) : array();
		$name  = get_option( self::DIR );
		// Until 6.5.0 there was only the one, under uploads.
		if ( ! $known && is_string( $name ) && preg_match( '/^riff-protected-[a-z0-9]{20}$/', $name ) ) {
			$known = array( self::uploads() . '/' . $name );
		}
		return $known;
	}

	/**
	 * Notes the folder files are protected in now, as the last of the folders.
	 *
	 * @param string $path Folder.
	 */
	private static function remember( string $path ): void {
		$known = self::folders();
		if ( end( $known ) === $path ) {
			return;
		}
		$known   = array_values( array_diff( $known, array( $path ) ) );
		$known[] = $path;
		update_option( self::FOLDERS, $known, false );
		// A new folder is asked about afresh.
		delete_transient( Protect::OPEN );
	}

	/**
	 * Whether protected files may still be in a folder other than the one they belong in now.
	 *
	 * @since 6.5.0
	 *
	 * @return bool
	 */
	public static function pending(): bool {
		$known = self::folders();
		return $known && array( self::path() ) !== $known;
	}

	/**
	 * The protected folder a file is in, or empty.
	 *
	 * @param string $file Absolute path.
	 * @return string
	 */
	private static function folder_of( string $file ): string {
		$found = '';
		foreach ( array_merge( self::folders(), array( self::path() ) ) as $folder ) {
			if ( self::within( $file, $folder ) && strlen( $folder ) > strlen( $found ) ) {
				$found = $folder;
			}
		}
		return $found;
	}

	/**
	 * The protected folder the web server could send, if any: the one files belong in, when it is
	 * in the web root, or else one they are still to be moved out of. Empty when every folder that
	 * may hold a protected file is outside the web root.
	 *
	 * @since 6.5.0
	 *
	 * @return string Absolute path, without a trailing slash, or empty.
	 */
	public static function exposed(): string {
		foreach ( array_unique( array_merge( array( self::path() ), array_reverse( self::folders() ) ) ) as $folder ) {
			if ( '' !== self::url( $folder ) ) {
				return $folder;
			}
		}
		return '';
	}

	/**
	 * The address the web server would answer for a folder at, or empty for one outside the web
	 * root: under uploads, wp-content or WordPress's own folder.
	 *
	 * @since 6.5.0
	 *
	 * @param string $folder Absolute path, without a trailing slash.
	 * @return string Address, without a trailing slash.
	 */
	public static function url( string $folder ): string {
		$uploads = wp_upload_dir( null, false );
		foreach ( array(
			array( (string) $uploads['basedir'], (string) $uploads['baseurl'] ),
			array( WP_CONTENT_DIR, content_url() ),
			array( ABSPATH, site_url() ),
		) as list( $dir, $url ) ) {
			$dir = untrailingslashit( $dir );
			if ( self::within( $folder, $dir ) ) {
				return untrailingslashit( $url ) . substr( $folder, strlen( $dir ) );
			}
		}
		return '';
	}

	/**
	 * Tells Apache to refuse the folder and leaves no listing. Nginx needs the rule in the readme,
	 * or the folder outside the web root. Written there too, in case the web server can reach it.
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
				file_put_contents( "$path/$file", $contents ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- a two-line guard file, written once. isolation: write -- the protected folder, under uploads or RIFF_PROTECTED_PATH.
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
		// A note of a move from when the file was last protected is no longer about this file.
		delete_post_meta( $id, self::MOVING );
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
		 * elsewhere is not protected, as moving it would leave it public there. Riff can't send a
		 * file it doesn't have, so a plugin that protects its files signs their addresses through
		 * riff_protected_url too.
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
		// A move to a new folder cut short is finished or undone first, so its note never outlives it.
		$file = self::settle( $id );
		$rel  = (string) get_post_meta( $id, self::META, true );
		// In the protected folder on this server, or kept elsewhere by the plugin that protected it.
		$local = ! wp_is_stream( $file ) && '' !== self::folder_of( $file );
		$to    = $local ? self::free( self::uploads() . '/' . ltrim( $rel, '/' ) ) : '';
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
	 * A path under the uploads folder, as WordPress stores an attached file's, or under another
	 * folder; any other path as it is.
	 *
	 * @since 4.18.0
	 * @since 6.5.0 The folder to make it relative to.
	 *
	 * @param string $path   Absolute path.
	 * @param string $folder Folder. Default uploads.
	 * @return string
	 */
	public static function relative( string $path, string $folder = '' ): string {
		$base = trailingslashit( '' !== $folder ? $folder : self::uploads() );
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
	 * Moves a file, making its folder. On one disk that is a rename, which happens whole or not at
	 * all. Across disks, as a folder outside the web root can be, the file is copied beside its new
	 * name first, under a name nobody can guess, and renamed once it is whole, so the name never
	 * holds part of it, and the old one goes last. When the old one can't be removed, the copy goes
	 * instead and the move fails, so a file is never left public at its old place as well. A move
	 * cut short leaves the file where it was.
	 *
	 * @param string $from From.
	 * @param string $to   To.
	 * @return bool
	 */
	private static function move( string $from, string $to ): bool {
		// isolation: write -- between uploads and the protected folder, under uploads or RIFF_PROTECTED_PATH.
		wp_mkdir_p( dirname( $to ) );
		if ( self::device( $from ) === self::device( dirname( $to ) ) ) {
			return @rename( $from, $to ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.rename_rename -- a failure is reported to the person who asked. isolation: write -- under uploads or RIFF_PROTECTED_PATH.
		}
		$part = $to . '.' . strtolower( wp_generate_password( 16, false ) ) . '.riff-part';
		$size = filesize( $from );
		// isolation: write -- a copy beside the file's new name, in the protected folder or back under uploads.
		$copied = @copy( $from, $part ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- a failure is reported to the person who asked.
		clearstatcache( true, $part );
		// isolation: write -- the whole copy to its name, in the protected folder or under uploads.
		if ( ! $copied || filesize( $part ) !== $size || file_exists( $to ) || ! @rename( $part, $to ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.rename_rename -- reported to the person who asked.
			wp_delete_file( $part );
			return false;
		}
		wp_delete_file( $from );
		clearstatcache( true, $from );
		if ( file_exists( $from ) ) {
			wp_delete_file( $to );
			return false;
		}
		return true;
	}

	/**
	 * The copies a move across disks left beside a file's new name when it was cut short.
	 *
	 * @param string $to The new name.
	 * @return string[] Paths.
	 */
	private static function parts( string $to ): array {
		$dir   = dirname( $to );
		$start = basename( $to ) . '.';
		$names = is_dir( $dir ) ? (array) scandir( $dir ) : array();
		return array_map(
			static fn( $name ) => $dir . '/' . $name,
			array_values( array_filter( $names, static fn( $name ) => str_starts_with( (string) $name, $start ) && str_ends_with( (string) $name, '.riff-part' ) ) )
		);
	}

	/**
	 * Finishes or undoes a move to a new folder that was cut short, and forgets it: a file moved
	 * before WordPress was told is told now; a copy, whole or part, beside a file still where
	 * WordPress has it goes, never the file itself.
	 *
	 * @param int $id Attachment ID.
	 * @return string Where the file is.
	 */
	private static function settle( int $id ): string {
		$file   = (string) get_attached_file( $id, true );
		$moving = (string) get_post_meta( $id, self::MOVING, true );
		if ( '' === $moving ) {
			return $file;
		}
		if ( $moving !== $file && '' !== self::folder_of( $moving ) ) {
			if ( ! is_file( $file ) && is_file( $moving ) ) {
				update_attached_file( $id, $moving );
				$file = $moving;
			} elseif ( is_file( $file ) ) {
				array_map( 'wp_delete_file', self::parts( $moving ) );
				if ( is_file( $moving ) ) {
					wp_delete_file( $moving );
				}
			}
		}
		delete_post_meta( $id, self::MOVING );
		return $file;
	}

	/**
	 * The disk a path is on.
	 *
	 * @param string $path Path.
	 * @return int Device number, or -1 when it can't be read.
	 */
	private static function device( string $path ): int {
		$stat = @stat( $path ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- a path that can't be read counts as another disk, the careful way to move.
		return false === $stat ? -1 : (int) $stat['dev'];
	}

	/**
	 * Moves a protected file into the folder protected files belong in now, first finishing a move
	 * that was cut short. Its address, ?riff-file=ID, is the same wherever it is kept, so no post
	 * needs relinking, and its place under uploads, to go back to, stays as it was.
	 *
	 * @since 6.5.0
	 *
	 * @param int $id Attachment ID.
	 * @return bool|WP_Error True when the file moved, false when it had nowhere to go.
	 */
	public static function relocate( int $id ) {
		$file = self::settle( $id );
		$dir  = self::dir();
		$from = self::folder_of( $file );
		if ( $from === $dir || '' === $from || wp_is_stream( $file ) ) {
			// Already there, kept elsewhere by the plugin that protected it, or in no folder of Riff's.
			return false;
		}
		if ( ! is_file( $file ) ) {
			/* translators: %d: attachment ID. */
			return new WP_Error( 'riff_protect_missing', sprintf( __( 'Protected file %d is not where WordPress has it.', 'riff' ), $id ) );
		}
		if ( ! is_dir( $dir ) || ! wp_is_writable( $dir ) ) {
			/* translators: %s: folder. */
			return new WP_Error( 'riff_protect_move', sprintf( __( 'Riff could not make or write to %s.', 'riff' ), $dir ) );
		}
		$to = self::free( $dir . '/' . self::relative( $file, $from ) );
		update_post_meta( $id, self::MOVING, $to );
		if ( ! self::move( $file, $to ) ) {
			delete_post_meta( $id, self::MOVING );
			/* translators: 1: attachment ID, 2: folder. */
			return new WP_Error( 'riff_protect_move', sprintf( __( 'Protected file %1$d could not be moved to %2$s.', 'riff' ), $id, $dir ) );
		}
		update_attached_file( $id, $to );
		delete_post_meta( $id, self::MOVING );
		return true;
	}

	/**
	 * Moves the next batch of protected files to the folder they belong in now. Once a pass has
	 * moved them all, the old folders are forgotten. A file that could not be moved stays protected
	 * where it is, and its folder stays known, until a later pass, an hour on, moves it.
	 *
	 * @since 6.5.0
	 *
	 * One pass runs at a time, whether cron's or WP-CLI's: another finds the move busy and leaves it.
	 *
	 * @param int $count How many files to try.
	 * @return array{moved:int,errors:array<int,string>,left:bool,busy:bool} How many moved, why any didn't, whether more are left to try, and whether another pass was already moving them.
	 */
	public static function migrate( int $count = self::BATCH ): array {
		if ( ! self::lock() ) {
			return array(
				'moved'  => 0,
				'errors' => array(),
				'left'   => false,
				'busy'   => true,
			);
		}
		try {
			return self::pass( $count );
		} finally {
			delete_option( self::LOCK );
		}
	}

	/**
	 * Takes the move for this pass: free, or held by a pass that has said nothing for a quarter of
	 * an hour, as one cut short leaves it.
	 *
	 * @return bool
	 */
	private static function lock(): bool {
		if ( add_option( self::LOCK, time(), '', false ) ) {
			return true;
		}
		if ( time() - (int) get_option( self::LOCK ) < 15 * MINUTE_IN_SECONDS ) {
			return false;
		}
		update_option( self::LOCK, time(), false );
		return true;
	}

	/**
	 * One pass of the move, with the lock held.
	 *
	 * @param int $count How many files to try.
	 * @return array{moved:int,errors:array<int,string>,left:bool,busy:bool}
	 */
	private static function pass( int $count ): array {
		global $wpdb;
		$dir   = self::dir();
		$state = get_option( self::MOVE );
		if ( ! is_array( $state ) || ( $state['to'] ?? '' ) !== $dir ) {
			$state = array(
				'to'     => $dir,
				'after'  => 0,
				'failed' => 0,
			);
		}
		// By ID, on from where the last pass stopped, as a file that moved looks no different to a query.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- a background job, a batch at a time, paged by ID as WP_Query can't.
		$ids    = $wpdb->get_col( $wpdb->prepare( "SELECT DISTINCT post_id FROM {$wpdb->postmeta} WHERE meta_key = %s AND post_id > %d ORDER BY post_id ASC LIMIT %d", self::META, (int) $state['after'], $count ) );
		$moved  = 0;
		$errors = array();
		foreach ( $ids as $id ) {
			$done = self::relocate( (int) $id );
			if ( is_wp_error( $done ) ) {
				$errors[ (int) $id ] = $done->get_error_message();
				++$state['failed'];
			} elseif ( $done ) {
				++$moved;
			}
			// After each file, so a pass cut short starts where it stopped, and the lock stays its own.
			$state['after'] = (int) $id;
			update_option( self::MOVE, $state, false );
			update_option( self::LOCK, time(), false );
		}
		$left = count( $ids ) === $count;
		if ( $left ) {
			update_option( self::MOVE, $state, false );
		} elseif ( ! $state['failed'] ) {
			update_option( self::FOLDERS, array( $dir ), false );
			delete_option( self::MOVE );
			// The folders the web server could send are fewer now, so it is asked afresh.
			delete_transient( Protect::OPEN );
		} else {
			update_option(
				self::MOVE,
				array(
					'to'     => $dir,
					'after'  => 0,
					'failed' => 0,
					'stuck'  => (int) $state['failed'],
					'tried'  => time(),
				),
				false
			);
		}
		return array(
			'moved'  => $moved,
			'errors' => $errors,
			'left'   => $left,
			'busy'   => false,
		);
	}

	/**
	 * Deletes a protected file kept outside uploads with its attachment, which core leaves, as it
	 * deletes only files under uploads.
	 *
	 * @since 6.5.0
	 *
	 * @param int $id Attachment ID.
	 */
	public static function deleted( $id ): void {
		$id = (int) $id;
		if ( ! Protect::is( $id ) ) {
			return;
		}
		$file = self::settle( $id );
		if ( ! wp_is_stream( $file ) && '' !== self::folder_of( $file ) && ! self::within( $file, self::uploads() ) && is_file( $file ) ) {
			wp_delete_file( $file );
		}
	}

	/**
	 * Removes a deleted site's folder under the path a host set. Core empties the site's uploads
	 * folder, where protected files are by default, but knows nothing of a folder outside it, so
	 * without this the site's protected files would stay on the disk, and a site later given the
	 * same ID would find them in its own folder. Only that site's folder goes, never the path
	 * itself, and a link is removed, never what it leads to.
	 *
	 * @since 6.7.1
	 *
	 * @param WP_Site $site The site being deleted.
	 */
	public static function forget( $site ): void {
		$base = self::base();
		$id   = $site instanceof WP_Site ? (int) $site->blog_id : 0;
		if ( '' === $base || $id < 1 ) {
			return;
		}
		$folder = $base . '/' . $id;
		if ( ! is_dir( $folder ) || is_link( $folder ) ) {
			return;
		}
		$items = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $folder, FilesystemIterator::SKIP_DOTS ), RecursiveIteratorIterator::CHILD_FIRST );
		foreach ( $items as $item ) {
			// isolation: write -- a deleted site's own folder under RIFF_PROTECTED_PATH, emptied as core empties its uploads.
			$item->isDir() && ! $item->isLink() ? rmdir( $item->getPathname() ) : unlink( $item->getPathname() ); // phpcs:ignore WordPress.WP.AlternativeFunctions -- outside uploads, where WP_Filesystem may not reach.
		}
		// isolation: write -- the folder itself, now empty.
		rmdir( $folder ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_rmdir -- emptied just above.
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
		$olds = array_map( 'strval', array_keys( $addresses ) );
		usort( $olds, static fn( $a, $b ) => strlen( $b ) <=> strlen( $a ) );
		$pattern = '/(?:' . implode( '|', array_map( static fn( $from ) => preg_quote( $from, '/' ), $olds ) ) . ')(?![0-9])/';
		return (string) preg_replace_callback( $pattern, static fn( $m ) => (string) $addresses[ $m[0] ], $text );
	}
}
