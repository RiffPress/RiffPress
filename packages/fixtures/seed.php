<?php
/**
 * Turns a folder of audio into a post that Riff plays: one audio block per file, in name order,
 * titled from the file's tags, with the folder's cover as the artwork. A folder with manifest.json
 * naming a `name` and a `slug` takes them from it; any other folder is named after
 * itself. A video next to an audio file with the same name becomes that track's video version.
 *
 * Run: npm run seed [-- /path/inside/the/container]   (the dev site)
 *      npm run seed:tests [-- /path]                   (the tests site)
 * With no path, it seeds the public-domain Compositions fixtures. Seeding the same folder twice
 * does nothing the second time.
 *
 * @package Riff
 */

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedVariableFound -- a WP-CLI script, not plugin code.

defined( 'ABSPATH' ) || exit;

if ( ! function_exists( 'riff_seed' ) ) {
	/**
	 * Names the site and gives it the record as its icon, so the demo and a fresh local site look
	 * like the rest of Riff. Nothing is overwritten that someone already set.
	 *
	 * @param string $mark Path to the mark, a square PNG; skipped when unreadable.
	 */
	function riff_seed_site( string $mark = '' ): void {
		if ( in_array( get_option( 'blogname' ), array( '', 'WordPress', 'My WordPress Website' ), true ) ) {
			update_option( 'blogname', 'Riff' );
		}
		if ( in_array( get_option( 'blogdescription' ), array( '', 'Just another WordPress site' ), true ) ) {
			update_option( 'blogdescription', 'A music player for WordPress' );
		}
		if ( ! $mark || ! is_readable( $mark ) || (int) get_option( 'site_icon' ) ) {
			return;
		}
		require_once ABSPATH . 'wp-admin/includes/media.php';
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/image.php';
		$copy = wp_tempnam( 'riff-mark.png' );
		copy( $mark, $copy );
		$id = media_handle_sideload(
			array(
				'name'     => 'riff-mark.png',
				'tmp_name' => $copy,
			),
			0,
			'Riff'
		);
		if ( ! is_wp_error( $id ) ) {
			update_post_meta( $id, '_wp_attachment_context', 'site-icon' );
			update_option( 'site_icon', (int) $id );
		}
	}

	/**
	 * A song's words and the language they are sung in, from its manifest entry, under the keys
	 * an upload through the Media Library puts them: getID3 reads a USLT frame into
	 * `unsynchronised_lyric`, which Riff Lyrics shows, and Riff reads `language`.
	 *
	 * @param array $track The track's manifest entry.
	 * @return array Metadata to add; empty for a track without words.
	 */
	function riff_seed_words( array $track ): array {
		return array_filter(
			array(
				'unsynchronised_lyric' => (string) ( $track['lyrics'] ?? '' ),
				'language'             => (string) ( $track['language'] ?? '' ),
			)
		);
	}

	/**
	 * Files a post under a category, made if it does not exist.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $name    Category name; nothing happens for an empty one.
	 */
	function riff_seed_category( int $post_id, string $name ): void {
		if ( '' === $name || ! $post_id ) {
			return;
		}
		$term = term_exists( $name, 'category' );
		if ( ! $term ) {
			$term = wp_insert_term( $name, 'category' );
		}
		if ( is_array( $term ) ) {
			wp_set_post_categories( $post_id, array( (int) $term['term_id'] ) );
		}
	}

	/**
	 * Seeds an album whose audio is published elsewhere, not uploaded: each track becomes an
	 * attachment that points at the published file, carrying the manifest's title, artist, length,
	 * bit rate and level envelope in its metadata, so the player reads it exactly as it reads an
	 * upload, and the Media Library lists it. Nothing is downloaded. The post has one audio block
	 * per track and a drawn cover. Returns the post ID, or 0 when the post already exists.
	 *
	 * @param string $dir  Folder with manifest.json (remote: true) and levels.json.
	 * @param string $base Where the album's files are published, up to and including the album's folder.
	 * @return int
	 */
	function riff_seed_remote( string $dir, string $base ): int {
		$dir      = rtrim( $dir, '/' ) . '/';
		$base     = rtrim( $base, '/' ) . '/';
		$manifest = is_readable( $dir . 'manifest.json' ) ? json_decode( (string) file_get_contents( $dir . 'manifest.json' ), true ) : array();
		$manifest = is_array( $manifest ) ? $manifest : array();
		$name     = (string) ( $manifest['name'] ?? basename( $dir ) );
		$slug     = sanitize_title( (string) ( $manifest['slug'] ?? $name ) );
		if ( empty( $manifest['tracks'] ) || get_page_by_path( $slug, OBJECT, 'post' ) ) {
			return 0;
		}
		$levels = is_readable( $dir . 'levels.json' ) ? json_decode( (string) file_get_contents( $dir . 'levels.json' ), true ) : array();
		$levels = is_array( $levels ) ? $levels : array();

		// The post first, so the attachments have a parent; its date spread so a library has an order.
		$post_id = (int) wp_insert_post(
			array(
				'post_title'  => $name,
				'post_name'   => $slug,
				'post_status' => 'publish',
				'post_date'   => gmdate( 'Y-m-d H:i:s', time() - ( crc32( $slug ) % 400 ) * DAY_IN_SECONDS ),
			)
		);
		if ( ! $post_id ) {
			return 0;
		}
		$ids = array();
		foreach ( (array) $manifest['tracks'] as $track ) {
			$file = (string) ( $track['file'] ?? '' );
			if ( '' === $file ) {
				continue;
			}
			$url = $base . rawurlencode( $file );
			$id  = (int) wp_insert_attachment(
				array(
					'post_title'     => (string) ( $track['title'] ?? pathinfo( $file, PATHINFO_FILENAME ) ),
					'post_mime_type' => 'audio/mpeg',
					'post_status'    => 'inherit',
					'guid'           => $url,
				),
				'',
				$post_id
			);
			if ( ! $id ) {
				continue;
			}
			wp_update_attachment_metadata(
				$id,
				array(
					'artist'      => (string) ( $track['artist'] ?? $track['uploader'] ?? $manifest['curator'] ?? '' ),
					'album'       => $name,
					'length'      => (float) ( $track['duration'] ?? 0 ),
					'dataformat'  => 'mp3',
					'fileformat'  => 'mp3',
					'bitrate'     => 1000 * (float) ( $track['bitrate'] ?? 0 ),
					'riff_levels' => (string) ( $levels[ $track['id'] ?? '' ] ?? '' ),
				) + riff_seed_words( $track )
			);
			$ids[] = $id;
		}
		$intro = isset( $manifest['curator'] ) ? sprintf( '<!-- wp:paragraph --><p>%s</p><!-- /wp:paragraph -->', esc_html( (string) $manifest['curator'] ) ) : '';
		wp_update_post(
			array(
				'ID'           => $post_id,
				'post_content' => $intro . riff_seed_blocks( $ids ),
			)
		);
		riff_seed_category( $post_id, (string) ( $manifest['category'] ?? '' ) );
		return $post_id;
	}

	/**
	 * The tracks as blocks: one Playlist block holding them all where WordPress has it (7.1), the way
	 * the guide tells a first-timer to add an album; one Audio block per track on an older site.
	 *
	 * @param int[] $ids Audio attachment IDs, in order.
	 * @return string Block markup.
	 */
	function riff_seed_blocks( array $ids ): string {
		if ( ! WP_Block_Type_Registry::get_instance()->is_registered( 'core/playlist' ) ) {
			$blocks = array();
			foreach ( $ids as $id ) {
				$blocks[] = sprintf(
					'<!-- wp:audio {"id":%1$d} --><figure class="wp-block-audio"><audio controls src="%2$s"></audio></figure><!-- /wp:audio -->',
					$id,
					esc_url( wp_get_attachment_url( $id ) )
				);
			}
			return implode( '', $blocks );
		}
		$items = '';
		foreach ( $ids as $id ) {
			$meta   = wp_get_attachment_metadata( $id );
			$meta   = is_array( $meta ) ? $meta : array();
			$art_id = (int) get_post_thumbnail_id( $id );
			$attrs  = array_filter(
				array(
					'id'     => $id,
					'src'    => wp_get_attachment_url( $id ),
					'title'  => get_the_title( $id ),
					'artist' => (string) ( $meta['artist'] ?? '' ),
					'album'  => (string) ( $meta['album'] ?? '' ),
					'image'  => $art_id ? (string) wp_get_attachment_image_url( $art_id, 'medium' ) : '',
					'length' => (string) ( $meta['length_formatted'] ?? '' ),
				),
				static fn( $v ) => '' !== $v && null !== $v
			);
			$items .= '<!-- wp:playlist-track ' . wp_json_encode( $attrs, JSON_UNESCAPED_SLASHES ) . ' /-->';
		}
		return '<!-- wp:playlist --><figure class="wp-block-playlist"><ol class="wp-block-playlist__tracklist wp-block-playlist__tracklist-show-numbers">' . $items . '</ol></figure><!-- /wp:playlist -->';
	}

	/**
	 * Seeds one folder through Riff's own import, the code behind `wp riff import`, then adds
	 * what only a demo folder's manifest.json knows: the post's name and slug, its intro and
	 * category, and the titles, artists, lengths and level envelopes of tracks whose tags say
	 * nothing, as on a PHP that cannot read them (Playground's cannot). Returns the post ID, or 0
	 * when the post already exists.
	 *
	 * @param string $dir Folder of audio files.
	 * @return int
	 * @throws RuntimeException When the folder cannot be read or nothing in it imports.
	 */
	function riff_seed( string $dir ): int {
		$dir      = rtrim( $dir, '/' ) . '/';
		$manifest = is_readable( $dir . 'manifest.json' ) ? json_decode( (string) file_get_contents( $dir . 'manifest.json' ), true ) : array();
		$manifest = is_array( $manifest ) ? $manifest : array();
		$name     = (string) ( $manifest['name'] ?? ucwords( str_replace( array( '-', '_' ), ' ', basename( $dir ) ) ) );
		$slug     = sanitize_title( (string) ( $manifest['slug'] ?? $name ) );

		if ( get_page_by_path( $slug, OBJECT, 'post' ) ) {
			return 0;
		}

		$result = \Riff\Import::folder( $dir );
		if ( is_wp_error( $result ) ) {
			throw new RuntimeException( esc_html( $result->get_error_message() ) );
		}
		$album = null;
		foreach ( $result['albums'] as $report ) {
			if ( realpath( $report['folder'] ) === realpath( $dir ) ) {
				$album = $report;
			}
		}
		if ( ! $album || ! $album['post'] ) {
			$failed = $album ? implode( '; ', array_map( static fn( $f, $e ) => "$f: $e", array_keys( $album['failed'] ), $album['failed'] ) ) : '';
			throw new RuntimeException( esc_html( 'Nothing was imported from ' . $dir . ( $failed ? " ($failed)" : '' ) ) );
		}

		$levels = is_readable( $dir . 'levels.json' ) ? json_decode( (string) file_get_contents( $dir . 'levels.json' ), true ) : array();
		$levels = is_array( $levels ) ? $levels : array();
		foreach ( (array) ( $manifest['tracks'] ?? array() ) as $track ) {
			$file = (string) ( $track['file'] ?? '' );
			$id   = '' !== $file && is_readable( $dir . $file ) ? riff_seed_imported( $dir . $file ) : 0;
			if ( ! $id ) {
				continue;
			}
			$tags = wp_read_audio_metadata( $dir . $file );
			if ( empty( $tags['title'] ) && ! empty( $track['title'] ) ) {
				wp_update_post(
					array(
						'ID'         => $id,
						'post_title' => (string) $track['title'],
					)
				);
			}
			// The player reads artist, album and length from the attachment's metadata, where an
			// upload through the Media Library puts them; the manifest fills what the tags did not.
			$meta    = wp_get_attachment_metadata( $id );
			$meta    = is_array( $meta ) ? $meta : array();
			$known   = array(
				'artist'      => (string) ( $track['artist'] ?? $track['uploader'] ?? '' ),
				'album'       => $name,
				'length'      => (float) ( $track['duration'] ?? 0 ),
				// The level envelope, measured when the album was built: the drawn cover's groove.
				'riff_levels' => (string) ( $levels[ $track['id'] ?? '' ] ?? '' ),
			) + riff_seed_words( $track );
			$changed = false;
			foreach ( $known as $key => $value ) {
				if ( empty( $meta[ $key ] ) && ! empty( $value ) ) {
					$meta[ $key ] = $value;
					$changed      = true;
				}
			}
			if ( $changed ) {
				wp_update_attachment_metadata( $id, $meta );
			}
		}

		$post_id = (int) $album['post'];
		$intro   = isset( $manifest['curator'] ) ? sprintf( '<!-- wp:paragraph --><p>%s</p><!-- /wp:paragraph -->', esc_html( (string) $manifest['curator'] ) ) : '';
		wp_update_post(
			array(
				'ID'           => $post_id,
				'post_title'   => $name,
				'post_name'    => $slug,
				'post_content' => $intro . get_post_field( 'post_content', $post_id, 'raw' ),
			)
		);
		riff_seed_category( $post_id, (string) ( $manifest['category'] ?? '' ) );
		return $post_id;
	}

	/**
	 * The attachment the import made from a file, found by its contents as the import finds it.
	 *
	 * @param string $path File.
	 * @return int Attachment ID, or 0.
	 */
	function riff_seed_imported( string $path ): int {
		$found = get_posts(
			array(
				'post_type'      => 'attachment',
				'post_status'    => 'any',
				'fields'         => 'ids',
				'posts_per_page' => 1,
				'meta_key'       => \Riff\Import::HASH, // phpcs:ignore WordPress.DB.SlowDBQuery -- a seed script.
				'meta_value'     => (string) sha1_file( $path ), // phpcs:ignore WordPress.DB.SlowDBQuery
			)
		);
		return $found ? (int) $found[0] : 0;
	}
}

