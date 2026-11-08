<?php
/**
 * Following a link without leaving the page, so the music keeps playing.
 *
 * WordPress's Interactivity API router swaps a page's router regions for the next page's, fetched
 * in the background, and keeps everything outside them. Core ships the router and a module that
 * sends every same-site link through it (`@wordpress/interactivity-router/full-page`), but only
 * the regions a page marks are swapped. On a block theme the whole template is one element,
 * `.wp-site-blocks`, and the player is printed after it in the footer, so marking that element
 * one region swaps the page and leaves the bar, the queue and the one `<audio>` where they are.
 *
 * Off unless the site turns it on, under Settings › Riff or with the `riff_client_navigation`
 * filter: it changes how the whole site navigates, and the router keeps what is outside its regions
 * from the first page. Riff carries over the body's classes, the canonical and short addresses
 * and the admin bar's edit links (page()); the rest of the `<head>` stays, and a classic script
 * only a later page enqueues doesn't load, which a theme or a plugin may not expect. A Listen page
 * is always reached by loading it, since the app builds its own views.
 *
 * @package Riff
 */

namespace Riff;

defined( 'ABSPATH' ) || exit;

/**
 * Client-side navigation through the Interactivity API's router.
 *
 * @since 6.2.0
 */
final class Navigation {

	/**
	 * The router region the template becomes.
	 *
	 * @since 6.2.0
	 * @var string
	 */
	const REGION = 'riff/page';

	/**
	 * Option: whether links are followed without leaving the page.
	 *
	 * @since 6.5.0
	 * @var string
	 */
	const OPTION = 'riff_client_navigation';

	/**
	 * Hooks in.
	 *
	 * @since 6.2.0
	 */
	public static function register(): void {
		add_action( 'init', array( self::class, 'setting' ) );
		add_action( 'admin_init', array( self::class, 'field' ) );
		add_action( 'wp_enqueue_scripts', array( self::class, 'enqueue' ) );
		// Before core decides, at 1000, whether to open its template output buffer (core 6.9).
		add_action( 'wp_before_include_template', array( self::class, 'buffer' ) );
	}

	/**
	 * Asks core for its template output buffer, only on a request where navigation is on.
	 *
	 * Core opens the buffer for any page while a `wp_template_enhancement_output_buffer` filter is
	 * added, and a buffered page is sent only once it is whole, so a site that leaves navigation off
	 * keeps its pages streamed.
	 *
	 * @since 6.2.0
	 */
	public static function buffer(): void {
		if ( self::enabled() && ! Player::listen_page() ) {
			add_filter( 'wp_template_enhancement_output_buffer', array( self::class, 'region' ) );
		}
	}

	/**
	 * The setting, on Settings › Riff and in the REST settings route.
	 *
	 * @since 6.5.0
	 */
	public static function setting(): void {
		register_setting(
			Extensions::PAGE,
			self::OPTION,
			array(
				'type'              => 'boolean',
				'description'       => __( 'Whether a link on the site is followed without leaving the page, so the music keeps playing.', 'riff' ),
				'default'           => false,
				'sanitize_callback' => 'rest_sanitize_boolean',
				'show_in_rest'      => true,
			)
		);
	}

	/**
	 * The checkbox on Settings › Riff, in a section of its own.
	 *
	 * @since 6.5.0
	 */
	public static function field(): void {
		add_settings_section( 'riff-links', __( 'Links', 'riff' ), '__return_false', Extensions::PAGE );
		add_settings_field(
			self::OPTION,
			__( 'Music across links', 'riff' ),
			static function (): void {
				$saved = rest_sanitize_boolean( get_option( self::OPTION, false ) );
				$on    = self::chosen();
				if ( ! wp_is_block_theme() ) {
					$note = __( 'Only a block theme can: this theme loads each page outright, and the player picks the music up where it was.', 'riff' );
				} elseif ( $on !== $saved ) {
					$note = __( 'Set for this site by a plugin.', 'riff' );
				} else {
					$note = __( 'A link on the site brings the next page in without leaving this one, so what plays carries on. It changes how the whole site navigates: a script or style that only a later page asks for is not loaded, and a plugin that expects each page to load may not work.', 'riff' );
				}
				printf(
					'<label for="%1$s"><input name="%1$s" type="checkbox" id="%1$s" value="1"%2$s%3$s> %4$s</label><p class="description">%5$s</p>',
					esc_attr( self::OPTION ),
					checked( $on, true, false ),
					disabled( $on !== $saved, true, false ),
					esc_html__( 'Keep the music playing when a link is followed', 'riff' ),
					esc_html( $note )
				);
			},
			Extensions::PAGE,
			'riff-links'
		);
	}

