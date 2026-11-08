<?php
/**
 * What a Riff archive holds, and the rewriting that moves its content from one site to another.
 *
 * @since 6.5.0
 * @package Riff
 */

namespace Riff;

use PDO;
use WP_Error;
use ZipArchive;

defined( 'ABSPATH' ) || exit;

/**
 * A Riff archive: one site's music as one zip, which is also a WordPress Playground blueprint
 * bundle. At its root:
 *
 * - `riff.json`, what it is: the site it came from, its addresses, what it holds, and a SHA-1 of
 *   every file in it;
 * - `content.sqlite`, the content as WordPress stores it, one SQLite table per WordPress table,
 *   named as on a single site (`wp_posts`, `wp_postmeta` and the rest, whatever the prefix or
 *   the site's number on a network), each row column for column, serialized values as they are;
 * - `uploads/`, the files, at the paths they had under the site's uploads folder;
 * - `plugins/`, Riff and the extensions the site runs, as zips, so the archive boots offline;
 * - `blueprint.json`, which installs them in WordPress Playground and imports the rest.
 *
 * Export writes one and Site_Import reads one. Both meet here: the tables, which meta holds an
 * ID, and the rewriting of addresses and IDs, inside serialized values too.
 */
final class Archive {

	/**
	 * The format, raised when an older Riff could not read what a newer one writes.
	 *
	 * @since 6.5.0
	 */
	public const FORMAT = 1;

	/**
	 * What the archive is.
	 *
	 * @since 6.5.0
	 */
	public const MANIFEST = 'riff.json';

	/**
	 * The content.
	 *
	 * @since 6.5.0
	 */
	public const DATABASE = 'content.sqlite';

	/**
	 * The Playground blueprint.
	 *
	 * @since 6.5.0
	 */
	public const BLUEPRINT = 'blueprint.json';

	/**
	 * The files, under the path each had in uploads.
	 *
	 * @since 6.5.0
	 */
	public const UPLOADS = 'uploads/';

	/**
	 * The plugins, as zips.
	 *
	 * @since 6.5.0
	 */
	public const PLUGINS = 'plugins/';

	/**
	 * The post types a Riff is made of: its posts and pages, the Media Library, listeners'
	 * playlists, and the patterns its posts may use.
	 *
	 * @since 6.5.0
	 */
	public const TYPES = array( 'post', 'page', 'attachment', Playlists::TYPE, 'wp_block' );

	/**
	 * Riff's own settings.
	 *
	 * @since 6.5.0
	 */
	public const OPTIONS = array( Turntable::OPTION, Extensions::OPTION, Private_Site::OPTION, Listen\Standalone::AT_ROOT );

	/**
	 * The site's name, tagline and icon, which an import takes only when asked to.
	 *
	 * @since 6.5.0
	 */
	public const IDENTITY = array( 'blogname', 'blogdescription', 'site_icon' );

	/**
	 * Post meta that is about one site's editing, never carried.
	 *
	 * @since 6.5.0
	 */
	public const SKIP_META = array( '_edit_lock', '_edit_last', '_wp_old_slug', '_wp_old_date', '_encloseme', '_pingme', '_wp_trash_meta_status', '_wp_trash_meta_time', '_wp_desired_post_slug', '_riff_origin' );

	/**
	 * Post meta whose value is the ID of another post: the artwork, a track's video and streaming
	 * versions, a video's captions, and Riff Sing's MIDI file.
	 *
	 * @since 6.5.0
	 */
	public const ID_META = array( '_thumbnail_id', Media::VIDEO_META, Media::STREAM_META, Media::CAPTIONS_META, '_riff_sing_midi' );

	/**
	 * Term meta whose value is a post's ID: an artist's image.
	 *
	 * @since 6.5.0
	 */
	public const ID_TERM_META = array( Catalog::ARTIST_IMAGE );

