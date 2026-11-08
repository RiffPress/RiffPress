<?php
/**
 * The fonts the Listen app is drawn in, fetched with the page and kept on the device.
 *
 * @since 6.6.0
 * @package Riff
 */

namespace Riff\Listen;

use Riff\Player;
use WP_Post;

defined( 'ABSPATH' ) || exit;

/**
 * The faces the Listen app shows in its first paint, preloaded with the page, and what the
 * installed app's service worker keeps: those faces and Riff's stylesheets.
 *
 * Only a Listen page preloads anything. Elsewhere the bar is hidden until something plays, and the
 * player fetches Roboto while the page is idle (riff.js), so it is there by then.
 */
final class Fonts {

	/**
	 * Hooks the preloads.
	 *
	 * @since 6.6.0
	 */
	public static function register(): void {
		add_filter( 'wp_preload_resources', array( self::class, 'preload' ) );
	}

	/**
	 * The addresses of the fonts the queried Listen page draws in its first paint: Roboto in the
	 * app at app/, and, in the Listen block on the page, Inter and EB Garamond where neither the
	 * theme nor the block sets a font of its own.
	 *
	 * @since 6.6.0
	 *
	 * @return string[] Font addresses, as the stylesheets name them.
	 */
	public static function first_paint(): array {
		if ( ! Player::enabled() || ! Player::listen_page() ) {
			return array();
		}
		$fonts = RIFF_URL . 'assets/fonts/';
		if ( Standalone::active() ) {
			$urls = array( $fonts . 'roboto/roboto.woff2' );
		} else {
			$tokens = App::theme_tokens( self::block_attributes() );
			$urls   = array();
			if ( ! isset( $tokens['--riff-app-font'] ) ) {
				$urls[] = $fonts . 'inter/inter.woff2';
			}
			if ( ! isset( $tokens['--riff-app-heading-font'] ) ) {
				$urls[] = $fonts . 'eb-garamond/eb-garamond.woff2';
			}
		}
		/**
		 * Filters the fonts a Listen page preloads, the faces its first paint shows, so a host that
		 * draws the app in fonts of its own has them fetched with the page rather than after the
		 * stylesheet asks. The installed app's service worker keeps them on the device too.
		 *
		 * Each is preloaded with `crossorigin`, as a font must be, so an address on another host
		 * needs CORS. Name each exactly as the stylesheet's `url()` does, or the browser fetches it
		 * twice.
		 *
		 * @since 6.6.0
		 *
		 * @param string[] $urls Font addresses: Roboto in the app at app/, Inter and EB Garamond in
		 *                       the Listen block where the theme sets no font.
		 */
		$filtered = apply_filters( 'riff_app_preload_fonts', $urls );
		return array_values( array_unique( array_filter( is_array( $filtered ) ? $filtered : $urls, static fn( $url ) => is_string( $url ) && '' !== $url ) ) );
	}

	/**
	 * Preloads the first paint's fonts.
	 *
	 * @since 6.6.0
	 *
	 * @param array $resources Resources WordPress preloads.
	 * @return array
	 */
	public static function preload( $resources ): array {
		$resources = is_array( $resources ) ? $resources : array();
		foreach ( self::first_paint() as $url ) {
			$type        = self::type( $url );
			$resources[] = array_filter(
				array(
					'href'        => $url,
					'as'          => 'font',
					'type'        => $type,
					'crossorigin' => 'anonymous',
				)
			);
		}
		return $resources;
	}

	/**
	 * What the installed app's service worker keeps on the device: the first paint's fonts, Riff's
	 * stylesheets for the app and its script modules, at the addresses the page asks for them by.
	 * The page itself is not kept: it carries the listener's own data and a nonce.
	 *
	 * @since 6.6.0
	 *
	 * @return string[] Addresses.
	 */
	public static function precache(): array {
		Player::styles();
		$styles = wp_styles();
		$urls   = self::first_paint();
		foreach ( array( 'riff-tokens', 'riff', 'riff-app', 'riff-standalone', 'riff-frame' ) as $handle ) {
			$style = $styles->registered[ $handle ] ?? null;
			if ( ! $style || ! is_string( $style->src ) ) {
				continue;
			}
			// As WP_Styles::_css_href() builds it, so it is the address the page asks for.
			$src = $style->ver ? add_query_arg( 'ver', $style->ver, $style->src ) : $style->src;
			/** This filter is documented in wp-includes/class-wp-styles.php */
			// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- core's own filter, applied as core does.
			$urls[] = (string) apply_filters( 'style_loader_src', $src, $handle );
		}
		// The player's modules and the app's, as WP_Script_Modules::get_src() builds each address.
		$modules = array(
			'riff'     => 'assets/riff.js',
			'riff-app' => 'features/listen/app.js',
		);
		foreach ( array_merge( Player::PLAYER_SECTIONS, Player::PLAYER_FEATURES ) as $module ) {
			$modules[ 'riff-player/' . $module ] = "assets/player/{$module}.js";
		}
		foreach ( Player::APP_MODULES as $module ) {
			$modules[ 'riff-app/' . $module ] = "features/listen/app/{$module}.js";
		}
		foreach ( $modules as $id => $file ) {
			/** This filter is documented in wp-includes/class-wp-script-modules.php */
			// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- core's own filter, applied as core does.
			$urls[] = (string) apply_filters( 'script_module_loader_src', add_query_arg( 'ver', Player::version( $file ), RIFF_URL . $file ), $id );
		}
		/**
		 * Filters what the installed Listen app's service worker keeps on the device, so it is
		 * there offline and on every launch after the first: a host's fonts that the first paint
		 * doesn't show, say. The fonts `riff_app_preload_fonts` returns are already in it.
		 *
		 * Only these addresses are answered from the device; every other request goes to the
		 * network as before. An address on another host needs CORS. Return an empty array for no
		 * service worker at all.
		 *
		 * @since 6.6.0
		 *
		 * @param string[] $urls Addresses: the first paint's fonts, then Riff's stylesheets and its
		 *                       script modules.
		 */
		$filtered = apply_filters( 'riff_app_precache', $urls );
		return array_values( array_unique( array_filter( is_array( $filtered ) ? $filtered : $urls, static fn( $url ) => is_string( $url ) && '' !== $url ) ) );
	}

	/**
	 * A font file's media type, from its extension.
	 *
	 * @param string $url Font address.
	 * @return string The type, or an empty string when the extension is not a font's.
	 */
	private static function type( string $url ): string {
		$types = array(
			'woff2' => 'font/woff2',
			'woff'  => 'font/woff',
			'ttf'   => 'font/ttf',
			'otf'   => 'font/otf',
		);
		$ext   = strtolower( pathinfo( (string) wp_parse_url( $url, PHP_URL_PATH ), PATHINFO_EXTENSION ) );
		return $types[ $ext ] ?? '';
	}

	/**
	 * The attributes of the first Listen block in the queried page, which may set a font of its own.
	 *
	 * @return array
	 */
	private static function block_attributes(): array {
		$page = get_queried_object();
		if ( ! $page instanceof WP_Post || ! has_block( 'riff/app', $page ) ) {
			return array();
		}
		$find = static function ( array $blocks ) use ( &$find ): ?array {
			foreach ( $blocks as $block ) {
				if ( 'riff/app' === ( $block['blockName'] ?? '' ) ) {
					return (array) ( $block['attrs'] ?? array() );
				}
				$inner = $find( (array) ( $block['innerBlocks'] ?? array() ) );
				if ( null !== $inner ) {
					return $inner;
				}
			}
			return null;
		};
		return (array) $find( parse_blocks( $page->post_content ) );
	}
}