	/**
	 * Whether the site has asked for it, from Settings › Riff and the filter, whatever its theme.
	 *
	 * @return bool
	 */
	private static function chosen(): bool {
		/**
		 * Filters whether a link on the site is followed without leaving the page, so what plays
		 * carries on. Only a block theme can: its template is the region that is swapped.
		 *
		 * A host turns it on for every site with
		 * `add_filter( 'riff_client_navigation', '__return_true' )`.
		 *
		 * @since 6.2.0
		 * @since 6.5.0 Its default is the Settings › Riff checkbox.
		 *
		 * @param bool $on Whether it is on, from Settings › Riff. Default false.
		 */
		return (bool) apply_filters( 'riff_client_navigation', rest_sanitize_boolean( get_option( self::OPTION, false ) ) );
	}

	/**
	 * Whether links are followed without leaving the page on this request.
	 *
	 * @since 6.2.0
	 * @return bool
	 */
	public static function enabled(): bool {
		return Player::enabled() && wp_is_block_theme() && function_exists( 'wp_interactivity_config' ) && self::chosen();
	}

	/**
	 * Loads core's link handler, or, on a Listen page, tells the router to load the page instead.
	 *
	 * @since 6.2.0
	 */
	public static function enqueue(): void {
		if ( ! self::enabled() ) {
			return;
		}
		if ( Player::listen_page() ) {
			// The router reads this from the page it fetched and loads that page outright. The
			// Interactivity API prints its config only where its module is on the page.
			wp_interactivity_config( 'core/router', array( 'clientNavigationDisabled' => true ) );
			wp_enqueue_script_module( '@wordpress/interactivity' );
			return;
		}
		wp_enqueue_script_module( '@wordpress/interactivity-router/full-page' );
	}

	/**
	 * Marks the template a router region.
	 *
	 * @since 6.2.0
	 *
	 * @param string $html The page.
	 * @return string
	 */
	public static function region( $html ) {
		if ( ! is_string( $html ) || ! self::enabled() || Player::listen_page() ) {
			return $html;
		}
		$p = new \WP_HTML_Tag_Processor( $html );
		while ( $p->next_tag( 'div' ) ) {
			if ( $p->has_class( 'wp-site-blocks' ) ) {
				$p->set_attribute( 'data-wp-interactive', self::REGION );
				$p->set_attribute( 'data-wp-router-region', self::REGION );
				$p->set_attribute( 'data-riff-page', (string) wp_json_encode( self::page( $html ) ) );
				return $p->get_updated_html();
			}
		}
		return $html;
	}

	/**
	 * What the page says outside its template and a site would miss after a link, which the router
	 * leaves as the first page had it: the body's classes, the canonical and short addresses, and
	 * the admin bar's links to edit this page. navigation.js puts them in place.
	 *
	 * @since 6.2.0
	 *
	 * @param string $html The page.
	 * @return array{body: string, canonical: string, shortlink: string, bar: array<string, string>}
	 */
	private static function page( string $html ): array {
		$page = array(
			'body'      => '',
			'canonical' => '',
			'shortlink' => '',
			'bar'       => array(),
		);
		$p    = new \WP_HTML_Tag_Processor( $html );
		while ( $p->next_tag() ) {
			if ( 'BODY' === $p->get_tag() ) {
				$page['body'] = (string) $p->get_attribute( 'class' );
				break;
			}
			$rel = 'LINK' === $p->get_tag() ? (string) $p->get_attribute( 'rel' ) : '';
			if ( 'canonical' === $rel || 'shortlink' === $rel ) {
				$page[ $rel ] = (string) $p->get_attribute( 'href' );
			}
		}
		$page['bar'] = self::bar_nodes( $html );
		return $page;
	}

	/**
	 * The admin bar's edit and template links, as the page printed them. Only from the bar itself,
	 * which core prints after the content, so a post's own markup is never taken for one.
	 *
	 * @param string $html The page.
	 * @return array<string, string>
	 */
	private static function bar_nodes( string $html ): array {
		$from = strrpos( $html, 'id="wpadminbar"' );
		if ( false === $from ) {
			return array();
		}
		$bar   = substr( $html, $from );
		$nodes = array();
		foreach ( array( 'edit', 'site-editor' ) as $node ) {
			if ( ! preg_match( '#<li\b[^>]*\bid=[\'"]wp-admin-bar-' . $node . '[\'"]#', $bar, $start, PREG_OFFSET_CAPTURE ) ) {
				continue;
			}
			// To the </li> that closes it, past any a plugin's menu under it holds.
			preg_match_all( '#</?li\b#', $bar, $tags, PREG_OFFSET_CAPTURE, $start[0][1] );
			$depth = 0;
			foreach ( $tags[0] as [ $tag, $at ] ) {
				$depth += '<li' === $tag ? 1 : -1;
				if ( 0 === $depth ) {
					$nodes[ $node ] = substr( $bar, $start[0][1], $at + 5 - $start[0][1] );
					break;
				}
			}
		}
		return $nodes;
	}

	/**
	 * Tells the player to make rows of each page the router brings in.
	 *
	 * @since 6.2.0
	 *
	 * @param array $data The player's data.
	 * @return array
	 */
	public static function player_data( array $data ): array {
		if ( self::enabled() && ! Player::listen_page() ) {
			$data['navigation'] = true;
		}
		return $data;
	}
}