	/**
	 * The tables, each column with its SQLite type. The users table keeps who wrote what, and no
	 * password.
	 *
	 * @since 6.5.0
	 */
	// phpcs:disable WordPress.DB.SlowDBQuery -- column names, not a query.
	public const TABLES = array(
		'posts'              => array(
			'ID'                    => 'INTEGER PRIMARY KEY',
			'post_author'           => 'INTEGER',
			'post_date'             => 'TEXT',
			'post_date_gmt'         => 'TEXT',
			'post_content'          => 'TEXT',
			'post_title'            => 'TEXT',
			'post_excerpt'          => 'TEXT',
			'post_status'           => 'TEXT',
			'comment_status'        => 'TEXT',
			'ping_status'           => 'TEXT',
			'post_password'         => 'TEXT',
			'post_name'             => 'TEXT',
			'to_ping'               => 'TEXT',
			'pinged'                => 'TEXT',
			'post_modified'         => 'TEXT',
			'post_modified_gmt'     => 'TEXT',
			'post_content_filtered' => 'TEXT',
			'post_parent'           => 'INTEGER',
			'guid'                  => 'TEXT',
			'menu_order'            => 'INTEGER',
			'post_type'             => 'TEXT',
			'post_mime_type'        => 'TEXT',
			'comment_count'         => 'INTEGER',
		),
		'postmeta'           => array(
			'meta_id'    => 'INTEGER PRIMARY KEY',
			'post_id'    => 'INTEGER',
			'meta_key'   => 'TEXT',
			'meta_value' => 'TEXT',
		),
		'terms'              => array(
			'term_id'    => 'INTEGER PRIMARY KEY',
			'name'       => 'TEXT',
			'slug'       => 'TEXT',
			'term_group' => 'INTEGER',
		),
		'term_taxonomy'      => array(
			'term_taxonomy_id' => 'INTEGER PRIMARY KEY',
			'term_id'          => 'INTEGER',
			'taxonomy'         => 'TEXT',
			'description'      => 'TEXT',
			'parent'           => 'INTEGER',
			'count'            => 'INTEGER',
		),
		'term_relationships' => array(
			'object_id'        => 'INTEGER',
			'term_taxonomy_id' => 'INTEGER',
			'term_order'       => 'INTEGER',
		),
		'termmeta'           => array(
			'meta_id'    => 'INTEGER PRIMARY KEY',
			'term_id'    => 'INTEGER',
			'meta_key'   => 'TEXT',
			'meta_value' => 'TEXT',
		),
		'options'            => array(
			'option_id'    => 'INTEGER PRIMARY KEY',
			'option_name'  => 'TEXT',
			'option_value' => 'TEXT',
			'autoload'     => 'TEXT',
		),
		'users'              => array(
			'ID'            => 'INTEGER PRIMARY KEY',
			'user_login'    => 'TEXT',
			'user_nicename' => 'TEXT',
			'user_email'    => 'TEXT',
			'display_name'  => 'TEXT',
		),
	);
	// phpcs:enable WordPress.DB.SlowDBQuery

	/**
	 * The prefix the archive's tables carry, a single site's, whatever the site's own.
	 *
	 * @since 6.5.0
	 */
	public const PREFIX = 'wp_';

	/**
	 * Core blocks whose attributes name a post or attachment by its ID, and those attributes.
	 */
	private const BLOCK_IDS = array( 'id', 'mediaId', 'ref', 'ids', 'parentPageID' );

	/**
	 * Whether this PHP can read and write the archive: SQLite through PDO, and zips.
	 *
	 * @since 6.5.0
	 *
	 * @return true|WP_Error
	 */
	public static function supported() {
		if ( ! class_exists( 'PDO', false ) || ! in_array( 'sqlite', PDO::getAvailableDrivers(), true ) ) {
			return new WP_Error( 'riff_archive_sqlite', __( 'This server\'s PHP has no SQLite, which a Riff archive keeps its content in. Ask your host to turn on pdo_sqlite.', 'riff' ) );
		}
		if ( ! class_exists( 'ZipArchive', false ) ) {
			return new WP_Error( 'riff_archive_zip', __( 'This server\'s PHP has no zip extension, which a Riff archive is made with.', 'riff' ) );
		}
		return true;
	}

