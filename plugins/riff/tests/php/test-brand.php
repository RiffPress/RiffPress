<?php
/**
 * The brand a Riff shows its listeners: riff_brand() and the riff_brand filter.
 *
 * @package Riff
 */

use Riff\Catalog;
use Riff\Listen\App;
use Riff\Listen\Browse;
use Riff\Listen\Standalone;
use Riff\Player;
use Riff\Share;

/**
 * The riff_brand() helper and filter.
 */
class Test_Riff_Brand extends Riff_TestCase {

	public function set_up(): void {
		parent::set_up();
		$GLOBALS['wp_rest_server'] = null;
		Catalog::taxonomies();
		update_option( 'blogname', '' );
		update_option( 'blogdescription', '' );
		delete_option( 'site_icon' );
	}

	public function tear_down(): void {
		remove_all_filters( 'riff_brand' );
		parent::tear_down();
	}

	/**
	 * Gives the site a brand.
	 *
	 * @param array $brand What the filter returns.
	 */
	private static function brand( $brand ): void {
		add_filter( 'riff_brand', static fn() => $brand );
	}

	/**
	 * What a listener is shown where Riff names itself or shows its icon, with the brand as it is.
	 *
	 * @return array
	 */
	private function surfaces(): array {
		$this->go_to( home_url( '/' ) );
		ob_start();
		Player::markup();
		$player = (string) ob_get_clean();
		preg_match( '#<script type="application/json" id="riff-data">(.+?)</script>#s', $player, $data );
		return array(
			'manifest' => Standalone::manifest_data(),
			'install'  => Standalone::install_card(),
			'mark'     => Standalone::mark(),
			'nav'      => Browse::nav( home_url( '/' ), null ),
			'app'      => App::render(),
			'fallback' => Share::fallback( array( 'covers' => array() ) ),
			'tags'     => Share::tags(),
			'data'     => json_decode( $data[1], true ),
			'player'   => str_replace( $data[1], '', $player ),
		);
	}

	public function test_the_default_brand_is_riffs_own(): void {
		$this->assertSame(
			array(
				'name'        => 'Riff',
				'mark'        => '',
				'credit'      => true,
				'description' => '',
			),
			riff_brand()
		);
	}

	public function test_without_a_filter_what_a_listener_sees_is_as_it_was(): void {
		$default = $this->surfaces();
		$this->assertSame( 'Riff', $default['manifest']['name'] );
		$this->assertSame( 'Riff', $default['manifest']['short_name'] );
		$this->assertSame( '', $default['manifest']['description'] );
		$this->assertSame(
			array(
				array(
					'src'   => RIFF_URL . 'features/listen/icons/icon-192.png',
					'sizes' => '192x192',
					'type'  => 'image/png',
				),
				array(
					'src'   => RIFF_URL . 'features/listen/icons/icon-512.png',
					'sizes' => '512x512',
					'type'  => 'image/png',
				),
			),
			$default['manifest']['icons']
		);
		$this->assertStringContainsString( '<p class="riff-app-install-title" title="Riff">Riff</p>', $default['install'] );
		$this->assertStringContainsString( 'aria-label="Add Riff to this computer"', $default['install'] );
		$this->assertStringContainsString( 'src="' . RIFF_URL . 'features/listen/icons/icon-192.png"', $default['install'] );
		$this->assertStringContainsString( '<span class="riff-app-name">Riff</span>', $default['nav'] );
		$this->assertStringEndsWith( 'icons/icon-512.png', $default['fallback']['url'] );
		$this->assertSame( riff_brand(), $default['data']['brand'] );

		// A host that returns Riff's own brand changes nothing a listener is shown, to the byte.
		self::brand(
			array(
				'name'   => 'Riff',
				'mark'   => '',
				'credit' => true,
			)
		);
		$this->assertSame( $default, $this->surfaces() );
	}

