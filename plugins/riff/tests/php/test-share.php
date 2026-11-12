<?php
/**
 * Link previews: the Open Graph tags and the share card.
 *
 * @package Riff
 */

use Riff\Catalog;
use Riff\Private_Site;
use Riff\Share;

/**
 * Riff\Share.
 */
class Test_Riff_Share extends Riff_TestCase {

	/**
	 * The Listen page the site's address opens.
	 *
	 * @var int
	 */
	private int $listen = 0;

	/**
	 * A track on a published post, with a cover of its own.
	 *
	 * @var int
	 */
	private int $track = 0;

	public function set_up(): void {
		parent::set_up();
		$GLOBALS['wp_rest_server'] = null;
		Catalog::taxonomies();
		update_option( 'blogname', 'Demo' );
		update_option( 'blogdescription', '' );
		$this->listen = self::factory()->post->create(
			array(
				'post_type'    => 'page',
				'post_status'  => 'publish',
				'post_title'   => 'Listen',
				'post_content' => '<!-- wp:riff/app /-->',
			)
		);
		add_filter( 'riff_app_at_root', '__return_true' );
		$post        = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$this->track = self::attach( '03 - Trombone Detritus [detritus].mp3', $post );
		self::attach( '02 - Underground [underground].mp3', $post );
		set_post_thumbnail( $this->track, self::picture( 'cover.png', array( 30, 80, 200 ) ) );
		Share::forget();
	}

	public function tear_down(): void {
		remove_all_filters( 'riff_app_at_root' );
		remove_all_filters( 'riff_open_graph' );
		remove_all_filters( 'riff_share_image' );
		remove_action( 'wp_head', 'jetpack_og_tags' );
		delete_option( Private_Site::OPTION );
		wp_set_current_user( 0 );
		Share::forget();
		parent::tear_down();
	}

	/**
	 * A square picture in uploads, as an attachment.
	 *
	 * @param string $name The file's name.
	 * @param int[]  $rgb  Its colour.
	 * @return int
	 */
	private static function picture( string $name, array $rgb ): int {
		$image = imagecreatetruecolor( 600, 600 );
		imagefill( $image, 0, 0, (int) imagecolorallocate( $image, $rgb[0], $rgb[1], $rgb[2] ) );
		$file = get_temp_dir() . $name;
		imagepng( $image, $file );
		$id = self::factory()->attachment->create_upload_object( $file );
		self::assertIsInt( $id );
		return $id;
	}

	/**
	 * The tags for the site's own address.
	 *
	 * @return array<string, string>
	 */
	private function root(): array {
		$this->go_to( home_url( '/' ) );
		return Share::tags();
	}

	public function test_the_site_address_is_previewed_by_the_site_name_a_line_about_it_and_a_large_card(): void {
		$tags = $this->root();
		$this->assertSame( 'Demo', $tags['og:title'], 'the name, not "Listen - Demo"' );
		$this->assertSame( 'Demo', $tags['og:site_name'] );
		$this->assertSame( 'website', $tags['og:type'] );
		$this->assertSame( home_url( '/' ), $tags['og:url'] );
		$this->assertSame( '1 album · 2 songs', $tags['og:description'] );
		$this->assertSame( $tags['og:description'], $tags['description'] );
		$this->assertSame( 'summary_large_image', $tags['twitter:card'] );
		$this->assertSame( array( '1200', '630' ), array( $tags['og:image:width'], $tags['og:image:height'] ) );
		$this->assertStringContainsString( Share::QUERY . '=site', $tags['og:image'], 'drawn when first asked for' );
		$this->assertStringContainsString( 'Demo', $tags['og:image:alt'] );

		update_option( 'blogdescription', 'Songs from the back room' );
		$this->assertSame( 'Songs from the back room', $this->root()['og:description'], 'the tagline where there is one' );
	}

	public function test_the_tags_are_printed_in_the_head_as_properties_and_names(): void {
		$this->go_to( home_url( '/' ) );
		ob_start();
		Share::head();
		$head = (string) ob_get_clean();
		$this->assertStringContainsString( '<meta property="og:title" content="Demo">', $head );
		$this->assertStringContainsString( '<meta name="twitter:card" content="summary_large_image">', $head );
		$this->assertStringContainsString( '<meta name="description" content="1 album · 2 songs">', $head );
	}

	public function test_nothing_private_is_named_or_counted_even_while_its_owner_is_looking(): void {
		$owner  = self::factory()->user->create( array( 'role' => 'administrator' ) );
		$draft  = self::factory()->post->create(
			array(
				'post_status' => 'private',
				'post_author' => $owner,
			)
		);
		$secret = self::attach( '04 - It\'s a Brand New Day [new-day].mp3', $draft );
		wp_update_attachment_metadata( $secret, array( 'album' => 'Secret Sessions' ) );
		Catalog::file( $secret );
		set_post_thumbnail( $secret, self::picture( 'secret.png', array( 200, 20, 20 ) ) );
		wp_set_current_user( $owner );

		$tags = $this->root();
		$this->assertSame( '1 album · 2 songs', $tags['og:description'], 'counted as a visitor counts' );
		$all = implode( ' ', $tags );
		$this->assertStringNotContainsString( 'Secret', $all );
		$this->assertStringNotContainsString( 'secret', $all );
		$this->assertStringNotContainsString( 'riff-file', $all, 'never a protected file' );
	}

