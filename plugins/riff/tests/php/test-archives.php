<?php
/**
 * Public archives, from answers recorded from the Library of Congress and Europeana: nothing here
 * reaches the network.
 *
 * @package Riff
 */

use Riff\Archives;

/**
 * Riff\Archives.
 */
class Test_Riff_Archives extends Riff_TestCase {

	/**
	 * Every address asked for, in order.
	 *
	 * @var string[]
	 */
	private array $asked = array();

	/**
	 * The recordings each file's address is answered with, as fixture files.
	 */
	private const AUDIO = array(
		'https://tile.loc.gov/storage-services/public/navcc/edrs-50123l/edrs-50123l.mp3' => '02 - Underground [underground].mp3',
		'https://tile.loc.gov/storage-services/public/navcc/edrs-50172l/edrs-50172l.mp3' => '03 - Trombone Detritus [detritus].mp3',
		'http://www.soundsofchanges.eu/soundfiles/5b4/5b43248b43f80.mp3'                 => '04 - It\'s a Brand New Day [new-day].mp3',
	);

	public function set_up(): void {
		parent::set_up();
		$this->asked = array();
		add_filter( 'pre_http_request', array( $this, 'answer' ), 10, 3 );
	}

	public function tear_down(): void {
		remove_filter( 'pre_http_request', array( $this, 'answer' ) );
		parent::tear_down();
	}

	/**
	 * Answers a request from the recorded fixtures, as the archive answered it.
	 *
	 * @param false|array $pre  Nothing yet.
	 * @param array       $args Request arguments.
	 * @param string      $url  Address.
	 * @return array|WP_Error
	 */
	public function answer( $pre, $args, $url ) {
		$this->asked[] = $url;
		if ( false !== $pre ) {
			return $pre;
		}
		$json = null;
		if ( str_starts_with( $url, 'https://www.loc.gov/collections/edison-company-motion-pictures-and-sound-recordings/' ) ) {
			$json = 'loc-collection.json';
		} elseif ( preg_match( '#^https://www\.loc\.gov/item/([^/]+)/\?fo=json$#', $url, $m ) && is_file( __DIR__ . "/fixtures/archives/loc-item-{$m[1]}.json" ) ) {
			$json = "loc-item-{$m[1]}.json";
		} elseif ( str_starts_with( $url, 'https://api.europeana.eu/record/v2/search.json?' ) ) {
			$json = 'europeana-search.json';
		}
		if ( $json ) {
			return array(
				'headers'  => array( 'content-type' => 'application/json' ),
				'body'     => (string) file_get_contents( __DIR__ . '/fixtures/archives/' . $json ), // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- a fixture.
				'response' => array(
					'code'    => 200,
					'message' => 'OK',
				),
				'cookies'  => array(),
				'filename' => null,
			);
		}
		if ( isset( self::AUDIO[ $url ] ) && ! empty( $args['filename'] ) ) {
			copy( self::fixture( self::AUDIO[ $url ] ), $args['filename'] );
			return array(
				'headers'  => array( 'content-type' => 'audio/mpeg' ),
				'body'     => '',
				'response' => array(
					'code'    => 200,
					'message' => 'OK',
				),
				'cookies'  => array(),
				'filename' => $args['filename'],
			);
		}
		// As Gallica answers a download it was not asked for in a browser.
		return array(
			'headers'  => array( 'content-type' => 'text/html' ),
			'body'     => 'Forbidden',
			'response' => array(
				'code'    => 403,
				'message' => 'Forbidden',
			),
			'cookies'  => array(),
			'filename' => null,
		);
	}

	/**
	 * Audio attachment IDs, oldest first.
	 *
	 * @return int[]
	 */
	private function tracks(): array {
		return get_posts(
			array(
				'post_type'      => 'attachment',
				'post_mime_type' => 'audio',
				'post_status'    => 'any',
				'fields'         => 'ids',
				'posts_per_page' => -1,
				'orderby'        => 'ID',
				'order'          => 'ASC',
			)
		);
	}