	public function test_a_hosts_name_mark_and_description_replace_riffs_own(): void {
		$mark = 'https://cdn.example.com/brand/mark.png';
		self::brand(
			array(
				'name'        => 'Northwind Music',
				'mark'        => $mark,
				'credit'      => false,
				'description' => 'Music from the whole street',
			)
		);
		$branded = $this->surfaces();

		$this->assertSame( 'Northwind Music', $branded['manifest']['name'] );
		$this->assertSame( 'Northwind Music', $branded['manifest']['short_name'] );
		$this->assertSame( 'Music from the whole street', $branded['manifest']['description'] );
		$this->assertSame(
			array(
				array(
					'src'   => $mark,
					'sizes' => 'any',
				),
			),
			$branded['manifest']['icons']
		);
		$this->assertStringContainsString( '<p class="riff-app-install-title" title="Northwind Music">Northwind Music</p>', $branded['install'] );
		$this->assertStringContainsString( 'data-riff-install-label="Add Northwind Music to your Dock"', $branded['install'] );
		$this->assertStringContainsString( 'src="' . $mark . '"', $branded['install'] );
		$this->assertStringContainsString( 'data-riff-fallback="' . $mark . '"', $branded['install'] );
		$this->assertStringNotContainsString( 'icons/icon-192.png', $branded['install'] );
		$this->assertSame( $mark, $branded['mark'] );
		$this->assertStringContainsString( '<span class="riff-app-name">Northwind Music</span>', $branded['nav'] );
		$this->assertStringContainsString( 'aria-label="Northwind Music"', $branded['app'] );
		$this->assertSame( $mark, $branded['fallback']['url'] );
		$this->assertSame(
			array(
				'name'        => 'Northwind Music',
				'mark'        => $mark,
				'credit'      => false,
				'description' => 'Music from the whole street',
			),
			$branded['data']['brand']
		);
		$this->assertSame( 'Music from the whole street', $branded['tags']['og:description'], 'the brand describes a site with no tagline' );
		$this->assertSame( $branded['tags']['og:description'], $branded['tags']['description'] );
	}

	public function test_the_sites_own_name_tagline_and_icon_come_before_the_brand(): void {
		update_option( 'blogname', 'Demo' );
		update_option( 'blogdescription', 'Songs from the back room' );
		self::brand(
			array(
				'name'        => 'Northwind Music',
				'mark'        => 'https://cdn.example.com/brand/mark.png',
				'description' => 'Music from the whole street',
			)
		);
		$surfaces = $this->surfaces();
		$this->assertSame( 'Demo', $surfaces['manifest']['name'] );
		$this->assertSame( 'Songs from the back room', $surfaces['manifest']['description'] );
		$this->assertSame( 'Songs from the back room', $surfaces['tags']['og:description'] );
		$this->assertStringContainsString( '<span class="riff-app-name">Demo</span>', $surfaces['nav'] );
	}

	public function test_a_mark_link_previews_cannot_show_is_not_shared(): void {
		self::brand( array( 'mark' => 'https://cdn.example.com/brand/mark.svg' ) );
		$this->assertStringEndsWith( 'icons/icon-512.png', Share::fallback( array( 'covers' => array() ) )['url'] );
		$this->assertSame( 'https://cdn.example.com/brand/mark.svg', Standalone::mark(), 'an app icon may be a drawing' );
	}

	public function test_what_a_host_gives_is_normalised(): void {
		self::brand(
			array(
				'name'        => "  \n ",
				'mark'        => 'javascript:alert(1)',
				'credit'      => 'false',
				'description' => '  <b>Loud</b> music ',
			)
		);
		$this->assertSame(
			array(
				'name'        => 'Riff',
				'mark'        => '',
				'credit'      => false,
				'description' => 'Loud music',
			),
			riff_brand()
		);

		remove_all_filters( 'riff_brand' );
		self::brand(
			array(
				'name' => ' <em>Northwind</em> ',
				'mark' => array( 'not a url' ),
			)
		);
		$this->assertSame(
			array(
				'name'        => 'Northwind',
				'mark'        => '',
				'credit'      => true,
				'description' => '',
			),
			riff_brand()
		);

		remove_all_filters( 'riff_brand' );
		self::brand( 'Northwind' );
		$this->assertSame( 'Riff', riff_brand()['name'], 'a filter that returns no array is Riff\'s own' );
	}
}
