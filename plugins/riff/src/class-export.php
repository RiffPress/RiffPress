<?php
/**
 * Takes a Riff with its owner: the whole site's music as one archive.
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
 * Writes a site's Riff to an archive (Archive): its posts, pages, Media Library and playlists
 * with all their meta, the terms they are filed under, Riff's settings, and the files, with the
 * plugins and a blueprint that boot it in WordPress Playground. On a network it is the one site
 * the request is for, so leaving a network takes everything the site has.
 *
 * Settings › Riff downloads one, and opens the site's public content in Playground from a link
 * that carries it in the address's fragment, which a browser never sends to a server.
 */
final class Export {

	/**
	 * The admin-post action that downloads the archive.
	 *
	 * @since 6.5.0
	 */
	public const DOWNLOAD = 'riff_export';

	/**
	 * The admin-post action that opens the site in Playground.
	 *
	 * @since 6.5.0
	 */
	public const PLAYGROUND = 'riff_playground';

	/**
	 * The longest address a Playground link may be. Chrome takes two million characters.
	 *
	 * @since 6.5.0
	 */
	public const LINK_MAX = 2000000;

	/**
	 * The extensions beside Riff whose data an archive carries, installed with it when active.
	 */
	private const EXTENSIONS = array( 'riff-lyrics', 'riff-chords', 'riff-sing' );

	/**
	 * Rows read at a time.
	 */
	private const BATCH = 500;

	/**
	 * Hooks the section on Settings › Riff and its two actions.
	 *
	 * @since 6.5.0
	 */
	public static function register(): void {
		add_action( 'admin_init', array( self::class, 'section' ), 20 );
		add_action( 'admin_post_' . self::DOWNLOAD, array( self::class, 'download' ) );
		add_action( 'admin_post_' . self::PLAYGROUND, array( self::class, 'playground' ) );
	}

