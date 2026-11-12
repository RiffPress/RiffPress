<?php
/**
 * The player's controls and views, registered on the server.
 *
 * @since 5.8.0
 * @package Riff
 */

namespace Riff;

use WP_HTML_Tag_Processor;

defined( 'ABSPATH' ) || exit;

/**
 * What the player's bar holds and what Now Playing shows, declared in PHP as WordPress declares
 * blocks and settings, so the page has every button and every view before any script runs and the
 * browser only brings each to life by its id. Riff registers its own here, as any plugin does, on
 * the `riff_register` action.
 *
 * A control is something in the bar: a button, or an element of its own. A view is something the
 * listener opens from its button in the bar: a screen of Now Playing, which takes the whole screen
 * above the bar (the album, the lyrics), a panel beside the page (Up next), or a view docked in
 * the Listen app's sidebar, which is a panel wherever there is no sidebar.
 * `window.riff.control()` and `window.riff.view()` give a registered one its behaviour, and add
 * one the server didn't, for what only the browser knows.
 */
final class Registry {

	/**
	 * The action controls and views are registered on.
	 *
	 * @since 5.8.0
	 */
	public const HOOK = 'riff_register';

	/**
	 * An id: lowercase letters, digits and dashes, starting with a letter.
	 */
	private const ID = '/^[a-z][a-z0-9-]*$/';

	/**
	 * Where a view may be: a screen of Now Playing, a panel beside the page, or docked in the
	 * Listen app's sidebar.
	 */
	private const PLACES = array( 'screen', 'side', 'sidebar' );

	/**
	 * Controls by id, in the order they were registered.
	 *
	 * @var array[]
	 */
	private static $controls = array();

	/**
	 * Views by id, in the order they were registered.
	 *
	 * @var array[]
	 */
	private static $views = array();

	/**
	 * Keyboard shortcuts by id, in the order they were registered.
	 *
	 * @var array[]
	 */
	private static $shortcuts = array();

	/**
	 * Whether `riff_register` has run this request.
	 *
	 * @var bool
	 */
	private static $ready = false;

	/**
	 * How many have been registered, to keep equal orders in the order they came.
	 *
	 * @var int
	 */
	private static $added = 0;

	/**
	 * Registers a control in the player's bar, or replaces the one with the same id.
	 *
	 * @since 5.8.0
	 *
	 * @param string $id   Lowercase letters, digits and dashes; the control is `[data-riff-control="<id>"]`.
	 * @param array  $args {
	 *     The control.
	 *
	 *     @type string   $label  What it is called, for a screen reader and a pointer's tooltip.
	 *     @type string   $icon   An icon of Riff's own by name, or SVG markup.
	 *     @type int      $order  Where it sits among the others, lowest first. Default 50.
	 *     @type bool     $wide   Only on a wide screen; a phone's bar keeps to the track, Play and
	 *                            what it needs. Default false.
	 *     @type callable $render Markup of its own in place of a button, for an element that is
	 *                            not one; it is given the id and returns one element.
	 *     @type string   $script The script module that brings it to life, which Riff enqueues
	 *                            wherever the player is. Register the module yourself.
	 * }
	 * @return bool Whether it was registered.
	 */
	public static function register_control( string $id, array $args = array() ): bool {
		// Riff's own first, so one registered before they are read keeps its place among them.
		self::ready();
		$args = wp_parse_args(
			$args,
			array(
				'label'  => '',
				'icon'   => '',
				'order'  => 50,
				'wide'   => false,
				'render' => null,
				'script' => '',
			)
		);
		if ( ! preg_match( self::ID, $id ) || ( '' === (string) $args['label'] && ! is_callable( $args['render'] ) ) ) {
			_doing_it_wrong( __METHOD__, esc_html__( 'A control needs an id of lowercase letters, digits and dashes, and a label or its own markup.', 'riff' ), '5.8.0' );
			return false;
		}
		$args['order']         = (int) $args['order'];
		$args['added']         = ++self::$added;
		self::$controls[ $id ] = $args;
		return true;
	}

