<?php
/**
 * The app block and shortcode: the library on the page, a post opened by its address.
 *
 * @package Riff
 */

use Riff\Listen\App;
use Riff\Listen\Browse;

/**
 * @covers \Riff\Listen\App
 */
class Test_Riff_App extends Riff_TestCase {

	/**
	 * A published post with one track, and a page holding the block.
	 *
	 * @return int[] Post ID and page ID.
	 */
	private function library_and_page(): array {
		$post = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$id   = self::attach( '02 - Underground [underground].mp3', $post );
		wp_update_post(
			array(
				'ID'           => $post,
				'post_content' => sprintf( '<!-- wp:audio {"id":%d} --><figure class="wp-block-audio"><audio controls src="%s"></audio></figure><!-- /wp:audio -->', $id, wp_get_attachment_url( $id ) ),
			)
		);
		$page = self::factory()->post->create(
			array(
				'post_type'    => 'page',
				'post_status'  => 'publish',
				'post_content' => '<!-- wp:riff/app {"align":"full"} /-->',
			)
		);
		return array( $post, $page );
	}

	public function test_the_block_is_registered_with_its_shortcode(): void {
		$this->assertTrue( WP_Block_Type_Registry::get_instance()->is_registered( 'riff/app' ) );
		$this->assertTrue( shortcode_exists( 'riff' ) );
	}

	public function test_the_page_lists_the_library_with_a_link_into_the_app(): void {
		[ $post, $page ] = $this->library_and_page();
		$this->go_to( get_permalink( $page ) );

		$html = apply_filters( 'the_content', get_post( $page )->post_content );

		$this->assertStringContainsString( 'class="riff-app alignfull wp-block-riff-app"', $html, 'the block wrapper carries its supports' );
		$this->assertStringContainsString( 'data-riff-rest="' . esc_url( rest_url( 'riff/v1/library' ) ) . '"', $html );
		$this->assertStringContainsString( 'href="' . esc_url( add_query_arg( 'riff', $post, get_permalink( $page ) ) ) . '"', $html );
		$this->assertStringContainsString( '1 track', $html );
		$this->assertStringNotContainsString( 'data-riff-track=', $html, 'the library shows posts, not rows' );
	}

	public function test_the_address_opens_a_post_with_its_rows(): void {
		[ $post, $page ] = $this->library_and_page();
		$this->go_to( add_query_arg( 'riff', $post, get_permalink( $page ) ) );
		$_GET['riff'] = (string) $post; // go_to() does not fill $_GET; the block reads the address from it.

		$html = do_shortcode( '[riff]' );
		unset( $_GET['riff'] );

		$this->assertStringContainsString( '<header class="riff-album', $html );
		$this->assertStringContainsString( get_the_title( $post ), $html );
		$this->assertStringContainsString( 'data-riff-track=', $html, 'the post renders as rows the player takes over' );
		$this->assertStringContainsString( 'data-riff-app-action="shuffle"', $html );
	}

	public function test_a_post_that_cannot_be_played_falls_back_to_the_library(): void {
		[ , $page ] = $this->library_and_page();
		$words      = self::factory()->post->create();
		$this->go_to( get_permalink( $page ) );
		$_GET['riff'] = (string) $words;

		$html = App::render();
		unset( $_GET['riff'] );

		$this->assertStringContainsString( 'riff-shelf', $html, 'Home' );
		$this->assertStringNotContainsString( '<header class="riff-album', $html );
	}

	public function test_meta_reads_like_a_byline(): void {
		$this->assertSame(
			'Airmen of Note · 10 tracks · 7 min',
			App::meta(
				array(
					'artist'   => 'Airmen of Note',
					'count'    => 10,
					'duration' => 400,
				)
			)
		);
		$this->assertSame(
			'1 track',
			App::meta(
				array(
					'artist'   => '',
					'count'    => 1,
					'duration' => 10,
				)
			)
		);
	}

	public function test_the_listen_template_is_registered_and_a_slug_opens_a_post(): void {
		if ( ! function_exists( 'register_block_template' ) ) {
			$this->markTestSkipped( 'register_block_template() arrived in WordPress 6.7.' );
		}
		$template = get_block_template( App::TEMPLATE );
		$this->assertNotNull( $template, 'the template is registered' );
		$this->assertStringContainsString( '<!-- wp:riff/app', $template->content );
		$this->assertSame( array( 'page' ), $template->post_types );

		[ $post, $page ] = $this->library_and_page();
		$this->go_to( get_permalink( $page ) );
		$_GET['riff'] = get_post( $post )->post_name;
		$html         = App::render();
		unset( $_GET['riff'] );
		$this->assertStringContainsString( '<header class="riff-album', $html, 'a slug opens the post the way an id does' );
	}