	/**
	 * Writes the site's Riff to an archive.
	 *
	 * @since 6.5.0
	 *
	 * @param string $file The zip to write.
	 * @param array  $args {
	 *     Optional.
	 *
	 *     @type bool $media   Put the files in. Without them, each attachment keeps this site's
	 *                         address for its file. Default true.
	 *     @type bool $public  Only what anyone may see: published posts and pages and their
	 *                         media, with no playlist and no protected file. Default false.
	 *     @type bool $plugins Put Riff and its extensions in, with the blueprint that installs
	 *                         them. Default true.
	 * }
	 * @return array{file: string, counts: array<string, int>, skipped: string[]}|WP_Error
	 */
	public static function to_file( string $file, array $args = array() ) {
		$supported = Archive::supported();
		if ( is_wp_error( $supported ) ) {
			return $supported;
		}
		$args = wp_parse_args(
			$args,
			array(
				'media'   => true,
				'public'  => false,
				'plugins' => true,
			)
		);
		if ( function_exists( 'set_time_limit' ) ) {
			set_time_limit( 0 ); // phpcs:ignore Squiz.PHP.DiscouragedFunctions.Discouraged -- an archive of a whole library takes as long as it takes.
		}
		$work = get_temp_dir() . 'riff-export-' . wp_generate_password( 20, false );
		// isolation: write -- a folder of this request's own under the temp folder, emptied and removed below.
		wp_mkdir_p( $work );
		try {
			return self::write( $file, $work, $args );
		} catch ( \Throwable $e ) {
			return new WP_Error( 'riff_export', $e->getMessage() );
		} finally {
			foreach ( (array) glob( $work . '/*' ) as $left ) {
				wp_delete_file( (string) $left );
			}
			@rmdir( $work ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_rmdir -- a folder of this request's own.
		}
	}

	/**
	 * Writes the archive, with a folder to work in.
	 *
	 * @param string $file The zip.
	 * @param string $work A folder of this export's own.
	 * @param array  $args From to_file().
	 * @return array{file: string, counts: array<string, int>, skipped: string[]}|WP_Error
	 */
	private static function write( string $file, string $work, array $args ) {
		global $wpdb;
		$db = Archive::database( $work . '/' . Archive::DATABASE, true );
		$db->beginTransaction();
		// This archive's insert statements, one a table, alive only as long as write() is: they
		// hold the handle, and dropping them with it is what closes the database before the zip
		// reads it.
		$statements = array();

		$ids     = self::posts( (bool) $args['public'] );
		$uploads = wp_upload_dir( null, false );
		$base    = trailingslashit( (string) $uploads['basedir'] );
		$files   = array();
		$skipped = array();
		$authors = array();
		$counts  = array_fill_keys( array( 'posts', 'attachments', 'tracks', 'playlists', 'files', 'terms' ), 0 );

		foreach ( array_chunk( $ids, self::BATCH ) as $chunk ) {
			$in = implode( ',', array_map( 'intval', $chunk ) );
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- integers only, a batch at a time.
			$posts = (array) $wpdb->get_results( "SELECT * FROM {$wpdb->posts} WHERE ID IN ($in) ORDER BY ID", ARRAY_A );
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- integers only, a batch at a time.
			$meta = (array) $wpdb->get_results( "SELECT * FROM {$wpdb->postmeta} WHERE post_id IN ($in) ORDER BY meta_id", ARRAY_A );
			$by   = array();
			foreach ( $meta as $row ) {
				$by[ (int) $row['post_id'] ][] = $row;
			}
			foreach ( $posts as $post ) {
				$id                                    = (int) $post['ID'];
				$authors[ (int) $post['post_author'] ] = true;
				$rows                                  = $by[ $id ] ?? array();
				if ( 'attachment' === $post['post_type'] ) {
					++$counts['attachments'];
					if ( str_starts_with( (string) $post['post_mime_type'], 'audio/' ) ) {
						++$counts['tracks'];
					}
					$rows = self::attachment_files( $id, $rows, $base, (bool) $args['media'], $files, $skipped );
				} elseif ( Playlists::TYPE === $post['post_type'] ) {
					++$counts['playlists'];
				} else {
					++$counts['posts'];
				}
				self::insert( $db, $statements, 'posts', $post );
				foreach ( $rows as $row ) {
					if ( ! in_array( $row['meta_key'], Archive::SKIP_META, true ) ) {
						self::insert( $db, $statements, 'postmeta', $row );
					}
				}
			}
			wp_cache_flush_runtime();
		}
		$counts['terms'] = self::terms( $db, $statements, $ids );
		self::users( $db, $statements, array_keys( $authors ), (bool) $args['public'] );
		self::options( $db, $statements );
		$db->commit();
		$statements = array();
		$db         = null;

		$counts['files'] = count( $files );
		$manifest        = array(
			'format'    => Archive::FORMAT,
			'riff'      => RIFF_VERSION,
			'wordpress' => get_bloginfo( 'version' ),
			'made'      => gmdate( 'c' ),
			'name'      => get_bloginfo( 'name' ),
			'home'      => home_url(),
			'siteurl'   => site_url(),
			'uploads'   => untrailingslashit( (string) $uploads['baseurl'] ),
			'network'   => is_multisite() ? array(
				'site' => get_current_blog_id(),
				'url'  => network_home_url(),
			) : null,
			'media'     => (bool) $args['media'],
			'public'    => (bool) $args['public'],
			'counts'    => $counts,
			'files'     => array_map( static fn( array $f ): string => $f['sha1'], $files ),
			'plugins'   => array(),
		);

		$zip = new ZipArchive();
		if ( true !== $zip->open( $file, ZipArchive::CREATE | ZipArchive::OVERWRITE ) ) {
			return new WP_Error( 'riff_export', __( 'The archive could not be written there.', 'riff' ) );
		}
		$zip->addFile( $work . '/' . Archive::DATABASE, Archive::DATABASE );
		foreach ( $files as $rel => $from ) {
			$zip->addFile( $from['path'], Archive::UPLOADS . $rel );
			// Music and pictures are compressed already; storing them as they are is as small.
			$zip->setCompressionName( Archive::UPLOADS . $rel, ZipArchive::CM_STORE );
		}
		if ( $args['plugins'] ) {
			foreach ( self::plugins() as $slug => $dir ) {
				$made = $work . '/' . $slug . '.zip';
				if ( self::zip_folder( $dir, $slug, $made ) ) {
					$zip->addFile( $made, Archive::PLUGINS . $slug . '.zip' );
					$zip->setCompressionName( Archive::PLUGINS . $slug . '.zip', ZipArchive::CM_STORE );
					$manifest['plugins'][] = $slug;
				}
			}
			$zip->addFromString( Archive::BLUEPRINT, (string) wp_json_encode( self::blueprint( $manifest, array_keys( $files ) ), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) );
		}
		$zip->addFromString( Archive::MANIFEST, (string) wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) );
		if ( ! $zip->close() ) {
			return new WP_Error( 'riff_export', __( 'The archive could not be written there.', 'riff' ) );
		}
		return array(
			'file'    => $file,
			'counts'  => $counts,
			'skipped' => $skipped,
		);
	}