	/**
	 * Takes a control away.
	 *
	 * @since 5.8.0
	 *
	 * @param string $id The control's id.
	 * @return bool Whether there was one.
	 */
	public static function unregister_control( string $id ): bool {
		self::ready();
		if ( ! isset( self::$controls[ $id ] ) ) {
			return false;
		}
		unset( self::$controls[ $id ] );
		return true;
	}

	/**
	 * Registers a view the listener opens from its button in the bar, or replaces the one with the
	 * same id.
	 *
	 * @since 5.8.0
	 * @since 6.12.0 `sidebar` for `$place`.
	 *
	 * @param string $id   Lowercase letters, digits and dashes; the view is `[data-riff-view="<id>"]`.
	 * @param array  $args {
	 *     The view.
	 *
	 *     @type string   $label  Its name: its button's, its chip's and its region's.
	 *     @type string   $icon   An icon of Riff's own by name, or SVG markup.
	 *     @type int      $order  Where its button sits among the bar's controls, lowest first.
	 *                            Default 50.
	 *     @type string   $place  `screen` to take the whole screen above the bar, as Now Playing
	 *                            does; `side` for a panel beside the page; `sidebar` to be docked
	 *                            in the Listen app's sidebar, under its own heading, while the
	 *                            listener browses beside it, and a panel beside the page wherever
	 *                            there is no sidebar. Default `screen`.
	 *     @type bool     $stage  For a screen that is Now Playing's own stage, the track's art or
	 *                            its record, rather than a region of its own, with no button in
	 *                            the bar, which opens it itself. Default false.
	 *     @type bool     $wide   Its button only on a wide screen; on a phone its chip in Now
	 *                            Playing opens it. Default true.
	 *     @type callable $render Markup for its region as the page is drawn; the script fills it
	 *                            as it opens. Given the id.
	 *     @type string   $script The script module that brings it to life, which Riff enqueues
	 *                            wherever the player is. Register the module yourself.
	 * }
	 * @return bool Whether it was registered.
	 */
	public static function register_view( string $id, array $args = array() ): bool {
		self::ready();
		$args = wp_parse_args(
			$args,
			array(
				'label'  => '',
				'icon'   => '',
				'order'  => 50,
				'place'  => 'screen',
				'stage'  => false,
				'wide'   => true,
				'render' => null,
				'script' => '',
			)
		);
		if ( ! preg_match( self::ID, $id ) || '' === (string) $args['label'] || isset( self::$controls[ $id ] ) ) {
			_doing_it_wrong( __METHOD__, esc_html__( 'A view needs a label, and an id of lowercase letters, digits and dashes that no control has.', 'riff' ), '5.8.0' );
			return false;
		}
		$args['place']      = in_array( $args['place'], self::PLACES, true ) ? $args['place'] : 'screen';
		$args['order']      = (int) $args['order'];
		$args['added']      = ++self::$added;
		self::$views[ $id ] = $args;
		return true;
	}

	/**
	 * Takes a view away.
	 *
	 * @since 5.8.0
	 *
	 * @param string $id The view's id.
	 * @return bool Whether there was one.
	 */
	public static function unregister_view( string $id ): bool {
		self::ready();
		if ( ! isset( self::$views[ $id ] ) ) {
			return false;
		}
		unset( self::$views[ $id ] );
		return true;
	}