	/**
	 * A published post whose content carries one audio block, which is what the library reads.
	 */
	private function post_with_track( string $title = 'Side A' ): int {
		$post = self::factory()->post->create(
			array(
				'post_status' => 'publish',
				'post_title'  => $title,
			)
		);
		$id   = self::attach( '02 - Underground [underground].mp3', $post );
		wp_update_post(
			array(
				'ID'           => $post,
				'post_content' => sprintf( '<!-- wp:audio {"id":%d} --><figure class="wp-block-audio"><audio controls src="%s"></audio></figure><!-- /wp:audio -->', $id, wp_get_attachment_url( $id ) ),
			)
		);
		return $post;
	}

	public function test_the_library_item_carries_the_byline_for_the_app_and_the_route(): void {
		$post = $this->post_with_track();
		$item = \Riff\Library::item( get_post( $post ) );
		$this->assertSame( App::meta( $item ), $item['meta'] );
		$this->assertStringContainsString( '1 track', $item['meta'] );
		$listed = rest_do_request( new WP_REST_Request( 'GET', '/riff/v1/library' ) )->get_data()['items'][0];
		$this->assertSame( $item['meta'], $listed['meta'] );
		$this->assertArrayHasKey( 'meta', \Riff\Library::item_schema()['properties'] );
	}

	public function test_a_card_is_a_link_beside_a_play_button_never_one_inside_the_other(): void {
		$post = $this->post_with_track();
		$html = App::render( array(), '' );
		$this->assertMatchesRegularExpression( '#<div class="riff-card" data-riff-post="' . $post . '">#', $html );
		$this->assertStringContainsString( 'class="riff-card-play"', $html, 'the server-rendered card can play from its cover' );
		$this->assertStringContainsString( 'aria-label="Play Side A"', $html );
		$this->assertDoesNotMatchRegularExpression( '#<a[^>]*>(?:(?!</a>).)*<button#s', $html, 'no button inside a link' );
	}

	/**
	 * Published posts with a track each, one attachment between them, newest last.
	 *
	 * @param int $count How many.
	 * @return int[] Post IDs, oldest first.
	 */
	private function library_of( int $count ): array {
		$id      = self::attach( '02 - Underground [underground].mp3' );
		$content = sprintf( '<!-- wp:audio {"id":%d} --><figure class="wp-block-audio"><audio controls src="%s"></audio></figure><!-- /wp:audio -->', $id, wp_get_attachment_url( $id ) );
		$posts   = array();
		for ( $i = 0; $i < $count; $i++ ) {
			$posts[] = self::factory()->post->create(
				array(
					'post_status'  => 'publish',
					'post_content' => $content,
					'post_date'    => gmdate( 'Y-m-d H:i:s', strtotime( '2026-01-01' ) + $i * 60 ),
				)
			);
		}
		return $posts;
	}

	/**
	 * The posts view as the app page renders it, at an address with ?riff_page set or not.
	 *
	 * @param string|null $riff_page The argument's raw value, or null for none.
	 * @return string
	 */
	private function library_at( ?string $riff_page ): string {
		$_GET[ Browse::VIEW ] = 'posts';
		if ( null !== $riff_page ) {
			$_GET[ App::PAGE_QUERY ] = $riff_page;
		}
		$html = App::render();
		unset( $_GET[ App::PAGE_QUERY ], $_GET[ Browse::VIEW ] );
		return $html;
	}

	public function test_home_opens_the_page_with_rows_and_leaves_what_was_played_to_the_device(): void {
		$this->library_of( 3 );
		$html = App::render();

		$this->assertStringContainsString( '<h2 class="riff-app-title" tabindex="-1">Home</h2>', $html );
		$this->assertStringContainsString( 'data-riff-shelf="posts"', $html, 'the newest posts as a row' );
		$this->assertMatchesRegularExpression( '#data-riff-shelf="recent"[^>]*hidden#', $html, 'filled by the script from this device' );
		$this->assertMatchesRegularExpression( '#data-riff-shelf="jump"[^>]*hidden#', $html );
		$this->assertStringContainsString( 'riff_view=posts', $html, 'Show all leads to every post' );
		$this->assertStringNotContainsString( 'data-riff-app-action="more"', $html );
	}

