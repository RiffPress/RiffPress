<?php
/**
 * Draws the covers for the wall on the site's landing page: Riff's own cover drawing, run on
 * records in the public domain, with the palette and layout chosen from each one's name as the
 * player chooses them, and grooves that waver with level data taken from the demo's own tracks.
 * Writes SVGs to site/covers/wall/; cover-wall.js turns them into the AVIFs the page uses.
 *
 * Run: npx wp-env run cli wp eval-file wp-content/riff/.github/scripts/cover-wall.php
 *
 * @package Riff
 */

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedVariableFound -- a WP-CLI script, not plugin code.
// phpcs:disable WordPress.WP.AlternativeFunctions -- writes files of its own in the repository.

use Riff\Listen\Cover;

defined( 'ABSPATH' ) || exit;

$root = dirname( __DIR__, 2 );
$out  = $root . '/site/covers/wall';
if ( ! is_dir( $out ) ) {
	mkdir( $out, 0755, true );
}

// The demo's level data, one string a track, to borrow from.
$levels = array();
foreach ( glob( $root . '/packages/fixtures/*/levels.json' ) as $file ) {
	foreach ( (array) json_decode( (string) file_get_contents( $file ), true ) as $line ) {
		if ( is_string( $line ) && strlen( $line ) >= 8 ) {
			$levels[] = $line;
		}
	}
}

// Title, artist, tracks: records whose music is in the public domain.
$records = array(
	array( 'Maple Leaf Rag', 'Scott Joplin', 8 ),
	array( 'St. Louis Blues', 'W. C. Handy', 6 ),
	array( 'Clair de Lune', 'Claude Debussy', 9 ),
	array( 'The Four Seasons', 'Antonio Vivaldi', 12 ),
	array( 'Gymnopédies', 'Erik Satie', 3 ),
	array( 'Goldberg Variations', 'Johann Sebastian Bach', 12 ),
	array( 'Rhapsody in Blue', 'George Gershwin', 4 ),
	array( 'Nocturnes', 'Frédéric Chopin', 11 ),
	array( 'Shenandoah', 'Traditional', 7 ),
	array( 'The Stars and Stripes Forever', 'John Philip Sousa', 10 ),
	array( 'Moonlight Sonata', 'Ludwig van Beethoven', 3 ),
	array( 'Danny Boy', 'Traditional', 8 ),
	array( 'The Planets', 'Gustav Holst', 7 ),
	array( 'Eine kleine Nachtmusik', 'Wolfgang Amadeus Mozart', 4 ),
	array( 'Swanee River', 'Stephen Foster', 9 ),
	array( 'Peer Gynt', 'Edvard Grieg', 8 ),
	array( 'The Entertainer', 'Scott Joplin', 6 ),
	array( 'Carnival of the Animals', 'Camille Saint-Saëns', 14 ),
	array( 'Pictures at an Exhibition', 'Modest Mussorgsky', 10 ),
	array( 'Amazing Grace', 'Traditional', 5 ),
);

$palettes = Cover::palettes();
$layouts  = Cover::layouts();
foreach ( $records as $n => [ $title, $artist, $count ] ) {
	$slug   = sanitize_title( $title );
	$seed   = crc32( $slug );
	$tracks = array();
	$length = 0;
	for ( $i = 0; $i < $count; $i++ ) {
		// Lengths from two to eight minutes, the same on every run.
		$duration = 120 + ( crc32( $slug . $i ) % 360 );
		$length  += $duration;
		$tracks[] = array(
			'duration' => $duration,
			'levels'   => $levels ? $levels[ ( $n * 7 + $i ) % count( $levels ) ] : '',
		);
	}
	$svg = Cover::draw(
		array(
			'title'    => $title,
			'artist'   => $artist,
			'count'    => $count,
			'duration' => $length,
		),
		$tracks,
		$palettes[ $seed % count( $palettes ) ],
		$layouts[ intdiv( $seed, count( $palettes ) ) % count( $layouts ) ]
	);
	file_put_contents( "$out/$slug.svg", $svg );
	WP_CLI::log( "site/covers/wall/$slug.svg" );
}
