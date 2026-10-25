<?php
/**
 * Standalone mode: the Listen page as a player of its own at /listen/app/, outside the theme.
 *
 * @since 4.17.0
 * @package Riff
 */

namespace Riff\Listen;

use WP_Post;

defined( 'ABSPATH' ) || exit;

/**
 * Standalone mode.
 *
 * Any page that holds the Riff block, or uses the Listen template, gets a second address, its own
 * address plus app/, where the block renders in a document of Riff's own: Riff's dark look, none of
 * the theme's markup, styles or scripts, and a web app manifest, so a browser can install it and
 * the desktop app can load it. It is still WordPress: the visitor's login, the REST routes, and
 * other plugins' hooks on wp_head and wp_footer all work as on any page.
 */
final class Standalone {

	/**
	 * The endpoint added to the Listen page's address.
	 *
	 * @since 4.17.0
	 */
	public const ENDPOINT = 'app';

	/**
	 * The query variable behind the endpoint, for a site without pretty permalinks.
	 *
	 * @since 4.17.0
	 */
	public const QUERY = 'riff_app';

	/**
	 * The endpoint value that serves the web app manifest.
	 *
	 * @since 4.17.0
	 */
	public const MANIFEST = 'manifest';

	/**
	 * Option noting which version last added the endpoint to the rewrite rules.
	 *
	 * @since 4.17.0
	 */
	public const REWRITE = 'riff_rewrite';

	/**
	 * The background of the standalone player.
	 *
	 * @since 4.17.0
	 */
	public const BACKGROUND = '#030303';

	/**
	 * Hooks the endpoint, the manifest and the template.
	 *
	 * @since 4.17.0
	 */
	public static function register(): void {
		add_action( 'init', array( self::class, 'endpoint' ) );
		add_action( 'template_redirect', array( self::class, 'no_admin_bar' ), -1 );
		add_action( 'template_redirect', array( self::class, 'manifest' ) );
		add_filter( 'template_include', array( self::class, 'template' ), 99 );
	}

	/**
	 * Adds app/ to every page's address, and refreshes the rewrite rules once per version.
	 *
	 * @since 4.17.0
	 */
	public static function endpoint(): void {
		add_rewrite_endpoint( self::ENDPOINT, EP_PAGES, self::QUERY );
		// Not while WordPress installs: there are no tables to keep the rules in yet.
		if ( ! wp_installing() && get_option( self::REWRITE ) !== RIFF_VERSION ) {
			flush_rewrite_rules( false );
			update_option( self::REWRITE, RIFF_VERSION, true );
		}
	}

	/**
	 * Whether this request is standalone mode: the endpoint on a page that holds the player.
	 *
	 * @since 4.17.0
	 *
	 * @return bool
	 */
	public static function active(): bool {
		global $wp;
		if ( ! is_page() || ! isset( $wp->query_vars[ self::QUERY ] ) ) {
			return false;
		}
		$page = get_queried_object();
		return $page instanceof WP_Post && self::holds_player( $page );
	}

	/**
	 * Whether a page is a Listen page: the Riff block in its content, or the Listen template.
	 *
	 * @since 4.17.0
	 *
	 * @param WP_Post $page Page.
	 * @return bool
	 */
	public static function holds_player( WP_Post $page ): bool {
		return has_block( 'riff/app', $page ) || 'listen' === get_page_template_slug( $page );
	}

	/**
	 * The standalone address of a page.
	 *
	 * @since 4.17.0
	 *
	 * @param int  $page_id  Page ID; the queried page by default.
	 * @param bool $manifest The manifest's address instead.
	 * @return string
	 */
	public static function url( int $page_id = 0, bool $manifest = false ): string {
		$link = (string) get_permalink( $page_id ? $page_id : get_queried_object_id() );
		if ( get_option( 'permalink_structure' ) ) {
			return trailingslashit( $link ) . self::ENDPOINT . '/' . ( $manifest ? self::MANIFEST . '/' : '' );
		}
		return add_query_arg( self::QUERY, $manifest ? self::MANIFEST : '1', $link );
	}

	/**
	 * Keeps the admin bar out of the app, before WordPress sets it up for the page.
	 *
	 * @since 4.17.0
	 */
	public static function no_admin_bar(): void {
		if ( self::active() ) {
			add_filter( 'show_admin_bar', '__return_false' );
		}
	}