	public function test_an_old_link_to_a_later_page_of_posts_still_opens_them(): void {
		$this->library_of( 25 );
		$_GET[ App::PAGE_QUERY ] = '2';
		$html                    = App::render();
		unset( $_GET[ App::PAGE_QUERY ] );

		$this->assertSame( 25, substr_count( $html, 'class="riff-card"' ), 'the posts grid through page 2, as before Home' );
	}

	public function test_an_empty_library_has_no_load_more(): void {
		$this->assertStringContainsString( 'riff-app-empty', $this->library_at( null ) );
		$this->assertStringNotContainsString( 'data-riff-app-action="more"', $this->library_at( null ) );
	}

	public function test_a_full_first_page_alone_has_no_load_more(): void {
		$this->library_of( 24 );
		$html = $this->library_at( null );
		$this->assertSame( 24, substr_count( $html, 'class="riff-card"' ) );
		$this->assertStringNotContainsString( 'data-riff-app-action="more"', $html );
	}

	public function test_load_more_is_a_link_to_the_next_page_that_works_without_the_script(): void {
		$posts = $this->library_of( 25 );
		$page  = self::factory()->post->create(
			array(
				'post_type'   => 'page',
				'post_status' => 'publish',
			)
		);
		$this->go_to( get_permalink( $page ) );

		$html = $this->library_at( null );
		$this->assertSame( 24, substr_count( $html, 'class="riff-card"' ) );
		$this->assertStringNotContainsString( 'data-riff-post="' . $posts[0] . '"', $html, 'the oldest is on page 2' );
		$this->assertStringContainsString( 'data-riff-page="1" data-riff-pages="2"', $html );
		$more = esc_url(
			add_query_arg(
				array(
					Browse::VIEW    => 'posts',
					App::PAGE_QUERY => 2,
				),
				get_permalink( $page )
			) . '#riff-page-2'
		);
		$this->assertStringContainsString( '<a class="riff-pill" href="' . $more . '" data-riff-app-action="more">', $html );

		$html = $this->library_at( '2' );
		$this->assertSame( 25, substr_count( $html, 'class="riff-card"' ), 'page 2 shows everything through page 2' );
		$this->assertStringContainsString( '<div class="riff-card" id="riff-page-2" data-riff-post="' . $posts[0] . '">', $html, 'Load more lands on the first new card' );
		$this->assertStringContainsString( 'data-riff-page="2" data-riff-pages="2"', $html );
		$this->assertStringNotContainsString( 'data-riff-app-action="more"', $html, 'the last page' );
	}

	public function test_a_page_past_the_end_or_not_a_page_reads_as_the_nearest_one(): void {
		$this->library_of( 25 );
		$this->assertSame( 25, substr_count( $this->library_at( '9' ), 'class="riff-card"' ), 'past the end: everything' );
		foreach ( array( '0', '-1', 'two', '1.5', '' ) as $raw ) {
			$this->assertSame( 24, substr_count( $this->library_at( $raw ), 'class="riff-card"' ), "\"$raw\" is the first page" );
		}
	}

	public function test_load_more_keeps_the_page_address_with_plain_permalinks(): void {
		$this->set_permalink_structure( '' );
		$this->library_of( 25 );
		$page = self::factory()->post->create(
			array(
				'post_type'   => 'page',
				'post_status' => 'publish',
			)
		);
		$this->go_to( get_permalink( $page ) );
		$this->assertStringContainsString( 'page_id=' . $page . '&#038;riff_view=posts&#038;riff_page=2#riff-page-2', $this->library_at( null ) );
	}

	public function test_the_page_argument_follows_the_library_query_filter(): void {
		$this->library_of( 5 );
		$per_page = static function ( $args ) {
			$args['posts_per_page'] = 2;
			return $args;
		};
		add_filter( 'riff_library_query', $per_page );
		$html = $this->library_at( '2' );
		remove_filter( 'riff_library_query', $per_page );
		$this->assertSame( 4, substr_count( $html, 'class="riff-card"' ), 'two pages of two, as the route pages them' );
		$this->assertStringContainsString( 'data-riff-page="2" data-riff-pages="3"', $html );
	}