	/**
	 * The posts a Riff is made of, by ID, oldest first: every post of its types but trashed ones
	 * and unsaved drafts, or, for a public archive, what anyone may see.
	 *
	 * @param bool $open_only Only what anyone may see.
	 * @return int[]
	 */
	private static function posts( bool $open_only ): array {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- every post of Riff's types at once, for the archive, which WP_Query would page and cache.
		$rows = (array) $wpdb->get_results( $wpdb->prepare( "SELECT ID, post_type, post_status, post_parent, post_password FROM {$wpdb->posts} WHERE post_type IN (" . implode( ', ', array_fill( 0, count( Archive::TYPES ), '%s' ) ) . ") AND post_status NOT IN ( 'auto-draft', 'trash' ) ORDER BY ID", Archive::TYPES ) );
		if ( ! $open_only ) {
			return array_map( static fn( $row ): int => (int) $row->ID, $rows );
		}
		$open = array();
		foreach ( $rows as $row ) {
			if ( 'attachment' !== $row->post_type && Playlists::TYPE !== $row->post_type && 'publish' === $row->post_status && '' === (string) $row->post_password ) {
				$open[ (int) $row->ID ] = true;
			}
		}
		$ids = array_keys( $open );
		foreach ( $rows as $row ) {
			$parent = (int) $row->post_parent;
			// And only music anyone may play now: riff_may_play, asked as a visitor, for an export.
			if ( 'attachment' === $row->post_type && ( ! $parent || isset( $open[ $parent ] ) ) && ! Protect::is( (int) $row->ID ) && self::playable( $row ) ) {
				$ids[] = (int) $row->ID;
			}
		}
		sort( $ids );
		return $ids;
	}

	/**
	 * Whether a public archive may carry an attachment: anything but audio and video, and music
	 * riff_may_play lets a visitor play.
	 *
	 * @param object $row The attachment's row: ID and post_type at least.
	 * @return bool
	 */
	private static function playable( $row ): bool {
		$type = strtok( (string) get_post_mime_type( (int) $row->ID ), '/' );
		if ( 'audio' !== $type && 'video' !== $type ) {
			return true;
		}
		return true === Rights::may_play(
			(int) $row->ID,
			0,
			array(
				'via'  => 'export',
				'pass' => '',
			)
		);
	}

