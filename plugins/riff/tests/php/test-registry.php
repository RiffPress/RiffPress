<?php
/**
 * The player's controls and views, registered on the server.
 *
 * @package Riff
 */

use Riff\Registry;

/**
 * @covers \Riff\Registry
 */
class Test_Riff_Registry extends Riff_TestCase {

	public function test_riff_registers_its_own_as_any_plugin_does(): void {
		$this->assertSame( array( 'like', 'badges', 'cast', 'volume' ), array_keys( Registry::controls() ) );
		$this->assertSame( array( 'album', 'about', 'queue' ), array_keys( array_diff_key( Registry::views(), array( 'lyrics' => true ) ) ) );
		$this->assertSame( 1, did_action( Registry::HOOK ), 'riff_register runs once, as they are first read' );
		Registry::views();
		$this->assertSame( 1, did_action( Registry::HOOK ) );
	}

	public function test_a_plugin_adds_a_control_and_a_view_in_their_places(): void {
		add_action(
			Registry::HOOK,
			static function () {
				riff_register_control(
					'sleep',
					array(
						'label' => 'Sleep timer',
						'icon'  => 'pause',
						'order' => 65,
					)
				);
				riff_register_view(
					'credits',
					array(
						'label'  => 'Credits',
						'icon'   => '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><script>alert(1)</script></svg>',
						'order'  => 32,
						'render' => static fn( $id ) => '<p class="credits">' . esc_html( $id ) . '</p>',
						'script' => 'my-credits',
					)
				);
			}
		);

		$bar = Registry::bar();
		$this->assertMatchesRegularExpression( '#data-riff-control="like".*data-riff-control="credits".*data-riff-control="queue".*data-riff-control="cast".*data-riff-control="sleep".*data-riff-control="volume"#s', $bar, 'each by its order' );
		$this->assertStringContainsString( '<button type="button" class="riff-btn riff-control riff-control-sleep" data-riff-control="sleep" data-riff-order="65" aria-label="Sleep timer"><svg', $bar );
		$this->assertStringNotContainsString( '<script', $bar, 'an icon is SVG and nothing more' );
		$this->assertStringContainsString( '<path d="M4 4h16v16H4z"', $bar );
		$this->assertStringContainsString( '<section class="riff-view riff-view-credits" data-riff-view="credits" aria-label="Credits" tabindex="-1" hidden><p class="credits">credits</p></section>', Registry::screens(), 'its region, drawn before any script' );
		$this->assertStringContainsString( 'data-riff-chip="credits"', Registry::chips() );

		wp_register_script_module( 'my-credits', 'https://example.org/credits.js' );
		Registry::enqueue();
		$this->assertStringContainsString( 'credits.js', $this->modules(), 'the module that brings it to life' );
	}

	public function test_a_sidebar_view_is_docked_in_the_sidebar_and_a_panel_without_one(): void {
		add_action(
			Registry::HOOK,
			static function () {
				riff_register_view(
					'voice',
					array(
						'label'  => 'Voice <b>&</b>',
						'icon'   => '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><script>alert(1)</script></svg>',
						'order'  => 38,
						'place'  => 'sidebar',
						'render' => static fn( $id ) => '<p class="voice">' . esc_html( $id ) . '</p>',
					)
				);
				riff_register_view(
					'notes',
					array(
						'label' => 'Notes',
						'order' => 20,
						'place' => 'sidebar',
					)
				);
				riff_register_view(
					'odd',
					array(
						'label' => 'Odd',
						'place' => 'nowhere',
					)
				);
			}
		);

		$this->assertSame( array( 'notes', 'voice' ), array_keys( Registry::views( 'sidebar' ) ), 'its own place, by order' );
		$this->assertSame( 'screen', Registry::views()['odd']['place'], 'a place Riff has not is a screen' );
		$this->assertStringContainsString( 'data-riff-control="voice" data-riff-opens="voice"', Registry::bar(), 'its button in the bar' );
		$this->assertStringContainsString( 'data-riff-chip="voice"', Registry::chips(), 'and its chip on a phone' );
		$this->assertStringContainsString( '<div class="riff-panel riff-panel-voice" data-riff-panel="voice" data-riff-label="Voice &lt;b&gt;&amp;&lt;/b&gt;" hidden><p class="voice">voice</p></div>', Registry::panels(), 'its region, a panel until the player docks it' );
		$this->assertStringNotContainsString( 'data-riff-view="voice"', Registry::screens() );

		$dock = Registry::dock();
		$this->assertMatchesRegularExpression( '#^<div class="riff-dock" data-riff-dock>.*data-riff-dock-item="notes".*data-riff-dock-item="voice".*</div>$#s', $dock, 'a row each, by order' );
		$this->assertStringContainsString( '<h2 class="riff-dock-head"><button type="button" class="riff-dock-toggle" id="riff-dock-toggle-voice" data-riff-dock-opens="voice" aria-expanded="false" aria-controls="riff-dock-body-voice"><svg', $dock, 'a heading that opens and closes it' );
		$this->assertStringContainsString( '<span class="riff-dock-label">Voice &lt;b&gt;&amp;&lt;/b&gt;</span>', $dock, 'named in words' );
		$this->assertStringContainsString( '<div class="riff-dock-body" id="riff-dock-body-voice" role="region" aria-labelledby="riff-dock-toggle-voice" hidden></div>', $dock, 'closed until the player opens it' );
		$this->assertStringNotContainsString( '<script', $dock );
		$this->assertStringNotContainsString( 'data-riff-dock-item="odd"', $dock );

		$data = Registry::player_data( array() );
		$this->assertSame( 'sidebar', $data['views']['voice']['place'], 'the player knows where it goes' );
	}

