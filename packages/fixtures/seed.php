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
		$titles = array();
		foreach ( (array) ( $manifest['tracks'] ?? array() ) as $track ) {
			if ( ! empty( $track['file'] ) && ! empty( $track['title'] ) ) {
				$titles[ (string) $track['file'] ] = (string) $track['title'];
			}
		}

		$import = static function ( string $file ) use ( $dir, $titles ): int {
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
