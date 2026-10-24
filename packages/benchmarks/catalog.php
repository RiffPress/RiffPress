<?php
/**
 * The size budget (#368): builds a large catalogue and measures what Riff's routes cost on it.
 *
 * The catalogue is Media Library entries only: audio attachments with the tags WordPress would have
 * read from real files (title, artist, album, track number, length), filed under their albums and
 * artists the way an upload is. No audio is stored; the routes only read the database. A quarter
 * of the tracks sit on published posts, a few on drafts, the rest unattached, as a real library
 * mixes them.
 *
 * Run: wp eval-file packages/benchmarks/catalog.php build [tracks=5000] [messy]
 *      wp --exec="define( 'SAVEQUERIES', true );" eval-file packages/benchmarks/catalog.php measure
 * (SAVEQUERIES has to be on before WordPress loads for the query counts. The arguments are plain
 * words: WP-CLI keeps anything that starts with -- for itself.)
 *   build    adds the catalogue once (a second run adds nothing)
 *   messy    adds, once, the messy library a real site has (#446): tracks with no title, artist or
 *            album, titles of three hundred characters or one word, names in other scripts and
 *            emoji, tags that look like markup, padded whitespace, lengths of zero and ten hours,
 *            "3/12" and duplicate track numbers, two artists' Greatest Hits, a Various Artists
 *            compilation and a 200-track box set. The layout checks run against it in CI.
 *   measure  prints, as JSON, each request's median time over five runs and its query count
 *
 * Nothing here is shipped; it runs on a scratch site, never on one people use.
 *
 * @package Riff
 */

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedVariableFound, WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound, WordPress.WP.GlobalVariablesOverride.Prohibited, WordPress.WP.AlternativeFunctions -- a WP-CLI script run in global scope, not plugin code; SAVEQUERIES is core's constant.

defined( 'ABSPATH' ) || exit;

$riff_bench_mode   = $args[0] ?? 'measure';
$riff_bench_tracks = 5000;
$riff_bench_messy  = in_array( 'messy', $args, true );
foreach ( $args as $riff_bench_arg ) {
	if ( preg_match( '/^-{0,2}tracks=(\d+)$/', $riff_bench_arg, $m ) ) {
		$riff_bench_tracks = max( 10, (int) $m[1] );
	}
}

/**
 * One track of the catalogue: an audio attachment with the tags WordPress would have read from
 * a real file, on a post or unattached. The file is a path only; nothing is stored.
 *
 * @param string $file   Path under uploads.
 * @param string $title  Attachment title, as the uploader would set it.
 * @param array  $meta   Attachment metadata: title, artist, band, album, track_number, length...
 * @param int    $post_id Post ID, or 0.
 * @return int Attachment ID.
 */
function riff_bench_track( string $file, string $title, array $meta, int $post_id = 0 ): int {
	$id = wp_insert_attachment(
		array(
			'post_title'     => $title,
			'post_mime_type' => 'audio/mpeg',
			'post_status'    => 'inherit',
			'post_parent'    => $post_id,
		),
		$file,
		$post_id
	);
	wp_update_attachment_metadata(
		$id,
		$meta + array(
			'fileformat' => 'mp3',
			'bitrate'    => 256000,
		)
	);
	return (int) $id;
}

/**
 * The messy library, as a real site has it. Each case is listed in the file's header.
 *
 * @return int How many tracks it added.
 */
