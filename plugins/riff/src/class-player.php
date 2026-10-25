<?php
/**
 * The player on the front end: one script module, one stylesheet, and the markup in the footer.
 *
 * @since 4.0.0
 * @package Riff
 */

namespace Riff;

defined( 'ABSPATH' ) || exit;

/**
 * Front-end player.
 *
 * The player loads on every front-end page, not only pages with media, because a track started on
 * one page keeps its place when the listener moves to another.
 */
final class Player {

	/**
	 * The Listen app's modules under features/listen/app/, each registered as the script module
	 * `riff-app/<name>` and a dependency of `riff-app`, which imports them by those ids.
	 *
	 * @since 4.33.0
	 */
	public const APP_MODULES = array( 'helpers', 'addresses', 'fetch', 'cards', 'views', 'hearts', 'playlists', 'home', 'sidebar', 'install', 'desktop', 'search' );

	/**
	 * The player's sections under assets/player/: the modules riff.js imports as it starts, each
	 * registered as the script module `riff-player/<name>`.
	 *
	 * @since 4.33.0
	 */
	public const PLAYER_SECTIONS = array( 'helpers', 'state', 'media', 'rows', 'resume', 'queue', 'playback', 'account', 'paint', 'menu', 'seek', 'now-playing', 'controls', 'keyboard' );

	/**
	 * The player's optional features under assets/player/, imported when first needed.
	 *
	 * @since 4.33.0
	 */
	public const PLAYER_FEATURES = array( 'filament', 'gestures', 'session', 'cast', 'share', 'wake-lock' );

	/**
	 * Hooks the assets and the markup.
	 *
	 * @since 4.0.0
	 */
	public static function register(): void {
		add_action( 'wp_enqueue_scripts', array( self::class, 'enqueue' ) );
		add_action( 'wp_footer', array( self::class, 'markup' ), 5 );
	}

	/**
	 * Whether the player belongs on this request.
	 *
	 * @since 4.0.0
	 * @return bool
	 */
	public static function enabled(): bool {
		$enabled = ! is_admin() && ! is_feed() && ! is_embed();
		/**
		 * Filters whether Riff's player loads on the current front-end request.
		 *
		 * @since 4.0.0
		 * @param bool $enabled Whether to load the player.
		 */
		return (bool) apply_filters( 'riff_enabled', $enabled );
	}

	/**
	 * Registers the stylesheets: one per surface, each loaded only where it applies, in a chain
	 * so the cascade keeps its order.
	 *
	 * The design tokens are their own stylesheet, riff-tokens, which Riff's extensions list as a
	 * dependency rather than copying values. The player's own, riff, is on every page; the Listen
	 * app's only on the page that holds the block; standalone mode's and the desktop frame's only
	 * under app/.
	 *
	 * @since 4.33.0
	 */
	public static function styles(): void {
		if ( wp_style_is( 'riff-desktop', 'registered' ) ) {
			return;
		}
		wp_register_style( 'riff-tokens', RIFF_URL . 'assets/tokens.css', array(), self::version( 'assets/tokens.css' ) );
		wp_register_style( 'riff', RIFF_URL . 'assets/riff.css', array( 'riff-tokens' ), self::version( 'assets/riff.css' ) );
		wp_register_style( 'riff-app', RIFF_URL . 'features/listen/app.css', array( 'riff' ), self::version( 'features/listen/app.css' ) );
		wp_register_style( 'riff-standalone', RIFF_URL . 'features/listen/standalone.css', array( 'riff-app' ), self::version( 'features/listen/standalone.css' ) );
		wp_register_style( 'riff-desktop', RIFF_URL . 'features/listen/desktop.css', array( 'riff-standalone' ), self::version( 'features/listen/desktop.css' ) );
	}

	/**
	 * Whether the request is for a Listen page: the block in the page, the Listen template, or
	 * standalone mode. There the app is the content; elsewhere the player waits at the foot of
	 * the page.
	 *
	 * @since 4.33.0
	 * @return bool
	 */
	public static function listen_page(): bool {
		if ( Listen\Standalone::active() ) {
			return true;
		}
		$page = is_singular() ? get_queried_object() : null;
		return $page instanceof \WP_Post && Listen\Standalone::holds_player( $page );
	}