	/**
	 * An attachment's files, noted for the archive, and its meta as the archive keeps it: a
	 * protected file is kept under the place it had before it was protected, and the protected
	 * folder's name, which is this site's secret, is not written anywhere.
	 *
	 * @param int    $id      Attachment ID.
	 * @param array  $rows    Its meta rows.
	 * @param string $base    The uploads folder, with a trailing slash.
	 * @param bool   $media   Whether files go in.
	 * @param array  $files   Files so far, by path from uploads, each with its path and SHA-1.
	 * @param array  $skipped Files that are not on this server, so are not in the archive.
	 * @return array Meta rows.
	 */
	private static function attachment_files( int $id, array $rows, string $base, bool $media, array &$files, array &$skipped ): array {
		$rel       = '';
		$protected = '';
		$meta      = null;
		foreach ( $rows as $row ) {
			if ( '_wp_attached_file' === $row['meta_key'] ) {
				$rel = (string) $row['meta_value'];
			} elseif ( Protected_Files::META === $row['meta_key'] ) {
				$protected = ltrim( (string) $row['meta_value'], '/' );
			} elseif ( '_wp_attachment_metadata' === $row['meta_key'] ) {
				$meta = Archive::unserialize( (string) $row['meta_value'] );
			}
		}
		if ( '' === $rel || preg_match( '#^[a-z][a-z0-9+.-]*://#i', $rel ) ) {
			return $rows;
		}
		$path = (string) get_attached_file( $id, true );
		if ( '' !== $protected ) {
			// The archive names it where it was, so another site protects it in its own folder.
			$secret = $rel;
			foreach ( $rows as $i => $row ) {
				if ( '_wp_attached_file' === $row['meta_key'] ) {
					$rows[ $i ]['meta_value'] = $protected; // phpcs:ignore WordPress.DB.SlowDBQuery -- a row of the archive, not a query.
				} elseif ( '_wp_attachment_metadata' === $row['meta_key'] && is_string( $row['meta_value'] ) ) {
					$rows[ $i ]['meta_value'] = Archive::rewrite_value( (string) $row['meta_value'], static fn( string $s ): string => $s === $secret ? $protected : $s ) ?? $row['meta_value']; // phpcs:ignore WordPress.DB.SlowDBQuery -- a row of the archive, not a query.
				}
			}
			$rel = $protected;
		}
		if ( ! $media ) {
			return $rows;
		}
		$dir = trailingslashit( dirname( $path ) );
		// Files are read from uploads, and a protected one from the protected folder, which a host
		// may keep outside the web root; from nowhere else.
		$roots = array_filter( array( realpath( $base ), '' !== $protected ? realpath( Protected_Files::path() ) : false ) );
		$under = static fn( string $real ): bool => (bool) array_filter( $roots, static fn( string $root ): bool => str_starts_with( $real, $root . '/' ) );
		foreach ( Archive::files_of( $rel, $meta[0] ?? null ) as $i => $one ) {
			$from = 0 === $i ? $path : $dir . wp_basename( $one );
			$real = realpath( $from );
			if ( ! $real || ! is_file( $real ) || ! is_readable( $real ) || ! $under( $real ) ) {
				if ( 0 === $i ) {
					$skipped[] = $rel;
				}
				continue;
			}
			$files[ $one ] = array(
				'path' => $real,
				'sha1' => (string) sha1_file( $real ),
			);
		}
		return $rows;
	}

