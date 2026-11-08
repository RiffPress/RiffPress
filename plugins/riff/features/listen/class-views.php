<?php
/**
 * The Listen app's views: Riff's own and any a plugin adds, each at the app's address with
 * ?riff_view=<slug>.
 *
 * @since 6.4.0
 * @package Riff
 */

namespace Riff\Listen;

use Riff\Registry;

defined( 'ABSPATH' ) || exit;

/**
 * The views of the Listen app, as the riff_app_views filter leaves them.
 *
 * Riff's own are Home, Search, Albums, Artists, Tracks, Posts and Library. A plugin adds one of its
 * own with a render callback, and Riff draws it as it draws its own: under the app's bar, with its
 * title, in the view's panel, reached by in-page navigation, with the riff.app_view action and the
 * riff:app_view event once it shows. A plugin can take Albums, Artists, Tracks or Posts away; Home,
 * Search and Library are where the app's tabs go on a phone, and stay.
 */
final class Views {

	/**
	 * Riff's own views that a plugin cannot take away.
	 *
	 * @since 6.4.0
	 */
	public const KEPT = array( 'home', 'search', 'library' );

	/**
	 * Names a view cannot take: the addresses of Riff's own pages within the app.
	 *
	 * @since 6.4.0
	 */
	public const RESERVED = array( 'album', 'artist', 'playlist', 'post' );

	/**
	 * Hooks in.
	 *
	 * @since 6.4.0
	 */
	public static function register(): void {
		add_action( 'wp_enqueue_scripts', array( self::class, 'enqueue' ), 20 );
	}

	/**
	 * Riff's own views, in the order the app shows them.
	 *
	 * @return array<string, array>
	 */
	private static function own(): array {
		$own   = array(
			'home'    => array( __( 'Home', 'riff' ), 'home' ),
			'search'  => array( __( 'Search', 'riff' ), 'search' ),
			'albums'  => array( __( 'Albums', 'riff' ), 'record' ),
			'artists' => array( __( 'Artists', 'riff' ), 'person' ),
			'tracks'  => array( __( 'Tracks', 'riff' ), 'queue' ),
			'posts'   => array( __( 'Posts', 'riff' ), 'posts' ),
			'library' => array( __( 'Library', 'riff' ), 'albums' ),
		);
		$views = array();
		foreach ( $own as $slug => list( $label, $icon ) ) {
			$views[ $slug ] = array(
				'label' => $label,
				'icon'  => $icon,
				'nav'   => array( 'sidebar' ),
				'own'   => true,
			);
		}
		return $views;
	}