	/**
	 * Enqueues the stylesheets and the script module.
	 *
	 * @since 4.0.0
	 */
	public static function enqueue(): void {
		if ( ! self::enabled() ) {
			return;
		}
		self::styles();
		$listen = self::listen_page();
		wp_enqueue_style( 'riff' );
		if ( $listen ) {
			wp_enqueue_style( 'riff-app' );
		}
		if ( Listen\Standalone::active() ) {
			wp_enqueue_style( 'riff-desktop' );
		}
		// wp.hooks is how a plugin's script listens to the player (see docs/javascript.md); the
		// module reads it from the window when it is there.
		wp_enqueue_script( 'wp-hooks' );
		// wp.a11y.speak() is how the player tells a screen reader what changed: the track, the
		// queue, a like. Its live regions are WordPress's, shared with anything else on the page.
		wp_enqueue_script( 'wp-a11y' );
		// The modules' strings are translated with wp.i18n, from the translations WordPress prints
		// for each module before it runs (wp_set_script_module_translations()). Core prints wp-i18n
		// itself when there are any; without them the modules show the English they are written in.
		// The Listen app is imported by riff.js on the page that holds the block. Registering it as
		// a dynamic dependency puts it on the page's map of modules, so its translations print too.
		// Its own modules, one per concern under features/listen/app/, are its static dependencies:
		// the import map names each by its id, which is how app.js imports them, core preloads them
		// with it, and each one's translations print as its own file from a language pack.
		$modules = array();
		foreach ( self::APP_MODULES as $module ) {
			$id        = 'riff-app/' . $module;
			$modules[] = $id;
			wp_register_script_module( $id, RIFF_URL . "features/listen/app/{$module}.js", array(), self::version( "features/listen/app/{$module}.js" ) );
		}
		wp_register_script_module( 'riff-app', RIFF_URL . 'features/listen/app.js', $modules, self::version( 'features/listen/app.js' ) );
		// On a Listen page the module is the content. Elsewhere it is the bar at the foot of the
		// page, which can wait: fetched at low priority and printed in the footer, so it never
		// competes with the post's own images for the first paint.
		wp_enqueue_script_module(
			'riff',
			RIFF_URL . 'assets/riff.js',
			array_merge(
				self::player_modules(),
				array(
					array(
						'id'     => 'riff-app',
						'import' => 'dynamic',
					),
				)
			),
			self::version( 'assets/riff.js' ),
			array(
				'fetchpriority' => $listen ? 'auto' : 'low',
				'in_footer'     => ! $listen,
			)
		);
		// Set again by name: a module registered earlier in the request keeps its first arguments.
		wp_script_modules()->set_fetchpriority( 'riff', $listen ? 'auto' : 'low' );
		wp_script_modules()->set_in_footer( 'riff', ! $listen );
		wp_set_script_module_translations( 'riff', 'riff' );
		wp_set_script_module_translations( 'riff-app', 'riff' );
		foreach ( $modules as $id ) {
			wp_set_script_module_translations( $id, 'riff' );
		}
		foreach ( array_merge( self::PLAYER_SECTIONS, self::PLAYER_FEATURES ) as $module ) {
			wp_set_script_module_translations( 'riff-player/' . $module, 'riff' );
		}
	}

	/**
	 * Registers the player's modules under assets/player/ and lists them as riff.js's dependencies:
	 * the sections it imports as it starts, which the page preloads with it, and the features it
	 * imports when first needed (the filament, gestures, the lock screen, Cast, sharing, the wake
	 * lock), which the import map names so a dynamic import finds them.
	 *
	 * @since 4.33.0
	 *
	 * @return array[] Dependencies, as wp_enqueue_script_module() takes them.
	 */
	private static function player_modules(): array {
		$deps   = array();
		$groups = array(
			'static'  => self::PLAYER_SECTIONS,
			'dynamic' => self::PLAYER_FEATURES,
		);
		foreach ( $groups as $import => $modules ) {
			foreach ( $modules as $module ) {
				$id = 'riff-player/' . $module;
				wp_register_script_module( $id, RIFF_URL . "assets/player/{$module}.js", array(), self::version( "assets/player/{$module}.js" ) );
				$deps[] = array(
					'id'     => $id,
					'import' => $import,
				);
			}
		}
		return $deps;
	}

	/**
	 * The cache key for an asset: the plugin version and the file's own time, so an edit shows up
	 * without waiting for a release or clearing the browser's cache. One stat per asset per page.
	 *
	 * @since 4.0.0
	 * @param string $file Path relative to the plugin folder.
	 * @return string
	 */
	public static function version( string $file ): string {
		$time = filemtime( RIFF_DIR . $file );
		return $time ? RIFF_VERSION . '.' . $time : RIFF_VERSION;
	}

	/**
	 * Prints the player and the data the script needs.
	 *
	 * @since 4.0.0
	 */
	public static function markup(): void {
		if ( ! self::enabled() ) {
			return;
		}
		$data = array(
			'assets'     => array(),
			// Where the player's cookie applies: the site's own path, as WordPress's cookies use.
			'cookiePath' => COOKIEPATH,
		);
		// What Riff's own features add for the script: the Listen app's address, and the listener's
		// likes and playlists.
		$data = Playlists_Rest::player_data( Likes_Rest::player_data( Listen\Art::player_data( $data ) ) );
		printf(
			'<script type="application/json" id="riff-data">%s</script>',
			wp_json_encode( $data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE )
		);
		/**
		 * Fires before the player's markup.
		 *
		 * @since 4.0.0
		 */
		do_action( 'riff_before_player' );
		require RIFF_DIR . 'templates/player.php';
	}

