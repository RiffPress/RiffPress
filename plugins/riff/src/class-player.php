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
	public const APP_MODULES = array( 'helpers', 'addresses', 'fetch', 'cards', 'views', 'hearts', 'playlists', 'home', 'sidebar', 'install', 'frame', 'search', 'rack', 'together' );

	/**
	 * The player's sections under assets/player/: the modules riff.js imports as it starts, each
	 * registered as the script module `riff-player/<name>`.
	 *
	 * @since 4.33.0
	 */
	public const PLAYER_SECTIONS = array( 'helpers', 'state', 'media', 'registry', 'rows', 'resume', 'queue', 'playback', 'account', 'paint', 'menu', 'seek', 'now-playing', 'controls', 'keyboard' );

	/**
	 * The player's optional features under assets/player/, imported when first needed.
	 *
	 * @since 4.33.0
	 */
	public const PLAYER_FEATURES = array( 'filament', 'gestures', 'session', 'cast', 'share', 'wake-lock', 'together', 'about', 'navigation' );

	/**
	 * Hooks the assets and the markup.
	 *
	 * @since 4.0.0
	 */
	public static function register(): void {
		add_action( 'wp_enqueue_scripts', array( self::class, 'enqueue' ) );
		add_action( 'wp_footer', array( self::class, 'markup' ), 5 );
		add_action( Registry::HOOK, array( self::class, 'own' ), 5 );
	}

	/**
	 * Riff's own controls and views, registered as any plugin's are: in the bar the heart, the
	 * badges (the format and bit rate, which Riff's own listeners fill), Play on another device and
	 * the volume; and the views, the album, which is the turntable where there is room, and Up next.
	 *
	 * @since 5.8.0
	 */
	public static function own(): void {
		Registry::register_control(
			'like',
			array(
				'label'  => __( 'Like', 'riff' ),
				'order'  => 10,
				'render' => static fn() => '<button type="button" class="riff-btn riff-like" data-riff-action="like" aria-label="' . esc_attr__( 'Like', 'riff' ) . '" aria-pressed="false" hidden>' . self::hearts() . '</button>',
			)
		);
		Registry::register_control(
			'badges',
			array(
				'label'  => __( 'Quality', 'riff' ),
				'order'  => 20,
				'wide'   => true,
				'render' => static fn() => '<span class="riff-area" data-riff-area="badges"></span>',
			)
		);
		Registry::register_control(
			'cast',
			array(
				'label'  => __( 'Play on another device', 'riff' ),
				'order'  => 60,
				'render' => static fn() => '<button type="button" class="riff-btn" data-riff-action="cast" aria-label="' . esc_attr__( 'Play on another device', 'riff' ) . '" hidden>' . self::icon( 'cast' ) . '</button>',
			)
		);
		Registry::register_control(
			'volume',
			array(
				'label'  => __( 'Volume', 'riff' ),
				'order'  => 70,
				'wide'   => true,
				'render' => static fn() => '<label class="riff-volume"><span class="riff-volume-pop"><input type="range" data-riff-volume min="0" max="100" step="1" value="100" aria-label="' . esc_attr__( 'Volume', 'riff' ) . '" aria-valuetext="' . esc_attr__( '100 percent', 'riff' ) . '"></span>' . self::icon( 'volume' ) . '</label>',
			)
		);
		// The album, what Now Playing opens to: the cover where Now Playing is portrait and the
		// turntable where it is landscape (now-playing.js). As the stage it has no button in the
		// bar, which opens it itself; its chip in Now Playing comes back to it from another view.
		Registry::register_view(
			'album',
			array(
				'label' => __( 'Album', 'riff' ),
				'icon'  => 'album',
				'order' => 26,
				'stage' => true,
				'wide'  => false,
			)
		);
		Registry::register_view(
			'queue',
			array(
				'label'  => __( 'Up next', 'riff' ),
				'icon'   => 'queue',
				'order'  => 40,
				'place'  => 'side',
				'render' => array( self::class, 'queue' ),
			)
		);
	}

	/**
	 * Up next's panel: where the queue plays from, and the queue.
	 *
	 * @since 5.8.0
	 *
	 * @return string
	 */
	public static function queue(): string {
		return '<header class="riff-queue-head"><div><p>' . esc_html__( 'Playing from', 'riff' ) . '</p><h3 data-riff-text="source"></h3></div>'
			. '<span class="riff-queue-modes"><button type="button" class="riff-btn" data-riff-action="shuffle" aria-label="' . esc_attr__( 'Shuffle', 'riff' ) . '" aria-pressed="false">' . self::icon( 'shuffle' ) . '</button>'
			. '<button type="button" class="riff-btn" data-riff-action="repeat" data-repeat="off" aria-label="' . esc_attr__( 'Repeat, off', 'riff' ) . '">' . self::icon( 'repeat' ) . self::icon( 'repeatOne' ) . '</button></span>'
			. '<button type="button" class="riff-queue-clear" data-riff-action="clear-queue" aria-label="' . esc_attr__( 'Clear the queue', 'riff' ) . '" hidden>' . esc_html__( 'Clear', 'riff' ) . '</button>'
			// On a phone only: what swiping the bar down does, as a button (WCAG 2.5.7). A computer has no such swipe.
			. '<button type="button" class="riff-queue-clear riff-mobile" data-riff-action="dismiss">' . esc_html__( 'Close player', 'riff' ) . '</button>'
			. '</header><ol class="riff-queue-list" id="riff-queue-list"></ol>';
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
	 * app's only on the page that holds the block; standalone mode's and the frame's only
	 * under app/.
	 *
	 * @since 4.33.0
	 */
	public static function styles(): void {
		if ( wp_style_is( 'riff-frame', 'registered' ) ) {
			return;
		}
		wp_register_style( 'riff-tokens', RIFF_URL . 'assets/tokens.css', array(), self::version( 'assets/tokens.css' ) );
		wp_register_style( 'riff', RIFF_URL . 'assets/riff.css', array( 'riff-tokens' ), self::version( 'assets/riff.css' ) );
		wp_register_style( 'riff-app', RIFF_URL . 'features/listen/app.css', array( 'riff' ), self::version( 'features/listen/app.css' ) );
		wp_register_style( 'riff-standalone', RIFF_URL . 'features/listen/standalone.css', array( 'riff-app' ), self::version( 'features/listen/standalone.css' ) );
		wp_register_style( 'riff-frame', RIFF_URL . 'features/listen/frame.css', array( 'riff-standalone' ), self::version( 'features/listen/frame.css' ) );
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
			wp_enqueue_style( 'riff-frame' );
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
			// The app's helpers pass on some of the player's own.
			$deps = 'helpers' === $module ? array( 'riff-player/helpers' ) : array();
			wp_register_script_module( $id, RIFF_URL . "features/listen/app/{$module}.js", $deps, self::version( "features/listen/app/{$module}.js" ) );
		}
		// Adding music is for someone who may upload, and only for them is it on the page's map.
		if ( current_user_can( 'upload_files' ) ) {
			wp_register_script_module( 'riff-app/import', RIFF_URL . 'features/listen/app/import.js', array(), self::version( 'features/listen/app/import.js' ) );
			wp_set_script_module_translations( 'riff-app/import', 'riff' );
			$modules[] = array(
				'id'     => 'riff-app/import',
				'import' => 'dynamic',
			);
		}
		wp_register_script_module( 'riff-app', RIFF_URL . 'features/listen/app.js', $modules, self::version( 'features/listen/app.js' ) );
		// On a Listen page the module is the content. Elsewhere it is the bar at the foot of the
		// page, which can wait: fetched at low priority and printed in the footer, so it never
		// competes with the post's own images for the first paint.
		// On a Listen page the app is a static dependency too, though riff.js still imports it
		// when it starts: core preloads it and its modules with the player's, in one wave, rather
		// than each wave asking only once the one before has run. Elsewhere it is never preloaded.
		wp_enqueue_script_module(
			'riff',
			RIFF_URL . 'assets/riff.js',
			array_merge(
				self::player_modules(),
				array(
					array(
						'id'     => 'riff-app',
						'import' => $listen ? 'static' : 'dynamic',
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
		foreach ( array_filter( $modules, 'is_string' ) as $id ) {
			wp_set_script_module_translations( $id, 'riff' );
		}
		foreach ( array_merge( self::PLAYER_SECTIONS, self::PLAYER_FEATURES ) as $module ) {
			wp_set_script_module_translations( 'riff-player/' . $module, 'riff' );
		}
		// The modules the registered controls and views name, which bring them to life.
		Registry::enqueue();
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
			// A post's tracks, which the record in Now Playing cuts its grooves from.
			'library'    => rest_url( 'riff/v1/library/' ),
		);
		if ( ! self::cover_accent() ) {
			$data['coverAccent'] = false;
		}
		// What Riff's own features add for the script: the Listen app's address, the listener's
		// likes and playlists, whether they have the single-key shortcuts, where they share what
		// they play, whether the site has turned the turntable off, the views registered, and where
		// the About panel finds a track's tags and its album's and artist's pages.
		$data = Navigation::player_data( About::player_data( Registry::player_data( Turntable::player_data( Listen\Together::player_data( Shortcuts::player_data( Playlists_Rest::player_data( Likes_Rest::player_data( Listen\Art::player_data( $data ) ) ) ) ) ) ) ) );
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
	 * Whether the player takes its accent from the cover of the track playing.
	 *
	 * @since 6.5.0
	 *
	 * @return bool
	 */
	public static function cover_accent(): bool {
		/**
		 * Filters whether the player takes its accent from the cover of the track playing: the
		 * cover's hue, muted and lightened until it reads on the player's dark surfaces, as
		 * `--riff-cover-accent`, on the seek bar, the playing bars, the current Up next item and a
		 * wash behind Now Playing, and in the Listen app's own document on its links, the track
		 * playing, Liked songs and the Browse tiles. A cover that is grey, near black or near
		 * white gives none, and the accent is the site's `--riff-accent`, as it is everywhere with
		 * this off.
		 *
		 * A host keeps its one accent everywhere with
		 * `add_filter( 'riff_cover_accent', '__return_false' )`.
		 *
		 * @since 6.5.0
		 *
		 * @param bool $on Default true.
		 */
		return (bool) apply_filters( 'riff_cover_accent', true );
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
		// Through a variable of its own, which tokens.css makes --riff-accent's default, so a host's
		// stylesheet that sets --riff-accent still wins over the theme's.
		return ' style="--riff-theme-accent: ' . esc_attr( $accent ) . '"';
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
	 * Inline SVG icon: WordPress's own where it has one (@wordpress/icons, GPL), and drawn to match it where it hasn't.
	 *
	 * @since 4.0.0
	 * @param string $name Icon name.
	 * @return string
	 */
	public static function icon( string $name ): string {
		$paths = array(
			'play'      => '<path d="M8.25 16.75L15.25 12L8.25 7.25L8.25 16.75Z" fill="currentColor"/>',
			'pause'     => '<path d="M7.75 7.25V16.75H9.25V7.25H7.75Z"/><path d="M14.75 7.25V16.75H16.25V7.25H14.75Z"/>',
			'prev'      => '<path d="M16.75 7.25L9.75 12L16.75 16.75V7.25Z" fill="currentColor"/><path d="M7 17.5V6.5"/>',
			'next'      => '<path d="M7.25 16.75L14.25 12L7.25 7.25L7.25 16.75Z" fill="currentColor"/><path d="M17 6.5L17 17.5"/>',
			'repeat'    => '<path d="M5.75 14.75L5.75 9C5.75 8.30964 6.30964 7.75 7 7.75L14 7.75M3 12L5.75 14.75L8.5 12M18.25 9.25L18.25 15C18.25 15.6904 17.6904 16.25 17 16.25L10 16.25M21 12L18.25 9.25L15.5 12"/>',
			'repeatOne' => '<path d="M5.75 14.75L5.75 9C5.75 8.30964 6.30964 7.75 7 7.75L14 7.75M3 12L5.75 14.75L8.5 12M18.25 9.25L18.25 15C18.25 15.6904 17.6904 16.25 17 16.25L10 16.25M21 12L18.25 9.25L15.5 12"/><path d="M11 10.75L12.25 10V14"/>',
			'shuffle'   => '<path d="M4 16H7.62409C9.01624 16 10.2253 15.0423 10.5442 13.6871L11.4558 9.81288C11.7747 8.45773 12.9839 7.5 14.376 7.5H19M16 10.5L19 7.5L16 4.5M4 7.5H9.5M12.5 16H19M16 13L19 16L16 19"/>',
			'down'      => '<path d="M7 11L12 15L17 11"/>',
			'caret'     => '<path d="M8.5 13.5L12 10.5L15.5 13.5"/>',
			'keyboard'  => '<path d="M6.5 9H8.5M8 15H16M6.5 12H8.5M9.5 9H11.5M9.5 12H11.5M12.5 9H14.5M12.5 12H14.5M15.5 9H17.5M15.5 12H17.5M5 18.25H19C19.6904 18.25 20.25 17.6904 20.25 17V7C20.25 6.30964 19.6904 5.75 19 5.75H5C4.30964 5.75 3.75 6.30964 3.75 7V17C3.75 17.6904 4.30964 18.25 5 18.25Z"/>',
			'cast'      => '<path d="M4.75 8V6C4.75 5.31 5.31 4.75 6 4.75H18C18.69 4.75 19.25 5.31 19.25 6V18C19.25 18.69 18.69 19.25 18 19.25H13.5"/><path d="M4.75 15.25C6.96 15.25 8.75 17.04 8.75 19.25M4.75 11.75C8.89 11.75 12.25 15.11 12.25 19.25"/><path d="M4.75 18.25A1 1 0 0 1 5.75 19.25H4.75V18.25Z" fill="currentColor" stroke="none"/>',
			'song'      => '<path d="M13.25 16.5C13.25 18.0188 12.0188 19.25 10.5 19.25C8.98122 19.25 7.75 18.0188 7.75 16.5C7.75 14.9812 8.98122 13.75 10.5 13.75C12.0188 13.75 13.25 14.9812 13.25 16.5Z" fill="currentColor" stroke="none"/><path d="M10.5 19.25C12.0188 19.25 13.25 18.0188 13.25 16.5C13.25 14.9812 12.0188 13.75 10.5 13.75C8.98122 13.75 7.75 14.9812 7.75 16.5C7.75 18.0188 8.98122 19.25 10.5 19.25ZM10.5 19.25C13.4867 19.25 13.75 16.5 13.75 15.1379V7.99998C13.75 4.9108 16.4 5.00254 18 5.00233"/>',
			'video'     => '<path d="M10 15L15 12L10 9V15Z" fill="currentColor" stroke="none"/><path d="M4.75 6C4.75 5.30964 5.30964 4.75 6 4.75H18C18.6904 4.75 19.25 5.30964 19.25 6V18C19.25 18.6904 18.6904 19.25 18 19.25H6C5.30964 19.25 4.75 18.6904 4.75 18V6Z"/>',
			'captions'  => '<path d="M8 15.25H10M11 15.25H13M14 15.25H16M6 19.25H18C18.6904 19.25 19.25 18.6904 19.25 18V6C19.25 5.30964 18.6904 4.75 18 4.75H6C5.30964 4.75 4.75 5.30964 4.75 6V18C4.75 18.6904 5.30964 19.25 6 19.25Z"/>',
			'queue'     => '<path d="M15 10L20 10M15 15L20 15"/><path d="M11.25 16.5C11.25 18.0188 10.0188 19.25 8.5 19.25C6.98122 19.25 5.75 18.0188 5.75 16.5C5.75 14.9812 6.98122 13.75 8.5 13.75C10.0188 13.75 11.25 14.9812 11.25 16.5Z" fill="currentColor" stroke="none"/><path d="M8.5 19.25C10.0188 19.25 11.25 18.0188 11.25 16.5C11.25 14.9812 10.0188 13.75 8.5 13.75C6.98122 13.75 5.75 14.9812 5.75 16.5C5.75 18.0188 6.98122 19.25 8.5 19.25ZM8.5 19.25C11.4867 19.25 11.75 16.5 11.75 15.1379V7.99998C11.75 4.9108 14.4 5.00254 16 5.00233"/>',
			'close'     => '<path d="M5 19L19 5M19 19L5 5"/>',
			'volume'    => '<path d="M4.75 9.75V14.25H7.75L11.75 17.75V6.25L7.75 9.75H4.75Z"/><path d="M14.25 9.5C15.6 10.9 15.6 13.1 14.25 14.5M16.75 7C19.5 9.8 19.5 14.2 16.75 17"/>',
			'share'     => '<path d="M15.75 5.69118V7C15.75 7.13807 15.8619 7.25 16 7.25H18C18.1381 7.25 18.25 7.13807 18.25 7V5C18.25 4.86193 18.1381 4.75 18 4.75H16C15.8619 4.75 15.75 4.86193 15.75 5V5.69118ZM15.75 5.69118L8.25 11.4265M15.75 18.3088V19C15.75 19.1381 15.8619 19.25 16 19.25H18C18.1381 19.25 18.25 19.1381 18.25 19V17C18.25 16.8619 18.1381 16.75 18 16.75H16C15.8619 16.75 15.75 16.8619 15.75 17V18.3088ZM15.75 18.3088L8.25 12.5735M8.25 11.4265V11C8.25 10.8619 8.13807 10.75 8 10.75H6C5.86193 10.75 5.75 10.8619 5.75 11V13C5.75 13.1381 5.86193 13.25 6 13.25H8C8.13807 13.25 8.25 13.1381 8.25 13V12.5735M8.25 11.4265V12.5735"/>',
			'heart'     => '<path d="M12 18.75L5.9 12.6C4.2 10.9 4.2 8.2 5.9 6.6C7.5 5 10.2 5 11.9 6.7L12 6.8L12.1 6.7C13.8 5 16.5 5 18.1 6.6C19.8 8.2 19.8 10.9 18.1 12.6L12 18.75Z"/>',
			'album'     => '<path d="M6 4.75H18C18.69 4.75 19.25 5.31 19.25 6V18C19.25 18.69 18.69 19.25 18 19.25H6C5.31 19.25 4.75 18.69 4.75 18V6C4.75 5.31 5.31 4.75 6 4.75Z"/><path d="M12.75 14.5V8.25H15.75M12.75 14.5A1.75 1.75 0 1 1 11 12.75A1.75 1.75 0 0 1 12.75 14.5Z"/>',
			'group'     => '<path d="M4.5 17V15C4.5 13.8954 5.39543 13 6.5 13H10.5C11.6046 13 12.5 13.8954 12.5 15V17M15 13H17.5C18.6046 13 19.5 13.8954 19.5 15V17M10.25 8.5C10.25 9.4665 9.4665 10.25 8.5 10.25C7.5335 10.25 6.75 9.4665 6.75 8.5C6.75 7.5335 7.5335 6.75 8.5 6.75C9.4665 6.75 10.25 7.5335 10.25 8.5ZM17.25 8.5C17.25 9.4665 16.4665 10.25 15.5 10.25C14.5335 10.25 13.75 9.4665 13.75 8.5C13.75 7.5335 14.5335 6.75 15.5 6.75C16.4665 6.75 17.25 7.5335 17.25 8.5Z"/>',
			'info'      => '<path d="M12 16V11M12 9.5V8M19.25 12C19.25 16.0041 16.0041 19.25 12 19.25C7.99594 19.25 4.75 16.0041 4.75 12C4.75 7.99594 7.99594 4.75 12 4.75C16.0041 4.75 19.25 7.99594 19.25 12Z" stroke-linejoin="round"/>',
			'record'    => '<path d="M19.25 12C19.25 16 16 19.25 12 19.25C8 19.25 4.75 16 4.75 12C4.75 8 8 4.75 12 4.75C16 4.75 19.25 8 19.25 12Z"/><path d="M14 12A2 2 0 1 1 10 12A2 2 0 0 1 14 12Z"/>',
			'hearted'   => '<path d="M12 18.75L5.9 12.6C4.2 10.9 4.2 8.2 5.9 6.6C7.5 5 10.2 5 11.9 6.7L12 6.8L12.1 6.7C13.8 5 16.5 5 18.1 6.6C19.8 8.2 19.8 10.9 18.1 12.6L12 18.75Z" fill="currentColor"/>',
			'home'      => '<path d="M13.75 19.25H19.25V8.5L12 5L4.75 8.5V19.25H10.25M13.75 19.25V13.7H10.25V19.25M13.75 19.25H10.25"/>',
			'search'    => '<path d="M5 19L9.28769 14.7123M18.25 11C18.25 13.8995 15.8995 16.25 13 16.25C10.1005 16.25 7.75 13.8995 7.75 11C7.75 8.10051 10.1005 5.75 13 5.75C15.8995 5.75 18.25 8.10051 18.25 11Z"/>',
			'person'    => '<path d="M15.25 8.25A3.25 3.25 0 1 1 8.75 8.25A3.25 3.25 0 0 1 15.25 8.25Z"/><path d="M5.75 19.25V18C5.75 16.2 7.2 14.75 9 14.75H15C16.8 14.75 18.25 16.2 18.25 18V19.25"/>',
			'posts'     => '<path d="M8.5 8.25H15.5M8.5 11.75H15.5M8.5 15.25H15.5M18.25 18V6C18.25 5.30964 17.6904 4.75 17 4.75H7C6.30964 4.75 5.75 5.30964 5.75 6L5.75 18C5.75 18.6904 6.30964 19.25 7 19.25H17C17.6904 19.25 18.25 18.6904 18.25 18Z"/>',
			'albums'    => '<path d="M9 4.75H18C18.69 4.75 19.25 5.31 19.25 6V15C19.25 15.69 18.69 16.25 18 16.25H9C8.31 16.25 7.75 15.69 7.75 15V6C7.75 5.31 8.31 4.75 9 4.75Z"/><path d="M4.75 8V18C4.75 18.69 5.31 19.25 6 19.25H16"/><path d="M13.75 12V7.75H16M13.75 12A1.25 1.25 0 1 1 12.5 10.75A1.25 1.25 0 0 1 13.75 12Z"/>',
			'menu'      => '<path d="M5 12H19M5 18.25H19M5 5.75H19"/>',
			'scheduled' => '<path d="M12 19.25C16.0041 19.25 19.25 16.0041 19.25 12C19.25 7.99594 16.0041 4.75 12 4.75C7.99594 4.75 4.75 7.99594 4.75 12C4.75 16.0041 7.99594 19.25 12 19.25Z" stroke-linejoin="round"/><path d="M9.5 12.25H12.25V8"/>',
			'plus'      => '<path d="M12 18V6M18 12H6"/>',
			'sort'      => '<path d="M4 7.25H20M4 12H15M4 16.75H10"/>',
		);

		return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5">' . ( $paths[ $name ] ?? '' ) . '</svg>';
	}
}
