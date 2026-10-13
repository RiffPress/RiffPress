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
		if ( in_array( get_option( 'blogname' ), array( '', 'callboard', 'WordPress', 'My WordPress Website' ), true ) ) {
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
		$blocks = array();
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
				)
			);
			$blocks[] = sprintf(
				'<!-- wp:audio {"id":%1$d} --><figure class="wp-block-audio"><audio controls src="%2$s"></audio></figure><!-- /wp:audio -->',
				$id,
				esc_url( $url )
			);
		}
		$intro = isset( $manifest['curator'] ) ? sprintf( '<!-- wp:paragraph --><p>%s</p><!-- /wp:paragraph -->', esc_html( (string) $manifest['curator'] ) ) : '';
		wp_update_post(
			array(
				'ID'           => $post_id,
				'post_content' => $intro . implode( '', $blocks ),
			)
		);
		riff_seed_category( $post_id, (string) ( $manifest['category'] ?? '' ) );
		return $post_id;
	}

	/**
	 * Seeds one folder. Returns the post ID, or 0 when the post already exists.
	 *
	 * @param string $dir Folder of audio files.
	 * @return int
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

		require_once ABSPATH . 'wp-admin/includes/media.php';
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/image.php';

		/*
		 * Core registers m4a as audio/mpeg and then refuses the file because it really is audio/mp4;
		 * opus is not registered at all. This folder was chosen by whoever ran the script, so its
		 * audio and video are trusted by extension for the length of the import.
		 */
		$mimes = static fn( array $types ): array => array_merge(
			$types,
			array(
				'm4a'  => 'audio/mp4',
				'opus' => 'audio/ogg',
			)
		);
		$trust = static function ( array $data, string $file, string $filename, $allowed ) {
			$type = wp_check_filetype( $filename, is_array( $allowed ) ? $allowed : null );
			if ( $type['ext'] && preg_match( '#^(audio|video)/#', (string) $type['type'] ) ) {
				return array(
					'ext'             => $type['ext'],
					'type'            => $type['type'],
					'proper_filename' => false,
				);
			}
			return $data;
		};
		add_filter( 'upload_mimes', $mimes );
		add_filter( 'wp_check_filetype_and_ext', $trust, 10, 4 );

		// The manifest's own titles, by file name, for a file whose tags carry none.
		// The manifest's own titles, artists and lengths, by file name, for a file whose tags carry
		// none, or a PHP that cannot read them (Playground's cannot).
		$titles = array();
		$known  = array();
		$levels = is_readable( $dir . 'levels.json' ) ? json_decode( (string) file_get_contents( $dir . 'levels.json' ), true ) : array();
		$levels = is_array( $levels ) ? $levels : array();
		foreach ( (array) ( $manifest['tracks'] ?? array() ) as $track ) {
			if ( empty( $track['file'] ) ) {
				continue;
			}
			$file = (string) $track['file'];
			if ( ! empty( $track['title'] ) ) {
				$titles[ $file ] = (string) $track['title'];
			}
			$known[ $file ] = array(
				'artist'   => (string) ( $track['artist'] ?? $track['uploader'] ?? '' ),
				'album'    => $name,
				'duration' => (float) ( $track['duration'] ?? 0 ),
				'levels'   => (string) ( $levels[ $track['id'] ?? '' ] ?? '' ),
			);
		}

		$import = static function ( string $file ) use ( $dir, $titles, $known ): int {
			$tmp = wp_tempnam( $file );
			copy( $dir . $file, $tmp );
			$attachment_id = media_handle_sideload(
				array(
					'name'     => $file,
					'tmp_name' => $tmp,
				),
				0
			);
			if ( is_wp_error( $attachment_id ) ) {
				throw new RuntimeException( esc_html( $file . ': ' . $attachment_id->get_error_message() ) );
			}
			$attachment_id = (int) $attachment_id;
			// An upload through the Media Library titles audio from its tags; a sideload does not.
			$tags  = wp_read_audio_metadata( $dir . $file );
			$title = (string) ( $tags['title'] ?? '' );
			if ( '' === $title && isset( $titles[ $file ] ) ) {
				$title = $titles[ $file ];
			}
			if ( '' === $title ) {
				// "03 - Artist - Title [id].m4a" becomes "Title".
				$title = preg_replace( '/^\d+\s*-\s*|\s*\[[^\]]*\]$/', '', pathinfo( $file, PATHINFO_FILENAME ) );
				$title = trim( (string) preg_replace( '/^.+?\s-\s/', '', (string) $title ) );
			}
			wp_update_post(
				array(
					'ID'         => $attachment_id,
					'post_title' => $title,
				)
			);
			// What the tags did not give, the manifest does: the player reads artist, album and
			// length from the attachment's metadata, where an upload through the Media Library puts them.
			if ( isset( $known[ $file ] ) ) {
				$meta    = wp_get_attachment_metadata( $attachment_id );
				$meta    = is_array( $meta ) ? $meta : array();
				$changed = false;
				foreach ( array( 'artist', 'album' ) as $key ) {
					if ( empty( $meta[ $key ] ) && '' !== $known[ $file ][ $key ] ) {
						$meta[ $key ] = $known[ $file ][ $key ];
						$changed      = true;
					}
				}
				if ( empty( $meta['length'] ) && $known[ $file ]['duration'] > 0 ) {
					$meta['length'] = $known[ $file ]['duration'];
					$changed        = true;
				}
				// The level envelope, measured when the album was built: the drawn cover's groove.
				if ( empty( $meta['riff_levels'] ) && '' !== $known[ $file ]['levels'] ) {
					$meta['riff_levels'] = $known[ $file ]['levels'];
					$changed             = true;
				}
				if ( $changed ) {
					wp_update_attachment_metadata( $attachment_id, $meta );
				}
			}
			return $attachment_id;
		};

		$cover = 0;
		foreach ( array( 'cover.png', 'cover.jpg', 'folder.jpg' ) as $file ) {
			if ( is_readable( $dir . $file ) ) {
				$cover = $import( $file );
				break;
			}
		}

		$files = scandir( $dir );
		$files = is_array( $files ) ? $files : array();
		$audio = array_filter( $files, static fn( $f ) => preg_match( '/\.(mp3|m4a|flac|ogg|wav|opus)$/i', $f ) );
		$video = array_filter( $files, static fn( $f ) => preg_match( '/\.(webm|mp4|mov)$/i', $f ) );
		sort( $audio );

		$blocks = array();
		foreach ( $audio as $file ) {
			$attachment_id = $import( $file );
			if ( $cover ) {
				set_post_thumbnail( $attachment_id, $cover );
			}
			$stem = pathinfo( $file, PATHINFO_FILENAME );
			foreach ( $video as $clip ) {
				if ( pathinfo( $clip, PATHINFO_FILENAME ) === $stem ) {
					$video_id = $import( $clip );
					wp_update_post(
						array(
							'ID'         => $video_id,
							'post_title' => get_the_title( $attachment_id ),
						)
					);
					if ( $cover ) {
						set_post_thumbnail( $video_id, $cover );
					}
					update_post_meta( $attachment_id, '_riff_video', $video_id );
				}
			}
			$blocks[] = sprintf(
				'<!-- wp:audio {"id":%1$d} --><figure class="wp-block-audio"><audio controls src="%2$s"></audio></figure><!-- /wp:audio -->',
				$attachment_id,
				esc_url( wp_get_attachment_url( $attachment_id ) )
			);
		}

		$intro   = isset( $manifest['curator'] ) ? sprintf( '<!-- wp:paragraph --><p>%s</p><!-- /wp:paragraph -->', esc_html( (string) $manifest['curator'] ) ) : '';
		$demo_id = (int) wp_insert_post(
			array(
				'post_title'   => $name,
				'post_name'    => $slug,
				'post_status'  => 'publish',
				'post_content' => $intro . implode( '', $blocks ),
			)
		);
		if ( $cover ) {
			set_post_thumbnail( $demo_id, $cover );
		}
		riff_seed_category( $demo_id, (string) ( $manifest['category'] ?? '' ) );
		remove_filter( 'upload_mimes', $mimes );
		remove_filter( 'wp_check_filetype_and_ext', $trust );
		return $demo_id;
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
			$made = riff_seed_remote( dirname( $remote ), $base . basename( dirname( $remote ) ) );
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