	/**
	 * Registers a key a plugin's script acts on, or replaces the shortcut with the same id. It
	 * follows Riff's own single-key shortcuts: it does nothing while the listener types in a field,
	 * it is listed with them under Personal Options on the listener's profile, and it is off
	 * wherever they are off, for a visitor, for a listener who turned them off, and through the
	 * `riff.shortcuts` filter.
	 *
	 * @since 5.9.0
	 *
	 * @param string $id   Lowercase letters, digits and dashes; `window.riff.shortcut()` gives it
	 *                     what it does by this id.
	 * @param array  $args {
	 *     The shortcut.
	 *
	 *     @type string $key   One character, as the key types it: a letter, which acts without
	 *                         Shift whatever its case, a digit, or a mark such as `[` or `+`. Not
	 *                         a space, and not one of Riff's own letters, K, J, L, N and P, nor a
	 *                         key another shortcut has.
	 *     @type string $label What it does, as the profile lists it beside the key.
	 * }
	 * @return bool Whether it was registered.
	 */
	public static function register_shortcut( string $id, array $args = array() ): bool {
		self::ready();
		$args  = wp_parse_args(
			$args,
			array(
				'key'   => '',
				'label' => '',
			)
		);
		$key   = mb_strtolower( (string) $args['key'] );
		$taken = array_diff_key( wp_list_pluck( self::$shortcuts, 'key' ), array( $id => true ) );
		if (
			! preg_match( self::ID, $id ) ||
			'' === (string) $args['label'] ||
			1 !== mb_strlen( $key ) ||
			'' === trim( $key ) ||
			in_array( $key, array( 'k', 'j', 'l', 'n', 'p' ), true ) ||
			in_array( $key, $taken, true )
		) {
			_doing_it_wrong( __METHOD__, esc_html__( 'A shortcut needs an id of lowercase letters, digits and dashes, a label, and one key that is not a space and that neither Riff nor another shortcut has.', 'riff' ), '5.9.0' );
			return false;
		}
		self::$shortcuts[ $id ] = array(
			'key'   => $key,
			'label' => (string) $args['label'],
		);
		return true;
	}

	/**
	 * The keyboard shortcuts plugins registered, in the order they were registered.
	 *
	 * @since 5.9.0
	 *
	 * @return array[] By id, each its `key` and `label`.
	 */
	public static function shortcuts(): array {
		self::ready();
		return self::$shortcuts;
	}

	/**
	 * The controls, in their order.
	 *
	 * @since 5.8.0
	 *
	 * @return array[] By id.
	 */
	public static function controls(): array {
		self::ready();
		return self::sorted( self::$controls );
	}

	/**
	 * The views, in their order: all of them, or those in one place.
	 *
	 * @since 5.8.0
	 *
	 * @since 6.12.0 `sidebar` for `$place`.
	 *
	 * @param string $place `screen`, `side`, `sidebar`, or empty for all of them.
	 * @return array[] By id.
	 */
	public static function views( string $place = '' ): array {
		self::ready();
		$views = '' === $place ? self::$views : array_filter( self::$views, static fn( $view ) => $view['place'] === $place );
		return self::sorted( $views );
	}

	/**
	 * Forgets every control and view, so the next read registers them again. For tests.
	 *
	 * @since 5.8.0
	 */
	public static function reset(): void {
		self::$controls  = array();
		self::$views     = array();
		self::$shortcuts = array();
		self::$ready     = false;
	}

	/**
	 * Registers Riff's own and every plugin's, once a request, the first time they are read.
	 */
	private static function ready(): void {
		if ( self::$ready ) {
			return;
		}
		self::$ready = true;
		/**
		 * Fires once a request, before the player's controls and views are first read: register
		 * them here with `riff_register_control()` and `riff_register_view()`, or take one of
		 * Riff's own away. A plugin's keyboard shortcuts are registered here too, with
		 * `riff_register_shortcut()`.
		 *
		 * @since 5.8.0
		 */
		do_action( 'riff_register' );
	}

	/**
	 * By order, then in the order they were registered.
	 *
	 * @param array[] $items By id.
	 * @return array[]
	 */
	private static function sorted( array $items ): array {
		uasort( $items, static fn( $a, $b ) => array( $a['order'], $a['added'] ) <=> array( $b['order'], $b['added'] ) );
		return $items;
	}

	/**
	 * An icon: one of Riff's own by name, or SVG markup with only what an icon needs.
	 *
	 * @since 5.8.0
	 *
	 * @param string $icon A name from Player::icon(), or SVG.
	 * @return string
	 */
	public static function icon( string $icon ): string {
		if ( '' === $icon ) {
			return '';
		}
		if ( preg_match( '/^[a-zA-Z]+$/', $icon ) ) {
			return Player::icon( $icon );
		}
		$shape = array(
			'd'               => true,
			'fill'            => true,
			'fill-rule'       => true,
			'clip-rule'       => true,
			'stroke'          => true,
			'stroke-width'    => true,
			'stroke-linecap'  => true,
			'stroke-linejoin' => true,
			'transform'       => true,
			'opacity'         => true,
		);
		return wp_kses(
			$icon,
			array(
				'svg'      => array(
					'viewbox'      => true,
					'aria-hidden'  => true,
					'focusable'    => true,
					'fill'         => true,
					'stroke'       => true,
					'stroke-width' => true,
					'class'        => true,
					'width'        => true,
					'height'       => true,
				),
				'g'        => $shape,
				'path'     => $shape,
				'circle'   => array_merge( $shape, array( 'cx' => true, 'cy' => true, 'r' => true ) ), // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
				'rect'     => array_merge( $shape, array( 'x' => true, 'y' => true, 'width' => true, 'height' => true, 'rx' => true ) ), // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
				'polygon'  => array_merge( $shape, array( 'points' => true ) ),
				'polyline' => array_merge( $shape, array( 'points' => true ) ),
			)
		);
	}

