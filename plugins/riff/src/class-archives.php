<?php
/**
 * Imports recordings that public archives publish for reuse, with their credit.
 *
 * @since 6.5.0
 * @package Riff
 */

namespace Riff;

use WP_Error;

defined( 'ABSPATH' ) || exit;

/**
 * Public archives: the Library of Congress and Europeana.
 *
 * Rights are per item, so each item's own rights statement is read, and only what is free to
 * reuse is imported: the public domain mark, CC0, CC BY and CC BY-SA. Everything else is skipped,
 * and the report says which and why. Each item is one album, imported through Import::folder() as
 * a folder of its files would be, so what was imported before is skipped in the same way. Each
 * track keeps its source, its licence and its credit in the attachment's own fields, the credit
 * in its caption and all three in its description, and its album's post opens with the credit:
 * a site made this way credits the archive, and doesn't present itself as the archive.
 *
 * The Library of Congress says what is free to use in words rather than with a licence's
 * address, so an item of it is imported only where its rights statement uses the Library's own
 * words for no known copyright, it has no rights advisory, and none of its files is marked
 * restricted. It is credited as RightsStatements.org's No Known Copyright, as the Library
 * speaks only for the U.S., rather than with the public domain mark.
 */
final class Archives {

	/**
	 * The Library of Congress collection imported when none is named: the Edison companies' sound
	 * recordings, which the Library has found no copyright in, and which Citizen DJ offers as free
	 * to use.
	 *
	 * @since 6.5.0
	 */
	public const LOC_COLLECTION = 'edison-company-motion-pictures-and-sound-recordings';

	/**
	 * How many items an import takes, unless it is told otherwise.
	 *
	 * @since 6.5.0
	 */
	public const LIMIT = 25;

	/**
	 * The largest file downloaded, in bytes: well past a lossless 78 side, short of a whole disk.
	 */
	private const MAX = 1024 * MB_IN_BYTES;

	/**
	 * The Library of Congress's own words for an item it knows of no copyright in, as its rights
	 * statements put them.
	 */
	private const LOC_FREE = array(
		'not aware of any u.s. copyright protection',
		'no known restrictions on publication',
		'identified to be in the public domain',
	);

	/**
	 * Audio, by the type a server sends, as the extension the Media Library knows it by.
	 */
	private const TYPES = array(
		'audio/mpeg'   => 'mp3',
		'audio/mp3'    => 'mp3',
		'audio/mp4'    => 'm4a',
		'audio/x-m4a'  => 'm4a',
		'audio/aac'    => 'm4a',
		'audio/flac'   => 'flac',
		'audio/x-flac' => 'flac',
		'audio/ogg'    => 'ogg',
		'audio/opus'   => 'opus',
		'audio/wav'    => 'wav',
		'audio/x-wav'  => 'wav',
		'audio/wave'   => 'wav',
	);

	/**
	 * Imports items from an archive.
	 *
	 * @since 6.5.0
	 *
	 * @param string $archive `loc` or `europeana`.
	 * @param string $what    For `loc`, a collection, by its address or its name in it, or an item by
	 *                        its address; empty for LOC_COLLECTION. For `europeana`, what to search for.
	 * @param array  $args {
	 *     Optional.
	 *
	 *     @type int    $limit   How many items to look at. Default LIMIT.
	 *     @type string $key     Europeana's API key, which it gives anyone who asks.
	 *     @type string $status  Status for new album posts. Default 'publish'.
	 *     @type bool   $dry_run Report what would be imported and skipped, without importing it.
	 * }
	 * @return array{albums: array[], refused: array<string, string>}|WP_Error Each album as
	 *         Import::folder() reports it, and each item refused for its rights, by its address, with why.
	 */
	public static function import( string $archive, string $what = '', array $args = array() ) {
		$args  = wp_parse_args(
			$args,
			array(
				'limit'   => self::LIMIT,
				'key'     => '',
				'status'  => 'publish',
				'dry_run' => false,
			)
		);
		$limit = max( 1, (int) $args['limit'] );
		if ( 'loc' === $archive ) {
			$items = self::loc( $what, $limit );
		} elseif ( 'europeana' === $archive ) {
			$items = self::europeana( $what, $limit, (string) $args['key'] );
		} else {
			return new WP_Error( 'riff_archive', __( 'Riff imports from the Library of Congress (loc) and from Europeana (europeana).', 'riff' ) );
		}
		if ( is_wp_error( $items ) ) {
			return $items;
		}
		$report = array(
			'albums'  => array(),
			'refused' => array(),
		);
		foreach ( $items as $item ) {
			if ( '' === $item['licence'] ) {
				$report['refused'][ $item['url'] ] = $item['reason'];
				continue;
			}
			if ( $args['dry_run'] ) {
				$report['albums'][] = array(
					'folder'   => $item['url'],
					'post'     => 0,
					// What it would download; whether each is in the library already takes downloading it.
					'imported' => $item['files'],
					'skipped'  => array(),
					'failed'   => array(),
				);
				continue;
			}
			$report['albums'][] = self::item( $item, (string) $args['status'] );
		}
		return $report;
	}