	/**
	 * Every view the current visitor may see, by slug, in order: Library last.
	 *
	 * @since 6.4.0
	 *
	 * @return array<string, array{label: string, title: string, icon: string, nav: string[], capability: string, render: callable|null, script: string[], style: string[], module: string[], own: bool}>
	 */
	public static function all(): array {
		$own = self::own();
		/**
		 * Filters the Listen app's views: Riff's own, by slug (`home`, `search`, `albums`,
		 * `artists`, `tracks`, `posts` and `library`), and any a plugin adds.
		 *
		 * A plugin adds a view under a slug of its own, lowercase letters, digits and dashes, with a
		 * `label` and a `render` callback, and Riff serves it at the app's address with
		 * `?riff_view=<slug>`, the Listen page's own or, where the site opens the app at its
		 * address, the site's. Riff draws the view's title and the panel around what `render`
		 * returns, and once the view shows, on arrival or after in-page navigation, fires the
		 * `riff.app_view` action and the `riff:app_view` event on `document`, for the plugin's
		 * script to bind to what it drew.
		 *
		 * A view of a plugin's is an array with a `label`, its name in the navigation; `title`, its
		 * heading, the label by default; `icon`, one of Riff's icons by name or SVG markup from the
		 * plugin's own code; `nav`, where it is listed, `sidebar` (beside Albums, Artists and
		 * Tracks, a chip on a phone) and or `account` (the account menu), sidebar by default;
		 * `capability`, what a visitor needs to see it at all, none by default; `render`, given the
		 * app's address and returning the panel's HTML, escaped by the plugin; and `script`,
		 * `style` and `module`, handles of the plugin's registered scripts, styles and script
		 * modules, which Riff enqueues on the page that holds the app.
		 *
		 * Unsetting `albums`, `artists`, `tracks` or `posts` takes it out of the app: out of the
		 * navigation, out of Home's rows, and its address opens Home. Home, Search and Library stay.
		 *
		 * @since 6.4.0
		 *
		 * @param array $views The views by slug, Riff's own first.
		 */
		$filtered = apply_filters( 'riff_app_views', $own );
		$filtered = is_array( $filtered ) ? $filtered : $own;
		foreach ( self::KEPT as $slug ) {
			if ( ! isset( $filtered[ $slug ] ) ) {
				$filtered[ $slug ] = $own[ $slug ];
			}
		}
		$views = array();
		foreach ( $filtered as $slug => $view ) {
			if ( ! is_string( $slug ) || ! is_array( $view ) || ! preg_match( '/^[a-z0-9-]+$/', $slug ) || in_array( $slug, self::RESERVED, true ) ) {
				continue;
			}
			$mine = isset( $own[ $slug ] );
			if ( ! $mine && ( ! isset( $view['render'] ) || ! is_callable( $view['render'] ) ) ) {
				continue;
			}
			$label = isset( $view['label'] ) && is_string( $view['label'] ) && '' !== $view['label'] ? $view['label'] : ( $mine ? $own[ $slug ]['label'] : $slug );
			$cap   = isset( $view['capability'] ) && is_string( $view['capability'] ) ? $view['capability'] : '';
			if ( '' !== $cap && ! current_user_can( $cap ) ) {
				continue;
			}
			$list           = static fn( $value ): array => array_values( array_filter( (array) $value, 'is_string' ) );
			$views[ $slug ] = array(
				'label'      => $label,
				'title'      => isset( $view['title'] ) && is_string( $view['title'] ) && '' !== $view['title'] ? $view['title'] : $label,
				'icon'       => isset( $view['icon'] ) && is_string( $view['icon'] ) ? $view['icon'] : '',
				'nav'        => array_values( array_intersect( array( 'sidebar', 'account' ), $list( $view['nav'] ?? array( 'sidebar' ) ) ) ),
				'capability' => $cap,
				'render'     => $mine ? null : $view['render'],
				'script'     => $list( $view['script'] ?? array() ),
				'style'      => $list( $view['style'] ?? array() ),
				'module'     => $list( $view['module'] ?? array() ),
				'own'        => $mine,
			);
		}
		// Library last, as the streaming apps have it: what is the listener's own, under the site's.
		$library = $views['library'];
		unset( $views['library'] );
		$views['library'] = $library;
		return $views;
	}

	/**
	 * One view the current visitor may see, or null.
	 *
	 * @since 6.4.0
	 *
	 * @param string $slug The view's slug.
	 * @return array|null
	 */
	public static function get( string $slug ): ?array {
		return self::all()[ $slug ] ?? null;
	}

	/**
	 * Whether the current visitor may see a view.
	 *
	 * @since 6.4.0
	 *
	 * @param string $slug The view's slug.
	 * @return bool
	 */
	public static function has( string $slug ): bool {
		return null !== self::get( $slug );
	}

	/**
	 * A view's icon: one of Riff's by name, or the plugin's SVG with only what an icon needs.
	 *
	 * @since 6.4.0
	 *
	 * @param array $view A view from all().
	 * @return string
	 */
	public static function icon( array $view ): string {
		return Registry::icon( (string) $view['icon'] );
	}

	/**
	 * A plugin's view, drawn as Riff draws its own: the title, then the panel around what its
	 * callback returned.
	 *
	 * @since 6.4.0
	 *
	 * @param string $slug The view's slug.
	 * @param string $page The app's address.
	 * @return string
	 */
	public static function render( string $slug, string $page ): string {
		$view = self::get( $slug );
		if ( ! $view || ! $view['render'] ) {
			return '';
		}
		return Ui::title( $view['title'] ) . sprintf( '<div class="riff-app-panel" data-riff-app-panel="%s">', esc_attr( $slug ) ) . (string) call_user_func( $view['render'], $page ) . '</div>';
	}

	/**
	 * The scripts, styles and modules of the views the visitor may see, on the page that holds
	 * the app, so each is there whichever view in-page navigation brings.
	 *
	 * @since 6.4.0
	 */
	public static function enqueue(): void {
		if ( ! \Riff\Player::enabled() || ! \Riff\Player::listen_page() ) {
			return;
		}
		foreach ( self::all() as $view ) {
			array_map( 'wp_enqueue_script', $view['script'] );
			array_map( 'wp_enqueue_style', $view['style'] );
			array_map( 'wp_enqueue_script_module', $view['module'] );
		}
	}
}
