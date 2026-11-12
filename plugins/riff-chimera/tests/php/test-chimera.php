<?php
/**
 * Riff Chimera.
 *
 * @package Riff\Chimera
 */

use Riff\Chimera\Chimera;

/**
 * Riff\Chimera\Chimera.
 */
class Test_Riff_Chimera extends Riff_TestCase {

	public function set_up(): void {
		parent::set_up();
		// Hooked per test; the suite restores every hook afterwards.
		Chimera::register();
	}

	public function tear_down(): void {
		foreach ( array( 'riff-chimera-melody', 'riff-chimera-midi', 'riff-chimera-voice', 'riff-chimera' ) as $handle ) {
			wp_dequeue_script( $handle );
			wp_deregister_script( $handle );
		}
		parent::tear_down();
	}

	public function test_the_view_is_registered_on_the_server_for_the_sidebar(): void {
		$views = Riff\Registry::views( 'sidebar' );
		$this->assertArrayHasKey( 'chimera', $views, 'docked in the Listen app\'s sidebar, registered as Riff registers its own' );
		$this->assertSame( 'Chimera', $views['chimera']['label'] );
		$this->assertArrayNotHasKey( 'chimera', Riff\Registry::views( 'screen' ), 'never taking over Now Playing' );
		$this->assertStringContainsString( 'data-riff-dock-opens="chimera"', Riff\Registry::dock(), 'a row of its own in the dock' );
		$this->assertStringContainsString( 'data-riff-panel="chimera"', Riff\Registry::panels(), 'and a panel wherever there is no sidebar' );
	}

	public function test_its_scripts_load_only_with_the_player_and_chimera_itself_only_when_the_view_opens(): void {
		$this->assertFalse( wp_script_is( 'riff-chimera', 'enqueued' ), 'nothing before the player renders' );
		do_action( 'riff_before_player' );
		$this->assertTrue( wp_script_is( 'riff-chimera', 'enqueued' ) );
		$scripts = wp_scripts();
		$srcs    = array_map( static fn( $h ) => $scripts->registered[ $h ]->src, $scripts->queue );
		foreach ( $srcs as $src ) {
			$this->assertStringNotContainsString( '/assets/chimera/', (string) $src, 'CHIMERA\'s engine, worklet and dictionary are not page scripts' );
		}
		$config = implode( '', $scripts->get_data( 'riff-chimera', 'before' ) ?: array() );
		$this->assertStringContainsString( 'window.riffChimera = ', $config );
		foreach ( array( 'chimera.wasm', 'chimera.js', 'processor.js', 'cmudict.txt' ) as $file ) {
			$this->assertStringContainsString( 'riff-chimera\/assets\/chimera\/' . $file, $config, "{$file} is fetched from the plugin's own folder" );
		}
		$this->assertStringContainsString( '"media":"', $config, 'the melody comes from the media route' );
		$this->assertStringNotContainsString( '"nonce"', $config, 'a visitor gets no nonce' );
	}

	public function test_someone_signed_in_reads_a_private_melody_with_their_nonce(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );
		do_action( 'riff_before_player' );
		$config = implode( '', wp_scripts()->get_data( 'riff-chimera', 'before' ) ?: array() );
		$this->assertStringContainsString( '"nonce":"', $config );
	}

	public function test_it_keeps_nothing_of_its_own(): void {
		$id = self::attach( '02 - Underground [underground].mp3' );
		$this->assertArrayNotHasKey( 'riff_chimera', get_registered_meta_keys( 'post', 'attachment' ) );
		$this->assertSame( array(), array_filter( array_keys( get_post_meta( $id ) ), static fn( $k ) => str_contains( $k, 'chimera' ) ) );
	}
}
