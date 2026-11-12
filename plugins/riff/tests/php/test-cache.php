<?php
/**
 * What Riff keeps between requests (Riff\Cache), and the view the Listen app fetches alone
 * (?riff_part=view).
 *
 * @package Riff
 */

use Riff\Cache;
use Riff\Listen\App;

/**
 * Riff\Cache and App::part().
 */
class Test_Riff_Cache extends Riff_TestCase {

	/**
	 * Each test starts as a request of its own: nothing this process changed earlier is pending.
	 */
	public function set_up(): void {
		parent::set_up();
		Cache::settle();
	}

	/**
	 * And ends as one, so no change made here is left pending for the next test.
	 */
	public function tear_down(): void {
		Cache::settle();
		parent::tear_down();
	}

	/**
	 * A new request: the request's own object cache is gone, last-changed times with it.
	 */
	private function next_request(): void {
		Cache::settle();
		wp_cache_flush();
	}

	public function test_a_value_is_kept_for_the_next_request(): void {
		if ( wp_using_ext_object_cache() ) {
			$this->markTestSkipped( 'Kept in the object cache, which this checks without.' );
		}
		Cache::set( 'test-kept', array( 1, 2 ) );
		$this->next_request();
		$this->assertSame( array( 1, 2 ), Cache::get( 'test-kept' ) );
	}

	public function test_a_changed_post_forgets_what_was_kept_at_once_and_for_later_requests(): void {
		Cache::set( 'test-post', 'before' );
		$this->next_request();
		$stamp = get_option( Cache::STAMP );

		self::factory()->post->create();

		$this->assertFalse( Cache::get( 'test-post' ), 'the request that changed it no longer reads it' );
		$this->assertNotSame( $stamp, get_option( Cache::STAMP ), 'the stamp moved at the first change' );
		$this->next_request();
		$this->assertFalse( Cache::get( 'test-post' ), 'nor does a later request' );
	}

	public function test_a_changed_term_forgets_what_was_kept(): void {
		Cache::set( 'test-term', 'before' );
		$this->next_request();

		self::factory()->term->create( array( 'taxonomy' => 'category' ) );

		$this->assertFalse( Cache::get( 'test-term' ) );
		$this->next_request();
		$this->assertFalse( Cache::get( 'test-term' ) );
	}

	public function test_what_is_worked_out_after_the_first_change_is_not_kept_past_a_second(): void {
		$this->next_request();
		self::factory()->post->create();
		Cache::set( 'test-between', 'stale' );
		self::factory()->post->create();
		$this->next_request();
		$this->assertFalse( Cache::get( 'test-between' ), 'the stamp moved again as the request ended' );
	}

	public function test_a_page_view_reads_the_last_changed_times_without_moving_the_stamp(): void {
		$page = self::factory()->post->create( array( 'post_type' => 'page' ) );
		$this->next_request();
		Cache::set( 'test-view', 'kept' );
		$this->next_request();
		$stamp = get_option( Cache::STAMP );

		$this->go_to( get_permalink( $page ) );
		Cache::get( 'test-view' );
		$this->next_request();

		$this->assertSame( $stamp, get_option( Cache::STAMP ) );
		if ( ! wp_using_ext_object_cache() ) {
			$this->assertSame( 'kept', Cache::get( 'test-view' ) );
		}
	}

	/**
	 * A page with the Listen block, and a page without it.
	 *
	 * @param array $args Post arguments.
	 * @return int
	 */
	private function listen_page( array $args = array() ): int {
		return self::factory()->post->create(
			$args + array(
				'post_type'    => 'page',
				'post_status'  => 'publish',
				'post_content' => '<!-- wp:riff/app /-->',
			)
		);
	}

	public function test_a_listen_page_asked_for_its_view_alone_sends_the_view(): void {
		$this->go_to( add_query_arg( App::PART, 'view', get_permalink( $this->listen_page() ) ) );
		$this->assertSame( RIFF_DIR . 'templates/view.php', App::part( 'page.php' ) );
	}

	public function test_anything_else_keeps_its_own_template(): void {
		$listen = $this->listen_page();
		$this->go_to( get_permalink( $listen ) );
		$this->assertSame( 'page.php', App::part( 'page.php' ), 'without the argument' );

		$this->go_to( add_query_arg( App::PART, 'everything', get_permalink( $listen ) ) );
		$this->assertSame( 'page.php', App::part( 'page.php' ), 'a part that is not the view' );

		$plain = self::factory()->post->create(
			array(
				'post_type'   => 'page',
				'post_status' => 'publish',
			)
		);
		$this->go_to( add_query_arg( App::PART, 'view', get_permalink( $plain ) ) );
		$this->assertSame( 'page.php', App::part( 'page.php' ), 'a page without the app' );
	}

	public function test_a_listen_page_behind_a_password_gets_its_normal_page(): void {
		$locked = $this->listen_page( array( 'post_password' => 'open sesame' ) );
		$this->go_to( add_query_arg( App::PART, 'view', get_permalink( $locked ) ) );
		$this->assertSame( 'page.php', App::part( 'page.php' ) );
	}
}
