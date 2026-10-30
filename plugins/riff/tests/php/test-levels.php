<?php
/**
 * A song's levels, measured on the server as the demo albums' are.
 *
 * @package Riff
 */

use Riff\Tracks;
use Riff\Transcode;

/**
 * Riff\Transcode's levels.
 */
class Test_Riff_Levels extends Riff_TestCase {

	public function test_silence_is_all_zeros_and_the_loudest_moment_a_nine(): void {
		$quiet = str_repeat( chr( 128 ), 1000 );
		$loud  = str_repeat( chr( 255 ) . chr( 1 ), 500 );

		$this->assertSame( '0000000000', Transcode::envelope( $quiet ), 'a value for each tenth of a second' );
		$this->assertSame( '0000000000999999999', Transcode::envelope( $quiet . substr( $loud, 0, 900 ) ) );
		$this->assertSame( '', Transcode::envelope( str_repeat( chr( 128 ), 99 ) ), 'nothing measured, nothing claimed' );
	}

	public function test_a_quiet_passage_still_shows_against_the_loudest(): void {
		// A quarter of the loudest is half of its digit, as the square root draws it.
		$levels = Transcode::envelope( str_repeat( chr( 128 + 100 ), 100 ) . str_repeat( chr( 128 + 25 ), 100 ) );

		$this->assertSame( '95', $levels );
	}

	public function test_a_long_song_keeps_at_most_a_groove_of_them(): void {
		// An hour at 1 kHz.
		$levels = Transcode::envelope( str_repeat( chr( 200 ) . chr( 56 ), 1800000 ) );

		$this->assertLessThanOrEqual( Transcode::LEVELS, strlen( $levels ) );
		$this->assertGreaterThan( Transcode::LEVELS / 2, strlen( $levels ) );
	}

	public function test_measured_levels_are_kept_where_the_track_reads_them(): void {
		$song = self::attach( '02 - Underground [underground].mp3' );
		if ( '' === Transcode::ffmpeg() ) {
			$this->assertWPError( Transcode::measure( $song ), 'without ffmpeg, it says so' );
			$this->assertSame( '', Tracks::from_attachment( $song )['levels'] );
			return;
		}
		$levels = Transcode::measure( $song );

		$this->assertIsString( $levels );
		$this->assertMatchesRegularExpression( '/^[0-9]{8,240}$/', $levels );
		$this->assertSame( $levels, wp_get_attachment_metadata( $song )['riff_levels'] );
		$this->assertSame( $levels, Tracks::from_attachment( $song )['levels'] );
	}
}