	/**
	 * The chips under Now Playing's controls, each keyed by a slug with a `label`, an `action` (the
	 * data-riff-action the player handles) and an `icon` from Player::icon().
	 *
	 * @since 4.0.0
	 *
	 * @return array[]
	 */
	public static function chips(): array {
		return array(
			'share' => array(
				'label'  => __( 'Share', 'riff' ),
				'icon'   => 'share',
				'action' => 'share',
			),
		);
	}

	/**
	 * The tabs beside Now Playing: Up next first, then any a plugin adds. Each tab has a panel the
	 * player shows when the tab is picked; a plugin fills its own panel when the `riff.tab` action
	 * fires in JavaScript. On a phone the tabs show in the open Up next sheet once there is more
	 * than one.
	 *
	 * @since 4.16.0
	 *
	 * @return array[] Tabs keyed by slug, each with a label.
	 */
	public static function tabs(): array {
		$tabs = array(
			'queue' => array( 'label' => __( 'Up next', 'riff' ) ),
		);
		/**
		 * Filters the tabs beside Now Playing. Add a tab by slug with a label; its panel is
		 * `[data-riff-panel="<slug>"]`, empty until your script fills it. Up next, `queue`, always
		 * comes first and cannot be removed.
		 *
		 * @since 4.16.0
		 *
		 * @param array[] $tabs Tabs keyed by slug, each with a label.
		 */
		$filtered = (array) apply_filters( 'riff_now_playing_tabs', $tabs );
		foreach ( $filtered as $slug => $tab ) {
			$slug = sanitize_key( (string) $slug );
			if ( '' === $slug || 'queue' === $slug || ! is_array( $tab ) || empty( $tab['label'] ) || ! is_string( $tab['label'] ) ) {
				continue;
			}
			$tabs[ $slug ] = array( 'label' => $tab['label'] );
		}
		return $tabs;
	}

	/**
	 * Renders one chip.
	 *
	 * @since 4.0.0
	 *
	 * @param string $slug      Slug.
	 * @param array  $item      Item, as chips() gives it.
	 * @param string $css_class Class for the element.
	 * @return string
	 */
	public static function control( string $slug, array $item, string $css_class ): string {
		return sprintf(
			'<button type="button" class="%s" data-riff-action="%s" data-riff-chip="%s">%s<span>%s</span></button>',
			esc_attr( $css_class ),
			esc_attr( (string) $item['action'] ),
			esc_attr( $slug ),
			self::icon( (string) $item['icon'] ),
			esc_html( (string) $item['label'] )
		);
	}

	/**
	 * The inline style on the player's root: the accent a theme sets in theme.json under
	 * settings.custom.riff.accent, or nothing.
	 *
	 * @since 4.0.0
	 *
	 * @return string A style attribute with a leading space, or an empty string.
	 */
	public static function root_style(): string {
		$custom = wp_get_global_settings( array( 'custom', 'riff' ) );
		$accent = is_array( $custom ) && ! empty( $custom['accent'] ) ? sanitize_text_field( (string) $custom['accent'] ) : '';
		if ( '' === $accent || ! preg_match( '/^[#a-z0-9(),.% -]+$/i', $accent ) ) {
			return '';
		}
		return ' style="--riff-accent: ' . esc_attr( $accent ) . '"';
	}

	/**
	 * A heart's two icons, the outline and the filled one. The stylesheet shows one by the
	 * button's aria-pressed, the same way the player's script draws a row's heart.
	 *
	 * @since 4.20.0
	 *
	 * @return string
	 */
	public static function hearts(): string {
		return str_replace( '<svg ', '<svg class="riff-heart-off" ', self::icon( 'heart' ) ) . str_replace( '<svg ', '<svg class="riff-heart-on" ', self::icon( 'hearted' ) );
	}

	/**
	 * Inline SVG icon, from Google's Material Icons (Apache License 2.0), the set Google's own apps are drawn in.
	 *
	 * @since 4.0.0
	 * @param string $name Icon name.
	 * @return string
	 */
	public static function icon( string $name ): string {
		$paths = array(
			'play'      => '<path d="M8 5v14l11-7z"/>',
			'pause'     => '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>',
			'prev'      => '<path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>',
			'next'      => '<path d="m6 18 8.5-6L6 6v12zM16 6v12h2V6h-2z"/>',
			'repeat'    => '<path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>',
			'repeatOne' => '<path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z"/>',
			'shuffle'   => '<path d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>',
			'down'      => '<path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>',
			'caret'     => '<path d="m7 14 5-5 5 5z"/>',
			'keyboard'  => '<path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"/>',
			'cast'      => '<path d="M21 3H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z"/>',
			'song'      => '<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>',
			'video'     => '<path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM9.5 16.5v-9l7 4.5-7 4.5z"/>',
			'volume'    => '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>',
			'share'     => '<path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
			'heart'     => '<path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/>',
			'hearted'   => '<path d="m12 21.35-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>',
		);

		return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">' . ( $paths[ $name ] ?? '' ) . '</svg>';
	}
}