if ( ! function_exists( 'riff_seed_albums' ) ) {
	/**
	 * Every album in a demo bundle (albums.json, built by .github/scripts/demo-albums.js): each one's
	 * manifest and levels written to a folder of its own beside the bundle, and seeded as a streamed
	 * album, playing from its own base when the bundle names one, from $base/<slug>/ when not.
	 *
	 * @param string $bundle Path to albums.json.
	 * @param string $base   Where the albums' audio is published, each under a folder named for it.
	 * @return int[] The posts made.
	 */
	function riff_seed_albums( string $bundle, string $base ): array {
		$albums = is_readable( $bundle ) ? json_decode( (string) file_get_contents( $bundle ), true ) : array();
		$made   = array();
		foreach ( is_array( $albums ) ? $albums : array() as $slug => $album ) {
			if ( ! preg_match( '/^[a-z0-9]+(-[a-z0-9]+)*$/', (string) $slug ) || empty( $album['manifest'] ) ) {
				continue;
			}
			$dir = dirname( $bundle ) . '/albums/' . $slug;
			wp_mkdir_p( $dir );
			file_put_contents( $dir . '/manifest.json', wp_json_encode( $album['manifest'] ) );
			file_put_contents( $dir . '/levels.json', wp_json_encode( $album['levels'] ?? array() ) );
			$from = (string) ( $album['base'] ?? '' );
			$id   = riff_seed_remote( $dir, '' !== $from ? $from : rtrim( $base, '/' ) . '/' . $slug );
			if ( $id ) {
				$made[] = $id;
			}
		}
		return $made;
	}
}

