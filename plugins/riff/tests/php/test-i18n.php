<?php
/**
 * Translation: every view of the Listen block comes out of the riff text domain, and each script
 * module's translations reach the page from the file a language pack installs.
 *
 * @package Riff
 */

use Riff\Catalog;
use Riff\Listen\App;
use Riff\Listen\Browse;
use Riff\Player;
use Riff\Playlists;

/**
 * A test translation, applied to the riff text domain.
 */
class Test_Riff_I18n extends Riff_TestCase {

	/**
	 * A published post with two tracks.
	 *
	 * @var int
	 */
	private int $post = 0;

	/**
	 * Its tracks.
	 *
	 * @var int[]
	 */
	private array $tracks = array();

	public function set_up(): void {
		parent::set_up();
		$GLOBALS['wp_rest_server'] = null;
		Catalog::taxonomies();
		Playlists::post_type();
		$this->post   = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$this->tracks = array(
			self::attach( '02 - Underground [underground].mp3', $this->post ),
			self::attach( '03 - Trombone Detritus [detritus].mp3', $this->post ),
		);
		$blocks       = '';
		foreach ( $this->tracks as $id ) {
			$blocks .= sprintf( '<!-- wp:audio {"id":%1$d} --><figure class="wp-block-audio"><audio controls src="%2$s"></audio></figure><!-- /wp:audio -->', $id, esc_url( wp_get_attachment_url( $id ) ) );
		}
		wp_update_post(
			array(
				'ID'           => $this->post,
				'post_content' => $blocks,
			)
		);
		// Every string in the domain comes back wrapped, as a translation would, so a string that
		// skipped translation shows up bare.
		$wrap = static fn( $translation ) => '⟪' . $translation . '⟫';
		add_filter( 'gettext_riff', $wrap );
		add_filter( 'ngettext_riff', $wrap );
		add_filter( 'gettext_with_context_riff', $wrap );
		add_filter( 'ngettext_with_context_riff', $wrap );
	}

	public function tear_down(): void {
		foreach ( array( 'gettext_riff', 'ngettext_riff', 'gettext_with_context_riff', 'ngettext_with_context_riff' ) as $hook ) {
			remove_all_filters( $hook );
		}
		foreach ( Browse::ARGS as $key ) {
			unset( $_GET[ $key ] );
		}
		unset( $_GET[ App::QUERY ] );
		parent::tear_down();
	}

	/**
	 * The view part of the block at an address: what changes from view to view.
	 *
	 * @param array $args Query arguments.
	 * @return string
	 */
	private function view_at( array $args ): string {
		$page = self::factory()->post->create(
			array(
				'post_type'    => 'page',
				'post_status'  => 'publish',
				'post_content' => '<!-- wp:riff/app /-->',
			)
		);
		$this->go_to( add_query_arg( $args, get_permalink( $page ) ) );
		foreach ( $args as $key => $value ) {
			$_GET[ $key ] = (string) $value; // go_to() does not fill $_GET; the block reads it.
		}
		$html = App::render();
		foreach ( array_keys( $args ) as $key ) {
			unset( $_GET[ $key ] );
		}
		$start = strpos( $html, 'data-riff-app-view>' );
		$this->assertNotFalse( $start, 'the block has a view' );
		return substr( $html, $start );
	}

	/**
	 * Each view, and a string it shows that comes from translation.
	 *
	 * @return array[]
	 */
	public function views(): array {
		return array(
			'Home'        => array( array(), '⟪Home⟫' ),
			'Posts'       => array( array( Browse::VIEW => 'posts' ), '⟪Posts⟫' ),
			'Albums'      => array( array( Browse::VIEW => 'albums' ), '⟪Albums⟫' ),
			'Artists'     => array( array( Browse::VIEW => 'artists' ), '⟪Artists⟫' ),
			'Tracks'      => array( array( Browse::VIEW => 'tracks' ), '⟪Tracks⟫' ),
			'Library'     => array( array( Browse::VIEW => 'library' ), '⟪Your Library⟫' ),
			'Liked songs' => array(
				array(
					Browse::VIEW   => 'library',
					Browse::FILTER => 'songs',
				),
				'⟪Your Library⟫',
			),
			'Search'      => array( array( Browse::SEARCH => 'Underground' ), '⟪Results for “%s”⟫' ),
		);
	}

	/**
	 * @dataProvider views
	 *
	 * @param array  $args       Query arguments.
	 * @param string $translated A string the view shows, translated.
	 */
	public function test_each_list_view_shows_the_translation( array $args, string $translated ): void {
		$view = $this->view_at( $args );

		$this->assertStringContainsString( str_replace( '%s', 'Underground', $translated ), $view );
	}