function riff_bench_messy(): int {
	$n     = 0;
	$post  = static fn( string $title, string $status = 'publish' ): int => (int) wp_insert_post(
		array(
			'post_title'  => $title,
			'post_status' => $status,
		)
	);
	$on    = array(); // Each post's tracks, to write into it as audio blocks once they exist.
	$track = static function ( string $title, array $meta, int $post_id = 0 ) use ( &$n, &$on ): int {
		++$n;
		$meta += array( 'length' => 180 + ( $n * 13 ) % 150 );
		if ( null === $meta['length'] ) {
			unset( $meta['length'] );
		}
		$id = riff_bench_track( sprintf( 'bench/messy-%04d.mp3', $n ), $title, $meta, $post_id );
		if ( $post_id ) {
			$on[ $post_id ][] = $id;
		}
		return $id;
	};
	$album = static function ( string $album, string $artist, int $count, int $post_id = 0, ?callable $each = null ) use ( $track ): void {
		for ( $t = 1; $t <= $count; $t++ ) {
			$meta = array(
				'title'        => sprintf( '%s, track %d', $album, $t ),
				'artist'       => $artist,
				'band'         => $artist,
				'album'        => $album,
				'track_number' => (string) $t,
			);
			if ( $each ) {
				$meta = $each( $meta, $t );
			}
			$track( (string) ( $meta['title'] ?? '' ), $meta, $post_id );
		}
	};

	// Two artists' Greatest Hits, on posts with no cover, so the cards and the album pages have
	// a drawn cover each, and the same name twice.
	$album( 'Greatest Hits', 'The Bench Brothers', 10, $post( 'Greatest Hits' ) );
	$album( 'Greatest Hits', 'Bench Sister', 10, $post( 'Greatest Hits, again' ) );
	// A Various Artists compilation: every track by someone else, filed under the band tag.
	$album(
		'Now That Is What I Call Bench',
		'Various Artists',
		20,
		0,
		static fn( array $meta, int $t ): array => array( 'artist' => sprintf( 'Compilation Artist %02d', $t ) ) + $meta
	);
	// A 200-track box set with "3/12" and duplicate track numbers, on a draft post for a few.
	$album(
		'The Complete Bench Sessions',
		'The Bench Brothers',
		200,
		0,
		static function ( array $meta, int $t ): array {
			if ( 0 === $t % 7 ) {
				$meta['track_number'] = sprintf( '%d/%d', $t, 200 );
			} elseif ( 0 === $t % 50 ) {
				$meta['track_number'] = '1';
			}
			return $meta;
		}
	);

	// Names in other scripts, and emoji: an album, an artist and a title each.
	foreach ( array(
		array( 'ليالي الشرق', 'فرقة المقعد' ),
		array( 'שירים מהספסל', 'להקת הספסל' ),
		array( 'ベンチの歌', 'ベンチ楽団' ),
		array( '🎷 Late Night 🎺', '🎸 The Emoji Band 🥁' ),
	) as list( $name, $by ) ) {
		$album( $name, $by, 3 );
	}

	// One-word names with no spaces, and a title of three hundred characters.
	$one = 'Supercalifragilisticexpialidociousandthensomemorewithoutanyspacesatallforeverandeverandeveramen';
	$album( $one, $one, 3 );
	$long = trim( str_repeat( 'A Very Long Title That Goes On and On and On, ', 7 ) );
	$album( $long, 'The Long Titles', 3, $post( $long ), static fn( array $meta ): array => array( 'title' => $long ) + $meta );

	// Tags that look like markup, and padded whitespace.
	$album( 'Rock & Roll <Live>', 'AC/DC & <Friends>', 3, 0, static fn( array $meta, int $t ): array => array( 'title' => sprintf( '<b>Bold</b> & "quoted" %d', $t ) ) + $meta );
	$album( '   Padded   ', '  The Padded Band  ', 3, 0, static fn( array $meta, int $t ): array => array( 'title' => sprintf( '   Padded title %d   ', $t ) ) + $meta );

	// No title: in the tag, on the attachment, or both. No artist, no album, neither.
	$untitled = $post( 'Untitled uploads' );
	for ( $t = 1; $t <= 3; $t++ ) {
		$track(
			'',
			array(
				'artist' => 'The Nameless',
				'album'  => 'Untitled Album',
			),
			$untitled
		);
		$track(
			'',
			array(
				'title'  => '',
				'artist' => 'The Nameless',
				'album'  => 'Untitled Album',
			),
			$untitled
		);
	}
	for ( $t = 1; $t <= 3; $t++ ) {
		$track(
			sprintf( 'No artist %d', $t ),
			array(
				'title' => sprintf( 'No artist %d', $t ),
				'album' => 'Orphans',
			)
		);
		$track(
			sprintf( 'No album %d', $t ),
			array(
				'title'  => sprintf( 'No album %d', $t ),
				'artist' => 'The Orphans',
			)
		);
		$track( sprintf( 'Nothing but a title %d', $t ), array( 'title' => sprintf( 'Nothing but a title %d', $t ) ) );
	}

	// Lengths: zero, missing, and ten hours.
	$track(
		'Zero length',
		array(
			'title'  => 'Zero length',
			'artist' => 'The Clock',
			'album'  => 'Odd Lengths',
			'length' => 0,
		)
	);
	$track(
		'No length',
		array(
			'title'  => 'No length',
			'artist' => 'The Clock',
			'album'  => 'Odd Lengths',
			'length' => null,
		)
	);
	$track(
		'Ten hours',
		array(
			'title'  => 'Ten hours',
			'artist' => 'The Clock',
			'album'  => 'Odd Lengths',
			'length' => 36000,
		)
	);

	// A post's tracks as its audio blocks, so the post pages and the Posts view show them.
	foreach ( $on as $post_id => $ids ) {
		$blocks = '';
		foreach ( $ids as $id ) {
			$blocks .= sprintf( '<!-- wp:audio {"id":%d} --><figure class="wp-block-audio"><audio controls src="%s"></audio></figure><!-- /wp:audio -->', $id, esc_url( (string) wp_get_attachment_url( $id ) ) );
		}
		wp_update_post(
			array(
				'ID'           => $post_id,
				'post_content' => $blocks,
			)
		);
	}

	return $n;
}