	public function test_a_private_site_has_no_tags_and_no_card_and_its_cards_go(): void {
		$card = Share::card();
		$this->assertFileExists( $card['path'] );
		update_option( Private_Site::OPTION, true );
		$this->assertFileDoesNotExist( $card['path'], 'turning private deletes the cards kept' );
		// A visitor is refused before anything is printed; a member gets in, and still no tags.
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );
		$this->assertSame( array(), $this->root() );
		$this->assertNull( Share::card() );
	}

	public function test_a_listen_page_a_visitor_may_not_read_has_no_tags(): void {
		remove_all_filters( 'riff_app_at_root' );
		wp_update_post(
			array(
				'ID'            => $this->listen,
				'post_password' => 'secret',
			)
		);
		$this->go_to( get_permalink( $this->listen ) );
		$this->assertSame( array(), Share::tags() );
	}

	public function test_a_view_inside_the_app_is_left_for_later(): void {
		$this->go_to( add_query_arg( 'riff_view', 'albums', home_url( '/' ) ) );
		$this->assertSame( array(), Share::tags() );
	}

	public function test_an_seo_plugin_that_prints_its_own_tags_switches_them_off(): void {
		$this->assertFalse( Share::seo() );
		add_action( 'wp_head', 'jetpack_og_tags' );
		$this->assertTrue( Share::seo() );
		$this->assertSame( array(), $this->root() );
	}

	public function test_a_host_can_change_the_tags(): void {
		add_filter(
			'riff_open_graph',
			static function ( array $tags, array $context ): array {
				$tags['og:site_name'] = 'Riff';
				$tags['og:locale']    = '';
				return 'site' === $context['kind'] ? $tags : array();
			},
			10,
			2
		);
		$tags = $this->root();
		$this->assertSame( 'Riff', $tags['og:site_name'] );
		$this->assertSame( 'Demo', $tags['og:title'] );
		$this->assertArrayNotHasKey( 'og:locale', $tags, 'an empty tag is not printed' );
	}

	public function test_the_share_image_can_be_changed_to_a_picture_but_not_to_a_drawing_or_a_protected_file(): void {
		$png = static fn() => array(
			'url'    => 'https://cdn.example/card.png',
			'width'  => 1200,
			'height' => 630,
			'alt'    => 'A card',
		);
		add_filter( 'riff_share_image', $png );
		$this->assertSame( 'https://cdn.example/card.png', $this->root()['og:image'] );
		remove_filter( 'riff_share_image', $png );

		foreach ( array( 'https://example.org/?riff-art=12', 'https://example.org/cover.svg', home_url( '/?riff-file=5&riff-expires=1&riff-sig=x.png' ) ) as $url ) {
			$not = static fn( $image ) => array( 'url' => $url ) + (array) $image;
			add_filter( 'riff_share_image', $not );
			$this->assertStringContainsString( Share::QUERY . '=site', $this->root()['og:image'], $url . ' is ignored' );
			remove_filter( 'riff_share_image', $not );
		}

		add_filter( 'riff_share_image', '__return_null' );
		$tags = $this->root();
		$this->assertArrayNotHasKey( 'og:image', $tags );
		$this->assertSame( 'summary', $tags['twitter:card'] );
	}

	public function test_the_card_is_drawn_once_kept_and_drawn_again_when_the_name_changes(): void {
		$card = Share::card();
		$this->assertNotNull( $card );
		$size = getimagesizefromstring( $card['png'] );
		$this->assertSame( array( 1200, 630, IMAGETYPE_PNG ), array( $size[0], $size[1], $size[2] ) );
		$this->assertFileExists( $card['path'] );
		$this->assertStringContainsString( '/' . Share::DIR . '/site-', $card['path'] );

		$uploads = wp_upload_dir();
		$this->assertSame( str_replace( $uploads['basedir'], $uploads['baseurl'], $card['path'] ), $this->root()['og:image'], 'the kept file, once there is one' );
		$this->assertSame( $card['path'], Share::card()['path'], 'kept, not drawn again' );

		update_option( 'blogname', 'Basement Tapes' );
		$again = Share::card();
		$this->assertNotSame( $card['path'], $again['path'] );
		$this->assertFileExists( $again['path'] );
		$this->assertFileDoesNotExist( $card['path'], 'the card before goes' );
	}

	public function test_a_name_the_card_cannot_letter_is_shared_with_the_cover_instead(): void {
		update_option( 'blogname', 'デモ' );
		$tags = $this->root();
		$this->assertSame( 'デモ', $tags['og:title'] );
		$this->assertStringContainsString( '/uploads/', $tags['og:image'] );
		$this->assertStringNotContainsString( Share::QUERY, $tags['og:image'] );
		$this->assertNull( Share::card() );
	}

	public function test_without_gd_the_image_is_the_largest_cover_or_the_site_icon(): void {
		$facts = Share::facts();
		$this->assertCount( 1, $facts['covers'] );
		$image = Share::fallback( $facts );
		$this->assertSame( $facts['covers'][0]['url'], $image['url'] );
		$this->assertSame( 600, $image['width'] );

		$icon = Share::fallback( array( 'covers' => array() ) );
		$this->assertStringEndsWith( 'icons/icon-512.png', $icon['url'] );
		$this->assertSame( 512, $icon['width'] );
		update_option( 'site_icon', self::picture( 'icon.png', array( 255, 176, 32 ) ) );
		$this->assertStringContainsString( '/uploads/', Share::fallback( array( 'covers' => array() ) )['url'] );
	}
}