	/**
	 * The terms the posts are filed under, with their parents and meta.
	 *
	 * @param PDO             $db         The archive's database.
	 * @param \PDOStatement[] $statements Its insert statements, by table.
	 * @param int[]           $ids        Post IDs.
	 * @return int How many terms.
	 */
	private static function terms( PDO $db, array &$statements, array $ids ): int {
		global $wpdb;
		$taxonomies = array();
		foreach ( array_chunk( $ids, self::BATCH ) as $chunk ) {
			$in = implode( ',', array_map( 'intval', $chunk ) );
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- integers only.
			foreach ( (array) $wpdb->get_results( "SELECT * FROM {$wpdb->term_relationships} WHERE object_id IN ($in)", ARRAY_A ) as $row ) {
				self::insert( $db, $statements, 'term_relationships', $row );
				$taxonomies[ (int) $row['term_taxonomy_id'] ] = true;
			}
		}
		$done = array();
		$todo = array_keys( $taxonomies );
		while ( $todo ) {
			$in = implode( ',', array_map( 'intval', array_splice( $todo, 0, self::BATCH ) ) );
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- integers only.
			$rows = (array) $wpdb->get_results( "SELECT * FROM {$wpdb->term_taxonomy} WHERE term_taxonomy_id IN ($in)", ARRAY_A );
			foreach ( $rows as $row ) {
				if ( isset( $done[ (int) $row['term_id'] ] ) ) {
					continue;
				}
				$done[ (int) $row['term_id'] ] = true;
				self::insert( $db, $statements, 'term_taxonomy', $row );
				// A parent the posts are not filed under still goes, so the tree is whole.
				if ( (int) $row['parent'] && ! isset( $done[ (int) $row['parent'] ] ) ) {
					// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- one parent.
					$parent = $wpdb->get_var( $wpdb->prepare( "SELECT term_taxonomy_id FROM {$wpdb->term_taxonomy} WHERE term_id = %d AND taxonomy = %s", (int) $row['parent'], $row['taxonomy'] ) );
					if ( $parent ) {
						$todo[] = (int) $parent;
					}
				}
			}
		}
		foreach ( array_chunk( array_keys( $done ), self::BATCH ) as $chunk ) {
			$in = implode( ',', array_map( 'intval', $chunk ) );
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- integers only.
			foreach ( (array) $wpdb->get_results( "SELECT * FROM {$wpdb->terms} WHERE term_id IN ($in)", ARRAY_A ) as $row ) {
				self::insert( $db, $statements, 'terms', $row );
			}
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- integers only.
			foreach ( (array) $wpdb->get_results( "SELECT * FROM {$wpdb->termmeta} WHERE term_id IN ($in) ORDER BY meta_id", ARRAY_A ) as $row ) {
				self::insert( $db, $statements, 'termmeta', $row );
			}
		}
		return count( $done );
	}

	/**
	 * Who wrote the posts: their names and email, by which an import finds them again. No
	 * password, and nothing else of their account. A public archive is one that is shared, in a
	 * Playground link, so it names each author by display name only, with no login and no email, and leaves the name empty where it is the login or an address.
	 *
	 * @param PDO             $db         The archive's database.
	 * @param \PDOStatement[] $statements Its insert statements, by table.
	 * @param int[]           $ids        User IDs.
	 * @param bool            $names_only Whether to write display names only, as a public archive does.
	 */
	private static function users( PDO $db, array &$statements, array $ids, bool $names_only ): void {
		foreach ( $ids as $id ) {
			$user = get_userdata( (int) $id );
			if ( $user ) {
				self::insert(
					$db,
					$statements,
					'users',
					array(
						'ID'            => (int) $user->ID,
						'user_login'    => $names_only ? '' : $user->user_login,
						'user_nicename' => $names_only ? '' : $user->user_nicename,
						'user_email'    => $names_only ? '' : $user->user_email,
						'display_name'  => $names_only && ( is_email( $user->display_name ) || 0 === strcasecmp( $user->display_name, $user->user_login ) ) ? '' : $user->display_name,
					)
				);
			}
		}
	}

	/**
	 * Riff's settings and the site's name, tagline and icon, as stored.
	 *
	 * @param PDO             $db         The archive's database.
	 * @param \PDOStatement[] $statements Its insert statements, by table.
	 */
	private static function options( PDO $db, array &$statements ): void {
		global $wpdb;
		$names = array_merge( Archive::OPTIONS, Archive::IDENTITY );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- the options' rows as stored, for the archive; get_option() would unserialize them.
		foreach ( (array) $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->options} WHERE option_name IN (" . implode( ', ', array_fill( 0, count( $names ), '%s' ) ) . ')', $names ), ARRAY_A ) as $row ) {
			self::insert( $db, $statements, 'options', $row );
		}
	}

	/**
	 * Inserts a row into one of the archive's tables, its columns and no others, with a statement
	 * prepared once a table on this archive's own handle.
	 *
	 * @param PDO             $db         The archive's database.
	 * @param \PDOStatement[] $statements Its insert statements, by table.
	 * @param string          $table      Table, without the prefix.
	 * @param array           $row        Row.
	 */
	private static function insert( PDO $db, array &$statements, string $table, array $row ): void {
		$columns = array_keys( Archive::TABLES[ $table ] );
		if ( ! isset( $statements[ $table ] ) ) {
			$statements[ $table ] = $db->prepare( 'INSERT INTO ' . Archive::PREFIX . $table . ' (' . implode( ', ', $columns ) . ') VALUES (' . implode( ', ', array_fill( 0, count( $columns ), '?' ) ) . ')' );
		}
		$values = array();
		foreach ( $columns as $column ) {
			$values[] = $row[ $column ] ?? null;
		}
		$statements[ $table ]->execute( $values );
	}

