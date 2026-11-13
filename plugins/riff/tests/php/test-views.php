<?php
/**
 * The Listen app's views: Riff's own and a plugin's.
 *
 * @package Riff
 */

use Riff\Listen\App;
use Riff\Listen\Browse;
use Riff\Listen\Home_View;
use Riff\Listen\Views;

/**
 * Riff\Listen\Views.
 */
class Test_Riff_Views extends Riff_TestCase {

	/**
	 * The Listen page.
	 *
	 * @var int
	 */
	private int $page = 0;

	public function set_up(): void {
		parent::set_up();
		$this->page = self::factory()->post->create(
			array(
				'post_type'    => 'page',
				'post_status'  => 'publish',
				'post_content' => '<!-- wp:riff/app /-->',
			)
		);
		add_filter( 'riff_app_views', array( $this, 'views' ) );
	}

	public function tear_down(): void {
		remove_all_filters( 'riff_app_views' );
		remove_all_filters( 'riff_add_music_url' );
		unset( $_GET[ Browse::VIEW ] );
		wp_set_current_user( 0 );
		parent::tear_down();
	}

	/**
	 * A host's view, for someone who may upload.
	 *
	 * @param array $views The views.
	 * @return array
	 */
	public function views( array $views ): array {
		$views['upload'] = array(
			'label'      => 'Upload',
			'title'      => 'Add your music',
			'icon'       => '<svg viewBox="0 0 24 24"><path d="M12 5V19"/><script>alert(1)</script></svg>',
			'nav'        => array( 'sidebar', 'account' ),
			'capability' => 'upload_files',
			'render'     => static fn( string $page ): string => '<form class="host-upload" data-page="' . esc_attr( $page ) . '"></form>',
			'script'     => 'host-upload',
			'style'      => array( 'host-upload' ),
		);
		return $views;
	}

	/**
	 * The app at an address, with $_GET filled as a request would.
	 *
	 * @param array $args Query arguments.
	 * @return string
	 */
	private function render_at( array $args ): string {
		$this->go_to( add_query_arg( $args, get_permalink( $this->page ) ) );
		foreach ( $args as $key => $value ) {
			$_GET[ $key ] = (string) $value;
		}
		return App::render();
	}

	public function test_a_view_is_listed_only_for_someone_with_its_capability(): void {
		$visitor = $this->render_at( array() );
		$this->assertStringNotContainsString( 'riff_view=upload', $visitor );
		$this->assertFalse( Views::has( 'upload' ) );

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );
		$author = $this->render_at( array() );
		$this->assertMatchesRegularExpression( '#<a class="riff-app-tab" href="[^"]*riff_view=upload"><svg[^>]*><path d="M12 5V19" ?/>[^<]*</svg><span>Upload</span></a>#', $author, 'in the sidebar, its icon kept to what an icon needs' );
		$this->assertStringNotContainsString( '<script>', $author );
		$this->assertMatchesRegularExpression( '#riff-app-account-menu.*<a href="[^"]*riff_view=upload" data-riff-in-sidebar>Upload</a>#s', $author, 'and the account menu' );
		$this->assertLessThan( strpos( $author, 'riff-app-tab-library' ), strpos( $author, 'riff_view=upload' ), 'before Library, which stays last' );
	}

	public function test_a_view_is_drawn_in_the_apps_panel_at_its_address(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );
		$html = $this->render_at( array( Browse::VIEW => 'upload' ) );

		$this->assertMatchesRegularExpression( '#<div class="riff-app-view" data-riff-app-view><h2 class="riff-app-title" tabindex="-1">Add your music</h2><div class="riff-app-panel" data-riff-app-panel="upload"><form class="host-upload" data-page="' . preg_quote( esc_attr( (string) get_permalink( $this->page ) ), '#' ) . '"></form></div>#', $html );
		$this->assertMatchesRegularExpression( '#riff-app-brand" data-riff-view="upload"#', $html, 'the bar names the view, for riff:app_view' );
		$this->assertMatchesRegularExpression( '#href="[^"]*riff_view=upload" aria-current="page"#', $html );

		wp_set_current_user( 0 );
		$visitor = $this->render_at( array( Browse::VIEW => 'upload' ) );
		$this->assertStringNotContainsString( 'host-upload', $visitor, 'without the capability it is Home' );
		$this->assertStringContainsString( '>Home</h2>', $visitor );
	}

	public function test_a_view_without_a_render_or_with_a_name_of_riffs_is_left_out(): void {
		add_filter(
			'riff_app_views',
			static function ( array $views ): array {
				$views['broken'] = array( 'label' => 'Broken' );
				$views['album']  = array(
					'label'  => 'Album',
					'render' => '__return_empty_string',
				);
				unset( $views['home'], $views['library'] );
				return $views;
			},
			20
		);

		$views = Views::all();
		$this->assertArrayNotHasKey( 'broken', $views );
		$this->assertArrayNotHasKey( 'album', $views );
		$this->assertArrayHasKey( 'home', $views, 'Home stays' );
		$this->assertSame( 'library', array_key_last( $views ), 'and Library, last' );
	}

	public function test_taking_posts_away_takes_it_out_of_the_app(): void {
		$post = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		self::attach( '02 - Underground [underground].mp3', $post );
		$this->assertStringContainsString( 'riff_view=posts', $this->render_at( array() ), 'there by default' );

		add_filter(
			'riff_app_views',
			static function ( array $views ): array {
				unset( $views['posts'] );
				return $views;
			},
			20
		);
		$home = $this->render_at( array() );
		$this->assertStringNotContainsString( 'riff_view=posts', $home, 'not in the navigation, nor Home\'s rows' );
		$this->assertStringNotContainsString( 'New posts', Home_View::view( (string) get_permalink( $this->page ) ) );
		$this->assertNull( Browse::requested() );
		$this->assertStringContainsString( '>Home</h2>', $this->render_at( array( Browse::VIEW => 'posts' ) ), 'its address opens Home' );
		$this->assertStringContainsString( 'riff_view=albums', $home, 'the rest stay' );
	}

	public function test_add_music_can_lead_to_a_view(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );
		add_filter( 'riff_add_music_url', static fn(): string => 'upload' );
		$html = $this->render_at( array() );
		$app  = (string) get_permalink( $this->page );

		$this->assertSame( add_query_arg( Browse::VIEW, 'upload', $app ), Browse::add_music_url( $app ) );
		$this->assertStringNotContainsString( '>Add music</a>', $html, 'the menu lists the view once, by its own name' );
		$this->assertStringNotContainsString( 'media-new.php', $html );

		// A slug that is no view of the visitor's is taken as it is.
		wp_set_current_user( 0 );
		$this->assertSame( 'upload', Browse::add_music_url( $app ) );
	}

	public function test_a_views_script_and_style_come_with_the_app(): void {
		wp_register_script( 'host-upload', 'https://example.org/upload.js', array(), '1', true );
		wp_register_style( 'host-upload', 'https://example.org/upload.css', array(), '1' );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );

		$this->go_to( get_permalink( self::factory()->post->create() ) );
		Views::enqueue();
		$this->assertFalse( wp_script_is( 'host-upload' ), 'not on a page without the app' );

		$this->go_to( get_permalink( $this->page ) );
		Views::enqueue();
		$this->assertTrue( wp_script_is( 'host-upload' ) );
		$this->assertTrue( wp_style_is( 'host-upload' ) );
	}
}