	/**
	 * Opens an archive's database, made with the tables when it is new.
	 *
	 * @since 6.5.0
	 *
	 * @param string $file   The database file.
	 * @param bool   $create Whether to make the tables.
	 * @return PDO
	 */
	public static function database( string $file, bool $create = false ): PDO {
		$db = new PDO( 'sqlite:' . $file, null, null, array( PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION ) );
		if ( $create ) {
			$db->exec( 'PRAGMA journal_mode = OFF' );
			$db->exec( 'PRAGMA synchronous = OFF' );
			foreach ( self::TABLES as $table => $columns ) {
				$cols = array();
				foreach ( $columns as $name => $type ) {
					$cols[] = $name . ' ' . $type;
				}
				$db->exec( 'CREATE TABLE ' . self::PREFIX . $table . ' (' . implode( ', ', $cols ) . ')' );
			}
			$db->exec( 'CREATE INDEX ' . self::PREFIX . 'postmeta_post ON ' . self::PREFIX . 'postmeta (post_id)' );
			$db->exec( 'CREATE INDEX ' . self::PREFIX . 'termmeta_term ON ' . self::PREFIX . 'termmeta (term_id)' );
			$db->exec( 'CREATE INDEX ' . self::PREFIX . 'relationships_object ON ' . self::PREFIX . 'term_relationships (object_id)' );
		}
		return $db;
	}

	/**
	 * Whether a path inside uploads is one an archive may hold: relative, inside the folder,
	 * with no dot folder, and of a type WordPress lets this site upload.
	 *
	 * @since 6.5.0
	 *
	 * @param string $rel   The path, from uploads.
	 * @param array  $mimes Allowed types, by extension, as get_allowed_mime_types() gives them.
	 * @return bool
	 */
	public static function safe_path( string $rel, array $mimes ): bool {
		if ( '' === $rel || strlen( $rel ) > 1024 || str_starts_with( $rel, '/' ) || str_contains( $rel, '\\' ) || str_contains( $rel, "\0" ) || 0 !== validate_file( $rel ) ) {
			return false;
		}
		foreach ( explode( '/', $rel ) as $part ) {
			if ( '' === $part || '.' === $part[0] ) {
				return false;
			}
		}
		$type = wp_check_filetype( wp_basename( $rel ), $mimes );
		return false !== $type['ext'];
	}