	/**
	 * Riff and the extensions beside it that are active, by slug, each with its folder.
	 *
	 * @return array<string, string>
	 */
	private static function plugins(): array {
		require_once ABSPATH . 'wp-admin/includes/plugin.php';
		$found = array( 'riff' => untrailingslashit( RIFF_DIR ) );
		foreach ( self::EXTENSIONS as $slug ) {
			$main = $slug . '/' . $slug . '.php';
			if ( ( is_plugin_active( $main ) || is_plugin_active_for_network( $main ) ) && is_dir( WP_PLUGIN_DIR . '/' . $slug ) ) {
				$found[ $slug ] = WP_PLUGIN_DIR . '/' . $slug;
			}
		}
		return $found;
	}

	/**
	 * Zips a plugin's folder as WordPress installs one, leaving out its tests and what a
	 * checkout holds.
	 *
	 * @param string $dir  The folder.
	 * @param string $slug Its name inside the zip.
	 * @param string $to   The zip to write.
	 * @return bool
	 */
	private static function zip_folder( string $dir, string $slug, string $to ): bool {
		$zip = new ZipArchive();
		if ( true !== $zip->open( $to, ZipArchive::CREATE | ZipArchive::OVERWRITE ) ) {
			return false;
		}
		$dir   = untrailingslashit( (string) realpath( $dir ) );
		$items = new \RecursiveIteratorIterator(
			new \RecursiveCallbackFilterIterator(
				new \RecursiveDirectoryIterator( $dir, \FilesystemIterator::SKIP_DOTS ),
				static function ( \SplFileInfo $item ) use ( $dir ): bool {
					$rel = substr( $item->getPathname(), strlen( $dir ) + 1 );
					return '.' !== $item->getFilename()[0] && ! in_array( strtok( $rel, '/' ), array( 'tests', 'node_modules' ), true ) && ! $item->isLink();
				}
			)
		);
		foreach ( $items as $item ) {
			if ( $item->isFile() ) {
				$zip->addFile( $item->getPathname(), $slug . '/' . substr( $item->getPathname(), strlen( $dir ) + 1 ) );
			}
		}
		return $zip->close();
	}

	/**
	 * The blueprint that boots the archive in Playground: the plugins it carries, the files and
	 * the content written where `wp riff import-site` reads them, and the import, which makes the
	 * Listen app the site's front page.
	 *
	 * @param array    $manifest What the archive holds.
	 * @param string[] $files    Its files, from uploads.
	 * @return array
	 */
	private static function blueprint( array $manifest, array $files ): array {
		$to    = '/tmp/riff-import';
		$steps = array(
			array(
				'step'    => 'setSiteOptions',
				'options' => array( 'permalink_structure' => '/%postname%/' ),
			),
		);
		foreach ( $manifest['plugins'] as $slug ) {
			$steps[] = array(
				'step'       => 'installPlugin',
				'pluginData' => array(
					'resource' => 'bundled',
					'path'     => '/' . Archive::PLUGINS . $slug . '.zip',
				),
			);
		}
		$dirs = array( $to => true );
		foreach ( $files as $rel ) {
			$dirs[ $to . '/' . untrailingslashit( Archive::UPLOADS ) . ( '.' === dirname( $rel ) ? '' : '/' . dirname( $rel ) ) ] = true;
		}
		foreach ( array_keys( $dirs ) as $dir ) {
			$steps[] = array(
				'step' => 'mkdir',
				'path' => $dir,
			);
		}
		foreach ( array_merge( array( Archive::MANIFEST, Archive::DATABASE ), array_map( static fn( string $rel ): string => Archive::UPLOADS . $rel, $files ) ) as $name ) {
			$steps[] = array(
				'step' => 'writeFile',
				'path' => $to . '/' . $name,
				'data' => array(
					'resource' => 'bundled',
					'path'     => '/' . $name,
				),
			);
		}
		$steps[] = array(
			'step'    => 'wp-cli',
			'command' => 'wp riff import-site ' . $to . ' --identity --listen',
		);
		$steps[] = array(
			'step' => 'rmdir',
			'path' => $to,
		);
		return array(
			'$schema'           => 'https://playground.wordpress.net/blueprint-schema.json',
			'meta'              => array(
				'title'       => (string) $manifest['name'],
				'description' => sprintf( 'A Riff, taken from %s on %s.', $manifest['home'], gmdate( 'j F Y', (int) strtotime( (string) $manifest['made'] ) ) ),
				'author'      => 'Riff',
			),
			'preferredVersions' => array(
				'php' => '8.3',
				'wp'  => 'latest',
			),
			'landingPage'       => '/',
			'login'             => true,
			'steps'             => $steps,
		);
	}