	/**
	 * Serves the web app manifest at app/manifest/.
	 *
	 * @since 4.17.0
	 */
	public static function manifest(): void {
		if ( ! self::active() || self::MANIFEST !== get_query_var( self::QUERY ) ) {
			return;
		}
		$manifest = self::manifest_data();
		status_header( 200 );
		header( 'Content-Type: application/manifest+json; charset=' . get_option( 'blog_charset' ) );
		echo wp_json_encode( $manifest, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT );
		exit;
	}

	/**
	 * The site icon's copy nearest a size, named by the size it really is: a site icon set without
	 * the Customizer's crop has no 192 pixel copy, and WordPress hands back the nearest, which a
	 * browser may skip if the manifest names it as something else.
	 *
	 * @since 5.2.3
	 *
	 * @param int $id   The site icon's attachment ID, or 0.
	 * @param int $size The size wanted, in pixels.
	 * @return array|null A manifest icon, or null when the site has no icon.
	 */
	private static function icon( int $id, int $size ): ?array {
		$meta = $id ? wp_get_attachment_metadata( $id ) : false;
		if ( ! is_array( $meta ) || empty( $meta['width'] ) ) {
			return null;
		}
		// The copy WordPress would serve, and its own dimensions from the metadata: what
		// image_get_intermediate_size() reports is scaled down to the size asked for.
		$copy   = image_get_intermediate_size( $id, array( $size, $size ) );
		$width  = (int) $meta['width'];
		$height = (int) $meta['height'];
		$url    = (string) wp_get_attachment_url( $id );
		foreach ( is_array( $copy ) ? (array) ( $meta['sizes'] ?? array() ) : array() as $made ) {
			if ( ( $made['file'] ?? '' ) === $copy['file'] ) {
				$width  = (int) $made['width'];
				$height = (int) $made['height'];
				$url    = (string) $copy['url'];
				break;
			}
		}
		return array(
			'src'   => $url,
			'sizes' => $width . 'x' . $height,
			'type'  => (string) get_post_mime_type( $id ),
		);
	}

	/**
	 * The web app manifest's members for the queried Listen page.
	 *
	 * @since 4.17.0
	 *
	 * @return array
	 */
	public static function manifest_data(): array {
		$name  = wp_strip_all_tags( (string) get_bloginfo( 'name' ) );
		$start = self::url();
		$icons = array();
		foreach ( array( 192, 512 ) as $size ) {
			$site    = self::icon( (int) get_option( 'site_icon' ), $size );
			$icons[] = $site ? $site : array(
				'src'   => RIFF_URL . 'features/listen/icons/icon-' . $size . '.png',
				'sizes' => $size . 'x' . $size,
				'type'  => 'image/png',
			);
		}
		$icons    = array_values( array_unique( $icons, SORT_REGULAR ) );
		$manifest = array(
			'id'               => $start,
			'name'             => '' !== $name ? $name : 'Riff',
			'short_name'       => '' !== $name ? $name : 'Riff',
			'description'      => wp_strip_all_tags( (string) get_bloginfo( 'description' ) ),
			'start_url'        => $start,
			'scope'            => $start,
			// Installed from Chrome or Edge on a computer, the window has no title bar and the app's
			// own strip runs around the window's controls, as the desktop app's does.
			'display_override' => array( 'window-controls-overlay' ),
			'display'          => 'standalone',
			'background_color' => self::BACKGROUND,
			'theme_color'      => self::BACKGROUND,
			'icons'            => $icons,
		);
		return $manifest;
	}

	/**
	 * The card that offers to install the app, under the sidebar's library: the site's own icon and
	 * name, one line on why, and Install. It starts hidden; app.js shows it from a listener's second
	 * visit where the browser can install the page, and keeps it away once it is installed or
	 * dismissed. Where the browser has no prompt of its own (Safari), Install shows its steps.
	 *
	 * @since 4.25.0
	 *
	 * @return string
	 */
	public static function install_card(): string {
		$name = wp_strip_all_tags( (string) get_bloginfo( 'name' ) );
		$name = '' !== $name ? $name : 'Riff';
		$icon = get_site_icon_url( 192 );
		return sprintf(
			'<div class="riff-app-install" data-riff-install hidden><img class="riff-app-install-icon" src="%1$s" data-riff-fallback="%8$s" alt="" width="48" height="48" loading="lazy" decoding="async"><div class="riff-app-install-text"><p class="riff-app-install-title">%2$s</p><p>%3$s</p><p data-riff-install-how="mac" hidden>%4$s</p><p data-riff-install-how="ios" hidden>%5$s</p></div><button type="button" class="riff-pill riff-pill-solid" data-riff-app-action="install">%6$s</button><button type="button" class="riff-app-install-close" data-riff-app-action="install-dismiss" aria-label="%7$s"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button></div>',
			esc_url( $icon ? $icon : RIFF_URL . 'features/listen/icons/icon-192.png' ),
			/* translators: %s: the site's name. */
			esc_html( sprintf( __( 'Get the %s app', 'riff' ), $name ) ),
			esc_html__( 'Listen in its own window, with your media keys.', 'riff' ),
			esc_html__( 'In Safari, choose File, then Add to Dock.', 'riff' ),
			esc_html__( 'Tap Share, then Add to Home Screen.', 'riff' ),
			esc_html__( 'Install', 'riff' ),
			esc_attr__( 'Not now', 'riff' ),
			// The site icon's file can go missing while the setting remains; Riff's own icon stands in.
			esc_url( RIFF_URL . 'features/listen/icons/icon-192.png' )
		);
	}

