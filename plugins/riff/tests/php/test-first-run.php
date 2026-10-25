<?php
/**
 * The first-run notice: when it shows, when it hides, and what its two actions do.
 *
 * @package Riff
 */

use Riff\Listen\Home_View;
use Riff\Listen\First_Run;

/**
 * Riff\Listen\First_Run.
 */
class Test_Riff_First_Run extends Riff_TestCase {

	/**
	 * An administrator.
	 *
	 * @var int
	 */
	private int $admin = 0;

	public function set_up(): void {
		parent::set_up();
		$this->admin = self::factory()->user->create( array( 'role' => 'administrator' ) );
		wp_set_current_user( $this->admin );
		set_current_screen( 'dashboard' );
	}

	public function tear_down(): void {
		unset( $_GET[ First_Run::CREATE ], $_REQUEST['_wpnonce'] );
		remove_all_filters( 'wp_redirect' );
		set_current_screen( 'front' );
		parent::tear_down();
	}

	/**
	 * What the notice prints on the current screen.
	 *
	 * @return string
	 */
	private function notice(): string {
		ob_start();
		First_Run::notice();
		return (string) ob_get_clean();
	}

	/**
	 * A published page holding the Riff block.
	 *
	 * @param string $status Post status.
	 * @return int
	 */
	private function listen_page( string $status = 'publish' ): int {
		return self::factory()->post->create(
			array(
				'post_type'    => 'page',
				'post_status'  => $status,
				'post_content' => '<!-- wp:riff/app {"align":"full"} /-->',
			)
		);
	}

	/**
	 * An audio file in the Media Library.
	 *
	 * @return int
	 */
	private function audio(): int {
		return self::factory()->attachment->create(
			array(
				'post_mime_type' => 'audio/mpeg',
				'file'           => 'track.mp3',
			)
		);
	}

	/**
	 * Runs one of the notice's admin-post actions, catching the redirect it ends with.
	 *
	 * @param callable $action First_Run::create or First_Run::dismiss.
	 * @param string   $nonce  The nonce action.
	 * @return string Where it redirected.
	 */
	private function run_action( callable $action, string $nonce ): string {
		$_REQUEST['_wpnonce'] = wp_create_nonce( $nonce );
		add_filter(
			'wp_redirect',
			static function ( $location ) {
				throw new RuntimeException( (string) $location ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- test output only.
			}
		);
		try {
			$action();
		} catch ( RuntimeException $redirect ) {
			return $redirect->getMessage();
		}
		$this->fail( 'The action did not redirect.' );
	}

	public function test_a_fresh_site_offers_to_create_the_listen_page_and_add_the_first_album(): void {
		$html = $this->notice();

		$this->assertStringContainsString( 'notice notice-info is-dismissible riff-first-run', $html );
		$this->assertStringContainsString( 'action=' . First_Run::CREATE, $html );
		$this->assertStringContainsString( '_wpnonce=', $html );
		$this->assertStringContainsString( 'Add your first album', $html );
		$this->assertStringContainsString( admin_url( 'media-new.php' ), $html );
	}

	public function test_with_a_listen_page_but_no_music_it_links_to_the_page_and_the_first_album(): void {
		$page = $this->listen_page();

		$html = $this->notice();

		$this->assertStringNotContainsString( 'action=' . First_Run::CREATE, $html );
		$this->assertStringContainsString( (string) get_permalink( $page ), $html );
		$this->assertStringContainsString( 'Add your first album', $html );
		$this->assertStringContainsString( First_Run::GUIDE, $html );
	}

	public function test_with_music_but_no_listen_page_it_offers_the_page_only(): void {
		$this->audio();

		$html = $this->notice();

		$this->assertStringContainsString( 'action=' . First_Run::CREATE, $html );
		$this->assertStringNotContainsString( 'Add your first album', $html );
	}

	public function test_it_hides_once_there_is_a_listen_page_and_music(): void {
		$this->listen_page();
		$this->audio();

		$this->assertFalse( First_Run::should_show() );
		$this->assertSame( '', $this->notice() );
	}

	public function test_a_page_on_the_listen_template_is_a_listen_page(): void {
		$page = self::factory()->post->create(
			array(
				'post_type'   => 'page',
				'post_status' => 'publish',
			)
		);
		update_post_meta( $page, '_wp_page_template', 'listen' );

		$this->assertSame( $page, First_Run::listen_page() );
	}

	public function test_a_draft_or_a_page_that_only_mentions_the_block_is_not_a_listen_page(): void {
		$this->listen_page( 'draft' );
		self::factory()->post->create(
			array(
				'post_type'    => 'page',
				'post_status'  => 'publish',
				'post_content' => '<!-- wp:paragraph --><p>Type wp:riff/app to add the player.</p><!-- /wp:paragraph -->',
			)
		);

		$this->assertSame( 0, First_Run::listen_page() );
	}

	public function test_it_hides_for_someone_who_cannot_publish_pages(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );

		$this->assertFalse( First_Run::should_show() );
		$this->assertSame( '', $this->notice() );
	}

	public function test_an_editor_sees_it(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'editor' ) ) );

		$this->assertTrue( First_Run::should_show() );
	}

	public function test_it_shows_only_on_the_dashboard_and_the_plugins_screen(): void {
		set_current_screen( 'plugins' );
		$this->assertNotSame( '', $this->notice() );

		set_current_screen( 'edit-post' );
		$this->assertSame( '', $this->notice() );
	}

	public function test_dismissing_hides_it_for_that_user_only(): void {
		$back = $this->run_action( array( First_Run::class, 'dismiss' ), First_Run::DISMISS );

		$this->assertSame( admin_url(), $back );
		$this->assertTrue( First_Run::dismissed( $this->admin ) );
		$this->assertSame( '', $this->notice() );

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		$this->assertNotSame( '', $this->notice() );
	}

	public function test_the_button_creates_one_published_listen_page(): void {
		$back = $this->run_action( array( First_Run::class, 'create' ), First_Run::CREATE );

		$page = First_Run::listen_page();
		$this->assertGreaterThan( 0, $page );
		$this->assertSame( 'publish', get_post_status( $page ) );
		$this->assertTrue( has_block( 'riff/app', $page ) );
		$this->assertStringContainsString( First_Run::CREATE . '=1', $back );

		// Pressed twice, from a second tab: still one page.
		$this->run_action( array( First_Run::class, 'create' ), First_Run::CREATE );
		$pages = get_posts(
			array(
				'post_type'   => 'page',
				'post_status' => 'any',
				'fields'      => 'ids',
			)
		);
		$this->assertSame( array( $page ), $pages );
	}

	public function test_the_button_needs_its_nonce(): void {
		$_REQUEST['_wpnonce'] = 'wrong';
		$this->expectException( WPDieException::class );

		First_Run::create();
	}

	public function test_after_creating_the_page_on_a_site_with_music_it_says_the_page_is_ready(): void {
		$this->audio();
		$page                      = $this->listen_page();
		$_GET[ First_Run::CREATE ] = '1';

		$html = $this->notice();

		$this->assertStringContainsString( 'notice-success', $html );
		$this->assertStringContainsString( (string) get_permalink( $page ), $html );
	}

	public function test_the_listen_apps_empty_state_links_an_uploader_to_the_first_album(): void {
		$page = (string) get_permalink( $this->listen_page() );

		$this->assertStringContainsString( admin_url( 'media-new.php' ), Home_View::view( $page ) );

		wp_set_current_user( 0 );
		$this->assertStringNotContainsString( 'media-new.php', Home_View::view( $page ) );
	}
}