	/**
	 * The bar's controls and the views' buttons, in one order, as the bar holds them.
	 *
	 * @since 5.8.0
	 *
	 * @return string
	 */
	public static function bar(): string {
		$items = array();
		foreach ( self::controls() as $id => $control ) {
			$items[] = array( $control['order'], $control['added'], self::control( $id, $control ) );
		}
		foreach ( self::views() as $id => $view ) {
			// The stage, what Now Playing opens to, has no button of its own: the bar itself opens it.
			if ( $view['stage'] ) {
				continue;
			}
			$items[] = array( $view['order'], $view['added'], self::button( $id, $view ) );
		}
		usort( $items, static fn( $a, $b ) => array( $a[0], $a[1] ) <=> array( $b[0], $b[1] ) );
		return implode( '', array_column( $items, 2 ) );
	}

	/**
	 * One control: its own markup, marked with its id, or a button.
	 *
	 * @param string $id      The control's id.
	 * @param array  $control The control.
	 * @return string
	 */
	private static function control( string $id, array $control ): string {
		if ( is_callable( $control['render'] ) ) {
			$tags = new WP_HTML_Tag_Processor( (string) call_user_func( $control['render'], $id ) );
			if ( ! $tags->next_tag() ) {
				return '';
			}
			$tags->set_attribute( 'data-riff-control', $id );
			$tags->set_attribute( 'data-riff-order', (string) $control['order'] );
			if ( $control['wide'] ) {
				$tags->add_class( 'riff-desk' );
			}
			return $tags->get_updated_html();
		}
		return sprintf(
			'<button type="button" class="riff-btn riff-control riff-control-%1$s%2$s" data-riff-control="%1$s" data-riff-order="%5$d" aria-label="%3$s">%4$s</button>',
			esc_attr( $id ),
			$control['wide'] ? ' riff-desk' : '',
			esc_attr( (string) $control['label'] ),
			self::icon( (string) $control['icon'] ),
			(int) $control['order']
		);
	}

	/**
	 * A view's button in the bar, pressed while it is open.
	 *
	 * @param string $id   The view's id.
	 * @param array  $view The view.
	 * @return string
	 */
	private static function button( string $id, array $view ): string {
		return sprintf(
			'<button type="button" class="riff-btn riff-control riff-control-%1$s%2$s" data-riff-control="%1$s" data-riff-opens="%1$s" data-riff-order="%5$d" aria-label="%3$s" aria-pressed="false">%4$s</button>',
			esc_attr( $id ),
			$view['wide'] ? ' riff-desk' : '',
			esc_attr( (string) $view['label'] ),
			self::icon( (string) $view['icon'] ),
			(int) $view['order']
		);
	}

	/**
	 * Each view's chip, which opens it from Now Playing on a phone.
	 *
	 * @since 5.8.0
	 *
	 * @return string
	 */
	public static function chips(): string {
		$html = '';
		foreach ( self::views() as $id => $view ) {
			$html .= sprintf(
				'<button type="button" class="riff-chip riff-mobile" data-riff-chip="%1$s" data-riff-opens="%1$s" data-riff-order="%4$d" aria-pressed="false">%2$s<span>%3$s</span></button>',
				esc_attr( $id ),
				self::icon( (string) $view['icon'] ),
				esc_html( (string) $view['label'] ),
				(int) $view['order']
			);
		}
		return $html;
	}