	/**
	 * Swaps the theme's template for Riff's own document, and keeps the theme's assets out of it.
	 *
	 * @since 4.17.0
	 *
	 * @param string $template The template WordPress chose.
	 * @return string
	 */
	public static function template( $template ) {
		if ( ! self::active() ) {
			return $template;
		}
		add_filter( 'wp_preload_resources', array( self::class, 'preload' ) );
		add_action( 'wp_enqueue_scripts', array( self::class, 'strip' ), PHP_INT_MAX );
		// The document prints its own title and viewport. A block theme's template has core add
		// its own of each (locate_block_template()) before this runs, so those go too; a second
		// viewport, later in the head, would drop viewport-fit=cover and the safe-area insets.
		remove_action( 'wp_head', '_wp_render_title_tag', 1 );
		remove_action( 'wp_head', '_block_template_render_title_tag', 1 );
		remove_action( 'wp_head', '_block_template_viewport_meta_tag', 0 );
		return RIFF_DIR . 'templates/standalone.php';
	}

	/**
	 * Riff's own dark look, in place of the theme's colours and fonts.
	 *
	 * @since 4.17.0
	 *
	 * @return array<string, string>
	 */
	public static function tokens(): array {
		return array(
			'--riff-app-bg'           => self::BACKGROUND,
			'--riff-app-ink'          => '#ffffff',
			'--riff-app-accent'       => '#ffb020',
			'--riff-app-font'         => '"Riff Roboto", roboto, "Riff Roboto Fallback", system-ui, sans-serif',
			'--riff-app-heading-font' => '"Riff Roboto", roboto, "Riff Roboto Fallback", system-ui, sans-serif',
		);
	}

	/**
	 * Fetches Roboto with the page rather than after the stylesheet asks for it, so the text is
	 * drawn in it from the start more often than not. The address is the one riff.css names.
	 *
	 * @since 4.21.0
	 *
	 * @param array $resources Resources WordPress preloads.
	 * @return array
	 */
	public static function preload( $resources ): array {
		$resources   = is_array( $resources ) ? $resources : array();
		$resources[] = array(
			'href'        => RIFF_URL . 'assets/fonts/roboto/roboto.woff2',
			'as'          => 'font',
			'type'        => 'font/woff2',
			'crossorigin' => 'anonymous',
		);
		return $resources;
	}

	/**
	 * Dequeues what the theme and the block styles bring, leaving Riff's and other plugins' own.
	 *
	 * @since 4.17.0
	 */
	public static function strip(): void {
		$themes = wp_normalize_path( get_theme_root() );
		$roots  = array( get_theme_root_uri(), $themes );
		$block  = array( 'global-styles', 'wp-block-library', 'wp-block-library-theme', 'classic-theme-styles', 'core-block-supports', 'core-block-supports-duotone' );
		foreach ( array( wp_styles(), wp_scripts() ) as $assets ) {
			foreach ( (array) $assets->queue as $handle ) {
				$src   = (string) ( $assets->registered[ $handle ]->src ?? '' );
				$theme = '' !== $src && ( str_contains( $src, '/themes/' ) || array_filter( $roots, static fn( $root ) => '' !== $root && str_starts_with( $src, $root ) ) );
				if ( $theme || in_array( $handle, $block, true ) ) {
					$assets->dequeue( $handle );
				}
			}
		}
		remove_action( 'wp_footer', 'wp_enqueue_global_styles', 1 );
		remove_action( 'wp_head', 'wp_print_font_faces', 50 );
	}
}
