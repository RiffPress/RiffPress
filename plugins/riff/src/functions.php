<?php
/**
 * Riff's functions for other plugins, beside its classes: registering the player's controls,
 * views and keyboard shortcuts, as WordPress registers blocks and settings.
 *
 * @since 5.8.0
 * @package Riff
 */

defined( 'ABSPATH' ) || exit;

/**
 * Registers a control in the player's bar. Call it on the `riff_register` action.
 *
 * @since 5.8.0
 *
 * @see Riff\Registry::register_control() for the arguments.
 *
 * @param string $id   Lowercase letters, digits and dashes.
 * @param array  $args The control.
 * @return bool Whether it was registered.
 */
function riff_register_control( string $id, array $args = array() ): bool {
	return Riff\Registry::register_control( $id, $args );
}

/**
 * Takes a control away, Riff's own included.
 *
 * @since 5.8.0
 *
 * @param string $id The control's id.
 * @return bool Whether there was one.
 */
function riff_unregister_control( string $id ): bool {
	return Riff\Registry::unregister_control( $id );
}

/**
 * Registers a view the listener opens from its button in the bar: a screen of Now Playing, or a
 * panel beside the page. Call it on the `riff_register` action.
 *
 * @since 5.8.0
 *
 * @see Riff\Registry::register_view() for the arguments.
 *
 * @param string $id   Lowercase letters, digits and dashes.
 * @param array  $args The view.
 * @return bool Whether it was registered.
 */
function riff_register_view( string $id, array $args = array() ): bool {
	return Riff\Registry::register_view( $id, $args );
}

/**
 * Takes a view away, Riff's own included.
 *
 * @since 5.8.0
 *
 * @param string $id The view's id.
 * @return bool Whether there was one.
 */
function riff_unregister_view( string $id ): bool {
	return Riff\Registry::unregister_view( $id );
}

/**
 * Registers a key the player acts on for a plugin. It follows Riff's own single-key shortcuts: it
 * does nothing while the listener types, it is listed with them on the listener's profile, and it
 * is off wherever they are off. Call it on the `riff_register` action, and give it what it does
 * with `window.riff.shortcut()`.
 *
 * @since 5.9.0
 *
 * @see Riff\Registry::register_shortcut() for the arguments.
 *
 * @param string $id   Lowercase letters, digits and dashes.
 * @param array  $args The shortcut: its `key` and its `label`.
 * @return bool Whether it was registered.
 */
function riff_register_shortcut( string $id, array $args = array() ): bool {
	return Riff\Registry::register_shortcut( $id, $args );
}

/**
 * The site's Listen page, where the player opens as an app: the oldest published page holding the
 * Riff block or using the Listen template.
 *
 * @since 6.5.0
 *
 * @return int Page ID, or 0 when there is none.
 */
function riff_listen_page(): int {
	return Riff\Listen\First_Run::listen_page();
}

/**
 * A link that listens along with someone: the site's Listen page, or its front page when it has
 * none, with `riff-along` set to them. Opened, the player follows them as Listen along in the
 * Together panel does, once it is ready, if the viewer may; and takes the argument out of the
 * address, so a reload doesn't follow them again. Unescaped, as add_query_arg() gives it: print it
 * through esc_url().
 *
 * @since 6.15.0
 *
 * @param int      $user_id The listener to listen along with.
 * @param int|null $blog_id The site they listen on, on a network; null for this one.
 * @return string The link.
 */
function riff_together_along_url( int $user_id, ?int $blog_id = null ): string {
	return Riff\Listen\Together::along_url( $user_id, $blog_id );
}

/**
 * The brand a Riff shows its listeners: its name, its mark and whether it credits Riff, as a host
 * that white-labels Riff sets them with `riff_brand`. Normalised: a name that is empty is Riff's,
 * a mark that isn't a URL is none, and the description is plain text.
 *
 * @since 6.17.0
 *
 * @return array {
 *     @type string $name        The name shown where Riff names itself.
 *     @type string $mark        URL of a square image shown where Riff's mark is, or '' for Riff's own.
 *     @type bool   $credit      Whether Riff's credit and attribution are shown.
 *     @type string $description The line shown where Riff describes a site that has no tagline, or '' for Riff's own.
 * }
 */
function riff_brand(): array {
	$defaults = array(
		'name'        => 'Riff',
		'mark'        => '',
		'credit'      => true,
		'description' => '',
	);
	/**
	 * Filters the brand a Riff shows its listeners in place of Riff's own.
	 *
	 * Where Riff names itself to a listener, as the Listen app's name when the site has none, it
	 * shows the name; where it shows its own icon, the mark; where it describes a site with no
	 * tagline, the description. Admin screens, the plugin's own name and developer-facing text keep
	 * Riff's.
	 *
	 * @since 6.17.0
	 *
	 * @param array $brand {
	 *     @type string $name        The name shown where Riff names itself. Default 'Riff'.
	 *     @type string $mark        URL of a square image shown where Riff's mark/wordmark is, or '' for Riff's own.
	 *     @type bool   $credit      Whether to show Riff's credit/attribution ("Riff" links, made-with lines, generator). Default true.
	 *     @type string $description The line shown where Riff describes a site with no tagline, or '' for Riff's own wording. Default ''.
	 * }
	 */
	$brand = apply_filters( 'riff_brand', $defaults );
	$brand = is_array( $brand ) ? $brand : array();
	$name  = is_scalar( $brand['name'] ?? null ) ? trim( wp_strip_all_tags( (string) $brand['name'] ) ) : '';
	$mark  = is_string( $brand['mark'] ?? null ) ? esc_url_raw( trim( $brand['mark'] ), array( 'http', 'https' ) ) : '';
	$line  = is_scalar( $brand['description'] ?? null ) ? trim( wp_strip_all_tags( (string) $brand['description'] ) ) : '';
	return array(
		'name'        => '' !== $name ? $name : $defaults['name'],
		'mark'        => $mark,
		'credit'      => array_key_exists( 'credit', $brand ) ? wp_validate_boolean( $brand['credit'] ) : true,
		'description' => $line,
	);
}