	public function test_an_album_an_artist_a_post_and_a_playlist_show_the_translation(): void {
		$album  = (int) get_term_by( 'name', 'Compositions', Catalog::ALBUM )->term_id;
		$artist = (int) get_term_by( 'name', 'Airmen of Note, United States Air Force Band', Catalog::ARTIST )->term_id;

		$this->assertStringContainsString( '<p class="riff-album-kind">⟪Album⟫</p>', $this->view_at( array( Browse::ALBUM => $album ) ) );
		$this->assertStringContainsString( '<p class="riff-album-kind">⟪Artist⟫</p>', $this->view_at( array( Browse::ARTIST => $artist ) ) );
		$this->assertStringContainsString( '>⟪Play⟫</button>', $this->view_at( array( App::QUERY => $this->post ) ) );

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );
		$request = new WP_REST_Request( 'POST', '/riff/v1/users/me/playlists' );
		$request->set_header( 'Content-Type', 'application/json' );
		$request->set_body( wp_json_encode( array( 'title' => 'Road trip', 'tracks' => $this->tracks ) ) ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		$playlist = (int) rest_do_request( $request )->get_data()['id'];
		$this->assertStringContainsString( '<p class="riff-album-kind">⟪Playlist⟫</p>', $this->view_at( array( Browse::PLAYLIST => $playlist ) ) );
	}

	public function test_each_modules_translations_reach_the_page_from_its_language_pack_file(): void {
		$this->go_to( get_permalink( $this->post ) );
		add_filter( 'locale', static fn() => 'de_DE' );
		$dir = get_temp_dir() . 'riff-i18n';
		wp_mkdir_p( $dir );
		$looked = array();
		// Note where core looks for each module's translations, and answer from a fixture: a
		// language pack from translate.wordpress.org would sit at the file it names.
		$answer = static function ( $file, $handle, $domain ) use ( &$looked, $dir ) {
			if ( ! in_array( $handle, array( 'riff', 'riff-app' ), true ) ) {
				return $file;
			}
			$looked[ $handle ] = array( $domain, basename( (string) $file ) );
			$json              = "$dir/$handle.json";
			file_put_contents( // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- a test fixture.
				$json,
				(string) wp_json_encode(
					array(
						'locale_data' => array(
							'riff' => array(
								''           => array(
									'domain' => 'riff',
									'lang'   => 'de_DE',
								),
								'Play %s'    => array( 'Spiele %s' ),
								'Top result' => array( 'Bester Treffer' ),
							),
						),
					)
				)
			);
			return $json;
		};
		add_filter( 'load_script_translation_file', $answer, 10, 3 );

		Player::enqueue();
		ob_start();
		wp_script_modules()->print_script_module_translations();
		$html = (string) ob_get_clean();
		remove_filter( 'load_script_translation_file', $answer, 10 );

		// The file is named as a language pack names it: domain, locale, and the hash of the script's
		// path in the plugin. The hash itself is core's to compute, and the suite loads the plugin
		// from outside the plugins folder, so its path here is not the one a site has.
		$this->assertSame( 'riff', $looked['riff'][0] ?? null, 'riff.js, in the riff domain' );
		$this->assertMatchesRegularExpression( '/^riff-de_DE-[0-9a-f]{32}\.json$/', $looked['riff'][1] ?? '' );
		$this->assertSame( 'riff', $looked['riff-app'][0] ?? null, 'and the Listen app, which riff.js imports' );
		$this->assertMatchesRegularExpression( '/^riff-de_DE-[0-9a-f]{32}\.json$/', $looked['riff-app'][1] ?? '' );
		$this->assertStringContainsString( 'id="wp-script-module-translation-data-riff"', $html );
		$this->assertStringContainsString( 'id="wp-script-module-translation-data-riff-app"', $html );
		$this->assertStringContainsString( 'Spiele %s', $html, 'the translated string reaches the page' );
	}

	public function test_the_script_gets_only_the_strings_a_site_replaces(): void {
		$replace = static fn( $strings ) => array_merge( $strings, array( 'playTrack' => 'Listen to %s' ) );
		add_filter( 'riff_strings', $replace );
		$this->go_to( get_permalink( $this->post ) );
		ob_start();
		Player::markup();
		$html = (string) ob_get_clean();
		remove_filter( 'riff_strings', $replace );

		preg_match( '#<script type="application/json" id="riff-data">(.+?)</script>#s', $html, $data );
		$this->assertSame( array( 'playTrack' => 'Listen to %s' ), json_decode( $data[1] ?? '', true )['strings'] ?? null, 'the module translates the rest itself' );
		$this->assertStringContainsString( '⟪', substr( $html, strpos( $html, '</script>' ) ), 'and the player around it is translated in PHP' );
	}
}