	/**
	 * Runs a test on a block theme whose global styles are these, as its theme.json would set them.
	 *
	 * @param array    $styles theme.json styles.
	 * @param callable $test   The test.
	 */
	private function with_theme_styles( array $styles, callable $test ): void {
		$theme = get_stylesheet();
		$data  = static fn( WP_Theme_JSON_Data $json ): WP_Theme_JSON_Data => $json->update_with(
			array(
				'version' => 3,
				'styles'  => $styles,
			)
		);
		switch_theme( 'twentytwentyfive' );
		add_filter( 'wp_theme_json_data_theme', $data );
		wp_clean_theme_json_cache();
		try {
			$this->assertTrue( wp_theme_has_theme_json() );
			$test();
		} finally {
			remove_filter( 'wp_theme_json_data_theme', $data );
			switch_theme( $theme );
			wp_clean_theme_json_cache();
		}
	}

	public function test_a_classic_theme_keeps_the_wordpress_org_look(): void {
		$this->assertFalse( wp_theme_has_theme_json(), 'the tests site runs a classic theme' );
		// Global styles still answer on a classic theme, from core and from filters; the block
		// follows a theme only when the theme has said how it looks.
		$data = static fn( WP_Theme_JSON_Data $json ): WP_Theme_JSON_Data => $json->update_with(
			array(
				'version' => 3,
				'styles'  => array(
					'color' => array(
						'text'       => '#111111',
						'background' => '#ffffff',
					),
				),
			)
		);
		add_filter( 'wp_theme_json_data_theme', $data );
		wp_clean_theme_json_cache();
		$this->assertSame( '#111111', wp_get_global_styles( array( 'color', 'text' ) ) );
		$this->assertSame( '', App::theme_style() );
		remove_filter( 'wp_theme_json_data_theme', $data );
		wp_clean_theme_json_cache();
	}

	public function test_the_block_takes_the_themes_colours_and_fonts(): void {
		$this->with_theme_styles(
			array(
				'color'      => array(
					'background' => 'var:preset|color|base',
					'text'       => '#111111',
				),
				'typography' => array( 'fontFamily' => 'var:preset|font-family|manrope' ),
				'elements'   => array(
					'link'    => array( 'color' => array( 'text' => '#c0ffee' ) ),
					'heading' => array( 'typography' => array( 'fontFamily' => '"Fraunces", serif' ) ),
				),
			),
			function (): void {
				$this->assertSame(
					array(
						'--riff-app-bg'           => 'var(--wp--preset--color--base)',
						'--riff-app-ink'          => '#111111',
						'--riff-app-accent'       => '#c0ffee',
						'--riff-app-font'         => 'var(--wp--preset--font-family--manrope)',
						'--riff-app-heading-font' => '"Fraunces", serif',
					),
					App::theme_tokens(),
					'a preset is its custom property, the accent is the link colour'
				);
				$style = App::theme_style();
				$this->assertStringContainsString( 'class="riff-app riff-app-themed"', App::render(), 'the stylesheet mixes the quieter shades under this class' );
				$this->assertStringContainsString( 'style="' . esc_attr( $style ) . '"', App::render(), 'the shortcode carries it' );
				// The block's own wrapper runs its style through safecss_filter_attr(); what is set
				// has to survive that, the way color-mix() would not.
				$block = do_blocks( '<!-- wp:riff/app /-->' );
				$this->assertMatchesRegularExpression( '#<div [^>]*class="[^"]*riff-app riff-app-themed#', $block );
				$this->assertStringContainsString( esc_attr( $style ), $block, 'the block carries every property' );
			}
		);
	}