	/**
	 * The regions of the screens that have their own: each takes Now Playing's stage while it shows.
	 *
	 * @since 5.8.0
	 *
	 * @return string
	 */
	public static function screens(): string {
		$html = '';
		foreach ( self::views( 'screen' ) as $id => $view ) {
			if ( $view['stage'] ) {
				continue;
			}
			$html .= sprintf(
				'<section class="riff-view riff-view-%1$s" data-riff-view="%1$s" aria-label="%2$s" tabindex="-1" hidden>%3$s</section>',
				esc_attr( $id ),
				esc_attr( (string) $view['label'] ),
				is_callable( $view['render'] ) ? (string) call_user_func( $view['render'], $id ) : ''
			);
		}
		return $html;
	}

	/**
	 * The panels beside the page, the sidebar's views among them: each is a panel wherever there is
	 * no sidebar to dock it in, and the player moves it into its row of the dock where there is.
	 *
	 * @since 5.8.0
	 * @since 6.12.0 The sidebar's views too.
	 *
	 * @return string
	 */
	public static function panels(): string {
		$html = '';
		foreach ( self::views() as $id => $view ) {
			if ( 'screen' === $view['place'] ) {
				continue;
			}
			$html .= sprintf(
				'<div class="riff-panel riff-panel-%1$s" data-riff-panel="%1$s" data-riff-label="%2$s" hidden>%3$s</div>',
				esc_attr( $id ),
				esc_attr( (string) $view['label'] ),
				is_callable( $view['render'] ) ? (string) call_user_func( $view['render'], $id ) : ''
			);
		}
		return $html;
	}

	/**
	 * The dock in the Listen app's sidebar: a row for each view registered for the sidebar, its
	 * icon and name a button that opens and closes it beneath, as a disclosure does, so the
	 * listener keeps browsing beside it. The rows are drawn with the sidebar, before any script, so
	 * nothing moves as the player arrives; each starts closed, and the player moves the view's
	 * panel into its row as it opens. Drawn with no rows when no view is registered for the sidebar,
	 * for one a script adds (`window.riff.view()`), and unseen while it has none to show.
	 *
	 * @since 6.12.0
	 *
	 * @return string
	 */
	public static function dock(): string {
		$rows = '';
		foreach ( self::views( 'sidebar' ) as $id => $view ) {
			$rows .= sprintf(
				'<div class="riff-dock-item" data-riff-dock-item="%1$s" data-riff-order="%4$d"><h2 class="riff-dock-head"><button type="button" class="riff-dock-toggle" id="riff-dock-toggle-%1$s" data-riff-dock-opens="%1$s" aria-expanded="false" aria-controls="riff-dock-body-%1$s">%2$s<span class="riff-dock-label">%3$s</span></button></h2><div class="riff-dock-body" id="riff-dock-body-%1$s" role="region" aria-labelledby="riff-dock-toggle-%1$s" hidden></div></div>',
				esc_attr( $id ),
				self::icon( (string) $view['icon'] ),
				esc_html( (string) $view['label'] ),
				(int) $view['order']
			);
		}
		return '<div class="riff-dock" data-riff-dock>' . $rows . '</div>';
	}

	/**
	 * What the player's script needs of each view, its place and whether it is the stage, and the
	 * key of each shortcut.
	 *
	 * @since 5.8.0
	 *
	 * @param array $data The player's data.
	 * @return array
	 */
	public static function player_data( $data ) {
		if ( ! is_array( $data ) ) {
			return $data;
		}
		$data['views'] = array();
		foreach ( self::views() as $id => $view ) {
			$data['views'][ $id ] = array(
				'label' => (string) $view['label'],
				'place' => $view['place'],
				'stage' => (bool) $view['stage'],
			);
		}
		$data['keys'] = array();
		foreach ( self::shortcuts() as $id => $shortcut ) {
			$data['keys'][ $id ] = $shortcut['key'];
		}
		return $data;
	}

	/**
	 * Enqueues the script modules the controls and views name.
	 *
	 * @since 5.8.0
	 */
	public static function enqueue(): void {
		foreach ( array_merge( self::controls(), self::views() ) as $item ) {
			if ( '' !== (string) $item['script'] ) {
				wp_enqueue_script_module( (string) $item['script'] );
			}
		}
	}
}