	public function test_the_dock_is_drawn_empty_with_no_sidebar_view(): void {
		$this->assertSame( '<div class="riff-dock" data-riff-dock></div>', Registry::dock(), 'for a view a script adds' );
	}

	public function test_a_control_of_its_own_markup_is_marked_with_its_id(): void {
		add_action(
			Registry::HOOK,
			static fn() => riff_register_control(
				'level',
				array(
					'order'  => 55,
					'wide'   => true,
					'render' => static fn() => '<meter class="level" min="0" max="1"></meter>',
				)
			)
		);
		$this->assertMatchesRegularExpression( '#<meter(?=[^>]*data-riff-control="level")(?=[^>]*data-riff-order="55")(?=[^>]*class="level riff-desk")[^>]*></meter>#', Registry::bar() );
	}

	public function test_riffs_own_can_be_taken_away(): void {
		add_action(
			Registry::HOOK,
			static function () {
				riff_unregister_view( 'queue' );
				riff_unregister_control( 'volume' );
			},
			20
		);
		$this->assertArrayNotHasKey( 'queue', Registry::views() );
		$this->assertArrayNotHasKey( 'volume', Registry::controls() );
		$this->assertStringNotContainsString( 'data-riff-control="queue"', Registry::bar() );
	}

	public function test_a_panel_beside_the_page_is_drawn_with_its_name(): void {
		$panels = Registry::panels();
		$this->assertStringContainsString( '<div class="riff-panel riff-panel-queue" data-riff-panel="queue" data-riff-label="Up next" hidden>', $panels );
		$this->assertStringNotContainsString( 'data-riff-view="queue"', Registry::screens(), 'a panel is not a screen' );
		$this->assertStringNotContainsString( 'data-riff-view="album"', Registry::screens(), 'the album is the stage, with no region of its own' );
	}

	public function test_a_bad_id_or_a_missing_label_is_refused(): void {
		$this->setExpectedIncorrectUsage( 'Riff\Registry::register_control' );
		$this->setExpectedIncorrectUsage( 'Riff\Registry::register_view' );
		$this->assertFalse( riff_register_control( 'Not An Id', array( 'label' => 'X' ) ) );
		$this->assertFalse( riff_register_view( 'nameless' ) );
		$this->assertFalse( riff_register_view( 'like', array( 'label' => 'Like' ) ), 'a view may not take a control\'s id' );
	}

	public function test_a_plugin_registers_a_shortcut_and_the_player_is_told_its_key(): void {
		$this->assertSame( array(), Registry::shortcuts(), 'Riff registers none of its own here' );
		add_action(
			Registry::HOOK,
			static function () {
				riff_register_shortcut(
					'loop',
					array(
						'key'   => 'O',
						'label' => 'Loop the section',
					)
				);
				riff_register_shortcut(
					'faster',
					array(
						'key'   => ']',
						'label' => 'Faster',
					)
				);
			}
		);
		Registry::reset();
		$this->assertSame(
			array(
				'loop'   => array(
					'key'   => 'o',
					'label' => 'Loop the section',
				),
				'faster' => array(
					'key'   => ']',
					'label' => 'Faster',
				),
			),
			Registry::shortcuts(),
			'a letter is kept lowercase, as it acts whatever its case'
		);
		$this->assertSame(
			array(
				'loop'   => 'o',
				'faster' => ']',
			),
			Registry::player_data( array() )['keys']
		);
		$this->assertTrue(
			riff_register_shortcut(
				'loop',
				array(
					'key'   => 'o',
					'label' => 'Loop',
				)
			),
			'a shortcut may keep its own key as it is replaced'
		);
	}

	public function test_a_shortcut_needs_a_key_of_its_own(): void {
		$this->setExpectedIncorrectUsage( 'Riff\Registry::register_shortcut' );
		$this->assertTrue(
			riff_register_shortcut(
				'loop',
				array(
					'key'   => 'o',
					'label' => 'Loop',
				)
			)
		);
		foreach (
			array(
				'no label'                => array( 'key' => 'q' ),
				'no key'                  => array( 'label' => 'X' ),
				'two characters'          => array(
					'key'   => 'qq',
					'label' => 'X',
				),
				'a space'                 => array(
					'key'   => ' ',
					'label' => 'X',
				),
				'Riff\'s K'               => array(
					'key'   => 'K',
					'label' => 'X',
				),
				'Riff\'s N'               => array(
					'key'   => 'n',
					'label' => 'X',
				),
				'another\'s O, uppercase' => array(
					'key'   => 'O',
					'label' => 'X',
				),
			) as $why => $args
		) {
			$this->assertFalse( riff_register_shortcut( 'other', $args ), $why );
		}
		$this->assertFalse(
			riff_register_shortcut(
				'Not An Id',
				array(
					'key'   => 'q',
					'label' => 'X',
				)
			)
		);
		$this->assertSame( array( 'loop' ), array_keys( Registry::shortcuts() ) );
	}

	/**
	 * The script modules the page prints.
	 *
	 * @return string
	 */
	private function modules(): string {
		ob_start();
		wp_script_modules()->print_enqueued_script_modules();
		wp_script_modules()->print_import_map();
		return (string) ob_get_clean();
	}
}