	/**
	 * Which of the licences Riff imports a rights statement's address names: `pdm`, `cc0`, `by`
	 * or `by-sa`, or empty for any other.
	 *
	 * @since 6.5.0
	 *
	 * @param string $uri The address, such as http://creativecommons.org/licenses/by/4.0/.
	 * @return string
	 */
	public static function licence( string $uri ): string {
		$uri = (string) preg_replace( '#^https?://(www\.)?#', '', strtolower( trim( $uri ) ) );
		$uri = (string) preg_replace( '#/(deed\.[a-z_-]+|legalcode(\.[a-z_-]+)?)?$#', '', $uri );
		$map = array(
			'#^creativecommons\.org/publicdomain/mark/1\.0$#'           => 'pdm',
			'#^creativecommons\.org/publicdomain/zero/1\.0$#'           => 'cc0',
			'#^creativecommons\.org/licenses/by/\d\.\d(/[a-z]{2})?$#'    => 'by',
			'#^creativecommons\.org/licenses/by-sa/\d\.\d(/[a-z]{2})?$#' => 'by-sa',
		);
		foreach ( $map as $pattern => $licence ) {
			if ( preg_match( $pattern, $uri ) ) {
				return $licence;
			}
		}
		return '';
	}

	/**
	 * A licence's name as a credit gives it, with its version where it has one.
	 *
	 * @param string $licence From licence().
	 * @param string $uri     Its address.
	 * @return string
	 */
	private static function licence_name( string $licence, string $uri ): string {
		$version = preg_match( '#/(\d\.\d)#', $uri, $m ) ? ' ' . $m[1] : '';
		switch ( $licence ) {
			case 'pdm':
				return __( 'Public domain', 'riff' );
			case 'nkc':
				return __( 'No known U.S. copyright, as the Library of Congress states it', 'riff' );
			case 'cc0':
				return __( 'CC0 1.0, no rights reserved', 'riff' );
			case 'by':
				return 'CC BY' . $version;
			case 'by-sa':
				return 'CC BY-SA' . $version;
		}
		return '';
	}