	/**
	 * A serialized value read back without any object in it, or null when it holds one or isn't
	 * serialized data. Nothing in an archive becomes an object: a value that would is left out.
	 *
	 * @since 6.5.0
	 *
	 * @param string $value Serialized data.
	 * @return array{0: mixed}|null The value, wrapped, so a stored false is told from a refusal.
	 */
	public static function unserialize( string $value ): ?array {
		if ( 'b:0;' === $value ) {
			return array( false );
		}
		$data = @unserialize( $value, array( 'allowed_classes' => false ) ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.PHP.DiscouragedPHPFunctions.serialize_unserialize -- with no class allowed, and checked for any object below.
		if ( false === $data || self::has_object( $data ) ) {
			return null;
		}
		return array( $data );
	}

	/**
	 * Whether a value holds an object anywhere in it.
	 *
	 * @param mixed $data Value.
	 * @return bool
	 */
	private static function has_object( $data ): bool {
		if ( is_object( $data ) ) {
			return true;
		}
		if ( is_array( $data ) ) {
			foreach ( $data as $item ) {
				if ( self::has_object( $item ) ) {
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * Rewrites a stored value: in a serialized value, each string inside it, so every length stays
	 * right; otherwise the text itself. A serialized value that holds an object comes back null.
	 *
	 * @since 6.5.0
	 *
	 * @param string   $value   The value as stored.
	 * @param callable $rewrite string => string.
	 * @return string|null
	 */
	public static function rewrite_value( string $value, callable $rewrite ): ?string {
		if ( ! is_serialized( $value ) ) {
			return $rewrite( $value );
		}
		$data = self::unserialize( $value );
		if ( null === $data ) {
			return null;
		}
		$walk = static function ( $item ) use ( &$walk, $rewrite ) {
			if ( is_string( $item ) ) {
				return is_serialized( $item ) ? ( self::rewrite_value( $item, $rewrite ) ?? $item ) : $rewrite( $item );
			}
			if ( is_array( $item ) ) {
				$out = array();
				foreach ( $item as $key => $sub ) {
					$out[ is_string( $key ) ? $rewrite( $key ) : $key ] = $walk( $sub );
				}
				return $out;
			}
			return $item;
		};
		return serialize( $walk( $data[0] ) ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.serialize_serialize -- stored back as WordPress stored it.
	}

	/**
	 * The replacements that move a site's addresses to another's, for strtr(), which takes the
	 * longest match at each place and never rewrites what it has written. Each address is given
	 * with both schemes and with its slashes escaped as JSON escapes them.
	 *
	 * @since 6.5.0
	 *
	 * @param array<string, string> $urls Old address => new, without trailing slashes.
	 * @return array<string, string>
	 */
	public static function url_map( array $urls ): array {
		$map = array();
		foreach ( $urls as $from => $to ) {
			$from = untrailingslashit( (string) $from );
			$to   = untrailingslashit( (string) $to );
			if ( '' === $from ) {
				continue;
			}
			$bare = (string) preg_replace( '#^https?:#i', '', $from );
			foreach ( array( 'http:' . $bare, 'https:' . $bare ) as $variant ) {
				// A site's own address keeps the scheme it is given.
				if ( ! isset( $map[ $variant ] ) || $variant === $from ) {
					$map[ $variant ]                            = $to;
					$map[ str_replace( '/', '\\/', $variant ) ] = str_replace( '/', '\\/', $to );
				}
			}
		}
		return $map;
	}

	/**
	 * Rewrites post content: the addresses, then each ID a core block or its markup names.
	 *
	 * @since 6.5.0
	 *
	 * @param string          $content Content.
	 * @param array           $urls    From url_map().
	 * @param array<int, int> $ids     Old post ID => new.
	 * @return string
	 */
	public static function rewrite_content( string $content, array $urls, array $ids ): string {
		$content = strtr( $content, $urls );
		if ( ! $ids ) {
			return $content;
		}
		$swap = static fn( array $m ): string => isset( $ids[ (int) $m[2] ] ) ? $m[1] . $ids[ (int) $m[2] ] : $m[0];
		// Block delimiters, as core's parser finds them.
		$content = (string) preg_replace_callback(
			'/<!--\s+wp:(?P<namespace>[a-z][a-z0-9_-]*\/)?(?P<name>[a-z][a-z0-9_-]*)\s+(?P<attrs>{(?:(?:[^}]+|}+(?=})|(?!}\s+\/?-->).)*+)?}\s+)(?P<void>\/)?-->/s',
			static function ( array $m ) use ( $ids ): string {
				$namespace = '' !== $m['namespace'] ? $m['namespace'] : 'core/';
				if ( 'core/' !== $namespace ) {
					return $m[0];
				}
				$attrs = json_decode( trim( $m['attrs'] ), true );
				if ( ! is_array( $attrs ) ) {
					return $m[0];
				}
				$changed = false;
				foreach ( self::BLOCK_IDS as $key ) {
					if ( ! isset( $attrs[ $key ] ) ) {
						continue;
					}
					if ( is_int( $attrs[ $key ] ) && isset( $ids[ $attrs[ $key ] ] ) ) {
						$attrs[ $key ] = $ids[ $attrs[ $key ] ];
						$changed       = true;
					} elseif ( is_array( $attrs[ $key ] ) ) {
						foreach ( $attrs[ $key ] as $i => $id ) {
							if ( is_int( $id ) && isset( $ids[ $id ] ) ) {
								$attrs[ $key ][ $i ] = $ids[ $id ];
								$changed             = true;
							}
						}
					}
				}
				if ( ! $changed ) {
					return $m[0];
				}
				$name = ( '' !== $m['namespace'] ? $m['namespace'] : '' ) . $m['name'];
				return '<!-- wp:' . $name . ' ' . serialize_block_attributes( $attrs ) . ' ' . ( '' !== ( $m['void'] ?? '' ) ? '/' : '' ) . '-->';
			},
			$content
		);
		// The markup core writes beside them: an image's class, a gallery item's data-id, and a
		// protected file's address.
		$content = (string) preg_replace_callback( '/(\bwp-image-)(\d+)\b/', $swap, $content );
		$content = (string) preg_replace_callback( '/(\bdata-id=["\'])(\d+)(?=["\'])/', $swap, $content );
		$content = (string) preg_replace_callback( '/([?&](?:amp;|#038;)?' . preg_quote( Protect::QUERY, '/' ) . '=)(\d+)\b/', $swap, $content );
		return (string) preg_replace_callback( '/([?&](?:amp;|#038;)?attachment_id=)(\d+)\b/', $swap, $content );
	}

	/**
	 * Every file an attachment has under uploads, from its metadata: the file, each size made of
	 * it, and the original an image was scaled from, each as a path from uploads.
	 *
	 * @since 6.5.0
	 *
	 * @param string $rel  The attachment's file, from uploads.
	 * @param mixed  $meta Its metadata.
	 * @return string[]
	 */
	public static function files_of( string $rel, $meta ): array {
		$files = array( $rel );
		$dir   = dirname( $rel );
		$dir   = '.' === $dir ? '' : $dir . '/';
		if ( is_array( $meta ) ) {
			if ( ! empty( $meta['original_image'] ) && is_string( $meta['original_image'] ) ) {
				$files[] = $dir . wp_basename( $meta['original_image'] );
			}
			foreach ( (array) ( $meta['sizes'] ?? array() ) as $size ) {
				if ( is_array( $size ) && ! empty( $size['file'] ) && is_string( $size['file'] ) ) {
					$files[] = $dir . wp_basename( $size['file'] );
				}
			}
		}
		return array_values( array_unique( $files ) );
	}

	/**
	 * A zip's entries, by name, each with its declared size, or an error for a zip that isn't one.
	 *
	 * @since 6.5.0
	 *
	 * @param ZipArchive $zip An open zip.
	 * @return array<string, int>
	 */
	public static function entries( ZipArchive $zip ): array {
		$entries = array();
		$count   = $zip->count();
		for ( $i = 0; $i < $count; $i++ ) {
			$stat = $zip->statIndex( $i );
			if ( is_array( $stat ) ) {
				$entries[ (string) $stat['name'] ] = (int) $stat['size'];
			}
		}
		return $entries;
	}

	/**
	 * Whether a file may be written by extract(): its folder exists and is in the temp folder or
	 * under uploads, links resolved.
	 *
	 * @since 6.5.0
	 *
	 * @param string $to A file.
	 * @return bool
	 */
	public static function writable_at( string $to ): bool {
		$dir = realpath( dirname( $to ) );
		if ( false === $dir || '' === wp_basename( $to ) ) {
			return false;
		}
		$dir = trailingslashit( wp_normalize_path( $dir ) );
		foreach ( array( get_temp_dir(), wp_get_upload_dir()['basedir'] ) as $base ) {
			$base = realpath( (string) $base );
			if ( false !== $base && str_starts_with( $dir, trailingslashit( wp_normalize_path( $base ) ) ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Copies one entry of a zip to a file, a piece at a time, never more than its declared size.
	 *
	 * @since 6.5.0
	 *
	 * @param ZipArchive $zip  An open zip.
	 * @param string     $name The entry.
	 * @param int        $size Its declared size.
	 * @param string     $to   The file to write, in the temp folder or under uploads.
	 * @return bool False too for a file anywhere else.
	 */
	public static function extract( ZipArchive $zip, string $name, int $size, string $to ): bool {
		if ( ! self::writable_at( $to ) ) {
			return false;
		}
		$in = $zip->getStream( $name );
		if ( ! $in ) {
			return false;
		}
		// isolation: write -- in the temp folder or under uploads, as writable_at() made sure.
		$out = fopen( $to, 'wb' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen -- a file of any size, streamed.
		if ( ! $out ) {
			fclose( $in ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
			return false;
		}
		$written = 0;
		$ok      = true;
		while ( ! feof( $in ) ) {
			$chunk = fread( $in, 1048576 ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
			if ( false === $chunk ) {
				$ok = false;
				break;
			}
			$written += strlen( $chunk );
			if ( $written > $size ) {
				$ok = false;
				break;
			}
			fwrite( $out, $chunk ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fwrite
		}
		fclose( $in ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
		fclose( $out ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
		if ( ! $ok || $written !== $size ) {
			wp_delete_file( $to );
			return false;
		}
		return true;
	}
}
