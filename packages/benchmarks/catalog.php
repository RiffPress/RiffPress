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
 * Run: wp eval-file packages/benchmarks/catalog.php build [--tracks=5000]
 *      wp --exec="define( 'SAVEQUERIES', true );" eval-file packages/benchmarks/catalog.php measure
 * (SAVEQUERIES has to be on before WordPress loads for the query counts.)
 *   build    adds the catalogue once (a second run adds nothing)
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
foreach ( $args as $riff_bench_arg ) {
	if ( preg_match( '/^--tracks=(\d+)$/', $riff_bench_arg, $m ) ) {
		$riff_bench_tracks = max( 10, (int) $m[1] );
	}
}

if ( 'build' === $riff_bench_mode ) {
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
			$file = sprintf( 'bench/%04d-%02d.mp3', $a, $t );
			$id   = wp_insert_attachment(
				array(
					'post_title'     => sprintf( 'Bench Track %04d %02d', $a, $t ),
					'post_mime_type' => 'audio/mpeg',
					'post_status'    => 'inherit',
					'post_parent'    => $parent,
				),
				$file,
				$parent
			);
			wp_update_attachment_metadata(
				$id,
				array(
					'title'        => sprintf( 'Bench Track %04d %02d', $a, $t ),
					'artist'       => $artist,
					'band'         => $artist,
					'album'        => $album,
					'track_number' => (string) $t,
					'length'       => 180 + ( $t * 7 ) % 120,
					'fileformat'   => 'mp3',
					'bitrate'      => 256000,
				)
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