	/**
	 * Items of the Library of Congress, from a collection or one item.
	 *
	 * @param string $what  A collection's address or name, an item's address, or empty.
	 * @param int    $limit How many items.
	 * @return array[]|WP_Error Items, as item() takes them.
	 */
	private static function loc( string $what, int $limit ) {
		$what = trim( $what );
		if ( preg_match( '#^https?://(www\.)?loc\.gov/item/([^/?\#]+)#', $what, $m ) ) {
			$item = self::loc_item( $m[2], '' );
			return is_wp_error( $item ) ? $item : array( $item );
		}
		$slug = '' === $what ? self::LOC_COLLECTION : $what;
		if ( preg_match( '#loc\.gov/collections/([a-z0-9-]+)#', $slug, $m ) ) {
			$slug = $m[1];
		}
		if ( ! preg_match( '/^[a-z0-9-]+$/', $slug ) ) {
			return new WP_Error( 'riff_archive', __( 'Name a Library of Congress collection by its address or its name in it, such as edison-company-motion-pictures-and-sound-recordings, or an item by its address.', 'riff' ) );
		}
		$ids        = array();
		$collection = '';
		$url        = add_query_arg(
			array(
				'fo' => 'json',
				'fa' => 'online-format:audio',
				'c'  => min( 100, $limit ),
			),
			'https://www.loc.gov/collections/' . $slug . '/'
		);
		$have       = 0;
		while ( $url && $have < $limit ) {
			$page = self::json( $url );
			if ( is_wp_error( $page ) ) {
				return $page;
			}
			$collection = '' !== $collection ? $collection : sanitize_text_field( (string) ( $page['title'] ?? '' ) );
			foreach ( (array) ( $page['results'] ?? array() ) as $result ) {
				if ( is_array( $result ) && preg_match( '#loc\.gov/item/([^/?\#]+)#', (string) ( $result['id'] ?? '' ), $m ) ) {
					$ids[] = $m[1];
				}
			}
			$have = count( $ids );
			$next = (string) ( $page['pagination']['next'] ?? '' );
			$url  = str_starts_with( $next, 'https://www.loc.gov/' ) ? $next : '';
		}
		$items = array();
		foreach ( array_slice( array_unique( $ids ), 0, $limit ) as $id ) {
			$item = self::loc_item( $id, $collection );
			// One that can't be read is skipped and said, as one whose rights don't allow it is.
			$items[] = is_wp_error( $item ) ? array(
				'url'     => 'https://www.loc.gov/item/' . $id . '/',
				'licence' => '',
				'reason'  => $item->get_error_message(),
			) : $item;
		}
		return $items;
	}

	/**
	 * One item of the Library of Congress, its rights read from its own statement.
	 *
	 * @param string $id         Its id, as in its address.
	 * @param string $collection The collection it was found in, or empty.
	 * @return array|WP_Error
	 */
	private static function loc_item( string $id, string $collection ) {
		$data = self::json( 'https://www.loc.gov/item/' . rawurlencode( $id ) . '/?fo=json' );
		if ( is_wp_error( $data ) ) {
			return $data;
		}
		$item   = (array) ( $data['item'] ?? array() );
		$rights = strtolower( (string) preg_replace( '/\s+/', ' ', wp_strip_all_tags( implode( ' ', array_map( 'strval', (array) ( $item['rights'] ?? array() ) ) ) ) ) );
		$files  = array();
		$locked = false;
		foreach ( (array) ( $data['resources'] ?? array() ) as $resource ) {
			$file = self::loc_file( (array) ( $resource['files'] ?? array() ) );
			if ( $file ) {
				$files[] = $file['url'];
				$locked  = $locked || ! empty( $file['rights_restricted'] );
			}
		}
		$free = (bool) array_filter( self::LOC_FREE, static fn( $words ) => str_contains( $rights, $words ) );
		// Names as the Library writes them, with a role, with dates, or as a performer: each as the name alone.
		$named = array_map( static fn( $name ) => trim( (string) preg_replace( array( '/\s+--\s.*$/', '/,\s*\d{4}-(\d{4})?$/', '/\s+prf\.?$/' ), '', (string) $name ) ), (array) ( $item['contributor_names'] ?? array() ) );
		// The Library's own suggested credit, where its statement gives one.
		$credit = preg_match( '/suggested credit line:\s*([^<]+?)\.?\s*(<\/p>|$)/i', implode( ' ', array_map( 'strval', (array) ( $item['rights'] ?? array() ) ) ), $m ) ? trim( (string) preg_replace( '/\s+/', ' ', $m[1] ) ) : '';
		if ( '' === $credit ) {
			$credit = '' !== $collection ? 'Library of Congress, ' . $collection : 'Library of Congress';
		}
		$reason = '';
		if ( ! empty( $item['access_restricted'] ) ) {
			$reason = __( 'The Library of Congress restricts access to it.', 'riff' );
		} elseif ( $locked ) {
			$reason = __( 'The Library of Congress marks its recording as restricted.', 'riff' );
		} elseif ( '' !== trim( (string) ( $item['rights_advisory'] ?? '' ) ) ) {
			// Such as "courtesy of Sony Music Entertainment": someone else's permission, not freedom to reuse.
			$reason = __( 'Its rights advisory names conditions on its use.', 'riff' );
		} elseif ( ! $free ) {
			$reason = __( 'Its rights statement does not say it is free to use.', 'riff' );
		} elseif ( ! $files ) {
			$reason = __( 'It has no recording to download.', 'riff' );
		}
		return array(
			'url'         => esc_url_raw( (string) ( $item['url'] ?? 'https://www.loc.gov/item/' . $id . '/' ) ),
			'title'       => sanitize_text_field( (string) ( $item['title'] ?? $id ) ),
			'creator'     => sanitize_text_field( (string) ( $named[0] ?? '' ) ),
			'year'        => (int) substr( (string) ( $item['date'] ?? '' ), 0, 4 ),
			'credit'      => sanitize_text_field( $credit ),
			// The Library's words are its own, and for the U.S. only, so they are credited as what
			// they are: RightsStatements.org's No Known Copyright, not the public domain mark.
			'licence'     => '' === $reason ? 'nkc' : '',
			'licence_url' => 'https://rightsstatements.org/vocab/NKC/1.0/',
			'reason'      => $reason,
			'files'       => $files,
		);
	}