	/**
	 * A link that opens this site's public content in WordPress Playground: the content, with no
	 * file, rides in the address's fragment, which the browser keeps to itself, and each track and
	 * image plays and shows from this site. Riff comes from its release on GitHub.
	 *
	 * @since 6.5.0
	 *
	 * @return string|WP_Error The link, or why there is none.
	 */
	public static function playground_link() {
		$zip  = wp_tempnam( 'riff-playground.zip' );
		$made = self::to_file(
			$zip,
			array(
				'media'   => false,
				'public'  => true,
				'plugins' => false,
			)
		);
		if ( is_wp_error( $made ) ) {
			wp_delete_file( $zip );
			return $made;
		}
		$data = base64_encode( (string) file_get_contents( $zip ) ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode, WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- a data: address for Playground, read from a file of this request's own.
		wp_delete_file( $zip );
		$blueprint = array(
			'landingPage'       => '/',
			'login'             => true,
			'preferredVersions' => array(
				'php' => '8.3',
				'wp'  => 'latest',
			),
			'steps'             => array(
				array(
					'step'    => 'setSiteOptions',
					'options' => array( 'permalink_structure' => '/%postname%/' ),
				),
				array(
					'step'       => 'installPlugin',
					'pluginData' => array(
						'resource' => 'url',
						'url'      => 'https://github.com/RiffPress/RiffPress/releases/download/riff-v' . RIFF_VERSION . '/riff.zip',
					),
				),
				array(
					'step' => 'writeFile',
					'path' => '/tmp/riff-link.zip',
					'data' => array(
						'resource' => 'url',
						'url'      => 'data:application/zip;base64,' . $data,
					),
				),
				array(
					'step'    => 'wp-cli',
					'command' => 'wp riff import-site /tmp/riff-link.zip --identity --listen',
				),
			),
		);
		$link      = 'https://playground.wordpress.net/#' . base64_encode( (string) wp_json_encode( $blueprint, JSON_UNESCAPED_SLASHES ) ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- the form Playground reads a blueprint in.
		if ( strlen( $link ) > self::LINK_MAX ) {
			return new WP_Error( 'riff_playground_size', __( 'This Riff is too large for a link. Download it, then open the archive with WordPress Playground on your computer.', 'riff' ) );
		}
		return $link;
	}

	/**
	 * The section on Settings › Riff, for whoever may export the site.
	 *
	 * @since 6.5.0
	 */
	public static function section(): void {
		if ( ! current_user_can( 'export' ) ) {
			return;
		}
		add_settings_section( 'riff-yours', __( 'Take my Riff with me', 'riff' ), array( self::class, 'intro' ), Extensions::PAGE );
	}

	/**
	 * The section's words and its two buttons, each a form of its own, outside Settings › Riff's
	 * form: the browser places them after it.
	 *
	 * @since 6.5.0
	 */
	public static function intro(): void {
		echo '<p>' . esc_html__( 'Your Riff is yours. Download everything it holds as one archive: every post, page and playlist, the Media Library with its files, the albums and artists, the lyrics, chords and melodies, and these settings. Any WordPress with Riff imports it, and WordPress Playground opens it in a browser.', 'riff' ) . '</p>';
		echo '<p><a href="https://source.riffpress.com/developers/yours/">' . esc_html__( 'How to take your Riff anywhere', 'riff' ) . '</a></p>';
		echo '<p>';
		printf( '<button type="submit" form="riff-export" class="button">%s</button> ', esc_html__( 'Download your Riff', 'riff' ) );
		printf( '<button type="submit" form="riff-playground" class="button">%s</button>', esc_html__( 'Open in Playground', 'riff' ) );
		echo '</p><p class="description">' . esc_html__( 'Playground opens what anyone may see, playing the music from this site. The download holds everything, private posts, protected files and each author’s email address included, so keep it as you would the site.', 'riff' ) . '</p>';
		add_action( 'admin_footer', array( self::class, 'forms' ) );
	}

	/**
	 * The two forms the buttons send.
	 *
	 * @since 6.5.0
	 */
	public static function forms(): void {
		foreach ( array(
			'riff-export'     => self::DOWNLOAD,
			'riff-playground' => self::PLAYGROUND,
		) as $form => $action ) {
			printf( '<form id="%1$s" method="post" action="%2$s" hidden><input type="hidden" name="action" value="%3$s">', esc_attr( $form ), esc_url( admin_url( 'admin-post.php' ) ), esc_attr( $action ) );
			wp_nonce_field( $action );
			echo '</form>';
		}
	}

	/**
	 * Sends the archive.
	 *
	 * @since 6.5.0
	 */
	public static function download(): void {
		check_admin_referer( self::DOWNLOAD );
		if ( ! current_user_can( 'export' ) ) {
			wp_die( esc_html__( 'Sorry, you are not allowed to export the content of this site.', 'riff' ), 403 );
		}
		$zip  = wp_tempnam( 'riff.zip' );
		$made = self::to_file( $zip );
		if ( is_wp_error( $made ) ) {
			wp_delete_file( $zip );
			wp_die( esc_html( $made->get_error_message() ) );
		}
		$name = sanitize_file_name( sanitize_title( get_bloginfo( 'name' ) ) . '-riff-' . gmdate( 'Y-m-d' ) . '.zip' );
		nocache_headers();
		header( 'Content-Type: application/zip' );
		header( 'Content-Disposition: attachment; filename="' . $name . '"' );
		header( 'Content-Length: ' . (string) filesize( $zip ) );
		while ( ob_get_level() ) {
			ob_end_clean();
		}
		readfile( $zip ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_readfile -- streamed, whatever its size.
		wp_delete_file( $zip );
		exit;
	}

	/**
	 * Opens the site in Playground, or says why it can't.
	 *
	 * @since 6.5.0
	 */
	public static function playground(): void {
		check_admin_referer( self::PLAYGROUND );
		if ( ! current_user_can( 'export' ) ) {
			wp_die( esc_html__( 'Sorry, you are not allowed to export the content of this site.', 'riff' ), 403 );
		}
		$link = self::playground_link();
		if ( is_wp_error( $link ) ) {
			wp_die( esc_html( $link->get_error_message() ), esc_html__( 'Open in Playground', 'riff' ), array( 'back_link' => true ) );
		}
		// A page rather than a redirect: an address this long is too long for a header.
		nocache_headers();
		header( 'Content-Type: text/html; charset=utf-8' );
		header( 'Referrer-Policy: no-referrer' );
		printf(
			'<!doctype html><meta charset="utf-8"><title>%1$s</title><p><a id="riff-playground" href="%2$s">%1$s</a></p><script>location.replace(document.getElementById("riff-playground").href);</script>',
			esc_html__( 'Open in Playground', 'riff' ),
			esc_url( $link, array( 'https' ) )
		);
		exit;
	}
}