if ( 'build' === $riff_bench_mode ) {
	if ( $riff_bench_messy && ! get_option( 'riff_bench_messy' ) ) {
		wp_defer_term_counting( true );
		$riff_bench_added = riff_bench_messy();
		wp_defer_term_counting( false );
		update_option( 'riff_bench_messy', $riff_bench_added, false );
		WP_CLI::success( sprintf( 'Built the messy library: %d tracks.', $riff_bench_added ) );
	} elseif ( $riff_bench_messy ) {
		WP_CLI::success( 'The messy library is already here.' );
	}
	if ( get_option( 'riff_bench_built' ) ) {
		WP_CLI::success( 'The catalogue is already here.' );
		return;
	}
	wp_defer_term_counting( true );
	$per_album = 10;
	$albums    = intdiv( $riff_bench_tracks, $per_album );
	$artists   = max( 1, intdiv( $albums, 5 ) );
	$posts     = array();
	for ( $a = 0; $a < $albums; $a++ ) {
		$artist = sprintf( 'Bench Artist %03d', $a % $artists );
		$album  = sprintf( 'Bench Album %04d', $a );
		// A quarter of the albums are published posts, one in twenty a draft, the rest unattached.
		$parent = 0;
		if ( 0 === $a % 4 ) {
			$parent = wp_insert_post(
				array(
					'post_title'  => $album,
					'post_status' => 0 === $a % 20 ? 'draft' : 'publish',
				)
			);
		}
		for ( $t = 1; $t <= $per_album; $t++ ) {
			riff_bench_track(
				sprintf( 'bench/%04d-%02d.mp3', $a, $t ),
				sprintf( 'Bench Track %04d %02d', $a, $t ),
				array(
					'title'        => sprintf( 'Bench Track %04d %02d', $a, $t ),
					'artist'       => $artist,
					'band'         => $artist,
					'album'        => $album,
					'track_number' => (string) $t,
					'length'       => 180 + ( $t * 7 ) % 120,
				),
				$parent
			);
		}
		if ( $parent ) {
			$posts[] = $parent;
		}
	}
	wp_defer_term_counting( false );
	update_option( 'riff_bench_built', $riff_bench_tracks, false );
	WP_CLI::success( sprintf( 'Built %d tracks in %d albums by %d artists; %d album posts.', $albums * $per_album, $albums, $artists, count( $posts ) ) );
	return;
}

// ---- measure.
if ( ! defined( 'SAVEQUERIES' ) ) {
	define( 'SAVEQUERIES', true );
}
global $wpdb;
wp_set_current_user( 0 );

$album = get_term_by( 'name', 'Bench Album 0001', 'riff_album' );
$cases = array(
	'tracks'           => array( '/riff/v1/tracks', array() ),
	'tracks page 50'   => array( '/riff/v1/tracks', array( 'page' => 50 ) ),
	'tracks search'    => array( '/riff/v1/tracks', array( 'search' => 'Track 0123' ) ),
	'tracks by artist' => array( '/riff/v1/tracks', array( 'search' => 'Bench Artist 042' ) ),
	'tracks album'     => array( '/riff/v1/tracks', array( 'album' => $album ? (int) $album->term_id : 0 ) ),
	'albums'           => array( '/riff/v1/albums', array() ),
	'albums search'    => array( '/riff/v1/albums', array( 'search' => '0123' ) ),
	'artists'          => array( '/riff/v1/artists', array() ),
	'library'          => array( '/riff/v1/library', array() ),
);
$out   = array(
	'database' => method_exists( $wpdb, 'db_server_info' ) ? (string) $wpdb->db_server_info() : get_class( $wpdb ),
	'tracks'   => (int) get_option( 'riff_bench_built' ),
	'cases'    => array(),
);
foreach ( $cases as $name => list( $route, $query ) ) {
	$times = array();
	$count = 0;
	for ( $i = 0; $i < 5; $i++ ) {
		wp_cache_flush();
		$wpdb->queries = array();
		$request       = new WP_REST_Request( 'GET', $route );
		$request->set_query_params( $query );
		$start    = hrtime( true );
		$response = rest_do_request( $request );
		$times[]  = ( hrtime( true ) - $start ) / 1e6;
		$count    = count( $wpdb->queries );
	}
	sort( $times );
	$out['cases'][ $name ] = array(
		'ms'      => round( $times[2], 1 ),
		'queries' => $count,
		'status'  => $response->get_status(),
		'items'   => count( (array) ( $response->get_data()['items'] ?? array() ) ),
	);
}
echo wp_json_encode( $out, JSON_PRETTY_PRINT ) . "\n";