	/**
	 * Whether an address is the Library of Congress's own, over https: its files are on its own
	 * hosts (tile.loc.gov), and Riff declares *.loc.gov in its isolation.json.
	 *
	 * @param string $url An address.
	 * @return bool
	 */
	private static function loc_host( string $url ): bool {
		$host = strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) );
		return 'https' === wp_parse_url( $url, PHP_URL_SCHEME ) && ( 'loc.gov' === $host || str_ends_with( $host, '.loc.gov' ) );
	}

	/**
	 * The file of a resource to import: its MP3 where it has one, as the smaller, else its first audio.
	 *
	 * @param array $groups The resource's files, in groups.
	 * @return array|null The file, with its `url`.
	 */
	private static function loc_file( array $groups ): ?array {
		$audio = array();
		foreach ( $groups as $group ) {
			foreach ( (array) $group as $file ) {
				$url = is_array( $file ) ? (string) ( $file['url'] ?? $file['filename'] ?? '' ) : '';
				if ( '' !== $url && str_starts_with( (string) ( $file['mimetype'] ?? '' ), 'audio/' ) && self::loc_host( $url ) ) {
					$audio[] = array_merge( $file, array( 'url' => $url ) );
				}
			}
		}
		foreach ( $audio as $file ) {
			if ( 'audio/mpeg' === $file['mimetype'] ) {
				return $file;
			}
		}
		return $audio[0] ?? null;
	}

	/**
	 * Sound recordings on Europeana that match a search, among those its own filter says are free
	 * to reuse; each item's rights are still read from its own statement.
	 *
	 * @param string $query What to search for.
	 * @param int    $limit How many items.
	 * @param string $key   The API key.
	 * @return array[]|WP_Error Items, as item() takes them.
	 */
	private static function europeana( string $query, int $limit, string $key ) {
		if ( '' === trim( $key ) ) {
			return new WP_Error( 'riff_archive', __( 'Europeana asks for an API key, which it gives anyone who asks: https://pro.europeana.eu/page/get-api', 'riff' ) );
		}
		if ( '' === trim( $query ) ) {
			return new WP_Error( 'riff_archive', __( 'Say what to search Europeana for.', 'riff' ) );
		}
		$items  = array();
		$cursor = '*';
		$have   = 0;
		while ( '' !== $cursor && $have < $limit ) {
			// Built by hand, as the search takes `qf` twice.
			$url  = 'https://api.europeana.eu/record/v2/search.json?' . http_build_query(
				array(
					'wskey'       => $key,
					'query'       => $query,
					'reusability' => 'open',
					'media'       => 'true',
					'profile'     => 'rich',
					'rows'        => min( 100, $limit - $have ),
					'cursor'      => $cursor,
				)
			) . '&qf=TYPE%3ASOUND';
			$page = self::json( $url );
			if ( is_wp_error( $page ) ) {
				return $page;
			}
			foreach ( (array) ( $page['items'] ?? array() ) as $found ) {
				if ( is_array( $found ) ) {
					$items[] = self::europeana_item( $found );
				}
			}
			$have = count( $items );
			// A page with nothing on it is the last, whatever it says comes next.
			$cursor = ! empty( $page['items'] ) ? (string) ( $page['nextCursor'] ?? '' ) : '';
		}
		return array_slice( $items, 0, $limit );
	}

	/**
	 * One item of a Europeana search, its rights read from its own statement.
	 *
	 * @param array $found The item, as the search gives it.
	 * @return array
	 */
	private static function europeana_item( array $found ): array {
		$first   = static fn( $key ) => sanitize_text_field( (string) ( ( (array) ( $found[ $key ] ?? array() ) )[0] ?? '' ) );
		$rights  = (string) ( ( (array) ( $found['rights'] ?? array() ) )[0] ?? '' );
		$licence = self::licence( $rights );
		$file    = esc_url_raw( (string) ( ( (array) ( $found['edmIsShownBy'] ?? array() ) )[0] ?? '' ), array( 'http', 'https' ) );
		$id      = (string) ( $found['id'] ?? '' );
		$reason  = '';
		if ( '' === $licence ) {
			/* translators: %s: The address of an item's rights statement. */
			$reason = sprintf( __( 'Its rights statement, %s, is not one that lets it be reused.', 'riff' ), '' !== $rights ? $rights : __( 'none', 'riff' ) );
		} elseif ( '' === $file ) {
			$reason = __( 'It has no recording to download.', 'riff' );
		}
		$provider = $first( 'dataProvider' );
		return array(
			'url'         => esc_url_raw( 'https://www.europeana.eu/item' . $id ),
			'title'       => $first( 'title' ),
			'creator'     => $first( 'dcCreator' ),
			'year'        => (int) $first( 'year' ),
			/* translators: %s: The archive that holds an item, such as National Library of France. */
			'credit'      => '' !== $provider ? sprintf( __( '%s, via Europeana', 'riff' ), $provider ) : 'Europeana',
			'licence'     => '' === $reason ? $licence : '',
			'licence_url' => esc_url_raw( $rights ),
			'reason'      => $reason,
			'files'       => '' !== $file ? array( $file ) : array(),
		);
	}

	/**
	 * Imports one item as an album: its files downloaded into a folder of their own, imported by
	 * Import::folder(), and each track and the album's post given the item's credit.
	 *
	 * @param array  $item   The item.
	 * @param string $status Status for a new album post.
	 * @return array The album, as Import::folder() reports it.
	 */
	private static function item( array $item, string $status ): array {
		$dir    = get_temp_dir() . 'riff-archive-' . wp_generate_password( 20, false );
		$report = array(
			'folder'   => $item['url'],
			'post'     => 0,
			'imported' => array(),
			'skipped'  => array(),
			'failed'   => array(),
		);
		// isolation: write -- a folder of its own under the temp folder, emptied and removed below.
		wp_mkdir_p( $dir );
		try {
			$files = array();
			foreach ( $item['files'] as $n => $url ) {
				$name = sprintf( '%02d - %s', $n + 1, sanitize_file_name( mb_substr( '' !== $item['title'] ? $item['title'] : 'Recording', 0, 80 ) ) );
				$file = self::download( $url, $dir . '/' . $name );
				if ( is_wp_error( $file ) ) {
					$report['failed'][ $url ] = $file->get_error_message();
					continue;
				}
				$files[] = $file;
			}
			if ( ! $files ) {
				return $report;
			}
			$before = self::album_post( $item['url'] );
			$result = Import::folder(
				$dir,
				array(
					'as'     => $item['url'],
					'status' => $status,
				)
			);
			if ( is_wp_error( $result ) || ! $result['albums'] ) {
				return $report;
			}
			$album = $result['albums'][0];
			foreach ( $files as $n => $file ) {
				// Only a file imported now: one skipped is someone's already, credited as they left it.
				$id = in_array( wp_basename( $file ), $album['imported'], true ) ? self::attachment( (string) sha1_file( $file ) ) : 0;
				if ( $id ) {
					self::credit( $id, $item, count( $files ) > 1 ? $n + 1 : 0 );
				}
			}
			if ( $album['post'] && ! $before ) {
				wp_update_post(
					array(
						'ID'           => $album['post'],
						'post_title'   => $item['title'],
						'post_content' => self::credit_block( $item ) . get_post_field( 'post_content', $album['post'], 'raw' ),
					)
				);
			}
			return array_merge( $album, array( 'failed' => array_merge( $report['failed'], $album['failed'] ) ) );
		} finally {
			foreach ( (array) glob( $dir . '/*' ) as $left ) {
				wp_delete_file( (string) $left );
			}
			@rmdir( $dir ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_rmdir -- a temporary folder of Riff's own, emptied above.
		}
	}

	/**
	 * Downloads a recording, named for the type of audio the server says it is.
	 *
	 * @param string $url  Its address.
	 * @param string $stem Where to keep it, without an extension.
	 * @return string|WP_Error The file.
	 */
	private static function download( string $url, string $stem ) {
		$tmp      = $stem . '.part';
		$response = wp_safe_remote_get(
			$url,
			array(
				'timeout'             => 300,
				'stream'              => true,
				'filename'            => $tmp,
				'limit_response_size' => self::MAX,
				'user-agent'          => self::agent(),
			)
		);
		$code     = (int) wp_remote_retrieve_response_code( $response );
		$type     = strtolower( trim( (string) strtok( (string) wp_remote_retrieve_header( $response, 'content-type' ), ';' ) ) );
		$ext      = self::TYPES[ $type ] ?? '';
		if ( is_wp_error( $response ) || 200 !== $code || '' === $ext ) {
			wp_delete_file( $tmp );
			if ( is_wp_error( $response ) ) {
				return $response;
			}
			return new WP_Error(
				'riff_archive_download',
				200 !== $code
					/* translators: %d: An HTTP status code, such as 403. */
					? sprintf( __( 'The archive would not send it (HTTP %d).', 'riff' ), $code )
					: __( 'The archive sent something that is not audio.', 'riff' )
			);
		}
		// Cut off at the limit, which the HTTP library does without saying so.
		if ( (int) filesize( $tmp ) >= self::MAX ) {
			wp_delete_file( $tmp );
			return new WP_Error( 'riff_archive_download', __( 'The recording is larger than Riff downloads.', 'riff' ) );
		}
		$file = $stem . '.' . $ext;
		// isolation: write -- the download's .part file to its name, both in item()'s temp folder.
		if ( ! rename( $tmp, $file ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.rename_rename -- within a temporary folder of Riff's own.
			wp_delete_file( $tmp );
			return new WP_Error( 'riff_archive_download', __( 'The download could not be kept.', 'riff' ) );
		}
		return $file;
	}

	/**
	 * The album post an item was imported into before, if any.
	 *
	 * @param string $url The item's address.
	 * @return int Post ID, or 0.
	 */
	private static function album_post( string $url ): int {
		$found = get_posts(
			array(
				'post_type'      => 'post',
				'post_status'    => 'any',
				'fields'         => 'ids',
				'posts_per_page' => 1,
				'no_found_rows'  => true,
				// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- one lookup per item, only while importing.
				'meta_query'     => array(
					array(
						'key'   => Import::FOLDER,
						'value' => $url,
					),
				),
			)
		);
		return $found ? (int) $found[0] : 0;
	}

	/**
	 * The attachment a file with these contents was imported as, if any.
	 *
	 * @param string $hash The file's hash.
	 * @return int Attachment ID, or 0.
	 */
	private static function attachment( string $hash ): int {
		$found = get_posts(
			array(
				'post_type'      => 'attachment',
				'post_status'    => 'inherit',
				'fields'         => 'ids',
				'posts_per_page' => 1,
				'no_found_rows'  => true,
				// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- one lookup per file, only while importing.
				'meta_query'     => array(
					array(
						'key'   => Import::HASH,
						'value' => $hash,
					),
				),
			)
		);
		return $found ? (int) $found[0] : 0;
	}

	/**
	 * A track's credit, its caption: what it is, who made it, where it is from, and its licence.
	 *
	 * @since 6.5.0
	 *
	 * @param array $item The item.
	 * @return string
	 */
	public static function credit_line( array $item ): string {
		$what = '' !== $item['creator']
			/* translators: 1: A recording's title, 2: Who made it. */
			? sprintf( __( '“%1$s” by %2$s', 'riff' ), $item['title'], $item['creator'] )
			/* translators: %s: A recording's title. */
			: sprintf( __( '“%s”', 'riff' ), $item['title'] );
		return sprintf( '%s. %s. %s.', $what, rtrim( $item['credit'], '.' ), self::licence_name( $item['licence'], $item['licence_url'] ) );
	}

	/**
	 * Gives a track its credit, its source and its licence, in the attachment's own fields: the
	 * caption the credit, the description all three, with their addresses. Its title, artist and
	 * year come from the item where its tags have none.
	 *
	 * @param int   $id   Attachment ID.
	 * @param array $item The item.
	 * @param int   $part Which of the item's recordings it is, or 0 when it has one.
	 */
	private static function credit( int $id, array $item, int $part ): void {
		$title = $part ? sprintf( '%s (%d)', $item['title'], $part ) : $item['title'];
		$lines = array(
			self::credit_line( $item ),
			/* translators: %s: The address of the item in its archive. */
			sprintf( __( 'Source: %s', 'riff' ), $item['url'] ),
			/* translators: 1: A licence's name, 2: Its address. */
			sprintf( __( 'Licence: %1$s, %2$s', 'riff' ), self::licence_name( $item['licence'], $item['licence_url'] ), $item['licence_url'] ),
		);
		wp_update_post(
			array(
				'ID'           => $id,
				'post_title'   => $title,
				'post_excerpt' => self::credit_line( $item ),
				'post_content' => implode( "\n", $lines ),
			)
		);
		$meta = wp_get_attachment_metadata( $id );
		$meta = is_array( $meta ) ? $meta : array();
		$tags = array_filter(
			array(
				'title'  => $title,
				'artist' => $item['creator'],
				'album'  => $item['title'],
				'year'   => $item['year'] ? (string) $item['year'] : '',
			)
		);
		$more = array_diff_key( $tags, array_filter( $meta ) );
		if ( $more ) {
			// Saved through core, so the catalog files it under its album and artist.
			Tracks::update_metadata( $id, $more );
		}
	}

	/**
	 * The paragraph a new album post opens with: its credit, and where it is from.
	 *
	 * @param array $item The item.
	 * @return string
	 */
	private static function credit_block( array $item ): string {
		return sprintf(
			'<!-- wp:paragraph --><p>%1$s <a href="%2$s">%3$s</a></p><!-- /wp:paragraph -->',
			esc_html( self::credit_line( $item ) ),
			esc_url( $item['url'] ),
			esc_html__( 'Source', 'riff' )
		);
	}

	/**
	 * An archive's JSON answer.
	 *
	 * @param string $url Address.
	 * @return array|WP_Error
	 */
	private static function json( string $url ) {
		$host     = (string) wp_parse_url( $url, PHP_URL_HOST );
		$response = wp_safe_remote_get(
			$url,
			array(
				'timeout'    => 30,
				'headers'    => array( 'Accept' => 'application/json' ),
				'user-agent' => self::agent(),
			)
		);
		if ( is_wp_error( $response ) ) {
			/* translators: 1: A host, such as www.loc.gov, 2: Why it could not be reached. */
			return new WP_Error( 'riff_archive', sprintf( __( '%1$s could not be reached: %2$s', 'riff' ), $host, $response->get_error_message() ) );
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$data = json_decode( (string) wp_remote_retrieve_body( $response ), true );
		if ( 200 !== $code || ! is_array( $data ) ) {
			/* translators: 1: A host, such as www.loc.gov, 2: An HTTP status code, such as 429. */
			return new WP_Error( 'riff_archive', sprintf( __( '%1$s did not answer as expected (HTTP %2$d).', 'riff' ), $host, $code ) );
		}
		return $data;
	}

	/**
	 * Who is asking, as archives ask to be told.
	 *
	 * @return string
	 */
	private static function agent(): string {
		return 'Riff/' . RIFF_VERSION . ' (WordPress; +https://source.riffpress.com/)';
	}
}
