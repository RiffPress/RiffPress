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
	 * Enqueues the stylesheet and the script module.
	 *
	 * @since 4.0.0
	 */
	public static function enqueue(): void {
		if ( ! self::enabled() ) {
			return;
		}
		wp_enqueue_style( 'riff', RIFF_URL . 'assets/riff.css', array(), self::version( 'assets/riff.css' ) );
		// wp.hooks is how a plugin's script listens to the player (see docs/javascript.md); the
		// module reads it from the window when it is there.
		wp_enqueue_script( 'wp-hooks' );
		wp_enqueue_script_module( 'riff', RIFF_URL . 'assets/riff.js', array(), self::version( 'assets/riff.js' ) );
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
	 * Prints the player and the strings the script needs.
	 *
	 * @since 4.0.0
	 */
	public static function markup(): void {
		if ( ! self::enabled() ) {
			return;
		}
		$strings = array(
			'play'        => __( 'Play', 'riff' ),
			'pause'       => __( 'Pause', 'riff' ),
			'repeatOff'   => __( 'Repeat off', 'riff' ),
			'repeatAll'   => __( 'Repeat all', 'riff' ),
			'repeatOne'   => __( 'Repeat one', 'riff' ),
			'shuffleOn'   => __( 'Shuffle on', 'riff' ),
			'shuffleOff'  => __( 'Shuffle off', 'riff' ),
			/* translators: %s: post title. */
			'playingFrom' => __( 'Playing from %s', 'riff' ),
			/* translators: %s: track title. */
			'playTrack'   => __( 'Play %s', 'riff' ),
			/* translators: %s: track title. */
			'locked'      => __( '%s is locked', 'riff' ),
			/* translators: %s: track title. */
			'unlock'      => __( 'Unlock %s', 'riff' ),
			'video'       => __( 'Video', 'riff' ),
			'unavailable' => __( 'This track could not be played.', 'riff' ),
			'copied'      => __( 'Link copied', 'riff' ),
			'shareFailed' => __( 'The link could not be shared.', 'riff' ),
			'trackGone'   => __( 'The shared track is no longer in this post.', 'riff' ),
			'library'     => __( 'Library', 'riff' ),
			'shuffle'     => __( 'Shuffle', 'riff' ),
			/* translators: %s: number of tracks. */
			'oneTrack'    => __( '%s track', 'riff' ),
			/* translators: %s: number of tracks. */
			'tracks'      => __( '%s tracks', 'riff' ),
			/* translators: %s: number of minutes. */
			'minutes'     => __( '%s min', 'riff' ),
			/* translators: %s: kilobits per second. */
			'kbps'        => __( '%s kbps', 'riff' ),
			'lossless'    => __( 'Lossless', 'riff' ),
			/* translators: 1: bits per sample, 2: sample rate in kHz. */
			'bitsKhz'     => __( '%1$s-bit %2$s kHz', 'riff' ),
			'appEmpty'    => __( 'Nothing to play yet. Add an audio or video block to a post.', 'riff' ),
			'otherTab'    => __( 'Playing in another tab', 'riff' ),
			/* translators: 1: elapsed time, 2: total time. */
			'times'       => __( '%1$s / %2$s', 'riff' ),
			'nowPlaying'  => __( 'Now playing', 'riff' ),
			'open'        => __( 'Open', 'riff' ),
			'more'        => __( 'Load more', 'riff' ),
			'playError'   => __( 'That post could not be loaded. Press Play to try again.', 'riff' ),
			'moreError'   => __( 'More posts could not be loaded. Press Load more to try again.', 'riff' ),
		);
		/**
		 * Filters the strings the player shows.
		 *
		 * @since 4.0.0
		 * @param array $strings Strings, keyed by name.
		 */
		$strings = (array) apply_filters( 'riff_strings', $strings );
		$data    = array(
			'strings' => $strings,
			'assets'  => array(),
		);
		/**
		 * Filters the data handed to the player script: strings, and the addresses of scripts a
		 * feature wants loaded, such as the Listen feature's app on the page that holds its block.
		 *
		 * @since 4.0.0
		 * @param array $data Data.
		 */
		$data = (array) apply_filters( 'riff_player_data', $data );
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
		/**
		 * Fires after the player's markup.
		 *
		 * @since 4.0.0
		 */
		do_action( 'riff_after_player' );
	}

	/**
	 * The chips under Now Playing's controls, as extensions can add to them.
	 *
	 * Each item is keyed by a slug and has a `label`, an `action` (the data-riff-action the player
	 * announces as a `riff.action` hook and a `riff:action` event when it is not one of its own), and
	 * either an `icon` from Player::icon() or `svg` markup of its own. An item with an `href` is a link.
	 *
	 * @since 4.0.0
	 *
	 * @return array[]
	 */
	public static function chips(): array {
		$chips = array(
			'share' => array(
				'label'  => __( 'Share', 'riff' ),
				'icon'   => 'share',
				'action' => 'share',
			),
		);
		/**
		 * Filters the chips under Now Playing's controls.
		 *
		 * @since 4.0.0
		 *
		 * @param array[] $chips Chips, keyed by slug: label, action, icon or svg, href.
		 */
		return self::items( (array) apply_filters( 'riff_chips', $chips ) );
	}

	/**
	 * Controls at the end of the bar on a wide screen, before the caret. Empty until a plugin adds
	 * some; the player's own controls stay where they are.
	 *
	 * @since 4.0.0
	 *
	 * @return array[]
	 */
	public static function bar_controls(): array {
		/**
		 * Filters the controls at the end of the bar on a wide screen.
		 *
		 * @since 4.0.0
		 *
		 * @param array[] $controls Controls, keyed by slug: label, action, icon or svg, href.
		 */
		return self::items( (array) apply_filters( 'riff_bar_controls', array() ) );
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
	 * Keeps only well-formed items: a string label and either an action or an href.
	 *
	 * @param array $items Items.
	 * @return array[]
	 */
	private static function items( array $items ): array {
		$kept = array();
		foreach ( $items as $slug => $item ) {
			if ( ! is_array( $item ) || empty( $item['label'] ) || ( empty( $item['action'] ) && empty( $item['href'] ) ) ) {
				continue;
			}
			$kept[ sanitize_key( (string) $slug ) ] = $item;
		}
		return $kept;
	}

	/**
	 * Renders one chip or control.
	 *
	 * @since 4.0.0
	 *
	 * @param string $slug      Slug.
	 * @param array  $item      Item.
	 * @param string $css_class Class for the element.
	 * @param bool   $labelled  Whether the label shows (a chip) or is the accessible name (a control).
	 * @return string
	 */
	public static function control( string $slug, array $item, string $css_class, bool $labelled = true ): string {
		$icon = '';
		if ( ! empty( $item['icon'] ) ) {
			$icon = self::icon( (string) $item['icon'] );
		} elseif ( ! empty( $item['svg'] ) ) {
			$icon = wp_kses( (string) $item['svg'], self::svg_tags() );
		}
		$label  = $labelled ? '<span>' . esc_html( (string) $item['label'] ) . '</span>' : '';
		$attrs  = $labelled ? '' : ' aria-label="' . esc_attr( (string) $item['label'] ) . '"';
		$attrs .= ' data-riff-chip="' . esc_attr( $slug ) . '"';
		if ( ! empty( $item['href'] ) ) {
			return '<a class="' . esc_attr( $css_class ) . '" href="' . esc_url( (string) $item['href'] ) . '"' . $attrs . '>' . $icon . $label . '</a>';
		}
		return '<button type="button" class="' . esc_attr( $css_class ) . '" data-riff-action="' . esc_attr( (string) $item['action'] ) . '"' . $attrs . '>' . $icon . $label . '</button>';
	}

	/**
	 * The SVG a control may carry.
	 *
	 * @return array
	 */
	private static function svg_tags(): array {
		$attrs = array(
			'viewbox'      => true,
			'fill'         => true,
			'stroke'       => true,
			'stroke-width' => true,
			'd'            => true,
			'cx'           => true,
			'cy'           => true,
			'r'            => true,
			'x'            => true,
			'y'            => true,
			'width'        => true,
			'height'       => true,
			'aria-hidden'  => true,
			'focusable'    => true,
			'class'        => true,
		);
		return array(
			'svg'     => $attrs,
			'path'    => $attrs,
			'circle'  => $attrs,
			'rect'    => $attrs,
			'g'       => $attrs,
			'polygon' => array_merge( $attrs, array( 'points' => true ) ),
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
		/**
		 * Filters the player's accent colour, after the theme's own setting.
		 *
		 * @since 4.0.0
		 *
		 * @param string $accent A CSS colour, or an empty string for the default amber.
		 */
		$accent = (string) apply_filters( 'riff_accent', $accent );
		if ( '' === $accent || ! preg_match( '/^[#a-z0-9(),.% -]+$/i', $accent ) ) {
			return '';
		}
		return ' style="--riff-accent: ' . esc_attr( $accent ) . '"';
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
			'cast'      => '<path d="M21 3H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z"/>',
			'song'      => '<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>',
			'video'     => '<path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM9.5 16.5v-9l7 4.5-7 4.5z"/>',
			'volume'    => '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>',
			'share'     => '<path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
		);

		return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">' . ( $paths[ $name ] ?? '' ) . '</svg>';
	}
}