	public function test_only_the_licences_that_let_a_recording_be_reused_are_read_as_one(): void {
		$this->assertSame( 'pdm', Archives::licence( 'http://creativecommons.org/publicdomain/mark/1.0/' ) );
		$this->assertSame( 'cc0', Archives::licence( 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr' ) );
		$this->assertSame( 'by', Archives::licence( 'http://creativecommons.org/licenses/by/4.0/' ) );
		$this->assertSame( 'by', Archives::licence( 'https://www.creativecommons.org/licenses/by/3.0/nl/' ) );
		$this->assertSame( 'by-sa', Archives::licence( 'http://creativecommons.org/licenses/by-sa/4.0/legalcode' ) );
		foreach ( array( 'http://creativecommons.org/licenses/by-nc/4.0/', 'http://creativecommons.org/licenses/by-nd/4.0/', 'http://creativecommons.org/licenses/by-nc-sa/4.0/', 'http://rightsstatements.org/vocab/InC/1.0/', 'http://rightsstatements.org/vocab/NoC-NC/1.0/', 'http://creativecommons.org/licenses/by/4.0/evil', '' ) as $other ) {
			$this->assertSame( '', Archives::licence( $other ), $other );
		}
	}

	public function test_a_library_of_congress_collection_becomes_albums_each_track_credited(): void {
		$result = Archives::import( 'loc', '', array( 'limit' => 5 ) );

		$this->assertIsArray( $result );
		$this->assertSame( array(), $result['refused'] );
		$this->assertCount( 2, $result['albums'] );
		$this->assertCount( 2, $this->tracks() );

		$album = $result['albums'][0];
		$this->assertSame( 'https://www.loc.gov/item/00694028/', $album['folder'] );
		$post = get_post( $album['post'] );
		$this->assertSame( 'Hungarian rag', $post->post_title, 'the item\'s title, not the file\'s tags' );
		$this->assertSame( 'publish', $post->post_status );
		$this->assertStringStartsWith( '<!-- wp:paragraph --><p>“Hungarian rag” by Lenzberg, Julius. Library of Congress, Motion Picture, Broadcasting, and Recorded Sound Division. No known U.S. copyright, as the Library of Congress states it. <a href="https://www.loc.gov/item/00694028/">Source</a></p>', $post->post_content, 'the post credits the archive' );

		$track = get_post( $this->tracks()[0] );
		$this->assertSame( $post->ID, $track->post_parent );
		$this->assertSame( 'Hungarian rag', $track->post_title );
		$this->assertSame( '“Hungarian rag” by Lenzberg, Julius. Library of Congress, Motion Picture, Broadcasting, and Recorded Sound Division. No known U.S. copyright, as the Library of Congress states it.', $track->post_excerpt, 'the credit is the caption' );
		$this->assertStringContainsString( 'Source: https://www.loc.gov/item/00694028/', $track->post_content );
		$this->assertStringContainsString( 'Licence: No known U.S. copyright, as the Library of Congress states it, https://rightsstatements.org/vocab/NKC/1.0/', $track->post_content );

		$this->assertSame( '“The raggedy man” by Riley, James Whitcomb. Library of Congress, Motion Picture, Broadcasting, and Recorded Sound Division. No known U.S. copyright, as the Library of Congress states it.', get_post( $this->tracks()[1] )->post_excerpt, 'a name without its dates' );
		foreach ( $this->asked as $url ) {
			$this->assertMatchesRegularExpression( '#^https://(www\.loc\.gov|tile\.loc\.gov)/#', $url );
		}
	}

	public function test_importing_again_skips_what_was_imported_and_adds_no_second_credit(): void {
		$first = Archives::import( 'loc' );
		wp_update_post(
			array(
				'ID'           => $this->tracks()[0],
				'post_excerpt' => 'The owner\'s own credit.',
			)
		);

		$again = Archives::import( 'loc' );

		$this->assertCount( 2, $this->tracks() );
		$this->assertSame( array( '01 - Hungarian-rag.mp3' ), $again['albums'][0]['skipped'] );
		$this->assertSame( $first['albums'][0]['post'], $again['albums'][0]['post'] );
		$this->assertSame( 1, substr_count( get_post_field( 'post_content', $first['albums'][0]['post'] ), 'wp:paragraph' ) );
		$this->assertSame( 'The owner\'s own credit.', get_post_field( 'post_excerpt', $this->tracks()[0] ), 'a file it skipped is left as its owner made it' );
	}

	public function test_a_library_of_congress_item_whose_file_is_restricted_is_skipped_and_said(): void {
		$result = Archives::import( 'loc', 'https://www.loc.gov/item/jukebox-254546/' );

		$this->assertSame( array(), $result['albums'] );
		$this->assertSame( array( 'https://www.loc.gov/item/jukebox-254546/' => 'The Library of Congress marks its recording as restricted.' ), $result['refused'] );
		$this->assertCount( 0, $this->tracks() );
		$this->assertSame( array( 'https://www.loc.gov/item/jukebox-254546/?fo=json' ), $this->asked, 'nothing downloaded' );
	}

	public function test_a_library_of_congress_item_whose_statement_does_not_free_it_is_skipped(): void {
		$free = static function ( $pre, $args, $url ) {
			unset( $args );
			if ( 'https://www.loc.gov/item/00694028/?fo=json' !== $url ) {
				return $pre;
			}
			// The same item, as the Library words the rights of what it has permission to stream.
			$data                   = json_decode( (string) file_get_contents( __DIR__ . '/fixtures/archives/loc-item-00694028.json' ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- a fixture.
			$data['item']['rights'] = array( '<p>The Library makes the sound recordings available pursuant to permission from the rightsholders. Many of these recordings will begin entering into the public domain.</p>' );
			return array(
				'headers'  => array(),
				'body'     => wp_json_encode( $data ),
				'response' => array( 'code' => 200 ),
				'cookies'  => array(),
				'filename' => null,
			);
		};
		add_filter( 'pre_http_request', $free, 5, 3 );

		$result = Archives::import( 'loc', 'https://www.loc.gov/item/00694028/' );
		remove_filter( 'pre_http_request', $free, 5 );

		$this->assertSame( array( 'https://www.loc.gov/item/00694028/' => 'Its rights statement does not say it is free to use.' ), $result['refused'] );
		$this->assertCount( 0, $this->tracks() );
	}

	public function test_a_library_of_congress_item_with_a_rights_advisory_is_skipped(): void {
		$advised = static function ( $pre, $args, $url ) {
			unset( $args );
			if ( 'https://www.loc.gov/item/00694028/?fo=json' !== $url ) {
				return $pre;
			}
			$data = json_decode( (string) file_get_contents( __DIR__ . '/fixtures/archives/loc-item-00694028.json' ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- a fixture.
			// As the National Jukebox's items carry one.
			$data['item']['rights_advisory'] = 'Inclusion of the recording in the National Jukebox, courtesy of Sony Music Entertainment or EMI Music';
			return array(
				'headers'  => array(),
				'body'     => wp_json_encode( $data ),
				'response' => array( 'code' => 200 ),
				'cookies'  => array(),
				'filename' => null,
			);
		};
		add_filter( 'pre_http_request', $advised, 5, 3 );

		$result = Archives::import( 'loc', 'https://www.loc.gov/item/00694028/' );
		remove_filter( 'pre_http_request', $advised, 5 );

		$this->assertSame( array( 'https://www.loc.gov/item/00694028/' => 'Its rights advisory names conditions on its use.' ), $result['refused'] );
		$this->assertCount( 0, $this->tracks() );
	}

	public function test_europeana_imports_what_its_licence_frees_and_skips_the_rest(): void {
		$result = Archives::import( 'europeana', 'gramophone', array( 'key' => 'test' ) );

		$this->assertIsArray( $result );
		$this->assertStringContainsString( 'reusability=open', $this->asked[0] );
		$this->assertStringContainsString( 'qf=TYPE%3ASOUND', $this->asked[0] );
		// CC BY, imported, with its attribution.
		$this->assertCount( 1, $this->tracks() );
		$track = get_post( $this->tracks()[0] );
		$this->assertSame( '“Wind up gramophone”. Sounds of Changes, via Europeana. CC BY 4.0.', $track->post_excerpt );
		$this->assertStringContainsString( 'Licence: CC BY 4.0, http://creativecommons.org/licenses/by/4.0/', $track->post_content );
		$this->assertStringContainsString( 'Source: https://www.europeana.eu/item/916107/wws_object_2713', $track->post_content );
		// The public domain, which the library holding it would not send.
		$this->assertSame( array( 'http://gallica.bnf.fr/ark:/12148/bpt6k13110096/f1.audio' => 'The archive would not send it (HTTP 403).' ), $result['albums'][1]['failed'] );
		// In copyright, skipped and said.
		$this->assertSame(
			array( 'https://www.europeana.eu/item/2059210/data_sounds_http___archive_org_download_tsool2002_01_29_aud_flac16_tsool20020129_t14_mp3' => 'Its rights statement, http://rightsstatements.org/vocab/InC/1.0/, is not one that lets it be reused.' ),
			$result['refused']
		);
		$this->assertNotContains( 'http://archive.org/download/tsool2002-01-29.aud.flac16/tsool20020129-t14.mp3', $this->asked, 'never downloaded' );
	}

	public function test_europeana_asks_for_a_key_and_a_search(): void {
		$this->assertWPError( Archives::import( 'europeana', 'gramophone' ) );
		$this->assertWPError( Archives::import( 'europeana', '', array( 'key' => 'test' ) ) );
		$this->assertWPError( Archives::import( 'somewhere', 'gramophone' ) );
		$this->assertSame( array(), $this->asked );
	}

	public function test_a_dry_run_downloads_nothing(): void {
		$result = Archives::import( 'loc', '', array( 'dry_run' => true ) );

		$this->assertCount( 2, $result['albums'] );
		$this->assertCount( 0, $this->tracks() );
		foreach ( $this->asked as $url ) {
			$this->assertStringContainsString( 'fo=json', $url, 'only the catalogue was read' );
		}
	}

	public function test_wp_riff_archive_reports_each_album_what_it_skipped_and_a_summary(): void {
		require_once __DIR__ . '/class-riff-test-wp-cli.php';
		WP_CLI::$lines = array();

		( new Riff\Cli() )->archive( array( 'europeana', 'gramophone' ), array( 'key' => 'test' ) );

		$this->assertSame( array( 'log', 'log', 'warning', 'log', 'warning' ), array_column( WP_CLI::$lines, 0 ) );
		$this->assertStringStartsWith( 'Skipped https://www.europeana.eu/item/2059210/', WP_CLI::$lines[3][1] );
		$this->assertSame( '2 items: 1 tracks imported, 1 failed; 1 items skipped.', WP_CLI::$lines[4][1] );
	}
}