	public function test_one_blocks_own_colours_and_font_reach_every_view_inside_it(): void {
		$block = do_blocks( '<!-- wp:riff/app {"backgroundColor":"contrast","textColor":"base","fontFamily":"manrope","style":{"elements":{"link":{"color":{"text":"var:preset|color|accent-1"}}}}} /-->' );

		$this->assertStringContainsString( '--riff-app-bg:var(--wp--preset--color--contrast)', $block, 'a preset by its slug' );
		$this->assertStringContainsString( '--riff-app-ink:var(--wp--preset--color--base)', $block );
		$this->assertStringContainsString( '--riff-app-accent:var(--wp--preset--color--accent-1)', $block, 'a link colour stored as var:preset' );
		$this->assertStringContainsString( '--riff-app-font:var(--wp--preset--font-family--manrope)', $block );
		$this->assertStringContainsString( '--riff-app-heading-font:var(--riff-app-font)', $block, 'the block\'s font is its headings\' too' );
		$this->assertMatchesRegularExpression( '#class="[^"]*riff-app riff-app-themed#', $block, 'the shades are mixed from the block\'s colours, on a classic theme too' );
		$this->assertStringNotContainsString( 'has-background', $block, 'core does not paint the wrapper separately' );
		$this->assertStringNotContainsString( 'has-manrope-font-family', $block );
	}

	public function test_a_custom_colour_on_one_block_comes_before_the_themes(): void {
		$this->with_theme_styles(
			array(
				'color'  => array(
					'background' => '#ffffff',
					'text'       => '#111111',
				),
				'blocks' => array(
					'riff/app' => array( 'color' => array( 'text' => '#222222' ) ),
				),
			),
			function (): void {
				$this->assertSame( '#222222', App::theme_tokens()['--riff-app-ink'], 'Styles > Blocks > Riff before the site\'s own' );
				$this->assertSame( '#ffffff', App::theme_tokens()['--riff-app-bg'], 'and the site\'s where the block sets nothing' );

				$block = do_blocks( '<!-- wp:riff/app {"style":{"color":{"background":"#000000"}}} /-->' );
				$this->assertStringContainsString( '--riff-app-bg:#000000', $block, 'one block\'s setting before both' );
				$this->assertStringContainsString( '--riff-app-ink:#222222', $block );
			}
		);
	}

	public function test_standalone_mode_keeps_its_one_design_whatever_the_block_says(): void {
		add_filter( 'riff_app_theme_tokens', array( \Riff\Listen\Standalone::class, 'tokens' ), 1 );
		try {
			$block = do_blocks( '<!-- wp:riff/app {"backgroundColor":"contrast"} /-->' );
			$this->assertStringContainsString( '--riff-app-bg:#030303', $block );
			$this->assertStringNotContainsString( 'preset--color--contrast', $block );
		} finally {
			remove_filter( 'riff_app_theme_tokens', array( \Riff\Listen\Standalone::class, 'tokens' ), 1 );
		}
	}

	public function test_a_link_in_the_text_colour_and_one_font_carry_through(): void {
		// Twenty Twenty-Five's own shape: links are currentColor, and headings have no font of their own.
		$this->with_theme_styles(
			array(
				'color'      => array(
					'background' => '#ffffff',
					'text'       => '#111111',
				),
				'typography' => array( 'fontFamily' => '"Manrope", sans-serif' ),
				'elements'   => array( 'link' => array( 'color' => array( 'text' => 'currentColor' ) ) ),
			),
			function (): void {
				$tokens = App::theme_tokens();
				$this->assertSame( 'var(--riff-app-ink)', $tokens['--riff-app-accent'], 'currentColor would resolve to a filled button\'s own label' );
				$this->assertSame( 'var(--riff-app-font)', $tokens['--riff-app-heading-font'], 'headings follow the one font, not Garamond' );
			}
		);
	}

	public function test_a_filter_keeps_the_wordpress_org_look_or_sets_its_own(): void {
		$this->with_theme_styles(
			array( 'color' => array( 'text' => '#111111' ) ),
			function (): void {
				$none = static fn(): array => array();
				add_filter( 'riff_app_theme_tokens', $none );
				$this->assertSame( '', App::theme_style(), 'an empty array keeps the block\'s own palette' );
				$this->assertStringNotContainsString( 'style=', App::render() );
				remove_filter( 'riff_app_theme_tokens', $none );

				$bad = static fn(): array => array(
					'--riff-app-bg'   => 'red;} body { display: none',
					'color'           => 'red',
					'--riff-app-ink'  => '"><script>',
					'--riff-app-line' => '#d9d9d9',
				);
				add_filter( 'riff_app_theme_tokens', $bad );
				$this->assertSame( array( '--riff-app-line' => '#d9d9d9' ), App::theme_tokens(), 'only a --riff-app-* property and a value that cannot close it' );
				remove_filter( 'riff_app_theme_tokens', $bad );
			}
		);
	}
}
