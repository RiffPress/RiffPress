<?php
/**
 * Following a link without leaving the page, so the music keeps playing (a spike).
 *
 * WordPress's Interactivity API router swaps a page's router regions for the next page's, fetched
 * in the background, and keeps everything outside them. Core ships the router and a module that
 * sends every same-site link through it (`@wordpress/interactivity-router/full-page`), but only
 * the regions a page marks are swapped. On a block theme the whole template is one element,
 * `.wp-site-blocks`, and the player is printed after it in the footer, so marking that element
 * one region swaps the page and leaves the bar, the queue and the one `<audio>` where they are.
 *
 * Off unless `riff_client_navigation` turns it on: the router keeps the page's `<head>`, its
 * classic scripts and the body's classes from the first page, which a theme or a plugin may not
 * expect. A Listen page is always reached by loading it, since the app builds its own views.
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
	 * Hooks in.
	 *
	 * @since 6.2.0
	 */
	public static function register(): void {
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
	 * Whether links are followed without leaving the page on this request.
	 *
	 * @since 6.2.0
	 * @return bool
	 */
	public static function enabled(): bool {
		$enabled = Player::enabled() && wp_is_block_theme() && function_exists( 'wp_interactivity_config' );
		/**
		 * Filters whether a link on the site is followed without leaving the page, so what plays
		 * carries on. Only a block theme can: its template is the region that is swapped.
		 *
		 * @since 6.2.0
		 *
		 * @param bool $on False by default.
		 */
		return $enabled && (bool) apply_filters( 'riff_client_navigation', false );
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
				return $p->get_updated_html();
			}
		}
		return $html;
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