// Only as `wp eval-file seed.php [folder]`: WP-CLI puts the script's path in $file. A require from
// other code (the Playground demo) gets the function and nothing else.
if ( defined( 'WP_CLI' ) && WP_CLI && isset( $file ) && realpath( (string) $file ) === __FILE__ ) {
	$dir = isset( $args[0] ) ? (string) $args[0] : __DIR__ . '/compositions';
	if ( ! is_dir( $dir ) ) {
		WP_CLI::error( esc_html( "No folder at $dir." ) );
	}
	riff_seed_site( dirname( __DIR__, 2 ) . '/site/brand/mark.png' );
	// Every album beside it that is published rather than uploaded, pointed at the live demo set,
	// or wherever RIFF_DEMO_BASE says.
	$base      = (string) getenv( 'RIFF_DEMO_BASE' );
	$base      = rtrim( '' !== $base ? $base : 'https://riffpress.com/demo', '/' ) . '/';
	$manifests = glob( __DIR__ . '/*/manifest.json' );
	foreach ( is_array( $manifests ) ? $manifests : array() as $remote ) {
		$album = json_decode( (string) file_get_contents( $remote ), true );
		if ( ! empty( $album['remote'] ) ) {
			// Audio built here by `npm run albums` plays from this checkout, so a new or changed album
			// plays before it is published; wp-env serves the repository at wp-content/riff/.
			$here = dirname( $remote ) . '/audio';
			$from = is_dir( $here ) && ! getenv( 'RIFF_DEMO_BASE' ) ? content_url( 'riff/packages/fixtures/' . basename( dirname( $remote ) ) . '/audio' ) : $base . basename( dirname( $remote ) );
			$made = riff_seed_remote( dirname( $remote ), $from );
			if ( $made ) {
				WP_CLI::log( 'Seeded ' . get_permalink( $made ) . ' (streamed)' );
			}
		}
	}
	try {
		$demo_id = riff_seed( $dir );
	} catch ( RuntimeException $e ) {
		WP_CLI::error( esc_html( $e->getMessage() ) );
	}
	if ( $demo_id ) {
		WP_CLI::success( 'Seeded ' . get_permalink( $demo_id ) );
	} else {
		WP_CLI::success( 'That post already exists.' );
	}
}
